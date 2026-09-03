import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { shell } from 'electron';
import AdmZip from 'adm-zip';
import { InstanceMetadata, CreateInstancePayload } from '../../types';
import { InstanceMetadataStore } from './metadata';
import { LoomProjectGenerator } from './loomGenerator';
import { ConfigStore } from '../storage/configStore';
import { PathManager } from '../storage/paths';
import { ProcessManager } from '../processes/processManager';

export class InstanceManager {
  public static async listInstances(): Promise<InstanceMetadata[]> {
    const baseDir = ConfigStore.getInstanceDirectory();
    PathManager.ensureDirectory(baseDir);

    const instances: InstanceMetadata[] = [];
    const entries = fs.readdirSync(baseDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const fullDir = path.join(baseDir, entry.name);
        const meta = InstanceMetadataStore.readMetadata(fullDir);
        if (meta) {
          // Check live running status
          meta.status = ProcessManager.getStatus(meta.id);
          instances.push(meta);
        }
      }
    }

    // Sort: Favorites first, then by lastPlayedAt or createdAt descending
    return instances.sort((a, b) => {
      if (a.isFavorite && !b.isFavorite) return -1;
      if (!a.isFavorite && b.isFavorite) return 1;

      const timeA = a.lastPlayedAt ? new Date(a.lastPlayedAt).getTime() : new Date(a.createdAt).getTime();
      const timeB = b.lastPlayedAt ? new Date(b.lastPlayedAt).getTime() : new Date(b.createdAt).getTime();
      return timeB - timeA;
    });
  }

  public static async getInstance(instanceId: string): Promise<InstanceMetadata | null> {
    const instances = await this.listInstances();
    return instances.find(i => i.id === instanceId) || null;
  }

  public static async getInstanceDir(instanceId: string): Promise<string | null> {
    const meta = await this.getInstance(instanceId);
    return meta ? (meta.instancePath || null) : null;
  }

  public static async createInstance(payload: CreateInstancePayload): Promise<InstanceMetadata> {
    const baseDir = ConfigStore.getInstanceDirectory();
    PathManager.ensureDirectory(baseDir);

    const folderName = PathManager.sanitizeFilename(payload.name).trim() || `instance-${Date.now()}`;
    let targetDir = path.join(baseDir, folderName);

    // If folder exists, append counter
    let counter = 1;
    while (fs.existsSync(targetDir)) {
      targetDir = path.join(baseDir, `${folderName} (${counter++})`);
    }

    const metadata = await LoomProjectGenerator.generateProject(targetDir, payload);
    return metadata;
  }

  public static async updateInstance(instanceId: string, updates: Partial<InstanceMetadata>): Promise<InstanceMetadata | null> {
    const instanceDir = await this.getInstanceDir(instanceId);
    if (!instanceDir) return null;

    const current = InstanceMetadataStore.readMetadata(instanceDir);
    if (!current) return null;

    const updated: InstanceMetadata = {
      ...current,
      ...updates,
      id: current.id // Ensure ID remains immutable
    };

    InstanceMetadataStore.writeMetadata(instanceDir, updated);
    return updated;
  }

  public static async duplicateInstance(instanceId: string): Promise<InstanceMetadata | null> {
    const sourceDir = await this.getInstanceDir(instanceId);
    if (!sourceDir) return null;

    const sourceMeta = InstanceMetadataStore.readMetadata(sourceDir);
    if (!sourceMeta) return null;

    const baseDir = ConfigStore.getInstanceDirectory();
    const newName = `${sourceMeta.name} (Copy)`;
    const newFolderName = PathManager.sanitizeFilename(newName);
    let targetDir = path.join(baseDir, newFolderName);

    let counter = 1;
    while (fs.existsSync(targetDir)) {
      targetDir = path.join(baseDir, `${newFolderName} (${counter++})`);
    }

    // Copy entire directory except volatile gradle daemon/build caches
    this.copyDirectoryExcluding(sourceDir, targetDir, ['.gradle', 'build', '.idea', 'run']);

    // Generate new unique ID & metadata
    const newId = crypto.randomUUID();
    const newMeta: InstanceMetadata = {
      ...sourceMeta,
      id: newId,
      name: newName,
      createdAt: new Date().toISOString(),
      lastPlayedAt: null,
      status: 'READY'
    };

    InstanceMetadataStore.writeMetadata(targetDir, newMeta);
    return newMeta;
  }

  public static async deleteInstance(instanceId: string): Promise<boolean> {
    const instanceDir = await this.getInstanceDir(instanceId);
    if (!instanceDir) return false;

    // Stop if running
    if (ProcessManager.isRunning(instanceId)) {
      await ProcessManager.stopInstance(instanceId);
    }

    try {
      fs.rmSync(instanceDir, { recursive: true, force: true });
      return true;
    } catch (e) {
      console.error(`Failed to delete instance at ${instanceDir}:`, e);
      return false;
    }
  }

  public static async openInstanceFolder(instanceId: string): Promise<boolean> {
    const instanceDir = await this.getInstanceDir(instanceId);
    if (!instanceDir || !fs.existsSync(instanceDir)) return false;

    await shell.openPath(instanceDir);
    return true;
  }

  public static async exportInstance(instanceId: string, exportDestinationZip: string): Promise<boolean> {
    const instanceDir = await this.getInstanceDir(instanceId);
    if (!instanceDir) return false;

    try {
      const zip = new AdmZip();
      
      // Include metadata, mods, resourcepacks, shaderpacks, config, saves, build scripts
      const allowedRoots = [
        'voxel-instance.json',
        'build.gradle',
        'gradle.properties',
        'settings.gradle',
        'gradlew.bat',
        'gradlew',
        'gradle',
        'src',
        'mods',
        'resourcepacks',
        'shaderpacks',
        'config',
        'saves'
      ];

      for (const item of allowedRoots) {
        const itemPath = path.join(instanceDir, item);
        if (fs.existsSync(itemPath)) {
          const stat = fs.statSync(itemPath);
          if (stat.isDirectory()) {
            zip.addLocalFolder(itemPath, item);
          } else {
            zip.addLocalFile(itemPath);
          }
        }
      }

      zip.writeZip(exportDestinationZip);
      return true;
    } catch (e) {
      console.error('Failed to export instance:', e);
      return false;
    }
  }

  public static async importInstance(importZipPath: string, customName?: string): Promise<InstanceMetadata | null> {
    if (!fs.existsSync(importZipPath)) return null;

    try {
      const zip = new AdmZip(importZipPath);
      const baseDir = ConfigStore.getInstanceDirectory();

      const suggestedName = customName || path.basename(importZipPath, path.extname(importZipPath));
      const folderName = PathManager.sanitizeFilename(suggestedName);
      let targetDir = path.join(baseDir, folderName);

      let counter = 1;
      while (fs.existsSync(targetDir)) {
        targetDir = path.join(baseDir, `${folderName} (${counter++})`);
      }

      PathManager.ensureDirectory(targetDir);
      zip.extractAllTo(targetDir, true);

      // Re-read or synthesize metadata
      let meta = InstanceMetadataStore.readMetadata(targetDir);
      if (!meta) {
        meta = InstanceMetadataStore.createDefaultMetadata({
          name: suggestedName,
          minecraftVersion: '1.21.1',
          loaderType: 'fabric'
        });
      } else {
        meta.id = crypto.randomUUID(); // Assign new fresh ID
        if (customName) meta.name = customName;
      }

      InstanceMetadataStore.writeMetadata(targetDir, meta);
      return meta;
    } catch (e) {
      console.error('Failed to import instance:', e);
      return null;
    }
  }

  private static copyDirectoryExcluding(src: string, dest: string, exclude: string[]): void {
    PathManager.ensureDirectory(dest);
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      if (exclude.includes(entry.name)) continue;

      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        this.copyDirectoryExcluding(srcPath, destPath, exclude);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}
