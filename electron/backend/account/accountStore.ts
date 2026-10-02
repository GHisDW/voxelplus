import fs from 'node:fs';
import path from 'node:path';
import { PathManager } from '../storage/paths';
import {
  AccountSession,
  CloudSyncPayload,
  UserLibraryItem,
  UserPackItem,
  UserSkinItem,
  VoxelUser
} from './accountTypes';

interface AccountStoreData {
  users: VoxelUser[];
  activeSession: AccountSession | null;
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
        users: [],
        activeSession: null,
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
        users: Array.isArray(parsed.users) ? parsed.users : [],
        activeSession: parsed.activeSession || null,
        libraries: parsed.libraries || {},
        packs: parsed.packs || {},
        skins: parsed.skins || {},
        syncData: parsed.syncData || {}
      };
      this.cachedData = data;
      return data;
    } catch {
      const fallback: AccountStoreData = {
        users: [],
        activeSession: null,
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

  public static getUsers(): VoxelUser[] {
    return this.loadData().users;
  }

  public static getUserById(id: string): VoxelUser | null {
    const users = this.getUsers();
    return users.find((u) => u.id === id) || null;
  }

  public static getUserByUsername(username: string): VoxelUser | null {
    const users = this.getUsers();
    const target = username.trim().toLowerCase();
    return users.find((u) => u.username.toLowerCase() === target) || null;
  }

  public static saveUser(user: VoxelUser): void {
    const data = this.loadData();
    const index = data.users.findIndex((u) => u.id === user.id);
    if (index >= 0) {
      data.users[index] = user;
    } else {
      data.users.push(user);
    }
    this.saveData(data);
  }

  public static deleteUser(id: string): void {
    const data = this.loadData();
    data.users = data.users.filter((u) => u.id !== id);
    if (data.activeSession && data.activeSession.user.id === id) {
      data.activeSession = null;
    }
    delete data.libraries[id];
    delete data.packs[id];
    delete data.skins[id];
    delete data.syncData[id];
    this.saveData(data);
  }

  public static getActiveSession(): AccountSession | null {
    const data = this.loadData();
    if (!data.activeSession) return null;

    if (new Date(data.activeSession.expiresAt).getTime() < Date.now()) {
      data.activeSession = null;
      this.saveData(data);
      return null;
    }
    return data.activeSession;
  }

  public static setActiveSession(session: AccountSession | null): void {
    const data = this.loadData();
    data.activeSession = session;
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
