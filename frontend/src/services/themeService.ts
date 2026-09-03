import { ThemeMode } from '../../../electron/types';
import { api } from './api';

export class ThemeService {
  private static currentTheme: ThemeMode = 'dark';

  public static async initialize(): Promise<void> {
    try {
      const settings = await api.getAppSettings();
      this.applyTheme(settings.theme || 'dark');
    } catch {
      this.applyTheme('dark');
    }

    // Watch for OS theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (this.currentTheme === 'system') {
        this.applyTheme('system');
      }
    });
  }

  public static applyTheme(theme: ThemeMode): void {
    this.currentTheme = theme;
    document.body.classList.remove('theme-dark', 'theme-light');

    if (theme === 'system') {
      const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.body.classList.add(systemDark ? 'theme-dark' : 'theme-light');
    } else {
      document.body.classList.add(`theme-${theme}`);
    }
  }

  public static async setTheme(theme: ThemeMode): Promise<void> {
    this.applyTheme(theme);
    await api.setAppSettings({ theme });
  }

  public static getTheme(): ThemeMode {
    return this.currentTheme;
  }
}
