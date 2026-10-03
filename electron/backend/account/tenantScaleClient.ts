import { TenantScale } from '@tenantscale/sdk';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { CloudSyncPayload, PublicUserProfile, UserProfile } from './accountTypes';

export interface ValidatedTenantContext {
  user_id: string;
  email: string;
  tenant_id: string | null;
  tenant_slug: string | null;
  tenant_name: string | null;
  role: string | null;
  membership_id: string | null;
  is_super_admin: boolean;
}

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
        console.log('[TenantScaleClient] Initialized TenantScale SDK & Supabase Client.');
        return true;
      } catch (err) {
        console.warn('[TenantScaleClient] Failed to initialize cloud clients:', err);
        this.isInitialized = true;
        return false;
      }
    } else {
      console.log('[TenantScaleClient] No public cloud configuration present. Cloud mode disabled.');
      this.isInitialized = true;
      return false;
    }
  }

  public static isCloudEnabled(): boolean {
    this.initialize();
    return !!this.supabase;
  }

  /**
   * Converts Voxel+ username to internal Supabase Auth email.
   */
  public static toInternalEmail(username: string): string {
    return `${username.trim().toLowerCase()}@voxel.internal`;
  }

  /**
   * Validates a session JWT using TenantScale SDK validateSession.
   */
  public static async validateSession(jwtToken: string): Promise<ValidatedTenantContext | null> {
    if (!this.isCloudEnabled() || !this.tenantScale || !jwtToken) return null;

    try {
      const tenantContext = await this.tenantScale.validateSession(jwtToken);
      return tenantContext as ValidatedTenantContext;
    } catch (err) {
      console.warn('[TenantScaleClient] TenantScale session validation rejected:', err);
      return null;
    }
  }

  /**
   * Logs audit event via TenantScale SDK logAuditEvent.
   */
  public static async logAuditEvent(input: {
    tenant_id: string | null;
    actor_id: string;
    actor_type: 'user' | 'system' | 'admin_api' | 'admin_impersonation';
    action: string;
    resource: string;
    details?: Record<string, any>;
  }): Promise<void> {
    if (!this.isCloudEnabled() || !this.tenantScale) return;
    try {
      await this.tenantScale.logAuditEvent({
        tenant_id: input.tenant_id,
        actor_id: input.actor_id,
        actor_type: input.actor_type,
        action: input.action,
        resource: input.resource,
        details: input.details || {}
      });
    } catch (err) {
      console.warn('[TenantScaleClient] Audit log failed:', err);
    }
  }

  /**
   * Enforces feature limits using TenantScale plans module.
   */
  public static async hasPlanFeature(tenantId: string, feature: string): Promise<boolean> {
    if (!this.isCloudEnabled() || !this.tenantScale) return true;
    try {
      return await this.tenantScale.plans.hasPlanFeature(tenantId, feature);
    } catch {
      return true; // Fail open for feature limits
    }
  }

  /**
   * Registers a new Voxel+ account against Supabase Auth engine and TenantScale.
   */
  public static async signUpWithCloud(
    username: string,
    password: string,
    avatar: string = 'avatar_steve',
    bio: string = '',
    isPublic: boolean = true
  ): Promise<{ userId: string; accessToken: string; profile: UserProfile } | null> {
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

    const accessToken = data.session?.access_token || '';

    // Log account creation audit event
    await this.logAuditEvent({
      tenant_id: null,
      actor_id: userId,
      actor_type: 'user',
      action: 'account.create',
      resource: 'voxel_users',
      details: { username, isPublic }
    });

    return { userId, accessToken, profile };
  }

  /**
   * Authenticates an existing Voxel+ account against Supabase Auth engine.
   * Validates resulting session token via TenantScale SDK.
   */
  public static async signInWithCloud(
    username: string,
    password: string
  ): Promise<{ userId: string; accessToken: string; profile: UserProfile; tenantId: string | null } | null> {
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
    const accessToken = data.session.access_token;

    // Validate session via TenantScale SDK
    const tenantContext = await this.validateSession(accessToken);
    const tenantId = tenantContext?.tenant_id || null;

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

    // Log login audit event
    await this.logAuditEvent({
      tenant_id: tenantId,
      actor_id: userId,
      actor_type: 'user',
      action: 'account.login',
      resource: 'voxel_users',
      details: { username }
    });

    return { userId, accessToken, profile, tenantId };
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

    await this.logAuditEvent({
      tenant_id: null,
      actor_id: profile.id,
      actor_type: 'user',
      action: 'profile.update',
      resource: 'voxel_users',
      details: { username: profile.username, isPublic: profile.isPublic }
    });

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

    await this.logAuditEvent({
      tenant_id: null,
      actor_id: userId,
      actor_type: 'user',
      action: 'data.sync',
      resource: 'voxel_cloud_sync',
      details: { lastSyncedAt: payload.lastSyncedAt }
    });

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

    await this.logAuditEvent({
      tenant_id: null,
      actor_id: userId,
      actor_type: 'user',
      action: 'account.delete',
      resource: 'voxel_users',
      details: { userId }
    });

    const { error: err1 } = await this.supabase.from('voxel_cloud_sync').delete().eq('user_id', userId);
    const { error: err2 } = await this.supabase.from('voxel_users').delete().eq('id', userId);
    await this.signOutCloud();

    if (err1 || err2) {
      throw new Error(`Cloud account deletion failed: ${err1?.message || err2?.message}`);
    }
    return true;
  }
}
