# Voxel⁺ Account, Cloud Identity & Security Architecture Documentation

## Overview

The **Voxel⁺ Account & Cloud Identity System** provides a custom launcher identity and cloud synchronization platform built for Voxel⁺.

> **Important Identity Distinction:**
> A Voxel⁺ Account is **NOT** a Minecraft account and is **NOT** a Microsoft account.
> It does not replace or interfere with Minecraft authentication, Mojang tokens, or standard offline player UUIDs.

---

## 1. Secret Boundary & Client Security Model

### Absolute Rule: No Privileged Keys in Distributed Software
In desktop Electron applications (including main process, preload, and renderer bundles), **privileged service-role credentials (`SUPABASE_SERVICE_ROLE_KEY` / admin secret keys) MUST NEVER be embedded or distributed**. An Electron main process running on a user's local machine is distributed software, not a trusted server environment.

### Security Architecture Implementation:
1. **Unprivileged Public Client Keys:** Desktop launcher instances communicate with Supabase and TenantScale using unprivileged public anon keys (`SUPABASE_ANON_KEY`).
2. **Server-Side Authorization via Row Level Security (RLS):** Data access rules, ownership boundaries, and privacy restrictions are strictly enforced database-side via PostgreSQL Row Level Security (RLS) policies.
3. **Narrow IPC Boundary:** The Electron renderer communicates with the main process strictly over `contextBridge` via sanitized IPC invocations. No raw SQL or administrative database handles are exposed to the UI.

---

## 2. Navigation & Information Architecture

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

Content items (Cards, Mods, Resource Packs, Shaders, Skins) are contextual sub-views within their natural parent sections rather than occupying redundant top-level global navigation tabs.

---

## 3. Local vs. Cloud Data Boundary Table

| Data Category | Stored Locally | Synced to Cloud | Notes / Rationale |
| :--- | :---: | :---: | :--- |
| Account Identity (Username, Avatar, Bio) | Yes | Yes | Public or private based on `is_public` setting |
| Password Hash (PBKDF2 SHA-256 + Salt) | Yes | Yes | Never stored/sent as plaintext |
| Launcher Preferences & Theme | Yes | Yes | Syncs across Voxel⁺ client installations |
| Instance Cloud Manifest (Name, MC version, Loader, Mod list) | Yes | Yes | Enables metadata recognition & recreation on 2nd PC |
| Local Minecraft Installation Files & Binaries | Yes | **No** | Remains 100% local (no arbitrary file uploads) |
| Local World Saves & Screenshots | Yes | **No** | Remains 100% local |
| Library Items, Saved VPacks & Skin Metadata | Yes | Yes | Associated with Voxel⁺ creator profile |
| Minecraft / Microsoft Credentials | Local Auth | **No** | Untouched by Voxel⁺ accounts |

---

## 4. Supabase Database Schema & Row Level Security (RLS)

To initialize Supabase database tables and Row Level Security policies for Voxel⁺ Cloud Identity, run the following SQL:

```sql
-- 1. Voxel+ User Profiles Table
CREATE TABLE IF NOT EXISTS public.voxel_users (
  id UUID PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  avatar TEXT NOT NULL DEFAULT 'avatar_steve',
  bio TEXT DEFAULT '',
  is_public BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Voxel+ Cloud Sync Metadata Table
CREATE TABLE IF NOT EXISTS public.voxel_cloud_sync (
  user_id UUID PRIMARY KEY REFERENCES public.voxel_users(id) ON DELETE CASCADE,
  sync_payload JSONB NOT NULL,
  last_synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.voxel_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voxel_cloud_sync ENABLE ROW LEVEL SECURITY;

-- RLS Policy 1: Allow public read access to profiles marked is_public = true
CREATE POLICY "Public profiles are visible to all users"
  ON public.voxel_users FOR SELECT
  USING (is_public = true OR auth.uid() = id);

-- RLS Policy 2: Allow users to insert/update ONLY their own profile
CREATE POLICY "Users can edit their own profile"
  ON public.voxel_users FOR ALL
  USING (auth.uid() = id);

-- RLS Policy 3: Allow users to access ONLY their own cloud sync payload
CREATE POLICY "Users can manage their own cloud sync data"
  ON public.voxel_cloud_sync FOR ALL
  USING (auth.uid() = user_id);
```

---

## 5. Developer Setup Guide

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
