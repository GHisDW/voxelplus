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
  UserProfile,
  VoxelUser
} from './accountTypes';
import { CryptoUtils } from './cryptoUtils';
import { TenantScaleClient } from './tenantScaleClient';
import { VoxelError } from '../diagnostics';
import { ConfigStore } from '../storage/configStore';
import { InstanceManager } from '../instances/instanceManager';

export class AccountManager {
  public static toUserProfile(user: VoxelUser): UserProfile {
    return {
      id: user.id,
      username: user.username,
      avatar: user.avatar,
      bio: user.bio,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      isPublic: user.isPublic,
      syncEnabled: user.syncEnabled
    };
  }

  public static toPublicUserProfile(user: VoxelUser): PublicUserProfile {
    const packs = AccountStore.getPacks(user.id).filter((p) => p.isPublic);
    const skins = AccountStore.getSkins(user.id).filter((s) => s.isPublic);

    return {
      id: user.id,
      username: user.username,
      avatar: user.avatar,
      bio: user.bio,
      createdAt: user.createdAt,
      publicPacksCount: packs.length,
      publicSkinsCount: skins.length,
      isCreator: packs.length > 0 || skins.length > 0
    };
  }

  /**
   * Registers a new Voxel+ account backed by cloud Supabase Auth engine and TenantScale SDK.
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

    const existing = AccountStore.getUserByUsername(payload.username);
    if (existing) {
      throw new VoxelError({
        title: 'Username Unavailable',
        message: `The username "${payload.username}" is already taken. Please choose a different username.`,
        category: 'CONFIGURATION',
        severity: 'WARNING',
        code: 'USERNAME_TAKEN'
      });
    }

    const now = new Date().toISOString();
    let userId = CryptoUtils.generateId();
    let sessionToken = CryptoUtils.generateSessionToken();
    let userProfile: UserProfile;

    // Register with cloud Auth engine
    if (TenantScaleClient.isCloudEnabled()) {
      try {
        const cloudRes = await TenantScaleClient.signUpWithCloud(
          payload.username,
          payload.password,
          payload.avatar,
          payload.bio,
          payload.isPublic
        );
        if (!cloudRes || !cloudRes.userId) {
          throw new Error('Could not establish cloud identity.');
        }
        userId = cloudRes.userId;
        if (cloudRes.accessToken) {
          sessionToken = cloudRes.accessToken;
        }
        userProfile = cloudRes.profile;
      } catch (err: any) {
        throw new VoxelError({
          title: 'Cloud Registration Failed',
          message: err.message || 'Could not register account with Voxel⁺ cloud identity server.',
          category: 'NETWORK',
          severity: 'ERROR',
          code: 'CLOUD_SIGNUP_FAILED'
        });
      }
    } else {
      userProfile = {
        id: userId,
        username: payload.username.trim(),
        avatar: payload.avatar || 'avatar_steve',
        bio: payload.bio ? payload.bio.trim() : '',
        createdAt: now,
        updatedAt: now,
        isPublic: payload.isPublic !== undefined ? payload.isPublic : true,
        syncEnabled: true
      };
    }

    const salt = CryptoUtils.generateSalt();
    const passwordHash = CryptoUtils.hashPassword(payload.password, salt);

    const userRecord: VoxelUser = {
      id: userId,
      username: payload.username.trim(),
      passwordHash: passwordHash,
      salt: salt,
      avatar: userProfile.avatar,
      bio: userProfile.bio,
      createdAt: userProfile.createdAt,
      updatedAt: userProfile.updatedAt,
      isPublic: userProfile.isPublic,
      syncEnabled: userProfile.syncEnabled
    };

    AccountStore.saveUser(userRecord);

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const session: AccountSession = {
      token: sessionToken,
      user: userProfile,
      createdAt: now,
      expiresAt
    };

    AccountStore.setActiveSession(session);
    ConfigStore.setFirstRunCompleted(true);

    return session;
  }

  /**
   * Authenticates a user via cloud Supabase Auth engine and TenantScale session validation.
   * Supports cross-PC logins cleanly across fresh installations.
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

    let userProfile: UserProfile | null = null;
    let sessionToken = CryptoUtils.generateSessionToken();

    if (TenantScaleClient.isCloudEnabled()) {
      try {
        const cloudRes = await TenantScaleClient.signInWithCloud(username, password);
        if (cloudRes?.profile) {
          userProfile = cloudRes.profile;
          if (cloudRes.accessToken) {
            sessionToken = cloudRes.accessToken;
          }
        }
      } catch (err: any) {
        throw new VoxelError({
          title: 'Authentication Failed',
          message: err.message || 'Invalid username or password.',
          category: 'CONFIGURATION',
          severity: 'WARNING',
          code: 'INVALID_CREDENTIALS'
        });
      }
    } else {
      // Local fallback for test harness with mandatory password verification
      const localUser = AccountStore.getUserByUsername(username);
      if (localUser && localUser.passwordHash && localUser.salt) {
        const matches = CryptoUtils.verifyPassword(password, localUser.passwordHash, localUser.salt);
        if (matches) {
          userProfile = this.toUserProfile(localUser);
        }
      }
    }

    if (!userProfile) {
      throw new VoxelError({
        title: 'Authentication Failed',
        message: 'Invalid username or password.',
        category: 'CONFIGURATION',
        severity: 'WARNING',
        code: 'INVALID_CREDENTIALS'
      });
    }

    const userRecord: VoxelUser = {
      id: userProfile.id,
      username: userProfile.username,
      passwordHash: '',
      salt: '',
      avatar: userProfile.avatar,
      bio: userProfile.bio,
      createdAt: userProfile.createdAt,
      updatedAt: userProfile.updatedAt,
      isPublic: userProfile.isPublic,
      syncEnabled: userProfile.syncEnabled
    };

    AccountStore.saveUser(userRecord);

    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const session: AccountSession = {
      token: sessionToken,
      user: userProfile,
      createdAt: now,
      expiresAt
    };

    AccountStore.setActiveSession(session);
    ConfigStore.setFirstRunCompleted(true);

    return session;
  }

  public static async logout(): Promise<boolean> {
    AccountStore.setActiveSession(null);
    TenantScaleClient.signOutCloud().catch(() => {});
    return true;
  }

  public static async getCurrentSession(): Promise<AccountSession | null> {
    const session = AccountStore.getActiveSession();
    if (!session) return null;

    // Validate cloud session token if cloud is enabled
    if (TenantScaleClient.isCloudEnabled() && session.token && !session.token.startsWith('session_')) {
      const validContext = await TenantScaleClient.validateSession(session.token);
      if (!validContext) {
        console.warn('[AccountManager] Cloud session validation failed. Revoking active session.');
        AccountStore.setActiveSession(null);
        return null;
      }
    }

    return session;
  }

  public static async getCurrentUser(): Promise<UserProfile | null> {
    const session = await this.getCurrentSession();
    if (!session) return null;
    const user = AccountStore.getUserById(session.user.id);
    return user ? this.toUserProfile(user) : session.user;
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

    const user = AccountStore.getUserById(session.user.id);
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
      const existing = AccountStore.getUserByUsername(payload.username);
      if (existing && existing.id !== session.user.id) {
        throw new VoxelError({
          title: 'Username Taken',
          message: `The username "${payload.username}" is already taken by another account.`,
          category: 'CONFIGURATION',
          severity: 'WARNING',
          code: 'USERNAME_TAKEN'
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

    if (user) {
      user.username = updatedProfile.username;
      user.avatar = updatedProfile.avatar;
      user.bio = updatedProfile.bio;
      user.isPublic = updatedProfile.isPublic;
      user.syncEnabled = updatedProfile.syncEnabled;
      user.updatedAt = updatedProfile.updatedAt;
      AccountStore.saveUser(user);
    }

    session.user = updatedProfile;
    AccountStore.setActiveSession(session);

    if (TenantScaleClient.isCloudEnabled()) {
      await TenantScaleClient.syncProfileToCloud(updatedProfile);
    }

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

    if (TenantScaleClient.isCloudEnabled()) {
      await TenantScaleClient.updateCloudPassword(payload.newPassword);
    }

    const user = AccountStore.getUserById(session.user.id);
    if (user) {
      const newSalt = CryptoUtils.generateSalt();
      user.salt = newSalt;
      user.passwordHash = CryptoUtils.hashPassword(payload.newPassword, newSalt);
      user.updatedAt = new Date().toISOString();
      AccountStore.saveUser(user);
    }

    return true;
  }

  public static async deleteAccount(): Promise<boolean> {
    const session = await this.getCurrentSession();
    if (!session) return false;

    const userId = session.user.id;

    if (TenantScaleClient.isCloudEnabled()) {
      await TenantScaleClient.deleteCloudUserData(userId);
    }

    AccountStore.deleteUser(userId);
    AccountStore.setActiveSession(null);
    return true;
  }

  public static async listPublicProfiles(query?: string): Promise<PublicUserProfile[]> {
    const cloudProfiles = await TenantScaleClient.fetchPublicProfilesFromCloud();
    if (cloudProfiles && cloudProfiles.length > 0) {
      if (!query) return cloudProfiles;
      const q = query.toLowerCase();
      return cloudProfiles.filter(
        (p) => p.username.toLowerCase().includes(q) || p.bio.toLowerCase().includes(q)
      );
    }

    const allUsers = AccountStore.getUsers().filter((u) => u.isPublic);
    let publicList = allUsers.map((u) => this.toPublicUserProfile(u));

    if (query) {
      const q = query.trim().toLowerCase();
      publicList = publicList.filter(
        (p) => p.username.toLowerCase().includes(q) || p.bio.toLowerCase().includes(q)
      );
    }

    return publicList;
  }

  public static async getPublicProfile(idOrUsername: string): Promise<PublicUserProfile | null> {
    const user =
      AccountStore.getUserById(idOrUsername) || AccountStore.getUserByUsername(idOrUsername);
    if (!user || !user.isPublic) return null;
    return this.toPublicUserProfile(user);
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
