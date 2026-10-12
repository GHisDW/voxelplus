import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import AdmZip from 'adm-zip';
import { VPackManifest, VPackValidationResult, VPackContentEntry, InstanceMetadata } from '../../types';

export class VPackManager {
  public static readonly MANIFEST_FILENAME = 'manifest.json';
  public static readonly LEGACY_INSTANCE_FILENAME = 'voxel-instance.json';

  /**
   * Sanitizes relative archive paths against zip-slip directory traversal vulnerabilities.
   */
  public static isSafePath(entryPath: string): boolean {
    const normalized = path.normalize(entryPath).replace(/^(\.\.(\/|\\|$))+/, '');
    if (normalized.includes('..') || path.isAbsolute(entryPath)) {
      return false;
    }
    return true;
  }

  /**
   * Generates a standard VPackManifest for an instance.
   */
  public static createManifest(instance: InstanceMetadata, contents: VPackContentEntry[]): VPackManifest {
    return {
      formatId: 'voxelplus-vpack',
      formatVersion: 1,
      packId: instance.id || crypto.randomUUID(),
      name: instance.name,
      description: instance.description || `Packaged instance of ${instance.name}`,
      author: 'Voxel+ Creator',
      packVersion: '1.0.0',
      minecraft: {
        version: instance.minecraft.version
      },
      loader: {
        type: instance.loader.type,
        version: instance.loader.version
      },
      content: contents,
      artwork: instance.appearance.artwork || null,
      item: instance.appearance.item || 'minecraft:grass_block',
      shareSource: instance.shareSource || 'discord',
      price: 250,
      createdAt: new Date().toISOString(),
      generatorVersion: '2.0.0'
    };
  }

  /**
   * Inspects and validates an archive buffer or zip file path.
   */
  public static validateVPack(zipPath: string): VPackValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!fs.existsSync(zipPath)) {
      return { valid: false, manifest: null, errors: ['File does not exist on disk.'], warnings };
    }

    try {
      const zip = new AdmZip(zipPath);
      const entries = zip.getEntries();

      // Check zip-slip safety
      for (const entry of entries) {
        if (!this.isSafePath(entry.entryName)) {
          return {
            valid: false,
            manifest: null,
            errors: [`Archive contains unsafe path traversal sequence: ${entry.entryName}`],
            warnings
          };
        }
      }

      // Look for manifest.json first, fallback to legacy voxel-instance.json
      const manifestEntry = zip.getEntry(this.MANIFEST_FILENAME);
      if (manifestEntry) {
        try {
          const raw = manifestEntry.getData().toString('utf-8');
          const parsed = JSON.parse(raw) as VPackManifest;
          if (parsed.formatId !== 'voxelplus-vpack') {
            errors.push('Invalid formatId in manifest.');
          }
          if (!parsed.name) errors.push('Pack manifest is missing a name.');
          if (!parsed.minecraft?.version) errors.push('Pack manifest missing Minecraft version.');
          if (!parsed.loader?.type) errors.push('Pack manifest missing loader type.');

          return {
            valid: errors.length === 0,
            manifest: errors.length === 0 ? parsed : null,
            errors,
            warnings
          };
        } catch (e: any) {
          return { valid: false, manifest: null, errors: [`Malformed manifest.json: ${e.message}`], warnings };
        }
      }

      // Check for legacy voxel-instance.json
      const legacyEntry = zip.getEntry(this.LEGACY_INSTANCE_FILENAME);
      if (legacyEntry) {
        try {
          const legacyMeta = JSON.parse(legacyEntry.getData().toString('utf-8')) as InstanceMetadata;
          warnings.push('Legacy archive detected (voxel-instance.json). Manifest will be upgraded to VPack.');
          const syntheticManifest = this.createManifest(legacyMeta, []);
          return {
            valid: true,
            manifest: syntheticManifest,
            errors: [],
            warnings
          };
        } catch (e: any) {
          return { valid: false, manifest: null, errors: [`Malformed legacy metadata: ${e.message}`], warnings };
        }
      }

      return {
        valid: false,
        manifest: null,
        errors: ['Archive is missing both manifest.json and legacy voxel-instance.json.'],
        warnings
      };
    } catch (e: any) {
      return { valid: false, manifest: null, errors: [`Failed to inspect archive: ${e.message}`], warnings };
    }
  }

  /**
   * Securely exports an instance folder into a .voxelplus / .vpack archive with manifest.json.
   */
  public static exportVPack(instanceDir: string, instance: InstanceMetadata, destPath: string): { success: boolean; error?: string } {
    try {
      const zip = new AdmZip();
      const contentList: VPackContentEntry[] = [];

      const scanAndAdd = (dir: string, baseDir: string, type: 'mod' | 'resourcepack' | 'shaderpack' | 'config' | 'other') => {
        if (!fs.existsSync(dir)) return;
        const files = fs.readdirSync(dir, { withFileTypes: true });
        for (const f of files) {
          const fullPath = path.join(dir, f.name);
          const relPath = path.relative(instanceDir, fullPath).replace(/\\/g, '/');
          if (f.isFile()) {
            const stats = fs.statSync(fullPath);
            contentList.push({
              relativePath: relPath,
              type,
              sizeBytes: stats.size
            });
            zip.addLocalFile(fullPath, path.dirname(relPath));
          } else if (f.isDirectory()) {
            scanAndAdd(fullPath, baseDir, type);
          }
        }
      };

      // Export safe instance contents
      scanAndAdd(path.join(instanceDir, 'mods'), instanceDir, 'mod');
      scanAndAdd(path.join(instanceDir, 'resourcepacks'), instanceDir, 'resourcepack');
      scanAndAdd(path.join(instanceDir, 'shaderpacks'), instanceDir, 'shaderpack');
      scanAndAdd(path.join(instanceDir, 'config'), instanceDir, 'config');

      // Create & add manifest
      const manifest = this.createManifest(instance, contentList);
      zip.addFile(this.MANIFEST_FILENAME, Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'));

      // Also write legacy voxel-instance.json for backwards compatibility
      zip.addFile(this.LEGACY_INSTANCE_FILENAME, Buffer.from(JSON.stringify(instance, null, 2), 'utf-8'));

      const destDir = path.dirname(destPath);
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

      zip.writeZip(destPath);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Securely extracts a VPack into an instance destination directory with zip-slip verification.
   */
  public static extractVPack(zipPath: string, destDir: string): { success: boolean; manifest: VPackManifest | null; error?: string } {
    const val = this.validateVPack(zipPath);
    if (!val.valid || !val.manifest) {
      return { success: false, manifest: null, error: val.errors.join(', ') };
    }

    try {
      const zip = new AdmZip(zipPath);
      const entries = zip.getEntries();

      for (const entry of entries) {
        if (entry.isDirectory) continue;
        if (!this.isSafePath(entry.entryName)) {
          return { success: false, manifest: null, error: `Insecure zip entry detected: ${entry.entryName}` };
        }

        const outTarget = path.join(destDir, entry.entryName);
        const resolvedOut = path.resolve(outTarget);
        if (!resolvedOut.startsWith(path.resolve(destDir))) {
          return { success: false, manifest: null, error: `Zip Slip path traversal blocked: ${entry.entryName}` };
        }

        const parent = path.dirname(resolvedOut);
        if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
        fs.writeFileSync(resolvedOut, entry.getData());
      }

      return { success: true, manifest: val.manifest };
    } catch (e: any) {
      return { success: false, manifest: null, error: e.message };
    }
  }

  /**
   * Scans the repository's vpacks/ directory and returns all discoverable VPacks with manifests.
   */
  public static scanVPackRepository(): { fileName: string; filePath: string; manifest: VPackManifest; price: number }[] {
    const results: { fileName: string; filePath: string; manifest: VPackManifest; price: number }[] = [];
    const vpacksDir = path.join(process.cwd(), 'vpacks');
    if (!fs.existsSync(vpacksDir)) {
      try { fs.mkdirSync(vpacksDir, { recursive: true }); } catch (_) {}
      return results;
    }

    const files = fs.readdirSync(vpacksDir);
    for (const f of files) {
      if (f.endsWith('.vpack') || f.endsWith('.voxelplus') || f.endsWith('.zip')) {
        const fullPath = path.join(vpacksDir, f);
        const val = this.validateVPack(fullPath);
        if (val.valid && val.manifest) {
          results.push({
            fileName: f,
            filePath: fullPath,
            manifest: val.manifest,
            price: val.manifest.price || 200
          });
        }
      }
    }
    return results;
  }
}
