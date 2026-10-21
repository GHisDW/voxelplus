import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import http from 'node:http';
import AdmZip from 'adm-zip';
import { LoaderType, InstanceMetadata } from '../../types';
import { PathManager } from '../storage/paths';
import { VPackManager } from './vpackManager';
import { LoomProjectGenerator } from '../instances/loomGenerator';

export interface CurseForgeFileRef {
  projectID: number;
  fileID: number;
  required?: boolean;
}

export interface CurseForgeModLoader {
  id: string; // e.g. "forge-47.3.0", "fabric-0.16.0", "neoforge-21.1.72", "quilt-0.26.0"
  primary: boolean;
}

export interface CurseForgeManifest {
  minecraft: {
    version: string;
    modLoaders: CurseForgeModLoader[];
  };
  manifestType: string; // "minecraftModpack"
  manifestVersion: number;
  name: string;
  version: string;
  author: string;
  files: CurseForgeFileRef[];
  overrides?: string; // usually "overrides"
}

export interface CurseForgeImportResult {
  success: boolean;
  metadata?: InstanceMetadata;
  resolvedCount: number;
  unresolvedCount: number;
  errors: string[];
  warnings: string[];
}

export class CurseForgePackImporter {
  public static readonly MANIFEST_FILENAME = 'manifest.json';

  /**
   * Validates whether a zip archive is a CurseForge modpack.
   */
  public static validateCurseForgePack(zipPath: string): { valid: boolean; manifest: CurseForgeManifest | null; errors: string[] } {
    const errors: string[] = [];
    if (!fs.existsSync(zipPath)) {
      return { valid: false, manifest: null, errors: ['File does not exist.'] };
    }

    try {
      const zip = new AdmZip(zipPath);
      for (const entry of zip.getEntries()) {
        if (!VPackManager.isSafePath(entry.entryName)) {
          return { valid: false, manifest: null, errors: [`Unsafe archive path traversal entry: ${entry.entryName}`] };
        }
      }

      const manifestEntry = zip.getEntry(this.MANIFEST_FILENAME);
      if (!manifestEntry) {
        return { valid: false, manifest: null, errors: ['Archive missing manifest.json.'] };
      }

      const raw = manifestEntry.getData().toString('utf-8');
      const manifest = JSON.parse(raw) as CurseForgeManifest;

      if (manifest.manifestType !== 'minecraftModpack') {
        errors.push(`Invalid manifestType: ${manifest.manifestType}. Expected 'minecraftModpack'.`);
      }
      if (!manifest.minecraft?.version) {
        errors.push('CurseForge pack missing Minecraft version declaration.');
      }
      if (!Array.isArray(manifest.files)) {
        errors.push('CurseForge pack missing files array.');
      }

      return {
        valid: errors.length === 0,
        manifest: errors.length === 0 ? manifest : null,
        errors
      };
    } catch (e: any) {
      return { valid: false, manifest: null, errors: [`Malformed CurseForge pack: ${e.message}`] };
    }
  }

  /**
   * Resolves loader type and version from CurseForge modLoaders array.
   */
  public static resolveLoader(modLoaders: CurseForgeModLoader[]): { loaderType: LoaderType; loaderVersion?: string } {
    if (!modLoaders || modLoaders.length === 0) {
      return { loaderType: 'forge' }; // CurseForge default legacy loader
    }

    const primary = modLoaders.find(l => l.primary) || modLoaders[0];
    const rawId = (primary.id || '').toLowerCase();

    if (rawId.startsWith('neoforge-')) {
      return { loaderType: 'neoforge', loaderVersion: rawId.replace('neoforge-', '') };
    }
    if (rawId.startsWith('quilt-')) {
      return { loaderType: 'quilt', loaderVersion: rawId.replace('quilt-', '') };
    }
    if (rawId.startsWith('fabric-')) {
      return { loaderType: 'fabric', loaderVersion: rawId.replace('fabric-', '') };
    }
    if (rawId.startsWith('forge-')) {
      return { loaderType: 'forge', loaderVersion: rawId.replace('forge-', '') };
    }

    return { loaderType: 'forge' };
  }

  /**
   * Extracts overrides and configures the instance for a CurseForge pack.
   */
  public static async importCurseForgePack(
    zipPath: string,
    targetDir: string,
    customName?: string
  ): Promise<CurseForgeImportResult> {
    const validation = this.validateCurseForgePack(zipPath);
    if (!validation.valid || !validation.manifest) {
      return {
        success: false,
        resolvedCount: 0,
        unresolvedCount: 0,
        errors: validation.errors,
        warnings: []
      };
    }

    const manifest = validation.manifest;
    const errors: string[] = [];
    const warnings: string[] = [];
    let resolvedCount = 0;
    let unresolvedCount = 0;

    PathManager.ensureDirectory(targetDir);

    const zip = new AdmZip(zipPath);
    const overridesDirName = manifest.overrides || 'overrides';
    const overridePrefix = overridesDirName.endsWith('/') ? overridesDirName : `${overridesDirName}/`;

    // 1. Extract overrides directory
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue;
      if (entry.entryName.startsWith(overridePrefix)) {
        const relPath = entry.entryName.slice(overridePrefix.length);
        if (!VPackManager.isSafePath(relPath)) {
          warnings.push(`Skipping unsafe override: ${relPath}`);
          continue;
        }
        const outPath = path.resolve(targetDir, relPath);
        const root = path.resolve(targetDir) + path.sep;
        if (!outPath.startsWith(root)) {
          warnings.push(`Zip-slip blocked for override: ${relPath}`);
          continue;
        }
        PathManager.ensureDirectory(path.dirname(outPath));
        fs.writeFileSync(outPath, entry.getData());
        resolvedCount++;
      }
    }

    // 2. Note external file dependencies
    const declaredFiles = manifest.files || [];
    for (const f of declaredFiles) {
      // In a self-contained local import, files that cannot be resolved via public mirror
      // are logged as unresolved so the user gets an explicit report.
      unresolvedCount++;
      // Don't fail on unresolved CurseForge files - just warn
      warnings.push(`CurseForge file ${f.projectID}/${f.fileID} could not be resolved. You may need to add this mod manually.`);
    }

    if (declaredFiles.length > 0) {
      warnings.push(
        `${declaredFiles.length} CurseForge mod references recorded. ` +
        `These mods will need to be added manually since CurseForge downloads require API authentication.`
      );
    }

    // 3. Generate project scaffolding
    const mcVersion = manifest.minecraft.version;
    const { loaderType, loaderVersion } = this.resolveLoader(manifest.minecraft.modLoaders);
    const instanceName = customName || manifest.name || path.basename(zipPath, '.zip');

    const metadata = await LoomProjectGenerator.generateProject(targetDir, {
      name: instanceName,
      description: `CurseForge pack: ${manifest.name} v${manifest.version} by ${manifest.author}`,
      minecraftVersion: mcVersion,
      loaderType,
      loaderVersion,
      javaRuntime: 'auto',
      memoryMb: 4096,
      item: 'minecraft:bookshelf',
      shareSource: 'curseforge'
    });

    metadata.isVPack = true;

    return {
      success: errors.length === 0,
      metadata,
      resolvedCount,
      unresolvedCount,
      errors,
      warnings
    };
  }
}
