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
|  - Validates user sessions via Supabase Auth                            |
|  - Server-authoritative achievement evaluation & reward granting        |
|  - Server-authoritative cosmetic ownership validation                   |
|  - Avatar upload MIME / size validation -> Supabase Storage             |
|  - Server-authoritative Owner / Admin role checks                       |
|  - Protected account deletion and audited bulk deletion                 |
+-------------------------------------------------------------------------+
           |                                             |
           | Multi-tenant policies                       | Direct storage & RLS
           v                                             v
+-----------------------------+        +----------------------------------+
|         TenantScale         |        |       Supabase Cloud Service     |
|                             |        |                                  |
| - Tenant isolation          |        | - Supabase Auth (JWT tokens)     |
| - IP signup rate limiting   |        | - PostgreSQL Database + RLS      |
| - Audit event logging       |        | - Storage (avatars/{userId}/...) |
+-----------------------------+        +----------------------------------+
```

---

## 2. Component Roles & Credentials Boundary

| Component | Responsibility | Credential Type |
| :--- | :--- | :--- |
| **Electron Renderer** | Desktop UI, local caching, IPC boundary | No Cloud Keys (IPC only) |
| **Electron Main** | Session store encryption (safeStorage), IPC handlers | `VOXELPLUS_CLOUD_API_URL` |
| **Cloud API Microservice** | Session auth, achievement logic, avatar pipeline, owner access | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TENANTSCALE_CLIENT_KEY` |
| **TenantScale SDK** | Tenant isolation, IP signup rate limiter, audit event logging | Single-tenant `VOXELPLUS_TENANT_ID` |
| **Supabase Auth** | User authentication authority across all devices | Auth JWT |
| **PostgreSQL + RLS** | User data persistence and strict row-level isolation | Database RLS Policies (`auth.uid()`) |
| **Supabase Storage** | Profile picture storage bucket (`avatars`) | Storage RLS Policies (`avatars/{userId}/...`) |

### Security Boundary Guarantees:
1. **Zero Secret Leakage:** The desktop client bundle contains **0** Supabase service-role keys or database admin credentials. All privileged operations go through the Cloud API.
2. **Server-Authoritative Evaluation:** Achievements, titles, badges, and cosmetics cannot be granted by client request. Clients report actions (e.g. `INSTANCE_CREATED`), and the server determines whether the conditions are satisfied.
3. **Owner Role Authorization:** Owner endpoints verify role records in `voxel_owner_roles` server-side. No client-side checks (`username === 'GHisDW'`) can grant access.

---

## 3. Database Migrations

The database schema is defined in 4 sequential migrations:

1. `migrations/001_initial_account_schema.sql`: Core `voxel_users`, `voxel_cloud_sync`, and `voxel_library` tables with RLS policies.
2. `migrations/002_cosmetics_achievements_titles_badges.sql`: Minecraft cosmetics catalog, user cosmetics, achievements catalog, user achievements, titles, badges, and user-assigned titles/badges.
3. `migrations/003_owner_panel.sql`: `voxel_owner_roles` table, `voxel_owner_audit_log` table, and server-side RPC functions for owner administration.
4. `migrations/004_avatar_storage.sql`: Supabase Storage bucket configuration and RLS policies for user-isolated avatar paths (`avatars/{userId}/*`).

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

Achievements unlock automatically in response to verified user events:

- `ACCOUNT_CREATED` → Unlocks **First Steps** (Rewards *Dirt Block* cosmetic)
- `INSTANCE_CREATED` → Unlocks **Builder** (Rewards *Crafting Table* cosmetic)
- `CONTENT_SAVED` → Unlocks **Collector** (Rewards *Chest* cosmetic)
- `CONTENT_INSTALLED` → Unlocks **Explorer** (Rewards *Compass* cosmetic)
- `PROFILE_MADE_PUBLIC` → Unlocks **Community** (Rewards *Emerald* cosmetic)
- `PACK_CREATED` → Unlocks **Creator** (Rewards *Diamond* cosmetic)

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
- `POST /api/account/signup` — Create new Voxel⁺ account
- `POST /api/account/login` — Sign in and obtain JWT
- `POST /api/account/password` — Change password
- `DELETE /api/account` — Delete own account
- `GET /api/profile` — Fetch user profile
- `PUT /api/profile` — Update bio / visibility
- `GET /api/cosmetics` — List user's unlocked cosmetics
- `PUT /api/cosmetics/select` — Equip active cosmetic
- `GET /api/achievements` — List user's achievements with unlock status
- `POST /api/achievements/event` — Report in-app event trigger
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

### Environment Variables (.env)
```env
# Cloud API Server
PORT=3001
START_SERVER=true
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
VOXELPLUS_TENANT_ID=00000000-0000-0000-0000-000000000001

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
