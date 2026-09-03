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
  SystemScanResult
} from '../../../electron/types';

// Access the contextBridge exposed API
const electronApi = (window as any).voxelApi;

export const api = {
  // Settings
  getAppSettings: (): Promise<AppSettings> => electronApi.getAppSettings(),
  setAppSettings: (settings: Partial<AppSettings>): Promise<AppSettings> => electronApi.setAppSettings(settings),

  // System & Environment
  scanSystem: (): Promise<SystemScanResult> => electronApi.scanSystem(),
  runEnvironmentCheck: (): Promise<EnvironmentCheckResult> => electronApi.runEnvironmentCheck(),

  // Java
  scanJava: (): Promise<JavaRuntime[]> => electronApi.scanJava(),
  testJava: (path: string): Promise<JavaRuntime | null> => electronApi.testJava(path),
  installJava: (version: 21 | 17 = 21): Promise<{ success: boolean; runtime?: JavaRuntime; error?: string }> => electronApi.installJava(version),

  // Instances
  listInstances: (): Promise<InstanceMetadata[]> => electronApi.listInstances(),
  getInstance: (id: string): Promise<InstanceMetadata | null> => electronApi.getInstance(id),
  createInstance: (payload: CreateInstancePayload): Promise<InstanceMetadata> => electronApi.createInstance(payload),
  updateInstance: (id: string, updates: Partial<InstanceMetadata>): Promise<InstanceMetadata | null> => electronApi.updateInstance(id, updates),
  duplicateInstance: (id: string): Promise<InstanceMetadata | null> => electronApi.duplicateInstance(id),
  deleteInstance: (id: string): Promise<boolean> => electronApi.deleteInstance(id),
  openInstanceFolder: (id: string): Promise<boolean> => electronApi.openInstanceFolder(id),

  // Process Controls (PLAY / STOP)
  launchInstance: (id: string): Promise<LaunchResult> => electronApi.launchInstance(id),
  stopInstance: (id: string): Promise<boolean> => electronApi.stopInstance(id),
  getInstanceStatus: (id: string): Promise<ProcessStatus> => electronApi.getInstanceStatus(id),

  // Content (Mods, Resource Packs, Shaders)
  scanMods: (instanceId: string): Promise<ModInfo[]> => electronApi.scanMods(instanceId),
  toggleMod: (instanceId: string, filename: string, enable: boolean): Promise<boolean> => electronApi.toggleMod(instanceId, filename, enable),
  removeMod: (instanceId: string, filename: string): Promise<boolean> => electronApi.removeMod(instanceId, filename),
  scanResourcePacks: (instanceId: string): Promise<ResourcePackInfo[]> => electronApi.scanResourcePacks(instanceId),
  removeResourcePack: (instanceId: string, filename: string): Promise<boolean> => electronApi.removeResourcePack(instanceId, filename),
  scanShaders: (instanceId: string): Promise<ShaderPackInfo[]> => electronApi.scanShaders(instanceId),
  removeShader: (instanceId: string, filename: string): Promise<boolean> => electronApi.removeShader(instanceId, filename),
  importFile: (instanceId: string, filePath: string, type: 'mod' | 'resourcepack' | 'shader'): Promise<{ success: boolean; filename: string; error?: string }> => electronApi.importFile(instanceId, filePath, type),

  // Modrinth
  searchModrinth: (params: any): Promise<{ hits: ModrinthProject[]; total_hits: number }> => electronApi.searchModrinth(params),
  getModrinthProject: (slugOrId: string): Promise<ModrinthProject | null> => electronApi.getModrinthProject(slugOrId),
  getModrinthVersions: (slugOrId: string, loaders?: string[], gameVersions?: string[]): Promise<ModrinthVersion[]> => electronApi.getModrinthVersions(slugOrId, loaders, gameVersions),
  installModrinthContent: (instanceId: string, fileUrl: string, filename: string, title: string, type: 'mod' | 'resourcepack' | 'shader'): Promise<{ success: boolean; filename: string; error?: string }> => electronApi.installModrinthContent(instanceId, fileUrl, filename, title, type),

  // Logs
  getLogs: (instanceId?: string, levelFilter?: string, query?: string): Promise<LogEntry[]> => electronApi.getLogs(instanceId, levelFilter, query),
  clearLogs: (instanceId?: string): Promise<void> => electronApi.clearLogs(instanceId),
  exportLogs: (instanceId?: string): Promise<string> => electronApi.exportLogs(instanceId),

  // Import / Export
  exportInstance: (instanceId: string, targetZipPath: string): Promise<boolean> => electronApi.exportInstance(instanceId, targetZipPath),
  importInstance: (zipPath: string, customName?: string): Promise<InstanceMetadata | null> => electronApi.importInstance(zipPath, customName),

  // Dialogs
  selectFolderDialog: (): Promise<string | null> => electronApi.selectFolderDialog(),
  selectFileDialog: (filters?: any): Promise<string | null> => electronApi.selectFileDialog(filters),
  selectSaveFileDialog: (defaultName: string, filters?: any): Promise<string | null> => electronApi.selectSaveFileDialog(defaultName, filters),

  // Real-time Event Subscriptions
  onLog: (callback: (entry: LogEntry) => void) => electronApi.onLog(callback),
  onProcessStatus: (callback: (event: ProcessStatusEvent) => void) => electronApi.onProcessStatus(callback),
  onDownloadProgress: (callback: (event: DownloadProgressEvent) => void) => electronApi.onDownloadProgress(callback)
};
