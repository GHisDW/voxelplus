import { SkinManagerModal } from '../components/SkinManagerModal';
import { api } from '../services/api';
import { SkinMetadata, PlayerProfile, SkinModel } from '../../../electron/types';
import { NotificationToast } from '../components/NotificationToast';
import * as skinview3d from 'skinview3d';

export class SkinsPage {
  private container: HTMLElement;
  private playerProfile: PlayerProfile | null = null;
  private viewer: skinview3d.SkinViewer | null = null;

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'page-container';
    this.container.style.cssText = 'flex: 1; overflow-y: auto; padding: 24px; box-sizing: border-box; display: flex; flex-direction: column;';

    window.addEventListener(
      'voxelplus-skin-changed',
      this.handleSkinChanged
    );
  }

  public async render(): Promise<HTMLElement> {
    await this.loadPlayerProfile();

    const username = this.playerProfile?.username || 'DevPlayer';
    const uuid = this.playerProfile?.uuid || 'c06173a0-7212-3b2d-986d-0683a4f6d148';
    const currentModel = this.playerProfile?.model || 'steve';
    this.activeSkin = this.playerProfile?.activeSkin || null;

    this.container.innerHTML = `
      <div class="page-header">
        <h1>Player Manager</h1>
        <p class="page-subtitle">
          Manage your local development player identity and character appearance
        </p>
      </div>

      <div class="skin-dashboard">

        <!-- Identity Section -->
        <div class="horizontal-card" style="padding: 20px; background: var(--bg-card); border-radius: var(--radius-lg); margin-bottom: 24px;">
          <h2 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 16px; color: var(--text-primary);">
            Identity
          </h2>

          <div style="display: flex; gap: 20px; align-items: flex-end; flex-wrap: wrap;">
            <div style="flex: 1; min-width: 240px;">
              <label class="form-label" for="player-username-input">Development Username</label>
              <input
                type="text"
                id="player-username-input"
                class="input-field"
                value="${this.escapeHtml(username)}"
                maxlength="16"
                placeholder="DevPlayer"
              />
            </div>

            <button class="btn btn-primary" id="btn-save-username" style="padding: 10px 20px;">
              Save Username
            </button>

            <div style="flex: 1; min-width: 280px; padding: 10px 14px; background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-md);">
              <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Stable Offline UUID</div>
              <div style="font-family: var(--font-mono); font-size: 0.85rem; color: var(--accent-primary); margin-top: 4px; word-break: break-all;">
                ${uuid}
              </div>
            </div>
          </div>
        </div>

        <!-- Appearance Section -->
        <div class="horizontal-card" style="padding: 20px; background: var(--bg-card); border-radius: var(--radius-lg); margin-bottom: 24px;">
          <h2 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 16px; color: var(--text-primary);">
            Appearance & Model
          </h2>

          <div style="margin-bottom: 20px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap;">
            <label class="form-label" style="margin-bottom: 0;">Character Model:</label>
            <div style="display: flex; gap: 12px;">
              <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 0.9rem; font-weight: 600;">
                <input type="radio" name="player-model" value="steve" ${currentModel === 'steve' ? 'checked' : ''} />
                <span>Steve (Wide - 4px arms)</span>
              </label>
              <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 0.9rem; font-weight: 600;">
                <input type="radio" name="player-model" value="alex" ${currentModel === 'alex' ? 'checked' : ''} />
                <span>Alex (Slim - 3px arms)</span>
              </label>
            </div>
          </div>

          <div class="active-skin-section">
            <h2>Active Skin</h2>
            ${this.renderActiveSkin()}
          </div>
        </div>

        <div class="quick-actions" style="margin-top: 16px;">
          <button class="btn btn-primary btn-lg" id="btn-open-manager">
            <span>👕</span>
            Open Skin Library & Search
          </button>
        </div>

        <div class="info-section" style="margin-top: 24px;">
          <h3>About Local Development Player Identity</h3>
          <p>
            Voxel⁺ Player Manager maintains your local offline identity independently from your character skin and model.
          </p>

          <ul>
            <li>
              <strong>Identity & Appearance Invariance:</strong>
              Changing your username keeps your selected skin. Changing your skin/model keeps your inventory, UUID, and username intact.
            </li>
            <li>
              <strong>Real In-Game Rendering:</strong>
              The selected skin is injected directly into Minecraft's client rendering pipeline for local dev sessions without third-party web uploads.
            </li>
          </ul>
        </div>

      </div>
    `;

    this.attachEvents();

    requestAnimationFrame(() => {
      this.initializeActiveViewer();
    });

    return this.container;
  }

  private activeSkin: SkinMetadata | null = null;

  private async loadPlayerProfile(): Promise<void> {
    try {
      this.playerProfile = await api.getPlayerProfile();
    } catch (error) {
      console.error('Failed to load player profile:', error);
      this.playerProfile = null;
    }
  }

  private renderActiveSkin(): string {
    if (!this.activeSkin) {
      return `
        <div class="no-active-skin">
          <div class="empty-icon">👕</div>
          <p>No active skin set</p>
          <p class="empty-hint">
            Open the Skin Library to import or download a skin
          </p>
        </div>
      `;
    }

    const modelIcon =
      this.activeSkin.model === 'alex' ? '👩' : '👨';

    const sourceIcon =
      this.activeSkin.source === 'download' ? '⬇' : '📁';

    return `
      <div class="active-skin-card">

        <div class="skin-preview-large">
          <canvas
            id="active-skin-viewer"
            width="320"
            height="360"
            aria-label="${this.escapeHtml(this.activeSkin.name)} 3D preview"
          ></canvas>

          <div class="active-badge-large">
            Active
          </div>
        </div>

        <div class="skin-details">
          <h3>${this.escapeHtml(this.activeSkin.name)}</h3>

          <div class="skin-meta">
            <span class="meta-item">
              <span class="meta-icon">${modelIcon}</span>
              <span>
                ${this.activeSkin.model === 'alex'
                  ? 'Alex Model'
                  : 'Steve Model'}
              </span>
            </span>

            <span class="meta-item">
              <span class="meta-icon">${sourceIcon}</span>
              <span>
                ${this.activeSkin.source === 'download'
                  ? 'Downloaded'
                  : 'Imported'}
              </span>
            </span>

            <span class="meta-item">
              <span class="meta-icon">📐</span>
              <span>
                ${this.activeSkin.dimensions.width}×${this.activeSkin.dimensions.height}
              </span>
            </span>
          </div>

          ${
            this.activeSkin.sourceUsername
              ? `
                <div class="skin-source-username">
                  From: @${this.escapeHtml(this.activeSkin.sourceUsername)}
                </div>
              `
              : ''
          }

          <div class="skin-stats">
            <span>
              Added ${this.formatDate(this.activeSkin.createdAt)}
            </span>
          </div>

          <p class="skin-viewer-hint">
            Drag to rotate • Scroll to zoom
          </p>
        </div>

      </div>
    `;
  }

  private initializeActiveViewer(): void {
    this.disposeViewer();

    if (!this.activeSkin) return;

    const canvas =
      this.container.querySelector(
        '#active-skin-viewer'
      ) as HTMLCanvasElement | null;

    if (!canvas) return;

    try {
      this.viewer = new skinview3d.SkinViewer({
        canvas,
        width: 320,
        height: 360,
        skin: this.activeSkin.thumbnail
      });

      this.viewer.fov = 55;
      this.viewer.zoom = 0.9;

      this.viewer.controls.enableRotate = true;
      this.viewer.controls.enableZoom = true;
      this.viewer.controls.enablePan = false;

      this.viewer.autoRotate = true;
      this.viewer.autoRotateSpeed = 0.5;
    } catch (error) {
      console.error(
        'Failed to create active skin 3D viewer:',
        error
      );
    }
  }

  private disposeViewer(): void {
    if (!this.viewer) return;

    try {
      this.viewer.dispose();
    } catch {
      // Ignore viewer cleanup errors.
    }

    this.viewer = null;
  }

  private handleSkinChanged = async (): Promise<void> => {
    await this.render();
  };

  private attachEvents(): void {
    const saveUsernameBtn = this.container.querySelector('#btn-save-username') as HTMLButtonElement | null;
    const usernameInput = this.container.querySelector('#player-username-input') as HTMLInputElement | null;

    if (saveUsernameBtn && usernameInput) {
      saveUsernameBtn.onclick = async () => {
        const val = usernameInput.value.trim();
        const res = await api.setUsername(val);
        if (res.success) {
          NotificationToast.show(`Development username updated to "${val}".`, 'success');
          await this.render();
        } else {
          NotificationToast.show(`Error: ${res.error}`, 'error');
        }
      };
    }

    const modelRadios = this.container.querySelectorAll<HTMLInputElement>('input[name="player-model"]');
    modelRadios.forEach(radio => {
      radio.onchange = async () => {
        const selectedModel = radio.value as SkinModel;
        const res = await api.setModel(selectedModel);
        if (res.success) {
          NotificationToast.show(`Model preference set to ${selectedModel === 'alex' ? 'Alex (Slim)' : 'Steve (Wide)'}.`, 'success');
          window.dispatchEvent(new CustomEvent('voxelplus-skin-changed'));
        }
      };
    });

    const openManagerBtn =
      this.container.querySelector(
        '#btn-open-manager'
      ) as HTMLButtonElement | null;

    if (openManagerBtn) {
      openManagerBtn.onclick = async () => {
        await SkinManagerModal.show();
      };
    }
  }

  private formatDate(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();

    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(
      diffMs / (1000 * 60 * 60 * 24)
    );

    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;

    return date.toLocaleDateString();
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
