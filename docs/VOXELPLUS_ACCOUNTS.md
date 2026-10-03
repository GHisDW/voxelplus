# Voxel⁺ Account, Cloud Identity & Architecture Documentation

## Overview

The **Voxel⁺ Account System** provides a custom launcher identity and cloud synchronization platform designed specifically for Voxel⁺ platform users.

> **Important Distinction:**
> A Voxel⁺ Account is **NOT** a Minecraft account and is **NOT** a Microsoft account.
> It does not replace or interfere with Minecraft authentication or Mojang session tokens.

---

## Navigation Architecture

Voxel⁺ top-level navigation is consolidated into 6 primary sections:

```
Voxel⁺ Navigation
 ├── My Instances  (Minecraft installations, mods, resource packs, shaders, cards)
 ├── Library       (Saved/downloaded content, VPacks, skins, creator items)
 ├── Shop          (Discover content, Modrinth browser, VPacks)
 ├── Community     (Public creator & user directory)
 ├── Profile       (Overview, My Packs, My Skins, Public Profile, Account Settings)
 └── Settings      (Launcher & Java runtime configuration)
```

Content items (Cards, Mods, Resource Packs, Shaders, Skins) are embedded directly within their natural parent sections rather than occupying unnecessary global navigation tabs.

---

## Privacy & Security Model

1. **No Personal Identification Data:**
   - No email address required.
   - No phone number required.
   - No real-world name or address required.
   - No payment details or credit cards required.

2. **Core Account Attributes:**
   - **Username:** 3–20 characters (alphanumeric, hyphens, underscores).
   - **Password:** Salted PBKDF2 SHA-256 (100,000 iterations).
   - **Profile Picture (Avatar):** Preset Voxel⁺ avatars or custom uploaded image.
   - **Bio:** Optional profile description.
   - **Profile Visibility:** Toggle for public community directory listing.

3. **No Password Recovery Policy:**
   - Because Voxel⁺ collects no personal recovery vectors (email/phone), **lost passwords cannot be recovered**.
   - This policy is explicitly communicated during first-launch onboarding and inside Account Settings.

---

## Local vs. Cloud Data Model

| Category | Stored Locally | Synced to Cloud |
| :--- | :---: | :---: |
| Account Credentials (PBKDF2 Hash + Salt) | Yes | Yes (Supabase) |
| Launcher Preferences & Theme | Yes | Yes |
| Instance Metadata (Name, MC version, Loader, Mod manifest) | Yes | Yes |
| Local Minecraft Installation Files & Binaries | Yes | **No** (Kept local) |
| Local World Saves & Screenshots | Yes | **No** (Kept local) |
| Library Items, Saved Packs & Skin Metadata | Yes | Yes |
| Public Profile & Bio | Yes | Yes |

---

## Technical Architecture

```
Electron Renderer (React/Vanilla UI)
       ↓ (ContextBridge IPC - window.voxelApi)
Electron Main Process (CommandManager & AccountManager)
       ↓ (Local Persistent Caching + PBKDF2 Crypto)
%APPDATA%/VoxelPlus/account/account-store.json (Local Store)
       ↓ (HTTPS Cloud Adapter)
TenantScale SDK / Supabase Cloud Platform
       ↓
PostgreSQL Database
```

### Secret Boundary Protection
- Privileged keys (`SUPABASE_SERVICE_ROLE_KEY`, `TENANTSCALE_API_KEY`) reside exclusively in the main Electron backend process and environment variables.
- Secrets are **never** bundled or exposed inside the renderer bundle (`dist/`) or preload script (`dist-electron/preload.js`).

---

## Supabase Database Schema

```sql
-- Voxel+ User Profiles Table
CREATE TABLE IF NOT EXISTS public.voxel_users (
  id UUID PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  avatar TEXT NOT NULL DEFAULT 'avatar_steve',
  bio TEXT DEFAULT '',
  is_public BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Voxel+ Cloud Sync Metadata Table
CREATE TABLE IF NOT EXISTS public.voxel_cloud_sync (
  user_id UUID PRIMARY KEY REFERENCES public.voxel_users(id) ON DELETE CASCADE,
  sync_payload JSONB NOT NULL,
  last_synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security (RLS)
ALTER TABLE public.voxel_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voxel_cloud_sync ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public profiles visible to all users"
  ON public.voxel_users FOR SELECT
  USING (is_public = true);
```

---

## Developer Setup Instructions

1. **Environment Configuration:**
   Copy `.env.example` to `.env`:
   ```env
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
   TENANTSCALE_API_KEY=your-tenantscale-api-key
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
