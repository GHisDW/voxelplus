import { InstanceMetadata, LogEntry } from '../../../electron/types';
import { api } from '../services/api';
import { NotificationToast } from './NotificationToast';

export class LogViewer {
  private container: HTMLElement;
  private selectedInstanceId: string = 'all';
  private selectedLevel: string = 'ALL';
  private searchQuery: string = '';
  private autoScroll: boolean = true;
  private instances: InstanceMetadata[] = [];
  private unsubscribeLog: (() => void) | null = null;

  constructor(initialInstanceId?: string) {
    if (initialInstanceId) this.selectedInstanceId = initialInstanceId;
    this.container = document.createElement('div');
    this.container.className = 'animate-fade-in';
  }

  public async render(): Promise<HTMLElement> {
    this.instances = await api.listInstances();

    this.container.innerHTML = `
      <!-- Toolbar -->
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 16px; flex-wrap: wrap;">
        <div style="display: flex; align-items: center; gap: 10px; flex: 1; min-width: 300px;">
          <!-- Instance Filter -->
          <select class="select-field" id="log-inst-select" style="width: 200px;">
            <option value="all" ${this.selectedInstanceId === 'all' ? 'selected' : ''}>All Instances</option>
            ${this.instances.map(i => `<option value="${i.id}" ${this.selectedInstanceId === i.id ? 'selected' : ''}>${i.name}</option>`).join('')}
          </select>

          <!-- Level Filter -->
          <select class="select-field" id="log-level-select" style="width: 140px;">
            <option value="ALL" ${this.selectedLevel === 'ALL' ? 'selected' : ''}>All Levels</option>
            <option value="INFO" ${this.selectedLevel === 'INFO' ? 'selected' : ''}>Info</option>
            <option value="WARN" ${this.selectedLevel === 'WARN' ? 'selected' : ''}>Warnings</option>
            <option value="ERROR" ${this.selectedLevel === 'ERROR' ? 'selected' : ''}>Errors</option>
            <option value="GRADLE" ${this.selectedLevel === 'GRADLE' ? 'selected' : ''}>Gradle</option>
            <option value="LOOM" ${this.selectedLevel === 'LOOM' ? 'selected' : ''}>Fabric Loom</option>
          </select>

          <!-- Search Query -->
          <input type="text" class="input-field" id="log-search-input" placeholder="Search output..." value="${this.searchQuery}" style="flex: 1;" />
        </div>

        <div style="display: flex; align-items: center; gap: 8px;">
          <button class="btn btn-secondary" id="btn-copy-logs" title="Copy all logs to clipboard">📋 Copy Logs</button>
          <button class="btn btn-secondary" id="btn-toggle-scroll">
            ${this.autoScroll ? '🔒 Auto-Scroll ON' : '🔓 Auto-Scroll OFF'}
          </button>
          <button class="btn btn-secondary" id="btn-export-logs">📥 Export File</button>
          <button class="btn btn-secondary" id="btn-clear-logs" style="color: #ef4444;">Clear</button>
        </div>
      </div>

      <!-- Console Window -->
      <div id="log-terminal" style="
        background: #07090e;
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-lg);
        height: calc(100vh - 210px);
        overflow-y: auto;
        padding: 16px 20px;
        font-family: var(--font-mono);
        font-size: 0.85rem;
        line-height: 1.6;
        color: #e2e8f0;
        box-shadow: inset 0 2px 10px rgba(0,0,0,0.5);
        user-select: text;
        -webkit-user-select: text;
      "></div>
    `;

    const terminal = this.container.querySelector('#log-terminal') as HTMLElement;

    // Filter events
    const instSelect = this.container.querySelector('#log-inst-select') as HTMLSelectElement;
    instSelect.onchange = () => {
      this.selectedInstanceId = instSelect.value;
      this.refreshLogs();
    };

    const levelSelect = this.container.querySelector('#log-level-select') as HTMLSelectElement;
    levelSelect.onchange = () => {
      this.selectedLevel = levelSelect.value;
      this.refreshLogs();
    };

    const searchInput = this.container.querySelector('#log-search-input') as HTMLInputElement;
    searchInput.oninput = (e: any) => {
      this.searchQuery = e.target.value;
      this.refreshLogs();
    };

    const copyBtn = this.container.querySelector('#btn-copy-logs') as HTMLButtonElement;
    copyBtn.onclick = async () => {
      const selection = window.getSelection()?.toString();
      if (selection && selection.trim().length > 0) {
        await navigator.clipboard.writeText(selection);
        NotificationToast.show('Selected log lines copied to clipboard!', 'success');
      } else {
        const text = await api.exportLogs(this.selectedInstanceId);
        await navigator.clipboard.writeText(text);
        NotificationToast.show('All console logs copied to clipboard!', 'success');
      }
    };

    const scrollBtn = this.container.querySelector('#btn-toggle-scroll') as HTMLButtonElement;
    scrollBtn.onclick = () => {
      this.autoScroll = !this.autoScroll;
      scrollBtn.textContent = this.autoScroll ? '🔒 Auto-Scroll ON' : '🔓 Auto-Scroll OFF';
    };

    const exportBtn = this.container.querySelector('#btn-export-logs') as HTMLButtonElement;
    exportBtn.onclick = async () => {
      const savePath = await api.selectSaveFileDialog('voxelplus-console.log');
      if (savePath) {
        const text = await api.exportLogs(this.selectedInstanceId);
        // Copy text to file via electron API or save dialog
        await navigator.clipboard.writeText(text);
        NotificationToast.show('Logs exported & copied!', 'success');
      }
    };

    const clearBtn = this.container.querySelector('#btn-clear-logs') as HTMLButtonElement;
    clearBtn.onclick = async () => {
      await api.clearLogs(this.selectedInstanceId);
      terminal.innerHTML = '';
      NotificationToast.show('Console cleared.', 'info');
    };

    // Load initial logs
    await this.refreshLogs();

    // Subscribe to live logs
    if (this.unsubscribeLog) this.unsubscribeLog();
    this.unsubscribeLog = api.onLog((entry) => {
      this.appendLogEntry(entry);
    });

    return this.container;
  }

  private async refreshLogs(): Promise<void> {
    const terminal = this.container.querySelector('#log-terminal') as HTMLElement;
    if (!terminal) return;

    const entries = await api.getLogs(this.selectedInstanceId, this.selectedLevel, this.searchQuery);
    terminal.innerHTML = '';

    if (entries.length === 0) {
      terminal.innerHTML = `<div style="color: var(--text-muted); padding: 20px; text-align: center;">No console log output recorded.</div>`;
      return;
    }

    for (const entry of entries) {
      terminal.appendChild(this.createLogElement(entry));
    }

    if (this.autoScroll) {
      terminal.scrollTop = terminal.scrollHeight;
    }
  }

  private appendLogEntry(entry: LogEntry): void {
    const terminal = this.container.querySelector('#log-terminal') as HTMLElement;
    if (!terminal) return;

    // Filter check
    if (this.selectedInstanceId !== 'all' && entry.instanceId !== this.selectedInstanceId) {
      return;
    }
    if (this.selectedLevel !== 'ALL' && entry.level !== this.selectedLevel) {
      return;
    }
    if (this.searchQuery && !entry.message.toLowerCase().includes(this.searchQuery.toLowerCase())) {
      return;
    }

    terminal.appendChild(this.createLogElement(entry));

    if (this.autoScroll) {
      terminal.scrollTop = terminal.scrollHeight;
    }
  }

  private createLogElement(entry: LogEntry): HTMLElement {
    const row = document.createElement('div');
    row.style.cssText = `
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 2px 0;
      border-bottom: 1px solid rgba(255,255,255,0.02);
      user-select: text;
      -webkit-user-select: text;
    `;

    let color = '#94a3b8';
    let levelBg = 'rgba(255,255,255,0.05)';
    if (entry.level === 'ERROR') {
      color = '#f87171';
      levelBg = 'rgba(239,68,68,0.2)';
    } else if (entry.level === 'WARN') {
      color = '#fbbf24';
      levelBg = 'rgba(245,158,11,0.2)';
    } else if (entry.level === 'GRADLE') {
      color = '#60a5fa';
      levelBg = 'rgba(59,130,246,0.15)';
    } else if (entry.level === 'LOOM') {
      color = '#c084fc';
      levelBg = 'rgba(168,85,247,0.15)';
    }

    row.innerHTML = `
      <span style="color: var(--text-muted); flex-shrink: 0; font-size: 0.8rem; user-select: none;">${entry.timeString}</span>
      <span style="
        font-size: 0.72rem;
        font-weight: 700;
        padding: 1px 6px;
        border-radius: 4px;
        background: ${levelBg};
        color: ${color};
        flex-shrink: 0;
        user-select: none;
      ">${entry.level}</span>
      <span style="flex: 1; color: ${color}; word-break: break-all; user-select: text; -webkit-user-select: text;">${this.escapeHtml(entry.message)}</span>
    `;

    return row;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
