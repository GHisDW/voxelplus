import { JavaRuntime } from '../../types';
import { resolveVersionConfig, FabricVersionSpec } from './fabricVersions';
import { JavaCompatibilityResolver } from '../java/compatibility';

export interface MinecraftCompatibility {
  minecraftVersion: string;
  java: {
    min: number;
    max?: number;
    recommended: number;
    buildTool: number;
  };
  loader: {
    type: 'fabric';
    version: string;
  };
  buildTool: {
    loomVersion: string;
    gradleVersion: string;
    pluginId: string;
  };
  mappings?: {
    provider: string;
    version?: string;
  };
  fabricApiVersion?: string;
  isNonObfuscated: boolean;
}

export interface ResolvedEnvironment {
  compatibility: MinecraftCompatibility;
  javaRuntime: JavaRuntime | null;
  javaHome: string | null;
  javaExecutable: string | null;
  isCompatible: boolean;
  missingJavaVersion?: number;
}

export class MinecraftCompatibilityResolver {
  public static resolveCompatibility(minecraftVersion: string): MinecraftCompatibility {
    const spec = resolveVersionConfig(minecraftVersion);
    const requiredJava = JavaCompatibilityResolver.getRequiredJavaMajorVersion(minecraftVersion);

    return {
      minecraftVersion,
      java: {
        min: requiredJava,
        max: undefined,
        recommended: spec.javaVersion,
        buildTool: spec.javaVersion
      },
      loader: {
        type: 'fabric',
        version: spec.loaderVersion
      },
      buildTool: {
        loomVersion: spec.loomVersion,
        gradleVersion: spec.gradleVersion,
        pluginId: spec.pluginId
      },
      mappings: spec.yarnMappings ? {
        provider: 'yarn',
        version: spec.yarnMappings
      } : undefined,
      fabricApiVersion: spec.fabricApiVersion || undefined,
      isNonObfuscated: spec.isNonObfuscated
    };
  }

  public static resolveEnvironment(
    minecraftVersion: string,
    installedJavaRuntimes: JavaRuntime[],
    preferredJavaId?: string
  ): ResolvedEnvironment {
    const compatibility = this.resolveCompatibility(minecraftVersion);
    
    if (preferredJavaId && preferredJavaId !== 'auto') {
      const preferred = installedJavaRuntimes.find(j => 
        j.id === preferredJavaId || j.executablePath === preferredJavaId
      );
      
      if (preferred && this.isJavaCompatible(preferred, compatibility)) {
        return {
          compatibility,
          javaRuntime: preferred,
          javaHome: preferred.path,
          javaExecutable: preferred.executablePath,
          isCompatible: true
        };
      }
    }

    const selectedJava = this.selectBestJava(installedJavaRuntimes, compatibility);
    
    if (!selectedJava) {
      return {
        compatibility,
        javaRuntime: null,
        javaHome: null,
        javaExecutable: null,
        isCompatible: false,
        missingJavaVersion: compatibility.java.recommended
      };
    }

    return {
      compatibility,
      javaRuntime: selectedJava,
      javaHome: selectedJava.path,
      javaExecutable: selectedJava.executablePath,
      isCompatible: true
    };
  }

  private static isJavaCompatible(java: JavaRuntime, compatibility: MinecraftCompatibility): boolean {
    if (!java.isValid) return false;
    
    const required = compatibility.java.recommended;
    
    if (java.majorVersion < compatibility.java.min) return false;
    
    if (java.majorVersion === required) return true;
    
    if (required === 8 && java.majorVersion >= 8 && java.majorVersion < 11) return true;
    if (required === 17 && java.majorVersion >= 17) return true;
    if (required === 21 && java.majorVersion >= 21) return true;
    
    return java.majorVersion >= required;
  }

  private static selectBestJava(
    installed: JavaRuntime[],
    compatibility: MinecraftCompatibility
  ): JavaRuntime | null {
    const required = compatibility.java.recommended;
    const valid = installed.filter(j => j.isValid && this.isJavaCompatible(j, compatibility));

    if (valid.length === 0) return null;

    const exactLts64 = valid.find(j => 
      j.majorVersion === required && j.isLts && j.architecture === 'x64'
    );
    if (exactLts64) return exactLts64;

    const exact = valid.find(j => j.majorVersion === required);
    if (exact) return exact;

    const compatibleLts64 = valid
      .filter(j => j.majorVersion > required && j.isLts && j.architecture === 'x64')
      .sort((a, b) => a.majorVersion - b.majorVersion)[0];
    if (compatibleLts64) return compatibleLts64;

    const anyCompatible = valid
      .filter(j => j.majorVersion >= required)
      .sort((a, b) => a.majorVersion - b.majorVersion)[0];

    return anyCompatible || null;
  }

  public static getCompatibilityDescription(compatibility: MinecraftCompatibility): string {
    const javaDesc = compatibility.java.min === compatibility.java.recommended
      ? `Java ${compatibility.java.recommended}`
      : `Java ${compatibility.java.min}+ (recommended: ${compatibility.java.recommended})`;
    
    return `Minecraft ${compatibility.minecraftVersion} requires ${javaDesc}, ` +
           `Fabric Loader ${compatibility.loader.version}, ` +
           `Gradle ${compatibility.buildTool.gradleVersion}, ` +
           `Loom ${compatibility.buildTool.loomVersion}`;
  }

  public static validateProjectConfig(
    minecraftVersion: string,
    generatedGradleVersion: string,
    generatedLoomVersion: string,
    generatedJavaVersion: number
  ): boolean {
    const compatibility = this.resolveCompatibility(minecraftVersion);
    
    const gradleMatch = generatedGradleVersion === compatibility.buildTool.gradleVersion;
    const loomMatch = generatedLoomVersion === compatibility.buildTool.loomVersion;
    const javaMatch = generatedJavaVersion === compatibility.java.recommended;
    
    return gradleMatch && loomMatch && javaMatch;
  }
}
