import { SkinVersionCompatibility } from '../../types';

export class SkinCompatibilityResolver {
  /**
   * Determine skin capabilities, format support, and notes for a given Minecraft version.
   */
  public static getCompatibility(minecraftVersion: string): SkinVersionCompatibility {
    const versionParts = minecraftVersion.split('.').map(p => parseInt(p, 10));
    const major = versionParts[0] || 1;
    const minor = versionParts[1] || 0;

    // Modern Minecraft versions: 26.x or >= 1.20
    if (major >= 26 || (major === 1 && minor >= 20)) {
      return {
        minecraftVersion,
        isSupported: true,
        supportsModern64x64: true,
        supportsLegacy64x32: true, // Minecraft handles 64x32 legacy upscaled automatically
        supportsSlimModel: true,
        skinStorageMode: 'standard',
        notes: `Fully supported. Modern 64x64 textures, dual-layer overlays, and Alex/Steve models are natively handled by Minecraft ${minecraftVersion}.`
      };
    }

    // Mid-range modern Minecraft versions: 1.14 - 1.19
    if (major === 1 && minor >= 14) {
      return {
        minecraftVersion,
        isSupported: true,
        supportsModern64x64: true,
        supportsLegacy64x32: true,
        supportsSlimModel: true,
        skinStorageMode: 'standard',
        notes: `Supported. 64x64 textures and slim (Alex) arm models are fully compatible with Minecraft ${minecraftVersion}.`
      };
    }

    // Minecraft 1.8 - 1.13
    if (major === 1 && minor >= 8) {
      return {
        minecraftVersion,
        isSupported: true,
        supportsModern64x64: true,
        supportsLegacy64x32: true,
        supportsSlimModel: true,
        skinStorageMode: 'standard',
        notes: `Supported. Minecraft 1.8 introduced 64x64 textures and 3px Alex slim arm geometry.`
      };
    }

    // Legacy Minecraft versions: <= 1.7
    return {
      minecraftVersion,
      isSupported: true,
      supportsModern64x64: false,
      supportsLegacy64x32: true,
      supportsSlimModel: false,
      skinStorageMode: 'texturepack',
      notes: `Legacy version (pre-1.8). Only 64x32 textures with classic Steve (4px) models are supported. 64x64 modern skins will have their bottom half ignored or require conversion.`
    };
  }
}
