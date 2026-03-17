const { app, BrowserWindow, ipcMain, Notification, screen, shell } = require('electron');
const path = require('path');
const https = require('https');

let mainWindow;
let pollTimer;
let lastIndicator = null;

const COLLAPSED_HEIGHT = 52;
const EXPANDED_HEIGHT = 520;
const WIDGET_WIDTH = 320;
const MARGIN = 20;
const POLL_MS = 60_000;
const API_URL = 'https://status.claude.com/api/v2/summary.json';

// ── Fetch via Node https (no CORS issues) ────────────────────────────────────
function fetchStatus() {
  return new Promise((resolve, reject) => {
    const req = https.get(API_URL, { headers: { 'User-Agent': 'claude-status-widget/1.0' } }, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error('Failed to parse response')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10_000, () => { req.destroy(); reject(new Error('Request timed out')); });
  });
}

async function pollAndNotify() {
  try {
    const data = await fetchStatus();
    const newIndicator = data.status?.indicator;

    // Fire native notification on status change
    if (lastIndicator !== null && lastIndicator !== newIndicator) {
      const desc = data.status?.description || 'Status changed';
      if (Notification.isSupported()) {
        new Notification({ title: 'Claude Status Update', body: desc }).show();
      }
    }
    lastIndicator = newIndicator;

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('status-update', { data, error: null });
    }
  } catch (err) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('status-update', { data: null, error: err.message });
    }
  }
}

// ── Window ───────────────────────────────────────────────────────────────────
function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: WIDGET_WIDTH,
    height: COLLAPSED_HEIGHT,
    x: width - WIDGET_WIDTH - MARGIN,
    y: height - COLLAPSED_HEIGHT - MARGIN,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    roundedCorners: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Initial fetch + start polling
  pollAndNotify();
  pollTimer = setInterval(pollAndNotify, POLL_MS);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  clearInterval(pollTimer);
  if (process.platform !== 'darwin') app.quit();
});

// ── IPC ──────────────────────────────────────────────────────────────────────
ipcMain.on('toggle-expand', (_, expanded) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const newH = expanded ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT;
  mainWindow.setBounds(
    { x: width - WIDGET_WIDTH - MARGIN, y: height - newH - MARGIN, width: WIDGET_WIDTH, height: newH },
    true // animate on macOS
  );
});

ipcMain.on('refresh', pollAndNotify);

ipcMain.on('open-external', (_, url) => {
  try {
    const parsed = new URL(url);
    if (parsed.origin === 'https://status.claude.com') {
      shell.openExternal(url);
    }
  } catch { /* ignore invalid URLs */ }
});

ipcMain.on('quit', () => app.quit());
