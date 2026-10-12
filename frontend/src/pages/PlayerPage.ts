import { api } from '../services/api';
import { PlayerProfile, WalletState, AchievementDefinition, AchievementProgress, CosmeticDefinition, CosmeticEffect } from '../../../electron/types';
import { NotificationToast } from '../components/NotificationToast';
import { getItemDataUrl } from '../assets/items';

export class PlayerPage {
  private container: HTMLElement;
  private activeTab: 'profile' | 'achievements' | 'transactions' = 'profile';

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
            background: #111827;
            border: 2px solid ${equippedEffect ? 'var(--accent-secondary)' : 'var(--border-subtle)'};
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: ${equippedEffect ? '0 0 20px var(--accent-glow)' : 'none'};
          ">
            ${equippedCosmetic ? `
              <img src="${getItemDataUrl(equippedCosmetic.artworkPath)}" style="width: 52px; height: 52px; image-rendering: pixelated;" />
            ` : `
              <img src="${getItemDataUrl('minecraft:grass_block')}" style="width: 52px; height: 52px; image-rendering: pixelated;" />
            `}
          </div>

          <div>
            <div style="display: flex; align-items: center; gap: 10px;">
              <h1 style="font-size: 1.5rem; font-weight: 800; color: var(--text-primary); margin: 0;">
                ${profile.displayName}
              </h1>
              ${equippedCosmetic ? `
                <span style="font-size: 0.75rem; font-weight: 700; padding: 2px 8px; border-radius: 999px; background: rgba(16,185,129,0.2); color: #10b981;">
                  ${equippedCosmetic.name}
                </span>
              ` : ''}
              ${equippedEffect ? `
                <span style="font-size: 0.75rem; font-weight: 700; padding: 2px 8px; border-radius: 999px; background: rgba(6,182,212,0.2); color: #06b6d4;">
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
            <div style="font-size: 1.3rem; font-weight: 900; color: #f59e0b; font-family: var(--font-mono);">${wallet.balance.toLocaleString()}</div>
          </div>

          <div style="
            padding: 12px 18px;
            background: var(--bg-card);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-md);
            text-align: right;
          ">
            <div style="font-size: 0.72rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">Achievements</div>
            <div style="font-size: 1.3rem; font-weight: 900; color: #10b981; font-family: var(--font-mono);">${unlockedCount} / ${totalAchievements}</div>
          </div>
        </div>
      </div>

      <!-- Navigation Tabs -->
      <div style="display: flex; gap: 8px; margin-bottom: 20px;">
        <button class="btn ${this.activeTab === 'profile' ? 'btn-primary' : 'btn-secondary'}" id="tab-player-profile">
          Minecraft Collection
        </button>
        <button class="btn ${this.activeTab === 'achievements' ? 'btn-primary' : 'btn-secondary'}" id="tab-player-achievements">
          Achievements (${unlockedCount}/${totalAchievements})
        </button>
        <button class="btn ${this.activeTab === 'transactions' ? 'btn-primary' : 'btn-secondary'}" id="tab-player-tx">
          VP Ledger History
        </button>
      </div>

      <!-- Tab Content Area -->
      <div id="player-tab-stage">
        ${this.renderTabContent(profile, cosmeticsData, achievementsData, transactions)}
      </div>
    `;

    // Hook tab switches
    const tabOverview = this.container.querySelector('#tab-player-profile') as HTMLElement;
    const tabAch = this.container.querySelector('#tab-player-achievements') as HTMLElement;
    const tabTx = this.container.querySelector('#tab-player-tx') as HTMLElement;

    tabOverview.onclick = () => { this.activeTab = 'profile'; this.render(); };
    tabAch.onclick = () => { this.activeTab = 'achievements'; this.render(); };
    tabTx.onclick = () => { this.activeTab = 'transactions'; this.render(); };

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
              <img src="${texture}" style="width: 40px; height: 40px; image-rendering: pixelated;" />
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

      const itemsHtml = achievementsData.definitions.map(def => {
        const p = progressMap.get(def.id) || { currentValue: 0, unlocked: false };
        const isComplete = p.unlocked;

        return `
          <div class="card" style="
            display: flex;
            align-items: center;
            gap: 16px;
            padding: 16px;
            background: var(--bg-surface);
            border: 1px solid ${isComplete ? '#10b98133' : 'var(--border-subtle)'};
            border-radius: var(--radius-md);
            opacity: ${isComplete ? '1' : '0.8'};
          ">
            <div style="
              width: 44px;
              height: 44px;
              border-radius: var(--radius-md);
              background: ${isComplete ? 'rgba(16,185,129,0.15)' : 'var(--bg-card)'};
              border: 1px solid var(--border-subtle);
              display: flex;
              align-items: center;
              justify-content: center;
            ">
              <img src="${getItemDataUrl(def.rewardCosmeticId ? 'minecraft:nether_star' : 'minecraft:diamond')}" style="width: 28px; height: 28px; image-rendering: pixelated;" />
            </div>

            <div style="flex: 1;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <div style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary);">${def.name}</div>
                ${isComplete ? '<span style="color: #10b981; font-size: 0.75rem; font-weight: 700;">✓ UNLOCKED</span>' : ''}
              </div>
              <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 2px;">${def.description}</div>
            </div>

            <div style="text-align: right; font-family: var(--font-mono); font-size: 0.85rem; font-weight: 700; color: #f59e0b;">
              +${def.rewardVP} VP
            </div>
          </div>
        `;
      }).join('');

      return `
        <div style="display: flex; flex-direction: column; gap: 10px;">
          ${itemsHtml}
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
