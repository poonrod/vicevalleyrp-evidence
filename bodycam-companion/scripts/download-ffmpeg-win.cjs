/**
 * Downloads a Windows x64 FFmpeg "essentials" build (LGPL/GPL) into resources/ffmpeg.exe
 * before packaging. Skips if the file already exists unless FORCE_FFMPEG_DOWNLOAD=1.
 *
 * Override URL: FFMPEG_WIN_URL="https://..."
 * https://ffmpeg.org/legal.html
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { pipeline } = require("stream/promises");
const https = require("https");
const http = require("http");

const root = path.join(__dirname, "..");
const outExe = path.join(root, "resources", "ffmpeg.exe");

function followFetch(url) {
  return new Promise((resolve, reject) => {
    const lib = url.toLowerCase().startsWith("https") ? https : http;
    lib
      .get(url, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          const next = new URL(res.headers.location, url).href;
          res.resume();
          followFetch(next).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        resolve(res);
      })
      .on("error", reject);
  });
}

function extractZip(zipPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  let r = spawnSync("tar", ["-xf", zipPath, "-C", destDir], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (r.status === 0) return;
  const ps = [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
  ];
  r = spawnSync("powershell.exe", ps, { encoding: "utf8", windowsHide: true });
  if (r.status !== 0) {
    throw new Error(
      `Extract failed (tar + PowerShell): ${r.stderr || r.stdout || r.error || "unknown"}`
    );
  }
}

function findFfmpegExe(dir) {
  /** @type {string | null} */
  let best = null;
  const walk = (d) => {
    let ents;
    try {
      ents = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of ents) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.name.toLowerCase() === "ffmpeg.exe") {
        const low = p.toLowerCase();
        if (low.includes(`${path.sep}bin${path.sep}`) || low.endsWith(`${path.sep}bin\\ffmpeg.exe`)) {
          best = p;
          return;
        }
        if (!best) best = p;
      }
    }
  };
  walk(dir);
  return best;
}

(async () => {
  if (fs.existsSync(outExe) && process.env.FORCE_FFMPEG_DOWNLOAD !== "1") {
    console.log("[ffmpeg] Skip download (already exists). Set FORCE_FFMPEG_DOWNLOAD=1 to refresh.");
    return;
  }

  const url =
    process.env.FFMPEG_WIN_URL ||
    "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip";

  console.log("[ffmpeg] Downloading:", url);
  const res = await followFetch(url);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bc-ffmpeg-"));
  const zipPath = path.join(tmpDir, "ffmpeg.zip");
  await pipeline(res, fs.createWriteStream(zipPath));

  console.log("[ffmpeg] Extracting…");
  const extractDir = path.join(tmpDir, "extracted");
  extractZip(zipPath, extractDir);

  const found = findFfmpegExe(extractDir);
  if (!found) {
    throw new Error("Could not find ffmpeg.exe inside the downloaded archive.");
  }

  fs.mkdirSync(path.dirname(outExe), { recursive: true });
  fs.copyFileSync(found, outExe);
  console.log("[ffmpeg] Wrote:", outExe);

  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
})().catch((e) => {
  console.error("[ffmpeg]", e);
  process.exit(1);
});
