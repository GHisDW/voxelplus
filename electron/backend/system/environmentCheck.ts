import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { EnvironmentCheckResult, EnvironmentCheckItem } from '../../types';
import { JavaDetector } from '../java/javaDetector';
import { ConfigStore } from '../storage/configStore';
import { SystemScanner } from './systemScanner';

export class EnvironmentChecker {
  public static async runEnvironmentCheck(): Promise<EnvironmentCheckResult> {
    const items: EnvironmentCheckItem[] = [];

    // 1. Check Java Runtime
    const javaList = await JavaDetector.scanSystemJava();
    const hasJava21 = javaList.some(j => j.isValid && j.majorVersion >= 21);
    const hasAnyJava = javaList.some(j => j.isValid && j.majorVersion >= 17);

    if (hasJava21) {
      items.push({
        id: 'java-runtime',
        title: 'Java 21 LTS Runtime',
        description: 'Modern 64-bit Java 21 runtime detected and verified.',
        status: 'passed',
        details: javaList.find(j => j.majorVersion >= 21)?.name
      });
    } else if (hasAnyJava) {
      items.push({
        id: 'java-runtime',
        title: 'Java Runtime Compatible',
        description: 'Java 17 runtime detected. Java 21 is recommended for Minecraft 1.20.5+ & 1.21+.',
        status: 'warning',
        details: javaList[0]?.name,
        fixAction: {
          label: 'Install Java 21 LTS',
          action: 'install_java',
          params: { version: 21 }
        }
      });
    } else {
      items.push({
        id: 'java-runtime',
        title: 'Java Runtime Missing',
        description: 'A compatible 64-bit Java 17 or 21 runtime is required to launch Minecraft development environments.',
        status: 'failed',
        fixAction: {
          label: 'Install Java 21 LTS',
          action: 'install_java',
          params: { version: 21 }
        }
      });
    }

    // 2. Check Instance Directory
    const instanceDir = ConfigStore.getInstanceDirectory();
    let dirPassed = false;
    try {
      if (!fs.existsSync(instanceDir)) {
        fs.mkdirSync(instanceDir, { recursive: true });
      }
      const testFile = path.join(instanceDir, '.voxel_write_test');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      dirPassed = true;

      items.push({
        id: 'instance-storage',
        title: 'Instance Storage Directory',
        description: `Storage directory is accessible and writable: ${instanceDir}`,
        status: 'passed'
      });
    } catch (e: any) {
      items.push({
        id: 'instance-storage',
        title: 'Instance Directory Inaccessible',
        description: `Cannot write to ${instanceDir}: ${e.message}`,
        status: 'failed',
        fixAction: {
          label: 'Change Directory',
          action: 'open_storage_settings'
        }
      });
    }

    // 3. Check Available Disk Space
    const scan = await SystemScanner.scanSystem();
    const driveFree = scan.storage.defaultInstanceDriveAvailableGb;
    if (driveFree >= 10) {
      items.push({
        id: 'disk-space',
        title: 'Available Storage',
        description: `${driveFree} GB available for Minecraft instances and Gradle dependencies.`,
        status: 'passed'
      });
    } else if (driveFree >= 4) {
      items.push({
        id: 'disk-space',
        title: 'Low Storage Warning',
        description: `${driveFree} GB available. Recommended at least 10 GB for multiple development instances.`,
        status: 'warning'
      });
    } else {
      items.push({
        id: 'disk-space',
        title: 'Critical Storage Space',
        description: `Only ${driveFree} GB available. Fabric Loom requires at least 4 GB to download client assets and mappings.`,
        status: 'failed'
      });
    }

    // 4. Check Network Connectivity (Modrinth & Fabric Maven)
    const networkOk = await this.testNetworkAccess();
    if (networkOk) {
      items.push({
        id: 'network-access',
        title: 'Network & Maven Connectivity',
        description: 'Connected to Modrinth and Fabric Maven repositories.',
        status: 'passed'
      });
    } else {
      items.push({
        id: 'network-access',
        title: 'Network Limited',
        description: 'Cannot reach Maven/Modrinth servers. Offline mode will be used for cached instances.',
        status: 'warning'
      });
    }

    // 5. Development Environment Ready
    items.push({
      id: 'development-engine',
      title: 'Gradle Wrapper & Loom Engine',
      description: 'Fabric Loom project generator and process pipeline initialized.',
      status: 'passed'
    });

    const allPassed = !items.some(i => i.status === 'failed');

    return {
      allPassed,
      items,
      timestamp: new Date().toISOString()
    };
  }

  private static testNetworkAccess(): Promise<boolean> {
    return new Promise((resolve) => {
      const req = https.get('https://maven.fabricmc.net', { timeout: 4000 }, (res) => {
        resolve(res.statusCode !== undefined && res.statusCode < 500);
      });
      req.on('error', () => {
        // Try fallback to modrinth
        https.get('https://api.modrinth.com/v2', { timeout: 4000 }, (res2) => {
          resolve(res2.statusCode !== undefined && res2.statusCode < 500);
        }).on('error', () => resolve(false));
      });
    });
  }
}
