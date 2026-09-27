/**
 * CurseForge API v1 client for Voxel+.
 *
 * Security:
 * - API key is read from CURSEFORGE_API_KEY environment variable.
 * - The key is NEVER sent to the renderer process.
 * - The key is NEVER hard-coded or committed.
 *
 * If CURSEFORGE_API_KEY is not set, all methods return
 * { success: false, unconfigured: true } so the frontend
 * can show a clear "CurseForge API key not configured" state.
 */

import {
  ContentProject,
  ContentVersion,
  ContentFile,
  CurseForgeProject,
  CurseForgeFile,
} from '../../types';
import { VoxelError } from '../diagnostics';

const CF_BASE = 'https://api.curseforge.com/v1';

/** Minecraft Java Edition game ID on CurseForge */
const MC_GAME_ID = 432;

/** CurseForge classId for mods */
const CLASS_MOD = 6;

// CurseForge modLoader enum (used in search)
const LOADER_MAP: Record<string, number> = {
  fabric: 4,
  forge: 1,
  quilt: 5,
  neoforge: 6,
};

function getReleaseType(type: number): 'release' | 'beta' | 'alpha' {
  if (type === 1) return 'release';
  if (type === 2) return 'beta';
  return 'alpha';
}

function mapProject(p: CurseForgeProject): ContentProject {
  const gameVersions: string[] = [];
  const loaders: string[] = [];

  for (const fi of p.latestFilesIndexes || []) {
    // Filter out loader entries (contain 'Forge', 'Fabric' etc.)
    if (/^\d/.test(fi.gameVersion)) {
      if (!gameVersions.includes(fi.gameVersion)) {
        gameVersions.push(fi.gameVersion);
      }
    }
  }

  return {
    provider: 'curseforge',
    providerProjectId: String(p.id),
    slug: p.slug || String(p.id),
    name: p.name,
    description: p.summary,
    iconUrl: p.logo?.thumbnailUrl ?? null,
    author: p.authors?.[0]?.name ?? 'Unknown',
    categories: p.categories?.map(c => c.name) ?? [],
    projectType: 'mod',
    downloads: p.downloadCount,
    supportedGameVersions: gameVersions,
    supportedLoaders: loaders,
  };
}

function mapFile(f: CurseForgeFile, projectId: string): ContentVersion {
  const gameVersions: string[] = [];
  const loaders: string[] = [];

  for (const sv of f.sortableGameVersions || []) {
    const name = sv.gameVersionName;
    if (/^\d/.test(name)) {
      if (!gameVersions.includes(name)) gameVersions.push(name);
    } else {
      const lower = name.toLowerCase();
      if (!loaders.includes(lower)) loaders.push(lower);
    }
  }

  // Also include gameVersions directly
  for (const gv of f.gameVersions || []) {
    if (/^\d/.test(gv) && !gameVersions.includes(gv)) {
      gameVersions.push(gv);
    }
  }

  const file: ContentFile = {
    url: f.downloadUrl ?? '',
    filename: f.fileName,
    isPrimary: true,
    sizeBytes: f.fileLength,
  };

  return {
    provider: 'curseforge',
    projectId,
    versionId: String(f.id),
    versionName: f.displayName,
    versionNumber: f.displayName,
    gameVersions,
    loaders,
    releaseType: getReleaseType(f.releaseType),
    datePublished: '',
    downloads: f.downloadCount,
    files: [file],
  };
}

export interface CurseForgeResult<T> {
  success: boolean;
  /** true when API key env var is not set */
  unconfigured?: boolean;
  data?: T;
  error?: string;
}

export class CurseForgeClient {
  private static getApiKey(): string | null {
    return process.env.CURSEFORGE_API_KEY ?? null;
  }

  private static headers(): Record<string, string> | null {
    const key = this.getApiKey();
    if (!key) return null;
    return {
      'x-api-key': key,
      'Accept': 'application/json',
      'User-Agent': 'VoxelPlus/1.0.0',
    };
  }

  public static isConfigured(): boolean {
    return Boolean(this.getApiKey());
  }

  public static async searchMods(params: {
    query?: string;
    minecraftVersion?: string;
    loader?: string;
    limit?: number;
    offset?: number;
  }): Promise<CurseForgeResult<{ projects: ContentProject[]; total: number }>> {
    const hdrs = this.headers();
    if (!hdrs) {
      return { success: false, unconfigured: true, error: 'CURSEFORGE_API_KEY environment variable is not set.' };
    }

    try {
      const url = new URL(`${CF_BASE}/mods/search`);
      url.searchParams.set('gameId', String(MC_GAME_ID));
      url.searchParams.set('classId', String(CLASS_MOD));
      url.searchParams.set('pageSize', String(params.limit ?? 20));
      url.searchParams.set('index', String(params.offset ?? 0));
      if (params.query) url.searchParams.set('searchFilter', params.query);
      if (params.minecraftVersion) url.searchParams.set('gameVersion', params.minecraftVersion);
      if (params.loader && params.loader !== 'all' && LOADER_MAP[params.loader]) {
        url.searchParams.set('modLoaderType', String(LOADER_MAP[params.loader]));
      }
      url.searchParams.set('sortField', '2'); // 2 = Popularity
      url.searchParams.set('sortOrder', 'desc');

      const resp = await fetch(url.toString(), { headers: hdrs });

      if (!resp.ok) {
        throw new VoxelError({
          title: 'CurseForge Search Failed',
          message: 'CurseForge did not respond correctly while searching for mods.',
          cause: `CurseForge API responded with HTTP ${resp.status}.`,
          suggestedAction: 'Check your internet connection or verify your CurseForge API key.',
          code: 'CURSEFORGE_API_ERROR',
          category: 'NETWORK',
          severity: 'ERROR',
        });
      }

      const json = await resp.json() as any;
      const raw: CurseForgeProject[] = json.data ?? [];
      const projects = raw.map(mapProject);

      return {
        success: true,
        data: { projects, total: json.pagination?.totalCount ?? projects.length },
      };
    } catch (e: any) {
      const err = e instanceof VoxelError ? e : new VoxelError({
        title: 'CurseForge Search Failed',
        message: 'CurseForge could not be reached.',
        cause: 'Network is unavailable or blocked.',
        suggestedAction: 'Check your internet connection and try again.',
        code: 'NETWORK_UNREACHABLE',
        category: 'NETWORK',
        severity: 'ERROR',
        originalError: e,
      });
      err.log();
      return { success: false, error: err.message };
    }
  }

  public static async getModFiles(params: {
    modId: string;
    minecraftVersion?: string;
    loader?: string;
  }): Promise<CurseForgeResult<ContentVersion[]>> {
    const hdrs = this.headers();
    if (!hdrs) {
      return { success: false, unconfigured: true, error: 'CURSEFORGE_API_KEY environment variable is not set.' };
    }

    try {
      const url = new URL(`${CF_BASE}/mods/${params.modId}/files`);
      url.searchParams.set('gameId', String(MC_GAME_ID));
      url.searchParams.set('pageSize', '50');
      if (params.minecraftVersion) url.searchParams.set('gameVersion', params.minecraftVersion);
      if (params.loader && LOADER_MAP[params.loader]) {
        url.searchParams.set('modLoaderType', String(LOADER_MAP[params.loader]));
      }

      const resp = await fetch(url.toString(), { headers: hdrs });
      if (!resp.ok) {
        if (resp.status === 404) return { success: true, data: [] };
        throw new Error(`HTTP ${resp.status}`);
      }

      const json = await resp.json() as any;
      const files: CurseForgeFile[] = json.data ?? [];
      const versions = files
        .filter(f => f.isAvailable && f.downloadUrl)
        .map(f => mapFile(f, params.modId));

      return { success: true, data: versions };
    } catch (e: any) {
      const err = e instanceof VoxelError ? e : new VoxelError({
        title: 'CurseForge Files Unavailable',
        message: `Could not load files for mod ${params.modId}.`,
        cause: 'Network error or invalid mod ID.',
        suggestedAction: 'Check your internet connection and try again.',
        code: 'NETWORK_UNREACHABLE',
        category: 'NETWORK',
        severity: 'ERROR',
        originalError: e,
      });
      err.log();
      return { success: false, error: err.message };
    }
  }

  public static async getProject(modId: string): Promise<CurseForgeResult<ContentProject>> {
    const hdrs = this.headers();
    if (!hdrs) {
      return { success: false, unconfigured: true, error: 'CURSEFORGE_API_KEY environment variable is not set.' };
    }

    try {
      const resp = await fetch(`${CF_BASE}/mods/${modId}`, { headers: hdrs });
      if (!resp.ok) return { success: false, error: `HTTP ${resp.status}` };

      const json = await resp.json() as any;
      return { success: true, data: mapProject(json.data as CurseForgeProject) };
    } catch (e: any) {
      return { success: false, error: String(e?.message ?? e) };
    }
  }
}
