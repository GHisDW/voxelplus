import { InstanceMetadata } from '../../../electron/types';
import { api } from '../services/api';
import { getArtworkStyle } from '../assets/artworks';
import { getItemDataUrl } from '../assets/items';
import { ConfirmDialog } from './ConfirmDialog';
import { NotificationToast } from './NotificationToast';
import { JavaManagerModal } from './JavaManagerModal';
import { describeIpcError } from '../services/errors';
import { escapeHtml } from '../utils/html';

export interface InstanceCardEvents {
  onOpenDetails: (instanceId: string) => void;
  onRefresh: () => void;
  onViewLogs: (instanceId: string) => void;
}

export class InstanceCard {
  public static render(instance: InstanceMetadata, events: InstanceCardEvents): HTMLElement {
    const card = document.createElement('div');
    card.className = 'instance-card animate-fade-in-up';
    card.setAttribute('data-instance-id', instance.id);

    const isRunning = ['PREPARING', 'STARTING', 'LAUNCHING', 'RUNNING'].includes(instance.status);
    const isError = instance.status === 'ERROR';
    const lastPlayedText = instance.lastPlayedAt
      ? `Last played ${this.formatRelativeTime(new Date(instance.lastPlayedAt))}`
      : 'Never played';

    const itemUrl = getItemDataUrl(instance.appearance.item);
    const artworkStyle = getArtworkStyle(instance.appearance.artwork);

    // Edge glow color based on status/loader
    const edgeColor = isRunning
      ? 'rgba(6, 182, 212, 0.6)'
      : isError
        ? 'rgba(239, 68, 68, 0.5)'
        : instance.isFavorite
          ? 'rgba(251, 191, 36, 0.5)'
          : 'rgba(99, 102, 241, 0.25)';

    card.innerHTML = `
      <!-- Animated Edge Border/Glow -->
      <div class="card-edge-glow" style="--glow-color: ${edgeColor};"></div>

      <!-- Left: Artwork Banner -->
      <div class="card-artwork-col">
        <div class="card-artwork" style="background: ${artworkStyle};">
          <!-- Overlay -->
          <div class="artwork-overlay"></div>

          <!-- Minecraft Item Badge -->
          <div class="card-item-badge">
            <img src="${itemUrl}" width="32" height="32" style="image-rendering: pixelated; display: block;" />
          </div>

          <!-- Running pulse ring -->
          ${isRunning ? `<div class="card-running-ring"></div>` : ''}

          <!-- Loader Chip -->
          <div class="card-loader-chip">${(instance.loader?.type || 'fabric').toUpperCase()}</div>
        </div>
      </div>

      <!-- Center: Main Information -->
      <div class="card-info-col">
        <div class="card-title-row">
          <h3 class="card-instance-name">${escapeHtml(instance.name)}</h3>
          ${instance.isVPack ? `
            <span style="font-size: 0.72rem; padding: 2px 8px; border-radius: 999px; background: rgba(245, 158, 11, 0.18); color: var(--warning); font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">
              📦 VPACK
            </span>
          ` : ''}
          ${instance.shareSource ? `
            <span style="font-size: 0.72rem; padding: 2px 8px; border-radius: 999px; background: rgba(88, 101, 242, 0.18); color: var(--text-accent); font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">
              <span style="opacity: 0.7;">VIA</span> ${escapeHtml(instance.shareSource)}
            </span>
          ` : ''}
          <button class="btn-fav" title="${instance.isFavorite ? 'Unfavorite' : 'Favorite'}">
            ${instance.isFavorite ? '★' : '☆'}
          </button>
        </div>
        ${instance.description ? `
          <div style="font-size: 0.78rem; color: var(--text-secondary); margin: 2px 0 6px 0; line-height: 1.3;">
            ${escapeHtml(instance.description)}
          </div>
        ` : ''}

        <div class="card-meta-row">
          <div class="card-meta-chip">
            <img src="${getItemDataUrl('minecraft:grass_block')}" style="width: 14px; height: 14px; image-rendering: pixelated;" />
            <span>Minecraft ${instance.minecraft.version}</span>
          </div>
          <div class="card-meta-chip">
            <img src="${getItemDataUrl('minecraft:redstone')}" style="width: 14px; height: 14px; image-rendering: pixelated;" />
            <span>Java ${this.javaVersionForMc(instance.minecraft.version)}</span>
          </div>
          <div class="card-meta-chip">
            <img src="${getItemDataUrl('minecraft:iron_ingot')}" style="width: 14px; height: 14px; image-rendering: pixelated;" />
            <span>${(instance.runtime.memoryMb || 4096) / 1024} GB RAM</span>
          </div>
          <div class="status-pill ${instance.status.toLowerCase()}">
            <span class="status-dot ${isRunning ? 'animate-pulse' : ''}"></span>
            ${instance.status}
          </div>
        </div>

        <div class="card-content-row">
          <div class="content-pill mods" style="display: inline-flex; align-items: center; gap: 6px;">
            <img src="${getItemDataUrl('minecraft:crafting_table')}" style="width: 13px; height: 13px; image-rendering: pixelated;" />
            <span>${instance.modCount || 0} Mods</span>
          </div>
          <div class="content-pill packs" style="display: inline-flex; align-items: center; gap: 6px;">
            <img src="${getItemDataUrl('minecraft:enchanted_book')}" style="width: 13px; height: 13px; image-rendering: pixelated;" />
            <span>${instance.resourcePackCount || 0} Packs</span>
          </div>
          <div class="content-pill shaders" style="display: inline-flex; align-items: center; gap: 6px;">
            <img src="${getItemDataUrl('minecraft:spyglass')}" style="width: 13px; height: 13px; image-rendering: pixelated;" />
            <span>${instance.shaderCount || 0} Shaders</span>
          </div>
          <span class="card-last-played">
            ${lastPlayedText}
          </span>
        </div>

        ${isError ? `
        <div class="card-error-row">
          <span class="error-icon">⚠</span>
          Launch failed — <button class="card-inline-link" data-action="logs">View Logs</button> or <button class="card-inline-link" data-action="play">Retry</button>
        </div>
        ` : ''}
      </div>

      <!-- Right: Actions -->
      <div class="card-actions-col">
        ${isRunning
          ? `<button class="btn btn-stop btn-action-stop">■ STOP</button>`
          : `<button class="btn btn-play btn-action-play">▶ PLAY</button>`
        }
        <div class="card-secondary-actions">
          <button class="btn btn-secondary btn-sm" data-action="open">Details</button>
          <button class="btn btn-icon btn-card-delete" style="color: var(--danger);" title="Delete instance">🗑</button>
          <div style="position: relative;">
            <button class="btn btn-icon btn-more" title="More options">•••</button>
            <div class="dropdown-menu">
              <button class="btn-menu-item" data-action="open">📂 Open Details</button>
              <button class="btn-menu-item" data-action="folder">📁 Open Folder</button>
              <button class="btn-menu-item" data-action="logs">▣ View Logs</button>
              <button class="btn-menu-item" data-action="duplicate">📋 Duplicate</button>
              <button class="btn-menu-item" data-action="export">📦 Export</button>
              <div class="menu-separator"></div>
              <button class="btn-menu-item danger" data-action="delete">🗑 Delete</button>
            </div>
          </div>
        </div>
      </div>
    `;

    this.attachEvents(card, instance, events);
    return card;
  }

  private static attachEvents(card: HTMLElement, instance: InstanceMetadata, events: InstanceCardEvents): void {
    // Card click → open details (but not when clicking controls)
    card.onclick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.card-actions-col') || target.closest('.btn-fav')) return;
      events.onOpenDetails(instance.id);
    };

    // Favorite button
    const favBtn = card.querySelector('.btn-fav') as HTMLElement;
    favBtn.onclick = async (e) => {
      e.stopPropagation();
      const updated = !instance.isFavorite;
      await api.updateInstance(instance.id, { isFavorite: updated });
      instance.isFavorite = updated;
      favBtn.style.color = updated ? '#fbbf24' : 'var(--text-muted)';
      favBtn.textContent = updated ? '★' : '☆';
      const edgeGlow = card.querySelector('.card-edge-glow') as HTMLElement;
      if (edgeGlow) {
        edgeGlow.style.setProperty('--glow-color', updated ? 'rgba(251, 191, 36, 0.5)' : 'rgba(99, 102, 241, 0.25)');
      }
    };

    // Play button
    const playBtn = card.querySelector('.btn-action-play') as HTMLButtonElement;
    if (playBtn) {
      playBtn.onclick = async (e) => {
        e.stopPropagation();
        playBtn.disabled = true;
        playBtn.innerHTML = '<span class="animate-spin">↻</span> LAUNCHING...';
        try {
          const res = await api.launchInstance(instance.id);
          if (res.success) {
            NotificationToast.show(`Launching "${instance.name}" development client…`, 'info');
          } else {
            playBtn.disabled = false;
            playBtn.innerHTML = '▶ PLAY';

            if (res.requiresJavaInstall && res.recommendedJavaVersion) {
              const confirmed = await ConfirmDialog.show({
                title: 'Java Version Required',
                message: `This instance requires Java ${res.recommendedJavaVersion} to run. Would you like to install it now?`,
                confirmText: 'Install Java',
                isDanger: false
              });

              if (confirmed) {
                // Open the manager with the required version preselected so the
                // prompt's "Install Java" action really installs that version.
                const target = Number(res.recommendedJavaVersion);
                const installVersion = [8, 17, 21, 25].includes(target) ? (target as 8 | 17 | 21 | 25) : undefined;
                JavaManagerModal.show(undefined, { installVersion });
              } else {
                NotificationToast.show(res.message || 'Launch cancelled.', 'error');
              }
            } else {
              NotificationToast.show(`Launch failed: ${res.message}`, 'error');
            }
          }
        } catch (err: any) {
          playBtn.disabled = false;
          playBtn.innerHTML = '▶ PLAY';
          NotificationToast.show(describeIpcError(err), 'error');
        }
      };
    }

    // Stop button
    const stopBtn = card.querySelector('.btn-action-stop') as HTMLButtonElement;
    if (stopBtn) {
      stopBtn.onclick = async (e) => {
        e.stopPropagation();
        stopBtn.disabled = true;
        stopBtn.textContent = 'Stopping…';
        await api.stopInstance(instance.id);
        NotificationToast.show(`Stopped "${instance.name}".`, 'info');
      };
    }

    // Direct card delete button
    const cardDelBtn = card.querySelector('.btn-card-delete') as HTMLElement;
    if (cardDelBtn) {
      cardDelBtn.onclick = async (e) => {
        e.stopPropagation();
        const confirmed = await ConfirmDialog.show({
          title: `Delete "${instance.name}"?`,
          message: `Permanently delete this development instance and all installed mods, configurations, and saves? This cannot be undone.`,
          confirmText: 'Delete Instance',
          isDanger: true
        });
        if (confirmed) {
          await api.deleteInstance(instance.id);
          NotificationToast.show(`"${instance.name}" deleted.`, 'info');
          events.onRefresh();
        }
      };
    }

    // Inline error action links
    card.querySelectorAll('.card-inline-link').forEach(link => {
      (link as HTMLElement).onclick = async (e) => {
        e.stopPropagation();
        const action = link.getAttribute('data-action');
        if (action === 'logs') events.onViewLogs(instance.id);
        else if (action === 'play') {
          const res = await api.launchInstance(instance.id);
          if (!res.success) NotificationToast.show(`Retry failed: ${res.message}`, 'error');
        }
      };
    });

    // Details shortcut
    const detailsBtn = card.querySelector('[data-action="open"].btn-sm') as HTMLElement;
    if (detailsBtn) {
      detailsBtn.onclick = (e) => {
        e.stopPropagation();
        events.onOpenDetails(instance.id);
      };
    }

    // More dropdown
    const moreBtn = card.querySelector('.btn-more') as HTMLElement;
    const dropdown = card.querySelector('.dropdown-menu') as HTMLElement;

    moreBtn.onclick = (e) => {
      e.stopPropagation();
      const isVisible = dropdown.classList.contains('open');
      document.querySelectorAll('.dropdown-menu.open').forEach(d => d.classList.remove('open'));
      if (!isVisible) dropdown.classList.add('open');
    };

    document.addEventListener('click', () => dropdown.classList.remove('open'), { capture: false });

    dropdown.querySelectorAll('.btn-menu-item').forEach(item => {
      const btn = item as HTMLElement;
      btn.onclick = async (e) => {
        e.stopPropagation();
        dropdown.classList.remove('open');
        const action = btn.getAttribute('data-action');

        if (action === 'open') {
          events.onOpenDetails(instance.id);
        } else if (action === 'folder') {
          await api.openInstanceFolder(instance.id);
        } else if (action === 'logs') {
          events.onViewLogs(instance.id);
        } else if (action === 'duplicate') {
          const dup = await api.duplicateInstance(instance.id);
          if (dup) {
            NotificationToast.show(`Duplicated as "${dup.name}"`, 'success');
            events.onRefresh();
          }
        } else if (action === 'export') {
          const savePath = await api.selectSaveFileDialog(`${instance.name}.voxelplus`);
          if (savePath) {
            const ok = await api.exportInstance(instance.id, savePath);
            NotificationToast.show(ok ? `Exported to ${savePath}` : `Export failed`, ok ? 'success' : 'error');
          }
        } else if (action === 'delete') {
          const confirmed = await ConfirmDialog.show({
            title: `Delete "${instance.name}"?`,
            message: `Permanently delete this development instance and all installed mods, configurations, and saves? This cannot be undone.`,
            confirmText: 'Delete Instance',
            isDanger: true
          });
          if (confirmed) {
            await api.deleteInstance(instance.id);
            NotificationToast.show(`"${instance.name}" deleted.`, 'info');
            events.onRefresh();
          }
        }
      };
    });
  }

  private static javaVersionForMc(mcVersion: string): string {
    // 26.x new-era (non-obfuscated) requires Java 25
    if (mcVersion.startsWith('26.')) return '25';
    const parts = mcVersion.split('.').map(Number);
    const minor = parts[1] || 0;
    const patch = parts[2] || 0;
    if (minor >= 21 || (minor === 20 && patch >= 5)) return '21';
    if (minor >= 18) return '17';
    if (minor >= 17) return '16';
    return '8';
  }

  private static formatRelativeTime(date: Date): string {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'yesterday';
    return `${days}d ago`;
  }

}
