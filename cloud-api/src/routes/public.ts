import { Hono } from 'hono';
import { getPublicSupabaseClient } from '../supabase.js';

export const publicRouter = new Hono();

publicRouter.get('/profiles', async (c) => {
  const query = c.req.query('q')?.toLowerCase();
  const supabase = getPublicSupabaseClient();

  if (!supabase) {
    return c.json([]);
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc('get_public_user_profiles');

  if (!rpcError && rpcData && Array.isArray(rpcData)) {
    let list = rpcData.map((row: any) => ({
      id: row.id,
      username: row.username,
      avatar: row.avatar,
      bio: row.bio || '',
      createdAt: row.created_at,
      publicPacksCount: Number(row.public_packs_count || 0),
      publicSkinsCount: Number(row.public_skins_count || 0),
      isCreator: Number(row.public_packs_count || 0) > 0 || Number(row.public_skins_count || 0) > 0
    }));

    if (query) {
      list = list.filter(p => p.username.toLowerCase().includes(query) || p.bio.toLowerCase().includes(query));
    }
    return c.json(list);
  }

  // Safe public projection fallback using PostgreSQL RPC view projection
  const { data: users, error } = await supabase
    .from('voxel_users')
    .select('id, username, avatar, bio, created_at')
    .eq('is_public', true)
    .limit(50);

  if (error || !users) {
    return c.json([]);
  }

  let list = users.map(u => ({
    id: u.id,
    username: u.username,
    avatar: u.avatar,
    bio: u.bio || '',
    createdAt: u.created_at,
    publicPacksCount: 0,
    publicSkinsCount: 0,
    isCreator: false
  }));

  if (query) {
    list = list.filter(p => p.username.toLowerCase().includes(query) || p.bio.toLowerCase().includes(query));
  }

  return c.json(list);
});

publicRouter.get('/profiles/:username', async (c) => {
  const username = c.req.param('username');
  const supabase = getPublicSupabaseClient();

  if (!supabase) {
    return c.json({ error: 'Cloud service unconfigured.' }, 503);
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc('get_public_user_profiles');

  if (!rpcError && rpcData && Array.isArray(rpcData)) {
    const match = rpcData.find((row: any) => row.username.toLowerCase() === username.toLowerCase());
    if (match) {
      return c.json({
        id: match.id,
        username: match.username,
        avatar: match.avatar,
        bio: match.bio || '',
        createdAt: match.created_at,
        publicPacksCount: Number(match.public_packs_count || 0),
        publicSkinsCount: Number(match.public_skins_count || 0),
        isCreator: Number(match.public_packs_count || 0) > 0 || Number(match.public_skins_count || 0) > 0
      });
    }
  }

  const { data: user, error } = await supabase
    .from('voxel_users')
    .select('id, username, avatar, bio, created_at, is_public')
    .ilike('username', username)
    .single();

  if (error || !user || !user.is_public) {
    return c.json({ error: 'User not found or profile is private.' }, 404);
  }

  return c.json({
    id: user.id,
    username: user.username,
    avatar: user.avatar,
    bio: user.bio || '',
    createdAt: user.created_at,
    publicPacksCount: 0,
    publicSkinsCount: 0,
    isCreator: false
  });
});
