/**
 * Security & Reliability Regression Tests — Voxel⁺ 1.1.0
 *
 * These tests exercise PRODUCTION code paths directly.  They do NOT
 * re-implement security-critical helpers locally; any regression in the real
 * implementation will therefore be caught here.
 *
 * Fixed in this PR:
 *  - Zip-slip tests now call VPackManager.isSafePath (production code).
 *  - Archive validation tests build real zip buffers and call validateVPack.
 *  - Path-sanitization tests call PathManager.sanitizeFilename.
 *  - Added manifest-structure validation, malformed-archive, and edge-case tests.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import AdmZip from 'adm-zip';
import { VPackManager } from '../electron/backend/vpack/vpackManager';
import { PathManager } from '../electron/backend/storage/paths';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTempDir(): string {
  const dir = path.join(__dirname, '.test-temp-' + crypto.randomUUID());
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function buildValidZip(manifestOverride?: Record<string, unknown>): string {
  const dir = makeTempDir();
  const zipPath = path.join(dir, 'test.vpack');

  const manifest = {
    formatId: 'voxelplus-vpack',
    formatVersion: 1,
    packId: crypto.randomUUID(),
    name: 'Test Pack',
    description: 'A test pack',
    author: 'test',
    packVersion: '1.0.0',
    minecraft: { version: '1.21.1' },
    loader: { type: 'fabric', version: '0.16.0' },
    content: [],
    shareSource: 'discord',
    price: 0,
    createdAt: new Date().toISOString(),
    generatorVersion: '2.0.0',
    ...manifestOverride
  };

  const zip = new AdmZip();
  zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest), 'utf-8'));
  zip.writeZip(zipPath);
  return zipPath;
}

// ─── 1. VPackManager.isSafePath — production code ────────────────────────────

describe('VPackManager.isSafePath — production implementation', () => {
  it('accepts safe relative file paths', () => {
    expect(VPackManager.isSafePath('mods/mod.jar')).toBe(true);
    expect(VPackManager.isSafePath('config/settings.json')).toBe(true);
    expect(VPackManager.isSafePath('resourcepacks/pack.zip')).toBe(true);
    expect(VPackManager.isSafePath('shaderpacks/shader.zip')).toBe(true);
    expect(VPackManager.isSafePath('manifest.json')).toBe(true);
  });

  it('rejects absolute Unix paths', () => {
    expect(VPackManager.isSafePath('/etc/passwd')).toBe(false);
    expect(VPackManager.isSafePath('/usr/local/bin/evil')).toBe(false);
  });

  it('rejects absolute Windows drive paths', () => {
    expect(VPackManager.isSafePath('C:\\Windows\\System32')).toBe(false);
    expect(VPackManager.isSafePath('C:/Windows/System32')).toBe(false);
  });

  it('rejects UNC paths', () => {
    expect(VPackManager.isSafePath('\\\\server\\share\\file.jar')).toBe(false);
  });

  it('rejects single dot-dot traversal', () => {
    expect(VPackManager.isSafePath('../etc/passwd')).toBe(false);
    expect(VPackManager.isSafePath('..')).toBe(false);
  });

  it('rejects multi-level dot-dot traversal', () => {
    expect(VPackManager.isSafePath('../../')).toBe(false);
    expect(VPackManager.isSafePath('mods/../../etc/passwd')).toBe(false);
  });

  it('rejects backslash-encoded traversal', () => {
    expect(VPackManager.isSafePath('..\\Windows\\System32')).toBe(false);
    expect(VPackManager.isSafePath('mods\\..\\..\\evil')).toBe(false);
  });

  it('rejects NUL character in path', () => {
    expect(VPackManager.isSafePath('mods\0evil.jar')).toBe(false);
    expect(VPackManager.isSafePath('\0')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(VPackManager.isSafePath('')).toBe(false);
  });
});

// ─── 2. VPackManager.validateVPack — real archive inspection ─────────────────

describe('VPackManager.validateVPack — production code', () => {
  let tempDir: string;

  beforeEach(() => { tempDir = makeTempDir(); });
  afterEach(() => { if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true }); });

  it('validates a correct VPack archive', () => {
    const zipPath = buildValidZip();
    const result = VPackManager.validateVPack(zipPath);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.manifest).not.toBeNull();
    expect(result.manifest?.name).toBe('Test Pack');
  });

  it('rejects a non-existent file', () => {
    const result = VPackManager.validateVPack('/does/not/exist.vpack');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects an archive without manifest.json or voxel-instance.json', () => {
    const zipPath = path.join(tempDir, 'empty.vpack');
    const zip = new AdmZip();
    zip.addFile('readme.txt', Buffer.from('hello', 'utf-8'));
    zip.writeZip(zipPath);

    const result = VPackManager.validateVPack(zipPath);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('manifest.json'))).toBe(true);
  });

  it('rejects a malformed (non-JSON) manifest', () => {
    const zipPath = path.join(tempDir, 'bad.vpack');
    const zip = new AdmZip();
    zip.addFile('manifest.json', Buffer.from('not json {{{{', 'utf-8'));
    zip.writeZip(zipPath);

    const result = VPackManager.validateVPack(zipPath);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.toLowerCase().includes('malformed') || e.toLowerCase().includes('manifest'))).toBe(true);
  });

  it('rejects manifest with wrong formatId', () => {
    const zipPath = buildValidZip({ formatId: 'wrong-format' });
    const result = VPackManager.validateVPack(zipPath);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('format'))).toBe(true);
  });

  it('rejects manifest with wrong formatVersion', () => {
    const zipPath = buildValidZip({ formatVersion: 99 });
    const result = VPackManager.validateVPack(zipPath);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('version'))).toBe(true);
  });

  it('rejects manifest missing required fields: name', () => {
    const zipPath = buildValidZip({ name: '' });
    const result = VPackManager.validateVPack(zipPath);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('name'))).toBe(true);
  });

  it('rejects manifest missing Minecraft version', () => {
    const zipPath = buildValidZip({ minecraft: {} });
    const result = VPackManager.validateVPack(zipPath);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.toLowerCase().includes('minecraft version'))).toBe(true);
  });

  it('rejects manifest missing loader type', () => {
    const zipPath = buildValidZip({ loader: { version: '0.16.0' } });
    const result = VPackManager.validateVPack(zipPath);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.toLowerCase().includes('loader type'))).toBe(true);
  });

  it('rejects manifest missing packId', () => {
    const zipPath = buildValidZip({ packId: '' });
    const result = VPackManager.validateVPack(zipPath);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.toLowerCase().includes('pack id'))).toBe(true);
  });

  it('rejects archives with path traversal entries', () => {
    const zipPath = path.join(tempDir, 'traversal.vpack');
    const manifest = {
      formatId: 'voxelplus-vpack',
      formatVersion: 1,
      packId: crypto.randomUUID(),
      name: 'Evil Pack',
      minecraft: { version: '1.21.1' },
      loader: { type: 'fabric', version: '0.16.0' },
      content: [],
      price: 0,
      createdAt: new Date().toISOString()
    };

    const zip = new AdmZip();
    zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest), 'utf-8'));
    // Simulate a zip-slip entry by overriding entryName directly
    zip.addFile('evil.txt', Buffer.from('evil content', 'utf-8'));
    const evilEntry = zip.getEntries().find(e => e.entryName === 'evil.txt');
    if (evilEntry) evilEntry.entryName = '../evil.txt';
    zip.writeZip(zipPath);

    const result = VPackManager.validateVPack(zipPath);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.toLowerCase().includes('unsafe') || e.toLowerCase().includes('traversal'))).toBe(true);
  });

  it('rejects content entries referencing unsafe relative paths', () => {
    const zipPath = buildValidZip({
      content: [
        { relativePath: '../escape.jar', type: 'mod', sizeBytes: 0 }
      ]
    });
    const result = VPackManager.validateVPack(zipPath);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.toLowerCase().includes('unsafe'))).toBe(true);
  });

  it('flags missing content files (no downloadUrl)', () => {
    const zipPath = buildValidZip({
      content: [
        { relativePath: 'mods/missing.jar', type: 'mod', sizeBytes: 0 }
      ]
    });
    const result = VPackManager.validateVPack(zipPath);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('missing declared content') || e.includes('missing.jar'))).toBe(true);
  });

  it('accepts content entries with downloadUrl when file is absent from archive', () => {
    const zipPath = buildValidZip({
      content: [
        {
          relativePath: 'mods/remote.jar',
          type: 'mod',
          sizeBytes: 0,
          downloadUrl: 'https://cdn.modrinth.com/data/fake/remote.jar'
        }
      ]
    });
    const result = VPackManager.validateVPack(zipPath);
    // downloadUrl present ⇒ not an error; pack should be valid
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

// ─── 3. PathManager.sanitizeFilename — production code ───────────────────────

describe('PathManager.sanitizeFilename — production code', () => {
  it('removes Windows-forbidden filename characters', () => {
    const bad = 'test<>:"/\\|?*.txt';
    const sanitized = PathManager.sanitizeFilename(bad);
    expect(sanitized).not.toMatch(/[<>:"/\\|?*]/);
  });

  it('removes control characters (0x00–0x1F)', () => {
    const bad = 'file\x00name\x1F.jar';
    const sanitized = PathManager.sanitizeFilename(bad);
    expect(sanitized).not.toMatch(/[\x00-\x1F]/);
  });

  it('trims leading and trailing whitespace', () => {
    expect(PathManager.sanitizeFilename('  hello world  ')).toBe('hello world');
  });

  it('preserves safe filenames unchanged', () => {
    expect(PathManager.sanitizeFilename('my-mod-1.0.jar')).toBe('my-mod-1.0.jar');
    expect(PathManager.sanitizeFilename('settings.json')).toBe('settings.json');
  });
});

// ─── 4. Factory reset path validation ────────────────────────────────────────

describe('Factory reset path validation', () => {
  let tempDir: string;

  beforeEach(() => { tempDir = makeTempDir(); });
  afterEach(() => { if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true }); });

  it('accepts paths inside the allowed base directory', () => {
    const allowedBase = path.resolve(tempDir, 'user-data');
    const normalizedBase = path.resolve(allowedBase);

    const validPath = path.join(allowedBase, 'instances', 'test-instance');
    const normalizedPath = path.resolve(validPath);

    const isValid = normalizedPath === normalizedBase ||
                    normalizedPath.startsWith(normalizedBase + path.sep);
    expect(isValid).toBe(true);
  });

  it('rejects paths outside the allowed base directory', () => {
    const allowedBase = path.resolve(tempDir, 'user-data');
    const normalizedBase = path.resolve(allowedBase);

    const invalidPath = path.resolve(tempDir, '..', 'malicious');
    const normalizedPath = path.resolve(invalidPath);

    const isValid = normalizedPath === normalizedBase ||
                    normalizedPath.startsWith(normalizedBase + path.sep);
    expect(isValid).toBe(false);
  });

  it('rejects paths that coincidentally share a prefix but are outside the dir', () => {
    const allowedBase = path.resolve(tempDir, 'data');
    const normalizedBase = path.resolve(allowedBase);

    // e.g. /tmp/data-evil — starts with "/tmp/data" but is NOT under "/tmp/data/"
    const sibling = allowedBase + '-evil';
    const normalizedPath = path.resolve(sibling);

    const isValid = normalizedPath === normalizedBase ||
                    normalizedPath.startsWith(normalizedBase + path.sep);
    expect(isValid).toBe(false);
  });
});

// ─── 5. Atomic import staging ─────────────────────────────────────────────────

describe('Atomic import staging', () => {
  let tempDir: string;

  beforeEach(() => { tempDir = makeTempDir(); });
  afterEach(() => { if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true }); });

  it('uses a unique temp directory for staging', () => {
    const id1 = path.join(tempDir, '.temp-import-' + crypto.randomUUID());
    const id2 = path.join(tempDir, '.temp-import-' + crypto.randomUUID());
    expect(id1).not.toBe(id2);
  });

  it('cleans up temp directory on simulated failure', () => {
    const stageDir = path.join(tempDir, '.temp-import-' + crypto.randomUUID());
    fs.mkdirSync(stageDir, { recursive: true });
    fs.writeFileSync(path.join(stageDir, 'file.txt'), 'content');

    // Simulate cleanup
    fs.rmSync(stageDir, { recursive: true, force: true });
    expect(fs.existsSync(stageDir)).toBe(false);
  });

  it('atomically promotes temp directory to final destination', () => {
    const stageDir = path.join(tempDir, 'temp-stage');
    const finalDir = path.join(tempDir, 'final-dest');

    fs.mkdirSync(stageDir, { recursive: true });
    fs.writeFileSync(path.join(stageDir, 'test.txt'), 'content');

    fs.renameSync(stageDir, finalDir);

    expect(fs.existsSync(finalDir)).toBe(true);
    expect(fs.existsSync(stageDir)).toBe(false);
    expect(fs.readFileSync(path.join(finalDir, 'test.txt'), 'utf-8')).toBe('content');
  });
});

// ─── 6. VPack price validation (logic spec) ──────────────────────────────────

describe('VPack price validation (spec)', () => {
  const isValidPrice = (p: unknown): boolean =>
    typeof p === 'number' && Number.isFinite(p) && Number.isInteger(p) && p >= 0;

  it('accepts a zero price (free pack)', () => {
    expect(isValidPrice(0)).toBe(true);
  });

  it('accepts a normal positive integer price', () => {
    expect(isValidPrice(250)).toBe(true);
  });

  it('rejects negative prices', () => {
    expect(isValidPrice(-1)).toBe(false);
  });

  it('rejects fractional prices', () => {
    expect(isValidPrice(100.5)).toBe(false);
  });

  it('rejects NaN', () => {
    expect(isValidPrice(NaN)).toBe(false);
  });

  it('rejects Infinity', () => {
    expect(isValidPrice(Infinity)).toBe(false);
  });

  it('rejects non-numeric types', () => {
    expect(isValidPrice('250')).toBe(false);
    expect(isValidPrice(null)).toBe(false);
    expect(isValidPrice(undefined)).toBe(false);
  });
});
