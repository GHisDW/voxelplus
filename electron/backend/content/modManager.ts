import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { ModInfo } from '../../types';
import { InstanceManager } from '../instances/instanceManager';

export class ModManager {
  public static async listMods(instanceId: string): Promise<ModInfo[]> {
    const instanceDir = await InstanceManager.getInstanceDir(instanceId);
    if (!instanceDir) return [];

    const modsDir = path.join(instanceDir, 'mods');
    if (!fs.existsSync(modsDir)) {
      fs.mkdirSync(modsDir, { recursive: true });
      return [];
    }

    const files = fs.readdirSync(modsDir);
    const mods: ModInfo[] = [];

    for (const filename of files) {
      if (!filename.endsWith('.jar') && !filename.endsWith('.jar.disabled')) {
        continue;
      }

      const filePath = path.join(modsDir, filename);
      const isEnabled = filename.endsWith('.jar');
      const stats = fs.statSync(filePath);

      let modData: Partial<ModInfo> = {
        id: path.basename(filename, filename.endsWith('.disabled') ? '.jar.disabled' : '.jar'),
        name: this.formatModName(filename),
        version: '1.0.0',
        description: 'Minecraft Fabric Mod',
        authors: ['Community'],
        filename,
        enabled: isEnabled,
        path: filePath,
        sizeBytes: stats.size
      };

      // Try reading fabric.mod.json from inside .jar
      try {
        const zip = new AdmZip(filePath);
        const entry = zip.getEntry('fabric.mod.json');
        if (entry) {
          const raw = zip.readAsText(entry);
          const parsed = JSON.parse(raw);

          modData.id = parsed.id || modData.id;
          modData.name = parsed.name || modData.name;
          modData.version = parsed.version || modData.version;
          modData.description = parsed.description || modData.description;
          if (Array.isArray(parsed.authors)) {
            modData.authors = parsed.authors.map((a: any) => typeof a === 'string' ? a : (a.name || 'Author'));
          } else if (typeof parsed.authors === 'string') {
            modData.authors = [parsed.authors];
          }

          // Try loading icon
          if (parsed.icon) {
            const iconEntry = zip.getEntry(parsed.icon);
            if (iconEntry) {
              const iconBuffer = zip.readFile(iconEntry);
              if (iconBuffer) {
                modData.icon = `data:image/png;base64,${iconBuffer.toString('base64')}`;
              }
            }
          }
        }
      } catch (e) {
        // Fallback to filename-based info
      }

      mods.push(modData as ModInfo);
    }

    return mods.sort((a, b) => a.name.localeCompare(b.name));
  }

  public static async toggleMod(instanceId: string, filename: string, enable: boolean): Promise<boolean> {
    const instanceDir = await InstanceManager.getInstanceDir(instanceId);
    if (!instanceDir) return false;

    const modsDir = path.join(instanceDir, 'mods');
    const sourcePath = path.join(modsDir, filename);

    if (!fs.existsSync(sourcePath)) return false;

    let targetPath = sourcePath;
    if (enable && filename.endsWith('.disabled')) {
      targetPath = path.join(modsDir, filename.replace('.disabled', ''));
    } else if (!enable && filename.endsWith('.jar')) {
      targetPath = path.join(modsDir, `${filename}.disabled`);
    }

    if (sourcePath !== targetPath) {
      fs.renameSync(sourcePath, targetPath);
      return true;
    }

    return true;
  }

  public static async removeMod(instanceId: string, filename: string): Promise<boolean> {
    const instanceDir = await InstanceManager.getInstanceDir(instanceId);
    if (!instanceDir) return false;

    const targetPath = path.join(instanceDir, 'mods', filename);
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
      return true;
    }
    return false;
  }

  private static formatModName(filename: string): string {
    const base = filename
      .replace('.jar.disabled', '')
      .replace('.jar', '')
      .replace(/[-_]/g, ' ')
      .replace(/\+.*$/, '')
      .replace(/v?[0-9].*$/, '');
    
    return base.trim() || filename;
  }
}
