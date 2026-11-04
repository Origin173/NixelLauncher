import { contextBridge, ipcRenderer } from 'electron';
import type { LauncherSnapshot, NixelBridge } from '../shared/contracts';

const bridge: NixelBridge = {
  platform: process.platform,
  getSnapshot: () => ipcRenderer.invoke('nixel:snapshot'),
  invoke: async (command, params) => {
    try {
      return await ipcRenderer.invoke('nixel:invoke', command, params);
    } catch (error) {
      if (error instanceof Error) {
        // Present the Host's message without Electron's transport prefix.
        throw new Error(
          error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, ''),
        );
      }
      throw error;
    }
  },
  onState: (listener) => {
    const receive = (_event: Electron.IpcRendererEvent, snapshot: LauncherSnapshot) =>
      listener(snapshot);
    ipcRenderer.on('nixel:state', receive);
    return () => {
      ipcRenderer.removeListener('nixel:state', receive);
    };
  },
  selectPath: (options) => ipcRenderer.invoke('nixel:select-path', options),
  selectFiles: (options) => ipcRenderer.invoke('nixel:select-files', options),
  openPath: (path) => ipcRenderer.invoke('nixel:open-path', path),
  openExternal: (url) => ipcRenderer.invoke('nixel:open-external', url),
  readImage: (path) => ipcRenderer.invoke('nixel:read-image', path),
  windowControl: (action) => ipcRenderer.invoke('nixel:window', action),
  restartHost: () => ipcRenderer.invoke('nixel:restart-host'),
};

contextBridge.exposeInMainWorld('nixel', bridge);
