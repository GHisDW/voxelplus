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
  SystemScanResult
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
      return { success: false, instanceId: id, message: 'Instance folder not found' };
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
}
