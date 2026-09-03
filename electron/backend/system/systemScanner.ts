import os from 'node:os';
import { exec } from 'node:child_process';
import { SystemScanResult, DiskDriveInfo } from '../../types';
import { JavaDetector } from '../java/javaDetector';
import { ConfigStore } from '../storage/configStore';

export class SystemScanner {
  public static async scanSystem(): Promise<SystemScanResult> {
    const javaList = await JavaDetector.scanSystemJava();
    const recommended = javaList.find(j => j.isRecommended) || javaList[0] || null;

    const [hardwareInfo, driveInfo] = await Promise.all([
      this.getHardwareInfo(),
      this.getDriveInfo()
    ]);

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    // Get available space on current instance drive
    const instanceDir = ConfigStore.getInstanceDirectory();
    const driveLetter = instanceDir.substring(0, 2).toUpperCase();
    const matchedDrive = driveInfo.find(d => d.drive.toUpperCase() === driveLetter);
    const instanceDriveFreeGb = matchedDrive ? matchedDrive.freeSpaceGb : 50;

    return {
      os: {
        caption: hardwareInfo.osCaption || `${os.type()} ${os.release()}`,
        version: os.release(),
        architecture: os.arch(),
        platform: os.platform()
      },
      cpu: {
        name: hardwareInfo.cpuName || (os.cpus()[0]?.model || 'Generic x64 Processor'),
        cores: hardwareInfo.cpuCores || Math.max(1, Math.floor(os.cpus().length / 2)),
        logicalProcessors: os.cpus().length,
        architecture: os.arch()
      },
      memory: {
        totalGb: parseFloat((totalMem / (1024 ** 3)).toFixed(1)),
        freeGb: parseFloat((freeMem / (1024 ** 3)).toFixed(1)),
        usedGb: parseFloat((usedMem / (1024 ** 3)).toFixed(1)),
        percentUsed: Math.round((usedMem / totalMem) * 100)
      },
      gpu: {
        name: hardwareInfo.gpuName || 'Integrated Graphics'
      },
      storage: {
        drives: driveInfo,
        defaultInstanceDriveAvailableGb: instanceDriveFreeGb
      },
      java: {
        installed: javaList,
        recommendedJava: recommended
      },
      timestamp: new Date().toISOString()
    };
  }

  private static getHardwareInfo(): Promise<{ osCaption: string; cpuName: string; cpuCores: number; gpuName: string }> {
    return new Promise((resolve) => {
      const fallback = {
        osCaption: 'Microsoft Windows 10/11',
        cpuName: os.cpus()[0]?.model || 'Multi-Core Processor',
        cpuCores: Math.max(1, Math.floor(os.cpus().length / 2)),
        gpuName: 'Graphics Adapter'
      };

      if (process.platform !== 'win32') {
        return resolve(fallback);
      }

      // Modern CIM queries (NO obsolete wmic)
      const cmd = `powershell -NoProfile -NonInteractive -Command "
        $os = (Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue).Caption;
        $cpu = (Get-CimInstance Win32_Processor -ErrorAction SilentlyContinue | Select-Object -First 1);
        $gpu = (Get-CimInstance Win32_VideoController -ErrorAction SilentlyContinue | Select-Object -First 1).Name;
        [PSCustomObject]@{
          OS = $os;
          CPU = $cpu.Name;
          Cores = $cpu.NumberOfCores;
          GPU = $gpu;
        } | ConvertTo-Json -Compress
      "`.trim().replace(/\n/g, ' ');

      exec(cmd, { timeout: 6000 }, (error, stdout) => {
        if (error || !stdout) {
          return resolve(fallback);
        }
        try {
          const parsed = JSON.parse(stdout.trim());
          resolve({
            osCaption: parsed.OS || fallback.osCaption,
            cpuName: parsed.CPU ? parsed.CPU.trim() : fallback.cpuName,
            cpuCores: parsed.Cores || fallback.cpuCores,
            gpuName: parsed.GPU ? parsed.GPU.trim() : fallback.gpuName
          });
        } catch {
          resolve(fallback);
        }
      });
    });
  }

  private static getDriveInfo(): Promise<DiskDriveInfo[]> {
    return new Promise((resolve) => {
      const defaultDrives: DiskDriveInfo[] = [
        { drive: 'C:', label: 'Local Disk', totalSpaceGb: 256, freeSpaceGb: 120, isAvailable: true }
      ];

      if (process.platform !== 'win32') {
        return resolve(defaultDrives);
      }

      const cmd = `powershell -NoProfile -NonInteractive -Command "
        Get-PSDrive -PSProvider FileSystem | Select-Object Name, Description, @{Name='FreeGB';Expression={[math]::Round($_.Free/1GB, 1)}}, @{Name='UsedGB';Expression={[math]::Round($_.Used/1GB, 1)}} | ConvertTo-Json -Compress
      "`.trim().replace(/\n/g, ' ');

      exec(cmd, { timeout: 5000 }, (error, stdout) => {
        if (error || !stdout) return resolve(defaultDrives);

        try {
          let data = JSON.parse(stdout.trim());
          if (!Array.isArray(data)) {
            data = [data];
          }

          const drives: DiskDriveInfo[] = data.map((d: any) => {
            const free = Number(d.FreeGB) || 0;
            const used = Number(d.UsedGB) || 0;
            return {
              drive: `${d.Name}:`,
              label: d.Description || `Drive ${d.Name}:`,
              totalSpaceGb: parseFloat((free + used).toFixed(1)),
              freeSpaceGb: free,
              isAvailable: true
            };
          });

          resolve(drives.length > 0 ? drives : defaultDrives);
        } catch {
          resolve(defaultDrives);
        }
      });
    });
  }
}
