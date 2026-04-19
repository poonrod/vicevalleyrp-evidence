import fs from "fs";
import os from "os";
import path from "path";

/** Matches plan: `%APPDATA%/Bodycam` (not Electron userData). */
export function appDataBodycamRoot(): string {
  const base = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  return path.join(base, "Bodycam");
}

export function configPath(): string {
  return path.join(appDataBodycamRoot(), "config.json");
}

export function tempRecordingsDir(): string {
  return path.join(appDataBodycamRoot(), "temp");
}

export function pendingUploadsPath(): string {
  return path.join(appDataBodycamRoot(), "pending-uploads.json");
}

export function logFilePath(): string {
  return path.join(appDataBodycamRoot(), "companion.log");
}

export function ensureDirs(): void {
  fs.mkdirSync(appDataBodycamRoot(), { recursive: true });
  fs.mkdirSync(tempRecordingsDir(), { recursive: true });
}
