import { SkinSearchResult } from '../../types';

const MOJANG_PROFILE_API = 'https://api.mojang.com/users/profiles/minecraft';
const MOJANG_SESSION_API = 'https://sessionserver.mojang.com/session/minecraft/profile';

interface MojangProfile {
  id: string;
  name: string;
}

interface ProfileProperty {
  name: string;
  value: string;
  signature?: string;
}

interface MojangSessionProfile {
  id: string;
  name: string;
  properties?: ProfileProperty[];
}

interface TextureData {
  timestamp?: number;
  profileId?: string;
  profileName?: string;
  textures?: {
    SKIN?: {
      url?: string;
      metadata?: {
        model?: string;
      };
      };
    CAPE?: {
      url?: string;
    };
  };
}

export class SkinBrowser {
  /**
   * Search for a Minecraft Java Edition player by username.
   */
  public static async searchPlayer(
    username: string
  ): Promise<{ success: boolean; result?: SkinSearchResult; error?: string }> {
    try {
      const cleanUsername = username.trim();

      if (!this.isValidUsername(cleanUsername)) {
        return {
          success: false,
          error: 'Invalid Minecraft username. Use 3-16 letters, numbers, or underscores.'
        };
      }

      // Step 1: Resolve username -> UUID.
      const profileResponse = await fetch(
        `${MOJANG_PROFILE_API}/${encodeURIComponent(cleanUsername)}`
      );

      if (profileResponse.status === 404) {
        return {
          success: false,
          error: `Minecraft player "${cleanUsername}" was not found.`
        };
      }

      if (!profileResponse.ok) {
        return {
          success: false,
          error: `Minecraft profile lookup failed: ${profileResponse.status} ${profileResponse.statusText}`
        };
      }

      const profile = await profileResponse.json() as MojangProfile;

      if (!profile.id || !profile.name) {
        return {
          success: false,
          error: 'Minecraft returned an invalid player profile.'
        };
      }

      // Step 2: Resolve UUID -> signed texture/profile data.
      const sessionResponse = await fetch(
        `${MOJANG_SESSION_API}/${profile.id}?unsigned=false`
      );

      if (!sessionResponse.ok) {
        return {
          success: false,
          error: `Minecraft skin lookup failed: ${sessionResponse.status} ${sessionResponse.statusText}`
        };
      }

      const sessionProfile = await sessionResponse.json() as MojangSessionProfile;

      const texturesProperty = sessionProfile.properties?.find(
        property => property.name === 'textures'
      );

      if (!texturesProperty?.value) {
        return {
          success: false,
          error: `${profile.name} does not have available skin texture data.`
        };
      }

      let textureData: TextureData;

      try {
        textureData = JSON.parse(
          Buffer.from(texturesProperty.value, 'base64').toString('utf8')
        ) as TextureData;
      } catch {
        return {
          success: false,
          error: 'Minecraft returned invalid skin texture data.'
        };
      }

      const skinUrl = textureData.textures?.SKIN?.url || '';
      const capeUrl = textureData.textures?.CAPE?.url;

      if (!skinUrl) {
        return {
          success: false,
          error: `${profile.name} does not have a custom skin.`
        };
      }

      const result: SkinSearchResult = {
        username: profile.name,
        uuid: profile.id,
        skinUrl,
        capeUrl,
        nameHistory: []
      };

      return {
        success: true,
        result
      };
    } catch (error) {
      return {
        success: false,
        error: `Search failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      };
    }
  }

  /**
   * Get the direct skin texture URL for a username.
   *
   * This performs a live profile lookup, so callers should prefer
   * searchPlayer() when they also need UUID/profile information.
   */
  public static async getSkinUrl(username: string): Promise<string> {
    const result = await this.searchPlayer(username);
    return result.success && result.result ? result.result.skinUrl : '';
  }

  /**
   * Get the direct cape texture URL for a username.
   */
  public static async getCapeUrl(username: string): Promise<string> {
    const result = await this.searchPlayer(username);
    return result.success && result.result?.capeUrl
      ? result.result.capeUrl
      : '';
  }

  /**
   * Get a head/avatar preview URL.
   *
   * Mineatar is used only for the visual preview; the actual skin
   * download still comes directly from Minecraft's texture URL.
   */
  public static getHeadUrl(username: string, size: number = 128): string {
    const safeSize = Math.max(16, Math.min(512, Math.floor(size)));

    return `https://api.mineatar.io/face/${encodeURIComponent(username)}?scale=${safeSize}`;
  }

  /**
   * Validate Minecraft username format.
   */
  public static isValidUsername(username: string): boolean {
    const usernameRegex = /^[a-zA-Z0-9_]{3,16}$/;
    return usernameRegex.test(username);
  }

  /**
   * Download a skin image from its direct texture URL.
   */
  public static async downloadSkinImage(
    skinUrl: string
  ): Promise<{ success: boolean; buffer?: Buffer; error?: string }> {
    try {
      if (!skinUrl) {
        return {
          success: false,
          error: 'Skin URL is empty.'
        };
      }

      const response = await fetch(skinUrl);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const contentType = response.headers.get('content-type') || '';

      if (!contentType.toLowerCase().includes('image/png')) {
        return {
          success: false,
          error: `Minecraft returned an unexpected skin format: ${contentType || 'unknown'}`
        };
      }

      const buffer = Buffer.from(await response.arrayBuffer());

      if (buffer.length === 0) {
        return {
          success: false,
          error: 'Downloaded skin file is empty.'
        };
      }

      return {
        success: true,
        buffer
      };
    } catch (error) {
      return {
        success: false,
        error: `Download failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      };
    }
  }
}
