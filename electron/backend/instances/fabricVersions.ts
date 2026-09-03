

export interface FabricVersionSpec {
  loaderVersion: string;
  loomVersion: string;
  yarnMappings: string | null;
  fabricApiVersion: string | null;
  gradleVersion: string;
  javaVersion: number;
  isNonObfuscated: boolean;
  pluginId: string;
}

const VERSION_DB: Record<string, FabricVersionSpec> = {
  // 26.x New Era
  '26.2': {
    loaderVersion: '0.19.5',
    loomVersion: '1.14.0',
    yarnMappings: null,
    fabricApiVersion: null,
    gradleVersion: '8.12',
    javaVersion: 21,
    isNonObfuscated: true,
    pluginId: 'net.fabricmc.loom'
  },
  '26.1.2': {
    loaderVersion: '0.19.5',
    loomVersion: '1.14.0',
    yarnMappings: null,
    fabricApiVersion: null,
    gradleVersion: '8.12',
    javaVersion: 21,
    isNonObfuscated: true,
    pluginId: 'net.fabricmc.loom'
  },
  '26.1.1': {
    loaderVersion: '0.19.5',
    loomVersion: '1.14.0',
    yarnMappings: null,
    fabricApiVersion: null,
    gradleVersion: '8.12',
    javaVersion: 21,
    isNonObfuscated: true,
    pluginId: 'net.fabricmc.loom'
  },

  // 1.21.x
  '1.21.4': {
    loaderVersion: '0.16.10',
    loomVersion: '1.8.13',
    yarnMappings: '1.21.4+build.8',
    fabricApiVersion: '0.114.0+1.21.4',
    gradleVersion: '8.10.2',
    javaVersion: 21,
    isNonObfuscated: false,
    pluginId: 'fabric-loom'
  },
  '1.21.3': {
    loaderVersion: '0.16.9',
    loomVersion: '1.8.13',
    yarnMappings: '1.21.3+build.2',
    fabricApiVersion: '0.112.0+1.21.3',
    gradleVersion: '8.10.2',
    javaVersion: 21,
    isNonObfuscated: false,
    pluginId: 'fabric-loom'
  },
  '1.21.1': {
    loaderVersion: '0.16.9',
    loomVersion: '1.8.13',
    yarnMappings: '1.21.1+build.3',
    fabricApiVersion: '0.108.0+1.21.1',
    gradleVersion: '8.10.2',
    javaVersion: 21,
    isNonObfuscated: false,
    pluginId: 'fabric-loom'
  },
  '1.21': {
    loaderVersion: '0.16.0',
    loomVersion: '1.8.13',
    yarnMappings: '1.21+build.9',
    fabricApiVersion: '0.102.0+1.21',
    gradleVersion: '8.10.2',
    javaVersion: 21,
    isNonObfuscated: false,
    pluginId: 'fabric-loom'
  },

  // 1.20.x
  '1.20.6': {
    loaderVersion: '0.15.11',
    loomVersion: '1.8.13',
    yarnMappings: '1.20.6+build.1',
    fabricApiVersion: '0.100.0+1.20.6',
    gradleVersion: '8.10.2',
    javaVersion: 21,
    isNonObfuscated: false,
    pluginId: 'fabric-loom'
  },
  '1.20.5': {
    loaderVersion: '0.15.11',
    loomVersion: '1.8.13',
    yarnMappings: '1.20.5+build.1',
    fabricApiVersion: '0.98.0+1.20.5',
    gradleVersion: '8.10.2',
    javaVersion: 21,
    isNonObfuscated: false,
    pluginId: 'fabric-loom'
  },
  '1.20.4': {
    loaderVersion: '0.15.7',
    loomVersion: '1.8.13',
    yarnMappings: '1.20.4+build.3',
    fabricApiVersion: '0.95.4+1.20.4',
    gradleVersion: '8.10.2',
    javaVersion: 17,
    isNonObfuscated: false,
    pluginId: 'fabric-loom'
  },
  '1.20.2': {
    loaderVersion: '0.15.3',
    loomVersion: '1.8.13',
    yarnMappings: '1.20.2+build.4',
    fabricApiVersion: '0.90.0+1.20.2',
    gradleVersion: '8.10.2',
    javaVersion: 17,
    isNonObfuscated: false,
    pluginId: 'fabric-loom'
  },
  '1.20.1': {
    loaderVersion: '0.15.1',
    loomVersion: '1.8.13',
    yarnMappings: '1.20.1+build.10',
    fabricApiVersion: '0.87.2+1.20.1',
    gradleVersion: '8.10.2',
    javaVersion: 17,
    isNonObfuscated: false,
    pluginId: 'fabric-loom'
  },
  '1.20': {
    loaderVersion: '0.14.21',
    loomVersion: '1.8.13',
    yarnMappings: '1.20+build.1',
    fabricApiVersion: '0.83.0+1.20',
    gradleVersion: '8.10.2',
    javaVersion: 17,
    isNonObfuscated: false,
    pluginId: 'fabric-loom'
  },

  // 1.19.x
  '1.19.4': {
    loaderVersion: '0.14.21',
    loomVersion: '1.8.13',
    yarnMappings: '1.19.4+build.2',
    fabricApiVersion: '0.79.0+1.19.4',
    gradleVersion: '8.10.2',
    javaVersion: 17,
    isNonObfuscated: false,
    pluginId: 'fabric-loom'
  },
  '1.19.2': {
    loaderVersion: '0.14.19',
    loomVersion: '1.8.13',
    yarnMappings: '1.19.2+build.28',
    fabricApiVersion: '0.77.0+1.19.2',
    gradleVersion: '8.10.2',
    javaVersion: 17,
    isNonObfuscated: false,
    pluginId: 'fabric-loom'
  },

  // 1.18.x
  '1.18.2': {
    loaderVersion: '0.14.19',
    loomVersion: '1.8.13',
    yarnMappings: '1.18.2+build.4',
    fabricApiVersion: '0.55.3+1.18.2',
    gradleVersion: '8.10.2',
    javaVersion: 17,
    isNonObfuscated: false,
    pluginId: 'fabric-loom'
  },

  // 1.16.x
  '1.16.5': {
    loaderVersion: '0.11.3',
    loomVersion: '0.8-SNAPSHOT',
    yarnMappings: '1.16.5+build.10',
    fabricApiVersion: '0.36.1+1.16',
    gradleVersion: '7.0',
    javaVersion: 8,
    isNonObfuscated: false,
    pluginId: 'fabric-loom'
  },

  // 1.17.x
  '1.17.1': {
    loaderVersion: '0.12.12',
    loomVersion: '0.9-SNAPSHOT',
    yarnMappings: '1.17.1+build.65',
    fabricApiVersion: '0.38.0+1.17',
    gradleVersion: '7.3',
    javaVersion: 16,
    isNonObfuscated: false,
    pluginId: 'fabric-loom'
  },

  // 1.15.x
  '1.15.2': {
    loaderVersion: '0.8.8',
    loomVersion: '0.4-SNAPSHOT',
    yarnMappings: '1.15.2+build.17',
    fabricApiVersion: '0.26.2+1.15',
    gradleVersion: '6.0',
    javaVersion: 8,
    isNonObfuscated: false,
    pluginId: 'fabric-loom'
  }
};

export function resolveVersionConfig(mcVersion: string): FabricVersionSpec {
  if (VERSION_DB[mcVersion]) return VERSION_DB[mcVersion];

  // 26.x match
  if (mcVersion.startsWith('26.')) {
    return VERSION_DB['26.1.2'];
  }

  // 1.x match â€” map minor version to nearest known spec
  const match = mcVersion.match(/^1\.(\d+)/);
  if (match) {
    const minor = parseInt(match[1]);
    if (minor >= 21) return VERSION_DB['1.21.1'];
    if (minor >= 20) return VERSION_DB['1.20.1'];
    if (minor >= 19) return VERSION_DB['1.19.4'];
    if (minor >= 18) return VERSION_DB['1.18.2'];
    if (minor >= 17) return VERSION_DB['1.17.1'];
    if (minor >= 16) return VERSION_DB['1.16.5'];
    if (minor >= 15) return VERSION_DB['1.15.2'];
    // 1.14 and below use same old Loom 0.4 / Java 8 setup
    return VERSION_DB['1.15.2'];
  }

  return VERSION_DB['1.21.1'];
}

export function generateBuildGradle(
  mcVersion: string,
  projectName: string,
  memoryMb: number,
  groupId: string = 'com.voxel.modtest'
): string {
  const spec = resolveVersionConfig(mcVersion);

  if (spec.isNonObfuscated) {
    return `plugins {
    id '${spec.pluginId}' version '${spec.loomVersion}'
    id 'java'
}

version = '1.0.0'
group = '${groupId}'

base {
    archivesName = '${projectName}'
}

repositories {
    mavenCentral()
    maven {
        name = 'Fabric'
        url = 'https://maven.fabricmc.net/'
    }
}

dependencies {
    minecraft "com.mojang:minecraft:\${project.minecraft_version}"
    modImplementation "net.fabricmc:fabric-loader:\${project.loader_version}"
}

// No custom Java source â€” this is a vanilla Fabric client instance
// Drop mods into the mods/ folder
sourceSets {
    main {
        java { srcDirs = [] }
        resources { srcDirs = ['src/main/resources'] }
    }
}

tasks.withType(JavaCompile).configureEach {
    it.options.release = ${spec.javaVersion}
}

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(${spec.javaVersion})
    }
}
`;
  }

  return `plugins {
    id '${spec.pluginId}' version '${spec.loomVersion}'
    id 'java'
}

version = '1.0.0'
group = '${groupId}'

base {
    archivesName = '${projectName}'
}

repositories {
    mavenCentral()
    maven {
        name = 'Fabric'
        url = 'https://maven.fabricmc.net/'
    }
}

dependencies {
    minecraft "com.mojang:minecraft:\${project.minecraft_version}"
    mappings "net.fabricmc:yarn:\${project.yarn_mappings}:v2"
    modImplementation "net.fabricmc:fabric-loader:\${project.loader_version}"
}

// No custom Java source â€” this is a vanilla Fabric client instance
// Drop mods into the mods/ folder
sourceSets {
    main {
        java { srcDirs = [] }
        resources { srcDirs = ['src/main/resources'] }
    }
}

tasks.withType(JavaCompile).configureEach {
    it.options.release = ${spec.javaVersion}
}

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(${spec.javaVersion})
    }
}
`;
}

export function generateGradleProperties(
  mcVersion: string,
  projectName: string,
  memoryMb: number
): string {
  const spec = resolveVersionConfig(mcVersion);

  const lines = [
    '# Fabric Loom Mod Development Properties',
    `minecraft_version=${mcVersion}`,
  ];

  if (!spec.isNonObfuscated && spec.yarnMappings) {
    lines.push(`yarn_mappings=${spec.yarnMappings}`);
  }

  lines.push(
    `loader_version=${spec.loaderVersion}`,
    '',
    '# Mod Properties',
    'mod_version=1.0.0',
    'maven_group=com.voxel.modtest',
    `archives_base_name=${projectName}`,
    '',
    '# Gradle & JVM Settings',
    `org.gradle.jvmargs=-Xmx${memoryMb}M -XX:+UseG1GC`,
    'org.gradle.parallel=true',
    'org.gradle.caching=true',
    'org.gradle.daemon=true'
  );

  return lines.join('\n') + '\n';
}

export function generateSettingsGradle(mcVersion: string, projectName: string): string {
  return `pluginManagement {
    repositories {
        maven {
            name = 'Fabric'
            url = 'https://maven.fabricmc.net/'
        }
        mavenCentral()
        gradlePluginPortal()
    }
}

rootProject.name = '${projectName}'
`;
}

export function getGradleDistributionUrl(mcVersion: string): string {
  const spec = resolveVersionConfig(mcVersion);
  return `https\\://services.gradle.org/distributions/gradle-${spec.gradleVersion}-bin.zip`;
}

export function getRequiredJavaVersion(mcVersion: string): number {
  const spec = resolveVersionConfig(mcVersion);
  return spec.javaVersion;
}

