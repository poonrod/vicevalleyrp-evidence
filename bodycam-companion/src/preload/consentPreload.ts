import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("companion", {
  accept: () => ipcRenderer.invoke("consent:accept"),
  decline: () => ipcRenderer.invoke("consent:decline"),
});
