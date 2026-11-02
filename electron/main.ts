import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron';
import path from 'node:path';
import { CommandManager } from './backend/commandManager';
import { ConfigStore } from './backend/storage/configStore';
import { PathManager } from './backend/storage/paths';
import { LogStreamer } from './backend/processes/logStreamer';
import { ProcessManager } from './backend/processes/processManager';
import { DownloadManager } from './backend/modrinth/downloader';
import { setAchievementUnlockCallback } from './backend/player/achievementEngine';
import { encodeVoxelIpcError } from './backend/diagnostics';
import { UpdateService } from './backend/updates/updateService';
import * as validate from './backend/ipc/validate';
import { VoxelErrorCategory } from './types';

/** Loaders the launcher can scaffold/launch. */
const LOADER_TYPES = ['fabric', 'quilt', 'forge', 'neoforge'] as const;
/** Content kinds that can be installed into an instance. */
const CONTENT_TYPES = ['mod', 'resourcepack', 'shader'] as const;
/** Modrinth serves version files from its CDN; external URLs are rejected. */
const MODRINTH_DOWNLOAD_HOSTS = [
  'cdn.modrinth.com',
  'api.modrinth.com',
  'github.com',
  'raw.githubusercontent.com',
  'objects.githubusercontent.com'
] as const;

function validateStringArray(value: unknown, label: string): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) {
    throw new validate.IpcValidationError(label, 'expected an array of strings.');
  }
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map(entry => validate.requireString(entry, label, 64))
    .slice(0, 50);
}


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

  // Every value below originates in the renderer and is therefore untrusted.
  // `v.*` helpers throw IpcValidationError (surfaced as a structured VoxelIpcError)
  // before any filesystem/network code sees the argument.
  const v = {
    id: (value: unknown) => validate.requireInstanceId(value),
    file: (value: unknown) => validate.requireFilename(value),
    path: (value: unknown, label = 'path') => validate.requireAbsolutePath(value, label),
    text: (value: unknown, label: string, max = 512) => validate.requireString(value, label, max),
    opt: (value: unknown, label: string) => validate.optionalString(value, label),
    bool: (value: unknown, label: string) => validate.requireBoolean(value, label),
    obj: (value: unknown, label: string) => validate.requirePlainObject(value, label),
    enum: validate.requireEnum,
    url: (value: unknown) => validate.requireHttpsUrl(value, 'download url', MODRINTH_DOWNLOAD_HOSTS)
  };

  const optionalId = (value: unknown) => (value === undefined || value === null ? undefined : v.id(value));

  // Settings
  handle('settings:get', 'CONFIGURATION', async () => CommandManager.getAppSettings());
  handle('settings:set', 'CONFIGURATION', async (_, settings) => CommandManager.setAppSettings(v.obj(settings, 'settings') as any));
  handle('system:resetAllData', 'CONFIGURATION', async () => CommandManager.resetEverything());

  // System & Environment
  handle('system:scan', 'MINECRAFT', async () => CommandManager.scanSystem());
  handle('system:checkEnv', 'MINECRAFT', async () => CommandManager.runEnvironmentCheck());

  // Java
  handle('java:scan', 'JAVA', async () => CommandManager.scanJava());
  handle('java:test', 'JAVA', async (_, p) => CommandManager.testJava(v.path(p, 'java executable')));
  handle('java:install', 'JAVA', async (_, version) => {
    const major = validate.requireJavaMajorVersion(version);
    return CommandManager.installJava(major, (status, percentage) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('event:javaInstallProgress', { version: major, status, percentage });
      }
    });
  });


  // Instances
  handle('instance:list', 'INSTANCE', async () => CommandManager.listInstances());
  handle('instance:get', 'INSTANCE', async (_, id) => CommandManager.getInstance(v.id(id)));
  handle('instance:create', 'INSTANCE', async (_, payload) => CommandManager.createInstance(v.obj(payload, 'instance payload') as any));
  handle('instance:update', 'INSTANCE', async (_, id, updates) => CommandManager.updateInstance(v.id(id), v.obj(updates, 'instance updates') as any));
  handle('instance:duplicate', 'INSTANCE', async (_, id) => CommandManager.duplicateInstance(v.id(id)));
  handle('instance:delete', 'INSTANCE', async (_, id) => CommandManager.deleteInstance(v.id(id)));
  handle('instance:openFolder', 'INSTANCE', async (_, id) => CommandManager.openInstanceFolder(v.id(id)));

  // Process (PLAY / STOP)
  handle('process:launch', 'MINECRAFT', async (_, id) => CommandManager.launchInstance(v.id(id)));
  handle('process:stop', 'MINECRAFT', async (_, id) => CommandManager.stopInstance(v.id(id)));
  handle('process:status', 'MINECRAFT', async (_, id) => CommandManager.getInstanceStatus(v.id(id)));

  // Content
  handle('content:scanMods', 'MOD', async (_, id) => CommandManager.scanMods(v.id(id)));
  handle('content:toggleMod', 'MOD', async (_, id, fn, en) => CommandManager.toggleMod(v.id(id), v.file(fn), v.bool(en, 'enabled')));
  handle('content:removeMod', 'MOD', async (_, id, fn) => CommandManager.removeMod(v.id(id), v.file(fn)));
  handle('content:scanResourcePacks', 'RESOURCE_PACK', async (_, id) => CommandManager.scanResourcePacks(v.id(id)));
  handle('content:removeResourcePack', 'RESOURCE_PACK', async (_, id, fn) => CommandManager.removeResourcePack(v.id(id), v.file(fn)));
  handle('content:scanShaders', 'SHADER', async (_, id) => CommandManager.scanShaders(v.id(id)));
  handle('content:removeShader', 'SHADER', async (_, id, fn) => CommandManager.removeShader(v.id(id), v.file(fn)));
  handle('content:importFile', 'FILESYSTEM', async (_, id, fp, type) =>
    CommandManager.importFile(v.id(id), v.path(fp, 'source file'), v.enum(type, CONTENT_TYPES, 'content type')));



  // Modrinth
  handle('modrinth:search', 'NETWORK', async (_, params) => CommandManager.searchModrinth(v.obj(params, 'search params') as any));
  handle('modrinth:getProject', 'NETWORK', async (_, slug) => CommandManager.getModrinthProject(v.text(slug, 'project slug', 128)));
  handle('modrinth:getVersions', 'NETWORK', async (_, slug, loaders, versions) =>
    CommandManager.getModrinthVersions(
      v.text(slug, 'project slug', 128),
      validateStringArray(loaders, 'loaders'),
      validateStringArray(versions, 'game versions')
    ));
  handle('modrinth:install', 'DOWNLOAD', async (_, id, url, fn, title, type) =>
    CommandManager.installModrinthContent(
      v.id(id),
      v.url(url),
      v.file(fn),
      v.text(title, 'project title', 256),
      v.enum(type, CONTENT_TYPES, 'content type')
    ));

  // Logs
  handle('logs:get', 'IPC', async (_, id, level, q) =>
    CommandManager.getLogs(
      optionalId(id),
      level === undefined || level === null ? undefined : validate.requireLogLevel(level),
      q === undefined || q === null ? undefined : v.text(q, 'log query', 256)
    ));
  handle('logs:clear', 'IPC', async (_, id) => CommandManager.clearLogs(optionalId(id)));
  handle('logs:export', 'IPC', async (_, id) => CommandManager.exportLogs(optionalId(id)));
  handle('logs:writeToFile', 'IPC', async (_, id, targetPath) =>
    CommandManager.writeLogsToFile(optionalId(id), v.path(targetPath, 'export path')));

  // Import / Export & VPack
  handle('instance:export', 'INSTANCE', async (_, id, targetPath) =>
    CommandManager.exportInstance(v.id(id), v.path(targetPath, 'export path')));
  handle('instance:import', 'INSTANCE', async (_, zipPath, name) =>
    CommandManager.importInstance(
      v.path(zipPath, 'archive path'),
      name === undefined || name === null ? undefined : v.text(name, 'instance name', 120)
    ));
  handle('vpack:validate', 'INSTANCE', async (_, zipPath) => CommandManager.validateVPack(v.path(zipPath, 'vpack path')));
  handle('vpack:convert', 'INSTANCE', async (_, inPath, outPath) =>
    CommandManager.convertModpackToVPack(v.path(inPath, 'source path'), v.path(outPath, 'output path')));
  handle('system:preflight', 'INSTANCE', async (_, mcVer, loader, mem, dir, javaId) =>
    CommandManager.runPreflight(
      v.text(mcVer, 'minecraft version', 32),
      v.enum(loader, LOADER_TYPES, 'loader'),
      typeof mem === 'number' && Number.isFinite(mem) && mem > 0 ? Math.min(mem, 65536) : 4096,
      dir === undefined || dir === null ? undefined : v.path(dir, 'instance directory'),
      javaId === undefined || javaId === null ? undefined : v.text(javaId, 'java runtime id', 128)
    ));
  handle('vpack:listRepository', 'INSTANCE', async () => CommandManager.listRepositoryVPacks());

  // Launcher updates (GitHub Releases)
  handle('updates:status', 'IPC', async () => UpdateService.getStatus());
  handle('updates:check', 'IPC', async (_, force) => UpdateService.checkForUpdates(force === true));
  handle('updates:download', 'IPC', async (_, asset) => {
    // The asset is re-resolved against the latest release; the renderer only
    // supplies an optional name that must match the verified asset exactly.
    const requested = asset && typeof asset === 'object' ? (asset as any).name : undefined;
    const trusted = await UpdateService.resolveAssetForDownload(typeof requested === 'string' ? requested : undefined);
    return UpdateService.downloadUpdate(trusted);
  });
  handle('updates:install', 'IPC', async () => UpdateService.installUpdate());
  handle('updates:openRelease', 'IPC', async (_, url) => UpdateService.openReleasePage(v.opt(url, 'release url')));
  handle('app:quit', 'IPC', async () => { app.quit(); return true; });
  handle('vpack:purchase', 'INSTANCE', async (_, zipPath) => CommandManager.purchaseVPack(v.path(zipPath, 'vpack path')));

  // Player & Economy
  handle('player:getProfile', 'IPC', async () => CommandManager.getPlayerProfile());
  handle('player:updateProfile', 'IPC', async (_, updates) => CommandManager.updatePlayerProfile(v.obj(updates, 'profile updates') as any));
  handle('player:getWallet', 'IPC', async () => CommandManager.getWallet());
  handle('player:getTransactions', 'IPC', async () => CommandManager.getWalletTransactions());
  handle('player:getAchievements', 'IPC', async () => CommandManager.getAchievements());
  handle('player:getCosmetics', 'IPC', async () => CommandManager.getCosmetics());
  handle('player:purchaseCosmetic', 'IPC', async (_, cosmeticId) => CommandManager.purchaseCosmetic(v.text(cosmeticId, 'cosmetic id', 128)));
  handle('player:equipCosmetic', 'IPC', async (_, cosmeticId, effectId) =>
    CommandManager.equipCosmetic(v.opt(cosmeticId, 'cosmetic id'), v.opt(effectId, 'effect id')));

  // Arcade
  handle('arcade:getStockerData', 'IPC', async () => CommandManager.getStockerData());
  handle('arcade:recordStockerRun', 'IPC', async (_, run) => CommandManager.recordStockerRun(v.obj(run, 'stocker run') as any));
  handle('arcade:getCookieData', 'IPC', async () => CommandManager.getCookieData());
  handle('arcade:saveCookieData', 'IPC', async (_, data) => CommandManager.saveCookieData(v.obj(data, 'cookie save data') as any));

  // Dialogs
  handle('dialog:selectFolder', 'IPC', async () => CommandManager.selectFolderDialog(mainWindow || undefined));
  handle('dialog:selectFile', 'IPC', async (_, filters) =>
    CommandManager.selectFileDialog(validate.sanitizeDialogFilters(filters)));
  handle('dialog:selectSaveFile', 'IPC', async (_, name, filters) =>
    CommandManager.selectSaveFileDialog(v.text(name, 'file name', 200), validate.sanitizeDialogFilters(filters)));
}

function resolveWindowBackground(): string {
  try {
    const theme = ConfigStore.getSettings().theme;
    const useDark = theme === 'dark' || (theme === 'system' && nativeTheme.shouldUseDarkColors);
    // Matches --bg-app in frontend/src/styles/index.css for each theme so the
    // window frame never flashes the wrong colour before the splash paints.
    return useDark ? '#090c13' : '#f1f5f9';
  } catch {
    return '#090c13';
  }
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
    backgroundColor: resolveWindowBackground(),

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
  // A `.old` backup only exists after a successful in-place update; if we are
  // running now, the new build started, so the backup can be reclaimed.
  UpdateService.cleanupStaleBackup();
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// A quitting launcher must not leave a Minecraft/Gradle dev client running in
// the background (the old build leaked one child process per launch).
let shuttingDown = false;
app.on('before-quit', () => {
  if (shuttingDown) return;
  shuttingDown = true;
  ProcessManager.shutdownAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

