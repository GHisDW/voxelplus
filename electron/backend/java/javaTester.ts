import { execFile } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { JavaRuntime } from '../../types';
import { JavaCompatibilityResolver } from './compatibility';

export class JavaTester {
  /**
   * Tests a candidate java.exe binary and extracts full metadata.
   */
  public static async testBinary(executablePath: string): Promise<JavaRuntime | null> {
    // Voxel+ must never trust a stale Java path.
    // Verify the executable, derive JAVA_HOME from that executable,
    // and verify the derived Java home before allowing the runtime
    // to enter the resolver/launcher pipeline.
    const normalizedExecutable = path.normalize(executablePath);

    if (!fs.existsSync(normalizedExecutable)) {
      return null;
    }

    let executableStat: fs.Stats;
    try {
      executableStat = fs.statSync(normalizedExecutable);
    } catch {
      return null;
    }

    if (!executableStat.isFile()) {
      return null;
    }

    const homePath = path.dirname(path.dirname(normalizedExecutable));
    const normalizedHome = path.normalize(homePath);
    const expectedJavaExecutable = path.join(normalizedHome, 'bin', 'java.exe');

    if (!fs.existsSync(normalizedHome)) {
      return null;
    }

    try {
      if (!fs.statSync(normalizedHome).isDirectory()) {
        return null;
      }
    } catch {
      return null;
    }

    // A JavaRuntime must point at the real java.exe belonging to its
    // derived JAVA_HOME. This prevents stale registry/PATH metadata
    // from producing an invalid JAVA_HOME later.
    if (!fs.existsSync(expectedJavaExecutable)) {
      return null;
    }

    if (path.normalize(expectedJavaExecutable).toLowerCase() !== normalizedExecutable.toLowerCase()) {
      return null;
    }

    return new Promise((resolve) => {
      execFile(
        executablePath,
        ['-version'],
        { timeout: 6000, windowsHide: true },
        (error, stdout, stderr) => {
          const rawOutput = (stderr + '\n' + stdout).trim();

          if (error && !rawOutput) {
            // Test failed completely
            const failedRuntime: JavaRuntime = {
              id: Buffer.from(executablePath).toString('base64url').slice(0, 16),
              name: path.basename(homePath),
              majorVersion: 0,
              fullVersion: 'Unknown',
              vendor: 'Unknown',
              architecture: 'unknown',
              path: homePath,
              executablePath,
              isValid: false,
              isLts: false,
              isRecommended: false,
              testStatus: 'FAILED',
              testOutput: error.message,
              pros: [],
              cons: ['Executable failed execution check'],
              compatibilityDescription: 'Non-functional Java runtime'
            };
            return resolve(failedRuntime);
          }

          const parsed = this.parseVersionOutput(rawOutput, executablePath, homePath);
          resolve(parsed);
        }
      );
    });
  }

  private static parseVersionOutput(raw: string, executablePath: string, homePath: string): JavaRuntime {
    const normalizedExecutable = path.normalize(executablePath);
    const normalizedHome = path.normalize(homePath);
    // Examples:
    // openjdk version "21.0.12.1" 2026-08-18 LTS
    // OpenJDK Runtime Environment Temurin-21.0.12.1+1 (build 21.0.12.1+1-LTS)
    // OpenJDK 64-Bit Server VM Temurin-21.0.12.1+1 (build 21.0.12.1+1-LTS, mixed mode, sharing)
    // java version "1.8.0_172"
    // Java(TM) SE Runtime Environment (build 1.8.0_172-b11)

    let majorVersion = 0;
    let fullVersion = 'Unknown';
    let vendor = 'OpenJDK';
    let architecture: 'x64' | 'x86' | 'arm64' | 'unknown' = 'unknown';

    // Extract version string
    const versionMatch = raw.match(/(?:version|build)\s+"?([0-9._\-+a-zA-Z]+)"?/i);
    if (versionMatch && versionMatch[1]) {
      fullVersion = versionMatch[1];
      if (fullVersion.startsWith('1.')) {
        // e.g. 1.8.0_172 -> Java 8
        majorVersion = parseInt(fullVersion.split('.')[1], 10) || 8;
      } else {
        // e.g. 21.0.12.1 -> Java 21
        majorVersion = parseInt(fullVersion.split('.')[0], 10) || 0;
      }
    }

    // Extract vendor
    const lower = raw.toLowerCase();
    if (lower.includes('temurin') || lower.includes('adoptium')) {
      vendor = 'Eclipse Temurin';
    } else if (lower.includes('microsoft')) {
      vendor = 'Microsoft OpenJDK';
    } else if (lower.includes('oracle') || lower.includes('java(tm)')) {
      vendor = 'Oracle Corporation';
    } else if (lower.includes('zulu') || lower.includes('azul')) {
      vendor = 'Azul Zulu';
    } else if (lower.includes('corretto') || lower.includes('amazon')) {
      vendor = 'Amazon Corretto';
    } else if (lower.includes('liberica') || lower.includes('bellsoft')) {
      vendor = 'BellSoft Liberica';
    } else if (lower.includes('graalvm')) {
      vendor = 'GraalVM';
    } else if (lower.includes('openjdk')) {
      vendor = 'OpenJDK Community';
    }

    // Extract architecture
    if (lower.includes('64-bit') || lower.includes('x86_64') || lower.includes('amd64') || lower.includes('x64')) {
      architecture = 'x64';
    } else if (lower.includes('aarch64') || lower.includes('arm64')) {
      architecture = 'arm64';
    } else if (lower.includes('32-bit') || lower.includes('x86')) {
      architecture = 'x86';
    }

    // Check LTS
    const isLts = [8, 11, 17, 21, 25].includes(majorVersion) || lower.includes('lts');
    const isRecommended = majorVersion === 21 && architecture === 'x64';

    const id = `java-${majorVersion}-${architecture}-${Buffer.from(normalizedExecutable).toString('hex').slice(0, 8)}`;
    const name = `Java ${majorVersion} (${vendor})`;

    const runtime: JavaRuntime = {
      id,
      name,
      majorVersion,
      fullVersion,
      vendor,
      architecture,
      path: normalizedHome,
      executablePath: normalizedExecutable,
      isValid: majorVersion > 0,
      isLts,
      isRecommended,
      testStatus: isRecommended ? 'RECOMMENDED' : majorVersion >= 17 ? 'TESTED' : 'DETECTED',
      testOutput: raw,
      pros: [],
      cons: [],
      compatibilityDescription: ''
    };

    return JavaCompatibilityResolver.enrichJavaMetadata(runtime);
  }
}


