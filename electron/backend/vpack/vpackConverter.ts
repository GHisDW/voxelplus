import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import AdmZip from 'adm-zip';
import { VPackManifest, VPackContentEntry } from '../../types';
import { VPackManager } from './vpackManager';
import { ModrinthPackImporter, ModrinthIndex } from './modrinthPackImporter';
import { CurseForgePackImporter, CurseForgeManifest } from './curseForgePackImporter';

export interface VPackConversionResult {
  success: boolean;
  outputPath?: string;
  manifest?: VPackManifest;
  physicalFilesCount: number;
  remoteFilesCount: number;
  unresolvedCount: number;
  error?: string;
}

export class VPackConverter {
  /**
   * Converts a Modrinth .mrpack archive into a standard Voxel⁺ .vpack archive.
   */
  public static async convertMrpackToVPack(
    mrpackPath: string,
    outputVPackPath: string
  ): Promise<VPackConversionResult> {
    const val = ModrinthPackImporter.validateMrpack(mrpackPath);
    if (!val.valid || !val.index) {
      return {
        success: false,
        physicalFilesCount: 0,
        remoteFilesCount: 0,
        unresolvedCount: 0,
        error: val.errors.join(', ')
      };
    }

    try {
      const index = val.index;
      const srcZip = new AdmZip(mrpackPath);
      const outZip = new AdmZip();

      const { loaderType, loaderVersion } = ModrinthPackImporter.resolveLoader(index.dependencies);
      const contentList: VPackContentEntry[] = [];
      let physicalFilesCount = 0;
      let remoteFilesCount = 0;
      let unresolvedCount = 0;

      // 1. Copy ONLY essential config files from overrides (not mods or large assets)
      // Essential files: options.txt, server.properties, configs (small)
      // EXCLUDED: mods/, resourcepacks/, shaderpacks/, large binary files
      const overridePrefixes = ['overrides/', 'client-overrides/'];
      const essentialFiles = ['options.txt', 'server.properties', 'eula.txt'];
      const maxConfigFileSize = 1024 * 1024; // 1MB max for config files

      for (const entry of srcZip.getEntries()) {
        if (entry.isDirectory) continue;
        for (const prefix of overridePrefixes) {
          if (entry.entryName.startsWith(prefix)) {
            const relPath = entry.entryName.slice(prefix.length);
            if (!VPackManager.isSafePath(relPath)) continue;

            // Skip large files (binary assets, etc.)
            if (entry.header.size > maxConfigFileSize) continue;

            // Skip mods, resourcepacks, shaderpacks - these should be download links only
            if (relPath.startsWith('mods/') || relPath.startsWith('resourcepacks/') || relPath.startsWith('shaderpacks/')) {
              continue;
            }

            // Skip common non-essential directories
            if (relPath.startsWith('screenshots/') || relPath.startsWith('crash-reports/') || relPath.startsWith('logs/')) {
              continue;
            }

            // Only include essential files or small config files
            const fileName = path.basename(relPath);
            if (essentialFiles.includes(fileName) || relPath.startsWith('config/')) {
              outZip.addFile(relPath, entry.getData());
              physicalFilesCount++;
              contentList.push({
                relativePath: relPath,
                type: 'config',
                sizeBytes: entry.header.size
              });
            }
          }
        }
      }

      // 2. Add remote mod files as VPack download entries
      for (const f of index.files || []) {
        if (f.env?.client === 'unsupported') continue;
        if (!VPackManager.isSafePath(f.path)) continue;

        const downloadUrl = (f.downloads && f.downloads.length > 0) ? f.downloads[0] : undefined;
        if (downloadUrl) {
          remoteFilesCount++;
        } else if (f.env?.client !== 'optional') {
          unresolvedCount++;
        }

        contentList.push({
          relativePath: f.path,
          type: f.path.startsWith('mods/') ? 'mod' : (f.path.startsWith('resourcepacks/') ? 'resourcepack' : 'other'),
          sizeBytes: f.fileSize,
          sha1: f.hashes.sha1,
          downloadUrl
        });
      }

      // Allow conversion to proceed even with unresolved files
      // They will be marked in the manifest for manual handling

      // 3. Assemble VPack Manifest
      const manifest: VPackManifest = {
        formatId: 'voxelplus-vpack',
        formatVersion: 1,
        packId: `mrpack-${crypto.randomUUID()}`,
        name: index.name,
        description: index.summary || `Converted from Modrinth pack ${index.name}`,
        author: 'Modrinth Creator',
        packVersion: index.versionId || '1.0.0',
        minecraft: {
          version: index.dependencies.minecraft
        },
        loader: {
          type: loaderType,
          version: loaderVersion || 'auto'
        },
        content: contentList,
        artwork: null,
        item: 'minecraft:nether_star',
        shareSource: 'modrinth',
        price: 0,
        createdAt: new Date().toISOString(),
        generatorVersion: '2.0.0'
      };

      outZip.addFile(VPackManager.MANIFEST_FILENAME, Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'));

      const outDir = path.dirname(outputVPackPath);
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

      outZip.writeZip(outputVPackPath);

      return {
        success: true,
        outputPath: outputVPackPath,
        manifest,
        physicalFilesCount,
        remoteFilesCount,
        unresolvedCount
      };
    } catch (e: any) {
      return {
        success: false,
        physicalFilesCount: 0,
        remoteFilesCount: 0,
        unresolvedCount: 0,
        error: e.message
      };
    }
  }

  /**
   * Converts a CurseForge modpack ZIP into a standard Voxel⁺ .vpack archive.
   */
  public static async convertCurseForgeToVPack(
    curseForgeZipPath: string,
    outputVPackPath: string
  ): Promise<VPackConversionResult> {
    const val = CurseForgePackImporter.validateCurseForgePack(curseForgeZipPath);
    if (!val.valid || !val.manifest) {
      return {
        success: false,
        physicalFilesCount: 0,
        remoteFilesCount: 0,
        unresolvedCount: 0,
        error: val.errors.join(', ')
      };
    }

    try {
      const manifest = val.manifest;
      const srcZip = new AdmZip(curseForgeZipPath);
      const outZip = new AdmZip();

      const { loaderType, loaderVersion } = CurseForgePackImporter.resolveLoader(manifest.minecraft.modLoaders);
      const contentList: VPackContentEntry[] = [];
      let physicalFilesCount = 0;
      let remoteFilesCount = 0;
      let unresolvedCount = 0;

      // 1. Copy ONLY essential config files from overrides (not mods or large assets)
      const overridesPrefix = (manifest.overrides || 'overrides').replace(/\/+$/, '') + '/';
      const essentialFiles = ['options.txt', 'server.properties', 'eula.txt'];
      const maxConfigFileSize = 1024 * 1024; // 1MB max for config files

      for (const entry of srcZip.getEntries()) {
        if (entry.isDirectory) continue;
        if (entry.entryName.startsWith(overridesPrefix)) {
          const relPath = entry.entryName.slice(overridesPrefix.length);
          if (!VPackManager.isSafePath(relPath)) continue;

          // Skip large files (binary assets, etc.)
          if (entry.header.size > maxConfigFileSize) continue;

          // Skip mods, resourcepacks, shaderpacks - these should be download links only
          if (relPath.startsWith('mods/') || relPath.startsWith('resourcepacks/') || relPath.startsWith('shaderpacks/')) {
            continue;
          }

          // Skip common non-essential directories
          if (relPath.startsWith('screenshots/') || relPath.startsWith('crash-reports/') || relPath.startsWith('logs/')) {
            continue;
          }

          // Only include essential files or small config files
          const fileName = path.basename(relPath);
          if (essentialFiles.includes(fileName) || relPath.startsWith('config/')) {
            outZip.addFile(relPath, entry.getData());
            physicalFilesCount++;
            contentList.push({
              relativePath: relPath,
              type: 'config',
              sizeBytes: entry.header.size
            });
          }
        }
      }

      // 2. Declared file references cannot be converted without the CurseForge
      // API: project/file IDs do not contain a downloadable URL or hash, so a
      // "converted" pack would silently install with every mod missing. Refuse
      // the conversion instead of writing a broken archive.
      for (const f of manifest.files || []) {
        if (f.required === false) continue;
        unresolvedCount++;
      }

      if (unresolvedCount > 0) {
        return {
          success: false,
          physicalFilesCount: 0,
          remoteFilesCount: 0,
          unresolvedCount,
          error: `Cannot convert this CurseForge pack: ${unresolvedCount} CurseForge file reference(s) require the authenticated CurseForge API to resolve a download URL. Import the pack directly instead so the launcher can resolve each file.`
        };
      }

      // 3. Assemble VPack Manifest
      const vpackManifest: VPackManifest = {
        formatId: 'voxelplus-vpack',
        formatVersion: 1,
        packId: `curseforge-${crypto.randomUUID()}`,
        name: manifest.name,
        description: `Converted from CurseForge pack ${manifest.name} v${manifest.version} by ${manifest.author}`,
        author: manifest.author || 'CurseForge Creator',
        packVersion: manifest.version || '1.0.0',
        minecraft: {
          version: manifest.minecraft.version
        },
        loader: {
          type: loaderType,
          version: loaderVersion || 'auto'
        },
        content: contentList,
        artwork: null,
        item: 'minecraft:bookshelf',
        shareSource: 'curseforge',
        price: 0,
        createdAt: new Date().toISOString(),
        generatorVersion: '2.0.0'
      };

      outZip.addFile(VPackManager.MANIFEST_FILENAME, Buffer.from(JSON.stringify(vpackManifest, null, 2), 'utf-8'));

      const outDir = path.dirname(outputVPackPath);
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

      outZip.writeZip(outputVPackPath);

      return {
        success: true,
        outputPath: outputVPackPath,
        manifest: vpackManifest,
        physicalFilesCount,
        remoteFilesCount,
        unresolvedCount
      };
    } catch (e: any) {
      return {
        success: false,
        physicalFilesCount: 0,
        remoteFilesCount: 0,
        unresolvedCount: 0,
        error: e.message
      };
    }
  }
}
