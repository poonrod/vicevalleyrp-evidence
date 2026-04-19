import { contextBridge, ipcRenderer } from "electron";

export interface SettingsLoadPayload {
  wasapiOutputDevice: string;
  wasapiInputDevice: string;
  autoStartWithWindows: boolean;
  hideTrayIcon: boolean;
  outputs: { id: string; label: string }[];
  inputs: { id: string; label: string }[];
}

export interface SettingsSavePayload {
  wasapiOutputDevice?: string;
  wasapiInputDevice?: string;
  autoStartWithWindows?: boolean;
  hideTrayIcon?: boolean;
}

contextBridge.exposeInMainWorld("settingsApi", {
  load: (): Promise<SettingsLoadPayload> => ipcRenderer.invoke("settings:load"),
  save: (patch: SettingsSavePayload): Promise<{ ok: true } | { ok: false; error: string }> =>
    ipcRenderer.invoke("settings:save", patch),
  openLogs: (): Promise<void> => ipcRenderer.invoke("settings:openLogs").then(() => undefined),
});
