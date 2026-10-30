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
import { VoxelError } from '../diagnostics';
import { VPackManager } from '../vpack/vpackManager';
import { ModrinthPackImporter } from '../vpack/modrinthPackImporter';
import { CurseForgePackImporter } from '../vpack/curseForgePackImporter';
import { LoaderRegistry } from './loaderProvider';
import { AchievementEngine } from '../player/achievementEngine';

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
    if (!instanceId || typeof instanceId !== 'string') return null;
    const meta = await this.getInstance(instanceId);
    if (meta && meta.instancePath && fs.existsSync(meta.instancePath)) {
      return meta.instancePath;
    }
    return null;
  }

  public static async createInstance(payload: CreateInstancePayload): Promise<InstanceMetadata> {
    const loaderType = payload.loaderType || 'fabric';
    const minecraftVersion = payload.minecraftVersion || '1.21.1';

    try {
      const provider = LoaderRegistry.getProvider(loaderType);
    } catch (err: any) {
      throw new VoxelError({
        title: 'Invalid Loader Type',
        message: `The loader type "${loaderType}" is not recognized.`,
        cause: err.message,
        suggestedAction: 'Please select a valid loader: fabric, quilt, forge, or neoforge.',
        code: 'INVALID_LOADER_TYPE',
        category: 'INSTANCE',
        severity: 'ERROR'
      });
    }

    if (!LoaderRegistry.isCombinationSupported(loaderType, minecraftVersion)) {
      const provider = LoaderRegistry.getProvider(loaderType);
      throw new VoxelError({
        title: 'Unsupported loader combination',
        message: `${provider.displayName} does not support Minecraft ${minecraftVersion} in this release.`,
        cause: 'The selected loader and Minecraft version do not have a verified Voxel+ setup profile.',
        suggestedAction: `Choose one of the supported ${provider.displayName} versions: ${provider.supportedMinecraftVersions.join(', ')}.`,
        code: 'LOADER_VERSION_UNSUPPORTED',
        category: 'INSTANCE',
        severity: 'ERROR'
      });
    }
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

    // Track achievements
    const engine = new AchievementEngine();
    const allInstances = await InstanceManager.listInstances();
    engine.trackProgress('first_instance', 1);
    engine.trackProgress('instance_collector', allInstances.length, true);
    engine.trackProgress('instance_master', allInstances.length, true);
    engine.checkWinCondition();

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
    const newFolderName = PathManager.sanitizeFilename(newName).trim() || `instance-copy-${Date.now()}`;
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
      instancePath: targetDir,
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
      new VoxelError({
        title: 'Instance Deletion Failed',
        message: `The instance folder could not be deleted.`,
        cause: 'Files may be locked by another program (e.g. a still-running Minecraft or Gradle process).',
        suggestedAction: 'Close any programs using the instance folder, then delete the instance again or remove the folder manually.',
        code: 'INSTANCE_DELETE_FAILED',
        category: 'INSTANCE',
        severity: 'ERROR',
        details: `Instance folder: ${instanceDir}`,
        originalError: e
      }).log();
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
      const meta = InstanceMetadataStore.readMetadata(instanceDir);
      if (!meta) return false;

      const res = VPackManager.exportVPack(instanceDir, meta, exportDestinationZip);
      return res.success;
    } catch (e) {
      new VoxelError({
        title: 'Instance Export Failed',
        message: 'The instance could not be exported to a zip package.',
        cause: 'The target path may be read-only, out of disk space, or the instance folder may be partially locked.',
        suggestedAction: 'Choose a different save location with enough free space and try again.',
        code: 'INSTANCE_EXPORT_FAILED',
        category: 'FILESYSTEM',
        severity: 'ERROR',
        details: `Instance: ${instanceDir}; target: ${exportDestinationZip}`,
        originalError: e
      }).log();
      return false;
    }
  }

  public static async importInstance(importZipPath: string, customName?: string): Promise<InstanceMetadata | null> {
    // Validate source file path
    if (!importZipPath || typeof importZipPath !== 'string') {
      new VoxelError({
        title: 'Instance Import Failed',
        message: 'Invalid package path provided.',
        cause: 'The package path is missing or invalid.',
        suggestedAction: 'Select a valid package file and try again.',
        code: 'INVALID_PACKAGE_PATH',
        category: 'FILESYSTEM',
        severity: 'ERROR'
      }).log();
      return null;
    }

    // Normalize the source path for validation
    const normalizedSource = path.resolve(importZipPath);

    // Reject UNC paths or obvious path traversal attempts
    if (normalizedSource.includes('..') || normalizedSource.startsWith('\\\\')) {
      new VoxelError({
        title: 'Instance Import Failed',
        message: 'Invalid package path.',
        cause: 'The package path contains invalid path components.',
        suggestedAction: 'Select a valid package file from a standard location.',
        code: 'INVALID_PATH_COMPONENTS',
        category: 'FILESYSTEM',
        severity: 'ERROR',
        details: `Package path: ${importZipPath}`
      }).log();
      return null;
    }

    if (!fs.existsSync(importZipPath)) {
      new VoxelError({
        title: 'Instance Import Failed',
        message: 'The selected package could not be found on disk.',
        cause: 'The file may have been moved or deleted after being selected.',
        suggestedAction: 'Re-select the .voxelplus package and try again.',
        code: 'SOURCE_FILE_NOT_FOUND',
        category: 'FILESYSTEM',
        severity: 'ERROR',
        details: `Package path: ${importZipPath}`
      }).log();
      return null;
    }

    // Ensure source is a file, not a directory
    const sourceStat = fs.statSync(importZipPath);
    if (!sourceStat.isFile()) {
      new VoxelError({
        title: 'Instance Import Failed',
        message: 'The selected path is not a file.',
        cause: 'Only files can be imported. Directories are not supported.',
        suggestedAction: 'Select a valid package file (e.g., .vpack, .mrpack, .zip) and try again.',
        code: 'NOT_A_FILE',
        category: 'FILESYSTEM',
        severity: 'ERROR',
        details: `Package path: ${importZipPath}`
      }).log();
      return null;
    }

    // Use temp directory for atomic import
    const baseDir = ConfigStore.getInstanceDirectory();
    const tempDir = path.join(baseDir, '.temp-import-' + crypto.randomUUID());
    let finalTargetDir: string | null = null;

    try {
      const suggestedName = customName || path.basename(importZipPath, path.extname(importZipPath));
      const folderName = PathManager.sanitizeFilename(suggestedName).trim() || `imported-${Date.now()}`;

      finalTargetDir = path.join(baseDir, folderName);
      let counter = 1;
      while (fs.existsSync(finalTargetDir)) {
        finalTargetDir = path.join(baseDir, `${folderName} (${counter++})`);
      }

      PathManager.ensureDirectory(tempDir);

      // 1. Check if the file is a Modrinth .mrpack
      const mrpackVal = ModrinthPackImporter.validateMrpack(importZipPath);
      if (mrpackVal.valid) {
        const mrpackRes = await ModrinthPackImporter.importMrpack(importZipPath, tempDir, suggestedName);
        if (!mrpackRes.success || !mrpackRes.metadata) {
          throw new Error(mrpackRes.errors.join(', ') || 'Failed to import Modrinth pack.');
        }
        // CRITICAL: Modrinth packs don't include Gradle wrapper - scaffold it
        const scaffolded = await LoomProjectGenerator.generateProject(tempDir, {
          name: customName || mrpackRes.metadata.name || suggestedName,
          description: mrpackRes.metadata.description,
          minecraftVersion: mrpackRes.metadata.minecraft?.version || '1.21.1',
          loaderType: (mrpackRes.metadata.loader?.type as any) || 'fabric',
          loaderVersion: mrpackRes.metadata.loader?.version,
          javaRuntime: 'auto',
          memoryMb: 4096
        });
        fs.renameSync(tempDir, finalTargetDir);
        scaffolded.instancePath = finalTargetDir;
        InstanceMetadataStore.writeMetadata(finalTargetDir, scaffolded);
        return scaffolded;
      }

      // 2. Check if the file is a CurseForge modpack zip
      const cfVal = CurseForgePackImporter.validateCurseForgePack(importZipPath);
      if (cfVal.valid) {
        const cfRes = await CurseForgePackImporter.importCurseForgePack(importZipPath, tempDir, suggestedName);
        if (!cfRes.success || !cfRes.metadata) {
          throw new Error(cfRes.errors.join(', ') || 'Failed to import CurseForge pack.');
        }
        // CRITICAL: CurseForge packs don't include Gradle wrapper - scaffold it
        const scaffolded = await LoomProjectGenerator.generateProject(tempDir, {
          name: customName || cfRes.metadata.name || suggestedName,
          description: cfRes.metadata.description,
          minecraftVersion: cfRes.metadata.minecraft?.version || '1.21.1',
          loaderType: (cfRes.metadata.loader?.type as any) || 'fabric',
          loaderVersion: cfRes.metadata.loader?.version,
          javaRuntime: 'auto',
          memoryMb: 4096
        });
        fs.renameSync(tempDir, finalTargetDir);
        scaffolded.instancePath = finalTargetDir;
        InstanceMetadataStore.writeMetadata(finalTargetDir, scaffolded);
        return scaffolded;
      }

      // 3. Fallback to standard Voxel⁺ VPack validation
      const validation = VPackManager.validateVPack(importZipPath);
      if (!validation.valid) {
        new VoxelError({
          title: 'Invalid Modpack or VPack File',
          message: 'The selected file is not a valid Voxel⁺ VPack, Modrinth .mrpack, or CurseForge package.',
          cause: 'The file may be corrupt, missing required metadata, or an unsupported format.',
          suggestedAction: `Validation errors: ${validation.errors.join(', ')}`,
          code: 'INVALID_VPACK',
          category: 'INSTANCE',
          severity: 'ERROR',
          details: `Package path: ${importZipPath}\nErrors: ${validation.errors.join('\n')}`
        }).log();
        return null;
      }

      // Extract VPack to temp directory
      const extractResult = await VPackManager.extractVPack(importZipPath, tempDir);
      if (!extractResult.success) {
        throw new Error(extractResult.error || 'Failed to extract package.');
      }

      // A Modrinth .mrpack may contain only its content and index metadata.
      // Imported VPacks still need the launcher's Loom project scaffold so the
      // instance can be started through the normal ProcessManager path.
      let meta = InstanceMetadataStore.readMetadata(tempDir);

      if (!fs.existsSync(path.join(tempDir, 'build.gradle')) || !fs.existsSync(path.join(tempDir, 'gradlew.bat'))) {
        const packManifest = extractResult.manifest;
        if (packManifest) {
          const scaffolded = await LoomProjectGenerator.generateProject(tempDir, {
            name: customName || packManifest.name || suggestedName,
            description: packManifest.description,
            minecraftVersion: packManifest.minecraft?.version || '1.21.1',
            loaderType: (packManifest.loader?.type as any) || 'fabric',
            loaderVersion: packManifest.loader?.version,
            javaRuntime: 'auto',
            memoryMb: 4096,
            artwork: packManifest.artwork || null,
            item: packManifest.item,
            shareSource: packManifest.shareSource
          });
          // Re-read metadata after scaffolding to get the instancePath
          meta = InstanceMetadataStore.readMetadata(tempDir);
        }
      }

      // Re-read or synthesize metadata from extracted manifest
      if (!meta) {
        // Use manifest if available, otherwise create default
        if (extractResult.manifest) {
          meta = InstanceMetadataStore.createDefaultMetadata({
            name: customName || extractResult.manifest.name || suggestedName,
            minecraftVersion: extractResult.manifest.minecraft?.version || '1.21.1',
            loaderType: (extractResult.manifest.loader?.type as any) || 'fabric'
          });
          // Preserve appearance from manifest
          if (extractResult.manifest.item) {
            meta.appearance.item = extractResult.manifest.item;
          }
          if (extractResult.manifest.artwork) {
            meta.appearance.artwork = extractResult.manifest.artwork;
          }
          // Set instancePath
          meta.instancePath = tempDir;
          InstanceMetadataStore.writeMetadata(tempDir, meta);
        } else {
          // No manifest - create default instance
          meta = InstanceMetadataStore.createDefaultMetadata({
            name: suggestedName,
            minecraftVersion: '1.21.1',
            loaderType: 'fabric'
          });
          meta.instancePath = tempDir;
          InstanceMetadataStore.writeMetadata(tempDir, meta);
        }
      } else {
        // Ensure instancePath is set
        meta.instancePath = tempDir;
        InstanceMetadataStore.writeMetadata(tempDir, meta);
      }

      // The manifest is authoritative for pack identity and appearance. Legacy
      // voxel-instance.json files often contain stale/default icons, which used
      // to overwrite the icon selected by the pack creator during import.
      if (extractResult.manifest) {
        meta.id = crypto.randomUUID();
        meta.name = customName || extractResult.manifest.name || meta.name;
        meta.description = extractResult.manifest.description || meta.description;
        meta.minecraft.version = extractResult.manifest.minecraft.version;
        meta.loader = {
          type: extractResult.manifest.loader.type,
          version: extractResult.manifest.loader.version
        };
        meta.appearance = {
          ...meta.appearance,
          item: extractResult.manifest.item || meta.appearance.item,
          artwork: extractResult.manifest.artwork || meta.appearance.artwork
        };
        meta.shareSource = extractResult.manifest.shareSource || meta.shareSource;
      } else {
        meta.id = crypto.randomUUID();
        if (customName) meta.name = customName;
      }

      // Mark as VPack import
      meta.isVPack = true;

      InstanceMetadataStore.writeMetadata(tempDir, meta);

      // Atomic move: rename temp directory to final target
      fs.renameSync(tempDir, finalTargetDir);

      // Update instancePath to final location
      meta.instancePath = finalTargetDir;
      InstanceMetadataStore.writeMetadata(finalTargetDir, meta);

      return meta;
    } catch (e) {
      // Cleanup temp directory on failure
      try {
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      } catch (cleanupError) {
        console.error('Failed to cleanup temp import directory:', cleanupError);
      }
      
      new VoxelError({
        title: 'Instance Import Failed',
        message: 'The selected package could not be imported as an instance.',
        cause: 'The file may be corrupt, not a Voxel⁺/zip package, or locked by another program.',
        suggestedAction: 'Verify the package file (a valid .voxelplus zip) and that it is not open elsewhere, then try again.',
        code: 'INSTANCE_IMPORT_FAILED',
        category: 'INSTANCE',
        severity: 'ERROR',
        details: `Package path: ${importZipPath}`,
        originalError: e
      }).log();
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
