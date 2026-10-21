import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { LoaderType, JavaRuntime } from '../../types';
import { LoaderRegistry } from './loaderProvider';
import { MinecraftCompatibilityResolver, MinecraftCompatibility } from './minecraftCompatibilityResolver';
import { JavaDetector } from '../java/javaDetector';

export type PreflightSeverity = 'COMPATIBLE' | 'INFO' | 'WARNING' | 'BLOCKING_ERROR';

export interface PreflightIssue {
  severity: PreflightSeverity;
  category: 'JAVA' | 'LOADER' | 'MEMORY' | 'FILESYSTEM' | 'MINECRAFT';
  title: string;
  message: string;
  suggestedAction?: string;
}

export interface PreflightReport {
  overallStatus: PreflightSeverity;
  isLaunchable: boolean;
  issues: PreflightIssue[];
  compatibility: MinecraftCompatibility;
  selectedJava: JavaRuntime | null;
  allocatedMemoryMb: number;
}

export class PreflightChecker {
  /**
   * Evaluates launch or creation readiness for a Minecraft instance.
   */
  public static async runPreflight(
    minecraftVersion: string,
    loaderType: LoaderType,
    allocatedMemoryMb: number = 4096,
    instanceDir?: string,
    preferredJavaId?: string
  ): Promise<PreflightReport> {
    const issues: PreflightIssue[] = [];

    // 1. Resolve loader and Minecraft compatibility
    let compatibility: MinecraftCompatibility;
    try {
      compatibility = MinecraftCompatibilityResolver.resolveCompatibility(minecraftVersion, loaderType);
      
      const isCombSupported = LoaderRegistry.isCombinationSupported(loaderType, minecraftVersion);
      if (!isCombSupported) {
        issues.push({
          severity: 'WARNING',
          category: 'LOADER',
          title: 'Experimental Loader Combination',
          message: `${loaderType.toUpperCase()} on Minecraft ${minecraftVersion} is experimental or community-maintained.`,
          suggestedAction: 'Ensure all required loader dependencies and core mods support this version.'
        });
      } else {
        issues.push({
          severity: 'INFO',
          category: 'LOADER',
          title: 'Supported Loader Configuration',
          message: `${compatibility.loader.type.toUpperCase()} v${compatibility.loader.version} is verified for Minecraft ${minecraftVersion}.`
        });
      }
    } catch (e: any) {
      compatibility = {
        minecraftVersion,
        java: { min: 17, recommended: 21, buildTool: 21 },
        loader: { type: loaderType, version: 'unknown' },
        buildTool: { loomVersion: 'unknown', gradleVersion: '8.10.2', pluginId: 'unknown' },
        isNonObfuscated: false
      };
      issues.push({
        severity: 'BLOCKING_ERROR',
        category: 'LOADER',
        title: 'Unsupported Loader Configuration',
        message: e.message,
        suggestedAction: 'Select a supported loader or compatible Minecraft version.'
      });
    }

    // 2. Java Runtime Check
    const javaList = await JavaDetector.scanSystemJava();
    const resolvedEnv = MinecraftCompatibilityResolver.resolveEnvironment(
      minecraftVersion,
      javaList,
      preferredJavaId,
      loaderType
    );

    const selectedJava = resolvedEnv.javaRuntime;
    if (!resolvedEnv.isCompatible || !selectedJava) {
      issues.push({
        severity: 'BLOCKING_ERROR',
        category: 'JAVA',
        title: 'Incompatible or Missing Java Runtime',
        message: `Minecraft ${minecraftVersion} (${loaderType}) requires Java ${compatibility.java.recommended} LTS.`,
        suggestedAction: `Install Java ${compatibility.java.recommended} from the Java Manager or Adoptium, then try again.`
      });
    } else {
      if (selectedJava.majorVersion === compatibility.java.recommended) {
        issues.push({
          severity: 'INFO',
          category: 'JAVA',
          title: 'Optimal Java Runtime Found',
          message: `Using ${selectedJava.name} (${selectedJava.vendor} ${selectedJava.fullVersion}, ${selectedJava.architecture}).`
        });
      } else {
        issues.push({
          severity: 'WARNING',
          category: 'JAVA',
          title: 'Suboptimal Java Runtime Version',
          message: `Using Java ${selectedJava.majorVersion}, but Java ${compatibility.java.recommended} is recommended for optimal performance.`,
          suggestedAction: `Consider installing Java ${compatibility.java.recommended} LTS.`
        });
      }
    }

    // 3. Memory & System Resources Check
    const totalMemBytes = os.totalmem();
    const freeMemBytes = os.freemem();
    const allocatedBytes = allocatedMemoryMb * 1024 * 1024;

    if (allocatedBytes > totalMemBytes) {
      issues.push({
        severity: 'BLOCKING_ERROR',
        category: 'MEMORY',
        title: 'Allocated Memory Exceeds System RAM',
        message: `Allocated ${allocatedMemoryMb} MB exceeds total system memory (${Math.round(totalMemBytes / (1024 * 1024))} MB).`,
        suggestedAction: 'Reduce allocated memory in instance settings.'
      });
    } else if (allocatedBytes > freeMemBytes) {
      issues.push({
        severity: 'WARNING',
        category: 'MEMORY',
        title: 'Low Available System Memory',
        message: `Allocated ${allocatedMemoryMb} MB is greater than currently free system memory (${Math.round(freeMemBytes / (1024 * 1024))} MB).`,
        suggestedAction: 'Close background memory-heavy applications to prevent swapping.'
      });
    } else if (allocatedMemoryMb < 2048 && !minecraftVersion.startsWith('1.16')) {
      issues.push({
        severity: 'WARNING',
        category: 'MEMORY',
        title: 'Low Memory Allocation',
        message: `Allocated memory (${allocatedMemoryMb} MB) may cause OutOfMemory errors in modern modded Minecraft.`,
        suggestedAction: 'Recommended allocation is at least 4096 MB.'
      });
    }

    // 4. Filesystem & Wrapper Check (if instance directory is provided)
    if (instanceDir) {
      if (!fs.existsSync(instanceDir)) {
        issues.push({
          severity: 'BLOCKING_ERROR',
          category: 'FILESYSTEM',
          title: 'Instance Directory Missing',
          message: `Folder does not exist at path: ${instanceDir}`,
          suggestedAction: 'Re-create or re-import the instance.'
        });
      } else {
        const gradlewBat = path.join(instanceDir, 'gradlew.bat');
        if (!fs.existsSync(gradlewBat)) {
          issues.push({
            severity: 'BLOCKING_ERROR',
            category: 'FILESYSTEM',
            title: 'Missing Gradle Wrapper',
            message: 'gradlew.bat is missing from the instance directory.',
            suggestedAction: 'Re-generate project files or restore gradlew.bat.'
          });
        }
      }
    }

    // Determine overall status
    let overallStatus: PreflightSeverity = 'COMPATIBLE';
    if (issues.some(i => i.severity === 'BLOCKING_ERROR')) {
      overallStatus = 'BLOCKING_ERROR';
    } else if (issues.some(i => i.severity === 'WARNING')) {
      overallStatus = 'WARNING';
    } else if (issues.some(i => i.severity === 'INFO')) {
      overallStatus = 'INFO';
    }

    return {
      overallStatus,
      isLaunchable: overallStatus !== 'BLOCKING_ERROR',
      issues,
      compatibility,
      selectedJava,
      allocatedMemoryMb
    };
  }
}
