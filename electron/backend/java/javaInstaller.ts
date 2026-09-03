import { spawn } from 'node:child_process';
import { JavaRuntime } from '../../types';
import { JavaDetector } from './javaDetector';

export class JavaInstaller {
  /**
   * Installs a Java version (e.g. 21 or 17) using winget.
   */
  public static async installJava(
    version: 21 | 17 = 21,
    onProgress?: (status: string, percentage: number) => void
  ): Promise<{ success: boolean; runtime?: JavaRuntime; error?: string }> {
    const packageId = version === 21 ? 'EclipseAdoptium.Temurin.21.JDK' : 'EclipseAdoptium.Temurin.17.JDK';

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
        shell: true
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
          const runtimes = await JavaDetector.scanSystemJava();
          const target = runtimes.find(r => r.majorVersion === version);

          onProgress?.(`Java ${version} successfully installed and ready.`, 100);
          resolve({
            success: true,
            runtime: target || runtimes[0]
          });
        } else {
          resolve({
            success: false,
            error: errorOutput || `Winget exited with status code ${code}`
          });
        }
      });

      child.on('error', (err) => {
        resolve({
          success: false,
          error: err.message
        });
      });
    });
  }
}
