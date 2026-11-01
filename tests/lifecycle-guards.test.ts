/**
 * Release-blocking guard tests for the update flow, process lifecycle and Java
 * installer. These exercise production code paths that previously reported
 * success (or hung) without actually doing anything.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { ProcessManager } from '../electron/backend/processes/processManager';
import { UpdateService } from '../electron/backend/updates/updateService';
import { JavaInstaller } from '../electron/backend/java/javaInstaller';

describe('process lifecycle guards', () => {
  afterEach(() => {
    ProcessManager.shutdownAll();
  });

  it('reports STOPPED for an unknown instance instead of hanging', async () => {
    expect(ProcessManager.getStatus('does-not-exist')).toBe('STOPPED');
    expect(ProcessManager.isRunning('does-not-exist')).toBe(false);
    await expect(ProcessManager.stopInstance('does-not-exist')).resolves.toBe(true);
    expect(ProcessManager.getStatus('does-not-exist')).toBe('STOPPED');
  });

  it('emits status events to subscribers and unsubscribes cleanly', () => {
    const seen: string[] = [];
    const unsubscribe = ProcessManager.onStatusChange(event => seen.push(event.status));

    ProcessManager.stopInstance('instance-a');
    expect(seen).toContain('STOPPED');

    unsubscribe();
    ProcessManager.stopInstance('instance-b');
    expect(seen.filter(status => status === 'STOPPED')).toHaveLength(1);
  });

  it('shutdownAll is safe when nothing is running', () => {
    expect(() => ProcessManager.shutdownAll()).not.toThrow();
    expect(ProcessManager.getStatus('anything')).toBe('STOPPED');
  });
});

describe('update install guards', () => {
  it('refuses to install on a non-Windows platform', async () => {
    const result = await UpdateService.installUpdate();
    expect(result.started).toBe(false);
    expect(result.reason).toBe('unsupported-platform');
  });

  it('refuses to download a release that publishes no SHA-256 digest', async () => {
    await expect(
      UpdateService.downloadUpdate({
        name: 'VoxelPlus-Portable-1.2.0.exe',
        url: 'https://github.com/GHisDW/voxelplus/releases/download/v1.2.0/VoxelPlus-Portable-1.2.0.exe',
        size: 1024,
        sha256: null
      } as any)
    ).rejects.toThrow(/SHA-256/i);
  });

  it('refuses non-HTTPS and untrusted download hosts before touching the filesystem', async () => {
    await expect(
      UpdateService.downloadUpdate({
        name: 'VoxelPlus-Portable-1.2.0.exe',
        url: 'http://github.com/GHisDW/voxelplus/releases/download/v1.2.0/x.exe',
        size: 1024,
        sha256: 'a'.repeat(64)
      } as any)
    ).rejects.toThrow(/HTTPS/i);

    await expect(
      UpdateService.downloadUpdate({
        name: 'VoxelPlus-Portable-1.2.0.exe',
        url: 'https://evil.example.com/x.exe',
        size: 1024,
        sha256: 'a'.repeat(64)
      } as any)
    ).rejects.toThrow(/untrusted host/i);
  });
});

describe('java installer guards', () => {
  it('rejects unsupported Java majors', async () => {
    const result = await JavaInstaller.installJava(11 as any);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not a supported runtime version/i);
  });

  it('does not start a second concurrent installation', async () => {
    const first = JavaInstaller.installJava(21);
    const second = await JavaInstaller.installJava(21);

    expect(second.success).toBe(false);
    expect(second.error).toMatch(/already running/i);

    // The first call resolves on its own (winget is absent in this environment).
    const firstResult = await first;
    expect(firstResult.success).toBe(false);
  });
});
