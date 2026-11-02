import { api } from '../services/api';
import { CosmeticDefinition, CosmeticEffect, WalletState } from '../../../electron/types';
import { NotificationToast } from '../components/NotificationToast';
import { getItemDataUrl } from '../assets/items';
import { escapeHtml } from '../utils/html';

export class ShopPage {
  private container: HTMLElement;
  private activeTab: 'cosmetics' | 'effects' | 'vpacks' = 'vpacks';

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'page-content animate-fade-in';
    this.container.style.cssText = 'padding: 24px; overflow-y: auto; height: 100%;';
  }

  public async render(): Promise<HTMLElement> {
    const cosmeticsData = await api.getCosmetics();
    const wallet = await api.getWallet();
    const profile = await api.getPlayerProfile();
    const vpackList = await api.listRepositoryVPacks();

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
          <p style="color: var(--text-secondary); font-size: 0.88rem;">Spend earned V+ Points (VP) on curated VPack modpacks, items, and particle effects.</p>
        </div>
        <div style="display: flex; align-items: center; gap: 12px;">
          <div class="voxel-coin-badge" style="padding: 8px 16px; font-size: 1.1rem;">
            <span class="voxel-coin-icon" style="width: 24px; height: 24px; font-size: 13px;">V</span>
            <span>${wallet.balance.toLocaleString()} VP</span>
          </div>
        </div>
      </div>

      <!-- 3 Main Tabs: VPack Modpacks, Cosmetics, Cosmetic Effects -->
      <div style="display: flex; gap: 8px; margin-bottom: 24px; flex-wrap: wrap;">
        <button class="btn ${this.activeTab === 'vpacks' ? 'btn-primary' : 'btn-secondary'}" id="shop-tab-vpacks">
          📦 VPack Modpacks (${vpackList.length})
        </button>
        <button class="btn ${this.activeTab === 'cosmetics' ? 'btn-primary' : 'btn-secondary'}" id="shop-tab-cosmetics">
          Minecraft Cosmetics (${cosmeticsData.catalogue.length})
        </button>
        <button class="btn ${this.activeTab === 'effects' ? 'btn-primary' : 'btn-secondary'}" id="shop-tab-effects">
          Cosmetic Effects (${cosmeticsData.effects.length})
        </button>
      </div>

      <!-- Tab Content Grid -->
      <div id="shop-stage">
        ${this.renderActiveTab(cosmeticsData, wallet, ownedMap, profile, vpackList)}
      </div>

      <!-- VPack Details Modal -->
      <div id="vpack-details-modal" style="display: none;" class="modal-overlay"></div>
    `;

    // Hook tab buttons
    const tabVPacks = this.container.querySelector('#shop-tab-vpacks') as HTMLElement;
    const tabCosmetics = this.container.querySelector('#shop-tab-cosmetics') as HTMLElement;
    const tabEffects = this.container.querySelector('#shop-tab-effects') as HTMLElement;

    tabVPacks.onclick = () => { this.activeTab = 'vpacks'; this.render(); };
    tabCosmetics.onclick = () => { this.activeTab = 'cosmetics'; this.render(); };
    tabEffects.onclick = () => { this.activeTab = 'effects'; this.render(); };

    // Hook buy VPack buttons
    this.container.querySelectorAll('[data-buy-vpack]').forEach(btn => {
      (btn as HTMLElement).onclick = async () => {
        const filePath = btn.getAttribute('data-buy-vpack')!;
        NotificationToast.show('Purchasing and extracting VPack...', 'info');

        try {
          const res = await api.purchaseVPack(filePath);
          if (res.success && res.instance) {
            NotificationToast.show(`Unlocked & Installed "${res.instance.name}"! Available under Instances.`, 'success');
            this.render();
          } else {
            NotificationToast.show(res.error || 'Failed to purchase VPack.', 'error');
          }
        } catch (err: any) {
          NotificationToast.show(err?.message || 'Transaction failed', 'error');
        }
      };
    });

    // Hook inspect VPack details
    this.container.querySelectorAll('[data-inspect-vpack]').forEach(btn => {
      (btn as HTMLElement).onclick = () => {
        const filePath = btn.getAttribute('data-inspect-vpack')!;
        const item = vpackList.find(v => v.filePath === filePath);
        if (item) {
          this.showVPackModal(item, wallet);
        }
      };
    });

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

  private showVPackModal(item: any, wallet: WalletState): void {
    const modal = this.container.querySelector('#vpack-details-modal') as HTMLElement;
    if (!modal) return;

    const manifest = item.manifest;
    const price = item.price || 200;
    const canAfford = wallet.balance >= price;
    const textureUrl = getItemDataUrl(manifest.item || 'minecraft:grass_block');
    const contentList = manifest.content || [];

    modal.style.display = 'flex';
    modal.innerHTML = `
      <div class="modal-content animate-scale-in" style="max-width: 680px; padding: 28px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;">
          <div style="display: flex; align-items: center; gap: 16px;">
            <div style="
              width: 56px;
              height: 56px;
              border-radius: var(--radius-md);
              background: var(--bg-elevated);
              border: 1px solid var(--border-subtle);
              display: flex;
              align-items: center;
              justify-content: center;
            ">
              <img src="${textureUrl}" style="width: 40px; height: 40px; image-rendering: pixelated; object-fit: contain;" />
            </div>
            <div>
              <h2 style="font-size: 1.3rem; font-weight: 800; color: var(--text-primary); margin: 0;">
                ${escapeHtml(manifest.name)}
              </h2>
              <div style="font-size: 0.82rem; color: var(--text-secondary); margin-top: 2px;">
                by ${escapeHtml(manifest.author || 'Voxel+ Studio')} • Fabric Loader ${escapeHtml(manifest.loader?.version || '0.16.0')}
              </div>
            </div>
          </div>
          <button class="btn btn-icon" id="btn-close-vpack-modal">✕</button>
        </div>

        <p style="font-size: 0.9rem; color: var(--text-secondary); line-height: 1.6; margin-bottom: 20px;">
          ${escapeHtml(manifest.description)}
        </p>

        <!-- Technical Specs -->
        <div style="
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
          padding: 14px;
          background: var(--bg-elevated-soft);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          margin-bottom: 20px;
          text-align: center;
        ">
          <div>
            <div style="font-size: 0.72rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">Minecraft</div>
            <div style="font-size: 0.92rem; font-weight: 800; color: var(--success);">v${escapeHtml(manifest.minecraft?.version || '1.21.1')}</div>
          </div>
          <div>
            <div style="font-size: 0.72rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">Loader</div>
            <div style="font-size: 0.92rem; font-weight: 800; color: var(--info);">${escapeHtml(manifest.loader?.type || 'fabric')}</div>
          </div>
          <div>
            <div style="font-size: 0.72rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">Pack Price</div>
            <div style="font-size: 0.92rem; font-weight: 800; color: var(--warning);">${price} VP</div>
          </div>
        </div>

        <!-- Included Mods & Content List -->
        <div style="margin-bottom: 24px;">
          <div style="font-size: 0.92rem; font-weight: 800; color: var(--text-primary); margin-bottom: 10px;">
            Included Mod Components (${contentList.length} files)
          </div>
          <div style="max-height: 160px; overflow-y: auto; background: var(--bg-input); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 10px;">
            ${contentList.map((c: any) => `
              <div style="display: flex; justify-content: space-between; padding: 6px 8px; font-size: 0.8rem; font-family: var(--font-mono); border-bottom: 1px solid var(--border-row);">
                <span style="color: var(--text-primary);">${escapeHtml(c.relativePath)}</span>
                <span style="color: var(--text-muted);">${escapeHtml(c.type)}</span>
              </div>
            `).join('') || '<div style="font-size: 0.8rem; color: var(--text-muted); padding: 8px;">Standard Fabric Loom project files included.</div>'}
          </div>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 12px;">
          <button class="btn btn-secondary" id="btn-modal-cancel">Cancel</button>
          <button class="btn ${canAfford ? 'btn-primary' : 'btn-secondary disabled'}" id="btn-modal-install" ${canAfford ? '' : 'disabled'}>
            Unlock & Install VPack (${price} VP)
          </button>
        </div>
      </div>
    `;

    const closeBtn = modal.querySelector('#btn-close-vpack-modal') as HTMLElement;
    const cancelBtn = modal.querySelector('#btn-modal-cancel') as HTMLElement;
    const installBtn = modal.querySelector('#btn-modal-install') as HTMLElement;

    const closeModal = () => { modal.style.display = 'none'; };
    closeBtn.onclick = closeModal;
    cancelBtn.onclick = closeModal;

    if (canAfford) {
      installBtn.onclick = async () => {
        closeModal();
        NotificationToast.show('Purchasing and extracting VPack...', 'info');
        try {
          const res = await api.purchaseVPack(item.filePath);
          if (res.success && res.instance) {
            NotificationToast.show(`Unlocked & Installed "${res.instance.name}"!`, 'success');
            this.render();
          } else {
            NotificationToast.show(res.error || 'Purchase failed', 'error');
          }
        } catch (err: any) {
          NotificationToast.show('Transaction error', 'error');
        }
      };
    }
  }

  private renderActiveTab(
    cosmeticsData: { catalogue: CosmeticDefinition[]; owned: any[]; effects: CosmeticEffect[] },
    wallet: WalletState,
    ownedMap: Set<string>,
    profile: any,
    vpackList: any[]
  ): string {
    if (this.activeTab === 'vpacks') {
      const vpacksHtml = vpackList.map(item => {
        const manifest = item.manifest;
        const price = item.price || 200;
        const canAfford = wallet.balance >= price;
        const textureUrl = getItemDataUrl(manifest.item || 'minecraft:grass_block');

        return `
          <div class="card" style="
            display: flex;
            flex-direction: column;
            padding: 20px;
            background: var(--bg-elevated-soft);
            backdrop-filter: blur(8px);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-xl);
            transition: transform 0.15s, border-color 0.15s;
          ">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
              <span style="
                font-size: 0.72rem;
                font-weight: 800;
                text-transform: uppercase;
                padding: 3px 10px;
                border-radius: 999px;
                background: rgba(99, 102, 241, 0.2);
                color: var(--text-accent);
                border: 1px solid rgba(99, 102, 241, 0.4);
              ">📦 VPACK MODPACK</span>
              <span style="font-size: 0.75rem; color: var(--success); font-weight: 700;">MC ${escapeHtml(manifest.minecraft?.version || '1.21.1')}</span>
            </div>

            <!-- Item Texture / Visual Header -->
            <div style="
              display: flex;
              align-items: center;
              gap: 16px;
              padding: 14px;
              background: var(--bg-elevated-soft);
              border-radius: var(--radius-md);
              margin-bottom: 14px;
            ">
              <div style="
                width: 52px;
                height: 52px;
                border-radius: var(--radius-md);
                background: var(--bg-elevated);
                border: 1px solid var(--border-subtle);
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
              ">
                <img src="${textureUrl}" style="width: 38px; height: 38px; image-rendering: pixelated; object-fit: contain;" alt="${escapeHtml(manifest.name)}" />
              </div>
              <div style="flex: 1; min-width: 0;">
                <div style="font-size: 1.1rem; font-weight: 800; color: var(--text-primary); margin-bottom: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                  ${escapeHtml(manifest.name)}
                </div>
                <div style="font-size: 0.78rem; color: var(--text-secondary);">
                  by ${escapeHtml(manifest.author || 'Voxel+ Studio')} • Fabric ${escapeHtml(manifest.loader?.version || '0.16.0')}
                </div>
              </div>
            </div>

            <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 20px; line-height: 1.5; flex: 1;">
              ${escapeHtml(manifest.description || 'Packed Voxel+ Minecraft instance ready to install and play.')}
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: auto; padding-top: 12px; border-top: 1px solid var(--border-row); gap: 10px;">
              <button class="btn btn-sm btn-secondary" data-inspect-vpack="${item.filePath}">
                Inspect Mods
              </button>

              <div style="display: flex; align-items: center; gap: 8px;">
                <div class="voxel-coin-badge" style="padding: 4px 10px; font-size: 0.88rem;">
                  <span class="voxel-coin-icon" style="width: 14px; height: 14px; font-size: 9px;">V</span>
                  <span>${price.toLocaleString()}</span>
                </div>
                <button class="btn btn-sm ${canAfford ? 'btn-primary' : 'btn-secondary disabled'}" data-buy-vpack="${item.filePath}" data-price="${price}" ${canAfford ? '' : 'disabled'}>
                  Unlock VPack
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('');

      return `
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 20px;">
          ${vpacksHtml || '<div style="color: var(--text-muted); padding: 20px 0;">No VPacks found in repository.</div>'}
        </div>
      `;
    }

    if (this.activeTab === 'cosmetics') {
      const itemsHtml = cosmeticsData.catalogue.map(item => {
        const isOwned = ownedMap.has(item.id);
        const isEquipped = profile.equippedCosmeticId === item.id;
        const canAfford = item.price !== null && wallet.balance >= item.price;
        const textureUrl = getItemDataUrl(item.artworkPath);

        let badgeColor = 'var(--rarity-common)';
        if (item.rarity === 'uncommon') badgeColor = 'var(--rarity-uncommon)';
        if (item.rarity === 'rare') badgeColor = 'var(--rarity-rare)';
        if (item.rarity === 'epic') badgeColor = 'var(--rarity-epic)';
        if (item.rarity === 'legendary') badgeColor = 'var(--rarity-legendary)';

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
                background: color-mix(in srgb, ${badgeColor} 15%, transparent);
                color: ${badgeColor};
              ">${item.rarity}</span>
              <span style="font-size: 0.72rem; color: var(--text-muted); font-family: var(--font-mono);">${escapeHtml(item.artworkPath)}</span>
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
              position: relative;
              overflow: hidden;
            " class="${isEquipped && profile.equippedEffectId ? profile.equippedEffectId : ''}">
              <img src="${textureUrl}" style="
                width: 56px;
                height: 56px;
                image-rendering: pixelated;
                object-fit: contain;
                filter: drop-shadow(0 6px 12px rgba(0,0,0,0.6));
              " />
            </div>

            <div style="font-size: 1rem; font-weight: 800; color: var(--text-primary); margin-bottom: 4px;">
              ${escapeHtml(item.name)}
            </div>
            <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 16px; flex: 1;">
              ${escapeHtml(item.description)}
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: auto;">
              ${isOwned ? `
                <span style="font-size: 0.8rem; font-weight: 700; color: var(--success);">
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
            position: relative;
            overflow: hidden;
          ">
            <div style="display: flex; align-items: center; gap: 18px;">
              <div style="
                width: 52px;
                height: 52px;
                border-radius: var(--radius-md);
                background: var(--bg-elevated);
                border: 1px solid var(--border-subtle);
                display: flex;
                align-items: center;
                justify-content: center;
                position: relative;
                overflow: hidden;
              " class="${fx.cssClass}">
                <img src="${getItemDataUrl('minecraft:enchanted_book')}" style="width: 32px; height: 32px; image-rendering: pixelated; object-fit: contain;" />
              </div>
              <div>
                <div style="font-size: 1.05rem; font-weight: 800; color: var(--text-primary);">${escapeHtml(fx.name)}</div>
                <div style="font-size: 0.82rem; color: var(--text-secondary);">Family: ${escapeHtml(fx.family)} • Animated Ambient Aura</div>
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
