import { dialog, BrowserWindow } from 'electron';
import {
  AppSettings,
  CreateInstancePayload,
  EnvironmentCheckResult,
  InstanceMetadata,
  JavaRuntime,
  LaunchResult,
  LogEntry,
  ModInfo,
  ModrinthProject,
  ModrinthVersion,
  ProcessStatus,
  ResourcePackInfo,
  ShaderPackInfo,
  SystemScanResult,
  SkinMetadata,
  SkinSearchResult,
  SkinValidationResult
} from '../types';
import { ConfigStore } from './storage/configStore';
import { SystemScanner } from './system/systemScanner';
import { JavaDetector } from './java/javaDetector';
import { JavaTester } from './java/javaTester';
import { JavaInstaller } from './java/javaInstaller';
import { EnvironmentChecker } from './system/environmentCheck';
import { InstanceManager } from './instances/instanceManager';
import { ProcessManager } from './processes/processManager';
import { ModManager } from './content/modManager';
import { PackManager } from './content/packManager';
import { ContentImporter } from './content/contentImporter';
import { ModrinthClient } from './modrinth/modrinthClient';
import { DownloadManager } from './modrinth/downloader';
import { LogStreamer } from './processes/logStreamer';
import { SkinManager } from './skins/skinManager';
import { AccountManager } from './account/accountManager';

export class CommandManager {
  // Accounts & Cloud Identity
  public static async createAccount(payload: any) {
    const session = await AccountManager.createAccount(payload);
    return { user: session.user };
  }

  public static async authenticateDevice() {
    const session = await AccountManager.authenticateDevice();
    return { user: session.user };
  }

  public static async logoutAccount() {
    return AccountManager.logout();
  }

  public static async getCurrentSession() {
    const session = await AccountManager.getCurrentSession();
    return session ? { user: session.user } : null;
  }

  public static async getCurrentUser() {
    return AccountManager.getCurrentUser();
  }

  public static async updateProfile(payload: any) {
    return AccountManager.updateProfile(payload);
  }


  public static async deleteAccount() {
    return AccountManager.deleteAccount();
  }

  public static async listPublicProfiles(query?: string) {
    return AccountManager.listPublicProfiles(query);
  }

  public static async getPublicProfile(idOrUsername: string) {
    return AccountManager.getPublicProfile(idOrUsername);
  }

  public static async syncCloudData() {
    return AccountManager.syncCloudData();
  }

  public static async getLibrary() {
    return AccountManager.getLibrary();
  }

  public static async savePackToAccount(pack: any) {
    return AccountManager.savePackToAccount(pack);
  }

  public static async saveSkinToAccount(skin: any) {
    return AccountManager.saveSkinToAccount(skin);
  }

  // Cosmetics
  public static async listCosmeticsCatalog() {
    return AccountManager.listCosmeticsCatalog();
  }

  public static async getUserCosmetics() {
    return AccountManager.getUserCosmetics();
  }

  public static async selectCosmetic(cosmeticId: string | null) {
    return AccountManager.selectCosmetic(cosmeticId);
  }

  // Achievements
  public static async listAchievementsCatalog() {
    return AccountManager.listAchievementsCatalog();
  }

  public static async getUserAchievements() {
    return AccountManager.getUserAchievements();
  }

  // Rewarded ads (provider-verified server-side; unavailable without provider)
  public static async getAdsStatus() {
    return AccountManager.getAdsStatus();
  }

  public static async getAdProgress() {
    return AccountManager.getAdProgress();
  }

  public static async completeAd(itemKind: 'cosmetic' | 'vpack', itemId: string, completionId: string, proof: string) {
    return AccountManager.completeAd(itemKind, itemId, completionId, proof);
  }

  // VPacks
  public static async listVpackCatalog() {
    return AccountManager.listVpackCatalog();
  }

  public static async listVpacks() {
    return AccountManager.listVpacks();
  }

  public static async createVpack(payload: { title: string; description?: string; contents?: any }) {
    return AccountManager.createVpack(payload);
  }

  public static async convertInstanceToVpack(payload: { instanceId: string; title?: string; description?: string }) {
    return AccountManager.convertInstanceToVpack(payload);
  }

  public static async installVpack(vpackId: string) {
    return AccountManager.installVpack(vpackId);
  }

  // Avatar
  public static async uploadAvatar(buffer: ArrayBuffer | Uint8Array, fileName: string, mimeType: string) {
    return AccountManager.uploadAvatar(buffer, fileName, mimeType);
  }

  public static async deleteAvatar() {
    return AccountManager.deleteAvatar();
  }

  // Settings
  public static async getAppSettings(): Promise<AppSettings> {
    return ConfigStore.getSettings();
  }

  public static async setAppSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
    return ConfigStore.saveSettings(settings);
  }

  // System & Environment
  public static async scanSystem(): Promise<SystemScanResult> {
    return SystemScanner.scanSystem();
  }

  public static async runEnvironmentCheck(): Promise<EnvironmentCheckResult> {
    return EnvironmentChecker.runEnvironmentCheck();
  }

  // Java
  public static async scanJava(): Promise<JavaRuntime[]> {
    return JavaDetector.scanSystemJava();
  }

  public static async testJava(executablePath: string): Promise<JavaRuntime | null> {
    return JavaTester.testBinary(executablePath);
  }

  public static async installJava(version: 21 | 17 = 21): Promise<{ success: boolean; runtime?: JavaRuntime; error?: string }> {
    return JavaInstaller.installJava(version);
  }

  // Instances
  public static async listInstances(): Promise<InstanceMetadata[]> {
    return InstanceManager.listInstances();
  }

  public static async getInstance(id: string): Promise<InstanceMetadata | null> {
    return InstanceManager.getInstance(id);
  }

  public static async createInstance(payload: CreateInstancePayload): Promise<InstanceMetadata> {
    const meta = await InstanceManager.createInstance(payload);
    // Record the instance server-side (authoritative lifetime metric).
    // Best-effort: local creation still succeeds when cloud is unreachable,
    // but only server-recorded instances count toward achievements.
    try {
      const cloudId = await AccountManager.recordInstanceCloud({
        name: meta.name || payload.name,
        version: payload.minecraftVersion
      });
      if (cloudId) (meta as any).cloudInstanceId = cloudId;
    } catch (e) {
      console.warn('[Voxel+] Cloud instance record failed:', e);
    }
    return meta;
  }

  public static async updateInstance(id: string, updates: Partial<InstanceMetadata>): Promise<InstanceMetadata | null> {
    return InstanceManager.updateInstance(id, updates);
  }

  public static async setInstanceSkin(instanceId: string, skinId: string | null): Promise<InstanceMetadata | null> {
    return InstanceManager.setInstanceSkin(instanceId, skinId);
  }

  public static async duplicateInstance(id: string): Promise<InstanceMetadata | null> {
    return InstanceManager.duplicateInstance(id);
  }

  public static async deleteInstance(id: string): Promise<boolean> {
    const meta = await InstanceManager.getInstance(id);
    const ok = await InstanceManager.deleteInstance(id);
    const cloudId = (meta as any)?.cloudInstanceId;
    if (ok && cloudId) {
      try { await AccountManager.deleteInstanceCloud(cloudId); } catch {}
    }
    return ok;
  }

  public static async openInstanceFolder(id: string): Promise<boolean> {
    return InstanceManager.openInstanceFolder(id);
  }

  // Process Lifecycle (PLAY / STOP)
  public static async launchInstance(id: string): Promise<LaunchResult> {
    const dir = await InstanceManager.getInstanceDir(id);
    if (!dir) {
      return {
        success: false,
        instanceId: id,
        message: `Could not resolve instance "${id}" to an installation directory. The instance metadata is missing or invalid.`
      };
    }
    return ProcessManager.launchInstance(dir);
  }

  public static async stopInstance(id: string): Promise<boolean> {
    return ProcessManager.stopInstance(id);
  }

  public static async getInstanceStatus(id: string): Promise<ProcessStatus> {
    return ProcessManager.getStatus(id);
  }

  // Content (Mods, Resource Packs, Shaders)
  public static async scanMods(instanceId: string): Promise<ModInfo[]> {
    return ModManager.listMods(instanceId);
  }

  public static async toggleMod(instanceId: string, filename: string, enable: boolean): Promise<boolean> {
    return ModManager.toggleMod(instanceId, filename, enable);
  }

  public static async removeMod(instanceId: string, filename: string): Promise<boolean> {
    return ModManager.removeMod(instanceId, filename);
  }

  public static async scanResourcePacks(instanceId: string): Promise<ResourcePackInfo[]> {
    return PackManager.listResourcePacks(instanceId);
  }

  public static async removeResourcePack(instanceId: string, filename: string): Promise<boolean> {
    return PackManager.removeResourcePack(instanceId, filename);
  }

  public static async scanShaders(instanceId: string): Promise<ShaderPackInfo[]> {
    return PackManager.listShaderPacks(instanceId);
  }

  public static async removeShader(instanceId: string, filename: string): Promise<boolean> {
    return PackManager.removeShaderPack(instanceId, filename);
  }

  public static async importFile(
    instanceId: string,
    sourcePath: string,
    type: 'mod' | 'resourcepack' | 'shader'
  ): Promise<{ success: boolean; filename: string; error?: string }> {
    return ContentImporter.importFile(instanceId, sourcePath, type);
  }

  // Modrinth
  public static async searchModrinth(params: {
    query?: string;
    projectType?: 'mod' | 'resourcepack' | 'shader';
    minecraftVersion?: string;
    loader?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ hits: ModrinthProject[]; total_hits: number }> {
    return ModrinthClient.searchProjects(params);
  }

  public static async getModrinthProject(slugOrId: string): Promise<ModrinthProject | null> {
    return ModrinthClient.getProject(slugOrId);
  }

  public static async getModrinthVersions(
    slugOrId: string,
    loaders?: string[],
    gameVersions?: string[]
  ): Promise<ModrinthVersion[]> {
    return ModrinthClient.getProjectVersions(slugOrId, loaders, gameVersions);
  }

  public static async installModrinthContent(
    instanceId: string,
    fileUrl: string,
    filename: string,
    title: string,
    type: 'mod' | 'resourcepack' | 'shader'
  ): Promise<{ success: boolean; filename: string; error?: string }> {
    return DownloadManager.downloadToInstance(instanceId, fileUrl, filename, title, type);
  }

  // Logs
  public static async getLogs(instanceId?: string, levelFilter?: string, query?: string): Promise<LogEntry[]> {
    return LogStreamer.getLogs(instanceId, levelFilter, query);
  }

  public static async clearLogs(instanceId?: string): Promise<void> {
    LogStreamer.clearLogs(instanceId);
  }

  public static async exportLogs(instanceId?: string): Promise<string> {
    return LogStreamer.exportLogs(instanceId);
  }

  // Import / Export
  public static async exportInstance(instanceId: string, targetZipPath: string): Promise<boolean> {
    return InstanceManager.exportInstance(instanceId, targetZipPath);
  }

  public static async importInstance(zipPath: string, customName?: string): Promise<InstanceMetadata | null> {
    return InstanceManager.importInstance(zipPath, customName);
  }

  // Native Dialogs
  public static async selectFolderDialog(window?: BrowserWindow): Promise<string | null> {
    const result = await dialog.showOpenDialog(window || BrowserWindow.getFocusedWindow()!, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Instance Directory'
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  }

  public static async selectFileDialog(filters?: { name: string; extensions: string[] }[]): Promise<string | null> {
    const result = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow()!, {
      properties: ['openFile'],
      filters: filters || [
        { name: 'Supported Files (*.jar, *.zip)', extensions: ['jar', 'zip', 'voxelplus'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  }

  public static async selectSaveFileDialog(defaultName: string, filters?: { name: string; extensions: string[] }[]): Promise<string | null> {
    const result = await dialog.showSaveDialog(BrowserWindow.getFocusedWindow()!, {
      defaultPath: defaultName,
      filters: filters || [
        { name: 'Voxel⁺ Instance Package (*.voxelplus)', extensions: ['voxelplus', 'zip'] }
      ]
    });
    if (result.canceled || !result.filePath) return null;
    return result.filePath;
  }

  // Skins
  public static async listSkins(): Promise<SkinMetadata[]> {
    return SkinManager.getAllSkins();
  }

  public static async getSkin(skinId: string): Promise<SkinMetadata | null> {
    return SkinManager.getSkin(skinId);
  }

  public static async getActiveSkin(): Promise<SkinMetadata | null> {
    return SkinManager.getActiveSkin();
  }

  public static async importSkin(filePath: string, customName?: string): Promise<{ success: boolean; skin?: SkinMetadata; error?: string }> {
    return SkinManager.importSkin(filePath, customName);
  }

  public static async downloadSkin(username: string, customName?: string): Promise<{ success: boolean; skin?: SkinMetadata; error?: string }> {
    return SkinManager.downloadSkin(username, customName);
  }

  public static async searchPlayer(username: string): Promise<{ success: boolean; result?: SkinSearchResult; error?: string }> {
    return SkinManager.searchPlayer(username);
  }

  public static async setActiveSkin(skinId: string): Promise<{ success: boolean; error?: string }> {
    return SkinManager.setActiveSkin(skinId);
  }

  public static async renameSkin(skinId: string, newName: string): Promise<{ success: boolean; error?: string }> {
    return SkinManager.renameSkin(skinId, newName);
  }

  public static async deleteSkin(skinId: string): Promise<{ success: boolean; error?: string }> {
    return SkinManager.deleteSkin(skinId);
  }

  public static async validateSkin(filePath: string): Promise<SkinValidationResult> {
    return SkinManager.validateSkin(filePath);
  }

  public static async clearSkins(): Promise<void> {
    SkinManager.clearLibrary();
  }
}
