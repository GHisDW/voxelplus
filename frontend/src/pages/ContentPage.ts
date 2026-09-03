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

  public async render(): Promise<HTMLElement> {
    this.container.innerHTML = '';
    this.container.appendChild(await this.browser.render());
    return this.container;
  }
}
