import { JavaRuntime, LoaderType } from '../../types';
import { LoaderRegistry } from './loaderProvider';
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
    type: LoaderType;
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
  apiDependency?: string;
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
  public static resolveCompatibility(minecraftVersion: string, loaderType: LoaderType = 'fabric'): MinecraftCompatibility {
    const provider = LoaderRegistry.getProvider(loaderType);
    const config = provider.resolveConfig(minecraftVersion);
    const requiredJava = JavaCompatibilityResolver.getRequiredJavaMajorVersion(minecraftVersion);

    return {
      minecraftVersion,
      java: {
        min: config.javaMinVersion || requiredJava,
        max: undefined,
        recommended: config.javaRecommendedVersion || requiredJava,
        buildTool: config.javaRecommendedVersion || requiredJava
      },
      loader: {
        type: loaderType,
        version: config.loaderVersion
      },
      buildTool: {
        loomVersion: config.buildPluginVersion,
        gradleVersion: config.gradleVersion,
        pluginId: config.buildPlugin
      },
      mappings: config.mappingsVersion ? {
        provider: loaderType === 'quilt' ? 'quilt' : (loaderType === 'fabric' ? 'yarn' : 'official'),
        version: config.mappingsVersion
      } : undefined,
      apiDependency: config.apiDependency,
      fabricApiVersion: loaderType === 'fabric' && config.apiDependency ? config.apiDependency.split(':').pop() : undefined,
      isNonObfuscated: minecraftVersion.startsWith('26.')
    };
  }

  public static resolveEnvironment(
    minecraftVersion: string,
    installedJavaRuntimes: JavaRuntime[],
    preferredJavaId?: string,
    loaderType: LoaderType = 'fabric'
  ): ResolvedEnvironment {
    const compatibility = this.resolveCompatibility(minecraftVersion, loaderType);
    
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

  public static isJavaCompatible(java: JavaRuntime, compatibility: MinecraftCompatibility): boolean {
    if (!java.isValid) return false;
    
    const required = compatibility.java.recommended;
    
    if (java.majorVersion < compatibility.java.min) return false;
    
    if (java.majorVersion === required) return true;
    
    if (required === 8 && java.majorVersion >= 8 && java.majorVersion < 11) return true;
    if (required === 17 && java.majorVersion >= 17) return true;
    if (required === 21 && java.majorVersion >= 21) return true;
    if (required === 25 && java.majorVersion >= 25) return true;
    
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
      j.majorVersion === required && 
      j.isLts && 
      j.architecture === 'x64'
    );
    if (exactLts64) return exactLts64;

    const exact64 = valid.find(j => 
      j.majorVersion === required && 
      j.architecture === 'x64'
    );
    if (exact64) return exact64;

    const exactAny = valid.find(j => j.majorVersion === required);
    if (exactAny) return exactAny;

    const compatibleLts64 = valid.find(j => 
      j.majorVersion >= required && 
      j.isLts && 
      j.architecture === 'x64'
    );
    if (compatibleLts64) return compatibleLts64;

    return valid[0] || null;
  }
}
