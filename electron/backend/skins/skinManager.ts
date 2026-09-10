import { SkinMetadata, SkinValidationResult, SkinSearchResult } from '../../types';
import { SkinStore } from './skinStore';
import { SkinValidator } from './skinValidator';
import { SkinBrowser } from './skinBrowser';

export class SkinManager {
  /**
   * Import a skin from a local file
   */
  public static async importSkin(filePath: string, customName?: string): Promise<{ success: boolean; skin?: SkinMetadata; error?: string }> {
    return SkinStore.importSkin(filePath, customName);
  }

  /**
   * Download a skin by username
   */
  public static async downloadSkin(username: string, customName?: string): Promise<{ success: boolean; skin?: SkinMetadata; error?: string }> {
    // Validate username
    if (!SkinBrowser.isValidUsername(username)) {
      return {
        success: false,
        error: 'Invalid Minecraft username format'
      };
    }

    // Search for player to get skin URL
    const searchResult = await SkinBrowser.searchPlayer(username);
    if (!searchResult.success || !searchResult.result) {
      return {
        success: false,
        error: searchResult.error || 'Failed to find player'
      };
    }

    const { skinUrl } = searchResult.result;
    if (!skinUrl) {
      return {
        success: false,
        error: 'Player does not have a custom skin'
      };
    }

    // Download and save skin
    return SkinStore.downloadSkin(username, skinUrl, customName);
  }

  /**
   * Search for a player (without downloading)
   */
  public static async searchPlayer(username: string): Promise<{ success: boolean; result?: SkinSearchResult; error?: string }> {
    if (!SkinBrowser.isValidUsername(username)) {
      return {
        success: false,
        error: 'Invalid Minecraft username format'
      };
    }

    return SkinBrowser.searchPlayer(username);
  }

  /**
   * Get all skins in the library
   */
  public static getAllSkins(): SkinMetadata[] {
    return SkinStore.getAllSkins();
  }

  /**
   * Get a specific skin by ID
   */
  public static getSkin(skinId: string): SkinMetadata | null {
    return SkinStore.getSkin(skinId);
  }

  /**
   * Get the currently active skin
   */
  public static getActiveSkin(): SkinMetadata | null {
    return SkinStore.getActiveSkin();
  }

  /**
   * Set a skin as active
   */
  public static setActiveSkin(skinId: string): { success: boolean; error?: string } {
    return SkinStore.setActiveSkin(skinId);
  }

  /**
   * Rename a skin
   */
  public static renameSkin(skinId: string, newName: string): { success: boolean; error?: string } {
    return SkinStore.renameSkin(skinId, newName);
  }

  /**
   * Delete a skin
   */
  public static deleteSkin(skinId: string): { success: boolean; error?: string } {
    return SkinStore.deleteSkin(skinId);
  }

  /**
   * Validate a skin file (without importing)
   */
  public static async validateSkin(filePath: string): Promise<SkinValidationResult> {
    return SkinValidator.validateSkin(filePath);
  }

  /**
   * Validate a skin data URL
   */
  public static async validateSkinDataUrl(dataUrl: string): Promise<SkinValidationResult> {
    return SkinValidator.validateSkinDataUrl(dataUrl);
  }

  /**
   * Get skin preview URL for a username
   */
  public static getPreviewUrl(username: string, size: number = 128): string {
    return SkinBrowser.getHeadUrl(username, size);
  }

  /**
   * Clear the entire skin library
   */
  public static clearLibrary(): void {
    SkinStore.clearLibrary();
  }
}