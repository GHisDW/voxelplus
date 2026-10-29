/**
 * Launcher update policy tests.
 *
 * These cover the pure rules that decide whether a GitHub release is newer,
 * which asset to download, when an update is mandatory, and that the Windows
 * swap script never touches user data.
 */
import { describe, it, expect } from 'vitest';
import {
  compareVersions,
  isMandatoryUpdate,
  isNewerVersion,
  parseSha256Digest,
  parseVersion,
  selectUpdateAsset
} from '../electron/backend/updates/updatePolicy';
import { buildApplyUpdateScript } from '../electron/backend/updates/applyScript';

describe('version parsing and comparison', () => {
  it('parses release tags with and without a v prefix', () => {
    expect(parseVersion('v1.2.3')).toMatchObject({ major: 1, minor: 2, patch: 3 });
    expect(parseVersion('1.2.3')).toMatchObject({ major: 1, minor: 2, patch: 3 });
    expect(parseVersion('1.2.3+build.9')).toMatchObject({ major: 1, minor: 2, patch: 3 });
    expect(parseVersion('1.2.3-beta.1')?.prerelease).toEqual(['beta', '1']);
  });

  it('rejects malformed versions', () => {
    expect(parseVersion('')).toBeNull();
    expect(parseVersion('latest')).toBeNull();
    expect(parseVersion('1.2')).toBeNull();
  });

  it('orders versions semantically', () => {
    expect(compareVersions('1.0.0', '1.0.1')).toBe(-1);
    expect(compareVersions('1.9.9', '1.10.0')).toBe(-1);
    expect(compareVersions('2.0.0', '1.99.99')).toBe(1);
    expect(compareVersions('1.2.0', '1.2.0')).toBe(0);
    expect(compareVersions('v1.2.0', '1.2.0')).toBe(0);
  });

  it('treats a release as newer than its prereleases', () => {
    expect(compareVersions('1.2.0-beta.2', '1.2.0')).toBe(-1);
    expect(compareVersions('1.2.0', '1.2.0-beta.2')).toBe(1);
    expect(compareVersions('1.2.0-beta.10', '1.2.0-beta.9')).toBe(1);
  });

  it('never reports an invalid candidate as an upgrade', () => {
    expect(isNewerVersion('not-a-version', '1.1.1')).toBe(false);
    expect(isNewerVersion('1.1.2', '1.1.1')).toBe(true);
  });
});

describe('update asset selection', () => {
  it('prefers the portable Windows build and parses its digest', () => {
    const asset = selectUpdateAsset([
      { name: 'VoxelPlus-Setup-1.2.0.exe', browser_download_url: 'https://github.com/x/setup.exe', size: 100, digest: null },
      {
        name: 'VoxelPlus-Portable-1.2.0.exe',
        browser_download_url: 'https://github.com/x/portable.exe',
        size: 200,
        digest: 'sha256:' + 'a'.repeat(64)
      },
      { name: 'latest.yml', browser_download_url: 'https://github.com/x/latest.yml' }
    ]);

    expect(asset?.name).toBe('VoxelPlus-Portable-1.2.0.exe');
    expect(asset?.url).toBe('https://github.com/x/portable.exe');
    expect(asset?.size).toBe(200);
    expect(asset?.sha256).toBe('a'.repeat(64));
  });

  it('ignores non-executable artefacts', () => {
    expect(selectUpdateAsset([
      { name: 'VoxelPlus-Portable-1.2.0.exe.blockmap', browser_download_url: 'https://github.com/x/a.blockmap' },
      { name: 'notes.txt', browser_download_url: 'https://github.com/x/notes.txt' }
    ])).toBeNull();
  });

  it('only accepts well-formed sha256 digests', () => {
    expect(parseSha256Digest('sha256:' + 'B'.repeat(64))).toBe('b'.repeat(64));
    expect(parseSha256Digest('sha512:' + 'b'.repeat(64))).toBeNull();
    expect(parseSha256Digest(null)).toBeNull();
  });
});

describe('mandatory update policy', () => {
  it('forces major upgrades', () => {
    expect(isMandatoryUpdate('1.1.1', { tag_name: 'v2.0.0', body: 'Big rewrite' })).toBe(true);
  });

  it('keeps routine minor/patch releases optional', () => {
    expect(isMandatoryUpdate('1.1.1', { tag_name: 'v1.2.0', body: 'New features' })).toBe(false);
    expect(isMandatoryUpdate('1.1.1', { tag_name: 'v1.1.2', body: 'Bug fixes' })).toBe(false);
  });

  it('honours explicit release markers', () => {
    expect(isMandatoryUpdate('1.1.1', { tag_name: 'v1.2.0', body: 'Security fix [mandatory]' })).toBe(true);
    expect(isMandatoryUpdate('1.1.1', { tag_name: 'v1.2.0', name: '[FORCE UPDATE]' })).toBe(true);
    expect(isMandatoryUpdate('1.1.1', { tag_name: 'v1.2.0', body: '<!-- voxelplus:mandatory -->' })).toBe(true);
  });

  it('honours a declared minimum supported version', () => {
    expect(isMandatoryUpdate('1.1.1', { tag_name: 'v1.2.0', body: '[min:1.2.0] protocol change' })).toBe(true);
    expect(isMandatoryUpdate('1.2.0', { tag_name: 'v1.3.0', body: '[minimum version: 1.2.0]' })).toBe(false);
  });

  it('never forces an update for the running version or older', () => {
    expect(isMandatoryUpdate('1.2.0', { tag_name: 'v1.2.0', body: '[mandatory]' })).toBe(false);
    expect(isMandatoryUpdate('1.2.0', { tag_name: 'v1.1.0', body: '[mandatory]' })).toBe(false);
  });
});

describe('Windows update helper script', () => {
  it('waits for the launcher, swaps the exe and keeps a backup', () => {
    const script = buildApplyUpdateScript();
    expect(script).toContain('tasklist');
    expect(script).toContain('copy /Y "%SRC%" "%DST%"');
    expect(script).toContain('"%DST%.old"');
    expect(script).toContain('start "" "%DST%"');
  });

  it('takes paths as arguments instead of embedding them', () => {
    const script = buildApplyUpdateScript();
    expect(script).toContain('set "SRC=%~2"');
    expect(script).toContain('set "DST=%~3"');
    expect(script).not.toMatch(/[A-Za-z]:\\\\/);
  });

  it('never references user data folders', () => {
    const script = buildApplyUpdateScript();
    for (const folder of ['instances', 'config', 'vpacks', 'saves', 'logs', 'downloads']) {
      expect(script.toLowerCase()).not.toContain(folder);
    }
  });
});
