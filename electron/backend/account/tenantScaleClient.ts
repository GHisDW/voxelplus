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

  public static async syncProfileToCloud(profile: UserProfile): Promise<boolean> {
    if (!this.isCloudEnabled() || !this.supabase) return false;
    try {
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
        console.warn('[TenantScaleClient] Sync profile cloud error:', error.message);
        return false;
      }
      return true;
    } catch (e) {
      console.warn('[TenantScaleClient] Cloud sync exception:', e);
      return false;
    }
  }

  public static async syncDataToCloud(userId: string, payload: CloudSyncPayload): Promise<boolean> {
    if (!this.isCloudEnabled() || !this.supabase) return false;
    try {
      const { error } = await this.supabase
        .from('voxel_cloud_sync')
        .upsert({
          user_id: userId,
          sync_payload: payload,
          last_synced_at: payload.lastSyncedAt
        }, { onConflict: 'user_id' });

      if (error) {
        console.warn('[TenantScaleClient] Cloud sync data error:', error.message);
        return false;
      }
      return true;
    } catch (e) {
      console.warn('[TenantScaleClient] Cloud sync data exception:', e);
      return false;
    }
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
    try {
      await this.supabase.from('voxel_users').delete().eq('id', userId);
      await this.supabase.from('voxel_cloud_sync').delete().eq('user_id', userId);
      return true;
    } catch {
      return false;
    }
  }
}
