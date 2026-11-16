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

  it('recovers crashed sessions safely without double-counting', () => {
    const s = statsStore.startSession({
      instanceId: 'inst-crash',
      instanceName: 'Crash Test',
      minecraftVersion: '1.21.1',
      loaderType: 'fabric'
    });
    // Started 30 mins ago
    const startTime = Date.now() - 30 * 60 * 1000;
    s.startedAt = new Date(startTime).toISOString();
    statsStore.save();

    const recoveryTime = Date.now();
    statsStore.recoverActiveSessions(recoveryTime);

    expect(s.status).toBe('crashed');
    expect(s.durationMs).toBeGreaterThanOrEqual(29 * 60 * 1000);
    expect(s.durationMs).toBeLessThanOrEqual(31 * 60 * 1000);
    const initialPlaytime = statsStore.getInstancePlaytime('inst-crash');
    expect(initialPlaytime).toBe(s.durationMs);

    // Repeated recovery should not change duration or double-count
    statsStore.recoverActiveSessions(Date.now() + 10000);
    expect(statsStore.getInstancePlaytime('inst-crash')).toBe(initialPlaytime);
  });

  it('handles corrupted, zero-duration, future, and extremely long sessions in recovery', () => {
    // 1. Corrupted startedAt
    const s1 = statsStore.startSession({
      instanceId: 'inst-c1',
      instanceName: 'Corrupted Start',
      minecraftVersion: '1.21.1',
      loaderType: 'fabric'
    });
    s1.startedAt = 'INVALID_TIMESTAMP';

    // 2. Future startedAt
    const s2 = statsStore.startSession({
      instanceId: 'inst-c2',
      instanceName: 'Future Start',
      minecraftVersion: '1.21.1',
      loaderType: 'fabric'
    });
    s2.startedAt = new Date(Date.now() + 1000000).toISOString();

    // 3. Extremely long session (e.g. 24 hours ago)
    const s3 = statsStore.startSession({
      instanceId: 'inst-c3',
      instanceName: 'Huge Duration',
      minecraftVersion: '1.21.1',
      loaderType: 'fabric'
    });
    s3.startedAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    statsStore.recoverActiveSessions(Date.now());

    expect(s1.status).toBe('crashed');
    expect(s1.durationMs).toBe(0);

    expect(s2.status).toBe('crashed');
    expect(s2.durationMs).toBe(0);

    // Clamped to 4 hours max (14,400,000 ms)
    expect(s3.status).toBe('crashed');
    expect(s3.durationMs).toBe(4 * 60 * 60 * 1000);
  });

  it('preserves lifetime statistics when sessions are pruned past 2,000', async () => {
    // Add 2,050 sessions (batch without fsync per loop)
    // Populate directly to test pruning logic efficiently
    for (let i = 0; i < 2050; i++) {
      const sessionId = `test-sess-${i}`;
      const session = {
        sessionId,
        instanceId: `inst-${i % 5}`,
        instanceName: `World ${i % 5}`,
        minecraftVersion: '1.21.1',
        loaderType: 'fabric' as const,
        startedAt: new Date(Date.now() - 10000).toISOString(),
        endedAt: new Date().toISOString(),
        durationMs: 10000,
        status: 'completed' as const
      };
      (statsStore as any).data.sessions.push(session);
      (statsStore as any).data.lifetimeStats.totalPlaytimeMs += 10000;
      (statsStore as any).data.lifetimeStats.totalCompletedSessions += 1;
      (statsStore as any).data.processedSessionIds.push(sessionId);
    }
    // Now trigger startSession to perform pruning
    statsStore.startSession({
      instanceId: 'inst-prune-trigger',
      instanceName: 'Trigger World',
      minecraftVersion: '1.21.1',
      loaderType: 'fabric'
    });

    // Sessions array should be capped at 2,000
    expect(statsStore.getAllSessions().length).toBe(2000);

    // Lifetime total playtime should reflect all 2,050 sessions
    const wrapped = await statsStore.getWrappedStats('lifetime');
    expect(wrapped.totalSessions).toBeGreaterThanOrEqual(2050);
    expect(wrapped.totalPlaytimeMs).toBe(2050 * 10000);
  });

  it('tracks yearly and lifetime economy accurately past 200 transactions', async () => {
    // Generate 250 earn and spend transactions in the current year
    const currentYear = new Date().getFullYear();
    for (let i = 0; i < 250; i++) {
      playerStore.addTransaction('earn', 10, `Reward ${i}`, undefined, 'reward');
      playerStore.addTransaction('spend', 5, `Spend ${i}`, undefined, 'shop');
    }

    // Ledger in display history should be capped at 200 entries
    expect(playerStore.getTransactions().length).toBe(200);

    // Yearly economy must preserve all 250 transactions + 150 VP reward from 'vp_earner' achievement unlock (1000 + 250*10 + 150 = 3650 earned, 250*5 = 1250 spent)
    const yearly = playerStore.getYearlyEconomy(currentYear);
    expect(yearly.earned).toBe(3650);
    expect(yearly.spent).toBe(1250);

    const wrapped = await statsStore.getWrappedStats(currentYear, playerStore);
    expect(wrapped.economy.totalVpEarned).toBe(3650);
    expect(wrapped.economy.totalVpSpent).toBe(1250);
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
