import { CosmeticDef, unlockCosmeticForUser } from '../assets/cosmeticAssets';
import { NotificationToast } from './NotificationToast';

export interface SponsorAdModalOptions {
  cosmetic: CosmeticDef;
  userId: string;
  onUnlocked: () => void;
  onClose: () => void;
}

export class SponsorAdModal {
  private options: SponsorAdModalOptions;
  private modalEl: HTMLElement | null = null;
  private timerInterval: any = null;
  private remainingSeconds = 5;

  constructor(options: SponsorAdModalOptions) {
    this.options = options;
  }

  public show(): void {
    const { cosmetic } = this.options;

    this.modalEl = document.createElement('div');
    this.modalEl.className = 'modal-backdrop animate-fade-in';
    this.modalEl.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.82);
      backdrop-filter: blur(8px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      padding: 20px;
    `;

    this.modalEl.innerHTML = `
      <div class="modal-content animate-scale-in" style="
        max-width: 480px;
        width: 100%;
        background: #0f111a;
        border: 1px solid rgba(168, 85, 247, 0.4);
        box-shadow: 0 25px 60px rgba(0, 0, 0, 0.8), 0 0 30px rgba(168, 85, 247, 0.2);
        border-radius: var(--radius-xl);
        padding: 28px;
        display: flex;
        flex-direction: column;
        gap: 18px;
        text-align: center;
      ">
        <!-- Top Sponsor Tag -->
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 4px 10px;
            background: rgba(168, 85, 247, 0.15);
            border: 1px solid rgba(168, 85, 247, 0.3);
            border-radius: var(--radius-full);
            font-size: 0.75rem;
            font-weight: 700;
            color: #c084fc;
            text-transform: uppercase;
            letter-spacing: 0.05em;
          ">
            <span>📺</span> Sponsor Ad Unlock
          </span>
          <span id="ad-timer-badge" style="
            font-size: 0.8rem;
            font-weight: 700;
            color: var(--text-muted);
            background: rgba(255, 255, 255, 0.06);
            padding: 4px 10px;
            border-radius: var(--radius-full);
          ">
            Reward in 5s
          </span>
        </div>

        <!-- Reward Showcase -->
        <div style="
          padding: 20px;
          background: radial-gradient(circle at 50% 50%, rgba(168, 85, 247, 0.15), rgba(15, 23, 42, 0.4));
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        ">
          <div style="
            width: 72px;
            height: 72px;
            border-radius: var(--radius-md);
            background: rgba(0,0,0,0.5);
            border: 2px solid rgba(168, 85, 247, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 8px 24px rgba(0,0,0,0.4);
          " class="${cosmetic.effectClass || ''}">
            <img src="${cosmetic.textureUrl}" alt="${cosmetic.name}" style="width: 44px; height: 44px; object-fit: contain; image-rendering: pixelated;" />
          </div>

          <div>
            <h3 style="font-size: 1.25rem; font-weight: 800; color: var(--text-primary); margin: 0;">
              ${cosmetic.name}
            </h3>
            <p style="font-size: 0.82rem; color: var(--text-secondary); margin: 4px 0 0;">
              ${cosmetic.description}
            </p>
          </div>
        </div>

        <!-- Ad Player Simulated Frame -->
        <div style="
          padding: 18px;
          background: #090a0f;
          border-radius: var(--radius-md);
          border: 1px dashed rgba(255, 255, 255, 0.15);
          display: flex;
          flex-direction: column;
          gap: 10px;
        ">
          <div style="font-size: 0.82rem; color: var(--text-secondary);">
            Watching sponsored partner highlight for <strong>Voxel⁺ Creators</strong>...
          </div>

          <!-- Progress Bar -->
          <div style="
            width: 100%;
            height: 8px;
            background: rgba(255, 255, 255, 0.08);
            border-radius: var(--radius-full);
            overflow: hidden;
          ">
            <div id="ad-progress-bar" style="
              width: 0%;
              height: 100%;
              background: var(--accent-gradient);
              transition: width 1s linear;
            "></div>
          </div>
        </div>

        <!-- Action / Status -->
        <div id="ad-action-container">
          <button id="btn-cancel-ad" class="btn btn-secondary" style="width: 100%;">
            Cancel & Keep Locked
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(this.modalEl);

    const cancelBtn = this.modalEl.querySelector('#btn-cancel-ad') as HTMLElement;
    cancelBtn.onclick = () => this.close();

    this.startAdCountdown();
  }

  private startAdCountdown(): void {
    const total = 5;
    this.remainingSeconds = total;

    const progressBar = this.modalEl?.querySelector('#ad-progress-bar') as HTMLElement;
    const timerBadge = this.modalEl?.querySelector('#ad-timer-badge') as HTMLElement;
    const actionContainer = this.modalEl?.querySelector('#ad-action-container') as HTMLElement;

    this.timerInterval = setInterval(() => {
      this.remainingSeconds--;

      const pct = Math.round(((total - this.remainingSeconds) / total) * 100);
      if (progressBar) progressBar.style.width = `${pct}%`;

      if (timerBadge) {
        if (this.remainingSeconds > 0) {
          timerBadge.textContent = `Reward in ${this.remainingSeconds}s`;
        } else {
          timerBadge.textContent = `Completed! ✓`;
          timerBadge.style.color = '#10b981';
        }
      }

      if (this.remainingSeconds <= 0) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;

        // Unlock cosmetic for user
        unlockCosmeticForUser(this.options.userId, this.options.cosmetic.id);

        if (actionContainer) {
          actionContainer.innerHTML = `
            <button id="btn-claim-reward" class="btn btn-primary animate-scale-in" style="
              width: 100%;
              padding: 12px;
              font-weight: 800;
              background: linear-gradient(135deg, #10b981, #059669);
              border: none;
              box-shadow: 0 4px 18px rgba(16, 185, 129, 0.4);
            ">
              🎉 UNLOCK & EQUIP NOW →
            </button>
          `;

          const claimBtn = actionContainer.querySelector('#btn-claim-reward') as HTMLElement;
          claimBtn.onclick = () => {
            NotificationToast.show(`Unlocked cosmetic: ${this.options.cosmetic.name}!`, 'success');
            this.options.onUnlocked();
            this.close();
          };
        }
      }
    }, 1000);
  }

  public close(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    if (this.modalEl && this.modalEl.parentNode) {
      this.modalEl.parentNode.removeChild(this.modalEl);
      this.modalEl = null;
    }
    this.options.onClose();
  }
}
