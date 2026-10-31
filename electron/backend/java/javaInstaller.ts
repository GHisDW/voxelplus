import { spawn } from 'node:child_process';
import { JavaRuntime } from '../../types';
import { JavaDetector } from './javaDetector';
import { JavaTester } from './javaTester';
import { VoxelError } from '../diagnostics';

export class JavaInstaller {
  /** Guards against two concurrent winget installs of the same runtime. */
  private static inFlight: Promise<{ success: boolean; runtime?: JavaRuntime; error?: string }> | null = null;

  /**
   * Re-scans for the requested major version and proves it runs.
   *
   * winget can exit 0 while the JDK is still being registered (or while a
   * different version is present), so detection is retried briefly and the
   * detected `java.exe` is executed through JavaTester before success is
   * reported.
   */
  private static async verifyInstalledRuntime(
    version: 8 | 17 | 21 | 25,
    onProgress?: (status: string, percentage: number) => void
  ): Promise<JavaRuntime | null> {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        onProgress?.(`Waiting for Java ${version} to finish registering...`, 94);
        await new Promise(resolve => setTimeout(resolve, 1500));
      }

      let runtimes: JavaRuntime[] = [];
      try {
        runtimes = await JavaDetector.scanSystemJava();
      } catch {
        continue;
      }

      const candidates = runtimes.filter(r => r.majorVersion === version && r.executablePath);
      for (const candidate of candidates) {
        onProgress?.(`Verifying Java ${version} at ${candidate.executablePath}...`, 97);
        const tested = await JavaTester.testBinary(candidate.executablePath);
        if (tested && tested.majorVersion === version && tested.testStatus !== 'FAILED') {
          return tested;
        }
      }
    }
    return null;
  }

  /**
   * Installs a Java version (8, 17, 21, or 25) using winget.
   *
   * A successful winget exit code alone is not proof of a usable runtime, so the
   * installer re-scans, then *executes* the detected JDK (JavaTester) and only
   * reports success when the exact requested major version actually runs.
   */
  public static async installJava(
    version: 8 | 17 | 21 | 25 = 21,
    onProgress?: (status: string, percentage: number) => void
  ): Promise<{ success: boolean; runtime?: JavaRuntime; error?: string }> {
    if (this.inFlight) {
      return { success: false, error: `A Java installation is already running. Wait for it to finish before installing Java ${version}.` };
    }
    const task = this.performInstall(version, onProgress);
    this.inFlight = task;
    try {
      return await task;
    } finally {
      this.inFlight = null;
    }
  }

  private static async performInstall(
    version: 8 | 17 | 21 | 25,
    onProgress?: (status: string, percentage: number) => void
  ): Promise<{ success: boolean; runtime?: JavaRuntime; error?: string }> {
    const packageMap: Record<number, string> = {
      8: 'EclipseAdoptium.Temurin.8.JDK',
      17: 'EclipseAdoptium.Temurin.17.JDK',
      21: 'EclipseAdoptium.Temurin.21.JDK',
      25: 'EclipseAdoptium.Temurin.25.JDK'
    };

    const packageId = packageMap[version];
    if (!packageId) {
      return { success: false, error: `Java ${version} is not a supported runtime version.` };
    }

    onProgress?.(`Starting installation of Eclipse Temurin ${version} JDK...`, 10);

    return new Promise((resolve) => {
      const args = [
        'install',
        packageId,
        '--silent',
        '--accept-source-agreements',
        '--accept-package-agreements'
      ];

      const child = spawn('winget', args, {
        windowsHide: true,
        // Argument-array invocation only: the package id never passes through a
        // shell, so nothing here can be interpreted as a command.
        shell: false
      });

      let errorOutput = '';

      child.stdout?.on('data', (data) => {
        const text = data.toString();
        if (text.includes('Downloading')) {
          onProgress?.(`Downloading Eclipse Temurin ${version}...`, 40);
        } else if (text.includes('Starting package install')) {
          onProgress?.(`Installing Eclipse Temurin ${version}...`, 75);
        }
      });

      child.stderr?.on('data', (data) => {
        errorOutput += data.toString();
      });

      child.on('close', async (code) => {
        if (code === 0) {
          onProgress?.(`Scanning system for new Java ${version} installation...`, 90);

          const verified = await this.verifyInstalledRuntime(version, onProgress);
          if (verified) {
            onProgress?.(`Java ${version} successfully installed and verified.`, 100);
            return resolve({ success: true, runtime: verified });
          }

          const error = new VoxelError({
            title: 'Java Installation Incomplete',
            message: `Eclipse Temurin ${version} was reported as installed, but no working Java ${version} runtime could be found.`,
            cause: 'The package manager finished successfully yet the JDK is missing from the scanned locations, or the detected JDK failed to start.',
            suggestedAction: 'Re-scan Java in the Java Manager. If the runtime is still missing, restart Windows and retry, or install the JDK manually from Adoptium.',
            code: 'JAVA_INSTALL_UNVERIFIED',
            category: 'JAVA',
            severity: 'ERROR',
            details: `Requested major version: ${version}`
          });
          error.log();
          return resolve({ success: false, error: `${error.message} ${error.suggestedAction ?? ''}`.trim() });
        } else {
          const error = new VoxelError({
            title: 'Java Installation Failed',
            message: `Eclipse Temurin ${version} could not be installed via the Windows package manager.`,
            cause: errorOutput
              ? 'winget reported an error during download or installation.'
              : 'The winget installer exited unexpectedly.',
            suggestedAction: 'Ensure winget is available and up to date, then retry. You can also install the JDK manually from Adoptium.',
            code: 'JAVA_INSTALL_FAILED',
            category: 'JAVA',
            severity: 'ERROR',
            details: `winget exit code: ${code}${errorOutput ? `; output: ${errorOutput.trim()}` : ''}`
          });
          error.log();
          resolve({
            success: false,
            error: `${error.message} ${error.suggestedAction ?? ''}`.trim()
          });
        }
      });

      child.on('error', (err) => {
        const error = new VoxelError({
          title: 'Java Installation Failed',
          message: 'The Windows package manager (winget) could not be started.',
          cause: 'winget is not installed or not found on PATH.',
          suggestedAction: 'Install winget via the Microsoft Store, or download the JDK manually from Adoptium.',
          code: 'JAVA_INSTALL_WINGET_MISSING',
          category: 'JAVA',
          severity: 'ERROR',
          details: err.stack || err.message
        });
        error.log();
        resolve({
          success: false,
          error: `${error.message} ${error.suggestedAction ?? ''}`.trim()
        });
      });
    });
  }
}
