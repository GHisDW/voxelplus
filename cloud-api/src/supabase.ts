import { createClient, SupabaseClient } from '@supabase/supabase-js';

const getEnv = (key: string): string => process.env[key] || '';

export function getPublicSupabaseClient(): SupabaseClient | null {
  const url = getEnv('SUPABASE_URL');
  const key = getEnv('SUPABASE_ANON_KEY');
  if (!url || !key) {
    return null;
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export function getAdminSupabaseClient(): SupabaseClient | null {
  const url = getEnv('SUPABASE_URL');
  const serviceKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) {
    return null;
  }
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

export function getUserSupabaseClient(accessToken: string): SupabaseClient | null {
  const url = getEnv('SUPABASE_URL');
  const anonKey = getEnv('SUPABASE_ANON_KEY');
  if (!url || !anonKey) {
    return null;
  }
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false }
  });
}
