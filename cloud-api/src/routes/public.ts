import { Hono } from 'hono';
import { getDataStore, DataStore } from '../store.js';

export const publicRouter = new Hono();

type ProfileRow = { id: string; username: string; avatar?: string; avatar_url?: string | null; bio?: string | null; created_at: string; is_public?: boolean; is_creator?: boolean | null };

async function publicCards(db: DataStore, rows: ProfileRow[]) {
  const cards = await Promise.all(rows.map(async (row) => {
    const [library, unlocked, badges, titles, cosmetics] = await Promise.all([
      (db as any).table('voxel_library').select('type, metadata').eq('user_id', row.id),
      (db as any).table('voxel_user_achievements').select('achievement_id, unlocked_at').eq('user_id', row.id),
      (db as any).table('voxel_user_badges').select('badge_id').eq('user_id', row.id),
      (db as any).table('voxel_user_titles').select('title_id').eq('user_id', row.id),
      (db as any).table('voxel_user_cosmetics').select('cosmetic_id').eq('user_id', row.id)
    ]);
    if ([library, unlocked, badges, titles, cosmetics].some(result => result.error)) throw new Error('public data unavailable');
    const publicLibrary = (library.data || []).filter((item: any) => item.metadata?.isPublic === true || item.metadata?.isPublic === 'true');
    const achievementIds = (unlocked.data || []).map((item: any) => item.achievement_id);
    const badgeIds = (badges.data || []).map((item: any) => item.badge_id);
    const titleIds = (titles.data || []).map((item: any) => item.title_id);
    const cosmeticIds = (cosmetics.data || []).map((item: any) => item.cosmetic_id);
    const [achievementCatalog, badgeCatalog, titleCatalog, cosmeticCatalog] = await Promise.all([
      achievementIds.length ? (db as any).table('voxel_achievements').select('id, title, icon, rarity').in('id', achievementIds) : { data: [], error: null },
      badgeIds.length ? (db as any).table('voxel_badges').select('id, name, icon').in('id', badgeIds) : { data: [], error: null },
      titleIds.length ? (db as any).table('voxel_titles').select('id, name, color').in('id', titleIds) : { data: [], error: null },
      cosmeticIds.length ? (db as any).table('voxel_cosmetics').select('id, name, icon, rarity').in('id', cosmeticIds).eq('enabled', true) : { data: [], error: null }
    ]);
    if ([achievementCatalog, badgeCatalog, titleCatalog, cosmeticCatalog].some(result => result.error)) throw new Error('public catalog unavailable');
    const byId = (items: any[]) => new Map(items.map(item => [item.id, item]));
    const achievementMap = byId(achievementCatalog.data || []);
    const badgeMap = byId(badgeCatalog.data || []);
    const titleMap = byId(titleCatalog.data || []);
    const cosmeticMap = byId(cosmeticCatalog.data || []);
    return {
      id: row.id,
      username: row.username,
      avatar: row.avatar_url || row.avatar || 'avatar_steve',
      bio: row.bio || '',
      createdAt: row.created_at,
      publicPacksCount: publicLibrary.filter((item: any) => item.type === 'pack').length,
      publicSkinsCount: publicLibrary.filter((item: any) => item.type === 'skin').length,
      isCreator: row.is_creator === true,
      achievements: (unlocked.data || []).map((item: any) => ({ ...achievementMap.get(item.achievement_id), unlockedAt: item.unlocked_at })).filter((item: any) => item.id),
      badges: (badges.data || []).map((item: any) => badgeMap.get(item.badge_id)).filter(Boolean),
      titles: (titles.data || []).map((item: any) => titleMap.get(item.title_id)).filter(Boolean),
      cosmetics: (cosmetics.data || []).map((item: any) => cosmeticMap.get(item.cosmetic_id)).filter(Boolean)
    };
  }));
  return cards;
}

publicRouter.get('/profiles', async (c) => {
  const db = getDataStore(); if (!db) return c.json({ error: 'Data backend unconfigured.' }, 503);
  const query = c.req.query('q')?.trim().toLowerCase();
  const { data, error } = await (db as any).table('voxel_users').select('id, username, avatar, avatar_url, bio, created_at, is_public, is_creator').eq('is_public', true).limit(50);
  if (error) return c.json({ error: 'Public profiles are temporarily unavailable.' }, 503);
  const rows = (data || []).filter((row: ProfileRow) => !query || row.username.toLowerCase().includes(query) || (row.bio || '').toLowerCase().includes(query));
  try { return c.json(await publicCards(db, rows)); } catch { return c.json({ error: 'Public profiles are temporarily unavailable.' }, 503); }
});

publicRouter.get('/profiles/:username', async (c) => {
  const db = getDataStore(); if (!db) return c.json({ error: 'Data backend unconfigured.' }, 503);
  const username = c.req.param('username').trim().toLowerCase();
  const { data, error } = await (db as any).table('voxel_users').select('id, username, avatar, avatar_url, bio, created_at, is_public, is_creator').ilike('username', username).maybeSingle();
  if (error || !data || !data.is_public || data.username.toLowerCase() !== username) return c.json({ error: 'User not found or profile is private.' }, 404);
  try { return c.json((await publicCards(db, [data]))[0]); } catch { return c.json({ error: 'Public profile is temporarily unavailable.' }, 503); }
});
