import { app, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import https from 'node:https';
import { spawn } from 'node:child_process';
import { PathManager } from '../storage/paths';
import { buildApplyUpdateScript } from './applyScript';
import {
  ReleaseInfo,
  SelectedAsset,
  isMandatoryUpdate,
  isNewerVersion,
  parseVersion,
  selectUpdateAsset
} from './updatePolicy';
import { UpdateAssetInfo, UpdateInfo, UpdateInstallResult, UpdateProgressEvent } from '../../types';

const OWNER = 'GHisDW';
const REPO = 'voxelplus';
const RELEASES_URL = `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`;
const RELEASE_PAGE_BASE = `https://github.com/${OWNER}/${REPO}/releases`;

/** Hosts GitHub may redirect a release download to. */
const ALLOWED_DOWNLOAD_HOSTS = [
  'github.com',
  'api.github.com',
  'objects.githubusercontent.com',
  'github-releases.githubusercontent.com',
  'release-assets.githubusercontent.com'
];

const REQUEST_TIMEOUT_MS = 10_000;
const CHECK_CACHE_MS = 5 * 60 * 1000;

export class UpdateService {
  private static cached: UpdateInfo | null = null;
  private static staged: { name: string; filePath: string; size: number; sha256: string } | null = null;
  private static downloadInFlight: Promise<string> | null = null;
  private static installInFlight = false;
  private static progressListeners: ((event: UpdateProgressEvent) => void)[] = [];

  public static onProgress(listener: (event: UpdateProgressEvent) => void): () => void {
    this.progressListeners.push(listener);
    return () => {
      this.progressListeners = this.progressListeners.filter(l => l !== listener);
    };
  }

  public static getCurrentVersion(): string {
    try {
      return app?.getVersion?.() || '0.0.0';
    } catch {
      return '0.0.0';
    }
  }

  public static isPortable(): boolean {
    return Boolean(process.env.PORTABLE_EXECUTABLE_FILE || process.env.PORTABLE_EXECUTABLE_DIR);
  }

  /** Auto-install is only meaningful for a packaged Windows build. */
  public static canAutoInstall(): boolean {
    try {
      return process.platform === 'win32' && app.isPackaged;
    } catch {
      return false;
    }
  }

  public static getStatus(): { version: string; portable: boolean; canAutoInstall: boolean; platform: string } {
    return {
      version: this.getCurrentVersion(),
      portable: this.isPortable(),
      canAutoInstall: this.canAutoInstall(),
      platform: process.platform
    };
  }

  /**
   * Queries the latest GitHub release. Network/rate-limit failures are returned
   * as `status: 'error'` (never thrown) so being offline never blocks a launch.
   */
  public static async checkForUpdates(force = false): Promise<UpdateInfo> {
    const currentVersion = this.getCurrentVersion();
    const checkedAt = new Date().toISOString();

    if (!force && this.cached && Date.now() - Date.parse(this.cached.checkedAt) < CHECK_CACHE_MS) {
      return this.cached;
    }

    try {
      const release = await fetchJson<ReleaseInfo>(RELEASES_URL);
      if (!release || release.draft) {
        return this.remember(this.upToDate(currentVersion, checkedAt));
      }

      const latestVersion = String(release.tag_name || '').trim().replace(/^v/i, '');
      if (!parseVersion(latestVersion)) {
        return this.remember({
          ...this.upToDate(currentVersion, checkedAt),
          status: 'error',
          error: 'The latest release tag is not a valid version number.'
        });
      }

      if (!isNewerVersion(latestVersion, currentVersion)) {
        return this.remember(this.upToDate(currentVersion, checkedAt));
      }

      const asset = selectUpdateAsset(release.assets);
      return this.remember({
        status: 'available',
        currentVersion,
        latestVersion,
        mandatory: isMandatoryUpdate(currentVersion, release),
        releaseName: release.name || `Voxel+ ${latestVersion}`,
        releaseNotes: truncate(stripMarkdown(release.body || ''), 6000),
        releaseUrl: release.html_url || `${RELEASE_PAGE_BASE}/tag/v${latestVersion}`,
        asset: asset ? toAssetInfo(asset) : null,
        canAutoInstall: this.canAutoInstall(),
        portable: this.isPortable(),
        checkedAt
      });
    } catch (error: any) {
      return this.remember({
        status: 'error',
        currentVersion,
        latestVersion: null,
        mandatory: false,
        releaseName: null,
        releaseNotes: null,
        releaseUrl: RELEASE_PAGE_BASE,
        asset: null,
        canAutoInstall: this.canAutoInstall(),
        portable: this.isPortable(),
        checkedAt,
        error: describeNetworkError(error)
      });
    }
  }

  /**
   * Resolves the asset to download from the cached/latest release check instead
   * of trusting metadata supplied by the renderer.
   */
  public static async resolveAssetForDownload(requestedName?: string): Promise<UpdateAssetInfo> {
    const info = await this.checkForUpdates(false);
    if (info.status !== 'available' || !info.asset) {
      throw new Error('No update is available to download.');
    }
    if (requestedName && requestedName !== info.asset.name) {
      throw new Error('The requested update file does not match the latest release.');
    }
    return info.asset;
  }

  /**
   * Downloads a release asset into the launcher's user data directory
   * (`downloads/updates/`). Nothing outside that folder is written.
   *
   * Security contract:
   *  - the release must publish a SHA-256 digest (never install unverified code);
   *  - redirects are followed at most 5 times and every hop must stay on a
   *    trusted GitHub host;
   *  - the transfer is capped in size and aborts after 30s of inactivity;
   *  - partial files are removed on every failure and concurrent calls share one
   *    download instead of racing over the same staging file.
   */
  public static async downloadUpdate(asset: UpdateAssetInfo): Promise<string> {
    if (!asset?.url) throw new Error('No update download is available for this release.');
    if (!asset.sha256) {
      throw new Error(
        'This release does not publish a SHA-256 digest for its launcher file, so automatic installation is disabled. Download the update manually from the release page.'
      );
    }
    assertAllowedDownloadUrl(asset.url);

    // Serialise concurrent requests (double-click / retry) over the same staging file.
    if (this.downloadInFlight) return this.downloadInFlight;
    const task = this.performDownload(asset);
    this.downloadInFlight = task;
    try {
      return await task;
    } finally {
      if (this.downloadInFlight === task) this.downloadInFlight = null;
    }
  }

  private static async performDownload(asset: UpdateAssetInfo): Promise<string> {
    const updatesDir = path.join(PathManager.getDownloadsDir(), 'updates');
    if (!fs.existsSync(updatesDir)) fs.mkdirSync(updatesDir, { recursive: true });

    const safeName = PathManager.sanitizeFilename(path.basename(asset.name || 'VoxelPlus-Portable.exe'));
    const fileName = safeName || 'VoxelPlus-Portable.exe';
    const destination = path.join(updatesDir, fileName);
    const partial = `${destination}.partial`;

    if (await this.fileMatches(destination, asset)) {
      this.staged = { name: fileName, filePath: destination, size: asset.size, sha256: asset.sha256! };
      return destination;
    }

    fs.rmSync(partial, { force: true });
    const sha256 = asset.sha256!;

    try {
      const received = await this.streamToFile(asset, partial, fileName);
      if (received !== asset.size) {
        throw new Error(`Update download was incomplete (${received} of ${asset.size} bytes).`);
      }
      const digest = await hashFile(partial);
      if (digest.toLowerCase() !== sha256.toLowerCase()) {
        throw new Error('Update download failed its SHA-256 integrity check.');
      }
      fs.renameSync(partial, destination);
      this.staged = { name: fileName, filePath: destination, size: received, sha256 };
      this.emitProgress({ received, total: received, percent: 100, fileName });
      return destination;
    } catch (error) {
      fs.rmSync(partial, { force: true });
      throw error;
    }
  }

  /**
   * Streams an asset to `partial`, following a bounded number of redirects.
   * Returns the number of bytes written.
   */
  private static streamToFile(asset: UpdateAssetInfo, partial: string, fileName: string): Promise<number> {
    const MAX_REDIRECTS = 5;
    const IDLE_TIMEOUT_MS = 30_000;
    const MAX_BYTES = 512 * 1024 * 1024;

    return new Promise<number>((resolve, reject) => {
      let bytesReceived = 0;
      let settled = false;
      let lastPercent = -1;
      const output = fs.createWriteStream(partial);

      const fail = (error: Error): void => {
        if (settled) return;
        settled = true;
        output.destroy();
        reject(error);
      };

      const request = (url: string, redirects: number): void => {
        if (redirects > MAX_REDIRECTS) {
          fail(new Error('Too many redirects while downloading the update.'));
          return;
        }

        let hop: URL;
        try {
          hop = new URL(url);
          assertAllowedDownloadUrl(hop.toString());
        } catch (error: any) {
          fail(error instanceof Error ? error : new Error(String(error)));
          return;
        }

        const req = https.get(
          hop,
          {
            headers: {
              'User-Agent': `VoxelPlus-Launcher/${this.getCurrentVersion()}`,
              Accept: 'application/octet-stream'
            }
          },
          response => {
            const status = response.statusCode || 0;

            if (status >= 300 && status < 400 && response.headers.location) {
              response.resume();
              // Relative redirects are resolved against the current hop.
              const next = new URL(String(response.headers.location), hop).toString();
              request(next, redirects + 1);
              return;
            }

            if (status !== 200) {
              response.resume();
              fail(new Error(`Update download failed with HTTP ${status}.`));
              return;
            }

            const advertised = Number(response.headers['content-length'] || 0);
            if (advertised > MAX_BYTES) {
              response.destroy();
              fail(new Error('The update download is larger than the launcher allows.'));
              return;
            }

            const total = advertised > 0 ? advertised : asset.size;

            response.on('data', (chunk: Buffer) => {
              bytesReceived += chunk.length;
              if (bytesReceived > MAX_BYTES) {
                req.destroy();
                fail(new Error('The update download is larger than the launcher allows.'));
                return;
              }
              const percent = total > 0 ? Math.min(100, Math.round((bytesReceived / total) * 100)) : 0;
              if (percent !== lastPercent) {
                lastPercent = percent;
                this.emitProgress({ received: bytesReceived, total, percent, fileName });
              }
            });

            response.on('aborted', () => fail(new Error('The update download was interrupted.')));
            response.on('error', fail);
            response.pipe(output, { end: true });
          }
        );

        req.on('error', fail);
        req.setTimeout(IDLE_TIMEOUT_MS, () => {
          req.destroy(new Error('The update download timed out.'));
        });
      };

      output.on('error', fail);
      output.on('finish', () => {
        output.close(done => {
          if (settled) return;
          if (done) {
            fail(done);
            return;
          }
          settled = true;
          resolve(bytesReceived);
        });
      });

      request(asset.url, 0);
    });
  }

  /**
   * Stages the downloaded build and relaunches it.
   *
   * Data safety: the helper only replaces the launcher executable and keeps a
   * `.old` backup. It never touches the portable data folder, instances,
   * configuration, VPack caches or the player profile.
   *
   * Installation refuses to continue unless the staged file still matches the
   * size and SHA-256 digest published by the release, so a file swapped on disk
   * between download and install can never be executed.
   */
  public static async installUpdate(): Promise<UpdateInstallResult> {
    if (process.platform !== 'win32') {
      return { started: false, reason: 'unsupported-platform' };
    }
    if (!this.canAutoInstall()) {
      return { started: false, reason: 'not-packaged' };
    }
    if (this.installInFlight) {
      return { started: false, reason: 'install-in-progress' };
    }
    if (!this.staged || !fs.existsSync(this.staged.filePath)) {
      return { started: false, reason: 'nothing-downloaded' };
    }
    if (!this.staged.sha256) {
      return { started: false, reason: 'integrity-unavailable' };
    }

    const target = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
    if (!target || !/\.exe$/i.test(target) || !fs.existsSync(target)) {
      return { started: false, reason: 'target-not-found' };
    }
    if (path.resolve(target).toLowerCase() === path.resolve(this.staged.filePath).toLowerCase()) {
      return { started: false, reason: 'invalid-target' };
    }

    const { filePath, size, sha256 } = this.staged;
    try {
      const stat = fs.statSync(filePath);
      if (size > 0 && stat.size !== size) {
        fs.rmSync(filePath, { force: true });
        this.staged = null;
        return { started: false, reason: 'integrity-check-failed' };
      }
      const digest = await hashFile(filePath);
      if (digest.toLowerCase() !== sha256.toLowerCase()) {
        fs.rmSync(filePath, { force: true });
        this.staged = null;
        return { started: false, reason: 'integrity-check-failed' };
      }
    } catch {
      return { started: false, reason: 'integrity-check-failed' };
    }

    this.installInFlight = true;

    const workDir = path.join(os.tmpdir(), `voxelplus-update-${crypto.randomUUID()}`);
    fs.mkdirSync(workDir, { recursive: true });
    const scriptPath = path.join(workDir, 'apply-update.cmd');
    const logPath = path.join(workDir, 'update.log');
    fs.writeFileSync(scriptPath, buildApplyUpdateScript(), 'utf-8');

    try {
      const helper = spawn(
        process.env.ComSpec || 'cmd.exe',
        ['/d', '/c', scriptPath, String(process.pid), filePath, target, logPath],
        { detached: true, stdio: 'ignore', windowsHide: true }
      );
      helper.unref();
    } catch (error) {
      console.error('[updates] Failed to start the update helper:', error);
      this.installInFlight = false;
      return { started: false, reason: 'helper-spawn-failed' };
    }

    // Let the helper start before this process exits.
    setTimeout(() => app.quit(), 400);
    return { started: true };
  }

  /**
   * Removes the `.old` backup left behind by a *successful* previous update.
   *
   * The swap helper deliberately keeps the backup after relaunching so a broken
   * build can still be restored manually. Reaching this code means the new
   * executable started correctly, so the backup is no longer needed. A backup
   * that is still locked (e.g. an antivirus scan) is left for the next start.
   */
  public static cleanupStaleBackup(): void {
    try {
      const target = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
      if (!target) return;
      const backup = `${target}.old`;
      if (fs.existsSync(backup)) fs.rmSync(backup, { force: true });
    } catch {
      // Best-effort housekeeping; never block startup.
    }
  }

  public static async openReleasePage(url?: string): Promise<boolean> {
    const target = url || RELEASE_PAGE_BASE;
    let parsed: URL;
    try {
      parsed = new URL(target);
    } catch {
      return false;
    }
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com') return false;
    if (!parsed.pathname.startsWith(`/${OWNER}/${REPO}/releases`)) return false;
    await shell.openExternal(parsed.toString());
    return true;
  }

  private static upToDate(currentVersion: string, checkedAt: string): UpdateInfo {
    return {
      status: 'up-to-date',
      currentVersion,
      latestVersion: currentVersion,
      mandatory: false,
      releaseName: null,
      releaseNotes: null,
      releaseUrl: RELEASE_PAGE_BASE,
      asset: null,
      canAutoInstall: this.canAutoInstall(),
      portable: this.isPortable(),
      checkedAt
    };
  }

  private static remember(info: UpdateInfo): UpdateInfo {
    this.cached = info;
    return info;
  }

  private static async fileMatches(filePath: string, asset: UpdateAssetInfo): Promise<boolean> {
    try {
      if (!asset.sha256) return false;
      const stat = fs.statSync(filePath);
      if (asset.size <= 0 || stat.size !== asset.size) return false;
      const digest = await hashFile(filePath);
      return digest.toLowerCase() === asset.sha256.toLowerCase();
    } catch {
      return false;
    }
  }

  private static emitProgress(event: UpdateProgressEvent): void {
    for (const listener of this.progressListeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('Error in update progress listener:', error);
      }
    }
  }
}

function toAssetInfo(asset: SelectedAsset): UpdateAssetInfo {
  return { name: asset.name, url: asset.url, size: asset.size, sha256: asset.sha256 };
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}\n…` : value;
}

/** Release bodies are Markdown; the renderer displays plain text. */
function stripMarkdown(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

function describeNetworkError(error: any): string {
  const code = error?.code || '';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'Could not reach GitHub (offline or DNS unavailable).';
  if (code === 'ETIMEDOUT' || /timed out/i.test(error?.message || '')) return 'GitHub did not respond in time.';
  if (/rate limit/i.test(error?.message || '')) return 'GitHub API rate limit reached; try again later.';
  return error?.message || 'Update check failed.';
}

function assertAllowedDownloadUrl(rawUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Update download URL is invalid.');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('Update downloads must use HTTPS.');
  }
  if (!ALLOWED_DOWNLOAD_HOSTS.includes(parsed.hostname.toLowerCase())) {
    throw new Error(`Refusing to download an update from an untrusted host: ${parsed.hostname}`);
  }
}

function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function fetchJson<T>(url: string, redirects = 0): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (redirects > 5) {
      reject(new Error('Too many redirects while contacting GitHub.'));
      return;
    }
    const request = https.get(url, {
      headers: {
        'User-Agent': 'VoxelPlus-Launcher',
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    }, response => {
      const status = response.statusCode || 0;
      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume();
        fetchJson<T>(response.headers.location, redirects + 1).then(resolve, reject);
        return;
      }
      if (status === 404) {
        response.resume();
        reject(new Error('No published GitHub release was found.'));
        return;
      }
      if (status === 403) {
        response.resume();
        reject(new Error('GitHub API rate limit reached; try again later.'));
        return;
      }
      if (status !== 200) {
        response.resume();
        reject(new Error(`GitHub API returned HTTP ${status}.`));
        return;
      }

      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > 2 * 1024 * 1024) {
          request.destroy(new Error('GitHub response was unexpectedly large.'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')) as T);
        } catch (error) {
          reject(error);
        }
      });
      response.on('error', reject);
    });

    request.on('error', reject);
    request.setTimeout(REQUEST_TIMEOUT_MS, () => request.destroy(new Error('GitHub request timed out.')));
  });
}
