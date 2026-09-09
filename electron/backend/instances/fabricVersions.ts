export interface CompatibilityProfile {
  minecraftVersion: string;
  generation: string;
  status: 'SUPPORTED' | 'EXPERIMENTAL' | 'UNSUPPORTED';
  unsupportedReason?: string;

  java: {
    gradleJvmMin: number;
    clientJavaMin: number;
    clientJavaRecommended: number;
    clientJavaMax?: number;
  };

  buildTool: {
    gradleVersion: string;
    loomVersion: string;
    pluginId: string;
  };

  fabric: {
    loaderVersion: string;
    mappingsProvider: 'yarn' | 'mojang' | 'none';
    mappingsVersion: string | null;
    fabricApiVersion: string | null;
    isNonObfuscated: boolean;
  };
}

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

// Experimentally verified profiles for representative generations (1.15.x to 26.x)
const VERIFIED_PROFILES: Record<string, CompatibilityProfile> = {
  // 26.x New Era (Non-Obfuscated, requires Gradle 9.4.0, Loom 1.16.3, Loader 0.19.5, Java 25)
  '26.2': {
    minecraftVersion: '26.2',
    generation: '26.x',
    status: 'SUPPORTED',
    java: {
      gradleJvmMin: 21,
      clientJavaMin: 24,
      clientJavaRecommended: 25
    },
    buildTool: {
      gradleVersion: '9.4.0',
      loomVersion: '1.16.3',
      pluginId: 'net.fabricmc.fabric-loom'
    },
    fabric: {
      loaderVersion: '0.19.5',
      mappingsProvider: 'none',
      mappingsVersion: null,
      fabricApiVersion: null,
      isNonObfuscated: true
    }
  },
  '26.1.2': {
    minecraftVersion: '26.1.2',
    generation: '26.x',
    status: 'SUPPORTED',
    java: {
      gradleJvmMin: 21,
      clientJavaMin: 24,
      clientJavaRecommended: 25
    },
    buildTool: {
      gradleVersion: '9.4.0',
      loomVersion: '1.16.3',
      pluginId: 'net.fabricmc.fabric-loom'
    },
    fabric: {
      loaderVersion: '0.19.5',
      mappingsProvider: 'none',
      mappingsVersion: null,
      fabricApiVersion: null,
      isNonObfuscated: true
    }
  },
  '26.1.1': {
    minecraftVersion: '26.1.1',
    generation: '26.x',
    status: 'SUPPORTED',
    java: {
      gradleJvmMin: 21,
      clientJavaMin: 24,
      clientJavaRecommended: 25
    },
    buildTool: {
      gradleVersion: '9.4.0',
      loomVersion: '1.16.3',
      pluginId: 'net.fabricmc.fabric-loom'
    },
    fabric: {
      loaderVersion: '0.19.5',
      mappingsProvider: 'none',
      mappingsVersion: null,
      fabricApiVersion: null,
      isNonObfuscated: true
    }
  },

  // 1.21.x (Gradle 8.10.2, Loom 1.8.13, Loader 0.16.10, Java 21)
  '1.21.4': {
    minecraftVersion: '1.21.4',
    generation: '1.21.x',
    status: 'SUPPORTED',
    java: {
      gradleJvmMin: 17,
      clientJavaMin: 21,
      clientJavaRecommended: 21
    },
    buildTool: {
      gradleVersion: '8.10.2',
      loomVersion: '1.8.13',
      pluginId: 'fabric-loom'
    },
    fabric: {
      loaderVersion: '0.16.10',
      mappingsProvider: 'yarn',
      mappingsVersion: '1.21.4+build.8',
      fabricApiVersion: '0.114.0+1.21.4',
      isNonObfuscated: false
    }
  },
  '1.21.3': {
    minecraftVersion: '1.21.3',
    generation: '1.21.x',
    status: 'SUPPORTED',
    java: {
      gradleJvmMin: 17,
      clientJavaMin: 21,
      clientJavaRecommended: 21
    },
    buildTool: {
      gradleVersion: '8.10.2',
      loomVersion: '1.8.13',
      pluginId: 'fabric-loom'
    },
    fabric: {
      loaderVersion: '0.16.10',
      mappingsProvider: 'yarn',
      mappingsVersion: '1.21.3+build.2',
      fabricApiVersion: '0.112.0+1.21.3',
      isNonObfuscated: false
    }
  },
  '1.21.1': {
    minecraftVersion: '1.21.1',
    generation: '1.21.x',
    status: 'SUPPORTED',
    java: {
      gradleJvmMin: 17,
      clientJavaMin: 21,
      clientJavaRecommended: 21
    },
    buildTool: {
      gradleVersion: '8.10.2',
      loomVersion: '1.8.13',
      pluginId: 'fabric-loom'
    },
    fabric: {
      loaderVersion: '0.16.10',
      mappingsProvider: 'yarn',
      mappingsVersion: '1.21.1+build.3',
      fabricApiVersion: '0.108.0+1.21.1',
      isNonObfuscated: false
    }
  },
  '1.21': {
    minecraftVersion: '1.21',
    generation: '1.21.x',
    status: 'SUPPORTED',
    java: {
      gradleJvmMin: 17,
      clientJavaMin: 21,
      clientJavaRecommended: 21
    },
    buildTool: {
      gradleVersion: '8.10.2',
      loomVersion: '1.8.13',
      pluginId: 'fabric-loom'
    },
    fabric: {
      loaderVersion: '0.16.10',
      mappingsProvider: 'yarn',
      mappingsVersion: '1.21+build.9',
      fabricApiVersion: '0.102.0+1.21',
      isNonObfuscated: false
    }
  },

  // 1.20.x
  '1.20.6': {
    minecraftVersion: '1.20.6',
    generation: '1.20.x',
    status: 'SUPPORTED',
    java: {
      gradleJvmMin: 17,
      clientJavaMin: 21,
      clientJavaRecommended: 21
    },
    buildTool: {
      gradleVersion: '8.10.2',
      loomVersion: '1.8.13',
      pluginId: 'fabric-loom'
    },
    fabric: {
      loaderVersion: '0.16.10',
      mappingsProvider: 'yarn',
      mappingsVersion: '1.20.6+build.1',
      fabricApiVersion: '0.100.0+1.20.6',
      isNonObfuscated: false
    }
  },
  '1.20.5': {
    minecraftVersion: '1.20.5',
    generation: '1.20.x',
    status: 'SUPPORTED',
    java: {
      gradleJvmMin: 17,
      clientJavaMin: 21,
      clientJavaRecommended: 21
    },
    buildTool: {
      gradleVersion: '8.10.2',
      loomVersion: '1.8.13',
      pluginId: 'fabric-loom'
    },
    fabric: {
      loaderVersion: '0.16.10',
      mappingsProvider: 'yarn',
      mappingsVersion: '1.20.5+build.1',
      fabricApiVersion: '0.97.8+1.20.5',
      isNonObfuscated: false
    }
  },
  '1.20.4': {
    minecraftVersion: '1.20.4',
    generation: '1.20.x',
    status: 'SUPPORTED',
    java: {
      gradleJvmMin: 17,
      clientJavaMin: 17,
      clientJavaRecommended: 17
    },
    buildTool: {
      gradleVersion: '8.10.2',
      loomVersion: '1.8.13',
      pluginId: 'fabric-loom'
    },
    fabric: {
      loaderVersion: '0.16.10',
      mappingsProvider: 'yarn',
      mappingsVersion: '1.20.4+build.3',
      fabricApiVersion: '0.95.4+1.20.4',
      isNonObfuscated: false
    }
  },
  '1.20.2': {
    minecraftVersion: '1.20.2',
    generation: '1.20.x',
    status: 'SUPPORTED',
    java: {
      gradleJvmMin: 17,
      clientJavaMin: 17,
      clientJavaRecommended: 17
    },
    buildTool: {
      gradleVersion: '8.10.2',
      loomVersion: '1.8.13',
      pluginId: 'fabric-loom'
    },
    fabric: {
      loaderVersion: '0.16.10',
      mappingsProvider: 'yarn',
      mappingsVersion: '1.20.2+build.4',
      fabricApiVersion: '0.90.0+1.20.2',
      isNonObfuscated: false
    }
  },
  '1.20.1': {
    minecraftVersion: '1.20.1',
    generation: '1.20.x',
    status: 'SUPPORTED',
    java: {
      gradleJvmMin: 17,
      clientJavaMin: 17,
      clientJavaRecommended: 17
    },
    buildTool: {
      gradleVersion: '8.10.2',
      loomVersion: '1.8.13',
      pluginId: 'fabric-loom'
    },
    fabric: {
      loaderVersion: '0.16.10',
      mappingsProvider: 'yarn',
      mappingsVersion: '1.20.1+build.10',
      fabricApiVersion: '0.92.12+1.20.1',
      isNonObfuscated: false
    }
  },
  '1.20': {
    minecraftVersion: '1.20',
    generation: '1.20.x',
    status: 'SUPPORTED',
    java: {
      gradleJvmMin: 17,
      clientJavaMin: 17,
      clientJavaRecommended: 17
    },
    buildTool: {
      gradleVersion: '8.10.2',
      loomVersion: '1.8.13',
      pluginId: 'fabric-loom'
    },
    fabric: {
      loaderVersion: '0.16.10',
      mappingsProvider: 'yarn',
      mappingsVersion: '1.20+build.1',
      fabricApiVersion: '0.83.0+1.20',
      isNonObfuscated: false
    }
  },

  // 1.19.x
  '1.19.4': {
    minecraftVersion: '1.19.4',
    generation: '1.19.x',
    status: 'SUPPORTED',
    java: {
      gradleJvmMin: 17,
      clientJavaMin: 17,
      clientJavaRecommended: 17
    },
    buildTool: {
      gradleVersion: '8.10.2',
      loomVersion: '1.8.13',
      pluginId: 'fabric-loom'
    },
    fabric: {
      loaderVersion: '0.16.10',
      mappingsProvider: 'yarn',
      mappingsVersion: '1.19.4+build.2',
      fabricApiVersion: '0.79.0+1.19.4',
      isNonObfuscated: false
    }
  },
  '1.19.2': {
    minecraftVersion: '1.19.2',
    generation: '1.19.x',
    status: 'SUPPORTED',
    java: {
      gradleJvmMin: 17,
      clientJavaMin: 17,
      clientJavaRecommended: 17
    },
    buildTool: {
      gradleVersion: '8.10.2',
      loomVersion: '1.8.13',
      pluginId: 'fabric-loom'
    },
    fabric: {
      loaderVersion: '0.16.10',
      mappingsProvider: 'yarn',
      mappingsVersion: '1.19.2+build.28',
      fabricApiVersion: '0.77.0+1.19.2',
      isNonObfuscated: false
    }
  },

  // 1.18.x
  '1.18.2': {
    minecraftVersion: '1.18.2',
    generation: '1.18.x',
    status: 'SUPPORTED',
    java: {
      gradleJvmMin: 17,
      clientJavaMin: 17,
      clientJavaRecommended: 17
    },
    buildTool: {
      gradleVersion: '8.10.2',
      loomVersion: '1.8.13',
      pluginId: 'fabric-loom'
    },
    fabric: {
      loaderVersion: '0.16.10',
      mappingsProvider: 'yarn',
      mappingsVersion: '1.18.2+build.4',
      fabricApiVersion: '0.77.0+1.18.2',
      isNonObfuscated: false
    }
  },

  // 1.17.x
  '1.17.1': {
    minecraftVersion: '1.17.1',
    generation: '1.17.x',
    status: 'SUPPORTED',
    java: {
      gradleJvmMin: 17,
      clientJavaMin: 16,
      clientJavaRecommended: 17
    },
    buildTool: {
      gradleVersion: '8.10.2',
      loomVersion: '1.8.13',
      pluginId: 'fabric-loom'
    },
    fabric: {
      loaderVersion: '0.16.10',
      mappingsProvider: 'yarn',
      mappingsVersion: '1.17.1+build.65',
      fabricApiVersion: '0.46.1+1.17',
      isNonObfuscated: false
    }
  },

  // 1.16.x
  '1.16.5': {
    minecraftVersion: '1.16.5',
    generation: '1.16.x',
    status: 'SUPPORTED',
    java: {
      gradleJvmMin: 17,
      clientJavaMin: 8,
      clientJavaRecommended: 8
    },
    buildTool: {
      gradleVersion: '8.10.2',
      loomVersion: '1.8.13',
      pluginId: 'fabric-loom'
    },
    fabric: {
      loaderVersion: '0.16.10',
      mappingsProvider: 'yarn',
      mappingsVersion: '1.16.5+build.10',
      fabricApiVersion: '0.42.0+1.16',
      isNonObfuscated: false
    }
  },

  // 1.15.x
  '1.15.2': {
    minecraftVersion: '1.15.2',
    generation: '1.15.x',
    status: 'SUPPORTED',
    java: {
      gradleJvmMin: 17,
      clientJavaMin: 8,
      clientJavaRecommended: 8
    },
    buildTool: {
      gradleVersion: '8.10.2',
      loomVersion: '1.8.13',
      pluginId: 'fabric-loom'
    },
    fabric: {
      loaderVersion: '0.16.10',
      mappingsProvider: 'yarn',
      mappingsVersion: '1.15.2+build.17',
      fabricApiVersion: '0.28.5+1.15',
      isNonObfuscated: false
    }
  }
};

export function isMinecraftVersionSupported(mcVersion: string): { supported: boolean; reason?: string } {
  if (!mcVersion || typeof mcVersion !== 'string') {
    return {
      supported: false,
      reason: 'Minecraft version must be specified as a non-empty string.'
    };
  }

  const trimmed = mcVersion.trim();

  // 26.x match
  if (trimmed.startsWith('26.')) {
    return { supported: true };
  }

  const match = trimmed.match(/^1\.(\d+)(?:\.(\d+))?$/);
  if (!match) {
    return {
      supported: false,
      reason: `"${trimmed}" is not a recognized Minecraft version format (expected e.g. 1.21.1 or 26.1.1).`
    };
  }

  const minor = parseInt(match[1], 10);
  if (minor < 15) {
    return {
      supported: false,
      reason: `Minecraft ${trimmed} is prior to 1.15 and is not supported by Voxel+ Fabric Loom toolchain. Supported versions: 1.15.x – 1.21.x and 26.x.`
    };
  }

  if (minor > 21) {
    return {
      supported: false,
      reason: `Minecraft ${trimmed} is outside the supported range (1.15.x – 1.21.x and 26.x).`
    };
  }

  return { supported: true };
}

export function getCompatibilityProfile(mcVersion: string): CompatibilityProfile {
  const check = isMinecraftVersionSupported(mcVersion);
  if (!check.supported) {
    return {
      minecraftVersion: mcVersion,
      generation: 'unknown',
      status: 'UNSUPPORTED',
      unsupportedReason: check.reason,
      java: {
        gradleJvmMin: 17,
        clientJavaMin: 17,
        clientJavaRecommended: 21
      },
      buildTool: {
        gradleVersion: '8.10.2',
        loomVersion: '1.8.13',
        pluginId: 'fabric-loom'
      },
      fabric: {
        loaderVersion: '0.16.10',
        mappingsProvider: 'none',
        mappingsVersion: null,
        fabricApiVersion: null,
        isNonObfuscated: false
      }
    };
  }

  if (VERIFIED_PROFILES[mcVersion]) {
    return VERIFIED_PROFILES[mcVersion];
  }

  // Fallback for sub-versions within supported generations
  if (mcVersion.startsWith('26.')) {
    const base = VERIFIED_PROFILES['26.1.1'];
    return {
      ...base,
      minecraftVersion: mcVersion
    };
  }

  const match = mcVersion.match(/^1\.(\d+)/);
  if (match) {
    const minor = parseInt(match[1], 10);
    let base = VERIFIED_PROFILES['1.21.1'];
    if (minor === 21) base = VERIFIED_PROFILES['1.21.1'];
    else if (minor === 20) base = VERIFIED_PROFILES['1.20.1'];
    else if (minor === 19) base = VERIFIED_PROFILES['1.19.4'];
    else if (minor === 18) base = VERIFIED_PROFILES['1.18.2'];
    else if (minor === 17) base = VERIFIED_PROFILES['1.17.1'];
    else if (minor === 16) base = VERIFIED_PROFILES['1.16.5'];
    else if (minor === 15) base = VERIFIED_PROFILES['1.15.2'];

    return {
      ...base,
      minecraftVersion: mcVersion,
      fabric: {
        ...base.fabric,
        mappingsVersion: `${mcVersion}+build.1`
      }
    };
  }

  return VERIFIED_PROFILES['1.21.1'];
}

export function resolveVersionConfig(mcVersion: string): FabricVersionSpec {
  const profile = getCompatibilityProfile(mcVersion);
  return {
    loaderVersion: profile.fabric.loaderVersion,
    loomVersion: profile.buildTool.loomVersion,
    yarnMappings: profile.fabric.mappingsVersion,
    fabricApiVersion: profile.fabric.fabricApiVersion,
    gradleVersion: profile.buildTool.gradleVersion,
    javaVersion: profile.java.clientJavaRecommended,
    isNonObfuscated: profile.fabric.isNonObfuscated,
    pluginId: profile.buildTool.pluginId
  };
}

export function generateBuildGradle(
  mcVersion: string,
  projectName: string,
  memoryMb: number,
  groupId: string = 'com.voxel.modtest'
): string {
  const profile = getCompatibilityProfile(mcVersion);

  if (profile.fabric.isNonObfuscated) {
    return `plugins {
    id '${profile.buildTool.pluginId}' version '${profile.buildTool.loomVersion}'
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
    implementation "net.fabricmc:fabric-loader:\${project.loader_version}"
}

sourceSets {
    main {
        java { srcDirs = [] }
        resources { srcDirs = ['src/main/resources'] }
    }
}

// Verification task: launches the development client
tasks.register('testclient') {
    group = 'verification'
    description = 'Test launch client configuration'
    dependsOn 'runClient'
}
`;
  }

  return `plugins {
    id '${profile.buildTool.pluginId}' version '${profile.buildTool.loomVersion}'
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

sourceSets {
    main {
        java { srcDirs = [] }
        resources { srcDirs = ['src/main/resources'] }
    }
}

// Verification task: launches the development client
tasks.register('testclient') {
    group = 'verification'
    description = 'Test launch client configuration'
    dependsOn 'runClient'
}
`;
}

export function generateGradleProperties(
  mcVersion: string,
  projectName: string,
  memoryMb: number
): string {
  const profile = getCompatibilityProfile(mcVersion);

  const lines = [
    '# Fabric Loom Mod Development Properties',
    `minecraft_version=${mcVersion}`,
  ];

  if (!profile.fabric.isNonObfuscated && profile.fabric.mappingsVersion) {
    lines.push(`yarn_mappings=${profile.fabric.mappingsVersion}`);
  }

  lines.push(
    `loader_version=${profile.fabric.loaderVersion}`,
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

  if (profile.fabric.isNonObfuscated) {
    lines.push('fabric.loom.disableObfuscation=true');
  }

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
  const profile = getCompatibilityProfile(mcVersion);
  return `https\\://services.gradle.org/distributions/gradle-${profile.buildTool.gradleVersion}-bin.zip`;
}

export function getRequiredJavaVersion(mcVersion: string): number {
  const profile = getCompatibilityProfile(mcVersion);
  return profile.java.clientJavaRecommended;
}
