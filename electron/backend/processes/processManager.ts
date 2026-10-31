import { spawn, ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { ProcessStatus, LaunchResult, ProcessStatusEvent, JavaRuntime } from '../../types';
import { InstanceMetadataStore } from '../instances/metadata';
import { JavaDetector } from '../java/javaDetector';
import { MinecraftCompatibilityResolver } from '../instances/minecraftCompatibilityResolver';
import { LogStreamer } from './logStreamer';
import { ConfigStore } from '../storage/configStore';
import { VoxelError } from '../diagnostics';
import { createInterface } from 'node:readline';

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
      metadata.runtime.java !== 'auto' ? metadata.runtime.java : undefined,
      metadata.loader?.type || 'fabric'
    );

    if (!resolvedEnv.isCompatible || !resolvedEnv.javaRuntime) {
      const recommended = resolvedEnv.compatibility?.java?.recommended ?? 'compatible';
      const recommendedVersion = typeof recommended === 'number' ? recommended : parseInt(String(recommended)) || 21;

      const message = `No compatible Java runtime was found for Minecraft ${metadata.minecraft.version}.`;
      // Returning without clearing PREPARING left the instance stuck on
      // "Preparing…" forever — the UI kept offering Stop for a process that
      // never started. Always settle on a recoverable status.
      this.updateStatus(instanceId, 'ERROR', undefined, null, message);
      LogStreamer.addLog(`[Voxel+] ${message} Launch aborted before starting Gradle.`, 'ERROR', instanceId, metadata.name);

      return {
        success: false,
        instanceId,
        message,
        errorDetails: `Minecraft version: ${metadata.minecraft.version}; recommended Java: ${recommended}; configured runtime: ${metadata.runtime.java}`,
        requiresJavaInstall: true,
        recommendedJavaVersion: recommendedVersion
      };
    }

    const selectedJava = resolvedEnv.javaRuntime;

    LogStreamer.addLog(`[Voxel+] Selected Java runtime: ${selectedJava.name} (${selectedJava.vendor} ${selectedJava.fullVersion})`, 'INFO', instanceId, metadata.name);

    const wrapperName = process.platform === 'win32' ? 'gradlew.bat' : 'gradlew';
    const gradlewBat = path.join(instanceDir, wrapperName);
    if (!fs.existsSync(gradlewBat)) {
      const error = new VoxelError({
        title: 'Instance Files Incomplete',
        message: `The Gradle wrapper (${wrapperName}) is missing from the instance folder.`,
        cause: 'The instance directory is incomplete or files were removed manually.',
        suggestedAction: `Re-create the instance, or restore ${wrapperName}, then launch again.`,
        code: 'GRADLE_WRAPPER_MISSING',
        category: 'GRADLE',
        severity: 'ERROR',
        details: `Expected wrapper at: ${gradlewBat}`
      });
      this.updateStatus(instanceId, 'ERROR', undefined, null, error.message);
      error.log(instanceId, metadata.name);
      return { success: false, instanceId, message: `${error.message} ${error.suggestedAction ?? ''}`.trim() };
    }

    const verifiedJavaHome = resolvedEnv.javaHome;
    const verifiedJavaExecutable = resolvedEnv.javaExecutable;

    if (!verifiedJavaHome || !verifiedJavaExecutable) {
      const error = new VoxelError({
        title: 'Minecraft Launch Failed',
        message: 'The selected Java environment could not be resolved.',
        cause: 'Java detection succeeded but returned an incomplete runtime configuration.',
        suggestedAction: 'Re-scan Java in the Java Manager and select a runtime, then launch again.',
        code: 'JAVA_ENV_INVALID',
        category: 'JAVA',
        severity: 'ERROR'
      });
      this.updateStatus(instanceId, 'ERROR', undefined, null, error.message);
      error.log(instanceId, metadata.name);
      return { success: false, instanceId, message: `${error.message} ${error.suggestedAction ?? ''}`.trim() };
    }

    const expectedJavaHome = path.normalize(verifiedJavaHome);
    const actualJavaHome = path.normalize(path.dirname(path.dirname(verifiedJavaExecutable)));
    const sameJavaHome = process.platform === 'win32'
      ? actualJavaHome.toLowerCase() === expectedJavaHome.toLowerCase()
      : actualJavaHome === expectedJavaHome;

    if (
      !fs.existsSync(verifiedJavaHome) ||
      !fs.existsSync(verifiedJavaExecutable) ||
      !sameJavaHome
    ) {
      const error = new VoxelError({
        title: 'Java Runtime Unavailable',
        message: 'The selected Java runtime is no longer available on this system.',
        cause: `The runtime previously used by this instance could not be found: ${verifiedJavaExecutable}`,
        suggestedAction: 'Open the Java Manager, re-scan or install a runtime, and select it for this instance.',
        code: 'JAVA_RUNTIME_NOT_FOUND',
        category: 'JAVA',
        severity: 'ERROR',
        details: `JAVA_HOME: ${verifiedJavaHome}; executable: ${verifiedJavaExecutable}`
      });
      this.updateStatus(instanceId, 'ERROR', undefined, null, error.message);
      error.log(instanceId, metadata.name);
      return { success: false, instanceId, message: `${error.message} ${error.suggestedAction ?? ''}`.trim() };
    }

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      JAVA_HOME: verifiedJavaHome,
      PATH: `${path.join(verifiedJavaHome, 'bin')}${path.delimiter}${process.env.PATH || ''}`
    };

    LogStreamer.addLog(`[Voxel+] Verified Java executable: ${verifiedJavaExecutable}`, 'INFO', instanceId, metadata.name);
    LogStreamer.addLog(`[Voxel+] Verified JAVA_HOME: ${verifiedJavaHome}`, 'INFO', instanceId, metadata.name);

    const settings = ConfigStore.getSettings();
    const jvmArgs = metadata.runtime.jvmArgs || settings.advancedJvmArgs || '';
    if (jvmArgs) {
      env.JAVA_OPTS = jvmArgs;
    }

    this.updateStatus(instanceId, 'STARTING');
    LogStreamer.addLog(`[Voxel+] Starting the ${metadata.loader?.type || 'Fabric'} Minecraft client through Gradle...`, 'INFO', instanceId, metadata.name);

    try {
      // Windows goes through cmd.exe so `gradlew.bat` resolves; other platforms
      // spawn the POSIX wrapper directly so the launcher also works in
      // development environments outside Windows.
      const isWindows = process.platform === 'win32';
      const command = isWindows ? (process.env.ComSpec || 'cmd.exe') : gradlewBat;
      const args = isWindows ? ['/d', '/c', `${wrapperName} runClient`] : ['runClient'];
      const child = spawn(
        command,
        args,
        {
          cwd: instanceDir,
          env,
          windowsHide: true
        }
      );

      // `spawn()` only reports synchronous errors; a missing/locked Gradle
      // wrapper surfaces asynchronously. Wait for the real spawn result so a
      // failed launch is reported as a failure instead of a fake success.
      const spawnResult = await new Promise<'spawned' | 'error'>((resolve) => {
        child.once('spawn', () => resolve('spawned'));
        child.once('error', () => resolve('error'));
      });

      if (spawnResult === 'error') {
        const error = new VoxelError({
          title: 'Minecraft Launch Failed',
          message: 'The Minecraft development client process could not be started.',
          cause: 'The Gradle process failed to spawn, possibly because the instance folder is inaccessible or blocked by antivirus.',
          suggestedAction: 'Check that the instance folder is accessible, then launch again. See the logs page for details.',
          code: 'GRADLE_PROCESS_SPAWN_FAILED',
          category: 'GRADLE',
          severity: 'ERROR',
          details: `Command: ${command} ${args.join(' ')}`
        });
        error.log(instanceId, metadata.name);
        metadata.status = 'ERROR';
        InstanceMetadataStore.writeMetadata(instanceDir, metadata);
        this.updateStatus(instanceId, 'ERROR', undefined, null, error.message);
        return { success: false, instanceId, message: `${error.message} ${error.suggestedAction ?? ''}`.trim() };
      }

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

      // Only Gradle has started at this point — Minecraft itself is not running
      // yet. Record the honest intermediate state; the status listener below
      // promotes the instance to RUNNING once Loom reports the client.
      metadata.lastPlayedAt = new Date().toISOString();
      metadata.status = 'LAUNCHING';
      InstanceMetadataStore.writeMetadata(instanceDir, metadata);

      const markRunning = (): void => {
        if (active.status === 'RUNNING') return;
        active.status = 'RUNNING';
        this.updateStatus(instanceId, 'RUNNING', child.pid);
        metadata.status = 'RUNNING';
        try {
          InstanceMetadataStore.writeMetadata(instanceDir, metadata);
        } catch {
          // Status persistence is best-effort; the live status is authoritative.
        }
      };

      // Use readline to process stdout/stderr line-by-line which plays nicely with batching in LogStreamer
      if (child.stdout) {
        const rlOut = createInterface({ input: child.stdout });
        rlOut.on('line', (line) => {
          if (!line.trim()) return;
          LogStreamer.addLog(line, 'INFO', instanceId, metadata.name);
          if (line.includes('Fabric Loom') || line.includes(':runClient') || line.includes('Setting user:')) {
            markRunning();
          }
        });
      }

      if (child.stderr) {
        const rlErr = createInterface({ input: child.stderr });
        rlErr.on('line', (line) => {
          if (!line.trim()) return;
          // Gradle routinely writes informational progress to stderr (task names,
          // download progress, configuration output). Only escalate to WARN when
          // the line looks like a genuine error or stack-trace entry.
          const trimmed = line.trim();
          const isError =
            trimmed.startsWith('> Task :') === false &&
            (trimmed.includes('ERROR') ||
              trimmed.includes('FAILURE') ||
              trimmed.includes('Exception') ||
              trimmed.includes('error:') ||
              /^\s+at [\w$.]+/.test(trimmed)); // stack trace entry
          LogStreamer.addLog(line, isError ? 'WARN' : 'INFO', instanceId, metadata.name);
        });
      }

      child.on('close', (code) => {
        LogStreamer.addLog(`[Voxel+] Process for "${metadata.name}" exited with code ${code}.`, code === 0 ? 'INFO' : 'WARN', instanceId, metadata.name);
        this.activeProcesses.delete(instanceId);
        metadata.status = code === 0 ? 'STOPPED' : 'ERROR';
        InstanceMetadataStore.writeMetadata(instanceDir, metadata);
        this.updateStatus(instanceId, code === 0 ? 'STOPPED' : 'ERROR', undefined, code);
      });

      child.on('error', (err) => {
        const error = new VoxelError({
          title: 'Minecraft Launch Failed',
          message: 'The Minecraft development client process could not be started.',
          cause: 'The Gradle process failed to spawn, possibly because the instance folder is inaccessible or blocked by antivirus.',
          suggestedAction: 'Check the instance folder is accessible, then launch again. See the logs page for technical details.',
          code: 'GRADLE_PROCESS_SPAWN_FAILED',
          category: 'GRADLE',
          severity: 'ERROR',
          details: err.stack || err.message
        });
        error.log(instanceId, metadata.name);
        this.activeProcesses.delete(instanceId);
        metadata.status = 'ERROR';
        InstanceMetadataStore.writeMetadata(instanceDir, metadata);
        this.updateStatus(instanceId, 'ERROR', undefined, null, error.message);
      });

      return {
        success: true,
        instanceId,
        pid: child.pid,
        message: `Instance "${metadata.name}" launched successfully.`
      };
    } catch (e: any) {
      const error = new VoxelError({
        title: 'Minecraft Launch Failed',
        message: 'An unexpected error occurred while launching this instance.',
        suggestedAction: 'Check the logs page for technical details, then try again.',
        code: 'LAUNCH_UNEXPECTED_FAILURE',
        category: 'MINECRAFT',
        severity: 'ERROR',
        originalError: e
      });
      this.updateStatus(instanceId, 'ERROR', undefined, null, error.message);
      error.log(instanceId, metadata.name);
      return {
        success: false,
        instanceId,
        message: `${error.message} ${error.suggestedAction ?? ''}`.trim()
      };
    }
  }

  /**
   * Kills every running Minecraft/Gradle child process. Called when the
   * launcher quits so a dev client is never orphaned in the background.
   */
  public static shutdownAll(): void {
    for (const [instanceId, active] of this.activeProcesses) {
      try {
        if (process.platform === 'win32' && active.pid) {
          spawn('taskkill', ['/pid', String(active.pid), '/T', '/F'], { windowsHide: true }).on('error', () => {
            try {
              active.childProcess.kill('SIGKILL');
            } catch {
              /* already gone */
            }
          });
        } else {
          active.childProcess.kill('SIGKILL');
        }
      } catch {
        // Process already exited.
      }
      this.instanceStates.set(instanceId, 'STOPPED');
    }
    this.activeProcesses.clear();
  }

  public static async stopInstance(instanceId: string): Promise<boolean> {
    const active = this.activeProcesses.get(instanceId);
    if (!active) {
      this.updateStatus(instanceId, 'STOPPED');
      return true;
    }

    this.updateStatus(instanceId, 'STOPPING', active.pid);
    LogStreamer.addLog(`[Voxel+] Stopping instance "${active.instanceName}" (PID ${active.pid ?? 'unknown'})...`, 'INFO', instanceId, active.instanceName);

    return new Promise<boolean>((resolve) => {
      let settled = false;
      let escalation: NodeJS.Timeout | null = null;

      const settle = (): void => {
        if (settled) return;
        settled = true;
        if (escalation) {
          clearTimeout(escalation);
          escalation = null;
        }
        this.activeProcesses.delete(instanceId);
        this.updateStatus(instanceId, 'STOPPED');
        LogStreamer.addLog(`[Voxel+] Instance "${active.instanceName}" stopped.`, 'INFO', instanceId, active.instanceName);
        resolve(true);
      };

      const killChild = (signal: NodeJS.Signals = 'SIGTERM'): void => {
        try {
          active.childProcess.kill(signal);
        } catch {
          // Process already exited – nothing left to kill.
        }
      };

      // The process lifecycle owns the cleanup; if it exits on its own while we
      // are stopping, resolve immediately instead of waiting for taskkill.
      active.childProcess.once('close', settle);

      if (process.platform === 'win32' && active.pid) {
        // Argument-based invocation (no shell interpolation) for the Windows
        // process tree. `taskkill` may be missing/policy-blocked, so every
        // failure path falls back to a direct SIGTERM on the child.
        let taskkill: ReturnType<typeof spawn>;
        try {
          taskkill = spawn('taskkill', ['/pid', String(active.pid), '/T', '/F'], { windowsHide: true });
        } catch {
          killChild();
          return;
        }
        taskkill.once('error', () => killChild());
        taskkill.once('close', (code) => {
          if (code !== 0) killChild();
        });
      } else {
        killChild();
      }

      // Safety net: a wedged Gradle/Minecraft process must never leave the UI
      // stuck on "STOPPING" forever.
      escalation = setTimeout(() => {
        if (settled) return;
        killChild('SIGKILL');
        settle();
      }, 15000);
      escalation.unref?.();
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
