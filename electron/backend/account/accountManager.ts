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
import { TenantScaleClient } from './tenantScaleClient';
import { VoxelError } from '../diagnostics';
import { ConfigStore } from '../storage/configStore';
import { InstanceManager } from '../instances/instanceManager';

export class AccountManager {
  /**
   * Registers a new Voxel+ account backed strictly by cloud Supabase Auth engine and TenantScale SDK.
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

    if (!TenantScaleClient.isCloudEnabled()) {
      throw new VoxelError({
        title: 'Cloud Service Unavailable',
        message: 'Cloud authentication service is currently unavailable. Voxel⁺ accounts require an active cloud connection.',
        category: 'NETWORK',
        severity: 'ERROR',
        code: 'CLOUD_UNAVAILABLE'
      });
    }

    let cloudRes;
    try {
      cloudRes = await TenantScaleClient.signUpWithCloud(
        payload.username,
        payload.password,
        payload.avatar,
        payload.bio,
        payload.isPublic
      );
    } catch (err: any) {
      throw new VoxelError({
        title: 'Account Creation Failed',
        message: err.message || 'Could not register account with Voxel⁺ cloud identity server.',
        category: 'NETWORK',
        severity: 'ERROR',
        code: 'CLOUD_SIGNUP_FAILED'
      });
    }

    if (!cloudRes || !cloudRes.userId || !cloudRes.accessToken) {
      throw new VoxelError({
        title: 'Account Creation Failed',
        message: 'Cloud identity registration returned incomplete credentials.',
        category: 'NETWORK',
        severity: 'ERROR',
        code: 'CLOUD_SIGNUP_INCOMPLETE'
      });
    }

    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const session: AccountSession = {
      token: cloudRes.accessToken,
      user: cloudRes.profile,
      createdAt: now,
      expiresAt
    };

    AccountStore.setActiveSession(session);
    ConfigStore.setFirstRunCompleted(true);

    return session;
  }

  /**
   * Authenticates a user strictly via cloud Supabase Auth engine and TenantScale session validation.
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

    if (!TenantScaleClient.isCloudEnabled()) {
      throw new VoxelError({
        title: 'Cloud Service Unavailable',
        message: 'Unable to authenticate. Cloud authentication service is currently unavailable.',
        category: 'NETWORK',
        severity: 'ERROR',
        code: 'CLOUD_UNAVAILABLE'
      });
    }

    let cloudRes;
    try {
      cloudRes = await TenantScaleClient.signInWithCloud(username, password);
    } catch (err: any) {
      throw new VoxelError({
        title: 'Authentication Failed',
        message: err.message || 'Invalid username or password.',
        category: 'CONFIGURATION',
        severity: 'WARNING',
        code: 'INVALID_CREDENTIALS'
      });
    }

    if (!cloudRes || !cloudRes.profile || !cloudRes.accessToken) {
      throw new VoxelError({
        title: 'Authentication Failed',
        message: 'Invalid username or password.',
        category: 'CONFIGURATION',
        severity: 'WARNING',
        code: 'INVALID_CREDENTIALS'
      });
    }

    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const session: AccountSession = {
      token: cloudRes.accessToken,
      user: cloudRes.profile,
      createdAt: now,
      expiresAt
    };

    AccountStore.setActiveSession(session);
    ConfigStore.setFirstRunCompleted(true);

    return session;
  }

  public static async logout(): Promise<boolean> {
    AccountStore.setActiveSession(null);
    if (TenantScaleClient.isCloudEnabled()) {
      await TenantScaleClient.signOutCloud();
    }
    return true;
  }

  public static async getCurrentSession(): Promise<AccountSession | null> {
    const session = AccountStore.getActiveSession();
    if (!session) return null;

    if (!TenantScaleClient.isCloudEnabled()) {
      console.warn('[AccountManager] Cloud unavailable. Revoking local session cache.');
      AccountStore.setActiveSession(null);
      return null;
    }

    // Validate cloud session JWT token against TenantScale SDK
    const validContext = await TenantScaleClient.validateSession(session.token);
    if (!validContext) {
      console.warn('[AccountManager] Cloud session validation failed. Revoking active session.');
      AccountStore.setActiveSession(null);
      return null;
    }

    return session;
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

    if (TenantScaleClient.isCloudEnabled()) {
      await TenantScaleClient.syncProfileToCloud(updatedProfile);
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

    if (!TenantScaleClient.isCloudEnabled()) {
      throw new VoxelError({
        title: 'Cloud Service Unavailable',
        message: 'Unable to change password while cloud service is unavailable.',
        category: 'NETWORK',
        severity: 'ERROR',
        code: 'CLOUD_UNAVAILABLE'
      });
    }

    await TenantScaleClient.updateCloudPassword(payload.newPassword);
    return true;
  }

  public static async deleteAccount(): Promise<boolean> {
    const session = await this.getCurrentSession();
    if (!session) return false;

    const userId = session.user.id;

    if (!TenantScaleClient.isCloudEnabled()) {
      throw new VoxelError({
        title: 'Account Deletion Failed',
        message: 'Unable to delete account while cloud service is unavailable.',
        category: 'NETWORK',
        severity: 'ERROR',
        code: 'CLOUD_UNAVAILABLE'
      });
    }

    await TenantScaleClient.deleteCloudUserData(userId);
    AccountStore.clearUserData(userId);
    AccountStore.setActiveSession(null);
    return true;
  }

  public static async listPublicProfiles(query?: string): Promise<PublicUserProfile[]> {
    const cloudProfiles = await TenantScaleClient.fetchPublicProfilesFromCloud();
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
    const userProfile = await TenantScaleClient.fetchUserFromCloudByUsername(idOrUsername);
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

    if (TenantScaleClient.isCloudEnabled()) {
      try {
        await TenantScaleClient.syncDataToCloud(userId, payload);
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

    AccountStore.savePack(session.user.id, item);

    AccountStore.saveLibraryItem(session.user.id, {
      id: item.id,
      title: item.name,
      type: 'pack',
      source: 'VPack',
      addedAt: new Date().toISOString(),
      metadata: { author: item.authorUsername, version: item.version }
    });

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

    AccountStore.saveSkin(session.user.id, item);

    AccountStore.saveLibraryItem(session.user.id, {
      id: item.id,
      title: item.name,
      type: 'skin',
      source: 'Skin Manager',
      addedAt: new Date().toISOString(),
      metadata: { author: item.authorUsername, model: item.model }
    });

    return item;
  }
}
