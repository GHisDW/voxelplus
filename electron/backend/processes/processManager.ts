import { spawn, ChildProcess, exec } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { ProcessStatus, LaunchResult, ProcessStatusEvent, JavaRuntime } from '../../types';
import { InstanceMetadataStore } from '../instances/metadata';
import { JavaDetector } from '../java/javaDetector';
import { MinecraftCompatibilityResolver } from '../instances/minecraftCompatibilityResolver';
import { LogStreamer } from './logStreamer';
import { ConfigStore } from '../storage/configStore';

interface ActiveProcess {
  instanceId: string;
  instanceName: string;
  childProcess: ChildProcess;
  pid?: number;
  status: ProcessStatus;
  startTime: Date;
  javaRuntime: JavaRuntime;
}

export class ProcessManager {
  private static activeProcesses = new Map<string, ActiveProcess>();
  private static statusListeners: ((event: ProcessStatusEvent) => void)[] = [];
  private static instanceStates = new Map<string, ProcessStatus>();

  public static onStatusChange(listener: (event: ProcessStatusEvent) => void): () => void {
    this.statusListeners.push(listener);
    return () => {
      this.statusListeners = this.statusListeners.filter(l => l !== listener);
    };
  }

  public static getStatus(instanceId: string): ProcessStatus {
    const active = this.activeProcesses.get(instanceId);
    if (active) return active.status;
    return this.instanceStates.get(instanceId) || 'STOPPED';
  }

  public static isRunning(instanceId: string): boolean {
    const status = this.getStatus(instanceId);
    return ['PREPARING', 'STARTING', 'LAUNCHING', 'RUNNING'].includes(status);
  }

  public static async launchInstance(instanceDir: string): Promise<LaunchResult> {
    const metadata = InstanceMetadataStore.readMetadata(instanceDir);
    if (!metadata) {
      return { success: false, instanceId: '', message: 'Instance metadata not found.' };
    }

    const instanceId = metadata.id;

    if (this.isRunning(instanceId)) {
      return {
        success: false,
        instanceId,
        message: `Instance "${metadata.name}" is already running.`
      };
    }

    this.updateStatus(instanceId, 'PREPARING');
    LogStreamer.addLog(`[Voxel+] Preparing development environment for "${metadata.name}"...`, 'INFO', instanceId, metadata.name);

    const javaList = await JavaDetector.scanSystemJava();
    const resolvedEnv = MinecraftCompatibilityResolver.resolveEnvironment(
      metadata.minecraft.version,
      javaList,
      metadata.runtime.java !== 'auto' ? metadata.runtime.java : undefined
    );

    if (!resolvedEnv.isCompatible || !resolvedEnv.javaRuntime) {
      const errorMsg = `No compatible Java runtime found for Minecraft ${metadata.minecraft.version}. Please install Java ${resolvedEnv.compatibility.java.recommended} LTS.`;
      this.updateStatus(instanceId, 'ERROR', undefined, null, errorMsg);
      LogStreamer.addLog(`[Voxel+ ERROR] ${errorMsg}`, 'ERROR', instanceId, metadata.name);
      return {
        success: false,
        instanceId,
        message: errorMsg,
        errorDetails: `A compatible 64-bit Java ${resolvedEnv.compatibility.java.recommended} runtime must be installed.`
      };
    }

    const selectedJava = resolvedEnv.javaRuntime;

    LogStreamer.addLog(`[Voxel+] Selected Java runtime: ${selectedJava.name} (${selectedJava.vendor} ${selectedJava.fullVersion})`, 'INFO', instanceId, metadata.name);

    const gradlewBat = path.join(instanceDir, 'gradlew.bat');
    if (!fs.existsSync(gradlewBat)) {
      const err = `gradlew.bat missing in ${instanceDir}`;
      this.updateStatus(instanceId, 'ERROR', undefined, null, err);
      LogStreamer.addLog(`[Voxel+ ERROR] ${err}`, 'ERROR', instanceId, metadata.name);
      return { success: false, instanceId, message: err };
    }

    const verifiedJavaHome = resolvedEnv.javaHome;
    const verifiedJavaExecutable = resolvedEnv.javaExecutable;

    if (!verifiedJavaHome || !verifiedJavaExecutable) {
      const err = 'Resolved Java environment is invalid';
      this.updateStatus(instanceId, 'ERROR', undefined, null, err);
      LogStreamer.addLog(`[Voxel+ ERROR] ${err}`, 'ERROR', instanceId, metadata.name);
      return { success: false, instanceId, message: err };
    }

    if (
      !fs.existsSync(verifiedJavaHome) ||
      !fs.existsSync(verifiedJavaExecutable) ||
      path.normalize(path.join(verifiedJavaHome, 'bin', 'java.exe')).toLowerCase() !==
        verifiedJavaExecutable.toLowerCase()
    ) {
      const err = `Selected Java runtime is no longer valid: ${verifiedJavaExecutable}`;
      this.updateStatus(instanceId, 'ERROR', undefined, null, err);
      LogStreamer.addLog(`[Voxel+ ERROR] ${err}`, 'ERROR', instanceId, metadata.name);
      return {
        success: false,
        instanceId,
        message: 'Selected Java runtime is no longer available.'
      };
    }

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      JAVA_HOME: verifiedJavaHome,
      PATH: `${path.join(verifiedJavaHome, 'bin')};${process.env.PATH || ''}`
    };

    LogStreamer.addLog(`[Voxel+] Verified Java executable: ${verifiedJavaExecutable}`, 'INFO', instanceId, metadata.name);
    LogStreamer.addLog(`[Voxel+] Verified JAVA_HOME: ${verifiedJavaHome}`, 'INFO', instanceId, metadata.name);

    const settings = ConfigStore.getSettings();
    const jvmArgs = metadata.runtime.jvmArgs || settings.advancedJvmArgs || '';
    if (jvmArgs) {
      env.JAVA_OPTS = jvmArgs;
    }

    this.updateStatus(instanceId, 'STARTING');
    LogStreamer.addLog(`[Voxel+] Spawning Gradle Loom development client: gradlew.bat runClient...`, 'INFO', instanceId, metadata.name);

    try {
      const comspec = process.env.ComSpec || 'cmd.exe';
      const child = spawn(
        comspec,
        ['/d', '/c', 'gradlew.bat runClient'],
        {
          cwd: instanceDir,
          env,
          windowsHide: true
        }
      );

      const active: ActiveProcess = {
        instanceId,
        instanceName: metadata.name,
        childProcess: child,
        pid: child.pid,
        status: 'STARTING',
        startTime: new Date(),
        javaRuntime: selectedJava
      };

      this.activeProcesses.set(instanceId, active);
      this.updateStatus(instanceId, 'LAUNCHING', child.pid);

      metadata.lastPlayedAt = new Date().toISOString();
      metadata.status = 'RUNNING';
      InstanceMetadataStore.writeMetadata(instanceDir, metadata);

      child.stdout?.on('data', (data) => {
        const text = data.toString();
        const lines = text.split(/\r?\n/);
        for (const line of lines) {
          if (!line.trim()) continue;
          LogStreamer.addLog(line, 'INFO', instanceId, metadata.name);
          if (line.includes('Fabric Loom') || line.includes(':runClient')) {
            if (active.status !== 'RUNNING') {
              this.updateStatus(instanceId, 'RUNNING', child.pid);
              active.status = 'RUNNING';
            }
          }
        }
      });

      child.stderr?.on('data', (data) => {
        const text = data.toString();
        const lines = text.split(/\r?\n/);
        for (const line of lines) {
          if (!line.trim()) continue;
          LogStreamer.addLog(line, 'WARN', instanceId, metadata.name);
        }
      });

      child.on('close', (code) => {
        LogStreamer.addLog(`[Voxel+] Process for "${metadata.name}" exited with code ${code}.`, code === 0 ? 'INFO' : 'WARN', instanceId, metadata.name);
        this.activeProcesses.delete(instanceId);
        metadata.status = code === 0 ? 'STOPPED' : 'ERROR';
        InstanceMetadataStore.writeMetadata(instanceDir, metadata);
        this.updateStatus(instanceId, code === 0 ? 'STOPPED' : 'ERROR', undefined, code);
      });

      child.on('error', (err) => {
        LogStreamer.addLog(`[Voxel+ ERROR] Failed to start process: ${err.message}`, 'ERROR', instanceId, metadata.name);
        this.activeProcesses.delete(instanceId);
        metadata.status = 'ERROR';
        InstanceMetadataStore.writeMetadata(instanceDir, metadata);
        this.updateStatus(instanceId, 'ERROR', undefined, null, err.message);
      });

      return {
        success: true,
        instanceId,
        pid: child.pid,
        message: `Instance "${metadata.name}" launched successfully.`
      };
    } catch (e: any) {
      this.updateStatus(instanceId, 'ERROR', undefined, null, e.message);
      LogStreamer.addLog(`[Voxel+ ERROR] Launch exception: ${e.message}`, 'ERROR', instanceId, metadata.name);
      return {
        success: false,
        instanceId,
        message: `Launch error: ${e.message}`
      };
    }
  }

  public static async stopInstance(instanceId: string): Promise<boolean> {
    const active = this.activeProcesses.get(instanceId);
    if (!active || !active.pid) {
      this.updateStatus(instanceId, 'STOPPED');
      return true;
    }

    this.updateStatus(instanceId, 'STOPPING', active.pid);
    LogStreamer.addLog(`[Voxel+] Stopping instance "${active.instanceName}" (PID ${active.pid})...`, 'INFO', instanceId, active.instanceName);

    return new Promise((resolve) => {
      const killCmd = `taskkill /pid ${active.pid} /T /F`;
      exec(killCmd, (err) => {
        if (err) {
          try {
            active.childProcess.kill('SIGTERM');
          } catch {
          }
        }
        this.activeProcesses.delete(instanceId);
        this.updateStatus(instanceId, 'STOPPED');
        LogStreamer.addLog(`[Voxel+] Instance "${active.instanceName}" stopped.`, 'INFO', instanceId, active.instanceName);
        resolve(true);
      });
    });
  }

  private static updateStatus(
    instanceId: string,
    status: ProcessStatus,
    pid?: number,
    exitCode?: number | null,
    error?: string
  ): void {
    this.instanceStates.set(instanceId, status);
    const active = this.activeProcesses.get(instanceId);
    if (active) {
      active.status = status;
      if (pid) active.pid = pid;
    }

    const event: ProcessStatusEvent = {
      instanceId,
      status,
      pid,
      exitCode,
      error
    };

    for (const listener of this.statusListeners) {
      try {
        listener(event);
      } catch (e) {
        console.error('Error in status listener:', e);
      }
    }
  }
}
