import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { InstanceMetadataStore } from '../electron/backend/instances/metadata';
import { InstanceMetadata } from '../electron/types';

describe('Phase 1 - Metadata Migration & Skin Removal', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'voxel-meta-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('safely strips legacy skinId on write without crashing or corrupting metadata', () => {
    const metaWithLegacySkin: any = {
      schemaVersion: 1,
      id: 'inst-test-1',
      name: 'Legacy Skin Instance',
      minecraft: { version: '1.20.1' },
      loader: { type: 'fabric', version: '0.15.11' },
      runtime: { memoryMb: 4096, java: 'auto', jvmArgs: [] },
      appearance: {
        artwork: 'preset-1',
        item: 'minecraft:diamond',
        skinId: 'legacy-skin-uuid-1234'
      },
      status: 'STOPPED',
      createdAt: '2026-01-01T00:00:00.000Z',
      lastPlayedAt: null,
      totalPlayTimeMinutes: 0
    };

    InstanceMetadataStore.writeMetadata(tmpDir, metaWithLegacySkin as InstanceMetadata);
    const readBack = InstanceMetadataStore.readMetadata(tmpDir);

    expect(readBack).not.toBeNull();
    expect(readBack?.id).toBe('inst-test-1');
    expect(readBack?.name).toBe('Legacy Skin Instance');
    expect(readBack?.appearance.artwork).toBe('preset-1');
    expect(readBack?.appearance.item).toBe('minecraft:diamond');
    expect((readBack?.appearance as any).skinId).toBeUndefined();
  });
});
