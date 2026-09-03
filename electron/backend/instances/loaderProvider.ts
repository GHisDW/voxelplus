import { LoaderType } from '../../types';

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

export class FabricLoaderProvider implements ILoaderProvider {
  public type: LoaderType = 'fabric';
  public displayName = 'Fabric';
  public isSupported = true;

  public resolveConfig(minecraftVersion: string, requestedLoaderVersion?: string): LoaderConfig {
    const loaderVer = requestedLoaderVersion && requestedLoaderVersion !== 'auto'
      ? requestedLoaderVersion
      : '0.16.9';

    // Mappings and Loom resolution per Minecraft version
    let loomVersion = '1.8-SNAPSHOT';
    let mappingsVersion = `${minecraftVersion}+build.1:v2`;
    let fabricApiVersion = '0.108.0+1.21.1';
    let gradleVersion = '8.10.2';

    if (minecraftVersion.startsWith('1.21')) {
      loomVersion = '1.8-SNAPSHOT';
      mappingsVersion = `${minecraftVersion}+build.1:v2`;
      fabricApiVersion = minecraftVersion === '1.21.4' ? '0.114.0+1.21.4' : '0.108.0+1.21.1';
      gradleVersion = '8.10.2';
    } else if (minecraftVersion.startsWith('1.20')) {
      loomVersion = '1.6-SNAPSHOT';
      mappingsVersion = `${minecraftVersion}+build.1:v2`;
      fabricApiVersion = minecraftVersion.startsWith('1.20.4') ? '0.97.0+1.20.4' : '0.91.0+1.20.1';
      gradleVersion = '8.7';
    } else if (minecraftVersion.startsWith('1.19')) {
      loomVersion = '1.5-SNAPSHOT';
      mappingsVersion = `${minecraftVersion}+build.1:v2`;
      fabricApiVersion = '0.83.0+1.19.4';
      gradleVersion = '8.1';
    } else if (minecraftVersion.startsWith('1.18')) {
      loomVersion = '1.3-SNAPSHOT';
      mappingsVersion = `${minecraftVersion}+build.1:v2`;
      fabricApiVersion = '0.58.0+1.18.2';
      gradleVersion = '7.6';
    } else if (minecraftVersion.startsWith('1.16')) {
      loomVersion = '1.0-SNAPSHOT';
      mappingsVersion = `${minecraftVersion}+build.1:v2`;
      fabricApiVersion = '0.42.0+1.16.5';
      gradleVersion = '7.4';
    }

    return {
      loaderVersion: loaderVer,
      loomVersion,
      mappingsVersion,
      fabricApiVersion,
      gradleVersion
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
