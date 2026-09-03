import { JavaRuntime } from '../../types';

export class JavaCompatibilityResolver {
  /**
   * Resolves the required Java major version for a given Minecraft version string.
   */
  public static getRequiredJavaMajorVersion(minecraftVersion: string): number {
    const parts = minecraftVersion.split('.').map(p => parseInt(p, 10) || 0);
    const major = parts[0] || 1;
    const minor = parts[1] || 0;
    const patch = parts[2] || 0;

    if (major > 1) {
      return 21; // Future MC 2.x+
    }

    if (minor >= 21) {
      return 21; // 1.21.x requires Java 21
    }

    if (minor === 20) {
      // 1.20.5+ requires Java 21, 1.20.0 - 1.20.4 requires Java 17
      return patch >= 5 ? 21 : 17;
    }

    if (minor >= 18) {
      // 1.18.0 - 1.19.4 requires Java 17
      return 17;
    }

    if (minor === 17) {
      // 1.17.x requires Java 16 or 17
      return 17;
    }

    // 1.16.5 and older run on Java 8
    return 8;
  }

  /**
   * Checks if a specific Java runtime can run the given Minecraft version.
   */
  public static isCompatible(java: JavaRuntime, minecraftVersion: string): boolean {
    if (!java.isValid) return false;
    const required = this.getRequiredJavaMajorVersion(minecraftVersion);

    // Exact or forward-compatible rules
    if (required === 21) {
      return java.majorVersion >= 21;
    }
    if (required === 17) {
      return java.majorVersion >= 17;
    }
    if (required === 8) {
      return java.majorVersion >= 8;
    }

    return java.majorVersion >= required;
  }

  /**
   * Selects the best compatible Java runtime from installed runtimes.
   */
  public static selectBestJava(installed: JavaRuntime[], minecraftVersion: string): JavaRuntime | null {
    const required = this.getRequiredJavaMajorVersion(minecraftVersion);
    const valid = installed.filter(j => j.isValid);

    // 1. Exact major version match that is LTS and x64
    const exactLts64 = valid.find(j => j.majorVersion === required && j.isLts && j.architecture === 'x64');
    if (exactLts64) return exactLts64;

    // 2. Exact major version match
    const exact = valid.find(j => j.majorVersion === required);
    if (exact) return exact;

    // 3. Forward compatible LTS x64 (higher version)
    const compatibleLts64 = valid
      .filter(j => j.majorVersion > required && j.isLts && j.architecture === 'x64')
      .sort((a, b) => a.majorVersion - b.majorVersion)[0];
    if (compatibleLts64) return compatibleLts64;

    // 4. Any compatible
    const anyCompatible = valid
      .filter(j => j.majorVersion >= required)
      .sort((a, b) => a.majorVersion - b.majorVersion)[0];

    return anyCompatible || valid[0] || null;
  }

  /**
   * Generates metadata annotations, pros, and cons for Java card display.
   */
  public static enrichJavaMetadata(java: JavaRuntime): JavaRuntime {
    const pros: string[] = [];
    const cons: string[] = [];

    if (java.isLts) pros.push('Long-Term Support (LTS)');
    if (java.architecture === 'x64') pros.push('64-bit Architecture');
    if (java.isValid) pros.push('Runtime tested successfully');

    if (java.majorVersion >= 21) {
      pros.push('Modern high-performance ZGC / G1GC improvements');
      pros.push('Full compatibility with Minecraft 1.20.5+ & 1.21+');
    } else if (java.majorVersion === 17) {
      pros.push('Standard compatibility with Minecraft 1.18 – 1.20.4');
    } else if (java.majorVersion === 8) {
      pros.push('Legacy compatibility with Minecraft 1.16.5 and older');
      cons.push('Outdated runtime — not compatible with modern Minecraft');
    }

    if (java.architecture === 'x86') {
      cons.push('32-bit runtime limits memory to < 4 GB');
    }

    if (!java.isValid) {
      cons.push('Executable failed execution verification test');
    }

    let compatibilityDescription = '';
    if (java.majorVersion >= 21) {
      compatibilityDescription = 'Compatible with all modern Minecraft versions (1.20.5+, 1.21.x)';
    } else if (java.majorVersion >= 17) {
      compatibilityDescription = 'Compatible with Minecraft 1.18 through 1.20.4';
    } else if (java.majorVersion === 8) {
      compatibilityDescription = 'Compatible with legacy Minecraft 1.16.5 and older';
    } else {
      compatibilityDescription = `Java ${java.majorVersion} runtime`;
    }

    return {
      ...java,
      pros,
      cons,
      compatibilityDescription
    };
  }
}
