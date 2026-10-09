import { VoxelUserProfile } from '../../../electron/types';
import { api } from '../services/api';
import { NotificationToast } from '../components/NotificationToast';
import { getAvatarDataUrl } from '../assets/minecraftAvatars';
import { getCosmeticDef, getCosmeticEffectClass } from '../assets/cosmeticAssets';

export interface ProfilePageEvents {
  onLogout?: () => void;
  onNavigateToDirectory?: () => void;
}

export class ProfilePage {
  private activeTab: 'overview' | 'cosmetics' | 'achievements' | 'packs' | 'skins' | 'public_preview' | 'settings' = 'overview';
  private user: VoxelUserProfile | null = null;
  private events: ProfilePageEvents;
  private container: HTMLElement;

  private userPacks: any[] = [];
  private userSkins: any[] = [];
  private userLibrary: any[] = [];
  private cosmeticsCatalog: any[] = [];
  private userCosmetics: any[] = [];
  private achievementsCatalog: any[] = [];
  private userAchievements: any[] = [];

  constructor(events: ProfilePageEvents = {}) {
    this.events = events;
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
    try {
      this.user = await api.getCurrentUser();
      if (this.user) {
        try {
          const [lib, syncData, cosCatalog, uCosmetics, achCatalog, uAchievements] = await Promise.all([
            api.getLibrary().catch(() => []),
            api.syncCloudData().catch(() => ({}) as any),
            api.listCosmeticsCatalog().catch(() => []),
            api.getUserCosmetics().catch(() => []),
            api.listAchievementsCatalog().catch(() => []),
            api.getUserAchievements().catch(() => [])
          ]);
          this.userLibrary = lib || [];
          this.userPacks = syncData?.packs || [];
          this.userSkins = syncData?.skins || [];
          this.cosmeticsCatalog = cosCatalog || [];
          this.userCosmetics = uCosmetics || [];
          this.achievementsCatalog = achCatalog || [];
          this.userAchievements = uAchievements || [];
        } catch {
          // Fallback gracefully
        }
      }
    } catch (e) {
      console.warn('Failed to load user profile:', e);
    }

    this.renderContent();
    return this.container;
  }

  private renderContent(): void {
    this.container.innerHTML = '';

    if (!this.user) {
      this.container.innerHTML = `
        <div style="text-align: center; padding: 60px 20px; background: var(--bg-card); border-radius: var(--radius-xl); border: 1px solid var(--border-subtle);">
          <div style="font-size: 3rem; margin-bottom: 12px;">👤</div>
          <h2 style="font-size: 1.5rem; font-weight: 800; color: var(--text-primary); margin-bottom: 8px;">No Voxel⁺ Account Found</h2>
          <p style="color: var(--text-secondary); max-width: 400px; margin: 0 auto 24px;">
            Sign in or create a Voxel⁺ account to access your cloud profile, synchronized library, cosmetics, and achievements.
          </p>
        </div>
      `;
      return;
    }

    const createdDate = new Date(this.user.createdAt).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Achievement percentage calculation (server-authoritative list preferred)
    const unlockedAchCount = this.userAchievements.length > 0
      ? this.userAchievements.filter(a => a.unlocked).length
      : (this.user.achievements || []).length;
    const totalAchCount = Math.max(
      this.userAchievements.length || this.achievementsCatalog.length, 1);
    const achPct = Math.round((unlockedAchCount / totalAchCount) * 100);

    // Selected cosmetic lookup
    const selectedCosmeticObj = this.cosmeticsCatalog.find(c => c.id === this.user?.selectedCosmetic);

    // Profile Banner
    const banner = document.createElement('div');
    banner.className = 'card-surface';
    banner.style.cssText = `
      background: linear-gradient(135deg, rgba(30, 41, 59, 0.85), rgba(15, 23, 42, 0.95)), var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-xl);
      padding: 24px 28px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
      flex-wrap: wrap;
    `;

    const avatarHtml = this.renderAvatarMarkup(this.user.avatar, selectedCosmeticObj);

    banner.innerHTML = `
      <div style="display: flex; align-items: center; gap: 20px; flex-wrap: wrap;">
        ${avatarHtml}
        <div>
          <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
            <h2 style="font-size: 1.6rem; font-weight: 800; color: var(--text-primary);">@${this.user.username}</h2>
            ${this.user.title ? `<span class="badge" style="background: rgba(139, 92, 246, 0.2); color: #c4b5fd; font-weight: 700; border: 1px solid rgba(139, 92, 246, 0.3);">🏷️ ${this.user.title.toUpperCase()}</span>` : ''}
            ${this.user.isCreator ? '<span class="badge" style="background: rgba(16, 185, 129, 0.2); color: #10b981; font-weight: 700;">⭐ CREATOR</span>' : ''}
            <span class="badge ${this.user.isPublic ? 'badge-recommended' : 'badge-lts'}">
              ${this.user.isPublic ? '🌐 PUBLIC' : '🔒 PRIVATE'}
            </span>
          </div>

          <p style="color: var(--text-secondary); font-size: 0.92rem; margin-top: 6px; max-width: 500px;">
            ${this.user.bio || 'No bio written yet. Customize your bio in Account Settings.'}
          </p>

          <!-- Badges & Cosmetics row -->
          <div style="display: flex; align-items: center; gap: 8px; margin-top: 10px; flex-wrap: wrap;">
            ${selectedCosmeticObj ? `
              <div style="display: flex; align-items: center; gap: 6px; background: rgba(59, 130, 246, 0.15); border: 1px solid rgba(59, 130, 246, 0.3); padding: 3px 10px; border-radius: var(--radius-full); font-size: 0.8rem; font-weight: 600; color: #93c5fd;">
                <span>${selectedCosmeticObj.icon}</span>
                <span>${selectedCosmeticObj.name}</span>
              </div>
            ` : ''}

            ${(this.user.badges || []).map(b => `
              <span class="badge" style="background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); font-size: 0.76rem;">
                🛡️ ${b.toUpperCase()}
              </span>
            `).join('')}

            <span style="font-size: 0.78rem; color: var(--text-muted);">
              Member since ${createdDate}
            </span>
          </div>

          <!-- Achievements progress bar -->
          <div style="display: flex; align-items: center; gap: 12px; margin-top: 12px; max-width: 380px;">
            <div style="font-size: 0.78rem; font-weight: 700; color: var(--text-secondary); white-space: nowrap;">
              ACHIEVEMENTS
            </div>
            <div style="flex: 1; height: 8px; background: rgba(255,255,255,0.08); border-radius: var(--radius-full); overflow: hidden;">
              <div style="height: 100%; width: ${achPct}%; background: var(--accent-gradient); border-radius: var(--radius-full); transition: width 0.3s ease;"></div>
            </div>
            <div style="font-size: 0.78rem; font-weight: 700; color: var(--accent-primary);">
              ${achPct}%
            </div>
          </div>
        </div>
      </div>

      <div style="display: flex; gap: 10px;">
        <button class="btn btn-secondary" id="btn-sync-now" style="display: flex; align-items: center; gap: 8px;">
          <span>☁ Sync Cloud</span>
        </button>
      </div>
    `;

    (banner.querySelector('#btn-sync-now') as HTMLElement).onclick = async () => {
      try {
        await api.syncCloudData();
        NotificationToast.show('Cloud profile and library synchronized successfully!', 'success');
        this.render();
      } catch (e: any) {
        NotificationToast.show(e.message || 'Sync failed.', 'error');
      }
    };

    this.container.appendChild(banner);

    // Tabs container
    const tabsContainer = document.createElement('div');
    tabsContainer.style.cssText = `
      display: flex;
      gap: 10px;
      border-bottom: 1px solid var(--border-subtle);
      padding-bottom: 8px;
      overflow-x: auto;
    `;

    const tabs: Array<{ id: typeof this.activeTab; label: string; icon: string }> = [
      { id: 'overview', label: 'Overview', icon: '📊' },
      { id: 'cosmetics', label: `Cosmetics (${this.userCosmetics.length})`, icon: '💎' },
      { id: 'achievements', label: `Achievements (${unlockedAchCount}/${totalAchCount})`, icon: '🏆' },
      { id: 'packs', label: `My Packs (${this.userPacks.length})`, icon: '📦' },
      { id: 'skins', label: `My Skins (${this.userSkins.length})`, icon: '👕' },
      { id: 'public_preview', label: 'Public Profile', icon: '🌐' },
      { id: 'settings', label: 'Account Settings', icon: '⚙' }
    ];

    tabsContainer.innerHTML = tabs.map(t => `
      <button class="btn ${this.activeTab === t.id ? 'btn-primary' : 'btn-secondary'}" data-tab="${t.id}" style="padding: 10px 18px; font-size: 0.9rem; font-weight: 600; white-space: nowrap;">
        <span>${t.icon} ${t.label}</span>
      </button>
    `).join('');

    tabsContainer.querySelectorAll('[data-tab]').forEach((btn) => {
      (btn as HTMLElement).onclick = () => {
        this.activeTab = btn.getAttribute('data-tab') as any;
        this.renderContent();
      };
    });

    this.container.appendChild(tabsContainer);

    const bodyArea = document.createElement('div');
    bodyArea.style.cssText = `flex: 1; min-height: 0;`;

    if (this.activeTab === 'overview') {
      bodyArea.appendChild(this.renderOverviewTab(achPct, unlockedAchCount, totalAchCount));
    } else if (this.activeTab === 'cosmetics') {
      bodyArea.appendChild(this.renderCosmeticsTab());
    } else if (this.activeTab === 'achievements') {
      bodyArea.appendChild(this.renderAchievementsTab(achPct, unlockedAchCount, totalAchCount));
    } else if (this.activeTab === 'packs') {
      bodyArea.appendChild(this.renderPacksTab());
    } else if (this.activeTab === 'skins') {
      bodyArea.appendChild(this.renderSkinsTab());
    } else if (this.activeTab === 'public_preview') {
      bodyArea.appendChild(this.renderPublicPreviewTab(selectedCosmeticObj));
    } else if (this.activeTab === 'settings') {
      bodyArea.appendChild(this.renderSettingsTab());
    }

    this.container.appendChild(bodyArea);
  }

  private renderAvatarMarkup(avatar: string, cosmetic?: any): string {
    const avatarUrl = getAvatarDataUrl(avatar);
    const cosmeticId = cosmetic?.id || this.user?.selectedCosmetic;
    const effectClass = getCosmeticEffectClass(cosmeticId);
    const frameBorder = cosmeticId ? '3px solid #a855f7' : '3px solid rgba(255, 255, 255, 0.2)';

    return `
      <div style="
        width: 76px;
        height: 76px;
        border-radius: 50%;
        border: ${frameBorder};
        box-shadow: 0 8px 24px var(--accent-glow);
        overflow: hidden;
        background: #090a0f;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
      " class="${effectClass}">
        <img src="${avatarUrl}" alt="Avatar" style="width: 100%; height: 100%; object-fit: cover; image-rendering: pixelated;" />
      </div>
    `;
  }

  private renderOverviewTab(achPct: number, unlockedAchCount: number, totalAchCount: number): HTMLElement {
    const div = document.createElement('div');
    div.style.cssText = `display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px;`;

    div.innerHTML = `
      <div class="card-surface" style="padding: 20px; border-radius: var(--radius-lg); background: var(--bg-card); border: 1px solid var(--border-subtle);">
        <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--text-primary); margin-bottom: 14px;">Identity & Achievements</h3>
        <div style="display: flex; flex-direction: column; gap: 12px; font-size: 0.9rem;">
          <div style="display: flex; justify-content: space-between; padding-bottom: 8px; border-bottom: 1px solid var(--border-subtle);">
            <span style="color: var(--text-secondary);">Username</span>
            <span style="font-weight: 700; color: var(--text-primary);">@${this.user!.username}</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding-bottom: 8px; border-bottom: 1px solid var(--border-subtle);">
            <span style="color: var(--text-secondary);">Account Type</span>
            <span style="color: #10b981; font-weight: 700;">Voxel⁺ Cloud Identity</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding-bottom: 8px; border-bottom: 1px solid var(--border-subtle);">
            <span style="color: var(--text-secondary);">Achievements Progress</span>
            <span style="color: var(--accent-primary); font-weight: 700;">${unlockedAchCount} of ${totalAchCount} (${achPct}%)</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: var(--text-secondary);">Public Directory Status</span>
            <span style="font-weight: 700; color: var(--text-primary);">${this.user!.isPublic ? 'Listed' : 'Hidden'}</span>
          </div>
        </div>
      </div>

      <div class="card-surface" style="padding: 20px; border-radius: var(--radius-lg); background: var(--bg-card); border: 1px solid var(--border-subtle);">
        <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--text-primary); margin-bottom: 14px;">Cloud Assets & Library</h3>
        <div style="display: flex; flex-direction: column; gap: 12px; font-size: 0.9rem;">
          <div style="display: flex; justify-content: space-between; padding-bottom: 8px; border-bottom: 1px solid var(--border-subtle);">
            <span style="color: var(--text-secondary);">Unlocked Cosmetics</span>
            <span style="font-weight: 700; color: var(--text-primary);">${this.userCosmetics.length}</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding-bottom: 8px; border-bottom: 1px solid var(--border-subtle);">
            <span style="color: var(--text-secondary);">Associated VPacks</span>
            <span style="font-weight: 700; color: var(--text-primary);">${this.userPacks.length}</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding-bottom: 8px; border-bottom: 1px solid var(--border-subtle);">
            <span style="color: var(--text-secondary);">Saved Skins</span>
            <span style="font-weight: 700; color: var(--text-primary);">${this.userSkins.length}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: var(--text-secondary);">Library Items</span>
            <span style="font-weight: 700; color: var(--text-primary);">${this.userLibrary.length}</span>
          </div>
        </div>
      </div>
    `;

    return div;
  }

  private renderCosmeticsTab(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.style.cssText = `display: flex; flex-direction: column; gap: 16px;`;

    wrap.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <div>
          <h3 style="font-size: 1.2rem; font-weight: 800; color: var(--text-primary);">Minecraft Cosmetics</h3>
          <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 2px;">
            Select from Minecraft-themed items you have unlocked to decorate your profile frame and badge.
          </p>
        </div>
        ${this.user?.selectedCosmetic ? `
          <button class="btn btn-secondary" id="btn-clear-cosmetic" style="padding: 6px 14px; font-size: 0.82rem;">
            Clear Active Cosmetic
          </button>
        ` : ''}
      </div>
    `;

    const clearBtn = wrap.querySelector('#btn-clear-cosmetic') as HTMLButtonElement;
    if (clearBtn) {
      clearBtn.onclick = async () => {
        try {
          await api.selectCosmetic(null);
          NotificationToast.show('Cosmetic removed.', 'info');
          await this.render();
        } catch (e: any) {
          NotificationToast.show(e.message || 'Failed to update cosmetic.', 'error');
        }
      };
    }

    const grid = document.createElement('div');
    grid.style.cssText = `
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 14px;
    `;

    // Ownership is cloud-authoritative only (voxel_user_cosmetics via API).
    const ownedIds = new Set(this.userCosmetics.map(uc => uc.id));
    const catalog = this.cosmeticsCatalog;

    catalog.forEach(c => {
      const def = getCosmeticDef(c.id);
      const isOwned = ownedIds.has(c.id);
      const isSelected = this.user?.selectedCosmetic === c.id;
      const texture = def?.textureUrl || c.icon;
      const effectClass = def?.effectClass || '';

      const card = document.createElement('div');
      card.className = 'horizontal-card';
      card.style.cssText = `
        padding: 16px;
        background: var(--bg-card);
        border: 1px solid ${isSelected ? 'var(--accent-primary)' : isOwned ? 'var(--border-subtle)' : 'rgba(255, 255, 255, 0.05)'};
        border-radius: var(--radius-lg);
        display: flex;
        flex-direction: column;
        gap: 10px;
        opacity: ${isOwned ? '1' : '0.8'};
        position: relative;
      `;

      card.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="
            width: 48px;
            height: 48px;
            border-radius: var(--radius-md);
            background: #090a0f;
            border: 1px solid rgba(255, 255, 255, 0.1);
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
          " class="${effectClass}">
            <img src="${texture}" alt="${c.name}" style="width: 32px; height: 32px; object-fit: contain; image-rendering: pixelated;" />
          </div>
          <div style="flex: 1; min-width: 0;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="font-weight: 700; font-size: 0.95rem; color: var(--text-primary);">${c.name}</span>
              <span class="badge" style="font-size: 0.68rem; text-transform: uppercase;">${c.rarity}</span>
            </div>
            <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 2px;">
              ${c.description}
            </div>
          </div>
        </div>

        <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 4px; padding-top: 8px; border-top: 1px solid var(--border-subtle);">
          <span style="font-size: 0.75rem; color: var(--text-muted);">
            ${isOwned ? '✓ OWNED' : (c.unlock_condition || '').toLowerCase().includes('achievement') ? '🏆 Achievement reward' : '🔒 Not owned'}
          </span>
          <div>
            ${isOwned ? `
              <button class="btn ${isSelected ? 'btn-secondary' : 'btn-primary'}" data-cosmetic-id="${c.id}" style="padding: 4px 12px; font-size: 0.8rem;">
                ${isSelected ? '✓ Equipped' : 'Equip'}
              </button>
            ` : `
              <span style="font-size: 0.78rem; color: var(--text-muted);">Unlock in Shop</span>
            `}
          </div>
        </div>
      `;

      const btn = card.querySelector('[data-cosmetic-id]') as HTMLButtonElement;
      if (btn && !isSelected) {
        btn.onclick = async () => {
          try {
            await api.selectCosmetic(c.id);
            NotificationToast.show(`Equipped "${c.name}"!`, 'success');
            await this.render();
          } catch (e: any) {
            NotificationToast.show(e.message || 'Failed to select cosmetic.', 'error');
          }
        };
      }

      grid.appendChild(card);
    });

    wrap.appendChild(grid);
    return wrap;
  }

  private renderAchievementsTab(achPct: number, unlockedAchCount: number, totalAchCount: number): HTMLElement {
    const wrap = document.createElement('div');
    wrap.style.cssText = `display: flex; flex-direction: column; gap: 16px;`;

    wrap.innerHTML = `
      <div class="card-surface" style="
        padding: 20px 24px;
        background: linear-gradient(135deg, rgba(30, 41, 59, 0.7), rgba(15, 23, 42, 0.8)), var(--bg-card);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-lg);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
        flex-wrap: wrap;
      ">
        <div>
          <h3 style="font-size: 1.2rem; font-weight: 800; color: var(--text-primary);">Voxel⁺ Achievements</h3>
          <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 2px;">
            Achievements unlock automatically from real in-launcher actions and reward exclusive Minecraft cosmetics.
          </p>
        </div>
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="text-align: right;">
            <div style="font-size: 1.3rem; font-weight: 800; color: var(--accent-primary);">${achPct}% Complete</div>
            <div style="font-size: 0.78rem; color: var(--text-muted);">${unlockedAchCount} of ${totalAchCount} unlocked</div>
          </div>
        </div>
      </div>
    `;

    // Server-returned achievements include unlock state; use the merged
    // authenticated list, falling back to the public catalog + profile ids.
    const achList = this.userAchievements.length > 0
      ? this.userAchievements
      : this.achievementsCatalog.map(ach => ({
          ...ach,
          unlocked: (this.user?.achievements || []).includes(ach.id),
          unlockedAt: null
        }));

    // Group by category for a polished, browsable list.
    const categories = new Map<string, any[]>();
    achList.forEach(ach => {
      const cat = ach.category || 'general';
      if (!categories.has(cat)) categories.set(cat, []);
      categories.get(cat)!.push(ach);
    });

    categories.forEach((achs, category) => {
      const header = document.createElement('div');
      header.style.cssText = `font-size: 0.85rem; font-weight: 800; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.08em; margin-top: 8px;`;
      header.textContent = category;
      wrap.appendChild(header);

      const catGrid = document.createElement('div');
      catGrid.style.cssText = `display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px;`;

      achs.forEach(ach => {
      const isUnlocked = ach.unlocked === true;

      const card = document.createElement('div');
      card.className = 'horizontal-card';
      card.style.cssText = `
        padding: 16px 20px;
        background: var(--bg-card);
        border: 1px solid ${isUnlocked ? 'rgba(16, 185, 129, 0.4)' : 'var(--border-subtle)'};
        border-radius: var(--radius-lg);
        display: flex;
        gap: 14px;
        opacity: ${isUnlocked ? '1' : '0.65'};
      `;

      card.innerHTML = `
        <div style="
          width: 52px;
          height: 52px;
          border-radius: var(--radius-md);
          background: ${isUnlocked ? 'rgba(16, 185, 129, 0.15)' : 'var(--bg-surface)'};
          border: 1px solid ${isUnlocked ? 'rgba(16, 185, 129, 0.3)' : 'var(--border-subtle)'};
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.8rem;
          flex-shrink: 0;
        ">
          ${ach.icon}
        </div>
        <div style="flex: 1; min-width: 0;">
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <span style="font-weight: 700; font-size: 1rem; color: var(--text-primary);">${ach.title}</span>
            <span class="badge" style="font-size: 0.68rem; text-transform: uppercase;">${ach.rarity}</span>
          </div>
          <p style="font-size: 0.82rem; color: var(--text-secondary); margin: 4px 0 6px;">
            ${ach.description}
          </p>
          <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.75rem;">
            <span style="color: var(--text-muted);">${ach.requirement ? `Goal: ${ach.requirement}` : ''}</span>
            <span style="font-weight: 700; color: ${isUnlocked ? '#10b981' : 'var(--text-muted)'};">
              ${isUnlocked ? '✓ UNLOCKED' : ach.hidden ? '❓ HIDDEN' : 'LOCKED'}
            </span>
          </div>
        </div>
      `;

      catGrid.appendChild(card);
      });
      wrap.appendChild(catGrid);
    });

    return wrap;
  }

  private renderPacksTab(): HTMLElement {
    const div = document.createElement('div');
    if (this.userPacks.length === 0) {
      div.innerHTML = `
        <div style="text-align: center; padding: 40px; background: var(--bg-card); border-radius: var(--radius-lg); border: 1px solid var(--border-subtle);">
          <div style="font-size: 2.5rem; margin-bottom: 10px;">📦</div>
          <h4 style="font-size: 1.1rem; font-weight: 700; color: var(--text-primary); margin-bottom: 6px;">No Published Packs</h4>
          <p style="color: var(--text-secondary); font-size: 0.88rem; max-width: 400px; margin: 0 auto 16px;">
            You haven't published or saved any VPacks to your account yet. Reusable packs can be exported from any Minecraft instance.
          </p>
        </div>
      `;
      return div;
    }

    div.style.cssText = `display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px;`;
    this.userPacks.forEach((p) => {
      const card = document.createElement('div');
      card.className = 'card-surface';
      card.style.cssText = `padding: 16px; border-radius: var(--radius-md); background: var(--bg-card); border: 1px solid var(--border-subtle);`;
      card.innerHTML = `
        <h4 style="font-size: 1rem; font-weight: 700; color: var(--text-primary);">${p.name}</h4>
        <p style="font-size: 0.82rem; color: var(--text-secondary); margin: 6px 0;">${p.description || 'No description'}</p>
        <div style="font-size: 0.75rem; color: var(--text-muted);">Version ${p.version}</div>
      `;
      div.appendChild(card);
    });
    return div;
  }

  private renderSkinsTab(): HTMLElement {
    const div = document.createElement('div');
    if (this.userSkins.length === 0) {
      div.innerHTML = `
        <div style="text-align: center; padding: 40px; background: var(--bg-card); border-radius: var(--radius-lg); border: 1px solid var(--border-subtle);">
          <div style="font-size: 2.5rem; margin-bottom: 10px;">👕</div>
          <h4 style="font-size: 1.1rem; font-weight: 700; color: var(--text-primary); margin-bottom: 6px;">No Saved Skins</h4>
          <p style="color: var(--text-secondary); font-size: 0.88rem; max-width: 400px; margin: 0 auto 16px;">
            You haven't saved any skins to your cloud account. Use the Skin Manager to upload and save skins.
          </p>
        </div>
      `;
      return div;
    }

    div.style.cssText = `display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px;`;
    this.userSkins.forEach((s) => {
      const card = document.createElement('div');
      card.className = 'card-surface';
      card.style.cssText = `padding: 16px; border-radius: var(--radius-md); background: var(--bg-card); border: 1px solid var(--border-subtle); text-align: center;`;
      card.innerHTML = `
        <div style="font-size: 2rem; margin-bottom: 8px;">👕</div>
        <h4 style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary);">${s.name}</h4>
        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">Model: ${s.model}</div>
      `;
      div.appendChild(card);
    });
    return div;
  }

  private renderPublicPreviewTab(selectedCosmeticObj?: any): HTMLElement {
    const div = document.createElement('div');
    div.style.cssText = `
      background: var(--bg-card);
      border: 1px dashed var(--accent-primary);
      border-radius: var(--radius-xl);
      padding: 28px;
      max-width: 580px;
      margin: 0 auto;
    `;

    const avatarHtml = this.renderAvatarMarkup(this.user!.avatar, selectedCosmeticObj);

    div.innerHTML = `
      <div style="font-size: 0.78rem; font-weight: 700; color: var(--accent-primary); letter-spacing: 1px; margin-bottom: 16px; text-transform: uppercase;">
        🔍 COMMUNITY DIRECTORY PREVIEW
      </div>
      <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 16px;">
        ${avatarHtml}
        <div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <h3 style="font-size: 1.3rem; font-weight: 800; color: var(--text-primary);">@${this.user!.username}</h3>
            ${this.user!.title ? `<span class="badge" style="font-size: 0.75rem;">🏷️ ${this.user!.title}</span>` : ''}
          </div>
          <p style="font-size: 0.88rem; color: var(--text-secondary); margin-top: 4px;">${this.user!.bio || 'No public bio set.'}</p>
        </div>
      </div>
      <div style="font-size: 0.8rem; color: var(--text-muted); padding-top: 12px; border-top: 1px solid var(--border-subtle);">
        Public VPacks: ${this.userPacks.length} · Public Skins: ${this.userSkins.length} · Library Items: ${this.userLibrary.length}
      </div>
    `;

    return div;
  }

  private renderSettingsTab(): HTMLElement {
    const div = document.createElement('div');
    div.style.cssText = `display: flex; flex-direction: column; gap: 24px; max-width: 640px;`;

    div.innerHTML = `
      <!-- Avatar Upload Section -->
      <div class="card-surface" style="padding: 20px; border-radius: var(--radius-lg); background: var(--bg-card); border: 1px solid var(--border-subtle);">
        <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;">Profile Picture</h3>
        <p style="font-size: 0.82rem; color: var(--text-secondary); margin-bottom: 16px;">
          Upload a custom PNG, JPEG, or WebP image (< 2 MB) or choose a default Minecraft avatar.
        </p>

        <div style="display: flex; align-items: center; gap: 20px;">
          <div id="avatar-preview-box" style="
            width: 68px;
            height: 68px;
            border-radius: 50%;
            background: var(--bg-surface);
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            border: 2px solid var(--border-subtle);
          ">
            <img src="${getAvatarDataUrl(this.user!.avatar)}" alt="Avatar" style="width: 100%; height: 100%; object-fit: cover; image-rendering: pixelated;" />
          </div>

          <div style="display: flex; flex-direction: column; gap: 8px;">
            <input type="file" id="file-avatar-upload" accept="image/png,image/jpeg,image/webp,image/gif" style="display: none;" />
            <div style="display: flex; gap: 10px;">
              <button class="btn btn-secondary" id="btn-pick-avatar" style="padding: 8px 16px; font-size: 0.85rem;">
                📁 Upload Custom Image
              </button>
              <button class="btn btn-secondary" id="btn-reset-avatar" style="padding: 8px 16px; font-size: 0.85rem;">
                Reset to Steve
              </button>
            </div>
            <span id="upload-status-text" style="font-size: 0.78rem; color: var(--text-muted);">Max 2MB. Validated server-side before storage.</span>
          </div>
        </div>
      </div>

      <!-- Bio & Visibility -->
      <div class="card-surface" style="padding: 20px; border-radius: var(--radius-lg); background: var(--bg-card); border: 1px solid var(--border-subtle);">
        <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--text-primary); margin-bottom: 12px;">Bio & Community Visibility</h3>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <div>
            <label style="font-size: 0.8rem; font-weight: 700; color: var(--text-secondary); display: block; margin-bottom: 4px;">BIO</label>
            <textarea id="input-edit-bio" class="input" rows="2" style="width: 100%; padding: 10px; font-size: 0.9rem;">${this.user!.bio}</textarea>
          </div>
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <span style="font-size: 0.88rem; color: var(--text-primary);">Show in Public Directory</span>
            <input type="checkbox" id="check-edit-public" ${this.user!.isPublic ? 'checked' : ''} style="width: 18px; height: 18px;" />
          </div>
          <button class="btn btn-primary" id="btn-save-bio" style="align-self: flex-start; padding: 10px 20px;">Save Profile Changes</button>
        </div>
      </div>

      <!-- Session & Deletion -->
      <div class="card-surface" style="padding: 20px; border-radius: var(--radius-lg); background: var(--bg-card); border: 1px solid #ef4444;">
        <h3 style="font-size: 1.1rem; font-weight: 700; color: #f87171; margin-bottom: 12px;">Session & Account Deletion</h3>
        <div style="display: flex; gap: 14px; flex-wrap: wrap;">
          <button class="btn btn-secondary" id="btn-logout" style="padding: 10px 20px;">Logout</button>
          <button class="btn btn-danger" id="btn-delete-account" style="padding: 10px 20px; background: #ef4444; color: white;">Delete Account Permanently</button>
        </div>
      </div>
    `;

    // Avatar upload handlers
    const fileInput = div.querySelector('#file-avatar-upload') as HTMLInputElement;
    const pickBtn = div.querySelector('#btn-pick-avatar') as HTMLButtonElement;
    const resetBtn = div.querySelector('#btn-reset-avatar') as HTMLButtonElement;
    const statusText = div.querySelector('#upload-status-text') as HTMLElement;

    pickBtn.onclick = () => fileInput.click();

    fileInput.onchange = async () => {
      const file = fileInput.files?.[0];
      if (!file) return;

      if (file.size > 2 * 1024 * 1024) {
        NotificationToast.show('File exceeds maximum size of 2 MB.', 'error');
        return;
      }

      statusText.textContent = 'Uploading avatar to cloud storage...';
      try {
        const buffer = await file.arrayBuffer();
        const res = await api.uploadAvatar(buffer, file.name, file.type);
        NotificationToast.show('Avatar updated successfully!', 'success');
        await this.render();
      } catch (e: any) {
        statusText.textContent = 'Upload failed.';
        NotificationToast.show(e.message || 'Avatar upload failed.', 'error');
      }
    };

    resetBtn.onclick = async () => {
      try {
        await api.deleteAvatar();
        await api.updateProfile({ avatar: 'avatar_steve' });
        NotificationToast.show('Avatar reset to Steve preset.', 'info');
        await this.render();
      } catch (e: any) {
        NotificationToast.show(e.message || 'Reset failed.', 'error');
      }
    };

    // Save bio handler
    (div.querySelector('#btn-save-bio') as HTMLElement).onclick = async () => {
      const bioVal = (div.querySelector('#input-edit-bio') as HTMLTextAreaElement).value;
      const isPub = (div.querySelector('#check-edit-public') as HTMLInputElement).checked;
      try {
        await api.updateProfile({ bio: bioVal, isPublic: isPub });
        NotificationToast.show('Profile updated!', 'success');
        this.render();
      } catch (e: any) {
        NotificationToast.show(e.message || 'Update failed.', 'error');
      }
    };

    // Logout handler
    (div.querySelector('#btn-logout') as HTMLElement).onclick = async () => {
      await api.logoutAccount();
      NotificationToast.show('Logged out of Voxel⁺ account.', 'info');
      if (this.events.onLogout) this.events.onLogout();
      this.render();
    };

    // Delete account modal handler
    (div.querySelector('#btn-delete-account') as HTMLElement).onclick = () => {
      this.showDeleteModal();
    };

    return div;
  }

  private showDeleteModal(): void {
    const backdrop = document.createElement('div');
    backdrop.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.8);
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    `;

    backdrop.innerHTML = `
      <div class="modal-content animate-scale-in" style="max-width: 460px; width: 100%; background: var(--bg-card); border: 2px solid #ef4444; border-radius: var(--radius-xl); padding: 24px;">
        <h3 style="font-size: 1.3rem; font-weight: 800; color: #ef4444; margin-bottom: 10px;">
          Delete Voxel⁺ Account?
        </h3>
        <p style="font-size: 0.88rem; color: var(--text-secondary); line-height: 1.5; margin-bottom: 16px;">
          This action will <strong>permanently delete</strong> your Voxel⁺ identity (@${this.user!.username}), cloud-synced assets, and achievements. Local Minecraft instance files will remain intact.
        </p>
        <p style="font-size: 0.82rem; color: #f87171; margin-bottom: 16px;">
          Type your username <strong>${this.user!.username}</strong> to confirm:
        </p>
        <input type="text" id="confirm-delete-user" class="input" style="width: 100%; padding: 10px; margin-bottom: 20px;" placeholder="${this.user!.username}" />
        <div style="display: flex; justify-content: flex-end; gap: 12px;">
          <button class="btn btn-secondary" id="btn-cancel-delete">Cancel</button>
          <button class="btn btn-danger" id="btn-confirm-delete" style="background: #ef4444; color: white;">Permanently Delete</button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    (backdrop.querySelector('#btn-cancel-delete') as HTMLElement).onclick = () => {
      backdrop.remove();
    };

    (backdrop.querySelector('#btn-confirm-delete') as HTMLElement).onclick = async () => {
      const typed = (backdrop.querySelector('#confirm-delete-user') as HTMLInputElement).value.trim();
      if (typed !== this.user!.username) {
        NotificationToast.show('Username mismatch. Account was not deleted.', 'error');
        return;
      }
      try {
        await api.deleteAccount();
        backdrop.remove();
        NotificationToast.show('Your account was permanently deleted.', 'info');
        if (this.events.onLogout) this.events.onLogout();
        this.render();
      } catch (e: any) {
        NotificationToast.show(e.message || 'Deletion failed.', 'error');
      }
    };
  }
}
