/**
 * Windows distributable: produces `release/BodycamCompanion-win32-x64/BodycamCompanion.exe`
 * (avoids electron-builder’s native app-builder binary, which can fail under npm workspaces on Windows).
 */
const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");
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
    rel.startsWith("tools/") ||
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
  // Multi-size ICO (16–256) so Windows picks the right bitmap for Explorer / taskbar.
  const toIco = require("to-ico");
  const buf = await toIco(fs.readFileSync(pngPath), {
    resize: true,
    sizes: [16, 24, 32, 48, 64, 128, 256],
  });
  fs.writeFileSync(icoPath, buf);
  return icoPath;
}

function findCscPath() {
  const windir = process.env.WINDIR || "C:\\Windows";
  const candidates = [
    path.join(windir, "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe"),
    path.join(windir, "Microsoft.NET", "Framework", "v4.0.30319", "csc.exe"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

/** Single-file uninstaller (C#, ~8 KB) compiled with the .NET Framework SDK that ships on Windows. */
function compileWindowsUninstaller(outExe) {
  const csc = findCscPath();
  if (!csc) {
    throw new Error(
      "Could not find csc.exe under %WINDIR%\\Microsoft.NET\\Framework*\\v4.0.30319\\. " +
        "Use a normal Windows install (or install .NET Framework 4.x developer pack) to run pack:win."
    );
  }
  const src = path.join(root, "tools", "windows-uninstall", "Program.cs");
  if (!fs.existsSync(src)) {
    throw new Error("Missing tools/windows-uninstall/Program.cs");
  }
  fs.mkdirSync(path.dirname(outExe), { recursive: true });
  // Do not wrap /out in extra quotes — csc treats them as part of the path (CS2021).
  const outArg = `/out:${outExe}`;
  const r = spawnSync(csc, ["/nologo", "/optimize+", "/target:exe", outArg, src], {
    encoding: "utf-8",
  });
  if (r.status !== 0) {
    throw new Error(
      `csc.exe failed (${r.status}):\n${r.stdout || ""}\n${r.stderr || ""}`
    );
  }
}

(async () => {
  const out = path.join(root, "release");
  const icon = await ensureWindowsIcon();
  const uninstallBuild = path.join(root, "build-assets", "Uninstall.exe");
  compileWindowsUninstaller(uninstallBuild);
  if (icon && fs.existsSync(uninstallBuild)) {
    const rcedit = require("rcedit");
    await rcedit(uninstallBuild, {
      icon,
      "version-string": {
        FileDescription: "Bodycam Companion uninstaller",
        ProductName: "Bodycam Companion",
        CompanyName: "Vice Valley RP",
      },
      "file-version": "1.0.0",
      "product-version": "1.0.0",
    });
    console.log("[pack] Applied icon to Uninstall.exe");
  }
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
            const builtUninstall = path.join(root, "build-assets", "Uninstall.exe");
            if (fs.existsSync(builtUninstall)) {
              fs.copyFileSync(
                builtUninstall,
                path.join(buildPath, "Uninstall.exe")
              );
              console.log("[pack] Wrote Uninstall.exe into:", buildPath);
            } else {
              console.warn(
                "[pack] build-assets/Uninstall.exe missing; uninstaller not copied."
              );
            }
          }
          callback();
        } catch (e) {
          callback(e instanceof Error ? e : new Error(String(e)));
        }
      },
    ],
  });

  // Re-apply the icon so Explorer reliably picks it up (packager’s resedit + shell quirks).
  if (icon && fs.existsSync(icon)) {
    const rcedit = require("rcedit");
    for (const buildPath of appPaths) {
      const exe = path.join(buildPath, "BodycamCompanion.exe");
      if (fs.existsSync(exe)) {
        await rcedit(exe, { icon });
        console.log("[pack] Applied icon via rcedit:", exe);
      }
    }
  }

  console.log("\nPackaged application folders:\n", appPaths.join("\n "));
  console.log(
    "\nClient executable:\n ",
    path.join(out, "BodycamCompanion-win32-x64", "BodycamCompanion.exe")
  );
  console.log(
    "\nUninstaller:\n ",
    path.join(out, "BodycamCompanion-win32-x64", "Uninstall.exe")
  );
  console.log(
    "\nIf Explorer still shows the old icon, restart it or clear the icon cache (e.g. sign out/in).\n"
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
