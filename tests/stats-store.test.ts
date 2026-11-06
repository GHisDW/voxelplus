import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { StatsStore } from '../electron/backend/stats/statsStore';
import { PlayerDataStore } from '../electron/backend/player/playerDataStore';

describe('StatsStore', () => {
  let tmpDir: string;
  let statsFile: string;
  let playerFile: string;
  let statsStore: StatsStore;
  let playerStore: PlayerDataStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'voxel-stats-test-'));
    statsFile = path.join(tmpDir, 'stats.json');
    playerFile = path.join(tmpDir, 'player.json');
    statsStore = new StatsStore(statsFile);
    playerStore = new PlayerDataStore(playerFile);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('records session start, end, and computes session duration accurately', () => {
    const session = statsStore.startSession({
      instanceId: 'inst-1',
      instanceName: 'Survival World',
      minecraftVersion: '1.21.1',
      loaderType: 'fabric'
    });

    expect(session.status).toBe('running');
    expect(session.sessionId).toBeDefined();

    // End session
    const ended = statsStore.endSession(session.sessionId, 'completed');
    expect(ended).not.toBeNull();
    expect(ended?.status).toBe('completed');
    expect(ended?.endedAt).toBeDefined();
    expect(ended?.durationMs).toBeGreaterThanOrEqual(0);

    const instancePlaytime = statsStore.getInstancePlaytime('inst-1');
    expect(instancePlaytime).toBe(ended?.durationMs);
  });

  it('does not count failed launches as completed play sessions or playtime', () => {
    const session = statsStore.startSession({
      instanceId: 'inst-failed',
      instanceName: 'Broken Instance',
      minecraftVersion: '1.20.1',
      loaderType: 'forge'
    });

    const ended = statsStore.endSession(session.sessionId, 'failed');
    expect(ended?.status).toBe('failed');
    expect(ended?.durationMs).toBe(0);
    expect(statsStore.getInstancePlaytime('inst-failed')).toBe(0);
  });

  it('aggregates lifetime and annual Wrapped statistics correctly', async () => {
    // Add sessions in 2024 and 2025
    const s1 = statsStore.startSession({
      instanceId: 'inst-1',
      instanceName: 'Old World',
      minecraftVersion: '1.20.1',
      loaderType: 'forge'
    });
    s1.startedAt = new Date('2024-05-01T12:00:00Z').toISOString();
    s1.durationMs = 3600000; // 1 hour
    s1.endedAt = new Date('2024-05-01T13:00:00Z').toISOString();
    s1.status = 'completed';

    const s2 = statsStore.startSession({
      instanceId: 'inst-2',
      instanceName: 'Modern World',
      minecraftVersion: '1.21.1',
      loaderType: 'fabric'
    });
    s2.startedAt = new Date('2025-02-01T12:00:00Z').toISOString();
    s2.durationMs = 7200000; // 2 hours
    s2.endedAt = new Date('2025-02-01T14:00:00Z').toISOString();
    s2.status = 'completed';

    // Add transactions in player store
    playerStore.addTransaction('earn', 500, 'Quest reward');
    playerStore.addTransaction('spend', 200, 'Purchased: Emerald Crown');

    statsStore.save();

    const lifetimeStats = await statsStore.getWrappedStats('lifetime', playerStore);
    expect(lifetimeStats.totalPlaytimeMs).toBe(10800000);
    expect(lifetimeStats.totalSessions).toBe(2);
    expect(lifetimeStats.mostPlayedInstance?.name).toBe('Modern World');

    const yearStats2024 = await statsStore.getWrappedStats(2024, playerStore);
    expect(yearStats2024.totalPlaytimeMs).toBe(3600000);
    expect(yearStats2024.totalSessions).toBe(1);
    expect(yearStats2024.mostPlayedInstance?.name).toBe('Old World');
  });
});
