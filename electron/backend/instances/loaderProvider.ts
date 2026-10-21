import { LoaderType } from '../../types';
import { getCompatibilityProfile, resolveVersionConfig } from './fabricVersions';

export interface LoaderConfig {
  loaderVersion: string;
  buildPlugin: string;
  buildPluginVersion: string;
  mappingsVersion?: string;
  apiDependency?: string;
  gradleVersion: string;
  javaMinVersion: number;
  javaRecommendedVersion: number;
}

export interface ILoaderProvider {
  type: LoaderType;
  displayName: string;
  isSupported: boolean;
  supportedMinecraftVersions: string[];
  resolveConfig(minecraftVersion: string, requestedLoaderVersion?: string): LoaderConfig;
  getDefaultLoaderVersion(minecraftVersion: string): string;
  getAvailableLoaderVersions(minecraftVersion: string): string[];
}

/**
 * FabricLoaderProvider - delegates version resolution to fabricVersions.ts database.
 */
export class FabricLoaderProvider implements ILoaderProvider {
  public type: LoaderType = 'fabric';
  public displayName = 'Fabric';
  public isSupported = true;
  public supportedMinecraftVersions = [
    '26.3', '26.2', '26.1.2', '26.1.1',
    '1.21.4', '1.21.3', '1.21.1', '1.21',
    '1.20.6', '1.20.4', '1.20.2', '1.20.1',
    '1.19.4', '1.19.2', '1.18.2', '1.17.1', '1.16.5', '1.15.2'
  ];

  public resolveConfig(minecraftVersion: string, requestedLoaderVersion?: string): LoaderConfig {
    const profile = getCompatibilityProfile(minecraftVersion);
    const spec = resolveVersionConfig(minecraftVersion);
    const loaderVer = (requestedLoaderVersion && requestedLoaderVersion !== 'auto')
      ? requestedLoaderVersion
      : spec.loaderVersion;

    return {
      loaderVersion: loaderVer,
      buildPlugin: spec.pluginId || 'net.fabricmc.fabric-loom',
      buildPluginVersion: spec.loomVersion,
      mappingsVersion: spec.yarnMappings ?? `${minecraftVersion}+build.1`,
      apiDependency: spec.fabricApiVersion ? `net.fabricmc.fabric-api:fabric-api:${spec.fabricApiVersion}` : undefined,
      gradleVersion: spec.gradleVersion,
      javaMinVersion: profile.java.clientJavaMin,
      javaRecommendedVersion: profile.java.clientJavaRecommended
    };
  }

  public getDefaultLoaderVersion(minecraftVersion: string): string {
    const spec = resolveVersionConfig(minecraftVersion);
    return spec.loaderVersion;
  }

  public getAvailableLoaderVersions(minecraftVersion: string): string[] {
    const def = this.getDefaultLoaderVersion(minecraftVersion);
    const versions = [def, '0.16.9', '0.16.7', '0.16.5', '0.16.0', '0.15.11'];
    return Array.from(new Set(versions));
  }
}

/**
 * QuiltLoaderProvider - handles Quilt loader, quilt-loom build plugins, and hashed mappings.
 */
export class QuiltLoaderProvider implements ILoaderProvider {
  public type: LoaderType = 'quilt';
  public displayName = 'Quilt';
  public isSupported = true;
  public supportedMinecraftVersions = [
    '1.21.4', '1.21.1', '1.20.4', '1.20.1', '1.19.4', '1.19.2', '1.18.2'
  ];

  private defaultVersions: Record<string, string> = {
    '1.21.4': '0.27.1-beta.1',
    '1.21.1': '0.26.4',
    '1.20.4': '0.25.0',
    '1.20.1': '0.24.0',
    '1.19.4': '0.20.2',
    '1.19.2': '0.19.2',
    '1.18.2': '0.17.5'
  };

  public resolveConfig(minecraftVersion: string, requestedLoaderVersion?: string): LoaderConfig {
    const loaderVer = (requestedLoaderVersion && requestedLoaderVersion !== 'auto')
      ? requestedLoaderVersion
      : this.getDefaultLoaderVersion(minecraftVersion);

    let javaMin = 17;
    let javaRec = 17;
    let gradleVer = '8.10.2';
    let loomVer = '1.7-SNAPSHOT';

    if (minecraftVersion.startsWith('1.21') || minecraftVersion.startsWith('1.20.5') || minecraftVersion.startsWith('1.20.6')) {
      javaMin = 21;
      javaRec = 21;
      gradleVer = '8.10.2';
      loomVer = '1.8-SNAPSHOT';
    } else if (minecraftVersion.startsWith('1.18') || minecraftVersion.startsWith('1.19') || minecraftVersion.startsWith('1.20')) {
      javaMin = 17;
      javaRec = 17;
      gradleVer = '8.6';
      loomVer = '1.6-SNAPSHOT';
    }

    return {
      loaderVersion: loaderVer,
      buildPlugin: 'org.quiltmc.loom',
      buildPluginVersion: loomVer,
      mappingsVersion: `org.quiltmc:quilt-mappings:${minecraftVersion}+build.1:intermediary-v2`,
      gradleVersion: gradleVer,
      javaMinVersion: javaMin,
      javaRecommendedVersion: javaRec
    };
  }

  public getDefaultLoaderVersion(minecraftVersion: string): string {
    return this.defaultVersions[minecraftVersion] || '0.26.4';
  }

  public getAvailableLoaderVersions(minecraftVersion: string): string[] {
    const def = this.getDefaultLoaderVersion(minecraftVersion);
    const versions = [def, '0.27.0', '0.26.4', '0.25.0', '0.24.0', '0.20.2'];
    return Array.from(new Set(versions));
  }
}

/**
 * ForgeLoaderProvider - handles MinecraftForge loader, ForgeGradle, and dependencies.
 */
export class ForgeLoaderProvider implements ILoaderProvider {
  public type: LoaderType = 'forge';
  public displayName = 'Forge';
  public isSupported = true;
  public supportedMinecraftVersions = [
    '1.20.4', '1.20.2', '1.20.1', '1.19.4', '1.19.2', '1.18.2', '1.16.5'
  ];

  private defaultVersions: Record<string, string> = {
    '1.20.4': '49.0.38',
    '1.20.2': '48.1.0',
    '1.20.1': '47.3.0',
    '1.19.4': '45.2.0',
    '1.19.2': '43.3.0',
    '1.18.2': '40.2.21',
    '1.16.5': '36.2.39'
  };

  public resolveConfig(minecraftVersion: string, requestedLoaderVersion?: string): LoaderConfig {
    const loaderVer = (requestedLoaderVersion && requestedLoaderVersion !== 'auto')
      ? requestedLoaderVersion
      : this.getDefaultLoaderVersion(minecraftVersion);

    let javaMin = 17;
    let javaRec = 17;
    let gradleVer = '8.5';
    let fgVer = '6.0.+';

    if (minecraftVersion.startsWith('1.16')) {
      javaMin = 8;
      javaRec = 8;
      gradleVer = '7.6.4';
      fgVer = '5.1.+';
    } else if (minecraftVersion.startsWith('1.18') || minecraftVersion.startsWith('1.19') || minecraftVersion.startsWith('1.20')) {
      javaMin = 17;
      javaRec = 17;
      gradleVer = '8.5';
      fgVer = '6.0.+';
    }

    return {
      loaderVersion: loaderVer,
      buildPlugin: 'net.minecraftforge.gradle',
      buildPluginVersion: fgVer,
      mappingsVersion: `official_${minecraftVersion}`,
      gradleVersion: gradleVer,
      javaMinVersion: javaMin,
      javaRecommendedVersion: javaRec
    };
  }

  public getDefaultLoaderVersion(minecraftVersion: string): string {
    return this.defaultVersions[minecraftVersion] || '47.3.0';
  }

  public getAvailableLoaderVersions(minecraftVersion: string): string[] {
    const def = this.getDefaultLoaderVersion(minecraftVersion);
    const versions = [def, '47.3.0', '47.2.20', '40.2.21', '36.2.39'];
    return Array.from(new Set(versions));
  }
}

/**
 * NeoForgeLoaderProvider - handles NeoForge loader and ModDevGradle build plugin.
 */
export class NeoForgeLoaderProvider implements ILoaderProvider {
  public type: LoaderType = 'neoforge';
  public displayName = 'NeoForge';
  public isSupported = true;
  public supportedMinecraftVersions = [
    '1.21.4', '1.21.3', '1.21.1', '1.21', '1.20.6', '1.20.4'
  ];

  private defaultVersions: Record<string, string> = {
    '1.21.4': '21.4.28-beta',
    '1.21.3': '21.3.36-beta',
    '1.21.1': '21.1.72',
    '1.21': '21.0.167',
    '1.20.6': '20.6.119',
    '1.20.4': '20.4.237'
  };

  public resolveConfig(minecraftVersion: string, requestedLoaderVersion?: string): LoaderConfig {
    const loaderVer = (requestedLoaderVersion && requestedLoaderVersion !== 'auto')
      ? requestedLoaderVersion
      : this.getDefaultLoaderVersion(minecraftVersion);

    let javaMin = 21;
    let javaRec = 21;
    let gradleVer = '8.10.2';
    let pluginVer = '2.0.75';

    if (minecraftVersion.startsWith('1.20.4')) {
      javaMin = 17;
      javaRec = 17;
      gradleVer = '8.7';
      pluginVer = '1.0.18';
    }

    return {
      loaderVersion: loaderVer,
      buildPlugin: 'net.neoforged.moddev',
      buildPluginVersion: pluginVer,
      mappingsVersion: `official_${minecraftVersion}`,
      gradleVersion: gradleVer,
      javaMinVersion: javaMin,
      javaRecommendedVersion: javaRec
    };
  }

  public getDefaultLoaderVersion(minecraftVersion: string): string {
    return this.defaultVersions[minecraftVersion] || '21.1.72';
  }

  public getAvailableLoaderVersions(minecraftVersion: string): string[] {
    const def = this.getDefaultLoaderVersion(minecraftVersion);
    const versions = [def, '21.1.72', '21.1.65', '21.0.167', '20.4.237'];
    return Array.from(new Set(versions));
  }
}

export class LoaderRegistry {
  private static providers: Map<LoaderType, ILoaderProvider> = new Map([
    ['fabric', new FabricLoaderProvider()],
    ['quilt', new QuiltLoaderProvider()],
    ['forge', new ForgeLoaderProvider()],
    ['neoforge', new NeoForgeLoaderProvider()]
  ]);

  /**
   * Returns the provider for the given loader type.
   */
  public static getProvider(type: LoaderType): ILoaderProvider {
    const provider = this.providers.get(type);
    if (!provider) {
      const supported = this.getSupportedLoaders()
        .filter(l => l.isSupported)
        .map(l => l.displayName)
        .join(', ');
      throw new Error(
        `Loader "${type}" is not recognized in Voxel+. ` +
        `Available loaders: ${supported}.`
      );
    }
    return provider;
  }

  /**
   * Returns canonical loader descriptions. All four loaders are fully supported.
   */
  public static getSupportedLoaders(): { type: LoaderType; displayName: string; isSupported: boolean; supportedMinecraftVersions: string[] }[] {
    return [
      {
        type: 'fabric',
        displayName: 'Fabric',
        isSupported: true,
        supportedMinecraftVersions: (this.providers.get('fabric') as FabricLoaderProvider).supportedMinecraftVersions
      },
      {
        type: 'quilt',
        displayName: 'Quilt',
        isSupported: true,
        supportedMinecraftVersions: (this.providers.get('quilt') as QuiltLoaderProvider).supportedMinecraftVersions
      },
      {
        type: 'neoforge',
        displayName: 'NeoForge',
        isSupported: true,
        supportedMinecraftVersions: (this.providers.get('neoforge') as NeoForgeLoaderProvider).supportedMinecraftVersions
      },
      {
        type: 'forge',
        displayName: 'Forge',
        isSupported: true,
        supportedMinecraftVersions: (this.providers.get('forge') as ForgeLoaderProvider).supportedMinecraftVersions
      }
    ];
  }

  /** Convenience predicate to check if a loader type is supported. */
  public static isLoaderSupported(type: LoaderType): boolean {
    const provider = this.providers.get(type);
    return !!provider && provider.isSupported;
  }

  /** Convenience check to verify whether a loader supports a specific Minecraft version. */
  public static isCombinationSupported(type: LoaderType, minecraftVersion: string): boolean {
    const provider = this.providers.get(type);
    if (!provider) return false;
    return provider.supportedMinecraftVersions.includes(minecraftVersion);
  }
}
