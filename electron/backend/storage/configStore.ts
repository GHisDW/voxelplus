import fs from 'node:fs';
import { AppSettings, ThemeMode } from '../../types';
import { PathManager } from './paths';

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
      console.error('Failed to read config, returning defaults:', e);
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
      console.error('Failed to set instance directory:', e);
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

