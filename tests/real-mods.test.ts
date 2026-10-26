/**
 * Test with real mods from the Cobblemon modpack
 * This test uses actual .jar files instead of dummy content
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { InstanceManager } from '../electron/backend/instances/instanceManager';
import { ModManager } from '../electron/backend/content/modManager';
import { ConfigStore } from '../electron/backend/storage/configStore';

const REAL_MODS_DIR = path.join(process.cwd(), '.test-mods-real');

// Real mods copied from Cobblemon instance (all for 1.19.2)
const REAL_MODS = [
  'advancedtooltips-1.6.0+1.19.jar',
  'advancementinfo-1.19.1-fabric0.58.5-1.3.1.jar',
  'advdebug-2.3.0.jar',
  'amecs-1.3.8+mc.1.19-rc2.jar',
  'animatica-0.5+1.19.jar'
];

describe('Real Mods Integration Test', () => {
  let tempBaseDir: string;

  beforeEach(() => {
    tempBaseDir = path.join(__dirname, '.test-temp-' + crypto.randomUUID());
    fs.mkdirSync(tempBaseDir, { recursive: true });
    ConfigStore.setOverrideInstanceDir(tempBaseDir);
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempBaseDir)) {
        fs.rmSync(tempBaseDir, { recursive: true, force: true });
      }
      ConfigStore.restoreOriginalInstanceDir();
    } catch (_) {}
  });

  it('creates instance with real mods and verifies structure', async () => {
    // Create instance for 1.19.2 (the version the real mods support)
    const payload = {
      name: 'real-mods-test',
      description: 'Test instance with real mods',
      minecraftVersion: '1.19.2',
      loaderType: 'fabric',
      javaRuntime: 'auto',
      memoryMb: 4096,
      artwork: null,
      item: 'minecraft:grass_block',
      shareSource: 'test'
    };

    const instance = await InstanceManager.createInstance(payload);

    expect(instance).toBeDefined();
    expect(instance.minecraft.version).toBe('1.19.2');
    expect(instance.loader.type).toBe('fabric');

    // Verify instance directory structure
    expect(fs.existsSync(instance.instancePath)).toBe(true);
    expect(fs.existsSync(path.join(instance.instancePath, 'build.gradle'))).toBe(true);
    expect(fs.existsSync(path.join(instance.instancePath, 'gradlew.bat'))).toBe(true);
    expect(fs.existsSync(path.join(instance.instancePath, 'mods'))).toBe(true);
  });

  it('copies real mods to instance and scans them', async () => {
    // Create instance
    const payload = {
      name: 'real-mods-scan-test',
      description: 'Test scanning real mods',
      minecraftVersion: '1.19.2',
      loaderType: 'fabric',
      javaRuntime: 'auto',
      memoryMb: 4096,
      artwork: null,
      item: 'minecraft:grass_block',
      shareSource: 'test'
    };

    const instance = await InstanceManager.createInstance(payload);
    const modsDir = path.join(instance.instancePath, 'mods');

    // Copy real mods to instance
    for (const modFile of REAL_MODS) {
      const sourcePath = path.join(REAL_MODS_DIR, modFile);
      const destPath = path.join(modsDir, modFile);

      if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, destPath);
      } else {
        console.warn(`Mod not found: ${sourcePath}`);
      }
    }

    // Verify mods were copied
    const copiedMods = fs.readdirSync(modsDir).filter(f => f.endsWith('.jar'));
    expect(copiedMods.length).toBeGreaterThan(0);

    // Scan mods with ModManager
    const scannedMods = await ModManager.listMods(instance.id);
    expect(scannedMods.length).toBe(copiedMods.length);

    // Verify mod names
    const modNames = scannedMods.map(m => m.name);
    expect(modNames.length).toBeGreaterThan(0);
  });

  it('verifies real mods have valid file sizes', async () => {
    const payload = {
      name: 'real-mods-size-test',
      description: 'Test real mod file sizes',
      minecraftVersion: '1.19.2',
      loaderType: 'fabric',
      javaRuntime: 'auto',
      memoryMb: 4096,
      artwork: null,
      item: 'minecraft:grass_block',
      shareSource: 'test'
    };

    const instance = await InstanceManager.createInstance(payload);
    const modsDir = path.join(instance.instancePath, 'mods');

    // Copy real mods
    for (const modFile of REAL_MODS) {
      const sourcePath = path.join(REAL_MODS_DIR, modFile);
      const destPath = path.join(modsDir, modFile);

      if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, destPath);
      }
    }

    // Verify each mod has a reasonable file size (> 1KB)
    const modFiles = fs.readdirSync(modsDir).filter(f => f.endsWith('.jar'));

    for (const modFile of modFiles) {
      const modPath = path.join(modsDir, modFile);
      const stats = fs.statSync(modPath);
      expect(stats.size).toBeGreaterThan(1024); // At least 1KB
    }
  });

  it('verifies build.gradle is valid with real mods present', async () => {
    const payload = {
      name: 'real-mods-gradle-test',
      description: 'Test Gradle with real mods',
      minecraftVersion: '1.19.2',
      loaderType: 'fabric',
      javaRuntime: 'auto',
      memoryMb: 4096,
      artwork: null,
      item: 'minecraft:grass_block',
      shareSource: 'test'
    };

    const instance = await InstanceManager.createInstance(payload);
    const modsDir = path.join(instance.instancePath, 'mods');
    const buildGradlePath = path.join(instance.instancePath, 'build.gradle');

    // Copy real mods
    for (const modFile of REAL_MODS) {
      const sourcePath = path.join(REAL_MODS_DIR, modFile);
      const destPath = path.join(modsDir, modFile);

      if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, destPath);
      }
    }

    // Verify build.gradle exists and contains fabric-loom
    expect(fs.existsSync(buildGradlePath)).toBe(true);
    const buildGradle = fs.readFileSync(buildGradlePath, 'utf-8');
    expect(buildGradle).toContain('fabric-loom');
  });
});
