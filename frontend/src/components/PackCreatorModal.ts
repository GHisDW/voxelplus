import { api } from '../services/api';
import { MyPack, CardModRef, LoaderType } from '../../../electron/types';
import { NotificationToast } from './NotificationToast';

export class PackCreatorModal {
  private pack: MyPack;
  private isEdit: boolean;
  private onSave: () => void;
  private container: HTMLElement;

  constructor(initialPack: Partial<MyPack> | null, onSave: () => void) {
    this.isEdit = !!initialPack;
    this.onSave = onSave;
    
    const defaultPack: MyPack = {
      id: '',
      name: '',
      description: '',
      artwork: null,
      packVersion: '1.0.0',
      minecraftVersion: '26.3',
      loaderType: 'fabric',
      loaderVersion: '0.19.5',
      mods: [],
      resourcePacks: [],
      shaderPacks: [],
      configs: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    this.pack = { ...defaultPack, ...initialPack };
    this.container = document.createElement('div');
  }

  public show(): void {
    const overlay = document.createElement('div');
    overlay.className = 'animate-fade-in';
    overlay.style.cssText = `
      position: fixed; inset: 0; background: rgba(0,0,0,0.85); backdrop-filter: blur(4px);
      z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 40px;
    `;

    this.container.className = 'animate-fade-in-up';
    this.container.style.cssText = `
      background: var(--bg-modal); border-radius: var(--radius-xl); border: 1px solid var(--border-subtle);
      width: 100%; max-width: 900px; height: 90vh; display: flex; flex-direction: column;
      box-shadow: 0 24px 48px rgba(0,0,0,0.5); overflow: hidden;
    `;

    this.render();

    overlay.appendChild(this.container);
    document.body.appendChild(overlay);

    const closeOverlay = (e: MouseEvent) => {
      if (e.target === overlay) overlay.remove();
    };
    overlay.addEventListener('click', closeOverlay);
    
    this.container.addEventListener('close-modal', () => overlay.remove());
  }

  private render() {
    this.container.innerHTML = `
      <!-- Header -->
      <div style="padding: 20px 24px; border-bottom: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: center; background: #1a1e23;">
        <h2 style="font-size: 1.3rem; font-weight: 800; color: var(--text-primary);">
          ${this.isEdit ? 'Edit Pack' : 'Create New Pack'}
        </h2>
        <button id="pc-close" class="btn btn-secondary" style="padding: 6px 12px;">✕ Close</button>
      </div>

      <!-- Scrollable Body -->
      <div style="flex: 1; overflow-y: auto; padding: 24px; display: flex; flex-direction: column; gap: 32px;">
        
        <!-- Section: Basic Info -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
          <div>
            <label style="display: block; font-size: 0.8rem; font-weight: 700; color: var(--text-muted); margin-bottom: 6px;">Pack Name</label>
            <input type="text" id="pc-name" class="input-field" value="${this.esc(this.pack.name)}" placeholder="e.g. My Survival Pack" style="width: 100%;" />
          </div>
          <div>
            <label style="display: block; font-size: 0.8rem; font-weight: 700; color: var(--text-muted); margin-bottom: 6px;">Pack ID (unique)</label>
            <input type="text" id="pc-id" class="input-field" value="${this.esc(this.pack.id)}" placeholder="e.g. my-survival-pack" style="width: 100%;" ${this.isEdit ? 'readonly' : ''} />
          </div>
          <div style="grid-column: 1 / -1;">
            <label style="display: block; font-size: 0.8rem; font-weight: 700; color: var(--text-muted); margin-bottom: 6px;">Description</label>
            <textarea id="pc-desc" class="input-field" rows="3" style="width: 100%; resize: vertical;">${this.esc(this.pack.description)}</textarea>
          </div>
          <div>
            <label style="display: block; font-size: 0.8rem; font-weight: 700; color: var(--text-muted); margin-bottom: 6px;">Pack Version</label>
            <input type="text" id="pc-version" class="input-field" value="${this.esc(this.pack.packVersion)}" placeholder="e.g. 1.0.0" style="width: 100%;" />
          </div>
          <div>
            <label style="display: block; font-size: 0.8rem; font-weight: 700; color: var(--text-muted); margin-bottom: 6px;">Artwork URL (optional)</label>
            <input type="text" id="pc-artwork" class="input-field" value="${this.esc(this.pack.artwork || '')}" placeholder="https://..." style="width: 100%;" />
          </div>
        </div>

        <hr style="border: none; border-top: 1px solid var(--border-subtle);" />

        <!-- Section: Game Configuration -->
        <h3 style="font-size: 1.1rem; font-weight: 800; color: var(--text-primary); border-left: 3px solid var(--accent-primary); padding-left: 10px;">Game Configuration</h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px;">
          <div>
            <label style="display: block; font-size: 0.8rem; font-weight: 700; color: var(--text-muted); margin-bottom: 6px;">Minecraft Version</label>
            <input type="text" id="pc-mc" class="input-field" value="${this.esc(this.pack.minecraftVersion)}" placeholder="e.g. 1.20.1" style="width: 100%;" />
          </div>
          <div>
            <label style="display: block; font-size: 0.8rem; font-weight: 700; color: var(--text-muted); margin-bottom: 6px;">Loader</label>
            <select id="pc-loader" class="select-field" style="width: 100%;">
              <option value="fabric" ${this.pack.loaderType === 'fabric' ? 'selected' : ''}>Fabric</option>
              <option value="forge" ${this.pack.loaderType === 'forge' ? 'selected' : ''}>Forge</option>
              <option value="neoforge" ${this.pack.loaderType === 'neoforge' ? 'selected' : ''}>NeoForge</option>
              <option value="quilt" ${this.pack.loaderType === 'quilt' ? 'selected' : ''}>Quilt</option>
            </select>
          </div>
          <div>
            <label style="display: block; font-size: 0.8rem; font-weight: 700; color: var(--text-muted); margin-bottom: 6px;">Loader Version</label>
            <input type="text" id="pc-loaderver" class="input-field" value="${this.esc(this.pack.loaderVersion)}" placeholder="e.g. 0.15.7" style="width: 100%;" />
          </div>
        </div>

        <hr style="border: none; border-top: 1px solid var(--border-subtle);" />

        <!-- Section: Mods -->
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <h3 style="font-size: 1.1rem; font-weight: 800; color: var(--text-primary); border-left: 3px solid var(--accent-primary); padding-left: 10px;">Mods (${this.pack.mods.length})</h3>
          <button id="pc-add-mod" class="btn btn-primary" style="padding: 6px 16px;">+ Add Mod</button>
        </div>
        
        <div id="pc-mods-list" style="display: flex; flex-direction: column; gap: 8px;">
          ${this.pack.mods.map((m, i) => `
            <div style="display: flex; align-items: center; gap: 12px; padding: 12px; background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-md);">
              ${m.iconUrl 
                ? `<img src="${m.iconUrl}" style="width: 32px; height: 32px; border-radius: 6px; object-fit: cover;" />` 
                : `<div style="width: 32px; height: 32px; border-radius: 6px; background: var(--bg-card); display: flex; align-items: center; justify-content: center;">📦</div>`
              }
              <div style="flex: 1; min-width: 0;">
                <div style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary); margin-bottom: 2px;">${this.esc(m.projectName)}</div>
                <div style="font-size: 0.75rem; color: var(--text-muted); display: flex; gap: 8px;">
                  <span style="color: ${m.provider === 'modrinth' ? '#10b981' : '#f97316'}; font-weight: 700;">${m.provider}</span>
                  <span style="opacity: 0.5;">•</span>
                  <span>${this.esc(m.versionName)}</span>
                  <span style="opacity: 0.5;">•</span>
                  <span style="font-family: monospace;">${this.esc(m.filename)}</span>
                </div>
              </div>
              <button class="btn btn-secondary pc-remove-mod" data-index="${i}" style="color: #ef4444; border-color: #ef444430; padding: 4px 10px;">Remove</button>
            </div>
          `).join('')}
          ${this.pack.mods.length === 0 ? `<div style="padding: 30px; text-align: center; color: var(--text-muted); background: var(--bg-surface); border-radius: var(--radius-md); border: 1px dashed var(--border-subtle);">No mods added yet. Click "+ Add Mod" to search Modrinth.</div>` : ''}
        </div>

        <hr style="border: none; border-top: 1px solid var(--border-subtle);" />

        <!-- Section: Resource Packs -->
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <h3 style="font-size: 1.1rem; font-weight: 800; color: var(--text-primary); border-left: 3px solid var(--accent-primary); padding-left: 10px;">Resource Packs (${this.pack.resourcePacks.length})</h3>
          <button id="pc-add-rp" class="btn btn-primary" style="padding: 6px 16px;">+ Add Resource Pack</button>
        </div>
        
        <div id="pc-rp-list" style="display: flex; flex-direction: column; gap: 8px;">
          ${this.pack.resourcePacks.map((m, i) => `
            <div style="display: flex; align-items: center; gap: 12px; padding: 12px; background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-md);">
              ${m.iconUrl 
                ? `<img src="${m.iconUrl}" style="width: 32px; height: 32px; border-radius: 6px; object-fit: cover;" />` 
                : `<div style="width: 32px; height: 32px; border-radius: 6px; background: var(--bg-card); display: flex; align-items: center; justify-content: center;">🖼️</div>`
              }
              <div style="flex: 1; min-width: 0;">
                <div style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary); margin-bottom: 2px;">${this.esc(m.projectName)}</div>
                <div style="font-size: 0.75rem; color: var(--text-muted); display: flex; gap: 8px;">
                  <span style="color: ${m.provider === 'modrinth' ? '#10b981' : '#f97316'}; font-weight: 700;">${m.provider}</span>
                  <span style="opacity: 0.5;">•</span>
                  <span>${this.esc(m.versionName)}</span>
                </div>
              </div>
              <button class="btn btn-secondary pc-remove-rp" data-index="${i}" style="color: #ef4444; border-color: #ef444430; padding: 4px 10px;">Remove</button>
            </div>
          `).join('')}
          ${this.pack.resourcePacks.length === 0 ? `<div style="padding: 30px; text-align: center; color: var(--text-muted); background: var(--bg-surface); border-radius: var(--radius-md); border: 1px dashed var(--border-subtle);">No resource packs added yet.</div>` : ''}
        </div>

        <hr style="border: none; border-top: 1px solid var(--border-subtle);" />

        <!-- Section: Shader Packs -->
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <h3 style="font-size: 1.1rem; font-weight: 800; color: var(--text-primary); border-left: 3px solid var(--accent-primary); padding-left: 10px;">Shader Packs (${this.pack.shaderPacks.length})</h3>
          <button id="pc-add-sp" class="btn btn-primary" style="padding: 6px 16px;">+ Add Shader Pack</button>
        </div>
        
        <div id="pc-sp-list" style="display: flex; flex-direction: column; gap: 8px;">
          ${this.pack.shaderPacks.map((m, i) => `
            <div style="display: flex; align-items: center; gap: 12px; padding: 12px; background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-md);">
              ${m.iconUrl 
                ? `<img src="${m.iconUrl}" style="width: 32px; height: 32px; border-radius: 6px; object-fit: cover;" />` 
                : `<div style="width: 32px; height: 32px; border-radius: 6px; background: var(--bg-card); display: flex; align-items: center; justify-content: center;">✨</div>`
              }
              <div style="flex: 1; min-width: 0;">
                <div style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary); margin-bottom: 2px;">${this.esc(m.projectName)}</div>
                <div style="font-size: 0.75rem; color: var(--text-muted); display: flex; gap: 8px;">
                  <span style="color: ${m.provider === 'modrinth' ? '#10b981' : '#f97316'}; font-weight: 700;">${m.provider}</span>
                  <span style="opacity: 0.5;">•</span>
                  <span>${this.esc(m.versionName)}</span>
                </div>
              </div>
              <button class="btn btn-secondary pc-remove-sp" data-index="${i}" style="color: #ef4444; border-color: #ef444430; padding: 4px 10px;">Remove</button>
            </div>
          `).join('')}
          ${this.pack.shaderPacks.length === 0 ? `<div style="padding: 30px; text-align: center; color: var(--text-muted); background: var(--bg-surface); border-radius: var(--radius-md); border: 1px dashed var(--border-subtle);">No shader packs added yet.</div>` : ''}
        </div>

      </div>
      
      <!-- Footer -->
      <div style="padding: 20px 24px; border-top: 1px solid var(--border-subtle); display: flex; justify-content: flex-end; gap: 12px; background: var(--bg-surface);">
        <button id="pc-cancel" class="btn btn-secondary">Cancel</button>
        <button id="pc-save" class="btn btn-primary" style="padding: 10px 24px; font-size: 1rem;">Save Pack</button>
      </div>
    `;

    this.wireEvents();
  }

  private wireEvents() {
    this.container.querySelector('#pc-close')!.addEventListener('click', () => {
      this.container.dispatchEvent(new Event('close-modal'));
    });
    this.container.querySelector('#pc-cancel')!.addEventListener('click', () => {
      this.container.dispatchEvent(new Event('close-modal'));
    });

    // Remove Mod
    this.container.querySelectorAll('.pc-remove-mod').forEach(btn => {
      btn.addEventListener('click', () => {
        this.saveStateFromDOM();
        const idx = parseInt(btn.getAttribute('data-index')!);
        this.pack.mods.splice(idx, 1);
        this.render();
      });
    });

    // Remove Resource Pack
    this.container.querySelectorAll('.pc-remove-rp').forEach(btn => {
      btn.addEventListener('click', () => {
        this.saveStateFromDOM();
        const idx = parseInt(btn.getAttribute('data-index')!);
        this.pack.resourcePacks.splice(idx, 1);
        this.render();
      });
    });

    // Remove Shader Pack
    this.container.querySelectorAll('.pc-remove-sp').forEach(btn => {
      btn.addEventListener('click', () => {
        this.saveStateFromDOM();
        const idx = parseInt(btn.getAttribute('data-index')!);
        this.pack.shaderPacks.splice(idx, 1);
        this.render();
      });
    });

    // Add Mod
    this.container.querySelector('#pc-add-mod')!.addEventListener('click', () => {
      this.saveStateFromDOM();
      this.showContentPicker('mod');
    });

    // Add Resource Pack
    this.container.querySelector('#pc-add-rp')!.addEventListener('click', () => {
      this.saveStateFromDOM();
      this.showContentPicker('resourcepack');
    });

    // Add Shader Pack
    this.container.querySelector('#pc-add-sp')!.addEventListener('click', () => {
      this.saveStateFromDOM();
      this.showContentPicker('shader');
    });

    // Save
    this.container.querySelector('#pc-save')!.addEventListener('click', async () => {
      this.saveStateFromDOM();
      if (!this.pack.name || !this.pack.id || !this.pack.minecraftVersion || !this.pack.loaderType) {
        NotificationToast.show('Please fill in Name, ID, Minecraft Version, and Loader Type.', 'error');
        return;
      }

      try {
        this.pack.updatedAt = new Date().toISOString();
        const res = await api.savePack(this.pack);
        if (res.success) {
          NotificationToast.show('Pack saved successfully.', 'success');
          this.onSave();
          this.container.dispatchEvent(new Event('close-modal'));
        }
      } catch (e: any) {
        NotificationToast.show(`Save failed: ${e.message}`, 'error');
      }
    });
  }

  private saveStateFromDOM() {
    this.pack.name = (this.container.querySelector('#pc-name') as HTMLInputElement).value;
    if (!this.isEdit) {
      const idInput = (this.container.querySelector('#pc-id') as HTMLInputElement).value;
      this.pack.id = idInput || this.pack.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    }
    this.pack.description = (this.container.querySelector('#pc-desc') as HTMLTextAreaElement).value;
    this.pack.packVersion = (this.container.querySelector('#pc-version') as HTMLInputElement).value;
    const aw = (this.container.querySelector('#pc-artwork') as HTMLInputElement).value;
    this.pack.artwork = aw ? aw : null;
    this.pack.minecraftVersion = (this.container.querySelector('#pc-mc') as HTMLInputElement).value;
    this.pack.loaderType = (this.container.querySelector('#pc-loader') as HTMLSelectElement).value as LoaderType;
    this.pack.loaderVersion = (this.container.querySelector('#pc-loaderver') as HTMLInputElement).value;
  }

  // ── Content Picker (Mods, Resource Packs, Shaders) ─────────────────────────────

  private showContentPicker(contentType: 'mod' | 'resourcepack' | 'shader') {
    const mcVer = this.pack.minecraftVersion;
    const loader = this.pack.loaderType;

    if (!mcVer) {
      NotificationToast.show('Enter a Minecraft version first.', 'warning');
      return;
    }

    const picker = document.createElement('div');
    picker.className = 'animate-fade-in';
    picker.style.cssText = `
      position: fixed; inset: 0; background: rgba(0,0,0,0.9); z-index: 1100;
      display: flex; align-items: center; justify-content: center; padding: 40px;
    `;

    const pContainer = document.createElement('div');
    pContainer.className = 'animate-fade-in-up';
    pContainer.style.cssText = `
      background: var(--bg-modal); border-radius: var(--radius-xl); border: 1px solid var(--border-subtle);
      width: 100%; max-width: 700px; height: 80vh; display: flex; flex-direction: column; overflow: hidden;
    `;

    const typeLabel = contentType === 'mod' ? 'Mods' : contentType === 'resourcepack' ? 'Resource Packs' : 'Shader Packs';

    pContainer.innerHTML = `
      <div style="padding: 16px 20px; border-bottom: 1px solid var(--border-subtle); display: flex; gap: 12px; align-items: center; background: #1a1e23;">
        <h3 style="font-weight: 800; color: white; white-space: nowrap;">Search ${typeLabel}</h3>
        <input type="text" id="p-search" class="input-field" placeholder="Search Modrinth..." style="flex: 1;" />
        <button id="p-close" class="btn btn-secondary">Cancel</button>
      </div>
      <div id="p-results" style="flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 8px;">
        <div style="padding: 40px; text-align: center; color: var(--text-muted);">Type to search for ${typeLabel.toLowerCase()}...</div>
      </div>
    `;

    picker.appendChild(pContainer);
    document.body.appendChild(picker);

    picker.querySelector('#p-close')!.addEventListener('click', () => picker.remove());

    const sInput = picker.querySelector('#p-search') as HTMLInputElement;
    const resDiv = picker.querySelector('#p-results') as HTMLElement;

    let timer: any;
    
    const doSearch = async () => {
      const q = sInput.value.trim();
      if (!q) return;

      resDiv.innerHTML = `<div style="padding: 40px; text-align: center; color: var(--text-muted);">Searching...</div>`;
      
      try {
        const res = await api.searchModrinth({ query: q, projectType: contentType, minecraftVersion: mcVer, loader, limit: 15 });
        this.renderPickerResults(resDiv, picker, contentType, res.hits.map((h: any) => ({
          id: h.id, name: h.title, author: h.author, iconUrl: h.icon_url
        })));
      } catch (e) {
        resDiv.innerHTML = `<div style="padding: 20px; color: #ef4444;">Search failed.</div>`;
      }
    };

    sInput.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(doSearch, 400); });
  }

  private renderPickerResults(container: HTMLElement, picker: HTMLElement, contentType: 'mod' | 'resourcepack' | 'shader', projects: any[]) {
    if (projects.length === 0) {
      container.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--text-muted);">No results found.</div>`;
      return;
    }

    container.innerHTML = projects.map((p, i) => `
      <div style="display: flex; align-items: center; gap: 12px; padding: 12px; background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: var(--radius-md);">
        ${p.iconUrl ? `<img src="${p.iconUrl}" style="width: 40px; height: 40px; border-radius: 6px;" />` : `<div style="width: 40px; height: 40px; background: var(--bg-surface); border-radius: 6px;"></div>`}
        <div style="flex: 1;">
          <div style="font-weight: 700; font-size: 0.95rem; color: var(--text-primary);">${this.esc(p.name)}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">by ${this.esc(p.author)}</div>
        </div>
        <button class="btn btn-primary p-select-btn" data-idx="${i}" style="padding: 6px 12px; font-size: 0.8rem;">Select Version</button>
      </div>
    `).join('');

    container.querySelectorAll('.p-select-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = projects[parseInt(btn.getAttribute('data-idx')!)];
        this.showVersionPicker(p, contentType, picker);
      });
    });
  }

  private async showVersionPicker(project: any, contentType: 'mod' | 'resourcepack' | 'shader', rootPicker: HTMLElement) {
    const vPicker = document.createElement('div');
    vPicker.className = 'animate-fade-in';
    vPicker.style.cssText = `
      position: absolute; inset: 0; background: var(--bg-modal); z-index: 10;
      display: flex; flex-direction: column;
    `;

    vPicker.innerHTML = `
      <div style="padding: 16px 20px; border-bottom: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: center; background: #1a1e23;">
        <h3 style="font-weight: 800; color: white;">Select Version: ${this.esc(project.name)}</h3>
        <button id="v-close" class="btn btn-secondary">Back</button>
      </div>
      <div id="v-list" style="flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 8px;">
        <div style="padding: 40px; text-align: center; color: var(--text-muted);">Loading versions...</div>
      </div>
    `;

    rootPicker.querySelector('div')!.appendChild(vPicker);
    vPicker.querySelector('#v-close')!.addEventListener('click', () => vPicker.remove());

    const mcVer = this.pack.minecraftVersion;
    const loader = this.pack.loaderType;
    const vList = vPicker.querySelector('#v-list') as HTMLElement;

    try {
      const raw = await api.getModrinthVersions(project.id, [loader], [mcVer]);
      const list = raw.length > 0 ? raw : await api.getModrinthVersions(project.id);
      const versions = list.map(v => ({
        versionId: v.id,
        versionName: v.name,
        files: v.files.map(f => ({ url: f.url, filename: f.filename, isPrimary: f.primary, sizeBytes: f.size, sha1: f.hashes?.sha1 }))
      }));

      if (versions.length === 0) {
        vList.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--text-muted);">No versions found.</div>`;
        return;
      }

      vList.innerHTML = versions.map((v, vi) => `
        <div style="padding: 12px; background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); display: flex; justify-content: space-between; align-items: center;">
          <div style="font-weight: 700; font-size: 0.9rem; color: var(--text-primary);">${this.esc(v.versionName)}</div>
          <div style="display: flex; gap: 6px;">
            ${v.files.map((f: any, fi: number) => `
              <button class="btn btn-primary v-add-btn" data-vi="${vi}" data-fi="${fi}" style="padding: 4px 10px; font-size: 0.75rem;" ${!f.url ? 'disabled' : ''}>
                Add ${this.esc(f.filename.slice(0, 15))}
              </button>
            `).join('')}
          </div>
        </div>
      `).join('');

      vList.querySelectorAll('.v-add-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const v = versions[parseInt(btn.getAttribute('data-vi')!)];
          const f = v.files[parseInt(btn.getAttribute('data-fi')!)];
          
          const modRef: CardModRef = {
            provider: 'modrinth',
            projectId: project.id,
            projectName: project.name,
            versionId: v.versionId,
            versionName: v.versionName,
            downloadUrl: f.url,
            filename: f.filename,
            sizeBytes: f.sizeBytes,
            sha1: f.sha1,
            iconUrl: project.iconUrl,
            contentType: contentType
          };

          if (contentType === 'mod') {
            this.pack.mods.push(modRef);
          } else if (contentType === 'resourcepack') {
            this.pack.resourcePacks.push(modRef);
          } else if (contentType === 'shader') {
            this.pack.shaderPacks.push(modRef);
          }

          this.render();
          rootPicker.remove();
        });
      });

    } catch (e) {
      vList.innerHTML = `<div style="padding: 20px; color: #ef4444;">Failed to load versions.</div>`;
    }
  }

  private esc(text: string): string {
    if (!text) return '';
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
  }
}
