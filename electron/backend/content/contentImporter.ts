import fs from 'node:fs';
import path from 'node:path';
import { InstanceManager } from '../instances/instanceManager';

export class ContentImporter {
  public static async importFile(
    instanceId: string,
    sourceFilePath: string,
    targetType: 'mod' | 'resourcepack' | 'shader' = 'mod'
  ): Promise<{ success: boolean; filename: string; error?: string }> {
    const instanceDir = await InstanceManager.getInstanceDir(instanceId);
    if (!instanceDir || !fs.existsSync(sourceFilePath)) {
      return { success: false, filename: '', error: 'Target instance or source file not found.' };
    }

    const filename = path.basename(sourceFilePath);
    let targetFolder = 'mods';
    if (targetType === 'resourcepack') targetFolder = 'resourcepacks';
    if (targetType === 'shader') targetFolder = 'shaderpacks';

    // Auto-detect if targetType not explicitly specified
    if (filename.endsWith('.jar')) {
      targetFolder = 'mods';
    }

    const destDir = path.join(instanceDir, targetFolder);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    const destPath = path.join(destDir, filename);

    try {
      fs.copyFileSync(sourceFilePath, destPath);
      return { success: true, filename };
    } catch (e: any) {
      return { success: false, filename, error: e.message };
    }
  }
}
