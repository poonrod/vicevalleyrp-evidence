import path from "path";
import fs from "fs";
import {
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  Tray,
  safeStorage,
  type Tray as TrayType,
} from "electron";
import { logFilePath } from "./paths";
import { logLine } from "./logger";
import type { AppConfig } from "./config";
import { saveConfig } from "./config";

let tray: TrayType | null = null;
let consentWin: BrowserWindow | null = null;
let overlayWin: BrowserWindow | null = null;
let logsWin: BrowserWindow | null = null;

/** Resolves when user clicks Accept/Decline on consent modal (see registerConsentIpcOnce). */
let consentFinish: ((v: "accept" | "decline") => void) | null = null;

let consentIpcRegistered = false;
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

export type AppStatus = "idle" | "fivem" | "recording";

export interface TrayController {
  setStatus: (s: AppStatus) => void;
  setRecordingOverlay: (on: boolean) => void;
  showConsentModal: () => Promise<"accept" | "decline" | "closed">;
  openLogsWindow: () => void;
  dispose: () => void;
}

export function createTrayAndWindows(
  getConfig: () => AppConfig,
  setConfig: (c: AppConfig) => void,
  onExit: () => void
): TrayController {
  let status: AppStatus = "idle";

  const buildMenu = () => {
    const cfg = getConfig();
    const statusLabel =
      status === "recording" ? "Status: Recording" : status === "fivem" ? "Status: FiveM detected" : "Status: Idle";
    return Menu.buildFromTemplate([
      { label: statusLabel, enabled: false },
      { type: "separator" },
      {
        label: "Open Developer Logs",
        click: () => openLogsWindowInternal(),
      },
      {
        label: cfg.enableVideo ? "Disable video capture (screen)" : "Enable video capture (screen)",
        click: () => {
          const c = { ...getConfig(), enableVideo: !getConfig().enableVideo };
          setConfig(c);
          saveConfig(c, safeStorage.isEncryptionAvailable() ? safeStorage : undefined);
          logLine("info", "Video capture toggled", { enableVideo: c.enableVideo });
          tray?.setContextMenu(buildMenu());
        },
      },
      {
        label: "Clear recording opt-out",
        click: () => {
          const c = { ...getConfig(), recordingOptOut: false };
          setConfig(c);
          saveConfig(c, safeStorage.isEncryptionAvailable() ? safeStorage : undefined);
          tray?.setContextMenu(buildMenu());
        },
      },
      {
        label: "Revoke consent",
        click: () => {
          const c = { ...getConfig(), consentAccepted: false };
          setConfig(c);
          saveConfig(c, safeStorage.isEncryptionAvailable() ? safeStorage : undefined);
          logLine("warn", "Consent revoked by user");
          tray?.setContextMenu(buildMenu());
        },
      },
      { type: "separator" },
      {
        label: "Exit",
        click: () => onExit(),
      },
    ]);
  };

  registerConsentIpcOnce();
  const icon1 =
    "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAHlJREFUeNpi/P//PwMlgImBQkCgpKenBwMjIyMYZ2RkhCtAGhgZGRn/Q4CBAQDIgAQDAwPDf2hoaPgfHBz8Hxoa+n94ePh/eHj4f3h4+H94ePh/eHj4f3h4+H94ePh/eHj4f3h4+H94ePh/eHj4f3h4+H94ePh/eHj4H5aGAYAAAwAkKj0J8Br0PgAAAABJRU5ErkJggg==";
  const trayIcon = nativeImage.createFromBuffer(Buffer.from(icon1, "base64"));
  tray = new Tray(trayIcon);
  tray.setToolTip("Bodycam Companion");
  tray.setContextMenu(buildMenu());

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

  return {
    setStatus,
    setRecordingOverlay,
    showConsentModal,
    openLogsWindow: openLogsWindowInternal,
    dispose: () => {
      tray?.destroy();
      tray = null;
      overlayWin?.destroy();
      overlayWin = null;
      consentWin?.destroy();
      consentWin = null;
      logsWin?.destroy();
      logsWin = null;
    },
  };
}

