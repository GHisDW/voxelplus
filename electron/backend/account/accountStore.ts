import fs from 'node:fs';
import path from 'node:path';
import { safeStorage } from 'electron';
import { PathManager } from '../storage/paths';
import {
  AccountSession,
  CloudSyncPayload,
  UserLibraryItem,
  UserPackItem,
  UserSkinItem,
  UserProfile
} from './accountTypes';

interface AccountStoreData {
  cachedProfile: UserProfile | null;
  encryptedSessionTokens: string | null;
  rawSessionFallback: { accessToken: string; refreshToken: string } | null;
  libraries: Record<string, UserLibraryItem[]>;
  packs: Record<string, UserPackItem[]>;
  skins: Record<string, UserSkinItem[]>;
  syncData: Record<string, CloudSyncPayload>;
}

export class AccountStore {
  private static cachedData: AccountStoreData | null = null;

  public static getAccountDir(): string {
    const dir = path.join(PathManager.getBaseDir(), 'account');
    return PathManager.ensureDirectory(dir);
  }

  public static getAccountFile(): string {
    return path.join(this.getAccountDir(), 'account-store.json');
  }

  private static loadData(): AccountStoreData {
    if (this.cachedData) {
      return this.cachedData;
    }

    const filePath = this.getAccountFile();
    if (!fs.existsSync(filePath)) {
      const initial: AccountStoreData = {
        cachedProfile: null,
        encryptedSessionTokens: null,
        rawSessionFallback: null,
        libraries: {},
        packs: {},
        skins: {},
        syncData: {}
      };
      this.saveData(initial);
      this.cachedData = initial;
      return initial;
    }

    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      const data: AccountStoreData = {
        cachedProfile: parsed.cachedProfile || null,
        encryptedSessionTokens: parsed.encryptedSessionTokens || null,
        rawSessionFallback: parsed.rawSessionFallback || null,
        libraries: parsed.libraries || {},
        packs: parsed.packs || {},
        skins: parsed.skins || {},
        syncData: parsed.syncData || {}
      };
      this.cachedData = data;
      return data;
    } catch {
      const fallback: AccountStoreData = {
        cachedProfile: null,
        encryptedSessionTokens: null,
        rawSessionFallback: null,
        libraries: {},
        packs: {},
        skins: {},
        syncData: {}
      };
      this.saveData(fallback);
      this.cachedData = fallback;
      return fallback;
    }
  }

  private static saveData(data: AccountStoreData): void {
    const filePath = this.getAccountFile();
    this.getAccountDir();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    this.cachedData = data;
  }

  public static getCachedProfile(): UserProfile | null {
    return this.loadData().cachedProfile;
  }

  public static saveCachedProfile(profile: UserProfile | null): void {
    const data = this.loadData();
    data.cachedProfile = profile;
    this.saveData(data);
  }

  public static getActiveSession(): AccountSession | null {
    const data = this.loadData();
    if (!data.cachedProfile) return null;

    let accessToken = '';
    let refreshToken = '';

    if (data.encryptedSessionTokens && safeStorage && safeStorage.isEncryptionAvailable()) {
      try {
        const decrypted = safeStorage.decryptString(Buffer.from(data.encryptedSessionTokens, 'base64'));
        const tokens = JSON.parse(decrypted);
        accessToken = tokens.accessToken || '';
        refreshToken = tokens.refreshToken || '';
      } catch (e) {
        console.warn('[AccountStore] Failed to decrypt session tokens via safeStorage:', e);
      }
    }

    if (!accessToken && data.rawSessionFallback) {
      accessToken = data.rawSessionFallback.accessToken || '';
      refreshToken = data.rawSessionFallback.refreshToken || '';
    }

    if (!accessToken) return null;

    return {
      accessToken,
      refreshToken,
      user: data.cachedProfile
    };
  }

  public static setActiveSession(session: AccountSession | null): void {
    const data = this.loadData();
    if (!session) {
      data.cachedProfile = null;
      data.encryptedSessionTokens = null;
      data.rawSessionFallback = null;
      this.saveData(data);
      return;
    }

    data.cachedProfile = session.user;
    const tokenObj = { accessToken: session.accessToken, refreshToken: session.refreshToken };
    const serialized = JSON.stringify(tokenObj);

    if (safeStorage && safeStorage.isEncryptionAvailable()) {
      try {
        const encryptedBuf = safeStorage.encryptString(serialized);
        data.encryptedSessionTokens = encryptedBuf.toString('base64');
        data.rawSessionFallback = null;
      } catch (e) {
        console.warn('[AccountStore] safeStorage encryption error, saving unencrypted fallback:', e);
        data.encryptedSessionTokens = null;
        data.rawSessionFallback = tokenObj;
      }
    } else {
      data.encryptedSessionTokens = null;
      data.rawSessionFallback = tokenObj;
    }

    this.saveData(data);
  }

  public static clearUserData(userId: string): void {
    const data = this.loadData();
    if (data.cachedProfile && data.cachedProfile.id === userId) {
      data.cachedProfile = null;
      data.encryptedSessionTokens = null;
      data.rawSessionFallback = null;
    }
    delete data.libraries[userId];
    delete data.packs[userId];
    delete data.skins[userId];
    delete data.syncData[userId];
    this.saveData(data);
  }

  public static getLibrary(userId: string): UserLibraryItem[] {
    const data = this.loadData();
    return data.libraries[userId] || [];
  }

  public static saveLibraryItem(userId: string, item: UserLibraryItem): UserLibraryItem[] {
    const data = this.loadData();
    const current = data.libraries[userId] || [];
    const idx = current.findIndex((i) => i.id === item.id);
    if (idx >= 0) {
      current[idx] = item;
    } else {
      current.push(item);
    }
    data.libraries[userId] = current;
    this.saveData(data);
    return current;
  }

  public static getPacks(userId: string): UserPackItem[] {
    const data = this.loadData();
    return data.packs[userId] || [];
  }

  public static savePack(userId: string, pack: UserPackItem): UserPackItem[] {
    const data = this.loadData();
    const current = data.packs[userId] || [];
    const idx = current.findIndex((p) => p.id === pack.id);
    if (idx >= 0) {
      current[idx] = pack;
    } else {
      current.push(pack);
    }
    data.packs[userId] = current;
    this.saveData(data);
    return current;
  }

  public static getSkins(userId: string): UserSkinItem[] {
    const data = this.loadData();
    return data.skins[userId] || [];
  }

  public static saveSkin(userId: string, skin: UserSkinItem): UserSkinItem[] {
    const data = this.loadData();
    const current = data.skins[userId] || [];
    const idx = current.findIndex((s) => s.id === skin.id);
    if (idx >= 0) {
      current[idx] = skin;
    } else {
      current.push(skin);
    }
    data.skins[userId] = current;
    this.saveData(data);
    return current;
  }

  public static getSyncData(userId: string): CloudSyncPayload | null {
    const data = this.loadData();
    return data.syncData[userId] || null;
  }

  public static saveSyncData(userId: string, payload: CloudSyncPayload): CloudSyncPayload {
    const data = this.loadData();
    data.syncData[userId] = payload;
    this.saveData(data);
    return payload;
  }
}
