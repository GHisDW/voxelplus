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
  SkinValidationResult,
  SkinVersionCompatibility
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
import { CurseForgeClient } from './curseforge/curseforgeClient';
import { CardStore } from './cards/cardStore';
import { CardInstaller } from './cards/cardInstaller';
import { PackStore } from './packs/packStore';
import { VPackManager } from './packs/vpackManager';
import { PackInstaller } from './packs/packInstaller';

export class CommandManager {
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
    return InstanceManager.createInstance(payload);
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
    return InstanceManager.deleteInstance(id);
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

  public static async getSkinCompatibility(minecraftVersion: string): Promise<SkinVersionCompatibility> {
    return SkinManager.getSkinCompatibility(minecraftVersion);
  }

  public static async clearSkins(): Promise<void> {
    SkinManager.clearLibrary();
  }

  // CurseForge
  public static async searchCurseForge(params: {
    query?: string;
    minecraftVersion?: string;
    loader?: string;
    limit?: number;
    offset?: number;
  }) {
    return CurseForgeClient.searchMods(params);
  }

  public static async getCurseForgeFiles(params: {
    modId: string;
    minecraftVersion?: string;
    loader?: string;
  }) {
    return CurseForgeClient.getModFiles(params);
  }

  public static async getCurseForgeProject(modId: string) {
    return CurseForgeClient.getProject(modId);
  }

  public static isCurseForgeConfigured(): boolean {
    return CurseForgeClient.isConfigured();
  }

  // Cards
  public static listCards() {
    return CardStore.listCards();
  }

  public static getCard(cardId: string) {
    return CardStore.getCard(cardId);
  }

  public static saveCard(card: any) {
    return CardStore.saveCard(card);
  }

  public static deleteCard(cardId: string) {
    return CardStore.deleteCard(cardId);
  }

  public static async exportCard(card: any) {
    const p = await this.selectSaveFileDialog(`${card.id}.json`, [{ name: 'JSON', extensions: ['json'] }]);
    if (p) {
      require('node:fs').writeFileSync(p, JSON.stringify(card, null, 2), 'utf-8');
      return true;
    }
    return false;
  }

  public static listInstalledCards() {
    return CardStore.listInstalled();
  }

  public static getCardInstallState(cardId: string) {
    return CardStore.getInstallState(cardId);
  }

  public static async installCard(cardId: string) {
    const card = CardStore.getCard(cardId);
    if (!card) return { success: false, error: 'Card not found' };
    return CardInstaller.install(card);
  }

  public static async uninstallCard(cardId: string) {
    return CardInstaller.uninstall(cardId);
  }

  // Packs
  public static listPacks() {
    return PackStore.listPacks();
  }

  public static getPack(packId: string) {
    return PackStore.getPack(packId);
  }

  public static savePack(pack: any) {
    PackStore.savePack(pack);
    return { success: true };
  }

  public static deletePack(packId: string) {
    PackStore.deletePack(packId);
    return { success: true };
  }

  public static async exportPack(packId: string) {
    const p = await this.selectSaveFileDialog(`${packId}.vpack`, [{ name: 'VPack', extensions: ['vpack'] }]);
    if (p) {
      return VPackManager.exportPack(packId, p);
    }
    return false;
  }

  public static async importPack() {
    const p = await this.selectFileDialog([{ name: 'VPack', extensions: ['vpack'] }]);
    if (p) {
      return VPackManager.importPack(p);
    }
    return null;
  }

  public static async createPackFromInstance(instanceId: string, packDetails: any) {
    return VPackManager.createPackFromInstance(instanceId, packDetails);
  }

  public static async installPack(packId: string) {
    const pack = PackStore.getPack(packId);
    if (!pack) return { success: false, error: 'Pack not found' };
    return PackInstaller.installPack(pack);
  }

  public static async installPackToInstance(packId: string, instanceId: string) {
    const pack = PackStore.getPack(packId);
    if (!pack) return { success: false, error: 'Pack not found' };
    return PackInstaller.installPackToInstance(pack, instanceId);
  }
}
