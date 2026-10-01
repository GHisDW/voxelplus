import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { CommandManager } from './backend/commandManager';
import { PathManager } from './backend/storage/paths';
import { LogStreamer } from './backend/processes/logStreamer';
import { ProcessManager } from './backend/processes/processManager';
import { DownloadManager } from './backend/modrinth/downloader';
import { encodeVoxelIpcError } from './backend/diagnostics';
import { VoxelErrorCategory } from './types';

let mainWindow: BrowserWindow | null = null;
let isDeveloperMode = false;

/**
 * Wraps an IPC handler so that any thrown error is serialized into an
 * IPC-safe, structured payload instead of Electron's default raw
 * "Error invoking remote method 'channel': ..." exception text.
 *
 * The renderer receives a rejected promise carrying an Error whose message
 * embeds the structured payload as `...VOXEL_ERROR::{json}` — Electron only
 * forwards the error `message` across IPC (custom properties are stripped
 * and the channel name is prefixed), so the payload travels inside the
 * message; frontend/src/services/errors.ts parses it back into a
 * VoxelIpcError. Result values pass through untouched, so successful calls
 * behave exactly as before.
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
  handle('skins:getCompatibility', 'SKIN', async (_, mcVersion) => CommandManager.getSkinCompatibility(mcVersion));
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

  // CurseForge
  handle('curseforge:search', 'NETWORK', async (_, params) => CommandManager.searchCurseForge(params));
  handle('curseforge:getProject', 'NETWORK', async (_, modId) => CommandManager.getCurseForgeProject(modId));
  handle('curseforge:getFiles', 'NETWORK', async (_, params) => CommandManager.getCurseForgeFiles(params));
  handle('curseforge:isConfigured', 'NETWORK', async () => CommandManager.isCurseForgeConfigured());

  // Cards
  handle('cards:list', 'INSTANCE', async () => CommandManager.listCards());
  handle('cards:get', 'INSTANCE', async (_, cardId) => CommandManager.getCard(cardId));
  handle('cards:isRetired', 'INSTANCE', async (_, cardId) => CommandManager.isCardRetired(cardId));
  handle('cards:isBuiltIn', 'INSTANCE', async (_, cardId) => CommandManager.isBuiltInCard(cardId));
  handle('cards:isDeveloperMode', 'INSTANCE', async () => CommandManager.isDeveloperMode());
  handle('cards:save', 'INSTANCE', async (_, card) => { CommandManager.saveCard(card); return { success: true }; });
  handle('cards:delete', 'INSTANCE', async (_, cardId) => { CommandManager.deleteCard(cardId); return { success: true }; });
  handle('cards:export', 'INSTANCE', async (_, card) => CommandManager.exportCard(card));
  handle('cards:listInstalled', 'INSTANCE', async () => CommandManager.listInstalledCards());
  handle('cards:getInstallState', 'INSTANCE', async (_, cardId) => CommandManager.getCardInstallState(cardId));
  handle('cards:install', 'INSTANCE', async (_, cardId) => CommandManager.installCard(cardId));
  handle('cards:uninstall', 'INSTANCE', async (_, cardId) => CommandManager.uninstallCard(cardId));
  handle('cards:retire', 'INSTANCE', async (_, cardId) => CommandManager.retireCard(cardId));

  // Packs
  handle('packs:list', 'INSTANCE', async () => CommandManager.listPacks());
  handle('packs:get', 'INSTANCE', async (_, packId) => CommandManager.getPack(packId));
  handle('packs:save', 'INSTANCE', async (_, pack) => CommandManager.savePack(pack));
  handle('packs:delete', 'INSTANCE', async (_, packId) => CommandManager.deletePack(packId));
  handle('packs:export', 'INSTANCE', async (_, packId) => CommandManager.exportPack(packId));
  handle('packs:import', 'INSTANCE', async () => CommandManager.importPack());
  handle('packs:createFromInstance', 'INSTANCE', async (_, instanceId, packDetails) => CommandManager.createPackFromInstance(instanceId, packDetails));
  handle('packs:install', 'INSTANCE', async (_, packId) => CommandManager.installPack(packId));
  handle('packs:installToInstance', 'INSTANCE', async (_, packId, instanceId) => CommandManager.installPackToInstance(packId, instanceId));
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

  // Remove default menu for clean launcher look
  mainWindow.setMenuBarVisibility(false);

  // Hook event streamers to send live events to renderer
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

  // Load URL
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
  
  // Check if developer mode is enabled by checking for defaultCards.ts
  const defaultCardsPath = path.join(__dirname, 'backend/cards/defaultCards.ts');
  try {
    if (fs.existsSync(defaultCardsPath)) {
      isDeveloperMode = true;
      (global as any).isDeveloperMode = true;
      console.log('Developer mode enabled: defaultCards.ts found');
    }
  } catch (e) {
    console.log('Developer mode check failed, running in production mode');
  }
  
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

