import { InstanceMetadata } from '../../../electron/types';
import { ModrinthBrowser } from '../components/ModrinthBrowser';

export class ContentPage {
  private container: HTMLElement;
  private browser: ModrinthBrowser;

  constructor(initialInstance?: InstanceMetadata) {
    this.container = document.createElement('div');
    this.container.className = 'page-scroll-area animate-fade-in';
    this.browser = new ModrinthBrowser(initialInstance);
  }

  /** Releases the browser's debounce timer when the page is navigated away. */
  public destroy(): void {
    this.browser.destroy();
  }

  public async render(): Promise<HTMLElement> {
    this.container.innerHTML = '';
    try {
      this.container.appendChild(await this.browser.render());
    } catch (error) {
      console.error('[ContentPage] Failed to render content browser:', error);
      this.container.innerHTML = `
        <div style="padding: 56px 32px; text-align: center; background: var(--bg-card); border: 1px dashed var(--border-subtle); border-radius: var(--radius-lg);">
          <h2 style="font-size: 1.25rem; font-weight: 800; color: var(--text-primary); margin-bottom: 8px;">Content could not be loaded</h2>
          <p style="color: var(--text-muted); max-width: 520px; margin: 0 auto;">The content browser encountered an error while loading. Check your connection and try again.</p>
        </div>
      `;
    }
    return this.container;
  }
}
