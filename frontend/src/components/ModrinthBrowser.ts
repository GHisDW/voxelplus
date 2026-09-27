/**
 * ModrinthBrowser — extended to support Modrinth + CurseForge in a single UI.
 *
 * Provider filter: All | Modrinth | CurseForge
 * Each result shows its provider badge clearly.
 * Version/file selection modal before install.
 * Uses the instance's Minecraft version + loader for compatibility filtering.
 *
 * Modrinth behavior is completely preserved; CurseForge is additive.
 */

import { InstanceMetadata, ModrinthProject, ModrinthVersion, ContentProject, ContentVersion, ContentFile } from '../../../electron/types';
import { api } from '../services/api';
import { NotificationToast } from './NotificationToast';
import { describeIpcError } from '../services/errors';

type Provider = 'all' | 'modrinth' | 'curseforge';
type ContentType = 'mod' | 'resourcepack' | 'shader';

/**
 * Normalized display shape for results from either provider.
 */
interface DisplayProject {
  provider: 'modrinth' | 'curseforge';
  id: string;
  name: string;
  description: string;
  author: string;
  iconUrl: string | null;
  downloads: number;
  /** Raw Modrinth project — present only for modrinth results */
  modrinthRaw?: ModrinthProject;
  /** Raw ContentProject — present only for curseforge results */
  cfRaw?: ContentProject;
}

export class ModrinthBrowser {
  private container: HTMLElement;
  private selectedInstance: InstanceMetadata | null = null;
  private instances: InstanceMetadata[] = [];
  private searchQuery: string = '';
  private activeType: ContentType = 'mod';
  private activeProvider: Provider = 'all';
  private debounceTimer: any = null;
  private cfConfigured: boolean = false;

  constructor(initialInstance?: InstanceMetadata) {
    this.selectedInstance = initialInstance || null;
    this.container = document.createElement('div');
    this.container.className = 'animate-fade-in';
  }

  public async render(): Promise<HTMLElement> {
    this.instances = await api.listInstances();
    this.cfConfigured = await api.isCurseForgeConfigured().catch(() => false);

    if (!this.selectedInstance && this.instances.length > 0) {
      this.selectedInstance = this.instances[0]!;
    }

    this.container.innerHTML = `
      <!-- Header Controls -->
      <div style="display: flex; flex-direction: column; gap: 16px; margin-bottom: 24px;">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px;">
          <div>
            <h2 style="font-size: 1.5rem; font-weight: 800; color: var(--text-primary);">Mod Browser</h2>
            <p style="font-size: 0.88rem; color: var(--text-secondary); margin-top: 2px;">
              Search and install content from Modrinth and CurseForge.
            </p>
          </div>

          <!-- Target Instance Selector -->
          <div style="display: flex; align-items: center; gap: 10px; background: var(--bg-surface); padding: 6px 14px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
            <span style="font-size: 0.84rem; font-weight: 600; color: var(--text-muted);">Target:</span>
            <select class="select-field" id="mb-inst-select" style="padding: 4px 10px; border: none; background: transparent; font-weight: 700; width: 200px;">
              ${this.instances.map(i => `<option value="${i.id}" ${this.selectedInstance?.id === i.id ? 'selected' : ''}>${this.esc(i.name)} (${i.minecraft.version})</option>`).join('')}
            </select>
          </div>
        </div>

        <!-- Provider Tabs + Content Type Tabs -->
        <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
          <!-- Provider selection -->
          <div style="display: flex; gap: 4px; background: var(--bg-surface); border-radius: var(--radius-md); padding: 4px; border: 1px solid var(--border-subtle);">
            ${this.providerTab('all', '⬡ All')}
            ${this.providerTab('modrinth', '🟢 Modrinth')}
            ${this.providerTab('curseforge', `🔶 CurseForge${!this.cfConfigured ? ' (no key)' : ''}`)}
          </div>

          <!-- Content type buttons -->
          <div style="display: flex; gap: 6px;">
            ${this.typeBtn('mod', 'Mods')}
            ${this.typeBtn('resourcepack', 'Resource Packs')}
            ${this.typeBtn('shader', 'Shaders')}
          </div>

          <div style="flex: 1; min-width: 200px;">
            <input type="text" class="input-field" id="mb-search-input"
              placeholder="Search ${this.activeType === 'mod' ? 'mods' : this.activeType === 'resourcepack' ? 'resource packs' : 'shaders'}..."
              value="${this.esc(this.searchQuery)}"
              style="width: 100%;" />
          </div>
        </div>
      </div>

      <!-- Results -->
      <div id="mb-results" style="display: flex; flex-direction: column; gap: 10px;"></div>
    `;

    // Instance switch
    const instSelect = this.container.querySelector('#mb-inst-select') as HTMLSelectElement;
    instSelect?.addEventListener('change', () => {
      this.selectedInstance = this.instances.find(i => i.id === instSelect.value) || null;
      this.performSearch();
    });

    // Provider tabs
    this.container.querySelectorAll('[data-provider]').forEach(btn => {
      (btn as HTMLElement).onclick = () => {
        this.activeProvider = btn.getAttribute('data-provider') as Provider;
        this.render();
      };
    });

    // Type buttons
    this.container.querySelectorAll('[data-type]').forEach(btn => {
      (btn as HTMLElement).onclick = () => {
        this.activeType = btn.getAttribute('data-type') as ContentType;
        this.render();
      };
    });

    // Search input
    const searchInput = this.container.querySelector('#mb-search-input') as HTMLInputElement;
    searchInput?.addEventListener('input', (e: any) => {
      this.searchQuery = e.target.value;
      clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => this.performSearch(), 350);
    });

    await this.performSearch();
    return this.container;
  }

  // ── Search ───────────────────────────────────────────────────────────────

  private async performSearch(): Promise<void> {
    const resultsContainer = this.container.querySelector('#mb-results') as HTMLElement;
    if (!resultsContainer) return;

    resultsContainer.innerHTML = `
      <div style="padding: 40px; text-align: center; color: var(--text-muted);">
        <span class="animate-pulse">Searching...</span>
      </div>
    `;

    const mcVer = this.selectedInstance?.minecraft?.version;
    const loader = this.selectedInstance?.loader?.type ?? 'fabric';

    const results: DisplayProject[] = [];

    const runModrinth = this.activeProvider === 'all' || this.activeProvider === 'modrinth';
    const runCurseForge = (this.activeProvider === 'all' || this.activeProvider === 'curseforge') && this.activeType === 'mod';

    const [modrinthHits, cfResult] = await Promise.all([
      runModrinth
        ? api.searchModrinth({
            query: this.searchQuery || undefined,
            projectType: this.activeType,
            minecraftVersion: mcVer,
            loader: this.activeType === 'mod' ? loader : undefined,
            limit: 20,
          }).catch(() => ({ hits: [], total_hits: 0 }))
        : Promise.resolve({ hits: [], total_hits: 0 }),

      runCurseForge
        ? api.searchCurseForge({
            query: this.searchQuery || undefined,
            minecraftVersion: mcVer,
            loader,
            limit: 20,
          }).catch(() => ({ success: false, unconfigured: false }))
        : Promise.resolve({ success: false }),
    ]);

    // Modrinth results
    for (const h of modrinthHits.hits) {
      results.push({
        provider: 'modrinth',
        id: h.id,
        name: h.title,
        description: h.description,
        author: h.author,
        iconUrl: h.icon_url ?? null,
        downloads: h.downloads,
        modrinthRaw: h,
      });
    }

    // CurseForge results (only for mods)
    if (runCurseForge) {
      if ((cfResult as any).unconfigured) {
        resultsContainer.innerHTML = '';
        this.renderCurseForgeUnconfigured(resultsContainer);
        return;
      }
      if ((cfResult as any).success && (cfResult as any).data) {
        for (const p of (cfResult as any).data.projects as ContentProject[]) {
          results.push({
            provider: 'curseforge',
            id: p.providerProjectId,
            name: p.name,
            description: p.description,
            author: p.author,
            iconUrl: p.iconUrl,
            downloads: p.downloads,
            cfRaw: p,
          });
        }
      }
    }

    resultsContainer.innerHTML = '';

    if (results.length === 0) {
      resultsContainer.innerHTML = `
        <div style="padding: 48px; text-align: center; background: var(--bg-card); border-radius: var(--radius-lg); border: 1px dashed var(--border-subtle);">
          <div style="font-size: 2rem; margin-bottom: 12px;">🔍</div>
          <h4 style="font-size: 1.1rem; font-weight: 700; color: var(--text-primary); margin-bottom: 6px;">No results found</h4>
          <p style="color: var(--text-muted); font-size: 0.9rem;">Try a different keyword or adjust version/loader filters.</p>
        </div>
      `;
      return;
    }

    for (const project of results) {
      resultsContainer.appendChild(this.buildResultCard(project));
    }
  }

  // ── Result Card ───────────────────────────────────────────────────────────

  private buildResultCard(project: DisplayProject): HTMLElement {
    const isModrinth = project.provider === 'modrinth';
    const providerColor = isModrinth ? '#10b981' : '#f97316';
    const providerLabel = isModrinth ? 'MODRINTH' : 'CURSEFORGE';

    const card = document.createElement('div');
    card.className = 'mb-result-card animate-fade-in-up';
    card.style.cssText = `
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 14px 18px;
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-lg);
      transition: border-color 0.15s, background 0.15s;
      cursor: default;
    `;

    card.innerHTML = `
      <!-- Icon -->
      <div style="width: 50px; height: 50px; border-radius: var(--radius-md); background: var(--bg-surface);
        border: 1px solid var(--border-subtle); display: flex; align-items: center; justify-content: center;
        flex-shrink: 0; overflow: hidden;">
        ${project.iconUrl
          ? `<img src="${project.iconUrl}" width="46" height="46" style="border-radius: 8px; object-fit: cover;" loading="lazy" />`
          : `<span style="font-size: 1.4rem;">📦</span>`}
      </div>

      <!-- Info -->
      <div style="flex: 1; min-width: 0;">
        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 3px;">
          <!-- Provider badge -->
          <span style="
            font-size: 0.68rem;
            font-weight: 800;
            letter-spacing: 0.06em;
            color: ${providerColor};
            background: ${providerColor}18;
            border: 1px solid ${providerColor}40;
            border-radius: 4px;
            padding: 1px 6px;
          ">${providerLabel}</span>
          <h4 style="font-size: 1.05rem; font-weight: 700; color: var(--text-primary);">${this.esc(project.name)}</h4>
          <span style="font-size: 0.8rem; color: var(--text-muted);">by ${this.esc(project.author)}</span>
          <span class="badge" style="font-size: 0.72rem;">⬇ ${this.fmtDl(project.downloads)}</span>
        </div>
        <p style="font-size: 0.84rem; color: var(--text-secondary); line-height: 1.4;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
          ${this.esc(project.description)}
        </p>
      </div>

      <!-- Actions -->
      <div style="flex-shrink: 0; display: flex; gap: 8px; align-items: center;">
        <button class="btn btn-secondary btn-versions" style="min-width: 90px; font-size: 0.82rem;">
          Versions
        </button>
        <button class="btn btn-primary btn-install" style="min-width: 90px;">
          Install
        </button>
      </div>
    `;

    // Hover effect
    card.addEventListener('mouseenter', () => {
      card.style.borderColor = 'var(--border-hover)';
      card.style.background = 'var(--bg-card-hover)';
    });
    card.addEventListener('mouseleave', () => {
      card.style.borderColor = 'var(--border-subtle)';
      card.style.background = 'var(--bg-card)';
    });

    const versionsBtn = card.querySelector('.btn-versions') as HTMLButtonElement;
    const installBtn = card.querySelector('.btn-install') as HTMLButtonElement;

    // Versions button — opens version picker
    versionsBtn.onclick = () => this.openVersionPicker(project, card);

    // Install button — one-click install (best compatible version)
    installBtn.onclick = () => this.quickInstall(project, installBtn);

    return card;
  }

  // ── Quick Install ─────────────────────────────────────────────────────────

  private async quickInstall(project: DisplayProject, btn: HTMLButtonElement): Promise<void> {
    if (!this.selectedInstance) {
      NotificationToast.show('Select a target instance first.', 'warning');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Checking...';

    try {
      const file = await this.getBestFile(project);
      if (!file) {
        NotificationToast.show(`No compatible version found for ${project.name}.`, 'error');
        btn.disabled = false;
        btn.textContent = 'Install';
        return;
      }

      btn.textContent = 'Downloading...';
      const res = await this.downloadFile(file, project.name);
      if (res.success) {
        NotificationToast.show(`Installed "${project.name}" to ${this.selectedInstance.name}!`, 'success');
        btn.textContent = '✓ Installed';
        btn.className = 'btn btn-secondary';
      } else {
        NotificationToast.show(`Install failed: ${res.error}`, 'error');
        btn.disabled = false;
        btn.textContent = 'Install';
      }
    } catch (e: any) {
      NotificationToast.show(describeIpcError(e), 'error');
      btn.disabled = false;
      btn.textContent = 'Install';
    }
  }

  // ── Version Picker ────────────────────────────────────────────────────────

  private async openVersionPicker(project: DisplayProject, _card: HTMLElement): Promise<void> {
    if (!this.selectedInstance) {
      NotificationToast.show('Select a target instance first.', 'warning');
      return;
    }

    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 800;
      display: flex; align-items: center; justify-content: center;
    `;

    const modal = document.createElement('div');
    modal.style.cssText = `
      background: var(--bg-modal); border-radius: var(--radius-xl);
      border: 1px solid var(--border-subtle); padding: 28px;
      width: 600px; max-height: 80vh; overflow-y: auto;
      box-shadow: var(--shadow-lg);
    `;
    modal.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
        <h3 style="font-size:1.2rem;font-weight:800;color:var(--text-primary);">
          ${this.esc(project.name)} — Versions
        </h3>
        <button id="vpick-close" class="btn btn-secondary" style="padding:4px 12px;">✕</button>
      </div>
      <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:16px;">
        Instance: <strong>${this.esc(this.selectedInstance.name)}</strong>
        · MC ${this.selectedInstance.minecraft.version}
        · ${this.selectedInstance.loader.type}
      </p>
      <div id="vpick-list" style="display:flex;flex-direction:column;gap:8px;">
        <div style="padding:20px;text-align:center;color:var(--text-muted);">
          <span class="animate-pulse">Loading versions...</span>
        </div>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    overlay.onclick = (e) => { if (e.target === overlay) { overlay.remove(); } };
    modal.querySelector('#vpick-close')!.addEventListener('click', () => overlay.remove());

    // Load versions
    const versions = await this.fetchVersions(project);
    const list = modal.querySelector('#vpick-list') as HTMLElement;
    list.innerHTML = '';

    if (versions.length === 0) {
      list.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted);">No versions found for your Minecraft version/loader.</div>`;
      return;
    }

    const mcVer = this.selectedInstance.minecraft.version;
    const loader = this.selectedInstance.loader.type;

    for (const v of versions) {
      const isCompatible = v.gameVersions.includes(mcVer) && (v.loaders.length === 0 || v.loaders.includes(loader));
      const releaseColor = v.releaseType === 'release' ? '#10b981' : v.releaseType === 'beta' ? '#f59e0b' : '#94a3b8';

      const row = document.createElement('div');
      row.style.cssText = `
        display:flex;align-items:center;gap:12px;padding:12px 14px;
        background: ${isCompatible ? 'var(--bg-surface)' : 'var(--bg-card)'};
        border-radius:var(--radius-md);
        border:1px solid ${isCompatible ? 'var(--border-accent)' : 'var(--border-subtle)'};
        opacity: ${isCompatible ? '1' : '0.55'};
      `;
      row.innerHTML = `
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">
            <span style="font-weight:700;font-size:0.95rem;color:var(--text-primary);">${this.esc(v.versionName)}</span>
            <span style="font-size:0.72rem;font-weight:700;color:${releaseColor};background:${releaseColor}18;
              border-radius:4px;padding:1px 6px;border:1px solid ${releaseColor}40;">
              ${v.releaseType}
            </span>
            ${!isCompatible ? `<span style="font-size:0.72rem;color:var(--text-muted);">incompatible</span>` : ''}
          </div>
          <div style="font-size:0.78rem;color:var(--text-muted);">
            MC: ${v.gameVersions.slice(0, 5).join(', ')}${v.gameVersions.length > 5 ? '…' : ''}
            ${v.loaders.length > 0 ? `· ${v.loaders.join(', ')}` : ''}
          </div>
        </div>
        <div style="display:flex;gap:6px;">
          ${v.files.map((f, fi) => `
            <button class="btn btn-primary vpick-dl-btn" data-vi="${versions.indexOf(v)}" data-fi="${fi}"
              style="font-size:0.8rem;padding:6px 12px;min-width:80px;"
              ${!f.url ? 'disabled' : ''}>
              ${v.files.length > 1 ? this.esc(f.filename.slice(0, 12)) + '…' : 'Install'}
            </button>
          `).join('')}
        </div>
      `;
      list.appendChild(row);
    }

    // Wire install buttons
    list.querySelectorAll('.vpick-dl-btn').forEach(btn => {
      (btn as HTMLButtonElement).onclick = async () => {
        const vi = parseInt(btn.getAttribute('data-vi')!);
        const fi = parseInt(btn.getAttribute('data-fi')!);
        const v = versions[vi]!;
        const f = v.files[fi]!;

        (btn as HTMLButtonElement).disabled = true;
        (btn as HTMLButtonElement).textContent = 'Installing...';

        const res = await this.downloadFile(f, project.name);
        if (res.success) {
          NotificationToast.show(`Installed "${project.name}" (${v.versionName}) to ${this.selectedInstance!.name}!`, 'success');
          overlay.remove();
        } else {
          NotificationToast.show(`Install failed: ${res.error}`, 'error');
          (btn as HTMLButtonElement).disabled = false;
          (btn as HTMLButtonElement).textContent = 'Install';
        }
      };
    });
  }

  // ── Version Fetching ──────────────────────────────────────────────────────

  private async fetchVersions(project: DisplayProject): Promise<ContentVersion[]> {
    const mcVer = this.selectedInstance?.minecraft?.version;
    const loader = this.selectedInstance?.loader?.type ?? 'fabric';

    if (project.provider === 'modrinth') {
      const raw = await api.getModrinthVersions(
        project.id,
        this.activeType === 'mod' ? [loader] : undefined,
        mcVer ? [mcVer] : undefined
      );
      // Fall back to all versions if filtered is empty
      const list = raw.length > 0 ? raw : await api.getModrinthVersions(project.id);
      return list.map(v => ({
        provider: 'modrinth' as const,
        projectId: project.id,
        versionId: v.id,
        versionName: v.name,
        versionNumber: v.version_number,
        gameVersions: v.game_versions,
        loaders: v.loaders,
        releaseType: 'release' as const,
        datePublished: v.date_published,
        downloads: v.downloads,
        files: v.files.map(f => ({
          url: f.url,
          filename: f.filename,
          isPrimary: f.primary,
          sizeBytes: f.size,
          sha1: f.hashes?.sha1,
        })),
      }));
    } else {
      const res = await api.getCurseForgeFiles({
        modId: project.id,
        minecraftVersion: mcVer,
        loader,
      });
      return (res.success && res.data) ? res.data : [];
    }
  }

  private async getBestFile(project: DisplayProject): Promise<ContentFile | null> {
    const versions = await this.fetchVersions(project);
    if (versions.length === 0) return null;
    const best = versions[0]!;
    return best.files.find(f => f.isPrimary) ?? best.files[0] ?? null;
  }

  // ── Download ──────────────────────────────────────────────────────────────

  private async downloadFile(file: ContentFile, title: string): Promise<{ success: boolean; error?: string }> {
    if (!this.selectedInstance) return { success: false, error: 'No instance selected' };
    if (!file.url) return { success: false, error: 'No download URL available for this file (CurseForge CDN restriction).' };

    const res = await api.installModrinthContent(
      this.selectedInstance.id,
      file.url,
      file.filename,
      title,
      this.activeType
    );
    return res;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private renderCurseForgeUnconfigured(container: HTMLElement): void {
    const div = document.createElement('div');
    div.style.cssText = `
      padding: 32px 24px; background: var(--bg-card); border-radius: var(--radius-lg);
      border: 1px solid rgba(249,115,22,0.3); display: flex; gap: 20px; align-items: flex-start;
    `;
    div.innerHTML = `
      <span style="font-size:2rem;flex-shrink:0;">🔶</span>
      <div>
        <h4 style="font-weight:800;font-size:1.05rem;color:var(--text-primary);margin-bottom:6px;">
          CurseForge API Key Not Configured
        </h4>
        <p style="font-size:0.88rem;color:var(--text-secondary);line-height:1.5;margin-bottom:12px;">
          To enable CurseForge mod search, set the <code style="background:var(--bg-surface);padding:2px 6px;border-radius:4px;">CURSEFORGE_API_KEY</code>
          environment variable before starting Voxel⁺.
        </p>
        <p style="font-size:0.82rem;color:var(--text-muted);">
          Get a free API key at
          <a href="https://console.curseforge.com" target="_blank" style="color:var(--text-accent);">console.curseforge.com</a>.
          Modrinth search is fully available without any API key.
        </p>
      </div>
    `;
    container.appendChild(div);
  }

  private providerTab(provider: Provider, label: string): string {
    const isActive = this.activeProvider === provider;
    return `
      <button data-provider="${provider}" style="
        padding: 6px 14px; border-radius: 8px; font-size: 0.85rem; font-weight: 700;
        border: none; cursor: pointer; transition: all 0.15s;
        background: ${isActive ? 'var(--accent-primary)' : 'transparent'};
        color: ${isActive ? '#fff' : 'var(--text-secondary)'};
        box-shadow: ${isActive ? '0 2px 8px var(--accent-glow)' : 'none'};
      ">${label}</button>
    `;
  }

  private typeBtn(type: ContentType, label: string): string {
    const isActive = this.activeType === type;
    return `<button class="btn ${isActive ? 'btn-primary' : 'btn-secondary'}" data-type="${type}">${label}</button>`;
  }

  private fmtDl(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return String(n);
  }

  private esc(text: string): string {
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
  }
}
