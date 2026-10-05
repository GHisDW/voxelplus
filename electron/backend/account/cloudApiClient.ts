import { AccountSession, CloudSyncPayload, PublicUserProfile, UserLibraryItem, UserProfile } from './accountTypes';

export class CloudApiClient {
  private static apiBaseUrl = process.env.VOXELPLUS_CLOUD_API_URL || 'http://localhost:3001';
  private static _cloudReachable: boolean | null = null;
  private static _lastReachableCheck: number = 0;

  /**
   * Checks if the cloud API server is actually reachable.
   * Caches the result for 30 seconds to avoid spamming requests.
   */
  public static async checkCloudReachable(): Promise<boolean> {
    const now = Date.now();
    if (this._cloudReachable !== null && (now - this._lastReachableCheck) < 30_000) {
      return this._cloudReachable;
    }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${this.apiBaseUrl}/health`, {
        signal: controller.signal
      });
      clearTimeout(timeout);
      this._cloudReachable = res.ok || res.status < 500;
    } catch {
      this._cloudReachable = false;
    }
    this._lastReachableCheck = now;
    return this._cloudReachable;
  }

  public static toInternalEmail(username: string): string {
    return `${username.trim().toLowerCase()}@voxel.internal`;
  }

  /**
   * Validates access token with Cloud API server.
   */
  public static async validateCloudToken(accessToken: string): Promise<UserProfile> {
    if (!accessToken) {
      throw new Error('INVALID_SESSION');
    }

    const res = await fetch(`${this.apiBaseUrl}/api/library`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (res.status === 401 || res.status === 403) {
      throw new Error('INVALID_SESSION');
    }

    if (!res.ok) {
      throw new Error('Cloud API service is unavailable.');
    }

    // Token is valid; return profile DTO from Cloud API
    const profileRes = await fetch(`${this.apiBaseUrl}/api/profile`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!profileRes.ok) {
      throw new Error('INVALID_SESSION');
    }

    return (await profileRes.json()) as UserProfile;
  }

  /**
   * Registers a new Voxel+ account via Cloud API endpoint.
   */
  public static async signUpWithCloud(
    username: string,
    password: string,
    avatar: string = 'avatar_steve',
    bio: string = '',
    isPublic: boolean = true
  ): Promise<AccountSession> {
    const res = await fetch(`${this.apiBaseUrl}/api/account/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, avatar, bio, isPublic })
    });

    if (!res.ok) {
      const errJson = (await res.json().catch(() => ({}))) as any;
      throw new Error(errJson.error || 'Cloud signup failed.');
    }

    const data = (await res.json()) as any;
    return {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      user: data.profile
    };
  }

  /**
   * Authenticates an existing Voxel+ account via Cloud API endpoint.
   */
  public static async signInWithCloud(
    username: string,
    password: string
  ): Promise<AccountSession> {
    const res = await fetch(`${this.apiBaseUrl}/api/account/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    if (!res.ok) {
      const errJson = (await res.json().catch(() => ({}))) as any;
      throw new Error(errJson.error || 'Invalid username or password.');
    }

    const data = (await res.json()) as any;
    return {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      user: data.profile
    };
  }

  public static async signOutCloud(): Promise<void> {
    // Client-side session teardown
  }

  public static async updateCloudPassword(accessToken: string, newPassword: string): Promise<boolean> {
    const res = await fetch(`${this.apiBaseUrl}/api/account/password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({ newPassword })
    });

    if (!res.ok) {
      const errJson = (await res.json().catch(() => ({}))) as any;
      throw new Error(errJson.error || 'Password update failed.');
    }

    return true;
  }

  public static async syncProfileToCloud(accessToken: string, profile: UserProfile): Promise<boolean> {
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

    if (!res.ok) {
      const errJson = (await res.json().catch(() => ({}))) as any;
      throw new Error(errJson.error || 'Profile sync failed.');
    }

    return true;
  }

  public static async syncDataToCloud(accessToken: string, userId: string, payload: CloudSyncPayload): Promise<boolean> {
    const res = await fetch(`${this.apiBaseUrl}/api/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errJson = (await res.json().catch(() => ({}))) as any;
      throw new Error(errJson.error || 'Cloud sync failed.');
    }

    return true;
  }

  public static async saveLibraryItemToCloud(accessToken: string, userId: string, item: UserLibraryItem): Promise<boolean> {
    const res = await fetch(`${this.apiBaseUrl}/api/library`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify(item)
    });

    if (!res.ok) {
      const errJson = (await res.json().catch(() => ({}))) as any;
      throw new Error(errJson.error || 'Library save failed.');
    }

    return true;
  }

  /**
   * Fetches the authoritative cloud library. Throws on failure so callers
   * can surface a real unavailable state instead of falling back to local
   * cache as if it were authoritative.
   */
  public static async fetchLibraryFromCloud(accessToken: string, userId: string): Promise<UserLibraryItem[]> {
    const res = await fetch(`${this.apiBaseUrl}/api/library`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!res.ok) {
      const errJson = (await res.json().catch(() => ({}))) as any;
      throw new Error(errJson.error || 'Cloud library is unavailable.');
    }

    return (await res.json()) as UserLibraryItem[];
  }

  /**
   * Fetches a public profile (with real pack/skin counts and creator status).
   * Returns null only for a genuine 404; other failures throw.
   */
  public static async fetchPublicProfileFromCloud(username: string): Promise<PublicUserProfile | null> {
    const res = await fetch(`${this.apiBaseUrl}/api/public/profiles/${encodeURIComponent(username)}`);
    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      const errJson = (await res.json().catch(() => ({}))) as any;
      throw new Error(errJson.error || 'Public profile is unavailable.');
    }

    return (await res.json()) as PublicUserProfile;
  }

  public static async fetchPublicProfilesFromCloud(query?: string): Promise<PublicUserProfile[]> {
    const url = query ? `${this.apiBaseUrl}/api/public/profiles?q=${encodeURIComponent(query)}` : `${this.apiBaseUrl}/api/public/profiles`;
    const res = await fetch(url);
    if (!res.ok) {
      const errJson = (await res.json().catch(() => ({}))) as any;
      throw new Error(errJson.error || 'Public profiles are unavailable.');
    }

    return (await res.json()) as PublicUserProfile[];
  }

  public static async deleteCloudUserData(accessToken: string, userId: string): Promise<boolean> {
    const res = await fetch(`${this.apiBaseUrl}/api/account`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!res.ok) {
      const errJson = (await res.json().catch(() => ({}))) as any;
      throw new Error(errJson.error || 'Account deletion failed.');
    }

    return true;
  }

  // ─── Cosmetics ───

  public static async fetchCosmeticsCatalog(): Promise<any[]> {
    const res = await fetch(`${this.apiBaseUrl}/api/cosmetics/catalog`);
    if (!res.ok) {
      const errJson = (await res.json().catch(() => ({}))) as any;
      throw new Error(errJson.error || 'Cosmetics catalog is unavailable.');
    }
    return (await res.json()) as any[];
  }

  public static async fetchUserCosmetics(accessToken: string): Promise<any[]> {
    const res = await fetch(`${this.apiBaseUrl}/api/cosmetics`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) {
      const errJson = (await res.json().catch(() => ({}))) as any;
      throw new Error(errJson.error || 'User cosmetics are unavailable.');
    }
    return (await res.json()) as any[];
  }

  public static async selectCosmetic(accessToken: string, cosmeticId: string | null): Promise<boolean> {
    const res = await fetch(`${this.apiBaseUrl}/api/cosmetics/select`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({ cosmeticId })
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as any;
      throw new Error(err.error || 'Failed to select cosmetic.');
    }
    return true;
  }

  // ─── Achievements ───

  public static async fetchAchievementsCatalog(): Promise<any[]> {
    const res = await fetch(`${this.apiBaseUrl}/api/achievements/catalog`);
    if (!res.ok) {
      const err: any = new Error(`Cloud catalog error ${res.status}`);
      err.code = 'CATALOG_ERROR';
      throw err;
    }
    return (await res.json()) as any[];
  }

  public static async fetchUserAchievements(accessToken: string): Promise<any[]> {
    const res = await fetch(`${this.apiBaseUrl}/api/achievements`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) {
      const errJson = (await res.json().catch(() => ({}))) as any;
      throw new Error(errJson.error || 'User achievements are unavailable.');
    }
    return (await res.json()) as any[];
  }

  // ─── Rewarded ads ───

  public static async fetchAdsStatus(): Promise<{ available: boolean; provider: string | null }> {
    const res = await fetch(`${this.apiBaseUrl}/api/ads/status`);
    if (!res.ok) return { available: false, provider: null };
    return (await res.json()) as any;
  }

  public static async fetchAdProgress(accessToken: string): Promise<any[]> {
    const res = await fetch(`${this.apiBaseUrl}/api/ads/progress`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) {
      const errJson = (await res.json().catch(() => ({}))) as any;
      throw new Error(errJson.error || 'Ad progress is unavailable.');
    }
    return (await res.json()) as any[];
  }

  public static async completeAd(
    accessToken: string,
    itemKind: 'cosmetic' | 'vpack',
    itemId: string,
    completionId: string,
    proof: string
  ): Promise<any> {
    const res = await fetch(`${this.apiBaseUrl}/api/ads/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({ itemKind, itemId, completionId, proof })
    });
    if (!res.ok) {
      const errJson = (await res.json().catch(() => ({}))) as any;
      const err: any = new Error(errJson.error || 'Ad completion failed.');
      err.code = errJson.code;
      throw err;
    }
    return await res.json();
  }

  // ─── VPacks ───

  public static async fetchVpackCatalog(): Promise<any[]> {
    const res = await fetch(`${this.apiBaseUrl}/api/vpacks/catalog`);
    if (!res.ok) {
      const errJson = (await res.json().catch(() => ({}))) as any;
      throw new Error(errJson.error || 'VPack catalog is unavailable.');
    }
    return (await res.json()) as any[];
  }

  public static async fetchVpacks(accessToken: string): Promise<any[]> {
    const res = await fetch(`${this.apiBaseUrl}/api/vpacks`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) {
      const errJson = (await res.json().catch(() => ({}))) as any;
      throw new Error(errJson.error || 'VPacks are unavailable.');
    }
    return (await res.json()) as any[];
  }

  public static async createVpack(accessToken: string, payload: { title: string; description?: string; contents?: any }): Promise<any> {
    const res = await fetch(`${this.apiBaseUrl}/api/vpacks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const errJson = (await res.json().catch(() => ({}))) as any;
      throw new Error(errJson.error || 'VPack creation failed.');
    }
    return await res.json();
  }

  public static async convertInstanceToVpack(accessToken: string, payload: { instanceId: string; title?: string; description?: string }): Promise<any> {
    const res = await fetch(`${this.apiBaseUrl}/api/vpacks/convert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const errJson = (await res.json().catch(() => ({}))) as any;
      throw new Error(errJson.error || 'VPack conversion failed.');
    }
    return await res.json();
  }

  public static async installVpack(accessToken: string, vpackId: string): Promise<any> {
    const res = await fetch(`${this.apiBaseUrl}/api/vpacks/${vpackId}/install`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) {
      const errJson = (await res.json().catch(() => ({}))) as any;
      throw new Error(errJson.error || 'VPack install failed.');
    }
    return await res.json();
  }

  // ─── Instances (cloud record) ───

  public static async createInstanceRecord(accessToken: string, payload: { name: string; version?: string }): Promise<{ id: string } | null> {
    const res = await fetch(`${this.apiBaseUrl}/api/instances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const errJson = (await res.json().catch(() => ({}))) as any;
      throw new Error(errJson.error || 'Instance record failed.');
    }
    return (await res.json()) as { id: string } | null;
  }

  public static async deleteInstanceRecord(accessToken: string, id: string): Promise<boolean> {
    const res = await fetch(`${this.apiBaseUrl}/api/instances/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) {
      const errJson = (await res.json().catch(() => ({}))) as any;
      throw new Error(errJson.error || 'Instance record deletion failed.');
    }
    return true;
  }

  // ─── Avatar ───

  public static async uploadAvatar(
    accessToken: string,
    buffer: ArrayBuffer | Uint8Array,
    fileName: string,
    mimeType: string
  ): Promise<{ avatarUrl: string }> {
    const formData = new FormData();
    const blob = new Blob([buffer as any], { type: mimeType });
    formData.append('avatar', blob, fileName);

    const res = await fetch(`${this.apiBaseUrl}/api/avatar/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: formData
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as any;
      throw new Error(err.error || 'Avatar upload failed.');
    }

    return (await res.json()) as { avatarUrl: string };
  }

  public static async deleteAvatar(accessToken: string): Promise<boolean> {
    const res = await fetch(`${this.apiBaseUrl}/api/avatar`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) {
      const errJson = (await res.json().catch(() => ({}))) as any;
      throw new Error(errJson.error || 'Avatar deletion failed.');
    }
    return true;
  }

  // ─── Owner Control Panel ───

  public static async checkOwnerStatus(accessToken: string): Promise<{ isOwner: boolean; role: string | null }> {
    const res = await fetch(`${this.apiBaseUrl}/api/owner/check`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) return { isOwner: false, role: null };
    return (await res.json()) as { isOwner: boolean; role: string | null };
  }

  public static async getOwnerUsers(accessToken: string, query?: string, limit?: number, offset?: number): Promise<any> {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (limit) params.set('limit', String(limit));
    if (offset) params.set('offset', String(offset));

    const res = await fetch(`${this.apiBaseUrl}/api/owner/users?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as any;
      throw new Error(err.error || 'Forbidden');
    }
    return await res.json();
  }

  public static async getOwnerUserDetails(accessToken: string, userId: string): Promise<any> {
    const res = await fetch(`${this.apiBaseUrl}/api/owner/users/${userId}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as any;
      throw new Error(err.error || 'User not found');
    }
    return await res.json();
  }

  public static async grantTitle(accessToken: string, userId: string, titleId: string): Promise<boolean> {
    const res = await fetch(`${this.apiBaseUrl}/api/owner/users/${userId}/title`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({ titleId })
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as any;
      throw new Error(err.error || 'Failed to grant title');
    }
    return true;
  }

  public static async revokeTitle(accessToken: string, userId: string, titleId: string): Promise<boolean> {
    const res = await fetch(`${this.apiBaseUrl}/api/owner/users/${userId}/title`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({ titleId })
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as any;
      throw new Error(err.error || 'Failed to revoke title');
    }
    return true;
  }

  public static async grantBadge(accessToken: string, userId: string, badgeId: string): Promise<boolean> {
    const res = await fetch(`${this.apiBaseUrl}/api/owner/users/${userId}/badge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({ badgeId })
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as any;
      throw new Error(err.error || 'Failed to grant badge');
    }
    return true;
  }

  public static async revokeBadge(accessToken: string, userId: string, badgeId: string): Promise<boolean> {
    const res = await fetch(`${this.apiBaseUrl}/api/owner/users/${userId}/badge`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({ badgeId })
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as any;
      throw new Error(err.error || 'Failed to revoke badge');
    }
    return true;
  }

  public static async setCreatorStatus(accessToken: string, userId: string, isCreator: boolean): Promise<boolean> {
    const res = await fetch(`${this.apiBaseUrl}/api/owner/users/${userId}/creator`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({ isCreator })
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as any;
      throw new Error(err.error || 'Failed to set creator status');
    }
    return true;
  }

  public static async ownerDeleteUser(accessToken: string, userId: string, confirmPhrase: string): Promise<boolean> {
    const res = await fetch(`${this.apiBaseUrl}/api/owner/users/${userId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({ confirmPhrase })
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as any;
      throw new Error(err.error || 'Failed to delete user');
    }
    return true;
  }

  public static async ownerBulkDelete(accessToken: string, confirmPhrase: string): Promise<{ deleted: number }> {
    const res = await fetch(`${this.apiBaseUrl}/api/owner/bulk`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({ confirmPhrase })
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as any;
      throw new Error(err.error || 'Bulk delete failed');
    }
    return (await res.json()) as { deleted: number };
  }

  public static async getOwnerAuditLog(accessToken: string, limit?: number, offset?: number): Promise<any> {
    const params = new URLSearchParams();
    if (limit) params.set('limit', String(limit));
    if (offset) params.set('offset', String(offset));

    const res = await fetch(`${this.apiBaseUrl}/api/owner/audit?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as any;
      throw new Error(err.error || 'Audit log access forbidden');
    }
    return await res.json();
  }
}
