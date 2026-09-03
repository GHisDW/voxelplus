import { LogViewer } from '../components/LogViewer';

export class LogsPage {
  private container: HTMLElement;
  private logViewer: LogViewer;

  constructor(initialInstanceId?: string) {
    this.container = document.createElement('div');
    this.container.className = 'page-scroll-area animate-fade-in';
    this.logViewer = new LogViewer(initialInstanceId);
  }

  public async render(): Promise<HTMLElement> {
    this.container.innerHTML = '';
    this.container.appendChild(await this.logViewer.render());
    return this.container;
  }
}
