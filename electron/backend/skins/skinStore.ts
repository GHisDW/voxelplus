import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { SkinMetadata, SkinModel } from '../../types';
import { PathManager } from '../storage/paths';
import { SkinValidator } from './skinValidator';

/**
 * Generate a simple UUID v4
 */
function generateUUID(): string {
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variant 1
  
  const hex = bytes.toString('hex');
  return [
    hex.substring(0, 8),
    hex.substring(8, 12),
    hex.substring(12, 16),
    hex.substring(16, 20),
    hex.substring(20, 32)
  ].join('-');
}

interface SkinLibraryData {
  skins: SkinMetadata[];
  activeSkinId: string | null;
}

export class SkinStore {
  private static readonly SKINS_DIR = 'skins';
  private static readonly LIBRARY_FILE = 'skin-library.json';
  private static cachedLibrary: SkinLibraryData | null = null;

  /**
   * Get the skins directory path
   */
  private static getSkinsDir(): string {
    const configDir = PathManager.getConfigDir();
    return path.join(configDir, this.SKINS_DIR);
  }

  /**
   * Get the library file path
   */
  private static getLibraryPath(): string {
    return path.join(this.getSkinsDir(), this.LIBRARY_FILE);
  }

  /**
   * Ensure skins directory exists
   */
  private static ensureSkinsDir(): void {
    const skinsDir = this.getSkinsDir();
    if (!fs.existsSync(skinsDir)) {
      fs.mkdirSync(skinsDir, { recursive: true });
    }
  }

  /**
   * Load skin library from disk
   */
  private static loadLibrary(): SkinLibraryData {
    if (this.cachedLibrary) {
      return this.cachedLibrary;
    }

    this.ensureSkinsDir();
    const libraryPath = this.getLibraryPath();

    if (!fs.existsSync(libraryPath)) {
      const emptyLibrary: SkinLibraryData = {
        skins: [],
        activeSkinId: null
      };
      this.saveLibrary(emptyLibrary);
      this.cachedLibrary = emptyLibrary;
      return emptyLibrary;
    }

    try {
      const raw = fs.readFileSync(libraryPath, 'utf-8');
      const parsed = JSON.parse(raw);
      this.cachedLibrary = parsed;
      return parsed;
    } catch (error) {
      console.error('Failed to load skin library:', error);
      const emptyLibrary: SkinLibraryData = {
        skins: [],
        activeSkinId: null
      };
      this.cachedLibrary = emptyLibrary;
      return emptyLibrary;
    }
  }

  /**
   * Save skin library to disk
   */
  private static saveLibrary(library: SkinLibraryData): void {
    this.ensureSkinsDir();
    const libraryPath = this.getLibraryPath();
    fs.writeFileSync(libraryPath, JSON.stringify(library, null, 2), 'utf-8');
    this.cachedLibrary = library;
  }

  /**
   * Generate thumbnail from skin file
   */
  private static async generateThumbnail(filePath: string): Promise<string> {
    try {
      const buffer = fs.readFileSync(filePath);
      const base64 = buffer.toString('base64');
      return `data:image/png;base64,${base64}`;
    } catch (error) {
      console.error('Failed to generate thumbnail:', error);
      return '';
    }
  }

  /**
   * Import a skin from a file path
   */
  public static async importSkin(
    sourcePath: string,
    customName?: string
  ): Promise<{ success: boolean; skin?: SkinMetadata; error?: string }> {
    try {
      // Validate the skin
      const validation = await SkinValidator.validateSkin(sourcePath);
      if (!validation.isValid) {
        return {
          success: false,
          error: validation.error || 'Invalid skin file'
        };
      }

      const library = this.loadLibrary();
      const skinId = generateUUID();
      const fileName = `${skinId}.png`;
      const destPath = path.join(this.getSkinsDir(), fileName);

      // Copy skin file to skins directory
      fs.copyFileSync(sourcePath, destPath);

      // Generate thumbnail
      const thumbnail = await this.generateThumbnail(destPath);

      // Create metadata
      const metadata: SkinMetadata = {
        id: skinId,
        name: customName || path.basename(sourcePath, '.png'),
        filePath: destPath,
        model: validation.model || 'steve',
        dimensions: validation.dimensions!,
        sizeBytes: validation.sizeBytes!,
        source: 'import',
        isActive: library.activeSkinId === null, // Make active if first skin
        createdAt: new Date().toISOString(),
        thumbnail
      };

      // Add to library
      library.skins.push(metadata);
      
      // Set as active if it's the first skin
      if (library.activeSkinId === null) {
        library.activeSkinId = skinId;
        metadata.isActive = true;
      }

      this.saveLibrary(library);

      return {
        success: true,
        skin: metadata
      };
    } catch (error) {
      return {
        success: false,
        error: `Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Download and save a skin from a URL
   */
  public static async downloadSkin(
    username: string,
    skinUrl: string,
    customName?: string
  ): Promise<{ success: boolean; skin?: SkinMetadata; error?: string }> {
    try {
      // Download skin
      const response = await fetch(skinUrl);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      
      // Save to temporary file for validation
      const tempPath = path.join(this.getSkinsDir(), `temp_${Date.now()}.png`);
      fs.writeFileSync(tempPath, buffer);

      // Validate
      const validation = await SkinValidator.validateSkin(tempPath);
      if (!validation.isValid) {
        fs.unlinkSync(tempPath);
        return {
          success: false,
          error: validation.error || 'Downloaded skin is invalid'
        };
      }

      const library = this.loadLibrary();
      const skinId = generateUUID();
      const fileName = `${skinId}.png`;
      const destPath = path.join(this.getSkinsDir(), fileName);

      // Move temp file to final location
      fs.renameSync(tempPath, destPath);

      // Generate thumbnail
      const thumbnail = await this.generateThumbnail(destPath);

      // Create metadata
      const metadata: SkinMetadata = {
        id: skinId,
        name: customName || `${username}'s Skin`,
        filePath: destPath,
        model: validation.model || 'steve',
        dimensions: validation.dimensions!,
        sizeBytes: validation.sizeBytes!,
        source: 'download',
        sourceUsername: username,
        downloadedAt: new Date().toISOString(),
        isActive: library.activeSkinId === null,
        createdAt: new Date().toISOString(),
        thumbnail
      };

      // Add to library
      library.skins.push(metadata);
      
      // Set as active if it's the first skin
      if (library.activeSkinId === null) {
        library.activeSkinId = skinId;
        metadata.isActive = true;
      }

      this.saveLibrary(library);

      return {
        success: true,
        skin: metadata
      };
    } catch (error) {
      return {
        success: false,
        error: `Download failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Get all skins in the library
   */
  public static getAllSkins(): SkinMetadata[] {
    const library = this.loadLibrary();
    return library.skins;
  }

  /**
   * Get a specific skin by ID
   */
  public static getSkin(skinId: string): SkinMetadata | null {
    const library = this.loadLibrary();
    return library.skins.find(s => s.id === skinId) || null;
  }

  /**
   * Get the currently active skin
   */
  public static getActiveSkin(): SkinMetadata | null {
    const library = this.loadLibrary();
    if (!library.activeSkinId) {
      return null;
    }
    return library.skins.find(s => s.id === library.activeSkinId) || null;
  }

  /**
   * Set a skin as active
   */
  public static setActiveSkin(skinId: string): { success: boolean; error?: string } {
    const library = this.loadLibrary();
    const skin = library.skins.find(s => s.id === skinId);

    if (!skin) {
      return {
        success: false,
        error: 'Skin not found'
      };
    }

    // Update active status
    library.skins.forEach(s => s.isActive = false);
    skin.isActive = true;
    library.activeSkinId = skinId;

    this.saveLibrary(library);

    return { success: true };
  }

  /**
   * Rename a skin
   */
  public static renameSkin(skinId: string, newName: string): { success: boolean; error?: string } {
    const library = this.loadLibrary();
    const skin = library.skins.find(s => s.id === skinId);

    if (!skin) {
      return {
        success: false,
        error: 'Skin not found'
      };
    }

    skin.name = newName;
    this.saveLibrary(library);

    return { success: true };
  }

  /**
   * Delete a skin
   */
  public static deleteSkin(skinId: string): { success: boolean; error?: string } {
    const library = this.loadLibrary();
    const skinIndex = library.skins.findIndex(s => s.id === skinId);

    if (skinIndex === -1) {
      return {
        success: false,
        error: 'Skin not found'
      };
    }

    const skin = library.skins[skinIndex];

    // Delete the file
    try {
      if (fs.existsSync(skin.filePath)) {
        fs.unlinkSync(skin.filePath);
      }
    } catch (error) {
      console.error('Failed to delete skin file:', error);
    }

    // Remove from library
    library.skins.splice(skinIndex, 1);

    // If deleted skin was active, clear active or set another
    if (library.activeSkinId === skinId) {
      if (library.skins.length > 0) {
        library.activeSkinId = library.skins[0].id;
        library.skins[0].isActive = true;
      } else {
        library.activeSkinId = null;
      }
    }

    this.saveLibrary(library);

    return { success: true };
  }

  /**
   * Clear the entire skin library
   */
  public static clearLibrary(): void {
    const library = this.loadLibrary();
    
    // Delete all skin files
    library.skins.forEach(skin => {
      try {
        if (fs.existsSync(skin.filePath)) {
          fs.unlinkSync(skin.filePath);
        }
      } catch (error) {
        console.error(`Failed to delete skin file: ${skin.filePath}`, error);
      }
    });

    // Clear library
    library.skins = [];
    library.activeSkinId = null;
    this.saveLibrary(library);
  }
}