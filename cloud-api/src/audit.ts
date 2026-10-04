import { TenantScale } from '@tenantscale/sdk';
import type { AuditEventInput } from '@tenantscale/sdk';

/**
 * Voxel+ is a single-tenant B2C platform.
 * The "tenant" in TenantScale represents the Voxel+ platform itself.
 * This UUID must match the row inserted into the ts_tenants table in Supabase.
 * Set VOXELPLUS_TENANT_ID env var to override the default development UUID.
 */
export const VOXELPLUS_TENANT_ID =
  process.env.VOXELPLUS_TENANT_ID || '00000000-0000-0000-0000-000000000001';

let tenantScaleInstance: TenantScale | null = null;

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

export async function logAuditEventServer(input: {
  actor_id: string;
  actor_type: 'user' | 'system' | 'admin_api' | 'admin_impersonation';
  action: string;
  resource: string;
  details?: Record<string, any>;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  const ts = getTenantScaleServer();
  if (!ts) return;

  // AuditEventInput.tenant_id is a required string in @tenantscale/sdk
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
    // Never let audit log failure block the caller.
    console.warn('[CloudAPI Audit] Server audit log error:', err);
  }
}

/**
 * Use TenantScale's IP creation rate limit guard for account signup.
 * Blocks IPs that attempt to create > 5 accounts per hour.
 */
export function checkIpCreationLimit(ip: string): { blocked: boolean; remaining: number; resetAtMs: number } {
  const ts = getTenantScaleServer();
  if (!ts) return { blocked: false, remaining: 5, resetAtMs: 0 };
  return ts.rateLimiter.checkIpCreationLimit(ip);
}

