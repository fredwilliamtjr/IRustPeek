const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('iRustPeek', {
  getState: () => ipcRenderer.invoke('state:get'),
  upsertDevice: (device) => ipcRenderer.invoke('device:upsert', device),
  deleteDevice: (id) => ipcRenderer.invoke('device:delete', id),
  connectDevice: (rustdeskId) => ipcRenderer.invoke('device:connect', rustdeskId),
  reload: () => ipcRenderer.invoke('sync:reload'),
  chooseSyncFolder: () => ipcRenderer.invoke('sync:choose-folder'),
  setSyncFile: (filePath) => ipcRenderer.invoke('sync:set-file', filePath),
  setSyncProvider: (providerId) => ipcRenderer.invoke('sync:set-provider', providerId),
  syncNow: () => ipcRenderer.invoke('sync:now'),
  setLaunchAtLogin: (enabled) => ipcRenderer.invoke('launch:set', enabled),
  syncNowFromTray: () => ipcRenderer.invoke('tray:sync-now'),
  openSettingsFromTray: () => ipcRenderer.invoke('tray:open-settings'),
  hideTray: () => ipcRenderer.invoke('tray:hide'),
  quitApp: () => ipcRenderer.invoke('app:quit'),
  onStateChanged: (callback) => {
    ipcRenderer.on('state:changed', (_event, state) => callback(state));
  }
});
