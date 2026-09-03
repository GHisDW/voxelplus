import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { ResourcePackInfo, ShaderPackInfo } from '../../types';
import { InstanceManager } from '../instances/instanceManager';

export class PackManager {
  public static async listResourcePacks(instanceId: string): Promise<ResourcePackInfo[]> {
    const instanceDir = await InstanceManager.getInstanceDir(instanceId);
    if (!instanceDir) return [];

    const rpDir = path.join(instanceDir, 'resourcepacks');
    if (!fs.existsSync(rpDir)) {
      fs.mkdirSync(rpDir, { recursive: true });
      return [];
    }

    const files = fs.readdirSync(rpDir);
    const packs: ResourcePackInfo[] = [];

    for (const filename of files) {
      if (filename.startsWith('.')) continue;

      const filePath = path.join(rpDir, filename);
      const isEnabled = !filename.endsWith('.disabled');
      const stats = fs.statSync(filePath);

      let name = filename.replace('.zip', '').replace('.disabled', '');
      let description = 'Minecraft Resource Pack';
      let format = 34;
      let icon: string | undefined;

      if (stats.isDirectory()) {
        const mcmetaPath = path.join(filePath, 'pack.mcmeta');
        if (fs.existsSync(mcmetaPath)) {
          try {
            const mcmeta = JSON.parse(fs.readFileSync(mcmetaPath, 'utf-8'));
            description = mcmeta.pack?.description || description;
            format = mcmeta.pack?.pack_format || format;
          } catch {}
        }
        const iconPath = path.join(filePath, 'pack.png');
        if (fs.existsSync(iconPath)) {
          icon = `data:image/png;base64,${fs.readFileSync(iconPath).toString('base64')}`;
        }
      } else if (filename.endsWith('.zip') || filename.endsWith('.zip.disabled')) {
        try {
          const zip = new AdmZip(filePath);
          const metaEntry = zip.getEntry('pack.mcmeta');
          if (metaEntry) {
            const mcmeta = JSON.parse(zip.readAsText(metaEntry));
            description = mcmeta.pack?.description || description;
            format = mcmeta.pack?.pack_format || format;
          }
          const iconEntry = zip.getEntry('pack.png');
          if (iconEntry) {
            const iconBuf = zip.readFile(iconEntry);
            if (iconBuf) {
              icon = `data:image/png;base64,${iconBuf.toString('base64')}`;
            }
          }
        } catch {}
      }

      packs.push({
        name,
        description,
        format,
        icon,
        filename,
        enabled: isEnabled,
        path: filePath,
        sizeBytes: stats.size
      });
    }

    return packs;
  }

  public static async listShaderPacks(instanceId: string): Promise<ShaderPackInfo[]> {
    const instanceDir = await InstanceManager.getInstanceDir(instanceId);
    if (!instanceDir) return [];

    const shaderDir = path.join(instanceDir, 'shaderpacks');
    if (!fs.existsSync(shaderDir)) {
      fs.mkdirSync(shaderDir, { recursive: true });
      return [];
    }

    const files = fs.readdirSync(shaderDir);
    const shaders: ShaderPackInfo[] = [];

    for (const filename of files) {
      if (filename.startsWith('.')) continue;

      const filePath = path.join(shaderDir, filename);
      const isEnabled = !filename.endsWith('.disabled');
      const stats = fs.statSync(filePath);

      shaders.push({
        name: filename.replace('.zip', '').replace('.disabled', ''),
        filename,
        enabled: isEnabled,
        path: filePath,
        sizeBytes: stats.size
      });
    }

    return shaders;
  }

  public static async removeResourcePack(instanceId: string, filename: string): Promise<boolean> {
    const instanceDir = await InstanceManager.getInstanceDir(instanceId);
    if (!instanceDir) return false;

    const targetPath = path.join(instanceDir, 'resourcepacks', filename);
    if (fs.existsSync(targetPath)) {
      fs.rmSync(targetPath, { recursive: true, force: true });
      return true;
    }
    return false;
  }

  public static async removeShaderPack(instanceId: string, filename: string): Promise<boolean> {
    const instanceDir = await InstanceManager.getInstanceDir(instanceId);
    if (!instanceDir) return false;

    const targetPath = path.join(instanceDir, 'shaderpacks', filename);
    if (fs.existsSync(targetPath)) {
      fs.rmSync(targetPath, { recursive: true, force: true });
      return true;
    }
    return false;
  }
}
