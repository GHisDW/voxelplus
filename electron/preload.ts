import { contextBridge, ipcRenderer } from 'electron';
import {
  AppSettings,
  CreateInstancePayload,
  DownloadProgressEvent,
  EnvironmentCheckResult,
  InstanceMetadata,
  JavaRuntime,
  LaunchResult,
  LogEntry,
  ModInfo,
  ModrinthProject,
  ModrinthVersion,
  ProcessStatus,
  ProcessStatusEvent,
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
} from './types';

const api = {
  // Settings
  getAppSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  setAppSettings: (settings: Partial<AppSettings>): Promise<AppSettings> => ipcRenderer.invoke('settings:set', settings),
  resetEverything: (): Promise<boolean> => ipcRenderer.invoke('system:resetAllData'),

  // System & Environment
  scanSystem: (): Promise<SystemScanResult> => ipcRenderer.invoke('system:scan'),
  runEnvironmentCheck: (): Promise<EnvironmentCheckResult> => ipcRenderer.invoke('system:checkEnv'),

  // Java
  scanJava: (): Promise<JavaRuntime[]> => ipcRenderer.invoke('java:scan'),
  testJava: (path: string): Promise<JavaRuntime | null> => ipcRenderer.invoke('java:test', path),
  installJava: (version: 21 | 17): Promise<{ success: boolean; runtime?: JavaRuntime; error?: string }> => ipcRenderer.invoke('java:install', version),

  // Instances
  listInstances: (): Promise<InstanceMetadata[]> => ipcRenderer.invoke('instance:list'),
  getInstance: (id: string): Promise<InstanceMetadata | null> => ipcRenderer.invoke('instance:get', id),
  createInstance: (payload: CreateInstancePayload): Promise<InstanceMetadata> => ipcRenderer.invoke('instance:create', payload),
  updateInstance: (id: string, updates: Partial<InstanceMetadata>): Promise<InstanceMetadata | null> => ipcRenderer.invoke('instance:update', id, updates),
  duplicateInstance: (id: string): Promise<InstanceMetadata | null> => ipcRenderer.invoke('instance:duplicate', id),
  deleteInstance: (id: string): Promise<boolean> => ipcRenderer.invoke('instance:delete', id),
  openInstanceFolder: (id: string): Promise<boolean> => ipcRenderer.invoke('instance:openFolder', id),


  // Process Controls (PLAY / STOP)
  launchInstance: (id: string): Promise<LaunchResult> => ipcRenderer.invoke('process:launch', id),
  stopInstance: (id: string): Promise<boolean> => ipcRenderer.invoke('process:stop', id),
  getInstanceStatus: (id: string): Promise<ProcessStatus> => ipcRenderer.invoke('process:status', id),

  // Content (Mods, Resource Packs, Shaders)
  scanMods: (instanceId: string): Promise<ModInfo[]> => ipcRenderer.invoke('content:scanMods', instanceId),
  toggleMod: (instanceId: string, filename: string, enable: boolean): Promise<boolean> => ipcRenderer.invoke('content:toggleMod', instanceId, filename, enable),
  removeMod: (instanceId: string, filename: string): Promise<boolean> => ipcRenderer.invoke('content:removeMod', instanceId, filename),
  scanResourcePacks: (instanceId: string): Promise<ResourcePackInfo[]> => ipcRenderer.invoke('content:scanResourcePacks', instanceId),
  removeResourcePack: (instanceId: string, filename: string): Promise<boolean> => ipcRenderer.invoke('content:removeResourcePack', instanceId, filename),
  scanShaders: (instanceId: string): Promise<ShaderPackInfo[]> => ipcRenderer.invoke('content:scanShaders', instanceId),
  removeShader: (instanceId: string, filename: string): Promise<boolean> => ipcRenderer.invoke('content:removeShader', instanceId, filename),
  importFile: (instanceId: string, filePath: string, type: 'mod' | 'resourcepack' | 'shader'): Promise<{ success: boolean; filename: string; error?: string }> => ipcRenderer.invoke('content:importFile', instanceId, filePath, type),

  // Modrinth
  searchModrinth: (params: any): Promise<{ hits: ModrinthProject[]; total_hits: number }> => ipcRenderer.invoke('modrinth:search', params),
  getModrinthProject: (slugOrId: string): Promise<ModrinthProject | null> => ipcRenderer.invoke('modrinth:getProject', slugOrId),
  getModrinthVersions: (slugOrId: string, loaders?: string[], gameVersions?: string[]): Promise<ModrinthVersion[]> => ipcRenderer.invoke('modrinth:getVersions', slugOrId, loaders, gameVersions),
  installModrinthContent: (instanceId: string, fileUrl: string, filename: string, title: string, type: 'mod' | 'resourcepack' | 'shader'): Promise<{ success: boolean; filename: string; error?: string }> => ipcRenderer.invoke('modrinth:install', instanceId, fileUrl, filename, title, type),

  // Logs
  getLogs: (instanceId?: string, levelFilter?: string, query?: string): Promise<LogEntry[]> => ipcRenderer.invoke('logs:get', instanceId, levelFilter, query),
  clearLogs: (instanceId?: string): Promise<void> => ipcRenderer.invoke('logs:clear', instanceId),
  exportLogs: (instanceId?: string): Promise<string> => ipcRenderer.invoke('logs:export', instanceId),

  // Import / Export & VPack
  exportInstance: (instanceId: string, targetZipPath: string): Promise<boolean> => ipcRenderer.invoke('instance:export', instanceId, targetZipPath),
  importInstance: (zipPath: string, customName?: string): Promise<InstanceMetadata | null> => ipcRenderer.invoke('instance:import', zipPath, customName),
  validateVPack: (zipPath: string): Promise<VPackValidationResult> => ipcRenderer.invoke('vpack:validate', zipPath),
  convertModpack: (inPath: string, outPath: string): Promise<any> => ipcRenderer.invoke('vpack:convert', inPath, outPath),
  runPreflight: (mcVer: string, loader: string, mem?: number, dir?: string, javaId?: string): Promise<any> => ipcRenderer.invoke('system:preflight', mcVer, loader, mem, dir, javaId),
  listRepositoryVPacks: (): Promise<any[]> => ipcRenderer.invoke('vpack:listRepository'),
  purchaseVPack: (zipPath: string): Promise<{ success: boolean; instance?: InstanceMetadata; error?: string }> => ipcRenderer.invoke('vpack:purchase', zipPath),

  // Player & Economy
  getPlayerProfile: (): Promise<PlayerProfile> => ipcRenderer.invoke('player:getProfile'),
  updatePlayerProfile: (updates: Partial<PlayerProfile>): Promise<PlayerProfile> => ipcRenderer.invoke('player:updateProfile', updates),
  getWallet: (): Promise<WalletState> => ipcRenderer.invoke('player:getWallet'),
  getWalletTransactions: (): Promise<WalletTransaction[]> => ipcRenderer.invoke('player:getTransactions'),
  getAchievements: (): Promise<{ definitions: AchievementDefinition[]; progress: AchievementProgress[] }> => ipcRenderer.invoke('player:getAchievements'),
  getCosmetics: (): Promise<{ catalogue: CosmeticDefinition[]; owned: CosmeticOwnership[]; effects: CosmeticEffect[] }> => ipcRenderer.invoke('player:getCosmetics'),
  purchaseCosmetic: (cosmeticId: string): Promise<{ success: boolean; error?: string; wallet?: WalletState }> => ipcRenderer.invoke('player:purchaseCosmetic', cosmeticId),
  equipCosmetic: (cosmeticId: string | null, effectId: string | null): Promise<PlayerProfile> => ipcRenderer.invoke('player:equipCosmetic', cosmeticId, effectId),

  // Arcade
  getStockerData: (): Promise<StockerSaveData> => ipcRenderer.invoke('arcade:getStockerData'),
  recordStockerRun: (run: StockerRunResult): Promise<ArcadeRewardResult> => ipcRenderer.invoke('arcade:recordStockerRun', run),
  getCookieData: (): Promise<CookieClickerSaveData> => ipcRenderer.invoke('arcade:getCookieData'),
  saveCookieData: (data: CookieClickerSaveData): Promise<ArcadeRewardResult> => ipcRenderer.invoke('arcade:saveCookieData', data),

  // Native Dialogs
  selectFolderDialog: (): Promise<string | null> => ipcRenderer.invoke('dialog:selectFolder'),
  selectFileDialog: (filters?: any): Promise<string | null> => ipcRenderer.invoke('dialog:selectFile', filters),
  selectSaveFileDialog: (defaultName: string, filters?: any): Promise<string | null> => ipcRenderer.invoke('dialog:selectSaveFile', defaultName, filters),


  // Real-time Event Subscriptions
  onLog: (callback: (entry: LogEntry) => void) => {
    const handler = (_: any, entry: LogEntry) => callback(entry);
    ipcRenderer.on('event:log', handler);
    return () => ipcRenderer.removeListener('event:log', handler);
  },
  onProcessStatus: (callback: (event: ProcessStatusEvent) => void) => {
    const handler = (_: any, event: ProcessStatusEvent) => callback(event);
    ipcRenderer.on('event:processStatus', handler);
    return () => ipcRenderer.removeListener('event:processStatus', handler);
  },
  onDownloadProgress: (callback: (event: DownloadProgressEvent) => void) => {
    const handler = (_: any, event: DownloadProgressEvent) => callback(event);
    ipcRenderer.on('event:downloadProgress', handler);
    return () => ipcRenderer.removeListener('event:downloadProgress', handler);
  },
  onAchievementUnlocked: (callback: (data: { achievementName: string; rewardVP: number; isWinCondition: boolean }) => void) => {
    const handler = (_: any, data: { achievementName: string; rewardVP: number; isWinCondition: boolean }) => callback(data);
    ipcRenderer.on('event:achievementUnlocked', handler);
    return () => ipcRenderer.removeListener('event:achievementUnlocked', handler);
  }
};

contextBridge.exposeInMainWorld('voxelApi', api);
