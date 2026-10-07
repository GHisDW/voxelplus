import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { MemoryDataClient, sharedMemoryClient } from './memoryStore.js';

/**
 * Data-backend selection for the Voxel+ Cloud API.
 *
 * The API talks to a `DataClient` — the service-role-shaped object returned
 * by `getDataClient()` — which is either:
 *
 *   - a real Supabase service-role client (production), when SUPABASE_URL +
 *     SUPABASE_SERVICE_ROLE_KEY are configured; or
 *   - the in-memory backend (development/contributors/tests), selected
 *     explicitly with VOXELPLUS_DATA_BACKEND=memory. Seeded with the catalog so a fresh clone
 *     works end-to-end with ZERO secrets.
 *
 * There is intentionally no "user-scoped" or "anon" client any more: Voxel+
 * uses Voxel+ device identities, not Supabase Auth JWTs, so ownership is
 * enforced by the server code (user_id filters + authMiddleware identity)
 * on top of a privileged data client that never leaves this process.
 */
export type DataClient = SupabaseClient | MemoryDataClient;

let resolved: DataClient | null = null;

export function isMemoryBackend(): boolean {
  const forced = (process.env.VOXELPLUS_DATA_BACKEND || '').toLowerCase();
  if (forced === 'memory') return process.env.NODE_ENV !== 'production';
  if (forced === 'supabase') return false;
  // Memory is opt-in in every environment; production can never silently
  // downgrade to an ephemeral backend.
  return false;
}

export function getDataClient(): DataClient | null {
  if (resolved) return resolved;
  if (isMemoryBackend()) {
    sharedMemoryClient.seedDevData();
    resolved = sharedMemoryClient;
  } else {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
    resolved = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return resolved;
}

/** Test helper: force the backend choice (and reseed memory). */
export function _resetDataClientForTests(client?: DataClient | null): void {
  resolved = client === undefined ? null : client;
  if (resolved === sharedMemoryClient) sharedMemoryClient.seedDevData();
}
