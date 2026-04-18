# Vice Valley Bodycam (FiveM)

## Requirements

- **screenshot-basic** (or compatible resource that can upload to a **presigned PUT** URL).  
- Running **evidence API** with `FIVEM_API_SECRET` and R2/S3 configured.
- **C7 Framework V3** (optional): [C7FW documentation](https://docs.c7scripts.com/paid/c7fw) — this resource uses [server exports](https://docs.c7scripts.com/paid/c7fw/developers/exports.md) from `c7-scripts-framework-v3` when `bodycam_framework` is `c7fw`.

## Server convars

```
set bodycam_api_base "http://127.0.0.1:4000"
set bodycam_api_secret "your-secret"
set bodycam_framework "standalone"
# Optional: only if your screenshot resource folder is not "screenshot-basic" (use setr so clients see it):
# setr bodycam_screenshot_resource "my-screenshot-resource"
```

Put those **`set` lines above `ensure penheads-bodycam`** in `server.cfg` so the resource reads the correct URL/secret when it starts. `bodycam_api_secret` must match **`FIVEM_API_SECRET`** in the evidence API `.env` exactly.

**Screenshot resource:** Install [citizenfx/screenshot-basic](https://github.com/citizenfx/screenshot-basic) so the folder is exactly **`screenshot-basic`**, then `ensure screenshot-basic` **before** `ensure penheads-bodycam`. That resource declares dependencies **`yarn`** and **`webpack`** (bundled with normal FXServer templates). If either dependency fails to start, screenshot-basic will not start.

**`Couldn't find resource yarn` / “yarn exists in more than one place”:** The real **`yarn`** builder ships under something like **`resources\[system]\[builders]\yarn`** with a proper **`fxmanifest.lua`**. If you also have a **`yarn`** folder under **`[gameplay]`** (or anywhere else) with **no** manifest, the scanner warns, the name collides, and **`ensure yarn`** can fail — then **`screenshot-basic`** cannot resolve its dependency. **Delete the extra `yarn` folder** (keep only the official `[builders]` one), clear **`cache`**, restart.

**Webpack build still fails (`webpack is busy` → `Couldn't start resource screenshot-basic`):** Here `webpack` is running but the **client/server bundles for screenshot-basic do not finish** before the resource aborts. Common causes:

- **Order:** `ensure yarn` → `ensure webpack` → `ensure screenshot-basic` → bodycam. Missing **`yarn`** in `server.cfg` is a frequent oversight even when `webpack` alone shows as started.
- **First boot:** The first compile can take **minutes** (`yarn install` + multiple webpack configs). Scroll **past** the yellow line for real errors (`EPERM`, `ENOSPC`, missing module, Node stack traces).
- **Clean rebuild:** Stop FXServer, delete the server root **`cache`** folder, start again.
- **Linux / shared hosting:** Builds need writable temp/work dirs; some panels block that (same class of issue as [webpack + screenshot-basic on restricted hosts](https://forum.cfx.re/t/help-with-webpack-error-couldnt-start-resource-screenshot-basic/1523036)).
- **Windows:** Exclude the server directory from antivirus so `node` / `yarn` files are not locked mid-build.
- **Artifacts:** Update to a current [recommended FXServer build](https://runtime.fivem.net/artifacts/fivem/build_server_windows/master/); outdated server builds occasionally break the embedded Node path used by `yarn` / `webpack` resources.

**Standalone + “nothing hits the API”:** With `RestrictToLawEnforcement = true`, job names came only from `AllowedJobs` (`police`, `sheriff`). The standalone framework reports job **`standalone`** for everyone, so uploads were blocked before any HTTP call. The server script now treats **`standalone`** as law enforcement when `bodycam_framework` is `standalone`. The **client** matches that for equipment / toggle checks when `LocalPlayer.state.jobName` is `standalone`. For stricter public servers, use **ACE** (`UseAcePermissions`) or set **`RestrictToLawEnforcement = false`** only on private test boxes.

**Test server still not uploading:** (1) Player must have a **`discord:`** identifier or C7 Discord field — otherwise you get “No Discord identifier”. (2) `bodycam_api_base` must be a URL your **FXServer machine** can reach (`PerformHttpRequest` runs on the server). `http://127.0.0.1:4000` only works if the evidence API listens on the same host as the game server. (3) `bodycam_api_secret` must exactly match **`FIVEM_API_SECRET`** in the API `.env`. (4) `ensure screenshot-basic` before bodycam and confirm it is **started** (not “starting”). (5) With clip mode off, you still get **JPEG snapshots** (manual `/bcamsnap`, periodic while recording, auto on taser/gun). With clip mode on, turning bodycam off also produces a **WebM clip** (see above).

**Verbose server logs:** add `set bodycam_debug "1"` next to your other bodycam convars; failed upload-url / complete calls print one line to the server console with the error string.

## WebM clip (when `Config.EnableClipMode` is true)

After the officer turns **bodycam off**, the client captures a burst of **JPEG frames** from `screenshot-basic`, encodes them in NUI with **MediaRecorder** into **WebM** (prefers **VP9 + Opus** when the browser supports it), then **PUTs** the blob to the same presigned flow as photos.

- **FPS:** `ClipRecordFps` / `ClipRecordFpsMax` tune screenshot cadence. The FiveM server must pass `clipRecordFps` into the presign payload (defaults to `Config.ClipRecordFps`, **not** 2 — an old default of `2` made clips extremely blocky). Real FPS is often **below** the target because each `requestScreenshot` takes time. `ClipMaxFramesCap` limits total frames for safety.
- **First person:** `UseFirstPersonForClipRecording` (default **true**) holds follow-cam first person for the **entire** clip via `BeginClipSessionFirstPerson` / `EndClipSessionFirstPerson` (no per-frame camera flicker). Set `ClipFirstPersonRequiresSnapshotToggle` to **true** to require the same personal toggle as JPEG snapshots.
- **Encoding:** `ShortClipResolution` / `ShortClipBitrateKbps` target VP9 size vs quality (default **960×540** and **~1.4 Mbps**). NUI prefers **VP9 + Opus** when supported.
- **Microphone:** When `EnableClipRecordingMicrophone` is true (default), NUI calls **`getUserMedia({ audio })`** and mixes that track into the WebM. That is the player’s **physical microphone** in Windows (what Discord/browser would use). The player may get a browser permission prompt the first time.
- **`ClipMicrophoneProcessing`:** `"voice"` (default) uses echo/noise suppression (good for comms). `"ambient"` turns most of that off so **speaker / room** sound is louder — useful if game audio is heard through speakers and you want more of it on the clip (still **mic-only**, not a direct game tap). For a **virtual mix** of desktop/game audio into the “mic”, players can install **VB-Audio Cable** / **Stereo Mix** and set that device as the default recording device (advanced; not automated by this resource).
- **Game + voice chat on clips (`ClipAudioCaptureMode`):** FiveM does **not** expose raw engine or Mumble PCM to Lua. This resource can still record **what you hear** by using the browser’s **`getDisplayMedia`** screen share with **system / monitor loopback audio** (Chromium on Windows: pick the monitor running GTA and enable **Share audio**). That captures **game output** and **positional voice** as long as they play through the normal Windows playback device (headphones/speakers). Modes:
  - **`mic`** — microphone only (`getUserMedia`).
  - **`display`** — loopback only (no officer mic).
  - **`display_plus_mic`** (default) — **loopback + microphone** mixed in NUI (Web Audio) so your radio / local talk is included with world audio.
  **Setup (F8 only):** With display modes enabled, run **`bodycamclipaudio`** in the **F8** client console (override via `Config.BodycamClipAudioConsoleCommand`). That opens NUI with mouse focus so the player can click **Allow monitor audio** and pick the monitor with **Share audio** — Chromium requires that gesture. A successful grant is **remembered in the FiveM CEF profile** (localStorage). **`bodycamclipaudio_clear`** (same prefix + `_clear`) wipes that preference and stops any cached capture. If a clip still cannot get loopback audio (browser/OS policy), run **`bodycamclipaudio`** again. If they skip setup, the first clip may fall back to mic-only (`display_plus_mic`) or fail (`display` only).
- **Bitrate / resolution:** WebM encoding uses **`ShortClipBitrateKbps`** and downscales frames to **`ShortClipResolution`** before `MediaRecorder` so the encoder keeps up; if clips still hitch, lower **`ClipRecordFps`** or max seconds.

**Periodic JPEG snapshots are disabled while clip mode is on.** Set `EnableClipMode = false` if you only want interval photos.

**Incidents:** When an officer turns bodycam **on**, the server calls **`POST /internal/fivem/incidents/ensure`** with the session id (`BCAM-…`) so a matching row exists in the evidence API database. Uploads then attach **`incidentBusinessId`** correctly. If the API is down, the HUD id still appears but evidence may not link until the next successful ensure.

R2/S3 **CORS** must allow **PUT** with `Content-Type: video/webm` from `https://cfx-nui-*` origins. If the clip step fails, check F8 and server `bodycam_debug` lines.

**C7 Framework V3** — set `bodycam_framework` to `c7fw` and align `AllowedJobs` in `config.lua` with C7 department IDs (`GetCharDept` / `char_department`, e.g. `lspd`):

```
set bodycam_framework "c7fw"
# Optional if your C7 resource folder is renamed:
# setr bodycam_c7fw_resource "c7-scripts-framework-v3"
```

## Commands & keys

| Input | Action |
|--------|--------|
| `F10` (default) | Toggle bodycam (`+togglebodycam`) |
| `/bodycam` | Toggle (if enabled in config) |
| `/bcamsnap` | Manual screenshot while bodycam **on** |
| `/bcamconfig` | NUI settings (sleeping mode, auto taser/firearm, etc.) |
| F8: `bodycamclipaudio` | Clip monitor / system audio setup (only when `ClipAudioCaptureMode` is `display` or `display_plus_mic`; command from `Config.BodycamClipAudioConsoleCommand`) |
| F8: `bodycamclipaudio_clear` | Clear saved clip monitor-audio preference (`<command>_clear`) |

Change default key in `config.lua` → `ToggleKeybindDefault`.

## Configuration highlights

- **Sleeping mode:** disables auto-activation and pre-buffer behavior; manual use may still be allowed (`AllowManualActivationWhileSleeping`).  
- **Auto taser/firearm:** per-player toggles in `/bcamconfig` unless server **forces** them on.  
- **Camera:** Default is **not** forcing first person while the bodycam is on (`ForceFirstPersonWhileBodycamActive = false`). **`UseFirstPersonForSnapshots`** (default true) plus the personal **first-person capture** toggle briefly switches to first person **only for each screenshot** so footage matches a body-worn camera; turn the toggle off in `/bcamconfig` to record whatever view you are in (e.g. third person).  
- **Pre-event buffer:** periodic snapshots while active; on weapon event, buffer is flushed and labeled — **not** true retroactive video.  
- **Law enforcement:** `AllowedJobs`, optional ACE `bodycam.use`, optional bodycam **component** match.

## Sounds

**Activation:** `html/sounds/axon_on.ogg` is included and listed in **`fxmanifest.lua`** so the NUI player can load it. **Deactivation:** add `axon_off.ogg` next to it and add `'html/sounds/axon_off.ogg'` under **`files`** — until then, turn-off uses the short **HUD** cue (`BACK`). If a listed `.ogg` is missing, the resource will fail to start.

## Screenshot upload note

**citizenfx/screenshot-basic** captures via `requestScreenshot`, but its built-in **`requestScreenshotUpload`** path always sends **POST + multipart FormData**. Our API issues **presigned S3 PutObject (PUT + raw JPEG)** URLs, so bodycam **PUTs from this resource’s NUI** (`html/app.js`) after capture. You still need **screenshot-basic** started for the capture export. If uploads fail with **403** / signature errors, confirm your R2 bucket **CORS** allows **PUT** from NUI origins (`https://cfx-nui-*`).

## Discord ID routing

Discord is read on the **server** from identifiers / framework and passed to the API. The complete handler **overwrites** any client-supplied Discord ID with the server-resolved value.
