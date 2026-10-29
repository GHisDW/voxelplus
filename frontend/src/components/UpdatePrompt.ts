import { UpdateInfo, UpdateProgressEvent } from '../../../electron/types';
import { api } from '../services/api';
import { describeIpcError } from '../services/errors';

/**
 * Startup update prompt.
 *
 * - Optional releases: dismissible, with "Update later".
 * - Mandatory releases (`[mandatory]`, a raised `[min:...]`, or a major bump):
 *   not dismissible. The user can still quit or open the release page, so a
 *   failed download can never trap them in the app.
 *
 * Installing only swaps the launcher executable (see applyScript.ts); user
 * data, instances and VPack caches are never touched.
 */
export class UpdatePrompt {
  private static overlay: HTMLElement | null = null;
  private static unsubscribeProgress: (() => void) | null = null;
  private static busy = false;

  public static show(info: UpdateInfo): void {
    if (this.overlay || !info || info.status !== 'available') return;

    const mandatory = Boolean(info.mandatory);
    const overlay = document.createElement('div');
    overlay.className = 'update-overlay';
    overlay.dataset.mandatory = String(mandatory);

    const card = document.createElement('div');
    card.className = 'update-card';

    const badge = document.createElement('div');
    badge.className = `update-badge ${mandatory ? 'update-badge-required' : ''}`;
    badge.textContent = mandatory ? 'REQUIRED UPDATE' : 'UPDATE AVAILABLE';

    const title = document.createElement('h2');
    title.className = 'update-title';
    title.textContent = info.releaseName || `Voxel+ ${info.latestVersion}`;

    const version = document.createElement('p');
    version.className = 'update-version';
    version.textContent = `v${info.currentVersion}  →  v${info.latestVersion}`;

    const blurb = document.createElement('p');
    blurb.className = 'update-blurb';
    blurb.textContent = mandatory
      ? 'This release must be installed before you can keep using the launcher. Your instances, worlds and settings are kept exactly as they are.'
      : 'A newer launcher build is available. Updating replaces only the launcher file — your instances, worlds and settings stay untouched.';

    card.append(badge, title, version, blurb);

    if (info.releaseNotes) {
      const notes = document.createElement('div');
      notes.className = 'update-notes';
      notes.textContent = info.releaseNotes;
      card.appendChild(notes);
    }

    const progressWrap = document.createElement('div');
    progressWrap.className = 'update-progress-wrap';
    progressWrap.hidden = true;
    const progressLabel = document.createElement('div');
    progressLabel.className = 'update-progress-label';
    const progressTrack = document.createElement('div');
    progressTrack.className = 'update-progress-track';
    const progressFill = document.createElement('div');
    progressFill.className = 'update-progress-fill';
    progressTrack.appendChild(progressFill);
    progressWrap.append(progressLabel, progressTrack);

    const status = document.createElement('p');
    status.className = 'update-status';

    const actions = document.createElement('div');
    actions.className = 'update-actions';

    const installBtn = document.createElement('button');
    installBtn.className = 'btn btn-primary update-install';
    installBtn.textContent = 'Update now';
    installBtn.onclick = () => void this.startUpdate(info, {
      installBtn, progressWrap, progressLabel, progressFill, status, actions, card
    });

    const pageBtn = document.createElement('button');
    pageBtn.className = 'btn btn-secondary';
    pageBtn.textContent = 'Release page';
    pageBtn.onclick = () => void api.openReleasePage(info.releaseUrl || undefined);

    const quitBtn = document.createElement('button');
    quitBtn.className = 'btn btn-secondary';
    quitBtn.textContent = 'Quit';
    quitBtn.onclick = () => void api.quitApp();

    actions.append(installBtn, pageBtn);

    if (mandatory) {
      actions.appendChild(quitBtn);
    } else {
      const laterBtn = document.createElement('button');
      laterBtn.className = 'btn btn-secondary';
      laterBtn.textContent = 'Later';
      laterBtn.onclick = () => this.close();
      actions.appendChild(laterBtn);
    }

    card.append(progressWrap, status, actions);
    overlay.appendChild(card);

    if (!mandatory) {
      overlay.addEventListener('click', event => {
        if (event.target === overlay && !this.busy) this.close();
      });
    }

    document.body.appendChild(overlay);
    this.overlay = overlay;
    installBtn.focus();
  }

  public static close(): void {
    if (this.unsubscribeProgress) {
      this.unsubscribeProgress();
      this.unsubscribeProgress = null;
    }
    this.overlay?.remove();
    this.overlay = null;
    this.busy = false;
  }

  private static async startUpdate(
    info: UpdateInfo,
    ui: {
      installBtn: HTMLButtonElement;
      progressWrap: HTMLElement;
      progressLabel: HTMLElement;
      progressFill: HTMLElement;
      status: HTMLElement;
      actions: HTMLElement;
      card: HTMLElement;
    }
  ): Promise<void> {
    if (this.busy) return;
    this.busy = true;

    ui.installBtn.disabled = true;
    ui.installBtn.textContent = 'Preparing…';
    ui.status.textContent = '';

    if (!info.asset) {
      ui.status.textContent = 'This release has no downloadable launcher file. Open the release page to update manually.';
      this.busy = false;
      ui.installBtn.disabled = false;
      ui.installBtn.textContent = 'Update now';
      return;
    }

    ui.progressWrap.hidden = false;
    this.unsubscribeProgress?.();
    this.unsubscribeProgress = api.onUpdateProgress((event: UpdateProgressEvent) => {
      ui.progressFill.style.width = `${Math.max(0, Math.min(100, event.percent))}%`;
      const mb = (event.received / (1024 * 1024)).toFixed(1);
      const totalMb = event.total > 0 ? (event.total / (1024 * 1024)).toFixed(1) : '?';
      ui.progressLabel.textContent = `Downloading ${event.fileName} — ${mb} / ${totalMb} MB (${event.percent}%)`;
    });

    ui.status.textContent = 'Downloading update…';
    try {
      await api.downloadUpdate(info.asset);

      if (info.canAutoInstall) {
        ui.status.textContent = 'Download verified. Restarting into the new version…';
        const result = await api.installUpdate();
        if (!result.started) {
          this.showManualFallback(info, ui, `Automatic install failed (${result.reason || 'unknown reason'}).`);
        }
        return;
      }

      this.showManualFallback(info, ui, '');
    } catch (error) {
      ui.status.textContent = `Update failed: ${describeIpcError(error)}`;
      ui.installBtn.disabled = false;
      ui.installBtn.textContent = 'Retry update';
      this.busy = false;
    } finally {
      this.unsubscribeProgress?.();
      this.unsubscribeProgress = null;
    }
  }

  private static showManualFallback(
    info: UpdateInfo,
    ui: { installBtn: HTMLButtonElement; status: HTMLElement; actions: HTMLElement; card: HTMLElement },
    reason: string
  ): void {
    this.busy = false;
    const message = [
      reason,
      'The new build was downloaded to your Voxel+ downloads folder. Open the release page and replace VoxelPlus.exe — your portable data folder and instances stay exactly where they are.'
    ].filter(Boolean).join(' ');
    ui.status.textContent = message;
    ui.installBtn.disabled = false;
    ui.installBtn.textContent = 'Open release page';
    ui.installBtn.onclick = () => void api.openReleasePage(info.releaseUrl || undefined);
  }
}
