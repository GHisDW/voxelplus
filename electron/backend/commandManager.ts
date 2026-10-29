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
import { PathManager } from './storage/paths';
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
import { VPackConverter } from './vpack/vpackConverter';
import { ModrinthPackImporter } from './vpack/modrinthPackImporter';
import { CurseForgePackImporter } from './vpack/curseForgePackImporter';
import { PreflightChecker } from './instances/preflightChecker';
import { ArcadeStore } from './arcade/arcadeStore';


export class CommandManager {
  // Settings
  public static async getAppSettings(): Promise<AppSettings> {
    return ConfigStore.getSettings();
  }

  public static async setAppSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
    return ConfigStore.saveSettings(settings);
  }

  public static async resetEverything(): Promise<boolean> {
    // Validate that we're only deleting within the allowed user data directory
    const allowedBase = PathManager.getBaseDir();
    const normalizedBase = path.resolve(allowedBase);
    
    // 1. Delete all user instances with path validation
    const instances = await InstanceManager.listInstances();
    for (const inst of instances) {
      if (inst.instancePath) {
        const normalizedPath = path.resolve(inst.instancePath);
        // Ensure instance path is within allowed base directory
        if (!normalizedPath.startsWith(normalizedBase + path.sep)) {
          console.error(`Factory reset blocked: instance path outside allowed directory: ${inst.instancePath}`);
          continue;
        }
      }
      await InstanceManager.deleteInstance(inst.id);
    }

    // 2. Reset stores (these use the validated PathManager paths)
    ConfigStore.resetToDefaults();
    PlayerDataStore.getInstance().resetToDefaults();
    ArcadeStore.getInstance().resetToDefaults();

    return true;
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
    const result = await DownloadManager.downloadToInstance(instanceId, fileUrl, filename, title, type);

    if (result.success) {
      const engine = new AchievementEngine();

      if (type === 'mod') {
        engine.trackProgress('first_mod', 1);

        // Count total mods across all instances
        const instances = await InstanceManager.listInstances();
        let totalMods = 0;
        for (const inst of instances) {
          const instDir = await InstanceManager.getInstanceDir(inst.id);
          if (instDir) {
            const modsDir = require('node:path').join(instDir, 'mods');
            const fs = require('node:fs');
            if (fs.existsSync(modsDir)) {
              totalMods += fs.readdirSync(modsDir).filter(f => f.endsWith('.jar')).length;
            }
          }
        }
        engine.trackProgress('mod_overload', totalMods, true);
        engine.trackProgress('mod_master', totalMods, true);
      } else if (type === 'resourcepack') {
        engine.trackProgress('resource_packer', 1);
      } else if (type === 'shader') {
        engine.trackProgress('shader_enthusiast', 1);

        // Count total shader packs
        const instances = await InstanceManager.listInstances();
        let totalShaders = 0;
        for (const inst of instances) {
          const instDir = await InstanceManager.getInstanceDir(inst.id);
          if (instDir) {
            const shaderDir = require('node:path').join(instDir, 'shaderpacks');
            const fs = require('node:fs');
            if (fs.existsSync(shaderDir)) {
              totalShaders += fs.readdirSync(shaderDir).length;
            }
          }
        }
        engine.trackProgress('shader_master', totalShaders, true);
      }

      engine.checkWinCondition();
    }

    return result;
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
      const engine = new AchievementEngine();
      engine.trackProgress('vpack_export', 1);
      engine.checkWinCondition();
    }
    return success;
  }

  public static async importInstance(zipPath: string, customName?: string): Promise<InstanceMetadata | null> {
    const meta = await InstanceManager.importInstance(zipPath, customName);
    if (meta) {
      const engine = new AchievementEngine();
      engine.trackProgress('vpack_import', 1);
      engine.checkWinCondition();
    }
    return meta;
  }

  public static async validateVPack(zipPath: string): Promise<VPackValidationResult> {
    return VPackManager.validateVPack(zipPath);
  }

  public static async convertModpackToVPack(inputPath: string, outputPath: string): Promise<any> {
    try {
      // First check if it's a Modrinth pack
      const mrpackVal = ModrinthPackImporter.validateMrpack(inputPath);
      if (mrpackVal.valid) {
        return VPackConverter.convertMrpackToVPack(inputPath, outputPath);
      }
      // Otherwise try CurseForge
      return VPackConverter.convertCurseForgeToVPack(inputPath, outputPath);
    } catch (error: any) {
      return {
        success: false,
        physicalFilesCount: 0,
        remoteFilesCount: 0,
        unresolvedCount: 0,
        error: error?.message || 'Unknown conversion error'
      };
    }
  }

  public static async runPreflight(
    minecraftVersion: string,
    loaderType: any,
    allocatedMemoryMb: number = 4096,
    instanceDir?: string,
    preferredJavaId?: string
  ): Promise<any> {
    return PreflightChecker.runPreflight(minecraftVersion, loaderType, allocatedMemoryMb, instanceDir, preferredJavaId);
  }

  public static async listRepositoryVPacks(): Promise<any[]> {
    return VPackManager.scanVPackRepository();
  }

  public static async purchaseVPack(zipPath: string): Promise<{ success: boolean; instance?: InstanceMetadata; error?: string }> {
    const store = PlayerDataStore.getInstance();
    const val = VPackManager.validateVPack(zipPath);
    
    if (!val.valid || !val.manifest) {
      return { success: false, error: 'Invalid VPack file.' };
    }
    
    const packId = val.manifest.packId || path.basename(zipPath, path.extname(zipPath));
    
    // Backend determines authoritative price from manifest, never trust renderer
    const authoritativePrice = val.manifest.price ?? 200;
    
    // Validate price is non-negative and reasonable
    if (authoritativePrice < 0 || !Number.isFinite(authoritativePrice) || !Number.isInteger(authoritativePrice)) {
      return { success: false, error: 'Invalid pack price in manifest.' };
    }

    if (store.isVPackOwned(packId)) {
      const meta = await InstanceManager.importInstance(zipPath);
      if (!meta) return { success: false, error: 'Failed to extract VPack.' };
      return { success: true, instance: meta };
    }

    if (authoritativePrice > 0) {
      const tx = store.addTransaction('spend', authoritativePrice, `Purchased VPack: ${val.manifest.name || path.basename(zipPath)}`);
      if (!tx.success) {
        return { success: false, error: tx.error || 'Insufficient Voxel Points (VP).' };
      }
    }

    const meta = await InstanceManager.importInstance(zipPath);
    if (!meta) {
      if (authoritativePrice > 0) {
        store.addTransaction('earn', authoritativePrice, 'Refund for failed VPack installation');
      }
      return { success: false, error: 'Failed to extract and initialize VPack.' };
    }

    store.recordVPackPurchase(packId, authoritativePrice);
    const engine = new AchievementEngine(store);
    engine.trackProgress('vpack_import', 1);
    engine.checkWinCondition();
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
    const engine = new AchievementEngine(store);
    engine.trackProgress('first_purchase', 1);
    engine.trackProgress('fashion_icon', store.getOwnedCosmetics().length, true);
    engine.trackProgress('collector_elite', store.getOwnedCosmetics().length, true);
    engine.checkWinCondition();

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
