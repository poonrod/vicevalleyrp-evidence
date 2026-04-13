# Vice Valley Bodycam (FiveM)

## Requirements

- **screenshot-basic** (or compatible resource that can upload to a **presigned PUT** URL).  
- Running **evidence API** with `FIVEM_API_SECRET` and R2/S3 configured.

## Server convars

```
set bodycam_api_base "http://127.0.0.1:4000"
set bodycam_api_secret "your-secret"
set bodycam_framework "qbcore"
```

## Commands & keys

| Input | Action |
|--------|--------|
| `F10` (default) | Toggle bodycam (`+togglebodycam`) |
| `/bodycam` | Toggle (if enabled in config) |
| `/bcamsnap` | Manual screenshot while bodycam **on** |
| `/bcamconfig` | NUI settings (sleeping mode, auto taser/firearm, etc.) |

Change default key in `config.lua` → `ToggleKeybindDefault`.

## Configuration highlights

- **Sleeping mode:** disables auto-activation and pre-buffer behavior; manual use may still be allowed (`AllowManualActivationWhileSleeping`).  
- **Auto taser/firearm:** per-player toggles in `/bcamconfig` unless server **forces** them on.  
- **First person:** `ForceFirstPersonWhileBodycamActive` — captures player view (not a separate cinematic camera).  
- **Pre-event buffer:** periodic snapshots while active; on weapon event, buffer is flushed and labeled — **not** true retroactive video.  
- **Law enforcement:** `AllowedJobs`, optional ACE `bodycam.use`, optional bodycam **component** match.

## Sounds

Place `axon_on.ogg` / `axon_off.ogg` in `html/sounds/` and add them to `fxmanifest.lua` under `files` when ready (see `html/sounds/README.txt`).

## Screenshot upload note

The client uses `exports['screenshot-basic']:requestScreenshotUpload(url, ...)`. Your screenshot resource must perform a **PUT** (or method required by the presigned URL) with **`Content-Type: image/jpeg`** matching the signed request. If uploads fail with **403**, compare headers with the presigned URL policy.

## Discord ID routing

Discord is read on the **server** from identifiers / framework and passed to the API. The complete handler **overwrites** any client-supplied Discord ID with the server-resolved value.
