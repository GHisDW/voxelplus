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

    // Voxel+ accounts are cloud-authoritative: signup MUST go through the
    // Cloud API / Supabase Auth. There is no local/offline account creation.
    let session: AccountSession;
    try {
      session = await CloudApiClient.signUpWithCloud(
        payload.username,
        payload.password,
        payload.avatar,
        payload.bio,
        payload.isPublic
      );
    } catch (err: any) {
      if (err instanceof VoxelError) throw err;
      throw new VoxelError({
        title: 'Account Creation Failed',
        message: err?.message || 'Cloud signup failed.',
        category: 'NETWORK',
        severity: 'ERROR',
        code: 'CLOUD_SIGNUP_FAILED'
      });
    }

    if (!session.user || !session.accessToken) {
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

    // Cloud-authoritative login only: a valid session can only come from a
    // successful Cloud API / Supabase Auth sign-in. Cached data is never used
    // to authenticate.
    let session: AccountSession;
    try {
      session = await CloudApiClient.signInWithCloud(username, password);
    } catch (err: any) {
      if (err instanceof VoxelError) throw err;
      throw new VoxelError({
        title: 'Authentication Failed',
        message: err?.message || 'Invalid username or password.',
        category: 'CONFIGURATION',
        severity: 'WARNING',
        code: 'INVALID_CREDENTIALS'
      });
    }

    if (!session.user || !session.accessToken) {
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
    await CloudApiClient.signOutCloud();
    return true;
  }

  /**
   * Retrieves the active session only after validating the cached session token with the cloud server.
   * If expired, invalid, revoked, or cloud is unavailable, revokes session and returns null.
   */
  public static async getCurrentSession(): Promise<AccountSession | null> {
    const session = AccountStore.getActiveSession();
    if (!session || !session.accessToken) return null;

    // The cached session is only restored after its cloud token validates
    // against the Cloud API. Invalid/expired tokens or an unreachable cloud
    // revokes the session and returns the user to the authentication UI.
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

    // Profile data is cloud-owned: the update must succeed server-side before
    // the local cache is updated.
    await CloudApiClient.syncProfileToCloud(session.accessToken, updatedProfile);

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

    await CloudApiClient.updateCloudPassword(session.accessToken, payload.newPassword);
    return true;
  }

  public static async deleteAccount(): Promise<boolean> {
    const session = await this.getCurrentSession();
    if (!session) return false;

    const userId = session.user.id;

    // The Cloud API performs the authoritative deletion (auth identity + cloud
    // data). Local data is cleared only after the cloud deletion succeeds.
    await CloudApiClient.deleteCloudUserData(session.accessToken, userId);
    AccountStore.clearUserData(userId);
    AccountStore.setActiveSession(null);
    return true;
  }

  public static async listPublicProfiles(query?: string): Promise<PublicUserProfile[]> {
    // Throws VoxelError/Error when the Cloud API is unavailable — callers
    // surface a real unavailable state instead of an empty directory.
    const cloudProfiles = await CloudApiClient.fetchPublicProfilesFromCloud(query);

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
    // Returns the cloud-computed public profile verbatim (real pack/skin
    // counts and creator status). Returns null only for a genuine 404;
    // transient cloud failures throw so the UI shows an unavailable state.
    return CloudApiClient.fetchPublicProfileFromCloud(idOrUsername);
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

    AccountStore.saveSyncData(userId, payload);
    return payload;
  }

  public static async getLibrary(): Promise<UserLibraryItem[]> {
    const session = await this.getCurrentSession();
    if (!session) return [];

    // Library data is cloud-authoritative. A failed fetch throws so the UI
    // shows an unavailable state rather than silently presenting stale local
    // cache as authoritative.
    const cloudLibrary = await CloudApiClient.fetchLibraryFromCloud(session.accessToken, session.user.id);

    // Refresh the local performance cache with authoritative cloud data.
    for (const item of cloudLibrary) {
      AccountStore.saveLibraryItem(session.user.id, item);
    }

    return cloudLibrary;
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

    // Cloud write is authoritative: a failed cloud save is a real failure,
    // not a fake local success.
    await CloudApiClient.saveLibraryItemToCloud(session.accessToken, session.user.id, libraryItem);

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

    await CloudApiClient.saveLibraryItemToCloud(session.accessToken, session.user.id, libraryItem);

    AccountStore.saveSkin(session.user.id, item);
    AccountStore.saveLibraryItem(session.user.id, libraryItem);

    return item;
  }

  // ─── Cosmetics ───

  public static async listCosmeticsCatalog(): Promise<any[]> {
    // The cloud catalog is authoritative — a missing catalog is an error,
    // not a substitute local list with different IDs.
    return CloudApiClient.fetchCosmeticsCatalog();
  }

  public static async getUserCosmetics(): Promise<any[]> {
    const session = await this.getCurrentSession();
    if (!session) return [];
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

    // Cosmetic selection is validated server-side (ownership check). The
    // local cache is updated only after the cloud write succeeds.
    const res = await CloudApiClient.selectCosmetic(session.accessToken, cosmeticId);
    session.user.selectedCosmetic = cosmeticId || undefined;
    AccountStore.setActiveSession(session);
    return res;
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

  // ─── Rewarded ads ───

  public static async getAdsStatus(): Promise<{ available: boolean; provider: string | null }> {
    try {
      return await CloudApiClient.fetchAdsStatus();
    } catch {
      return { available: false, provider: null };
    }
  }

  public static async getAdProgress(): Promise<any[]> {
    const session = await this.getCurrentSession();
    if (!session) return [];
    return CloudApiClient.fetchAdProgress(session.accessToken);
  }

  public static async completeAd(itemKind: 'cosmetic' | 'vpack', itemId: string, completionId: string, proof: string): Promise<any> {
    const session = await this.getCurrentSession();
    if (!session) {
      throw new VoxelError({
        title: 'Authentication Required',
        message: 'Must be logged in to complete rewarded ads.',
        category: 'CONFIGURATION',
        code: 'UNAUTHORIZED'
      });
    }
    return CloudApiClient.completeAd(session.accessToken, itemKind, itemId, completionId, proof);
  }

  // ─── VPacks ───

  public static async listVpackCatalog(): Promise<any[]> {
    return CloudApiClient.fetchVpackCatalog();
  }

  public static async listVpacks(): Promise<any[]> {
    const session = await this.getCurrentSession();
    if (!session) return [];
    return CloudApiClient.fetchVpacks(session.accessToken);
  }

  public static async createVpack(payload: { title: string; description?: string; contents?: any }): Promise<any> {
    const session = await this.getCurrentSession();
    if (!session) {
      throw new VoxelError({
        title: 'Authentication Required',
        message: 'Must be logged in to create a VPack.',
        category: 'CONFIGURATION',
        code: 'UNAUTHORIZED'
      });
    }
    return CloudApiClient.createVpack(session.accessToken, payload);
  }

  public static async convertInstanceToVpack(payload: { instanceId: string; title?: string; description?: string }): Promise<any> {
    const session = await this.getCurrentSession();
    if (!session) {
      throw new VoxelError({
        title: 'Authentication Required',
        message: 'Must be logged in to convert a VPack.',
        category: 'CONFIGURATION',
        code: 'UNAUTHORIZED'
      });
    }
    return CloudApiClient.convertInstanceToVpack(session.accessToken, payload);
  }

  public static async installVpack(vpackId: string): Promise<any> {
    const session = await this.getCurrentSession();
    if (!session) {
      throw new VoxelError({
        title: 'Authentication Required',
        message: 'Must be logged in to install a VPack.',
        category: 'CONFIGURATION',
        code: 'UNAUTHORIZED'
      });
    }
    return CloudApiClient.installVpack(session.accessToken, vpackId);
  }

  // ─── Instances (cloud record) ───

  public static async recordInstanceCloud(payload: { name: string; version?: string }): Promise<string | null> {
    const session = await this.getCurrentSession();
    if (!session) return null;
    const res = await CloudApiClient.createInstanceRecord(session.accessToken, payload);
    return res?.id ?? null;
  }

  public static async deleteInstanceCloud(id: string): Promise<boolean> {
    const session = await this.getCurrentSession();
    if (!session) return false;
    return CloudApiClient.deleteInstanceRecord(session.accessToken, id);
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

    const result = await CloudApiClient.uploadAvatar(session.accessToken, buffer, fileName, mimeType);
    session.user.avatar = result.avatarUrl;
    AccountStore.setActiveSession(session);
    return result;
  }

  public static async deleteAvatar(): Promise<boolean> {
    const session = await this.getCurrentSession();
    if (!session) return false;

    await CloudApiClient.deleteAvatar(session.accessToken);
    session.user.avatar = 'avatar_steve';
    AccountStore.setActiveSession(session);
    return true;
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
