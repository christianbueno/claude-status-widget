const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('widget', {
  onStatusUpdate: (cb) => ipcRenderer.on('status-update', (_, payload) => cb(payload)),
  toggleExpand: (expanded) => ipcRenderer.send('toggle-expand', expanded),
  refresh: () => ipcRenderer.send('refresh'),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  quit: () => ipcRenderer.send('quit'),
});
