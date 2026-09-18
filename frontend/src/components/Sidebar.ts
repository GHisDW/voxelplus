export type PageId = 'instances' | 'content' | 'logs' | 'settings';

export interface SidebarEvents {
  onNavigate: (page: PageId) => void;
}

export class Sidebar {
  private activePage: PageId = 'instances';
  private events: SidebarEvents;
  private container: HTMLElement;

  constructor(events: SidebarEvents) {
    this.events = events;
    this.container = document.createElement('aside');
    this.container.className = 'sidebar';
  }

  public render(activePage: PageId): HTMLElement {
    this.activePage = activePage;

    this.container.innerHTML = `
      <!-- Brand Logo -->
      <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 32px; padding: 4px 6px;">
        <div style="
          width: 36px;
          height: 36px;
          border-radius: var(--radius-md);
          background: var(--accent-gradient);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 14px var(--accent-glow);
          color: white;
          font-size: 1.2rem;
          font-weight: 900;
        ">
          V
        </div>
        <div class="brand-title">
          VOXEL<span class="plus-badge">⁺</span>
        </div>
      </div>

      <!-- Navigation Links -->
      <nav style="display: flex; flex-direction: column; gap: 6px; flex: 1;">
        <button class="nav-item ${this.activePage === 'instances' ? 'active' : ''}" data-page="instances" style="${this.navItemStyle(this.activePage === 'instances')}">
          <span style="font-size: 1.2rem;">⌂</span>
          <span>Instances</span>
        </button>

        <button class="nav-item ${this.activePage === 'content' ? 'active' : ''}" data-page="content" style="${this.navItemStyle(this.activePage === 'content')}">
          <span style="font-size: 1.2rem;">◈</span>
          <span>Content</span>
        </button>

        <button class="nav-item ${this.activePage === 'logs' ? 'active' : ''}" data-page="logs" style="${this.navItemStyle(this.activePage === 'logs')}">
          <span style="font-size: 1.2rem;">▣</span>
          <span>Logs</span>
        </button>

        <button class="nav-item ${this.activePage === 'settings' ? 'active' : ''}" data-page="settings" style="${this.navItemStyle(this.activePage === 'settings')}">
          <span style="font-size: 1.2rem;">⚙</span>
          <span>Settings</span>
        </button>
      </nav>

      <!-- Bottom Engine Status -->
      <div style="
        padding: 12px 14px;
        background: var(--bg-surface);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-md);
        display: flex;
        align-items: center;
        gap: 10px;
      ">
        <span class="status-dot" style="background: #10b981;"></span>
        <div style="flex: 1; min-width: 0;">
          <div style="font-size: 0.78rem; font-weight: 700; color: var(--text-primary);">Gradle & Loom</div>
          <div style="font-size: 0.72rem; color: var(--text-muted);">Engine Ready</div>
        </div>
      </div>
    `;

    this.container.querySelectorAll('[data-page]').forEach(btn => {
      (btn as HTMLElement).onclick = () => {
        const page = btn.getAttribute('data-page') as PageId;
        this.events.onNavigate(page);
      };
    });

    return this.container;
  }

  private navItemStyle(isActive: boolean): string {
    return `
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 11px 16px;
      border-radius: var(--radius-md);
      font-family: var(--font-main);
      font-size: 0.95rem;
      font-weight: 600;
      color: ${isActive ? '#ffffff' : 'var(--text-secondary)'};
      background: ${isActive ? 'var(--accent-gradient)' : 'transparent'};
      border: 1px solid ${isActive ? 'transparent' : 'transparent'};
      box-shadow: ${isActive ? '0 4px 14px var(--accent-glow)' : 'none'};
      cursor: pointer;
      transition: all 0.2s ease;
      text-align: left;
    `;
  }
}
