import { JavaRuntime } from '../../../electron/types';
import { api } from '../services/api';
import { NotificationToast } from './NotificationToast';

export class JavaManagerModal {
  public static async show(onSelectJava?: (java: JavaRuntime) => void): Promise<void> {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay animate-fade-in';

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
              <button class="btn btn-primary" id="btn-install-java-21">☕ Install Java 21 LTS</button>
            </div>
          </div>

          <!-- Progress Bar if installing -->
          <div id="java-install-progress" style="display: none; margin-bottom: 16px; padding: 12px 16px; background: var(--bg-surface); border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
            <div style="display: flex; justify-content: space-between; font-size: 0.85rem; font-weight: 600; margin-bottom: 6px;">
              <span id="install-status-text">Downloading Eclipse Temurin 21...</span>
              <span id="install-status-percent">40%</span>
            </div>
            <div style="width: 100%; height: 6px; background: var(--bg-app); border-radius: 3px; overflow: hidden;">
              <div id="install-progress-bar" style="width: 40%; height: 100%; background: var(--accent-gradient); transition: width 0.3s ease;"></div>
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
              ${runtime.pros.map(p => `<span class="badge" style="font-size: 0.72rem; color: #10b981;">✓ ${p}</span>`).join('')}
              ${runtime.cons.map(c => `<span class="badge" style="font-size: 0.72rem; color: #ef4444;">⚠ ${c}</span>`).join('')}
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

      const installBtn = overlay.querySelector('#btn-install-java-21') as HTMLButtonElement;
      installBtn.onclick = async () => {
        installBtn.disabled = true;
        const progressBox = overlay.querySelector('#java-install-progress') as HTMLElement;
        const statusText = overlay.querySelector('#install-status-text') as HTMLElement;
        const statusPercent = overlay.querySelector('#install-status-percent') as HTMLElement;
        const progressBar = overlay.querySelector('#install-progress-bar') as HTMLElement;

        progressBox.style.display = 'block';
        statusText.textContent = 'Initiating Java 21 JDK installation...';
        statusPercent.textContent = '10%';
        progressBar.style.width = '10%';

        const result = await api.installJava(21);
        if (result.success) {
          NotificationToast.show('Java 21 LTS installed and verified!', 'success');
          await render();
        } else {
          NotificationToast.show(`Installation failed: ${result.error}`, 'error');
          progressBox.style.display = 'none';
          installBtn.disabled = false;
        }
      };
    };

    document.body.appendChild(overlay);
    await render();
  }
}
