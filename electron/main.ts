import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { CommandManager } from './backend/commandManager';
import { PathManager } from './backend/storage/paths';
import { LogStreamer } from './backend/processes/logStreamer';
import { ProcessManager } from './backend/processes/processManager';
import { DownloadManager } from './backend/modrinth/downloader';
import { encodeVoxelIpcError } from './backend/diagnostics';
import { VoxelErrorCategory } from './types';

let mainWindow: BrowserWindow | null = null;

/**
 * Wraps an IPC handler so that any thrown error is serialized into an
 * IPC-safe, structured payload instead of Electron's default raw
 * "Error invoking remote method 'channel': ..." exception text.
 */
function wrapIpcHandler<TResult>(
  channel: string,
  category: VoxelErrorCategory,
  handler: (...args: any[]) => Promise<TResult>
): (event: Electron.IpcMainInvokeEvent, ...args: any[]) => Promise<TResult> {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (error) {
      throw encodeVoxelIpcError(error, { title: 'Operation Failed', category });
    }
  };
}

function registerIpcHandlers() {
  const handle = <TResult>(
    channel: string,
    category: VoxelErrorCategory,
    handler: (...args: any[]) => Promise<TResult>
  ) => ipcMain.handle(channel, wrapIpcHandler(channel, category, handler));

  // Account & Cloud Identity (Matching preload.ts channel names exactly)
  handle('account:create', 'CONFIGURATION', async (_, payload) => CommandManager.createAccount(payload));
  handle('account:login', 'CONFIGURATION', async (_, u, p) => CommandManager.loginAccount(u, p));
  handle('account:logout', 'CONFIGURATION', async () => CommandManager.logoutAccount());
  handle('account:getSession', 'CONFIGURATION', async () => CommandManager.getCurrentSession());
  handle('account:getUser', 'CONFIGURATION', async () => CommandManager.getCurrentUser());
  handle('account:updateProfile', 'CONFIGURATION', async (_, payload) => CommandManager.updateProfile(payload));
  handle('account:changePassword', 'CONFIGURATION', async (_, payload) => CommandManager.changePassword(payload));
  handle('account:delete', 'CONFIGURATION', async () => CommandManager.deleteAccount());
  handle('account:listPublic', 'CONFIGURATION', async (_, q) => CommandManager.listPublicProfiles(q));
  handle('account:getPublic', 'CONFIGURATION', async (_, id) => CommandManager.getPublicProfile(id));
  handle('cloud:sync', 'NETWORK', async () => CommandManager.syncCloudData());
  handle('cloud:getLibrary', 'CONFIGURATION', async () => CommandManager.getLibrary());
  handle('cloud:savePack', 'CONFIGURATION', async (_, pack) => CommandManager.savePackToAccount(pack));
  handle('cloud:saveSkin', 'CONFIGURATION', async (_, skin) => CommandManager.saveSkinToAccount(skin));

  // Cosmetics
  handle('cosmetics:catalog', 'CONFIGURATION', async () => CommandManager.listCosmeticsCatalog());
  handle('cosmetics:getUser', 'CONFIGURATION', async () => CommandManager.getUserCosmetics());
  handle('cosmetics:select', 'CONFIGURATION', async (_, cosmeticId) => CommandManager.selectCosmetic(cosmeticId));

  // Achievements
  handle('achievements:catalog', 'CONFIGURATION', async () => CommandManager.listAchievementsCatalog());
  handle('achievements:getUser', 'CONFIGURATION', async () => CommandManager.getUserAchievements());
  handle('achievements:event', 'CONFIGURATION', async (_, eventType, metadata) => CommandManager.reportAchievementEvent(eventType, metadata));

  // Avatar
  handle('avatar:upload', 'FILESYSTEM', async (_, buffer, fileName, mimeType) => CommandManager.uploadAvatar(buffer, fileName, mimeType));
  handle('avatar:delete', 'FILESYSTEM', async () => CommandManager.deleteAvatar());

  // Owner Control Panel
  handle('owner:check', 'CONFIGURATION', async () => CommandManager.checkOwnerStatus());
  handle('owner:getUsers', 'CONFIGURATION', async (_, q, limit, offset) => CommandManager.getOwnerUsers(q, limit, offset));
  handle('owner:getUserDetails', 'CONFIGURATION', async (_, userId) => CommandManager.getOwnerUserDetails(userId));
  handle('owner:grantTitle', 'CONFIGURATION', async (_, userId, titleId) => CommandManager.grantTitle(userId, titleId));
  handle('owner:revokeTitle', 'CONFIGURATION', async (_, userId, titleId) => CommandManager.revokeTitle(userId, titleId));
  handle('owner:grantBadge', 'CONFIGURATION', async (_, userId, badgeId) => CommandManager.grantBadge(userId, badgeId));
  handle('owner:revokeBadge', 'CONFIGURATION', async (_, userId, badgeId) => CommandManager.revokeBadge(userId, badgeId));
  handle('owner:setCreator', 'CONFIGURATION', async (_, userId, isCreator) => CommandManager.setCreatorStatus(userId, isCreator));
  handle('owner:deleteUser', 'CONFIGURATION', async (_, userId, confirm) => CommandManager.ownerDeleteUser(userId, confirm));
  handle('owner:bulkDelete', 'CONFIGURATION', async (_, confirm) => CommandManager.ownerBulkDelete(confirm));
  handle('owner:getAuditLog', 'CONFIGURATION', async (_, limit, offset) => CommandManager.getOwnerAuditLog(limit, offset));

  // Settings
  handle('settings:get', 'CONFIGURATION', async () => CommandManager.getAppSettings());
  handle('settings:set', 'CONFIGURATION', async (_, settings) => CommandManager.setAppSettings(settings));

  // System & Environment
  handle('system:scan', 'MINECRAFT', async () => CommandManager.scanSystem());
  handle('system:checkEnv', 'MINECRAFT', async () => CommandManager.runEnvironmentCheck());

  // Java
  handle('java:scan', 'JAVA', async () => CommandManager.scanJava());
  handle('java:test', 'JAVA', async (_, p) => CommandManager.testJava(p));
  handle('java:install', 'JAVA', async (_, version) => CommandManager.installJava(version));

  // Instances
  handle('instance:list', 'INSTANCE', async () => CommandManager.listInstances());
  handle('instance:get', 'INSTANCE', async (_, id) => CommandManager.getInstance(id));
  handle('instance:create', 'INSTANCE', async (_, payload) => CommandManager.createInstance(payload));
  handle('instance:update', 'INSTANCE', async (_, id, updates) => CommandManager.updateInstance(id, updates));
  handle('instance:duplicate', 'INSTANCE', async (_, id) => CommandManager.duplicateInstance(id));
  handle('instance:delete', 'INSTANCE', async (_, id) => CommandManager.deleteInstance(id));
  handle('instance:openFolder', 'INSTANCE', async (_, id) => CommandManager.openInstanceFolder(id));
  handle('instance:setSkin', 'SKIN', async (_, id, skinId) => CommandManager.setInstanceSkin(id, skinId));

  // Process (PLAY / STOP)
  handle('process:launch', 'MINECRAFT', async (_, id) => CommandManager.launchInstance(id));
  handle('process:stop', 'MINECRAFT', async (_, id) => CommandManager.stopInstance(id));
  handle('process:status', 'MINECRAFT', async (_, id) => CommandManager.getInstanceStatus(id));

  // Content
  handle('content:scanMods', 'MOD', async (_, id) => CommandManager.scanMods(id));
  handle('content:toggleMod', 'MOD', async (_, id, fn, en) => CommandManager.toggleMod(id, fn, en));
  handle('content:removeMod', 'MOD', async (_, id, fn) => CommandManager.removeMod(id, fn));
  handle('content:scanResourcePacks', 'RESOURCE_PACK', async (_, id) => CommandManager.scanResourcePacks(id));
  handle('content:removeResourcePack', 'RESOURCE_PACK', async (_, id, fn) => CommandManager.removeResourcePack(id, fn));
  handle('content:scanShaders', 'SHADER', async (_, id) => CommandManager.scanShaders(id));
  handle('content:removeShader', 'SHADER', async (_, id, fn) => CommandManager.removeShader(id, fn));
  handle('content:importFile', 'FILESYSTEM', async (_, id, fp, type) => CommandManager.importFile(id, fp, type));

  // Skins
  handle('skins:list', 'SKIN', async () => CommandManager.listSkins());
  handle('skins:get', 'SKIN', async (_, id) => CommandManager.getSkin(id));
  handle('skins:getActive', 'SKIN', async () => CommandManager.getActiveSkin());
  handle('skins:import', 'SKIN', async (_, filePath, customName) => CommandManager.importSkin(filePath, customName));
  handle('skins:download', 'SKIN', async (_, username, customName) => CommandManager.downloadSkin(username, customName));
  handle('skins:search', 'SKIN', async (_, username) => CommandManager.searchPlayer(username));
  handle('skins:setActive', 'SKIN', async (_, id) => CommandManager.setActiveSkin(id));
  handle('skins:rename', 'SKIN', async (_, id, newName) => CommandManager.renameSkin(id, newName));
  handle('skins:delete', 'SKIN', async (_, id) => CommandManager.deleteSkin(id));
  handle('skins:validate', 'SKIN', async (_, filePath) => CommandManager.validateSkin(filePath));
  handle('skins:clear', 'SKIN', async () => CommandManager.clearSkins());

  // Modrinth
  handle('modrinth:search', 'NETWORK', async (_, params) => CommandManager.searchModrinth(params));
  handle('modrinth:getProject', 'NETWORK', async (_, slug) => CommandManager.getModrinthProject(slug));
  handle('modrinth:getVersions', 'NETWORK', async (_, slug, loaders, versions) => CommandManager.getModrinthVersions(slug, loaders, versions));
  handle('modrinth:install', 'DOWNLOAD', async (_, id, url, fn, title, type) => CommandManager.installModrinthContent(id, url, fn, title, type));

  // Logs
  handle('logs:get', 'IPC', async (_, id, level, q) => CommandManager.getLogs(id, level, q));
  handle('logs:clear', 'IPC', async (_, id) => CommandManager.clearLogs(id));
  handle('logs:export', 'IPC', async (_, id) => CommandManager.exportLogs(id));

  // Import / Export
  handle('instance:export', 'INSTANCE', async (_, id, targetPath) => CommandManager.exportInstance(id, targetPath));
  handle('instance:import', 'INSTANCE', async (_, zipPath, name) => CommandManager.importInstance(zipPath, name));

  // Dialogs
  handle('dialog:selectFolder', 'IPC', async () => CommandManager.selectFolderDialog(mainWindow || undefined));
  handle('dialog:selectFile', 'IPC', async (_, filters) => CommandManager.selectFileDialog(filters));
  handle('dialog:selectSaveFile', 'IPC', async (_, name, filters) => CommandManager.selectSaveFileDialog(name, filters));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 780,
    minWidth: 1020,
    minHeight: 650,
    frame: true,
    titleBarStyle: 'default',
    title: 'Voxel⁺ Launcher',
    backgroundColor: '#0a0d14',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.setMenuBarVisibility(false);

  LogStreamer.onLog((entry) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('event:log', entry);
    }
  });

  ProcessManager.onStatusChange((event) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('event:processStatus', event);
    }
  });

  DownloadManager.onProgress((event) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('event:downloadProgress', event);
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  PathManager.initialize();
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
