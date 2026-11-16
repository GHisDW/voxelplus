import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { AchievementEngine } from '../electron/backend/player/achievementEngine';
import { PlayerDataStore } from '../electron/backend/player/playerDataStore';

describe('Achievement Engine Overhaul', () => {
  let tmpDir: string;
  let playerFile: string;
  let store: PlayerDataStore;
  let engine: AchievementEngine;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'voxel-ach-test-'));
    playerFile = path.join(tmpDir, 'player.json');
    store = new PlayerDataStore(playerFile);
    engine = new AchievementEngine(store);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('assigns every achievement an integer difficulty score from 1 to 10 and a valid difficulty rank', () => {
    const definitions = engine.getDefinitions();
    expect(definitions.length).toBeGreaterThan(0);

    const validRanks = [
      'Trivial',
      'Very Easy',
      'Easy',
      'Moderate',
      'Challenging',
      'Hard',
      'Very Hard',
      'Extreme',
      'Legendary',
      'Ultimate'
    ];

    const rankMap: Record<number, string> = {
      1: 'Trivial',
      2: 'Very Easy',
      3: 'Easy',
      4: 'Moderate',
      5: 'Challenging',
      6: 'Hard',
      7: 'Very Hard',
      8: 'Extreme',
      9: 'Legendary',
      10: 'Ultimate'
    };

    for (const def of definitions) {
      expect(Number.isInteger(def.difficulty)).toBe(true);
      expect(def.difficulty).toBeGreaterThanOrEqual(1);
      expect(def.difficulty).toBeLessThanOrEqual(10);
      expect(validRanks).toContain(def.difficultyRank);
      // Verify exact 1-to-1 match between score and rank
      expect(def.difficultyRank).toBe(rankMap[def.difficulty]);
      expect(def.category).not.toBe('stocker');
      expect(def.id).not.toContain('stocker');
    }
  });

  it('has removed all Stocker achievements from definition catalogue', () => {
    const definitions = engine.getDefinitions();
    const stockerDefs = definitions.filter(d => (d.category as any) === 'stocker' || d.id.startsWith('stocker_'));
    expect(stockerDefs).toHaveLength(0);
  });

  it('safely migrates and purges legacy Stocker achievements from existing player data', () => {
    // Write a mock save with legacy stocker achievements
    const legacyData = {
      profile: store.getProfile(),
      wallet: store.getWallet(),
      transactions: [],
      achievements: {
        'first_instance': {
          achievementId: 'first_instance',
          currentValue: 1,
          unlocked: true,
          unlockedAt: new Date().toISOString(),
          rewardClaimed: true,
          stagesClaimed: []
        },
        'stocker_first_run': {
          achievementId: 'stocker_first_run',
          currentValue: 1,
          unlocked: true,
          unlockedAt: new Date().toISOString(),
          rewardClaimed: true,
          stagesClaimed: []
        },
        'stocker_5000': {
          achievementId: 'stocker_5000',
          currentValue: 5000,
          unlocked: true,
          unlockedAt: new Date().toISOString(),
          rewardClaimed: true,
          stagesClaimed: []
        }
      },
      cosmetics: {},
      vpacks: {},
      _starterBonusGranted: true
    };

    fs.writeFileSync(playerFile, JSON.stringify(legacyData, null, 2), 'utf-8');

    // Reload store
    const reloadedStore = new PlayerDataStore(playerFile);
    const achievements = reloadedStore.getAchievements();

    expect(achievements['first_instance']).toBeDefined();
    expect(achievements['stocker_first_run']).toBeUndefined();
    expect(achievements['stocker_5000']).toBeUndefined();
  });

  it('prevents duplicate unlock and reward claims', () => {
    const r1 = engine.trackProgress('first_instance', 1);
    expect(r1.unlockedNow).toBe(true);
    expect(r1.rewardVP).toBe(50);

    const balanceAfterFirst = store.getWallet().balance;

    const r2 = engine.trackProgress('first_instance', 1);
    expect(r2.unlockedNow).toBe(false);
    expect(r2.rewardVP).toBe(0);
    expect(store.getWallet().balance).toBe(balanceAfterFirst);
  });
});
