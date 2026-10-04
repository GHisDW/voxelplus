import { api } from '../services/api';
import { COSMETIC_ITEMS, CosmeticDef, getUnlockedCosmetics, getCosmeticEffectClass, unlockCosmeticForUser } from '../assets/cosmeticAssets';
import { MINECRAFT_AVATARS, getAvatarDataUrl } from '../assets/minecraftAvatars';
import { SponsorAdModal } from '../components/SponsorAdModal';
import { NotificationToast } from '../components/NotificationToast';
import { ContentPage } from './ContentPage';
import { VoxelUserProfile } from '../../../electron/types';

export class ShopPage {
  private container: HTMLElement;
  private activeSubTab: 'cosmetics' | 'content' = 'cosmetics';
  private selectedFilter: 'all' | 'item' | 'effect' = 'all';
  private user: VoxelUserProfile | null = null;
  private unlockedIds: string[] = ['dirt_block'];
  private contentPage: ContentPage;

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'page-container animate-fade-in';
    this.container.style.cssText = `
      padding: 24px;
      overflow-y: auto;
      height: 100%;
      display: flex;
      flex-direction: column;
      gap: 20px;
    `;
    this.contentPage = new ContentPage();
  }

  public async render(): Promise<HTMLElement> {
    try {
      this.user = await api.getCurrentUser();
      if (this.user) {
        this.unlockedIds = getUnlockedCosmetics(this.user.id);
      }
    } catch {}

    this.renderCurrentView();
    return this.container;
  }

  private renderCurrentView(): void {
    this.container.innerHTML = '';

    // Header & Sub-Tabs
    const headerEl = document.createElement('div');
    headerEl.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
      border-bottom: 1px solid var(--border-subtle);
      padding-bottom: 16px;
    `;

    headerEl.innerHTML = `
      <div>
        <h1 style="font-size: 1.8rem; font-weight: 900; color: var(--text-primary); margin: 0; display: flex; align-items: center; gap: 10px;">
          <span>🛍️</span> Voxel⁺ Shop & Content
        </h1>
        <p style="font-size: 0.88rem; color: var(--text-secondary); margin: 4px 0 0;">
          Unlock exclusive Minecraft cosmetics, enchantment glints, and browse community mods.
        </p>
      </div>

      <div style="display: flex; gap: 8px; background: var(--bg-surface); padding: 4px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
        <button id="tab-cosmetics" class="btn ${this.activeSubTab === 'cosmetics' ? 'btn-primary' : 'btn-secondary'}" style="padding: 8px 16px; font-size: 0.85rem;">
          ✨ Cosmetics & Effects
        </button>
        <button id="tab-content" class="btn ${this.activeSubTab === 'content' ? 'btn-primary' : 'btn-secondary'}" style="padding: 8px 16px; font-size: 0.85rem;">
          📦 Mods & Packs
        </button>
      </div>
    `;

    this.container.appendChild(headerEl);

    (headerEl.querySelector('#tab-cosmetics') as HTMLElement).onclick = () => {
      this.activeSubTab = 'cosmetics';
      this.renderCurrentView();
    };
    (headerEl.querySelector('#tab-content') as HTMLElement).onclick = () => {
      this.activeSubTab = 'content';
      this.renderCurrentView();
    };

    if (this.activeSubTab === 'content') {
      this.contentPage.render().then((el) => this.container.appendChild(el));
      return;
    }

    this.renderCosmeticsShop();
  }

  private renderCosmeticsShop(): void {
    const shopContainer = document.createElement('div');
    shopContainer.style.cssText = `display: flex; flex-direction: column; gap: 20px;`;

    // Top Live Preview Card
    const currentCosmeticId = this.user?.selectedCosmetic;
    const currentEffectClass = getCosmeticEffectClass(currentCosmeticId);
    const avatarUrl = getAvatarDataUrl(this.user?.avatar || 'avatar_steve');

    const previewCard = document.createElement('div');
    previewCard.className = 'card-surface';
    previewCard.style.cssText = `
      background: radial-gradient(circle at 70% 30%, rgba(168, 85, 247, 0.15), rgba(15, 23, 42, 0.95)), var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-xl);
      padding: 20px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
      flex-wrap: wrap;
    `;

    previewCard.innerHTML = `
      <div style="display: flex; align-items: center; gap: 20px;">
        <!-- Live Avatar Frame with Enchantment Effect -->
        <div style="
          width: 80px;
          height: 80px;
          border-radius: 50%;
          border: 3px solid rgba(168, 85, 247, 0.6);
          overflow: hidden;
          background: #090a0f;
          display: flex;
          align-items: center;
          justify-content: center;
        " class="${currentEffectClass}">
          <img src="${avatarUrl}" alt="Avatar" style="width: 100%; height: 100%; object-fit: cover; image-rendering: pixelated;" />
        </div>

        <div>
          <div style="font-size: 0.78rem; font-weight: 700; color: #c084fc; text-transform: uppercase; letter-spacing: 0.05em;">
            LIVE AVATAR PREVIEW
          </div>
          <h2 style="font-size: 1.4rem; font-weight: 800; color: var(--text-primary); margin: 2px 0 0;">
            @${this.user?.username || 'Player'}
          </h2>
          <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 4px; display: flex; align-items: center; gap: 8px;">
            <span>Equipped:</span>
            <span class="badge" style="background: rgba(168, 85, 247, 0.2); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.3);">
              ${COSMETIC_ITEMS.find((c) => c.id === currentCosmeticId)?.name || 'None'}
            </span>
          </div>
        </div>
      </div>

      <div>
        ${currentCosmeticId ? `
          <button id="btn-unequip-all" class="btn btn-secondary" style="font-size: 0.85rem; padding: 8px 16px;">
            Unequip Cosmetic / Effect
          </button>
        ` : ''}
      </div>
    `;

    shopContainer.appendChild(previewCard);

    const unequipBtn = previewCard.querySelector('#btn-unequip-all') as HTMLElement;
    if (unequipBtn) {
      unequipBtn.onclick = async () => {
        try {
          await api.selectCosmetic(null);
          if (this.user) this.user.selectedCosmetic = null;
          NotificationToast.show('Cosmetic unequipped.', 'success');
          this.renderCurrentView();
        } catch {}
      };
    }

    // Filter Buttons
    const filterRow = document.createElement('div');
    filterRow.style.cssText = `display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;`;
    filterRow.innerHTML = `
      <div style="display: flex; gap: 8px;">
        <button class="btn ${this.selectedFilter === 'all' ? 'btn-primary' : 'btn-secondary'}" data-filter="all" style="padding: 6px 14px; font-size: 0.82rem;">
          All Items & Effects
        </button>
        <button class="btn ${this.selectedFilter === 'effect' ? 'btn-primary' : 'btn-secondary'}" data-filter="effect" style="padding: 6px 14px; font-size: 0.82rem;">
          ✨ Enchantment Glints & Effects
        </button>
        <button class="btn ${this.selectedFilter === 'item' ? 'btn-primary' : 'btn-secondary'}" data-filter="item" style="padding: 6px 14px; font-size: 0.82rem;">
          🧱 Minecraft Items
        </button>
      </div>

      <div style="font-size: 0.82rem; color: var(--text-muted);">
        📺 Free Unlocks Supported by Sponsor Ads
      </div>
    `;

    filterRow.querySelectorAll('[data-filter]').forEach((btn) => {
      (btn as HTMLElement).onclick = () => {
        this.selectedFilter = btn.getAttribute('data-filter') as any;
        this.renderCurrentView();
      };
    });

    shopContainer.appendChild(filterRow);

    // Items Grid
    const filteredItems = COSMETIC_ITEMS.filter((item) => {
      if (this.selectedFilter === 'effect') return item.isEffect;
      if (this.selectedFilter === 'item') return !item.isEffect;
      return true;
    });

    const grid = document.createElement('div');
    grid.style.cssText = `
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
    `;

    filteredItems.forEach((item) => {
      const isUnlocked = this.unlockedIds.includes(item.id) || item.unlockedByDefault;
      const isEquipped = this.user?.selectedCosmetic === item.id;

      const card = document.createElement('div');
      card.className = 'card-surface horizontal-card';
      card.style.cssText = `
        padding: 18px;
        border-radius: var(--radius-lg);
        background: var(--bg-card);
        border: 1px solid ${isEquipped ? 'var(--accent-primary)' : 'var(--border-subtle)'};
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 14px;
        position: relative;
      `;

      card.innerHTML = `
        <div style="display: flex; gap: 14px; align-items: center;">
          <!-- Item / Effect Visual -->
          <div style="
            width: 56px;
            height: 56px;
            border-radius: var(--radius-md);
            background: #090a0f;
            border: 2px solid ${item.isEffect ? '#a855f7' : 'rgba(255,255,255,0.1)'};
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
          " class="${item.effectClass || ''}">
            <img src="${item.textureUrl}" alt="${item.name}" style="width: 36px; height: 36px; object-fit: contain; image-rendering: pixelated;" />
          </div>

          <div style="flex: 1; min-width: 0;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <h4 style="font-size: 1rem; font-weight: 800; color: var(--text-primary); margin: 0;">
                ${item.name}
              </h4>
              <span class="badge" style="
                font-size: 0.68rem;
                padding: 2px 6px;
                text-transform: uppercase;
                background: ${item.rarity === 'legendary' ? 'rgba(234, 179, 8, 0.2)' : item.rarity === 'epic' ? 'rgba(168, 85, 247, 0.2)' : 'rgba(59, 130, 246, 0.2)'};
                color: ${item.rarity === 'legendary' ? '#facc15' : item.rarity === 'epic' ? '#c084fc' : '#60a5fa'};
              ">
                ${item.rarity}
              </span>
            </div>
            <p style="font-size: 0.78rem; color: var(--text-secondary); margin: 4px 0 0; line-height: 1.35;">
              ${item.description}
            </p>
          </div>
        </div>

        <!-- Action Row -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-subtle); padding-top: 10px; margin-top: 4px;">
          <div style="font-size: 0.75rem; color: var(--text-muted);">
            ${isUnlocked ? '<span style="color: #10b981; font-weight: 700;">✓ Unlocked</span>' : '📺 5s Sponsor Ad'}
          </div>

          <div>
            ${isEquipped ? `
              <span style="font-size: 0.82rem; font-weight: 700; color: var(--accent-primary);">
                ● Equipped
              </span>
            ` : isUnlocked ? `
              <button class="btn btn-primary btn-equip" style="padding: 6px 14px; font-size: 0.8rem; font-weight: 700;">
                Equip
              </button>
            ` : `
              <button class="btn btn-secondary btn-unlock-ad" style="
                padding: 6px 14px;
                font-size: 0.8rem;
                font-weight: 700;
                background: rgba(168, 85, 247, 0.15);
                border: 1px solid rgba(168, 85, 247, 0.4);
                color: #c084fc;
              ">
                📺 Watch Ad to Unlock
              </button>
            `}
          </div>
        </div>
      `;

      // Equip handler
      const equipBtn = card.querySelector('.btn-equip') as HTMLElement;
      if (equipBtn) {
        equipBtn.onclick = async () => {
          try {
            await api.selectCosmetic(item.id);
            if (this.user) this.user.selectedCosmetic = item.id;
            NotificationToast.show(`Equipped: ${item.name}!`, 'success');
            this.renderCurrentView();
          } catch (err: any) {
            NotificationToast.show(err.message || 'Failed to equip.', 'error');
          }
        };
      }

      // Unlock via Ad handler
      const adBtn = card.querySelector('.btn-unlock-ad') as HTMLElement;
      if (adBtn) {
        adBtn.onclick = () => {
          const adModal = new SponsorAdModal({
            cosmetic: item,
            userId: this.user?.id || 'guest',
            onUnlocked: async () => {
              this.unlockedIds = getUnlockedCosmetics(this.user?.id || 'guest');
              try {
                await api.selectCosmetic(item.id);
                if (this.user) this.user.selectedCosmetic = item.id;
              } catch {}
              this.renderCurrentView();
            },
            onClose: () => {}
          });
          adModal.show();
        };
      }

      grid.appendChild(card);
    });

    shopContainer.appendChild(grid);
    this.container.appendChild(shopContainer);
  }
}
