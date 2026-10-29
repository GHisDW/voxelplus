import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import {
  StockerRunResult,
  StockerSaveData,
  CookieClickerSaveData,
  ArcadeRewardResult
} from '../../types';
import { PlayerDataStore } from '../player/playerDataStore';
import { AchievementEngine } from '../player/achievementEngine';

export class ArcadeStore {
  private static instance: ArcadeStore | null = null;
  private filePath: string;
  private stockerData: StockerSaveData;
  private cookieData: CookieClickerSaveData;
  private playerStore: PlayerDataStore;
  private achievementEngine: AchievementEngine;

  constructor(customPath?: string, playerStore?: PlayerDataStore) {
    if (customPath) {
      this.filePath = customPath;
    } else {
      const userDataDir = app ? app.getPath('userData') : path.join(process.cwd(), '.voxelplus');
      this.filePath = path.join(userDataDir, 'arcade-data.json');
    }
    this.playerStore = playerStore || PlayerDataStore.getInstance();
    this.achievementEngine = new AchievementEngine(this.playerStore);

    const loaded = this.load();
    this.stockerData = loaded.stocker;
    this.cookieData = loaded.cookie;
  }

  public static getInstance(): ArcadeStore {
    if (!ArcadeStore.instance) {
      ArcadeStore.instance = new ArcadeStore();
    }
    return ArcadeStore.instance;
  }

  private getDefaultStocker(): StockerSaveData {
    return {
      bestScore: 0,
      bestScoreWave: 0,
      bestScoreShip: 0,
      totalRuns: 0,
      totalDistance: 0,
      totalObstaclesCleared: 0,
      lastRunTimestamp: null
    };
  }

  private getDefaultCookie(): CookieClickerSaveData {
    return {
      cookies: 0,
      lifetimeCookies: 0,
      cookiesPerClick: 1,
      cookiesPerSecond: 0,
      upgrades: {},
      producers: {},
      milestonesClaimed: [],
      lastTickTimestamp: new Date().toISOString(),
      totalClicks: 0,
      totalTimePlayedMs: 0
    };
  }

  private load(): { stocker: StockerSaveData; cookie: CookieClickerSaveData } {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        return {
          stocker: { ...this.getDefaultStocker(), ...(parsed.stocker || {}) },
          cookie: { ...this.getDefaultCookie(), ...(parsed.cookie || {}) }
        };
      }
    } catch (e) {
      console.error('Failed to load arcade data, initializing defaults', e);
    }
    const def = { stocker: this.getDefaultStocker(), cookie: this.getDefaultCookie() };
    this.save(def.stocker, def.cookie);
    return def;
  }

  public save(stockerToSave?: StockerSaveData, cookieToSave?: CookieClickerSaveData): void {
    if (stockerToSave) this.stockerData = stockerToSave;
    if (cookieToSave) this.cookieData = cookieToSave;
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        this.filePath,
        JSON.stringify({ stocker: this.stockerData, cookie: this.cookieData }, null, 2),
        'utf-8'
      );
    } catch (e) {
      console.error('Failed to save arcade data', e);
    }
  }

  public getStockerData(): StockerSaveData {
    return { ...this.stockerData };
  }

  public recordStockerRun(run: StockerRunResult): ArcadeRewardResult {
    // The renderer supplies this payload, so never trust its numbers: a NaN,
    // Infinity or negative score used to poison the saved totals and the VP
    // ledger permanently. Clamp to sane, non-negative integers instead.
    const score = sanitizeCount(run?.score, 10_000_000);
    const distance = sanitizeCount(run?.distance, 100_000_000);
    const obstaclesCleared = sanitizeCount(run?.obstaclesCleared, 10_000_000);
    const mode: 'classic' | 'wave' | 'ship' = run?.mode === 'wave' || run?.mode === 'ship' ? run.mode : 'classic';
    const timestamp = typeof run?.timestamp === 'string' && !Number.isNaN(Date.parse(run.timestamp))
      ? run.timestamp
      : new Date().toISOString();

    this.stockerData.totalRuns = sanitizeCount(this.stockerData.totalRuns + 1, 1_000_000_000);
    this.stockerData.totalDistance = sanitizeCount(this.stockerData.totalDistance + distance, 1_000_000_000);
    this.stockerData.totalObstaclesCleared = sanitizeCount(this.stockerData.totalObstaclesCleared + obstaclesCleared, 1_000_000_000);
    this.stockerData.lastRunTimestamp = timestamp;

    if (score > this.stockerData.bestScore) {
      this.stockerData.bestScore = score;
    }
    if (mode === 'wave' && score > this.stockerData.bestScoreWave) {
      this.stockerData.bestScoreWave = score;
    }
    if (mode === 'ship' && score > this.stockerData.bestScoreShip) {
      this.stockerData.bestScoreShip = score;
    }
    this.save();

    // Calculate reward VP (1 VP per 25 points, minimum 5 on finish)
    const vpEarned = Math.max(5, Math.floor(score / 25));
    const tx = this.playerStore.addTransaction('earn', vpEarned, `Stocker Run (${mode}) - Score ${score}`);

    // Trigger achievements
    const newAchievements: string[] = [];
    const r1 = this.achievementEngine.trackProgress('stocker_first_run', 1);
    if (r1.unlockedNow) newAchievements.push('stocker_first_run');

    const r2 = this.achievementEngine.trackProgress('stocker_1000', score, true);
    if (r2.unlockedNow) newAchievements.push('stocker_1000');

    const r3 = this.achievementEngine.trackProgress('stocker_5000', score, true);
    if (r3.unlockedNow) newAchievements.push('stocker_5000');

    const r4 = this.achievementEngine.trackProgress('stocker_marathon', this.stockerData.totalRuns, true);
    if (r4.unlockedNow) newAchievements.push('stocker_marathon');

    const r5 = this.achievementEngine.trackProgress('stocker_distance', this.stockerData.totalDistance, true);
    if (r5.unlockedNow) newAchievements.push('stocker_distance');

    return {
      vpEarned,
      newAchievements,
      transactionId: tx.transaction?.id || null
    };
  }

  public getCookieData(): CookieClickerSaveData {
    return { ...this.cookieData };
  }

  public saveCookieData(data: CookieClickerSaveData): ArcadeRewardResult {
    const prevLifetime = this.cookieData.lifetimeCookies;
    this.cookieData = sanitizeCookieSave(data, this.cookieData);
    this.save();

    const newAchievements: string[] = [];
    let vpEarned = 0;

    const sanitized = this.cookieData;

    if (sanitized.lifetimeCookies >= 1) {
      const a = this.achievementEngine.trackProgress('cookie_first', 1);
      if (a.unlockedNow) newAchievements.push('cookie_first');
    }
    if (sanitized.lifetimeCookies >= 1000) {
      const b = this.achievementEngine.trackProgress('cookie_1000', sanitized.lifetimeCookies, true);
      if (b.unlockedNow) newAchievements.push('cookie_1000');
    }
    if (sanitized.lifetimeCookies >= 100000) {
      const c = this.achievementEngine.trackProgress('cookie_100000', sanitized.lifetimeCookies, true);
      if (c.unlockedNow) newAchievements.push('cookie_100000');
    }
    if (sanitized.lifetimeCookies >= 1000000) {
      const d = this.achievementEngine.trackProgress('cookie_million', sanitized.lifetimeCookies, true);
      if (d.unlockedNow) newAchievements.push('cookie_million');
    }
    if (sanitized.totalClicks >= 1000) {
      const e = this.achievementEngine.trackProgress('cookie_clicker', sanitized.totalClicks, true);
      if (e.unlockedNow) newAchievements.push('cookie_clicker');
    }

    // Count total upgrades purchased
    const totalUpgrades = Object.values(sanitized.upgrades).reduce((sum, count) => sum + count, 0);
    if (totalUpgrades >= 5) {
      const f = this.achievementEngine.trackProgress('cookie_upgrader', totalUpgrades, true);
      if (f.unlockedNow) newAchievements.push('cookie_upgrader');
    }

    // Award VP for every 5,000 lifetime cookies milestone
    const prevMilestone = Math.floor(prevLifetime / 5000);
    const currMilestone = Math.floor(sanitized.lifetimeCookies / 5000);
    if (currMilestone > prevMilestone) {
      vpEarned = (currMilestone - prevMilestone) * 50;
      this.playerStore.addTransaction('earn', vpEarned, `Cookie Milestone (${currMilestone * 5000} cookies)`);
    }

    return {
      vpEarned,
      newAchievements,
      transactionId: null
    };
  }

  public resetToDefaults(): void {
    this.stockerData = this.getDefaultStocker();
    this.cookieData = this.getDefaultCookie();
    this.save();
  }
}

/** Clamps an untrusted numeric input to a non-negative integer. */
function sanitizeCount(value: unknown, max: number): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.min(Math.floor(numeric), max);
}

/**
 * Normalises a CookieClicker save coming from the renderer. Keeps the lifetime
 * counter monotonic so a corrupt/forged payload can neither rewind progress nor
 * inject NaN into the VP ledger, and drops unknown upgrade/producer keys.
 */
function sanitizeCookieSave(data: CookieClickerSaveData, previous: CookieClickerSaveData): CookieClickerSaveData {
  const counterMap = (source: unknown): Record<string, number> => {
    if (!source || typeof source !== 'object') return {};
    const result: Record<string, number> = {};
    for (const [key, raw] of Object.entries(source as Record<string, unknown>)) {
      if (typeof key !== 'string' || key.length === 0 || key.length > 64) continue;
      result[key] = sanitizeCount(raw, 1_000_000_000);
    }
    return result;
  };

  const lifetimeCookies = Math.max(
    sanitizeCount(data?.lifetimeCookies, Number.MAX_SAFE_INTEGER),
    sanitizeCount(previous.lifetimeCookies, Number.MAX_SAFE_INTEGER)
  );
  const cookies = sanitizeCount(data?.cookies, Number.MAX_SAFE_INTEGER);
  const milestones = Array.isArray(data?.milestonesClaimed)
    ? data.milestonesClaimed
        .filter((m): m is number => typeof m === 'number' && Number.isFinite(m) && m >= 0)
        .slice(0, 200)
    : [];

  return {
    cookies,
    lifetimeCookies,
    cookiesPerClick: Math.max(1, sanitizeCount(data?.cookiesPerClick, 1_000_000)),
    cookiesPerSecond: sanitizeCount(data?.cookiesPerSecond, 1_000_000_000),
    upgrades: counterMap(data?.upgrades),
    producers: counterMap(data?.producers),
    milestonesClaimed: milestones,
    lastTickTimestamp: typeof data?.lastTickTimestamp === 'string' && !Number.isNaN(Date.parse(data.lastTickTimestamp))
      ? data.lastTickTimestamp
      : new Date().toISOString(),
    totalClicks: sanitizeCount(data?.totalClicks, 1_000_000_000),
    totalTimePlayedMs: sanitizeCount(data?.totalTimePlayedMs, 1_000_000_000_000)
  };
}
