import { MyPack, CardModRef, CreateInstancePayload, InstanceMetadata } from '../../types';
import { InstanceManager } from '../instances/instanceManager';
import { DownloadManager } from '../modrinth/downloader';

export interface PackInstallResult {
  success: boolean;
  partialSuccess?: boolean;
  instanceId?: string;
  successCount: number;
  failCount: number;
  totalItems: number;
  error?: string;
}

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
  public static async installPack(pack: MyPack): Promise<PackInstallResult> {
    let instance: InstanceMetadata | null = null;
    
    try {
      // Validate pack
      const validationError = this.validatePack(pack);
      if (validationError) {
        return {
          success: false,
          successCount: 0,
          failCount: 0,
          totalItems: 0,
          error: validationError,
        };
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
      const totalItems = (pack.mods?.length || 0) + (pack.resourcePacks?.length || 0) + (pack.shaderPacks?.length || 0);

      // Download and install mods
      for (const mod of pack.mods || []) {
        if (mod.unresolved || !mod.downloadUrl) {
          console.warn(`Skipping unresolved mod or mod without download URL: ${mod.projectName}`);
          failCount++;
          continue;
        }

        try {
          const res = await DownloadManager.downloadToInstance(
            instance.id,
            mod.downloadUrl,
            mod.filename,
            mod.projectName,
            'mod'
          );
          if (res.success) {
            successCount++;
          } else {
            failCount++;
          }
        } catch (e: unknown) {
          console.error(`Failed to download mod ${mod.projectName}:`, e);
          failCount++;
        }
      }

      // Download and install resource packs
      for (const rp of pack.resourcePacks || []) {
        if (rp.unresolved || !rp.downloadUrl) {
          console.warn(`Skipping resource pack: ${rp.projectName}`);
          failCount++;
          continue;
        }

        try {
          const res = await DownloadManager.downloadToInstance(
            instance.id,
            rp.downloadUrl,
            rp.filename,
            rp.projectName,
            'resourcepack'
          );
          if (res.success) {
            successCount++;
          } else {
            failCount++;
          }
        } catch (e: unknown) {
          console.error(`Failed to download resource pack ${rp.projectName}:`, e);
          failCount++;
        }
      }

      // Download and install shader packs
      for (const sp of pack.shaderPacks || []) {
        if (sp.unresolved || !sp.downloadUrl) {
          console.warn(`Skipping shader pack: ${sp.projectName}`);
          failCount++;
          continue;
        }

        try {
          const res = await DownloadManager.downloadToInstance(
            instance.id,
            sp.downloadUrl,
            sp.filename,
            sp.projectName,
            'shader'
          );
          if (res.success) {
            successCount++;
          } else {
            failCount++;
          }
        } catch (e: unknown) {
          console.error(`Failed to download shader pack ${sp.projectName}:`, e);
          failCount++;
        }
      }

      const isCompleteSuccess = failCount === 0;
      const isPartialSuccess = successCount > 0 && failCount > 0;

      const errorMessage = failCount > 0 
        ? `Pack installation encountered ${failCount} failed download(s) out of ${totalItems} item(s).`
        : undefined;

      return {
        success: isCompleteSuccess,
        partialSuccess: isPartialSuccess,
        instanceId: instance.id,
        successCount,
        failCount,
        totalItems,
        error: errorMessage
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error during pack installation';
      console.error('Failed to install pack:', e);
      return {
        success: false,
        successCount: 0,
        failCount: 1,
        totalItems: 1,
        error: msg
      };
    }
  }

  /**
   * Install a pack into an existing instance (add content to instance)
   */
  public static async installPackToInstance(pack: MyPack, instanceId: string): Promise<PackInstallResult> {
    try {
      // Validate pack
      const validationError = this.validatePack(pack);
      if (validationError) {
        return { success: false, successCount: 0, failCount: 0, totalItems: 0, error: validationError };
      }

      // Verify instance exists
      const instance = await InstanceManager.getInstance(instanceId);
      if (!instance) {
        return { success: false, successCount: 0, failCount: 0, totalItems: 0, error: 'Instance not found' };
      }

      // Check compatibility
      if (instance.minecraft.version !== pack.minecraftVersion) {
        return { success: false, successCount: 0, failCount: 0, totalItems: 0, error: `Minecraft version mismatch: instance is ${instance.minecraft.version}, pack requires ${pack.minecraftVersion}` };
      }

      if (instance.loader.type !== pack.loaderType) {
        return { success: false, successCount: 0, failCount: 0, totalItems: 0, error: `Loader type mismatch: instance uses ${instance.loader.type}, pack requires ${pack.loaderType}` };
      }

      let successCount = 0;
      let failCount = 0;
      const totalItems = (pack.mods?.length || 0) + (pack.resourcePacks?.length || 0) + (pack.shaderPacks?.length || 0);

      // Download and install mods
      for (const mod of pack.mods || []) {
        if (mod.unresolved || !mod.downloadUrl) {
          console.warn(`Skipping mod: ${mod.projectName}`);
          failCount++;
          continue;
        }

        try {
          const res = await DownloadManager.downloadToInstance(
            instanceId,
            mod.downloadUrl,
            mod.filename,
            mod.projectName,
            'mod'
          );
          if (res.success) {
            successCount++;
          } else {
            failCount++;
          }
        } catch (e: unknown) {
          console.error(`Failed to download mod ${mod.projectName}:`, e);
          failCount++;
        }
      }

      // Download and install resource packs
      for (const rp of pack.resourcePacks || []) {
        if (rp.unresolved || !rp.downloadUrl) {
          console.warn(`Skipping resource pack: ${rp.projectName}`);
          failCount++;
          continue;
        }

        try {
          const res = await DownloadManager.downloadToInstance(
            instanceId,
            rp.downloadUrl,
            rp.filename,
            rp.projectName,
            'resourcepack'
          );
          if (res.success) {
            successCount++;
          } else {
            failCount++;
          }
        } catch (e: unknown) {
          console.error(`Failed to download resource pack ${rp.projectName}:`, e);
          failCount++;
        }
      }

      // Download and install shader packs
      for (const sp of pack.shaderPacks || []) {
        if (sp.unresolved || !sp.downloadUrl) {
          console.warn(`Skipping shader pack: ${sp.projectName}`);
          failCount++;
          continue;
        }

        try {
          const res = await DownloadManager.downloadToInstance(
            instanceId,
            sp.downloadUrl,
            sp.filename,
            sp.projectName,
            'shader'
          );
          if (res.success) {
            successCount++;
          } else {
            failCount++;
          }
        } catch (e: unknown) {
          console.error(`Failed to download shader pack ${sp.projectName}:`, e);
          failCount++;
        }
      }

      const isCompleteSuccess = failCount === 0;
      const isPartialSuccess = successCount > 0 && failCount > 0;

      const errorMessage = failCount > 0 
        ? `Pack applied with ${failCount} failed download(s) out of ${totalItems} item(s).`
        : undefined;

      return {
        success: isCompleteSuccess,
        partialSuccess: isPartialSuccess,
        successCount,
        failCount,
        totalItems,
        error: errorMessage
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      console.error('Failed to install pack to instance:', e);
      return { success: false, successCount: 0, failCount: 1, totalItems: 1, error: msg };
    }
  }
}
