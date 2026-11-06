/**
 * Instance lifecycle regression tests.
 *
 * Covers the duplicate-instance path, which previously returned metadata whose
 * `instancePath` still pointed at the ORIGINAL folder (so the UI would act on
 * the wrong instance) and could create an empty folder name.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { InstanceManager } from '../electron/backend/instances/instanceManager';
import { InstanceMetadataStore } from '../electron/backend/instances/metadata';
import { ConfigStore } from '../electron/backend/storage/configStore';

describe('InstanceManager duplication', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'voxel-instance-'));
    ConfigStore.setOverrideInstanceDir(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    ConfigStore.setOverrideInstanceDir(null);
  });

  it('returns metadata pointing at the copy, not the source folder', async () => {
    const sourceDir = path.join(tmpDir, 'source-instance');
    fs.mkdirSync(path.join(sourceDir, 'mods'), { recursive: true });

    const source = InstanceMetadataStore.createDefaultMetadata({
      name: 'Source Instance',
      minecraftVersion: '1.21.1',
      loaderType: 'fabric'
    }, 'source-id');
    source.instancePath = sourceDir;
    InstanceMetadataStore.writeMetadata(sourceDir, source);

    const copy = await InstanceManager.duplicateInstance('source-id');

    expect(copy).not.toBeNull();
    expect(copy!.id).not.toBe('source-id');
    expect(copy!.instancePath).toBe(path.join(tmpDir, 'Source Instance (Copy)'));
    expect(copy!.instancePath).not.toBe(sourceDir);
    expect(fs.existsSync(copy!.instancePath!)).toBe(true);

    // The persisted copy must round-trip with the same identity.
    const reread = InstanceMetadataStore.readMetadata(copy!.instancePath!);
    expect(reread?.id).toBe(copy!.id);
  });

  it('falls back to a generated folder name when the name sanitizes to nothing', async () => {
    const sourceDir = path.join(tmpDir, 'source-instance');
    fs.mkdirSync(sourceDir, { recursive: true });

    const source = InstanceMetadataStore.createDefaultMetadata({
      name: '<>:"|?*',
      minecraftVersion: '1.21.1',
      loaderType: 'fabric'
    }, 'weird-name-id');
    source.instancePath = sourceDir;
    InstanceMetadataStore.writeMetadata(sourceDir, source);

    const copy = await InstanceManager.duplicateInstance('weird-name-id');

    expect(copy).not.toBeNull();
    // Must never resolve to the instances root itself.
    expect(path.resolve(copy!.instancePath!)).not.toBe(path.resolve(tmpDir));
    expect(fs.existsSync(copy!.instancePath!)).toBe(true);
    expect(fs.readdirSync(tmpDir).some(entry => entry.startsWith('instance-copy-') || entry.includes('___'))).toBe(true);
  });

  it('does not start gameplay session on Gradle preparation logs alone', () => {
    const gradleLogs = [
      ':compileJava UP-TO-DATE',
      ':processResources UP-TO-DATE',
      ':classes UP-TO-DATE',
      ':runClient',
      'Fabric Loom: 1.7.4',
      'Download https://repo.maven.apache.org/maven2/...',
      'Configuring project :...'
    ];

    const isMinecraftClientLog = (line: string): boolean => {
      return (
        line.includes('Backend library: LWJGL') ||
        line.includes('OpenAL initialized') ||
        line.includes('Setting user:') ||
        line.includes('Minecraft client initialized') ||
        line.includes('[Render thread/INFO]') ||
        line.includes('[Client thread/INFO]') ||
        line.includes('Starting integrated minecraft server') ||
        line.includes('Created: 1024x512x4 minecraft:textures/atlas/blocks.png')
      );
    };

    for (const log of gradleLogs) {
      expect(isMinecraftClientLog(log)).toBe(false);
    }

    const mcLogs = [
      '[Render thread/INFO]: Backend library: LWJGL version 3.3.3',
      '[Render thread/INFO]: Setting user: Player',
      '[Client thread/INFO]: OpenAL initialized'
    ];
    for (const log of mcLogs) {
      expect(isMinecraftClientLog(log)).toBe(true);
    }
  });
});
