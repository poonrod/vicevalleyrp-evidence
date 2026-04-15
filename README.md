# Vice Valley — Bodycam Evidence Platform

Monorepo for a **FiveM bodycam resource**, **Node.js evidence API** (Express + TypeScript + Prisma + MySQL), and **Next.js evidence portal**. Media lives in **Cloudflare R2** (default) or **S3-compatible** storage; **only metadata** is stored in MySQL.

## Repository layout

```
vicevalleyrp-evidence/
├── fivem-bodycam/     # FiveM resource (client/server/NUI)
├── api/               # REST API, Prisma, retention worker, presigned URLs
├── web/               # Next.js evidence portal (dark UI)
├── shared/            # Shared Zod schemas, roles, enums
├── docker-compose.yml # Local MySQL
├── docs/SETUP_GUIDE.md # Step-by-step from Node install → FiveM server working
└── README.md          # This file
```

## Quick start (development)

1. **MySQL**  
   - Install Docker and run: `docker compose up -d mysql`  
   - Or point `DATABASE_URL` at any MySQL 8 instance.

2. **Environment**  
   - Copy `api/.env.example` → `api/.env` and fill values (see [Cloudflare R2](#cloudflare-r2-setup-beginner-friendly) below).  
   - Copy `web/.env.example` → `web/.env.local` (`NEXT_PUBLIC_API_URL=http://localhost:4000`).

3. **Install & DB**

   ```bash
   npm install
   npm run db:generate -w api
   cd api && npx prisma migrate deploy && npm run db:seed
   ```

4. **Run** (from repository root)

   ```bash
   npm run dev:api
   npm run dev:web
   ```

5. **Discord OAuth**  
   - Create an application at [Discord Developer Portal](https://discord.com/developers/applications).  
   - Redirect: `http://localhost:4000/auth/discord/callback` (or your API URL).  
   - Set `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_CALLBACK_URL`.  
   - Optional: `DISCORD_SUPER_ADMIN_IDS` (comma-separated Discord user IDs) for first super admins.

6. **FiveM**  
   - Install [screenshot-basic](https://github.com/citizenfx/screenshot-basic) (or compatible uploader).  
   - Set convars: `bodycam_api_base`, `bodycam_api_secret`, `bodycam_framework` (`qbcore`, `c7fw` for [C7FW](https://docs.c7scripts.com/paid/c7fw), or `standalone`).  
   - See `fivem-bodycam/README.md`.

## Cloudflare R2 setup (beginner-friendly)

### 1. Create a Cloudflare account (if needed)

Sign up at [cloudflare.com](https://www.cloudflare.com/). R2 is billed under your Cloudflare account.

### 2. Create an R2 bucket

1. Cloudflare Dashboard → **R2** → **Create bucket**.  
2. Choose a **private** name (e.g. `vicevalley-evidence-prod`).  
3. **Do not** enable public access unless you explicitly want a public dev CDN (this project defaults to **private bucket + presigned URLs only**).

### 3. Keep the bucket private

- Default new buckets are private.  
- Avoid creating **R2 custom domains** for public reads unless you deliberately need a public dev URL (`R2_PUBLIC_DEV_URL` is optional and not used by the API signing path in this repo).

### 4. Create R2 API credentials

1. R2 → **Manage R2 API Tokens** (or **Account API tokens** flow for S3-compatible keys).  
2. Create a token with **Object Read & Write** on the target bucket (or account-scoped with least privilege).  
3. Save **Access Key ID** and **Secret Access Key** — they are shown **once**.

### 5. Find your Account ID

Cloudflare Dashboard → any zone or **R2** overview → **Account ID** (32-character hex). Used in the default endpoint URL.

### 6. S3-compatible endpoint

Use:

`https://<ACCOUNT_ID>.r2.cloudflarestorage.com`

Set `R2_ENDPOINT` to this value (or override if Cloudflare documents a different endpoint for your account).

### 7. Environment variables (API)

```env
STORAGE_PROVIDER=r2
R2_ACCOUNT_ID=your_account_id
R2_BUCKET=your-bucket-name
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
PRESIGNED_URL_EXPIRES_SECONDS=900
```

### 8. Testing presigned upload

1. `POST /internal/fivem/evidence/upload-url` with header `X-FiveM-Secret` and JSON body (see `fivem-bodycam` + OpenAPI-style examples in `docs/SETUP_GUIDE.md`).  
2. `PUT` the file body to the returned `url` with the same `Content-Type` you requested.  
3. `POST /internal/fivem/evidence/complete` to register metadata after the object exists.

### 9. Testing presigned download

1. Create an evidence row (via complete) or use an existing `storageKey`.  
2. As a logged-in user, `GET /evidence/:id/download-url` — returns a short-lived URL to `GET` the object.

### 10. Prefix layout (evidence storage)

The API uses keys such as:

- `evidence/{year}/{month}/{discordId}/{incidentOrCase}/{evidenceId}.jpg`  
- `temp/…`, `archived/…` (helpers exist for future flows)

Align **lifecycle rules** in R2 (optional) with **retention** in the app (see below).

### 11. Lifecycle & retention guidance

- **Temp / scratch**: delete quickly (hours–1 day). Prefer app-level `tempDeleteAfterDays` + workers.  
- **Evidence**: default retention is **configuration** in DB (`RetentionPolicySetting`); the **deletion worker** removes objects when `scheduledDeletionAt` passes (respects legal hold, soft-delete, etc.).  
- **Case-linked / held / archived**: longer retention via admin settings; do not rely on R2 alone for compliance — **DB + audit** are authoritative.

### 12. Common mistakes & security

- **Never** put R2/S3 keys in FiveM **client** files or NUI. Only the **API** signs URLs; FiveM **server** uses `FIVEM_API_SECRET`.  
- **Do not** trust client-supplied Discord IDs for authorization — this resource resolves Discord on the **server** and overwrites on complete.  
- **Short-lived** presigned URLs: keep `PRESIGNED_URL_EXPIRES_SECONDS` low (e.g. 300–900s).  
- **Private bucket**: block public ACL/bucket policies.  
- **Rotate keys** if leaked; use **per-environment** buckets where possible.

## Optional: Amazon S3 or other S3-compatible providers

```env
STORAGE_PROVIDER=s3
S3_BUCKET=...
S3_REGION=us-east-1
S3_ENDPOINT=   # optional, for MinIO/custom
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
```

The implementation uses the AWS SDK v3 S3 client with **virtual-hosted-style** or **path-style** depending on `S3_ENDPOINT`.

## Roles (RBAC)

`super_admin` → `command_staff` → `evidence_tech` → `officer` → `viewer`  

See `@vicevalley/shared` and `docs/SETUP_GUIDE.md` for promotion workflow.

## Honest MVP scope

- **Evidence capture**: screenshots via **screenshot-basic** + **presigned PUT** (verify compatibility with your screenshot resource).  
- **Pre-event “buffer”**: **rolling snapshots** while monitoring — **not** retroactive continuous video.  
- **Video tiers / chunking**: modeled in **DB + admin settings**; native long recording is **not** claimed as fully implemented in Lua.

## Further reading

- **`docs/SETUP_GUIDE.md`** — starter walkthrough (tools → MySQL → API → R2 → Discord → web → FiveM `server.cfg` → in-game test). Includes **Hostinger Node.js Web App**: two hPanel deployments (`npm run hostinger:build:api` / `hostinger:start:api` and `hostinger:build:web` / `hostinger:start:web`) from this monorepo.  
- **`api/README.md`**, **`web/README.md`**, **`fivem-bodycam/README.md`**.

## License

Use and modify for your community; no warranty implied.
