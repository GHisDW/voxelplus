import { api } from '../services/api';
import { SkinMetadata, SkinSearchResult } from '../../../electron/types';
import { NotificationToast } from './NotificationToast';
import { ConfirmDialog } from './ConfirmDialog';
import * as skinview3d from 'skinview3d';

export class SkinManagerModal {
  private static modal: HTMLElement | null = null;
  private static skins: SkinMetadata[] = [];
  private static searchResult: SkinSearchResult | null = null;
  private static cardViewers = new Map<string, skinview3d.SkinViewer>();

  public static async show(): Promise<void> {
    if (this.modal) return;

    await this.loadSkins();

    this.modal = document.createElement('div');
    this.modal.className = 'modal-overlay skin-manager-overlay';

    this.modal.innerHTML = `
      <div class="modal modal-lg skin-manager-modal animate-fade-in-up">
        <div class="modal-header skin-manager-header">
          <div>
            <h2>Player Manager — Skin Library</h2>
            <p class="skin-manager-subtitle">Manage your Minecraft skin library</p>
          </div>

          <button
            class="btn btn-secondary btn-icon skin-close-btn"
            title="Close"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div class="modal-body skin-manager-body">

          <section class="skin-search-section">
            <div class="skin-search-title">
              <div>
                <h3>Find a Skin</h3>
                <span>Search for a Minecraft player and add their skin.</span>
              </div>
            </div>

            <div class="search-bar skin-search-bar">
              <input
                type="text"
                id="skin-username-input"
                placeholder="Enter Minecraft username..."
                autocomplete="off"
                spellcheck="false"
              />

              <button
                class="btn btn-primary skin-search-button"
                id="btn-search-player"
              >
                Search
              </button>
            </div>

            <div id="search-result" class="search-result hidden"></div>
          </section>

          <section class="skin-import-section">
            <button
              class="btn btn-secondary skin-import-button"
              id="btn-import-skin"
            >
              <span>＋</span>
              Import PNG Skin
            </button>

            <span class="skin-import-hint">
              Minecraft Java skins must be valid PNG files.
            </span>
          </section>

          <section class="skin-library-section">
            <div class="section-header skin-library-header">
              <div>
                <h3>My Skins</h3>
                <span class="skin-library-hint">
                  Click a skin to open the 3D preview.
                </span>
              </div>

              <span class="skin-count">0 skins</span>
            </div>

            <div class="skin-library-scroll">
              <div id="skin-grid" class="skin-grid"></div>

              <div id="empty-state" class="empty-state hidden">
                <div class="empty-icon">👕</div>
                <p>No skins in your library</p>
                <p class="empty-hint">
                  Search for a player or import a PNG skin.
                </p>
              </div>
            </div>
          </section>

        </div>
      </div>
    `;

    document.body.appendChild(this.modal);

    this.attachEvents();
    this.renderSkins();
  }

  private static async loadSkins(): Promise<void> {
    try {
      this.skins = await api.listSkins();
    } catch (error) {
      console.error('Failed to load skins:', error);
      this.skins = [];
    }
  }

  private static renderSkins(): void {
    if (!this.modal) return;

    this.disposeCardViewers();

    const grid =
      this.modal.querySelector('#skin-grid') as HTMLElement;

    const emptyState =
      this.modal.querySelector('#empty-state') as HTMLElement;

    const count =
      this.modal.querySelector('.skin-count') as HTMLElement;

    count.textContent =
      `${this.skins.length} skin${this.skins.length !== 1 ? 's' : ''}`;

    if (this.skins.length === 0) {
      grid.innerHTML = '';
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');

    grid.innerHTML = this.skins
      .map(skin => this.renderSkinCard(skin))
      .join('');

    requestAnimationFrame(() => {
      this.initializeCardViewers();
    });
  }

  private static renderSkinCard(skin: SkinMetadata): string {
    const isActive = skin.isActive;

    return `
      <article
        class="skin-card ${isActive ? 'active' : ''}"
        data-skin-id="${this.escapeHtml(skin.id)}"
      >

        <div class="skin-card-preview">
          <canvas
            class="skin-card-canvas"
            data-skin-id="${this.escapeHtml(skin.id)}"
            width="220"
            height="220"
            aria-label="${this.escapeHtml(skin.name)} preview"
          ></canvas>

          ${
            isActive
              ? '<span class="active-badge">Active</span>'
              : ''
          }
        </div>

        <div class="skin-info">
          <div class="skin-name-row">
            <span
              class="skin-name"
              title="${this.escapeHtml(skin.name)}"
            >
              ${this.escapeHtml(skin.name)}
            </span>
          </div>

          <div class="skin-meta">
            <span>
              ${skin.model === 'alex' ? 'Alex' : 'Steve'}
            </span>

            <span>
              ${skin.dimensions.width}×${skin.dimensions.height}
            </span>
          </div>

          ${
            skin.sourceUsername
              ? `
                <div class="skin-username">
                  @${this.escapeHtml(skin.sourceUsername)}
                </div>
              `
              : ''
          }
        </div>

        <div class="skin-actions">
          ${
            !isActive
              ? `
                <button
                  class="btn btn-sm btn-primary btn-set-active"
                  title="Set as active skin"
                >
                  Set Active
                </button>
              `
              : `
                <span class="skin-active-label">
                  Currently active
                </span>
              `
          }

          <div class="skin-secondary-actions">
            <button
              class="btn btn-sm btn-secondary btn-rename"
              title="Rename skin"
            >
              Rename
            </button>

            <button
              class="btn btn-sm btn-danger btn-delete"
              title="Delete skin"
              aria-label="Delete skin"
            >
              Delete
            </button>
          </div>
        </div>

      </article>
    `;
  }

  private static initializeCardViewers(): void {
    if (!this.modal) return;

    const canvases =
      this.modal.querySelectorAll<HTMLCanvasElement>(
        '.skin-card-canvas'
      );

    canvases.forEach(canvas => {
      const skinId = canvas.dataset.skinId;

      if (!skinId) return;

      const skin =
        this.skins.find(item => item.id === skinId);

      if (!skin) return;

      try {
        const viewer = new skinview3d.SkinViewer({
          canvas,
          width: 220,
          height: 220,
          skin: skin.thumbnail
        });

        viewer.fov = 55;
        viewer.zoom = 1.05;

        viewer.controls.enableRotate = true;
        viewer.controls.enableZoom = false;
        viewer.controls.enablePan = false;

        viewer.autoRotate = true;
        viewer.autoRotateSpeed = 0.45;

        this.cardViewers.set(skinId, viewer);
      } catch (error) {
        console.error(
          `Failed to create 3D preview for ${skin.name}:`,
          error
        );

        const wrapper = canvas.parentElement;

        if (wrapper) {
          wrapper.innerHTML = `
            <img
              src="${skin.thumbnail}"
              alt="${this.escapeHtml(skin.name)}"
              class="skin-image"
              draggable="false"
            />
          `;
        }
      }
    });
  }

  private static disposeCardViewers(): void {
    for (const viewer of this.cardViewers.values()) {
      try {
        viewer.dispose();
      } catch {
        // Ignore viewer cleanup errors.
      }
    }

    this.cardViewers.clear();
  }

  private static attachEvents(): void {
    if (!this.modal) return;

    const modal = this.modal;

    const closeButton =
      modal.querySelector(
        '.skin-close-btn'
      ) as HTMLButtonElement;

    closeButton.onclick = () => this.close();

    modal.onclick = (event: Event) => {
      if (event.target === modal) {
        this.close();
      }
    };

    const searchButton =
      modal.querySelector(
        '#btn-search-player'
      ) as HTMLButtonElement;

    const searchInput =
      modal.querySelector(
        '#skin-username-input'
      ) as HTMLInputElement;

    searchButton.onclick = () => {
      void this.handleSearch(searchInput.value);
    };

    searchInput.onkeydown = (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        void this.handleSearch(searchInput.value);
      }
    };

    const importButton =
      modal.querySelector(
        '#btn-import-skin'
      ) as HTMLButtonElement;

    importButton.onclick = () => {
      void this.handleImport();
    };

    const grid =
      modal.querySelector('#skin-grid') as HTMLElement;

    grid.onclick = (event: Event) => {
      const target = event.target as HTMLElement;

      const card =
        target.closest('.skin-card') as HTMLElement | null;

      if (!card) return;

      const skinId = card.dataset.skinId;

      if (!skinId) return;

      if (target.closest('.btn-set-active')) {
        void this.setActiveSkin(skinId);
        return;
      }

      if (target.closest('.btn-rename')) {
        void this.renameSkin(skinId);
        return;
      }

      if (target.closest('.btn-delete')) {
        void this.deleteSkin(skinId);
        return;
      }

      this.showSkinViewer(skinId);
    };

    const searchResult =
      modal.querySelector(
        '#search-result'
      ) as HTMLElement;

    /*
     * Search result is click-only.
     *
     * Clicking Download downloads the skin.
     * Clicking anywhere else on a valid search result
     * opens the full 3D preview.
     */
    searchResult.onclick = (event: Event) => {
      const target = event.target as HTMLElement;

      const downloadButton =
        target.closest(
          '.btn-download-skin'
        ) as HTMLButtonElement | null;

      if (downloadButton) {
        const username =
          downloadButton.dataset.username;

        if (username) {
          void this.downloadSkin(username);
        }

        return;
      }

      if (this.searchResult?.skinUrl) {
        this.showSearchSkinViewer(
          this.searchResult
        );
      }
    };

    document.addEventListener(
      'keydown',
      this.handleEscapeKey
    );
  }

  private static handleEscapeKey = (
    event: KeyboardEvent
  ): void => {
    if (event.key === 'Escape' && this.modal) {
      this.close();
    }
  };

  private static async handleSearch(
    username: string
  ): Promise<void> {
    if (!this.modal) return;

    const cleanUsername = username.trim();

    if (!cleanUsername) {
      NotificationToast.show(
        'Enter a Minecraft username.',
        'error'
      );
      return;
    }

    const searchButton =
      this.modal.querySelector(
        '#btn-search-player'
      ) as HTMLButtonElement;

    const resultDiv =
      this.modal.querySelector(
        '#search-result'
      ) as HTMLElement;

    searchButton.disabled = true;
    searchButton.textContent = 'Searching…';

    resultDiv.innerHTML = `
      <div class="skin-search-loading">
        <span class="loading-spinner"></span>
        <span>Searching Minecraft…</span>
      </div>
    `;

    resultDiv.classList.remove('hidden');

    try {
      const result =
        await api.searchPlayer(cleanUsername);

      if (result.success && result.result) {
        this.searchResult = result.result;
        this.renderSearchResult(result.result);
      } else {
        this.searchResult = null;

        resultDiv.innerHTML = `
          <div class="search-error">
            <span class="error-icon">!</span>
            <span>
              ${this.escapeHtml(
                result.error || 'Player not found.'
              )}
            </span>
          </div>
        `;
      }
    } catch (error) {
      this.searchResult = null;

      resultDiv.innerHTML = `
        <div class="search-error">
          <span class="error-icon">!</span>
          <span>
            Search failed:
            ${this.escapeHtml(
              error instanceof Error
                ? error.message
                : 'Unknown error'
            )}
          </span>
        </div>
      `;
    } finally {
      searchButton.disabled = false;
      searchButton.textContent = 'Search';
    }
  }

  private static renderSearchResult(
    result: SkinSearchResult
  ): void {
    if (!this.modal) return;

    const resultDiv =
      this.modal.querySelector(
        '#search-result'
      ) as HTMLElement;

    const hasSkin = Boolean(result.skinUrl);

    resultDiv.innerHTML = `
      <div
        class="search-result-card ${
          hasSkin
            ? 'search-result-has-skin'
            : ''
        }"
        ${
          hasSkin
            ? 'title="Click to open the 3D skin preview"'
            : ''
        }
      >

        <div class="search-result-preview">
          ${
            hasSkin
              ? `
                <canvas
                  class="search-result-skin-canvas"
                  width="150"
                  height="190"
                ></canvas>
              `
              : `
                <div class="player-avatar">
                  <img
                    src="${this.getHeadPreviewUrl(
                      result.username
                    )}"
                    alt="${this.escapeHtml(
                      result.username
                    )}"
                    draggable="false"
                  />
                </div>
              `
          }
        </div>

        <div class="player-details">
          <h4>
            ${this.escapeHtml(result.username)}
          </h4>

          <p class="player-uuid">
            ${this.escapeHtml(result.uuid)}
          </p>

          ${
            hasSkin
              ? `
                <p class="has-skin">
                  ✓ Skin available
                </p>

                <span class="search-preview-hint">
                  Click to open 3D preview
                </span>
              `
              : `
                <p class="no-skin">
                  No custom skin available
                </p>
              `
          }
        </div>

        ${
          hasSkin
            ? `
              <div class="player-actions">
                <button
                  class="btn btn-primary btn-download-skin"
                  data-username="${this.escapeHtml(
                    result.username
                  )}"
                >
                  Download Skin
                </button>
              </div>
            `
            : ''
        }

      </div>
    `;

    if (hasSkin) {
      requestAnimationFrame(() => {
        this.initializeSearchResultViewer(
          result
        );
      });
    }
  }

  private static initializeSearchResultViewer(
    result: SkinSearchResult
  ): void {
    if (!this.modal || !result.skinUrl) {
      return;
    }

    const canvas =
      this.modal.querySelector(
        '.search-result-skin-canvas'
      ) as HTMLCanvasElement | null;

    if (!canvas) return;

    try {
      const viewer =
        new skinview3d.SkinViewer({
          canvas,
          width: 150,
          height: 190,
          skin: result.skinUrl
        });

      viewer.fov = 55;
      viewer.zoom = 0.95;

      viewer.controls.enableRotate = false;
      viewer.controls.enableZoom = false;
      viewer.controls.enablePan = false;

      viewer.autoRotate = true;
      viewer.autoRotateSpeed = 0.5;
    } catch (error) {
      console.error(
        'Failed to create searched skin preview:',
        error
      );

      const wrapper =
        canvas.parentElement;

      if (wrapper) {
        wrapper.innerHTML = `
          <img
            src="${this.getHeadPreviewUrl(
              result.username
            )}"
            alt="${this.escapeHtml(
              result.username
            )}"
            class="search-result-head-fallback"
            draggable="false"
          />
        `;
      }
    }
  }

  private static getHeadPreviewUrl(
    username: string
  ): string {
    return `https://api.mineatar.io/face/${encodeURIComponent(
      username
    )}?scale=128`;
  }

  private static showSearchSkinViewer(
    result: SkinSearchResult
  ): void {
    if (!this.modal || !result.skinUrl) {
      return;
    }

    const existing =
      this.modal.querySelector(
        '.search-skin-viewer-overlay'
      );

    if (existing) return;

    const viewerOverlay =
      document.createElement('div');

    viewerOverlay.className =
      'skin-viewer-overlay search-skin-viewer-overlay';

    viewerOverlay.innerHTML = `
      <div class="skin-viewer-card">

        <div class="skin-viewer-header">
          <div>
            <h3>
              ${this.escapeHtml(
                result.username
              )}
            </h3>

            <span>
              Minecraft player skin
            </span>
          </div>

          <button
            class="btn btn-secondary btn-icon skin-viewer-close"
            title="Close preview"
            aria-label="Close preview"
          >
            ×
          </button>
        </div>

        <div class="skin-viewer-preview">
          <canvas
            class="skin-viewer-canvas search-full-viewer-canvas"
            width="360"
            height="460"
          ></canvas>
        </div>

        <div class="skin-viewer-footer">
          <span>
            Drag to rotate • Scroll to zoom
          </span>

          <button
            class="btn btn-primary btn-download-search-viewer"
          >
            Download Skin
          </button>
        </div>

      </div>
    `;

    this.modal.appendChild(
      viewerOverlay
    );

    const canvas =
      viewerOverlay.querySelector(
        '.search-full-viewer-canvas'
      ) as HTMLCanvasElement;

    let viewer:
      skinview3d.SkinViewer | null = null;

    try {
      viewer =
        new skinview3d.SkinViewer({
          canvas,
          width: 360,
          height: 460,
          skin: result.skinUrl
        });

      viewer.fov = 70;
      viewer.zoom = 0.8;

      viewer.controls.enableRotate = true;
      viewer.controls.enableZoom = true;
      viewer.controls.enablePan = false;

      viewer.autoRotate = true;
      viewer.autoRotateSpeed = 0.7;
    } catch (error) {
      console.error(
        'Failed to create searched skin 3D viewer:',
        error
      );

      const preview =
        viewerOverlay.querySelector(
          '.skin-viewer-preview'
        ) as HTMLElement;

      preview.innerHTML = `
        <div class="skin-viewer-error">
          <span>!</span>
          <p>
            Unable to create 3D skin preview.
          </p>
        </div>
      `;
    }

    const closeViewer = (): void => {
      try {
        viewer?.dispose();
      } catch {
        // Ignore cleanup errors.
      }

      viewerOverlay.remove();
    };

    (
      viewerOverlay.querySelector(
        '.skin-viewer-close'
      ) as HTMLButtonElement
    ).onclick = closeViewer;

    const downloadButton =
      viewerOverlay.querySelector(
        '.btn-download-search-viewer'
      ) as HTMLButtonElement;

    downloadButton.onclick = () => {
      void this.downloadSkin(
        result.username
      );

      closeViewer();
    };

    viewerOverlay.onclick = (
      event: Event
    ) => {
      if (event.target === viewerOverlay) {
        closeViewer();
      }
    };
  }

  private static showSkinViewer(
    skinId: string
  ): void {
    const skin =
      this.skins.find(
        item => item.id === skinId
      );

    if (!skin || !this.modal) return;

    const viewerOverlay =
      document.createElement('div');

    viewerOverlay.className =
      'skin-viewer-overlay';

    viewerOverlay.innerHTML = `
      <div class="skin-viewer-card">

        <div class="skin-viewer-header">
          <div>
            <h3>
              ${this.escapeHtml(
                skin.name
              )}
            </h3>

            <span>
              ${
                skin.model === 'alex'
                  ? 'Alex model'
                  : 'Steve model'
              }
            </span>
          </div>

          <button
            class="btn btn-secondary btn-icon skin-viewer-close"
            title="Close preview"
            aria-label="Close preview"
          >
            ×
          </button>
        </div>

        <div class="skin-viewer-preview">
          <canvas
            class="skin-viewer-canvas"
            width="320"
            height="420"
          ></canvas>
        </div>

        <div class="skin-viewer-footer">
          <span>
            ${skin.dimensions.width}×${skin.dimensions.height} PNG
          </span>

          ${
            skin.isActive
              ? '<span class="viewer-active">Active skin</span>'
              : ''
          }
        </div>

      </div>
    `;

    this.modal.appendChild(
      viewerOverlay
    );

    const canvas =
      viewerOverlay.querySelector(
        '.skin-viewer-canvas'
      ) as HTMLCanvasElement;

    let viewer:
      skinview3d.SkinViewer | null = null;

    try {
      viewer =
        new skinview3d.SkinViewer({
          canvas,
          width: 320,
          height: 420,
          skin: skin.thumbnail
        });

      viewer.fov = 70;
      viewer.zoom = 0.75;

      viewer.controls.enableRotate = true;
      viewer.controls.enableZoom = true;
      viewer.controls.enablePan = false;

      viewer.autoRotate = true;
      viewer.autoRotateSpeed = 0.8;
    } catch (error) {
      console.error(
        'Failed to create skin viewer:',
        error
      );

      const preview =
        viewerOverlay.querySelector(
          '.skin-viewer-preview'
        ) as HTMLElement;

      preview.innerHTML = `
        <div class="skin-viewer-error">
          <span>!</span>
          <p>
            Unable to create 3D skin preview.
          </p>
        </div>
      `;
    }

    const closeViewer = (): void => {
      try {
        viewer?.dispose();
      } catch {
        // Ignore cleanup errors.
      }

      viewerOverlay.remove();
    };

    (
      viewerOverlay.querySelector(
        '.skin-viewer-close'
      ) as HTMLButtonElement
    ).onclick = closeViewer;

    viewerOverlay.onclick = (
      event: Event
    ) => {
      if (event.target === viewerOverlay) {
        closeViewer();
      }
    };
  }

  private static async handleImport(): Promise<void> {
    try {
      const filePath =
        await api.selectFileDialog([
          {
            name: 'PNG Images',
            extensions: ['png']
          },
          {
            name: 'All Files',
            extensions: ['*']
          }
        ]);

      if (!filePath) return;

      const validation =
        await api.validateSkin(
          filePath
        );

      if (!validation.isValid) {
        NotificationToast.show(
          `Invalid skin: ${
            validation.error ||
            'Unknown validation error'
          }`,
          'error'
        );
        return;
      }

      const result =
        await api.importSkin(
          filePath
        );

      if (result.success && result.skin) {
        NotificationToast.show(
          `Imported "${result.skin.name}"`,
          'success'
        );

        await this.loadSkins();
        this.renderSkins();

        if (result.skin.isActive) {
          window.dispatchEvent(
            new CustomEvent(
              'voxelplus-skin-changed'
            )
          );
        }
      } else {
        NotificationToast.show(
          `Import failed: ${
            result.error ||
            'Unknown error'
          }`,
          'error'
        );
      }
    } catch (error) {
      NotificationToast.show(
        `Import error: ${
          error instanceof Error
            ? error.message
            : 'Unknown error'
        }`,
        'error'
      );
    }
  }

  private static async downloadSkin(
    username: string
  ): Promise<void> {
    try {
      const result =
        await api.downloadSkin(
          username
        );

      if (result.success && result.skin) {
        NotificationToast.show(
          `Downloaded "${result.skin.name}"`,
          'success'
        );

        await this.loadSkins();
        this.renderSkins();

        if (result.skin.isActive) {
          window.dispatchEvent(
            new CustomEvent(
              'voxelplus-skin-changed'
            )
          );
        }

        if (this.modal) {
          const resultDiv =
            this.modal.querySelector(
              '#search-result'
            ) as HTMLElement;

          resultDiv.innerHTML = '';
          resultDiv.classList.add(
            'hidden'
          );

          const input =
            this.modal.querySelector(
              '#skin-username-input'
            ) as HTMLInputElement;

          input.value = '';
          input.focus();
        }
      } else {
        NotificationToast.show(
          `Download failed: ${
            result.error ||
            'Unknown error'
          }`,
          'error'
        );
      }
    } catch (error) {
      NotificationToast.show(
        `Download error: ${
          error instanceof Error
            ? error.message
            : 'Unknown error'
        }`,
        'error'
      );
    }
  }

  private static async setActiveSkin(
    skinId: string
  ): Promise<void> {
    try {
      const result =
        await api.setActiveSkin(
          skinId
        );

      if (result.success) {
        await this.loadSkins();
        this.renderSkins();

        window.dispatchEvent(
          new CustomEvent(
            'voxelplus-skin-changed'
          )
        );

        NotificationToast.show(
          'Skin set as active.',
          'success'
        );
      } else {
        NotificationToast.show(
          `Failed to set active: ${
            result.error ||
            'Unknown error'
          }`,
          'error'
        );
      }
    } catch (error) {
      NotificationToast.show(
        `Error: ${
          error instanceof Error
            ? error.message
            : 'Unknown error'
        }`,
        'error'
      );
    }
  }

  private static async renameSkin(
    skinId: string
  ): Promise<void> {
    const skin =
      this.skins.find(
        item => item.id === skinId
      );

    if (!skin || !this.modal) return;

    this.showRenameDialog(skin);
  }

  private static showRenameDialog(
    skin: SkinMetadata
  ): void {
    if (!this.modal) return;

    const existing =
      this.modal.querySelector(
        '.skin-rename-overlay'
      );

    if (existing) {
      existing.remove();
    }

    const overlay =
      document.createElement('div');

    overlay.className =
      'skin-viewer-overlay skin-rename-overlay';

    overlay.innerHTML = `
      <div class="skin-rename-card">

        <div class="skin-viewer-header">
          <div>
            <h3>Rename Skin</h3>
            <span>
              Choose a new name for this skin.
            </span>
          </div>

          <button
            class="btn btn-secondary btn-icon rename-close"
            title="Close"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div class="skin-rename-body">
          <label
            for="skin-rename-input"
          >
            Skin name
          </label>

          <input
            id="skin-rename-input"
            class="skin-rename-input"
            type="text"
            maxlength="64"
            value="${this.escapeHtml(
              skin.name
            )}"
            autocomplete="off"
            spellcheck="false"
          />

          <p class="skin-rename-hint">
            Give this skin a name you'll recognize
            in your library.
          </p>
        </div>

        <div class="skin-rename-actions">
          <button
            class="btn btn-secondary rename-cancel"
          >
            Cancel
          </button>

          <button
            class="btn btn-primary rename-save"
          >
            Save Name
          </button>
        </div>

      </div>
    `;

    this.modal.appendChild(
      overlay
    );

    const input =
      overlay.querySelector(
        '#skin-rename-input'
      ) as HTMLInputElement;

    const close = (): void => {
      overlay.remove();
    };

    const save = async (): Promise<void> => {
      const newName =
        input.value.trim();

      if (!newName) {
        NotificationToast.show(
          'Enter a skin name.',
          'error'
        );

        input.focus();
        return;
      }

      if (newName.length > 64) {
        NotificationToast.show(
          'Skin name must be 64 characters or fewer.',
          'error'
        );

        input.focus();
        return;
      }

      if (newName === skin.name) {
        close();
        return;
      }

      const saveButton =
        overlay.querySelector(
          '.rename-save'
        ) as HTMLButtonElement;

      saveButton.disabled = true;
      saveButton.textContent =
        'Saving…';

      try {
        const result =
          await api.renameSkin(
            skin.id,
            newName
          );

        if (result.success) {
          close();

          await this.loadSkins();
          this.renderSkins();

          NotificationToast.show(
            'Skin renamed.',
            'success'
          );
        } else {
          NotificationToast.show(
            `Rename failed: ${
              result.error ||
              'Unknown error'
            }`,
            'error'
          );

          saveButton.disabled = false;
          saveButton.textContent =
            'Save Name';
        }
      } catch (error) {
        NotificationToast.show(
          `Rename error: ${
            error instanceof Error
              ? error.message
              : 'Unknown error'
          }`,
          'error'
        );

        saveButton.disabled = false;
        saveButton.textContent =
          'Save Name';
      }
    };

    (
      overlay.querySelector(
        '.rename-close'
      ) as HTMLButtonElement
    ).onclick = close;

    (
      overlay.querySelector(
        '.rename-cancel'
      ) as HTMLButtonElement
    ).onclick = close;

    (
      overlay.querySelector(
        '.rename-save'
      ) as HTMLButtonElement
    ).onclick = () => {
      void save();
    };

    input.onkeydown = (
      event: KeyboardEvent
    ) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        void save();
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    };

    overlay.onclick = (
      event: Event
    ) => {
      if (event.target === overlay) {
        close();
      }
    };

    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  }

  private static async deleteSkin(
    skinId: string
  ): Promise<void> {
    const skin =
      this.skins.find(
        item => item.id === skinId
      );

    if (!skin) return;

    const confirmed =
      await ConfirmDialog.show({
        title: `Delete "${skin.name}"?`,
        message:
          'This will permanently delete this skin from your library.',
        confirmText: 'Delete Skin',
        isDanger: true
      });

    if (!confirmed) return;

    try {
      const result =
        await api.deleteSkin(
          skinId
        );

      if (result.success) {
        await this.loadSkins();
        this.renderSkins();

        window.dispatchEvent(
          new CustomEvent(
            'voxelplus-skin-changed'
          )
        );

        NotificationToast.show(
          'Skin deleted.',
          'success'
        );
      } else {
        NotificationToast.show(
          `Delete failed: ${
            result.error ||
            'Unknown error'
          }`,
          'error'
        );
      }
    } catch (error) {
      NotificationToast.show(
        `Delete error: ${
          error instanceof Error
            ? error.message
            : 'Unknown error'
        }`,
        'error'
      );
    }
  }

  private static close(): void {
    if (!this.modal) return;

    document.removeEventListener(
      'keydown',
      this.handleEscapeKey
    );

    this.disposeCardViewers();

    this.modal
      .querySelectorAll(
        '.skin-viewer-overlay'
      )
      .forEach(element => {
        element.remove();
      });

    this.modal.remove();

    this.modal = null;
    this.searchResult = null;
  }

  private static escapeHtml(
    text: string
  ): string {
    const div =
      document.createElement('div');

    div.textContent = text;

    return div.innerHTML;
  }
}
