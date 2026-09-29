import { MyPack, CardModRef, CreateInstancePayload } from '../../types';
import { InstanceManager } from '../instances/instanceManager';
import { DownloadManager } from '../modrinth/downloader';
import { PathManager } from '../storage/paths';
import path from 'node:path';

export class PackInstaller {
  /**
   * Validate pack before installation.
   * Returns error message if invalid, null if valid.
   */
  private static validatePack(pack: MyPack): string | null {
    if (!pack.id || !pack.name) {
      return 'Pack must have a valid ID and name';
    }
    if (!pack.minecraftVersion) {
      return 'Pack must specify a Minecraft version';
    }
    if (!pack.loaderType || !pack.loaderVersion) {
      return 'Pack must specify a loader type and version';
    }
    
    return null;
  }

  /**
   * Install a pack by creating a new instance and downloading all content
   */
  public static async installPack(pack: MyPack): Promise<{ success: boolean; instanceId?: string; error?: string }> {
    let instance: any = null;
    
    try {
      // Validate pack
      const validationError = this.validatePack(pack);
      if (validationError) {
        return { success: false, error: validationError };
      }

      // Create instance from pack
      const instancePayload: CreateInstancePayload = {
        name: pack.name,
        minecraftVersion: pack.minecraftVersion,
        loaderType: pack.loaderType,
        loaderVersion: pack.loaderVersion,
        artwork: pack.artwork,
        item: undefined
      };

      instance = await InstanceManager.createInstance(instancePayload);
      
      let successCount = 0;
      let failCount = 0;
      
      // Download and install mods
      for (const mod of pack.mods) {
        if (mod.unresolved) {
          console.warn(`Skipping unresolved mod: ${mod.projectName}`);
          continue;
        }
        
        if (!mod.downloadUrl) {
          console.warn(`Skipping mod without download URL: ${mod.projectName}`);
          failCount++;
          continue;
        }

        try {
          await DownloadManager.downloadToInstance(
            instance.id,
            mod.downloadUrl,
            mod.filename,
            mod.projectName,
            'mod'
          );
          successCount++;
        } catch (e) {
          console.error(`Failed to download mod ${mod.projectName}:`, e);
          failCount++;
          // Continue with other mods even if one fails
        }
      }

      // Download and install resource packs
      for (const rp of pack.resourcePacks) {
        if (rp.unresolved || !rp.downloadUrl) {
          console.warn(`Skipping resource pack: ${rp.projectName}`);
          continue;
        }

        try {
          await DownloadManager.downloadToInstance(
            instance.id,
            rp.downloadUrl,
            rp.filename,
            rp.projectName,
            'resourcepack'
          );
          successCount++;
        } catch (e) {
          console.error(`Failed to download resource pack ${rp.projectName}:`, e);
          failCount++;
        }
      }

      // Download and install shader packs
      for (const sp of pack.shaderPacks) {
        if (sp.unresolved || !sp.downloadUrl) {
          console.warn(`Skipping shader pack: ${sp.projectName}`);
          continue;
        }

        try {
          await DownloadManager.downloadToInstance(
            instance.id,
            sp.downloadUrl,
            sp.filename,
            sp.projectName,
            'shader'
          );
          successCount++;
        } catch (e) {
          console.error(`Failed to download shader pack ${sp.projectName}:`, e);
          failCount++;
        }
      }

      // Apply configs if present (this would need more sophisticated handling)
      if (pack.configs && Object.keys(pack.configs).length > 0) {
        // For now, configs are stored as metadata
        // In the future, we could write actual config files to the instance
        console.log('Pack has configs but config application not yet implemented');
      }

      // Return success even if some downloads failed - instance is still usable
      const errorMessage = failCount > 0 
        ? `Pack installed with ${failCount} failed downloads out of ${successCount + failCount} items. The instance is still usable.` 
        : undefined;

      return { success: true, instanceId: instance.id, error: errorMessage };
    } catch (e: any) {
      console.error('Failed to install pack:', e);
      
      // Note: We do NOT delete the instance here to preserve user data
      // The instance remains usable even if installation fails
      
      return { success: false, error: e.message || 'Unknown error' };
    }
  }

  /**
   * Install a pack into an existing instance (add content to instance)
   */
  public static async installPackToInstance(pack: MyPack, instanceId: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Validate pack
      const validationError = this.validatePack(pack);
      if (validationError) {
        return { success: false, error: validationError };
      }

      // Verify instance exists
      const instance = await InstanceManager.getInstance(instanceId);
      if (!instance) {
        return { success: false, error: 'Instance not found' };
      }

      // Check compatibility
      if (instance.minecraft.version !== pack.minecraftVersion) {
        return { success: false, error: `Minecraft version mismatch: instance is ${instance.minecraft.version}, pack requires ${pack.minecraftVersion}` };
      }

      if (instance.loader.type !== pack.loaderType) {
        return { success: false, error: `Loader type mismatch: instance uses ${instance.loader.type}, pack requires ${pack.loaderType}` };
      }

      let successCount = 0;
      let failCount = 0;

      // Download and install mods
      for (const mod of pack.mods) {
        if (mod.unresolved || !mod.downloadUrl) {
          console.warn(`Skipping mod: ${mod.projectName}`);
          continue;
        }

        try {
          await DownloadManager.downloadToInstance(
            instanceId,
            mod.downloadUrl,
            mod.filename,
            mod.projectName,
            'mod'
          );
          successCount++;
        } catch (e) {
          console.error(`Failed to download mod ${mod.projectName}:`, e);
          failCount++;
        }
      }

      // Download and install resource packs
      for (const rp of pack.resourcePacks) {
        if (rp.unresolved || !rp.downloadUrl) {
          console.warn(`Skipping resource pack: ${rp.projectName}`);
          continue;
        }

        try {
          await DownloadManager.downloadToInstance(
            instanceId,
            rp.downloadUrl,
            rp.filename,
            rp.projectName,
            'resourcepack'
          );
          successCount++;
        } catch (e) {
          console.error(`Failed to download resource pack ${rp.projectName}:`, e);
          failCount++;
        }
      }

      // Download and install shader packs
      for (const sp of pack.shaderPacks) {
        if (sp.unresolved || !sp.downloadUrl) {
          console.warn(`Skipping shader pack: ${sp.projectName}`);
          continue;
        }

        try {
          await DownloadManager.downloadToInstance(
            instanceId,
            sp.downloadUrl,
            sp.filename,
            sp.projectName,
            'shader'
          );
          successCount++;
        } catch (e) {
          console.error(`Failed to download shader pack ${sp.projectName}:`, e);
          failCount++;
        }
      }

      const errorMessage = failCount > 0 
        ? `Pack applied with ${failCount} failed downloads out of ${successCount + failCount} items.` 
        : undefined;

      return { success: true, error: errorMessage };
    } catch (e: any) {
      console.error('Failed to install pack to instance:', e);
      return { success: false, error: e.message || 'Unknown error' };
    }
  }
}
