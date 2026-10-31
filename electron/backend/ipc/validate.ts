/**
 * IPC argument validation.
 *
 * Every renderer → main `ipcMain.handle` call crosses a trust boundary: the
 * renderer is a web context and must never be assumed to send well-formed
 * arguments. These helpers reject malformed values early with a clear error
 * instead of letting `undefined`/objects/paths leak into filesystem code
 * (which previously could produce `path.join(base, undefined)` throws or
 * traversal via a crafted "filename").
 *
 * The module is dependency-free so it can be unit tested without Electron.
 */

export class IpcValidationError extends Error {
  public readonly code = 'INVALID_IPC_ARGUMENT';

  constructor(label: string, detail: string) {
    super(`Invalid ${label}: ${detail}`);
    this.name = 'IpcValidationError';
  }
}

const MAX_ID_LENGTH = 128;
const MAX_PATH_LENGTH = 1024;
const MAX_TEXT_LENGTH = 4096;

/** Rejects NUL bytes and control characters that break path handling. */
function hasControlCharacters(value: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /[\u0000-\u001f\u007f]/.test(value);
}

export function requireString(value: unknown, label: string, maxLength = MAX_TEXT_LENGTH): string {
  if (typeof value !== 'string') {
    throw new IpcValidationError(label, 'expected a string.');
  }
  if (value.length === 0 || value.length > maxLength) {
    throw new IpcValidationError(label, `expected 1-${maxLength} characters.`);
  }
  if (hasControlCharacters(value)) {
    throw new IpcValidationError(label, 'contains control characters.');
  }
  return value;
}

export function optionalString(value: unknown, label: string, maxLength = MAX_TEXT_LENGTH): string | undefined {
  if (value === undefined || value === null) return undefined;
  return requireString(value, label, maxLength);
}

/**
 * Instance ids are UUIDs today but older installs may still carry import-derived
 * ids, so only path-breaking characters are rejected.
 */
export function requireInstanceId(value: unknown): string {
  const id = requireString(value, 'instance id', MAX_ID_LENGTH);
  if (id === '.' || id === '..' || /[\\/]/.test(id)) {
    throw new IpcValidationError('instance id', 'must not contain path separators.');
  }
  return id;
}

/**
 * Content filenames are single path segments inside an instance folder. Anything
 * that could resolve outside that folder (separators, `..`, absolute paths) is
 * refused so a renderer cannot delete arbitrary files.
 */
export function requireFilename(value: unknown): string {
  const name = requireString(value, 'filename', 260);
  if (name.includes('/') || name.includes('\\') || name.includes('..')) {
    throw new IpcValidationError('filename', 'must be a plain file name.');
  }
  if (/^[a-zA-Z]:/.test(name)) {
    throw new IpcValidationError('filename', 'must not be an absolute path.');
  }
  return name;
}

export function isAbsolutePath(value: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith('\\\\') || value.startsWith('/');
}

export function requireAbsolutePath(value: unknown, label = 'path'): string {
  const target = requireString(value, label, MAX_PATH_LENGTH);
  if (!isAbsolutePath(target)) {
    throw new IpcValidationError(label, 'must be an absolute path.');
  }
  if (target.split(/[\\/]/).includes('..')) {
    throw new IpcValidationError(label, 'must not contain parent-directory segments.');
  }
  return target;
}

export function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new IpcValidationError(label, 'expected a boolean.');
  }
  return value;
}

export function requireEnum<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw new IpcValidationError(label, `expected one of: ${allowed.join(', ')}.`);
  }
  return value as T;
}

export function requirePlainObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new IpcValidationError(label, 'expected an object.');
  }
  return value as Record<string, unknown>;
}

const SUPPORTED_JAVA_MAJORS = [8, 17, 21, 25] as const;
export type SupportedJavaMajor = (typeof SUPPORTED_JAVA_MAJORS)[number];

/** The Java Manager only ever offers these LTS releases. */
export function requireJavaMajorVersion(value: unknown): SupportedJavaMajor {
  const parsed = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof parsed !== 'number' || !SUPPORTED_JAVA_MAJORS.includes(parsed as SupportedJavaMajor)) {
    throw new IpcValidationError('java version', `expected one of: ${SUPPORTED_JAVA_MAJORS.join(', ')}.`);
  }
  return parsed as SupportedJavaMajor;
}


/**
 * Download URLs supplied by the renderer (Modrinth CDN links) must be HTTPS with
 * a host we accept. This mirrors the stricter check in the update service.
 */
export function requireHttpsUrl(value: unknown, label = 'url', allowedHosts?: readonly string[]): string {
  const raw = requireString(value, label, MAX_PATH_LENGTH);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new IpcValidationError(label, 'is not a valid URL.');
  }
  if (parsed.protocol !== 'https:') {
    throw new IpcValidationError(label, 'must use HTTPS.');
  }
  if (allowedHosts && !allowedHosts.includes(parsed.hostname.toLowerCase())) {
    throw new IpcValidationError(label, `host "${parsed.hostname}" is not allowed.`);
  }
  return parsed.toString();
}

/**
 * Validates a native-dialog filter list. Kept permissive (the dialog API only
 * reads `name`/`extensions`) but prevents non-array junk from reaching Electron.
 */
export function sanitizeDialogFilters(value: unknown): { name: string; extensions: string[] }[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) {
    throw new IpcValidationError('filters', 'expected an array.');
  }
  return value.slice(0, 20).map((filter, index) => {
    const entry = requirePlainObject(filter, `filters[${index}]`);
    const name = typeof entry.name === 'string' ? entry.name.slice(0, 100) : 'Files';
    const extensions = Array.isArray(entry.extensions)
      ? entry.extensions
          .filter((ext): ext is string => typeof ext === 'string')
          .map(ext => ext.replace(/[^a-zA-Z0-9*]/g, ''))
          .filter(ext => ext.length > 0)
          .slice(0, 20)
      : [];
    return { name, extensions };
  });
}
