import { api } from '../services/api';
import { getCosmeticDef, getCosmeticEffectClass } from '../assets/cosmeticAssets';
import { getAvatarDataUrl } from '../assets/minecraftAvatars';
import { NotificationToast } from '../components/NotificationToast';
import { VoxelUserProfile } from '../../../electron/types';

type ShopTab = 'cosmetics' | 'effects' | 'vpacks';

export class ShopPage {
  private container: HTMLElement;
  private activeSubTab: ShopTab = 'cosmetics';
  private user: VoxelUserProfile | null = null;

  // Server-authoritative state (never localStorage)
  private catalog: any[] = [];
  private ownedIds: Set<string> = new Set();
  private adProgress: Map<string, { completed: number; required: number }> = new Map();
  private adsAvailable: boolean = false;
  private vpackCatalog: any[] = [];
  private ownedVpackIds: Set<string> = new Set();
  private catalogError: string | null = null;

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
  }

  public async render(): Promise<HTMLElement> {
    this.catalogError = null;
    try {
      this.user = await api.getCurrentUser();
    } catch {}

    try {
      const [catalog, owned, adStatus, progress, vpackCatalog, vpacks] = await Promise.all([
        api.listCosmeticsCatalog(),
        api.getUserCosmetics().catch(() => []),
        api.getAdsStatus().catch(() => ({ available: false, provider: null })),
        api.getAdProgress().catch(() => []),
        api.listVpackCatalog().catch(() => []),
        api.listVpacks().catch(() => [])
      ]);
      this.catalog = catalog || [];
      this.ownedIds = new Set((owned || []).map((o: any) => o.id));
      this.adsAvailable = adStatus?.available === true;
      this.adProgress = new Map(
        (progress || []).map((p: any) => [`${p.itemKind}:${p.itemId}`, { completed: p.completed, required: p.required }])
      );
      this.vpackCatalog = vpackCatalog || [];
      this.ownedVpackIds = new Set(
        (vpacks || [])
          .map((v: any) => v.metadata?.vpack_id)
          .filter(Boolean)
      );
    } catch (err: any) {
      this.catalogError = err?.message || 'Shop catalog is unavailable.';
    }

    this.renderCurrentView();
    return this.container;
  }

  private renderCurrentView(): void {
    this.container.innerHTML = '';

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
          <span>🛍️</span> Voxel⁺ Shop
        </h1>
        <p style="font-size: 0.88rem; color: var(--text-secondary); margin: 4px 0 0;">
          Unlock Minecraft cosmetics, cosmetic effects, and VPacks with rewarded ads.
        </p>
      </div>

      <div style="display: flex; gap: 8px; background: var(--bg-surface); padding: 4px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
        <button id="tab-cosmetics" class="btn ${this.activeSubTab === 'cosmetics' ? 'btn-primary' : 'btn-secondary'}" style="padding: 8px 16px; font-size: 0.85rem;">
          🧱 Cosmetics
        </button>
        <button id="tab-effects" class="btn ${this.activeSubTab === 'effects' ? 'btn-primary' : 'btn-secondary'}" style="padding: 8px 16px; font-size: 0.85rem;">
          ✨ Cosmetic Effects
        </button>
        <button id="tab-vpacks" class="btn ${this.activeSubTab === 'vpacks' ? 'btn-primary' : 'btn-secondary'}" style="padding: 8px 16px; font-size: 0.85rem;">
          📦 VPacks
        </button>
      </div>
    `;

    this.container.appendChild(headerEl);

    (headerEl.querySelector('#tab-cosmetics') as HTMLElement).onclick = () => { this.activeSubTab = 'cosmetics'; this.renderCurrentView(); };
    (headerEl.querySelector('#tab-effects') as HTMLElement).onclick = () => { this.activeSubTab = 'effects'; this.renderCurrentView(); };
    (headerEl.querySelector('#tab-vpacks') as HTMLElement).onclick = () => { this.activeSubTab = 'vpacks'; this.renderCurrentView(); };

    if (this.catalogError) {
      const err = document.createElement('div');
      err.style.cssText = 'padding: 24px; border: 1px solid rgba(239,68,68,0.4); border-radius: var(--radius-lg); color: #f87171;';
      err.textContent = this.catalogError;
      this.container.appendChild(err);
      return;
    }

    if (this.activeSubTab === 'vpacks') {
      this.renderVpacks();
      return;
    }

    this.renderCosmeticsShop(this.activeSubTab === 'effects');
  }

  private adProgressFor(kind: 'cosmetic' | 'vpack', itemId: string, required: number) {
    const p = this.adProgress.get(`${kind}:${itemId}`);
    return { completed: p?.completed ?? 0, required };
  }

  private renderCosmeticsShop(effectsOnly: boolean): void {
    const shopContainer = document.createElement('div');
    shopContainer.style.cssText = `display: flex; flex-direction: column; gap: 20px;`;

    // Live preview card (equipped cosmetic/effect visual)
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
        <div style="
          width: 80px; height: 80px; border-radius: 50%;
          border: 3px solid rgba(168, 85, 247, 0.6);
          overflow: hidden; background: #090a0f;
          display: flex; align-items: center; justify-content: center;
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
              ${getCosmeticDef(currentCosmeticId)?.name || 'None'}
            </span>
          </div>
        </div>
      </div>
      <div>
        ${currentCosmeticId ? `<button id="btn-unequip-all" class="btn btn-secondary" style="font-size: 0.85rem; padding: 8px 16px;">Unequip</button>` : ''}
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

    const items = this.catalog.filter((item: any) => effectsOnly ? item.type === 'effect' : item.type !== 'effect');
    const grid = document.createElement('div');
    grid.style.cssText = `display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px;`;

    items.forEach((item: any) => {
      const isUnlocked = this.ownedIds.has(item.id);
      const isEquipped = this.user?.selectedCosmetic === item.id;
      const def = getCosmeticDef(item.id);
      const isRewardOnly = (item.unlock_condition || '').toLowerCase().includes('achievement');
      const required = item.adsRequired ?? 2;
      const { completed } = this.adProgressFor('cosmetic', item.id, required);

      const card = document.createElement('div');
      card.className = 'card-surface horizontal-card';
      card.style.cssText = `
        padding: 18px; border-radius: var(--radius-lg); background: var(--bg-card);
        border: 1px solid ${isEquipped ? 'var(--accent-primary)' : 'var(--border-subtle)'};
        display: flex; flex-direction: column; justify-content: space-between; gap: 14px;
      `;

      const visual = def?.textureUrl
        ? `<img src="${def.textureUrl}" alt="${item.name}" style="width: 36px; height: 36px; object-fit: contain; image-rendering: pixelated;" />`
        : `<span style="font-size: 1.8rem;">${item.icon || '🧱'}</span>`;

      card.innerHTML = `
        <div style="display: flex; gap: 14px; align-items: center;">
          <div style="
            width: 56px; height: 56px; border-radius: var(--radius-md); background: #090a0f;
            border: 2px solid ${item.type === 'effect' ? '#a855f7' : 'rgba(255,255,255,0.1)'};
            display: flex; align-items: center; justify-content: center; flex-shrink: 0;
          " class="${def?.effectClass || ''}">
            ${visual}
          </div>
          <div style="flex: 1; min-width: 0;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <h4 style="font-size: 1rem; font-weight: 800; color: var(--text-primary); margin: 0;">${item.name}</h4>
              <span class="badge" style="font-size: 0.68rem; padding: 2px 6px; text-transform: uppercase;
                background: ${item.rarity === 'legendary' ? 'rgba(234,179,8,0.2)' : item.rarity === 'epic' ? 'rgba(168,85,247,0.2)' : 'rgba(59,130,246,0.2)'};
                color: ${item.rarity === 'legendary' ? '#facc15' : item.rarity === 'epic' ? '#c084fc' : '#60a5fa'};">${item.rarity}</span>
            </div>
            <p style="font-size: 0.78rem; color: var(--text-secondary); margin: 4px 0 0; line-height: 1.35;">${item.description || ''}</p>
          </div>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-subtle); padding-top: 10px; margin-top: 4px;">
          <div style="font-size: 0.75rem; color: var(--text-muted);">
            ${isUnlocked ? '<span style="color:#10b981;font-weight:700;">✓ Owned</span>'
              : isRewardOnly ? '🏆 Achievement reward'
              : this.adsAvailable ? `📺 ${completed} / ${required} ads completed`
              : '🔒 Rewarded ads unavailable'}
          </div>
          <div>
            ${isEquipped ? '<span style="font-size:0.82rem;font-weight:700;color:var(--accent-primary);">● Equipped</span>'
              : isUnlocked ? `<button class="btn btn-primary btn-equip" style="padding:6px 14px;font-size:0.8rem;font-weight:700;">Equip</button>`
              : isRewardOnly ? `<span style="font-size:0.78rem;color:var(--text-muted);">Unlock via achievements</span>`
              : this.adsAvailable ? `<button class="btn btn-secondary btn-unlock-ad" style="padding:6px 14px;font-size:0.8rem;font-weight:700;background:rgba(168,85,247,0.15);border:1px solid rgba(168,85,247,0.4);color:#c084fc;">📺 Watch Ad</button>`
              : `<span style="font-size:0.78rem;color:var(--text-muted);">Unavailable</span>`}
          </div>
        </div>
      `;

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

      // A real rewarded-ad provider drives this flow; without one the button
      // does not exist — no fake timers, no client-claimed completions.
      const adBtn = card.querySelector('.btn-unlock-ad') as HTMLElement;
      if (adBtn) {
        adBtn.onclick = async () => {
          try {
            const proof = (window as any).voxelAds?.requestRewardedAd
              ? await (window as any).voxelAds.requestRewardedAd(item.id)
              : null;
            if (!proof) {
              NotificationToast.show('No rewarded ad is available right now.', 'error');
              return;
            }
            const res = await api.completeAd('cosmetic', item.id, proof.completionId, proof.token);
            if (res?.granted) {
              this.ownedIds.add(item.id);
              NotificationToast.show(`Unlocked: ${item.name}!`, 'success');
            } else {
              NotificationToast.show(`Progress: ${res?.completed ?? '?'} / ${res?.required ?? required} ads`, 'success');
            }
            this.renderCurrentView();
          } catch (err: any) {
            NotificationToast.show(err.message || 'Ad could not be completed.', 'error');
          }
        };
      }

      grid.appendChild(card);
    });

    shopContainer.appendChild(grid);
    this.container.appendChild(shopContainer);
  }

  private renderVpacks(): void {
    const wrap = document.createElement('div');
    wrap.style.cssText = `display: flex; flex-direction: column; gap: 20px;`;

    const grid = document.createElement('div');
    grid.style.cssText = `display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px;`;

    this.vpackCatalog.forEach((vpack: any) => {
      const owned = this.ownedVpackIds.has(vpack.id);
      const required = 1;
      const { completed } = this.adProgressFor('vpack', vpack.id, required);

      const card = document.createElement('div');
      card.className = 'card-surface horizontal-card';
      card.style.cssText = `
        padding: 18px; border-radius: var(--radius-lg); background: var(--bg-card);
        border: 1px solid var(--border-subtle);
        display: flex; flex-direction: column; justify-content: space-between; gap: 14px;
      `;

      card.innerHTML = `
        <div style="display: flex; gap: 14px; align-items: center;">
          <div style="width:56px;height:56px;border-radius:var(--radius-md);background:#090a0f;
            border:2px solid rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <span style="font-size: 1.8rem;">${vpack.icon || '📦'}</span>
          </div>
          <div style="flex:1;min-width:0;">
            <h4 style="font-size:1rem;font-weight:800;color:var(--text-primary);margin:0;">${vpack.name}</h4>
            <p style="font-size:0.78rem;color:var(--text-secondary);margin:4px 0 0;line-height:1.35;">${vpack.description || ''}</p>
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--border-subtle);padding-top:10px;">
          <div style="font-size:0.75rem;color:var(--text-muted);">
            ${owned ? '<span style="color:#10b981;font-weight:700;">✓ Owned</span>'
              : this.adsAvailable ? `📺 ${completed} / ${required} ad completed`
              : '🔒 Rewarded ads unavailable'}
          </div>
          <div>
            ${owned ? `<button class="btn btn-primary btn-install" style="padding:6px 14px;font-size:0.8rem;font-weight:700;">Install</button>`
              : this.adsAvailable ? `<button class="btn btn-secondary btn-vpack-ad" style="padding:6px 14px;font-size:0.8rem;font-weight:700;background:rgba(168,85,247,0.15);border:1px solid rgba(168,85,247,0.4);color:#c084fc;">📺 Watch Ad</button>`
              : `<span style="font-size:0.78rem;color:var(--text-muted);">Unavailable</span>`}
          </div>
        </div>
      `;

      const adBtn = card.querySelector('.btn-vpack-ad') as HTMLElement;
      if (adBtn) {
        adBtn.onclick = async () => {
          try {
            const proof = (window as any).voxelAds?.requestRewardedAd
              ? await (window as any).voxelAds.requestRewardedAd(vpack.id)
              : null;
            if (!proof) {
              NotificationToast.show('No rewarded ad is available right now.', 'error');
              return;
            }
            const res = await api.completeAd('vpack', vpack.id, proof.completionId, proof.token);
            if (res?.granted) {
              this.ownedVpackIds.add(vpack.id);
              NotificationToast.show(`VPack acquired: ${vpack.name}!`, 'success');
            } else {
              NotificationToast.show(`Progress: ${res?.completed ?? '?'} / ${res?.required ?? required} ads`, 'success');
            }
            this.renderCurrentView();
          } catch (err: any) {
            NotificationToast.show(err.message || 'Ad could not be completed.', 'error');
          }
        };
      }

      const installBtn = card.querySelector('.btn-install') as HTMLElement;
      if (installBtn) {
        installBtn.onclick = async () => {
          try {
            await api.installVpack(vpack.id);
            NotificationToast.show('VPack installed.', 'success');
          } catch (err: any) {
            NotificationToast.show(err.message || 'Install failed.', 'error');
          }
        };
      }

      grid.appendChild(card);
    });

    wrap.appendChild(grid);
    this.container.appendChild(wrap);
  }
}
