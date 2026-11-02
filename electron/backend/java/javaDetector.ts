import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { JavaRuntime } from '../../types';
import { JavaTester } from './javaTester';

export class JavaDetector {
  /** Cached scan result and timestamp (scans spawn processes; never re-run them back to back). */
  private static cache: { runtimes: JavaRuntime[]; at: number } | null = null;
  /** Coalesces concurrent scans into one in-flight run. */
  private static inFlight: Promise<JavaRuntime[]> | null = null;
  private static readonly CACHE_TTL_MS = 30_000;
  /** How many `java -version` probes may run at once. */
  private static readonly TEST_CONCURRENCY = 4;
  /** Registry lookups must never dominate a scan/preflight. */
  private static readonly REGISTRY_TIMEOUT_MS = 3_000;

  /**
   * Returns detected Java runtimes.
   *
   * Detection is expensive (filesystem walk + a PowerShell registry query + one
   * process spawn per candidate), so results are cached briefly and concurrent
   * callers share a single scan. Preflight, launch, the Java Manager and the
   * instance list all call this, and re-scanning each time made a single
   * preflight take seconds on Windows.
   */
  public static async scanSystemJava(): Promise<JavaRuntime[]> {
    if (this.cache && Date.now() - this.cache.at < this.CACHE_TTL_MS) {
      return this.cache.runtimes;
    }
    if (this.inFlight) return this.inFlight;

    const task = this.performScan()
      .then(runtimes => {
        this.cache = { runtimes, at: Date.now() };
        return runtimes;
      })
      .finally(() => {
        if (this.inFlight === task) this.inFlight = null;
      });

    this.inFlight = task;
    return task;
  }

  /** Forces the next scan to hit the filesystem/registry again. */
  public static invalidateCache(): void {
    this.cache = null;
  }

  private static async performScan(): Promise<JavaRuntime[]> {
    const candidateBinaries = new Set<string>();

    // 1. Check JAVA_HOME & JDK_HOME
    const javaHome = process.env.JAVA_HOME;
    if (javaHome) {
      this.addCandidate(candidateBinaries, path.join(javaHome, 'bin', 'java.exe'));
    }
    const jdkHome = process.env.JDK_HOME;
    if (jdkHome) {
      this.addCandidate(candidateBinaries, path.join(jdkHome, 'bin', 'java.exe'));
    }

    // 2. Check PATH
    const envPath = process.env.PATH || '';
    const pathEntries = envPath.split(path.delimiter);
    for (const entry of pathEntries) {
      if (entry) {
        this.addCandidate(candidateBinaries, path.join(entry, 'java.exe'));
        if (entry.toLowerCase().endsWith('\\bin')) {
          this.addCandidate(candidateBinaries, path.join(entry, 'java.exe'));
        }
      }
    }

    // Start the registry query before the filesystem walk so both overlap.
    const registryPromise: Promise<string[]> = process.platform === 'win32'
      ? this.scanRegistryJava().catch(() => [] as string[])
      : Promise.resolve([] as string[]);

    // 3. Scan common install directories (Windows layout only; on other
    // platforms PATH/JAVA_HOME are the sources that matter).
    const searchRoots = process.platform !== 'win32' ? [
      path.join(os.homedir(), '.jdks'),
      path.join(os.homedir(), '.gradle', 'jdks'),
      '/usr/lib/jvm',
      '/Library/Java/JavaVirtualMachines'
    ] : [
      'C:\\Program Files\\Java',
      'C:\\Program Files\\Eclipse Adoptium',
      'C:\\Program Files\\Microsoft',
      'C:\\Program Files\\Zulu',
      'C:\\Program Files\\BellSoft',
      'C:\\Program Files\\Amazon Corretto',
      'C:\\Program Files (x86)\\Java',
      'C:\\Program Files (x86)\\Eclipse Adoptium',
      path.join(os.homedir(), '.jdks'),
      path.join(os.homedir(), '.gradle', 'jdks'),
      path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Eclipse Adoptium')
    ];

    for (const root of searchRoots) {
      if (fs.existsSync(root)) {
        try {
          const subdirs = fs.readdirSync(root, { withFileTypes: true });
          for (const dirent of subdirs) {
            if (dirent.isDirectory()) {
              const fullDir = path.join(root, dirent.name);
              this.addCandidate(candidateBinaries, path.join(fullDir, 'bin', 'java.exe'));
              this.addCandidate(candidateBinaries, path.join(fullDir, 'jre', 'bin', 'java.exe'));
            }
          }
          // Also check if root itself is a JDK
          this.addCandidate(candidateBinaries, path.join(root, 'bin', 'java.exe'));
        } catch (e) {
          // ignore inaccessible dirs
        }
      }
    }

    // 4. Test the filesystem candidates while the (slow, Windows-only) registry
    //    query runs in the background, then fold in whatever it adds.
    const testedPaths = new Set<string>();
    const testedRuntimes = await this.testCandidates(candidateBinaries, testedPaths);

    const registryCandidates = await registryPromise;
    for (const regPath of registryCandidates) {
      this.addCandidate(candidateBinaries, regPath);
    }
    const extra = await this.testCandidates(candidateBinaries, testedPaths);
    testedRuntimes.push(...extra);

    // Deduplicate by full version + path
    const uniqueMap = new Map<string, JavaRuntime>();
    for (const r of testedRuntimes) {
      const key = `${r.majorVersion}-${r.vendor}-${r.architecture}-${r.path}`;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, r);
      }
    }

    const results = Array.from(uniqueMap.values());

    // Sort: Recommended (Java 21 LTS x64) first, then by majorVersion descending
    results.sort((a, b) => {
      if (a.isRecommended && !b.isRecommended) return -1;
      if (!a.isRecommended && b.isRecommended) return 1;
      if (b.majorVersion !== a.majorVersion) return b.majorVersion - a.majorVersion;
      if (a.architecture === 'x64' && b.architecture !== 'x64') return -1;
      return 0;
    });

    return results;
  }

  /**
   * Probes each candidate binary in parallel (bounded), skipping paths that were
   * already probed. Sequential probing meant N x `java -version` spawns, which
   * alone could exceed a request/timeout budget on machines with many JDKs.
   */
  private static async testCandidates(
    candidates: Iterable<string>,
    testedPaths: Set<string>
  ): Promise<JavaRuntime[]> {
    const pending: string[] = [];
    for (const binaryPath of candidates) {
      const normalized = path.normalize(binaryPath).toLowerCase();
      if (testedPaths.has(normalized)) continue;
      testedPaths.add(normalized);
      pending.push(binaryPath);
    }

    const results: JavaRuntime[] = [];
    let cursor = 0;
    const worker = async (): Promise<void> => {
      while (cursor < pending.length) {
        const binaryPath = pending[cursor++];
        try {
          const runtime = await JavaTester.testBinary(binaryPath);
          if (runtime && runtime.isValid) results.push(runtime);
        } catch {
          // A single unreadable binary must not abort the whole scan.
        }
      }
    };

    const workers = Array.from(
      { length: Math.min(this.TEST_CONCURRENCY, pending.length) },
      () => worker()
    );
    await Promise.all(workers);
    return results;
  }

  private static addCandidate(set: Set<string>, targetPath: string): void {
    try {
      if (fs.existsSync(targetPath)) {
        set.add(path.normalize(targetPath));
      }
    } catch {
      // ignore
    }
  }

  private static scanRegistryJava(): Promise<string[]> {
    return new Promise((resolve) => {
      const psCommand = `
        $paths = @()
        $regKeys = @(
          'HKLM:\\SOFTWARE\\JavaSoft\\Java Development Kit',
          'HKLM:\\SOFTWARE\\JavaSoft\\Java Runtime Environment',
          'HKLM:\\SOFTWARE\\JavaSoft\\JDK',
          'HKLM:\\SOFTWARE\\Eclipse Adoptium\\JDK',
          'HKLM:\\SOFTWARE\\Microsoft\\JDK'
        )
        foreach ($k in $regKeys) {
          if (Test-Path $k) {
            Get-ChildItem -Path $k -ErrorAction SilentlyContinue | ForEach-Object {
              $props = Get-ItemProperty -Path $_.PSPath -ErrorAction SilentlyContinue
              if ($props.JavaHome) { $paths += (Join-Path $props.JavaHome 'bin\\java.exe') }
              if ($props.Path) { $paths += (Join-Path $props.Path 'bin\\java.exe') }
            }
          }
        }
        $paths | Where-Object { Test-Path $_ } | Select-Object -Unique
      `.trim().replace(/\n/g, ' ');

      // Argument-array invocation: no shell, so no quoting/injection surface.
      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', psCommand],
        { timeout: this.REGISTRY_TIMEOUT_MS, windowsHide: true },
        (error, stdout) => {
          if (error || !stdout) return resolve([]);
          const lines = stdout
            .split(/\r?\n/)
            .map(l => l.trim())
            .filter(l => l.length > 0 && l.toLowerCase().endsWith('.exe'));
          resolve(lines);
        }
      );
    });
  }
}
