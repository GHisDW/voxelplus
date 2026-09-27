import { contextBridge, ipcRenderer } from 'electron';
import {
  AppSettings,
  CardInstallState,
  ContentProject,
  ContentVersion,
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
  SkinMetadata,
  SkinSearchResult,
  SkinValidationResult,
  SkinVersionCompatibility,
  SystemScanResult,
  VoxelCard,
  MyPack
} from './types';

const api = {
  // Settings
  getAppSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  setAppSettings: (settings: Partial<AppSettings>): Promise<AppSettings> => ipcRenderer.invoke('settings:set', settings),

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
  setInstanceSkin: (id: string, skinId: string | null): Promise<InstanceMetadata | null> => ipcRenderer.invoke('instance:setSkin', id, skinId),

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

  // CurseForge
  searchCurseForge: (params: { query?: string; minecraftVersion?: string; loader?: string; limit?: number; offset?: number }): Promise<{ success: boolean; unconfigured?: boolean; data?: { projects: ContentProject[]; total: number }; error?: string }> => ipcRenderer.invoke('curseforge:search', params),
  getCurseForgeFiles: (params: { modId: string; minecraftVersion?: string; loader?: string }): Promise<{ success: boolean; unconfigured?: boolean; data?: ContentVersion[]; error?: string }> => ipcRenderer.invoke('curseforge:getFiles', params),
  getCurseForgeProject: (modId: string): Promise<{ success: boolean; unconfigured?: boolean; data?: ContentProject; error?: string }> => ipcRenderer.invoke('curseforge:getProject', modId),
  isCurseForgeConfigured: (): Promise<boolean> => ipcRenderer.invoke('curseforge:isConfigured'),

  // Cards
  listCards: (): Promise<VoxelCard[]> => ipcRenderer.invoke('cards:list'),
  getCard: (cardId: string): Promise<VoxelCard | null> => ipcRenderer.invoke('cards:get', cardId),
  saveCard: (card: VoxelCard): Promise<{ success: boolean }> => ipcRenderer.invoke('cards:save', card),
  deleteCard: (cardId: string): Promise<{ success: boolean }> => ipcRenderer.invoke('cards:delete', cardId),
  exportCard: (card: VoxelCard): Promise<boolean> => ipcRenderer.invoke('cards:export', card),
  listInstalledCards: (): Promise<CardInstallState[]> => ipcRenderer.invoke('cards:listInstalled'),
  getCardInstallState: (cardId: string): Promise<CardInstallState | null> => ipcRenderer.invoke('cards:getInstallState', cardId),
  installCard: (cardId: string): Promise<{ success: boolean; state?: CardInstallState; error?: string }> => ipcRenderer.invoke('cards:install', cardId),
  uninstallCard: (cardId: string): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('cards:uninstall', cardId),

  // Packs
  listPacks: (): Promise<MyPack[]> => ipcRenderer.invoke('packs:list'),
  getPack: (packId: string): Promise<MyPack | null> => ipcRenderer.invoke('packs:get', packId),
  savePack: (pack: MyPack): Promise<{ success: boolean }> => ipcRenderer.invoke('packs:save', pack),
  deletePack: (packId: string): Promise<{ success: boolean }> => ipcRenderer.invoke('packs:delete', packId),
  exportPack: (packId: string): Promise<boolean> => ipcRenderer.invoke('packs:export', packId),
  importPack: (): Promise<MyPack | null> => ipcRenderer.invoke('packs:import'),
  createPackFromInstance: (instanceId: string, packDetails: Partial<MyPack>): Promise<MyPack | null> => ipcRenderer.invoke('packs:createFromInstance', instanceId, packDetails),
  installPack: (packId: string): Promise<{ success: boolean; instanceId?: string; error?: string }> => ipcRenderer.invoke('packs:install', packId),
  installPackToInstance: (packId: string, instanceId: string): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('packs:installToInstance', packId, instanceId),

  // Logs
  getLogs: (instanceId?: string, levelFilter?: string, query?: string): Promise<LogEntry[]> => ipcRenderer.invoke('logs:get', instanceId, levelFilter, query),
  clearLogs: (instanceId?: string): Promise<void> => ipcRenderer.invoke('logs:clear', instanceId),
  exportLogs: (instanceId?: string): Promise<string> => ipcRenderer.invoke('logs:export', instanceId),

  // Import / Export
  exportInstance: (instanceId: string, targetZipPath: string): Promise<boolean> => ipcRenderer.invoke('instance:export', instanceId, targetZipPath),
  importInstance: (zipPath: string, customName?: string): Promise<InstanceMetadata | null> => ipcRenderer.invoke('instance:import', zipPath, customName),

  // Native Dialogs
  selectFolderDialog: (): Promise<string | null> => ipcRenderer.invoke('dialog:selectFolder'),
  selectFileDialog: (filters?: any): Promise<string | null> => ipcRenderer.invoke('dialog:selectFile', filters),
  selectSaveFileDialog: (defaultName: string, filters?: any): Promise<string | null> => ipcRenderer.invoke('dialog:selectSaveFile', defaultName, filters),

  // Skins
  listSkins: (): Promise<SkinMetadata[]> => ipcRenderer.invoke('skins:list'),
  getSkin: (skinId: string): Promise<SkinMetadata | null> => ipcRenderer.invoke('skins:get', skinId),
  getActiveSkin: (): Promise<SkinMetadata | null> => ipcRenderer.invoke('skins:getActive'),
  importSkin: (filePath: string, customName?: string): Promise<{ success: boolean; skin?: SkinMetadata; error?: string }> => ipcRenderer.invoke('skins:import', filePath, customName),
  downloadSkin: (username: string, customName?: string): Promise<{ success: boolean; skin?: SkinMetadata; error?: string }> => ipcRenderer.invoke('skins:download', username, customName),
  searchPlayer: (username: string): Promise<{ success: boolean; result?: SkinSearchResult; error?: string }> => ipcRenderer.invoke('skins:search', username),
  setActiveSkin: (skinId: string): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('skins:setActive', skinId),
  renameSkin: (skinId: string, newName: string): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('skins:rename', skinId, newName),
  deleteSkin: (skinId: string): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('skins:delete', skinId),
  validateSkin: (filePath: string): Promise<SkinValidationResult> => ipcRenderer.invoke('skins:validate', filePath),
  getSkinCompatibility: (minecraftVersion: string): Promise<SkinVersionCompatibility> => ipcRenderer.invoke('skins:getCompatibility', minecraftVersion),
  clearSkins: (): Promise<void> => ipcRenderer.invoke('skins:clear'),

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
  }
};

contextBridge.exposeInMainWorld('voxelApi', api);

