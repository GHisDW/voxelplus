import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { exec } from 'node:child_process';
import { JavaRuntime } from '../../types';
import { JavaTester } from './javaTester';

export class JavaDetector {
  /**
   * Scans all sources for Java runtimes on the system.
   */
  public static async scanSystemJava(): Promise<JavaRuntime[]> {
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

    // 3. Scan Common Windows Directories
    const searchRoots = [
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

    // 4. Scan Registry via PowerShell
    try {
      const registryPaths = await this.scanRegistryJava();
      for (const regPath of registryPaths) {
        this.addCandidate(candidateBinaries, regPath);
      }
    } catch (e) {
      console.warn('Registry scan skipped:', e);
    }

    // 5. Test each discovered binary
    const testedRuntimes: JavaRuntime[] = [];
    const testedPaths = new Set<string>();

    for (const binaryPath of candidateBinaries) {
      const normalized = path.normalize(binaryPath).toLowerCase();
      if (testedPaths.has(normalized)) continue;
      testedPaths.add(normalized);

      const runtime = await JavaTester.testBinary(binaryPath);
      if (runtime && runtime.isValid) {
        testedRuntimes.push(runtime);
      }
    }

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

      exec(`powershell -NoProfile -NonInteractive -Command "${psCommand}"`, { timeout: 5000 }, (error, stdout) => {
        if (error || !stdout) return resolve([]);
        const lines = stdout.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0 && l.endsWith('.exe'));
        resolve(lines);
      });
    });
  }
}
