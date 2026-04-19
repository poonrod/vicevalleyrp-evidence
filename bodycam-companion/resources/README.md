# Bundled FFmpeg (optional)

Place a Windows **`ffmpeg.exe`** in this folder (`bodycam-companion/resources/ffmpeg.exe`) if you do not want to rely on a system-wide FFmpeg install.

The companion resolves the binary in this order:

1. Environment variable **`FFMPEG_PATH`**
2. **`resources/ffmpeg.exe`** (this folder, relative to the package root)
3. **`ffmpeg`** on the system `PATH`

FFmpeg is licensed under LGPL/GPL; comply with [https://ffmpeg.org/legal.html](https://ffmpeg.org/legal.html) when redistributing binaries.
