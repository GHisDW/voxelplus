import { CookieClickerSaveData } from '../../../electron/types';
import { api } from '../services/api';
import { NotificationToast } from '../components/NotificationToast';
import { getItemDataUrl, getItemDefinition } from '../assets/items';

interface MinerUnit {
  id: string;
  name: string;
  baseCost: number;
  cps: number;
  description: string;
  itemTextureId: string;
}

interface PickaxeUpgrade {
  id: string;
  name: string;
  cost: number;
  clickBonus: number;
  cpsBonus: number;
  itemTextureId: string;
}

const MINERS: MinerUnit[] = [
  {
    id: 'copper_golem',
    name: 'Copper Golem Miner',
    baseCost: 20,
    cps: 1.0,
    description: 'Autonomous copper automaton happily button-mashing cookie veins.',
    itemTextureId: 'minecraft:copper_ingot'
  },
  {
    id: 'iron_golem',
    name: 'Iron Golem Miner',
    baseCost: 120,
    cps: 8.0,
    description: 'Towering metal guardian cleaving cookies straight from the bedrock.',
    itemTextureId: 'minecraft:iron_ingot'
  },
  {
    id: 'redstone_clock',
    name: 'Redstone Repeater Oven',
    baseCost: 750,
    cps: 45.0,
    description: 'Automated rapid-pulse clock powering continuous furnace baking.',
    itemTextureId: 'minecraft:redstone'
  },
  {
    id: 'blaze_oven',
    name: 'Nether Blaze Foundry',
    baseCost: 4500,
    cps: 240.0,
    description: 'Swirling blaze rods providing searing geothermal heat.',
    itemTextureId: 'minecraft:blaze_rod'
  },
  {
    id: 'beacon_matrix',
    name: 'Haste II Beacon Matrix',
    baseCost: 35000,
    cps: 1800.0,
    description: 'Beams of celestial energy infusing cookie harvesting speed.',
    itemTextureId: 'minecraft:beacon'
  }
];

const PICKAXES: PickaxeUpgrade[] = [
  {
    id: 'pick_iron',
    name: 'Iron Pickaxe',
    cost: 50,
    clickBonus: 2,
    cpsBonus: 1,
    itemTextureId: 'minecraft:iron_pickaxe'
  },
  {
    id: 'pick_gold',
    name: 'Golden Efficiency Pickaxe',
    cost: 300,
    clickBonus: 6,
    cpsBonus: 5,
    itemTextureId: 'minecraft:golden_pickaxe'
  },
  {
    id: 'pick_diamond',
    name: 'Diamond Fortune Pickaxe',
    cost: 2500,
    clickBonus: 25,
    cpsBonus: 30,
    itemTextureId: 'minecraft:diamond_pickaxe'
  },
  {
    id: 'pick_netherite',
    name: 'Netherite Unbreaking Pickaxe',
    cost: 15000,
    clickBonus: 120,
    cpsBonus: 200,
    itemTextureId: 'minecraft:netherite_pickaxe'
  }
];

export class CookieClickerGame {
  private data!: CookieClickerSaveData;
  private container!: HTMLElement;
  private timerId: any = null;
  private isVisible: boolean = true;
  private lastNotifiedMilestone: number = 0;

  constructor() {
    this.data = {
      cookies: 0,
      lifetimeCookies: 0,
      cookiesPerClick: 1,
      cookiesPerSecond: 0,
      upgrades: {},
      producers: {},
      milestonesClaimed: [],
      lastTickTimestamp: new Date().toISOString(),
      totalClicks: 0,
      totalTimePlayedMs: 0
    };
  }

  public async render(parent: HTMLElement): Promise<void> {
    try {
      this.data = await api.getCookieData();
      this.recalculateBonuses();
    } catch (e) {
      console.error('Failed to load cookie data', e);
    }

    this.container = parent;
    this.updateUI();
    this.setupVisibilityTracking();

    // Wait for DOM to be ready before starting ticker
    requestAnimationFrame(() => {
      this.startTicker();
    });
  }

  private setupVisibilityTracking(): void {
    const handleVisibilityChange = () => {
      this.isVisible = !document.hidden;
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
  }

  private recalculateBonuses(): void {
    let bonusClick = 1;
    let bonusCps = 0;

    for (const p of PICKAXES) {
      if (this.data.upgrades[p.id]) {
        bonusClick += p.clickBonus;
        bonusCps += p.cpsBonus;
      }
    }

    for (const m of MINERS) {
      const owned = this.data.producers[m.id] || 0;
      bonusCps += owned * m.cps;
    }

    this.data.cookiesPerClick = bonusClick;
    this.data.cookiesPerSecond = bonusCps;
  }

  private updateUI(): void {
    // Retrieve the cookie texture data URL for the main cookie button and item icons
    const cookieDef = getItemDefinition('minecraft:cookie');
    const cookieTexture = cookieDef.dataUrl;


    const minersHtml = MINERS.map(m => {
      const owned = this.data.producers[m.id] || 0;
      const cost = Math.floor(m.baseCost * Math.pow(1.18, owned));
      const canAfford = this.data.cookies >= cost;
      const texture = getItemDataUrl(m.itemTextureId) || '⛏️';

      return `
        <div class="card" style="
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          background: rgba(15, 23, 42, 0.75);
          backdrop-filter: blur(8px);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          margin-bottom: 10px;
          transition: border-color 0.15s, transform 0.1s;
        ">
          <div style="display: flex; align-items: center; gap: 14px;">
            <div style="
              width: 44px;
              height: 44px;
              border-radius: var(--radius-md);
              background: rgba(30, 41, 59, 0.8);
              border: 1px solid rgba(255, 255, 255, 0.1);
              display: flex;
              align-items: center;
              justify-content: center;
            ">
              ${typeof texture === 'string' && texture.startsWith('data') ? '<img src="' + texture + '" style="width:32px;height:32px;image-rendering:pixelated;" />' : '<span style="font-size:32px;">' + texture + '</span>'}
            </div>
            <div>
              <div style="font-size: 0.92rem; font-weight: 800; color: var(--text-primary);">
                ${m.name} <span style="color: var(--accent-secondary); font-size: 0.82rem;">[x${owned}]</span>
              </div>
              <div style="font-size: 0.75rem; color: var(--text-secondary);">${m.description}</div>
              <div style="font-size: 0.75rem; color: #10b981; font-weight: 700; margin-top: 2px;">+${m.cps} CPS each</div>
            </div>
          </div>
          <button class="btn btn-sm ${canAfford ? 'btn-primary' : 'btn-secondary disabled'}" data-buy-miner="${m.id}" ${canAfford ? '' : 'disabled'} style="display: flex; align-items: center; gap: 4px;">
            <span>${cost.toLocaleString()}</span>
            <span style="font-size:14px;">${typeof cookieTexture === 'string' && cookieTexture.startsWith('data') ? '<img src="' + cookieTexture + '" style="width: 14px; height: 14px; image-rendering: pixelated;" />' : cookieTexture}</span>
          </button>
        </div>
      `;
    }).join('');

    const pickaxesHtml = PICKAXES.map(p => {
      const isOwned = !!this.data.upgrades[p.id];
      const canAfford = this.data.cookies >= p.cost;
      const texture = getItemDataUrl(p.itemTextureId) || '⚒️';

      return `
        <div class="card" style="
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          background: rgba(15, 23, 42, 0.75);
          backdrop-filter: blur(8px);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          margin-bottom: 10px;
          opacity: ${isOwned ? '0.75' : '1'};
        ">
          <div style="display: flex; align-items: center; gap: 14px;">
            <div style="
              width: 44px;
              height: 44px;
              border-radius: var(--radius-md);
              background: rgba(30, 41, 59, 0.8);
              border: 1px solid rgba(255, 255, 255, 0.1);
              display: flex;
              align-items: center;
              justify-content: center;
            ">
              ${typeof texture === 'string' && texture.startsWith('data') ? `<img src="${texture}" style="width: 32px; height: 32px; image-rendering: pixelated;" />` : `<span style="font-size:32px;">${texture}</span>`}
            </div>
            <div>
              <div style="font-size: 0.92rem; font-weight: 800; color: var(--text-primary);">${p.name}</div>
              <div style="font-size: 0.75rem; color: #38bdf8; font-weight: 600;">+${p.clickBonus} Cookies/Click • +${p.cpsBonus} CPS</div>
            </div>
          </div>
          ${isOwned ? `
            <span style="font-size: 0.82rem; font-weight: 800; color: #10b981;">✓ FORGED</span>
          ` : `
            <button class="btn btn-sm ${canAfford ? 'btn-primary' : 'btn-secondary disabled'}" data-buy-pick="${p.id}" ${canAfford ? '' : 'disabled'} style="display: flex; align-items: center; gap: 4px;">
              <span>${p.cost.toLocaleString()}</span>
              <span style="font-size:14px;">${typeof cookieTexture === 'string' && cookieTexture.startsWith('data') ? '<img src="' + cookieTexture + '" style="width: 14px; height: 14px; image-rendering: pixelated;" />' : cookieTexture}</span>
            </button>
          `}
        </div>
      `;
    }).join('');

    this.container.innerHTML = `
      <div style="
        display: grid;
        grid-template-columns: 1.15fr 1.35fr;
        gap: 24px;
        width: 100%;
        max-width: 960px;
        background: radial-gradient(circle at 20% 40%, rgba(245, 158, 11, 0.08) 0%, rgba(15, 23, 42, 0.95) 75%), repeating-linear-gradient(45deg, rgba(255,255,255,0.015) 0, rgba(255,255,255,0.015) 20px, transparent 20px, transparent 40px);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-xl);
        padding: 28px;
        box-shadow: 0 12px 40px rgba(0,0,0,0.6);
      ">
        <!-- Left: Big Minecraft Cookie & Stats -->
        <div style="
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 32px 20px;
          background: rgba(15, 23, 42, 0.65);
          backdrop-filter: blur(10px);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
          text-align: center;
          position: relative;
        ">
          <div style="font-size: 0.85rem; font-weight: 800; color: #fbbf24; text-transform: uppercase; letter-spacing: 0.05em;">
            MINECRAFT BAKERY
          </div>
          <div style="font-size: 2.6rem; font-weight: 900; color: #f59e0b; font-family: var(--font-mono); margin: 8px 0;" id="cookie-display">
            ${Math.floor(this.data.cookies).toLocaleString()}
          </div>
          <div style="display: flex; gap: 16px; font-size: 0.88rem; margin-bottom: 28px;">
            <span style="color: #10b981; font-weight: 800; background: rgba(16,185,129,0.15); padding: 2px 10px; border-radius: 999px;">
              +${this.data.cookiesPerSecond.toFixed(1)} CPS
            </span>
            <span style="color: #38bdf8; font-weight: 800; background: rgba(56,189,248,0.15); padding: 2px 10px; border-radius: 999px;">
              +${this.data.cookiesPerClick} / Click
            </span>
          </div>

          <!-- Real Minecraft Cookie Button -->
          <div id="real-mc-cookie-btn" style="
            width: 180px;
            height: 180px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            background: radial-gradient(circle, rgba(245, 158, 11, 0.2) 0%, rgba(180, 83, 9, 0.05) 70%);
            border: 2px dashed rgba(245, 158, 11, 0.45);
            border-radius: var(--radius-xl);
            transition: transform 0.05s ease;
            user-select: none;
            box-shadow: 0 0 24px rgba(245, 158, 11, 0.2);
          ">
            ${typeof cookieTexture === 'string' && cookieTexture.startsWith('data') ? '<img src="' + cookieTexture + '" style="width:130px;height:130px;image-rendering:pixelated;filter:drop-shadow(0 10px 20px rgba(180,83,9,0.6));"/>' : '<span style="font-size:130px;">' + cookieTexture + '</span>'}





          </div>

          <div style="margin-top: 28px; font-size: 0.78rem; color: var(--text-muted); font-family: var(--font-mono);">
            Lifetime Harvested: ${Math.floor(this.data.lifetimeCookies).toLocaleString()} Cookies
          </div>
        </div>

        <!-- Right: Miners and Pickaxe Upgrades -->
        <div style="display: flex; flex-direction: column; gap: 18px; max-height: 520px; overflow-y: auto; padding-right: 4px;">
          <!-- Pickaxe Tools -->
          <div>
            <div style="font-size: 1rem; font-weight: 800; color: var(--text-primary); margin-bottom: 12px;">
              Mining Pickaxes
            </div>
            <div>${pickaxesHtml}</div>
          </div>

          <!-- Golem Miners & Machinery -->
          <div>
            <div style="font-size: 1rem; font-weight: 800; color: var(--text-primary); margin-bottom: 12px;">
              Automaton Miners
            </div>
            <div>${minersHtml}</div>
          </div>
        </div>
      </div>
    `;

    // Hook click action
    const btn = this.container.querySelector('#real-mc-cookie-btn') as HTMLElement;
    btn.onmousedown = () => {
      btn.style.transform = 'scale(0.92)';
      this.clickCookie();
    };
    btn.onmouseup = () => {
      btn.style.transform = 'scale(1)';
    };

    // Hook miner purchases
    this.container.querySelectorAll('[data-buy-miner]').forEach(b => {
      (b as HTMLElement).onclick = () => {
        const id = b.getAttribute('data-buy-miner')!;
        this.buyMiner(id);
      };
    });

    // Hook pickaxe purchases
    this.container.querySelectorAll('[data-buy-pick]').forEach(b => {
      (b as HTMLElement).onclick = () => {
        const id = b.getAttribute('data-buy-pick')!;
        this.buyPickaxe(id);
      };
    });
  }

  private clickCookie(): void {
    this.data.cookies += this.data.cookiesPerClick;
    this.data.lifetimeCookies += this.data.cookiesPerClick;
    this.data.totalClicks += 1;

    const display = this.container.querySelector('#cookie-display');
    if (display) display.textContent = Math.floor(this.data.cookies).toLocaleString();
    this.updateAffordability();
  }

  private buyMiner(minerId: string): void {
    const m = MINERS.find(item => item.id === minerId);
    if (!m) return;

    const owned = this.data.producers[m.id] || 0;
    const cost = Math.floor(m.baseCost * Math.pow(1.18, owned));

    if (this.data.cookies >= cost) {
      this.data.cookies -= cost;
      this.data.producers[m.id] = owned + 1;
      this.recalculateBonuses();
      this.updateUI();
    }
  }

  private buyPickaxe(pickId: string): void {
    const p = PICKAXES.find(item => item.id === pickId);
    if (!p) return;

    if (!this.data.upgrades[p.id] && this.data.cookies >= p.cost) {
      this.data.cookies -= p.cost;
      this.data.upgrades[p.id] = 1;
      this.recalculateBonuses();
      this.updateUI();
    }
  }

  private updateAffordability(): void {
    this.container.querySelectorAll('[data-buy-miner]').forEach(b => {
      const id = b.getAttribute('data-buy-miner')!;
      const m = MINERS.find(item => item.id === id);
      if (m) {
        const owned = this.data.producers[m.id] || 0;
        const cost = Math.floor(m.baseCost * Math.pow(1.18, owned));
        const canAfford = this.data.cookies >= cost;
        if (canAfford) {
          b.classList.remove('btn-secondary', 'disabled');
          b.classList.add('btn-primary');
          b.removeAttribute('disabled');
        } else {
          b.classList.remove('btn-primary');
          b.classList.add('btn-secondary', 'disabled');
          b.setAttribute('disabled', 'true');
        }
      }
    });

    this.container.querySelectorAll('[data-buy-pick]').forEach(b => {
      const id = b.getAttribute('data-buy-pick')!;
      const p = PICKAXES.find(item => item.id === id);
      if (p && !this.data.upgrades[p.id]) {
        const canAfford = this.data.cookies >= p.cost;
        if (canAfford) {
          b.classList.remove('btn-secondary', 'disabled');
          b.classList.add('btn-primary');
          b.removeAttribute('disabled');
        } else {
          b.classList.remove('btn-primary');
          b.classList.add('btn-secondary', 'disabled');
          b.setAttribute('disabled', 'true');
        }
      }
    });
  }

  private startTicker(): void {
    this.timerId = setInterval(async () => {
      if (this.data.cookiesPerSecond > 0) {
        const delta = this.data.cookiesPerSecond / 10;
        this.data.cookies += delta;
        this.data.lifetimeCookies += delta;

        if (this.isVisible) {
          const display = this.container?.querySelector('#cookie-display');
          if (display) display.textContent = Math.floor(this.data.cookies).toLocaleString();
          this.updateAffordability();
        }
      }

      if (Math.random() < 0.2) {
        this.saveState();
      }
    }, 100);
  }

  public async saveState(): Promise<void> {
    try {
      this.data.lastTickTimestamp = new Date().toISOString();
      const res = await api.saveCookieData(this.data);
      if (res.vpEarned > 0 && this.data.lifetimeCookies > this.lastNotifiedMilestone) {
        this.lastNotifiedMilestone = this.data.lifetimeCookies;
        NotificationToast.show(`Milestone Reached! Awarded ${res.vpEarned} VP`, 'success');
      }
    } catch (e) {
      console.error('Failed to save cookie clicker state', e);
    }
  }

  public destroy(): void {
    if (this.timerId) clearInterval(this.timerId);
    this.saveState();
  }
}
