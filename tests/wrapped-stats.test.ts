import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { StatsStore } from '../electron/backend/stats/statsStore';
import { PlayerDataStore } from '../electron/backend/player/playerDataStore';
import { AchievementEngine } from '../electron/backend/player/achievementEngine';

describe('Voxel⁺ Wrapped Hardest Achievement Selection and Data Integrity', () => {
  let tmpDir: string;
  let statsFile: string;
  let playerFile: string;
  let statsStore: StatsStore;
  let playerStore: PlayerDataStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'voxel-wrapped-test-'));
    statsFile = path.join(tmpDir, 'stats.json');
    playerFile = path.join(tmpDir, 'player.json');
    statsStore = new StatsStore(statsFile);
    playerStore = new PlayerDataStore(playerFile);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('identifies hardest achievement by score and breaks ties by earliest unlock date', async () => {
    const engine = new AchievementEngine(playerStore);

    // Unlock achievement with difficulty 2: first_instance
    playerStore.saveAchievementProgress({
      achievementId: 'first_instance',
      currentValue: 1,
      unlocked: true,
      unlockedAt: '2025-01-10T10:00:00Z',
      rewardClaimed: true,
      stagesClaimed: []
    });

    // Unlock two achievements sharing difficulty 6:
    // vpack_collector unlocked earlier
    playerStore.saveAchievementProgress({
      achievementId: 'vpack_collector',
      currentValue: 5,
      unlocked: true,
      unlockedAt: '2025-01-15T12:00:00Z',
      rewardClaimed: true,
      stagesClaimed: []
    });

    // loader_expert unlocked later
    playerStore.saveAchievementProgress({
      achievementId: 'loader_expert',
      currentValue: 3,
      unlocked: true,
      unlockedAt: '2025-02-01T15:00:00Z',
      rewardClaimed: true,
      stagesClaimed: []
    });

    const stats = await statsStore.getWrappedStats('lifetime', playerStore);
    expect(stats.achievements.hardestAchievement).not.toBeNull();
    expect(stats.achievements.hardestAchievement?.id).toBe('vpack_collector');
    expect(stats.achievements.hardestAchievement?.difficulty).toBe(6);
    expect(stats.achievements.hardestAchievement?.difficultyRank).toBe('Hard');
  });

  it('selects higher difficulty achievement when available regardless of rarity', async () => {
    // Unlock difficulty 8 (mod_master)
    playerStore.saveAchievementProgress({
      achievementId: 'mod_master',
      currentValue: 50,
      unlocked: true,
      unlockedAt: '2025-03-01T10:00:00Z',
      rewardClaimed: true,
      stagesClaimed: []
    });

    const stats = await statsStore.getWrappedStats('lifetime', playerStore);
    expect(stats.achievements.hardestAchievement?.id).toBe('mod_master');
    expect(stats.achievements.hardestAchievement?.difficulty).toBe(8);
    expect(stats.achievements.hardestAchievement?.difficultyRank).toBe('Extreme');
  });

  it('handles empty states gracefully when no achievements are unlocked', async () => {
    const stats = await statsStore.getWrappedStats('lifetime', playerStore);
    expect(stats.achievements.totalUnlocked).toBe(0);
    expect(stats.achievements.hardestAchievement).toBeNull();
  });
});
