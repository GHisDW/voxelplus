# Voxel⁺ Account, Cloud Identity & Security Architecture

## Overview

The **Voxel⁺ Account System** provides a custom launcher identity and cloud synchronization platform built for Voxel⁺ platform users.

> **Important Identity Distinction:**
> A Voxel⁺ Account is **NOT** a Minecraft account and is **NOT** a Microsoft account.
> It does not replace or interfere with Minecraft authentication, Mojang tokens, or standard offline player UUIDs.

---

## 1. Architectural Roles: TenantScale vs. Supabase

```
+-------------------------------------------------------------------------+
|                          Voxel⁺ Electron App                            |
|                                                                         |
|  - Renders UI (100% username/password based, no email exposed)          |
|  - Communicates over narrow contextBridge IPC                            |
|  - Uses unprivileged public client key (SUPABASE_ANON_KEY)              |
+-------------------------------------------------------------------------+
                                    |
                                    | HTTPS API Invocations
                                    v
+-----------------------------------+-------------------------------------+
|                             Cloud Tier                                  |
|                                                                         |
|   TenantScale Role:                                                     |
|   - Multi-tenant middleware API key verification & plan enforcement     |
|   - Daily API rate limiting and IP throttling                           |
|   - Audit trail logging and tenant isolation checks                     |
|                                                                         |
|   Supabase Role:                                                        |
|   - Supabase Auth engine (cloud user identity & sessions)               |
|   - PostgreSQL cloud database                                           |
|   - Row Level Security (RLS) enforcement at the database layer          |
+-------------------------------------------------------------------------+
```

| Component | Responsibility | Credential Type |
| :--- | :--- | :--- |
| **Electron Client** | Desktop UI, local caching, IPC boundary | `SUPABASE_ANON_KEY` / `TENANTSCALE_CLIENT_KEY` (Public) |
| **TenantScale** | Tenant isolation, rate limiting, plan limits | API Key Middleware |
| **Supabase Auth** | Cloud account authority & sessions | `auth.users.id` JWT |
| **PostgreSQL + RLS** | Database persistence & user data authorization | Database RLS Policies (`auth.uid()`) |

---

## 2. Client Security & Secret Boundary Guarantee

### Absolute Security Rule:
In distributed Electron applications, **privileged administrative credentials (`SUPABASE_SERVICE_ROLE_KEY` / server secret keys) MUST NEVER be embedded or distributed**. An Electron executable running on a user's desktop machine is distributed software, not a trusted server environment.

- **Zero Secret Leakage:** Desktop clients communicate strictly using unprivileged public client keys (`SUPABASE_ANON_KEY`).
- **Database Authorization:** Data access rules, ownership boundaries, and privacy restrictions are enforced database-side via Supabase Row Level Security (RLS) policies.

---

## 3. Navigation & Information Architecture

Voxel⁺ global navigation is consolidated into 6 primary sections:

```
Voxel⁺ Navigation
 ├── My Instances  (Minecraft installations, mods, resource packs, shaders, cards)
 ├── Library       (Saved/downloaded content, VPacks, skins, creator items)
 ├── Shop          (Discover content, Modrinth browser, VPacks)
 ├── Community     (Public creator & user directory)
 ├── Profile       (Overview, My Packs, My Skins, Public Profile, Account Settings)
 └── Settings      (Launcher & Java runtime configuration)
```

---

## 4. Local vs. Cloud Data Boundary Table

| Data Category | Stored Locally | Synced to Cloud | Notes / Rationale |
| :--- | :---: | :---: | :--- |
| Account Identity (Username, Avatar, Bio) | Yes | Yes | Public or private based on `is_public` setting |
| Password Authority | No | Yes (Supabase Auth) | Supabase Auth is sole authority across PCs |
| Launcher Preferences & Theme | Yes | Yes | Syncs across Voxel⁺ client installations |
| Instance Cloud Manifest (Name, MC version, Loader, Mod list) | Yes | Yes | Enables metadata recognition & recreation on 2nd PC |
| Local Minecraft Installation Files & Binaries | Yes | **No** | Remains 100% local (no arbitrary file uploads) |
| Local World Saves & Screenshots | Yes | **No** | Remains 100% local |
| Library Items, Saved VPacks & Skin Metadata | Yes | Yes | Associated with Voxel⁺ creator profile |
| Minecraft / Microsoft Credentials | Local Auth | **No** | Untouched by Voxel⁺ accounts |

---

## 5. Supabase SQL Migration Script (`migrations/001_initial_account_schema.sql`)

```sql
-- Voxel+ Account System Initial Database Migration
-- Target Platform: Supabase PostgreSQL with Row Level Security (RLS)

-- 1. Voxel+ User Profiles Table (Linked to auth.users.id)
CREATE TABLE IF NOT EXISTS public.voxel_users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  avatar TEXT NOT NULL DEFAULT 'avatar_steve',
  bio TEXT DEFAULT '',
  is_public BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Voxel+ Cloud Sync Metadata Table (Linked to auth.users.id)
CREATE TABLE IF NOT EXISTS public.voxel_cloud_sync (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  sync_payload JSONB NOT NULL,
  last_synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Voxel+ User Library Items Table
CREATE TABLE IF NOT EXISTS public.voxel_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  source TEXT DEFAULT 'Voxel+',
  added_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.voxel_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voxel_cloud_sync ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voxel_library ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for voxel_users
CREATE POLICY "Public profiles are readable by anyone"
  ON public.voxel_users FOR SELECT
  USING (is_public = true OR auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON public.voxel_users FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.voxel_users FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can delete their own profile"
  ON public.voxel_users FOR DELETE
  USING (auth.uid() = id);

-- 6. RLS Policies for voxel_cloud_sync
CREATE POLICY "Users can access only their own cloud sync payload"
  ON public.voxel_cloud_sync FOR ALL
  USING (auth.uid() = user_id);

-- 7. RLS Policies for voxel_library
CREATE POLICY "Users can manage only their own library items"
  ON public.voxel_library FOR ALL
  USING (auth.uid() = user_id);
```

---

## 6. Developer Setup Guide

1. **Environment Configuration:**
   Copy `.env.example` to `.env`:
   ```env
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your-supabase-public-anon-key
   TENANTSCALE_CLIENT_KEY=your-tenantscale-client-key
   ```

2. **Install Dependencies:**
   ```bash
   npm install
   ```

3. **Run Unit & Integration Tests:**
   ```bash
   npm test
   ```

4. **Build Production Application:**
   ```bash
   npm run build
   ```
