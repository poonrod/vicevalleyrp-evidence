# Bundled FFmpeg (Windows)

The Windows package ships **`ffmpeg.exe`** next to the app (see `scripts/download-ffmpeg-win.cjs` and `npm run pack:win`).

On **first launch**, the companion copies that binary into:

`%APPDATA%\Bodycam\bin\ffmpeg.exe`

so recordings use a stable, writable path. Override order at runtime:

1. Environment variable **`FFMPEG_PATH`**
2. **`%APPDATA%\Bodycam\bin\ffmpeg.exe`** (installed copy)
3. **`resources/resources/ffmpeg.exe`** inside the packaged app (or `resources/ffmpeg.exe` if laid out flat)
4. Dev checkout: **`bodycam-companion/resources/ffmpeg.exe`**
5. **`ffmpeg`** on the system `PATH`

Developers: run `npm run ffmpeg:win` once to download FFmpeg before `npm run pack:win`, or let `pack:win` run the downloader automatically.

FFmpeg is LGPL/GPL; comply with [https://ffmpeg.org/legal.html](https://ffmpeg.org/legal.html) when redistributing binaries.
