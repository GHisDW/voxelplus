import { ModrinthProject, ModrinthVersion } from '../../types';

export class ModrinthClient {
  private static readonly BASE_URL = 'https://api.modrinth.com/v2';
  private static readonly USER_AGENT = 'VoxelPlus/1.0.0 (https://github.com/voxelplus)';

  public static async searchProjects(params: {
    query?: string;
    projectType?: 'mod' | 'resourcepack' | 'shader';
    minecraftVersion?: string;
    loader?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ hits: ModrinthProject[]; total_hits: number }> {
    const facets: string[][] = [];

    if (params.projectType) {
      facets.push([`project_type:${params.projectType}`]);
    }

    if (params.minecraftVersion) {
      facets.push([`versions:${params.minecraftVersion}`]);
    }

    if (params.loader && params.loader !== 'all') {
      facets.push([`categories:${params.loader}`]);
    }

    const searchUrl = new URL(`${this.BASE_URL}/search`);
    if (params.query) searchUrl.searchParams.set('query', params.query);
    if (facets.length > 0) searchUrl.searchParams.set('facets', JSON.stringify(facets));
    searchUrl.searchParams.set('limit', String(params.limit || 20));
    searchUrl.searchParams.set('offset', String(params.offset || 0));

    try {
      const response = await fetch(searchUrl.toString(), {
        headers: {
          'User-Agent': this.USER_AGENT
        }
      });

      if (!response.ok) {
        throw new Error(`Modrinth API responded with status ${response.status}`);
      }

      const data = await response.json();
      const hits: ModrinthProject[] = (data.hits || []).map((h: any) => ({
        id: h.project_id || h.id,
        slug: h.slug,
        title: h.title,
        description: h.description,
        categories: h.categories || [],
        client_side: h.client_side || 'required',
        server_side: h.server_side || 'optional',
        icon_url: h.icon_url,
        downloads: h.downloads || 0,
        follows: h.follows || 0,
        author: h.author || 'Author',
        project_type: h.project_type || 'mod',
        gallery: (h.gallery || []).map((g: any) => ({ url: g.url, title: g.title }))
      }));

      return {
        hits,
        total_hits: data.total_hits || 0
      };
    } catch (e: any) {
      console.error('Modrinth search failed:', e);
      return { hits: [], total_hits: 0 };
    }
  }

  public static async getProject(slugOrId: string): Promise<ModrinthProject | null> {
    try {
      const response = await fetch(`${this.BASE_URL}/project/${slugOrId}`, {
        headers: { 'User-Agent': this.USER_AGENT }
      });

      if (!response.ok) return null;
      const data = await response.json();
      return {
        id: data.id,
        slug: data.slug,
        title: data.title,
        description: data.description,
        categories: data.categories || [],
        client_side: data.client_side,
        server_side: data.server_side,
        body: data.body,
        icon_url: data.icon_url,
        downloads: data.downloads,
        follows: data.follows,
        author: data.team || 'Developer',
        project_type: data.project_type
      };
    } catch (e) {
      console.error(`Failed to fetch project ${slugOrId}:`, e);
      return null;
    }
  }

  public static async getProjectVersions(
    slugOrId: string,
    loaders?: string[],
    gameVersions?: string[]
  ): Promise<ModrinthVersion[]> {
    const url = new URL(`${this.BASE_URL}/project/${slugOrId}/version`);
    if (loaders && loaders.length > 0) {
      url.searchParams.set('loaders', JSON.stringify(loaders));
    }
    if (gameVersions && gameVersions.length > 0) {
      url.searchParams.set('game_versions', JSON.stringify(gameVersions));
    }

    try {
      const response = await fetch(url.toString(), {
        headers: { 'User-Agent': this.USER_AGENT }
      });

      if (!response.ok) return [];
      const data = await response.json();

      return (data || []).map((v: any) => ({
        id: v.id,
        project_id: v.project_id,
        name: v.name,
        version_number: v.version_number,
        game_versions: v.game_versions || [],
        loaders: v.loaders || [],
        featured: v.featured || false,
        date_published: v.date_published,
        downloads: v.downloads || 0,
        files: (v.files || []).map((f: any) => ({
          url: f.url,
          filename: f.filename,
          primary: f.primary || false,
          size: f.size || 0,
          hashes: f.hashes || {}
        }))
      }));
    } catch (e) {
      console.error(`Failed to get versions for ${slugOrId}:`, e);
      return [];
    }
  }
}
