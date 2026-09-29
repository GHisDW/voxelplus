import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import AdmZip from 'adm-zip';
import { MyPack, VPackManifest } from '../../types';
import { PackStore } from './packStore';
import { PathManager } from '../storage/paths';
import { InstanceManager } from '../instances/instanceManager';
import { ModManager } from '../content/modManager';
import { PackManager } from '../content/packManager';
import { ModrinthClient } from '../modrinth/modrinthClient';

export class VPackManager {
  private static readonly MANIFEST_FILE = 'manifest.json';
  private static readonly ARTWORK_FILE = 'cc.png';
  private static readonly CONFIG_DIR = 'config';
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
      
      // Add configuration files if they exist
      if (pack.configs && Object.keys(pack.configs).length > 0) {
        // For now, configs are stored as JSON in the manifest
        // In the future, we could include actual config files
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
      } catch (e) {
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
          
          // Validate it's an image extension
          if (!['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext?.toLowerCase() || '')) {
            console.warn('Invalid artwork extension in vpack:', ext);
          } else {
            const base64 = data.toString('base64');
            artwork = `data:image/${ext};base64,${base64}`;
          }
        } catch (e) {
          console.warn('Failed to extract artwork from vpack:', e);
        }
      }

      const newPack: MyPack = {
        id: manifest.id, // Use the original pack ID from manifest
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
    } catch (e: any) {
      console.error('Failed to import vpack:', e);
      return { success: false, error: e.message || 'Unknown error during import' };
    }
  }

  /**
   * Validate manifest structure
   */
  private static validateManifest(manifest: any): { isValid: boolean; error?: string } {
    if (!manifest || typeof manifest !== 'object') {
      return { isValid: false, error: 'Manifest is not an object' };
    }
    
    // Check schema version
    if (manifest.schemaVersion !== this.CURRENT_SCHEMA_VERSION) {
      console.warn('VPack schema version mismatch:', manifest.schemaVersion);
      // We could support migration here in the future
      return { isValid: false, error: `Schema version mismatch. Expected ${this.CURRENT_SCHEMA_VERSION}, got ${manifest.schemaVersion}` };
    }
    
    // Required fields
    if (!manifest.id || typeof manifest.id !== 'string') {
      return { isValid: false, error: 'Missing or invalid pack ID' };
    }
    if (!manifest.name || typeof manifest.name !== 'string') {
      return { isValid: false, error: 'Missing or invalid pack name' };
    }
    if (!manifest.packVersion || typeof manifest.packVersion !== 'string') {
      return { isValid: false, error: 'Missing or invalid pack version' };
    }
    if (!manifest.minecraftVersion || typeof manifest.minecraftVersion !== 'string') {
      return { isValid: false, error: 'Missing or invalid Minecraft version' };
    }
    if (!manifest.loaderType || !['fabric', 'forge', 'neoforge', 'quilt'].includes(manifest.loaderType)) {
      return { isValid: false, error: 'Missing or invalid loader type' };
    }
    if (!manifest.loaderVersion || typeof manifest.loaderVersion !== 'string') {
      return { isValid: false, error: 'Missing or invalid loader version' };
    }
    
    // Validate arrays
    if (!Array.isArray(manifest.mods)) {
      return { isValid: false, error: 'Mods must be an array' };
    }
    if (!Array.isArray(manifest.resourcePacks)) {
      return { isValid: false, error: 'Resource packs must be an array' };
    }
    if (!Array.isArray(manifest.shaderPacks)) {
      return { isValid: false, error: 'Shader packs must be an array' };
    }
    
    // Validate mod references
    for (let i = 0; i < manifest.mods.length; i++) {
      const mod = manifest.mods[i];
      if (!mod.provider || !['modrinth', 'curseforge'].includes(mod.provider)) {
        return { isValid: false, error: `Mod at index ${i} has invalid provider` };
      }
      if (!mod.projectId || typeof mod.projectId !== 'string') {
        return { isValid: false, error: `Mod at index ${i} has invalid project ID` };
      }
      if (!mod.versionId || typeof mod.versionId !== 'string') {
        return { isValid: false, error: `Mod at index ${i} has invalid version ID` };
      }
      if (!mod.downloadUrl || typeof mod.downloadUrl !== 'string') {
        return { isValid: false, error: `Mod at index ${i} has invalid download URL` };
      }
      if (!mod.filename || typeof mod.filename !== 'string') {
        return { isValid: false, error: `Mod at index ${i} has invalid filename` };
      }
    }
    
    // Validate resource pack references
    for (let i = 0; i < manifest.resourcePacks.length; i++) {
      const rp = manifest.resourcePacks[i];
      if (!rp.provider || !['modrinth', 'curseforge'].includes(rp.provider)) {
        return { isValid: false, error: `Resource pack at index ${i} has invalid provider` };
      }
      if (!rp.projectId || !rp.versionId || !rp.downloadUrl || !rp.filename) {
        return { isValid: false, error: `Resource pack at index ${i} is missing required fields` };
      }
    }
    
    // Validate shader pack references
    for (let i = 0; i < manifest.shaderPacks.length; i++) {
      const sp = manifest.shaderPacks[i];
      if (!sp.provider || !['modrinth', 'curseforge'].includes(sp.provider)) {
        return { isValid: false, error: `Shader pack at index ${i} has invalid provider` };
      }
      if (!sp.projectId || !sp.versionId || !sp.downloadUrl || !sp.filename) {
        return { isValid: false, error: `Shader pack at index ${i} is missing required fields` };
      }
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
      // Scan installed mods
      const mods = await ModManager.listMods(instanceId);
      const resolvedMods = await this.resolveModIdentities(mods, instance.minecraft.version, instance.loader.type);
      
      // Scan resource packs
      const resourcePacks = await PackManager.listResourcePacks(instanceId);
      const resolvedResourcePacks = await this.resolveResourcePackIdentities(resourcePacks, instance.minecraft.version);
      
      // Scan shader packs
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
        configs: {}, // Configs would need special handling
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
  private static async resolveModIdentities(mods: any[], mcVersion: string, loader: string): Promise<any[]> {
    const resolved: any[] = [];
    
    for (const mod of mods) {
      try {
        // Try to find by filename hash search on Modrinth
        // This is a best-effort approach - not all mods can be identified
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
              provider: 'modrinth' as const,
              projectId: project.id,
              projectName: project.title,
              versionId: version.id,
              versionName: version.name,
              downloadUrl: file.url,
              filename: file.filename,
              sizeBytes: file.size,
              sha1: file.hashes?.sha1,
              iconUrl: project.icon_url,
              contentType: 'mod' as const
            });
          } else {
            // Mark as unresolved
            resolved.push({
              provider: 'modrinth' as const,
              projectId: 'unresolved',
              projectName: mod.name,
              versionId: 'unresolved',
              versionName: mod.version || 'unknown',
              downloadUrl: '',
              filename: mod.filename,
              contentType: 'mod' as const,
              unresolved: true
            });
          }
        } else {
          // Could not find on Modrinth
          resolved.push({
            provider: 'modrinth' as const,
            projectId: 'unresolved',
            projectName: mod.name,
            versionId: 'unresolved',
            versionName: mod.version || 'unknown',
            downloadUrl: '',
            filename: mod.filename,
            contentType: 'mod' as const,
            unresolved: true
          });
        }
      } catch (e) {
        console.warn(`Failed to resolve mod identity for ${mod.name}:`, e);
        resolved.push({
          provider: 'modrinth' as const,
          projectId: 'unresolved',
          projectName: mod.name,
          versionId: 'unresolved',
          versionName: mod.version || 'unknown',
          downloadUrl: '',
          filename: mod.filename,
          contentType: 'mod' as const,
          unresolved: true
        });
      }
    }
    
    return resolved;
  }

  /**
   * Resolve resource pack identities
   */
  private static async resolveResourcePackIdentities(resourcePacks: any[], mcVersion: string): Promise<any[]> {
    const resolved: any[] = [];
    
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
              provider: 'modrinth' as const,
              projectId: project.id,
              projectName: project.title,
              versionId: version.id,
              versionName: version.name,
              downloadUrl: file.url,
              filename: file.filename,
              sizeBytes: file.size,
              sha1: file.hashes?.sha1,
              iconUrl: project.icon_url,
              contentType: 'resourcepack' as const
            });
          } else {
            resolved.push({
              provider: 'modrinth' as const,
              projectId: 'unresolved',
              projectName: rp.name,
              versionId: 'unresolved',
              versionName: 'unknown',
              downloadUrl: '',
              filename: rp.filename,
              contentType: 'resourcepack' as const,
              unresolved: true
            });
          }
        } else {
          resolved.push({
            provider: 'modrinth' as const,
            projectId: 'unresolved',
            projectName: rp.name,
            versionId: 'unresolved',
            versionName: 'unknown',
            downloadUrl: '',
            filename: rp.filename,
            contentType: 'resourcepack' as const,
            unresolved: true
          });
        }
      } catch (e) {
        console.warn(`Failed to resolve resource pack identity for ${rp.name}:`, e);
        resolved.push({
          provider: 'modrinth' as const,
          projectId: 'unresolved',
          projectName: rp.name,
          versionId: 'unresolved',
          versionName: 'unknown',
          downloadUrl: '',
          filename: rp.filename,
          contentType: 'resourcepack' as const,
          unresolved: true
        });
      }
    }
    
    return resolved;
  }

  /**
   * Resolve shader pack identities
   */
  private static async resolveShaderIdentities(shaderPacks: any[], mcVersion: string): Promise<any[]> {
    const resolved: any[] = [];
    
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
              provider: 'modrinth' as const,
              projectId: project.id,
              projectName: project.title,
              versionId: version.id,
              versionName: version.name,
              downloadUrl: file.url,
              filename: file.filename,
              sizeBytes: file.size,
              sha1: file.hashes?.sha1,
              iconUrl: project.icon_url,
              contentType: 'shader' as const
            });
          } else {
            resolved.push({
              provider: 'modrinth' as const,
              projectId: 'unresolved',
              projectName: sp.name,
              versionId: 'unresolved',
              versionName: 'unknown',
              downloadUrl: '',
              filename: sp.filename,
              contentType: 'shader' as const,
              unresolved: true
            });
          }
        } else {
          resolved.push({
            provider: 'modrinth' as const,
            projectId: 'unresolved',
            projectName: sp.name,
            versionId: 'unresolved',
            versionName: 'unknown',
            downloadUrl: '',
            filename: sp.filename,
            contentType: 'shader' as const,
            unresolved: true
          });
        }
      } catch (e) {
        console.warn(`Failed to resolve shader pack identity for ${sp.name}:`, e);
        resolved.push({
          provider: 'modrinth' as const,
          projectId: 'unresolved',
          projectName: sp.name,
          versionId: 'unresolved',
          versionName: 'unknown',
          downloadUrl: '',
          filename: sp.filename,
          contentType: 'shader' as const,
          unresolved: true
        });
      }
    }
    
    return resolved;
  }
}
