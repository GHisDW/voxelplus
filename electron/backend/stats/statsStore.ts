import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { app } from 'electron';
import {
  PlaySession,
  WrappedStats,
  InstanceStatsSummary,
  DifficultyRank,
  AchievementCategory,
  AchievementRarity,
  LoaderType
} from '../../types';
import { PlayerDataStore } from '../player/playerDataStore';
import { AchievementEngine } from '../player/achievementEngine';
import { CosmeticCatalogue } from '../player/cosmeticCatalogue';
import { InstanceManager } from '../instances/instanceManager';

export interface StatsSchema {
  sessions: PlaySession[];
  instanceLifetimeStats: Record<string, {
    totalPlaytimeMs: number;
    sessionCount: number;
    createdAt: string;
    deletedAt?: string;
  }>;
  vpackEvents: {
    type: 'import' | 'export';
    packId?: string;
    packName?: string;
    timestamp: string;
  }[];
  totalInstancesCreated: number;
}

export class StatsStore {
  private static instance: StatsStore | null = null;
  private filePath: string;
  private data: StatsSchema;

  constructor(customPath?: string) {
    if (customPath) {
      this.filePath = customPath;
    } else {
      const userDataDir = app ? app.getPath('userData') : path.join(process.cwd(), '.voxelplus');
      this.filePath = path.join(userDataDir, 'stats-data.json');
    }
    this.data = this.load();
    this.recoverActiveSessions();
  }

  public static getInstance(): StatsStore {
    if (!StatsStore.instance) {
      StatsStore.instance = new StatsStore();
    }
    return StatsStore.instance;
  }

  private getDefaultData(): StatsSchema {
    return {
      sessions: [],
      instanceLifetimeStats: {},
      vpackEvents: [],
      totalInstancesCreated: 0
    };
  }

  private load(): StatsSchema {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        return {
          sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
          instanceLifetimeStats: parsed.instanceLifetimeStats || {},
          vpackEvents: Array.isArray(parsed.vpackEvents) ? parsed.vpackEvents : [],
          totalInstancesCreated: typeof parsed.totalInstancesCreated === 'number' ? parsed.totalInstancesCreated : 0
        };
      }
    } catch (e) {
      console.error('Failed to load stats data, initializing defaults', e);
    }
    const def = this.getDefaultData();
    this.save(def);
    return def;
  }

  public save(dataToSave?: StatsSchema): void {
    if (dataToSave) this.data = dataToSave;
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (e) {
      console.error('Failed to save stats data', e);
    }
  }

  /**
   * If the application terminated unexpectedly during a run, mark lingering
   * 'running' sessions as 'crashed' and compute duration safely.
   */
  private recoverActiveSessions(): void {
    let changed = false;
    const now = Date.now();
    for (const s of this.data.sessions) {
      if (s.status === 'running') {
        s.status = 'crashed';
        const start = new Date(s.startedAt).getTime();
        // If start is valid, estimate duration or cap at 1 minute if unknown
        if (!Number.isNaN(start) && start <= now) {
          s.durationMs = Math.min(Math.max(0, s.durationMs || 0), 300_000);
        } else {
          s.durationMs = 0;
        }
        s.endedAt = new Date(start + s.durationMs).toISOString();
        changed = true;
      }
    }
    if (changed) {
      this.save();
    }
  }

  public startSession(params: {
    instanceId: string;
    instanceName: string;
    minecraftVersion: string;
    loaderType: LoaderType;
  }): PlaySession {
    const session: PlaySession = {
      sessionId: crypto.randomUUID(),
      instanceId: params.instanceId,
      instanceName: params.instanceName,
      minecraftVersion: params.minecraftVersion,
      loaderType: params.loaderType,
      startedAt: new Date().toISOString(),
      endedAt: null,
      durationMs: 0,
      status: 'running'
    };

    this.data.sessions.push(session);
    // Keep max 2,000 historical session records
    if (this.data.sessions.length > 2000) {
      this.data.sessions = this.data.sessions.slice(-2000);
    }

    if (!this.data.instanceLifetimeStats[params.instanceId]) {
      this.data.instanceLifetimeStats[params.instanceId] = {
        totalPlaytimeMs: 0,
        sessionCount: 0,
        createdAt: session.startedAt
      };
    }
    this.data.instanceLifetimeStats[params.instanceId].sessionCount += 1;

    this.save();
    return session;
  }

  public endSession(
    sessionId: string,
    status: 'completed' | 'crashed' | 'failed' = 'completed'
  ): PlaySession | null {
    const session = this.data.sessions.find(s => s.sessionId === sessionId);
    if (!session) return null;

    if (session.status !== 'running' && session.endedAt) {
      return session; // Already ended
    }

    const now = new Date();
    session.endedAt = now.toISOString();
    session.status = status;

    const start = new Date(session.startedAt).getTime();
    const end = now.getTime();
    const elapsed = Math.max(0, end - start);

    // Only count playtime for completed or crashed sessions that actually ran (status != failed launch)
    if (status !== 'failed') {
      session.durationMs = elapsed;
      if (!this.data.instanceLifetimeStats[session.instanceId]) {
        this.data.instanceLifetimeStats[session.instanceId] = {
          totalPlaytimeMs: 0,
          sessionCount: 1,
          createdAt: session.startedAt
        };
      }
      this.data.instanceLifetimeStats[session.instanceId].totalPlaytimeMs += elapsed;
    } else {
      session.durationMs = 0;
    }

    this.save();
    return session;
  }

  public recordInstanceCreated(instanceId: string): void {
    this.data.totalInstancesCreated += 1;
    if (!this.data.instanceLifetimeStats[instanceId]) {
      this.data.instanceLifetimeStats[instanceId] = {
        totalPlaytimeMs: 0,
        sessionCount: 0,
        createdAt: new Date().toISOString()
      };
    }
    this.save();
  }

  public recordInstanceDeleted(instanceId: string): void {
    if (this.data.instanceLifetimeStats[instanceId]) {
      this.data.instanceLifetimeStats[instanceId].deletedAt = new Date().toISOString();
      this.save();
    }
  }

  public recordVPackEvent(type: 'import' | 'export', packName?: string, packId?: string): void {
    this.data.vpackEvents.push({
      type,
      packId,
      packName,
      timestamp: new Date().toISOString()
    });
    if (this.data.vpackEvents.length > 500) {
      this.data.vpackEvents = this.data.vpackEvents.slice(-500);
    }
    this.save();
  }

  public getInstancePlaytime(instanceId: string): number {
    return this.data.instanceLifetimeStats[instanceId]?.totalPlaytimeMs || 0;
  }

  public getAllSessions(): PlaySession[] {
    return [...this.data.sessions];
  }

  public getVPackEvents(): { type: 'import' | 'export'; packId?: string; packName?: string; timestamp: string }[] {
    return [...this.data.vpackEvents];
  }

  public resetToDefaults(): void {
    this.data = this.getDefaultData();
    this.save();
  }

  public formatDuration(ms: number): string {
    if (!ms || ms <= 0) return '0 hrs';
    const hours = ms / (1000 * 60 * 60);
    if (hours < 0.1) {
      const mins = Math.max(1, Math.round(ms / (1000 * 60)));
      return `${mins} min${mins === 1 ? '' : 's'}`;
    }
    return `${hours.toFixed(1)} hrs`;
  }

  public async getWrappedStats(
    period: 'lifetime' | number = 'lifetime',
    playerStore?: PlayerDataStore
  ): Promise<WrappedStats> {
    const pStore = playerStore || PlayerDataStore.getInstance();
    const wallet = pStore.getWallet();
    const transactions = pStore.getTransactions();
    const achEngine = new AchievementEngine(pStore);
    const definitions = achEngine.getDefinitions();
    const progressList = achEngine.getProgressList();
    const ownedCosmetics = pStore.getOwnedCosmetics();
    const profile = pStore.getProfile();
    const cosmeticCatalogue = CosmeticCatalogue.getAll();

    // Filter sessions by period if specific year
    let filteredSessions = this.data.sessions.filter(s => s.status !== 'failed');
    let filteredTxs = transactions;
    let filteredVPack = this.data.vpackEvents;

    if (typeof period === 'number') {
      const year = period;
      filteredSessions = filteredSessions.filter(s => {
        const d = new Date(s.startedAt);
        return d.getFullYear() === year;
      });
      filteredTxs = filteredTxs.filter(tx => {
        const d = new Date(tx.timestamp);
        return d.getFullYear() === year;
      });
      filteredVPack = filteredVPack.filter(v => {
        const d = new Date(v.timestamp);
        return d.getFullYear() === year;
      });
    }

    // Playtime aggregation
    const playtimeByInstance = new Map<string, {
      name: string;
      version: string;
      loader: LoaderType;
      playtimeMs: number;
      sessionCount: number;
      lastPlayedAt: string | null;
    }>();

    let totalPlaytimeMs = 0;
    const versionCounts: Record<string, number> = {};
    const loaderCounts: Record<string, number> = {};

    for (const session of filteredSessions) {
      const duration = session.durationMs || 0;
      totalPlaytimeMs += duration;

      const existing = playtimeByInstance.get(session.instanceId) || {
        name: session.instanceName,
        version: session.minecraftVersion,
        loader: session.loaderType,
        playtimeMs: 0,
        sessionCount: 0,
        lastPlayedAt: session.startedAt
      };
      existing.playtimeMs += duration;
      existing.sessionCount += 1;
      if (!existing.lastPlayedAt || new Date(session.startedAt) > new Date(existing.lastPlayedAt)) {
        existing.lastPlayedAt = session.startedAt;
      }
      playtimeByInstance.set(session.instanceId, existing);

      // Version and loader tallies
      if (session.minecraftVersion) {
        versionCounts[session.minecraftVersion] = (versionCounts[session.minecraftVersion] || 0) + 1;
      }
      if (session.loaderType) {
        loaderCounts[session.loaderType] = (loaderCounts[session.loaderType] || 0) + 1;
      }
    }

    // Also include any currently installed instances in instancesPlaytime even if 0 playtime
    try {
      const liveInstances = await InstanceManager.listInstances();
      for (const inst of liveInstances) {
        if (!playtimeByInstance.has(inst.id)) {
          const lifetime = this.data.instanceLifetimeStats[inst.id];
          const pt = period === 'lifetime' ? (inst.totalPlaytimeMs || lifetime?.totalPlaytimeMs || 0) : 0;
          playtimeByInstance.set(inst.id, {
            name: inst.name,
            version: inst.minecraft?.version || '1.21.1',
            loader: inst.loader?.type || 'fabric',
            playtimeMs: pt,
            sessionCount: lifetime?.sessionCount || 0,
            lastPlayedAt: inst.lastPlayedAt || null
          });
        }
      }
    } catch {
      // Best-effort in headless test environments
    }

    const instancesPlaytimeList: InstanceStatsSummary[] = Array.from(playtimeByInstance.entries()).map(
      ([id, val]) => ({
        instanceId: id,
        name: val.name,
        minecraftVersion: val.version,
        loaderType: val.loader,
        totalPlaytimeMs: val.playtimeMs,
        sessionCount: val.sessionCount,
        lastPlayedAt: val.lastPlayedAt
      })
    ).sort((a, b) => b.totalPlaytimeMs - a.totalPlaytimeMs);

    // Most and least played (among instances with some recorded playtime)
    const activeInstances = instancesPlaytimeList.filter(i => i.totalPlaytimeMs > 0);
    const mostPlayed = activeInstances.length > 0 ? {
      id: activeInstances[0].instanceId,
      name: activeInstances[0].name,
      playtimeMs: activeInstances[0].totalPlaytimeMs,
      formattedPlaytime: this.formatDuration(activeInstances[0].totalPlaytimeMs)
    } : null;

    const leastPlayed = activeInstances.length > 0 ? {
      id: activeInstances[activeInstances.length - 1].instanceId,
      name: activeInstances[activeInstances.length - 1].name,
      playtimeMs: activeInstances[activeInstances.length - 1].totalPlaytimeMs,
      formattedPlaytime: this.formatDuration(activeInstances[activeInstances.length - 1].totalPlaytimeMs)
    } : null;

    // Most used version and loader
    const mostUsedVersion = Object.entries(versionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    const mostUsedLoader = Object.entries(loaderCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    // Economy
    let totalVpEarned = 0;
    let totalVpSpent = 0;
    let mostExpensiveCosmetic: { name: string; price: number } | null = null;

    for (const tx of filteredTxs) {
      if (tx.type === 'earn') {
        totalVpEarned += tx.amount;
      } else if (tx.type === 'spend') {
        totalVpSpent += tx.amount;
        if (!mostExpensiveCosmetic || tx.amount > mostExpensiveCosmetic.price) {
          mostExpensiveCosmetic = {
            name: tx.reason.replace(/^Purchased:\s*/i, ''),
            price: tx.amount
          };
        }
      }
    }

    // Achievements calculation & Hardest Unlocked Achievement
    const progressMap = new Map(progressList.map(p => [p.achievementId, p]));
    let unlockedAchievements: { def: any; prog: any }[] = [];
    const categoryBreakdown: Record<string, { unlocked: number; total: number }> = {};

    for (const def of definitions) {
      if (!categoryBreakdown[def.category]) {
        categoryBreakdown[def.category] = { unlocked: 0, total: 0 };
      }
      categoryBreakdown[def.category].total += 1;

      const prog = progressMap.get(def.id);
      if (prog && prog.unlocked) {
        // If year-specific, check unlock timestamp
        if (typeof period === 'number') {
          const unlockedYear = prog.unlockedAt ? new Date(prog.unlockedAt).getFullYear() : null;
          if (unlockedYear === period) {
            categoryBreakdown[def.category].unlocked += 1;
            unlockedAchievements.push({ def, prog });
          }
        } else {
          categoryBreakdown[def.category].unlocked += 1;
          unlockedAchievements.push({ def, prog });
        }
      }
    }

    // Hardest achievement selection logic:
    // 1. Consider only genuinely unlocked achievements.
    // 2. Find highest numerical difficulty score (1-10).
    // 3. Tie-breaker: earliest unlock timestamp.
    unlockedAchievements.sort((a, b) => {
      if (b.def.difficulty !== a.def.difficulty) {
        return b.def.difficulty - a.def.difficulty;
      }
      const timeA = a.prog.unlockedAt ? new Date(a.prog.unlockedAt).getTime() : Number.MAX_SAFE_INTEGER;
      const timeB = b.prog.unlockedAt ? new Date(b.prog.unlockedAt).getTime() : Number.MAX_SAFE_INTEGER;
      return timeA - timeB;
    });

    const hardest = unlockedAchievements.length > 0 ? {
      id: unlockedAchievements[0].def.id,
      name: unlockedAchievements[0].def.name,
      difficulty: unlockedAchievements[0].def.difficulty,
      difficultyRank: unlockedAchievements[0].def.difficultyRank,
      category: unlockedAchievements[0].def.category,
      rarity: unlockedAchievements[0].def.rarity,
      icon: unlockedAchievements[0].def.icon,
      unlockedAt: unlockedAchievements[0].prog.unlockedAt,
      description: unlockedAchievements[0].def.description
    } : null;

    // Collection
    const favoriteEquipped = profile.equippedCosmeticId
      ? cosmeticCatalogue.find(c => c.id === profile.equippedCosmeticId)
      : null;

    const vpacksImported = filteredVPack.filter(v => v.type === 'import').length;
    const vpacksExported = filteredVPack.filter(v => v.type === 'export').length;

    return {
      period,
      totalPlaytimeMs,
      formattedPlaytime: this.formatDuration(totalPlaytimeMs),
      totalSessions: filteredSessions.length,
      mostPlayedInstance: mostPlayed,
      leastPlayedInstance: leastPlayed,
      instancesPlaytime: instancesPlaytimeList,
      totalInstancesCreated: this.data.totalInstancesCreated || instancesPlaytimeList.length,
      mostUsedVersion,
      mostUsedLoader,
      economy: {
        totalVpEarned: period === 'lifetime' ? wallet.lifetimeEarned : totalVpEarned,
        totalVpSpent: period === 'lifetime' ? wallet.lifetimeSpent : totalVpSpent,
        currentBalance: wallet.balance,
        mostExpensiveCosmetic
      },
      achievements: {
        totalUnlocked: unlockedAchievements.length,
        totalAvailable: definitions.length,
        completionPercentage: definitions.length > 0
          ? Math.round((unlockedAchievements.length / definitions.length) * 100)
          : 0,
        hardestAchievement: hardest,
        categoryBreakdown
      },
      collection: {
        totalOwnedCosmetics: ownedCosmetics.length,
        totalAvailableCosmetics: cosmeticCatalogue.length,
        completionPercentage: cosmeticCatalogue.length > 0
          ? Math.round((ownedCosmetics.length / cosmeticCatalogue.length) * 100)
          : 0,
        favoriteEquipped: favoriteEquipped ? {
          id: favoriteEquipped.id,
          name: favoriteEquipped.name,
          artworkPath: favoriteEquipped.artworkPath
        } : null,
        vpacksImported,
        vpacksExported
      },
      generatedAt: new Date().toISOString()
    };
  }
}
