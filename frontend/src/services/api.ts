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
  SkinMetadata,
  SkinSearchResult,
  SkinValidationResult,
  SystemScanResult,
  VoxelAccountSession,
  VoxelCloudSyncPayload,
  VoxelPublicUserProfile,
  VoxelUserProfile
} from '../../../electron/types';

// Access the contextBridge exposed API dynamically to handle early initialization safely
const getApi = () => (window as any).voxelApi || {};

export const api = {
  // Accounts & Cloud Identity
  createAccount: (payload: any): Promise<VoxelAccountSession> => getApi().createAccount(payload),
  loginAccount: (username: string, password: string): Promise<VoxelAccountSession> => getApi().loginAccount(username, password),
  logoutAccount: (): Promise<boolean> => getApi().logoutAccount(),
  getCurrentSession: (): Promise<VoxelAccountSession | null> => getApi().getCurrentSession(),
  getCurrentUser: (): Promise<VoxelUserProfile | null> => getApi().getCurrentUser(),
  updateProfile: (payload: any): Promise<VoxelUserProfile> => getApi().updateProfile(payload),
  changePassword: (payload: any): Promise<boolean> => getApi().changePassword(payload),
  deleteAccount: (): Promise<boolean> => getApi().deleteAccount(),
  listPublicProfiles: (query?: string): Promise<VoxelPublicUserProfile[]> => getApi().listPublicProfiles(query),
  getPublicProfile: (idOrUsername: string): Promise<VoxelPublicUserProfile | null> => getApi().getPublicProfile(idOrUsername),
  syncCloudData: (): Promise<VoxelCloudSyncPayload> => getApi().syncCloudData(),
  getLibrary: (): Promise<any[]> => getApi().getLibrary(),
  savePackToAccount: (pack: any): Promise<any> => getApi().savePackToAccount(pack),
  saveSkinToAccount: (skin: any): Promise<any> => getApi().saveSkinToAccount(skin),

  // Cosmetics
  listCosmeticsCatalog: (): Promise<any[]> => getApi().listCosmeticsCatalog(),
  getUserCosmetics: (): Promise<any[]> => getApi().getUserCosmetics(),
  selectCosmetic: (cosmeticId: string | null): Promise<boolean> => getApi().selectCosmetic(cosmeticId),

  // Achievements
  listAchievementsCatalog: (): Promise<any[]> => getApi().listAchievementsCatalog(),
  getUserAchievements: (): Promise<any[]> => getApi().getUserAchievements(),
  reportAchievementEvent: (eventType: string, metadata?: any): Promise<any> => getApi().reportAchievementEvent(eventType, metadata),

  // Avatar
  uploadAvatar: (buffer: ArrayBuffer | Uint8Array, fileName: string, mimeType: string): Promise<{ avatarUrl: string }> =>
    getApi().uploadAvatar(buffer, fileName, mimeType),
  deleteAvatar: (): Promise<boolean> => getApi().deleteAvatar(),

  // Owner Control Panel
  checkOwnerStatus: (): Promise<{ isOwner: boolean; role: string | null }> => getApi().checkOwnerStatus(),
  getOwnerUsers: (query?: string, limit?: number, offset?: number): Promise<any> =>
    getApi().getOwnerUsers(query, limit, offset),
  getOwnerUserDetails: (userId: string): Promise<any> => getApi().getOwnerUserDetails(userId),
  grantTitle: (userId: string, titleId: string): Promise<boolean> => getApi().grantTitle(userId, titleId),
  revokeTitle: (userId: string, titleId: string): Promise<boolean> => getApi().revokeTitle(userId, titleId),
  grantBadge: (userId: string, badgeId: string): Promise<boolean> => getApi().grantBadge(userId, badgeId),
  revokeBadge: (userId: string, badgeId: string): Promise<boolean> => getApi().revokeBadge(userId, badgeId),
  setCreatorStatus: (userId: string, isCreator: boolean): Promise<boolean> => getApi().setCreatorStatus(userId, isCreator),
  ownerDeleteUser: (userId: string, confirmPhrase: string): Promise<boolean> => getApi().ownerDeleteUser(userId, confirmPhrase),
  ownerBulkDelete: (confirmPhrase: string): Promise<{ deleted: number }> => getApi().ownerBulkDelete(confirmPhrase),
  getOwnerAuditLog: (limit?: number, offset?: number): Promise<any> => getApi().getOwnerAuditLog(limit, offset),

  // Settings
  getAppSettings: (): Promise<AppSettings> => getApi().getAppSettings(),
  setAppSettings: (settings: Partial<AppSettings>): Promise<AppSettings> => getApi().setAppSettings(settings),

  // System & Environment
  scanSystem: (): Promise<SystemScanResult> => getApi().scanSystem(),
  runEnvironmentCheck: (): Promise<EnvironmentCheckResult> => getApi().runEnvironmentCheck(),

  // Java
  scanJava: (): Promise<JavaRuntime[]> => getApi().scanJava(),
  testJava: (path: string): Promise<JavaRuntime | null> => getApi().testJava(path),
  installJava: (version: 21 | 17 = 21): Promise<{ success: boolean; runtime?: JavaRuntime; error?: string }> => getApi().installJava(version),

  // Instances
  listInstances: (): Promise<InstanceMetadata[]> => getApi().listInstances(),
  getInstance: (id: string): Promise<InstanceMetadata | null> => getApi().getInstance(id),
  createInstance: (payload: CreateInstancePayload): Promise<InstanceMetadata> => getApi().createInstance(payload),
  updateInstance: (id: string, updates: Partial<InstanceMetadata>): Promise<InstanceMetadata | null> => getApi().updateInstance(id, updates),
  duplicateInstance: (id: string): Promise<InstanceMetadata | null> => getApi().duplicateInstance(id),
  deleteInstance: (id: string): Promise<boolean> => getApi().deleteInstance(id),
  openInstanceFolder: (id: string): Promise<boolean> => getApi().openInstanceFolder(id),
  setInstanceSkin: (id: string, skinId: string | null): Promise<InstanceMetadata | null> => getApi().setInstanceSkin(id, skinId),

  // Process Controls (PLAY / STOP)
  launchInstance: (id: string): Promise<LaunchResult> => getApi().launchInstance(id),
  stopInstance: (id: string): Promise<boolean> => getApi().stopInstance(id),
  getInstanceStatus: (id: string): Promise<ProcessStatus> => getApi().getInstanceStatus(id),

  // Content (Mods, Resource Packs, Shaders)
  scanMods: (instanceId: string): Promise<ModInfo[]> => getApi().scanMods(instanceId),
  toggleMod: (instanceId: string, filename: string, enable: boolean): Promise<boolean> => getApi().toggleMod(instanceId, filename, enable),
  removeMod: (instanceId: string, filename: string): Promise<boolean> => getApi().removeMod(instanceId, filename),
  scanResourcePacks: (instanceId: string): Promise<ResourcePackInfo[]> => getApi().scanResourcePacks(instanceId),
  removeResourcePack: (instanceId: string, filename: string): Promise<boolean> => getApi().removeResourcePack(instanceId, filename),
  scanShaders: (instanceId: string): Promise<ShaderPackInfo[]> => getApi().scanShaders(instanceId),
  removeShader: (instanceId: string, filename: string): Promise<boolean> => getApi().removeShader(instanceId, filename),
  importFile: (instanceId: string, filePath: string, type: 'mod' | 'resourcepack' | 'shader'): Promise<{ success: boolean; filename: string; error?: string }> => getApi().importFile(instanceId, filePath, type),

  // Modrinth
  searchModrinth: (params: any): Promise<{ hits: ModrinthProject[]; total_hits: number }> => getApi().searchModrinth(params),
  getModrinthProject: (slugOrId: string): Promise<ModrinthProject | null> => getApi().getModrinthProject(slugOrId),
  getModrinthVersions: (slugOrId: string, loaders?: string[], gameVersions?: string[]): Promise<ModrinthVersion[]> => getApi().getModrinthVersions(slugOrId, loaders, gameVersions),
  installModrinthContent: (instanceId: string, fileUrl: string, filename: string, title: string, type: 'mod' | 'resourcepack' | 'shader'): Promise<{ success: boolean; filename: string; error?: string }> => getApi().installModrinthContent(instanceId, fileUrl, filename, title, type),

  // Logs
  getLogs: (instanceId?: string, levelFilter?: string, query?: string): Promise<LogEntry[]> => getApi().getLogs(instanceId, levelFilter, query),
  clearLogs: (instanceId?: string): Promise<void> => getApi().clearLogs(instanceId),
  exportLogs: (instanceId?: string): Promise<string> => getApi().exportLogs(instanceId),

  // Import / Export
  exportInstance: (instanceId: string, targetZipPath: string): Promise<boolean> => getApi().exportInstance(instanceId, targetZipPath),
  importInstance: (zipPath: string, customName?: string): Promise<InstanceMetadata | null> => getApi().importInstance(zipPath, customName),

  // Dialogs
  selectFolderDialog: (): Promise<string | null> => getApi().selectFolderDialog(),
  selectFileDialog: (filters?: any): Promise<string | null> => getApi().selectFileDialog(filters),
  selectSaveFileDialog: (defaultName: string, filters?: any): Promise<string | null> => getApi().selectSaveFileDialog(defaultName, filters),

  // Skins
  listSkins: (): Promise<SkinMetadata[]> => getApi().listSkins(),
  getSkin: (skinId: string): Promise<SkinMetadata | null> => getApi().getSkin(skinId),
  getActiveSkin: (): Promise<SkinMetadata | null> => getApi().getActiveSkin(),
  importSkin: (filePath: string, customName?: string): Promise<{ success: boolean; skin?: SkinMetadata; error?: string }> => getApi().importSkin(filePath, customName),
  downloadSkin: (username: string, customName?: string): Promise<{ success: boolean; skin?: SkinMetadata; error?: string }> => getApi().downloadSkin(username, customName),
  searchPlayer: (username: string): Promise<{ success: boolean; result?: SkinSearchResult; error?: string }> => getApi().searchPlayer(username),
  setActiveSkin: (skinId: string): Promise<{ success: boolean; error?: string }> => getApi().setActiveSkin(skinId),
  renameSkin: (skinId: string, newName: string): Promise<{ success: boolean; error?: string }> => getApi().renameSkin(skinId, newName),
  deleteSkin: (skinId: string): Promise<{ success: boolean; error?: string }> => getApi().deleteSkin(skinId),
  validateSkin: (filePath: string): Promise<SkinValidationResult> => getApi().validateSkin(filePath),
  clearSkins: (): Promise<void> => getApi().clearSkins(),

  // Real-time Event Subscriptions
  onLog: (callback: (entry: LogEntry) => void) => getApi().onLog ? getApi().onLog(callback) : () => {},
  onProcessStatus: (callback: (event: ProcessStatusEvent) => void) => getApi().onProcessStatus ? getApi().onProcessStatus(callback) : () => {},
  onDownloadProgress: (callback: (event: DownloadProgressEvent) => void) => getApi().onDownloadProgress ? getApi().onDownloadProgress(callback) : () => {}
};
