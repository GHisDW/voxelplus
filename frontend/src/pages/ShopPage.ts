import { api } from '../services/api';
import { CosmeticDefinition, CosmeticEffect, WalletState } from '../../../electron/types';
import { NotificationToast } from '../components/NotificationToast';
import { getItemDataUrl } from '../assets/items';

export class ShopPage {
  private container: HTMLElement;
  private activeTab: 'cosmetics' | 'effects' = 'cosmetics';

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'page-content animate-fade-in';
    this.container.style.cssText = 'padding: 24px; overflow-y: auto; height: 100%;';
  }

  public async render(): Promise<HTMLElement> {
    const cosmeticsData = await api.getCosmetics();
    const wallet = await api.getWallet();
    const profile = await api.getPlayerProfile();

    const ownedMap = new Set(cosmeticsData.owned.map(o => o.cosmeticId));

    this.container.innerHTML = `
      <!-- Header Banner with 1UP / Fortnite Style Currency Token -->
      <div style="
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 22px 26px;
        background: linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(6, 182, 212, 0.06) 100%);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-lg);
        margin-bottom: 24px;
      ">
        <div>
          <h1 style="font-size: 1.6rem; font-weight: 800; color: var(--text-primary); margin-bottom: 4px;">V+ Marketplace</h1>
          <p style="color: var(--text-secondary); font-size: 0.88rem;">Spend earned V+ Points (VP) on authentic Minecraft items and particle effects.</p>
        </div>
        <div style="display: flex; align-items: center; gap: 12px;">
          <div class="voxel-coin-badge" style="padding: 8px 16px; font-size: 1.1rem;">
            <span class="voxel-coin-icon" style="width: 24px; height: 24px; font-size: 13px;">V</span>
            <span>${wallet.balance.toLocaleString()} VP</span>
          </div>
        </div>
      </div>

      <!-- 2 Main Tabs: Cosmetics, Cosmetic Effects -->
      <div style="display: flex; gap: 8px; margin-bottom: 24px;">
        <button class="btn ${this.activeTab === 'cosmetics' ? 'btn-primary' : 'btn-secondary'}" id="shop-tab-cosmetics">
          Cosmetics (${cosmeticsData.catalogue.length})
        </button>
        <button class="btn ${this.activeTab === 'effects' ? 'btn-primary' : 'btn-secondary'}" id="shop-tab-effects">
          Cosmetic Effects (${cosmeticsData.effects.length})
        </button>
      </div>

      <!-- Tab Content Grid -->
      <div id="shop-stage">
        ${this.renderActiveTab(cosmeticsData, wallet, ownedMap, profile)}
      </div>
    `;

    // Hook tab buttons
    const tabCosmetics = this.container.querySelector('#shop-tab-cosmetics') as HTMLElement;
    const tabEffects = this.container.querySelector('#shop-tab-effects') as HTMLElement;

    tabCosmetics.onclick = () => { this.activeTab = 'cosmetics'; this.render(); };
    tabEffects.onclick = () => { this.activeTab = 'effects'; this.render(); };

    // Hook buy cosmetic buttons
    this.container.querySelectorAll('[data-buy-cosmetic]').forEach(btn => {
      (btn as HTMLElement).onclick = async () => {
        const id = btn.getAttribute('data-buy-cosmetic')!;
        const res = await api.purchaseCosmetic(id);
        if (res.success) {
          NotificationToast.show('Acquired Minecraft item cosmetic!', 'success');
          this.render();
        } else {
          NotificationToast.show(res.error || 'Purchase failed', 'error');
        }
      };
    });

    // Hook equip cosmetic buttons
    this.container.querySelectorAll('[data-equip-cosmetic]').forEach(btn => {
      (btn as HTMLElement).onclick = async () => {
        const id = btn.getAttribute('data-equip-cosmetic')!;
        await api.equipCosmetic(id, profile.equippedEffectId);
        NotificationToast.show('Cosmetic equipped!', 'success');
        this.render();
      };
    });

    // Hook equip effect buttons
    this.container.querySelectorAll('[data-equip-effect]').forEach(btn => {
      (btn as HTMLElement).onclick = async () => {
        const effectId = btn.getAttribute('data-equip-effect')!;
        const target = profile.equippedEffectId === effectId ? null : effectId;
        await api.equipCosmetic(profile.equippedCosmeticId, target);
        NotificationToast.show(target ? 'Particle effect equipped!' : 'Effect removed', 'success');
        this.render();
      };
    });

    return this.container;
  }

  private renderActiveTab(
    cosmeticsData: { catalogue: CosmeticDefinition[]; owned: any[]; effects: CosmeticEffect[] },
    wallet: WalletState,
    ownedMap: Set<string>,
    profile: any
  ): string {
    if (this.activeTab === 'cosmetics') {
      const itemsHtml = cosmeticsData.catalogue.map(item => {
        const isOwned = ownedMap.has(item.id);
        const isEquipped = profile.equippedCosmeticId === item.id;
        const canAfford = item.price !== null && wallet.balance >= item.price;
        const textureUrl = getItemDataUrl(item.artworkPath);

        let badgeColor = '#10b981';
        if (item.rarity === 'uncommon') badgeColor = '#38bdf8';
        if (item.rarity === 'rare') badgeColor = '#818cf8';
        if (item.rarity === 'epic') badgeColor = '#c084fc';
        if (item.rarity === 'legendary') badgeColor = '#f59e0b';

        return `
          <div class="card" style="
            display: flex;
            flex-direction: column;
            padding: 16px;
            background: var(--bg-surface);
            border: 1px solid ${isEquipped ? 'var(--accent-primary)' : 'var(--border-subtle)'};
            border-radius: var(--radius-lg);
            transition: transform 0.15s;
          ">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
              <span style="
                font-size: 0.72rem;
                font-weight: 800;
                text-transform: uppercase;
                padding: 2px 8px;
                border-radius: 999px;
                background: ${badgeColor}22;
                color: ${badgeColor};
              ">${item.rarity}</span>
              <span style="font-size: 0.72rem; color: var(--text-muted); font-family: var(--font-mono);">${item.artworkPath}</span>
            </div>

            <!-- Item Texture Visual with Aura -->
            <div style="
              display: flex;
              align-items: center;
              justify-content: center;
              height: 100px;
              background: var(--bg-card);
              border-radius: var(--radius-md);
              margin-bottom: 12px;
            " class="${isEquipped && profile.equippedEffectId ? profile.equippedEffectId : ''}">
              <img src="${textureUrl}" style="
                width: 56px;
                height: 56px;
                image-rendering: pixelated;
                filter: drop-shadow(0 6px 12px rgba(0,0,0,0.6));
              " />
            </div>

            <div style="font-size: 1rem; font-weight: 800; color: var(--text-primary); margin-bottom: 4px;">
              ${item.name}
            </div>
            <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 16px; flex: 1;">
              ${item.description}
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: auto;">
              ${isOwned ? `
                <span style="font-size: 0.8rem; font-weight: 700; color: #10b981;">
                  ${isEquipped ? '✓ EQUIPPED' : '✓ OWNED'}
                </span>
                <button class="btn btn-sm ${isEquipped ? 'btn-secondary' : 'btn-primary'}" data-equip-cosmetic="${item.id}">
                  ${isEquipped ? 'Unequip' : 'Equip'}
                </button>
              ` : `
                <div class="voxel-coin-badge" style="padding: 2px 8px; font-size: 0.85rem;">
                  <span class="voxel-coin-icon" style="width: 14px; height: 14px; font-size: 9px;">V</span>
                  <span>${item.price?.toLocaleString()}</span>
                </div>
                <button class="btn btn-sm ${canAfford ? 'btn-primary' : 'btn-secondary disabled'}" data-buy-cosmetic="${item.id}" ${canAfford ? '' : 'disabled'}>
                  Buy Item
                </button>
              `}
            </div>
          </div>
        `;
      }).join('');

      return `
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 16px;">
          ${itemsHtml}
        </div>
      `;
    }

    if (this.activeTab === 'effects') {
      const effectsHtml = cosmeticsData.effects.map(fx => {
        const isEquipped = profile.equippedEffectId === fx.id;
        return `
          <div class="card ${fx.cssClass}" style="
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 18px 24px;
            background: var(--bg-surface);
            border-radius: var(--radius-lg);
            margin-bottom: 14px;
          ">
            <div style="display: flex; align-items: center; gap: 18px;">
              <div style="
                width: 52px;
                height: 52px;
                border-radius: var(--radius-md);
                background: #111827;
                border: 1px solid var(--border-subtle);
                display: flex;
                align-items: center;
                justify-content: center;
              " class="${fx.cssClass}">
                <img src="${getItemDataUrl('minecraft:enchanted_book')}" style="width: 32px; height: 32px; image-rendering: pixelated;" />
              </div>
              <div>
                <div style="font-size: 1.05rem; font-weight: 800; color: var(--text-primary);">${fx.name}</div>
                <div style="font-size: 0.82rem; color: var(--text-secondary);">Family: ${fx.family} • Animated Ambient Aura</div>
              </div>
            </div>
            <button class="btn btn-sm ${isEquipped ? 'btn-secondary' : 'btn-primary'}" data-equip-effect="${fx.id}">
              ${isEquipped ? 'Remove Effect' : 'Equip Effect'}
            </button>
          </div>
        `;
      }).join('');

      return `
        <div style="display: flex; flex-direction: column; max-width: 760px;">
          ${effectsHtml}
        </div>
      `;
    }

    return '';
  }
}
