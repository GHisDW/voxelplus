# Voxel+ Account and Cloud Identity

Voxel+ accounts are device-bound cryptographic identities. On first launch the Electron main process generates an Ed25519 keypair, encrypts the PKCS#8 private key with Windows DPAPI through Electron `safeStorage`, and stores only the encrypted blob under the Electron user-data directory. The renderer receives only status, a public key identifier, and the result of narrowly scoped operations.

The public SPKI key is registered with the Cloud API. The server creates an immutable UUID `VoxelAccountId`; the user then chooses a globally unique normalized username and public Player Card. A second installation generates a different keypair and therefore receives a different account. Opaque session tokens remain in the Electron main process and are not returned to renderer state. There is no password, email, phone, OAuth, Supabase Auth identity, hardware fingerprint, account transfer, or cross-device recovery. Losing the private device identity permanently loses access to that VoxelAccountId.

## Authentication

1. `POST /api/account/register-key` registers only the public key and creates the immutable account tombstone.
2. `POST /api/auth/challenge` accepts `publicKeyId` and returns a random five-minute challenge.
3. The main process signs the challenge with the local private key.
4. `POST /api/auth/verify` accepts `challengeId`, `publicKeyId`, and the signature, including for a pending username claim.
5. `POST /api/account/claim-username` validates and atomically claims the globally unique username and creates the public profile.
6. The server checks account status, expiry, single-use consumption, key match, and the Ed25519 signature, then issues an opaque session.

Challenges are server-generated, short-lived, single-use, replay-protected, and rate-limited. Session and refresh tokens are random, opaque, rotated, and stored only as hashes server-side.

## Data and authorization

`voxel_accounts.id` is the immutable VoxelAccountId. `public_key` and `public_key_id` identify the installation; `username_normalized` is unique and is not a credential. The API derives ownership from the authenticated session and ignores client-supplied account identifiers for authorization.

Player Card queries expose only explicitly public username, avatar, bio, achievements, badges, titles, cosmetics, and public counts. They never expose private keys, sessions, hardware information, IP addresses, local instances, credentials, or administrative metadata.

Normal achievements are evaluated server-side. Grant/revoke operations are admin API operations only, require server authorization, and create audit records. Reward writes must be transactionally consistent or represented by durable reconciliation state.

Deletion is server-authoritative and resumable. It invalidates sessions, retains a deleted account tombstone, removes public profile, achievements, cosmetics, badges, titles, instances, ad state, ownership records, and cloud data. A deleted public key cannot authenticate or register again, so it cannot restore the old account.

## Provider boundary and local development

Domain identity logic depends on the `DataClient` provider boundary. Supabase is a persistence implementation only; it is not an identity provider. `VOXELPLUS_DATA_BACKEND=memory` is explicit development/test mode. Production requires explicit Supabase credentials and never silently falls back to memory.

Migration `008_device_identity_auth.sql` is corrective and leaves prior migration history intact. Legacy credential rows are not converted or accepted; the new API requires a registered public key.

## Private administration

The Python console in `D:\voxelplus-private-console` is an authenticated administrative client, never a database client or security boundary. It uses an admin API session, server-side authorization, and audit logging. It contains no service-role keys, database credentials, hardcoded passwords, or direct production-table writes.
