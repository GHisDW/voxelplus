/**
 * Pure update-policy helpers.
 *
 * Kept dependency-free (no Electron/Node APIs) so the release-comparison rules
 * can be unit tested and reviewed independently of the network/install code.
 */

export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
}

/** Parses `v1.2.3`, `1.2.3`, `1.2.3-beta.1` or `1.2.3+build` into parts. */
export function parseVersion(input: string | null | undefined): ParsedVersion | null {
  if (!input) return null;
  const cleaned = String(input).trim().replace(/^v/i, '').split('+')[0];
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(cleaned);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split('.') : []
  };
}

/**
 * Semver-style ordering. Invalid/missing versions sort as 0.0.0 so a malformed
 * tag can never be reported as an upgrade.
 */
export function compareVersions(left: string | null | undefined, right: string | null | undefined): number {
  const a = parseVersion(left) ?? { major: 0, minor: 0, patch: 0, prerelease: [] };
  const b = parseVersion(right) ?? { major: 0, minor: 0, patch: 0, prerelease: [] };

  if (a.major !== b.major) return a.major > b.major ? 1 : -1;
  if (a.minor !== b.minor) return a.minor > b.minor ? 1 : -1;
  if (a.patch !== b.patch) return a.patch > b.patch ? 1 : -1;

  // A release outranks any prerelease of the same version.
  if (a.prerelease.length === 0 && b.prerelease.length === 0) return 0;
  if (a.prerelease.length === 0) return 1;
  if (b.prerelease.length === 0) return -1;

  const length = Math.max(a.prerelease.length, b.prerelease.length);
  for (let i = 0; i < length; i++) {
    const leftPart = a.prerelease[i];
    const rightPart = b.prerelease[i];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;
    const leftNumeric = /^\d+$/.test(leftPart);
    const rightNumeric = /^\d+$/.test(rightPart);
    if (leftNumeric && rightNumeric) {
      return Number(leftPart) > Number(rightPart) ? 1 : -1;
    }
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return leftPart > rightPart ? 1 : -1;
  }
  return 0;
}

export function isNewerVersion(candidate: string | null | undefined, current: string | null | undefined): boolean {
  return compareVersions(candidate, current) > 0;
}

export interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size?: number;
  digest?: string | null;
}

export interface ReleaseInfo {
  tag_name?: string;
  name?: string | null;
  body?: string | null;
  html_url?: string;
  draft?: boolean;
  prerelease?: boolean;
  published_at?: string;
  assets?: ReleaseAsset[];
}

export interface SelectedAsset {
  name: string;
  url: string;
  size: number;
  sha256: string | null;
}

/** Extracts the hex digest from GitHub's `sha256:<hex>` asset digest field. */
export function parseSha256Digest(digest: string | null | undefined): string | null {
  if (!digest) return null;
  const match = /^sha256:([a-f0-9]{64})$/i.exec(digest.trim());
  return match ? match[1].toLowerCase() : null;
}

/**
 * Picks the portable Windows executable from a release. Falls back to any .exe
 * asset (excluding delta/blockmap artefacts) so alternate packaging still works.
 */
/**
 * Names that identify an *installer* rather than a self-contained portable
 * executable. Installers cannot be swapped over the running executable, so they
 * must never be chosen for automatic replacement.
 */
const INSTALLER_ASSET_PATTERN =
  /(setup|installer|install[-_.]?package|nsis|msi|uninstall|squirrel|web[-_.]?setup)/i;

/** The only artefact shape the auto-updater can replace in place. */
const PORTABLE_ASSET_PATTERN = /(portable|standalone)/i;

export function isPortableAssetName(name: string): boolean {
  return /\.exe$/i.test(name) && !INSTALLER_ASSET_PATTERN.test(name) && PORTABLE_ASSET_PATTERN.test(name);
}

/**
 * Picks the *portable* Windows executable from a release.
 *
 * Returns `null` when the release only ships installers (NSIS/Setup) or other
 * artefacts: swapping an installer over the running launcher would corrupt the
 * installation, so callers must fall back to a manual download instead of
 * guessing.
 */
export function selectUpdateAsset(assets: ReleaseAsset[] | undefined | null): SelectedAsset | null {
  const candidates = (assets ?? []).filter(asset =>
    typeof asset?.name === 'string' &&
    typeof asset?.browser_download_url === 'string' &&
    isPortableAssetName(asset.name) &&
    !/\.(blockmap|sha256|sig)$/i.test(asset.name)
  );
  if (candidates.length === 0) return null;

  const preferred = candidates.find(asset => /^VoxelPlus-Portable-.*\.exe$/i.test(asset.name)) ?? candidates[0];

  return {
    name: preferred.name,
    url: preferred.browser_download_url,
    size: typeof preferred.size === 'number' && preferred.size > 0 ? preferred.size : 0,
    sha256: parseSha256Digest(preferred.digest)
  };
}


const MANDATORY_FLAG = /\[(?:mandatory|required|force(?:d)?[-_\s]?update)\]/i;
const MANDATORY_HTML = /<!--\s*voxelplus:mandatory\s*-->/i;
const MINIMUM_VERSION = /\[min(?:imum)?(?:[-_\s]?version)?:\s*v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\]/i;

/**
 * Decide whether an update must be applied before the launcher can be used.
 *
 * Mandatory when:
 *  - the release notes/name carry an explicit marker, or
 *  - the release notes declare a minimum supported version above the running
 *    one, or
 *  - the release is a new major version (breaking change).
 *
 * Everything else is an optional prompt, so a routine patch never locks users
 * out of a working launcher.
 */
export function isMandatoryUpdate(currentVersion: string, release: Pick<ReleaseInfo, 'tag_name' | 'name' | 'body'>): boolean {
  const current = parseVersion(currentVersion);
  const candidateTag = release?.tag_name ?? '';
  const candidate = parseVersion(candidateTag);
  if (!current || !candidate) return false;
  if (!isNewerVersion(candidateTag, currentVersion)) return false;

  const haystack = `${release?.name ?? ''}\n${release?.body ?? ''}`;
  if (MANDATORY_FLAG.test(haystack) || MANDATORY_HTML.test(haystack)) return true;

  const minimum = MINIMUM_VERSION.exec(haystack);
  if (minimum && compareVersions(currentVersion, minimum[1]) < 0) return true;

  return candidate.major > current.major;
}
