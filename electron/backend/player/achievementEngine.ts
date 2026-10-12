import { AchievementDefinition, AchievementProgress } from '../../types';
import { PlayerDataStore } from './playerDataStore';
import { CosmeticCatalogue } from './cosmeticCatalogue';

export const ACHIEVEMENTS: AchievementDefinition[] = [
  // Launcher
  {
    id: 'first_instance',
    name: 'First World',
    description: 'Create your very first Minecraft instance.',
    category: 'launcher',
    rarity: 'common',
    icon: '🏗️',
    hidden: false,
    target: 1,
    rewardVP: 50,
    rewardCosmeticId: 'cosmetic-badge-first-instance'
  },
  {
    id: 'first_launch',
    name: 'Into the Game',
    description: 'Launch Minecraft client through Voxel+.',
    category: 'launcher',
    rarity: 'common',
    icon: '🚀',
    hidden: false,
    target: 1,
    rewardVP: 50
  },
  {
    id: 'instance_collector',
    name: 'Multiverse Architect',
    description: 'Create 5 different instances.',
    category: 'launcher',
    rarity: 'rare',
    icon: '🌌',
    hidden: false,
    target: 5,
    rewardVP: 200
  },

  // VPack
  {
    id: 'vpack_export',
    name: 'Master Exporter',
    description: 'Export an instance as a portable .vpack / .voxelplus archive.',
    category: 'vpack',
    rarity: 'uncommon',
    icon: '📦',
    hidden: false,
    target: 1,
    rewardVP: 100,
    rewardCosmeticId: 'cosmetic-badge-vpack-master'
  },
  {
    id: 'vpack_import',
    name: 'Courier of Worlds',
    description: 'Import an instance from a VPack package.',
    category: 'vpack',
    rarity: 'uncommon',
    icon: '📥',
    hidden: false,
    target: 1,
    rewardVP: 100
  },

  // Content
  {
    id: 'first_mod',
    name: 'Modder at Heart',
    description: 'Install a mod into any instance.',
    category: 'content',
    rarity: 'common',
    icon: '🧩',
    hidden: false,
    target: 1,
    rewardVP: 50
  },
  {
    id: 'mod_overload',
    name: 'Kitchen Sink',
    description: 'Install 20 or more mods across instances.',
    category: 'content',
    rarity: 'rare',
    icon: '🧪',
    hidden: false,
    target: 20,
    rewardVP: 250
  },

  // Stocker (Arcade)
  {
    id: 'stocker_first_run',
    name: 'Wave Rider',
    description: 'Complete a run in Stocker arcade game.',
    category: 'stocker',
    rarity: 'common',
    icon: '🌊',
    hidden: false,
    target: 1,
    rewardVP: 25
  },
  {
    id: 'stocker_1000',
    name: 'Deep Currents',
    description: 'Reach a score of 1,000 in Stocker.',
    category: 'stocker',
    rarity: 'uncommon',
    icon: '⚡',
    hidden: false,
    target: 1000,
    rewardVP: 100
  },
  {
    id: 'stocker_5000',
    name: 'Stocker Legend',
    description: 'Achieve a score of 5,000 or higher in Stocker.',
    category: 'stocker',
    rarity: 'legendary',
    icon: '👑',
    hidden: false,
    target: 5000,
    rewardVP: 500,
    rewardCosmeticId: 'cosmetic-badge-arcade-champion'
  },

  // Cookie (Arcade)
  {
    id: 'cookie_first',
    name: 'Sweet Tooth',
    description: 'Bake your first cookie in Cookie Clicker.',
    category: 'cookie',
    rarity: 'common',
    icon: '🍪',
    hidden: false,
    target: 1,
    rewardVP: 20
  },
  {
    id: 'cookie_1000',
    name: 'Batch Baker',
    description: 'Bake 1,000 lifetime cookies.',
    category: 'cookie',
    rarity: 'uncommon',
    icon: '🧁',
    hidden: false,
    target: 1000,
    rewardVP: 100
  },
  {
    id: 'cookie_100000',
    name: 'Cookie Tycoon',
    description: 'Bake 100,000 lifetime cookies.',
    category: 'cookie',
    rarity: 'epic',
    icon: '🏭',
    hidden: false,
    target: 100000,
    rewardVP: 400
  },

  // Player & Economy
  {
    id: 'first_purchase',
    name: 'Dressed to Impress',
    description: 'Purchase your first cosmetic item in the shop.',
    category: 'player',
    rarity: 'common',
    icon: '🛍️',
    hidden: false,
    target: 1,
    rewardVP: 50
  },
  {
    id: 'fashion_icon',
    name: 'Fashion Icon',
    description: 'Own at least 5 different cosmetics.',
    category: 'collection',
    rarity: 'epic',
    icon: '✨',
    hidden: false,
    target: 5,
    rewardVP: 300
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
    }

    this.store.saveAchievementProgress(current);
    return { unlockedNow, rewardVP, cosmeticId };
  }
}
