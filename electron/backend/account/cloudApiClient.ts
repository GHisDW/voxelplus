import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AccountSession, CloudSyncPayload, PublicUserProfile, UserLibraryItem, UserProfile } from './accountTypes';

export class CloudApiClient {
  private static supabase: SupabaseClient | null = null;
  private static isInitialized = false;
  private static apiBaseUrl = process.env.VOXELPLUS_CLOUD_API_URL || 'http://localhost:3001';

  public static initialize(): boolean {
    if (this.isInitialized) return !!this.supabase;

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseAnonKey) {
      try {
        this.supabase = createClient(supabaseUrl, supabaseAnonKey, {
          auth: { persistSession: false }
        });
        this.isInitialized = true;
        return true;
      } catch (err) {
        console.warn('[CloudApiClient] Failed to initialize Supabase client:', err);
        this.isInitialized = true;
        return false;
      }
    } else {
      this.isInitialized = true;
      return false;
    }
  }

  public static isCloudEnabled(): boolean {
    this.initialize();
    return !!this.supabase;
  }

  public static toInternalEmail(username: string): string {
    return `${username.trim().toLowerCase()}@voxel.internal`;
  }

  /**
   * Registers a new Voxel+ account via Cloud API endpoint or direct Supabase Auth.
   */
  public static async signUpWithCloud(
    username: string,
    password: string,
    avatar: string = 'avatar_steve',
    bio: string = '',
    isPublic: boolean = true
  ): Promise<AccountSession | null> {
    if (!this.isCloudEnabled() || !this.supabase) return null;

    try {
      const res = await fetch(`${this.apiBaseUrl}/api/account/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, avatar, bio, isPublic })
      });

      if (res.ok) {
        const data = (await res.json()) as any;
        return {
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          user: data.profile
        };
      }
    } catch {
      // Fallback to client-side Supabase signup if local Cloud API dev server is not running
    }

    const internalEmail = this.toInternalEmail(username);
    const { data, error } = await this.supabase.auth.signUp({
      email: internalEmail,
      password,
      options: {
        data: { username, avatar, bio, isPublic }
      }
    });

    if (error || !data.user || !data.session) {
      throw new Error(error?.message || 'Cloud signup failed.');
    }

    const userId = data.user.id;
    const now = new Date().toISOString();

    const { error: profileError } = await this.supabase.from('voxel_users').upsert({
      id: userId,
      username,
      avatar,
      bio,
      is_public: isPublic,
      updated_at: now,
      created_at: now
    }, { onConflict: 'id' });

    if (profileError) {
      throw new Error(`Profile creation failed: ${profileError.message}`);
    }

    const profile: UserProfile = {
      id: userId,
      username,
      avatar,
      bio,
      createdAt: now,
      updatedAt: now,
      isPublic,
      syncEnabled: true
    };

    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      user: profile,
      expiresAt: data.session.expires_at,
      tokenType: data.session.token_type
    };
  }

  /**
   * Authenticates an existing Voxel+ account via Supabase Auth.
   */
  public static async signInWithCloud(
    username: string,
    password: string
  ): Promise<AccountSession | null> {
    if (!this.isCloudEnabled() || !this.supabase) return null;

    const internalEmail = this.toInternalEmail(username);
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email: internalEmail,
      password
    });

    if (error || !data.user || !data.session) {
      throw new Error(error?.message || 'Invalid username or password.');
    }

    const userId = data.user.id;

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

    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      user: profile,
      expiresAt: data.session.expires_at,
      tokenType: data.session.token_type
    };
  }

  public static async signOutCloud(): Promise<void> {
    if (this.isCloudEnabled() && this.supabase) {
      await this.supabase.auth.signOut();
    }
  }

  public static async updateCloudPassword(accessToken: string, newPassword: string): Promise<boolean> {
    if (!this.isCloudEnabled()) return false;

    try {
      const res = await fetch(`${this.apiBaseUrl}/api/account/password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({ newPassword })
      });
      if (res.ok) return true;
    } catch {
      // Fallback
    }

    if (!this.supabase) return false;
    const { error } = await this.supabase.auth.updateUser({ password: newPassword });
    if (error) {
      throw new Error(error.message);
    }
    return true;
  }

  public static async syncProfileToCloud(accessToken: string, profile: UserProfile): Promise<boolean> {
    if (!this.isCloudEnabled()) return false;

    try {
      const res = await fetch(`${this.apiBaseUrl}/api/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          username: profile.username,
          avatar: profile.avatar,
          bio: profile.bio,
          isPublic: profile.isPublic,
          syncEnabled: profile.syncEnabled
        })
      });
      if (res.ok) return true;
    } catch {
      // Fallback
    }

    if (!this.supabase) return false;
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

  public static async syncDataToCloud(accessToken: string, userId: string, payload: CloudSyncPayload): Promise<boolean> {
    if (!this.isCloudEnabled()) return false;

    try {
      const res = await fetch(`${this.apiBaseUrl}/api/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify(payload)
      });
      if (res.ok) return true;
    } catch {
      // Fallback
    }

    if (!this.supabase) return false;
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

  public static async saveLibraryItemToCloud(accessToken: string, userId: string, item: UserLibraryItem): Promise<boolean> {
    if (!this.isCloudEnabled()) return false;

    try {
      const res = await fetch(`${this.apiBaseUrl}/api/library`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify(item)
      });
      if (res.ok) return true;
    } catch {
      // Fallback
    }

    if (!this.supabase) return false;
    const { error } = await this.supabase
      .from('voxel_library')
      .upsert({
        id: item.id,
        user_id: userId,
        title: item.title,
        type: item.type,
        source: item.source,
        added_at: item.addedAt,
        metadata: item.metadata || {}
      }, { onConflict: 'id' });

    if (error) {
      throw new Error(`Cloud library save failed: ${error.message}`);
    }
    return true;
  }

  public static async fetchLibraryFromCloud(accessToken: string, userId: string): Promise<UserLibraryItem[] | null> {
    if (!this.isCloudEnabled()) return null;

    try {
      const res = await fetch(`${this.apiBaseUrl}/api/library`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (res.ok) {
        return (await res.json()) as UserLibraryItem[];
      }
    } catch {
      // Fallback
    }

    if (!this.supabase) return null;
    const { data, error } = await this.supabase
      .from('voxel_library')
      .select('*')
      .eq('user_id', userId);

    if (error || !data) return null;

    return data.map((row) => ({
      id: row.id,
      title: row.title,
      type: row.type,
      source: row.source,
      addedAt: row.added_at,
      metadata: row.metadata || {}
    }));
  }

  public static async fetchUserFromCloudByUsername(username: string): Promise<UserProfile | null> {
    if (!this.isCloudEnabled()) return null;

    try {
      const res = await fetch(`${this.apiBaseUrl}/api/public/profiles/${encodeURIComponent(username)}`);
      if (res.ok) {
        return (await res.json()) as UserProfile;
      }
    } catch {
      // Fallback
    }

    if (!this.supabase) return null;
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
  }

  public static async fetchPublicProfilesFromCloud(query?: string): Promise<PublicUserProfile[] | null> {
    if (!this.isCloudEnabled()) return null;

    try {
      const url = query ? `${this.apiBaseUrl}/api/public/profiles?q=${encodeURIComponent(query)}` : `${this.apiBaseUrl}/api/public/profiles`;
      const res = await fetch(url);
      if (res.ok) {
        return (await res.json()) as PublicUserProfile[];
      }
    } catch {
      // Fallback
    }

    if (!this.supabase) return null;
    const { data: rpcData, error: rpcError } = await this.supabase.rpc('get_public_user_profiles');

    if (!rpcError && rpcData && Array.isArray(rpcData)) {
      return rpcData.map((row: any) => ({
        id: row.id,
        username: row.username,
        avatar: row.avatar,
        bio: row.bio || '',
        createdAt: row.created_at,
        publicPacksCount: Number(row.public_packs_count || 0),
        publicSkinsCount: Number(row.public_skins_count || 0),
        isCreator: Number(row.public_packs_count || 0) > 0 || Number(row.public_skins_count || 0) > 0
      }));
    }

    const { data: users, error } = await this.supabase
      .from('voxel_users')
      .select('id, username, avatar, bio, created_at')
      .eq('is_public', true)
      .limit(50);

    if (error || !users) return null;

    return users.map((u) => ({
      id: u.id,
      username: u.username,
      avatar: u.avatar,
      bio: u.bio || '',
      createdAt: u.created_at,
      publicPacksCount: 0,
      publicSkinsCount: 0,
      isCreator: false
    }));
  }

  public static async deleteCloudUserData(accessToken: string, userId: string): Promise<boolean> {
    if (!this.isCloudEnabled()) return false;

    try {
      const res = await fetch(`${this.apiBaseUrl}/api/account`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (res.ok) {
        await this.signOutCloud();
        return true;
      }
    } catch {
      // Fallback
    }

    if (!this.supabase) return false;
    const { error: err1 } = await this.supabase.from('voxel_cloud_sync').delete().eq('user_id', userId);
    const { error: err2 } = await this.supabase.from('voxel_library').delete().eq('user_id', userId);
    const { error: err3 } = await this.supabase.from('voxel_users').delete().eq('id', userId);

    await this.signOutCloud();

    if (err1 || err2 || err3) {
      throw new Error(`Cloud account deletion failed: ${err1?.message || err2?.message || err3?.message}`);
    }
    return true;
  }
}
