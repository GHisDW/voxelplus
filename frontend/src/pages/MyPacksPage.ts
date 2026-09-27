import { api } from '../services/api';
import { VoxelCard, MyPack } from '../../../electron/types';
import { NotificationToast } from '../components/NotificationToast';
import { describeIpcError } from '../services/errors';
import { PackCreatorModal } from '../components/PackCreatorModal';

export class MyPacksPage {
  private container: HTMLElement;
  private searchQuery: string = '';

  private allPacks: MyPack[] = [];
  private isLoading = false;

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'page animate-fade-in';
    this.container.style.cssText = `
      display: flex; flex-direction: column; height: 100%; padding: 24px 32px;
    `;
  }

  public async render(): Promise<HTMLElement> {
    this.container.innerHTML = `
      <div style="flex: 1; display: flex; flex-direction: column; min-height: 0;">
        <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 24px; flex-shrink: 0;">
          <div>
            <h1 class="page-title">My Packs</h1>
            <p class="page-subtitle">Your personal, shareable configurations.</p>
          </div>
          
          <div style="display: flex; gap: 12px; align-items: center;">
            <input type="text" class="input-field" id="packs-search" placeholder="Search packs..." value="${this.esc(this.searchQuery)}" style="width: 250px;">
            <button id="btn-import-pack" class="btn btn-secondary" style="padding: 8px 16px;">Import .vpack</button>
            <button id="btn-create-pack" class="btn btn-primary" style="padding: 8px 16px;">+ Create Pack</button>
          </div>
        </div>

        <div id="cards-grid" style="
          flex: 1; overflow-y: auto; padding-right: 8px;
          display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 20px; align-content: start;
        "></div>
      </div>
    `;



    const searchInput = this.container.querySelector('#packs-search') as HTMLInputElement;
    searchInput?.addEventListener('input', (e: any) => {
      this.searchQuery = e.target.value.toLowerCase();
      this.renderGrid();
    });

    // Create Pack
    const createBtn = this.container.querySelector('#btn-create-pack');
    if (createBtn) {
      createBtn.addEventListener('click', () => {
        const modal = new PackCreatorModal(null, () => this.loadData());
        modal.show();
      });
    }

    const importBtn = this.container.querySelector('#btn-import-pack');
    if (importBtn) {
      importBtn.addEventListener('click', async () => {
        try {
          const res = await api.importPack();
          if (res) {
            NotificationToast.show('Pack imported successfully.', 'success');
            this.loadData();
          }
        } catch (e: any) {
          NotificationToast.show('Failed to import pack.', 'error');
        }
      });
    }

    await this.loadData();

    return this.container;
  }

  private async loadData() {
    this.isLoading = true;
    this.renderGrid(); // show loading

    try {
      const packs = await api.listPacks();
      this.allPacks = packs;
    } catch (e: any) {
      console.error('Failed to load packs:', e);
      NotificationToast.show('Failed to load packs.', 'error');
    }

    this.isLoading = false;
    this.renderGrid();
  }

  private renderGrid() {
    const grid = this.container.querySelector('#cards-grid') as HTMLElement;
    if (!grid) return;

    if (this.isLoading) {
      grid.innerHTML = `<div style="grid-column: 1 / -1; padding: 40px; text-align: center; color: var(--text-muted);"><span class="animate-pulse">Loading packs...</span></div>`;
      return;
    }

    let displayCards = this.allPacks;

    if (this.searchQuery) {
      displayCards = displayCards.filter(c => 
        c.name.toLowerCase().includes(this.searchQuery) ||
        c.description.toLowerCase().includes(this.searchQuery)
      );
    }

    if (displayCards.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 60px; text-align: center; background: var(--bg-card); border-radius: var(--radius-lg); border: 1px dashed var(--border-subtle);">
          <div style="font-size: 2.5rem; margin-bottom: 16px;">🎴</div>
          <h4 style="font-size: 1.2rem; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;">No packs found</h4>
          <p style="color: var(--text-muted);">Create a pack or import a .vpack file.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = '';
    for (const pack of displayCards) {
      grid.appendChild(this.buildCardElement(pack));
    }
  }

  private buildCardElement(pack: MyPack): HTMLElement {
    const el = document.createElement('div');
    el.className = 'card animate-fade-in-up hover-scale';
    el.style.cssText = `
      display: flex; flex-direction: column; background: var(--bg-card);
      border: 1px solid var(--border-subtle); border-radius: var(--radius-lg);
      overflow: hidden; cursor: pointer; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      position: relative;
    `;

    // Make it look a bit more "Minecraft slate"
    el.innerHTML = `
      <!-- Artwork / Header -->
      <div style="height: 120px; background: #1a1e23; position: relative; border-bottom: 2px solid var(--border-subtle);">
        ${pack.artwork 
          ? `<img src="${pack.artwork}" style="width: 100%; height: 100%; object-fit: cover; opacity: 0.8;" />`
          : `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; opacity: 0.3; font-size: 3rem;">📦</div>`
        }
        <div style="position: absolute; bottom: 0; left: 0; right: 0; padding: 12px; background: linear-gradient(transparent, rgba(0,0,0,0.8)); display: flex; justify-content: space-between; align-items: flex-end;">
          <span style="font-size: 0.75rem; font-weight: 800; padding: 2px 8px; border-radius: 4px; background: var(--bg-surface); color: var(--text-primary); border: 1px solid var(--border-subtle);">
            v${pack.packVersion}
          </span>
        </div>
      </div>
      
      <!-- Body -->
      <div style="padding: 16px; flex: 1; display: flex; flex-direction: column;">
        <h3 style="font-size: 1.15rem; font-weight: 800; color: var(--text-primary); margin-bottom: 4px; letter-spacing: -0.02em;">${this.esc(pack.name)}</h3>
        
        <p style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.5; flex: 1; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;">
          ${this.esc(pack.description)}
        </p>
        
        <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 16px;">
          <span style="font-size: 0.7rem; font-weight: 700; color: var(--text-muted); padding: 2px 6px; background: var(--bg-surface); border-radius: 4px;">MC ${pack.minecraftVersion}</span>
          <span style="font-size: 0.7rem; font-weight: 700; color: var(--text-muted); padding: 2px 6px; background: var(--bg-surface); border-radius: 4px;">${pack.loaderType}</span>
          <span style="font-size: 0.7rem; font-weight: 700; color: var(--text-muted); padding: 2px 6px; background: var(--bg-surface); border-radius: 4px;">${pack.mods.length} mods</span>
        </div>
      </div>
    `;

    el.onclick = () => this.showCardDetails(pack);

    // Hover effect adjustments
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

  // ── Pack Details Modal ──────────────────────────────────────────────────

  private showCardDetails(pack: MyPack) {
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

    let modsHtml = pack.mods.map(m => `
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

    if (pack.mods.length === 0) {
      modsHtml = `<div style="padding: 20px; text-align: center; color: var(--text-muted); background: var(--bg-surface); border-radius: var(--radius-md);">No mods included in this pack.</div>`;
    }

    modal.innerHTML = `
      <!-- Header / Banner -->
      <div style="height: 200px; background: #1a1e23; position: relative; border-bottom: 1px solid var(--border-subtle);">
        ${pack.artwork 
          ? `<img src="${pack.artwork}" style="width: 100%; height: 100%; object-fit: cover; opacity: 0.6;" />`
          : `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; opacity: 0.1; font-size: 5rem;">📦</div>`
        }
        <button id="cd-close" class="btn btn-secondary" style="position: absolute; top: 16px; right: 16px; padding: 6px 12px; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px); border: none;">✕ Close</button>
        
        <div style="position: absolute; bottom: 0; left: 0; right: 0; padding: 24px; background: linear-gradient(transparent, rgba(0,0,0,0.9));">
          <h2 style="font-size: 2rem; font-weight: 900; color: white; letter-spacing: -0.02em; margin-bottom: 4px; text-shadow: 0 2px 4px rgba(0,0,0,0.5);">${this.esc(pack.name)}</h2>
        </div>
      </div>

      <!-- Content area -->
      <div style="padding: 24px; flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 24px;">
        
        <!-- Action Bar -->
        <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 20px; border-bottom: 1px solid var(--border-subtle);">
          <div style="display: flex; gap: 12px;">
            <div style="background: var(--bg-surface); padding: 8px 16px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
              <div style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px;">Pack Version</div>
              <div style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary);">${pack.packVersion}</div>
            </div>
            <div style="background: var(--bg-surface); padding: 8px 16px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
              <div style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px;">Game</div>
              <div style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary);">MC ${pack.minecraftVersion}</div>
            </div>
            <div style="background: var(--bg-surface); padding: 8px 16px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
              <div style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px;">Loader</div>
              <div style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary); text-transform: capitalize;">${pack.loaderType} ${pack.loaderVersion}</div>
            </div>
            
            <div style="display: flex; gap: 8px; align-items: center; border-left: 1px solid var(--border-subtle); padding-left: 12px;">
              <button id="cd-edit" class="btn btn-secondary" style="padding: 6px 12px;">Edit</button>
              <button id="cd-export" class="btn btn-secondary" style="padding: 6px 12px;">Export JSON</button>
              <button id="cd-delete" class="btn btn-secondary" style="color: #ef4444; border-color: #ef444430; padding: 6px 12px;">Delete</button>
            </div>
          </div>
          
          <div style="display: flex; gap: 12px; align-items: center;">
             <button id="cd-install" class="btn btn-primary" style="padding: 10px 24px; font-size: 1rem;">Install Pack</button>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 32px;">
          <!-- Left Col -->
          <div style="display: flex; flex-direction: column; gap: 24px;">
            <div>
              <h4 style="font-size: 1rem; font-weight: 800; color: var(--text-primary); margin-bottom: 12px; border-left: 3px solid var(--accent-primary); padding-left: 10px;">Description</h4>
              <p style="font-size: 0.9rem; color: var(--text-secondary); line-height: 1.6; white-space: pre-wrap;">${this.esc(pack.description)}</p>
            </div>
            
            <div>
              <h4 style="font-size: 1rem; font-weight: 800; color: var(--text-primary); margin-bottom: 12px; border-left: 3px solid var(--accent-primary); padding-left: 10px;">Included Content (${pack.mods.length})</h4>
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
                    <div style="color: var(--text-muted); margin-bottom: 2px;">Created</div>
                    <div style="color: var(--text-primary); font-weight: 600;">${new Date(pack.createdAt).toLocaleDateString()}</div>
                  </div>
                </div>
             </div>
          </div>
        </div>
        
        <!-- Progress Bar (hidden by default) -->
        <div id="cd-progress-container" style="display: none; flex-direction: column; gap: 8px; margin-top: 16px; padding: 16px; background: var(--bg-surface); border-radius: var(--radius-md); border: 1px solid var(--border-accent);">
          <div style="display: flex; justify-content: space-between; font-size: 0.85rem; font-weight: 600;">
            <span id="cd-progress-text" style="color: var(--text-primary);">Preparing to install...</span>
            <span id="cd-progress-pct" style="color: var(--accent-primary);">0%</span>
          </div>
          <div style="height: 6px; background: var(--bg-card); border-radius: 3px; overflow: hidden;">
            <div id="cd-progress-bar" style="height: 100%; width: 0%; background: var(--accent-gradient); transition: width 0.2s;"></div>
          </div>
        </div>

      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Close logic
    const closeOverlay = (e?: MouseEvent) => {
      if (e && e.target !== overlay) return;
      overlay.remove();
    };
    overlay.onclick = closeOverlay;
    modal.querySelector('#cd-close')!.addEventListener('click', () => overlay.remove());

    // Install logic
    const installBtn = modal.querySelector('#cd-install') as HTMLButtonElement | null;
    if (installBtn) {
      installBtn.onclick = async () => {
        installBtn.disabled = true;
        installBtn.textContent = 'Installing...';
        
        const progContainer = modal.querySelector('#cd-progress-container') as HTMLElement;
        const progText = modal.querySelector('#cd-progress-text') as HTMLElement;
        const progBar = modal.querySelector('#cd-progress-bar') as HTMLElement;
        const progPct = modal.querySelector('#cd-progress-pct') as HTMLElement;
        
        progContainer.style.display = 'flex';
        progText.textContent = 'Creating instance...';
        progBar.style.width = '10%';
        progPct.textContent = '10%';

        try {
          const res = await api.installPack(pack.id);
          
          if (res.success) {
            progText.textContent = 'Downloading content...';
            progBar.style.width = '50%';
            progPct.textContent = '50%';
            
            // Wait a moment for UI to update
            await new Promise(resolve => setTimeout(resolve, 500));
            
            progText.textContent = 'Installation complete!';
            progBar.style.width = '100%';
            progPct.textContent = '100%';
            
            NotificationToast.show(`Pack "${pack.name}" installed successfully!`, 'success');
            
            setTimeout(() => {
              overlay.remove();
              // Navigate to instances page
              (window as any).navigateTo?.('instances');
            }, 1500);
          } else {
            progText.textContent = 'Installation failed';
            progBar.style.backgroundColor = '#ef4444';
            NotificationToast.show(`Failed to install pack: ${res.error}`, 'error');
            installBtn.disabled = false;
            installBtn.textContent = 'Install Pack';
          }
        } catch (e: any) {
          progText.textContent = 'Installation failed';
          progBar.style.backgroundColor = '#ef4444';
          NotificationToast.show(`Failed to install pack: ${e.message}`, 'error');
          installBtn.disabled = false;
          installBtn.textContent = 'Install Pack';
        }
      };
    }

    // Actions
    modal.querySelector('#cd-edit')?.addEventListener('click', () => {
      overlay.remove();
      const creator = new PackCreatorModal(pack as any, () => this.loadData());
      creator.show();
    });

    modal.querySelector('#cd-export')?.addEventListener('click', async () => {
      try {
        const ok = await api.exportPack(pack.id);
        if (ok) NotificationToast.show('Pack exported successfully.', 'success');
      } catch (e: any) {
        NotificationToast.show('Failed to export pack.', 'error');
      }
    });

    modal.querySelector('#cd-delete')?.addEventListener('click', async () => {
      if (!confirm('Permanently delete this pack?')) return;
      try {
        const res = await api.deletePack(pack.id);
        if (res.success) {
          NotificationToast.show('Pack deleted.', 'success');
          overlay.remove();
          this.loadData();
        }
      } catch (e: any) {
        NotificationToast.show('Failed to delete pack.', 'error');
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
