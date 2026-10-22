import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { InstanceMetadata, CreateInstancePayload } from '../../types';
import { VoxelError } from '../diagnostics';
import { LoaderRegistry } from './loaderProvider';
import { LoaderType } from '../../types';

export class InstanceMetadataStore {
  public static readonly METADATA_FILENAME = 'voxel-instance.json';

  public static createDefaultMetadata(payload: CreateInstancePayload, instanceId?: string): InstanceMetadata {
    const id = instanceId || crypto.randomUUID();
    const minecraftVersion = payload.minecraftVersion || '1.21.1';
    const loaderType = payload.loaderType || 'fabric';
    const loaderProvider = LoaderRegistry.getProvider(loaderType);
    const loaderVersion = payload.loaderVersion && payload.loaderVersion !== 'auto'
      ? payload.loaderVersion
      : loaderProvider.getDefaultLoaderVersion(minecraftVersion);
    return {
      schemaVersion: 1,
      id,
      name: payload.name.trim() || 'New Instance',
      description: payload.description?.trim() || `Minecraft ${payload.minecraftVersion || '1.21.1'} instance`,
      minecraft: {
        version: minecraftVersion
      },
      loader: {
        type: loaderType,
        version: loaderVersion
      },
      runtime: {
        java: payload.javaRuntime || 'auto',
        memoryMb: payload.memoryMb || 4096
      },
      appearance: {
        artwork: payload.artwork || null,
        item: payload.item || 'minecraft:grass_block'
      },
      isFavorite: false,
      createdAt: new Date().toISOString(),
      lastPlayedAt: null,
      status: 'READY',
      shareSource: payload.shareSource || 'local'
    };
  }

  public static readMetadata(instanceDir: string): InstanceMetadata | null {
    const metaFile = path.join(instanceDir, this.METADATA_FILENAME);
    if (!fs.existsSync(metaFile)) {
      return null;
    }
    try {
      const content = fs.readFileSync(metaFile, 'utf-8');
      const parsed: InstanceMetadata & Record<string, any> = JSON.parse(content);
      const loaderType = ['fabric', 'quilt', 'forge', 'neoforge'].includes(parsed.loader?.type)
        ? parsed.loader.type as LoaderType
        : (['fabric', 'quilt', 'forge', 'neoforge'].includes(parsed.loaderType)
          ? parsed.loaderType as LoaderType
          : 'fabric');
      const loaderProvider = LoaderRegistry.getProvider(loaderType);
      const requestedVersion = parsed.loader?.version || parsed.loaderVersion || parsed[`${loaderType}LoaderVersion`];
      parsed.loader = {
        type: loaderType,
        version: requestedVersion && requestedVersion !== 'auto'
          ? String(requestedVersion)
          : loaderProvider.getDefaultLoaderVersion(parsed.minecraft?.version || '1.21.1')
      };
      parsed.minecraft = { version: parsed.minecraft?.version || '1.21.1' };
      parsed.instancePath = instanceDir;

      // Count mods, resourcepacks, shaders
      const modsDir = path.join(instanceDir, 'mods');
      if (fs.existsSync(modsDir)) {
        parsed.modCount = fs.readdirSync(modsDir).filter(f => f.endsWith('.jar') || f.endsWith('.jar.disabled')).length;
      } else {
        parsed.modCount = 0;
      }

      const rpDir = path.join(instanceDir, 'resourcepacks');
      if (fs.existsSync(rpDir)) {
        parsed.resourcePackCount = fs.readdirSync(rpDir).filter(f => !f.startsWith('.')).length;
      } else {
        parsed.resourcePackCount = 0;
      }

      const shaderDir = path.join(instanceDir, 'shaderpacks');
      if (fs.existsSync(shaderDir)) {
        parsed.shaderCount = fs.readdirSync(shaderDir).filter(f => !f.startsWith('.')).length;
      } else {
        parsed.shaderCount = 0;
      }

      return parsed;
    } catch (e) {
      // Metadata is user data on disk; a corrupt file should not crash the
      // launcher, so we log through the diagnostics system and skip the instance.
      new VoxelError({
        title: 'Instance Metadata Unreadable',
        message: `The metadata file for an instance could not be read and the instance will be hidden.`,
        cause: 'voxel-instance.json is corrupt or has invalid JSON syntax.',
        suggestedAction: 'Fix or delete voxel-instance.json inside the instance folder; other instances are unaffected.',
        code: 'INSTANCE_METADATA_CORRUPT',
        category: 'INSTANCE',
        severity: 'WARNING',
        details: `Path: ${metaFile}`,
        originalError: e
      }).log();
      return null;
    }
  }

  public static writeMetadata(instanceDir: string, metadata: InstanceMetadata): void {
    if (!fs.existsSync(instanceDir)) {
      return;
    }
    try {
      const metaFile = path.join(instanceDir, this.METADATA_FILENAME);
      // Strip runtime-only / derived fields before persisting.
      // instancePath   – derived from the folder location at read time.
      // modCount / resourcePackCount / shaderCount – counted at read time.
      // (status IS intentionally persisted so crash/error state survives restarts.)
      const { instancePath, modCount, resourcePackCount, shaderCount, ...persistable } = metadata as any;
      // v2 migration: strip legacy skinId from appearance if present
      if (persistable.appearance && 'skinId' in persistable.appearance) {
        delete persistable.appearance.skinId;
      }
      fs.writeFileSync(metaFile, JSON.stringify(persistable, null, 2), 'utf-8');
    } catch (e) {
      new VoxelError({
        title: 'Instance Metadata Not Saved',
        message: 'Changes to this instance could not be saved to disk.',
        cause: 'The instance folder may be read-only, locked, or on a disconnected drive.',
        suggestedAction: 'Check folder permissions and available disk space, then try again.',
        code: 'INSTANCE_METADATA_WRITE_FAILED',
        category: 'FILESYSTEM',
        severity: 'ERROR',
        details: `Path: ${path.join(instanceDir, this.METADATA_FILENAME)}`,
        originalError: e
      }).log();
    }
  }
}
