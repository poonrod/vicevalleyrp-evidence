# Evidence API

Express + TypeScript + Prisma + MySQL. Handles Discord OAuth (cookie session stored in the MySQL `Session` table so multiple Node workers share login state), evidence CRUD metadata, presigned uploads/downloads via **S3-compatible** client (Cloudflare R2 default), retention merge logic, and a **deletion worker**.

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | `tsx watch src/server.ts` |
| `npm run build` | `tsc` |
| `npm start` | `node dist/server.js` |
| `npm run db:generate` | `prisma generate` |
| `npm run db:migrate` | `prisma migrate dev` |
| `npm run db:push` | `prisma db push` |
| `npm run db:seed` | Seed retention defaults |

After pulling, run `npx prisma migrate deploy` (from `api/`) on production so the `Session` table exists.

## Main routes

- **Auth:** `/auth/discord/login`, `/auth/discord/callback`, `/auth/logout`, `/auth/me`  
- **Evidence:** `/evidence/upload-url`, `/evidence/complete`, `/evidence`, `/evidence/:id`, notes, tags, case number, archive, legal hold, delete, download-url, audit  
- **Incidents:** `/incidents`  
- **Admin:** `/admin/users`, retention, video policy, deletion queue, evidence overrides  
- **Internal FiveM:** `/internal/fivem/evidence/upload-url`, `.../complete`, bodycam settings GET/PATCH  

All internal routes require header: `X-FiveM-Secret: <FIVEM_API_SECRET>`.

## Storage abstraction

- `src/modules/storage/S3CompatibleStorage.ts` — R2, AWS S3, MinIO, etc.  
- `src/modules/storage/paths.ts` — evidence key layout  
- Env: see root `README.md` / `.env.example`

## Security notes

- Validate MIME and size before signing URLs (`modules/evidence/mime.ts` + retention `maxUploadSizeMB`).  
- Never expose object storage keys to browsers except via short-lived presigned GET.  
- FiveM **server** is trusted for internal routes; clients must not call internal API directly.
