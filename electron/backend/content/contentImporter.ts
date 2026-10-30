import fs from 'node:fs';
import path from 'node:path';
import { InstanceManager } from '../instances/instanceManager';
import { PathManager } from '../storage/paths';
import { VoxelError } from '../diagnostics';

export class ContentImporter {
  public static async importFile(
    instanceId: string,
    sourceFilePath: string,
    targetType: 'mod' | 'resourcepack' | 'shader' = 'mod'
  ): Promise<{ success: boolean; filename: string; error?: string }> {
    // Validate source file path is not a directory
    if (!sourceFilePath || typeof sourceFilePath !== 'string') {
      const error = new VoxelError({
        title: 'Import Failed',
        message: 'Invalid file path provided.',
        cause: 'The file path is missing or invalid.',
        suggestedAction: 'Select a valid file and try again.',
        code: 'INVALID_FILE_PATH',
        category: 'FILESYSTEM',
        severity: 'ERROR'
      });
      error.log();
      return { success: false, filename: '', error: error.message };
    }

    // Normalize the source path for validation
    const normalizedSource = path.resolve(sourceFilePath);

    // Reject UNC paths or Windows drive paths that could escape intended scope
    // Note: We allow user-selected files from dialogs, but prevent obvious escapes
    if (normalizedSource.includes('..') || normalizedSource.startsWith('\\\\')) {
      const error = new VoxelError({
        title: 'Import Failed',
        message: 'Invalid file path.',
        cause: 'The file path contains invalid path components.',
        suggestedAction: 'Select a valid file from a standard location.',
        code: 'INVALID_PATH_COMPONENTS',
        category: 'FILESYSTEM',
        severity: 'ERROR',
        details: `Source path: ${sourceFilePath}`
      });
      error.log();
      return { success: false, filename: '', error: error.message };
    }

    const instanceDir = await InstanceManager.getInstanceDir(instanceId);
    if (!instanceDir) {
      const error = new VoxelError({
        title: 'Import Failed',
        message: `Could not resolve instance "${instanceId}" to an installation directory. The instance metadata is missing or invalid.`,
        cause: 'The instance folder or metadata file may have been moved or deleted.',
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
        message: `The selected file could not be found on disk at path: ${sourceFilePath}`,
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

    // Ensure source is a file, not a directory
    const sourceStat = fs.statSync(sourceFilePath);
    if (!sourceStat.isFile()) {
      const error = new VoxelError({
        title: 'Import Failed',
        message: 'The selected path is not a file.',
        cause: 'Only files can be imported. Directories are not supported.',
        suggestedAction: 'Select a valid file (e.g., .jar, .zip) and try again.',
        code: 'NOT_A_FILE',
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

    // Auto-detect only when the caller did not provide an explicit type.
    // A .jar is always a mod — but only override when the target is still
    // the default 'mods'; an explicit 'resourcepack' or 'shader' type must
    // never be silently overridden by this heuristic.
    if (targetType === 'mod' && filename.endsWith('.jar')) {
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
