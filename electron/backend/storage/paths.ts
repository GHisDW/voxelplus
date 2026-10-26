import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

export class PathManager {
  private static userBaseDir: string = '';
  private static isPortable: boolean = false;

  /**
   * Detects if the application is running in portable mode.
   * Portable mode is detected by checking for a 'portable' directory
   * next to the executable or in the application directory.
   */
  public static detectPortableMode(): boolean {
    try {
      // electron-builder sets PORTABLE_EXECUTABLE_DIR for its portable target.
      // On first launch the data directory does not exist yet, so detecting only
      // an existing `portable` folder made portable builds fall back to APPDATA.
      const executableDir = process.env.PORTABLE_EXECUTABLE_DIR;
      const appPath = executableDir || process.resourcesPath || process.cwd();
      
      const portableDir = path.join(appPath, 'portable');
      
      if (executableDir && !fs.existsSync(portableDir)) {
        try {
          fs.mkdirSync(portableDir, { recursive: true });
        } catch {
          return false;
        }
      }

      if (fs.existsSync(portableDir)) {
        // Verify it's a directory we can write to without leaving a probe file.
        const testFile = path.join(portableDir, '.write-test');
        try {
          fs.writeFileSync(testFile, 'test');
          fs.unlinkSync(testFile);
          return true;
        } catch {
          // Not writable, fall back to non-portable
          return false;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  public static initialize(customBaseDir?: string): void {
    // Detect portable mode first
    this.isPortable = this.detectPortableMode();

    if (customBaseDir) {
      this.userBaseDir = customBaseDir;
    } else if (this.isPortable) {
      // In portable mode, use the portable directory next to the executable
      const appPath = process.env.PORTABLE_EXECUTABLE_DIR || 
                      process.resourcesPath || 
                      process.cwd();
      this.userBaseDir = path.join(appPath, 'portable');
    } else {
      // Default dynamic base: %APPDATA%\VoxelPlus or UserHome\.voxelplus
      const appData = process.env.APPDATA || (process.platform === 'win32'
        ? path.join(os.homedir(), 'AppData', 'Roaming')
        : path.join(os.homedir(), '.config'));
      
      this.userBaseDir = path.join(appData, 'VoxelPlus');
    }

    this.ensureDirectory(this.userBaseDir);
    this.ensureDirectory(this.getConfigDir());
    this.ensureDirectory(this.getDefaultInstancesDir());
    this.ensureDirectory(this.getCacheDir());
    this.ensureDirectory(this.getDownloadsDir());
    this.ensureDirectory(this.getLogsDir());
  }

  public static getBaseDir(): string {
    if (!this.userBaseDir) this.initialize();
    return this.userBaseDir;
  }

  public static isPortableMode(): boolean {
    return this.isPortable;
  }

  public static getConfigDir(): string {
    return path.join(this.getBaseDir(), 'config');
  }

  public static getConfigFile(): string {
    return path.join(this.getConfigDir(), 'voxel-settings.json');
  }

  public static getDefaultInstancesDir(): string {
    return path.join(this.getBaseDir(), 'instances');
  }

  public static getCacheDir(): string {
    return path.join(this.getBaseDir(), 'cache');
  }

  public static getDownloadsDir(): string {
    return path.join(this.getBaseDir(), 'downloads');
  }

  public static getLogsDir(): string {
    return path.join(this.getBaseDir(), 'logs');
  }

  public static getTemplatesDir(): string {
    return path.join(this.getBaseDir(), 'templates');
  }

  public static ensureDirectory(dirPath: string): string {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    return dirPath;
  }

  public static sanitizeFilename(name: string): string {
    return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
  }
}
