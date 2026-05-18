import { contextBridge, ipcRenderer } from 'electron';
import { APP_GET_VERSION } from '../shared/ipc/channels';

contextBridge.exposeInMainWorld('api', {
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke(APP_GET_VERSION),
  },
});
