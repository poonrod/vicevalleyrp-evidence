/**
 * Windows distributable: produces `release/BodycamCompanion-win32-x64/BodycamCompanion.exe`
 * (avoids electron-builder’s native app-builder binary, which can fail under npm workspaces on Windows).
 */
const path = require("path");
const fs = require("fs");
const packager = require("@electron/packager");

const root = path.join(__dirname, "..");
const resourcesDir = path.join(root, "resources");
const extraResource = fs.existsSync(resourcesDir) ? [resourcesDir] : [];

/** npm workspaces hoist deps to the repo root — packager only copies `bodycam-companion/`, so `zod` is missing unless we copy it in. */
function resolveZodSourceDir() {
  try {
    const pkgJson = require.resolve("zod/package.json", { paths: [root] });
    return path.dirname(pkgJson);
  } catch {
    throw new Error(
      "Could not resolve the `zod` package. From the monorepo root run: npm install"
    );
  }
}

function copyZodIntoApp(buildPath) {
  const src = resolveZodSourceDir();
  const dest = path.join(buildPath, "node_modules", "zod");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}

function shouldIgnore(p) {
  const rel = path.relative(root, p).replace(/\\/g, "/");
  if (!rel || rel === ".") return false;
  return (
    rel.startsWith("src/") ||
    rel.startsWith("scripts/") ||
    rel.startsWith("release/") ||
    rel.startsWith("build-assets/") ||
    rel.startsWith("client-extras/") ||
    rel === "tsconfig.json" ||
    rel === ".gitignore" ||
    rel.endsWith(".map")
  );
}

/** Windows `.ico` for the `.exe` (Electron packager requires ICO on win32). */
async function ensureWindowsIcon() {
  const pngPath = path.join(root, "build-assets", "app-icon.png");
  const icoPath = path.join(root, "build-assets", "icon.ico");
  if (!fs.existsSync(pngPath)) {
    console.warn("[pack] No build-assets/app-icon.png — exe will use the default Electron icon.");
    return undefined;
  }
  const pngToIco = require("png-to-ico");
  const buf = await pngToIco(fs.readFileSync(pngPath));
  fs.writeFileSync(icoPath, buf);
  return icoPath;
}

(async () => {
  const out = path.join(root, "release");
  const icon = await ensureWindowsIcon();
  const appPaths = await packager({
    dir: root,
    name: "BodycamCompanion",
    platform: "win32",
    arch: "x64",
    out,
    overwrite: true,
    executableName: "BodycamCompanion",
    electronVersion: "33.4.11",
    ...(icon ? { icon } : {}),
    extraResource,
    ignore: shouldIgnore,
    derefSymlinks: true,
    // After npm prune inside the staged app — copy hoisted `zod` so runtime `require("zod")` works.
    afterPrune: [
      (buildPath, _electronVersion, _platform, _arch, callback) => {
        try {
          copyZodIntoApp(buildPath);
          callback();
        } catch (e) {
          callback(e instanceof Error ? e : new Error(String(e)));
        }
      },
    ],
    afterComplete: [
      (buildPath, _electronVersion, platform, _arch, callback) => {
        try {
          if (platform === "win32") {
            const extras = path.join(root, "client-extras");
            const ps = path.join(extras, "Uninstall.ps1");
            const cmd = path.join(extras, "Uninstall.cmd");
            if (fs.existsSync(ps)) {
              fs.copyFileSync(ps, path.join(buildPath, "Uninstall.ps1"));
            }
            if (fs.existsSync(cmd)) {
              fs.copyFileSync(cmd, path.join(buildPath, "Uninstall.cmd"));
            }
            console.log("[pack] Wrote Uninstall.cmd / Uninstall.ps1 into:", buildPath);
          }
          callback();
        } catch (e) {
          callback(e instanceof Error ? e : new Error(String(e)));
        }
      },
    ],
  });
  console.log("\nPackaged application folders:\n", appPaths.join("\n "));
  console.log(
    "\nClient executable:\n ",
    path.join(out, "BodycamCompanion-win32-x64", "BodycamCompanion.exe")
  );
  console.log(
    "\nUninstaller:\n ",
    path.join(out, "BodycamCompanion-win32-x64", "Uninstall.cmd")
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
