const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('widget', {
  onStatusUpdate: (cb) => ipcRenderer.on('status-update', (_, payload) => cb(payload)),
  onThemeUpdate: (cb) => ipcRenderer.on('theme-update', (_, payload) => cb(payload)),
  toggleExpand: (expanded) => ipcRenderer.send('toggle-expand', expanded),
  refresh: () => ipcRenderer.send('refresh'),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  setTheme: (mode) => ipcRenderer.send('set-theme', mode),
  resetPosition: () => ipcRenderer.send('reset-position'),
  quit: () => ipcRenderer.send('quit'),
});
