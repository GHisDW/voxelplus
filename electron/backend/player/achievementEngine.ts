import { AchievementDefinition, AchievementProgress } from '../../types';
import { PlayerDataStore } from './playerDataStore';
import { CosmeticCatalogue } from './cosmeticCatalogue';

type AchievementUnlockCallback = (data: { achievementName: string; rewardVP: number; isWinCondition: boolean }) => void;

let achievementUnlockCallback: AchievementUnlockCallback | null = null;

export function setAchievementUnlockCallback(callback: AchievementUnlockCallback) {
  achievementUnlockCallback = callback;
}

export const ACHIEVEMENTS: AchievementDefinition[] = [
  // ===== WIN CONDITION =====
  {
    id: 'completion_master',
    name: 'Voxel+ Legend',
    description: 'Unlock 100% of all achievements - the ultimate mastery of Voxel+.',
    category: 'collection',
    rarity: 'legendary',
    difficulty: 10,
    difficultyRank: 'Ultimate',
    icon: '🏆',
    hidden: false,
    target: 100,
    rewardVP: 5000,
    rewardCosmeticId: 'cosmetic-relic-nether-star',
    color: '#fbbf24',
    shape: 'badge',
    isWinCondition: true
  },

  // ===== LAUNCHER =====
  {
    id: 'first_instance',
    name: 'First World',
    description: 'Create your very first Minecraft instance.',
    category: 'launcher',
    rarity: 'common',
    difficulty: 2,
    difficultyRank: 'Very Easy',
    icon: '🏗️',
    hidden: false,
    target: 1,
    rewardVP: 50,
    rewardCosmeticId: 'cosmetic-badge-first-instance',
    color: '#10b981',
    shape: 'hexagon'
  },
  {
    id: 'first_launch',
    name: 'Into the Game',
    description: 'Launch Minecraft client through Voxel+.',
    category: 'launcher',
    rarity: 'common',
    difficulty: 1,
    difficultyRank: 'Trivial',
    icon: '🚀',
    hidden: false,
    target: 1,
    rewardVP: 50,
    color: '#06b6d4',
    shape: 'diamond'
  },
  {
    id: 'instance_collector',
    name: 'Multiverse Architect',
    description: 'Create 5 different instances.',
    category: 'launcher',
    rarity: 'rare',
    difficulty: 4,
    difficultyRank: 'Moderate',
    icon: '🌌',
    hidden: false,
    target: 5,
    rewardVP: 200,
    color: '#8b5cf6',
    shape: 'octagon'
  },
  {
    id: 'instance_master',
    name: 'World Builder',
    description: 'Create 10 different instances.',
    category: 'launcher',
    rarity: 'epic',
    difficulty: 7,
    difficultyRank: 'Very Hard',
    icon: '🌍',
    hidden: false,
    target: 10,
    rewardVP: 400,
    color: '#ec4899',
    shape: 'shield'
  },
  {
    id: 'launcher_explorer',
    name: 'Version Explorer',
    description: 'Create instances across 5 different Minecraft versions.',
    category: 'launcher',
    rarity: 'rare',
    difficulty: 5,
    difficultyRank: 'Challenging',
    icon: '📚',
    hidden: false,
    target: 5,
    rewardVP: 250,
    color: '#f59e0b',
    shape: 'diamond'
  },
  {
    id: 'loader_expert',
    name: 'Loader Master',
    description: 'Create instances using 3 different mod loaders (Fabric, Forge, NeoForge).',
    category: 'launcher',
    rarity: 'epic',
    difficulty: 6,
    difficultyRank: 'Hard',
    icon: '⚙️',
    hidden: false,
    target: 3,
    rewardVP: 350,
    color: '#6366f1',
    shape: 'hexagon'
  },

  // ===== VPACK =====
  {
    id: 'vpack_export',
    name: 'Master Exporter',
    description: 'Export an instance as a portable .vpack / .voxelplus archive.',
    category: 'vpack',
    rarity: 'uncommon',
    difficulty: 4,
    difficultyRank: 'Moderate',
    icon: '📦',
    hidden: false,
    target: 1,
    rewardVP: 100,
    rewardCosmeticId: 'cosmetic-badge-vpack-master',
    color: '#14b8a6',
    shape: 'diamond'
  },
  {
    id: 'vpack_import',
    name: 'Courier of Worlds',
    description: 'Import an instance from a VPack package.',
    category: 'vpack',
    rarity: 'uncommon',
    difficulty: 3,
    difficultyRank: 'Easy',
    icon: '📥',
    hidden: false,
    target: 1,
    rewardVP: 100,
    color: '#0ea5e9',
    shape: 'diamond'
  },
  {
    id: 'vpack_collector',
    name: 'Pack Hunter',
    description: 'Import 5 different VPack packages.',
    category: 'vpack',
    rarity: 'rare',
    difficulty: 6,
    difficultyRank: 'Hard',
    icon: '🎁',
    hidden: false,
    target: 5,
    rewardVP: 300,
    color: '#a855f7',
    shape: 'octagon'
  },
  {
    id: 'vpack_sharer',
    name: 'World Distributor',
    description: 'Export 3 different instances as VPack packages.',
    category: 'vpack',
    rarity: 'rare',
    difficulty: 6,
    difficultyRank: 'Hard',
    icon: '📤',
    hidden: false,
    target: 3,
    rewardVP: 300,
    color: '#f97316',
    shape: 'octagon'
  },

  // ===== CONTENT =====
  {
    id: 'first_mod',
    name: 'Modder at Heart',
    description: 'Install a mod into any instance.',
    category: 'content',
    rarity: 'common',
    difficulty: 3,
    difficultyRank: 'Easy',
    icon: '🧩',
    hidden: false,
    target: 1,
    rewardVP: 50,
    color: '#10b981',
    shape: 'hexagon'
  },
  {
    id: 'mod_overload',
    name: 'Kitchen Sink',
    description: 'Install 20 or more mods across instances.',
    category: 'content',
    rarity: 'rare',
    difficulty: 6,
    difficultyRank: 'Hard',
    icon: '🧪',
    hidden: false,
    target: 20,
    rewardVP: 250,
    color: '#ec4899',
    shape: 'shield'
  },
  {
    id: 'mod_master',
    name: 'Modding Legend',
    description: 'Install 50 or more mods across instances.',
    category: 'content',
    rarity: 'epic',
    difficulty: 8,
    difficultyRank: 'Extreme',
    icon: '🔬',
    hidden: false,
    target: 50,
    rewardVP: 500,
    color: '#8b5cf6',
    shape: 'badge'
  },
  {
    id: 'resource_packer',
    name: 'Texture Artist',
    description: 'Install a resource pack into any instance.',
    category: 'content',
    rarity: 'common',
    difficulty: 3,
    difficultyRank: 'Easy',
    icon: '🎨',
    hidden: false,
    target: 1,
    rewardVP: 50,
    color: '#f472b6',
    shape: 'diamond'
  },
  {
    id: 'shader_enthusiast',
    name: 'Visual Perfectionist',
    description: 'Install a shader pack into any instance.',
    category: 'content',
    rarity: 'uncommon',
    difficulty: 4,
    difficultyRank: 'Moderate',
    icon: '✨',
    hidden: false,
    target: 1,
    rewardVP: 100,
    color: '#c084fc',
    shape: 'diamond'
  },
  {
    id: 'shader_master',
    name: 'Lighting Architect',
    description: 'Install 3 different shader packs.',
    category: 'content',
    rarity: 'rare',
    difficulty: 7,
    difficultyRank: 'Very Hard',
    icon: '💡',
    hidden: false,
    target: 3,
    rewardVP: 250,
    color: '#a78bfa',
    shape: 'octagon'
  },

  // ===== COOKIE (ARCADE) =====
  {
    id: 'cookie_first',
    name: 'Sweet Tooth',
    description: 'Bake your first cookie in Cookie Clicker.',
    category: 'cookie',
    rarity: 'common',
    difficulty: 2,
    difficultyRank: 'Very Easy',
    icon: '🍪',
    hidden: false,
    target: 1,
    rewardVP: 20,
    color: '#f59e0b',
    shape: 'diamond'
  },
  {
    id: 'cookie_1000',
    name: 'Batch Baker',
    description: 'Bake 1,000 lifetime cookies.',
    category: 'cookie',
    rarity: 'uncommon',
    difficulty: 4,
    difficultyRank: 'Moderate',
    icon: '🧁',
    hidden: false,
    target: 1000,
    rewardVP: 100,
    color: '#f97316',
    shape: 'shield'
  },
  {
    id: 'cookie_100000',
    name: 'Cookie Tycoon',
    description: 'Bake 100,000 lifetime cookies.',
    category: 'cookie',
    rarity: 'epic',
    difficulty: 7,
    difficultyRank: 'Very Hard',
    icon: '🏭',
    hidden: false,
    target: 100000,
    rewardVP: 400,
    color: '#ef4444',
    shape: 'badge'
  },
  {
    id: 'cookie_million',
    name: 'Cookie Empire',
    description: 'Bake 1,000,000 lifetime cookies.',
    category: 'cookie',
    rarity: 'legendary',
    difficulty: 9,
    difficultyRank: 'Legendary',
    icon: '👑',
    hidden: false,
    target: 1000000,
    rewardVP: 1000,
    color: '#fbbf24',
    shape: 'badge'
  },
  {
    id: 'cookie_clicker',
    name: 'Click Master',
    description: 'Click 1,000 times in Cookie Clicker.',
    category: 'cookie',
    rarity: 'uncommon',
    difficulty: 6,
    difficultyRank: 'Hard',
    icon: '👆',
    hidden: false,
    target: 1000,
    rewardVP: 100,
    color: '#a855f7',
    shape: 'hexagon'
  },
  {
    id: 'cookie_upgrader',
    name: 'Shop Keeper',
    description: 'Purchase 5 upgrades in Cookie Clicker.',
    category: 'cookie',
    rarity: 'rare',
    difficulty: 5,
    difficultyRank: 'Challenging',
    icon: '🏪',
    hidden: false,
    target: 5,
    rewardVP: 200,
    color: '#ec4899',
    shape: 'octagon'
  },

  // ===== PLAYER & ECONOMY =====
  {
    id: 'first_purchase',
    name: 'Dressed to Impress',
    description: 'Purchase your first cosmetic item in the shop.',
    category: 'player',
    rarity: 'common',
    difficulty: 2,
    difficultyRank: 'Very Easy',
    icon: '🛍️',
    hidden: false,
    target: 1,
    rewardVP: 50,
    color: '#10b981',
    shape: 'diamond'
  },
  {
    id: 'fashion_icon',
    name: 'Fashion Icon',
    description: 'Own at least 5 different cosmetics.',
    category: 'collection',
    rarity: 'epic',
    difficulty: 5,
    difficultyRank: 'Challenging',
    icon: '✨',
    hidden: false,
    target: 5,
    rewardVP: 300,
    color: '#ec4899',
    shape: 'badge'
  },
  {
    id: 'collector_elite',
    name: 'Master Collector',
    description: 'Own at least 10 different cosmetics.',
    category: 'collection',
    rarity: 'legendary',
    difficulty: 7,
    difficultyRank: 'Very Hard',
    icon: '🎖️',
    hidden: false,
    target: 10,
    rewardVP: 600,
    color: '#fbbf24',
    shape: 'badge'
  },
  {
    id: 'vp_earner',
    name: 'Point Accumulator',
    description: 'Earn 1,000 total VP from all sources.',
    category: 'player',
    rarity: 'uncommon',
    difficulty: 5,
    difficultyRank: 'Challenging',
    icon: '💰',
    hidden: false,
    target: 1000,
    rewardVP: 150,
    color: '#f59e0b',
    shape: 'shield'
  },
  {
    id: 'vp_tycoon',
    name: 'VP Mogul',
    description: 'Earn 5,000 total VP from all sources.',
    category: 'player',
    rarity: 'epic',
    difficulty: 7,
    difficultyRank: 'Very Hard',
    icon: '💎',
    hidden: false,
    target: 5000,
    rewardVP: 400,
    color: '#8b5cf6',
    shape: 'badge'
  },
  {
    id: 'effect_explorer',
    name: 'Effect Experimenter',
    description: 'Equip 3 different cosmetic effects.',
    category: 'player',
    rarity: 'rare',
    difficulty: 4,
    difficultyRank: 'Moderate',
    icon: '🌟',
    hidden: false,
    target: 3,
    rewardVP: 250,
    color: '#a855f7',
    shape: 'octagon'
  },

  // ===== MILESTONES =====
  {
    id: 'achievement_10',
    name: 'Trophy Hunter',
    description: 'Unlock 10 achievements.',
    category: 'collection',
    rarity: 'uncommon',
    difficulty: 4,
    difficultyRank: 'Moderate',
    icon: '🏅',
    hidden: false,
    target: 10,
    rewardVP: 150,
    color: '#3b82f6',
    shape: 'shield'
  },
  {
    id: 'achievement_25',
    name: 'Achievement Enthusiast',
    description: 'Unlock 25 achievements.',
    category: 'collection',
    rarity: 'rare',
    difficulty: 6,
    difficultyRank: 'Hard',
    icon: '🎖️',
    hidden: false,
    target: 25,
    rewardVP: 350,
    color: '#8b5cf6',
    shape: 'octagon'
  }
];

export class AchievementEngine {
  private store: PlayerDataStore;

  constructor(store?: PlayerDataStore) {
    this.store = store || PlayerDataStore.getInstance();
  }

  public getDefinitions(): AchievementDefinition[] {
    return ACHIEVEMENTS;
  }

  public getProgressList(): AchievementProgress[] {
    const rawMap = this.store.getAchievements();
    return ACHIEVEMENTS.map(def => {
      const existing = rawMap[def.id];
      if (existing) return existing;
      return {
        achievementId: def.id,
        currentValue: 0,
        unlocked: false,
        unlockedAt: null,
        rewardClaimed: false,
        stagesClaimed: []
      };
    });
  }

  public trackProgress(achievementId: string, deltaOrAbsolute: number, isAbsolute: boolean = false): {
    unlockedNow: boolean;
    rewardVP: number;
    cosmeticId?: string;
    achievementDef?: AchievementDefinition;
  } {
    const def = ACHIEVEMENTS.find(a => a.id === achievementId);
    if (!def) return { unlockedNow: false, rewardVP: 0 };

    const current = this.store.getAchievementProgress(achievementId) || {
      achievementId: def.id,
      currentValue: 0,
      unlocked: false,
      unlockedAt: null,
      rewardClaimed: false,
      stagesClaimed: []
    };

    if (isAbsolute) {
      current.currentValue = Math.max(current.currentValue, deltaOrAbsolute);
    } else {
      current.currentValue += deltaOrAbsolute;
    }

    let unlockedNow = false;
    let rewardVP = 0;
    let cosmeticId: string | undefined;

    if (!current.unlocked && current.currentValue >= def.target) {
      current.unlocked = true;
      current.unlockedAt = new Date().toISOString();
      unlockedNow = true;

      // Automatically claim reward
      if (!current.rewardClaimed && def.rewardVP > 0) {
        current.rewardClaimed = true;
        rewardVP = def.rewardVP;
        this.store.addTransaction('earn', rewardVP, `Unlocked achievement: ${def.name}`, def.id);
      }

      if (def.rewardCosmeticId && !this.store.isCosmeticOwned(def.rewardCosmeticId)) {
        this.store.grantCosmetic(def.rewardCosmeticId, 'achievement');
        cosmeticId = def.rewardCosmeticId;
      }

      // Trigger achievement unlock callback
      if (achievementUnlockCallback) {
        achievementUnlockCallback({
          achievementName: def.name,
          rewardVP: rewardVP,
          isWinCondition: def.isWinCondition || false
        });
      }
    }

    this.store.saveAchievementProgress(current);
    return { unlockedNow, rewardVP, cosmeticId, achievementDef: def };
  }

  public checkWinCondition(): boolean {
    const allAchievements = this.getProgressList();
    const unlockedCount = allAchievements.filter(p => p.unlocked).length;
    const totalCount = allAchievements.length;
    const completionPercent = (unlockedCount / totalCount) * 100;

    // Check if win condition achievement should be unlocked
    if (completionPercent >= 100) {
      const winResult = this.trackProgress('completion_master', 100, true);
      return winResult.unlockedNow;
    }

    // Track milestone achievements
    if (unlockedCount >= 10) this.trackProgress('achievement_10', unlockedCount, true);
    if (unlockedCount >= 25) this.trackProgress('achievement_25', unlockedCount, true);

    return false;
  }
}
