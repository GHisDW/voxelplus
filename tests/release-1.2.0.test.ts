/**
 * Voxel+ 1.2.0 release regressions.
 *
 * Covers the fixes made for the 1.2.0 release:
 *  - the auto-updater must never pick an installer as the portable replacement;
 *  - the apply script must keep a rollback copy and must not touch user data;
 *  - renderer-supplied IPC arguments are validated before reaching the FS;
 *  - light/dark theme token parity and single OS-theme listener registration.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { isPortableAssetName, selectUpdateAsset } from '../electron/backend/updates/updatePolicy';
import { buildApplyUpdateScript } from '../electron/backend/updates/applyScript';
import {
  IpcValidationError,
  requireAbsolutePath,
  requireFilename,
  requireInstanceId,
  requireJavaMajorVersion,
  requireHttpsUrl,
  requireString,
  sanitizeDialogFilters
} from '../electron/backend/ipc/validate';

describe('update asset selection (portable only)', () => {
  it('rejects releases that only ship an installer', () => {
    expect(selectUpdateAsset([
      { name: 'VoxelPlus-Setup-1.2.0.exe', browser_download_url: 'https://github.com/x/setup.exe', size: 100, digest: 'sha256:' + 'a'.repeat(64) },
      { name: 'VoxelPlus-1.2.0.exe', browser_download_url: 'https://github.com/x/plain.exe', size: 100 }
    ])).toBeNull();
  });

  it('never treats NSIS/installer payloads as portable executables', () => {
    expect(isPortableAssetName('VoxelPlus-Portable-1.2.0.exe')).toBe(true);
    expect(isPortableAssetName('VoxelPlus-Setup-1.2.0.exe')).toBe(false);
    expect(isPortableAssetName('VoxelPlus-Installer-1.2.0.exe')).toBe(false);
    expect(isPortableAssetName('voxelplus-1.2.0-web-setup.exe')).toBe(false);
    expect(isPortableAssetName('VoxelPlus-Portable-1.2.0.zip')).toBe(false);
  });

  it('keeps the published digest and size of the portable build', () => {
    const asset = selectUpdateAsset([
      { name: 'VoxelPlus-Setup-1.2.0.exe', browser_download_url: 'https://github.com/x/setup.exe', size: 10 },
      { name: 'VoxelPlus-Portable-1.2.0.exe', browser_download_url: 'https://github.com/x/portable.exe', size: 2048, digest: 'sha256:' + 'B'.repeat(64) }
    ]);
    expect(asset?.name).toBe('VoxelPlus-Portable-1.2.0.exe');
    expect(asset?.size).toBe(2048);
    expect(asset?.sha256).toBe('b'.repeat(64));
  });

  it('ignores assets without a size so an unverifiable file is never staged', () => {
    const asset = selectUpdateAsset([
      { name: 'VoxelPlus-Portable-1.2.0.exe', browser_download_url: 'https://github.com/x/portable.exe' }
    ]);
    expect(asset?.size).toBe(0);
  });
});

describe('apply-update script safety', () => {
  const script = buildApplyUpdateScript();

  it('keeps the .old backup after a successful swap', () => {
    expect(script).toContain('backup kept as %DST%.old');
    // The success branch must not delete the rollback copy.
    const successBranch = script.slice(script.indexOf(':done'));
    expect(successBranch).not.toContain('del /f /q "%DST%.old"');
  });

  it('restores the previous launcher when the copy fails', () => {
    const restoreBranch = script.slice(script.indexOf(':restore'), script.indexOf(':nosource'));
    expect(restoreBranch).toContain('copy /Y "%DST%.old" "%DST%"');
    expect(restoreBranch).toContain('start "" "%DST%"');
  });

  it('aborts without touching anything when the download is missing', () => {
    expect(script).toContain(':nosource');
    expect(script).toContain('launcher left unchanged');
  });

  it('never references instance data, config or vpacks', () => {
    expect(script).not.toMatch(/instances|config|vpacks|portable\\/i);
  });
});

describe('IPC argument validation', () => {
  it('rejects path traversal in instance ids', () => {
    expect(() => requireInstanceId('../etc')).toThrow(IpcValidationError);
    expect(() => requireInstanceId('a/b')).toThrow(IpcValidationError);
    expect(() => requireInstanceId('')).toThrow(IpcValidationError);
    expect(requireInstanceId('0f0f0f0f-1111-2222-3333-444455556666')).toBe('0f0f0f0f-1111-2222-3333-444455556666');
  });

  it('rejects filenames that escape the content folder', () => {
    expect(() => requireFilename('../../config/options.txt')).toThrow(IpcValidationError);
    expect(() => requireFilename('sub/mod.jar')).toThrow(IpcValidationError);
    expect(() => requireFilename('C:\\evil.jar')).toThrow(IpcValidationError);
    expect(requireFilename('sodium-0.5.jar')).toBe('sodium-0.5.jar');
  });

  it('requires absolute paths and blocks parent segments', () => {
    expect(() => requireAbsolutePath('relative/path')).toThrow(IpcValidationError);
    expect(() => requireAbsolutePath('/tmp/../etc/passwd')).toThrow(IpcValidationError);
    expect(requireAbsolutePath('/tmp/export.voxelplus')).toBe('/tmp/export.voxelplus');
    expect(requireAbsolutePath('C:\\Users\\me\\export.zip')).toBe('C:\\Users\\me\\export.zip');
  });

  it('whitelists Java major versions', () => {
    expect(requireJavaMajorVersion(21)).toBe(21);
    expect(requireJavaMajorVersion('17')).toBe(17);
    expect(() => requireJavaMajorVersion(11)).toThrow(IpcValidationError);
    expect(() => requireJavaMajorVersion('latest')).toThrow(IpcValidationError);
  });

  it('only allows HTTPS downloads from trusted hosts', () => {
    expect(requireHttpsUrl('https://cdn.modrinth.com/data/x.jar', 'url', ['cdn.modrinth.com']))
      .toBe('https://cdn.modrinth.com/data/x.jar');
    expect(() => requireHttpsUrl('http://cdn.modrinth.com/x.jar', 'url', ['cdn.modrinth.com'])).toThrow(IpcValidationError);
    expect(() => requireHttpsUrl('https://evil.example.com/x.jar', 'url', ['cdn.modrinth.com'])).toThrow(IpcValidationError);
  });

  it('rejects control characters and oversized strings', () => {
    expect(() => requireString('a\u0000b', 'name')).toThrow(IpcValidationError);
    expect(() => requireString('x'.repeat(500), 'name', 256)).toThrow(IpcValidationError);
  });

  it('sanitises dialog filters instead of trusting renderer objects', () => {
    expect(sanitizeDialogFilters([{ name: 'Mods', extensions: ['jar', '../evil'] }]))
      .toEqual([{ name: 'Mods', extensions: ['jar', 'evil'] }]);
    expect(sanitizeDialogFilters(undefined)).toBeUndefined();
    expect(() => sanitizeDialogFilters('nope')).toThrow(IpcValidationError);
  });
});

const INDEX_CSS = fs.readFileSync(path.join(__dirname, '../frontend/src/styles/index.css'), 'utf-8');

function tokensIn(selector: string): string[] {
  const start = INDEX_CSS.indexOf(selector);
  const end = INDEX_CSS.indexOf('}', start);
  const block = INDEX_CSS.slice(start, end);
  return Array.from(block.matchAll(/^\s*(--[a-z0-9-]+):/gm)).map(match => match[1]);
}

describe('theme token parity', () => {
  const rootTokens = tokensIn(':root {');
  const lightTokens = tokensIn('body.theme-light {');

  it('defines the core semantic tokens in dark mode', () => {
    for (const token of ['--bg-app', '--bg-surface', '--bg-input', '--bg-modal', '--text-primary', '--text-secondary', '--border-subtle', '--success', '--danger', '--warning', '--info', '--focus-ring', '--shadow-modal']) {
      expect(rootTokens).toContain(token);
    }
  });

  it('overrides every dark-mode token that affects surfaces or text in light mode', () => {
    const mustOverride = rootTokens.filter(token =>
      /^--(bg|text|border|shadow|success|warning|danger|info|status|scrim|modal-scrim|rarity)/.test(token)
    );
    const missing = mustOverride.filter(token => !lightTokens.includes(token));
    expect(missing).toEqual([]);
  });

  it('declares a native color-scheme per theme', () => {
    expect(INDEX_CSS).toContain('color-scheme: dark;');
    expect(INDEX_CSS).toContain('color-scheme: light;');
  });
});

describe('ThemeService', () => {
  function installDomStubs() {
    const changeListeners: ((event: { matches: boolean }) => void)[] = [];
    const classes = new Set<string>();
    const mediaQuery = {
      matches: false,
      addEventListener: (_: string, cb: (event: { matches: boolean }) => void) => changeListeners.push(cb),
      removeEventListener: (_: string, cb: (event: { matches: boolean }) => void) => {
        const index = changeListeners.indexOf(cb);
        if (index >= 0) changeListeners.splice(index, 1);
      }
    };

    (globalThis as any).window = { matchMedia: () => mediaQuery };
    (globalThis as any).document = {
      body: {
        classList: {
          add: (name: string) => classes.add(name),
          remove: (...names: string[]) => names.forEach(name => classes.delete(name)),
          contains: (name: string) => classes.has(name)
        },
        dataset: {} as Record<string, string>
      },
      documentElement: { style: {} as Record<string, string> }
    };

    return { changeListeners, classes };
  }

  afterEach(() => {
    delete (globalThis as any).window;
    delete (globalThis as any).document;
  });

  it('registers a single OS theme listener across repeated initialisation', async () => {
    const { changeListeners } = installDomStubs();
    const { ThemeService } = await import('../frontend/src/services/themeService');

    ThemeService.initialize('system');
    ThemeService.initialize('system');
    ThemeService.initialize('dark');

    expect(changeListeners).toHaveLength(1);

    ThemeService.dispose();
    expect(changeListeners).toHaveLength(0);
  });

  it('resolves the system preference into an explicit theme class', async () => {
    const { classes } = installDomStubs();
    const { ThemeService } = await import('../frontend/src/services/themeService');

    ThemeService.initialize('system');
    expect(classes.has('theme-light')).toBe(true);
    expect(classes.has('theme-dark')).toBe(false);

    ThemeService.applyTheme('dark');
    expect(classes.has('theme-dark')).toBe(true);
    expect(classes.has('theme-light')).toBe(false);

    ThemeService.applyTheme('light');
    expect(classes.has('theme-light')).toBe(true);

    ThemeService.dispose();
  });

  it('applies a pending OS theme change only while following the system', async () => {
    const { changeListeners, classes } = installDomStubs();
    const { ThemeService } = await import('../frontend/src/services/themeService');

    ThemeService.initialize('system');
    ThemeService.applyTheme('dark');
    changeListeners[0]({ matches: false });
    expect(classes.has('theme-dark')).toBe(true);

    ThemeService.applyTheme('system');
    changeListeners[0]({ matches: false });
    expect(classes.has('theme-light')).toBe(true);

    ThemeService.dispose();
  });
});

describe('log level filters', () => {
  it('accepts the viewer defaults (ALL and every selectable level)', async () => {
    const { requireLogLevel, LOG_LEVEL_FILTERS } = await import('../electron/backend/ipc/validate');
    for (const level of LOG_LEVEL_FILTERS) {
      expect(requireLogLevel(level)).toBe(level);
    }
    // The Log page defaults to ALL; rejecting it broke the log viewer.
    expect(requireLogLevel('ALL')).toBe('ALL');
    expect(() => requireLogLevel('TRACE')).toThrow(IpcValidationError);
  });
});
