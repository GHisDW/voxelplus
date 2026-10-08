import { randomUUID } from 'node:crypto';
import { getDataStore } from './store.js';

/**
 * TenantScale SDK 0.4.1 was audited before this adapter was written. Its
 * verified implementation is provider-specific: TenantScale, RateLimiter,
 * PlanStore, WebhookDispatcher and audit helpers all accept/use a
 * provider client and its package has that provider client as a runtime
 * dependency. It does not expose a provider-neutral datastore, migration,
 * transaction, blob, or schema API. It is therefore deliberately not loaded
 * by Voxel+; doing so would reintroduce the dependency this boundary removes.
 * This boundary remains explicit for a future provider-neutral transport.
 */
export const VOXELPLUS_TENANT_ID = process.env.VOXELPLUS_TENANT_ID || 'voxelplus-platform';

const localIpLimits = new Map<string, { count: number; resetAtMs: number }>();
const IP_LIMIT_MAX = 5;
const IP_LIMIT_WINDOW_MS = 60 * 60 * 1000;

export async function logAuditEventServer(input: {
  actor_id: string;
  actor_type: 'user' | 'system' | 'admin_api' | 'admin_impersonation';
  action: string;
  resource: string;
  details?: Record<string, any>;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  try {
    await getDataStore().table('voxel_audit_events').insert({
      id: randomUUID(), tenant_id: VOXELPLUS_TENANT_ID, actor_id: input.actor_id,
      actor_type: input.actor_type, action: input.action, resource: input.resource,
      details: input.details ?? {}, ip: input.ip ?? null,
      user_agent: input.userAgent ?? null, created_at: new Date().toISOString()
    });
  } catch (error) {
    console.warn('[CloudAPI Audit] datastore audit write failed:', error instanceof Error ? error.message : 'unknown error');
  }
}

/** Local abuse control used until TenantScale exposes a provider-neutral API. */
export function checkIpCreationLimit(ip: string): { blocked: boolean; remaining: number; resetAtMs: number } {
  const now = Date.now();
  let entry = localIpLimits.get(ip);
  if (!entry || now > entry.resetAtMs) { entry = { count: 0, resetAtMs: now + IP_LIMIT_WINDOW_MS }; localIpLimits.set(ip, entry); }
  entry.count += 1;
  return { blocked: entry.count > IP_LIMIT_MAX, remaining: Math.max(0, IP_LIMIT_MAX - entry.count), resetAtMs: entry.resetAtMs };
}
