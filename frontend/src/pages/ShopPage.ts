import { api } from '../services/api';
import { VoxelCard, CardInstallState } from '../../../electron/types';
import { NotificationToast } from '../components/NotificationToast';
import { describeIpcError } from '../services/errors';
import { CardCreatorModal } from '../components/CardCreatorModal';

type Tab = 'browse' | 'installed';

export class ShopPage {
  private container: HTMLElement;
  private activeTab: Tab = 'browse';
  private searchQuery: string = '';

  private allCards: VoxelCard[] = [];
  private installedStates: CardInstallState[] = [];
  private isLoading = false;
  private isDeveloperMode = false;

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'page animate-fade-in';
    this.container.style.cssText = `
      display: flex; flex-direction: column; height: 100%; padding: 24px 32px;
    `;
  }

  public async render(): Promise<HTMLElement> {
    this.isDeveloperMode = await api.isDeveloperMode();

    this.container.innerHTML = `
      <div style="flex: 1; display: flex; flex-direction: column; min-height: 0;">
        <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 24px; flex-shrink: 0;">
          <div>
            <h1 class="page-title">Voxel⁺ Cards</h1>
            <p class="page-subtitle">Curated, deterministic instance blueprints.</p>
          </div>
          
          <div style="display: flex; gap: 12px; align-items: center;">
            ${this.isDeveloperMode ? `
              <button id="btn-new-card" class="btn btn-primary" style="padding: 8px 16px;">+ New Card</button>
            ` : ''}
            <div style="display: flex; background: var(--bg-surface); padding: 4px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
              <button class="btn ${this.activeTab === 'browse' ? 'btn-primary' : 'btn-secondary'}" data-tab="browse" style="border: none; padding: 6px 16px;">Browse</button>
              <button class="btn ${this.activeTab === 'installed' ? 'btn-primary' : 'btn-secondary'}" data-tab="installed" style="border: none; padding: 6px 16px;">Downloaded</button>
            </div>
            
            <input type="text" class="input-field" id="cards-search" placeholder="Search cards..." value="${this.esc(this.searchQuery)}" style="width: 250px;">
          </div>
        </div>

        <div id="cards-grid" style="
          flex: 1; overflow-y: auto; padding-right: 8px;
          display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 20px; align-content: start;
        "></div>
      </div>
    `;

    // Tabs
    this.container.querySelectorAll('[data-tab]').forEach(btn => {
      (btn as HTMLElement).onclick = () => {
        this.activeTab = btn.getAttribute('data-tab') as Tab;
        this.loadData();
      };
    });

    // Search
    const searchInput = this.container.querySelector('#cards-search') as HTMLInputElement;
    searchInput?.addEventListener('input', (e: any) => {
      this.searchQuery = e.target.value.toLowerCase();
      this.renderGrid();
    });

    // New Card button (developer only)
    const newCardBtn = this.container.querySelector('#btn-new-card');
    if (newCardBtn) {
      newCardBtn.addEventListener('click', () => {
        const modal = new CardCreatorModal({ source: 'developer' }, () => this.loadData());
        modal.show();
      });
    }

    await this.loadData();

    return this.container;
  }

  private async loadData() {
    this.isLoading = true;
    this.renderGrid();

    try {
      const [cards, installs] = await Promise.all([
        api.listCards(),
        api.listInstalledCards()
      ]);
      this.allCards = cards;
      this.installedStates = installs;
    } catch (e: any) {
      console.error('Failed to load cards:', e);
      NotificationToast.show('Failed to load cards.', 'error');
    }

    this.isLoading = false;
    this.renderGrid();
  }

  private async checkCardRetirement(cardId: string): Promise<boolean> {
    try {
      return await api.isCardRetired(cardId);
    } catch {
      return false;
    }
  }

  private async renderGrid() {
    const grid = this.container.querySelector('#cards-grid') as HTMLElement;
    if (!grid) return;

    if (this.isLoading) {
      grid.innerHTML = `<div style="grid-column: 1 / -1; padding: 40px; text-align: center; color: var(--text-muted);"><span class="animate-pulse">Loading cards...</span></div>`;
      return;
    }

    let displayCards = this.allCards;

    if (this.activeTab === 'installed') {
      const installedIds = new Set(this.installedStates.map(s => s.cardId));
      displayCards = this.allCards.filter(c => installedIds.has(c.id));
    }

    if (this.searchQuery) {
      displayCards = displayCards.filter(c => 
        c.name.toLowerCase().includes(this.searchQuery) ||
        c.description.toLowerCase().includes(this.searchQuery) ||
        c.tags.some(t => t.toLowerCase().includes(this.searchQuery))
      );
    }

    if (displayCards.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 60px; text-align: center; background: var(--bg-card); border-radius: var(--radius-lg); border: 1px dashed var(--border-subtle);">
          <div style="font-size: 2.5rem; margin-bottom: 16px;">🎴</div>
          <h4 style="font-size: 1.2rem; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;">No cards found</h4>
          <p style="color: var(--text-muted);">Try a different search or check your internet connection.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = '';
    for (const card of displayCards) {
      const cardElement = await this.buildCardElement(card);
      grid.appendChild(cardElement);
    }
  }

  private async buildCardElement(card: VoxelCard): Promise<HTMLElement> {
    const installState = this.installedStates.find(s => s.cardId === card.id);
    const isInstalled = !!installState;
    const isRetired = await this.checkCardRetirement(card.id);
    const source = card.source || 'user';

    const el = document.createElement('div');
    el.className = 'card animate-fade-in-up hover-scale';
    el.style.cssText = `
      display: flex; flex-direction: column; background: var(--bg-card);
      border: 1px solid var(--border-subtle); border-radius: var(--radius-lg);
      overflow: hidden; cursor: pointer; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      position: relative;
      ${isRetired ? 'opacity: 0.7;' : ''}
    `;

    el.innerHTML = `
      <!-- Artwork / Header -->
      <div style="height: 120px; background: #1a1e23; position: relative; border-bottom: 2px solid var(--border-subtle);">
        ${card.artwork 
          ? `<img src="${card.artwork}" style="width: 100%; height: 100%; object-fit: cover; opacity: 0.8;" />`
          : `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; opacity: 0.3; font-size: 3rem;">📦</div>`
        }
        <div style="position: absolute; bottom: 0; left: 0; right: 0; padding: 12px; background: linear-gradient(transparent, rgba(0,0,0,0.8)); display: flex; justify-content: space-between; align-items: flex-end;">
          <div style="display: flex; gap: 6px; align-items: center;">
            <span style="font-size: 0.75rem; font-weight: 800; padding: 2px 8px; border-radius: 4px; background: var(--bg-surface); color: var(--text-primary); border: 1px solid var(--border-subtle);">
              v${card.cardVersion}
            </span>
            ${source === 'builtin' ? `
              <span style="font-size: 0.7rem; font-weight: 800; padding: 2px 6px; border-radius: 4px; background: rgba(59, 130, 246, 0.2); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.4);">
                OFFICIAL
              </span>
            ` : source === 'developer' ? `
              <span style="font-size: 0.7rem; font-weight: 800; padding: 2px 6px; border-radius: 4px; background: rgba(168, 85, 247, 0.2); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.4);">
                DEVELOPER
              </span>
            ` : ''}
          </div>

          <div style="display: flex; gap: 6px; align-items: center;">
            ${this.isDeveloperMode && !isRetired ? `
              <button class="btn btn-secondary card-edit-btn" data-card-id="${card.id}" style="padding: 4px 8px; font-size: 0.7rem; border: 1px solid var(--border-subtle);">Edit</button>
            ` : ''}
            ${isRetired ? `
              <span style="font-size: 0.75rem; font-weight: 800; padding: 2px 8px; border-radius: 4px; background: #f59e0b20; color: #f59e0b; border: 1px solid #f59e0b40;">
                RETIRED
              </span>
            ` : isInstalled ? `
              <span style="font-size: 0.75rem; font-weight: 800; padding: 2px 8px; border-radius: 4px; background: #10b98120; color: #10b981; border: 1px solid #10b98140;">
                INSTALLED
              </span>
            ` : ''}
          </div>
        </div>
      </div>
      
      <!-- Body -->
      <div style="padding: 16px; flex: 1; display: flex; flex-direction: column;">
        <h3 style="font-size: 1.15rem; font-weight: 800; color: var(--text-primary); margin-bottom: 4px; letter-spacing: -0.02em;">${this.esc(card.name)}</h3>
        <p style="font-size: 0.85rem; color: var(--accent-primary); font-weight: 600; margin-bottom: 12px;">${this.esc(card.tagline)}</p>
        
        <p style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.5; flex: 1; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;">
          ${this.esc(card.description)}
        </p>
        
        <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 16px;">
          <span style="font-size: 0.7rem; font-weight: 700; color: var(--text-muted); padding: 2px 6px; background: var(--bg-surface); border-radius: 4px;">MC ${card.minecraftVersion}</span>
          <span style="font-size: 0.7rem; font-weight: 700; color: var(--text-muted); padding: 2px 6px; background: var(--bg-surface); border-radius: 4px;">${card.loaderType}</span>
          <span style="font-size: 0.7rem; font-weight: 700; color: var(--text-muted); padding: 2px 6px; background: var(--bg-surface); border-radius: 4px;">${card.mods.length} mods</span>
        </div>
      </div>
    `;

    el.onclick = () => this.showCardDetails(card, installState, isRetired);

    const editBtn = el.querySelector('.card-edit-btn');
    if (editBtn) {
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const modal = new CardCreatorModal(card, () => this.loadData());
        modal.show();
      });
    }

    el.addEventListener('mouseenter', () => {
      el.style.borderColor = 'var(--accent-primary)';
      el.style.transform = 'translateY(-4px)';
      el.style.boxShadow = '0 12px 24px rgba(0,0,0,0.2)';
    });
    el.addEventListener('mouseleave', () => {
      el.style.borderColor = 'var(--border-subtle)';
      el.style.transform = 'translateY(0)';
      el.style.boxShadow = 'none';
    });

    return el;
  }

  // ── Card Details Modal ──────────────────────────────────────────────────

  private async showCardDetails(card: VoxelCard, installState?: CardInstallState, isRetired: boolean = false) {
    const overlay = document.createElement('div');
    overlay.className = 'animate-fade-in';
    overlay.style.cssText = `
      position: fixed; inset: 0; background: rgba(0,0,0,0.85); backdrop-filter: blur(4px);
      z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 40px;
    `;

    const modal = document.createElement('div');
    modal.className = 'animate-fade-in-up';
    modal.style.cssText = `
      background: var(--bg-modal); border-radius: var(--radius-xl); border: 1px solid var(--border-subtle);
      width: 100%; max-width: 800px; max-height: 90vh; display: flex; flex-direction: column;
      box-shadow: 0 24px 48px rgba(0,0,0,0.5); overflow: hidden;
    `;

    const isInstalled = !!installState;
    const isBuiltIn = await api.isBuiltInCard(card.id);

    let modsHtml = card.mods.map(m => `
      <div style="display: flex; align-items: center; gap: 12px; padding: 10px; background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-md);">
        ${m.iconUrl 
          ? `<img src="${m.iconUrl}" style="width: 32px; height: 32px; border-radius: 6px; object-fit: cover;" />` 
          : `<div style="width: 32px; height: 32px; border-radius: 6px; background: var(--bg-card); display: flex; align-items: center; justify-content: center;">📦</div>`
        }
        <div style="flex: 1; min-width: 0;">
          <div style="font-size: 0.9rem; font-weight: 700; color: var(--text-primary); margin-bottom: 2px;">${this.esc(m.projectName)}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted); display: flex; gap: 6px;">
            <span>${m.versionName}</span>
            <span style="opacity: 0.5;">•</span>
            <span style="color: ${m.provider === 'modrinth' ? '#10b981' : '#f97316'};">${m.provider}</span>
          </div>
        </div>
      </div>
    `).join('');

    if (card.mods.length === 0) {
      modsHtml = `<div style="padding: 20px; text-align: center; color: var(--text-muted); background: var(--bg-surface); border-radius: var(--radius-md);">No mods included in this card.</div>`;
    }

    modal.innerHTML = `
      <!-- Header / Banner -->
      <div style="height: 200px; background: #1a1e23; position: relative; border-bottom: 1px solid var(--border-subtle);">
        ${card.artwork 
          ? `<img src="${card.artwork}" style="width: 100%; height: 100%; object-fit: cover; opacity: 0.6;" />`
          : `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; opacity: 0.1; font-size: 5rem;">📦</div>`
        }
        <button id="cd-close" class="btn btn-secondary" style="position: absolute; top: 16px; right: 16px; padding: 6px 12px; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px); border: none;">✕ Close</button>
        
        <div style="position: absolute; bottom: 0; left: 0; right: 0; padding: 24px; background: linear-gradient(transparent, rgba(0,0,0,0.9));">
          <h2 style="font-size: 2rem; font-weight: 900; color: white; letter-spacing: -0.02em; margin-bottom: 4px; text-shadow: 0 2px 4px rgba(0,0,0,0.5);">${this.esc(card.name)}</h2>
          <p style="font-size: 1.1rem; color: var(--accent-primary); font-weight: 600; text-shadow: 0 1px 2px rgba(0,0,0,0.5);">${this.esc(card.tagline)}</p>
        </div>
      </div>

      <!-- Content area -->
      <div style="padding: 24px; flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 24px;">
        
        <!-- Action Bar -->
        <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 20px; border-bottom: 1px solid var(--border-subtle);">
          <div style="display: flex; gap: 12px;">
            <div style="background: var(--bg-surface); padding: 8px 16px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
              <div style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px;">Card Version</div>
              <div style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary);">${card.cardVersion}</div>
            </div>
            <div style="background: var(--bg-surface); padding: 8px 16px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
              <div style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px;">Game</div>
              <div style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary);">MC ${card.minecraftVersion}</div>
            </div>
            <div style="background: var(--bg-surface); padding: 8px 16px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
              <div style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px;">Loader</div>
              <div style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary); text-transform: capitalize;">${card.loaderType} ${card.loaderVersion}</div>
            </div>
            
            <div style="display: flex; gap: 8px; align-items: center; border-left: 1px solid var(--border-subtle); padding-left: 12px;">
              <button id="cd-export" class="btn btn-secondary" style="padding: 6px 12px;">Export JSON</button>
            </div>
          </div>
          
          <div style="display: flex; gap: 12px; align-items: center;">
            ${this.isDeveloperMode && isBuiltIn && !isRetired ? `
              <button id="cd-edit" class="btn btn-secondary" style="padding: 6px 12px;">Edit</button>
              <button id="cd-retire" class="btn btn-secondary" style="color: #f59e0b; border-color: #f59e0b40; padding: 6px 12px;">Retire</button>
            ` : ''}
            ${isRetired
              ? `
                <span style="font-size: 0.85rem; font-weight: 700; color: #f59e0b; display: flex; align-items: center; gap: 6px;">
                  <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #f59e0b;"></span> Retired
                </span>
                <span style="font-size: 0.75rem; color: var(--text-muted); max-width: 300px;">
                  This card is no longer shipped with Voxel⁺. Your existing instance remains intact.
                </span>
              `
              : isInstalled
              ? `
                <span style="font-size: 0.85rem; font-weight: 700; color: #10b981; display: flex; align-items: center; gap: 6px;">
                  <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #10b981;"></span> Installed
                </span>
                <button id="cd-uninstall" class="btn btn-secondary" style="color: #ef4444; border-color: #ef444430;">Uninstall Card State</button>
              `
              : `<button id="cd-install" class="btn btn-primary" style="padding: 10px 24px; font-size: 1rem;">Install Card</button>`
            }
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 32px;">
          <!-- Left Col -->
          <div style="display: flex; flex-direction: column; gap: 24px;">
            <div>
              <h4 style="font-size: 1rem; font-weight: 800; color: var(--text-primary); margin-bottom: 12px; border-left: 3px solid var(--accent-primary); padding-left: 10px;">Description</h4>
              <p style="font-size: 0.9rem; color: var(--text-secondary); line-height: 1.6; white-space: pre-wrap;">${this.esc(card.description)}</p>
            </div>
            
            <div>
              <h4 style="font-size: 1rem; font-weight: 800; color: var(--text-primary); margin-bottom: 12px; border-left: 3px solid var(--accent-primary); padding-left: 10px;">Included Content (${card.mods.length})</h4>
              <div style="display: flex; flex-direction: column; gap: 8px;">
                ${modsHtml}
              </div>
            </div>
          </div>
          
          <!-- Right Col -->
          <div>
             <div style="background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); padding: 16px;">
                <h4 style="font-size: 0.85rem; font-weight: 800; color: var(--text-primary); margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.05em;">Details</h4>
                
                <div style="display: flex; flex-direction: column; gap: 12px; font-size: 0.85rem;">
                  <div>
                    <div style="color: var(--text-muted); margin-bottom: 2px;">Author</div>
                    <div style="color: var(--text-primary); font-weight: 600;">${this.esc(card.author)}</div>
                  </div>
                  <div>
                    <div style="color: var(--text-muted); margin-bottom: 2px;">Published</div>
                    <div style="color: var(--text-primary); font-weight: 600;">${new Date(card.publishedAt).toLocaleDateString()}</div>
                  </div>
                  <div>
                    <div style="color: var(--text-muted); margin-bottom: 4px;">Tags</div>
                    <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                      ${card.tags.map(t => `<span style="padding: 2px 8px; background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 12px; font-size: 0.75rem;">${this.esc(t)}</span>`).join('')}
                    </div>
                  </div>
                </div>
             </div>
          </div>
        </div>
        
        <!-- Indeterminate Progress Indicator -->
        <div id="cd-progress-container" style="display: none; align-items: center; justify-content: space-between; padding: 16px; background: var(--bg-surface); border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
          <div style="display: flex; align-items: center; gap: 12px;">
            <span id="cd-spinner" class="animate-spin" style="font-size: 1.2rem;">⏳</span>
            <span id="cd-progress-text" style="font-size: 0.9rem; font-weight: 600; color: var(--text-primary);">Installing card...</span>
          </div>
        </div>

      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const closeOverlay = (e?: MouseEvent) => {
      if (e && e.target !== overlay) return;
      overlay.remove();
    };
    overlay.onclick = closeOverlay;
    modal.querySelector('#cd-close')!.addEventListener('click', () => overlay.remove());

    const installBtn = modal.querySelector('#cd-install') as HTMLButtonElement | null;
    if (installBtn) {
      installBtn.onclick = async () => {
        installBtn.disabled = true;
        installBtn.textContent = 'Installing...';
        
        const progContainer = modal.querySelector('#cd-progress-container') as HTMLElement;
        const progText = modal.querySelector('#cd-progress-text') as HTMLElement;
        const spinner = modal.querySelector('#cd-spinner') as HTMLElement;
        
        progContainer.style.display = 'flex';
        progText.textContent = 'Creating instance and downloading mods...';

        try {
          const res = await api.installCard(card.id);
          if (res.success) {
            spinner.textContent = '✅';
            spinner.className = '';
            progText.textContent = 'Installation complete!';
            NotificationToast.show(`Card "${card.name}" installed successfully!`, 'success');
            setTimeout(() => {
              overlay.remove();
              this.loadData();
            }, 1000);
          } else {
            spinner.textContent = '❌';
            spinner.className = '';
            progText.style.color = '#ef4444';
            progText.textContent = res.error || 'Card installation failed';
            NotificationToast.show(describeIpcError(new Error(res.error || 'Installation failed')), 'error');
            installBtn.disabled = false;
            installBtn.textContent = 'Retry Install';
          }
        } catch (e: any) {
          spinner.textContent = '❌';
          spinner.className = '';
          progText.style.color = '#ef4444';
          progText.textContent = describeIpcError(e);
          NotificationToast.show(describeIpcError(e), 'error');
          installBtn.disabled = false;
          installBtn.textContent = 'Retry Install';
        }
      };
    }

    const editBtn = modal.querySelector('#cd-edit') as HTMLButtonElement | null;
    if (editBtn) {
      editBtn.onclick = () => {
        overlay.remove();
        const modal = new CardCreatorModal(card, () => this.loadData());
        modal.show();
      };
    }

    const retireBtn = modal.querySelector('#cd-retire') as HTMLButtonElement | null;
    if (retireBtn) {
      retireBtn.onclick = async () => {
        if (!confirm('Retiring this card will remove it from the Shop. Existing installations will remain intact. Continue?')) return;
        retireBtn.disabled = true;
        try {
          const res = await api.retireCard(card.id);
          if (res.success) {
            NotificationToast.show(`Card "${card.name}" has been retired.`, 'success');
            overlay.remove();
            this.loadData();
          } else {
            throw new Error(res.error || 'Failed to retire card');
          }
        } catch (e: any) {
          NotificationToast.show(`Failed to retire card: ${e.message}`, 'error');
          retireBtn.disabled = false;
        }
      };
    }

    const uninstallBtn = modal.querySelector('#cd-uninstall') as HTMLButtonElement | null;
    if (uninstallBtn) {
      uninstallBtn.onclick = async () => {
        if (!confirm('This removes the card install state. The actual Voxel⁺ instance will remain. Continue?')) return;
        uninstallBtn.disabled = true;
        try {
          const res = await api.uninstallCard(card.id);
          if (res.success) {
            NotificationToast.show('Card state removed.', 'success');
            overlay.remove();
            this.loadData();
          } else {
            NotificationToast.show(res.error || 'Uninstall failed.', 'error');
            uninstallBtn.disabled = false;
          }
        } catch (e: any) {
          NotificationToast.show(describeIpcError(e), 'error');
          uninstallBtn.disabled = false;
        }
      };
    }

    modal.querySelector('#cd-export')?.addEventListener('click', async () => {
      try {
        const ok = await api.exportCard(card);
        if (ok) NotificationToast.show('Card exported successfully.', 'success');
      } catch (e: any) {
        NotificationToast.show('Failed to export card.', 'error');
      }
    });
  }

  private esc(text: string): string {
    if (!text) return '';
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
  }
}
