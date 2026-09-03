import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DownloadProgressEvent } from '../../types';
import { InstanceManager } from '../instances/instanceManager';

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
      return { success: false, filename: '', error: 'Target instance not found.' };
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
        throw new Error(`Download HTTP error ${response.status}`);
      }

      const totalBytes = Number(response.headers.get('content-length')) || 0;
      let receivedBytes = 0;

      if (!response.body) {
        throw new Error('Response body is empty');
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
      console.error(`Failed to download ${filename}:`, e);
      this.emit({
        downloadId,
        itemTitle: projectTitle,
        bytesReceived: 0,
        totalBytes: 0,
        percentage: 0,
        status: 'failed',
        error: e.message
      });

      if (fs.existsSync(destinationPath)) {
        try { fs.unlinkSync(destinationPath); } catch {}
      }

      return { success: false, filename, error: e.message };
    }
  }
}
