import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { CommandManager } from './backend/commandManager';
import { PathManager } from './backend/storage/paths';
import { LogStreamer } from './backend/processes/logStreamer';
import { ProcessManager } from './backend/processes/processManager';
import { DownloadManager } from './backend/modrinth/downloader';

let mainWindow: BrowserWindow | null = null;

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

function registerIpcHandlers() {
  // Settings
  ipcMain.handle('settings:get', async () => CommandManager.getAppSettings());
  ipcMain.handle('settings:set', async (_, settings) => CommandManager.setAppSettings(settings));

  // System & Environment
  ipcMain.handle('system:scan', async () => CommandManager.scanSystem());
  ipcMain.handle('system:checkEnv', async () => CommandManager.runEnvironmentCheck());

  // Java
  ipcMain.handle('java:scan', async () => CommandManager.scanJava());
  ipcMain.handle('java:test', async (_, p) => CommandManager.testJava(p));
  ipcMain.handle('java:install', async (_, version) => CommandManager.installJava(version));

  // Instances
  ipcMain.handle('instance:list', async () => CommandManager.listInstances());
  ipcMain.handle('instance:get', async (_, id) => CommandManager.getInstance(id));
  ipcMain.handle('instance:create', async (_, payload) => CommandManager.createInstance(payload));
  ipcMain.handle('instance:update', async (_, id, updates) => CommandManager.updateInstance(id, updates));
  ipcMain.handle('instance:duplicate', async (_, id) => CommandManager.duplicateInstance(id));
  ipcMain.handle('instance:delete', async (_, id) => CommandManager.deleteInstance(id));
  ipcMain.handle('instance:openFolder', async (_, id) => CommandManager.openInstanceFolder(id));

  // Process (PLAY / STOP)
  ipcMain.handle('process:launch', async (_, id) => CommandManager.launchInstance(id));
  ipcMain.handle('process:stop', async (_, id) => CommandManager.stopInstance(id));
  ipcMain.handle('process:status', async (_, id) => CommandManager.getInstanceStatus(id));

  // Content
  ipcMain.handle('content:scanMods', async (_, id) => CommandManager.scanMods(id));
  ipcMain.handle('content:toggleMod', async (_, id, fn, en) => CommandManager.toggleMod(id, fn, en));
  ipcMain.handle('content:removeMod', async (_, id, fn) => CommandManager.removeMod(id, fn));
  ipcMain.handle('content:scanResourcePacks', async (_, id) => CommandManager.scanResourcePacks(id));
  ipcMain.handle('content:removeResourcePack', async (_, id, fn) => CommandManager.removeResourcePack(id, fn));
  ipcMain.handle('content:scanShaders', async (_, id) => CommandManager.scanShaders(id));
  ipcMain.handle('content:removeShader', async (_, id, fn) => CommandManager.removeShader(id, fn));
  ipcMain.handle('content:importFile', async (_, id, fp, type) => CommandManager.importFile(id, fp, type));

  // Modrinth
  ipcMain.handle('modrinth:search', async (_, params) => CommandManager.searchModrinth(params));
  ipcMain.handle('modrinth:getProject', async (_, slug) => CommandManager.getModrinthProject(slug));
  ipcMain.handle('modrinth:getVersions', async (_, slug, loaders, versions) => CommandManager.getModrinthVersions(slug, loaders, versions));
  ipcMain.handle('modrinth:install', async (_, id, url, fn, title, type) => CommandManager.installModrinthContent(id, url, fn, title, type));

  // Logs
  ipcMain.handle('logs:get', async (_, id, level, q) => CommandManager.getLogs(id, level, q));
  ipcMain.handle('logs:clear', async (_, id) => CommandManager.clearLogs(id));
  ipcMain.handle('logs:export', async (_, id) => CommandManager.exportLogs(id));

  // Import / Export
  ipcMain.handle('instance:export', async (_, id, targetPath) => CommandManager.exportInstance(id, targetPath));
  ipcMain.handle('instance:import', async (_, zipPath, name) => CommandManager.importInstance(zipPath, name));

  // Dialogs
  ipcMain.handle('dialog:selectFolder', async () => CommandManager.selectFolderDialog(mainWindow || undefined));
  ipcMain.handle('dialog:selectFile', async (_, filters) => CommandManager.selectFileDialog(filters));
  ipcMain.handle('dialog:selectSaveFile', async (_, name, filters) => CommandManager.selectSaveFileDialog(name, filters));
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
