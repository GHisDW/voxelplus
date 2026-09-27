import { MyPack, CardModRef, CreateInstancePayload } from '../../types';
import { InstanceManager } from '../instances/instanceManager';
import { DownloadManager } from '../modrinth/downloader';
import { PathManager } from '../storage/paths';
import path from 'node:path';

export class PackInstaller {
  /**
   * Install a pack by creating a new instance and downloading all content
   */
  public static async installPack(pack: MyPack): Promise<{ success: boolean; instanceId?: string; error?: string }> {
    try {
      // Validate pack
      if (!pack.id || !pack.name || !pack.minecraftVersion || !pack.loaderType) {
        return { success: false, error: 'Invalid pack data' };
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

      const instance = await InstanceManager.createInstance(instancePayload);
      
      // Download and install mods
      for (const mod of pack.mods) {
        if (mod.unresolved) {
          console.warn(`Skipping unresolved mod: ${mod.projectName}`);
          continue;
        }
        
        if (!mod.downloadUrl) {
          console.warn(`Skipping mod without download URL: ${mod.projectName}`);
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
        } catch (e) {
          console.error(`Failed to download mod ${mod.projectName}:`, e);
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
        } catch (e) {
          console.error(`Failed to download resource pack ${rp.projectName}:`, e);
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
        } catch (e) {
          console.error(`Failed to download shader pack ${sp.projectName}:`, e);
        }
      }

      // Apply configs if present (this would need more sophisticated handling)
      if (pack.configs && Object.keys(pack.configs).length > 0) {
        // For now, configs are stored as metadata
        // In the future, we could write actual config files to the instance
        console.log('Pack has configs but config application not yet implemented');
      }

      return { success: true, instanceId: instance.id };
    } catch (e: any) {
      console.error('Failed to install pack:', e);
      return { success: false, error: e.message || 'Unknown error' };
    }
  }

  /**
   * Install a pack into an existing instance (add content to instance)
   */
  public static async installPackToInstance(pack: MyPack, instanceId: string): Promise<{ success: boolean; error?: string }> {
    try {
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
        } catch (e) {
          console.error(`Failed to download mod ${mod.projectName}:`, e);
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
        } catch (e) {
          console.error(`Failed to download resource pack ${rp.projectName}:`, e);
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
        } catch (e) {
          console.error(`Failed to download shader pack ${sp.projectName}:`, e);
        }
      }

      return { success: true };
    } catch (e: any) {
      console.error('Failed to install pack to instance:', e);
      return { success: false, error: e.message || 'Unknown error' };
    }
  }
}
