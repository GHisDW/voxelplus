import { VoxelPublicUserProfile } from '../../../electron/types';
import { api } from '../services/api';

export class DirectoryPage {
  private profiles: VoxelPublicUserProfile[] = [];
  private searchQuery: string = '';
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
    await this.loadProfiles();
    this.renderContent();
    return this.container;
  }

  private async loadProfiles(): Promise<void> {
    try {
      this.profiles = await api.listPublicProfiles(this.searchQuery);
    } catch {
      this.profiles = [];
    }
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
        <h2 style="font-size: 1.6rem; font-weight: 800; color: var(--text-primary);">Community Directory</h2>
        <p style="font-size: 0.88rem; color: var(--text-secondary); margin-top: 2px;">
          Discover Voxel⁺ creators, public profiles, and shared community content
        </p>
      </div>

      <div style="display: flex; gap: 10px; width: 320px;">
        <input type="text" id="directory-search" class="input" placeholder="Search creators or bio..." value="${this.searchQuery}" style="width: 100%; padding: 10px 14px; font-size: 0.9rem;" />
      </div>
    `;

    const searchInput = header.querySelector('#directory-search') as HTMLInputElement;
    searchInput.oninput = async () => {
      this.searchQuery = searchInput.value;
      await this.loadProfiles();
      this.renderGrid();
    };

    this.container.appendChild(header);

    const gridContainer = document.createElement('div');
    gridContainer.id = 'directory-grid';
    gridContainer.style.cssText = `flex: 1; min-height: 0;`;
    this.container.appendChild(gridContainer);

    this.renderGrid();
  }

  private renderGrid(): void {
    const grid = this.container.querySelector('#directory-grid') as HTMLElement;
    if (!grid) return;
    grid.innerHTML = '';

    if (this.profiles.length === 0) {
      grid.innerHTML = `
        <div style="text-align: center; padding: 60px 20px; background: var(--bg-card); border-radius: var(--radius-xl); border: 1px solid var(--border-subtle);">
          <div style="font-size: 3rem; margin-bottom: 10px;">🌐</div>
          <h3 style="font-size: 1.2rem; font-weight: 700; color: var(--text-primary);">No Public Profiles Found</h3>
          <p style="color: var(--text-secondary); font-size: 0.88rem; margin-top: 4px;">
            ${this.searchQuery ? 'No creators matched your search query.' : 'Be the first Voxel⁺ community member to make your profile public!'}
          </p>
        </div>
      `;
      return;
    }

    const cardsWrapper = document.createElement('div');
    cardsWrapper.style.cssText = `
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 18px;
    `;

    this.profiles.forEach((p) => {
      const card = document.createElement('div');
      card.className = 'card-surface';
      card.style.cssText = `
        background: var(--bg-card);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-lg);
        padding: 20px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 14px;
        transition: transform 0.2s ease, border-color 0.2s ease;
      `;

      card.innerHTML = `
        <div>
          <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 12px;">
            <div style="
              width: 50px;
              height: 50px;
              border-radius: 50%;
              background: var(--accent-gradient);
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 1.5rem;
              color: white;
            ">
              ${this.getAvatarIcon(p.avatar)}
            </div>
            <div>
              <div style="font-size: 1.1rem; font-weight: 800; color: var(--text-primary);">@${p.username}</div>
              ${p.isCreator ? '<span class="badge badge-recommended" style="font-size: 0.68rem; padding: 2px 6px;">✦ CREATOR</span>' : ''}
            </div>
          </div>
          <p style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
            ${p.bio || 'Voxel⁺ platform member.'}
          </p>
        </div>

        <div style="font-size: 0.78rem; color: var(--text-muted); display: flex; justify-content: space-between; border-top: 1px solid var(--border-subtle); padding-top: 10px;">
          <span>Packs: ${p.publicPacksCount}</span>
          <span>Skins: ${p.publicSkinsCount}</span>
        </div>
      `;

      cardsWrapper.appendChild(card);
    });

    grid.appendChild(cardsWrapper);
  }

  private getAvatarIcon(avatar: string): string {
    if (avatar === 'avatar_alex') return '🟩';
    if (avatar === 'avatar_creeper') return '❇️';
    if (avatar === 'avatar_ender') return '🟪';
    if (avatar === 'avatar_blaze') return '🟧';
    if (avatar === 'avatar_redstone') return '🟥';
    return '🟦';
  }
}
