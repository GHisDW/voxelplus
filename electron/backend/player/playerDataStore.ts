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
import { AchievementEngine } from './achievementEngine';

export interface VPackOwnership {
  packId: string;
  acquiredAt: string;
  price: number;
}

export interface PlayerDataSchema {
  profile: PlayerProfile;
  wallet: WalletState;
  transactions: WalletTransaction[];
  yearlyEconomy?: Record<number, { earned: number; spent: number }>;
  processedTransactionIds?: string[];
  achievements: Record<string, AchievementProgress>;
  cosmetics: Record<string, CosmeticOwnership>;
  vpacks: Record<string, VPackOwnership>;
  equippedEffectsHistory?: string[];
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
    const starterTxId = crypto.randomUUID();
    const year = new Date().getFullYear();
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
        lastTransactionId: starterTxId
      },
      transactions: [
        {
          id: starterTxId,
          type: 'earn',
          amount: 1000,
          balanceAfter: 1000,
          reason: 'Welcome to Voxel+!',
          timestamp: now,
          category: 'reward'
        }
      ],
      yearlyEconomy: {
        [year]: { earned: 1000, spent: 0 }
      },
      processedTransactionIds: [starterTxId],
      achievements: {},
      cosmetics: {
        'cosmetic-gem-emerald': {
          cosmeticId: 'cosmetic-gem-emerald',
          acquiredAt: now,
          source: 'default'
        }
      },
      vpacks: {},
      equippedEffectsHistory: [],
      _starterBonusGranted: true
    };
  }

  public recordEquippedEffect(effectId: string): void {
    if (!this.data.equippedEffectsHistory) {
      this.data.equippedEffectsHistory = [];
    }
    if (!this.data.equippedEffectsHistory.includes(effectId)) {
      this.data.equippedEffectsHistory.push(effectId);
      this.save();
    }
  }

  public getEquippedEffectsCount(): number {
    return this.data.equippedEffectsHistory ? this.data.equippedEffectsHistory.length : 0;
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
        
        // Migration: purge removed/orphaned achievement IDs (stocker achievements, configurator, etc.)
        const rawAchievements: Record<string, AchievementProgress> = parsed.achievements || {};
        const validAchievementIds = new Set(new AchievementEngine(this).getDefinitions().map(d => d.id));
        const cleanedAchievements: Record<string, AchievementProgress> = {};
        for (const [k, v] of Object.entries(rawAchievements)) {
          if (validAchievementIds.has(k)) {
            cleanedAchievements[k] = v;
          }
        }

        const yearlyEconomy: Record<number, { earned: number; spent: number }> = parsed.yearlyEconomy || {};
        const processedTransactionIds: string[] = Array.isArray(parsed.processedTransactionIds)
          ? parsed.processedTransactionIds
          : [];
        const processedTxSet = new Set(processedTransactionIds);

        // Populate yearlyEconomy from legacy transactions safely without double counting
        for (const tx of transactions) {
          if (!tx.id || processedTxSet.has(tx.id)) continue;
          const txYear = tx.timestamp ? new Date(tx.timestamp).getFullYear() : null;
          if (txYear && !Number.isNaN(txYear)) {
            if (!yearlyEconomy[txYear]) {
              yearlyEconomy[txYear] = { earned: 0, spent: 0 };
            }
            if (tx.type === 'earn') {
              yearlyEconomy[txYear].earned += tx.amount || 0;
            } else if (tx.type === 'spend') {
              yearlyEconomy[txYear].spent += tx.amount || 0;
            }
          }
          processedTransactionIds.push(tx.id);
          processedTxSet.add(tx.id);
        }

        return {
          profile: { ...defaultData.profile, ...(parsed.profile || {}) },
          wallet,
          transactions,
          yearlyEconomy,
          processedTransactionIds,
          achievements: cleanedAchievements,
          cosmetics: parsed.cosmetics || defaultData.cosmetics,
          vpacks: parsed.vpacks || {},
          equippedEffectsHistory: parsed.equippedEffectsHistory || [],
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

  public getYearlyEconomy(year: number): { earned: number; spent: number } {
    if (this.data.yearlyEconomy && this.data.yearlyEconomy[year]) {
      return { ...this.data.yearlyEconomy[year] };
    }
    return { earned: 0, spent: 0 };
  }

  public getAllYearlyEconomy(): Record<number, { earned: number; spent: number }> {
    return { ...(this.data.yearlyEconomy || {}) };
  }

  public addTransaction(
    type: 'earn' | 'spend',
    amount: number,
    reason: string,
    sourceId?: string,
    category?: 'cosmetic' | 'shop' | 'vpack' | 'reward' | 'refund' | 'other',
    itemId?: string
  ): { success: boolean; wallet: WalletState; transaction?: WalletTransaction; error?: string } {
    if (amount <= 0 || !Number.isInteger(amount)) {
      return { success: false, wallet: this.getWallet(), error: 'Amount must be a positive integer.' };
    }

    if (type === 'spend' && this.data.wallet.balance < amount) {
      return { success: false, wallet: this.getWallet(), error: 'Insufficient Voxel Points (VP).' };
    }

    const now = new Date();
    const currentYear = now.getFullYear();

    // Determine category if not explicitly provided
    let finalCategory = category;
    if (!finalCategory) {
      if (sourceId?.startsWith('cosmetic') || reason.toLowerCase().includes('purchased: cosmetic')) {
        finalCategory = 'cosmetic';
      } else if (reason.toLowerCase().includes('vpack')) {
        finalCategory = 'vpack';
      } else if (reason.toLowerCase().includes('reward') || reason.toLowerCase().includes('welcome')) {
        finalCategory = 'reward';
      } else if (reason.toLowerCase().includes('refund')) {
        finalCategory = 'refund';
      } else if (type === 'spend') {
        finalCategory = 'shop';
      } else {
        finalCategory = 'other';
      }
    }

    const tx: WalletTransaction = {
      id: crypto.randomUUID(),
      type,
      amount,
      balanceAfter: type === 'earn' ? this.data.wallet.balance + amount : this.data.wallet.balance - amount,
      reason,
      timestamp: now.toISOString(),
      category: finalCategory,
      itemId: itemId || sourceId
    };

    if (type === 'earn') {
      this.data.wallet.balance += amount;
      this.data.wallet.lifetimeEarned += amount;

      // Track VP milestones without recursive calls when addTransaction is triggered by achievement rewards
      if (!sourceId?.startsWith('achievement') && !reason.startsWith('Unlocked achievement:')) {
        const engine = new AchievementEngine(this);
        engine.trackProgress('vp_earner', this.data.wallet.lifetimeEarned, true);
        engine.trackProgress('vp_tycoon', this.data.wallet.lifetimeEarned, true);
        engine.checkWinCondition();
      }
    } else {
      this.data.wallet.balance -= amount;
      this.data.wallet.lifetimeSpent += amount;
    }

    // Update yearly economy aggregates reliably
    if (!this.data.yearlyEconomy) {
      this.data.yearlyEconomy = {};
    }
    if (!this.data.yearlyEconomy[currentYear]) {
      this.data.yearlyEconomy[currentYear] = { earned: 0, spent: 0 };
    }
    if (type === 'earn') {
      this.data.yearlyEconomy[currentYear].earned += amount;
    } else {
      this.data.yearlyEconomy[currentYear].spent += amount;
    }

    if (!this.data.processedTransactionIds) {
      this.data.processedTransactionIds = [];
    }
    this.data.processedTransactionIds.push(tx.id);
    if (this.data.processedTransactionIds.length > 5000) {
      this.data.processedTransactionIds = this.data.processedTransactionIds.slice(-5000);
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
