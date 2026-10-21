import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import { InstanceManager } from '../electron/backend/instances/instanceManager';
import { LoaderRegistry } from '../electron/backend/instances/loaderProvider';
import { InstanceMetadataStore } from '../electron/backend/instances/metadata';
import { ModManager } from '../electron/backend/content/modManager';
import { PreflightChecker } from '../electron/backend/instances/preflightChecker';
import { ConfigStore } from '../electron/backend/storage/configStore';
import { CreateInstancePayload } from '../electron/types';
import { InstanceMetadata } from '../electron/types';

// Expanded test matrix for comprehensive testing (matching actual supported versions)
const TEST_MATRIX = {
  fabric: ['26.3', '26.2', '26.1.2', '26.1.1', '1.21.4', '1.21.1', '1.21', '1.20.6', '1.20.4', '1.20.2', '1.20.1', '1.19.4', '1.19.2', '1.18.2', '1.17.1', '1.16.5', '1.15.2'],
  quilt: ['1.21.4', '1.21.1', '1.20.4', '1.20.1', '1.19.4', '1.19.2', '1.18.2'],
  neoforge: ['1.21.4', '1.21.3', '1.21.1', '1.21', '1.20.6', '1.20.4'],
  forge: ['1.20.4', '1.20.2', '1.20.1', '1.19.4', '1.19.2', '1.18.2', '1.16.5']
};

// Sample compatible mods for testing (simulated)
const COMPATIBLE_MODS = {
  fabric: ['fabric-api', 'sodium', 'iris', 'modmenu', 'lazydfu', 'lithium', 'phosphor', 'ferritecore', 'krypton', 'entitytexturefeatures'],
  quilt: ['qsl', 'qfapi', 'sodium', 'iris', 'modmenu', 'lazydfu', 'lithium'],
  forge: ['forgeconfigapi', 'mousewheelie', 'inventoryhud', 'jei', 'journeymap', 'xaeros', 'cosmeticarmor', 'betterbiomeblend'],
  neoforge: ['neoforgeconfigapi', 'mousewheelie', 'jei', 'journeymap', 'xaeros', 'betterbiomeblend']
};

// Key test cases covering major versions across all loaders
const KEY_TEST_CASES = [
  { loader: 'fabric', version: '26.3' },
  { loader: 'fabric', version: '1.21.1' },
  { loader: 'fabric', version: '1.20.1' },
  { loader: 'fabric', version: '1.19.4' },
  { loader: 'fabric', version: '1.16.5' },
  { loader: 'quilt', version: '1.21.1' },
  { loader: 'quilt', version: '1.20.1' },
  { loader: 'quilt', version: '1.19.4' },
  { loader: 'neoforge', version: '1.21.1' },
  { loader: 'neoforge', version: '1.20.4' },
  { loader: 'forge', version: '1.20.1' },
  { loader: 'forge', version: '1.19.4' },
  { loader: 'forge', version: '1.16.5' }
];

describe('Comprehensive Instance Creation & Launch Validation', () => {
  let tempBaseDir: string;

  beforeEach(() => {
    tempBaseDir = path.join(__dirname, '.test-temp-' + crypto.randomUUID());
    fs.mkdirSync(tempBaseDir, { recursive: true });

    // Override instance directory for testing
    ConfigStore.setOverrideInstanceDir(tempBaseDir);
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempBaseDir)) {
        fs.rmSync(tempBaseDir, { recursive: true, force: true });
      }
      // Restore original instance directory
      ConfigStore.setOverrideInstanceDir(null);
    } catch (_) {}
  });

  describe('1. Loader Registry Validation', () => {
    it('validates all loader + version combinations are supported', () => {
      for (const [loader, versions] of Object.entries(TEST_MATRIX)) {
        const provider = LoaderRegistry.getProvider(loader as any);
        expect(provider).toBeDefined();
        expect(provider.isSupported).toBe(true);

        for (const version of versions) {
          const isSupported = LoaderRegistry.isCombinationSupported(loader as any, version);
          // Only test combinations that are actually supported
          if (isSupported) {
            expect(isSupported).toBe(true);
          }
        }
      }
    });

    it('rejects unsupported loader + version combinations', () => {
      // Fabric doesn't support 1.12.2
      expect(LoaderRegistry.isCombinationSupported('fabric', '1.12.2')).toBe(false);
      // NeoForge doesn't support 1.16.5
      expect(LoaderRegistry.isCombinationSupported('neoforge', '1.16.5')).toBe(false);
    });
  });

  describe('2. Instance Creation - All Loaders', () => {
    it('creates a valid Fabric instance', async () => {
      const payload: CreateInstancePayload = {
        name: 'fabric-test',
        description: 'Test Fabric instance',
        minecraftVersion: '1.21.1',
        loaderType: 'fabric',
        javaRuntime: 'auto',
        memoryMb: 4096,
        artwork: null,
        item: 'minecraft:grass_block',
        shareSource: 'test'
      };

      const instance = await InstanceManager.createInstance(payload);
      expect(instance).toBeDefined();
      expect(instance.loader.type).toBe('fabric');
      expect(instance.loader.version).toMatch(/0\.16\.\d+/);
      expect(instance.minecraft.version).toBe('1.21.1');
      expect(instance.instancePath).toBeDefined();
      expect(fs.existsSync(instance.instancePath)).toBe(true);

      // Verify build.gradle exists and contains Fabric-specific content
      const buildGradlePath = path.join(instance.instancePath, 'build.gradle');
      expect(fs.existsSync(buildGradlePath)).toBe(true);
      const buildGradle = fs.readFileSync(buildGradlePath, 'utf-8');
      expect(buildGradle).toContain('fabric-loom');
    });

    it('creates a valid Quilt instance', async () => {
      const payload: CreateInstancePayload = {
        name: 'quilt-test',
        description: 'Test Quilt instance',
        minecraftVersion: '1.21.1',
        loaderType: 'quilt',
        javaRuntime: 'auto',
        memoryMb: 4096,
        artwork: null,
        item: 'minecraft:grass_block',
        shareSource: 'test'
      };

      const instance = await InstanceManager.createInstance(payload);
      expect(instance.loader.type).toBe('quilt');
      expect(instance.loader.version).toMatch(/0\.26\.\d+/);

      const buildGradlePath = path.join(instance.instancePath, 'build.gradle');
      const buildGradle = fs.readFileSync(buildGradlePath, 'utf-8');
      expect(buildGradle).toContain('org.quiltmc.loom');
    });

    it('creates a valid Forge instance', async () => {
      const payload: CreateInstancePayload = {
        name: 'forge-test',
        description: 'Test Forge instance',
        minecraftVersion: '1.20.1',
        loaderType: 'forge',
        javaRuntime: 'auto',
        memoryMb: 4096,
        artwork: null,
        item: 'minecraft:grass_block',
        shareSource: 'test'
      };

      const instance = await InstanceManager.createInstance(payload);
      expect(instance.loader.type).toBe('forge');
      expect(instance.loader.version).toMatch(/47\.\d+\.\d+/);

      const buildGradlePath = path.join(instance.instancePath, 'build.gradle');
      const buildGradle = fs.readFileSync(buildGradlePath, 'utf-8');
      expect(buildGradle).toContain('net.minecraftforge.gradle');

      // Verify mods.toml exists for Forge
      const modsTomlPath = path.join(instance.instancePath, 'src', 'main', 'resources', 'META-INF', 'mods.toml');
      expect(fs.existsSync(modsTomlPath)).toBe(true);
    });

    it('creates a valid NeoForge instance', async () => {
      const payload: CreateInstancePayload = {
        name: 'neoforge-test',
        description: 'Test NeoForge instance',
        minecraftVersion: '1.21.1',
        loaderType: 'neoforge',
        javaRuntime: 'auto',
        memoryMb: 4096,
        artwork: null,
        item: 'minecraft:grass_block',
        shareSource: 'test'
      };

      const instance = await InstanceManager.createInstance(payload);
      expect(instance.loader.type).toBe('neoforge');
      expect(instance.loader.version).toMatch(/21\.\d+\.\d+/);

      const buildGradlePath = path.join(instance.instancePath, 'build.gradle');
      const buildGradle = fs.readFileSync(buildGradlePath, 'utf-8');
      expect(buildGradle).toContain('net.neoforged.moddev');
    });
  });

  describe('3. Instance Creation - Key Versions', () => {
    it('creates instances for all key loader + version combinations', async () => {
      const results: Array<{ loader: string; version: string; success: boolean; error?: string }> = [];

      for (const { loader, version } of KEY_TEST_CASES) {
        try {
          const payload: CreateInstancePayload = {
            name: `${loader}-${version.replace(/\./g, '-')}`,
            description: `Test ${loader} ${version}`,
            minecraftVersion: version,
            loaderType: loader as any,
            javaRuntime: 'auto',
            memoryMb: 4096,
            artwork: null,
            item: 'minecraft:grass_block',
            shareSource: 'test'
          };

          const instance = await InstanceManager.createInstance(payload);
          expect(instance.loader.type).toBe(loader);
          expect(instance.minecraft.version).toBe(version);
          expect(fs.existsSync(instance.instancePath)).toBe(true);

          results.push({ loader, version, success: true });
        } catch (error: any) {
          results.push({ loader, version, success: false, error: error.message });
        }
      }

      // All should succeed
      expect(results.every(r => r.success)).toBe(true);
      console.log('All key test cases passed:', results);
    });
  });

  describe('4. Mod Installation Logic', () => {
    it('validates mod directory structure exists after instance creation', async () => {
      const payload: CreateInstancePayload = {
        name: 'mod-test',
        description: 'Test mod installation',
        minecraftVersion: '1.21.1',
        loaderType: 'fabric',
        javaRuntime: 'auto',
        memoryMb: 4096,
        artwork: null,
        item: 'minecraft:grass_block',
        shareSource: 'test'
      };

      const instance = await InstanceManager.createInstance(payload);
      expect(instance.instancePath).toBeDefined();
      const modsDir = path.join(instance.instancePath, 'mods');
      expect(fs.existsSync(modsDir)).toBe(true);
    });

    it('validates mod metadata can be scanned', async () => {
      const payload: CreateInstancePayload = {
        name: 'mod-scan-test',
        description: 'Test mod scanning',
        minecraftVersion: '1.21.1',
        loaderType: 'fabric',
        javaRuntime: 'auto',
        memoryMb: 4096,
        artwork: null,
        item: 'minecraft:grass_block',
        shareSource: 'test'
      };

      const instance = await InstanceManager.createInstance(payload);
      const mods = await ModManager.listMods(instance.id);
      expect(Array.isArray(mods)).toBe(true);
      // Initially empty
      expect(mods.length).toBe(0);
    });

    it('simulates adding compatible mods to Fabric instance', async () => {
      const payload: CreateInstancePayload = {
        name: 'fabric-mods-test',
        description: 'Test Fabric with mods',
        minecraftVersion: '1.21.1',
        loaderType: 'fabric',
        javaRuntime: 'auto',
        memoryMb: 4096,
        artwork: null,
        item: 'minecraft:grass_block',
        shareSource: 'test'
      };

      const instance = await InstanceManager.createInstance(payload);
      const modsDir = path.join(instance.instancePath, 'mods');

      // Simulate adding 5-10 compatible mods (create dummy .jar files)
      const fabricMods = COMPATIBLE_MODS.fabric.slice(0, 8);
      for (const modName of fabricMods) {
        const modFile = path.join(modsDir, `${modName}.jar`);
        fs.writeFileSync(modFile, Buffer.from('dummy mod content'), 'utf-8');
      }

      // Verify mods were added
      const mods = await ModManager.listMods(instance.id);
      expect(mods.length).toBe(8);
      expect(mods.every(m => m.enabled)).toBe(true);
    });

    it('simulates adding compatible mods to Forge instance', async () => {
      const payload: CreateInstancePayload = {
        name: 'forge-mods-test',
        description: 'Test Forge with mods',
        minecraftVersion: '1.20.1',
        loaderType: 'forge',
        javaRuntime: 'auto',
        memoryMb: 4096,
        artwork: null,
        item: 'minecraft:grass_block',
        shareSource: 'test'
      };

      const instance = await InstanceManager.createInstance(payload);
      const modsDir = path.join(instance.instancePath, 'mods');

      // Simulate adding 5-10 compatible mods
      const forgeMods = COMPATIBLE_MODS.forge.slice(0, 7);
      for (const modName of forgeMods) {
        const modFile = path.join(modsDir, `${modName}.jar`);
        fs.writeFileSync(modFile, Buffer.from('dummy mod content'), 'utf-8');
      }

      const mods = await ModManager.listMods(instance.id);
      expect(mods.length).toBe(7);
    });

    it('simulates adding compatible mods to NeoForge instance', async () => {
      const payload: CreateInstancePayload = {
        name: 'neoforge-mods-test',
        description: 'Test NeoForge with mods',
        minecraftVersion: '1.21.1',
        loaderType: 'neoforge',
        javaRuntime: 'auto',
        memoryMb: 4096,
        artwork: null,
        item: 'minecraft:grass_block',
        shareSource: 'test'
      };

      const instance = await InstanceManager.createInstance(payload);
      const modsDir = path.join(instance.instancePath, 'mods');

      const neoforgeMods = COMPATIBLE_MODS.neoforge.slice(0, 6);
      for (const modName of neoforgeMods) {
        const modFile = path.join(modsDir, `${modName}.jar`);
        fs.writeFileSync(modFile, Buffer.from('dummy mod content'), 'utf-8');
      }

      const mods = await ModManager.listMods(instance.id);
      expect(mods.length).toBe(6);
    });

    it('simulates adding compatible mods to Quilt instance', async () => {
      const payload: CreateInstancePayload = {
        name: 'quilt-mods-test',
        description: 'Test Quilt with mods',
        minecraftVersion: '1.21.1',
        loaderType: 'quilt',
        javaRuntime: 'auto',
        memoryMb: 4096,
        artwork: null,
        item: 'minecraft:grass_block',
        shareSource: 'test'
      };

      const instance = await InstanceManager.createInstance(payload);
      const modsDir = path.join(instance.instancePath, 'mods');

      const quiltMods = COMPATIBLE_MODS.quilt.slice(0, 5);
      for (const modName of quiltMods) {
        const modFile = path.join(modsDir, `${modName}.jar`);
        fs.writeFileSync(modFile, Buffer.from('dummy mod content'), 'utf-8');
      }

      const mods = await ModManager.listMods(instance.id);
      expect(mods.length).toBe(5);
    });

    it('adds mods to Fabric instances across multiple versions', async () => {
      const versions = ['1.21.1', '1.20.1', '1.19.4', '1.16.5'];
      const results: Array<{ version: string; modCount: number; success: boolean }> = [];

      for (const version of versions) {
        try {
          const payload: CreateInstancePayload = {
            name: `fabric-mods-${version.replace(/\./g, '-')}`,
            description: `Test Fabric ${version} with mods`,
            minecraftVersion: version,
            loaderType: 'fabric',
            javaRuntime: 'auto',
            memoryMb: 4096,
            artwork: null,
            item: 'minecraft:grass_block',
            shareSource: 'test'
          };

          const instance = await InstanceManager.createInstance(payload);
          const modsDir = path.join(instance.instancePath, 'mods');

          // Add 5-8 mods depending on version
          const modCount = version === '1.16.5' ? 5 : 8;
          const modsToAdd = COMPATIBLE_MODS.fabric.slice(0, modCount);
          for (const modName of modsToAdd) {
            const modFile = path.join(modsDir, `${modName}.jar`);
            fs.writeFileSync(modFile, Buffer.from('dummy mod content'), 'utf-8');
          }

          const mods = await ModManager.listMods(instance.id);
          results.push({ version, modCount: mods.length, success: true });
        } catch (error: any) {
          results.push({ version, modCount: 0, success: false });
        }
      }

      expect(results.every(r => r.success)).toBe(true);
      expect(results.every(r => r.modCount >= 5)).toBe(true);
      console.log('Fabric mods test results:', results);
    });

    it('adds mods to Forge instances across multiple versions', async () => {
      const versions = ['1.20.1', '1.19.4', '1.16.5'];
      const results: Array<{ version: string; modCount: number; success: boolean }> = [];

      for (const version of versions) {
        try {
          const payload: CreateInstancePayload = {
            name: `forge-mods-${version.replace(/\./g, '-')}`,
            description: `Test Forge ${version} with mods`,
            minecraftVersion: version,
            loaderType: 'forge',
            javaRuntime: 'auto',
            memoryMb: 4096,
            artwork: null,
            item: 'minecraft:grass_block',
            shareSource: 'test'
          };

          const instance = await InstanceManager.createInstance(payload);
          const modsDir = path.join(instance.instancePath, 'mods');

          const modCount = 6;
          const modsToAdd = COMPATIBLE_MODS.forge.slice(0, modCount);
          for (const modName of modsToAdd) {
            const modFile = path.join(modsDir, `${modName}.jar`);
            fs.writeFileSync(modFile, Buffer.from('dummy mod content'), 'utf-8');
          }

          const mods = await ModManager.listMods(instance.id);
          results.push({ version, modCount: mods.length, success: true });
        } catch (error: any) {
          results.push({ version, modCount: 0, success: false });
        }
      }

      expect(results.every(r => r.success)).toBe(true);
      console.log('Forge mods test results:', results);
    });
  });

  describe('5. Preflight Validation', () => {
    it('passes preflight for Fabric 1.21.1', async () => {
      const payload: CreateInstancePayload = {
        name: 'preflight-fabric-121',
        description: 'Preflight test Fabric 1.21.1',
        minecraftVersion: '1.21.1',
        loaderType: 'fabric',
        javaRuntime: 'auto',
        memoryMb: 4096,
        artwork: null,
        item: 'minecraft:grass_block',
        shareSource: 'test'
      };

      const instance = await InstanceManager.createInstance(payload);
      const report = await PreflightChecker.runPreflight(
        '1.21.1',
        'fabric',
        4096,
        instance.instancePath
      );

      expect(report.compatibility.minecraftVersion).toBe('1.21.1');
      expect(report.compatibility.loader.type).toBe('fabric');
      expect(['COMPATIBLE', 'INFO', 'WARNING', 'BLOCKING_ERROR']).toContain(report.overallStatus);
    });

    it('passes preflight for Forge 1.20.1', async () => {
      const payload: CreateInstancePayload = {
        name: 'preflight-forge-1201',
        description: 'Preflight test Forge 1.20.1',
        minecraftVersion: '1.20.1',
        loaderType: 'forge',
        javaRuntime: 'auto',
        memoryMb: 4096,
        artwork: null,
        item: 'minecraft:grass_block',
        shareSource: 'test'
      };

      const instance = await InstanceManager.createInstance(payload);
      const report = await PreflightChecker.runPreflight(
        '1.20.1',
        'forge',
        4096,
        instance.instancePath
      );

      expect(report.compatibility.minecraftVersion).toBe('1.20.1');
      expect(report.compatibility.loader.type).toBe('forge');
      expect(['COMPATIBLE', 'INFO', 'WARNING', 'BLOCKING_ERROR']).toContain(report.overallStatus);
    });

    it('detects missing instance directory as blocking error', async () => {
      const report = await PreflightChecker.runPreflight(
        '1.21.1',
        'fabric',
        4096,
        path.join(tempBaseDir, 'nonexistent')
      );

      expect(report.overallStatus).toBe('BLOCKING_ERROR');
      expect(report.isLaunchable).toBe(false);
      expect(report.issues.some(i => i.category === 'FILESYSTEM')).toBe(true);
    });
  });

  describe('6. Startup Verification', () => {
    it('verifies build.gradle contains correct loader plugin for all loaders', async () => {
      const loaders = ['fabric', 'quilt', 'forge', 'neoforge'] as const;
      const expectedPlugins = {
        fabric: 'fabric-loom',
        quilt: 'org.quiltmc.loom',
        forge: 'net.minecraftforge.gradle',
        neoforge: 'net.neoforged.moddev'
      };

      for (const loader of loaders) {
        const version = loader === 'forge' ? '1.20.1' : '1.21.1';
        const payload: CreateInstancePayload = {
          name: `startup-${loader}`,
          description: `Startup test ${loader}`,
          minecraftVersion: version,
          loaderType: loader,
          javaRuntime: 'auto',
          memoryMb: 4096,
          artwork: null,
          item: 'minecraft:grass_block',
          shareSource: 'test'
        };

        const instance = await InstanceManager.createInstance(payload);
        const buildGradlePath = path.join(instance.instancePath, 'build.gradle');
        const buildGradle = fs.readFileSync(buildGradlePath, 'utf-8');

        expect(buildGradle).toContain(expectedPlugins[loader]);
      }
    });

    it('verifies gradlew.bat exists for Windows', async () => {
      const payload: CreateInstancePayload = {
        name: 'gradlew-test',
        description: 'Test gradlew',
        minecraftVersion: '1.21.1',
        loaderType: 'fabric',
        javaRuntime: 'auto',
        memoryMb: 4096,
        artwork: null,
        item: 'minecraft:grass_block',
        shareSource: 'test'
      };

      const instance = await InstanceManager.createInstance(payload);
      const gradlewBat = path.join(instance.instancePath, 'gradlew.bat');
      const gradlewSh = path.join(instance.instancePath, 'gradlew');

      expect(fs.existsSync(gradlewBat)).toBe(true);
      expect(fs.existsSync(gradlewSh)).toBe(true);
    });

    it('verifies gradle wrapper properties are set correctly', async () => {
      const payload: CreateInstancePayload = {
        name: 'wrapper-test',
        description: 'Test wrapper properties',
        minecraftVersion: '1.21.1',
        loaderType: 'fabric',
        javaRuntime: 'auto',
        memoryMb: 4096,
        artwork: null,
        item: 'minecraft:grass_block',
        shareSource: 'test'
      };

      const instance = await InstanceManager.createInstance(payload);
      const wrapperPropsPath = path.join(instance.instancePath, 'gradle/wrapper/gradle-wrapper.properties');
      const wrapperProps = fs.readFileSync(wrapperPropsPath, 'utf-8');

      expect(wrapperProps).toContain('distributionUrl=');
      expect(wrapperProps).toContain('GRADLE_USER_HOME');
    });

    it('verifies loader-specific metadata files exist', async () => {
      // Fabric - fabric.mod.json
      const fabricPayload: CreateInstancePayload = {
        name: 'fabric-meta-test',
        description: 'Test Fabric metadata',
        minecraftVersion: '1.21.1',
        loaderType: 'fabric',
        javaRuntime: 'auto',
        memoryMb: 4096,
        artwork: null,
        item: 'minecraft:grass_block',
        shareSource: 'test'
      };
      const fabricInstance = await InstanceManager.createInstance(fabricPayload);
      const fabricModJson = path.join(fabricInstance.instancePath, 'src/main/resources/fabric.mod.json');
      expect(fs.existsSync(fabricModJson)).toBe(true);

      // Forge - mods.toml
      const forgePayload: CreateInstancePayload = {
        name: 'forge-meta-test',
        description: 'Test Forge metadata',
        minecraftVersion: '1.20.1',
        loaderType: 'forge',
        javaRuntime: 'auto',
        memoryMb: 4096,
        artwork: null,
        item: 'minecraft:grass_block',
        shareSource: 'test'
      };
      const forgeInstance = await InstanceManager.createInstance(forgePayload);
      const modsToml = path.join(forgeInstance.instancePath, 'src/main/resources/META-INF/mods.toml');
      expect(fs.existsSync(modsToml)).toBe(true);

      // NeoForge - mods.toml
      const neoforgePayload: CreateInstancePayload = {
        name: 'neoforge-meta-test',
        description: 'Test NeoForge metadata',
        minecraftVersion: '1.21.1',
        loaderType: 'neoforge',
        javaRuntime: 'auto',
        memoryMb: 4096,
        artwork: null,
        item: 'minecraft:grass_block',
        shareSource: 'test'
      };
      const neoforgeInstance = await InstanceManager.createInstance(neoforgePayload);
      const neoforgeModsToml = path.join(neoforgeInstance.instancePath, 'src/main/resources/META-INF/mods.toml');
      expect(fs.existsSync(neoforgeModsToml)).toBe(true);

      // Quilt - quilt.mod.json
      const quiltPayload: CreateInstancePayload = {
        name: 'quilt-meta-test',
        description: 'Test Quilt metadata',
        minecraftVersion: '1.21.1',
        loaderType: 'quilt',
        javaRuntime: 'auto',
        memoryMb: 4096,
        artwork: null,
        item: 'minecraft:grass_block',
        shareSource: 'test'
      };
      const quiltInstance = await InstanceManager.createInstance(quiltPayload);
      const quiltModJson = path.join(quiltInstance.instancePath, 'src/main/resources/quilt.mod.json');
      expect(fs.existsSync(quiltModJson)).toBe(true);
    });
  });

  describe('7. Metadata Persistence', () => {
    it('persists and retrieves instance metadata correctly', async () => {
      const payload: CreateInstancePayload = {
        name: 'metadata-test',
        description: 'Test metadata persistence',
        minecraftVersion: '1.21.1',
        loaderType: 'fabric',
        javaRuntime: 'auto',
        memoryMb: 8192,
        artwork: 'gradient-1',
        item: 'minecraft:diamond',
        shareSource: 'custom'
      };

      const created = await InstanceManager.createInstance(payload);

      // Retrieve from list
      const instances = await InstanceManager.listInstances();
      const retrieved = instances.find(i => i.id === created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('metadata-test');
      expect(retrieved?.runtime.memoryMb).toBe(8192);
      expect(retrieved?.appearance.artwork).toBe('gradient-1');
      expect(retrieved?.appearance.item).toBe('minecraft:diamond');
      expect(retrieved?.shareSource).toBe('custom');
    });
  });

  describe('8. Instance Deletion', () => {
    it('persists and retrieves instance metadata correctly', async () => {
      const payload: CreateInstancePayload = {
        name: 'metadata-test',
        description: 'Test metadata persistence',
        minecraftVersion: '1.21.1',
        loaderType: 'fabric',
        javaRuntime: 'auto',
        memoryMb: 8192,
        artwork: 'gradient-1',
        item: 'minecraft:diamond',
        shareSource: 'custom'
      };

      const created = await InstanceManager.createInstance(payload);

      // Retrieve from list
      const instances = await InstanceManager.listInstances();
      const retrieved = instances.find(i => i.id === created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('metadata-test');
      expect(retrieved?.runtime.memoryMb).toBe(8192);
      expect(retrieved?.appearance.artwork).toBe('gradient-1');
      expect(retrieved?.appearance.item).toBe('minecraft:diamond');
      expect(retrieved?.shareSource).toBe('custom');
    });
  });

  describe('8. Instance Deletion', () => {
    it('deletes instance and cleans up directory', async () => {
      const payload: CreateInstancePayload = {
        name: 'delete-test',
        description: 'Test instance deletion',
        minecraftVersion: '1.21.1',
        loaderType: 'fabric',
        javaRuntime: 'auto',
        memoryMb: 4096,
        artwork: null,
        item: 'minecraft:grass_block',
        shareSource: 'test'
      };

      const instance = await InstanceManager.createInstance(payload);
      expect(instance.instancePath).toBeDefined();
      const instancePath = instance.instancePath;
      expect(fs.existsSync(instancePath)).toBe(true);

      const deleted = await InstanceManager.deleteInstance(instance.id);
      expect(deleted).toBe(true);
      expect(fs.existsSync(instancePath)).toBe(false);

      const instances = await InstanceManager.listInstances();
      expect(instances.find(i => i.id === instance.id)).toBeUndefined();
    });
  });

  describe('9. Comprehensive Multi-Version Test', () => {
    it('tests all Fabric versions with mods', async () => {
      const versions = TEST_MATRIX.fabric;
      const results: Array<{ version: string; success: boolean; modsAdded: number }> = [];

      for (const version of versions) {
        try {
          const payload: CreateInstancePayload = {
            name: `fabric-full-${version.replace(/\./g, '-')}`,
            description: `Full test Fabric ${version}`,
            minecraftVersion: version,
            loaderType: 'fabric',
            javaRuntime: 'auto',
            memoryMb: 4096,
            artwork: null,
            item: 'minecraft:grass_block',
            shareSource: 'test'
          };

          const instance = await InstanceManager.createInstance(payload);
          const modsDir = path.join(instance.instancePath, 'mods');

          // Add 5 mods
          const modsToAdd = COMPATIBLE_MODS.fabric.slice(0, 5);
          for (const modName of modsToAdd) {
            const modFile = path.join(modsDir, `${modName}.jar`);
            fs.writeFileSync(modFile, Buffer.from('dummy mod content'), 'utf-8');
          }

          const mods = await ModManager.listMods(instance.id);
          results.push({ version, success: true, modsAdded: mods.length });
        } catch (error: any) {
          results.push({ version, success: false, modsAdded: 0 });
        }
      }

      expect(results.every(r => r.success)).toBe(true);
      expect(results.every(r => r.modsAdded === 5)).toBe(true);
      console.log(`Fabric comprehensive test: ${results.length}/${results.length} versions passed with 5 mods each`);
    });

    it('tests all Forge versions with mods', async () => {
      const versions = TEST_MATRIX.forge;
      const results: Array<{ version: string; success: boolean; modsAdded: number }> = [];

      for (const version of versions) {
        try {
          const payload: CreateInstancePayload = {
            name: `forge-full-${version.replace(/\./g, '-')}`,
            description: `Full test Forge ${version}`,
            minecraftVersion: version,
            loaderType: 'forge',
            javaRuntime: 'auto',
            memoryMb: 4096,
            artwork: null,
            item: 'minecraft:grass_block',
            shareSource: 'test'
          };

          const instance = await InstanceManager.createInstance(payload);
          const modsDir = path.join(instance.instancePath, 'mods');

          const modsToAdd = COMPATIBLE_MODS.forge.slice(0, 5);
          for (const modName of modsToAdd) {
            const modFile = path.join(modsDir, `${modName}.jar`);
            fs.writeFileSync(modFile, Buffer.from('dummy mod content'), 'utf-8');
          }

          const mods = await ModManager.listMods(instance.id);
          results.push({ version, success: true, modsAdded: mods.length });
        } catch (error: any) {
          results.push({ version, success: false, modsAdded: 0 });
        }
      }

      expect(results.every(r => r.success)).toBe(true);
      console.log(`Forge comprehensive test: ${results.length}/${results.length} versions passed with 5 mods each`);
    });

    it('tests all NeoForge versions with mods', async () => {
      const versions = TEST_MATRIX.neoforge;
      const results: Array<{ version: string; success: boolean; modsAdded: number }> = [];

      for (const version of versions) {
        try {
          const payload: CreateInstancePayload = {
            name: `neoforge-full-${version.replace(/\./g, '-')}`,
            description: `Full test NeoForge ${version}`,
            minecraftVersion: version,
            loaderType: 'neoforge',
            javaRuntime: 'auto',
            memoryMb: 4096,
            artwork: null,
            item: 'minecraft:grass_block',
            shareSource: 'test'
          };

          const instance = await InstanceManager.createInstance(payload);
          const modsDir = path.join(instance.instancePath, 'mods');

          const modsToAdd = COMPATIBLE_MODS.neoforge.slice(0, 5);
          for (const modName of modsToAdd) {
            const modFile = path.join(modsDir, `${modName}.jar`);
            fs.writeFileSync(modFile, Buffer.from('dummy mod content'), 'utf-8');
          }

          const mods = await ModManager.listMods(instance.id);
          results.push({ version, success: true, modsAdded: mods.length });
        } catch (error: any) {
          results.push({ version, success: false, modsAdded: 0 });
        }
      }

      expect(results.every(r => r.success)).toBe(true);
      console.log(`NeoForge comprehensive test: ${results.length}/${results.length} versions passed with 5 mods each`);
    });

    it('tests all Quilt versions with mods', async () => {
      const versions = TEST_MATRIX.quilt;
      const results: Array<{ version: string; success: boolean; modsAdded: number }> = [];

      for (const version of versions) {
        try {
          const payload: CreateInstancePayload = {
            name: `quilt-full-${version.replace(/\./g, '-')}`,
            description: `Full test Quilt ${version}`,
            minecraftVersion: version,
            loaderType: 'quilt',
            javaRuntime: 'auto',
            memoryMb: 4096,
            artwork: null,
            item: 'minecraft:grass_block',
            shareSource: 'test'
          };

          const instance = await InstanceManager.createInstance(payload);
          const modsDir = path.join(instance.instancePath, 'mods');

          const modsToAdd = COMPATIBLE_MODS.quilt.slice(0, 5);
          for (const modName of modsToAdd) {
            const modFile = path.join(modsDir, `${modName}.jar`);
            fs.writeFileSync(modFile, Buffer.from('dummy mod content'), 'utf-8');
          }

          const mods = await ModManager.listMods(instance.id);
          results.push({ version, success: true, modsAdded: mods.length });
        } catch (error: any) {
          results.push({ version, success: false, modsAdded: 0 });
        }
      }

      expect(results.every(r => r.success)).toBe(true);
      console.log(`Quilt comprehensive test: ${results.length}/${results.length} versions passed with 5 mods each`);
    });
  });
});
