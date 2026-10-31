import { JavaRuntime } from '../../../electron/types';
import { api } from '../services/api';
import { describeIpcError } from '../services/errors';
import { NotificationToast } from './NotificationToast';

export class JavaManagerModal {
  /**
   * Opens the Java Runtime Manager.
   *
   * `options.installVersion` is used by the launch flow: when an instance fails
   * because it needs a specific Java major version, the modal immediately starts
   * installing that version instead of just opening a list and leaving the user
   * to guess which button installs what the prompt promised.
   */
  public static async show(
    onSelectJava?: (java: JavaRuntime) => void,
    options: { installVersion?: 8 | 17 | 21 | 25 } = {}
  ): Promise<void> {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay animate-fade-in';

    // One installation at a time; `autoInstallStarted` stops a re-render (after a
    // successful install) from kicking off the same install again.
    let installLocked = false;
    let autoInstallStarted = false;

    const render = async () => {
      const runtimes = await api.scanJava();

      overlay.innerHTML = `
        <div class="modal-content animate-scale-in" style="max-width: 680px;">
          <div class="modal-header">
            <div>
              <h3 class="modal-title">Java Runtime Manager</h3>
              <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 2px;">
                Voxel⁺ automatically selects the best verified 64-bit Java runtime for each Minecraft version.
              </p>
            </div>
            <button class="btn btn-icon" id="java-modal-close">✕</button>
          </div>

          <!-- Actions Bar -->
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <span style="font-size: 0.9rem; font-weight: 700; color: var(--text-primary);">
              ${runtimes.length} Runtimes Detected
            </span>
            <div style="display: flex; gap: 8px;">
              <button class="btn btn-secondary" id="btn-rescan-java">🔄 Rescan</button>
              <button class="btn btn-secondary" id="btn-install-java-8">☕ Java 8</button>
              <button class="btn btn-secondary" id="btn-install-java-17">☕ Java 17</button>
              <button class="btn btn-primary" id="btn-install-java-21">☕ Java 21 LTS</button>
              <button class="btn btn-secondary" id="btn-install-java-25">☕ Java 25</button>
            </div>
          </div>

          <!-- Live install progress (driven by real installation events) -->
          <div id="java-install-progress" style="display: none; margin-bottom: 16px; padding: 12px 16px; background: var(--bg-surface); border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
            <div style="display: flex; justify-content: space-between; font-size: 0.85rem; font-weight: 600; margin-bottom: 6px;">
              <span id="install-status-text">Preparing installation…</span>
              <span id="install-status-percent">0%</span>
            </div>
            <div class="progress-track" style="width: 100%; height: 6px; background: var(--bg-app); border-radius: 3px; overflow: hidden;">
              <div id="install-progress-bar" style="width: 0%; height: 100%; background: var(--accent-gradient); transition: width 0.3s ease;"></div>
            </div>
          </div>

          <!-- Java Cards List -->
          <div id="java-cards-list" style="display: flex; flex-direction: column; gap: 12px; max-height: 420px; overflow-y: auto; padding-right: 4px;"></div>

          <div class="modal-footer">
            <button class="btn btn-secondary" id="java-modal-done">Done</button>
          </div>
        </div>
      `;

      const list = overlay.querySelector('#java-cards-list') as HTMLElement;

      runtimes.forEach(runtime => {
        const card = document.createElement('div');
        card.className = 'horizontal-card';
        card.style.cssText = `
          padding: 16px 20px;
          background: var(--bg-card);
          border: 1px solid ${runtime.isRecommended ? 'var(--accent-primary)' : 'var(--border-subtle)'};
          border-radius: var(--radius-lg);
          display: flex;
          flex-direction: column;
          gap: 8px;
        `;

        const badgeHtml = runtime.isRecommended
          ? `<span class="badge badge-recommended">✓ RECOMMENDED</span>`
          : runtime.majorVersion >= 17
            ? `<span class="badge badge-lts">✓ TESTED</span>`
            : `<span class="badge badge-legacy">○ LEGACY</span>`;

        card.innerHTML = `
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 1.4rem;">☕</span>
              <div>
                <h4 style="font-size: 1.1rem; font-weight: 800; color: var(--text-primary);">${runtime.name}</h4>
                <div style="font-size: 0.82rem; color: var(--text-secondary);">${runtime.vendor} · ${runtime.architecture} · ${runtime.fullVersion}</div>
              </div>
            </div>
            <div>${badgeHtml}</div>
          </div>

          <div style="font-size: 0.78rem; font-family: var(--font-mono); color: var(--text-muted); background: var(--bg-input); padding: 4px 8px; border-radius: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${runtime.executablePath}
          </div>

          <div style="font-size: 0.84rem; color: var(--text-secondary);">
            ${runtime.compatibilityDescription}
          </div>

          <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 4px;">
            <div style="display: flex; gap: 6px; flex-wrap: wrap;">
              ${runtime.pros.map(p => `<span class="badge" style="font-size: 0.72rem; color: var(--success);">✓ ${p}</span>`).join('')}
              ${runtime.cons.map(c => `<span class="badge" style="font-size: 0.72rem; color: var(--danger);">⚠ ${c}</span>`).join('')}
            </div>

            ${onSelectJava
              ? `<button class="btn btn-secondary btn-select-java" style="padding: 6px 14px; font-size: 0.84rem;">Use This Java</button>`
              : ''
            }
          </div>
        `;

        const selectBtn = card.querySelector('.btn-select-java') as HTMLButtonElement;
        if (selectBtn && onSelectJava) {
          selectBtn.onclick = () => {
            onSelectJava(runtime);
            overlay.remove();
          };
        }

        list.appendChild(card);
      });

      // Actions
      const close = () => overlay.remove();
      (overlay.querySelector('#java-modal-close') as HTMLElement).onclick = close;
      (overlay.querySelector('#java-modal-done') as HTMLElement).onclick = close;

      (overlay.querySelector('#btn-rescan-java') as HTMLElement).onclick = async () => {
        NotificationToast.show('Rescanning system Java runtimes...', 'info');
        await render();
      };

      const installHandler = async (version: number, btnId: string) => {
        if (installLocked) return;
        const installBtn = overlay.querySelector(btnId) as HTMLButtonElement | null;
        if (installBtn?.disabled) return;
        if (installBtn) installBtn.disabled = true;
        installLocked = true;

        const progressBox = overlay.querySelector('#java-install-progress') as HTMLElement;
        const statusText = overlay.querySelector('#install-status-text') as HTMLElement;
        const statusPercent = overlay.querySelector('#install-status-percent') as HTMLElement;
        const progressBar = overlay.querySelector('#install-progress-bar') as HTMLElement;

        progressBox.style.display = 'block';
        statusText.textContent = `Starting Java ${version} JDK installation…`;
        statusPercent.textContent = '0%';
        progressBar.style.width = '0%';

        // Real milestones are streamed from the main process (JavaInstaller).
        const unsubscribe = api.onJavaInstallProgress(event => {
          if (event.version !== version) return;
          statusText.textContent = event.status;
          statusPercent.textContent = `${Math.max(0, Math.min(100, Math.round(event.percentage)))}%`;
          progressBar.style.width = `${Math.max(0, Math.min(100, event.percentage))}%`;
        });

        try {
          const result = await api.installJava(version as 8 | 17 | 21 | 25);
          if (result.success) {
            NotificationToast.show(`Java ${version} installed and verified!`, 'success');
            unsubscribe();
            await render();
            return;
          }

          unsubscribe();
          NotificationToast.show(`Installation failed: ${result.error}`, 'error');
          progressBox.style.display = 'none';
          if (installBtn) installBtn.disabled = false;
        } catch (error) {
          unsubscribe();
          NotificationToast.show(`Installation failed: ${describeIpcError(error)}`, 'error');
          progressBox.style.display = 'none';
          if (installBtn) installBtn.disabled = false;
        } finally {
          installLocked = false;
        }
      };

      (overlay.querySelector('#btn-install-java-8') as HTMLElement).onclick = () => installHandler(8, '#btn-install-java-8');
      (overlay.querySelector('#btn-install-java-17') as HTMLElement).onclick = () => installHandler(17, '#btn-install-java-17');
      (overlay.querySelector('#btn-install-java-21') as HTMLElement).onclick = () => installHandler(21, '#btn-install-java-21');
      (overlay.querySelector('#btn-install-java-25') as HTMLElement).onclick = () => installHandler(25, '#btn-install-java-25');

      // The "Install Java X" prompt from a failed launch actually installs X.
      if (options.installVersion && !autoInstallStarted) {
        autoInstallStarted = true;
        const version = options.installVersion;
        void installHandler(version, `#btn-install-java-${version}`);
      }
    };

    document.body.appendChild(overlay);
    await render();
  }
}
