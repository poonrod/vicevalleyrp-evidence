import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("companion", {
  onLog: (cb: (text: string) => void) => {
    ipcRenderer.on("logs:content", (_e, text: string) => cb(text));
  },
});
