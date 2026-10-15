import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { PlayerDataStore } from '../electron/backend/player/playerDataStore';
import { AchievementEngine } from '../electron/backend/player/achievementEngine';
import { CosmeticCatalogue } from '../electron/backend/player/cosmeticCatalogue';
import { VPackManager } from '../electron/backend/vpack/vpackManager';
import { ArcadeStore } from '../electron/backend/arcade/arcadeStore';
import { InstanceMetadata } from '../electron/types';

describe('Voxel+ Core Integration: Player, Economy, VPack & Arcade', () => {
  let tmpDir: string;
  let playerFile: string;
  let arcadeFile: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'voxel-test-'));
    playerFile = path.join(tmpDir, 'player.json');
    arcadeFile = path.join(tmpDir, 'arcade.json');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('handles player profile, wallet transactions, and initial state', () => {
    const store = new PlayerDataStore(playerFile);
    const profile = store.getProfile();
    expect(profile.displayName).toBe('Voxel Explorer');

    const wallet = store.getWallet();
    expect(wallet.balance).toBe(1000);

    // Spend test
    const spendRes = store.addTransaction('spend', 50, 'Test Purchase');
    expect(spendRes.success).toBe(true);
    expect(spendRes.wallet.balance).toBe(950);

    // Insufficient funds
    const overspend = store.addTransaction('spend', 9999, 'Too expensive');
    expect(overspend.success).toBe(false);
  });

  it('triggers achievements and awards VP and cosmetic items', () => {
    const store = new PlayerDataStore(playerFile);
    const engine = new AchievementEngine(store);

    const initWallet = store.getWallet().balance;
    const res = engine.trackProgress('first_instance', 1);

    expect(res.unlockedNow).toBe(true);
    expect(res.rewardVP).toBe(50);
    expect(store.getWallet().balance).toBe(initWallet + 50);
    expect(store.isCosmeticOwned('cosmetic-badge-first-instance')).toBe(true);
  });

  it('exports and securely imports VPack with manifest and traversal protection', () => {
    const instanceDir = path.join(tmpDir, 'inst-sample');
    fs.mkdirSync(instanceDir, { recursive: true });
    fs.writeFileSync(path.join(instanceDir, 'voxel-instance.json'), JSON.stringify({
      id: 'inst-1',
      name: 'Sample Modded World',
      minecraft: { version: '1.21.1' },
      loader: { type: 'fabric', version: '0.16.9' },
      appearance: { artwork: null, item: 'minecraft:stone' }
    }));

    const mockMeta: InstanceMetadata = {
      schemaVersion: 1,
      id: 'inst-1',
      name: 'Sample Modded World',
      minecraft: { version: '1.21.1' },
      loader: { type: 'fabric', version: '0.16.9' },
      runtime: { memoryMb: 4096, java: 'auto', jvmArgs: '' },
      appearance: { artwork: null, item: 'minecraft:stone' },
      isFavorite: false,
      createdAt: new Date().toISOString(),
      lastPlayedAt: null
    };

    const outZip = path.join(tmpDir, 'sample.voxelplus');
    const exp = VPackManager.exportVPack(instanceDir, mockMeta, outZip);
    expect(exp.success).toBe(true);

    const validation = VPackManager.validateVPack(outZip);
    expect(validation.valid).toBe(true);
    expect(validation.manifest?.name).toBe('Sample Modded World');

    const extractDir = path.join(tmpDir, 'extracted');
    const ext = VPackManager.extractVPack(outZip, extractDir);
    expect(ext.success).toBe(true);
    expect(fs.existsSync(path.join(extractDir, 'manifest.json'))).toBe(true);
  });

  it('records arcade runs and persists stocker & cookie clicker rewards', () => {
    const playerStore = new PlayerDataStore(playerFile);
    const arcadeStore = new ArcadeStore(arcadeFile, playerStore);

    const initialVP = playerStore.getWallet().balance;
    const runResult = arcadeStore.recordStockerRun({
      mode: 'wave',
      score: 1200,
      distance: 500,
      obstaclesCleared: 45,
      durationMs: 30000,
      timestamp: new Date().toISOString()
    });

    expect(runResult.vpEarned).toBeGreaterThan(0);
    expect(playerStore.getWallet().balance).toBeGreaterThan(initialVP);

    const cookieRes = arcadeStore.saveCookieData({
      cookies: 1200,
      lifetimeCookies: 6000,
      cookiesPerClick: 5,
      cookiesPerSecond: 10,
      upgrades: {},
      producers: {},
      milestonesClaimed: [],
      lastTickTimestamp: new Date().toISOString(),
      totalClicks: 240,
      totalTimePlayedMs: 15000
    });

    expect(cookieRes.vpEarned).toBe(50);
  });
});
