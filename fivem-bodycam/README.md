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

Put those **`set` lines above `ensure fivem-bodycam`** in `server.cfg` so the resource reads the correct URL/secret when it starts. `bodycam_api_secret` must match **`FIVEM_API_SECRET`** in the evidence API `.env` exactly.

**Screenshot resource:** Install [citizenfx/screenshot-basic](https://github.com/citizenfx/screenshot-basic) so the folder is exactly **`screenshot-basic`**, then `ensure screenshot-basic` **before** `ensure fivem-bodycam`. That resource declares dependencies **`yarn`** and **`webpack`** (bundled with normal FXServer templates). If either dependency fails to start, screenshot-basic will not start.

**`Couldn't find resource yarn` / “yarn exists in more than one place”:** The real **`yarn`** builder ships under something like **`resources\[system]\[builders]\yarn`** with a proper **`fxmanifest.lua`**. If you also have a **`yarn`** folder under **`[gameplay]`** (or anywhere else) with **no** manifest, the scanner warns, the name collides, and **`ensure yarn`** can fail — then **`screenshot-basic`** cannot resolve its dependency. **Delete the extra `yarn` folder** (keep only the official `[builders]` one), clear **`cache`**, restart.

**Webpack build still fails (`webpack is busy` → `Couldn't start resource screenshot-basic`):** Here `webpack` is running but the **client/server bundles for screenshot-basic do not finish** before the resource aborts. Common causes:

- **Order:** `ensure yarn` → `ensure webpack` → `ensure screenshot-basic` → bodycam. Missing **`yarn`** in `server.cfg` is a frequent oversight even when `webpack` alone shows as started.
- **First boot:** The first compile can take **minutes** (`yarn install` + multiple webpack configs). Scroll **past** the yellow line for real errors (`EPERM`, `ENOSPC`, missing module, Node stack traces).
- **Clean rebuild:** Stop FXServer, delete the server root **`cache`** folder, start again.
- **Linux / shared hosting:** Builds need writable temp/work dirs; some panels block that (same class of issue as [webpack + screenshot-basic on restricted hosts](https://forum.cfx.re/t/help-with-webpack-error-couldnt-start-resource-screenshot-basic/1523036)).
- **Windows:** Exclude the server directory from antivirus so `node` / `yarn` files are not locked mid-build.
- **Artifacts:** Update to a current [recommended FXServer build](https://runtime.fivem.net/artifacts/fivem/build_server_windows/master/); outdated server builds occasionally break the embedded Node path used by `yarn` / `webpack` resources.

**Standalone + “nothing hits the API”:** With `RestrictToLawEnforcement = true`, job names came only from `AllowedJobs` (`police`, `sheriff`). The standalone framework reports job **`standalone`** for everyone, so uploads were blocked before any HTTP call. The server script now treats **`standalone`** as law enforcement when `bodycam_framework` is `standalone`. The **client** matches that for equipment / toggle checks when `LocalPlayer.state.jobName` is `standalone`. For stricter public servers, use **ACE** (`UseAcePermissions`) or set **`RestrictToLawEnforcement = false`** only on private test boxes.

**Test server still not uploading:** (1) Player must have a **`discord:`** identifier or C7 Discord field — otherwise you get “No Discord identifier”. (2) `bodycam_api_base` must be a URL your **FXServer machine** can reach (`PerformHttpRequest` runs on the server). `http://127.0.0.1:4000` only works if the evidence API listens on the same host as the game server. (3) `bodycam_api_secret` must exactly match **`FIVEM_API_SECRET`** in the API `.env`. (4) `ensure screenshot-basic` before bodycam and confirm it is **started** (not “starting”). (5) This MVP sends **JPEG snapshots** (manual `/bcamsnap`, periodic while recording, auto on taser/gun), not MP4 clips — clip modes stay off unless you build that flow.

**Verbose server logs:** add `set bodycam_debug "1"` next to your other bodycam convars; failed upload-url / complete calls print one line to the server console with the error string.

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
