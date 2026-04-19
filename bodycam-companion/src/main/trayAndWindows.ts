import path from "path";
import fs from "fs";
import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  Tray,
  type Tray as TrayType,
  type NativeImage,
} from "electron";
import { logFilePath } from "./paths";
import { logLine } from "./logger";
import type { AppConfig } from "./config";
import { listWasapiDevices } from "./wasapiDevices";

let tray: TrayType | null = null;
let consentWin: BrowserWindow | null = null;
let overlayWin: BrowserWindow | null = null;
let logsWin: BrowserWindow | null = null;
let settingsWin: BrowserWindow | null = null;
let audioSetupWin: BrowserWindow | null = null;

/** Tray icon buffer for destroy/recreate when toggling visibility. */
let trayImage: NativeImage | null = null;

/** Resolves when user clicks Accept/Decline on consent modal (see registerConsentIpcOnce). */
let consentFinish: ((v: "accept" | "decline") => void) | null = null;

/** Signalled when user completes or skips audio setup (see registerAudioSetupIpcOnce). */
let audioSetupFinish: (() => void) | null = null;

let consentIpcRegistered = false;
let settingsIpcRegistered = false;
let audioSetupIpcRegistered = false;

function registerConsentIpcOnce(): void {
  if (consentIpcRegistered) return;
  consentIpcRegistered = true;
  ipcMain.handle("consent:accept", () => {
    const cb = consentFinish;
    consentFinish = null;
    cb?.("accept");
    if (consentWin && !consentWin.isDestroyed()) consentWin.close();
    return true;
  });
  ipcMain.handle("consent:decline", () => {
    const cb = consentFinish;
    consentFinish = null;
    cb?.("decline");
    if (consentWin && !consentWin.isDestroyed()) consentWin.close();
    return true;
  });
}

function rendererPath(name: string): string {
  return path.join(__dirname, "..", "..", "renderer", name);
}

function preloadPath(name: string): string {
  return path.join(__dirname, "..", "preload", name);
}

/** Same logo as the Windows `.exe`; shipped as `build-assets/app-icon.png` (see pack `shouldIgnore`). */
function trayIconPngPath(): string {
  return path.join(__dirname, "..", "..", "build-assets", "app-icon.png");
}

/** 16×16 grey placeholder if `app-icon.png` is missing (e.g. old dev checkout). */
const TRAY_ICON_FALLBACK_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAHlJREFUeNpi/P//PwMlgImBQkCgpKenBwMjIyMYZ2RkhCtAGhgZGRn/Q4CBAQDIgAQDAwPDf2hoaPgfHBz8Hxoa+n94ePh/eHj4f3h4+H94ePh/eHj4f3h4+H94ePh/eHj4f3h4+H94ePh/eHj4H5aGAYAAAwAkKj0J8Br0PgAAAABJRU5ErkJggg==";

function loadTrayNativeImage(): NativeImage {
  const pngPath = trayIconPngPath();
  try {
    if (fs.existsSync(pngPath)) {
      const img = nativeImage.createFromPath(pngPath);
      if (!img.isEmpty()) {
        const { width, height } = img.getSize();
        const side = Math.max(width, height);
        if (side <= 32) return img;
        return img.resize({ width: 32, height: 32, quality: "good" });
      }
    }
  } catch (e) {
    logLine("warn", "Could not load tray icon from build-assets/app-icon.png", {
      error: String(e),
    });
  }
  return nativeImage.createFromBuffer(Buffer.from(TRAY_ICON_FALLBACK_PNG, "base64"));
}

export type AppStatus = "idle" | "fivem" | "recording";

export interface TrayController {
  setStatus: (s: AppStatus) => void;
  setRecordingOverlay: (on: boolean) => void;
  showConsentModal: () => Promise<"accept" | "decline" | "closed">;
  /** First-run wizard or tray “Audio setup”; resolves when user continues, skips, or closes the window. */
  showAudioSetupModal: () => Promise<"done" | "closed">;
  openLogsWindow: () => void;
  openMainMenu: () => void;
  /** Second BodycamCompanion.exe launch while the first is running. */
  onSecondInstance: () => void;
  dispose: () => void;
}

function applyWindowsStartup(openAtLogin: boolean): void {
  app.setLoginItemSettings({
    openAtLogin,
    path: process.execPath,
    args: process.argv.slice(1).filter((a) => !a.startsWith("--")),
  });
}

export function createTrayAndWindows(
  getConfig: () => AppConfig,
  setConfig: (c: AppConfig) => void,
  persistConfig: (c: AppConfig) => void,
  onExit: () => void
): TrayController {
  let status: AppStatus = "idle";

  const destroyTray = (): void => {
    if (tray) {
      tray.destroy();
      tray = null;
    }
  };

  const createTrayIfNeeded = (): void => {
    if (tray || !trayImage) return;
    tray = new Tray(trayImage);
    tray.setToolTip("Bodycam Companion");
    tray.setContextMenu(buildMenu());
  };

  const syncTrayVisibility = (): void => {
    if (getConfig().hideTrayIcon) {
      destroyTray();
    } else {
      createTrayIfNeeded();
      tray?.setContextMenu(buildMenu());
    }
  };

  const buildMenu = () => {
    const cfg = getConfig();
    const statusLabel =
      status === "recording" ? "Status: Recording" : status === "fivem" ? "Status: FiveM detected" : "Status: Idle";
    return Menu.buildFromTemplate([
      { label: statusLabel, enabled: false },
      { type: "separator" },
      {
        label: "Main menu…",
        click: () => openSettingsWindowInternal(),
      },
      {
        label: "Audio setup…",
        click: () => {
          void showAudioSetupModalInternal();
        },
      },
      {
        label: "Open Developer Logs",
        click: () => openLogsWindowInternal(),
      },
      {
        label: cfg.enableVideo ? "Disable video capture (screen)" : "Enable video capture (screen)",
        click: () => {
          const c = { ...getConfig(), enableVideo: !getConfig().enableVideo };
          setConfig(c);
          persistConfig(c);
          logLine("info", "Video capture toggled", { enableVideo: c.enableVideo });
          tray?.setContextMenu(buildMenu());
        },
      },
      {
        label: "Clear recording opt-out",
        click: () => {
          const c = { ...getConfig(), recordingOptOut: false };
          setConfig(c);
          persistConfig(c);
          tray?.setContextMenu(buildMenu());
        },
      },
      {
        label: "Revoke consent",
        click: () => {
          const c = { ...getConfig(), consentAccepted: false };
          setConfig(c);
          persistConfig(c);
          logLine("warn", "Consent revoked by user");
          tray?.setContextMenu(buildMenu());
        },
      },
      { type: "separator" },
      {
        label: "Show icon in notification area",
        type: "checkbox",
        checked: !cfg.hideTrayIcon,
        click: (item) => {
          const c = { ...getConfig(), hideTrayIcon: !item.checked };
          setConfig(c);
          persistConfig(c);
          syncTrayVisibility();
        },
      },
      { type: "separator" },
      {
        label: "Exit",
        click: () => onExit(),
      },
    ]);
  };

  const openSettingsWindowInternal = (): void => {
    if (settingsWin && !settingsWin.isDestroyed()) {
      settingsWin.focus();
      return;
    }
    settingsWin = new BrowserWindow({
      width: 560,
      height: 520,
      title: "Bodycam Companion — Main menu",
      autoHideMenuBar: true,
      resizable: true,
      minimizable: true,
      webPreferences: {
        preload: preloadPath("settingsPreload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    settingsWin.on("closed", () => {
      settingsWin = null;
    });
    void settingsWin.loadFile(rendererPath("settings.html"));
  };

  const openLogsWindowInternal = () => {
    if (logsWin && !logsWin.isDestroyed()) {
      logsWin.focus();
      return;
    }
    logsWin = new BrowserWindow({
      width: 720,
      height: 480,
      title: "Bodycam Companion — Logs",
      webPreferences: {
        preload: preloadPath("logsPreload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    const sendLogs = () => {
      try {
        const p = logFilePath();
        const text = fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "(empty log)";
        logsWin?.webContents.send("logs:content", text);
      } catch (e) {
        logsWin?.webContents.send("logs:content", String(e));
      }
    };
    void logsWin.loadFile(rendererPath("logs.html")).then(() => {
      sendLogs();
      const id = setInterval(sendLogs, 2000);
      logsWin?.on("closed", () => clearInterval(id));
    });
  };

  const registerSettingsIpcOnce = (): void => {
    if (settingsIpcRegistered) return;
    settingsIpcRegistered = true;
    ipcMain.handle("settings:load", () => {
      const cfg = getConfig();
      const { outputs, inputs } = listWasapiDevices();
      return {
        wasapiOutputDevice: cfg.wasapiOutputDevice,
        wasapiInputDevice: cfg.wasapiInputDevice,
        autoStartWithWindows: cfg.autoStartWithWindows,
        hideTrayIcon: cfg.hideTrayIcon,
        outputs,
        inputs,
      };
    });
    ipcMain.handle("settings:openLogs", () => {
      openLogsWindowInternal();
      return true;
    });
    ipcMain.handle(
      "settings:save",
      (_e, patch: Record<string, unknown>) => {
        try {
          const cur = getConfig();
          const next: AppConfig = { ...cur };
          if (typeof patch.wasapiOutputDevice === "string") {
            next.wasapiOutputDevice = patch.wasapiOutputDevice.trim();
          }
          if (typeof patch.wasapiInputDevice === "string") {
            next.wasapiInputDevice = patch.wasapiInputDevice.trim();
          }
          if (typeof patch.autoStartWithWindows === "boolean") {
            next.autoStartWithWindows = patch.autoStartWithWindows;
          }
          if (typeof patch.hideTrayIcon === "boolean") {
            next.hideTrayIcon = patch.hideTrayIcon;
          }
          setConfig(next);
          persistConfig(next);
          applyWindowsStartup(next.autoStartWithWindows);
          syncTrayVisibility();
          return { ok: true as const };
        } catch (e) {
          return { ok: false as const, error: String((e as Error)?.message || e) };
        }
      }
    );
  };

  const registerAudioSetupIpcOnce = (): void => {
    if (audioSetupIpcRegistered) return;
    audioSetupIpcRegistered = true;
    ipcMain.handle("audioSetup:load", () => {
      const cfg = getConfig();
      const { outputs, inputs } = listWasapiDevices();
      return {
        wasapiOutputDevice: cfg.wasapiOutputDevice,
        wasapiInputDevice: cfg.wasapiInputDevice,
        outputs,
        inputs,
      };
    });
    ipcMain.handle(
      "audioSetup:complete",
      (_e, patch: { wasapiOutputDevice?: string; wasapiInputDevice?: string }) => {
        const cur = getConfig();
        const next: AppConfig = {
          ...cur,
          audioSetupCompleted: true,
        };
        if (typeof patch.wasapiOutputDevice === "string") {
          next.wasapiOutputDevice = patch.wasapiOutputDevice.trim();
        }
        if (typeof patch.wasapiInputDevice === "string") {
          next.wasapiInputDevice = patch.wasapiInputDevice.trim();
        }
        setConfig(next);
        persistConfig(next);
        const cb = audioSetupFinish;
        audioSetupFinish = null;
        cb?.();
        if (audioSetupWin && !audioSetupWin.isDestroyed()) audioSetupWin.close();
        return { ok: true as const };
      }
    );
    ipcMain.handle("audioSetup:skip", () => {
      const cur = getConfig();
      const next: AppConfig = { ...cur, audioSetupCompleted: true };
      setConfig(next);
      persistConfig(next);
      const cb = audioSetupFinish;
      audioSetupFinish = null;
      cb?.();
      if (audioSetupWin && !audioSetupWin.isDestroyed()) audioSetupWin.close();
      return { ok: true as const };
    });
  };

  const showAudioSetupModalInternal = (): Promise<"done" | "closed"> => {
    return new Promise((resolve) => {
      if (audioSetupWin && !audioSetupWin.isDestroyed()) {
        audioSetupWin.focus();
        resolve("done");
        return;
      }
      let settled = false;
      const finish = (v: "done" | "closed") => {
        if (settled) return;
        settled = true;
        audioSetupFinish = null;
        resolve(v);
      };

      audioSetupFinish = () => finish("done");

      audioSetupWin = new BrowserWindow({
        width: 560,
        height: 440,
        resizable: true,
        minimizable: true,
        maximizable: false,
        title: "Bodycam Companion — Audio setup",
        autoHideMenuBar: true,
        show: true,
        webPreferences: {
          preload: preloadPath("audioSetupPreload.js"),
          contextIsolation: true,
          nodeIntegration: false,
        },
      });

      audioSetupWin.on("closed", () => {
        audioSetupWin = null;
        finish("closed");
      });

      void audioSetupWin.loadFile(rendererPath("audioSetup.html"));
    });
  };

  registerConsentIpcOnce();
  registerSettingsIpcOnce();
  registerAudioSetupIpcOnce();

  trayImage = loadTrayNativeImage();
  if (!getConfig().hideTrayIcon) {
    createTrayIfNeeded();
  }

  const setStatus = (s: AppStatus) => {
    status = s;
    tray?.setContextMenu(buildMenu());
  };

  const setRecordingOverlay = (on: boolean) => {
    if (on) {
      if (overlayWin && !overlayWin.isDestroyed()) {
        overlayWin.showInactive();
        return;
      }
      overlayWin = new BrowserWindow({
        width: 56,
        height: 28,
        x: 16,
        y: 16,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        movable: true,
        focusable: false,
        show: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: false,
        },
      });
      overlayWin.setIgnoreMouseEvents(true, { forward: true });
      void overlayWin.loadFile(rendererPath("overlay.html"));
    } else if (overlayWin && !overlayWin.isDestroyed()) {
      overlayWin.close();
      overlayWin = null;
    }
  };

  const showConsentModal = (): Promise<"accept" | "decline" | "closed"> => {
    return new Promise((resolve) => {
      if (consentWin && !consentWin.isDestroyed()) {
        consentWin.removeAllListeners("closed");
        consentWin.close();
        consentWin = null;
      }
      let settled = false;
      const finish = (v: "accept" | "decline" | "closed") => {
        if (settled) return;
        settled = true;
        consentFinish = null;
        resolve(v);
      };

      consentFinish = (v) => finish(v);

      consentWin = new BrowserWindow({
        width: 440,
        height: 280,
        modal: false,
        resizable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        title: "Bodycam Audio Capture Notice",
        show: true,
        webPreferences: {
          preload: preloadPath("consentPreload.js"),
          contextIsolation: true,
          nodeIntegration: false,
        },
      });

      consentWin.on("closed", () => {
        consentWin = null;
        finish("closed");
      });

      void consentWin.loadFile(rendererPath("consent.html"));
    });
  };

  const onSecondInstance = (): void => {
    let c = getConfig();
    if (c.hideTrayIcon) {
      c = { ...c, hideTrayIcon: false };
      setConfig(c);
      persistConfig(c);
    }
    syncTrayVisibility();
    openSettingsWindowInternal();
  };

  return {
    setStatus,
    setRecordingOverlay,
    showConsentModal,
    showAudioSetupModal: showAudioSetupModalInternal,
    openLogsWindow: openLogsWindowInternal,
    openMainMenu: openSettingsWindowInternal,
    onSecondInstance,
    dispose: () => {
      if (settingsIpcRegistered) {
        ipcMain.removeHandler("settings:load");
        ipcMain.removeHandler("settings:save");
        ipcMain.removeHandler("settings:openLogs");
        settingsIpcRegistered = false;
      }
      if (audioSetupIpcRegistered) {
        ipcMain.removeHandler("audioSetup:load");
        ipcMain.removeHandler("audioSetup:complete");
        ipcMain.removeHandler("audioSetup:skip");
        audioSetupIpcRegistered = false;
      }
      audioSetupWin?.destroy();
      audioSetupWin = null;
      destroyTray();
      trayImage = null;
      overlayWin?.destroy();
      overlayWin = null;
      consentWin?.destroy();
      consentWin = null;
      logsWin?.destroy();
      logsWin = null;
      settingsWin?.destroy();
      settingsWin = null;
    },
  };
}
