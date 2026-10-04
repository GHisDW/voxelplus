import { AccountSession, CloudSyncPayload, PublicUserProfile, UserLibraryItem, UserProfile } from './accountTypes';

export class CloudApiClient {
  private static apiBaseUrl = process.env.VOXELPLUS_CLOUD_API_URL || 'http://localhost:3001';

  public static isCloudEnabled(): boolean {
    return true;
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

  public static async fetchLibraryFromCloud(accessToken: string, userId: string): Promise<UserLibraryItem[] | null> {
    const res = await fetch(`${this.apiBaseUrl}/api/library`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!res.ok) {
      return null;
    }

    return (await res.json()) as UserLibraryItem[];
  }

  public static async fetchUserFromCloudByUsername(username: string): Promise<UserProfile | null> {
    const res = await fetch(`${this.apiBaseUrl}/api/public/profiles/${encodeURIComponent(username)}`);
    if (!res.ok) {
      return null;
    }

    return (await res.json()) as UserProfile;
  }

  public static async fetchPublicProfilesFromCloud(query?: string): Promise<PublicUserProfile[] | null> {
    const url = query ? `${this.apiBaseUrl}/api/public/profiles?q=${encodeURIComponent(query)}` : `${this.apiBaseUrl}/api/public/profiles`;
    const res = await fetch(url);
    if (!res.ok) {
      return null;
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
}
