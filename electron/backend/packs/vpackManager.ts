import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { MyPack, VPackManifest, CardModRef, ModInfo, ResourcePackInfo, ShaderPackInfo } from '../../types';
import { PackStore } from './packStore';
import { InstanceManager } from '../instances/instanceManager';
import { ModManager } from '../content/modManager';
import { PackManager } from '../content/packManager';
import { ModrinthClient } from '../modrinth/modrinthClient';

export class VPackManager {
  private static readonly MANIFEST_FILE = 'manifest.json';
  private static readonly CURRENT_SCHEMA_VERSION = 1;

  /**
   * Export a pack to a .vpack archive
   */
  public static async exportPack(packId: string, targetPath: string): Promise<boolean> {
    const pack = PackStore.getPack(packId);
    if (!pack) return false;

    try {
      const manifest: VPackManifest = {
        schemaVersion: this.CURRENT_SCHEMA_VERSION,
        id: pack.id,
        name: pack.name,
        description: pack.description,
        packVersion: pack.packVersion,
        minecraftVersion: pack.minecraftVersion,
        loaderType: pack.loaderType,
        loaderVersion: pack.loaderVersion,
        mods: pack.mods,
        resourcePacks: pack.resourcePacks,
        shaderPacks: pack.shaderPacks,
        configs: pack.configs
      };

      const zip = new AdmZip();
      
      // Add manifest
      zip.addFile(this.MANIFEST_FILE, Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'));
      
      // Add artwork if it's a data URI (convert to file)
      if (pack.artwork && pack.artwork.startsWith('data:')) {
        try {
          const matches = pack.artwork.match(/^data:image\/(\w+);base64,(.+)$/);
          if (matches) {
            const ext = matches[1];
            const data = Buffer.from(matches[2], 'base64');
            zip.addFile(`artwork.${ext}`, data);
          }
        } catch (e) {
          console.warn('Failed to process artwork data URI:', e);
        }
      }
      
      zip.writeZip(targetPath);
      return true;
    } catch (e) {
      console.error('Failed to export pack:', e);
      return false;
    }
  }

  /**
   * Import a .vpack archive with validation
   */
  public static async importPack(zipPath: string): Promise<{ success: boolean; pack?: MyPack; error?: string }> {
    try {
      // Validate file exists
      if (!fs.existsSync(zipPath)) {
        return { success: false, error: 'VPack file does not exist' };
      }

      // Validate file extension
      if (!zipPath.toLowerCase().endsWith('.vpack')) {
        return { success: false, error: 'File must have .vpack extension' };
      }

      const zip = new AdmZip(zipPath);
      const entries = zip.getEntries();
      
      // Security: validate no path traversal attempts
      for (const entry of entries) {
        if (entry.entryName.includes('..') || entry.entryName.startsWith('/') || entry.entryName.startsWith('\\')) {
          return { success: false, error: 'VPack contains invalid path traversal attempt' };
        }
        
        // Check for suspicious absolute paths
        if (entry.entryName.match(/^[A-Za-z]:/)) {
          return { success: false, error: 'VPack contains absolute path references' };
        }
      }

      const manifestEntry = zip.getEntry(this.MANIFEST_FILE);
      if (!manifestEntry) {
        return { success: false, error: 'VPack missing manifest.json' };
      }

      const raw = manifestEntry.getData().toString('utf-8');
      let manifest: VPackManifest;
      
      try {
        manifest = JSON.parse(raw) as VPackManifest;
      } catch {
        return { success: false, error: 'Invalid JSON in manifest.json' };
      }

      // Validate manifest structure
      const validationResult = this.validateManifest(manifest);
      if (!validationResult.isValid) {
        return { success: false, error: `Manifest validation failed: ${validationResult.error}` };
      }

      // Check for duplicate pack IDs
      const existingPack = PackStore.getPack(manifest.id);
      if (existingPack) {
        return { success: false, error: `A pack with ID "${manifest.id}" already exists` };
      }

      // Extract artwork if present
      let artwork: string | null = null;
      const artworkEntry = entries.find(e => e.entryName.startsWith('artwork.'));
      if (artworkEntry) {
        try {
          const data = artworkEntry.getData();
          const ext = artworkEntry.entryName.split('.').pop();
          
          if (ext && ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext.toLowerCase())) {
            const base64 = data.toString('base64');
            artwork = `data:image/${ext};base64,${base64}`;
          }
        } catch (e) {
          console.warn('Failed to extract artwork from vpack:', e);
        }
      }

      const newPack: MyPack = {
        id: manifest.id,
        name: manifest.name,
        description: manifest.description,
        artwork,
        packVersion: manifest.packVersion,
        minecraftVersion: manifest.minecraftVersion,
        loaderType: manifest.loaderType,
        loaderVersion: manifest.loaderVersion,
        mods: manifest.mods || [],
        resourcePacks: manifest.resourcePacks || [],
        shaderPacks: manifest.shaderPacks || [],
        configs: manifest.configs || {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      PackStore.savePack(newPack);
      return { success: true, pack: newPack };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error during import';
      console.error('Failed to import vpack:', e);
      return { success: false, error: msg };
    }
  }

  /**
   * Validate manifest structure
   */
  public static validateManifest(manifest: unknown): { isValid: boolean; error?: string } {
    if (!manifest || typeof manifest !== 'object') {
      return { isValid: false, error: 'Manifest is not an object' };
    }
    
    const m = manifest as Record<string, unknown>;

    // Check schema version
    if (m.schemaVersion !== this.CURRENT_SCHEMA_VERSION) {
      return { isValid: false, error: `Schema version mismatch. Expected ${this.CURRENT_SCHEMA_VERSION}, got ${m.schemaVersion}` };
    }
    
    // Required string fields
    if (!m.id || typeof m.id !== 'string') return { isValid: false, error: 'Missing or invalid pack ID' };
    if (!m.name || typeof m.name !== 'string') return { isValid: false, error: 'Missing or invalid pack name' };
    if (!m.packVersion || typeof m.packVersion !== 'string') return { isValid: false, error: 'Missing or invalid pack version' };
    if (!m.minecraftVersion || typeof m.minecraftVersion !== 'string') return { isValid: false, error: 'Missing or invalid Minecraft version' };
    if (!m.loaderType || typeof m.loaderType !== 'string' || !['fabric', 'forge', 'neoforge', 'quilt'].includes(m.loaderType)) {
      return { isValid: false, error: 'Missing or invalid loader type' };
    }
    if (!m.loaderVersion || typeof m.loaderVersion !== 'string') return { isValid: false, error: 'Missing or invalid loader version' };
    
    // Validate arrays
    if (!Array.isArray(m.mods)) return { isValid: false, error: 'Mods must be an array' };
    if (!Array.isArray(m.resourcePacks)) return { isValid: false, error: 'Resource packs must be an array' };
    if (!Array.isArray(m.shaderPacks)) return { isValid: false, error: 'Shader packs must be an array' };
    
    // Helper to validate CardModRef items
    const checkModRef = (item: unknown, typeName: string, index: number): string | null => {
      if (!item || typeof item !== 'object') return `${typeName} at index ${index} is invalid`;
      const ref = item as Record<string, unknown>;
      if (!ref.provider || typeof ref.provider !== 'string' || !['modrinth', 'curseforge'].includes(ref.provider)) {
        return `${typeName} at index ${index} has invalid provider`;
      }
      if (!ref.projectName || typeof ref.projectName !== 'string') {
        return `${typeName} at index ${index} missing projectName`;
      }
      if (ref.unresolved === true) {
        return null; // Valid unresolved reference
      }
      if (!ref.projectId || typeof ref.projectId !== 'string') return `${typeName} at index ${index} missing projectId`;
      if (!ref.versionId || typeof ref.versionId !== 'string') return `${typeName} at index ${index} missing versionId`;
      if (!ref.downloadUrl || typeof ref.downloadUrl !== 'string') return `${typeName} at index ${index} missing downloadUrl`;
      if (!ref.filename || typeof ref.filename !== 'string') return `${typeName} at index ${index} missing filename`;
      return null;
    };

    for (let i = 0; i < (m.mods as unknown[]).length; i++) {
      const err = checkModRef((m.mods as unknown[])[i], 'Mod', i);
      if (err) return { isValid: false, error: err };
    }
    
    for (let i = 0; i < (m.resourcePacks as unknown[]).length; i++) {
      const err = checkModRef((m.resourcePacks as unknown[])[i], 'Resource pack', i);
      if (err) return { isValid: false, error: err };
    }

    for (let i = 0; i < (m.shaderPacks as unknown[]).length; i++) {
      const err = checkModRef((m.shaderPacks as unknown[])[i], 'Shader pack', i);
      if (err) return { isValid: false, error: err };
    }

    return { isValid: true };
  }

  /**
   * Create a pack from an existing instance with mod identity resolution
   */
  public static async createPackFromInstance(instanceId: string, packDetails: Partial<MyPack>): Promise<MyPack | null> {
    const instance = await InstanceManager.getInstance(instanceId);
    if (!instance) return null;

    try {
      const mods = await ModManager.listMods(instanceId);
      const resolvedMods = await this.resolveModIdentities(mods, instance.minecraft.version, instance.loader.type);
      
      const resourcePacks = await PackManager.listResourcePacks(instanceId);
      const resolvedResourcePacks = await this.resolveResourcePackIdentities(resourcePacks, instance.minecraft.version);
      
      const shaderPacks = await PackManager.listShaderPacks(instanceId);
      const resolvedShaderPacks = await this.resolveShaderIdentities(shaderPacks, instance.minecraft.version);
      
      const newPack: MyPack = {
        id: packDetails.id || instance.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
        name: packDetails.name || `${instance.name} Pack`,
        description: packDetails.description || `Pack created from instance "${instance.name}"`,
        artwork: packDetails.artwork || instance.appearance.artwork || null,
        packVersion: packDetails.packVersion || '1.0.0',
        minecraftVersion: instance.minecraft.version,
        loaderType: instance.loader.type,
        loaderVersion: instance.loader.version,
        mods: resolvedMods,
        resourcePacks: resolvedResourcePacks,
        shaderPacks: resolvedShaderPacks,
        configs: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      PackStore.savePack(newPack);
      return newPack;
    } catch (e) {
      console.error('Failed to create pack from instance:', e);
      return null;
    }
  }

  /**
   * Resolve installed mods to Modrinth identities
   */
  private static async resolveModIdentities(mods: ModInfo[], mcVersion: string, loader: string): Promise<CardModRef[]> {
    const resolved: CardModRef[] = [];
    
    for (const mod of mods) {
      try {
        const searchResults = await ModrinthClient.searchProjects({
          query: mod.name,
          projectType: 'mod',
          minecraftVersion: mcVersion,
          loader,
          limit: 5
        });
        
        if (searchResults.hits.length > 0) {
          const project = searchResults.hits[0];
          const versions = await ModrinthClient.getProjectVersions(project.id, [loader], [mcVersion]);
          
          if (versions.length > 0) {
            const version = versions[0];
            const file = version.files[0];
            
            resolved.push({
              provider: 'modrinth',
              projectId: project.id,
              projectName: project.title,
              versionId: version.id,
              versionName: version.name,
              downloadUrl: file.url,
              filename: file.filename,
              sizeBytes: file.size,
              sha1: file.hashes?.sha1,
              iconUrl: project.icon_url || undefined,
              contentType: 'mod'
            });
          } else {
            resolved.push({
              provider: 'modrinth',
              projectId: 'unresolved',
              projectName: mod.name,
              versionId: 'unresolved',
              versionName: mod.version || 'unknown',
              downloadUrl: '',
              filename: mod.filename,
              contentType: 'mod',
              unresolved: true
            });
          }
        } else {
          resolved.push({
            provider: 'modrinth',
            projectId: 'unresolved',
            projectName: mod.name,
            versionId: 'unresolved',
            versionName: mod.version || 'unknown',
            downloadUrl: '',
            filename: mod.filename,
            contentType: 'mod',
            unresolved: true
          });
        }
      } catch (e) {
        console.warn(`Failed to resolve mod identity for ${mod.name}:`, e);
        resolved.push({
          provider: 'modrinth',
          projectId: 'unresolved',
          projectName: mod.name,
          versionId: 'unresolved',
          versionName: mod.version || 'unknown',
          downloadUrl: '',
          filename: mod.filename,
          contentType: 'mod',
          unresolved: true
        });
      }
    }
    
    return resolved;
  }

  /**
   * Resolve resource pack identities
   */
  private static async resolveResourcePackIdentities(resourcePacks: ResourcePackInfo[], mcVersion: string): Promise<CardModRef[]> {
    const resolved: CardModRef[] = [];
    
    for (const rp of resourcePacks) {
      try {
        const searchResults = await ModrinthClient.searchProjects({
          query: rp.name,
          projectType: 'resourcepack',
          minecraftVersion: mcVersion,
          limit: 5
        });
        
        if (searchResults.hits.length > 0) {
          const project = searchResults.hits[0];
          const versions = await ModrinthClient.getProjectVersions(project.id, [], [mcVersion]);
          
          if (versions.length > 0) {
            const version = versions[0];
            const file = version.files[0];
            
            resolved.push({
              provider: 'modrinth',
              projectId: project.id,
              projectName: project.title,
              versionId: version.id,
              versionName: version.name,
              downloadUrl: file.url,
              filename: file.filename,
              sizeBytes: file.size,
              sha1: file.hashes?.sha1,
              iconUrl: project.icon_url || undefined,
              contentType: 'resourcepack'
            });
          } else {
            resolved.push({
              provider: 'modrinth',
              projectId: 'unresolved',
              projectName: rp.name,
              versionId: 'unresolved',
              versionName: 'unknown',
              downloadUrl: '',
              filename: rp.filename,
              contentType: 'resourcepack',
              unresolved: true
            });
          }
        } else {
          resolved.push({
            provider: 'modrinth',
            projectId: 'unresolved',
            projectName: rp.name,
            versionId: 'unresolved',
            versionName: 'unknown',
            downloadUrl: '',
            filename: rp.filename,
            contentType: 'resourcepack',
            unresolved: true
          });
        }
      } catch (e) {
        console.warn(`Failed to resolve resource pack identity for ${rp.name}:`, e);
        resolved.push({
          provider: 'modrinth',
          projectId: 'unresolved',
          projectName: rp.name,
          versionId: 'unresolved',
          versionName: 'unknown',
          downloadUrl: '',
          filename: rp.filename,
          contentType: 'resourcepack',
          unresolved: true
        });
      }
    }
    
    return resolved;
  }

  /**
   * Resolve shader pack identities
   */
  private static async resolveShaderIdentities(shaderPacks: ShaderPackInfo[], mcVersion: string): Promise<CardModRef[]> {
    const resolved: CardModRef[] = [];
    
    for (const sp of shaderPacks) {
      try {
        const searchResults = await ModrinthClient.searchProjects({
          query: sp.name,
          projectType: 'shader',
          minecraftVersion: mcVersion,
          limit: 5
        });
        
        if (searchResults.hits.length > 0) {
          const project = searchResults.hits[0];
          const versions = await ModrinthClient.getProjectVersions(project.id, [], [mcVersion]);
          
          if (versions.length > 0) {
            const version = versions[0];
            const file = version.files[0];
            
            resolved.push({
              provider: 'modrinth',
              projectId: project.id,
              projectName: project.title,
              versionId: version.id,
              versionName: version.name,
              downloadUrl: file.url,
              filename: file.filename,
              sizeBytes: file.size,
              sha1: file.hashes?.sha1,
              iconUrl: project.icon_url || undefined,
              contentType: 'shader'
            });
          } else {
            resolved.push({
              provider: 'modrinth',
              projectId: 'unresolved',
              projectName: sp.name,
              versionId: 'unresolved',
              versionName: 'unknown',
              downloadUrl: '',
              filename: sp.filename,
              contentType: 'shader',
              unresolved: true
            });
          }
        } else {
          resolved.push({
            provider: 'modrinth',
            projectId: 'unresolved',
            projectName: sp.name,
            versionId: 'unresolved',
            versionName: 'unknown',
            downloadUrl: '',
            filename: sp.filename,
            contentType: 'shader',
            unresolved: true
          });
        }
      } catch (e) {
        console.warn(`Failed to resolve shader pack identity for ${sp.name}:`, e);
        resolved.push({
          provider: 'modrinth',
          projectId: 'unresolved',
          projectName: sp.name,
          versionId: 'unresolved',
          versionName: 'unknown',
          downloadUrl: '',
          filename: sp.filename,
          contentType: 'shader',
          unresolved: true
        });
      }
    }
    
    return resolved;
  }
}
