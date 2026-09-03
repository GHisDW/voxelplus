import { InstanceMetadata } from '../../../electron/types';
import { api } from '../services/api';
import { ARTWORK_PRESETS, getArtworkStyle } from '../assets/artworks';
import { getItemDataUrl, getItemDefinition } from '../assets/items';
import { ItemPickerModal } from './ItemPickerModal';
import { AddContentModal } from './AddContentModal';
import { ConfirmDialog } from './ConfirmDialog';
import { NotificationToast } from './NotificationToast';

export interface InstanceDetailsEvents {
  onBack: () => void;
  onOpenModrinthForInstance: (instance: InstanceMetadata) => void;
  onViewLogs: (instanceId: string) => void;
}

export class InstanceDetails {
  private instance: InstanceMetadata;
  private events: InstanceDetailsEvents;
  private container: HTMLElement;
  private activeTab: 'overview' | 'mods' | 'packs' | 'shaders' = 'overview';

  constructor(instance: InstanceMetadata, events: InstanceDetailsEvents) {
    this.instance = instance;
    this.events = events;
    this.container = document.createElement('div');
    this.container.className = 'animate-fade-in';
  }

  public async render(): Promise<HTMLElement> {
    const isRunning = ['PREPARING', 'STARTING', 'LAUNCHING', 'RUNNING'].includes(this.instance.status);

    this.container.innerHTML = `
      <!-- Top Navigation & Actions -->
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px;">
        <div style="display: flex; align-items: center; gap: 14px;">
          <button class="btn btn-secondary" id="btn-back" style="padding: 8px 14px;">
            ← Back
          </button>
          <div>
            <h2 style="font-size: 1.4rem; font-weight: 800; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
              ${this.escapeHtml(this.instance.name)}
            </h2>
            <div style="font-size: 0.86rem; color: var(--text-secondary);">
              Minecraft ${this.instance.minecraft.version} · Fabric Loader ·
              <span class="status-pill ${this.instance.status.toLowerCase()}" style="font-size: 0.72rem; padding: 2px 8px;">
                ${this.instance.status}
              </span>
            </div>
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 10px;">
          ${isRunning
            ? `<button class="btn btn-stop" id="details-btn-stop">■ STOP</button>`
            : `<button class="btn btn-play" id="details-btn-play">▶ PLAY</button>`
          }
          <button class="btn btn-secondary" id="details-btn-folder">📁 Open Folder</button>
          <button class="btn btn-secondary" id="details-btn-logs">▣ Logs</button>
        </div>
      </div>

      <!-- Navigation Tabs -->
      <div style="display: flex; gap: 8px; border-bottom: 1px solid var(--border-subtle); padding-bottom: 12px; margin-bottom: 24px;">
        <button class="btn ${this.activeTab === 'overview' ? 'btn-primary' : 'btn-secondary'}" data-tab="overview">Overview</button>
        <button class="btn ${this.activeTab === 'mods' ? 'btn-primary' : 'btn-secondary'}" data-tab="mods">Mods (${this.instance.modCount || 0})</button>
        <button class="btn ${this.activeTab === 'packs' ? 'btn-primary' : 'btn-secondary'}" data-tab="packs">Resource Packs (${this.instance.resourcePackCount || 0})</button>
        <button class="btn ${this.activeTab === 'shaders' ? 'btn-primary' : 'btn-secondary'}" data-tab="shaders">Shaders (${this.instance.shaderCount || 0})</button>
      </div>

      <!-- Tab Content Area -->
      <div id="details-tab-content"></div>
    `;

    // Hook top navigation buttons
    (this.container.querySelector('#btn-back') as HTMLElement).onclick = () => this.events.onBack();
    (this.container.querySelector('#details-btn-folder') as HTMLElement).onclick = () => api.openInstanceFolder(this.instance.id);
    (this.container.querySelector('#details-btn-logs') as HTMLElement).onclick = () => this.events.onViewLogs(this.instance.id);

    const playBtn = this.container.querySelector('#details-btn-play') as HTMLButtonElement;
    if (playBtn) {
      playBtn.onclick = async () => {
        playBtn.disabled = true;
        playBtn.textContent = 'Launching...';
        const res = await api.launchInstance(this.instance.id);
        if (res.success) {
          NotificationToast.show(`Launching development client...`, 'info');
        } else {
          NotificationToast.show(`Launch failed: ${res.message}`, 'error');
          this.events.onViewLogs(this.instance.id);
        }
      };
    }

    const stopBtn = this.container.querySelector('#details-btn-stop') as HTMLButtonElement;
    if (stopBtn) {
      stopBtn.onclick = async () => {
        stopBtn.disabled = true;
        await api.stopInstance(this.instance.id);
        NotificationToast.show('Instance stopped.', 'info');
      };
    }

    // Tab buttons
    this.container.querySelectorAll('[data-tab]').forEach(tabBtn => {
      (tabBtn as HTMLElement).onclick = () => {
        this.activeTab = tabBtn.getAttribute('data-tab') as any;
        this.render();
      };
    });

    await this.renderTabContent();
    return this.container;
  }

  private async renderTabContent(): Promise<void> {
    const target = this.container.querySelector('#details-tab-content') as HTMLElement;
    if (!target) return;
    target.innerHTML = '';

    if (this.activeTab === 'overview') {
      target.appendChild(this.renderOverview());
    } else if (this.activeTab === 'mods') {
      target.appendChild(await this.renderMods());
    } else if (this.activeTab === 'packs') {
      target.appendChild(await this.renderResourcePacks());
    } else if (this.activeTab === 'shaders') {
      target.appendChild(await this.renderShaders());
    }
  }

  private renderOverview(): HTMLElement {
    const div = document.createElement('div');
    div.className = 'animate-fade-in';
    const itemUrl = getItemDataUrl(this.instance.appearance.item);

    div.innerHTML = `
      <div style="display: grid; grid-template-columns: 320px 1fr; gap: 24px;">
        <!-- Left Column: Artwork Banner & Customizer -->
        <div style="display: flex; flex-direction: column; gap: 16px;">
          <div style="
            background: ${getArtworkStyle(this.instance.appearance.artwork)};
            border-radius: var(--radius-xl);
            height: 220px;
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: var(--shadow-md);
            border: 1px solid var(--border-subtle);
            overflow: hidden;
          " id="overview-artwork-banner">
            <div style="position: absolute; inset: 0; background: rgba(0,0,0,0.3);"></div>
            <div style="
              position: relative;
              z-index: 1;
              padding: 16px;
              background: rgba(15, 19, 29, 0.75);
              backdrop-filter: blur(12px);
              border: 1px solid rgba(255, 255, 255, 0.2);
              border-radius: var(--radius-lg);
              display: flex;
              flex-direction: column;
              align-items: center;
              gap: 8px;
            ">
              <img id="overview-item-img" src="${itemUrl}" width="48" height="48" style="image-rendering: pixelated;" />
              <span id="overview-item-name" style="font-size: 0.88rem; font-weight: 700; color: white;">
                ${getItemDefinition(this.instance.appearance.item).name}
              </span>
            </div>
          </div>

          <!-- Edit Appearance Card -->
          <div class="horizontal-card" style="padding: 16px; background: var(--bg-card); border-radius: var(--radius-lg);">
            <h4 style="font-size: 0.9rem; font-weight: 700; color: var(--text-primary); margin-bottom: 12px;">
              Customize Identity & Artwork
            </h4>

            <div class="form-group">
              <label class="form-label">Artwork Theme</label>
              <select class="select-field" id="edit-artwork-select">
                ${ARTWORK_PRESETS.map(p => `
                  <option value="${p.id}" ${p.id === this.instance.appearance.artwork ? 'selected' : ''}>${p.name}</option>
                `).join('')}
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">Item Texture Badge</label>
              <button type="button" class="btn btn-secondary" id="btn-edit-item" style="width: 100%; display: flex; justify-content: flex-start; gap: 10px;">
                <img id="edit-item-badge-img" src="${itemUrl}" width="24" height="24" style="image-rendering: pixelated;" />
                <span id="edit-item-badge-text" style="font-size: 0.88rem; font-weight: 600;">
                  ${getItemDefinition(this.instance.appearance.item).name}
                </span>
              </button>
            </div>
          </div>
        </div>

        <!-- Specifications Grid -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
          <div class="horizontal-card" style="padding: 16px; background: var(--bg-card); border-radius: var(--radius-md);">
            <div style="font-size: 0.78rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase;">Minecraft Version</div>
            <div style="font-size: 1.1rem; font-weight: 700; color: var(--text-primary); margin-top: 4px;">${this.instance.minecraft.version}</div>
            <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 2px;">Fabric Loader ${this.instance.loader.version}</div>
          </div>

          <div class="horizontal-card" style="padding: 16px; background: var(--bg-card); border-radius: var(--radius-md);">
            <div style="font-size: 0.78rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase;">Memory Allocation</div>
            <div style="font-size: 1.1rem; font-weight: 700; color: var(--text-primary); margin-top: 4px;">${this.instance.runtime.memoryMb} MB</div>
            <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 2px;">${(this.instance.runtime.memoryMb / 1024).toFixed(1)} GB Assigned to JVM</div>
          </div>

          <div class="horizontal-card" style="padding: 16px; background: var(--bg-card); border-radius: var(--radius-md);">
            <div style="font-size: 0.78rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase;">Java Runtime</div>
            <div style="font-size: 1.1rem; font-weight: 700; color: var(--text-primary); margin-top: 4px;">
              ${this.instance.runtime.java === 'auto' ? 'Auto-Selected Java' : 'Custom Java'}
            </div>
            <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 2px;">Resolved automatically for Minecraft ${this.instance.minecraft.version}</div>
          </div>

          <div class="horizontal-card" style="padding: 16px; background: var(--bg-card); border-radius: var(--radius-md);">
            <div style="font-size: 0.78rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase;">Development Engine</div>
            <div style="font-size: 1.1rem; font-weight: 700; color: var(--text-primary); margin-top: 4px;">Gradle & Fabric Loom</div>
            <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 2px;">Target: <code>gradlew.bat runClient</code></div>
          </div>
        </div>
      </div>
    `;

    // Hook artwork change selector
    const artworkSelect = div.querySelector('#edit-artwork-select') as HTMLSelectElement;
    artworkSelect.onchange = async (e: any) => {
      const newArtwork = e.target.value;
      const updatedAppearance = { ...this.instance.appearance, artwork: newArtwork };
      await api.updateInstance(this.instance.id, { appearance: updatedAppearance });
      this.instance.appearance = updatedAppearance;

      const banner = div.querySelector('#overview-artwork-banner') as HTMLElement;
      if (banner) {
        banner.style.background = getArtworkStyle(newArtwork);
      }
      NotificationToast.show('Instance artwork updated!', 'success');
    };

    // Hook item change button
    const itemBtn = div.querySelector('#btn-edit-item') as HTMLElement;
    itemBtn.onclick = async () => {
      const picked = await ItemPickerModal.selectItem(this.instance.appearance.item);
      if (picked) {
        const updatedAppearance = { ...this.instance.appearance, item: picked };
        await api.updateInstance(this.instance.id, { appearance: updatedAppearance });
        this.instance.appearance = updatedAppearance;

        const newUrl = getItemDataUrl(picked);
        const newDef = getItemDefinition(picked);

        (div.querySelector('#overview-item-img') as HTMLImageElement).src = newUrl;
        (div.querySelector('#overview-item-name') as HTMLElement).textContent = newDef.name;
        (div.querySelector('#edit-item-badge-img') as HTMLImageElement).src = newUrl;
        (div.querySelector('#edit-item-badge-text') as HTMLElement).textContent = newDef.name;

        NotificationToast.show(`Instance item identity set to ${newDef.name}`, 'success');
      }
    };

    return div;
  }

  private async renderMods(): Promise<HTMLElement> {
    const div = document.createElement('div');
    div.className = 'animate-fade-in';

    const mods = await api.scanMods(this.instance.id);

    div.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
        <div style="font-size: 0.95rem; font-weight: 700; color: var(--text-secondary);">
          ${mods.length} Mods Installed
        </div>
        <button class="btn btn-primary" id="btn-add-mod">+ ADD CONTENT</button>
      </div>

      <div id="mods-list" style="display: flex; flex-direction: column; gap: 10px;"></div>
    `;

    (div.querySelector('#btn-add-mod') as HTMLElement).onclick = () => {
      AddContentModal.show(
        this.instance.id,
        () => this.events.onOpenModrinthForInstance(this.instance),
        async () => {
          await this.renderTabContent();
        }
      );
    };

    const list = div.querySelector('#mods-list') as HTMLElement;

    if (mods.length === 0) {
      list.innerHTML = `
        <div style="
          padding: 48px;
          text-align: center;
          background: var(--bg-card);
          border: 1px dashed var(--border-subtle);
          border-radius: var(--radius-lg);
        ">
          <h4 style="font-size: 1.1rem; font-weight: 700; color: var(--text-primary); margin-bottom: 6px;">No Mods Installed</h4>
          <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 16px;">Add a local Fabric .jar mod or discover one on Modrinth.</p>
          <button class="btn btn-primary" id="btn-empty-add-mod">+ ADD CONTENT</button>
        </div>
      `;
      (list.querySelector('#btn-empty-add-mod') as HTMLElement).onclick = () => {
        AddContentModal.show(
          this.instance.id,
          () => this.events.onOpenModrinthForInstance(this.instance),
          async () => await this.renderTabContent()
        );
      };
      return div;
    }

    mods.forEach(mod => {
      const card = document.createElement('div');
      card.className = 'horizontal-card';
      card.style.cssText = `
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 14px 18px;
        background: var(--bg-card);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-md);
        opacity: ${mod.enabled ? '1' : '0.6'};
      `;

      card.innerHTML = `
        <div style="
          width: 42px;
          height: 42px;
          border-radius: var(--radius-md);
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          overflow: hidden;
        ">
          ${mod.icon
            ? `<img src="${mod.icon}" width="36" height="36" style="border-radius: 6px;" />`
            : `<span style="font-size: 1.2rem;">🧩</span>`
          }
        </div>

        <div style="flex: 1; min-width: 0;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <h4 style="font-size: 1rem; font-weight: 700; color: var(--text-primary);">${this.escapeHtml(mod.name)}</h4>
            <span class="badge" style="font-size: 0.72rem;">v${mod.version}</span>
            <span class="badge" style="font-size: 0.72rem;">${(mod.sizeBytes / 1024 / 1024).toFixed(2)} MB</span>
          </div>
          <p style="font-size: 0.82rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px;">
            ${this.escapeHtml(mod.description)}
          </p>
        </div>

        <div style="display: flex; align-items: center; gap: 10px; flex-shrink: 0;">
          <label style="display: flex; align-items: center; gap: 6px; font-size: 0.84rem; font-weight: 600; cursor: pointer;">
            <input type="checkbox" ${mod.enabled ? 'checked' : ''} class="mod-toggle" style="accent-color: var(--accent-primary); width: 16px; height: 16px;" />
            <span>${mod.enabled ? 'Enabled' : 'Disabled'}</span>
          </label>
          <button class="btn btn-icon btn-delete-mod" style="color: #ef4444;" title="Delete mod">🗑</button>
        </div>
      `;

      // Toggle switch
      const toggle = card.querySelector('.mod-toggle') as HTMLInputElement;
      toggle.onchange = async () => {
        const nextState = toggle.checked;
        await api.toggleMod(this.instance.id, mod.filename, nextState);
        NotificationToast.show(`Mod "${mod.name}" ${nextState ? 'enabled' : 'disabled'}.`, 'info');
        await this.renderTabContent();
      };

      // Delete mod
      const delBtn = card.querySelector('.btn-delete-mod') as HTMLElement;
      delBtn.onclick = async () => {
        const confirmed = await ConfirmDialog.show({
          title: `Delete Mod?`,
          message: `Are you sure you want to remove "${mod.name}" (${mod.filename})?`,
          confirmText: 'Delete Mod',
          isDanger: true
        });
        if (confirmed) {
          await api.removeMod(this.instance.id, mod.filename);
          NotificationToast.show(`Removed "${mod.name}".`, 'info');
          await this.renderTabContent();
        }
      };

      list.appendChild(card);
    });

    return div;
  }

  private async renderResourcePacks(): Promise<HTMLElement> {
    const div = document.createElement('div');
    div.className = 'animate-fade-in';

    const packs = await api.scanResourcePacks(this.instance.id);

    div.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
        <div style="font-size: 0.95rem; font-weight: 700; color: var(--text-secondary);">
          ${packs.length} Resource Packs Installed
        </div>
        <button class="btn btn-primary" id="btn-add-pack">+ ADD PACK</button>
      </div>

      <div id="packs-list" style="display: flex; flex-direction: column; gap: 10px;"></div>
    `;

    (div.querySelector('#btn-add-pack') as HTMLElement).onclick = () => {
      AddContentModal.show(
        this.instance.id,
        () => this.events.onOpenModrinthForInstance(this.instance),
        async () => await this.renderTabContent()
      );
    };

    const list = div.querySelector('#packs-list') as HTMLElement;

    if (packs.length === 0) {
      list.innerHTML = `
        <div style="padding: 48px; text-align: center; background: var(--bg-card); border: 1px dashed var(--border-subtle); border-radius: var(--radius-lg);">
          <h4 style="font-size: 1.1rem; font-weight: 700; color: var(--text-primary); margin-bottom: 6px;">No Resource Packs Installed</h4>
          <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 16px;">Import a custom resource pack or search Modrinth.</p>
        </div>
      `;
      return div;
    }

    packs.forEach(pack => {
      const card = document.createElement('div');
      card.className = 'horizontal-card';
      card.style.cssText = `
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 14px 18px;
        background: var(--bg-card);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-md);
      `;

      card.innerHTML = `
        <div style="width: 42px; height: 42px; border-radius: var(--radius-md); background: var(--bg-surface); display: flex; align-items: center; justify-content: center; overflow: hidden;">
          ${pack.icon ? `<img src="${pack.icon}" width="40" height="40" />` : `🎨`}
        </div>
        <div style="flex: 1; min-width: 0;">
          <h4 style="font-size: 1rem; font-weight: 700; color: var(--text-primary);">${this.escapeHtml(pack.name)}</h4>
          <p style="font-size: 0.82rem; color: var(--text-muted);">${this.escapeHtml(pack.description)}</p>
        </div>
        <button class="btn btn-icon btn-del-pack" style="color: #ef4444;">🗑</button>
      `;

      (card.querySelector('.btn-del-pack') as HTMLElement).onclick = async () => {
        const confirmed = await ConfirmDialog.show({
          title: `Delete Resource Pack?`,
          message: `Are you sure you want to remove "${pack.name}"?`,
          confirmText: 'Delete',
          isDanger: true
        });
        if (confirmed) {
          await api.removeResourcePack(this.instance.id, pack.filename);
          NotificationToast.show(`Removed "${pack.name}".`, 'info');
          await this.renderTabContent();
        }
      };

      list.appendChild(card);
    });

    return div;
  }

  private async renderShaders(): Promise<HTMLElement> {
    const div = document.createElement('div');
    div.className = 'animate-fade-in';

    const shaders = await api.scanShaders(this.instance.id);

    div.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
        <div style="font-size: 0.95rem; font-weight: 700; color: var(--text-secondary);">
          ${shaders.length} Shaderpacks Installed
        </div>
        <button class="btn btn-primary" id="btn-add-shader">+ ADD SHADER</button>
      </div>

      <div id="shaders-list" style="display: flex; flex-direction: column; gap: 10px;"></div>
    `;

    (div.querySelector('#btn-add-shader') as HTMLElement).onclick = () => {
      AddContentModal.show(
        this.instance.id,
        () => this.events.onOpenModrinthForInstance(this.instance),
        async () => await this.renderTabContent()
      );
    };

    const list = div.querySelector('#shaders-list') as HTMLElement;

    if (shaders.length === 0) {
      list.innerHTML = `
        <div style="padding: 48px; text-align: center; background: var(--bg-card); border: 1px dashed var(--border-subtle); border-radius: var(--radius-lg);">
          <h4 style="font-size: 1.1rem; font-weight: 700; color: var(--text-primary); margin-bottom: 6px;">No Shaderpacks Installed</h4>
          <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 16px;">Import shaderpacks (e.g. Complementary, Iris-compatible shaders).</p>
        </div>
      `;
      return div;
    }

    shaders.forEach(shader => {
      const card = document.createElement('div');
      card.className = 'horizontal-card';
      card.style.cssText = `
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 14px 18px;
        background: var(--bg-card);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-md);
      `;

      card.innerHTML = `
        <div style="font-size: 1.4rem;">✨</div>
        <div style="flex: 1;">
          <h4 style="font-size: 1rem; font-weight: 700; color: var(--text-primary);">${this.escapeHtml(shader.name)}</h4>
          <p style="font-size: 0.82rem; color: var(--text-muted);">${(shader.sizeBytes / 1024 / 1024).toFixed(2)} MB</p>
        </div>
        <button class="btn btn-icon btn-del-shader" style="color: #ef4444;">🗑</button>
      `;

      (card.querySelector('.btn-del-shader') as HTMLElement).onclick = async () => {
        const confirmed = await ConfirmDialog.show({
          title: `Delete Shaderpack?`,
          message: `Are you sure you want to remove "${shader.name}"?`,
          confirmText: 'Delete',
          isDanger: true
        });
        if (confirmed) {
          await api.removeShader(this.instance.id, shader.filename);
          NotificationToast.show(`Removed "${shader.name}".`, 'info');
          await this.renderTabContent();
        }
      };

      list.appendChild(card);
    });

    return div;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
