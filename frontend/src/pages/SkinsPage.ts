import { SkinManagerModal } from '../components/SkinManagerModal';
import { api } from '../services/api';
import { SkinMetadata } from '../../../electron/types';
import * as skinview3d from 'skinview3d';

export class SkinsPage {
  private container: HTMLElement;
  private activeSkin: SkinMetadata | null = null;
  private viewer: skinview3d.SkinViewer | null = null;

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'page-container';

    window.addEventListener(
      'voxelplus-skin-changed',
      this.handleSkinChanged
    );
  }

  public async render(): Promise<HTMLElement> {
    await this.loadActiveSkin();

    this.container.innerHTML = `
      <div class="page-header">
        <h1>Skin Manager</h1>
        <p class="page-subtitle">
          Import, browse, and manage your Minecraft skins
        </p>
      </div>

      <div class="skin-dashboard">

        <div class="active-skin-section">
          <h2>Active Skin</h2>
          ${this.renderActiveSkin()}
        </div>

        <div class="quick-actions">
          <button class="btn btn-primary btn-lg" id="btn-open-manager">
            <span>👕</span>
            Open Skin Manager
          </button>
        </div>

        <div class="info-section">
          <h3>About Skins</h3>
          <p>
            Voxel⁺ allows you to manage Minecraft skins for your development
            instances. You can import custom skin files, download skins from
            any Minecraft player, and switch between them easily.
          </p>

          <ul>
            <li>
              <strong>Import:</strong>
              Load local PNG skin files (64×32 or 64×64)
            </li>
            <li>
              <strong>Download:</strong>
              Get skins from any Minecraft player by username
            </li>
            <li>
              <strong>Manage:</strong>
              Rename, delete, and organize your skin library
            </li>
            <li>
              <strong>Apply:</strong>
              Set any skin as active for your instances
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

  private async loadActiveSkin(): Promise<void> {
    try {
      this.activeSkin = await api.getActiveSkin();
    } catch (error) {
      console.error('Failed to load active skin:', error);
      this.activeSkin = null;
    }
  }

  private renderActiveSkin(): string {
    if (!this.activeSkin) {
      return `
        <div class="no-active-skin">
          <div class="empty-icon">👕</div>
          <p>No active skin set</p>
          <p class="empty-hint">
            Open the Skin Manager to import or download a skin
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
    await this.loadActiveSkin();

    this.disposeViewer();

    this.container.innerHTML = `
      <div class="page-header">
        <h1>Skin Manager</h1>
        <p class="page-subtitle">
          Import, browse, and manage your Minecraft skins
        </p>
      </div>

      <div class="skin-dashboard">
        <div class="active-skin-section">
          <h2>Active Skin</h2>
          ${this.renderActiveSkin()}
        </div>

        <div class="quick-actions">
          <button class="btn btn-primary btn-lg" id="btn-open-manager">
            <span>👕</span>
            Open Skin Manager
          </button>
        </div>

        <div class="info-section">
          <h3>About Skins</h3>
          <p>
            Voxel⁺ allows you to manage Minecraft skins for your development
            instances. You can import custom skin files, download skins from
            any Minecraft player, and switch between them easily.
          </p>

          <ul>
            <li><strong>Import:</strong> Load local PNG skin files (64×32 or 64×64)</li>
            <li><strong>Download:</strong> Get skins from any Minecraft player by username</li>
            <li><strong>Manage:</strong> Rename, delete, and organize your skin library</li>
            <li><strong>Apply:</strong> Set any skin as active for your instances</li>
          </ul>
        </div>
      </div>
    `;

    this.attachEvents();

    requestAnimationFrame(() => {
      this.initializeActiveViewer();
    });
  };

  private attachEvents(): void {
    const openManagerBtn =
      this.container.querySelector(
        '#btn-open-manager'
      ) as HTMLButtonElement | null;

    if (!openManagerBtn) return;

    openManagerBtn.onclick = async () => {
      await SkinManagerModal.show();
    };
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
