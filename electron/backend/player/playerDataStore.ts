import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { app } from 'electron';
import {
  PlayerProfile,
  WalletState,
  WalletTransaction,
  AchievementProgress,
  CosmeticOwnership
} from '../../types';

export interface VPackOwnership {
  packId: string;
  acquiredAt: string;
  price: number;
}

export interface PlayerDataSchema {
  profile: PlayerProfile;
  wallet: WalletState;
  transactions: WalletTransaction[];
  achievements: Record<string, AchievementProgress>;
  cosmetics: Record<string, CosmeticOwnership>;
  vpacks: Record<string, VPackOwnership>;
  _starterBonusGranted?: boolean;
}

export class PlayerDataStore {
  private static instance: PlayerDataStore | null = null;
  private filePath: string;
  private data: PlayerDataSchema;

  constructor(customPath?: string) {
    if (customPath) {
      this.filePath = customPath;
    } else {
      const userDataDir = app ? app.getPath('userData') : path.join(process.cwd(), '.voxelplus');
      this.filePath = path.join(userDataDir, 'player-data.json');
    }
    this.data = this.load();
  }

  public static getInstance(): PlayerDataStore {
    if (!PlayerDataStore.instance) {
      PlayerDataStore.instance = new PlayerDataStore();
    }
    return PlayerDataStore.instance;
  }

  private getDefaultData(): PlayerDataSchema {
    const now = new Date().toISOString();
    return {
      profile: {
        id: crypto.randomUUID(),
        displayName: 'Voxel Explorer',
        avatar: null,
        equippedCosmeticId: 'cosmetic-gem-emerald',
        equippedEffectId: null,
        createdAt: now,
        lastActiveAt: now
      },
      wallet: {
        balance: 1000,
        lifetimeEarned: 1000,
        lifetimeSpent: 0,
        lastTransactionId: null
      },
      transactions: [
        {
          id: crypto.randomUUID(),
          type: 'earn',
          amount: 1000,
          reason: 'Welcome to Voxel+!',
          sourceId: 'starter-bonus',
          timestamp: now
        }
      ],
      achievements: {},
      cosmetics: {
        'cosmetic-gem-emerald': {
          cosmeticId: 'cosmetic-gem-emerald',
          acquiredAt: now,
          source: 'default'
        }
      },
      vpacks: {},
      _starterBonusGranted: true
    };
  }

  private load(): PlayerDataSchema {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        
        // Check if starter bonus was already granted
        const starterBonusGranted = parsed._starterBonusGranted === true;
        
        const defaultData = this.getDefaultData();
        
        // If starter bonus was already granted, use the existing wallet balance
        // Otherwise, grant the starter bonus
        const wallet = starterBonusGranted 
          ? { ...defaultData.wallet, ...(parsed.wallet || {}) }
          : defaultData.wallet;
        
        const transactions = starterBonusGranted && Array.isArray(parsed.transactions)
          ? parsed.transactions
          : defaultData.transactions;
        
        return {
          profile: { ...defaultData.profile, ...(parsed.profile || {}) },
          wallet,
          transactions,
          achievements: parsed.achievements || {},
          cosmetics: parsed.cosmetics || defaultData.cosmetics,
          vpacks: parsed.vpacks || {},
          _starterBonusGranted: true
        };
      }
    } catch (e) {
      console.error('Failed to load player data, initializing defaults', e);
    }
    const def = this.getDefaultData();
    this.save(def);
    return def;
  }

  public save(dataToSave?: PlayerDataSchema): void {
    if (dataToSave) this.data = dataToSave;
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (e) {
      console.error('Failed to save player data', e);
    }
  }

  public getProfile(): PlayerProfile {
    return { ...this.data.profile };
  }

  public updateProfile(updates: Partial<PlayerProfile>): PlayerProfile {
    this.data.profile = {
      ...this.data.profile,
      ...updates,
      lastActiveAt: new Date().toISOString()
    };
    this.save();
    return this.getProfile();
  }

  public getWallet(): WalletState {
    return { ...this.data.wallet };
  }

  public getTransactions(): WalletTransaction[] {
    return [...this.data.transactions];
  }

  public addTransaction(
    type: 'earn' | 'spend',
    amount: number,
    reason: string,
    sourceId?: string
  ): { success: boolean; wallet: WalletState; transaction?: WalletTransaction; error?: string } {
    if (amount <= 0 || !Number.isInteger(amount)) {
      return { success: false, wallet: this.getWallet(), error: 'Amount must be a positive integer.' };
    }

    if (type === 'spend' && this.data.wallet.balance < amount) {
      return { success: false, wallet: this.getWallet(), error: 'Insufficient Voxel Points (VP).' };
    }

    const tx: WalletTransaction = {
      id: crypto.randomUUID(),
      type,
      amount,
      reason,
      sourceId,
      timestamp: new Date().toISOString()
    };

    if (type === 'earn') {
      this.data.wallet.balance += amount;
      this.data.wallet.lifetimeEarned += amount;
    } else {
      this.data.wallet.balance -= amount;
      this.data.wallet.lifetimeSpent += amount;
    }
    this.data.wallet.lastTransactionId = tx.id;
    this.data.transactions.unshift(tx);
    if (this.data.transactions.length > 200) {
      this.data.transactions = this.data.transactions.slice(0, 200);
    }

    this.save();
    return { success: true, wallet: this.getWallet(), transaction: tx };
  }

  public getAchievements(): Record<string, AchievementProgress> {
    return { ...this.data.achievements };
  }

  public getAchievementProgress(id: string): AchievementProgress | null {
    return this.data.achievements[id] || null;
  }

  public saveAchievementProgress(progress: AchievementProgress): void {
    this.data.achievements[progress.achievementId] = progress;
    this.save();
  }

  public getOwnedCosmetics(): CosmeticOwnership[] {
    return Object.values(this.data.cosmetics);
  }

  public isCosmeticOwned(id: string): boolean {
    return !!this.data.cosmetics[id];
  }

  public grantCosmetic(id: string, source: 'purchase' | 'achievement' | 'default'): CosmeticOwnership {
    const ownership: CosmeticOwnership = {
      cosmeticId: id,
      acquiredAt: new Date().toISOString(),
      source
    };
    this.data.cosmetics[id] = ownership;
    this.save();
    return ownership;
  }

  public isVPackOwned(packId: string): boolean {
    return !!this.data.vpacks[packId];
  }

  public recordVPackPurchase(packId: string, price: number): VPackOwnership {
    const ownership: VPackOwnership = {
      packId,
      acquiredAt: new Date().toISOString(),
      price
    };
    this.data.vpacks[packId] = ownership;
    this.save();
    return ownership;
  }

  public resetToDefaults(): PlayerDataSchema {
    this.data = this.getDefaultData();
    this.save();
    return this.data;
  }
}
