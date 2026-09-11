import fs from 'node:fs';
import path from 'node:path';
import crypto, { randomBytes } from 'node:crypto';
import { SkinMetadata, SkinModel, SkinValidationResult } from '../../types';
import { PathManager } from '../storage/paths';
import { SkinValidator } from '../skins/skinValidator';

/**
 * Generate Minecraft standard offline UUID from username
 * Java equivalent: UUID.nameUUIDFromBytes(("OfflinePlayer:" + username).getBytes(StandardCharsets.UTF_8))
 */
export function generateOfflineUUID(username: string): string {
  const cleanUsername = username.trim() || 'DevPlayer';
  const hash = crypto.createHash('md5').update(`OfflinePlayer:${cleanUsername}`).digest();

  // Set version to 3 (MD5-based UUID)
  hash[6] = (hash[6] & 0x0f) | 0x30;
  // Set variant to RFC 4122 (0b10xxxxxx)
  hash[8] = (hash[8] & 0x3f) | 0x80;

  const hex = hash.toString('hex');
  return [
    hex.substring(0, 8),
    hex.substring(8, 12),
    hex.substring(12, 16),
    hex.substring(16, 20),
    hex.substring(20, 32)
  ].join('-');
}

/**
 * Random UUID generator for skins
 */
function generateSkinUUID(): string {
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 1

  const hex = bytes.toString('hex');
  return [
    hex.substring(0, 8),
    hex.substring(8, 12),
    hex.substring(12, 16),
    hex.substring(16, 20),
    hex.substring(20, 32)
  ].join('-');
}

export interface PlayerData {
  version: number;
  username: string;
  activeSkinId: string | null;
  model: SkinModel;
  skins: SkinMetadata[];
}

export interface PlayerProfile {
  username: string;
  uuid: string;
  model: SkinModel;
  activeSkin: SkinMetadata | null;
  activeSkinPath: string | null;
}

export class PlayerStore {
  private static readonly SKINS_DIR = 'skins';
  private static readonly CONFIG_FILE = 'player-config.json';
  private static readonly LEGACY_LIBRARY_FILE = 'skin-library.json';
  private static cachedData: PlayerData | null = null;

  private static getSkinsDir(): string {
    const configDir = PathManager.getConfigDir();
    return path.join(configDir, this.SKINS_DIR);
  }

  private static getConfigFile(): string {
    const configDir = PathManager.getConfigDir();
    return path.join(configDir, this.CONFIG_FILE);
  }

  private static getLegacyLibraryFile(): string {
    return path.join(this.getSkinsDir(), this.LEGACY_LIBRARY_FILE);
  }

  private static ensureSkinsDir(): void {
    const skinsDir = this.getSkinsDir();
    if (!fs.existsSync(skinsDir)) {
      fs.mkdirSync(skinsDir, { recursive: true });
    }
  }

  /**
   * Load or migrate player data from disk
   */
  public static loadData(): PlayerData {
    if (this.cachedData) {
      return this.cachedData;
    }

    this.ensureSkinsDir();
    const configFile = this.getConfigFile();

    if (fs.existsSync(configFile)) {
      try {
        const raw = fs.readFileSync(configFile, 'utf-8');
        const parsed = JSON.parse(raw);
        const data: PlayerData = {
          version: parsed.version || 1,
          username: typeof parsed.username === 'string' && parsed.username.trim() ? parsed.username.trim() : 'DevPlayer',
          activeSkinId: parsed.activeSkinId || null,
          model: parsed.model === 'alex' ? 'alex' : 'steve',
          skins: Array.isArray(parsed.skins) ? parsed.skins : []
        };
        this.cachedData = data;
        return data;
      } catch (error) {
        console.error('Failed to parse player-config.json, falling back:', error);
      }
    }

    // Migration path from legacy skin-library.json
    const legacyFile = this.getLegacyLibraryFile();
    let migratedSkins: SkinMetadata[] = [];
    let migratedActiveSkinId: string | null = null;

    if (fs.existsSync(legacyFile)) {
      try {
        const legacyRaw = fs.readFileSync(legacyFile, 'utf-8');
        const legacyParsed = JSON.parse(legacyRaw);
        if (Array.isArray(legacyParsed.skins)) {
          migratedSkins = legacyParsed.skins;
        }
        if (legacyParsed.activeSkinId) {
          migratedActiveSkinId = legacyParsed.activeSkinId;
        }
        console.log(`[PlayerStore] Successfully migrated ${migratedSkins.length} skins from skin-library.json`);
      } catch (error) {
        console.error('Failed to migrate legacy skin-library.json:', error);
      }
    }

    const defaultData: PlayerData = {
      version: 1,
      username: 'DevPlayer',
      activeSkinId: migratedActiveSkinId,
      model: 'steve',
      skins: migratedSkins
    };

    this.saveData(defaultData);
    return defaultData;
  }

  /**
   * Save player data to disk
   */
  public static saveData(data: PlayerData): void {
    this.ensureSkinsDir();
    const configFile = this.getConfigFile();
    fs.writeFileSync(configFile, JSON.stringify(data, null, 2), 'utf-8');
    this.cachedData = data;
  }

  public static getPlayerProfile(): PlayerProfile {
    const data = this.loadData();
    const activeSkin = data.skins.find(s => s.id === data.activeSkinId) || null;
    return {
      username: data.username,
      uuid: generateOfflineUUID(data.username),
      model: data.model,
      activeSkin,
      activeSkinPath: activeSkin ? activeSkin.filePath : null
    };
  }

  public static getUsername(): string {
    return this.loadData().username;
  }

  public static setUsername(username: string): { success: boolean; error?: string } {
    const trimmed = username ? username.trim() : '';
    if (!trimmed) {
      return { success: false, error: 'Username cannot be empty.' };
    }
    const usernameRegex = /^[a-zA-Z0-9_]{3,16}$/;
    if (!usernameRegex.test(trimmed)) {
      return { success: false, error: 'Invalid Minecraft username. Must be 3-16 characters (letters, numbers, underscores).' };
    }

    const data = this.loadData();
    data.username = trimmed;
    this.saveData(data);
    return { success: true };
  }

  public static getModel(): SkinModel {
    return this.loadData().model;
  }

  public static setModel(model: SkinModel | 'wide' | 'slim'): { success: boolean; error?: string } {
    const normalizedModel: SkinModel = (model === 'alex' || model === 'slim') ? 'alex' : 'steve';
    const data = this.loadData();
    data.model = normalizedModel;
    this.saveData(data);
    return { success: true };
  }

  public static getAllSkins(): SkinMetadata[] {
    return this.loadData().skins;
  }

  public static getSkin(skinId: string): SkinMetadata | null {
    return this.loadData().skins.find(s => s.id === skinId) || null;
  }

  public static getActiveSkin(): SkinMetadata | null {
    const data = this.loadData();
    if (!data.activeSkinId) return null;
    return data.skins.find(s => s.id === data.activeSkinId) || null;
  }

  public static setActiveSkin(skinId: string | null): { success: boolean; error?: string } {
    const data = this.loadData();
    if (skinId !== null) {
      const skin = data.skins.find(s => s.id === skinId);
      if (!skin) {
        return { success: false, error: 'Skin not found.' };
      }
      data.activeSkinId = skinId;
      data.skins.forEach(s => s.isActive = (s.id === skinId));
    } else {
      data.activeSkinId = null;
      data.skins.forEach(s => s.isActive = false);
    }
    this.saveData(data);
    return { success: true };
  }

  public static async generateThumbnail(filePath: string): Promise<string> {
    try {
      const buffer = fs.readFileSync(filePath);
      return `data:image/png;base64,${buffer.toString('base64')}`;
    } catch {
      return '';
    }
  }

  public static async importSkin(
    sourcePath: string,
    customName?: string
  ): Promise<{ success: boolean; skin?: SkinMetadata; error?: string }> {
    try {
      const validation = await SkinValidator.validateSkin(sourcePath);
      if (!validation.isValid) {
        return { success: false, error: validation.error || 'Invalid skin file' };
      }

      const data = this.loadData();
      const skinId = generateSkinUUID();
      const fileName = `${skinId}.png`;
      const destPath = path.join(this.getSkinsDir(), fileName);

      fs.copyFileSync(sourcePath, destPath);
      const thumbnail = await this.generateThumbnail(destPath);

      const metadata: SkinMetadata = {
        id: skinId,
        name: customName || path.basename(sourcePath, '.png'),
        filePath: destPath,
        model: validation.model || 'steve',
        dimensions: validation.dimensions!,
        sizeBytes: validation.sizeBytes!,
        source: 'import',
        isActive: data.activeSkinId === null,
        createdAt: new Date().toISOString(),
        thumbnail
      };

      data.skins.push(metadata);
      if (data.activeSkinId === null) {
        data.activeSkinId = skinId;
        metadata.isActive = true;
      }

      this.saveData(data);
      return { success: true, skin: metadata };
    } catch (error) {
      return { success: false, error: `Import failed: ${error instanceof Error ? error.message : 'Unknown error'}` };
    }
  }

  public static async downloadSkin(
    username: string,
    skinUrl: string,
    customName?: string
  ): Promise<{ success: boolean; skin?: SkinMetadata; error?: string }> {
    try {
      const response = await fetch(skinUrl);
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());

      const tempPath = path.join(this.getSkinsDir(), `temp_${Date.now()}.png`);
      fs.writeFileSync(tempPath, buffer);

      const validation = await SkinValidator.validateSkin(tempPath);
      if (!validation.isValid) {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        return { success: false, error: validation.error || 'Downloaded skin is invalid' };
      }

      const data = this.loadData();
      const skinId = generateSkinUUID();
      const fileName = `${skinId}.png`;
      const destPath = path.join(this.getSkinsDir(), fileName);

      fs.renameSync(tempPath, destPath);
      const thumbnail = await this.generateThumbnail(destPath);

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
        isActive: data.activeSkinId === null,
        createdAt: new Date().toISOString(),
        thumbnail
      };

      data.skins.push(metadata);
      if (data.activeSkinId === null) {
        data.activeSkinId = skinId;
        metadata.isActive = true;
      }

      this.saveData(data);
      return { success: true, skin: metadata };
    } catch (error) {
      return { success: false, error: `Download failed: ${error instanceof Error ? error.message : 'Unknown error'}` };
    }
  }

  public static renameSkin(skinId: string, newName: string): { success: boolean; error?: string } {
    const data = this.loadData();
    const skin = data.skins.find(s => s.id === skinId);
    if (!skin) return { success: false, error: 'Skin not found' };

    skin.name = newName;
    this.saveData(data);
    return { success: true };
  }

  public static deleteSkin(skinId: string): { success: boolean; error?: string } {
    const data = this.loadData();
    const skinIndex = data.skins.findIndex(s => s.id === skinId);
    if (skinIndex === -1) return { success: false, error: 'Skin not found' };

    const skin = data.skins[skinIndex];
    try {
      if (fs.existsSync(skin.filePath)) {
        fs.unlinkSync(skin.filePath);
      }
    } catch (e) {
      console.error('Failed to delete skin file:', e);
    }

    data.skins.splice(skinIndex, 1);
    if (data.activeSkinId === skinId) {
      if (data.skins.length > 0) {
        data.activeSkinId = data.skins[0].id;
        data.skins[0].isActive = true;
      } else {
        data.activeSkinId = null;
      }
    }

    this.saveData(data);
    return { success: true };
  }

  public static clearLibrary(): void {
    const data = this.loadData();
    data.skins.forEach(skin => {
      try {
        if (fs.existsSync(skin.filePath)) {
          fs.unlinkSync(skin.filePath);
        }
      } catch (e) {
        console.error('Failed to delete skin file:', e);
      }
    });
    data.skins = [];
    data.activeSkinId = null;
    this.saveData(data);
  }
}
