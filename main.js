const { app, BrowserWindow, ipcMain, Notification, screen, shell, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');

let mainWindow;
let pollTimer;
let lastIndicator = null;
let currentThemeMode = 'system';

// ── Preferences ─────────────────────────────────────────────────────────────
const PREFS_DEFAULTS = { position: null, theme: 'system' };

function getPrefsPath() {
  return path.join(app.getPath('userData'), 'preferences.json');
}

function loadPrefs() {
  try {
    const data = JSON.parse(fs.readFileSync(getPrefsPath(), 'utf-8'));
    return { ...PREFS_DEFAULTS, ...data };
  } catch {
    return { ...PREFS_DEFAULTS };
  }
}

function savePrefs(prefs) {
  try {
    fs.writeFileSync(getPrefsPath(), JSON.stringify(prefs, null, 2));
  } catch { /* ignore write errors */ }
}

const COLLAPSED_HEIGHT = 52;
const EXPANDED_HEIGHT = 520;
const WIDGET_WIDTH = 320;
const MARGIN = 20;
const POLL_MS = 60_000;
const API_URL = 'https://status.claude.com/api/v2/summary.json';

function getDefaultPosition() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  return {
    x: width - WIDGET_WIDTH - MARGIN,
    y: height - COLLAPSED_HEIGHT - MARGIN,
  };
}

function validatePosition(pos) {
  if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') return null;
  const bounds = { x: pos.x, y: pos.y, width: WIDGET_WIDTH, height: COLLAPSED_HEIGHT };
  const display = screen.getDisplayMatching(bounds);
  const wa = display.workArea;
  if (pos.x >= wa.x && pos.y >= wa.y &&
      pos.x + WIDGET_WIDTH <= wa.x + wa.width &&
      pos.y + COLLAPSED_HEIGHT <= wa.y + wa.height) {
    return pos;
  }
  return null;
}

// ── Fetch via Node https (no CORS issues) ────────────────────────────────────
function fetchStatus() {
  return new Promise((resolve, reject) => {
    const req = https.get(API_URL, { headers: { 'User-Agent': 'claude-status-widget/1.0' } }, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch { reject(new Error('Failed to parse response')); }
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
  const prefs = loadPrefs();
  const pos = validatePosition(prefs.position) || getDefaultPosition();
  currentThemeMode = prefs.theme || 'system';

  mainWindow = new BrowserWindow({
    width: WIDGET_WIDTH,
    height: COLLAPSED_HEIGHT,
    x: pos.x,
    y: pos.y,
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

  // ── Position persistence (T005 + T006) ──────────────────────────────────
  let saveTimeout;
  mainWindow.on('moved', () => {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      const b = mainWindow.getBounds();
      // Clamp to screen bounds
      const display = screen.getDisplayMatching(b);
      const wa = display.workArea;
      const clamped = {
        x: Math.max(wa.x, Math.min(b.x, wa.x + wa.width - b.width)),
        y: Math.max(wa.y, Math.min(b.y, wa.y + wa.height - b.height)),
      };
      if (clamped.x !== b.x || clamped.y !== b.y) {
        mainWindow.setBounds({ ...b, x: clamped.x, y: clamped.y });
      }
      const prefs = loadPrefs();
      prefs.position = { x: clamped.x, y: clamped.y };
      savePrefs(prefs);
    }, 500);
  });

  // ── Theme: send initial theme after page loads (T011) ────────────────────
  mainWindow.webContents.on('did-finish-load', () => {
    sendThemeToRenderer();
  });

  // Initial fetch + start polling
  pollAndNotify();
  pollTimer = setInterval(pollAndNotify, POLL_MS);
}

app.whenReady().then(() => {
  createWindow();

  // Revalidate position when displays change
  const revalidatePosition = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const b = mainWindow.getBounds();
    if (!validatePosition({ x: b.x, y: b.y })) {
      const def = getDefaultPosition();
      mainWindow.setBounds({ x: def.x, y: def.y, width: b.width, height: b.height }, true);
      const prefs = loadPrefs();
      prefs.position = null;
      savePrefs(prefs);
    }
  };
  screen.on('display-removed', revalidatePosition);
  screen.on('display-metrics-changed', revalidatePosition);
});

app.on('window-all-closed', () => {
  clearInterval(pollTimer);
  if (process.platform !== 'darwin') app.quit();
});

// ── Theme ───────────────────────────────────────────────────────────────────
function resolveTheme() {
  if (currentThemeMode === 'dark') return 'dark';
  if (currentThemeMode === 'light') return 'light';
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
}

function sendThemeToRenderer() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('theme-update', {
    mode: currentThemeMode,
    resolved: resolveTheme(),
  });
}

nativeTheme.on('updated', () => {
  if (currentThemeMode === 'system') {
    sendThemeToRenderer();
  }
});

// ── IPC ──────────────────────────────────────────────────────────────────────
ipcMain.on('toggle-expand', (_, expanded) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const b = mainWindow.getBounds();
  const newH = expanded ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT;
  let newY = b.y;
  if (expanded) {
    // Expand downward from pill; shift up if panel would exceed work area bottom
    const display = screen.getDisplayMatching(b);
    const waBottom = display.workArea.y + display.workArea.height;
    if (b.y + newH > waBottom) {
      newY = waBottom - newH;
    }
  } else {
    // Collapsing: restore to saved position or keep current x with collapsed height
    const prefs = loadPrefs();
    const saved = validatePosition(prefs.position);
    newY = saved ? saved.y : b.y;
  }
  mainWindow.setBounds(
    { x: b.x, width: WIDGET_WIDTH, height: newH, y: newY },
    true // animate on macOS
  );
});

ipcMain.on('set-theme', (_, mode) => {
  if (!['dark', 'light', 'system'].includes(mode)) return;
  currentThemeMode = mode;
  const prefs = loadPrefs();
  prefs.theme = mode;
  savePrefs(prefs);
  sendThemeToRenderer();
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

ipcMain.on('reset-position', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const prefs = loadPrefs();
  prefs.position = null;
  savePrefs(prefs);
  const def = getDefaultPosition();
  mainWindow.setBounds(
    { x: def.x, y: def.y, width: WIDGET_WIDTH, height: COLLAPSED_HEIGHT },
    true
  );
});

ipcMain.on('quit', () => app.quit());
