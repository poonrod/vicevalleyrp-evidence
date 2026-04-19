import { app, safeStorage } from "electron";
import { createLocalHttpServer } from "./httpServer";
import { RecordingSessionManager } from "./recordingSession";
import { createTrayAndWindows } from "./trayAndWindows";
import { loadConfig, saveConfig, type AppConfig } from "./config";
import { ensureDirs } from "./paths";
import { isFivemRunning } from "./fivemDetector";
import { logLine } from "./logger";
import { startUploadQueueWorker } from "./uploadQueue";

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  void main();
}

let config: AppConfig = loadConfig();
let trayCtl: ReturnType<typeof createTrayAndWindows> | null = null;

const sessionManager = new RecordingSessionManager({
  afterStart: () => {
    trayCtl?.setStatus("recording");
    trayCtl?.setRecordingOverlay(true);
  },
  afterStop: () => {
    trayCtl?.setRecordingOverlay(false);
    trayCtl?.setStatus(fivemCached ? "fivem" : "idle");
  },
});

let fivemCached = false;
let prevFivem = false;
let httpServer: ReturnType<typeof createLocalHttpServer> | null = null;
let stopQueueWorker: (() => void) | null = null;

function refreshConfig(): void {
  config = loadConfig(safeStorage.isEncryptionAvailable() ? safeStorage : undefined);
}

function setConfig(next: AppConfig): void {
  config = next;
}

async function onFivemPoll(): Promise<void> {
  const running = await isFivemRunning();
  fivemCached = running;

  if (trayCtl) {
    if (sessionManager.isRecording()) {
      trayCtl.setStatus("recording");
    } else {
      trayCtl.setStatus(running ? "fivem" : "idle");
    }
  }

  if (running && !prevFivem) {
    logLine("info", "FiveM detected");
    if (!config.consentAccepted && !config.recordingOptOut && trayCtl) {
      const choice = await trayCtl.showConsentModal();
      if (choice === "accept") {
        config = { ...config, consentAccepted: true, recordingOptOut: false };
        saveConfig(config, safeStorage.isEncryptionAvailable() ? safeStorage : undefined);
        logLine("info", "Consent accepted");
      } else if (choice === "decline") {
        config = { ...config, consentAccepted: false, recordingOptOut: true };
        saveConfig(config, safeStorage.isEncryptionAvailable() ? safeStorage : undefined);
        logLine("warn", "Consent declined — companion recording disabled until cleared in tray");
      }
    }
  }

  if (!running && prevFivem) {
    logLine("info", "FiveM no longer detected");
    if (sessionManager.isRecording()) {
      const result = await sessionManager.stopAndUpload(config);
      logLine("info", "Recording finalized after FiveM exit", { result });
    }
  }

  prevFivem = running;
}

async function main(): Promise<void> {
  await app.whenReady();
  ensureDirs();
  refreshConfig();

  app.setLoginItemSettings({
    openAtLogin: config.autoStartWithWindows,
    path: process.execPath,
    args: process.argv.slice(1).filter((a) => !a.startsWith("--")),
  });

  trayCtl = createTrayAndWindows(
    () => config,
    (c) => {
      config = c;
    },
    () => {
      logLine("info", "Exit requested from tray");
      stopQueueWorker?.();
      httpServer?.close();
      trayCtl?.dispose();
      app.quit();
    }
  );

  httpServer = createLocalHttpServer(
    {
      getConfig: () => config,
      sessionManager,
      getFivemRunning: () => fivemCached,
    },
    config.listenPort
  );

  stopQueueWorker = startUploadQueueWorker(() => config.apiBase, () => config.apiToken, 30_000);

  void onFivemPoll();
  setInterval(() => {
    void onFivemPoll();
  }, 5000);

  logLine("info", "Bodycam companion started", { port: config.listenPort });
}
