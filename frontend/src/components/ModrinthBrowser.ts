import { InstanceMetadata, ModrinthProject } from '../../../electron/types';
import { api } from '../services/api';
import { NotificationToast } from './NotificationToast';

export class ModrinthBrowser {
  private container: HTMLElement;
  private selectedInstance: InstanceMetadata | null = null;
  private instances: InstanceMetadata[] = [];
  private searchQuery: string = '';
  private activeType: 'mod' | 'resourcepack' | 'shader' = 'mod';
  private debounceTimer: any = null;

  constructor(initialInstance?: InstanceMetadata) {
    this.selectedInstance = initialInstance || null;
    this.container = document.createElement('div');
    this.container.className = 'animate-fade-in';
  }

  public async render(): Promise<HTMLElement> {
    this.instances = await api.listInstances();
    if (!this.selectedInstance && this.instances.length > 0) {
      this.selectedInstance = this.instances[0];
    }

    this.container.innerHTML = `
      <!-- Header Controls -->
      <div style="display: flex; flex-direction: column; gap: 16px; margin-bottom: 24px;">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px;">
          <div>
            <h2 style="font-size: 1.5rem; font-weight: 800; color: var(--text-primary);">Discover Content on Modrinth</h2>
            <p style="font-size: 0.88rem; color: var(--text-secondary); margin-top: 2px;">
              Search and 1-click install compatible mods, shaders, and resource packs.
            </p>
          </div>

          <!-- Target Instance Selector -->
          <div style="display: flex; align-items: center; gap: 10px; background: var(--bg-surface); padding: 6px 14px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
            <span style="font-size: 0.84rem; font-weight: 600; color: var(--text-muted);">Target:</span>
            <select class="select-field" id="modrinth-inst-select" style="padding: 4px 10px; border: none; background: transparent; font-weight: 700; width: 180px;">
              ${this.instances.map(i => `<option value="${i.id}" ${this.selectedInstance?.id === i.id ? 'selected' : ''}>${i.name} (${i.minecraft.version})</option>`).join('')}
            </select>
          </div>
        </div>

        <!-- Search Bar & Type Filters -->
        <div style="display: flex; gap: 12px; align-items: center;">
          <input type="text" class="input-field" id="modrinth-search-input" placeholder="Search mods (e.g. Sodium, Iris, Lithium, Fabric API)..." value="${this.searchQuery}" style="flex: 1;" />
          
          <div style="display: flex; gap: 6px;">
            <button class="btn ${this.activeType === 'mod' ? 'btn-primary' : 'btn-secondary'}" data-type="mod">Mods</button>
            <button class="btn ${this.activeType === 'resourcepack' ? 'btn-primary' : 'btn-secondary'}" data-type="resourcepack">Resource Packs</button>
            <button class="btn ${this.activeType === 'shader' ? 'btn-primary' : 'btn-secondary'}" data-type="shader">Shaders</button>
          </div>
        </div>
      </div>

      <!-- Projects Grid/List -->
      <div id="modrinth-results" style="display: flex; flex-direction: column; gap: 12px;"></div>
    `;

    // Instance switch listener
    const instSelect = this.container.querySelector('#modrinth-inst-select') as HTMLSelectElement;
    instSelect.onchange = () => {
      this.selectedInstance = this.instances.find(i => i.id === instSelect.value) || null;
      this.performSearch();
    };

    // Type filter buttons
    this.container.querySelectorAll('[data-type]').forEach(btn => {
      (btn as HTMLElement).onclick = () => {
        this.activeType = btn.getAttribute('data-type') as any;
        this.render();
      };
    });

    // Search input with debounce
    const searchInput = this.container.querySelector('#modrinth-search-input') as HTMLInputElement;
    searchInput.oninput = (e: any) => {
      this.searchQuery = e.target.value;
      clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => this.performSearch(), 300);
    };

    await this.performSearch();
    return this.container;
  }

  private async performSearch(): Promise<void> {
    const resultsContainer = this.container.querySelector('#modrinth-results') as HTMLElement;
    if (!resultsContainer) return;

    resultsContainer.innerHTML = `
      <div style="padding: 40px; text-align: center; color: var(--text-muted);">
        <span class="animate-pulse">Searching Modrinth repository...</span>
      </div>
    `;

    const mcVer = this.selectedInstance ? this.selectedInstance.minecraft.version : undefined;
    const loader = this.selectedInstance ? this.selectedInstance.loader.type : 'fabric';

    const searchRes = await api.searchModrinth({
      query: this.searchQuery || undefined,
      projectType: this.activeType,
      minecraftVersion: mcVer,
      loader: this.activeType === 'mod' ? loader : undefined,
      limit: 25
    });

    resultsContainer.innerHTML = '';

    if (searchRes.hits.length === 0) {
      resultsContainer.innerHTML = `
        <div style="padding: 48px; text-align: center; background: var(--bg-card); border-radius: var(--radius-lg); border: 1px dashed var(--border-subtle);">
          <h4 style="font-size: 1.1rem; font-weight: 700; color: var(--text-primary); margin-bottom: 6px;">No projects found</h4>
          <p style="color: var(--text-muted); font-size: 0.9rem;">Try a different keyword or check version filters.</p>
        </div>
      `;
      return;
    }

    searchRes.hits.forEach(project => {
      const card = document.createElement('div');
      card.className = 'horizontal-card animate-fade-in-up';
      card.style.cssText = `
        display: flex;
        align-items: center;
        gap: 18px;
        padding: 16px 20px;
        background: var(--bg-card);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-lg);
      `;

      card.innerHTML = `
        <!-- Icon -->
        <div style="
          width: 52px;
          height: 52px;
          border-radius: var(--radius-md);
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          overflow: hidden;
        ">
          ${project.icon_url
            ? `<img src="${project.icon_url}" width="48" height="48" style="border-radius: 8px; object-fit: cover;" />`
            : `<span style="font-size: 1.5rem;">📦</span>`
          }
        </div>

        <!-- Info -->
        <div style="flex: 1; min-width: 0;">
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <h4 style="font-size: 1.1rem; font-weight: 700; color: var(--text-primary);">${this.escapeHtml(project.title)}</h4>
            <span style="font-size: 0.8rem; color: var(--text-muted);">by ${this.escapeHtml(project.author)}</span>
            <span class="badge" style="font-size: 0.72rem;">⬇ ${this.formatDownloads(project.downloads)}</span>
          </div>
          <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 4px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
            ${this.escapeHtml(project.description)}
          </p>
        </div>

        <!-- Install Button -->
        <div style="flex-shrink: 0;">
          <button class="btn btn-primary btn-install" style="min-width: 110px;">
            Install
          </button>
        </div>
      `;

      const installBtn = card.querySelector('.btn-install') as HTMLButtonElement;
      installBtn.onclick = async () => {
        if (!this.selectedInstance) {
          NotificationToast.show('Please select a target instance first.', 'warning');
          return;
        }

        installBtn.disabled = true;
        installBtn.textContent = 'Checking...';

        try {
          // Fetch compatible versions
          const versions = await api.getModrinthVersions(
            project.id,
            this.activeType === 'mod' ? [this.selectedInstance.loader.type] : undefined,
            [this.selectedInstance.minecraft.version]
          );

          if (versions.length === 0) {
            // Try broader lookup
            const allVersions = await api.getModrinthVersions(project.id);
            if (allVersions.length === 0) {
              NotificationToast.show(`No downloadable files found for ${project.title}.`, 'error');
              installBtn.disabled = false;
              installBtn.textContent = 'Install';
              return;
            }
            const targetVersion = allVersions[0];
            const primaryFile = targetVersion.files.find(f => f.primary) || targetVersion.files[0];

            installBtn.textContent = 'Downloading...';
            const res = await api.installModrinthContent(
              this.selectedInstance.id,
              primaryFile.url,
              primaryFile.filename,
              project.title,
              this.activeType
            );

            if (res.success) {
              NotificationToast.show(`Installed "${project.title}" to ${this.selectedInstance.name}!`, 'success');
              installBtn.textContent = '✓ Installed';
              installBtn.className = 'btn btn-secondary';
            } else {
              NotificationToast.show(`Installation failed: ${res.error}`, 'error');
              installBtn.disabled = false;
              installBtn.textContent = 'Install';
            }
            return;
          }

          const targetVersion = versions[0];
          const primaryFile = targetVersion.files.find(f => f.primary) || targetVersion.files[0];

          installBtn.textContent = 'Downloading...';
          const res = await api.installModrinthContent(
            this.selectedInstance.id,
            primaryFile.url,
            primaryFile.filename,
            project.title,
            this.activeType
          );

          if (res.success) {
            NotificationToast.show(`Installed "${project.title}" to ${this.selectedInstance.name}!`, 'success');
            installBtn.textContent = '✓ Installed';
            installBtn.className = 'btn btn-secondary';
          } else {
            NotificationToast.show(`Installation failed: ${res.error}`, 'error');
            installBtn.disabled = false;
            installBtn.textContent = 'Install';
          }
        } catch (e: any) {
          NotificationToast.show(`Error: ${e.message}`, 'error');
          installBtn.disabled = false;
          installBtn.textContent = 'Install';
        }
      };

      resultsContainer.appendChild(card);
    });
  }

  private formatDownloads(count: number): string {
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
    if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
    return String(count);
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
