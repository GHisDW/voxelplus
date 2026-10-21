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

      // 1. Copy overrides directly into outZip
      const overridePrefixes = ['overrides/', 'client-overrides/'];
      for (const entry of srcZip.getEntries()) {
        if (entry.isDirectory) continue;
        for (const prefix of overridePrefixes) {
          if (entry.entryName.startsWith(prefix)) {
            const relPath = entry.entryName.slice(prefix.length);
            if (!VPackManager.isSafePath(relPath)) continue;

            outZip.addFile(relPath, entry.getData());
            physicalFilesCount++;
            contentList.push({
              relativePath: relPath,
              type: relPath.startsWith('mods/') ? 'mod' : (relPath.startsWith('resourcepacks/') ? 'resourcepack' : 'config'),
              sizeBytes: entry.header.size
            });
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

      if (unresolvedCount > 0) {
        return {
          success: false,
          physicalFilesCount,
          remoteFilesCount,
          unresolvedCount,
          error: `${unresolvedCount} required Modrinth file reference(s) have no authorized download URL.`
        };
      }

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
      const unresolvedFiles = manifest.files || [];
      if (unresolvedFiles.length > 0) {
        return {
          success: false,
          physicalFilesCount: 0,
          remoteFilesCount: 0,
          unresolvedCount: unresolvedFiles.length,
          error: `${unresolvedFiles.length} CurseForge file reference(s) cannot be converted into an importable VPack without authorized file resolution.`
        };
      }
      const srcZip = new AdmZip(curseForgeZipPath);
      const outZip = new AdmZip();

      const { loaderType, loaderVersion } = CurseForgePackImporter.resolveLoader(manifest.minecraft.modLoaders);
      const contentList: VPackContentEntry[] = [];
      let physicalFilesCount = 0;
      let remoteFilesCount = 0;
      let unresolvedCount = 0;

      // 1. Copy overrides into outZip
      const overridesPrefix = (manifest.overrides || 'overrides').replace(/\/+$/, '') + '/';
      for (const entry of srcZip.getEntries()) {
        if (entry.isDirectory) continue;
        if (entry.entryName.startsWith(overridesPrefix)) {
          const relPath = entry.entryName.slice(overridesPrefix.length);
          if (!VPackManager.isSafePath(relPath)) continue;

          outZip.addFile(relPath, entry.getData());
          physicalFilesCount++;
          contentList.push({
            relativePath: relPath,
            type: relPath.startsWith('mods/') ? 'mod' : (relPath.startsWith('resourcepacks/') ? 'resourcepack' : 'config'),
            sizeBytes: entry.header.size
          });
        }
      }

      // 2. Add declared file references as external downloads
      for (const f of manifest.files || []) {
        unresolvedCount++;
        contentList.push({
          relativePath: `mods/cf-${f.projectID}-${f.fileID}.jar`,
          type: 'mod',
          sizeBytes: 0,
          downloadUrl: `curseforge://${f.projectID}/${f.fileID}`
        });
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
