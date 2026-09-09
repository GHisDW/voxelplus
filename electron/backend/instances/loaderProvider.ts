import { LoaderType } from '../../types';
import { getCompatibilityProfile, resolveVersionConfig } from './fabricVersions';

export interface LoaderConfig {
  loaderVersion: string;
  loomVersion: string;
  mappingsVersion: string;
  fabricApiVersion?: string;
  gradleVersion: string;
}

export interface ILoaderProvider {
  type: LoaderType;
  displayName: string;
  isSupported: boolean;
  resolveConfig(minecraftVersion: string, requestedLoaderVersion?: string): LoaderConfig;
}

/**
 * FabricLoaderProvider - delegates version resolution entirely to the centralized
 * fabricVersions.ts CompatibilityProfile database.  No more duplicate hardcoded values.
 */
export class FabricLoaderProvider implements ILoaderProvider {
  public type: LoaderType = 'fabric';
  public displayName = 'Fabric';
  public isSupported = true;

  public resolveConfig(minecraftVersion: string, requestedLoaderVersion?: string): LoaderConfig {
    const profile = getCompatibilityProfile(minecraftVersion);
    const spec = resolveVersionConfig(minecraftVersion);

    // Allow caller to override loader version (e.g. explicit user selection)
    const loaderVer = (requestedLoaderVersion && requestedLoaderVersion !== 'auto')
      ? requestedLoaderVersion
      : spec.loaderVersion;

    return {
      loaderVersion: loaderVer,
      loomVersion: spec.loomVersion,
      // mappingsVersion is returned without ':v2' suffix for external use
      mappingsVersion: spec.yarnMappings ?? `${minecraftVersion}+build.1`,
      fabricApiVersion: spec.fabricApiVersion ?? undefined,
      gradleVersion: spec.gradleVersion
    };
  }
}

export class LoaderRegistry {
  private static providers: Map<LoaderType, ILoaderProvider> = new Map([
    ['fabric', new FabricLoaderProvider()]
  ]);

  public static getProvider(type: LoaderType): ILoaderProvider {
    const provider = this.providers.get(type);
    if (!provider) {
      // Fallback to Fabric
      return this.providers.get('fabric')!;
    }
    return provider;
  }

  public static getSupportedLoaders(): { type: LoaderType; displayName: string; isSupported: boolean }[] {
    return [
      { type: 'fabric', displayName: 'Fabric', isSupported: true },
      { type: 'quilt', displayName: 'Quilt (Coming Soon)', isSupported: false },
      { type: 'neoforge', displayName: 'NeoForge (Coming Soon)', isSupported: false },
      { type: 'forge', displayName: 'Forge (Coming Soon)', isSupported: false }
    ];
  }
}
