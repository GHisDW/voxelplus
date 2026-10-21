import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import https from 'node:https';
import http from 'node:http';
import AdmZip from 'adm-zip';
import { LoaderType, InstanceMetadata } from '../../types';
import { PathManager } from '../storage/paths';
import { VPackManager } from '../vpack/vpackManager';
import { LoomProjectGenerator } from '../instances/loomGenerator';

export interface ModrinthIndexFile {
  path: string;
  hashes: {
    sha1?: string;
    sha512?: string;
  };
  env?: {
    client?: 'required' | 'optional' | 'unsupported';
    server?: 'required' | 'optional' | 'unsupported';
  };
  downloads: string[];
  fileSize: number;
}

export interface ModrinthIndex {
  formatVersion: number;
  game: string;
  versionId: string;
  name: string;
  summary?: string;
  files: ModrinthIndexFile[];
  dependencies: {
    minecraft: string;
    forge?: string;
    neoforge?: string;
    'fabric-loader'?: string;
    'quilt-loader'?: string;
    [key: string]: string | undefined;
  };
}

export interface ModrinthImportResult {
  success: boolean;
  metadata?: InstanceMetadata;
  downloadedCount: number;
  unresolvedCount: number;
  errors: string[];
  warnings: string[];
}

export class ModrinthPackImporter {
  public static readonly INDEX_FILENAME = 'modrinth.index.json';

  /**
   * Validates whether a file is a valid .mrpack archive.
   */
  public static validateMrpack(zipPath: string): { valid: boolean; index: ModrinthIndex | null; errors: string[] } {
    const errors: string[] = [];
    if (!fs.existsSync(zipPath)) {
      return { valid: false, index: null, errors: ['File does not exist.'] };
    }

    try {
      const zip = new AdmZip(zipPath);
      for (const entry of zip.getEntries()) {
        if (!VPackManager.isSafePath(entry.entryName)) {
          return { valid: false, index: null, errors: [`Unsafe archive path traversal entry: ${entry.entryName}`] };
        }
      }

      const indexEntry = zip.getEntry(this.INDEX_FILENAME);
      if (!indexEntry) {
        return { valid: false, index: null, errors: ['Archive is missing modrinth.index.json.'] };
      }

      const raw = indexEntry.getData().toString('utf-8');
      const index = JSON.parse(raw) as ModrinthIndex;

      if (index.formatVersion !== 1) {
        errors.push(`Unsupported Modrinth pack formatVersion: ${index.formatVersion}. Expected 1.`);
      }
      if (index.game !== 'minecraft') {
        errors.push(`Unsupported Modrinth game: ${index.game}. Expected 'minecraft'.`);
      }
      if (!index.dependencies?.minecraft) {
        errors.push('Modrinth pack missing Minecraft version dependency.');
      }

      return {
        valid: errors.length === 0,
        index: errors.length === 0 ? index : null,
        errors
      };
    } catch (e: any) {
      return { valid: false, index: null, errors: [`Malformed .mrpack archive: ${e.message}`] };
    }
  }

  /**
   * Resolves the loader type and version from modrinth index dependencies.
   */
  public static resolveLoader(dependencies: ModrinthIndex['dependencies']): { loaderType: LoaderType; loaderVersion?: string } {
    if (dependencies['quilt-loader']) {
      return { loaderType: 'quilt', loaderVersion: dependencies['quilt-loader'] };
    }
    if (dependencies.neoforge) {
      return { loaderType: 'neoforge', loaderVersion: dependencies.neoforge };
    }
    if (dependencies.forge) {
      return { loaderType: 'forge', loaderVersion: dependencies.forge };
    }
    if (dependencies['fabric-loader']) {
      return { loaderType: 'fabric', loaderVersion: dependencies['fabric-loader'] };
    }
    return { loaderType: 'fabric' };
  }

  /**
   * Extracts overrides and downloads remote files into target instance directory.
   */
  public static async importMrpack(
    zipPath: string,
    targetDir: string,
    customName?: string
  ): Promise<ModrinthImportResult> {
    const validation = this.validateMrpack(zipPath);
    if (!validation.valid || !validation.index) {
      return {
        success: false,
        downloadedCount: 0,
        unresolvedCount: 0,
        errors: validation.errors,
        warnings: []
      };
    }

    const index = validation.index;
    const errors: string[] = [];
    const warnings: string[] = [];
    let downloadedCount = 0;
    let unresolvedCount = 0;

    PathManager.ensureDirectory(targetDir);

    const zip = new AdmZip(zipPath);
    const entries = zip.getEntries();

    // 1. Extract overrides/ and client-overrides/
    const overridePrefixes = ['overrides/', 'client-overrides/'];
    for (const entry of entries) {
      if (entry.isDirectory) continue;
      for (const prefix of overridePrefixes) {
        if (entry.entryName.startsWith(prefix)) {
          const relPath = entry.entryName.slice(prefix.length);
          if (!VPackManager.isSafePath(relPath)) {
            warnings.push(`Skipping unsafe override path: ${relPath}`);
            continue;
          }
          const outPath = path.resolve(targetDir, relPath);
          const root = path.resolve(targetDir) + path.sep;
          if (!outPath.startsWith(root)) {
            warnings.push(`Path traversal blocked for override: ${relPath}`);
            continue;
          }
          PathManager.ensureDirectory(path.dirname(outPath));
          fs.writeFileSync(outPath, entry.getData());
        }
      }
    }

    // 2. Download files declared in index (skip unsupported on client)
    for (const file of index.files || []) {
      if (file.env?.client === 'unsupported') {
        continue;
      }
      if (!VPackManager.isSafePath(file.path)) {
        errors.push(`Unsafe file path in index: ${file.path}`);
        continue;
      }

      const destPath = path.resolve(targetDir, file.path);
      const root = path.resolve(targetDir) + path.sep;
      if (!destPath.startsWith(root)) {
        errors.push(`File path escaped target directory: ${file.path}`);
        continue;
      }

      // Check if file was already extracted from overrides
      if (fs.existsSync(destPath)) {
        continue;
      }

      PathManager.ensureDirectory(path.dirname(destPath));

      let downloaded = false;
      for (const url of file.downloads || []) {
        try {
          await this.downloadFileWithHash(url, destPath, file.hashes.sha1, file.hashes.sha512);
          downloaded = true;
          downloadedCount++;
          break;
        } catch (err: any) {
          warnings.push(`Failed download for ${path.basename(file.path)} from ${url}: ${err.message}`);
        }
      }

      if (!downloaded) {
        unresolvedCount++;
        warnings.push(`Could not download required mod file: ${file.path}`);
      }
    }

    // 3. Generate instance project scaffolding
    const mcVersion = index.dependencies.minecraft;
    const { loaderType, loaderVersion } = this.resolveLoader(index.dependencies);
    const instanceName = customName || index.name || path.basename(zipPath, '.mrpack');

    const metadata = await LoomProjectGenerator.generateProject(targetDir, {
      name: instanceName,
      description: index.summary || `Imported Modrinth pack: ${index.name}`,
      minecraftVersion: mcVersion,
      loaderType,
      loaderVersion,
      javaRuntime: 'auto',
      memoryMb: 4096,
      item: 'minecraft:nether_star',
      shareSource: 'modrinth'
    });

    metadata.isVPack = true;

    return {
      success: true,
      metadata,
      downloadedCount,
      unresolvedCount,
      errors,
      warnings
    };
  }

  private static downloadFileWithHash(
    url: string,
    dest: string,
    expectedSha1?: string,
    expectedSha512?: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https:') ? https : http;
      const req = client.get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return this.downloadFileWithHash(res.headers.location, dest, expectedSha1, expectedSha512).then(resolve, reject);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode}`));
        }

        const chunks: Buffer[] = [];
        res.on('data', chunk => chunks.push(Buffer.from(chunk)));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          if (expectedSha1) {
            const actual = crypto.createHash('sha1').update(buffer).digest('hex');
            if (actual.toLowerCase() !== expectedSha1.toLowerCase()) {
              return reject(new Error(`SHA1 mismatch: expected ${expectedSha1}, got ${actual}`));
            }
          }
          if (expectedSha512) {
            const actual = crypto.createHash('sha512').update(buffer).digest('hex');
            if (actual.toLowerCase() !== expectedSha512.toLowerCase()) {
              return reject(new Error(`SHA512 mismatch: expected ${expectedSha512}, got ${actual}`));
            }
          }
          fs.writeFileSync(dest, buffer);
          resolve();
        });
        res.on('error', reject);
      });
      req.on('error', reject);
      req.setTimeout(60000, () => req.destroy(new Error('Download timeout')));
    });
  }
}
