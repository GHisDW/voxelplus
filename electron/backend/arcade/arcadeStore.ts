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
    this.stockerData.totalRuns += 1;
    this.stockerData.totalDistance += run.distance;
    this.stockerData.totalObstaclesCleared += run.obstaclesCleared;
    this.stockerData.lastRunTimestamp = run.timestamp;

    if (run.score > this.stockerData.bestScore) {
      this.stockerData.bestScore = run.score;
    }
    if (run.mode === 'wave' && run.score > this.stockerData.bestScoreWave) {
      this.stockerData.bestScoreWave = run.score;
    }
    if (run.mode === 'ship' && run.score > this.stockerData.bestScoreShip) {
      this.stockerData.bestScoreShip = run.score;
    }
    this.save();

    // Calculate reward VP (1 VP per 25 points, minimum 5 on finish)
    const vpEarned = Math.max(5, Math.floor(run.score / 25));
    const tx = this.playerStore.addTransaction('earn', vpEarned, `Stocker Run (${run.mode}) - Score ${run.score}`);

    // Trigger achievements
    const newAchievements: string[] = [];
    const r1 = this.achievementEngine.trackProgress('stocker_first_run', 1);
    if (r1.unlockedNow) newAchievements.push('stocker_first_run');

    const r2 = this.achievementEngine.trackProgress('stocker_1000', run.score, true);
    if (r2.unlockedNow) newAchievements.push('stocker_1000');

    const r3 = this.achievementEngine.trackProgress('stocker_5000', run.score, true);
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
    this.cookieData = { ...data };
    this.save();

    const newAchievements: string[] = [];
    let vpEarned = 0;

    if (data.lifetimeCookies >= 1) {
      const a = this.achievementEngine.trackProgress('cookie_first', 1);
      if (a.unlockedNow) newAchievements.push('cookie_first');
    }
    if (data.lifetimeCookies >= 1000) {
      const b = this.achievementEngine.trackProgress('cookie_1000', data.lifetimeCookies, true);
      if (b.unlockedNow) newAchievements.push('cookie_1000');
    }
    if (data.lifetimeCookies >= 100000) {
      const c = this.achievementEngine.trackProgress('cookie_100000', data.lifetimeCookies, true);
      if (c.unlockedNow) newAchievements.push('cookie_100000');
    }
    if (data.lifetimeCookies >= 1000000) {
      const d = this.achievementEngine.trackProgress('cookie_million', data.lifetimeCookies, true);
      if (d.unlockedNow) newAchievements.push('cookie_million');
    }
    if (data.totalClicks >= 1000) {
      const e = this.achievementEngine.trackProgress('cookie_clicker', data.totalClicks, true);
      if (e.unlockedNow) newAchievements.push('cookie_clicker');
    }

    // Count total upgrades purchased
    const totalUpgrades = Object.values(data.upgrades).reduce((sum, count) => sum + count, 0);
    if (totalUpgrades >= 5) {
      const f = this.achievementEngine.trackProgress('cookie_upgrader', totalUpgrades, true);
      if (f.unlockedNow) newAchievements.push('cookie_upgrader');
    }

    // Award VP for every 5,000 lifetime cookies milestone
    const prevMilestone = Math.floor(prevLifetime / 5000);
    const currMilestone = Math.floor(data.lifetimeCookies / 5000);
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
