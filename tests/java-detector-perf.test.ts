/**
 * Java detection performance regressions.
 *
 * `scanSystemJava()` used to walk the filesystem, query the Windows registry and
 * then run one `java -version` process per candidate — sequentially, on every
 * single preflight/launch/Java-Manager call. On Windows that made a single
 * preflight exceed the 5 s test budget (the `1 TB allocation` preflight case).
 *
 * These tests pin the fix: results are cached, concurrent callers share one
 * scan, and candidate probes run in parallel with a bounded concurrency.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

vi.mock('node:child_process', () => ({
  execFile: (_file: string, _args: string[], _opts: unknown, cb: (e: Error | null, out: string) => void) => {
    cb(null, '');
    return { on: () => undefined } as any;
  },
  spawn: () => ({ on: () => undefined, unref: () => undefined } as any),
  exec: () => undefined
}));

const { JavaDetector } = await import('../electron/backend/java/javaDetector');
const { JavaTester } = await import('../electron/backend/java/javaTester');

function makeJdkDir(root: string, name: string): string {
  const binary = path.join(root, name, 'bin', 'java.exe');
  fs.mkdirSync(path.dirname(binary), { recursive: true });
  fs.writeFileSync(binary, 'stub');
  return binary;
}

describe('JavaDetector scan performance', () => {
  let tempRoot: string;
  let originalJavaHome: string | undefined;
  let originalPath: string | undefined;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'voxel-jdk-'));
    originalJavaHome = process.env.JAVA_HOME;
    originalPath = process.env.PATH;
    process.env.JAVA_HOME = path.join(tempRoot, 'jdk-21');
    process.env.PATH = '';
    makeJdkDir(tempRoot, 'jdk-21');
    JavaDetector.invalidateCache();
  });

  afterEach(() => {
    if (originalJavaHome === undefined) delete process.env.JAVA_HOME; else process.env.JAVA_HOME = originalJavaHome;
    if (originalPath === undefined) delete process.env.PATH; else process.env.PATH = originalPath;
    fs.rmSync(tempRoot, { recursive: true, force: true });
    vi.restoreAllMocks();
    JavaDetector.invalidateCache();
  });

  it('shares one scan between concurrent callers', async () => {
    const probe = vi.spyOn(JavaTester, 'testBinary').mockImplementation(async (executablePath: string) => ({
      id: 'x', name: 'Java 21', majorVersion: 21, fullVersion: '21.0.4', vendor: 'Temurin',
      architecture: 'x64', path: path.dirname(path.dirname(executablePath)), executablePath,
      isValid: true, isLts: true, isRecommended: true, testStatus: 'RECOMMENDED', testOutput: '',
      pros: [], cons: [], compatibilityDescription: ''
    }) as any);

    const [a, b, c] = await Promise.all([
      JavaDetector.scanSystemJava(),
      JavaDetector.scanSystemJava(),
      JavaDetector.scanSystemJava()
    ]);

    expect(a).toHaveLength(1);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    // One candidate, one probe — not one probe per caller.
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it('serves repeat calls from the cache until it is invalidated', async () => {
    const probe = vi.spyOn(JavaTester, 'testBinary').mockResolvedValue(null as any);

    await JavaDetector.scanSystemJava();
    await JavaDetector.scanSystemJava();
    expect(probe).toHaveBeenCalledTimes(1);

    JavaDetector.invalidateCache();
    await JavaDetector.scanSystemJava();
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it('probes candidates in parallel without exceeding the concurrency limit', async () => {
    // Five binaries reachable through PATH -> five candidates.
    delete process.env.JAVA_HOME;
    const pathEntries: string[] = [];
    for (const name of ['e1', 'e2', 'e3', 'e4', 'e5']) {
      const entry = path.join(tempRoot, 'path', name);
      fs.mkdirSync(entry, { recursive: true });
      fs.writeFileSync(path.join(entry, 'java.exe'), 'stub');
      pathEntries.push(entry);
    }
    process.env.PATH = pathEntries.join(path.delimiter);
    JavaDetector.invalidateCache();

    let inFlight = 0;
    let maxInFlight = 0;
    const probe = vi.spyOn(JavaTester, 'testBinary').mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise(resolve => setTimeout(resolve, 40));
      inFlight -= 1;
      return null as any;
    });

    const startedAt = Date.now();
    await JavaDetector.scanSystemJava();
    const elapsed = Date.now() - startedAt;

    // Sequential probing of 5 candidates would take >= 200 ms.
    expect(elapsed).toBeLessThan(180);
    expect(maxInFlight).toBeGreaterThan(1);
    expect(maxInFlight).toBeLessThanOrEqual(4);
    expect(probe.mock.calls.length).toBeGreaterThan(1);
  });
});
