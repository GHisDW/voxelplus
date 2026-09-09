import fs from 'node:fs';
import path from 'node:path';
import { InstanceManager } from '../instances/instanceManager';
import { VoxelError } from '../diagnostics';

export class ContentImporter {
  public static async importFile(
    instanceId: string,
    sourceFilePath: string,
    targetType: 'mod' | 'resourcepack' | 'shader' = 'mod'
  ): Promise<{ success: boolean; filename: string; error?: string }> {
    const instanceDir = await InstanceManager.getInstanceDir(instanceId);
    if (!instanceDir) {
      const error = new VoxelError({
        title: 'Import Failed',
        message: 'The selected instance could not be found.',
        suggestedAction: 'Refresh the instances list and select a valid target instance.',
        code: 'INSTANCE_NOT_FOUND',
        category: 'INSTANCE',
        severity: 'ERROR'
      });
      error.log();
      return { success: false, filename: '', error: error.message };
    }

    if (!fs.existsSync(sourceFilePath)) {
      const error = new VoxelError({
        title: 'Import Failed',
        message: 'The selected file could not be found on disk.',
        cause: 'The file may have been moved, renamed, or deleted after being selected.',
        suggestedAction: 'Re-select the file and try again.',
        code: 'SOURCE_FILE_NOT_FOUND',
        category: 'FILESYSTEM',
        severity: 'ERROR',
        details: `Source path: ${sourceFilePath}`
      });
      error.log();
      return { success: false, filename: '', error: error.message };
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
      const isPermission = typeof e?.code === 'string' && (e.code === 'EPERM' || e.code === 'EACCES');
      const error = new VoxelError({
        title: 'Import Failed',
        message: `"${filename}" could not be copied into the instance.`,
        cause: isPermission
          ? 'Windows denied access to the source file or the instance folder.'
          : 'The copy operation failed unexpectedly.',
        suggestedAction: isPermission
          ? 'Close programs using the file, check folder permissions, and try again.'
          : 'Check available disk space and folder permissions, then try again.',
        code: isPermission ? 'FILE_PERMISSION_DENIED' : 'FILE_COPY_FAILED',
        category: 'FILESYSTEM',
        severity: 'ERROR',
        details: `Source: ${sourceFilePath}; destination: ${destPath}`,
        originalError: e
      });
      error.log();
      return { success: false, filename, error: `${error.message} ${error.suggestedAction ?? ''}`.trim() };
    }
  }
}
