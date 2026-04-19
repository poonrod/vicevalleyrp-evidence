import fs from "fs";
import type { SafeStorage } from "electron";
import { configPath, ensureDirs } from "./paths";
import { logLine } from "./logger";

export interface AppConfig {
  consentAccepted: boolean;
  recordingOptOut: boolean;
  enableVideo: boolean;
  apiBase: string;
  /** Runtime secret; may come from env, plain file, or decrypted `apiTokenProtected`. */
  apiToken: string;
  /** Electron safeStorage (DPAPI) ciphertext as base64 — preferred when set. */
  apiTokenProtected?: string;
  autoStartWithWindows: boolean;
  listenPort: number;
  /** WASAPI loopback device name; empty = Windows default output. */
  wasapiOutputDevice: string;
  /** WASAPI capture (mic) device name; empty = Windows default input. */
  wasapiInputDevice: string;
  /** When true, no tray icon (HTTP + FiveM still work). Relaunch app to open Main menu again. */
  hideTrayIcon: boolean;
  /**
   * After the first-run audio device wizard (or skip). Existing `config.json` files without this key
   * are treated as already completed so upgrades are not interrupted.
   */
  audioSetupCompleted: boolean;
}

const defaults: AppConfig = {
  consentAccepted: false,
  recordingOptOut: false,
  enableVideo: false,
  apiBase: "https://your-evidence-host",
  apiToken: "",
  autoStartWithWindows: true,
  listenPort: 4555,
  wasapiOutputDevice: "",
  wasapiInputDevice: "",
  hideTrayIcon: false,
  audioSetupCompleted: false,
};

function readTokenFromEnv(): string {
  return (process.env.BODYCAM_API_TOKEN || process.env.FIVEM_API_SECRET || "").trim();
}

function decryptTokenIfNeeded(raw: Record<string, unknown>, safeStorage?: SafeStorage): string {
  const env = readTokenFromEnv();
  if (env) return env;
  const plain = typeof raw.apiToken === "string" ? raw.apiToken.trim() : "";
  const prot = typeof raw.apiTokenProtected === "string" ? raw.apiTokenProtected.trim() : "";
  if (prot && safeStorage?.isEncryptionAvailable()) {
    try {
      const buf = Buffer.from(prot, "base64");
      return safeStorage.decryptString(buf);
    } catch (e) {
      logLine("warn", "Failed to decrypt apiTokenProtected", { err: String(e) });
    }
  }
  return plain;
}

export function loadConfig(safeStorage?: SafeStorage): AppConfig {
  ensureDirs();
  const path = configPath();
  let raw: Record<string, unknown> = {};
  let configFileReadOk = false;
  try {
    if (fs.existsSync(path)) {
      raw = JSON.parse(fs.readFileSync(path, "utf8")) as Record<string, unknown>;
      configFileReadOk = true;
    }
  } catch (e) {
    logLine("warn", "config.json parse failed, using defaults", { err: String(e) });
  }
  const audioSetupCompleted = !configFileReadOk
    ? false
    : Object.prototype.hasOwnProperty.call(raw, "audioSetupCompleted")
      ? !!raw.audioSetupCompleted
      : true;
  const apiToken = decryptTokenIfNeeded(raw, safeStorage);
  const apiTokenProtected =
    typeof raw.apiTokenProtected === "string" ? raw.apiTokenProtected : undefined;
  const wasOut =
    typeof raw.wasapiOutputDevice === "string" ? raw.wasapiOutputDevice.trim() : "";
  const wasIn =
    typeof raw.wasapiInputDevice === "string" ? raw.wasapiInputDevice.trim() : "";

  return {
    consentAccepted: !!raw.consentAccepted,
    recordingOptOut: !!raw.recordingOptOut,
    enableVideo: !!raw.enableVideo,
    apiBase: typeof raw.apiBase === "string" && raw.apiBase ? raw.apiBase : defaults.apiBase,
    apiToken,
    apiTokenProtected,
    autoStartWithWindows: raw.autoStartWithWindows !== false,
    listenPort:
      typeof raw.listenPort === "number" && raw.listenPort > 0 && raw.listenPort < 65536
        ? raw.listenPort
        : defaults.listenPort,
    wasapiOutputDevice: wasOut,
    wasapiInputDevice: wasIn,
    hideTrayIcon: !!raw.hideTrayIcon,
    audioSetupCompleted,
  };
}

export function saveConfig(cfg: AppConfig, safeStorage?: SafeStorage): void {
  ensureDirs();
  const path = configPath();
  let tokenProtected: string | undefined;
  let omitPlainToken = false;
  const env = readTokenFromEnv();
  if (cfg.apiToken && !env && safeStorage?.isEncryptionAvailable()) {
    try {
      const enc = safeStorage.encryptString(cfg.apiToken);
      tokenProtected = Buffer.from(enc).toString("base64");
      omitPlainToken = true;
    } catch (e) {
      logLine("warn", "safeStorage.encryptString failed, storing plain apiToken", { err: String(e) });
    }
  }
  const disk: Record<string, unknown> = {
    consentAccepted: cfg.consentAccepted,
    recordingOptOut: cfg.recordingOptOut,
    enableVideo: cfg.enableVideo,
    apiBase: cfg.apiBase,
    autoStartWithWindows: cfg.autoStartWithWindows,
    listenPort: cfg.listenPort,
    wasapiOutputDevice: cfg.wasapiOutputDevice,
    wasapiInputDevice: cfg.wasapiInputDevice,
    hideTrayIcon: cfg.hideTrayIcon,
    audioSetupCompleted: cfg.audioSetupCompleted,
  };
  if (tokenProtected) {
    disk.apiTokenProtected = tokenProtected;
  } else if (cfg.apiToken && !env) {
    disk.apiToken = cfg.apiToken;
  }
  if (cfg.apiTokenProtected && !tokenProtected) {
    disk.apiTokenProtected = cfg.apiTokenProtected;
  }
  if (!omitPlainToken && cfg.apiToken && !env) {
    disk.apiToken = cfg.apiToken;
  }
  fs.writeFileSync(path, JSON.stringify(disk, null, 2), "utf8");
}
