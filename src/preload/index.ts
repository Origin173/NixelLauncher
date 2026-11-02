import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('nixel', {
  platform: process.platform,
});
