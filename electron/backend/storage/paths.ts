import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

export class PathManager {
  private static userBaseDir: string = '';

  public static initialize(customBaseDir?: string): void {
    if (customBaseDir) {
      this.userBaseDir = customBaseDir;
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
