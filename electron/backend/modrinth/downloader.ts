import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DownloadProgressEvent } from '../../types';
import { InstanceManager } from '../instances/instanceManager';
import { VoxelError } from '../diagnostics';

export class DownloadManager {
  private static listeners: ((event: DownloadProgressEvent) => void)[] = [];

  public static onProgress(listener: (event: DownloadProgressEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private static emit(event: DownloadProgressEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (e) {
        console.error('Error in download listener:', e);
      }
    }
  }

  public static async downloadToInstance(
    instanceId: string,
    fileUrl: string,
    filename: string,
    projectTitle: string,
    projectType: 'mod' | 'resourcepack' | 'shader' = 'mod'
  ): Promise<{ success: boolean; filename: string; error?: string }> {
    const instanceDir = await InstanceManager.getInstanceDir(instanceId);
    if (!instanceDir) {
      const error = new VoxelError({
        title: 'Download Failed',
        message: `Could not resolve instance "${instanceId}" to an installation directory. The instance metadata is missing or invalid.`,
        cause: 'The instance folder or metadata file may have been moved or deleted.',
        suggestedAction: 'Refresh the instances list and select a valid target instance.',
        code: 'INSTANCE_NOT_FOUND',
        category: 'INSTANCE',
        severity: 'ERROR'
      });
      error.log();
      return { success: false, filename: '', error: error.message };
    }

    let subfolder = 'mods';
    if (projectType === 'resourcepack') subfolder = 'resourcepacks';
    if (projectType === 'shader') subfolder = 'shaderpacks';

    const targetDir = path.join(instanceDir, subfolder);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const destinationPath = path.join(targetDir, filename);
    const downloadId = crypto.randomUUID();

    this.emit({
      downloadId,
      itemTitle: projectTitle,
      bytesReceived: 0,
      totalBytes: 0,
      percentage: 0,
      status: 'downloading'
    });

    try {
      const response = await fetch(fileUrl, {
        headers: { 'User-Agent': 'VoxelPlus/1.0.0' }
      });

      if (!response.ok) {
        throw new VoxelError({
          title: 'Download Failed',
          message: `Modrinth returned an unexpected response while downloading "${filename}".`,
          cause: response.status === 404
            ? 'The file is no longer available on Modrinth.'
            : `The Modrinth CDN responded with HTTP ${response.status}.`,
          suggestedAction: 'Try again later, or download the file manually from the Modrinth page and import it.',
          code: 'DOWNLOAD_HTTP_ERROR',
          category: 'DOWNLOAD',
          severity: 'ERROR',
          details: `URL: ${fileUrl}; HTTP status: ${response.status}`
        });
      }

      const totalBytes = Number(response.headers.get('content-length')) || 0;
      let receivedBytes = 0;

      if (!response.body) {
        throw new VoxelError({
          title: 'Download Failed',
          message: `The download stream for "${filename}" was empty.`,
          cause: 'The server closed the connection without sending data.',
          suggestedAction: 'Check your network connection and try again.',
          code: 'DOWNLOAD_EMPTY_RESPONSE',
          category: 'DOWNLOAD',
          severity: 'ERROR',
          details: `URL: ${fileUrl}`
        });
      }

      const fileStream = fs.createWriteStream(destinationPath);
      const reader = response.body.getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        receivedBytes += value.length;
        fileStream.write(Buffer.from(value));

        const percentage = totalBytes > 0 ? Math.min(100, Math.round((receivedBytes / totalBytes) * 100)) : 50;

        this.emit({
          downloadId,
          itemTitle: projectTitle,
          bytesReceived: receivedBytes,
          totalBytes,
          percentage,
          status: 'downloading'
        });
      }

      await new Promise((resolve, reject) => {
        fileStream.end(() => resolve(true));
        fileStream.on('error', reject);
      });

      this.emit({
        downloadId,
        itemTitle: projectTitle,
        bytesReceived: receivedBytes,
        totalBytes: receivedBytes,
        percentage: 100,
        status: 'completed'
      });

      return { success: true, filename };
    } catch (e: any) {
      // Classify low-level fetch failures (DNS, offline, aborted) for users.
      const error =
        e instanceof VoxelError
          ? e
          : new VoxelError({
              title: 'Download Failed',
              message: `"${filename}" could not be downloaded.`,
              cause:
                e instanceof TypeError
                  ? 'Modrinth could not be reached (network unreachable, DNS failure, or offline).'
                  : 'An unexpected error occurred while writing or receiving the file.',
              suggestedAction:
                e instanceof TypeError
                  ? 'Check your internet connection, then retry the download.'
                  : 'Free up disk space if needed and retry; technical details are in the logs.',
              code: e instanceof TypeError ? 'NETWORK_UNREACHABLE' : 'DOWNLOAD_FAILED',
              category: e instanceof TypeError ? 'NETWORK' : 'DOWNLOAD',
              severity: 'ERROR',
              details: `URL: ${fileUrl}; destination: ${destinationPath}`,
              originalError: e
            });
      error.log();
      this.emit({
        downloadId,
        itemTitle: projectTitle,
        bytesReceived: 0,
        totalBytes: 0,
        percentage: 0,
        status: 'failed',
        error: error.message
      });

      if (fs.existsSync(destinationPath)) {
        try { fs.unlinkSync(destinationPath); } catch {}
      }

      return { success: false, filename, error: `${error.message} ${error.suggestedAction ?? ''}`.trim() };
    }
  }
}
