/**
 * Arcade save-integrity tests.
 *
 * The renderer supplies StockerRunResult and CookieClickerSaveData payloads
 * over IPC. These tests lock in that hostile/corrupt numbers (NaN, Infinity,
 * negatives) can never poison persisted totals, the VP ledger, or achievements.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ArcadeStore } from '../electron/backend/arcade/arcadeStore';
import { PlayerDataStore } from '../electron/backend/player/playerDataStore';
import { CookieClickerSaveData, StockerRunResult } from '../electron/types';

function makeCookieSave(overrides: Partial<CookieClickerSaveData> = {}): CookieClickerSaveData {
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
    totalTimePlayedMs: 0,
    ...overrides
  };
}

function makeStockerRun(overrides: Partial<StockerRunResult> = {}): StockerRunResult {
  return {
    mode: 'classic',
    score: 0,
    distance: 0,
    obstaclesCleared: 0,
    durationMs: 1000,
    timestamp: new Date().toISOString(),
    ...overrides
  };
}

describe('ArcadeStore input hardening', () => {
  let tmpDir: string;
  let playerFile: string;
  let arcadeFile: string;
  let playerStore: PlayerDataStore;
  let store: ArcadeStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'voxel-arcade-'));
    playerFile = path.join(tmpDir, 'player.json');
    arcadeFile = path.join(tmpDir, 'arcade.json');
    playerStore = new PlayerDataStore(playerFile);
    store = new ArcadeStore(arcadeFile, playerStore);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('never persists NaN or Infinity from a hostile stocker run', () => {
    store.recordStockerRun(makeStockerRun({
      score: Number.NaN,
      distance: Number.POSITIVE_INFINITY,
      obstaclesCleared: -50
    }));

    const data = store.getStockerData();
    expect(Number.isFinite(data.bestScore)).toBe(true);
    expect(Number.isFinite(data.totalDistance)).toBe(true);
    expect(Number.isFinite(data.totalObstaclesCleared)).toBe(true);
    expect(data.bestScore).toBe(0);
    expect(data.totalDistance).toBe(0);
    expect(data.totalObstaclesCleared).toBe(0);
    expect(data.totalRuns).toBe(1);
  });

  it('awards the minimum completion reward but no score-based VP for invalid scores', () => {
    const result = store.recordStockerRun(makeStockerRun({ score: -9999 }));
    expect(result.vpEarned).toBe(5);
    expect(Number.isFinite(playerStore.getWallet().balance)).toBe(true);
  });

  it('clamps absurd scores instead of minting unbounded VP', () => {
    const result = store.recordStockerRun(makeStockerRun({ score: Number.MAX_VALUE }));
    // Score is clamped to 10,000,000 before the VP formula is applied.
    expect(result.vpEarned).toBe(400000);
    expect(store.getStockerData().bestScore).toBe(10_000_000);
  });

  it('sanitizes cookie saves before writing them to disk', () => {
    const result = store.saveCookieData(makeCookieSave({
      cookies: Number.NaN,
      lifetimeCookies: Number.POSITIVE_INFINITY,
      cookiesPerClick: -4,
      cookiesPerSecond: Number.NaN,
      upgrades: { 'upgrade-a': Number.NaN, 'upgrade-b': -2 },
      producers: { 'producer-a': Number.POSITIVE_INFINITY },
      milestonesClaimed: ['bogus'] as unknown as number[],
      totalClicks: -10
    }));

    const saved = store.getCookieData();
    expect(Number.isFinite(saved.cookies)).toBe(true);
    expect(Number.isFinite(saved.lifetimeCookies)).toBe(true);
    expect(saved.cookiesPerClick).toBe(1);
    expect(saved.cookiesPerSecond).toBe(0);
    expect(saved.upgrades['upgrade-a']).toBe(0);
    expect(saved.upgrades['upgrade-b']).toBe(0);
    expect(saved.producers['producer-a']).toBe(0);
    expect(saved.milestonesClaimed).toEqual([]);
    expect(saved.totalClicks).toBe(0);
    expect(result.vpEarned).toBe(0);
  });

  it('keeps lifetime cookies monotonic when a save rewinds the counter', () => {
    store.saveCookieData(makeCookieSave({ lifetimeCookies: 12_000, cookies: 12_000 }));
    const before = store.getCookieData().lifetimeCookies;

    store.saveCookieData(makeCookieSave({ lifetimeCookies: 10, cookies: 10 }));

    expect(before).toBe(12_000);
    expect(store.getCookieData().lifetimeCookies).toBe(12_000);
  });

  it('awards milestone VP once per 5,000-cookie milestone', () => {
    const first = store.saveCookieData(makeCookieSave({ lifetimeCookies: 5_000 }));
    expect(first.vpEarned).toBe(50);

    const repeat = store.saveCookieData(makeCookieSave({ lifetimeCookies: 5_500 }));
    expect(repeat.vpEarned).toBe(0);

    const next = store.saveCookieData(makeCookieSave({ lifetimeCookies: 10_000 }));
    expect(next.vpEarned).toBe(50);
  });
});
