import { LoaderType } from '../../types';
import { LoaderRegistry } from './loaderProvider';
import { generateBuildGradle, generateGradleProperties, generateSettingsGradle, getGradleDistributionUrl } from './fabricVersions';

export class MultiLoaderProjectScaffolder {
  /**
   * Generates build.gradle suited for the chosen loader.
   */
  public static generateBuildGradle(loaderType: LoaderType, mcVersion: string, projectName: string, memoryMb: number = 4096): string {
    const provider = LoaderRegistry.getProvider(loaderType);
    const config = provider.resolveConfig(mcVersion);

    if (loaderType === 'quilt') {
      return `plugins {
    id '${config.buildPlugin}' version '${config.buildPluginVersion}'
    id 'maven-publish'
}

version = '1.0.0'
group = 'com.voxelplus'

repositories {
    mavenCentral()
    maven { url = 'https://maven.quiltmc.org/repository/release' }
    maven { url = 'https://maven.quiltmc.org/repository/snapshot' }
    maven { url = 'https://maven.fabricmc.net/' }
}

dependencies {
    minecraft "com.mojang:minecraft:${mcVersion}"
    mappings "${config.mappingsVersion}"
    modImplementation "org.quiltmc:quilt-loader:${config.loaderVersion}"
    ${config.apiDependency ? `modImplementation "${config.apiDependency}"` : ''}
}

processResources {
    inputs.property "version", project.version
    filteringCharset "UTF-8"
}

tasks.withType(JavaCompile).configureEach {
    it.options.encoding = "UTF-8"
    it.options.release = ${config.javaMinVersion}
}

loom {
    runs {
        client {
            client()
            name "Voxel+ Quilt Client"
            vmArg "-Xmx${memoryMb}M"
        }
    }
}
`;
    }

    if (loaderType === 'neoforge') {
      return `plugins {
    id '${config.buildPlugin}' version '${config.buildPluginVersion}'
}

version = '1.0.0'
group = 'com.voxelplus'

repositories {
    mavenLocal()
    mavenCentral()
    maven { url = 'https://maven.neoforged.net/releases' }
}

neoForge {
    version = "${config.loaderVersion}"
    parchment {
        minecraftVersion = "${mcVersion}"
    }
    runs {
        client {
            client()
            gameDirectory = file('run')
            jvmArguments.addAll('-Xmx${memoryMb}M')
        }
    }
    mods {
        voxelplus_instance {
            sourceSet project.sourceSets.main
        }
    }
}

tasks.withType(JavaCompile).configureEach {
    options.encoding = 'UTF-8'
}
`;
    }

    if (loaderType === 'forge') {
      return `buildscript {
    repositories {
        mavenCentral()
        maven { url = 'https://maven.minecraftforge.net' }
    }
    dependencies {
        classpath group: 'net.minecraftforge.gradle', name: 'ForgeGradle', version: '${config.buildPluginVersion}', changing: true
    }
}

apply plugin: 'net.minecraftforge.gradle'
apply plugin: 'eclipse'
apply plugin: 'maven-publish'

version = '1.0.0'
group = 'com.voxelplus'

java.toolchain.languageVersion = JavaLanguageVersion.of(${config.javaMinVersion})

minecraft {
    mappings channel: 'official', version: '${mcVersion}'
    runs {
        client {
            workingDirectory project.file('run')
            property 'forge.logging.markers', 'REGISTRIES'
            property 'forge.logging.console.level', 'debug'
            jvmArg "-Xmx${memoryMb}M"
            mods {
                voxelplus_instance {
                    source sourceSets.main
                }
            }
        }
    }
}

dependencies {
    minecraft "net.minecraftforge:forge:${mcVersion}-${config.loaderVersion}"
}
`;
    }

    // Default to Fabric Loom generator
    return generateBuildGradle(mcVersion, projectName, memoryMb);
  }

  /**
   * Generates settings.gradle for the chosen loader.
   */
  public static generateSettingsGradle(loaderType: LoaderType, mcVersion: string, projectName: string): string {
    if (loaderType === 'quilt') {
      return `pluginManagement {
    repositories {
        maven { url = 'https://maven.quiltmc.org/repository/release' }
        maven { url = 'https://maven.quiltmc.org/repository/snapshot' }
        maven { url = 'https://maven.fabricmc.net/' }
        gradlePluginPortal()
    }
}

rootProject.name = '${projectName}'
`;
    }

    if (loaderType === 'neoforge') {
      return `pluginManagement {
    repositories {
        mavenCentral()
        gradlePluginPortal()
        maven { url = 'https://maven.neoforged.net/releases' }
    }
}

rootProject.name = '${projectName}'
`;
    }

    if (loaderType === 'forge') {
      return `pluginManagement {
    repositories {
        mavenCentral()
        gradlePluginPortal()
        maven { url = 'https://maven.minecraftforge.net' }
    }
}

rootProject.name = '${projectName}'
`;
    }

    return generateSettingsGradle(mcVersion, projectName);
  }

  /**
   * Generates gradle.properties for the chosen loader.
   */
  public static generateGradleProperties(loaderType: LoaderType, mcVersion: string, projectName: string, memoryMb: number = 4096): string {
    const provider = LoaderRegistry.getProvider(loaderType);
    const config = provider.resolveConfig(mcVersion);

    if (loaderType === 'quilt') {
      return `org.gradle.jvmargs=-Xmx${memoryMb}M
minecraft_version=${mcVersion}
quilt_loader_version=${config.loaderVersion}
`;
    }

    if (loaderType === 'neoforge') {
      return `org.gradle.jvmargs=-Xmx${memoryMb}M
minecraft_version=${mcVersion}
neoforge_version=${config.loaderVersion}
`;
    }

    if (loaderType === 'forge') {
      return `org.gradle.jvmargs=-Xmx${memoryMb}M
minecraft_version=${mcVersion}
forge_version=${config.loaderVersion}
`;
    }

    return generateGradleProperties(mcVersion, projectName, memoryMb);
  }

  /**
   * Generates mods.toml for Forge / NeoForge instances.
   */
  public static generateModsToml(instanceName: string, loaderType: 'forge' | 'neoforge', mcVersion: string): string {
    return `modLoader="${loaderType}"
loaderVersion="[1,)"
license="MIT"

[[mods]]
modId="voxelplus_instance"
version="1.0.0"
displayName="${instanceName}"
description="Voxel+ ${loaderType} instance."

[[dependencies.voxelplus_instance]]
modId="minecraft"
mandatory=true
versionRange="[${mcVersion}]"
ordering="NONE"
side="BOTH"
`;
  }

  /**
   * Generates quilt.mod.json for Quilt instances.
   */
  public static generateQuiltModJson(instanceName: string, mcVersion: string): string {
    return JSON.stringify({
      schema_version: 1,
      quilt_loader: {
        group: "com.voxelplus",
        id: "voxelplus_instance",
        version: "1.0.0",
        metadata: {
          name: instanceName,
          description: "Voxel+ Quilt instance."
        },
        intermediate_mappings: "net.fabricmc:intermediary",
        depends: [
          {
            id: "quilt_loader",
            versions: ">=0.20.0"
          },
          {
            id: "minecraft",
            versions: `>=${mcVersion}`
          }
        ]
      }
    }, null, 2);
  }
}
