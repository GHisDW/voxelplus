import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { CommandManager } from './backend/commandManager';
import { PathManager } from './backend/storage/paths';
import { LogStreamer } from './backend/processes/logStreamer';
import { ProcessManager } from './backend/processes/processManager';
import { DownloadManager } from './backend/modrinth/downloader';
import { setAchievementUnlockCallback } from './backend/player/achievementEngine';
import { encodeVoxelIpcError } from './backend/diagnostics';
import { UpdateService } from './backend/updates/updateService';
import { VoxelErrorCategory } from './types';

let mainWindow: BrowserWindow | null = null;

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
  handle('system:resetAllData', 'CONFIGURATION', async () => CommandManager.resetEverything());

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



  // Modrinth
  handle('modrinth:search', 'NETWORK', async (_, params) => CommandManager.searchModrinth(params));
  handle('modrinth:getProject', 'NETWORK', async (_, slug) => CommandManager.getModrinthProject(slug));
  handle('modrinth:getVersions', 'NETWORK', async (_, slug, loaders, versions) => CommandManager.getModrinthVersions(slug, loaders, versions));
  handle('modrinth:install', 'DOWNLOAD', async (_, id, url, fn, title, type) => CommandManager.installModrinthContent(id, url, fn, title, type));

  // Logs
  handle('logs:get', 'IPC', async (_, id, level, q) => CommandManager.getLogs(id, level, q));
  handle('logs:clear', 'IPC', async (_, id) => CommandManager.clearLogs(id));
  handle('logs:export', 'IPC', async (_, id) => CommandManager.exportLogs(id));
  handle('logs:writeToFile', 'IPC', async (_, id, targetPath) => CommandManager.writeLogsToFile(id, targetPath));

  // Import / Export & VPack
  handle('instance:export', 'INSTANCE', async (_, id, targetPath) => CommandManager.exportInstance(id, targetPath));
  handle('instance:import', 'INSTANCE', async (_, zipPath, name) => CommandManager.importInstance(zipPath, name));
  handle('vpack:validate', 'INSTANCE', async (_, zipPath) => CommandManager.validateVPack(zipPath));
  handle('vpack:convert', 'INSTANCE', async (_, inPath, outPath) => CommandManager.convertModpackToVPack(inPath, outPath));
  handle('system:preflight', 'INSTANCE', async (_, mcVer, loader, mem, dir, javaId) => CommandManager.runPreflight(mcVer, loader, mem, dir, javaId));
  handle('vpack:listRepository', 'INSTANCE', async () => CommandManager.listRepositoryVPacks());

  // Launcher updates (GitHub Releases)
  handle('updates:status', 'IPC', async () => UpdateService.getStatus());
  handle('updates:check', 'IPC', async (_, force) => UpdateService.checkForUpdates(Boolean(force)));
  handle('updates:download', 'IPC', async (_, asset) => {
    const trusted = await UpdateService.resolveAssetForDownload(asset?.name);
    return UpdateService.downloadUpdate(trusted);
  });
  handle('updates:install', 'IPC', async () => UpdateService.installUpdate());
  handle('updates:openRelease', 'IPC', async (_, url) => UpdateService.openReleasePage(url));
  handle('app:quit', 'IPC', async () => { app.quit(); return true; });
  handle('vpack:purchase', 'INSTANCE', async (_, zipPath) => CommandManager.purchaseVPack(zipPath));

  // Player & Economy
  handle('player:getProfile', 'IPC', async () => CommandManager.getPlayerProfile());
  handle('player:updateProfile', 'IPC', async (_, updates) => CommandManager.updatePlayerProfile(updates));
  handle('player:getWallet', 'IPC', async () => CommandManager.getWallet());
  handle('player:getTransactions', 'IPC', async () => CommandManager.getWalletTransactions());
  handle('player:getAchievements', 'IPC', async () => CommandManager.getAchievements());
  handle('player:getCosmetics', 'IPC', async () => CommandManager.getCosmetics());
  handle('player:purchaseCosmetic', 'IPC', async (_, cosmeticId) => CommandManager.purchaseCosmetic(cosmeticId));
  handle('player:equipCosmetic', 'IPC', async (_, cosmeticId, effectId) => CommandManager.equipCosmetic(cosmeticId, effectId));

  // Arcade
  handle('arcade:getStockerData', 'IPC', async () => CommandManager.getStockerData());
  handle('arcade:recordStockerRun', 'IPC', async (_, run) => CommandManager.recordStockerRun(run));
  handle('arcade:getCookieData', 'IPC', async () => CommandManager.getCookieData());
  handle('arcade:saveCookieData', 'IPC', async (_, data) => CommandManager.saveCookieData(data));

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
    title: 'Voxel+ Launcher',
    backgroundColor: '#090c13',
    // Painting is delayed until ready-to-show so the window never flashes a
    // blank white frame before the splash renders (faster perceived startup).
    show: false,
    // dist-electron is next to logo.png in development and inside the packaged app.
    // The previous ../../ path escaped the application directory and silently
    // produced a window without the Voxel+ icon.
    icon: path.join(__dirname, '../logo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  // Remove default menu for clean launcher look
  mainWindow.setMenuBarVisibility(false);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Security: Restrict navigation to prevent loading external content
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    if (parsedUrl.protocol !== 'file:' && parsedUrl.protocol !== 'devtools:') {
      event.preventDefault();
    }
  });

  // Security: Block new window creation
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Allow only devtools
    if (url.startsWith('devtools://')) {
      return { action: 'allow' };
    }
    return { action: 'deny' };
  });

  // Security: Set restrictive CSP. Inline scripts are only allowed for the Vite
  // dev server (HMR bootstrap); production builds load a bundled file script.
  const isDevServer = Boolean(process.env.VITE_DEV_SERVER_URL);
  const scriptSrc = isDevServer ? "'self' 'unsafe-inline'" : "'self'";
  const connectSrc = isDevServer
    ? "'self' ws: http://localhost:5173"
    : "'self' https://api.modrinth.com";
  const csp = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://cdn.modrinth.com",
    "font-src 'self' data:",
    `connect-src ${connectSrc}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'"
  ].join('; ') + ';';

  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp]
      }
    });
  });

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

  UpdateService.onProgress((event) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('event:updateProgress', event);
    }
  });

  // Achievement unlock notifications
  setAchievementUnlockCallback((data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('event:achievementUnlocked', data);
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

