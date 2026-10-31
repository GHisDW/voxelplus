import { ThemeMode } from '../../../electron/types';
import { api } from './api';

export class ThemeService {
  private static currentTheme: ThemeMode = 'dark';
  private static mediaQuery: MediaQueryList | null = null;
  private static mediaListener: ((event: MediaQueryListEvent) => void) | null = null;

  /**
   * Applies the theme synchronously (the boot path already fetched settings) and
   * subscribes to OS theme changes.
   *
   * The listener is registered exactly once: repeated `initialize()` calls (e.g.
   * after a settings reload) used to stack duplicate `matchMedia` listeners.
   */
  public static initialize(theme: ThemeMode = 'dark'): void {
    this.applyTheme(theme || 'dark');

    if (this.mediaQuery && this.mediaListener) return;

    this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    this.mediaListener = () => {
      if (this.currentTheme === 'system') {
        this.applyTheme('system');
      }
    };
    this.mediaQuery.addEventListener('change', this.mediaListener);
  }

  /** Removes the OS listener (used by tests and full-app teardown). */
  public static dispose(): void {
    if (this.mediaQuery && this.mediaListener) {
      this.mediaQuery.removeEventListener('change', this.mediaListener);
    }
    this.mediaQuery = null;
    this.mediaListener = null;
  }

  public static applyTheme(theme: ThemeMode): void {
    this.currentTheme = theme;
    const resolved: 'dark' | 'light' =
      theme === 'system'
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : theme;

    document.body.classList.remove('theme-dark', 'theme-light');
    document.body.classList.add(`theme-${resolved}`);
    document.body.dataset.theme = resolved;

    // Nudge Electron's native controls/scrollbars and keep the window chrome in
    // sync when the user switches theme at runtime.
    document.documentElement.style.colorScheme = resolved;
  }

  public static async setTheme(theme: ThemeMode): Promise<void> {
    this.applyTheme(theme);
    await api.setAppSettings({ theme });
  }

  public static getTheme(): ThemeMode {
    return this.currentTheme;
  }
}
