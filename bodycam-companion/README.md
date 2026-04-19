# Bodycam Windows companion

Electron tray application that:

- Polls for `FiveM.exe` every 5 seconds
- Listens on **`127.0.0.1:4555`** only (`POST /start-recording`, `POST /stop-recording`, `GET /health`)
- Records **WASAPI loopback + WASAPI mic** (optional **GDI screen + H.264**) via **FFmpeg**
- Uploads finished **MP4** through the same **internal FiveM evidence API** as the rest of this monorepo: presigned `upload-url` → `PUT` → `complete` with **`x-fivem-secret`**
- Shows a **consent** modal before recording is allowed
- Retries failed uploads with **exponential backoff** (`pending-uploads.json` under `%APPDATA%/Bodycam`)

## Requirements

- **Windows 10/11**
- **Node 20+** (for development)
- **FFmpeg** on `PATH`, or set **`FFMPEG_PATH`** to `ffmpeg.exe`, or place `resources/ffmpeg.exe` next to the package (see [resources/README.md](resources/README.md))
- Evidence API **`FIVEM_API_SECRET`** and HTTPS **`apiBase`** configured in `%APPDATA%/Bodycam/config.json` (or env **`BODYCAM_API_TOKEN`** / **`FIVEM_API_SECRET`**)

## Config (`%APPDATA%/Bodycam/config.json`)

```json
{
  "consentAccepted": false,
  "recordingOptOut": false,
  "enableVideo": false,
  "apiBase": "https://your-api-host",
  "apiToken": "",
  "autoStartWithWindows": true,
  "listenPort": 4555
}
```

- **`apiToken`**: same value as **`FIVEM_API_SECRET`** on the API (sent as header `x-fivem-secret`).
- On supported builds, the app may persist the token using Electron **safeStorage** (DPAPI) as `apiTokenProtected` instead of a plain `apiToken`.

## Client `.exe` (Windows build)

Nothing is committed as a binary. You **build** the app locally with **`@electron/packager`** (reliable under npm workspaces on Windows; no NSIS installer—distribute the folder or zip it).

1. **App icon:** keep [`build-assets/app-icon.png`](build-assets/app-icon.png) (Vice Valley logo). `npm run pack:win` converts it to a Windows **`.ico`** and applies it to **`BodycamCompanion.exe`**.
2. Optional: copy a licensed **`ffmpeg.exe`** into [`resources/`](resources/) so it is bundled under `resources/` next to the exe (otherwise clients need FFmpeg on `PATH` or `FFMPEG_PATH`).
3. From monorepo root:

```bash
npm run pack:companion:win
```

Or inside `bodycam-companion/`: `npm run pack:win`

Output folder:

**[`release/BodycamCompanion-win32-x64/`](release/BodycamCompanion-win32-x64/)**

- **`BodycamCompanion.exe`** — what players run (keep the whole folder: it includes `resources/`, `locales`, etc.).
- **`Uninstall.exe`** — double-click to remove the program folder (see [client-extras/README.md](client-extras/README.md)); run `Uninstall.exe --remove-user-data` to also wipe `%APPDATA%\Bodycam`.
- Zip **`BodycamCompanion-win32-x64`** and send that archive to clients, or ship it via your launcher.

Evidence API URL and secret are **not** baked in; officers configure `%APPDATA%/Bodycam/config.json` (or you supply a short setup guide).

After changing the pack script or dependencies, **re-run** `npm run pack:companion:win` and redistribute the new `BodycamCompanion-win32-x64` folder (an old Desktop copy will not pick up fixes).

## Run (development)

From monorepo root:

```bash
npm run dev:companion
```

Or from this folder after `npm install`:

```bash
npm run dev
```

## FiveM resource (`penheads-bodycam`)

Enable the bridge (server + NUI → localhost):

```
setr bodycam_companion "1"
setr bodycam_companion_url "http://127.0.0.1:4555"
```

When the officer turns **bodycam on**, NUI calls **`/start-recording`** with `officer_discord_id` from the server; when they turn it **off**, NUI calls **`/stop-recording`** with the latest incident id from the HUD when available.

## Security notes

- HTTP server binds to **localhost only** (not LAN).
- Do not forward port 4555 from the router.
- Logs are written to `%APPDATA%/Bodycam/companion.log` (secrets are not written there).

## Manual test matrix

| Case | Steps | Expected |
|------|--------|----------|
| FiveM detection | Start/stop FiveM | Tray status Idle ↔ FiveM detected |
| Consent gate | First FiveM with no consent | Modal; Decline sets opt-out and blocks starts |
| Start without FiveM | `curl` POST start while FiveM closed | `403 fivem_not_running` (unless `BODYCAM_SKIP_FIVEM_CHECK=1`) |
| Double session | Two POST starts | Second returns `409` |
| Record + stop | Enable companion + toggle bodycam | FFmpeg runs; stop uploads or enqueues on failure |
| Hash | API with `ENABLE_HASH_CHECK` | Complete succeeds with `sha256` |
| Queue | Break network after file written | File remains; retry after restore / app restart |
| FiveM exit while recording | Close FiveM during recording | Session finalizes and upload runs |

## CI / dev flag

- **`BODYCAM_SKIP_FIVEM_CHECK=1`**: treat FiveM as always running (for automated tests only).
