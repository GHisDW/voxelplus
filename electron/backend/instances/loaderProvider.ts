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

  /**
   * Returns the provider for the given loader type.
   *
   * @throws {Error} for any loader that is not yet implemented.  The caller
   * must gate on `getSupportedLoaders()` before calling this method.  This
   * method deliberately does NOT fall back to Fabric because silently
   * substituting the wrong loader would corrupt instance configurations.
   */
  public static getProvider(type: LoaderType): ILoaderProvider {
    const provider = this.providers.get(type);
    if (!provider) {
      const supported = this.getSupportedLoaders()
        .filter(l => l.isSupported)
        .map(l => l.displayName)
        .join(', ');
      throw new Error(
        `Loader "${type}" is not yet implemented in Voxel+. ` +
        `Only the following loaders are currently supported: ${supported}. ` +
        `Do not silently substitute a different loader.`
      );
    }
    return provider;
  }

  /** Returns the canonical list of loaders.  Only entries with isSupported=true
   *  have a registered provider and can have getProvider() called on them. */
  public static getSupportedLoaders(): { type: LoaderType; displayName: string; isSupported: boolean }[] {
    return [
      { type: 'fabric',   displayName: 'Fabric',                isSupported: true  },
      { type: 'quilt',    displayName: 'Quilt (Coming Soon)',    isSupported: false },
      { type: 'neoforge', displayName: 'NeoForge (Coming Soon)', isSupported: false },
      { type: 'forge',    displayName: 'Forge (Coming Soon)',    isSupported: false }
    ];
  }

  /** Convenience predicate so callers can gate on support before invoking getProvider(). */
  public static isLoaderSupported(type: LoaderType): boolean {
    return this.providers.has(type);
  }
}
