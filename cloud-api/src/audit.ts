import { TenantScale } from '@tenantscale/sdk';
import type { AuditEventInput } from '@tenantscale/sdk';
import { getDataClient } from './store.js';
import { randomUUID } from 'node:crypto';

/**
 * Voxel+ is a single-tenant B2C platform.
 * The "tenant" in TenantScale represents the Voxel+ platform itself.
 * This UUID must match the row inserted into the ts_tenants table in Supabase.
 * Set VOXELPLUS_TENANT_ID env var to override the default development UUID.
 */
export const VOXELPLUS_TENANT_ID =
  process.env.VOXELPLUS_TENANT_ID || '00000000-0000-0000-0000-000000000001';

let tenantScaleInstance: TenantScale | null = null;

/**
 * TenantScale is infrastructure: audit logging and IP device-registration rate limiting.
 * It is only instantiated when Supabase credentials exist (it stores its
 * data in the same Postgres project) — never with Electron/renderer creds.
 */
export function getTenantScaleServer(): TenantScale | null {
  if (tenantScaleInstance) return tenantScaleInstance;

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && serviceRoleKey) {
    try {
      tenantScaleInstance = new TenantScale({
        supabaseUrl,
        supabaseKey: serviceRoleKey,
        deploymentMode: 'cloud'
      });
      return tenantScaleInstance;
    } catch (e) {
      console.warn('[CloudAPI Audit] TenantScale initialization failed:', e);
      return null;
    }
  }
  return null;
}

/**
 * Writes an audit event to `voxel_audit_events` on the active data backend
 * (works identically on Supabase and the in-memory dev backend), and — when
 * TenantScale is configured — also forwards it to the TenantScale audit
 * stream. Never lets audit failure block the caller.
 */
export async function logAuditEventServer(input: {
  actor_id: string;
  actor_type: 'user' | 'system' | 'admin_api' | 'admin_impersonation';
  action: string;
  resource: string;
  details?: Record<string, any>;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  const db = getDataClient();
  if (db) {
    try {
      await (db as any).from('voxel_audit_events').insert({
        id: randomUUID(),
        tenant_id: VOXELPLUS_TENANT_ID,
        actor_id: input.actor_id,
        actor_type: input.actor_type,
        action: input.action,
        resource: input.resource,
        details: input.details ?? {},
        ip: input.ip ?? null,
        user_agent: input.userAgent ?? null,
        created_at: new Date().toISOString()
      });
    } catch (err) {
      console.warn('[CloudAPI Audit] DB audit write error:', err);
    }
  }

  const ts = getTenantScaleServer();
  if (ts) {
    const event: AuditEventInput = {
      tenant_id: VOXELPLUS_TENANT_ID,
      actor_id: input.actor_id,
      actor_type: input.actor_type,
      action: input.action,
      resource: input.resource,
      details: input.details ?? {},
      ip: input.ip ?? null,
      user_agent: input.userAgent ?? null
    };
    try {
      await ts.logAuditEvent(event);
    } catch (err) {
      console.warn('[CloudAPI Audit] TenantScale audit log error:', err);
    }
  }
}

// Local fallback for the IP creation rate limit when TenantScale is not
// configured (e.g. in-memory dev backend): 5 accounts/hour per IP.
const localIpLimits = new Map<string, { count: number; resetAtMs: number }>();
const IP_LIMIT_MAX = 5;
const IP_LIMIT_WINDOW_MS = 60 * 60 * 1000;

/**
 * IP-based account-creation rate limit. Prefers TenantScale's limiter when
 * configured; otherwise an in-process equivalent with the same threshold.
 */
export function checkIpCreationLimit(ip: string): { blocked: boolean; remaining: number; resetAtMs: number } {
  const ts = getTenantScaleServer();
  if (ts) return ts.rateLimiter.checkIpCreationLimit(ip);

  const now = Date.now();
  let entry = localIpLimits.get(ip);
  if (!entry || now > entry.resetAtMs) {
    entry = { count: 0, resetAtMs: now + IP_LIMIT_WINDOW_MS };
    localIpLimits.set(ip, entry);
  }
  entry.count += 1;
  return {
    blocked: entry.count > IP_LIMIT_MAX,
    remaining: Math.max(0, IP_LIMIT_MAX - entry.count),
    resetAtMs: entry.resetAtMs
  };
}
