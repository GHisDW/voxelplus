import { api } from '../services/api';

export class LibraryPage {
  private libraryItems: any[] = [];
  private activeFilter: 'all' | 'pack' | 'skin' | 'card' | 'saved' = 'all';
  private container: HTMLElement;

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'page-container';
    this.container.style.cssText = `
      padding: 24px;
      overflow-y: auto;
      height: 100%;
      display: flex;
      flex-direction: column;
      gap: 20px;
    `;
  }

  public async render(): Promise<HTMLElement> {
    try {
      this.libraryItems = await api.getLibrary();
    } catch {
      this.libraryItems = [];
    }

    this.renderContent();
    return this.container;
  }

  private renderContent(): void {
    this.container.innerHTML = '';

    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
    `;

    header.innerHTML = `
      <div>
        <h2 style="font-size: 1.6rem; font-weight: 800; color: var(--text-primary);">Voxel⁺ Library</h2>
        <p style="font-size: 0.88rem; color: var(--text-secondary); margin-top: 2px;">
          Persistent cloud metadata for your saved content, packs, skins, and creator items
        </p>
      </div>

      <div style="display: flex; gap: 8px;">
        <button class="btn ${this.activeFilter === 'all' ? 'btn-primary' : 'btn-secondary'}" data-filter="all" style="padding: 8px 14px; font-size: 0.85rem;">All Items</button>
        <button class="btn ${this.activeFilter === 'pack' ? 'btn-primary' : 'btn-secondary'}" data-filter="pack" style="padding: 8px 14px; font-size: 0.85rem;">📦 Packs</button>
        <button class="btn ${this.activeFilter === 'skin' ? 'btn-primary' : 'btn-secondary'}" data-filter="skin" style="padding: 8px 14px; font-size: 0.85rem;">👕 Skins</button>
        <button class="btn ${this.activeFilter === 'card' ? 'btn-primary' : 'btn-secondary'}" data-filter="card" style="padding: 8px 14px; font-size: 0.85rem;">🎴 Cards</button>
      </div>
    `;

    header.querySelectorAll('[data-filter]').forEach((btn) => {
      (btn as HTMLElement).onclick = () => {
        this.activeFilter = btn.getAttribute('data-filter') as any;
        this.renderContent();
      };
    });

    this.container.appendChild(header);

    const filtered =
      this.activeFilter === 'all'
        ? this.libraryItems
        : this.libraryItems.filter((i) => i.type === this.activeFilter);

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = `
        text-align: center;
        padding: 60px 20px;
        background: var(--bg-card);
        border-radius: var(--radius-xl);
        border: 1px solid var(--border-subtle);
      `;
      empty.innerHTML = `
        <div style="font-size: 3rem; margin-bottom: 10px;">📚</div>
        <h3 style="font-size: 1.2rem; font-weight: 700; color: var(--text-primary);">Your Library is Empty</h3>
        <p style="color: var(--text-secondary); font-size: 0.88rem; margin-top: 4px;">
          Items you create, export, or save to your account will appear here.
        </p>
      `;
      this.container.appendChild(empty);
    } else {
      const grid = document.createElement('div');
      grid.style.cssText = `
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
        gap: 16px;
      `;

      filtered.forEach((item) => {
        const card = document.createElement('div');
        card.className = 'card-surface';
        card.style.cssText = `
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
          padding: 18px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        `;

        const icon = item.type === 'pack' ? '📦' : item.type === 'skin' ? '👕' : '◈';

        card.innerHTML = `
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="font-size: 1.6rem;">${icon}</div>
            <div>
              <div style="font-size: 1rem; font-weight: 700; color: var(--text-primary);">${item.title}</div>
              <div style="font-size: 0.78rem; color: var(--text-secondary);">${item.source || 'Voxel⁺ Content'}</div>
            </div>
          </div>
          <div style="font-size: 0.75rem; color: var(--text-muted); border-top: 1px solid var(--border-subtle); padding-top: 8px; margin-top: 4px;">
            Added: ${new Date(item.addedAt).toLocaleDateString()}
          </div>
        `;

        grid.appendChild(card);
      });

      this.container.appendChild(grid);
    }
  }
}
