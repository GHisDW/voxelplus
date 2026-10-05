import { Hono } from 'hono';
import { getDataClient, DataClient } from '../store.js';

export const publicRouter = new Hono();

type PublicProfileRow = {
  id: string;
  username: string;
  avatar: string;
  avatar_url?: string | null;
  bio: string | null;
  created_at: string;
  is_creator?: boolean | null;
};

/**
 * Builds PublicUserProfile DTOs for the given rows with REAL pack/skin counts
 * fetched from voxel_library. Counts only rows whose metadata explicitly
 * marks them public (metadata.isPublic = true) — the same semantics as the
 * SECURITY DEFINER RPC — so private library items are never counted or
 * exposed, even if RLS were misconfigured to be more permissive.
 * Throws when the library query fails — callers must surface an unavailable
 * state rather than fabricated zero counts.
 */
export async function withLibraryCounts(db: DataClient, rows: PublicProfileRow[]) {
  const counts = new Map<string, { packs: number; skins: number }>();
  for (const row of rows) counts.set(row.id, { packs: 0, skins: 0 });

  if (rows.length > 0) {
    const { data: libRows, error: libErr } = await (db as any)
      .from('voxel_library')
      .select('user_id, type')
      .in('user_id', rows.map(r => r.id))
      .in('type', ['pack', 'skin'])
      .eq('metadata->>isPublic', 'true');

    if (libErr) throw libErr;

    for (const l of libRows || []) {
      const c = counts.get(l.user_id);
      if (!c) continue;
      if (l.type === 'pack') c.packs++;
      else if (l.type === 'skin') c.skins++;
    }
  }

  return rows.map(row => {
    const c = counts.get(row.id)!;
    return {
      id: row.id,
      username: row.username,
      // Canonical avatar: an uploaded avatar (avatar_url) takes precedence
      // over the preset id stored in `avatar`.
      avatar: row.avatar_url || row.avatar,
      bio: row.bio || '',
      createdAt: row.created_at,
      publicPacksCount: c.packs,
      publicSkinsCount: c.skins,
      isCreator: row.is_creator === true
    };
  });
}

publicRouter.get('/profiles', async (c) => {
  const query = c.req.query('q')?.toLowerCase();
  const db = getDataClient();

  if (!db) {
    return c.json({ error: 'Data backend unconfigured.' }, 503);
  }

  const { data: rpcData, error: rpcError } = await (db as any).rpc('get_public_user_profiles');

  if (!rpcError && rpcData && Array.isArray(rpcData)) {
    let list = rpcData.map((row: any) => ({
      id: row.id,
      username: row.username,
      avatar: row.avatar_url || row.avatar,
      bio: row.bio || '',
      createdAt: row.created_at,
      publicPacksCount: Number(row.public_packs_count || 0),
      publicSkinsCount: Number(row.public_skins_count || 0),
      isCreator: row.is_creator === true
    }));

    if (query) {
      list = list.filter(p => p.username.toLowerCase().includes(query) || p.bio.toLowerCase().includes(query));
    }
    return c.json(list);
  }

  // Equivalent safe query fallback: public profiles from voxel_users (public
  // RLS) plus real public library counts. No fabricated zero counts.
  const { data: users, error } = await (db as any)
    .from('voxel_users')
    .select('id, username, avatar, avatar_url, bio, created_at, is_creator')
    .eq('is_public', true)
    .limit(50);

  if (error || !users) {
    return c.json({ error: 'Public profiles are temporarily unavailable.' }, 503);
  }

  let list;
  try {
    list = await withLibraryCounts(db, users as PublicProfileRow[]);
  } catch {
    return c.json({ error: 'Public profiles are temporarily unavailable.' }, 503);
  }

  if (query) {
    list = list.filter(p => p.username.toLowerCase().includes(query) || p.bio.toLowerCase().includes(query));
  }

  return c.json(list);
});

publicRouter.get('/profiles/:username', async (c) => {
  const username = c.req.param('username');
  const db = getDataClient();

  if (!db) {
    return c.json({ error: 'Data backend unconfigured.' }, 503);
  }

  const { data: rpcData, error: rpcError } = await (db as any).rpc('get_public_user_profiles');

  if (!rpcError && rpcData && Array.isArray(rpcData)) {
    const match = rpcData.find((row: any) => row.username.toLowerCase() === username.toLowerCase());
    if (match) {
      return c.json({
        id: match.id,
        username: match.username,
        avatar: match.avatar_url || match.avatar,
        bio: match.bio || '',
        createdAt: match.created_at,
        publicPacksCount: Number(match.public_packs_count || 0),
        publicSkinsCount: Number(match.public_skins_count || 0),
        isCreator: match.is_creator === true
      });
    }
  }

  const { data: user, error } = await (db as any)
    .from('voxel_users')
    .select('id, username, avatar, avatar_url, bio, created_at, is_public, is_creator')
    .ilike('username', username)
    .single();

  if (error || !user || !user.is_public) {
    return c.json({ error: 'User not found or profile is private.' }, 404);
  }

  let list;
  try {
    list = await withLibraryCounts(db, [user as PublicProfileRow]);
  } catch {
    return c.json({ error: 'Public profile is temporarily unavailable.' }, 503);
  }

  return c.json(list[0]);
});
