const { contextBridge, ipcRenderer } = require('electron');

let statusUpdateHandler = null;
let themeUpdateHandler = null;

contextBridge.exposeInMainWorld('widget', {
  onStatusUpdate: (cb) => {
    if (statusUpdateHandler) {
      ipcRenderer.off('status-update', statusUpdateHandler);
    }
    statusUpdateHandler = (_, payload) => cb(payload);
    ipcRenderer.on('status-update', statusUpdateHandler);
  },
  onThemeUpdate: (cb) => {
    if (themeUpdateHandler) {
      ipcRenderer.off('theme-update', themeUpdateHandler);
    }
    themeUpdateHandler = (_, payload) => cb(payload);
    ipcRenderer.on('theme-update', themeUpdateHandler);
  },
  toggleExpand: (expanded) => ipcRenderer.send('toggle-expand', expanded),
  refresh: () => ipcRenderer.send('refresh'),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  setTheme: (mode) => ipcRenderer.send('set-theme', mode),
  resetPosition: () => ipcRenderer.send('reset-position'),
  quit: () => ipcRenderer.send('quit'),
  minimizeToTray: () => ipcRenderer.send('minimize-to-tray'),
});
