import { contextBridge, ipcRenderer } from "electron";

export interface AudioDeviceOption {
  id: string;
  label: string;
}

export interface AudioSetupLoadPayload {
  wasapiOutputDevice: string;
  wasapiInputDevice: string;
  outputs: AudioDeviceOption[];
  inputs: AudioDeviceOption[];
}

contextBridge.exposeInMainWorld("audioSetupApi", {
  load: (): Promise<AudioSetupLoadPayload> => ipcRenderer.invoke("audioSetup:load"),
  complete: (patch: { wasapiOutputDevice: string; wasapiInputDevice: string }): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke("audioSetup:complete", patch),
  skip: (): Promise<{ ok: boolean }> => ipcRenderer.invoke("audioSetup:skip"),
});
