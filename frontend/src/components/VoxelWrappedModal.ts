import { WrappedStats } from '../../../electron/types';
import { api } from '../services/api';
import { getItemDataUrl } from '../assets/items';
import { escapeHtml } from '../utils/html';
import { NotificationToast } from './NotificationToast';

export class VoxelWrappedModal {
  private overlay: HTMLElement;
  private currentSlideIndex: number = 0;
  private stats: WrappedStats | null = null;
  private selectedPeriod: 'lifetime' | number = 'lifetime';
  private availableYears: number[] = [];

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'modal-overlay animate-fade-in';
    this.overlay.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 10000;
      background: radial-gradient(circle at 50% 30%, #0d1322 0%, #05070d 100%);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      color: var(--text-primary);
    `;
  }

  public static async show(initialPeriod: 'lifetime' | number = 'lifetime'): Promise<void> {
    const modal = new VoxelWrappedModal();
    modal.selectedPeriod = initialPeriod;
    await modal.loadStats();
    modal.render();
    document.body.appendChild(modal.overlay);
  }

  private async loadStats(): Promise<void> {
    try {
      this.stats = await api.getWrappedStats(this.selectedPeriod);
      // Discover available years dynamically from recorded sessions
      const sessions = await api.getRecordedSessions();
      const yearsSet = new Set<number>();
      yearsSet.add(new Date().getFullYear());
      for (const s of sessions) {
        if (s.startedAt) {
          const y = new Date(s.startedAt).getFullYear();
          if (!Number.isNaN(y) && y >= 2020 && y <= 2030) {
            yearsSet.add(y);
          }
        }
      }
      this.availableYears = Array.from(yearsSet).sort((a, b) => b - a);
    } catch (err: any) {
      console.error('Failed to load wrapped stats', err);
      NotificationToast.show('Failed to calculate wrapped recap data.', 'error');
    }
  }

  private render(): void {
    if (!this.stats) {
      this.overlay.innerHTML = `
        <div style="margin: auto; text-align: center;">
          <h2>Loading Voxel⁺ Wrapped…</h2>
        </div>
      `;
      return;
    }

    const slides = this.buildSlides();
    const currentSlide = slides[this.currentSlideIndex] || slides[0];

    this.overlay.innerHTML = `
      <!-- Top Navigation & Period Selector Bar -->
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 20px 32px; z-index: 20; border-bottom: 1px solid rgba(255, 255, 255, 0.08);">
        <div style="display: flex; align-items: center; gap: 14px;">
          <img src="logo.png" style="width: 32px; height: 32px; border-radius: 8px;" />
          <span style="font-size: 1.15rem; font-weight: 900; letter-spacing: -0.02em; background: linear-gradient(135deg, #10b981 0%, #06b6d4 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
            VOXEL⁺ WRAPPED
          </span>
          <span style="font-size: 0.78rem; padding: 3px 10px; border-radius: 999px; background: rgba(255,255,255,0.08); font-weight: 700; color: var(--text-secondary);">
            ${this.selectedPeriod === 'lifetime' ? 'All-Time Lifetime Recap' : `${this.selectedPeriod} Annual Recap`}
          </span>
        </div>

        <div style="display: flex; align-items: center; gap: 12px;">
          <select id="wrapped-period-select" class="select-field" style="padding: 6px 14px; font-size: 0.85rem; border-radius: 999px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15); color: var(--text-primary); cursor: pointer;">
            <option value="lifetime" ${this.selectedPeriod === 'lifetime' ? 'selected' : ''}>Lifetime (All-Time)</option>
            ${this.availableYears.map(y => `<option value="${y}" ${this.selectedPeriod === y ? 'selected' : ''}>Year ${y}</option>`).join('')}
          </select>
          <button id="wrapped-close-btn" class="btn btn-secondary btn-sm" style="border-radius: 999px; padding: 6px 14px; font-weight: 700;">✕ Exit</button>
        </div>
      </div>

      <!-- Main Presentation Stage -->
      <div style="flex: 1; display: flex; align-items: center; justify-content: center; padding: 32px; position: relative;">
        <!-- Subtle Ambient Floating Ray Rings -->
        <div style="
          position: absolute;
          width: 650px;
          height: 650px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(16, 185, 129, 0.08) 0%, rgba(6, 182, 212, 0.04) 50%, transparent 70%);
          pointer-events: none;
          z-index: 0;
          animation: status-pulse 6s ease-in-out infinite;
        "></div>

        <div class="animate-fade-in-up" style="max-width: 680px; width: 100%; position: relative; z-index: 10;">
          ${currentSlide.html}
        </div>
      </div>

      <!-- Bottom Carousel Controller -->
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 20px 36px; z-index: 20; border-top: 1px solid rgba(255,255,255,0.08);">
        <button id="wrapped-prev-btn" class="btn btn-secondary" style="padding: 10px 24px; font-weight: 700;" ${this.currentSlideIndex === 0 ? 'disabled' : ''}>
          ← Previous
        </button>

        <!-- Slide Indicators -->
        <div style="display: flex; gap: 8px;">
          ${slides.map((_, i) => `
            <div style="width: ${i === this.currentSlideIndex ? '28px' : '8px'}; height: 8px; border-radius: 4px; background: ${i === this.currentSlideIndex ? 'var(--accent-primary)' : 'rgba(255,255,255,0.2)'}; transition: all 0.25s ease;"></div>
          `).join('')}
        </div>

        ${this.currentSlideIndex < slides.length - 1 ? `
          <button id="wrapped-next-btn" class="btn btn-primary" style="padding: 10px 28px; font-weight: 700;">
            Next →
          </button>
        ` : `
          <button id="wrapped-export-btn" class="btn btn-primary" style="padding: 10px 24px; font-weight: 700; background: linear-gradient(135deg, #10b981, #06b6d4);">
            ✨ Share Summary
          </button>
        `}
      </div>
    `;

    // Hook events
    const closeBtn = this.overlay.querySelector('#wrapped-close-btn') as HTMLElement;
    closeBtn.onclick = () => this.destroy();

    const periodSelect = this.overlay.querySelector('#wrapped-period-select') as HTMLSelectElement;
    periodSelect.onchange = async () => {
      const val = periodSelect.value;
      this.selectedPeriod = val === 'lifetime' ? 'lifetime' : Number(val);
      await this.loadStats();
      this.render();
    };

    const prevBtn = this.overlay.querySelector('#wrapped-prev-btn') as HTMLButtonElement | null;
    if (prevBtn) {
      prevBtn.onclick = () => {
        if (this.currentSlideIndex > 0) {
          this.currentSlideIndex--;
          this.render();
        }
      };
    }

    const nextBtn = this.overlay.querySelector('#wrapped-next-btn') as HTMLButtonElement | null;
    if (nextBtn) {
      nextBtn.onclick = () => {
        if (this.currentSlideIndex < slides.length - 1) {
          this.currentSlideIndex++;
          this.render();
        }
      };
    }

    const exportBtn = this.overlay.querySelector('#wrapped-export-btn') as HTMLButtonElement | null;
    if (exportBtn) {
      exportBtn.onclick = () => {
        NotificationToast.show('Recap summary copied to clipboard!', 'success');
        this.copySummaryToClipboard();
      };
    }
  }

  private buildSlides(): { title: string; html: string }[] {
    const s = this.stats!;
    const periodLabel = s.period === 'lifetime' ? 'All-Time' : `Year ${s.period}`;

    // 1. Welcome Slide
    const slide1 = {
      title: 'Welcome',
      html: `
        <div style="background: rgba(18, 24, 38, 0.85); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 24px; padding: 48px; text-align: center; box-shadow: 0 30px 60px rgba(0,0,0,0.6); backdrop-filter: blur(20px);">
          <div style="width: 80px; height: 80px; margin: 0 auto 20px auto; border-radius: 20px; background: rgba(16, 185, 129, 0.15); border: 2px solid var(--accent-primary); display: flex; align-items: center; justify-content: center;">
            <img src="${getItemDataUrl('minecraft:nether_star')}" style="width: 48px; height: 48px; image-rendering: pixelated;" />
          </div>
          <h1 style="font-size: 2.2rem; font-weight: 900; margin-bottom: 12px; letter-spacing: -0.03em;">
            Your Minecraft Story
          </h1>
          <p style="font-size: 1.05rem; color: var(--text-secondary); max-width: 460px; margin: 0 auto 28px auto; line-height: 1.6;">
            Here is your definitive Voxel⁺ gaming recap for <strong>${periodLabel}</strong>. From instances crafted to achievements unlocked, let's look back at your journey.
          </p>
          <div style="display: inline-flex; gap: 20px; background: rgba(255,255,255,0.04); padding: 12px 24px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.08);">
            <div><strong style="color: var(--accent-primary);">${s.totalInstancesCreated}</strong> Instances</div>
            <div>•</div>
            <div><strong style="color: var(--warning);">${s.achievements.totalUnlocked}</strong> Trophies</div>
            <div>•</div>
            <div><strong style="color: var(--info);">${s.formattedPlaytime}</strong> Played</div>
          </div>
        </div>
      `
    };

    // 2. Playtime & Most Played Instance
    const mostPlayedHtml = s.mostPlayedInstance
      ? `
        <div style="margin-top: 24px; background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: 16px; padding: 20px; display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 14px;">
            <img src="${getItemDataUrl('minecraft:grass_block')}" style="width: 36px; height: 36px; image-rendering: pixelated;" />
            <div style="text-align: left;">
              <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--accent-primary); font-weight: 800;">Most Played Instance</div>
              <div style="font-size: 1.15rem; font-weight: 800; color: var(--text-primary);">${escapeHtml(s.mostPlayedInstance.name)}</div>
            </div>
          </div>
          <div style="font-family: var(--font-mono); font-size: 1.3rem; font-weight: 900; color: var(--accent-primary);">
            ${s.mostPlayedInstance.formattedPlaytime}
          </div>
        </div>
      `
      : `<div style="margin-top: 24px; color: var(--text-muted); font-size: 0.9rem;">No recorded play sessions for this period.</div>`;

    const slide2 = {
      title: 'Playtime',
      html: `
        <div style="background: rgba(18, 24, 38, 0.85); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 24px; padding: 40px; text-align: center; box-shadow: 0 30px 60px rgba(0,0,0,0.6); backdrop-filter: blur(20px);">
          <div style="font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); font-weight: 800; margin-bottom: 8px;">
            Total Recorded Playtime
          </div>
          <div style="font-size: 3.2rem; font-weight: 900; color: var(--text-primary); font-family: var(--font-mono); margin-bottom: 8px;">
            ${s.formattedPlaytime}
          </div>
          <div style="color: var(--text-secondary); font-size: 0.92rem;">
            Across <strong>${s.totalSessions}</strong> launched play sessions
          </div>
          ${mostPlayedHtml}
        </div>
      `
    };

    // Dedicated Least Played Instance Slide (if different from most played)
    const leastPlayedHtml = s.leastPlayedInstance
      ? `
        <div style="margin-top: 24px; background: rgba(59, 130, 246, 0.08); border: 1px solid rgba(59, 130, 246, 0.25); border-radius: 16px; padding: 20px; display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 14px;">
            <img src="${getItemDataUrl('minecraft:compass')}" style="width: 36px; height: 36px; image-rendering: pixelated;" />
            <div style="text-align: left;">
              <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--info); font-weight: 800;">Least Played Instance</div>
              <div style="font-size: 1.15rem; font-weight: 800; color: var(--text-primary);">${escapeHtml(s.leastPlayedInstance.name)}</div>
            </div>
          </div>
          <div style="font-family: var(--font-mono); font-size: 1.3rem; font-weight: 900; color: var(--info);">
            ${s.leastPlayedInstance.formattedPlaytime}
          </div>
        </div>
      `
      : '';

    const slideLeastPlayed = {
      title: 'Hidden Gem',
      html: `
        <div style="background: rgba(18, 24, 38, 0.85); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 24px; padding: 40px; text-align: center; box-shadow: 0 30px 60px rgba(0,0,0,0.6); backdrop-filter: blur(20px);">
          <div style="font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); font-weight: 800; margin-bottom: 8px;">
            The Undiscovered Realm
          </div>
          <h2 style="font-size: 1.8rem; font-weight: 900; margin-bottom: 8px;">Every Instance Matters</h2>
          <p style="font-size: 0.95rem; color: var(--text-secondary); max-width: 440px; margin: 0 auto;">
            Not every world became a mega-base, but each one holds a unique memory.
          </p>
          ${leastPlayedHtml || '<div style="margin-top: 24px; color: var(--text-muted);">Play more instances to uncover your least-played world.</div>'}
        </div>
      `
    };

    // Playtime breakdown across all instances
    const breakdownList = s.instancesPlaytime.slice(0, 5).map(inst => `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.06);">
        <div style="text-align: left;">
          <div style="font-weight: 700; color: var(--text-primary);">${escapeHtml(inst.name)}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">${inst.loaderType.toUpperCase()} • MC ${inst.minecraftVersion}</div>
        </div>
        <div style="font-family: var(--font-mono); font-weight: 800; color: var(--accent-primary);">
          ${(inst.totalPlaytimeMs / (1000 * 3600)).toFixed(1)} hrs
        </div>
      </div>
    `).join('');

    const slideBreakdown = {
      title: 'Instance Breakdown',
      html: `
        <div style="background: rgba(18, 24, 38, 0.85); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 24px; padding: 36px; text-align: center; box-shadow: 0 30px 60px rgba(0,0,0,0.6); backdrop-filter: blur(20px);">
          <h2 style="font-size: 1.8rem; font-weight: 900; margin-bottom: 6px;">Playtime Breakdown</h2>
          <p style="font-size: 0.88rem; color: var(--text-secondary); margin-bottom: 20px;">Top instances by total time spent</p>
          <div style="max-height: 220px; overflow-y: auto; padding: 0 10px;">
            ${breakdownList || '<div style="color: var(--text-muted); padding: 20px;">No instance playtime recorded.</div>'}
          </div>
        </div>
      `
    };

    // 3. Minecraft DNA (Versions & Loaders)
    const slide3 = {
      title: 'Minecraft DNA',
      html: `
        <div style="background: rgba(18, 24, 38, 0.85); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 24px; padding: 40px; text-align: center; box-shadow: 0 30px 60px rgba(0,0,0,0.6); backdrop-filter: blur(20px);">
          <h2 style="font-size: 1.8rem; font-weight: 900; margin-bottom: 6px;">Your Minecraft DNA</h2>
          <p style="font-size: 0.92rem; color: var(--text-secondary); margin-bottom: 28px;">The versions and modding technologies you relied on most.</p>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 18px;">
            <div style="background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 16px; padding: 24px;">
              <div style="margin-bottom: 12px;">
                <img src="${getItemDataUrl('minecraft:compass')}" style="width: 32px; height: 32px; image-rendering: pixelated;" />
              </div>
              <div style="font-size: 0.78rem; text-transform: uppercase; color: var(--text-muted); font-weight: 800; margin-bottom: 4px;">Top Version</div>
              <div style="font-size: 1.3rem; font-weight: 900; color: var(--accent-primary); font-family: var(--font-mono);">
                ${s.mostUsedVersion ? `Minecraft ${s.mostUsedVersion}` : 'None Recorded'}
              </div>
            </div>

            <div style="background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 16px; padding: 24px;">
              <div style="margin-bottom: 12px;">
                <img src="${getItemDataUrl('minecraft:redstone')}" style="width: 32px; height: 32px; image-rendering: pixelated;" />
              </div>
              <div style="font-size: 0.78rem; text-transform: uppercase; color: var(--text-muted); font-weight: 800; margin-bottom: 4px;">Preferred Loader</div>
              <div style="font-size: 1.3rem; font-weight: 900; color: var(--info); font-family: var(--font-mono); text-transform: uppercase;">
                ${s.mostUsedLoader || 'Fabric'}
              </div>
            </div>
          </div>
        </div>
      `
    };

    // 4. Economy Slide (with clearly labeled Current Balance vs Lifetime/Annual VP)
    const economyTitle = s.period === 'lifetime' ? 'All-Time VP Economy' : `${s.period} Annual VP Economy`;
    const slide4 = {
      title: 'Economy',
      html: `
        <div style="background: rgba(18, 24, 38, 0.85); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 24px; padding: 40px; text-align: center; box-shadow: 0 30px 60px rgba(0,0,0,0.6); backdrop-filter: blur(20px);">
          <div style="width: 64px; height: 64px; margin: 0 auto 16px auto; border-radius: 16px; background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.4); display: flex; align-items: center; justify-content: center;">
            <img src="${getItemDataUrl('minecraft:emerald')}" style="width: 36px; height: 36px; image-rendering: pixelated;" />
          </div>
          <h2 style="font-size: 1.8rem; font-weight: 900; margin-bottom: 24px;">${economyTitle}</h2>

          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; margin-bottom: 24px;">
            <div style="background: rgba(255,255,255,0.04); border-radius: 16px; padding: 18px; border: 1px solid rgba(255,255,255,0.06);">
              <div style="font-size: 0.72rem; color: var(--text-muted); font-weight: 800; text-transform: uppercase;">VP Earned (${periodLabel})</div>
              <div style="font-size: 1.4rem; font-weight: 900; color: var(--success); font-family: var(--font-mono); margin-top: 4px;">+${s.economy.totalVpEarned.toLocaleString()} VP</div>
            </div>
            <div style="background: rgba(255,255,255,0.04); border-radius: 16px; padding: 18px; border: 1px solid rgba(255,255,255,0.06);">
              <div style="font-size: 0.72rem; color: var(--text-muted); font-weight: 800; text-transform: uppercase;">VP Spent (${periodLabel})</div>
              <div style="font-size: 1.4rem; font-weight: 900; color: var(--danger); font-family: var(--font-mono); margin-top: 4px;">-${s.economy.totalVpSpent.toLocaleString()} VP</div>
            </div>
            <div style="background: rgba(255,255,255,0.04); border-radius: 16px; padding: 18px; border: 1px solid rgba(255,255,255,0.06);">
              <div style="font-size: 0.72rem; color: var(--text-muted); font-weight: 800; text-transform: uppercase;">Current Wallet Balance</div>
              <div style="font-size: 1.4rem; font-weight: 900; color: var(--warning); font-family: var(--font-mono); margin-top: 4px;">${s.economy.currentBalance.toLocaleString()} VP</div>
            </div>
          </div>

          ${s.economy.mostExpensiveCosmetic ? `
            <div style="background: rgba(255, 255, 255, 0.03); border-radius: 12px; padding: 12px 18px; font-size: 0.88rem; color: var(--text-secondary); display: inline-flex; align-items: center; gap: 8px;">
              <span>Top Cosmetic:</span> <strong style="color: var(--text-primary);">${escapeHtml(s.economy.mostExpensiveCosmetic.name)}</strong> (${s.economy.mostExpensiveCosmetic.price} VP)
            </div>
          ` : ''}
        </div>
      `
    };

    // Dedicated Collection Card
    const slideCollection = {
      title: 'Collection & VPacks',
      html: `
        <div style="background: rgba(18, 24, 38, 0.85); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 24px; padding: 40px; text-align: center; box-shadow: 0 30px 60px rgba(0,0,0,0.6); backdrop-filter: blur(20px);">
          <div style="width: 64px; height: 64px; margin: 0 auto 16px auto; border-radius: 16px; background: rgba(192, 132, 252, 0.15); border: 1px solid rgba(192, 132, 252, 0.4); display: flex; align-items: center; justify-content: center;">
            <img src="${getItemDataUrl('minecraft:netherite_ingot')}" style="width: 36px; height: 36px; image-rendering: pixelated;" />
          </div>
          <h2 style="font-size: 1.8rem; font-weight: 900; margin-bottom: 24px;">Collection & VPacks</h2>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;">
            <div style="background: rgba(255,255,255,0.04); border-radius: 16px; padding: 20px; border: 1px solid rgba(255,255,255,0.06);">
              <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 800; text-transform: uppercase;">Owned Cosmetics</div>
              <div style="font-size: 1.6rem; font-weight: 900; color: var(--accent-primary); font-family: var(--font-mono); margin-top: 4px;">
                ${s.collection.totalOwnedCosmetics} / ${s.collection.totalAvailableCosmetics}
              </div>
              <div style="font-size: 0.78rem; color: var(--text-secondary); margin-top: 4px;">${s.collection.completionPercentage}% unlocked</div>
            </div>

            <div style="background: rgba(255,255,255,0.04); border-radius: 16px; padding: 20px; border: 1px solid rgba(255,255,255,0.06);">
              <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 800; text-transform: uppercase;">VPack Modpacks</div>
              <div style="font-size: 1.6rem; font-weight: 900; color: var(--info); font-family: var(--font-mono); margin-top: 4px;">
                ${s.collection.vpacksImported + s.collection.vpacksExported}
              </div>
              <div style="font-size: 0.78rem; color: var(--text-secondary); margin-top: 4px;">${s.collection.vpacksImported} imported • ${s.collection.vpacksExported} created</div>
            </div>
          </div>

          ${s.collection.favoriteEquipped ? `
            <div style="background: rgba(255,255,255,0.03); border-radius: 12px; padding: 12px 18px; font-size: 0.88rem; color: var(--text-secondary); display: inline-flex; align-items: center; gap: 8px;">
              <span>Equipped Avatar:</span> <strong style="color: var(--text-primary);">${escapeHtml(s.collection.favoriteEquipped.name)}</strong>
            </div>
          ` : ''}
        </div>
      `
    };

    // 5. Hardest Achievement Showcase (Difficulty score 1-10 + rank)
    const hardest = s.achievements.hardestAchievement;
    const hardestHtml = hardest
      ? `
        <div style="background: rgba(18, 24, 38, 0.85); border: 2px solid #fbbf24; border-radius: 24px; padding: 40px; text-align: center; box-shadow: 0 30px 60px rgba(0,0,0,0.6), 0 0 30px rgba(251, 191, 36, 0.2); backdrop-filter: blur(20px);">
          <div style="font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.15em; color: #fbbf24; font-weight: 900; margin-bottom: 12px;">
            ⭐ HARDEST ACHIEVEMENT UNLOCKED ⭐
          </div>

          <div style="width: 80px; height: 80px; margin: 0 auto 16px auto; border-radius: 50%; background: radial-gradient(circle, #fbbf24 0%, #d97706 100%); display: flex; align-items: center; justify-content: center; box-shadow: 0 8px 24px rgba(251, 191, 36, 0.4);">
            <span style="font-size: 40px;">${hardest.icon || '🏆'}</span>
          </div>

          <h2 style="font-size: 1.8rem; font-weight: 900; color: var(--text-primary); margin-bottom: 6px;">
            ${escapeHtml(hardest.name)}
          </h2>

          <div style="display: inline-flex; gap: 10px; align-items: center; margin-bottom: 18px;">
            <span style="font-size: 0.85rem; font-weight: 900; padding: 4px 12px; border-radius: 999px; background: rgba(251, 191, 36, 0.2); color: #fbbf24; border: 1px solid rgba(251, 191, 36, 0.4);">
              Difficulty Score: ${hardest.difficulty} / 10 (${hardest.difficultyRank})
            </span>
            <span style="font-size: 0.8rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700;">
              ${hardest.category}
            </span>
          </div>

          <p style="font-size: 0.95rem; color: var(--text-secondary); max-width: 440px; margin: 0 auto 20px auto; line-height: 1.5;">
            ${escapeHtml(hardest.description)}
          </p>

          <div style="font-size: 0.8rem; color: var(--text-muted);">
            Earned on ${hardest.unlockedAt ? new Date(hardest.unlockedAt).toLocaleDateString() : 'Unknown date'}
          </div>
        </div>
      `
      : `
        <div style="background: rgba(18, 24, 38, 0.85); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 24px; padding: 48px; text-align: center;">
          <div style="font-size: 48px; margin-bottom: 16px;">🔒</div>
          <h2 style="font-size: 1.5rem; font-weight: 800; margin-bottom: 8px;">No Achievements Unlocked Yet</h2>
          <p style="color: var(--text-secondary); font-size: 0.92rem; max-width: 420px; margin: 0 auto;">
            Launch Minecraft instances and complete challenges to earn achievements and reveal your hardest triumph.
          </p>
        </div>
      `;

    const slide5 = {
      title: 'Hardest Achievement',
      html: hardestHtml
    };

    // 6. Final Recap Summary
    const slide6 = {
      title: 'Recap Summary',
      html: `
        <div style="background: rgba(18, 24, 38, 0.92); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 24px; padding: 36px; box-shadow: 0 30px 60px rgba(0,0,0,0.7); backdrop-filter: blur(24px);">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 18px; margin-bottom: 24px;">
            <div>
              <h2 style="font-size: 1.6rem; font-weight: 900; margin: 0;">Voxel⁺ Recap Summary</h2>
              <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 2px;">${periodLabel} Performance</div>
            </div>
            <div style="text-align: right;">
              <span style="font-size: 1.1rem; font-weight: 900; color: var(--accent-primary); font-family: var(--font-mono);">${s.achievements.completionPercentage}%</span>
              <div style="font-size: 0.72rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">Completion</div>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; font-size: 0.9rem;">
            <div style="background: rgba(255,255,255,0.03); padding: 14px 18px; border-radius: 12px;">
              <div style="color: var(--text-muted); font-size: 0.75rem;">Total Playtime</div>
              <div style="font-size: 1.2rem; font-weight: 800; color: var(--text-primary); margin-top: 2px;">${s.formattedPlaytime}</div>
            </div>
            <div style="background: rgba(255,255,255,0.03); padding: 14px 18px; border-radius: 12px;">
              <div style="color: var(--text-muted); font-size: 0.75rem;">Achievements Unlocked</div>
              <div style="font-size: 1.2rem; font-weight: 800; color: var(--text-primary); margin-top: 2px;">${s.achievements.totalUnlocked} / ${s.achievements.totalAvailable}</div>
            </div>
            <div style="background: rgba(255,255,255,0.03); padding: 14px 18px; border-radius: 12px;">
              <div style="color: var(--text-muted); font-size: 0.75rem;">Hardest Trophy</div>
              <div style="font-size: 1rem; font-weight: 800; color: #fbbf24; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${hardest ? `${hardest.name} (${hardest.difficulty}/10)` : 'None'}
              </div>
            </div>
            <div style="background: rgba(255,255,255,0.03); padding: 14px 18px; border-radius: 12px;">
              <div style="color: var(--text-muted); font-size: 0.75rem;">VP Net Earnings</div>
              <div style="font-size: 1.2rem; font-weight: 800; color: var(--warning); margin-top: 2px;">+${s.economy.totalVpEarned} VP</div>
            </div>
          </div>

          <div style="margin-top: 24px; text-align: center;">
            <p style="font-size: 0.82rem; color: var(--text-muted);">
              Ready for your next Minecraft journey in Voxel⁺!
            </p>
          </div>
        </div>
      `
    };

    return [slide1, slide2, slideLeastPlayed, slideBreakdown, slide3, slide4, slideCollection, slide5, slide6];
  }

  private copySummaryToClipboard(): void {
    if (!this.stats) return;
    const s = this.stats;
    const hardest = s.achievements.hardestAchievement ? `${s.achievements.hardestAchievement.name} (${s.achievements.hardestAchievement.difficulty}/10 ${s.achievements.hardestAchievement.difficultyRank})` : 'None';
    const text = [
      `🎮 Voxel⁺ Wrapped (${s.period === 'lifetime' ? 'Lifetime' : s.period}):`,
      `⏱️ Playtime: ${s.formattedPlaytime}`,
      `🏆 Achievements: ${s.achievements.totalUnlocked}/${s.achievements.totalAvailable} (${s.achievements.completionPercentage}%)`,
      `⭐ Hardest Trophy: ${hardest}`,
      `📦 Instances Created: ${s.totalInstancesCreated}`,
      `💎 VP Earned: ${s.economy.totalVpEarned.toLocaleString()} VP`
    ].join('\n');

    try {
      navigator.clipboard.writeText(text);
    } catch {}
  }

  public destroy(): void {
    if (this.overlay.parentElement) {
      this.overlay.parentElement.removeChild(this.overlay);
    }
  }
}
