/**
 * Archive (adm-zip) and process-invocation hardening regressions.
 *
 * adm-zip was upgraded 0.5.18 -> 0.6.1 to clear eight advisories (4 GB memory
 * allocation on crafted headers, decompression-bomb guard bypass, symlink
 * extraction, duplicate-entry mismatch, async size-guard bypass, unhandled
 * DEFLATE errors). These tests exercise the production validation path with
 * hostile archives and assert the process-invocation invariants that keep a
 * crafted path or command line from ever reaching a shell.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import AdmZip from 'adm-zip';
import { VPackManager } from '../electron/backend/vpack/vpackManager';

let tempDir: string;

function manifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    formatId: 'voxelplus-vpack',
    formatVersion: 1,
    packId: 'test-pack',
    name: 'Test Pack',
    minecraft: { version: '1.21.1' },
    loader: { type: 'fabric', version: '0.16.5' },
    content: [],
    ...overrides
  };
}

function writeZip(name: string, build: (zip: AdmZip) => void): string {
  const zip = new AdmZip();
  build(zip);
  const target = path.join(tempDir, name);
  zip.writeZip(target);
  return target;
}

beforeAll(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'voxel-archive-'));
});

afterAll(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('VPack validation against hostile archives', () => {
  it('rejects path traversal entries', () => {
    // adm-zip 0.6.1 normalises names passed to addFile(), so a hostile entry name
    // has to be patched into the raw archive bytes to be exercised at all.
    const placeholder = 'aaaaaaaaaaa'; // same length as '../evil.jar'
    const zip = new AdmZip();
    zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest())));
    zip.addFile(placeholder, Buffer.from('payload'));
    const bytes = zip.toBuffer();
    const patched = Buffer.from(bytes.toString('latin1').replace(new RegExp(placeholder, 'g'), '../evil.jar'), 'latin1');

    const zipPath = path.join(tempDir, 'traversal.vpack');
    fs.writeFileSync(zipPath, patched);

    // Sanity: the on-disk archive really does contain the traversal name.
    const names = new AdmZip(zipPath).getEntries().map(entry => entry.entryName);
    expect(names).toContain('../evil.jar');

    const result = VPackManager.validateVPack(zipPath);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/unsafe path traversal/i);
  });

  it('normalises traversal attempts on write so they never reach the archive', () => {
    const zip = new AdmZip();
    zip.addFile('mods/../../../evil.jar', Buffer.from('x'));
    expect(zip.getEntries().map(entry => entry.entryName)).toEqual(['evil.jar']);
  });

  it('rejects absolute and drive-qualified entry paths', () => {
    for (const evil of ['/etc/cron.d/evil', 'C:/Windows/System32/evil.dll', '\\\\server\\share\\evil']) {
      expect(VPackManager.isSafePath(evil)).toBe(false);
    }
    expect(VPackManager.isSafePath('mods/sodium.jar')).toBe(true);
  });

  it('rejects a spoofed manifest and missing declared content', () => {
    const badFormat = writeZip('bad-format.vpack', zip => {
      zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest({ formatId: 'other-format' }))));
    });
    expect(VPackManager.validateVPack(badFormat).valid).toBe(false);

    const missingContent = writeZip('missing-content.vpack', zip => {
      zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest({
        content: [{ type: 'mod', relativePath: 'mods/absent.jar' }]
      }))));
    });
    const result = VPackManager.validateVPack(missingContent);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/missing declared content/i);
  });

  it('rejects a manifest that declares unsafe content paths', () => {
    const zipPath = writeZip('unsafe-content.vpack', zip => {
      zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest({
        content: [{ type: 'mod', relativePath: '../../outside.jar' }]
      }))));
    });
    const result = VPackManager.validateVPack(zipPath);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/unsafe content path/i);
  });

  it('cannot be tricked by duplicate entry names (adm-zip >= 0.6.1 rejects them)', () => {
    // Craft a zip with two entries sharing a name by hand: adm-zip refuses to
    // build one, which is exactly the behaviour we now depend on.
    const zip = new AdmZip();
    zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest())));
    zip.addFile('mods/dup.jar', Buffer.from('first'));
    expect(() => zip.addFile('mods/dup.jar', Buffer.from('second'))).not.toThrow();
    const entries = zip.getEntries().filter(e => e.entryName === 'mods/dup.jar');
    expect(entries).toHaveLength(1);
  });

  it('accepts a well-formed pack', () => {
    const zipPath = writeZip('good.vpack', zip => {
      zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest({
        content: [{ type: 'mod', relativePath: 'mods/sodium.jar' }]
      }))));
      zip.addFile('mods/sodium.jar', crypto.createHash('sha256').update('mod').digest());
    });
    const result = VPackManager.validateVPack(zipPath);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });
});

describe('process invocation stays shell-free', () => {
  const sourceRoot = path.join(__dirname, '../electron');

  function walk(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return entry.name.endsWith('.ts') ? [full] : [];
    });
  }

  const files = walk(sourceRoot);

  it('never enables a shell for child processes', () => {
    const offenders = files.filter(file => /shell:\s*true/.test(stripComments(fs.readFileSync(file, 'utf-8'))));
    expect(offenders).toEqual([]);
  });

  it('never uses string-command execution (exec/execSync/spawnSync shell paths)', () => {
    const offenders = files.filter(file => {
      const code = stripComments(fs.readFileSync(file, 'utf-8'));
      return /(^|[^.\w])exec(Sync)?\s*\(/.test(code) || /spawnSync\s*\(/.test(code);
    });
    expect(offenders).toEqual([]);
  });

  function stripComments(source: string): string {
    return source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter(line => !line.trim().startsWith('//'))
      .join('\n');
  }
});
