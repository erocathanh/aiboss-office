'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aibossDesktop', Object.freeze({
  isElectron: true,
  version: '0.1.0',
  getPort: () => ipcRenderer.invoke('desktop:get-port'),
  getStatus: () => ipcRenderer.invoke('desktop:get-status'),
  getLoginItemSettings: () => ipcRenderer.invoke('desktop:get-login-item'),
  setLoginItemSettings: (enabled) => ipcRenderer.invoke('desktop:set-login-item', enabled),
}));
