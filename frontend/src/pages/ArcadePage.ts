import { CookieClickerGame } from '../games/CookieClickerGame';
import { api } from '../services/api';
import { getItemDataUrl } from '../assets/items';

export class ArcadePage {
  private container: HTMLElement;
  private cookieGame?: CookieClickerGame;

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'page-content animate-fade-in';
    this.container.style.cssText = 'padding: 24px; overflow-y: auto; height: 100%;';
  }

  public async render(): Promise<HTMLElement> {
    const cookieData = await api.getCookieData();
    const cookieTexture = getItemDataUrl('minecraft:cookie');

    this.container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px;">
        <div>
          <h1 style="font-size: 1.6rem; font-weight: 800; color: var(--text-primary); margin-bottom: 4px;">V+ Arcade</h1>
          <p style="color: var(--text-secondary); font-size: 0.88rem;">Play offline Minecraft mini-games to earn V+ Points (VP) and milestone rewards.</p>
        </div>
        <div style="display: flex; align-items: center; gap: 14px;">
          <div class="voxel-coin-badge" style="background: rgba(30, 41, 59, 0.8); border: 1px solid rgba(245, 158, 11, 0.3);">
            <img src="${cookieTexture}" style="width: 18px; height: 18px; image-rendering: pixelated; margin-right: 6px;" />
            <span style="color: #fbbf24; font-weight: 800;">${Math.floor(cookieData.lifetimeCookies).toLocaleString()} Cookies</span>
          </div>
        </div>
      </div>

      <!-- Game Stage -->
      <div id="arcade-stage" style="display: flex; justify-content: center; width: 100%;"></div>
    `;

    const stage = this.container.querySelector('#arcade-stage') as HTMLElement;
    this.cookieGame = new CookieClickerGame();
    await this.cookieGame.render(stage);

    return this.container;
  }

  public destroy(): void {
    if (this.cookieGame) this.cookieGame.destroy();
  }
}
