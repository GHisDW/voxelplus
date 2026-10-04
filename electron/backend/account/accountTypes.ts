export interface UserProfile {
  id: string;
  username: string;
  avatar: string;
  bio: string;
  createdAt: string;
  updatedAt: string;
  isPublic: boolean;
  syncEnabled: boolean;
  title?: string | null;
  badges?: string[];
  cosmetics?: string[];
  selectedCosmetic?: string | null;
  achievements?: string[];
  isCreator?: boolean;
  isOwner?: boolean;
}

export interface PublicUserProfile {
  id: string;
  username: string;
  avatar: string;
  bio: string;
  createdAt: string;
  publicPacksCount: number;
  publicSkinsCount: number;
  isCreator: boolean;
}

export interface AccountSession {
  accessToken: string;
  refreshToken: string;
  user: UserProfile;
  expiresAt?: number;
  tokenType?: string;
}

export interface UserLibraryItem {
  id: string;
  title: string;
  type: 'pack' | 'skin' | 'mod' | 'card' | 'other';
  source: string;
  addedAt: string;
  metadata?: Record<string, any>;
}

export interface UserPackItem {
  id: string;
  name: string;
  version: string;
  description: string;
  icon?: string;
  isPublic: boolean;
  createdAt: string;
  authorUsername: string;
}

export interface UserSkinItem {
  id: string;
  name: string;
  skinUrl: string;
  model: 'steve' | 'alex';
  isPublic: boolean;
  createdAt: string;
  authorUsername: string;
}

export interface CloudSyncPayload {
  lastSyncedAt: string;
  status?: 'Synced' | 'Sync Failed' | 'Offline' | 'Unauthenticated';
  settings?: Record<string, any>;
  instances?: Array<{
    id: string;
    name: string;
    minecraftVersion: string;
    loaderType: string;
    loaderVersion: string;
    lastPlayedAt: string | null;
  }>;
  library?: UserLibraryItem[];
  packs?: UserPackItem[];
  skins?: UserSkinItem[];
}

export interface CreateAccountPayload {
  username: string;
  password: string;
  avatar?: string;
  bio?: string;
  isPublic?: boolean;
}

export interface UpdateProfilePayload {
  username?: string;
  avatar?: string;
  bio?: string;
  isPublic?: boolean;
  syncEnabled?: boolean;
}

export interface ChangePasswordPayload {
  oldPassword?: string;
  newPassword: string;
}
