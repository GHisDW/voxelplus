import { api } from '../services/api';
import { MyPack } from '../../../electron/types';
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
            <p class="page-subtitle">Portable user .vpack files and exported instance configurations.</p>
          </div>
          
          <div style="display: flex; gap: 12px; align-items: center;">
            <input type="text" class="input-field" id="packs-search" placeholder="Search my packs..." value="${this.esc(this.searchQuery)}" style="width: 250px;">
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
          } else {
            NotificationToast.show('Failed to import pack. Check format or Modrinth references.', 'error');
          }
        } catch (e: any) {
          NotificationToast.show(describeIpcError(e), 'error');
        }
      });
    }

    await this.loadData();

    return this.container;
  }

  private async loadData() {
    this.isLoading = true;
    this.renderGrid();

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
          <div style="font-size: 2.5rem; margin-bottom: 16px;">📦</div>
          <h4 style="font-size: 1.2rem; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;">No user packs found</h4>
          <p style="color: var(--text-muted);">Create a pack or import a portable .vpack file.</p>
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

    const totalMods = pack.mods?.length || 0;
    const totalResourcePacks = pack.resourcePacks?.length || 0;
    const totalShaders = pack.shaderPacks?.length || 0;
    const unresolvedCount = (pack.mods || []).filter(m => m.unresolved).length;

    el.innerHTML = `
      <!-- Instance Header -->
      <div style="padding: 16px; background: var(--bg-surface); border-bottom: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: center;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 1.2rem;">📦</span>
          <span style="font-size: 0.75rem; font-weight: 800; padding: 2px 8px; border-radius: 4px; background: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border-subtle);">
            .vpack v${pack.packVersion}
          </span>
        </div>
        ${unresolvedCount > 0 ? `
          <span style="font-size: 0.7rem; font-weight: 800; padding: 2px 8px; border-radius: 4px; background: #f59e0b20; color: #f59e0b; border: 1px solid #f59e0b40;">
            ${unresolvedCount} UNRESOLVED
          </span>
        ` : ''}
      </div>
      
      <!-- Body -->
      <div style="padding: 16px; flex: 1; display: flex; flex-direction: column;">
        <h3 style="font-size: 1.15rem; font-weight: 800; color: var(--text-primary); margin-bottom: 4px; letter-spacing: -0.02em;">${this.esc(pack.name)}</h3>
        
        <p style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.5; flex: 1; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin-bottom: 12px;">
          ${this.esc(pack.description || 'User exported instance configuration')}
        </p>
        
        <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: auto;">
          <span style="font-size: 0.7rem; font-weight: 700; color: var(--text-muted); padding: 2px 6px; background: var(--bg-surface); border-radius: 4px;">MC ${pack.minecraftVersion}</span>
          <span style="font-size: 0.7rem; font-weight: 700; color: var(--text-muted); padding: 2px 6px; background: var(--bg-surface); border-radius: 4px;">${pack.loaderType}</span>
          <span style="font-size: 0.7rem; font-weight: 700; color: var(--text-muted); padding: 2px 6px; background: var(--bg-surface); border-radius: 4px;">${totalMods} mods</span>
          ${totalResourcePacks > 0 ? `<span style="font-size: 0.7rem; font-weight: 700; color: var(--text-muted); padding: 2px 6px; background: var(--bg-surface); border-radius: 4px;">${totalResourcePacks} resource packs</span>` : ''}
          ${totalShaders > 0 ? `<span style="font-size: 0.7rem; font-weight: 700; color: var(--text-muted); padding: 2px 6px; background: var(--bg-surface); border-radius: 4px;">${totalShaders} shaders</span>` : ''}
        </div>
      </div>
    `;

    el.onclick = () => this.showCardDetails(pack);

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

  // ── Technical Instance Details Modal ──────────────────────────────────────

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

    let modsHtml = (pack.mods || []).map(m => `
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-md);">
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 0.85rem; font-weight: 700; color: var(--text-primary);">${this.esc(m.projectName)}</span>
          <span style="font-size: 0.75rem; color: var(--text-muted);">${m.versionName || m.filename}</span>
        </div>
        ${m.unresolved ? `
          <span style="font-size: 0.7rem; font-weight: 700; color: #f59e0b; padding: 2px 6px; background: #f59e0b15; border-radius: 4px;">Unresolved</span>
        ` : `
          <span style="font-size: 0.7rem; font-weight: 700; color: #10b981;">Modrinth</span>
        `}
      </div>
    `).join('');

    if (!pack.mods || pack.mods.length === 0) {
      modsHtml = `<div style="padding: 16px; text-align: center; color: var(--text-muted); background: var(--bg-surface); border-radius: var(--radius-md);">No mods included in this .vpack.</div>`;
    }

    modal.innerHTML = `
      <!-- Technical Instance Header -->
      <div style="padding: 24px; background: var(--bg-surface); border-bottom: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 6px;">
            <span style="font-size: 1.5rem;">📦</span>
            <h2 style="font-size: 1.5rem; font-weight: 900; color: var(--text-primary); letter-spacing: -0.02em;">${this.esc(pack.name)}</h2>
          </div>
          <p style="font-size: 0.9rem; color: var(--text-secondary); line-height: 1.5;">${this.esc(pack.description || 'Portable Minecraft Instance File')}</p>
        </div>
        <button id="cd-close" class="btn btn-secondary" style="padding: 6px 12px;">✕ Close</button>
      </div>

      <!-- Technical Specifications & Content -->
      <div style="padding: 24px; flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 24px;">
        
        <!-- Spec Badges -->
        <div style="display: flex; gap: 12px; flex-wrap: wrap; padding-bottom: 16px; border-bottom: 1px solid var(--border-subtle);">
          <div style="background: var(--bg-surface); padding: 8px 16px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
            <div style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase;">Minecraft Version</div>
            <div style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary);">${pack.minecraftVersion}</div>
          </div>
          <div style="background: var(--bg-surface); padding: 8px 16px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
            <div style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase;">Mod Loader</div>
            <div style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary); text-transform: capitalize;">${pack.loaderType} ${pack.loaderVersion}</div>
          </div>
          <div style="background: var(--bg-surface); padding: 8px 16px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
            <div style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase;">Mods Count</div>
            <div style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary);">${pack.mods?.length || 0}</div>
          </div>
          <div style="background: var(--bg-surface); padding: 8px 16px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
            <div style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase;">VPack Version</div>
            <div style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary);">v${pack.packVersion}</div>
          </div>
        </div>

        <!-- Mods List -->
        <div>
          <h4 style="font-size: 0.95rem; font-weight: 800; color: var(--text-primary); margin-bottom: 12px;">Mod Dependencies (${pack.mods?.length || 0})</h4>
          <div style="display: flex; flex-direction: column; gap: 6px; max-height: 240px; overflow-y: auto;">
            ${modsHtml}
          </div>
        </div>
        
        <!-- Action Bar -->
        <div style="display: flex; justify-content: space-between; align-items: center; pt-16; border-top: 1px solid var(--border-subtle);">
          <div style="display: flex; gap: 8px;">
            <button id="cd-export" class="btn btn-secondary" style="padding: 6px 12px;">Export .vpack</button>
            <button id="cd-delete" class="btn btn-secondary" style="color: #ef4444; border-color: #ef444430; padding: 6px 12px;">Delete</button>
          </div>

          <button id="cd-install" class="btn btn-primary" style="padding: 10px 24px; font-size: 1rem;">Import as Instance</button>
        </div>

        <!-- Progress Indicator -->
        <div id="cd-progress-container" style="display: none; align-items: center; justify-content: space-between; padding: 16px; background: var(--bg-surface); border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
          <div style="display: flex; align-items: center; gap: 12px;">
            <span id="cd-spinner" class="animate-spin" style="font-size: 1.2rem;">⏳</span>
            <span id="cd-progress-text" style="font-size: 0.9rem; font-weight: 600; color: var(--text-primary);">Creating instance...</span>
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
        installBtn.textContent = 'Importing...';
        
        const progContainer = modal.querySelector('#cd-progress-container') as HTMLElement;
        const progText = modal.querySelector('#cd-progress-text') as HTMLElement;
        const spinner = modal.querySelector('#cd-spinner') as HTMLElement;
        
        progContainer.style.display = 'flex';
        progText.textContent = 'Creating instance and resolving Modrinth dependencies...';

        try {
          const res = await api.installPack(pack.id);
          
          if (res.success) {
            spinner.textContent = '✅';
            spinner.className = '';
            progText.textContent = `Instance created successfully (${res.successCount || pack.mods.length} items)!`;
            NotificationToast.show(`Instance created from .vpack successfully!`, 'success');
            
            setTimeout(() => {
              overlay.remove();
              (window as any).navigateTo?.('instances');
            }, 1200);
          } else {
            spinner.textContent = '❌';
            spinner.className = '';
            progText.style.color = '#ef4444';
            progText.textContent = res.error || 'Instance creation failed';
            NotificationToast.show(`Failed to import pack: ${res.error}`, 'error');
            installBtn.disabled = false;
            installBtn.textContent = 'Import as Instance';
          }
        } catch (e: any) {
          spinner.textContent = '❌';
          spinner.className = '';
          progText.style.color = '#ef4444';
          progText.textContent = describeIpcError(e);
          NotificationToast.show(`Failed to import pack: ${describeIpcError(e)}`, 'error');
          installBtn.disabled = false;
          installBtn.textContent = 'Import as Instance';
        }
      };
    }

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
