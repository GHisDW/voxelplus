import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import https from 'node:https';
import AdmZip from 'adm-zip';
import { VPackManifest, VPackValidationResult, VPackContentEntry, InstanceMetadata } from '../../types';
import { LoomProjectGenerator } from '../instances/loomGenerator';
import { generateBuildGradle, generateGradleProperties, generateSettingsGradle, getGradleDistributionUrl } from '../instances/fabricVersions';

export class VPackManager {
  public static readonly MANIFEST_FILENAME = 'manifest.json';
  public static readonly LEGACY_INSTANCE_FILENAME = 'voxel-instance.json';

  /**
   * Sanitizes relative archive paths against zip-slip directory traversal vulnerabilities.
   */
  public static isSafePath(entryPath: string): boolean {
    if (!entryPath || entryPath.includes('\0') || path.isAbsolute(entryPath)) return false;
    const normalized = path.posix.normalize(entryPath.replace(/\\/g, '/'));
    return normalized !== '..' && !normalized.startsWith('../') && !normalized.includes('/:');
  }

  /** Resolve catalog assets relative to the application, not the process launch directory. */
  public static getRepositoryDirectory(): string {
    // In development, __dirname points to dist-electron/backend/vpack
    // In production, it points to app.asar or similar
    // We need to resolve to the vpacks directory at the root
    const appBase = path.resolve(__dirname, '../../../');
    const candidates = [
      path.join(appBase, 'vpacks'),
      path.join(process.resourcesPath || appBase, 'vpacks')
    ];
    return candidates.find(candidate => fs.existsSync(candidate)) || candidates[0];
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
          // Be more lenient - accept even if formatId is wrong
          if (parsed.formatId !== 'voxelplus-vpack') errors.push('Unsupported VPack format.');
          if (parsed.formatVersion !== 1) errors.push(`Unsupported VPack version: ${parsed.formatVersion ?? 'missing'}.`);
          if (!parsed.name) errors.push('Pack manifest is missing a name.');
          if (!parsed.minecraft?.version) errors.push('Pack manifest missing Minecraft version.');
          if (!parsed.loader?.type) errors.push('Pack manifest missing loader type.');
          if (!parsed.packId) errors.push('Pack manifest missing a stable pack ID.');

          for (const content of parsed.content || []) {
            if (!content.relativePath || !this.isSafePath(content.relativePath)) {
              errors.push(`Pack contains an unsafe content path: ${content.relativePath || '(empty)'}.`);
              continue;
            }
            if (!zip.getEntry(content.relativePath) && !content.downloadUrl) {
              errors.push(`Pack is missing declared content: ${content.relativePath}.`);
            }
          }

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

      errors.push('Archive does not contain manifest.json or voxel-instance.json.');
      return { valid: false, manifest: null, errors, warnings };
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
  public static async extractVPack(zipPath: string, destDir: string): Promise<{ success: boolean; manifest: VPackManifest | null; error?: string }> {
    const val = this.validateVPack(zipPath);
    if (!val.valid || !val.manifest) {
      return { success: false, manifest: null, error: val.errors.join(', ') };
    }

    try {
      const zip = new AdmZip(zipPath);
      const entries = zip.getEntries();

      // Make pack artwork portable. A manifest may point at an image entry
      // instead of embedding a large data URL; imported instances must not
      // keep depending on the original archive for their icon.
      if (val.manifest.artwork && !val.manifest.artwork.startsWith('data:')) {
        const artworkEntry = zip.getEntry(val.manifest.artwork);
        if (artworkEntry) {
          const extension = path.extname(val.manifest.artwork).toLowerCase();
          const mime = extension === '.jpg' || extension === '.jpeg'
            ? 'image/jpeg'
            : extension === '.webp'
              ? 'image/webp'
              : extension === '.svg'
                ? 'image/svg+xml'
                : 'image/png';
          val.manifest.artwork = `data:${mime};base64,${artworkEntry.getData().toString('base64')}`;
        }
      }

      for (const entry of entries) {
        if (entry.isDirectory) continue;
        if (!this.isSafePath(entry.entryName)) {
          return { success: false, manifest: null, error: `Insecure zip entry detected: ${entry.entryName}` };
        }

        const outTarget = path.join(destDir, entry.entryName);
        const resolvedOut = path.resolve(outTarget);
        const resolvedRoot = path.resolve(destDir) + path.sep;
        if (resolvedOut !== path.resolve(destDir) && !resolvedOut.startsWith(resolvedRoot)) {
          return { success: false, manifest: null, error: `Zip Slip path traversal blocked: ${entry.entryName}` };
        }

        const parent = path.dirname(resolvedOut);
        if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
        fs.writeFileSync(resolvedOut, entry.getData());
      }

      // Catalog VPacks keep large mod/resource/shader binaries out of git and
      // carry their verified Modrinth download URLs instead. Materialize those
      // files into the instance before it is shown as ready.
      for (const content of val.manifest.content || []) {
        if (!content.downloadUrl || zip.getEntry(content.relativePath)) continue;
        if (!this.isSafePath(content.relativePath)) {
          return { success: false, manifest: null, error: `Unsafe remote content path: ${content.relativePath}` };
        }
        const target = path.resolve(destDir, content.relativePath);
        const root = path.resolve(destDir) + path.sep;
        if (!target.startsWith(root)) {
          return { success: false, manifest: null, error: `Remote content escaped instance directory: ${content.relativePath}` };
        }
        fs.mkdirSync(path.dirname(target), { recursive: true });
        await this.downloadFile(content.downloadUrl, target, content.sha1);
      }

      // Ensure cross-platform Loom / Gradle wrapper build files exist in destination
      const mcVer = val.manifest.minecraft?.version || '1.21.1';
      const cleanName = (val.manifest.name || 'voxelplus-instance')
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');

      if (!fs.existsSync(path.join(destDir, 'build.gradle'))) {
        fs.writeFileSync(path.join(destDir, 'build.gradle'), generateBuildGradle(mcVer, cleanName, 4096), 'utf-8');
      }
      if (!fs.existsSync(path.join(destDir, 'settings.gradle'))) {
        fs.writeFileSync(path.join(destDir, 'settings.gradle'), generateSettingsGradle(mcVer, cleanName), 'utf-8');
      }
      if (!fs.existsSync(path.join(destDir, 'gradle.properties'))) {
        fs.writeFileSync(path.join(destDir, 'gradle.properties'), generateGradleProperties(mcVer, cleanName, 4096), 'utf-8');
      }
      const wrapperPropsPath = path.join(destDir, 'gradle/wrapper/gradle-wrapper.properties');
      if (!fs.existsSync(wrapperPropsPath)) {
        if (!fs.existsSync(path.dirname(wrapperPropsPath))) {
          fs.mkdirSync(path.dirname(wrapperPropsPath), { recursive: true });
        }
        const propsContent = `distributionBase=GRADLE_USER_HOME\ndistributionPath=wrapper/dists\ndistributionUrl=${getGradleDistributionUrl(mcVer)}\nnetworkTimeout=10000\nvalidateDistributionUrl=true\nzipStoreBase=GRADLE_USER_HOME\nzipStorePath=wrapper/dists\n`;
        fs.writeFileSync(wrapperPropsPath, propsContent, 'utf-8');
      }

      LoomProjectGenerator.ensureWrapperFiles(destDir);

      return { success: true, manifest: val.manifest };
    } catch (e: any) {
      return { success: false, manifest: null, error: e.message };
    }
  }

  private static downloadFile(url: string, destination: string, expectedSha1?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = https.get(url, response => {
        if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          response.resume();
          this.downloadFile(response.headers.location, destination, expectedSha1).then(resolve, reject);
          return;
        }
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`Download failed with HTTP ${response.statusCode}: ${url}`));
          return;
        }

        const chunks: Buffer[] = [];
        response.on('data', chunk => chunks.push(Buffer.from(chunk)));
        response.on('end', () => {
          const data = Buffer.concat(chunks);
          if (expectedSha1) {
            const actual = crypto.createHash('sha1').update(data).digest('hex');
            if (actual !== expectedSha1) {
              reject(new Error(`Checksum mismatch for ${path.basename(destination)}.`));
              return;
            }
          }
          fs.writeFileSync(destination, data);
          resolve();
        });
        response.on('error', reject);
      });
      request.on('error', reject);
      request.setTimeout(120000, () => request.destroy(new Error(`Download timed out: ${url}`)));
    });
  }

  /**
   * Scans the repository's vpacks/ directory and returns all discoverable VPacks with manifests.
   */
  public static scanVPackRepository(): { fileName: string; filePath: string; manifest: VPackManifest; price: number }[] {
    const results: { fileName: string; filePath: string; manifest: VPackManifest; price: number }[] = [];
    const vpacksDir = this.getRepositoryDirectory();
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
