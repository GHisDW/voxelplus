import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { InstanceMetadata, CreateInstancePayload } from '../../types';

export class InstanceMetadataStore {
  public static readonly METADATA_FILENAME = 'voxel-instance.json';

  public static createDefaultMetadata(payload: CreateInstancePayload, instanceId?: string): InstanceMetadata {
    const id = instanceId || crypto.randomUUID();
    return {
      schemaVersion: 1,
      id,
      name: payload.name.trim() || 'New Instance',
      minecraft: {
        version: payload.minecraftVersion || '1.21.1'
      },
      loader: {
        type: payload.loaderType || 'fabric',
        version: payload.loaderVersion || '0.16.9'
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
      status: 'READY'
    };
  }

  public static readMetadata(instanceDir: string): InstanceMetadata | null {
    const metaFile = path.join(instanceDir, this.METADATA_FILENAME);
    if (!fs.existsSync(metaFile)) {
      return null;
    }
    try {
      const content = fs.readFileSync(metaFile, 'utf-8');
      const parsed: InstanceMetadata = JSON.parse(content);
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
      console.error(`Failed to parse instance metadata at ${instanceDir}:`, e);
      return null;
    }
  }

  public static writeMetadata(instanceDir: string, metadata: InstanceMetadata): void {
    if (!fs.existsSync(instanceDir)) {
      return;
    }
    try {
      const metaFile = path.join(instanceDir, this.METADATA_FILENAME);
      fs.writeFileSync(metaFile, JSON.stringify(metadata, null, 2), 'utf-8');
    } catch (e) {
      console.warn(`Failed to write instance metadata at ${instanceDir}:`, e);
    }
  }
}
