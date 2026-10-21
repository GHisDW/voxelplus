import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import AdmZip from 'adm-zip';

import { LoaderRegistry, FabricLoaderProvider, QuiltLoaderProvider, ForgeLoaderProvider, NeoForgeLoaderProvider } from '../electron/backend/instances/loaderProvider';
import { MultiLoaderProjectScaffolder } from '../electron/backend/instances/multiLoaderProjectScaffolder';
import { MinecraftCompatibilityResolver } from '../electron/backend/instances/minecraftCompatibilityResolver';
import { ModrinthPackImporter } from '../electron/backend/vpack/modrinthPackImporter';
import { CurseForgePackImporter } from '../electron/backend/vpack/curseForgePackImporter';
import { VPackConverter } from '../electron/backend/vpack/vpackConverter';
import { PreflightChecker } from '../electron/backend/instances/preflightChecker';
import { VPackManager } from '../electron/backend/vpack/vpackManager';

describe('Voxel+ 1.1.0 Feature Set: Multi-Loader, Importers, Converter & Preflight', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = path.join(__dirname, '.test-temp-' + crypto.randomUUID());
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (_) {}
  });

  describe('1. Multi-Loader Registry & Providers', () => {
    it('provides all 4 loaders as supported in LoaderRegistry', () => {
      const loaders = LoaderRegistry.getSupportedLoaders();
      expect(loaders.map(l => l.type)).toEqual(['fabric', 'quilt', 'neoforge', 'forge']);
      expect(loaders.every(l => l.isSupported)).toBe(true);
    });

    it('resolves Fabric loader config correctly for 1.21.1 and 26.3', () => {
      const provider = LoaderRegistry.getProvider('fabric');
      expect(provider).toBeInstanceOf(FabricLoaderProvider);

      const cfg121 = provider.resolveConfig('1.21.1');
      expect(cfg121.loaderVersion).toBeDefined();
      expect(cfg121.javaMinVersion).toBe(21);
      expect(['fabric-loom', 'net.fabricmc.fabric-loom']).toContain(cfg121.buildPlugin);

      const cfg263 = provider.resolveConfig('26.3');
      expect(cfg263.javaMinVersion).toBe(24);
      expect(cfg263.javaRecommendedVersion).toBe(25);
    });

    it('resolves Quilt loader config correctly', () => {
      const provider = LoaderRegistry.getProvider('quilt');
      expect(provider).toBeInstanceOf(QuiltLoaderProvider);

      const cfg = provider.resolveConfig('1.21.1');
      expect(cfg.loaderVersion).toBe('0.26.4');
      expect(cfg.buildPlugin).toBe('org.quiltmc.loom');
      expect(cfg.javaMinVersion).toBe(21);
      expect(cfg.mappingsVersion).toContain('quilt-mappings');
    });

    it('resolves Forge loader config correctly', () => {
      const provider = LoaderRegistry.getProvider('forge');
      expect(provider).toBeInstanceOf(ForgeLoaderProvider);

      const cfg = provider.resolveConfig('1.20.1');
      expect(cfg.loaderVersion).toBe('47.3.0');
      expect(cfg.buildPlugin).toBe('net.minecraftforge.gradle');
      expect(cfg.javaMinVersion).toBe(17);

      const cfgLegacy = provider.resolveConfig('1.16.5');
      expect(cfgLegacy.javaMinVersion).toBe(8);
    });

    it('resolves NeoForge loader config correctly', () => {
      const provider = LoaderRegistry.getProvider('neoforge');
      expect(provider).toBeInstanceOf(NeoForgeLoaderProvider);

      const cfg = provider.resolveConfig('1.21.1');
      expect(cfg.loaderVersion).toBe('21.1.72');
      expect(cfg.buildPlugin).toBe('net.neoforged.moddev');
      expect(cfg.javaMinVersion).toBe(21);
    });

    it('scaffolds loader-specific build.gradle files', () => {
      const quiltBuild = MultiLoaderProjectScaffolder.generateBuildGradle('quilt', '1.21.1', 'quilt-test');
      expect(quiltBuild).toContain('org.quiltmc.loom');
      expect(quiltBuild).toContain('quilt-loader');

      const forgeBuild = MultiLoaderProjectScaffolder.generateBuildGradle('forge', '1.20.1', 'forge-test');
      expect(forgeBuild).toContain('net.minecraftforge.gradle');

      const neoForgeBuild = MultiLoaderProjectScaffolder.generateBuildGradle('neoforge', '1.21.1', 'neo-test');
      expect(neoForgeBuild).toContain('net.neoforged.moddev');
    });
  });

  describe('2. Modrinth .mrpack Importer', () => {
    it('validates a correct .mrpack and parses index v1', () => {
      const mrpackPath = path.join(tempDir, 'sample.mrpack');
      const zip = new AdmZip();

      const index = {
        formatVersion: 1,
        game: 'minecraft',
        versionId: '1.0.0',
        name: 'Modrinth Test Pack',
        summary: 'A test pack for Modrinth importer',
        files: [
          {
            path: 'mods/fabric-api.jar',
            hashes: { sha1: '1234567890123456789012345678901234567890' },
            env: { client: 'required', server: 'required' },
            downloads: ['https://cdn.modrinth.com/data/fabric-api.jar'],
            fileSize: 1024
          }
        ],
        dependencies: {
          minecraft: '1.21.1',
          'fabric-loader': '0.16.0'
        }
      };

      zip.addFile('modrinth.index.json', Buffer.from(JSON.stringify(index), 'utf-8'));
      zip.addFile('overrides/config/test.txt', Buffer.from('hello override', 'utf-8'));
      zip.writeZip(mrpackPath);

      const validation = ModrinthPackImporter.validateMrpack(mrpackPath);
      expect(validation.valid).toBe(true);
      expect(validation.index?.name).toBe('Modrinth Test Pack');
      expect(validation.index?.dependencies.minecraft).toBe('1.21.1');
    });

    it('rejects an .mrpack with zip-slip traversal in index files', () => {
      const mrpackPath = path.join(tempDir, 'evil.mrpack');
      const zip = new AdmZip();
      const index = {
        formatVersion: 1,
        game: 'minecraft',
        versionId: '1.0.0',
        name: 'Evil Pack',
        files: [],
        dependencies: { minecraft: '1.21.1' }
      };
      zip.addFile('modrinth.index.json', Buffer.from(JSON.stringify(index), 'utf-8'));
      zip.addFile('evil.txt', Buffer.from('evil'));
      const evilEntry = zip.getEntries().find(e => e.entryName === 'evil.txt');
      if (evilEntry) evilEntry.entryName = '../evil.txt';
      zip.writeZip(mrpackPath);

      const validation = ModrinthPackImporter.validateMrpack(mrpackPath);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('Unsafe archive path'))).toBe(true);
    });

    it('extracts overrides and generates instance files', async () => {
      const mrpackPath = path.join(tempDir, 'with-overrides.mrpack');
      const zip = new AdmZip();

      const index = {
        formatVersion: 1,
        game: 'minecraft',
        versionId: '1.0.0',
        name: 'Override Pack',
        files: [],
        dependencies: {
          minecraft: '1.21.1',
          'quilt-loader': '0.26.4'
        }
      };

      zip.addFile('modrinth.index.json', Buffer.from(JSON.stringify(index), 'utf-8'));
      zip.addFile('overrides/config/custom.json', Buffer.from('{"custom":true}', 'utf-8'));
      zip.writeZip(mrpackPath);

      const targetDir = path.join(tempDir, 'extracted-instance');
      const result = await ModrinthPackImporter.importMrpack(mrpackPath, targetDir);

      expect(result.success).toBe(true);
      expect(fs.existsSync(path.join(targetDir, 'config/custom.json'))).toBe(true);
      expect(fs.existsSync(path.join(targetDir, 'voxel-instance.json'))).toBe(true);
      expect(result.metadata?.loader.type).toBe('quilt');
    });
  });

  describe('3. CurseForge ZIP Importer', () => {
    it('validates a CurseForge pack manifest and resolves loader', () => {
      const cfZipPath = path.join(tempDir, 'curseforge.zip');
      const zip = new AdmZip();

      const manifest = {
        minecraft: {
          version: '1.20.1',
          modLoaders: [{ id: 'forge-47.3.0', primary: true }]
        },
        manifestType: 'minecraftModpack',
        manifestVersion: 1,
        name: 'CurseForge Test Pack',
        version: '1.0.0',
        author: 'CF Author',
        files: [
          { projectID: 12345, fileID: 67890, required: true }
        ],
        overrides: 'overrides'
      };

      zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest), 'utf-8'));
      zip.addFile('overrides/options.txt', Buffer.from('fov:90', 'utf-8'));
      zip.writeZip(cfZipPath);

      const val = CurseForgePackImporter.validateCurseForgePack(cfZipPath);
      expect(val.valid).toBe(true);
      expect(val.manifest?.name).toBe('CurseForge Test Pack');

      const { loaderType, loaderVersion } = CurseForgePackImporter.resolveLoader(val.manifest!.minecraft.modLoaders);
      expect(loaderType).toBe('forge');
      expect(loaderVersion).toBe('47.3.0');
    });

    it('extracts CurseForge overrides into target directory', async () => {
      const cfZipPath = path.join(tempDir, 'cf-overrides.zip');
      const zip = new AdmZip();
      const manifest = {
        minecraft: {
          version: '1.20.1',
          modLoaders: [{ id: 'neoforge-20.4.237', primary: true }]
        },
        manifestType: 'minecraftModpack',
        manifestVersion: 1,
        name: 'NeoForge CF Pack',
        version: '1.0.0',
        author: 'Tester',
        files: [],
        overrides: 'overrides'
      };

      zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest), 'utf-8'));
      zip.addFile('overrides/config/forge.cfg', Buffer.from('enable=true', 'utf-8'));
      zip.writeZip(cfZipPath);

      const targetDir = path.join(tempDir, 'cf-extracted');
      const result = await CurseForgePackImporter.importCurseForgePack(cfZipPath, targetDir);

      expect(result.success).toBe(true);
      expect(fs.existsSync(path.join(targetDir, 'config/forge.cfg'))).toBe(true);
      expect(result.metadata?.loader.type).toBe('neoforge');
    });
  });

  describe('4. Modpack to VPack Converter', () => {
    it('converts a Modrinth .mrpack to a valid Voxel+ .vpack archive', async () => {
      const mrpackPath = path.join(tempDir, 'input.mrpack');
      const vpackPath = path.join(tempDir, 'converted.vpack');
      const zip = new AdmZip();

      const index = {
        formatVersion: 1,
        game: 'minecraft',
        versionId: '1.2.3',
        name: 'Converted Pack',
        summary: 'Converted from Modrinth',
        files: [
          {
            path: 'mods/jei.jar',
            hashes: { sha1: 'abcdef1234567890' },
            env: { client: 'required' },
            downloads: ['https://cdn.modrinth.com/data/jei.jar'],
            fileSize: 500000
          }
        ],
        dependencies: {
          minecraft: '1.21.1',
          'fabric-loader': '0.16.0'
        }
      };

      zip.addFile('modrinth.index.json', Buffer.from(JSON.stringify(index), 'utf-8'));
      zip.addFile('overrides/config/jei.ini', Buffer.from('jei=true', 'utf-8'));
      zip.writeZip(mrpackPath);

      const res = await VPackConverter.convertMrpackToVPack(mrpackPath, vpackPath);
      expect(res.success).toBe(true);
      expect(fs.existsSync(vpackPath)).toBe(true);

      const val = VPackManager.validateVPack(vpackPath);
      expect(val.valid).toBe(true);
      expect(val.manifest?.name).toBe('Converted Pack');
      expect(val.manifest?.content.some(c => c.relativePath === 'mods/jei.jar')).toBe(true);
      expect(val.manifest?.content.some(c => c.relativePath === 'config/jei.ini')).toBe(true);
    });

    it('converts a CurseForge ZIP to a valid Voxel+ .vpack archive', async () => {
      const cfZipPath = path.join(tempDir, 'cf-in.zip');
      const vpackPath = path.join(tempDir, 'cf-converted.vpack');
      const zip = new AdmZip();

      const manifest = {
        minecraft: {
          version: '1.20.1',
          modLoaders: [{ id: 'forge-47.3.0', primary: true }]
        },
        manifestType: 'minecraftModpack',
        manifestVersion: 1,
        name: 'CF Converted',
        version: '1.0.0',
        author: 'CF Author',
        files: [{ projectID: 100, fileID: 200, required: true }],
        overrides: 'overrides'
      };

      zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest), 'utf-8'));
      zip.addFile('overrides/config/test.json', Buffer.from('{"ok":1}', 'utf-8'));
      zip.writeZip(cfZipPath);

      const res = await VPackConverter.convertCurseForgeToVPack(cfZipPath, vpackPath);
      expect(res.success).toBe(true);
      expect(fs.existsSync(vpackPath)).toBe(true);

      const val = VPackManager.validateVPack(vpackPath);
      expect(val.valid).toBe(true);
      expect(val.manifest?.name).toBe('CF Converted');
      expect(val.manifest?.loader.type).toBe('forge');
    });
  });

  describe('5. Preflight Compatibility System', () => {
    it('runs preflight and returns structured report with severity', async () => {
      const report = await PreflightChecker.runPreflight('1.21.1', 'fabric', 4096);
      expect(report.compatibility.minecraftVersion).toBe('1.21.1');
      expect(report.allocatedMemoryMb).toBe(4096);
      expect(['COMPATIBLE', 'INFO', 'WARNING', 'BLOCKING_ERROR']).toContain(report.overallStatus);
      expect(report.issues.length).toBeGreaterThan(0);
    });

    it('reports blocking error if memory allocation exceeds system RAM', async () => {
      const hugeMem = 1024 * 1024; // 1 TB
      const report = await PreflightChecker.runPreflight('1.21.1', 'fabric', hugeMem);
      expect(report.overallStatus).toBe('BLOCKING_ERROR');
      expect(report.isLaunchable).toBe(false);
      expect(report.issues.some(i => i.category === 'MEMORY' && i.severity === 'BLOCKING_ERROR')).toBe(true);
    });

    it('reports blocking error if instanceDir is missing or gradlew.bat is absent', async () => {
      const fakeDir = path.join(tempDir, 'nonexistent-instance');
      const report = await PreflightChecker.runPreflight('1.21.1', 'fabric', 4096, fakeDir);
      expect(report.overallStatus).toBe('BLOCKING_ERROR');
      expect(report.isLaunchable).toBe(false);
      expect(report.issues.some(i => i.category === 'FILESYSTEM')).toBe(true);
    });
  });
});
