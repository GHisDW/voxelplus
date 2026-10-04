import { TenantScale } from '@tenantscale/sdk';

let tenantScaleInstance: TenantScale | null = null;

export function getTenantScaleServer(): TenantScale | null {
  if (tenantScaleInstance) return tenantScaleInstance;

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && serviceRoleKey) {
    try {
      tenantScaleInstance = new TenantScale({
        supabaseUrl,
        supabaseKey: serviceRoleKey
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
  tenant_id?: string | null;
  actor_id: string;
  actor_type: 'user' | 'system' | 'admin_api' | 'admin_impersonation';
  action: string;
  resource: string;
  details?: Record<string, any>;
  ip?: string;
  userAgent?: string;
}): Promise<void> {
  const ts = getTenantScaleServer();
  if (!ts) return;

  try {
    await ts.logAuditEvent({
      tenant_id: input.tenant_id || '00000000-0000-0000-0000-000000000000',
      actor_id: input.actor_id,
      actor_type: input.actor_type,
      action: input.action,
      resource: input.resource,
      details: input.details || {},
      ip: input.ip || null,
      user_agent: input.userAgent || null
    });
  } catch (err) {
    console.warn('[CloudAPI Audit] Server audit log error:', err);
  }
}
