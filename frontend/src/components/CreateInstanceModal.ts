import { CreateInstancePayload, InstanceMetadata } from '../../../electron/types';
import { api } from '../services/api';
import { ARTWORK_PRESETS, getArtworkStyle } from '../assets/artworks';
import { getItemDataUrl, getItemDefinition } from '../assets/items';
import { ItemPickerModal } from './ItemPickerModal';
import { NotificationToast } from './NotificationToast';

const SUPPORTED_MC_VERSIONS = [
  { ver: '26.2', label: '26.2 (Latest Non-Obfuscated)' },
  { ver: '26.1.2', label: '26.1.2' },
  { ver: '26.1.1', label: '26.1.1' },
  { ver: '1.21.4', label: '1.21.4' },
  { ver: '1.21.3', label: '1.21.3' },
  { ver: '1.21.1', label: '1.21.1 (Stable Recommended)', default: true },
  { ver: '1.21', label: '1.21' },
  { ver: '1.20.6', label: '1.20.6' },
  { ver: '1.20.4', label: '1.20.4' },
  { ver: '1.20.1', label: '1.20.1 (LTS Modded)' },
  { ver: '1.19.4', label: '1.19.4' },
  { ver: '1.19.2', label: '1.19.2' },
  { ver: '1.18.2', label: '1.18.2' },
  { ver: '1.17.1', label: '1.17.1' },
  { ver: '1.16.5', label: '1.16.5 (Legacy Java 8)' },
  { ver: '1.15.2', label: '1.15.2' }
];

export class CreateInstanceModal {
  public static async show(): Promise<InstanceMetadata | null> {
    const javaList = await api.scanJava();

    return new Promise((resolve) => {
      let selectedItem = 'minecraft:grass_block';
      let selectedArtwork = ARTWORK_PRESETS[0].id;
      let memoryMb = 4096;
      let isSubmitting = false;
      let unsubscribeLog: (() => void) | null = null;

      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay animate-fade-in';

      const render = () => {
        overlay.innerHTML = `
          <div class="modal-content animate-scale-in" style="max-width: 620px;" id="modal-box">
            <div class="modal-header">
              <h3 class="modal-title">Create Development Instance</h3>
              <button class="btn btn-icon" id="modal-close">✕</button>
            </div>

            <div id="form-body">
              <div class="form-group">
                <label class="form-label">Instance Name</label>
                <input type="text" class="input-field" id="inst-name" placeholder="My Mod Test" value="My Mod Test" autofocus />
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
                <div class="form-group">
                  <label class="form-label">Minecraft Version</label>
                  <select class="select-field" id="inst-mc-ver">
                    ${SUPPORTED_MC_VERSIONS.map(v => `
                      <option value="${v.ver}" ${v.default ? 'selected' : ''}>${v.label}</option>
                    `).join('')}
                  </select>
                </div>

                <div class="form-group">
                  <label class="form-label">Mod Loader</label>
                  <select class="select-field" id="inst-loader">
                    <option value="fabric" selected>Fabric Loom</option>
                  </select>
                </div>
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
                <div class="form-group">
                  <label class="form-label">Java Runtime</label>
                  <select class="select-field" id="inst-java">
                    <option value="auto" selected>Auto (Best Compatible)</option>
                    ${javaList.map(j => `<option value="${j.id}">${j.name} · ${j.architecture}</option>`).join('')}
                  </select>
                </div>

                <div class="form-group">
                  <label class="form-label">Memory Allocation: <span id="mem-label">${memoryMb} MB</span></label>
                  <input type="range" min="1024" max="16384" step="512" value="${memoryMb}" id="inst-mem" style="accent-color: var(--accent-primary); width: 100%; margin-top: 8px;" />
                </div>
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 8px;">
                <div class="form-group">
                  <label class="form-label">Instance Artwork</label>
                  <div style="display: flex; gap: 8px; align-items: center;">
                    <div id="artwork-preview" style="
                      width: 54px;
                      height: 38px;
                      border-radius: var(--radius-sm);
                      background: ${getArtworkStyle(selectedArtwork)};
                      border: 1px solid var(--border-subtle);
                    "></div>
                    <select class="select-field" id="inst-artwork" style="flex: 1;">
                      ${ARTWORK_PRESETS.map(p => `<option value="${p.id}" ${p.id === selectedArtwork ? 'selected' : ''}>${p.name}</option>`).join('')}
                    </select>
                  </div>
                </div>

                <div class="form-group">
                  <label class="form-label">Item Identity</label>
                  <div style="display: flex; gap: 8px; align-items: center;">
                    <button type="button" class="btn btn-secondary" id="btn-pick-item" style="flex: 1; display: flex; justify-content: flex-start; gap: 10px;">
                      <img id="item-preview-img" src="${getItemDataUrl(selectedItem)}" width="24" height="24" style="image-rendering: pixelated;" />
                      <span id="item-preview-text" style="font-size: 0.88rem; font-weight: 600;">${getItemDefinition(selectedItem).name}</span>
                    </button>
                  </div>
                </div>
              </div>

              <div class="modal-footer">
                <button class="btn btn-secondary" id="btn-cancel">Cancel</button>
                <button class="btn btn-primary" id="btn-create">Create Instance</button>
              </div>
            </div>

            <!-- Download Progress Body (Shown while creating) -->
            <div id="download-progress-body" style="display: none; flex-direction: column; gap: 16px;">
              <div style="text-align: center; padding: 10px 0;">
                <h4 style="font-size: 1.1rem; font-weight: 800; color: var(--text-primary); margin-bottom: 6px;">
                  Downloading Engine & Dependencies
                </h4>
                <p style="font-size: 0.85rem; color: var(--text-secondary);" id="dl-status-text">
                  Initializing Gradle daemon & Fabric Loom workspace…
                </p>
              </div>

              <!-- Animated Progress Bar Container -->
              <div style="
                width: 100%;
                height: 10px;
                background: rgba(255,255,255,0.08);
                border-radius: 999px;
                overflow: hidden;
                position: relative;
                border: 1px solid var(--border-subtle);
              ">
                <div id="dl-progress-bar" style="
                  width: 30%;
                  height: 100%;
                  background: var(--accent-gradient);
                  border-radius: 999px;
                  transition: width 0.3s ease;
                  animation: pulse-glow 1.5s ease-in-out infinite alternate;
                "></div>
              </div>

              <!-- Live Setup Console Log -->
              <div id="dl-console-terminal" style="
                background: #07090e;
                border: 1px solid var(--border-subtle);
                border-radius: var(--radius-md);
                height: 180px;
                overflow-y: auto;
                padding: 12px 14px;
                font-family: var(--font-mono);
                font-size: 0.78rem;
                color: #94a3b8;
                line-height: 1.5;
                user-select: text;
              "></div>
            </div>
          </div>
        `;

        // Range slider
        const memInput = overlay.querySelector('#inst-mem') as HTMLInputElement;
        const memLabel = overlay.querySelector('#mem-label') as HTMLElement;
        memInput.oninput = (e: any) => {
          memoryMb = Number(e.target.value);
          memLabel.textContent = `${memoryMb} MB (${(memoryMb / 1024).toFixed(1)} GB)`;
        };

        // Artwork dropdown
        const artworkSelect = overlay.querySelector('#inst-artwork') as HTMLSelectElement;
        const artworkPreview = overlay.querySelector('#artwork-preview') as HTMLElement;
        artworkSelect.onchange = (e: any) => {
          selectedArtwork = e.target.value;
          artworkPreview.style.background = getArtworkStyle(selectedArtwork);
        };

        // Item picker button
        const itemBtn = overlay.querySelector('#btn-pick-item') as HTMLElement;
        itemBtn.onclick = async () => {
          const picked = await ItemPickerModal.selectItem(selectedItem);
          if (picked) {
            selectedItem = picked;
            (overlay.querySelector('#item-preview-img') as HTMLImageElement).src = getItemDataUrl(selectedItem);
            (overlay.querySelector('#item-preview-text') as HTMLElement).textContent = getItemDefinition(selectedItem).name;
          }
        };

        // Actions
        const close = (result: InstanceMetadata | null) => {
          if (unsubscribeLog) unsubscribeLog();
          overlay.remove();
          resolve(result);
        };

        (overlay.querySelector('#modal-close') as HTMLElement).onclick = () => {
          if (!isSubmitting) close(null);
        };
        (overlay.querySelector('#btn-cancel') as HTMLElement).onclick = () => {
          if (!isSubmitting) close(null);
        };

        const createBtn = overlay.querySelector('#btn-create') as HTMLButtonElement;
        createBtn.onclick = async () => {
          if (isSubmitting) return;
          isSubmitting = true;

          const formBody = overlay.querySelector('#form-body') as HTMLElement;
          const dlBody = overlay.querySelector('#download-progress-body') as HTMLElement;
          const closeBtn = overlay.querySelector('#modal-close') as HTMLElement;
          const statusText = overlay.querySelector('#dl-status-text') as HTMLElement;
          const progressBar = overlay.querySelector('#dl-progress-bar') as HTMLElement;
          const consoleTerminal = overlay.querySelector('#dl-console-terminal') as HTMLElement;

          formBody.style.display = 'none';
          closeBtn.style.display = 'none';
          dlBody.style.display = 'flex';

          let lineCount = 0;
          unsubscribeLog = api.onLog((entry) => {
            lineCount++;
            const pct = Math.min(95, 30 + lineCount * 2);
            progressBar.style.width = `${pct}%`;
            statusText.textContent = entry.message;

            const div = document.createElement('div');
            div.style.color = entry.level === 'WARN' ? '#fbbf24' : entry.level === 'ERROR' ? '#f87171' : '#94a3b8';
            div.textContent = `[${entry.timeString}] ${entry.message}`;
            consoleTerminal.appendChild(div);
            consoleTerminal.scrollTop = consoleTerminal.scrollHeight;
          });

          const nameInput = overlay.querySelector('#inst-name') as HTMLInputElement;
          const mcSelect = overlay.querySelector('#inst-mc-ver') as HTMLSelectElement;
          const loaderSelect = overlay.querySelector('#inst-loader') as HTMLSelectElement;
          const javaSelect = overlay.querySelector('#inst-java') as HTMLSelectElement;

          const payload: CreateInstancePayload = {
            name: nameInput.value.trim() || 'My Mod Test',
            minecraftVersion: mcSelect.value,
            loaderType: loaderSelect.value as any,
            javaRuntime: javaSelect.value,
            memoryMb,
            artwork: selectedArtwork,
            item: selectedItem
          };

          try {
            const created = await api.createInstance(payload);
            progressBar.style.width = '100%';
            statusText.textContent = `✓ Instance "${created.name}" created and fully ready to PLAY!`;
            NotificationToast.show(`Instance "${created.name}" created & pre-built!`, 'success');
            setTimeout(() => close(created), 600);
          } catch (e: any) {
            NotificationToast.show(`Failed to create instance: ${e.message}`, 'error');
            close(null);
          }
        };
      };

      document.body.appendChild(overlay);
      render();
    });
  }
}
