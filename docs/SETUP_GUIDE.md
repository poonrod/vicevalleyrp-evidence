# Starter guide: step 1 → working on your FiveM server

This document is a **linear walkthrough** from nothing installed to **bodycam evidence uploading** and showing up in the web portal. Use it together with the root [`README.md`](../README.md) (especially the Cloudflare R2 security notes).

---

## How the pieces talk to each other

Before you start, picture the flow:

1. **FiveM game server** (Lua) calls your **Evidence API** over HTTPS/HTTP using a shared secret (`FIVEM_API_SECRET`). It never uses R2 keys.
2. The **API** talks to **MySQL** (metadata) and **Cloudflare R2** (files via presigned URLs).
3. **Players’ browsers** talk to the **API** for Discord login and the **Next.js web app** for the portal (the browser calls the API with cookies).

So you need **MySQL running**, **API running**, **R2 (or S3) configured**, and the **FiveM server able to reach the API URL** (same PC, LAN, or public URL).

---

## Using Hostinger

Hostinger offers **managed Node.js Web App** hosting (Business / Cloud plans), **VPS**, and plain shared hosting. For **both the website and the API** on Hostinger, use **Node.js Web App** (two separate apps) or a **VPS** (one server, two processes).

Official references: [Node.js hosting options](https://www.hostinger.com/support/node-js-hosting-options-at-hostinger/), [Deploy a Node.js website](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/), [Environment variables](https://www.hostinger.com/support/how-to-add-environment-variables-during-node-js-application-deployment/).

---

### Option A — Hostinger **Node.js Web App** (website + API)

This is Hostinger’s **managed** Node hosting (SSL and routing handled in hPanel). It is available on **Business Web Hosting** and **Cloud** plans (not on the cheapest single-site plans — check your plan in hPanel).

**Important architecture detail:** the Evidence stack is **two Node processes** (Express **API** + **Next.js** portal). On managed Node hosting you deploy them as **two separate websites** in hPanel (e.g. `api.yourdomain.com` and `evidence.yourdomain.com`), both from the **same GitHub monorepo**, with **different build and start commands**.

#### A.1 MySQL on Hostinger

1. In **hPanel** → **Databases** → **MySQL**, create a database and user for `evidence`.
2. Copy the **hostname**, **database name**, **username**, and **password**. Build `DATABASE_URL`:

   `mysql://USERNAME:PASSWORD@HOSTNAME:3306/DATABASE_NAME`

   Use the exact host Hostinger shows (often not `localhost` from your laptop — it is the host the **API app on Hostinger** will use when it runs in their environment).

#### A.2 DNS: two hostnames

Create two names that both point at your **web hosting** (Hostinger will show you the right records — often **A** records to the hosting IP, or they assign the domain when you add each site):

| Hostname (example) | Purpose |
|--------------------|--------|
| `api.yourdomain.com` | Express Evidence API |
| `evidence.yourdomain.com` | Next.js portal |

(Add subdomains under **Domains** → **DNS** if needed.)

#### A.3 Database migrations (before or after first API deploy)

Hostinger’s UI builds and starts the app; it does **not** automatically run Prisma migrations. On your **PC** (with Node installed), from the repo:

```bash
cd api
# Use the SAME DATABASE_URL as you will set in hPanel (see Hostinger remote MySQL docs if connections must be allowed from your IP)
set DATABASE_URL=mysql://...
npx prisma migrate deploy
npm run db:seed
```

If remote MySQL access from home is disabled, use **Hostinger SSH** (if your plan includes it) to run the same commands on the server after cloning, or temporarily allow your IP in hPanel’s MySQL remote access settings — follow Hostinger’s documentation for your plan.

#### A.4 Website #1 — **API** (Express)

1. **Websites** → **Add website** → **Node.js Apps** → connect **GitHub** (or upload ZIP of the repo).
2. **Node version:** 20.x (matches `engines` in root `package.json`).
3. **Framework:** **Express.js** (or **Other** if detection fails).
4. **Build command** (repository root — monorepo):

   ```bash
   npm install && npm run hostinger:build:api
   ```

5. **Start command:**

   ```bash
   npm run hostinger:start:api
   ```

6. **Environment variables** (hPanel → your API site → Environment variables) — add at least:

   | Variable | Example / notes |
   |----------|------------------|
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | Your Hostinger MySQL URL |
   | `SESSION_SECRET` | Long random string |
   | `WEB_APP_URL` | `https://evidence.yourdomain.com` (exact portal URL) |
   | `DISCORD_CLIENT_ID` | From Discord app |
   | `DISCORD_CLIENT_SECRET` | From Discord app |
   | `DISCORD_CALLBACK_URL` | `https://api.yourdomain.com/auth/discord/callback` |
   | `FIVEM_API_SECRET` | Long random secret (same value in FiveM `server.cfg`) |
   | `STORAGE_PROVIDER` | `r2` |
   | `R2_*` / `PRESIGNED_URL_EXPIRES_SECONDS` | As in root `README.md` |

   Hostinger injects **`PORT`** — the API already uses `process.env.PORT` (see `api/src/config/env.ts`). Do **not** hardcode a port in hPanel unless their UI requires it.

7. **Discord Developer Portal** → OAuth2 redirects must include **exactly**:

   `https://api.yourdomain.com/auth/discord/callback`

8. Deploy and check logs until the build succeeds. Test: `https://api.yourdomain.com/health` should return `{"ok":true}`.

   **Note:** Hostinger often runs `npm install` in **production** mode (skipping `devDependencies`). This repo keeps **`typescript`** and the **`prisma`** CLI in **`dependencies`** for `shared` and `api` so `tsc` and `prisma generate` are available during the build. If you see `tsc: command not found`, pull the latest repo and redeploy.

#### A.5 Website #2 — **Web** (Next.js)

1. **Add website** again → **Node.js Apps** → **same repository**.
2. **Framework:** **Next.js**.
3. **Build command:**

   ```bash
   npm install && npm run hostinger:build:web
   ```

4. **Start command:**

   ```bash
   npm run hostinger:start:web
   ```

5. **Environment variables:**

   | Variable | Value |
   |----------|--------|
   | `NODE_ENV` | `production` |
   | `NEXT_PUBLIC_API_URL` | `https://api.yourdomain.com` (no trailing slash) |

6. Assign this deployment to **`evidence.yourdomain.com`** (or your chosen portal hostname).

7. Open `https://evidence.yourdomain.com` → Login → Discord should redirect through the **API** domain and return you to the dashboard.

#### A.6 FiveM

```cfg
set bodycam_api_base "https://api.yourdomain.com"
set bodycam_api_secret "same-as-FIVEM_API_SECRET"
```

#### A.7 Managed hosting caveats

- **Two sites = two plan slots** — Business/Cloud plans allow multiple websites; confirm your limit in hPanel.
- **Resource usage** — API + Next.js + Prisma + background cron (deletion worker) use CPU/RAM; if builds fail or the app restarts often, upgrade the plan or optimize.
- **Existing domain on old “static” site** — Hostinger’s docs state Node.js may require **adding a new website**; you might need to remove/replace an old site after backup. Follow their current “Add Website → Node.js Apps” flow.
- If **build commands** cannot be customized for a monorepo, open a support ticket or use **Option B (VPS)** where you control the full command line.

---

### Option B — Hostinger **VPS** (full control)

A **VPS** is a Linux server you control (SSH). You install Node, MySQL (or MariaDB), nginx, PM2, and run **both** the API and Next.js yourself (two processes, one or two domains).

**Typical layout**

| Service | Public access |
|--------|----------------|
| Nginx | 80 / 443 — SSL |
| Evidence API | Proxied from `https://api.yourdomain.com` → `127.0.0.1:4000` |
| Next.js | Proxied from `https://evidence.yourdomain.com` → `127.0.0.1:3000` |
| MySQL | Prefer `127.0.0.1` only |

**DNS:** `A` records for `api` and `evidence` → VPS IP.

**Env vars:** Same values as in A.4 / A.5, with `DATABASE_URL` pointing at MySQL on the VPS.

**FiveM:** Same `bodycam_api_base` as Option A.

**Outline:** SSH → install Node 20+, MySQL, nginx, PM2 → clone repo → `npm install` → `npx prisma migrate deploy` in `api/` → build shared + api + web → PM2 for `node api/dist/server.js` and `next start` (or one process per app).

---

### Option C — Shared hosting **without** Node.js Web App

Cheap **shared** plans without the Node.js Web App feature are aimed at PHP/WordPress. They are **not** a good fit for this Express + Prisma API. Upgrade to **Business/Cloud** (Node.js) or **VPS**.

---

### Summary

| Hostinger product | Website + API for this repo |
|-------------------|-----------------------------|
| **Node.js Web App** (Business / Cloud) | **Two** Node deployments from one monorepo: `hostinger:build:api` / `hostinger:start:api` and `hostinger:build:web` / `hostinger:start:web` |
| **VPS** | One server; you run nginx + two Node processes |
| **Shared (no Node)** | Not suitable |

The steps below (Steps 1–5) are for **local learning**; for production on Hostinger Node.js hosting, follow **Option A** and set env vars in hPanel instead of only `api/.env` / `web/.env.local`.

---

## Step 1 — Install tools on the machine that will run the API

Pick one machine to host the API first (often your home PC for testing, or your game VPS for production).

### 1.1 Node.js (required)

1. Download **Node.js 20 LTS** (or newer) from [https://nodejs.org](https://nodejs.org).
2. Run the installer. Leave “npm” enabled.
3. Open **PowerShell** or **Command Prompt** and check:

   ```powershell
   node -v
   npm -v
   ```

   You should see versions, not “not recognized”.

### 1.2 Git (optional but recommended)

If you use Git: install from [https://git-scm.com](https://git-scm.com). Otherwise you can work from a ZIP of the project folder.

### 1.3 MySQL (required)

You need a **MySQL 8** server the API can connect to.

**Option A — Docker Desktop (good on Windows if you use Docker)**

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/).
2. From your project root (where `docker-compose.yml` is):

   ```powershell
   docker compose up -d mysql
   ```

3. Wait until the container is healthy. Default connection string:

   `mysql://evidence:evidence@127.0.0.1:3306/evidence`

**Option B — MySQL installed locally (no Docker)**

1. Install MySQL 8 Server.
2. Create a database and user, for example (run in MySQL as admin):

   ```sql
   CREATE DATABASE evidence CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER 'evidence'@'localhost' IDENTIFIED BY 'your_strong_password';
   GRANT ALL PRIVILEGES ON evidence.* TO 'evidence'@'localhost';
   FLUSH PRIVILEGES;
   ```

3. Your `DATABASE_URL` will look like:

   `mysql://evidence:your_strong_password@127.0.0.1:3306/evidence`

**Option C — Remote MySQL (VPS / hosting)**

Use the host, port, user, and password your provider gives you. The API machine must be allowed to connect (firewall / “remote MySQL” access).

---

## Step 2 — Get the project and install dependencies

1. Put the repo on disk, e.g.  
   `C:\Users\YourName\Documents\vicevalleyrp\vicevalleyrp-evidence`

2. In PowerShell:

   ```powershell
   cd C:\Users\YourName\Documents\vicevalleyrp\vicevalleyrp-evidence
   npm install
   npm run build -w shared
   npm run db:generate -w api
   ```

If `npm install` fails, fix Node version (use 20+) and try again.

---

## Step 3 — Create the API environment file

1. Copy `api\.env.example` to `api\.env` (same folder as `api\package.json`).

2. Edit `api\.env` and set at least the following.

### 3.1 Database

```env
DATABASE_URL=mysql://evidence:evidence@127.0.0.1:3306/evidence
```

(Match your real user, password, host, and database name.)

### 3.2 Server and sessions

```env
PORT=4000
NODE_ENV=development
SESSION_SECRET=paste-a-long-random-string-at-least-32-characters-here
```

Generate a random secret (you can use a password manager or run `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).

### 3.3 Web app URL (CORS + OAuth redirect target)

For local testing:

```env
WEB_APP_URL=http://localhost:3000
```

Later, in production, this must be the **exact** origin where users open the portal (scheme + host + port), e.g. `https://evidence.yourdomain.com`.

### 3.4 FiveM internal API secret

Pick another long random string. **The same value** will go in your FiveM `server.cfg` as `bodycam_api_secret`.

```env
FIVEM_API_SECRET=another-long-random-secret-not-the-same-as-session-but-just-as-long
```

### 3.5 Discord OAuth (needed for the web portal login)

1. Open [Discord Developer Portal](https://discord.com/developers/applications) → **Applications** → **New Application** → name it (e.g. “Vice Valley Evidence”).
2. Open **OAuth2** → **General**:
   - Copy **Client ID** → `DISCORD_CLIENT_ID`
   - Click **Reset Secret** or reveal **Client Secret** → `DISCORD_CLIENT_SECRET`
3. Under **Redirects**, click **Add Redirect** and add **exactly** (for local dev):

   `http://localhost:4000/auth/discord/callback`

   For production, add your public API URL too, e.g.  
   `https://api.yourdomain.com/auth/discord/callback`

4. In `api\.env`:

   ```env
   DISCORD_CLIENT_ID=your_client_id_here
   DISCORD_CLIENT_SECRET=your_client_secret_here
   DISCORD_CALLBACK_URL=http://localhost:4000/auth/discord/callback
   ```

   **`DISCORD_CALLBACK_URL` must match one of the redirect URLs** in the Discord app, character for character.

5. Optional — make yourself super admin on first login:

   ```env
   DISCORD_SUPER_ADMIN_IDS=your_discord_user_id
   ```

   Your numeric Discord ID: enable Developer Mode in Discord → right-click your profile → Copy User ID.

### 3.6 Cloudflare R2 (default storage)

In [Cloudflare Dashboard](https://dash.cloudflare.com/) → **R2**:

1. **Create bucket** — name it (e.g. `vicevalley-evidence-dev`). Do **not** enable public access unless you know you need it.
2. Note your **Account ID** (R2 overview).
3. Create **R2 API Token** (S3-compatible access) with read/write on that bucket. Save **Access Key ID** and **Secret Access Key**.

In `api\.env`:

```env
STORAGE_PROVIDER=r2
R2_ACCOUNT_ID=your_cloudflare_account_id
R2_BUCKET=your_bucket_name
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_ENDPOINT=https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com
PRESIGNED_URL_EXPIRES_SECONDS=900
```

Replace `YOUR_ACCOUNT_ID` in the URL with your real Account ID (same as `R2_ACCOUNT_ID`).

### 3.7 Optional: Amazon S3 instead of R2

See root `README.md` for `STORAGE_PROVIDER=s3` and `S3_*` variables.

---

## Step 4 — Create database tables and seed settings

From the **repository root**:

```powershell
cd api
npx prisma migrate deploy
npm run db:seed
cd ..
```

- **`migrate deploy`** creates all tables from `prisma/migrations`.
- **`db:seed`** inserts default retention / video policy keys.

If `migrate deploy` errors, read the message: usually wrong `DATABASE_URL` or MySQL not running.

**Quick sanity check** — start the API briefly:

```powershell
npm run dev:api
```

(In repo root; this runs the `api` workspace dev script.)

Open a browser: [http://localhost:4000/health](http://localhost:4000/health)  
You should see JSON like `{"ok":true}`. Stop the API with `Ctrl+C` when done.

---

## Step 5 — Run the web portal (optional but recommended)

1. Copy `web\.env.example` to `web\.env.local`.

2. Set:

   ```env
   NEXT_PUBLIC_API_URL=http://localhost:4000
   ```

   In production this becomes your **public** API URL, e.g. `https://api.yourdomain.com`.

3. Two terminals from repo root:

   ```powershell
   npm run dev:api
   ```

   ```powershell
   npm run dev:web
   ```

4. Open [http://localhost:3000](http://localhost:3000) → **Login** → **Continue with Discord** → complete OAuth → you should land on `/dashboard`.

If login fails, see [Troubleshooting](#troubleshooting) below.

---

## Step 6 — Put the API where your FiveM server can reach it

The **FiveM server process** (the machine running FXServer) must be able to open a TCP connection to your API.

| Your setup | What to put in `bodycam_api_base` |
|------------|-------------------------------------|
| API and FiveM on **same Windows PC** | `http://127.0.0.1:4000` (dev only; OK for LAN tests) |
| API on another PC on your LAN | `http://192.168.x.x:4000` (use the API PC’s LAN IP; Windows Firewall must allow inbound port 4000) |
| API on a **VPS** and FiveM elsewhere | `https://api.yourdomain.com` (HTTPS + reverse proxy recommended) |
| API on **Hostinger Node.js Web App** (see [Option A](#option-a--hostinger-nodejs-web-app-website--api)) | `https://api.yourdomain.com` — hPanel routes HTTPS to your Express app |
| API on **Hostinger VPS** (see [Option B](#option-b--hostinger-vps-full-control)) | `https://api.yourdomain.com` — nginx → Node on `127.0.0.1:4000` |

**Important:** If the API only listens on `localhost`, other machines cannot connect. For LAN/VPS you typically bind `0.0.0.0` (Express default when you run `npm run dev:api` is often all interfaces — if not, check firewall).

For a quick **internet test** without a domain, some teams use a tunnel (e.g. ngrok) pointing to port 4000; the FiveM server would use the `https://....ngrok.io` URL as `bodycam_api_base`. Rotate tunnel URLs whenever they change.

**Production:** Use HTTPS, a real hostname, and lock down who can call `/internal/fivem/*` (secret header + firewall if possible).

---

## Step 7 — Install the FiveM resource

### 7.1 Install screenshot-basic

This bodycam resource uploads screenshots through **screenshot-basic** (or a compatible uploader). Common choice:

- Resource: [citizenfx/screenshot-basic](https://github.com/citizenfx/screenshot-basic)  
- Add it to your server’s `resources` folder and ensure it in `server.cfg` **before** the bodycam resource.

### 7.2 Copy the bodycam folder

1. Copy the folder `fivem-bodycam` from the repo into your server, e.g.  
   `resources\[local]\vicevalley_bodycam`

2. Rename the folder if you want; the folder name is what you `ensure`.

### 7.3 Edit `server.cfg` on your FiveM server

Add **convars** (same secret as `FIVEM_API_SECRET` in `api\.env`):

```cfg
# Evidence API — must be reachable FROM the FiveM server machine
set bodycam_api_base "http://127.0.0.1:4000"
set bodycam_api_secret "paste-exact-same-value-as-FIVEM_API_SECRET"

# qbcore | esx | standalone (standalone uses a test job hack — see below)
set bodycam_framework "standalone"
```

Start order example:

```cfg
ensure screenshot-basic
ensure vicevalley_bodycam
```

(Replace `vicevalley_bodycam` with your folder name.)

### 7.4 Match `config.lua` to your server

Open `fivem-bodycam\config.lua`:

- **`Config.AllowedJobs`** — job names that may use the bodycam (must match your framework’s `job.name` strings).
- **`Config.RequireBodycamProp`** — leave `false` until uniforms are configured.
- **`Config.Framework`** — should match `bodycam_framework` convar; for real QBCore use `qbcore` and extend `server/framework.lua` / job sync as needed.

**Standalone / quick test:** the client sets `LocalPlayer.state.jobName` to `police` after a delay so `AllowedJobs = { "police" }` works without QBCore. For real RP, wire QBCore/ESX properly.

---

## Step 8 — In-game test (happy path)

1. Start **MySQL**, **API** (`npm run dev:api`), and (optional) **web** (`npm run dev:web`).
2. Start **FiveM server** with `screenshot-basic` + bodycam ensured.
3. Join the server with a Discord-linked FiveM account (so the server sees a `discord:` identifier).
4. Press **F10** (default) or run **`/bodycam`** to turn the bodycam **on** (you must pass job/equipment checks).
5. Run **`/bcamsnap`** (or wait for periodic capture while active) to trigger a screenshot upload.
6. Watch server console / F8 for errors. Success: in-game notification that evidence saved (or no “Upload URL failed”).
7. Open the web portal → **Evidence** — a new row should appear for your Discord user.

### Commands reference

| Command / key | Purpose |
|----------------|--------|
| `F10` (default) | Toggle bodycam |
| `/bodycam` | Toggle (if enabled in config) |
| `/bcamsnap` | Manual snapshot while bodycam is **on** |
| `/bcamconfig` | Personal settings (sleeping mode, auto taser/firearm, etc.) |

---

## Step 9 — Sounds (optional)

1. Add `axon_on.ogg` and `axon_off.ogg` under `fivem-bodycam\html\sounds\`.
2. In `fxmanifest.lua`, add under `files { }`:

   ```lua
   'html/sounds/*.ogg',
   ```

3. Restart the resource.

---

## Step 10 — Production differences (short list)

- Run API with **PM2**, **systemd**, or a Windows service; set `NODE_ENV=production`.
- Use **HTTPS** for API and web; update `WEB_APP_URL`, `DISCORD_CALLBACK_URL`, and `NEXT_PUBLIC_API_URL`.
- Add Discord redirect URLs for **production** domains.
- Never commit `.env` files; use secrets on the host only.
- Back up MySQL regularly; R2 bucket lifecycle can complement but does not replace app retention logic.

---

## Troubleshooting

### Discord login: “redirect_uri mismatch”

Discord app redirect list must include the **exact** URL in `DISCORD_CALLBACK_URL` (including `http` vs `https`, port, and path).

### Portal loads but API calls fail / not logged in

- `NEXT_PUBLIC_API_URL` must point to the API the browser can reach.
- Browsers may block third-party cookies in some setups; for production, prefer **same-site** cookie patterns or host API + web on coordinated domains.

### FiveM: “Upload URL failed” or HTTP errors

- Wrong `bodycam_api_secret` (must match `FIVEM_API_SECRET` in `api\.env`).
- FiveM server cannot reach `bodycam_api_base` (firewall, wrong IP, API not running, HTTPS certificate issues).
- Test from the **same machine** as FXServer: open browser or `curl` to `bodycam_api_base/health`.

### Presigned upload 403 / screenshot fails

- R2 keys, bucket name, or endpoint wrong.
- **Content-Type** on the PUT must match what the API signed (JPEG).
- **screenshot-basic** version may not match presigned PUT requirements — check its docs or try a minimal `curl` PUT with the presigned URL.

### “Complete failed” / object not found

The file must finish uploading to R2 **before** the API runs `complete`. Slow networks or failed PUTs cause this.

### Job restriction: bodycam never works

- For QBCore, ensure job name is in `Config.AllowedJobs` and sync `jobName` to state bags from server (replace the standalone hack).
- Or temporarily set `Config.RestrictToLawEnforcement = false` **only on a test server** to confirm the pipeline works.

---

## Where to read next

- [`fivem-bodycam/README.md`](../fivem-bodycam/README.md) — commands, convars, screenshot note  
- [`api/README.md`](../api/README.md) — API routes and internal FiveM headers  
- [`web/README.md`](../web/README.md) — portal env vars  
- Root [`README.md`](../README.md) — R2 security and prefix layout  

You have now walked from **installing Node** through **running the API**, **configuring R2 and Discord**, and **wiring FiveM** so bodycam evidence can reach the portal.
