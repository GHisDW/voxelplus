# Voxel+ Account and Cloud Architecture

Voxel+ accounts are device-bound cryptographic identities. On first launch,
Electron creates an Ed25519 keypair and protects the private key with
`safeStorage`/Windows DPAPI. Only the public Ed25519 key is sent to the Cloud
API. The API creates an immutable `VoxelAccountId`; the user then claims a
globally unique normalized username and public Player Card.

There is no password, email login, phone login, OAuth, social login, password
reset, account transfer, or cross-device recovery. A second installation gets
a different keypair and a different account. Losing the private device key
means losing access to that identity. Deleted accounts remain tombstones and
their old public keys cannot authenticate or re-register.

## Local development

```powershell
npm install
npm run dev
```

Cloud API local development automatically creates and migrates
`cloud-api/data/voxelplus.sqlite` using Node's built-in SQLite runtime. It
requires no Supabase, cloud database, API key, production credential, `.env`,
manually-created database, or manual SQL execution. SQLite files are ignored
by Git. The in-memory store is reserved for tests and must be selected
explicitly with `VOXELPLUS_DATA_BACKEND=memory`.

## Production datastore

The production application datastore is PostgreSQL. The selected hosted
candidate is Neon Free because it is PostgreSQL-compatible with Node's `pg`
driver, supports transactions, unique constraints, indexes, SQL migrations,
concurrent requests, server-side credentials, scale-to-zero, and terminal/API
provisioning. Neon requires an external Neon account and project; its current
Free plan does not require a credit card. Current limits must be rechecked at
deployment time because the provider can change them; the currently verified
documentation advertises 1 GB storage per project, 100 CU-hours per project
per month, up to 100 projects, 10 branches, and a six-hour instant-restore
window. Exceeding free limits requires waiting for reset or moving to a paid
plan; this service never silently changes backend or loses data.

Other candidates investigated:

* Cloudflare D1 is free within Workers limits, supports SQLite SQL, indexes,
  and migrations, and is provisioned with Wrangler. It requires a Cloudflare
  account and a Worker deployment, so it would require moving the current Node
  server to the Workers runtime. Its free limits are enforced and queries fail
  after daily row limits are reached.
* Turso Cloud is SQLite/libSQL-compatible, has a free no-card plan, and offers
  CLI/API provisioning and Node drivers. It introduces libSQL/replication
  behavior and a service-specific operational model; Neon gives this current
  Node API a more direct PostgreSQL path.
* Render Free PostgreSQL is unsuitable for durable production because its free
  database expires after 30 days, has no backups, and is intended for testing.

Required production configuration is server-only:

```text
VOXELPLUS_DATA_BACKEND=postgres
DATABASE_URL=postgresql://...
DATABASE_SSL=true
DATABASE_POOL_MAX=10
```

Run `scripts/setup-production.ps1` on the server. It verifies Node/npm and
`DATABASE_URL`, builds the API, applies `cloud-api/schema/postgres.sql` inside
a transaction, and verifies required tables and indexes. The unavoidable
manual step is creating the Neon account/project and obtaining its server
connection string. The script never prints or commits that credential.

Backups, restore drills, connection monitoring, and a paid plan are required
before treating the free tier as a durable public production service.

## Provider boundary

```text
Voxel+ Cloud API
       │
       ├── DataStore
       │     ├── Local SQLite
       │     ├── Production PostgreSQL/Neon
       │     └── MemoryStore (tests only)
       │
       └── TenantScale boundary
```

The installed `@tenantscale/sdk@0.4.1` was inspected directly. Its verified
exports are `TenantScale`, `PlanStore`, `RateLimiter`, `WebhookDispatcher`,
`StripeClient`, API-key/session helpers, and audit helpers. Its declarations
and runtime require a Supabase client; its rate limiter uses Supabase tables
and an `increment_rate_limit` RPC, while audit, plans, webhooks, sessions, and
API-key operations also use Supabase-shaped queries. It exposes no
provider-neutral arbitrary datastore, transaction, migration, schema,
relational, blob, provisioning, or observability transport.

Because that SDK would violate the no-Supabase requirement, it is not an
active Voxel+ runtime dependency. The Cloud API keeps its own durable audit
records and server-side rate limits behind the DataStore boundary. A future
TenantScale integration can be added only when TenantScale provides a
provider-neutral transport; no undocumented TenantScale API is invented here.

## Authentication

The Cloud API issues a short-lived challenge, verifies an Ed25519 signature
against the registered public key, consumes the challenge atomically, rejects
disabled/deleted identities, and issues opaque access/refresh sessions. Access
and refresh tokens remain in Electron's main process. The renderer receives
only sanitized account data.

Registration with a public key alone is rejected unless the registration proof
challenge is signed by the matching private key. Account and profile creation
uses a datastore transaction where supported; SQLite uses `BEGIN IMMEDIATE`,
and PostgreSQL uses a transaction with unique constraints.

## Security and data ownership

The Electron launcher contains no database credentials, TenantScale secrets,
service-role keys, or admin bypass. Admin operations are authorized by the
server and audited. The separate Python/Tkinter console at
`D:\voxelplus-private-console` is only an authenticated administrative client;
it never writes production tables directly.

Supabase is not required for a fresh installation. Historical Supabase
migrations remain only as migration-history artifacts and are not part of a
fresh setup. New installations use the standalone SQLite/PostgreSQL schemas
under `cloud-api/schema`.
