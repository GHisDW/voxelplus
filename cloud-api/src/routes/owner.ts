import { Hono } from 'hono';
import { authMiddleware, CloudApiEnv } from '../auth.js';
import { getAdminSupabaseClient } from '../supabase.js';
import { logAuditEventServer } from '../audit.js';

export const ownerRouter = new Hono<CloudApiEnv>();

/**
 * Middleware: verifies caller is an owner or admin via service_role check.
 * NEVER relies on client-supplied data for authorization.
 */
async function ownerAuthMiddleware(c: any, next: any) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized.', code: 'UNAUTHORIZED' }, 401);
  }

  const token = authHeader.substring(7).trim();
  const adminSupabase = getAdminSupabaseClient();
  if (!adminSupabase) {
    return c.json({ error: 'Admin service unavailable.', code: 'UNAVAILABLE' }, 503);
  }

  // Validate token with Supabase
  const { data: { user }, error } = await adminSupabase.auth.getUser(token);
  if (error || !user) {
    return c.json({ error: 'Invalid or expired token.', code: 'UNAUTHORIZED' }, 401);
  }

  // SERVER-SIDE check: is this user an owner or admin?
  const { data: roleRow } = await adminSupabase
    .from('voxel_owner_roles')
    .select('role')
    .eq('user_id', user.id)
    .in('role', ['owner', 'admin'])
    .maybeSingle();

  if (!roleRow) {
    return c.json({ error: 'Insufficient privileges. Owner or admin role required.', code: 'FORBIDDEN' }, 403);
  }

  c.set('authToken', token);
  c.set('authUser', { id: user.id, email: user.email || '', user_metadata: user.user_metadata || {} });
  c.set('ownerRole', roleRow.role);

  await next();
}

/**
 * GET /api/owner/users — list all users (for search/management)
 */
ownerRouter.get('/users', ownerAuthMiddleware, async (c) => {
  const adminSupabase = getAdminSupabaseClient()!;
  const query = c.req.query('q')?.toLowerCase();
  const limit = Math.min(Number(c.req.query('limit') || 50), 100);
  const offset = Number(c.req.query('offset') || 0);

  let dbQuery = adminSupabase
    .from('voxel_users')
    .select('id, username, avatar, bio, is_public, is_creator, created_at, updated_at, selected_cosmetic, selected_title')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (query) {
    dbQuery = dbQuery.ilike('username', `%${query}%`);
  }

  const { data, error } = await dbQuery;
  if (error) return c.json({ error: error.message }, 400);

  return c.json({ users: data || [], offset, limit });
});

/**
 * GET /api/owner/users/:userId — detailed profile for admin view
 */
ownerRouter.get('/users/:userId', ownerAuthMiddleware, async (c) => {
  const userId = c.req.param('userId');
  const adminSupabase = getAdminSupabaseClient()!;

  const { data, error } = await adminSupabase
    .rpc('get_user_admin_profile', { target_user_id: userId });

  if (error || !data) {
    return c.json({ error: error?.message || 'User not found.' }, 404);
  }

  return c.json(data);
});

/**
 * POST /api/owner/users/:userId/title — grant title to user
 */
ownerRouter.post('/users/:userId/title', ownerAuthMiddleware, async (c) => {
  const actorUser = c.get('authUser');
  const targetId = c.req.param('userId');
  const body = await c.req.json();
  const { titleId } = body;

  if (!titleId) return c.json({ error: 'titleId is required.' }, 400);

  const adminSupabase = getAdminSupabaseClient()!;

  // Verify title exists
  const { data: title } = await adminSupabase
    .from('voxel_titles')
    .select('id, name')
    .eq('id', titleId)
    .single();

  if (!title) return c.json({ error: 'Title not found.' }, 404);

  const { error } = await adminSupabase
    .from('voxel_user_titles')
    .upsert({ user_id: targetId, title_id: titleId, granted_by: actorUser.id }, { onConflict: 'user_id,title_id' });

  if (error) return c.json({ error: error.message }, 400);

  // Log to owner audit
  await adminSupabase.from('voxel_owner_audit_log').insert({
    actor_id: actorUser.id,
    actor_role: c.get('ownerRole'),
    action: 'TITLE_GRANTED',
    target_id: targetId,
    metadata: { title_id: titleId, title_name: title.name }
  });

  await logAuditEventServer({
    actor_id: actorUser.id,
    actor_type: 'admin_api',
    action: 'owner.title_granted',
    resource: 'voxel_user_titles',
    details: { target_id: targetId, title_id: titleId }
  });

  return c.json({ success: true });
});

/**
 * DELETE /api/owner/users/:userId/title — revoke title from user
 */
ownerRouter.delete('/users/:userId/title', ownerAuthMiddleware, async (c) => {
  const actorUser = c.get('authUser');
  const targetId = c.req.param('userId');
  const body = await c.req.json();
  const { titleId } = body;

  if (!titleId) return c.json({ error: 'titleId is required.' }, 400);

  const adminSupabase = getAdminSupabaseClient()!;

  await adminSupabase
    .from('voxel_user_titles')
    .delete()
    .eq('user_id', targetId)
    .eq('title_id', titleId);

  await adminSupabase.from('voxel_owner_audit_log').insert({
    actor_id: actorUser.id,
    actor_role: c.get('ownerRole'),
    action: 'TITLE_REVOKED',
    target_id: targetId,
    metadata: { title_id: titleId }
  });

  await logAuditEventServer({
    actor_id: actorUser.id,
    actor_type: 'admin_api',
    action: 'owner.title_revoked',
    resource: 'voxel_user_titles',
    details: { target_id: targetId, title_id: titleId }
  });

  return c.json({ success: true });
});

/**
 * POST /api/owner/users/:userId/badge — grant badge to user
 */
ownerRouter.post('/users/:userId/badge', ownerAuthMiddleware, async (c) => {
  const actorUser = c.get('authUser');
  const targetId = c.req.param('userId');
  const body = await c.req.json();
  const { badgeId } = body;

  if (!badgeId) return c.json({ error: 'badgeId is required.' }, 400);

  const adminSupabase = getAdminSupabaseClient()!;

  const { data: badge } = await adminSupabase
    .from('voxel_badges')
    .select('id, name')
    .eq('id', badgeId)
    .single();

  if (!badge) return c.json({ error: 'Badge not found.' }, 404);

  const { error } = await adminSupabase
    .from('voxel_user_badges')
    .upsert({ user_id: targetId, badge_id: badgeId, granted_by: actorUser.id }, { onConflict: 'user_id,badge_id' });

  if (error) return c.json({ error: error.message }, 400);

  await adminSupabase.from('voxel_owner_audit_log').insert({
    actor_id: actorUser.id,
    actor_role: c.get('ownerRole'),
    action: 'BADGE_GRANTED',
    target_id: targetId,
    metadata: { badge_id: badgeId, badge_name: badge.name }
  });

  await logAuditEventServer({
    actor_id: actorUser.id,
    actor_type: 'admin_api',
    action: 'owner.badge_granted',
    resource: 'voxel_user_badges',
    details: { target_id: targetId, badge_id: badgeId }
  });

  return c.json({ success: true });
});

/**
 * DELETE /api/owner/users/:userId/badge — revoke badge from user
 */
ownerRouter.delete('/users/:userId/badge', ownerAuthMiddleware, async (c) => {
  const actorUser = c.get('authUser');
  const targetId = c.req.param('userId');
  const body = await c.req.json();
  const { badgeId } = body;

  if (!badgeId) return c.json({ error: 'badgeId is required.' }, 400);

  const adminSupabase = getAdminSupabaseClient()!;

  await adminSupabase
    .from('voxel_user_badges')
    .delete()
    .eq('user_id', targetId)
    .eq('badge_id', badgeId);

  await adminSupabase.from('voxel_owner_audit_log').insert({
    actor_id: actorUser.id,
    actor_role: c.get('ownerRole'),
    action: 'BADGE_REVOKED',
    target_id: targetId,
    metadata: { badge_id: badgeId }
  });

  return c.json({ success: true });
});

/**
 * PATCH /api/owner/users/:userId/creator — toggle creator status
 */
ownerRouter.patch('/users/:userId/creator', ownerAuthMiddleware, async (c) => {
  const actorUser = c.get('authUser');
  const targetId = c.req.param('userId');
  const body = await c.req.json();
  const { isCreator } = body;

  const adminSupabase = getAdminSupabaseClient()!;

  const { error } = await adminSupabase
    .from('voxel_users')
    .update({ is_creator: isCreator, updated_at: new Date().toISOString() })
    .eq('id', targetId);

  if (error) return c.json({ error: error.message }, 400);

  await adminSupabase.from('voxel_owner_audit_log').insert({
    actor_id: actorUser.id,
    actor_role: c.get('ownerRole'),
    action: isCreator ? 'CREATOR_GRANTED' : 'CREATOR_REVOKED',
    target_id: targetId,
    metadata: {}
  });

  return c.json({ success: true });
});

/**
 * DELETE /api/owner/users/:userId — delete specific user account (owner action)
 * Requires explicit confirmation phrase in body.
 */
ownerRouter.delete('/users/:userId', ownerAuthMiddleware, async (c) => {
  const actorUser = c.get('authUser');
  const actorRole = c.get('ownerRole');
  const targetId = c.req.param('userId');
  const body = await c.req.json();

  // Require explicit confirmation
  if (body.confirmPhrase !== 'DELETE_ACCOUNT_CONFIRMED') {
    return c.json({ error: 'Confirmation phrase "DELETE_ACCOUNT_CONFIRMED" required.', code: 'CONFIRMATION_REQUIRED' }, 400);
  }

  // Prevent owner from deleting themselves
  if (actorUser.id === targetId) {
    return c.json({ error: 'Cannot delete your own owner account via the control panel.', code: 'SELF_DELETE_FORBIDDEN' }, 403);
  }

  const adminSupabase = getAdminSupabaseClient()!;

  // Get target user info for audit log
  const { data: targetUser } = await adminSupabase
    .from('voxel_users')
    .select('username')
    .eq('id', targetId)
    .maybeSingle();

  // Prevent deleting another owner (only owner can delete owner accounts)
  const { data: targetRole } = await adminSupabase
    .from('voxel_owner_roles')
    .select('role')
    .eq('user_id', targetId)
    .maybeSingle();

  if (targetRole && actorRole !== 'owner') {
    return c.json({ error: 'Only the owner can delete other owner/admin accounts.', code: 'FORBIDDEN' }, 403);
  }

  // Audit BEFORE deletion
  await adminSupabase.from('voxel_owner_audit_log').insert({
    actor_id: actorUser.id,
    actor_role: actorRole,
    action: 'ACCOUNT_DELETED',
    target_id: targetId,
    target_username: targetUser?.username || 'unknown',
    metadata: {}
  });

  await logAuditEventServer({
    actor_id: actorUser.id,
    actor_type: 'admin_api',
    action: 'owner.account_deleted',
    resource: 'voxel_users',
    details: { target_id: targetId, target_username: targetUser?.username }
  });

  // Delete cloud data
  await adminSupabase.from('voxel_cloud_sync').delete().eq('user_id', targetId);
  await adminSupabase.from('voxel_library').delete().eq('user_id', targetId);
  await adminSupabase.from('voxel_users').delete().eq('id', targetId);

  // Delete Auth identity
  const { error: authDeleteErr } = await adminSupabase.auth.admin.deleteUser(targetId);
  if (authDeleteErr) {
    return c.json({ error: `Auth identity deletion failed: ${authDeleteErr.message}` }, 500);
  }

  return c.json({ success: true, deletedUserId: targetId });
});

/**
 * DELETE /api/owner/users/bulk — delete ALL user accounts (EXTREMELY PROTECTED)
 * Requires: owner role (not admin), explicit confirmation phrase, target count confirmation.
 */
ownerRouter.delete('/bulk', ownerAuthMiddleware, async (c) => {
  const actorUser = c.get('authUser');
  const actorRole = c.get('ownerRole');

  // Only owner (not admin) can bulk-delete
  if (actorRole !== 'owner') {
    return c.json({ error: 'Only the platform owner can perform bulk deletion.', code: 'FORBIDDEN' }, 403);
  }

  const body = await c.req.json();
  if (body.confirmPhrase !== 'DELETE_ALL_ACCOUNTS_PERMANENTLY') {
    return c.json({ error: 'Confirmation phrase "DELETE_ALL_ACCOUNTS_PERMANENTLY" required.', code: 'CONFIRMATION_REQUIRED' }, 400);
  }

  const adminSupabase = getAdminSupabaseClient()!;

  // Get all non-owner users
  const { data: allUsers } = await adminSupabase
    .from('voxel_users')
    .select('id, username')
    .not('id', 'in', `(SELECT user_id FROM voxel_owner_roles)`);

  if (!allUsers || allUsers.length === 0) {
    return c.json({ message: 'No non-owner accounts to delete.', deleted: 0 });
  }

  // Audit bulk delete
  await adminSupabase.from('voxel_owner_audit_log').insert({
    actor_id: actorUser.id,
    actor_role: actorRole,
    action: 'BULK_ACCOUNTS_DELETED',
    metadata: { count: allUsers.length }
  });

  await logAuditEventServer({
    actor_id: actorUser.id,
    actor_type: 'admin_api',
    action: 'owner.bulk_accounts_deleted',
    resource: 'auth.users',
    details: { count: allUsers.length }
  });

  let deleted = 0;
  for (const u of allUsers) {
    try {
      await adminSupabase.auth.admin.deleteUser(u.id);
      deleted++;
    } catch (e) {
      console.error('[OwnerPanel] Failed to delete user:', u.id, e);
    }
  }

  return c.json({ success: true, deleted });
});

/**
 * GET /api/owner/audit — owner audit log
 */
ownerRouter.get('/audit', ownerAuthMiddleware, async (c) => {
  const adminSupabase = getAdminSupabaseClient()!;
  const limit = Math.min(Number(c.req.query('limit') || 50), 200);
  const offset = Number(c.req.query('offset') || 0);

  const { data, error } = await adminSupabase
    .from('voxel_owner_audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ log: data || [], offset, limit });
});

/**
 * GET /api/owner/check — check if current token has owner access
 * Safe to call from renderer — only returns boolean, no privileged data.
 */
ownerRouter.get('/check', authMiddleware, async (c) => {
  const authUser = c.get('authUser');
  const adminSupabase = getAdminSupabaseClient();
  if (!adminSupabase) return c.json({ isOwner: false, role: null });

  const { data: roleRow } = await adminSupabase
    .from('voxel_owner_roles')
    .select('role')
    .eq('user_id', authUser.id)
    .maybeSingle();

  return c.json({ isOwner: !!roleRow, role: roleRow?.role || null });
});
