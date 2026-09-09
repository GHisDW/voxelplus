import fs from 'node:fs';
import { AppSettings, ThemeMode } from '../../types';
import { PathManager } from './paths';
import { VoxelError } from '../diagnostics';

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  instanceDirectory: '',
  globalJavaMode: 'auto',
  preferredJavaId: null,
  defaultMemoryMb: 4096,
  notificationsEnabled: true,
  advancedJvmArgs: '-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC',
  gradleWrapperArgs: '--no-daemon',
  debugLogging: false,
  firstRunCompleted: false
};

export class ConfigStore {
  private static cachedSettings: AppSettings | null = null;

  public static getSettings(): AppSettings {
    if (this.cachedSettings) {
      return this.cachedSettings;
    }

    const configFile = PathManager.getConfigFile();
    if (!fs.existsSync(configFile)) {
      const initialSettings: AppSettings = {
        ...DEFAULT_SETTINGS,
        instanceDirectory: PathManager.getDefaultInstancesDir()
      };
      this.persistToFile(initialSettings);
      this.cachedSettings = initialSettings;
      return initialSettings;
    }

    try {
      const raw = fs.readFileSync(configFile, 'utf-8');
      const parsed = JSON.parse(raw);
      const settings: AppSettings = {
        ...DEFAULT_SETTINGS,
        instanceDirectory: PathManager.getDefaultInstancesDir(),
        ...parsed
      };

      this.cachedSettings = settings;
      return settings;
    } catch (e) {
      new VoxelError({
        title: 'Settings Could Not Be Read',
        message: 'Your settings file is corrupt and defaults have been restored.',
        cause: 'config.json contains invalid JSON or could not be parsed.',
        suggestedAction: 'No action needed; customize your settings again from the Settings page.',
        code: 'CONFIG_CORRUPT',
        category: 'CONFIGURATION',
        severity: 'WARNING',
        details: `Config file: ${configFile}`,
        originalError: e
      }).log();
      const fallback: AppSettings = {
        ...DEFAULT_SETTINGS,
        instanceDirectory: PathManager.getDefaultInstancesDir()
      };
      this.persistToFile(fallback);
      this.cachedSettings = fallback;
      return fallback;
    }
  }

  public static saveSettings(settings: Partial<AppSettings>): AppSettings {
    const current = this.cachedSettings || this.getSettings();
    const updated: AppSettings = { ...current, ...settings };
    
    // Ensure instance dir exists
    if (updated.instanceDirectory) {
      PathManager.ensureDirectory(updated.instanceDirectory);
    }

    this.persistToFile(updated);
    this.cachedSettings = updated;
    return updated;
  }

  private static persistToFile(settings: AppSettings): void {
    const configFile = PathManager.getConfigFile();
    PathManager.ensureDirectory(PathManager.getConfigDir());
    fs.writeFileSync(configFile, JSON.stringify(settings, null, 2), 'utf-8');
  }

  public static getInstanceDirectory(): string {
    const settings = this.getSettings();
    return settings.instanceDirectory || PathManager.getDefaultInstancesDir();
  }

  public static setInstanceDirectory(newPath: string): boolean {
    try {
      PathManager.ensureDirectory(newPath);
      this.saveSettings({ instanceDirectory: newPath });
      return true;
    } catch (e) {
      new VoxelError({
        title: 'Storage Location Not Changed',
        message: 'The new instance storage directory could not be created or used.',
        cause: 'The path may be invalid, read-only, or on a disconnected drive.',
        suggestedAction: 'Choose a different folder with write permissions and try again.',
        code: 'CONFIG_INSTANCE_DIR_INVALID',
        category: 'FILESYSTEM',
        severity: 'ERROR',
        details: `Requested path: ${newPath}`,
        originalError: e
      }).log();
      return false;
    }
  }

  public static setTheme(theme: ThemeMode): void {
    this.saveSettings({ theme });
  }

  public static setFirstRunCompleted(completed: boolean): void {
    this.saveSettings({ firstRunCompleted: completed });
  }
}

