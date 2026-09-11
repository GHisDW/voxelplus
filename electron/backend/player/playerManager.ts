import { SkinMetadata, SkinValidationResult, SkinSearchResult, SkinModel } from '../../types';
import { PlayerStore, PlayerProfile } from './playerStore';
import { SkinValidator } from '../skins/skinValidator';
import { SkinBrowser } from '../skins/skinBrowser';

export class PlayerManager {
  public static getPlayerProfile(): PlayerProfile {
    return PlayerStore.getPlayerProfile();
  }

  public static getUsername(): string {
    return PlayerStore.getUsername();
  }

  public static setUsername(username: string): { success: boolean; error?: string } {
    return PlayerStore.setUsername(username);
  }

  public static getModel(): SkinModel {
    return PlayerStore.getModel();
  }

  public static setModel(model: SkinModel | 'wide' | 'slim'): { success: boolean; error?: string } {
    return PlayerStore.setModel(model);
  }

  public static async importSkin(filePath: string, customName?: string): Promise<{ success: boolean; skin?: SkinMetadata; error?: string }> {
    return PlayerStore.importSkin(filePath, customName);
  }

  public static async downloadSkin(username: string, customName?: string): Promise<{ success: boolean; skin?: SkinMetadata; error?: string }> {
    if (!SkinBrowser.isValidUsername(username)) {
      return {
        success: false,
        error: 'Invalid Minecraft username format. Use 3-16 letters, numbers, or underscores.'
      };
    }

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

    return PlayerStore.downloadSkin(username, skinUrl, customName);
  }

  public static async searchPlayer(username: string): Promise<{ success: boolean; result?: SkinSearchResult; error?: string }> {
    if (!SkinBrowser.isValidUsername(username)) {
      return {
        success: false,
        error: 'Invalid Minecraft username format. Use 3-16 letters, numbers, or underscores.'
      };
    }

    return SkinBrowser.searchPlayer(username);
  }

  public static getAllSkins(): SkinMetadata[] {
    return PlayerStore.getAllSkins();
  }

  public static getSkin(skinId: string): SkinMetadata | null {
    return PlayerStore.getSkin(skinId);
  }

  public static getActiveSkin(): SkinMetadata | null {
    return PlayerStore.getActiveSkin();
  }

  public static setActiveSkin(skinId: string | null): { success: boolean; error?: string } {
    return PlayerStore.setActiveSkin(skinId);
  }

  public static renameSkin(skinId: string, newName: string): { success: boolean; error?: string } {
    return PlayerStore.renameSkin(skinId, newName);
  }

  public static deleteSkin(skinId: string): { success: boolean; error?: string } {
    return PlayerStore.deleteSkin(skinId);
  }

  public static async validateSkin(filePath: string): Promise<SkinValidationResult> {
    return SkinValidator.validateSkin(filePath);
  }

  public static clearLibrary(): void {
    PlayerStore.clearLibrary();
  }
}
