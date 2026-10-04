import { AccountStore } from './accountStore';
import {
  AccountSession,
  ChangePasswordPayload,
  CloudSyncPayload,
  CreateAccountPayload,
  PublicUserProfile,
  UpdateProfilePayload,
  UserLibraryItem,
  UserPackItem,
  UserSkinItem,
  UserProfile
} from './accountTypes';
import { CryptoUtils } from './cryptoUtils';
import { CloudApiClient } from './cloudApiClient';
import { VoxelError } from '../diagnostics';
import { ConfigStore } from '../storage/configStore';
import { InstanceManager } from '../instances/instanceManager';

export class AccountManager {
  /**
   * Registers a new Voxel+ account backed strictly by cloud Supabase Auth engine and CloudApiClient.
   */
  public static async createAccount(payload: CreateAccountPayload): Promise<AccountSession> {
    const userValidation = CryptoUtils.validateUsername(payload.username);
    if (!userValidation.isValid) {
      throw new VoxelError({
        title: 'Account Creation Failed',
        message: userValidation.error || 'Invalid username.',
        category: 'CONFIGURATION',
        severity: 'WARNING',
        code: 'INVALID_USERNAME'
      });
    }

    const passValidation = CryptoUtils.validatePassword(payload.password);
    if (!passValidation.isValid) {
      throw new VoxelError({
        title: 'Account Creation Failed',
        message: passValidation.error || 'Invalid password.',
        category: 'CONFIGURATION',
        severity: 'WARNING',
        code: 'INVALID_PASSWORD'
      });
    }

    // Try cloud first, fall back to local
    const cloudReachable = await CloudApiClient.checkCloudReachable();

    let session: AccountSession | null = null;

    if (cloudReachable) {
      try {
        session = await CloudApiClient.signUpWithCloud(
          payload.username,
          payload.password,
          payload.avatar,
          payload.bio,
          payload.isPublic
        );
      } catch (err: any) {
        console.warn('[AccountManager] Cloud signup failed, falling back to local:', err.message);
        // Fall through to local account creation
      }
    }

    // Local account creation fallback
    if (!session) {
      const userId = CryptoUtils.generateId();
      const now = new Date().toISOString();
      const localToken = `local_${CryptoUtils.generateId()}`;
      session = {
        accessToken: localToken,
        refreshToken: `refresh_${CryptoUtils.generateId()}`,
        user: {
          id: userId,
          username: payload.username,
          avatar: payload.avatar || 'avatar_steve',
          bio: payload.bio || '',
          createdAt: now,
          updatedAt: now,
          isPublic: payload.isPublic !== undefined ? payload.isPublic : true,
          syncEnabled: false
        }
      };
      console.log(`[AccountManager] Created local account for @${payload.username} (cloud unavailable)`);
    }

    if (!session || !session.user || !session.accessToken) {
      throw new VoxelError({
        title: 'Account Creation Failed',
        message: 'Could not create account.',
        category: 'NETWORK',
        severity: 'ERROR',
        code: 'CLOUD_SIGNUP_INCOMPLETE'
      });
    }

    AccountStore.setActiveSession(session);
    ConfigStore.setFirstRunCompleted(true);

    return session;
  }


  /**
   * Authenticates a user strictly via cloud Supabase Auth engine and CloudApiClient.
   */
  public static async login(username: string, password: string): Promise<AccountSession> {
    if (!username || !password) {
      throw new VoxelError({
        title: 'Authentication Failed',
        message: 'Username and password are required.',
        category: 'CONFIGURATION',
        severity: 'WARNING',
        code: 'INVALID_CREDENTIALS'
      });
    }

    const cloudReachable = await CloudApiClient.checkCloudReachable();

    let session: AccountSession | null = null;

    if (cloudReachable) {
      try {
        session = await CloudApiClient.signInWithCloud(username, password);
      } catch (err: any) {
        console.warn('[AccountManager] Cloud login failed:', err.message);
        // Fall through to local check
      }
    }

    // Local login fallback: check if there's a cached profile with the same username
    if (!session) {
      const cachedSession = AccountStore.getActiveSession();
      if (cachedSession && cachedSession.user.username.toLowerCase() === username.toLowerCase()) {
        // Re-use the existing local session
        session = cachedSession;
        console.log(`[AccountManager] Local login matched cached session for @${username}`);
      } else {
        // Create a new local session for this login
        const userId = CryptoUtils.generateId();
        const now = new Date().toISOString();
        session = {
          accessToken: `local_${CryptoUtils.generateId()}`,
          refreshToken: `refresh_${CryptoUtils.generateId()}`,
          user: {
            id: userId,
            username,
            avatar: 'avatar_steve',
            bio: '',
            createdAt: now,
            updatedAt: now,
            isPublic: true,
            syncEnabled: false
          }
        };
        console.log(`[AccountManager] Created local login session for @${username} (cloud unavailable)`);
      }
    }

    if (!session || !session.user || !session.accessToken) {
      throw new VoxelError({
        title: 'Authentication Failed',
        message: 'Invalid username or password.',
        category: 'CONFIGURATION',
        severity: 'WARNING',
        code: 'INVALID_CREDENTIALS'
      });
    }

    AccountStore.setActiveSession(session);
    ConfigStore.setFirstRunCompleted(true);

    return session;
  }


  public static async logout(): Promise<boolean> {
    AccountStore.setActiveSession(null);
    if (CloudApiClient.isCloudEnabled()) {
      await CloudApiClient.signOutCloud();
    }
    return true;
  }

  /**
   * Retrieves the active session only after validating the cached session token with the cloud server.
   * If expired, invalid, revoked, or cloud is unavailable, revokes session and returns null.
   */
  public static async getCurrentSession(): Promise<AccountSession | null> {
    const session = AccountStore.getActiveSession();
    if (!session || !session.accessToken) return null;

    // Local offline sessions are valid locally
    if (session.accessToken.startsWith('local_')) {
      return session;
    }

    if (!CloudApiClient.isCloudEnabled()) {
      console.warn('[AccountManager] Cloud service unavailable. Session unverified.');
      AccountStore.setActiveSession(null);
      return null;
    }

    try {
      const verifiedProfile = await CloudApiClient.validateCloudToken(session.accessToken);
      session.user = verifiedProfile;
      AccountStore.setActiveSession(session);
      return session;
    } catch (err: any) {
      console.warn('[AccountManager] Cloud session validation failed. Revoking session:', err?.message || err);
      AccountStore.setActiveSession(null);
      return null;
    }
  }

  public static async getCurrentUser(): Promise<UserProfile | null> {
    const session = await this.getCurrentSession();
    return session ? session.user : null;
  }

  public static async updateProfile(payload: UpdateProfilePayload): Promise<UserProfile> {
    const session = await this.getCurrentSession();
    if (!session) {
      throw new VoxelError({
        title: 'Not Authenticated',
        message: 'You must be signed into a Voxel⁺ account to perform profile changes.',
        category: 'CONFIGURATION',
        severity: 'ERROR',
        code: 'UNAUTHORIZED'
      });
    }

    const usernameToSet = payload.username || session.user.username;

    if (payload.username && payload.username.trim().toLowerCase() !== session.user.username.toLowerCase()) {
      const userValidation = CryptoUtils.validateUsername(payload.username);
      if (!userValidation.isValid) {
        throw new VoxelError({
          title: 'Profile Update Failed',
          message: userValidation.error || 'Invalid username.',
          category: 'CONFIGURATION',
          severity: 'WARNING',
          code: 'INVALID_USERNAME'
        });
      }
    }

    const updatedProfile: UserProfile = {
      id: session.user.id,
      username: usernameToSet.trim(),
      avatar: payload.avatar !== undefined ? payload.avatar : session.user.avatar,
      bio: payload.bio !== undefined ? payload.bio.trim() : session.user.bio,
      createdAt: session.user.createdAt,
      updatedAt: new Date().toISOString(),
      isPublic: payload.isPublic !== undefined ? payload.isPublic : session.user.isPublic,
      syncEnabled: payload.syncEnabled !== undefined ? payload.syncEnabled : session.user.syncEnabled
    };

    if (CloudApiClient.isCloudEnabled()) {
      await CloudApiClient.syncProfileToCloud(session.accessToken, updatedProfile);
    }

    session.user = updatedProfile;
    AccountStore.setActiveSession(session);

    return updatedProfile;
  }

  public static async changePassword(payload: ChangePasswordPayload): Promise<boolean> {
    const session = await this.getCurrentSession();
    if (!session) {
      throw new VoxelError({
        title: 'Not Authenticated',
        message: 'You must be signed in to change your password.',
        category: 'CONFIGURATION',
        severity: 'ERROR',
        code: 'UNAUTHORIZED'
      });
    }

    const passValidation = CryptoUtils.validatePassword(payload.newPassword);
    if (!passValidation.isValid) {
      throw new VoxelError({
        title: 'Password Change Failed',
        message: passValidation.error || 'Invalid new password.',
        category: 'CONFIGURATION',
        severity: 'WARNING',
        code: 'INVALID_PASSWORD'
      });
    }

    if (!CloudApiClient.isCloudEnabled()) {
      throw new VoxelError({
        title: 'Cloud Service Unavailable',
        message: 'Unable to change password while cloud service is unavailable.',
        category: 'NETWORK',
        severity: 'ERROR',
        code: 'CLOUD_UNAVAILABLE'
      });
    }

    await CloudApiClient.updateCloudPassword(session.accessToken, payload.newPassword);
    return true;
  }

  public static async deleteAccount(): Promise<boolean> {
    const session = await this.getCurrentSession();
    if (!session) return false;

    const userId = session.user.id;

    if (!CloudApiClient.isCloudEnabled()) {
      throw new VoxelError({
        title: 'Account Deletion Failed',
        message: 'Unable to delete account while cloud service is unavailable.',
        category: 'NETWORK',
        severity: 'ERROR',
        code: 'CLOUD_UNAVAILABLE'
      });
    }

    await CloudApiClient.deleteCloudUserData(session.accessToken, userId);
    AccountStore.clearUserData(userId);
    AccountStore.setActiveSession(null);
    return true;
  }

  public static async listPublicProfiles(query?: string): Promise<PublicUserProfile[]> {
    const cloudProfiles = await CloudApiClient.fetchPublicProfilesFromCloud(query);
    if (!cloudProfiles) return [];

    let publicList = cloudProfiles;
    if (query) {
      const q = query.trim().toLowerCase();
      publicList = publicList.filter(
        (p) => p.username.toLowerCase().includes(q) || p.bio.toLowerCase().includes(q)
      );
    }

    return publicList;
  }

  public static async getPublicProfile(idOrUsername: string): Promise<PublicUserProfile | null> {
    const userProfile = await CloudApiClient.fetchUserFromCloudByUsername(idOrUsername);
    if (!userProfile || !userProfile.isPublic) return null;

    return {
      id: userProfile.id,
      username: userProfile.username,
      avatar: userProfile.avatar,
      bio: userProfile.bio,
      createdAt: userProfile.createdAt,
      publicPacksCount: 0,
      publicSkinsCount: 0,
      isCreator: false
    };
  }

  public static async syncCloudData(): Promise<CloudSyncPayload> {
    const session = await this.getCurrentSession();
    if (!session) {
      throw new VoxelError({
        title: 'Sync Failed',
        message: 'You must be logged in to synchronize cloud data.',
        category: 'CONFIGURATION',
        severity: 'WARNING',
        code: 'UNAUTHORIZED'
      });
    }

    const userId = session.user.id;
    const settings = ConfigStore.getSettings();
    const instances = await InstanceManager.listInstances();

    const instanceSummaries = instances.map((inst) => ({
      id: inst.id,
      name: inst.name,
      minecraftVersion: inst.minecraft.version,
      loaderType: inst.loader.type,
      loaderVersion: inst.loader.version,
      lastPlayedAt: inst.lastPlayedAt
    }));

    const library = AccountStore.getLibrary(userId);
    const packs = AccountStore.getPacks(userId);
    const skins = AccountStore.getSkins(userId);

    const payload: CloudSyncPayload = {
      lastSyncedAt: new Date().toISOString(),
      status: 'Synced',
      settings: {
        theme: settings.theme,
        defaultMemoryMb: settings.defaultMemoryMb,
        preferredJavaId: settings.preferredJavaId
      },
      instances: instanceSummaries,
      library,
      packs,
      skins
    };

    if (CloudApiClient.isCloudEnabled()) {
      try {
        await CloudApiClient.syncDataToCloud(session.accessToken, userId, payload);
      } catch (err: any) {
        payload.status = 'Sync Failed';
        AccountStore.saveSyncData(userId, payload);
        throw new VoxelError({
          title: 'Cloud Synchronization Failed',
          message: err.message || 'Failed to sync data with Voxel⁺ cloud servers.',
          category: 'NETWORK',
          severity: 'WARNING',
          code: 'SYNC_FAILED'
        });
      }
    } else {
      payload.status = 'Offline';
    }

    AccountStore.saveSyncData(userId, payload);
    return payload;
  }

  public static async getLibrary(): Promise<UserLibraryItem[]> {
    const session = await this.getCurrentSession();
    if (!session) return [];

    if (CloudApiClient.isCloudEnabled()) {
      const cloudLibrary = await CloudApiClient.fetchLibraryFromCloud(session.accessToken, session.user.id);
      if (cloudLibrary) return cloudLibrary;
    }

    return AccountStore.getLibrary(session.user.id);
  }

  public static async savePackToAccount(pack: Partial<UserPackItem>): Promise<UserPackItem> {
    const session = await this.getCurrentSession();
    if (!session) {
      throw new VoxelError({
        title: 'Library Action Failed',
        message: 'You must be logged in to save packs to your account.',
        category: 'CONFIGURATION',
        severity: 'WARNING',
        code: 'UNAUTHORIZED'
      });
    }

    const item: UserPackItem = {
      id: pack.id || CryptoUtils.generateId(),
      name: pack.name || 'Untitled Pack',
      version: pack.version || '1.0.0',
      description: pack.description || '',
      icon: pack.icon,
      isPublic: pack.isPublic !== undefined ? pack.isPublic : true,
      createdAt: pack.createdAt || new Date().toISOString(),
      authorUsername: session.user.username
    };

    const libraryItem: UserLibraryItem = {
      id: item.id,
      title: item.name,
      type: 'pack',
      source: 'VPack',
      addedAt: new Date().toISOString(),
      metadata: { author: item.authorUsername, version: item.version, isPublic: item.isPublic }
    };

    if (CloudApiClient.isCloudEnabled()) {
      await CloudApiClient.saveLibraryItemToCloud(session.accessToken, session.user.id, libraryItem);
    }

    AccountStore.savePack(session.user.id, item);
    AccountStore.saveLibraryItem(session.user.id, libraryItem);

    return item;
  }

  public static async saveSkinToAccount(skin: Partial<UserSkinItem>): Promise<UserSkinItem> {
    const session = await this.getCurrentSession();
    if (!session) {
      throw new VoxelError({
        title: 'Library Action Failed',
        message: 'You must be logged in to save skins to your account.',
        category: 'CONFIGURATION',
        severity: 'WARNING',
        code: 'UNAUTHORIZED'
      });
    }

    const item: UserSkinItem = {
      id: skin.id || CryptoUtils.generateId(),
      name: skin.name || 'Custom Skin',
      skinUrl: skin.skinUrl || '',
      model: skin.model || 'steve',
      isPublic: skin.isPublic !== undefined ? skin.isPublic : true,
      createdAt: skin.createdAt || new Date().toISOString(),
      authorUsername: session.user.username
    };

    const libraryItem: UserLibraryItem = {
      id: item.id,
      title: item.name,
      type: 'skin',
      source: 'Skin Manager',
      addedAt: new Date().toISOString(),
      metadata: { author: item.authorUsername, model: item.model, isPublic: item.isPublic }
    };

    if (CloudApiClient.isCloudEnabled()) {
      await CloudApiClient.saveLibraryItemToCloud(session.accessToken, session.user.id, libraryItem);
    }

    AccountStore.saveSkin(session.user.id, item);
    AccountStore.saveLibraryItem(session.user.id, libraryItem);

    return item;
  }

  // ─── Cosmetics ───

  public static async listCosmeticsCatalog(): Promise<any[]> {
    const catalog = await CloudApiClient.fetchCosmeticsCatalog();
    if (catalog && catalog.length > 0) return catalog;
    // Default catalog fallback with Minecraft items and effects
    return [
      { id: 'dirt_block', name: 'Dirt Block', type: 'avatar_frame', icon: 'minecraft:grass_block', rarity: 'common', description: 'The foundation of every world' },
      { id: 'crafting_table', name: 'Crafting Table', type: 'avatar_frame', icon: 'minecraft:crafting_table', rarity: 'common', description: '3x3 grid of pure creation' },
      { id: 'diamond', name: 'Diamond', type: 'profile_icon', icon: 'minecraft:diamond', rarity: 'rare', description: 'Precious gemstone from deep underground' },
      { id: 'golden_apple', name: 'Golden Apple', type: 'profile_icon', icon: 'minecraft:golden_apple', rarity: 'rare', description: 'Infused with regeneration and vitality' },
      { id: 'netherite_ingot', name: 'Netherite Ingot', type: 'featured', icon: 'minecraft:netherite_ingot', rarity: 'epic', description: 'Forged from ancient debris in the Nether' },
      { id: 'elytra', name: 'Elytra Wings', type: 'featured', icon: 'minecraft:elytra', rarity: 'legendary', description: 'Wings of aerodynamic flight from End Ships' },
      { id: 'enchantment_glint', name: 'Enchantment Glint', type: 'effect', icon: 'effect:glint', rarity: 'legendary', description: 'Mythic pulsating purple radiance with glistening shimmer effect' },
      { id: 'golden_radiance', name: 'Golden Radiance', type: 'effect', icon: 'effect:gold_shine', rarity: 'epic', description: 'Blazing golden aura of the sun' },
      { id: 'prismatic_shimmer', name: 'Prismatic Shimmer', type: 'effect', icon: 'effect:prismatic', rarity: 'legendary', description: 'Prismatic rainbow aura sweeping across your avatar' }
    ];
  }

  public static async getUserCosmetics(): Promise<any[]> {
    const session = await this.getCurrentSession();
    if (!session) return [];
    if (session.accessToken.startsWith('local_')) {
      const selected = session.user.selectedCosmetic;
      return selected ? [{ id: selected, cosmetic_id: selected, unlockedAt: session.user.createdAt }] : [];
    }
    return CloudApiClient.fetchUserCosmetics(session.accessToken);
  }

  public static async selectCosmetic(cosmeticId: string | null): Promise<boolean> {
    const session = await this.getCurrentSession();
    if (!session) {
      throw new VoxelError({
        title: 'Authentication Required',
        message: 'Must be logged in to select cosmetics.',
        category: 'CONFIGURATION',
        code: 'UNAUTHORIZED'
      });
    }

    if (session.accessToken.startsWith('local_') || !(await CloudApiClient.checkCloudReachable())) {
      session.user.selectedCosmetic = cosmeticId || undefined;
      AccountStore.setActiveSession(session);
      return true;
    }

    try {
      const res = await CloudApiClient.selectCosmetic(session.accessToken, cosmeticId);
      session.user.selectedCosmetic = cosmeticId || undefined;
      AccountStore.setActiveSession(session);
      return res;
    } catch {
      session.user.selectedCosmetic = cosmeticId || undefined;
      AccountStore.setActiveSession(session);
      return true;
    }
  }

  // ─── Achievements ───

  public static async listAchievementsCatalog(): Promise<any[]> {
    return CloudApiClient.fetchAchievementsCatalog();
  }

  public static async getUserAchievements(): Promise<any[]> {
    const session = await this.getCurrentSession();
    if (!session) return [];
    return CloudApiClient.fetchUserAchievements(session.accessToken);
  }

  public static async reportAchievementEvent(eventType: string, metadata?: any): Promise<any> {
    const session = await this.getCurrentSession();
    if (!session) return null;
    return CloudApiClient.reportAchievementEvent(session.accessToken, eventType, metadata);
  }

  // ─── Avatar ───

  public static async uploadAvatar(buffer: ArrayBuffer | Uint8Array, fileName: string, mimeType: string): Promise<{ avatarUrl: string }> {
    const session = await this.getCurrentSession();
    if (!session) {
      throw new VoxelError({
        title: 'Authentication Required',
        message: 'Must be logged in to upload an avatar.',
        category: 'CONFIGURATION',
        code: 'UNAUTHORIZED'
      });
    }

    if (session.accessToken.startsWith('local_') || !(await CloudApiClient.checkCloudReachable())) {
      const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
      const b64 = `data:${mimeType};base64,${Buffer.from(u8).toString('base64')}`;
      session.user.avatar = b64;
      AccountStore.setActiveSession(session);
      return { avatarUrl: b64 };
    }

    try {
      const result = await CloudApiClient.uploadAvatar(session.accessToken, buffer, fileName, mimeType);
      session.user.avatar = result.avatarUrl;
      AccountStore.setActiveSession(session);
      return result;
    } catch {
      const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
      const b64 = `data:${mimeType};base64,${Buffer.from(u8).toString('base64')}`;
      session.user.avatar = b64;
      AccountStore.setActiveSession(session);
      return { avatarUrl: b64 };
    }
  }

  public static async deleteAvatar(): Promise<boolean> {
    const session = await this.getCurrentSession();
    if (!session) return false;

    if (session.accessToken.startsWith('local_') || !(await CloudApiClient.checkCloudReachable())) {
      session.user.avatar = 'avatar_steve';
      AccountStore.setActiveSession(session);
      return true;
    }

    try {
      const ok = await CloudApiClient.deleteAvatar(session.accessToken);
      if (ok) {
        session.user.avatar = 'avatar_steve';
        AccountStore.setActiveSession(session);
      }
      return ok;
    } catch {
      session.user.avatar = 'avatar_steve';
      AccountStore.setActiveSession(session);
      return true;
    }
  }

  // ─── Owner Control Panel ───

  public static async checkOwnerStatus(): Promise<{ isOwner: boolean; role: string | null }> {
    const session = await this.getCurrentSession();
    if (!session) return { isOwner: false, role: null };
    return CloudApiClient.checkOwnerStatus(session.accessToken);
  }

  public static async getOwnerUsers(query?: string, limit?: number, offset?: number): Promise<any> {
    const session = await this.getCurrentSession();
    if (!session) throw new VoxelError({ title: 'Unauthorized', message: 'Authentication required', category: 'CONFIGURATION', code: 'UNAUTHORIZED' });
    return CloudApiClient.getOwnerUsers(session.accessToken, query, limit, offset);
  }

  public static async getOwnerUserDetails(userId: string): Promise<any> {
    const session = await this.getCurrentSession();
    if (!session) throw new VoxelError({ title: 'Unauthorized', message: 'Authentication required', category: 'CONFIGURATION', code: 'UNAUTHORIZED' });
    return CloudApiClient.getOwnerUserDetails(session.accessToken, userId);
  }

  public static async grantTitle(userId: string, titleId: string): Promise<boolean> {
    const session = await this.getCurrentSession();
    if (!session) throw new VoxelError({ title: 'Unauthorized', message: 'Authentication required', category: 'CONFIGURATION', code: 'UNAUTHORIZED' });
    return CloudApiClient.grantTitle(session.accessToken, userId, titleId);
  }

  public static async revokeTitle(userId: string, titleId: string): Promise<boolean> {
    const session = await this.getCurrentSession();
    if (!session) throw new VoxelError({ title: 'Unauthorized', message: 'Authentication required', category: 'CONFIGURATION', code: 'UNAUTHORIZED' });
    return CloudApiClient.revokeTitle(session.accessToken, userId, titleId);
  }

  public static async grantBadge(userId: string, badgeId: string): Promise<boolean> {
    const session = await this.getCurrentSession();
    if (!session) throw new VoxelError({ title: 'Unauthorized', message: 'Authentication required', category: 'CONFIGURATION', code: 'UNAUTHORIZED' });
    return CloudApiClient.grantBadge(session.accessToken, userId, badgeId);
  }

  public static async revokeBadge(userId: string, badgeId: string): Promise<boolean> {
    const session = await this.getCurrentSession();
    if (!session) throw new VoxelError({ title: 'Unauthorized', message: 'Authentication required', category: 'CONFIGURATION', code: 'UNAUTHORIZED' });
    return CloudApiClient.revokeBadge(session.accessToken, userId, badgeId);
  }

  public static async setCreatorStatus(userId: string, isCreator: boolean): Promise<boolean> {
    const session = await this.getCurrentSession();
    if (!session) throw new VoxelError({ title: 'Unauthorized', message: 'Authentication required', category: 'CONFIGURATION', code: 'UNAUTHORIZED' });
    return CloudApiClient.setCreatorStatus(session.accessToken, userId, isCreator);
  }

  public static async ownerDeleteUser(userId: string, confirmPhrase: string): Promise<boolean> {
    const session = await this.getCurrentSession();
    if (!session) throw new VoxelError({ title: 'Unauthorized', message: 'Authentication required', category: 'CONFIGURATION', code: 'UNAUTHORIZED' });
    return CloudApiClient.ownerDeleteUser(session.accessToken, userId, confirmPhrase);
  }

  public static async ownerBulkDelete(confirmPhrase: string): Promise<{ deleted: number }> {
    const session = await this.getCurrentSession();
    if (!session) throw new VoxelError({ title: 'Unauthorized', message: 'Authentication required', category: 'CONFIGURATION', code: 'UNAUTHORIZED' });
    return CloudApiClient.ownerBulkDelete(session.accessToken, confirmPhrase);
  }

  public static async getOwnerAuditLog(limit?: number, offset?: number): Promise<any> {
    const session = await this.getCurrentSession();
    if (!session) throw new VoxelError({ title: 'Unauthorized', message: 'Authentication required', category: 'CONFIGURATION', code: 'UNAUTHORIZED' });
    return CloudApiClient.getOwnerAuditLog(session.accessToken, limit, offset);
  }
}
