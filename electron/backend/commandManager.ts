import { dialog, BrowserWindow } from 'electron';
import path from 'node:path';
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
  PlayerProfile,
  WalletState,
  WalletTransaction,
  AchievementDefinition,
  AchievementProgress,
  CosmeticDefinition,
  CosmeticEffect,
  CosmeticOwnership,
  VPackValidationResult,
  StockerRunResult,
  StockerSaveData,
  CookieClickerSaveData,
  ArcadeRewardResult
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
import { PlayerDataStore } from './player/playerDataStore';
import { AchievementEngine } from './player/achievementEngine';
import { CosmeticCatalogue } from './player/cosmeticCatalogue';
import { VPackManager } from './vpack/vpackManager';
import { ArcadeStore } from './arcade/arcadeStore';


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

  // Import / Export & VPack
  public static async exportInstance(instanceId: string, targetZipPath: string): Promise<boolean> {
    const success = await InstanceManager.exportInstance(instanceId, targetZipPath);
    if (success) {
      new AchievementEngine().trackProgress('vpack_export', 1);
    }
    return success;
  }

  public static async importInstance(zipPath: string, customName?: string): Promise<InstanceMetadata | null> {
    const meta = await InstanceManager.importInstance(zipPath, customName);
    if (meta) {
      new AchievementEngine().trackProgress('vpack_import', 1);
    }
    return meta;
  }

  public static async validateVPack(zipPath: string): Promise<VPackValidationResult> {
    return VPackManager.validateVPack(zipPath);
  }

  public static async listRepositoryVPacks(): Promise<any[]> {
    return VPackManager.scanVPackRepository();
  }

  public static async purchaseVPack(zipPath: string, price: number): Promise<{ success: boolean; instance?: InstanceMetadata; error?: string }> {
    const store = PlayerDataStore.getInstance();
    if (price > 0) {
      const tx = store.addTransaction('spend', price, `Purchased VPack: ${path.basename(zipPath)}`);
      if (!tx.success) {
        return { success: false, error: tx.error || 'Insufficient Voxel Points' };
      }
    }
    const meta = await InstanceManager.importInstance(zipPath);
    if (!meta) {
      if (price > 0) store.addTransaction('earn', price, 'Refund for failed VPack installation');
      return { success: false, error: 'Failed to extract and initialize VPack.' };
    }
    new AchievementEngine(store).trackProgress('vpack_import', 1);
    return { success: true, instance: meta };
  }

  // Player & Economy
  public static async getPlayerProfile(): Promise<PlayerProfile> {
    return PlayerDataStore.getInstance().getProfile();
  }

  public static async updatePlayerProfile(updates: Partial<PlayerProfile>): Promise<PlayerProfile> {
    return PlayerDataStore.getInstance().updateProfile(updates);
  }

  public static async getWallet(): Promise<WalletState> {
    return PlayerDataStore.getInstance().getWallet();
  }

  public static async getWalletTransactions(): Promise<WalletTransaction[]> {
    return PlayerDataStore.getInstance().getTransactions();
  }

  public static async getAchievements(): Promise<{ definitions: AchievementDefinition[]; progress: AchievementProgress[] }> {
    const engine = new AchievementEngine();
    return {
      definitions: engine.getDefinitions(),
      progress: engine.getProgressList()
    };
  }

  public static async getCosmetics(): Promise<{
    catalogue: CosmeticDefinition[];
    owned: CosmeticOwnership[];
    effects: CosmeticEffect[];
  }> {
    const store = PlayerDataStore.getInstance();
    return {
      catalogue: CosmeticCatalogue.getAll(),
      owned: store.getOwnedCosmetics(),
      effects: CosmeticCatalogue.getEffects()
    };
  }

  public static async purchaseCosmetic(cosmeticId: string): Promise<{ success: boolean; error?: string; wallet?: WalletState }> {
    const def = CosmeticCatalogue.getById(cosmeticId);
    if (!def) return { success: false, error: 'Cosmetic does not exist.' };
    const store = PlayerDataStore.getInstance();
    if (store.isCosmeticOwned(cosmeticId)) {
      return { success: false, error: 'You already own this cosmetic.' };
    }
    if (def.price === null || def.price < 0) {
      return { success: false, error: 'This item cannot be purchased with VP.' };
    }

    const tx = store.addTransaction('spend', def.price, `Purchased: ${def.name}`, def.id);
    if (!tx.success) {
      return { success: false, error: tx.error || 'Failed transaction.' };
    }

    store.grantCosmetic(cosmeticId, 'purchase');
    new AchievementEngine(store).trackProgress('first_purchase', 1);
    new AchievementEngine(store).trackProgress('fashion_icon', store.getOwnedCosmetics().length, true);

    return { success: true, wallet: tx.wallet };
  }

  public static async equipCosmetic(cosmeticId: string | null, effectId: string | null): Promise<PlayerProfile> {
    const store = PlayerDataStore.getInstance();
    if (cosmeticId && !store.isCosmeticOwned(cosmeticId)) {
      throw new Error('Cannot equip cosmetic that is not owned.');
    }
    return store.updateProfile({
      equippedCosmeticId: cosmeticId,
      equippedEffectId: effectId
    });
  }

  // Arcade
  public static async getStockerData(): Promise<StockerSaveData> {
    return ArcadeStore.getInstance().getStockerData();
  }

  public static async recordStockerRun(run: StockerRunResult): Promise<ArcadeRewardResult> {
    return ArcadeStore.getInstance().recordStockerRun(run);
  }

  public static async getCookieData(): Promise<CookieClickerSaveData> {
    return ArcadeStore.getInstance().getCookieData();
  }

  public static async saveCookieData(data: CookieClickerSaveData): Promise<ArcadeRewardResult> {
    return ArcadeStore.getInstance().saveCookieData(data);
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
        { name: 'Supported Files (*.jar, *.zip, *.voxelplus)', extensions: ['jar', 'zip', 'voxelplus'] },
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
}
