import { TenantScale } from '@tenantscale/sdk';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { CloudSyncPayload, PublicUserProfile, UserProfile } from './accountTypes';

export class TenantScaleClient {
  private static tenantScale: TenantScale | null = null;
  private static supabase: SupabaseClient | null = null;
  private static isInitialized = false;

  /**
   * Initializes cloud database and TenantScale client strictly using unprivileged,
   * client-safe anon keys (SUPABASE_ANON_KEY / TENANTSCALE_CLIENT_KEY).
   *
   * Security Guarantee: Desktop client executables NEVER handle or bundle
   * privileged administrative credentials. All user-owned
   * cloud operations are authorized database-side via Supabase Row Level Security (RLS).
   */
  public static initialize(): boolean {
    if (this.isInitialized) return !!this.supabase;

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseAnonKey) {
      try {
        this.supabase = createClient(supabaseUrl, supabaseAnonKey, {
          auth: { persistSession: false }
        });
        this.tenantScale = new TenantScale({
          supabaseUrl,
          supabaseKey: supabaseAnonKey
        });
        this.isInitialized = true;
        console.log('[TenantScaleClient] Initialized with unprivileged public client key.');
        return true;
      } catch (err) {
        console.warn('[TenantScaleClient] Failed to initialize cloud clients:', err);
        this.isInitialized = true;
        return false;
      }
    } else {
      console.log('[TenantScaleClient] No public cloud configuration present. Operating in local mode.');
      this.isInitialized = true;
      return false;
    }
  }

  public static isCloudEnabled(): boolean {
    this.initialize();
    return !!this.supabase;
  }

  /**
   * Helper converting Voxel+ username to internal Supabase Auth email.
   * Keeps user-facing UI 100% username/password based without requiring real emails.
   */
  public static toInternalEmail(username: string): string {
    return `${username.trim().toLowerCase()}@voxel.internal`;
  }

  /**
   * Registers a new Voxel+ account against Supabase Auth engine.
   */
  public static async signUpWithCloud(
    username: string,
    password: string,
    avatar: string = 'avatar_steve',
    bio: string = '',
    isPublic: boolean = true
  ): Promise<{ userId: string; email: string } | null> {
    if (!this.isCloudEnabled() || !this.supabase) return null;

    const internalEmail = this.toInternalEmail(username);
    const { data, error } = await this.supabase.auth.signUp({
      email: internalEmail,
      password,
      options: {
        data: { username, avatar, bio, isPublic }
      }
    });

    if (error || !data.user) {
      throw new Error(error?.message || 'Supabase Auth signup failed.');
    }

    const userId = data.user.id;
    const now = new Date().toISOString();

    // Create profile row in voxel_users
    await this.supabase.from('voxel_users').upsert({
      id: userId,
      username,
      avatar,
      bio,
      is_public: isPublic,
      updated_at: now,
      created_at: now
    }, { onConflict: 'id' });

    return { userId, email: internalEmail };
  }

  /**
   * Authenticates an existing Voxel+ account against Supabase Auth engine.
   */
  public static async signInWithCloud(
    username: string,
    password: string
  ): Promise<{ userId: string; profile: UserProfile } | null> {
    if (!this.isCloudEnabled() || !this.supabase) return null;

    const internalEmail = this.toInternalEmail(username);
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email: internalEmail,
      password
    });

    if (error || !data.user) {
      throw new Error(error?.message || 'Invalid username or password.');
    }

    const userId = data.user.id;

    // Fetch profile row from voxel_users
    const { data: profileRow } = await this.supabase
      .from('voxel_users')
      .select('*')
      .eq('id', userId)
      .single();

    const profile: UserProfile = {
      id: userId,
      username: profileRow?.username || username,
      avatar: profileRow?.avatar || 'avatar_steve',
      bio: profileRow?.bio || '',
      createdAt: profileRow?.created_at || new Date().toISOString(),
      updatedAt: profileRow?.updated_at || new Date().toISOString(),
      isPublic: profileRow?.is_public !== undefined ? profileRow.is_public : true,
      syncEnabled: true
    };

    return { userId, profile };
  }

  /**
   * Signs out active cloud session.
   */
  public static async signOutCloud(): Promise<void> {
    if (this.isCloudEnabled() && this.supabase) {
      await this.supabase.auth.signOut();
    }
  }

  /**
   * Updates password in Supabase Auth engine.
   */
  public static async updateCloudPassword(newPassword: string): Promise<boolean> {
    if (!this.isCloudEnabled() || !this.supabase) return false;
    const { error } = await this.supabase.auth.updateUser({ password: newPassword });
    if (error) {
      throw new Error(error.message);
    }
    return true;
  }

  /**
   * Syncs user profile metadata to Supabase / TenantScale cloud.
   */
  public static async syncProfileToCloud(profile: UserProfile): Promise<boolean> {
    if (!this.isCloudEnabled() || !this.supabase) return false;
    const { error } = await this.supabase
      .from('voxel_users')
      .upsert({
        id: profile.id,
        username: profile.username,
        avatar: profile.avatar,
        bio: profile.bio,
        is_public: profile.isPublic,
        updated_at: profile.updatedAt
      }, { onConflict: 'id' });

    if (error) {
      throw new Error(`Profile sync failed: ${error.message}`);
    }
    return true;
  }

  /**
   * Syncs cloud payload data to cloud DB.
   */
  public static async syncDataToCloud(userId: string, payload: CloudSyncPayload): Promise<boolean> {
    if (!this.isCloudEnabled() || !this.supabase) return false;
    const { error } = await this.supabase
      .from('voxel_cloud_sync')
      .upsert({
        user_id: userId,
        sync_payload: payload,
        last_synced_at: payload.lastSyncedAt
      }, { onConflict: 'user_id' });

    if (error) {
      throw new Error(`Cloud sync data failed: ${error.message}`);
    }
    return true;
  }

  public static async fetchUserFromCloudByUsername(username: string): Promise<UserProfile | null> {
    if (!this.isCloudEnabled() || !this.supabase) return null;
    try {
      const { data, error } = await this.supabase
        .from('voxel_users')
        .select('id, username, avatar, bio, is_public, created_at, updated_at')
        .ilike('username', username)
        .single();

      if (error || !data) return null;

      return {
        id: data.id,
        username: data.username,
        avatar: data.avatar,
        bio: data.bio || '',
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        isPublic: data.is_public,
        syncEnabled: true
      };
    } catch {
      return null;
    }
  }

  public static async fetchPublicProfilesFromCloud(): Promise<PublicUserProfile[] | null> {
    if (!this.isCloudEnabled() || !this.supabase) return null;
    try {
      const { data, error } = await this.supabase
        .from('voxel_users')
        .select('id, username, avatar, bio, created_at')
        .eq('is_public', true)
        .limit(50);

      if (error || !data) return null;

      return data.map((item) => ({
        id: item.id,
        username: item.username,
        avatar: item.avatar,
        bio: item.bio || '',
        createdAt: item.created_at,
        publicPacksCount: 0,
        publicSkinsCount: 0,
        isCreator: false
      }));
    } catch (e) {
      console.warn('[TenantScaleClient] Fetch public profiles exception:', e);
      return null;
    }
  }

  public static async deleteCloudUserData(userId: string): Promise<boolean> {
    if (!this.isCloudEnabled() || !this.supabase) return false;
    const { error: err1 } = await this.supabase.from('voxel_cloud_sync').delete().eq('user_id', userId);
    const { error: err2 } = await this.supabase.from('voxel_users').delete().eq('id', userId);
    await this.signOutCloud();

    if (err1 || err2) {
      throw new Error(`Cloud account deletion failed: ${err1?.message || err2?.message}`);
    }
    return true;
  }
}
