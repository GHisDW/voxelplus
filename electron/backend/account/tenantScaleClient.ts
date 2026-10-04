import { TenantScale } from '@tenantscale/sdk';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { CloudSyncPayload, PublicUserProfile, UserLibraryItem, UserProfile } from './accountTypes';

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
  private static currentTenantContext: ValidatedTenantContext | null = null;

  /**
   * Initializes cloud database and TenantScale client strictly using unprivileged,
   * client-safe anon keys (SUPABASE_ANON_KEY).
   *
   * Security Guarantee: Desktop client executables NEVER handle or bundle
   * privileged administrative credentials.
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

  public static toInternalEmail(username: string): string {
    return `${username.trim().toLowerCase()}@voxel.internal`;
  }

  public static getCurrentTenantContext(): ValidatedTenantContext | null {
    return this.currentTenantContext;
  }

  /**
   * Validates a session JWT using TenantScale SDK validateSession.
   */
  public static async validateSession(jwtToken: string): Promise<ValidatedTenantContext | null> {
    if (!this.isCloudEnabled() || !this.tenantScale || !jwtToken) return null;

    try {
      const tenantContext = await this.tenantScale.validateSession(jwtToken);
      this.currentTenantContext = tenantContext as ValidatedTenantContext;
      return this.currentTenantContext;
    } catch (err) {
      console.warn('[TenantScaleClient] TenantScale session validation rejected:', err);
      this.currentTenantContext = null;
      return null;
    }
  }

  /**
   * Logs audit event via TenantScale SDK logAuditEvent.
   */
  public static async logAuditEvent(input: {
    tenant_id?: string | null;
    actor_id: string;
    actor_type: 'user' | 'system' | 'admin_api' | 'admin_impersonation';
    action: string;
    resource: string;
    details?: Record<string, any>;
  }): Promise<void> {
    if (!this.isCloudEnabled() || !this.tenantScale) return;
    const activeTenantId = input.tenant_id !== undefined ? input.tenant_id : (this.currentTenantContext?.tenant_id || null);
    try {
      await this.tenantScale.logAuditEvent({
        tenant_id: activeTenantId,
        actor_id: input.actor_id,
        actor_type: input.actor_type,
        action: input.action,
        resource: input.resource,
        details: input.details || {}
      });
    } catch (err) {
      console.warn('[TenantScaleClient] Audit log error:', err);
    }
  }

  /**
   * Strict feature entitlement check using TenantScale plans module.
   * Fails closed (returns false) if tenant or feature check fails.
   */
  public static async hasPlanFeature(feature: string): Promise<boolean> {
    if (!this.isCloudEnabled() || !this.tenantScale) return false;
    const tenantId = this.currentTenantContext?.tenant_id;
    if (!tenantId) return false;

    try {
      return await this.tenantScale.plans.hasPlanFeature(tenantId, feature);
    } catch (err) {
      console.warn(`[TenantScaleClient] Policy feature check failed for "${feature}":`, err);
      return false; // Fail closed for policy enforcement
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

    if (accessToken) {
      const tenantContext = await this.validateSession(accessToken);
      if (!tenantContext) {
        throw new Error('TenantScale session validation failed during registration. Valid tenant context is required.');
      }
    }

    await this.logAuditEvent({
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
   * Validates resulting session token via TenantScale SDK (FAILS CLOSED if TenantScale context is invalid).
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

    // Validate TenantScale session context - FAILS CLOSED if invalid
    const tenantContext = await this.validateSession(accessToken);
    if (!tenantContext) {
      throw new Error('TenantScale session validation failed. Access denied.');
    }
    const tenantId = tenantContext.tenant_id;

    const { data: profileRow, error: fetchErr } = await this.supabase
      .from('voxel_users')
      .select('*')
      .eq('id', userId)
      .single();

    if (fetchErr) {
      console.warn('[TenantScaleClient] Profile fetch error:', fetchErr.message);
    }

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

  public static async signOutCloud(): Promise<void> {
    if (this.isCloudEnabled() && this.supabase) {
      if (this.currentTenantContext) {
        await this.logAuditEvent({
          actor_id: this.currentTenantContext.user_id,
          actor_type: 'user',
          action: 'account.logout',
          resource: 'voxel_users'
        });
      }
      await this.supabase.auth.signOut();
      this.currentTenantContext = null;
    }
  }

  public static async updateCloudPassword(newPassword: string): Promise<boolean> {
    if (!this.isCloudEnabled() || !this.supabase) return false;
    const { error } = await this.supabase.auth.updateUser({ password: newPassword });
    if (error) {
      throw new Error(error.message);
    }
    return true;
  }

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
      actor_id: profile.id,
      actor_type: 'user',
      action: 'profile.update',
      resource: 'voxel_users',
      details: { username: profile.username, isPublic: profile.isPublic }
    });

    return true;
  }

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
      actor_id: userId,
      actor_type: 'user',
      action: 'data.sync',
      resource: 'voxel_cloud_sync',
      details: { lastSyncedAt: payload.lastSyncedAt }
    });

    return true;
  }

  public static async saveLibraryItemToCloud(userId: string, item: UserLibraryItem): Promise<boolean> {
    if (!this.isCloudEnabled() || !this.supabase) return false;

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

    await this.logAuditEvent({
      actor_id: userId,
      actor_type: 'user',
      action: 'library.item_add',
      resource: 'voxel_library',
      details: { itemId: item.id, type: item.type, title: item.title }
    });

    return true;
  }

  public static async fetchLibraryFromCloud(userId: string): Promise<UserLibraryItem[] | null> {
    if (!this.isCloudEnabled() || !this.supabase) return null;

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
    if (!this.isCloudEnabled() || !this.supabase) return null;

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

  /**
   * Fetches public user profiles and calculates real public pack/skin counts via PostgreSQL RPC / query.
   */
  public static async fetchPublicProfilesFromCloud(): Promise<PublicUserProfile[] | null> {
    if (!this.isCloudEnabled() || !this.supabase) return null;

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

    const userIds = users.map((u) => u.id);
    let libraryItems: Array<{ user_id: string; type: string; metadata: any }> = [];

    if (userIds.length > 0) {
      const { data: items } = await this.supabase
        .from('voxel_library')
        .select('user_id, type, metadata')
        .in('user_id', userIds);
      if (items) {
        libraryItems = items;
      }
    }

    const packCounts: Record<string, number> = {};
    const skinCounts: Record<string, number> = {};

    for (const item of libraryItems) {
      if (item.metadata?.isPublic === true) {
        if (item.type === 'pack') packCounts[item.user_id] = (packCounts[item.user_id] || 0) + 1;
        if (item.type === 'skin') skinCounts[item.user_id] = (skinCounts[item.user_id] || 0) + 1;
      }
    }

    return users.map((u) => {
      const publicPacksCount = packCounts[u.id] || 0;
      const publicSkinsCount = skinCounts[u.id] || 0;
      return {
        id: u.id,
        username: u.username,
        avatar: u.avatar,
        bio: u.bio || '',
        createdAt: u.created_at,
        publicPacksCount,
        publicSkinsCount,
        isCreator: publicPacksCount > 0 || publicSkinsCount > 0
      };
    });
  }

  public static async deleteCloudUserData(userId: string): Promise<boolean> {
    if (!this.isCloudEnabled() || !this.supabase) return false;

    await this.logAuditEvent({
      actor_id: userId,
      actor_type: 'user',
      action: 'account.delete',
      resource: 'voxel_users',
      details: { userId }
    });

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
