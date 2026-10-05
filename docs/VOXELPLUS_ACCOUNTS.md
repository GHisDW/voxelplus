# Voxel⁺ Account, Cloud Identity & Security Architecture

## Overview

The **Voxel⁺ Account System** provides a custom launcher identity, cosmetics, achievements, and cloud synchronization platform built for Voxel⁺ platform users.

> **Important Identity Distinction:**
> A Voxel⁺ Account is **NOT** a Minecraft account and is **NOT** a Microsoft account.
> It does not replace or interfere with Minecraft authentication, Mojang tokens, or standard offline player UUIDs.

---

## 1. System Architecture

```
+-------------------------------------------------------------------------+
|                          Voxel⁺ Electron App                            |
|                                                                         |
|  - Renders UI (100% username/password based, no email exposed)          |
|  - Session encrypted locally with safeStorage (fallback to memory)     |
|  - Zero administrative credentials / service role secrets               |
+-------------------------------------------------------------------------+
                                    |
                                    | Secure IPC Bridge
                                    v
+-------------------------------------------------------------------------+
|                       Voxel⁺ Cloud API Microservice                     |
|                                                                         |
|  - Username+password auth: scrypt credentials in voxel_accounts         |
|  - Voxel+ sessions: opaque tokens, SHA-256 hashed in voxel_sessions     |
|  - Server-authoritative achievement evaluation & reward granting        |
|  - Server-authoritative cosmetic ownership validation                   |
|  - Avatar upload MIME / size validation -> Supabase Storage             |
|  - Server-authoritative Owner / Admin role checks                       |
|  - Protected account deletion and audited bulk deletion                 |
+-------------------------------------------------------------------------+
           |                                             |
           | Infrastructure only                         | Persistence
           v                                             v
+-----------------------------+        +----------------------------------+
|         TenantScale         |        |       Supabase Cloud Service     |
|                             |        |                                  |
| - IP signup rate limiting   |        | - PostgreSQL Database + RLS      |
| - Audit event forwarding    |        | - Storage (avatars/{userId}/...) |
+-----------------------------+        +----------------------------------+
```

---

## 2. Component Roles & Credentials Boundary

| Component | Responsibility | Credential Type |
| :--- | :--- | :--- |
| **Electron Renderer** | Desktop UI, local caching, IPC boundary | No Cloud Keys (IPC only) |
| **Electron Main** | Session store encryption (safeStorage), IPC handlers | `VOXELPLUS_CLOUD_API_URL` |
| **Cloud API Microservice** | Identity, sessions, achievement logic, avatar pipeline, owner access | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VOXELPLUS_TENANT_ID` |
| **TenantScale SDK** | IP signup rate limiter, audit event forwarding | Server-side only; optional (local fallbacks) |
| **`voxel_accounts`** | Voxel+ credential rows (scrypt password hashes) | service-role only, no user RLS policy |
| **`voxel_sessions`** | Voxel+ session tokens (SHA-256 hashed, 30d expiry) | service-role only, no user RLS policy |
| **PostgreSQL + RLS** | User data persistence | Ownership enforced server-side (`user_id` filters) |
| **Supabase Storage** | Profile picture storage bucket (`avatars`) | Storage RLS Policies (`avatars/{userId}/...`) |

> **No email anywhere.** Voxel+ accounts are username+password. There is no
> Supabase Auth user, no internal email address, and no confirmation flow.
> TenantScale is infrastructure (rate limiting + audit forwarding), not the
> identity UX; its session validation is not used because Voxel+ is a
> single-tenant B2C product where players have no tenant memberships.

### Security Boundary Guarantees:
1. **Zero Secret Leakage:** The desktop client bundle contains **0** Supabase service-role keys or database admin credentials. All privileged operations go through the Cloud API.
2. **Server-Authoritative Evaluation:** Achievements, titles, badges, and cosmetics cannot be granted by client request. The server derives unlocks from authoritative state after real actions.
3. **Owner Role Authorization:** Owner endpoints verify role records in `voxel_owner_roles` server-side. No client-side checks (`username === 'GHisDW'`) can grant access.

---

## 3. Database Migrations

The database schema is defined in sequential migrations:

1. `migrations/001_initial_account_schema.sql`: Core `voxel_users`, `voxel_cloud_sync`, and `voxel_library` tables with RLS policies.
2. `migrations/002_cosmetics_achievements_titles_badges.sql`: Minecraft cosmetics catalog, user cosmetics, achievements catalog, user achievements, titles, badges, and user-assigned titles/badges.
3. `migrations/003_owner_panel.sql`: `voxel_owner_roles` table, `voxel_owner_audit_log` table, and server-side RPC functions for owner administration.
4. `migrations/004_avatar_storage.sql`: Supabase Storage bucket configuration and RLS policies for user-isolated avatar paths (`avatars/{userId}/*`).
5. `migrations/005_public_profile_creator_flag.sql`: Public-profile RPC returns `is_creator` + `avatar_url`.
6. `migrations/006_cosmetics_achievements_overhaul.sql`: Condition-based achievements, canonical cosmetic catalog, `voxel_instances`, `voxel_ad_completions`, `voxel_ad_progress`, `voxel_vpack_catalog`.
7. `migrations/007_username_password_auth.sql`: `voxel_accounts` (scrypt credentials), `voxel_sessions` (hashed tokens), `voxel_audit_events`, and re-keying of per-user FKs from `auth.users` to `voxel_accounts`.

---

## 4. Minecraft-Native Cosmetics System

Cosmetics are collectible Minecraft items that decorate player profiles, avatar frames, and community cards:

| Cosmetic | Type | Rarity | Unlock Requirement |
| :--- | :--- | :--- | :--- |
| **Dirt Block** 🧱 | Frame / Icon | Common | Create a Voxel⁺ account ("First Steps") |
| **Crafting Table** 🪓 | Frame / Icon | Common | Create first Minecraft instance ("Builder") |
| **Wooden Chest** 📦 | Frame / Icon | Rare | Save content to Library ("Collector") |
| **Compass** 🧭 | Frame / Icon | Rare | Install content into an instance ("Explorer") |
| **Emerald** 🟩 | Frame / Icon | Rare | Make profile public ("Community") |
| **Diamond** 💎 | Frame / Icon | Epic | Publish or export a pack ("Creator") |
| **Netherite Ingot** 🔥 | Frame / Icon | Legendary | Multi-version testing ("Veteran") |
| **Nether Star** ⭐ | Frame / Icon | Legendary | Early supporter / Founder ("Founder") |

---

## 5. Server-Authoritative Achievements

Achievements are unlocked by the server-side engine (`achievementEngine.ts`),
which recomputes condition-based metrics from authoritative state after real
actions (instance create, library save, VPack create/install/convert, profile
visibility, avatar upload, ad completion). Clients cannot report or trigger
unlocks — there is no client-facing achievement endpoint.

Metrics include: instances created (lifetime counter, immune to
delete/recreate farming), distinct MC versions, cosmetics/effects owned,
VPacks created/installed/converted, library size, public packs, mods/shaders
installed, public profile, custom avatar, legendary ownership.

Rewards (cosmetics / titles / badges) are granted idempotently via
`UNIQUE(user_id, *_id)` upserts — concurrent unlocks collapse to one grant.
Hidden `secret` achievements are masked server-side (`???`) until unlocked.

### Rewarded Ads

Cosmetics and VPacks are acquired via rewarded ads with rarity-based,
server-side costs (common 2 / rare 3 / epic 4 / legendary 5 / vpack 1 ads).
Completions go through a provider-agnostic `RewardedAdProvider` registry
(`VOXELPLUS_AD_PROVIDER`) with anti-replay enforcement via
`voxel_ad_completions UNIQUE(provider, completion_id)`. With no provider
configured the API returns 503 `ADS_UNAVAILABLE` — nothing is faked.

---

## 6. Owner Control Panel & Audit Log

The Owner Control Panel (`OwnerPage.ts` + `/api/owner/*`) provides:

1. **User Management:** Search all registered accounts, inspect creation dates, activity, titles, badges, and library counts.
2. **Title & Badge Assignment:** Grant and revoke server-controlled identity labels (Developer, Founder, Creator, Moderator).
3. **Account Deletion:** Single user deletion requiring confirmation phrase `DELETE_ACCOUNT_CONFIRMED`.
4. **Bulk Deletion Protection:** Extremely protected bulk deletion:
   - Only role `'owner'` can execute (admins cannot).
   - Requires explicit confirmation phrase `DELETE_ALL_ACCOUNTS_PERMANENTLY`.
   - Prevents deletion of the owner account.
   - Logs full event to `voxel_owner_audit_log` and TenantScale audit stream.
5. **Audit Trail:** Immutable log of all administrative actions with actor, target, timestamp, and metadata.

---

## 7. Cloud API Endpoints Reference

### Public Routes
- `GET /health` — Service health status
- `GET /api/public/profiles` — List public community profiles
- `GET /api/public/profiles/:username` — Public profile details
- `GET /api/cosmetics/catalog` — All available cosmetics
- `GET /api/achievements/catalog` — All available achievements

### Authenticated User Routes (Bearer Token)
- `POST /api/account/signup` — Create new Voxel⁺ account (username+password)
- `POST /api/account/login` — Sign in and obtain a Voxel+ session token
- `POST /api/account/refresh` — Rotate session via refresh token
- `POST /api/account/password` — Change password (revokes other sessions)
- `DELETE /api/account` — Delete own account
- `GET /api/profile` — Fetch user profile
- `PUT /api/profile` — Update bio / visibility
- `GET /api/cosmetics` — List user's unlocked cosmetics
- `PUT /api/cosmetics/select` — Equip active cosmetic
- `GET /api/achievements` — List user's achievements with unlock status
- `GET /api/ads/status` — Rewarded-ads availability
- `GET /api/ads/progress` — Per-item ad progress
- `POST /api/ads/complete` — Redeem a verified ad completion
- `GET /api/instances` / `POST /api/instances` / `DELETE /api/instances/:id` — Cloud instance records
- `GET /api/vpacks` / `POST /api/vpacks` — User VPacks
- `GET /api/vpacks/catalog` — VPack catalog
- `POST /api/vpacks/convert` — Convert a real instance into a VPack
- `POST /api/vpacks/:id/install` — Install a VPack
- `POST /api/avatar/upload` — Upload avatar image (multipart/form-data)
- `DELETE /api/avatar` — Remove avatar / reset to default
- `GET /api/library` — Get user's cloud library
- `POST /api/library` — Save item to cloud library
- `GET /api/sync` — Get cloud synced workspace metadata
- `POST /api/sync` — Sync workspace metadata (max 500 KB payload)

### Owner Routes (Owner Role Required)
- `GET /api/owner/check` — Verify if current user is owner/admin
- `GET /api/owner/users` — Search and list all user accounts
- `GET /api/owner/users/:userId` — Full user admin profile
- `POST /api/owner/users/:userId/title` — Grant title
- `DELETE /api/owner/users/:userId/title` — Revoke title
- `POST /api/owner/users/:userId/badge` — Grant badge
- `DELETE /api/owner/users/:userId/badge` — Revoke badge
- `PATCH /api/owner/users/:userId/creator` — Set creator status
- `DELETE /api/owner/users/:userId` — Delete user account
- `DELETE /api/owner/bulk` — Bulk delete all non-owner accounts
- `GET /api/owner/audit` — View owner audit log

---

## 8. Development & Deployment

### Local development (zero secrets required)

A contributor can clone the repo and run everything without any production
credentials: with no Supabase env set, the Cloud API runs on an **in-memory
data backend** seeded with the full cosmetics/achievements/vpack catalogs.

```bash
# Terminal 1 — Cloud API on the in-memory backend
cd cloud-api && npm install && npm run dev

# Terminal 2 — Desktop launcher pointed at the local API
npm install && VOXELPLUS_CLOUD_API_URL=http://localhost:3001 npm run dev
```

### Environment Variables (.env)
```env
# Cloud API Server — all optional for local dev
PORT=3001
VOXELPLUS_DATA_BACKEND=memory          # force in-memory backend (default when no Supabase env)
SUPABASE_URL=https://your-project.supabase.co      # production only
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key    # production only, NEVER in the client
VOXELPLUS_TENANT_ID=00000000-0000-0000-0000-000000000001   # TenantScale (optional)
VOXELPLUS_OWNER_USERNAMES=             # comma-separated usernames granted 'owner' at login
VOXELPLUS_AD_PROVIDER=                 # rewarded-ad provider registry key

# Desktop Launcher Client
VOXELPLUS_CLOUD_API_URL=http://localhost:3001
```

### Running Tests
```bash
# Cloud API tests
npm.cmd --prefix cloud-api test

# Desktop client tests
npm.cmd test
```

### Building for Production
```bash
# Build Cloud API microservice
npm.cmd --prefix cloud-api run build

# Build Desktop Launcher
npm.cmd run build
```
