import { api } from '../services/api';
import { PlayerProfile, WalletState, AchievementDefinition, AchievementProgress, CosmeticDefinition, CosmeticEffect } from '../../../electron/types';
import { NotificationToast } from '../components/NotificationToast';
import { getItemDataUrl } from '../assets/items';

export class PlayerPage {
  private container: HTMLElement;
  private activeTab: 'profile' | 'achievements' | 'transactions' = 'profile';
  private achievementCategoryFilter: string = 'all';

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'page-content animate-fade-in';
    this.container.style.cssText = 'padding: 24px; overflow-y: auto; height: 100%;';
  }

  public async render(): Promise<HTMLElement> {
    const profile = await api.getPlayerProfile();
    const wallet = await api.getWallet();
    const transactions = await api.getWalletTransactions();
    const achievementsData = await api.getAchievements();
    const cosmeticsData = await api.getCosmetics();

    const equippedCosmetic = cosmeticsData.catalogue.find(c => c.id === profile.equippedCosmeticId);
    const equippedEffect = cosmeticsData.effects.find(e => e.id === profile.equippedEffectId);

    const totalAchievements = achievementsData.definitions.length;
    const unlockedCount = achievementsData.progress.filter(p => p.unlocked).length;

    this.container.innerHTML = `
      <!-- Profile Header Card -->
      <div style="
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 24px;
        background: linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(6, 182, 212, 0.08) 100%);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-lg);
        margin-bottom: 24px;
      ">
        <div style="display: flex; align-items: center; gap: 20px;">
          <!-- Avatar Icon with Equipped Effect Badge -->
          <div class="${equippedEffect ? equippedEffect.cssClass : ''}" style="
            position: relative;
            width: 76px;
            height: 76px;
            border-radius: var(--radius-md);
            background: var(--bg-elevated);
            border: 2px solid ${equippedEffect ? 'var(--accent-secondary)' : 'var(--border-subtle)'};
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: ${equippedEffect ? '0 0 20px var(--accent-glow)' : 'none'};
          ">
            ${equippedCosmetic ? `
              <img src="${getItemDataUrl(equippedCosmetic.artworkPath)}" style="width: 52px; height: 52px; image-rendering: pixelated; object-fit: contain;" />
            ` : `
              <img src="${getItemDataUrl('minecraft:grass_block')}" style="width: 52px; height: 52px; image-rendering: pixelated; object-fit: contain;" />
            `}
          </div>

          <div>
            <div style="display: flex; align-items: center; gap: 10px;">
              <h1 style="font-size: 1.5rem; font-weight: 800; color: var(--text-primary); margin: 0;">
                ${profile.displayName}
              </h1>
              ${equippedCosmetic ? `
                <span style="font-size: 0.75rem; font-weight: 700; padding: 2px 8px; border-radius: 999px; background: rgba(16,185,129,0.2); color: var(--success);">
                  ${equippedCosmetic.name}
                </span>
              ` : ''}
              ${equippedEffect ? `
                <span style="font-size: 0.75rem; font-weight: 700; padding: 2px 8px; border-radius: 999px; background: rgba(6,182,212,0.2); color: var(--status-running);">
                  ${equippedEffect.name}
                </span>
              ` : ''}
            </div>
            <div style="font-size: 0.82rem; color: var(--text-secondary); margin-top: 4px;">
              Minecraft Modder • Joined ${new Date(profile.createdAt).toLocaleDateString()}
            </div>
          </div>
        </div>

        <!-- Wallet and Stats Counter -->
        <div style="display: flex; gap: 14px;">
          <div style="
            padding: 12px 18px;
            background: var(--bg-card);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-md);
            text-align: right;
          ">
            <div style="font-size: 0.72rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">Points (VP)</div>
            <div style="font-size: 1.3rem; font-weight: 900; color: var(--warning); font-family: var(--font-mono);">${wallet.balance.toLocaleString()}</div>
          </div>

          <div style="
            padding: 12px 18px;
            background: var(--bg-card);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-md);
            text-align: right;
          ">
            <div style="font-size: 0.72rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">Achievements</div>
            <div style="font-size: 1.3rem; font-weight: 900; color: var(--success); font-family: var(--font-mono);">${unlockedCount} / ${totalAchievements}</div>
          </div>
        </div>
      </div>

      <!-- Navigation Tabs -->
      <div style="display: flex; gap: 8px; margin-bottom: 20px;">
        <button class="btn ${this.activeTab === 'profile' ? 'btn-primary' : 'btn-secondary'}" id="tab-player-profile">
          Minecraft Collection
        </button>
        <button class="btn ${this.activeTab === 'achievements' ? 'btn-primary' : 'btn-secondary'}" id="tab-player-achievements">
          🏆 Achievements (${unlockedCount}/${totalAchievements})
        </button>
        <button class="btn ${this.activeTab === 'transactions' ? 'btn-primary' : 'btn-secondary'}" id="tab-player-tx">
          VP Ledger History
        </button>
      </div>

      <!-- Tab Content Area -->
      <div id="player-tab-stage">
        ${this.renderTabContent(profile, cosmeticsData, achievementsData, transactions)}
      </div>

      <!-- Unrolling Achievement Banner Modal Placeholder -->
      <div id="ach-banner-modal" style="display: none;" class="modal-overlay"></div>
    `;

    // Hook tab switches
    const tabOverview = this.container.querySelector('#tab-player-profile') as HTMLElement;
    const tabAch = this.container.querySelector('#tab-player-achievements') as HTMLElement;
    const tabTx = this.container.querySelector('#tab-player-tx') as HTMLElement;

    tabOverview.onclick = () => { this.activeTab = 'profile'; this.render(); };
    tabAch.onclick = () => { this.activeTab = 'achievements'; this.render(); };
    tabTx.onclick = () => { this.activeTab = 'transactions'; this.render(); };

    // Hook achievement category filters
    this.container.querySelectorAll('[data-ach-filter]').forEach(b => {
      (b as HTMLElement).onclick = () => {
        this.achievementCategoryFilter = b.getAttribute('data-ach-filter') || 'all';
        this.render();
      };
    });

    // Hook achievement inspection modal trigger
    this.container.querySelectorAll('[data-inspect-ach]').forEach(card => {
      (card as HTMLElement).onclick = () => {
        const id = card.getAttribute('data-inspect-ach')!;
        const def = achievementsData.definitions.find(d => d.id === id);
        const prog = achievementsData.progress.find(p => p.achievementId === id);
        if (def && prog) {
          this.showUnrollingBannerModal(def, prog);
        }
      };
    });

    // Hook cosmetic toggle
    this.container.querySelectorAll('[data-cosmetic-toggle]').forEach(btn => {
      (btn as HTMLElement).onclick = async () => {
        const id = btn.getAttribute('data-cosmetic-toggle')!;
        const newId = profile.equippedCosmeticId === id ? null : id;
        await api.equipCosmetic(newId, profile.equippedEffectId);
        NotificationToast.show(newId ? 'Cosmetic equipped!' : 'Cosmetic unequipped.', 'success');
        this.render();
      };
    });

    return this.container;
  }

  private showUnrollingBannerModal(def: AchievementDefinition, prog: AchievementProgress): void {
    const modal = this.container.querySelector('#ach-banner-modal') as HTMLElement;
    if (!modal) return;

    const color = def.color || '#6366f1';
    const shape = def.shape || 'hexagon';

    let shapeClip = 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)';
    if (shape === 'diamond') shapeClip = 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)';
    if (shape === 'shield') shapeClip = 'polygon(0% 0%, 100% 0%, 100% 70%, 50% 100%, 0% 70%)';
    if (shape === 'octagon') shapeClip = 'polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)';
    if (shape === 'badge') shapeClip = 'polygon(50% 0%, 80% 10%, 100% 35%, 85% 70%, 50% 100%, 15% 70%, 0% 35%, 20% 10%)';

    modal.style.display = 'flex';
    modal.innerHTML = `
      <div class="achievement-banner-unroll" style="
        position: relative;
        width: 100%;
        max-width: 580px;
        background: radial-gradient(circle at 50% 20%, ${color}33 0%, var(--bg-elevated) 85%);
        border: 2px solid ${color};
        border-radius: var(--radius-xl);
        padding: 36px 28px;
        text-align: center;
        box-shadow: 0 20px 60px rgba(0,0,0,0.8), 0 0 30px ${color}55;
        overflow: hidden;
      ">
        <!-- Rotating Ambient Rays -->
        <div class="banner-ray-glow" style="
          position: absolute;
          inset: -100px;
          background: conic-gradient(from 0deg at 50% 50%, transparent 0deg, ${color}22 30deg, transparent 60deg, ${color}22 90deg, transparent 120deg, ${color}22 150deg, transparent 180deg, ${color}22 210deg, transparent 240deg, ${color}22 270deg, transparent 300deg, ${color}22 330deg, transparent 360deg);
          pointer-events: none;
          z-index: 1;
        "></div>

        <div style="position: relative; z-index: 2;">
          <!-- Unrolling Banner Title Header -->
          <div style="
            display: inline-block;
            padding: 6px 24px;
            background: linear-gradient(90deg, transparent 0%, ${color}aa 30%, ${color}aa 70%, transparent 100%);
            color: var(--text-primary);
            font-size: 0.85rem;
            font-weight: 900;
            letter-spacing: 0.15em;
            text-transform: uppercase;
            margin-bottom: 20px;
            text-shadow: 0 2px 6px rgba(0,0,0,0.8);
          ">
            ${prog.unlocked ? '✨ ACHIEVEMENT UNLOCKED ✨' : '🔒 TROPHY IN PROGRESS'}
          </div>

          <!-- Crest Badge Container -->
          <div style="
            width: 84px;
            height: 84px;
            margin: 0 auto 20px auto;
            display: flex;
            align-items: center;
            justify-content: center;
            background: ${prog.unlocked ? `radial-gradient(circle, ${color} 0%, var(--bg-elevated-soft) 100%)` : 'var(--bg-elevated-soft)'};
            clip-path: ${shapeClip};
            filter: drop-shadow(0 6px 18px ${color}aa);
          ">
            <span style="font-size: 42px; filter: drop-shadow(0 2px 8px rgba(0,0,0,0.8));">
              ${def.icon || '🏆'}
            </span>
          </div>

          <h2 style="font-size: 1.6rem; font-weight: 900; color: var(--text-primary); margin-bottom: 6px;">
            ${def.name}
          </h2>

          <p style="font-size: 0.92rem; color: var(--text-secondary); max-width: 440px; margin: 0 auto 20px auto; line-height: 1.5;">
            ${def.description}
          </p>

          <div style="
            display: inline-flex;
            align-items: center;
            gap: 12px;
            padding: 8px 18px;
            background: var(--bg-elevated-soft);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-pill);
            margin-bottom: 24px;
          ">
            <span style="color: var(--warning); font-family: var(--font-mono); font-weight: 800;">
              +${def.rewardVP} VP REWARD
            </span>
            <span style="color: var(--text-muted);">•</span>
            <span style="color: ${color}; font-weight: 800; text-transform: uppercase;">
              ${def.rarity}
            </span>
          </div>

          <div>
            <button class="btn btn-primary" id="btn-close-ach-banner" style="padding: 10px 32px; font-weight: 800;">
              CLOSE BANNER
            </button>
          </div>
        </div>
      </div>
    `;

    const closeBtn = modal.querySelector('#btn-close-ach-banner') as HTMLElement;
    closeBtn.onclick = () => {
      modal.style.display = 'none';
    };
    modal.onclick = (e) => {
      if (e.target === modal) modal.style.display = 'none';
    };
  }

  private renderTabContent(
    profile: PlayerProfile,
    cosmeticsData: { catalogue: CosmeticDefinition[]; owned: any[]; effects: CosmeticEffect[] },
    achievementsData: { definitions: AchievementDefinition[]; progress: AchievementProgress[] },
    transactions: any[]
  ): string {
    if (this.activeTab === 'profile') {
      const ownedIds = new Set(cosmeticsData.owned.map(o => o.cosmeticId));
      const ownedItems = cosmeticsData.catalogue.filter(c => ownedIds.has(c.id));

      const ownedHtml = ownedItems.map(item => {
        const isEquipped = profile.equippedCosmeticId === item.id;
        const texture = getItemDataUrl(item.artworkPath);

        return `
          <div class="card" style="
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 14px;
            background: var(--bg-surface);
            border: 1px solid ${isEquipped ? 'var(--accent-primary)' : 'var(--border-subtle)'};
            border-radius: var(--radius-md);
          ">
            <div style="display: flex; align-items: center; gap: 14px;">
              <img src="${texture}" style="width: 40px; height: 40px; image-rendering: pixelated; object-fit: contain;" />
              <div>
                <div style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary);">${item.name}</div>
                <div style="font-size: 0.75rem; color: var(--text-muted);">${item.description}</div>
              </div>
            </div>
            <button class="btn btn-sm ${isEquipped ? 'btn-secondary' : 'btn-primary'}" data-cosmetic-toggle="${item.id}">
              ${isEquipped ? 'Unequip' : 'Equip'}
            </button>
          </div>
        `;
      }).join('');

      return `
        <div style="display: flex; flex-direction: column; gap: 16px;">
          <h2 style="font-size: 1.1rem; font-weight: 800; color: var(--text-primary);">Acquired Minecraft Items</h2>
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px;">
            ${ownedHtml || '<div style="color: var(--text-muted); font-size: 0.85rem;">No items acquired yet. Check the Marketplace!</div>'}
          </div>
        </div>
      `;
    }

    if (this.activeTab === 'achievements') {
      const progressMap = new Map(achievementsData.progress.map(p => [p.achievementId, p]));
      const totalCount = achievementsData.definitions.length;
      const unlockedCount = achievementsData.progress.filter(p => p.unlocked).length;
      const percent = Math.round((unlockedCount / totalCount) * 100);

      // Filter definitions
      let filteredDefs = achievementsData.definitions;
      if (this.achievementCategoryFilter !== 'all') {
        if (this.achievementCategoryFilter === 'arcade') {
          filteredDefs = filteredDefs.filter(d => d.category === 'stocker' || d.category === 'cookie');
        } else {
          filteredDefs = filteredDefs.filter(d => d.category === this.achievementCategoryFilter);
        }
      }

      const categoryTabs = [
        { id: 'all', label: 'All' },
        { id: 'launcher', label: 'Launcher' },
        { id: 'vpack', label: 'VPack' },
        { id: 'content', label: 'Content' },
        { id: 'arcade', label: 'Arcade' },
        { id: 'player', label: 'Player & Economy' }
      ];

      const categoryFilterButtons = categoryTabs.map(cat => {
        const isActive = this.achievementCategoryFilter === cat.id;
        return `
          <button class="btn btn-sm ${isActive ? 'btn-primary' : 'btn-secondary'}" data-ach-filter="${cat.id}">
            ${cat.label}
          </button>
        `;
      }).join('');

      const itemsHtml = filteredDefs.map(def => {
        const p = progressMap.get(def.id) || { currentValue: 0, unlocked: false };
        const isComplete = p.unlocked;
        const color = def.color || '#6366f1';
        const shape = def.shape || 'hexagon';

        let shapeClip = 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)'; // hexagon
        if (shape === 'diamond') shapeClip = 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)';
        if (shape === 'shield') shapeClip = 'polygon(0% 0%, 100% 0%, 100% 70%, 50% 100%, 0% 70%)';
        if (shape === 'octagon') shapeClip = 'polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)';
        if (shape === 'badge') shapeClip = 'polygon(50% 0%, 80% 10%, 100% 35%, 85% 70%, 50% 100%, 15% 70%, 0% 35%, 20% 10%)';

        const curr = Math.min(p.currentValue, def.target);
        const itemPercent = Math.min(100, Math.round((curr / def.target) * 100));

        return `
          <div class="card" data-inspect-ach="${def.id}" style="
            display: flex;
            align-items: center;
            gap: 18px;
            padding: 16px 20px;
            background: var(--bg-elevated-soft);
            backdrop-filter: blur(8px);
            border: 1px solid ${isComplete ? color + '88' : 'var(--border-subtle)'};
            border-radius: var(--radius-lg);
            position: relative;
            overflow: hidden;
            box-shadow: ${isComplete ? '0 0 20px ' + color + '33' : 'none'};
            cursor: pointer;
            transition: transform 0.15s, border-color 0.15s;
          ">
            <!-- Custom Geometric Shape Badge Container -->
            <div style="
              width: 56px;
              height: 56px;
              display: flex;
              align-items: center;
              justify-content: center;
              background: ${isComplete ? `radial-gradient(circle, ${color} 0%, var(--bg-elevated-soft) 100%)` : 'var(--bg-elevated-soft)'};
              clip-path: ${shapeClip};
              filter: drop-shadow(0 4px 10px ${isComplete ? color + 'aa' : 'rgba(0,0,0,0.5)'});
              flex-shrink: 0;
            ">
              <span style="font-size: 26px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.6));">
                ${def.icon || '🏆'}
              </span>
            </div>

            <div style="flex: 1; min-width: 0;">
              <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 2px;">
                <div style="font-size: 1rem; font-weight: 800; color: var(--text-primary);">${def.name}</div>
                <span style="
                  font-size: 0.68rem;
                  font-weight: 800;
                  text-transform: uppercase;
                  padding: 2px 8px;
                  border-radius: 999px;
                  background: ${color}22;
                  color: ${color};
                  border: 1px solid ${color}44;
                ">${def.rarity}</span>
                ${isComplete ? `<span style="color: var(--success); font-size: 0.78rem; font-weight: 800; margin-left: auto;">✓ UNLOCKED</span>` : ''}
              </div>

              <div style="font-size: 0.82rem; color: var(--text-secondary); margin-bottom: 8px;">${def.description}</div>

              <!-- Progress Bar -->
              <div style="display: flex; align-items: center; gap: 12px;">
                <div style="flex: 1; height: 6px; background: var(--bg-row); border-radius: 999px; overflow: hidden;">
                  <div style="width: ${itemPercent}%; height: 100%; background: ${isComplete ? color : 'var(--accent-primary)'}; transition: width 0.3s ease;"></div>
                </div>
                <div style="font-size: 0.75rem; font-family: var(--font-mono); color: var(--text-muted); font-weight: 700;">
                  ${curr} / ${def.target}
                </div>
              </div>
            </div>

            <div style="text-align: right; font-family: var(--font-mono); font-size: 0.9rem; font-weight: 800; color: var(--warning); flex-shrink: 0; padding-left: 8px;">
              +${def.rewardVP} VP
            </div>
          </div>
        `;
      }).join('');

      return `
        <div style="display: flex; flex-direction: column; gap: 20px;">
          <!-- Overall Progress Banner -->
          <div style="
            padding: 20px 24px;
            background: var(--bg-elevated-soft);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-lg);
          ">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
              <div>
                <div style="font-size: 1.1rem; font-weight: 800; color: var(--text-primary);">Trophy Completion</div>
                <div style="font-size: 0.82rem; color: var(--text-secondary);">${unlockedCount} of ${totalCount} achievements unlocked • Click any achievement to unroll crest banner</div>
              </div>
              <div style="font-size: 1.6rem; font-weight: 900; color: var(--success); font-family: var(--font-mono);">
                ${percent}%
              </div>
            </div>
            <div style="width: 100%; height: 10px; background: var(--bg-row); border-radius: 999px; overflow: hidden;">
              <div style="width: ${percent}%; height: 100%; background: var(--accent-gradient); transition: width 0.5s ease;"></div>
            </div>
          </div>

          <!-- Category Filters -->
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            ${categoryFilterButtons}
          </div>

          <!-- Achievement Cards Grid -->
          <div style="display: flex; flex-direction: column; gap: 12px;">
            ${itemsHtml || '<div style="color: var(--text-muted); padding: 20px 0;">No achievements found in this category.</div>'}
          </div>
        </div>
      `;
    }

    // Transactions History
    const txHtml = transactions.map(tx => {
      const isEarn = tx.type === 'earn';
      return `
        <div style="
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
        ">
          <div>
            <div style="font-size: 0.9rem; font-weight: 700; color: var(--text-primary);">${tx.reason}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${new Date(tx.timestamp).toLocaleString()}</div>
          </div>
          <div style="
            font-family: var(--font-mono);
            font-weight: 800;
            font-size: 0.95rem;
            color: ${isEarn ? '#10b981' : '#ef4444'};
          ">
            ${isEarn ? '+' : '-'}${tx.amount} VP
          </div>
        </div>
      `;
    }).join('');

    return `
      <div style="display: flex; flex-direction: column; gap: 8px;">
        ${txHtml || '<div style="color: var(--text-muted); font-size: 0.85rem;">No transaction history yet.</div>'}
      </div>
    `;
  }
}
