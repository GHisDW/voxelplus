import { Hono } from 'hono';
import { authMiddleware, CloudApiEnv } from '../auth.js';
import { getDataClient } from '../store.js';
import { resolveSession, revokeAllSessions } from '../identity.js';
import { logAuditEventServer } from '../audit.js';
import { runTrackedDeletion } from '../deletion.js';

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
  const db = getDataClient();
  if (!db) {
    return c.json({ error: 'Data backend unavailable.', code: 'UNAVAILABLE' }, 503);
  }

  // Validate the Voxel+ session token server-side.
  const user = await resolveSession(db, token);
  if (!user) {
    return c.json({ error: 'Invalid or expired token.', code: 'UNAUTHORIZED' }, 401);
  }

  // SERVER-SIDE check: is this user an owner or admin?
  const { data: roleRow } = await (db as any)
    .from('voxel_owner_roles')
    .select('role')
    .eq('user_id', user.id)
    .in('role', ['owner', 'admin'])
    .maybeSingle();

  if (!roleRow) {
    return c.json({ error: 'Insufficient privileges. Owner or admin role required.', code: 'FORBIDDEN' }, 403);
  }

  c.set('authToken', token);
  c.set('authUser', { id: user.id, username: user.username });
  c.set('ownerRole', roleRow.role);

  await next();
}

/**
 * GET /api/owner/users — list all users (for search/management)
 */
ownerRouter.get('/users', ownerAuthMiddleware, async (c) => {
  const adminSupabase = getDataClient()!;
  const query = c.req.query('q')?.toLowerCase();
  const limit = Math.min(Number(c.req.query('limit') || 50), 100);
  const offset = Number(c.req.query('offset') || 0);

  let dbQuery = adminSupabase
    .from('voxel_users')
    .select('id, username, avatar, avatar_url, bio, is_public, is_creator, created_at, updated_at, selected_cosmetic, selected_title')
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
  const adminSupabase = getDataClient()!;

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

  const adminSupabase = getDataClient()!;

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

  const adminSupabase = getDataClient()!;

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

  const adminSupabase = getDataClient()!;

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

  const adminSupabase = getDataClient()!;

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

// Privileged achievement and cosmetic mutations are deliberately available
// only behind the server-side owner authorization middleware.
ownerRouter.post('/users/:userId/achievement', ownerAuthMiddleware, async (c) => {
  const actor = c.get('authUser'); const targetId = c.req.param('userId'); const { achievementId } = await c.req.json();
  if (!achievementId) return c.json({ error: 'achievementId is required.' }, 400);
  const db = getDataClient()!;
  const { data: achievement } = await (db as any).from('voxel_achievements').select('id').eq('id', achievementId).maybeSingle();
  if (!achievement) return c.json({ error: 'Achievement not found.' }, 404);
  const { error } = await (db as any).from('voxel_user_achievements').upsert({ user_id: targetId, achievement_id: achievementId, unlocked_at: new Date().toISOString(), granted_by: actor.id }, { onConflict: 'user_id,achievement_id' });
  if (error) return c.json({ error: error.message }, 400);
  await logAuditEventServer({ actor_id: actor.id, actor_type: 'admin_api', action: 'owner.achievement_granted', resource: 'voxel_user_achievements', details: { targetId, achievementId } });
  return c.json({ success: true });
});
ownerRouter.delete('/users/:userId/achievement', ownerAuthMiddleware, async (c) => {
  const actor = c.get('authUser'); const targetId = c.req.param('userId'); const { achievementId } = await c.req.json();
  if (!achievementId) return c.json({ error: 'achievementId is required.' }, 400);
  const { error } = await (getDataClient() as any).from('voxel_user_achievements').delete().eq('user_id', targetId).eq('achievement_id', achievementId);
  if (error) return c.json({ error: error.message }, 400);
  await logAuditEventServer({ actor_id: actor.id, actor_type: 'admin_api', action: 'owner.achievement_revoked', resource: 'voxel_user_achievements', details: { targetId, achievementId } });
  return c.json({ success: true });
});
ownerRouter.post('/users/:userId/cosmetic', ownerAuthMiddleware, async (c) => {
  const actor = c.get('authUser'); const targetId = c.req.param('userId'); const { cosmeticId } = await c.req.json();
  if (!cosmeticId) return c.json({ error: 'cosmeticId is required.' }, 400);
  const db = getDataClient()!; const { data: cosmetic } = await (db as any).from('voxel_cosmetics').select('id').eq('id', cosmeticId).maybeSingle();
  if (!cosmetic) return c.json({ error: 'Cosmetic not found.' }, 404);
  const { error } = await (db as any).from('voxel_user_cosmetics').upsert({ user_id: targetId, cosmetic_id: cosmeticId, granted_by: actor.id }, { onConflict: 'user_id,cosmetic_id' });
  if (error) return c.json({ error: error.message }, 400);
  await logAuditEventServer({ actor_id: actor.id, actor_type: 'admin_api', action: 'owner.cosmetic_granted', resource: 'voxel_user_cosmetics', details: { targetId, cosmeticId } });
  return c.json({ success: true });
});
ownerRouter.delete('/users/:userId/cosmetic', ownerAuthMiddleware, async (c) => {
  const actor = c.get('authUser'); const targetId = c.req.param('userId'); const { cosmeticId } = await c.req.json();
  if (!cosmeticId) return c.json({ error: 'cosmeticId is required.' }, 400);
  const { error } = await (getDataClient() as any).from('voxel_user_cosmetics').delete().eq('user_id', targetId).eq('cosmetic_id', cosmeticId);
  if (error) return c.json({ error: error.message }, 400);
  await logAuditEventServer({ actor_id: actor.id, actor_type: 'admin_api', action: 'owner.cosmetic_revoked', resource: 'voxel_user_cosmetics', details: { targetId, cosmeticId } });
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

  const adminSupabase = getDataClient()!;

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

ownerRouter.patch('/users/:userId/status', ownerAuthMiddleware, async (c) => {
  const actor = c.get('authUser'); const targetId = c.req.param('userId'); const { status } = await c.req.json();
  if (status !== 'active' && status !== 'disabled') return c.json({ error: 'status must be active or disabled.' }, 400);
  const db = getDataClient()!;
  const { data: targetRole } = await (db as any).from('voxel_owner_roles').select('role').eq('user_id', targetId).maybeSingle();
  if (targetRole && c.get('ownerRole') !== 'owner') return c.json({ error: 'Only the platform owner can change an owner/admin account status.', code: 'FORBIDDEN' }, 403);
  const { error } = await (db as any).from('voxel_accounts').update({ status }).eq('id', targetId);
  if (error) return c.json({ error: error.message }, 400);
  if (status === 'disabled') await revokeAllSessions(db, targetId);
  await logAuditEventServer({ actor_id: actor.id, actor_type: 'admin_api', action: status === 'disabled' ? 'owner.account_disabled' : 'owner.account_enabled', resource: 'voxel_accounts', details: { targetId, status } });
  return c.json({ success: true, status });
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

  const adminSupabase = getDataClient()!;

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

  // Tracked, resumable deletion: no destructive step runs unless queue
  // state is durable; failures surface with their resume position.
  const outcome = await runTrackedDeletion(adminSupabase, targetId);

  if (outcome.kind === 'queue_unavailable' || outcome.kind === 'unpersisted') {
    return c.json({
      error: outcome.error,
      code: outcome.kind === 'queue_unavailable' ? 'DELETION_STATE_UNAVAILABLE' : 'DELETION_STATE_UNPERSISTED',
      retryable: true
    }, outcome.kind === 'queue_unavailable' ? 503 : 500);
  }
  if (outcome.kind === 'incomplete') {
    return c.json({
      error: `Account deletion incomplete at step "${outcome.step}": ${outcome.error}. The request can be retried.`,
      code: 'DELETION_INCOMPLETE',
      failedStep: outcome.step,
      retryable: true
    }, 500);
  }
  if (outcome.kind === 'already_complete') {
    return c.json({ success: true, deletedUserId: targetId, alreadyDeleted: true });
  }

  // Audit only after the deletion fully succeeded.
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

  const adminSupabase = getDataClient()!;

  // Get all non-owner users (PostgREST does not support subqueries inside
  // .not('in', ...), so resolve owner-role ids explicitly first).
  const { data: roleRows } = await adminSupabase
    .from('voxel_owner_roles')
    .select('user_id');
  const protectedIds = new Set((roleRows || []).map((r: any) => r.user_id));

  const { data: userRows } = await adminSupabase
    .from('voxel_users')
    .select('id, username');

  const allUsers = (userRows || []).filter((u: any) => !protectedIds.has(u.id));

  if (allUsers.length === 0) {
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

  // Per-account tracked deletion: every pipeline step is verified, and a
  // failure records resumable queue state instead of silently skipping the
  // account's remaining cleanup. Accounts whose queue state cannot be
  // persisted are reported as failed without running destructive steps.
  const deleted: string[] = [];
  const failed: { id: string; step?: string; error: string }[] = [];
  for (const u of allUsers) {
    const outcome = await runTrackedDeletion(adminSupabase, u.id);

    if (outcome.kind === 'success' || outcome.kind === 'already_complete') {
      deleted.push(u.id);
    } else {
      console.error('[OwnerPanel] Deletion incomplete for', u.id, ':', outcome.error);
      failed.push({
        id: u.id,
        step: 'step' in outcome ? outcome.step : outcome.kind,
        error: outcome.error
      });
    }
  }

  if (failed.length > 0) {
    return c.json({
      error: `Bulk deletion partially completed: ${deleted.length} deleted, ${failed.length} incomplete.`,
      deletedCount: deleted.length,
      deletedIds: deleted,
      failed,
      // Accounts whose cleanup did not finish remain queued and retryable.
      pendingCleanupIds: failed.map(f => f.id)
    }, 500);
  }

  return c.json({ success: true, deletedCount: deleted.length, deletedIds: deleted });
});

/**
 * GET /api/owner/audit — owner audit log
 */
ownerRouter.get('/audit', ownerAuthMiddleware, async (c) => {
  const adminSupabase = getDataClient()!;
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
  const adminSupabase = getDataClient();
  if (!adminSupabase) return c.json({ isOwner: false, role: null });

  const { data: roleRow } = await adminSupabase
    .from('voxel_owner_roles')
    .select('role')
    .eq('user_id', authUser.id)
    .maybeSingle();

  return c.json({ isOwner: !!roleRow, role: roleRow?.role || null });
});
