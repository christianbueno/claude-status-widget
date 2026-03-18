const { app, BrowserWindow, ipcMain, Notification, screen, shell, nativeTheme, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');

let mainWindow;
let pollTimer;
let lastIndicator = null;
let currentThemeMode = 'system';
let preExpandY = null;
let tray = null;
let isQuitting = false;

// ── Preferences ─────────────────────────────────────────────────────────────
const PREFS_DEFAULTS = { position: null, theme: 'system', minimized: false };
let cachedPrefs = null;

function getPrefsPath() {
  return path.join(app.getPath('userData'), 'preferences.json');
}

function loadPrefs() {
  if (cachedPrefs) return { ...cachedPrefs };
  try {
    const data = JSON.parse(fs.readFileSync(getPrefsPath(), 'utf-8'));
    cachedPrefs = { ...PREFS_DEFAULTS, ...data };
  } catch {
    cachedPrefs = { ...PREFS_DEFAULTS };
  }
  return { ...cachedPrefs };
}

function savePrefs(prefs) {
  cachedPrefs = { ...prefs };
  fs.promises.writeFile(getPrefsPath(), JSON.stringify(prefs, null, 2)).catch(() => {});
}

// ── Tray Icon ────────────────────────────────────────────────────────────────
const INDICATOR_COLOR_MAP = {
  none:        '#22c55e', // green – operational
  minor:       '#f59e0b', // yellow – minor issues
  major:       '#f97316', // orange – major issues
  critical:    '#ef4444', // red – critical outage
  maintenance: '#6366f1', // indigo – maintenance
};
const TRAY_COLOR_UNKNOWN = '#6b7280'; // grey – unknown / fetch error

// Claude logo SVG path (same shape used in the widget UI)
const LOGO_PATH = 'm 105.01,322.07 29.14,-16.35 0.49,-1.42 -0.49,-0.79 h -1.42 l -4.87,-0.3 -16.65,-0.45 -14.44,-0.6 -13.99,-0.75 -3.52,-0.75 -3.3,-4.35 0.34,-2.17 2.96,-1.99 4.24,0.37 9.37,0.64 14.06,0.97 10.2,0.6 15.11,1.57 h 2.4 l 0.34,-0.97 -0.82,-0.6 -0.64,-0.6 -14.55,-9.86 -15.75,-10.42 -8.25,-6 -4.46,-3.04 -2.25,-2.85 -0.97,-6.22 4.05,-4.46 5.44,0.37 1.39,0.37 5.51,4.24 11.77,9.11 15.37,11.32 2.25,1.87 0.9,-0.64 0.11,-0.45 -1.01,-1.69 -8.36,-15.11 -8.92,-15.37 -3.97,-6.37 -1.05,-3.82 c -0.37,-1.57 -0.64,-2.89 -0.64,-4.5 l 4.61,-6.26 2.55,-0.82 6.15,0.82 2.59,2.25 3.82,8.74 6.19,13.76 9.6,18.71 2.81,5.55 1.5,5.14 0.56,1.57 h 0.97 v -0.9 l 0.79,-10.54 1.46,-12.94 1.42,-16.65 0.49,-4.69 2.32,-5.62 4.61,-3.04 3.6,1.72 2.96,4.24 -0.41,2.74 -1.76,11.44 -3.45,17.92 -2.25,12 h 1.31 l 1.5,-1.5 6.07,-8.06 10.2,-12.75 4.5,-5.06 5.25,-5.59 3.37,-2.66 h 6.37 l 4.69,6.97 -2.1,7.2 -6.56,8.32 -5.44,7.05 -7.8,10.5 -4.87,8.4 0.45,0.67 1.16,-0.11 17.62,-3.75 9.52,-1.72 11.36,-1.95 5.14,2.4 0.56,2.44 -2.02,4.99 -12.15,3 -14.25,2.85 -21.22,5.02 -0.26,0.19 0.3,0.37 9.56,0.9 4.09,0.22 h 10.01 l 18.64,1.39 4.87,3.22 2.92,3.94 -0.49,3 -7.5,3.82 -10.12,-2.4 -23.62,-5.62 -8.1,-2.02 h -1.12 v 0.67 l 6.75,6.6 12.37,11.17 15.49,14.4 0.79,3.56 -1.99,2.81 -2.1,-0.3 -13.61,-10.24 -5.25,-4.61 -11.89,-10.01 h -0.79 v 1.05 l 2.74,4.01 14.47,21.75 0.75,6.67 -1.05,2.17 -3.75,1.31 -4.12,-0.75 -8.47,-11.89 -8.74,-13.39 -7.05,-12 -0.86,0.49 -4.16,44.81 -1.95,2.29 -4.5,1.72 -3.75,-2.85 -1.99,-4.61 1.99,-9.11 2.4,-11.89 1.95,-9.45 1.76,-11.74 1.05,-3.9 -0.07,-0.26 -0.86,0.11 -8.85,12.15 -13.46,18.19 -10.65,11.4 -2.55,1.01 -4.42,-2.29 0.41,-4.09 2.47,-3.64 14.74,-18.75 8.89,-11.62 5.74,-6.71 -0.04,-0.97 h -0.34 l -39.15,25.42 -6.97,0.9 -3,-2.81 0.37,-4.61 1.42,-1.5 11.77,-8.1 -0.04,0.04 z';
const LOGO_TX = -75.96, LOGO_TY = -223.53; // SVG <g> translate transform
const LOGO_VB = { x: -2, y: -2, w: 168, h: 152 }; // SVG viewBox

// Parse the SVG path into a polygon (cached once)
let logoPoly = null;
function getLogoPoly() {
  if (logoPoly) return logoPoly;
  const pts = [];
  let cx = 0, cy = 0, lastCmd = '';
  // Tokenize into command letters and numbers
  const tokens = [];
  const re = /([a-zA-Z])|(-?\d*\.?\d+)/g;
  let m;
  while ((m = re.exec(LOGO_PATH))) {
    tokens.push(m[1] ? m[1] : parseFloat(m[2]));
  }
  let ti = 0;
  const num = () => tokens[ti++];
  while (ti < tokens.length) {
    const cmd = typeof tokens[ti] === 'string' ? tokens[ti++] : lastCmd;
    switch (cmd) {
      case 'm':
        cx += num(); cy += num();
        pts.push({ x: cx + LOGO_TX, y: cy + LOGO_TY });
        lastCmd = 'l';
        break;
      case 'l':
        cx += num(); cy += num();
        pts.push({ x: cx + LOGO_TX, y: cy + LOGO_TY });
        lastCmd = 'l';
        break;
      case 'h':
        cx += num();
        pts.push({ x: cx + LOGO_TX, y: cy + LOGO_TY });
        lastCmd = 'h';
        break;
      case 'v':
        cy += num();
        pts.push({ x: cx + LOGO_TX, y: cy + LOGO_TY });
        lastCmd = 'v';
        break;
      case 'c': {
        const x0 = cx, y0 = cy;
        const dx1 = num(), dy1 = num(), dx2 = num(), dy2 = num(), dx = num(), dy = num();
        const x1 = x0 + dx1, y1 = y0 + dy1;
        const x2 = x0 + dx2, y2 = y0 + dy2;
        const x3 = x0 + dx, y3 = y0 + dy;
        for (let t = 0.25; t <= 1; t += 0.25) {
          const u = 1 - t;
          pts.push({
            x: u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3 + LOGO_TX,
            y: u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3 + LOGO_TY,
          });
        }
        cx = x3; cy = y3;
        lastCmd = 'c';
        break;
      }
      case 'z': case 'Z':
        lastCmd = '';
        break;
      default: ti++;
    }
  }
  logoPoly = pts;
  return pts;
}

function pointInPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const yi = poly[i].y, yj = poly[j].y;
    if ((yi > py) !== (yj > py)) {
      const xi = poly[i].x + (py - yi) / (yj - yi) * (poly[j].x - poly[i].x);
      if (px < xi) inside = !inside;
    }
  }
  return inside;
}

function createTrayIcon(statusHex) {
  const S = 44; // 22pt @2x
  const buf = Buffer.alloc(S * S * 4);

  // Asterisk color adapts to menu bar: white on dark, dark on light
  const dark = nativeTheme.shouldUseDarkColors;
  const lr = dark ? 255 : 30, lg = dark ? 255 : 30, lb = dark ? 255 : 30;

  // Scale logo polygon to fill most of the icon, dot overlaps bottom-right corner
  const raw = getLogoPoly();
  const area = 38;
  const sc = Math.min(area / LOGO_VB.w, area / LOGO_VB.h);
  const ox = (S - LOGO_VB.w * sc) / 2;
  const oy = (S - LOGO_VB.h * sc) / 2;
  const scaled = raw.map(p => ({
    x: (p.x - LOGO_VB.x) * sc + ox,
    y: (p.y - LOGO_VB.y) * sc + oy,
  }));

  // Rasterise logo with 4×4 sub-pixel anti-aliasing
  for (let py = 0; py < S; py++) {
    for (let px = 0; px < S; px++) {
      let hits = 0;
      for (let sy = 0; sy < 4; sy++) {
        for (let sx = 0; sx < 4; sx++) {
          if (pointInPoly(px + (sx + 0.5) / 4, py + (sy + 0.5) / 4, scaled)) hits++;
        }
      }
      if (hits > 0) {
        const i = (py * S + px) * 4;
        buf[i] = lr; buf[i + 1] = lg; buf[i + 2] = lb;
        buf[i + 3] = Math.round((hits / 16) * 255);
      }
    }
  }

  // Knock out a circular area behind the status dot
  const dotCx = 37, dotCy = 37, dotR = 4.5, clearR = dotR + 1.5;
  for (let py = Math.floor(dotCy - clearR - 1); py <= Math.ceil(dotCy + clearR + 1); py++) {
    for (let px = Math.floor(dotCx - clearR - 1); px <= Math.ceil(dotCx + clearR + 1); px++) {
      if (px < 0 || px >= S || py < 0 || py >= S) continue;
      const d = Math.sqrt((px - dotCx) ** 2 + (py - dotCy) ** 2);
      if (d >= clearR) continue;
      const i = (py * S + px) * 4;
      const keep = d > clearR - 0.7 ? (d - (clearR - 0.7)) / 0.7 : 0;
      buf[i + 3] = Math.round(buf[i + 3] * Math.min(1, keep));
    }
  }

  // Draw status dot
  const sr = parseInt(statusHex.slice(1, 3), 16);
  const sg = parseInt(statusHex.slice(3, 5), 16);
  const sb = parseInt(statusHex.slice(5, 7), 16);
  for (let py = Math.floor(dotCy - dotR - 1); py <= Math.ceil(dotCy + dotR + 1); py++) {
    for (let px = Math.floor(dotCx - dotR - 1); px <= Math.ceil(dotCx + dotR + 1); px++) {
      if (px < 0 || px >= S || py < 0 || py >= S) continue;
      const d = Math.sqrt((px - dotCx) ** 2 + (py - dotCy) ** 2);
      if (d > dotR + 0.7) continue;
      const a = d > dotR ? Math.max(0, 1 - (d - dotR) / 0.7) : 1;
      const i = (py * S + px) * 4;
      buf[i] = sr; buf[i + 1] = sg; buf[i + 2] = sb;
      buf[i + 3] = Math.round(a * 255);
    }
  }

  const img = nativeImage.createEmpty();
  img.addRepresentation({ scaleFactor: 2.0, width: S, height: S, buffer: buf });
  return img;
}

let lastTrayColor = null;
function updateTrayIcon(force = false) {
  if (!tray || tray.isDestroyed()) return;
  const color = INDICATOR_COLOR_MAP[lastIndicator] || TRAY_COLOR_UNKNOWN;
  if (!force && color === lastTrayColor) return;
  lastTrayColor = color;
  tray.setImage(createTrayIcon(color));
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

function validatePosition(pos, height = COLLAPSED_HEIGHT) {
  if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') return null;
  const bounds = { x: pos.x, y: pos.y, width: WIDGET_WIDTH, height };
  const display = screen.getDisplayMatching(bounds);
  const wa = display.workArea;
  if (pos.x >= wa.x && pos.y >= wa.y &&
      pos.x + WIDGET_WIDTH <= wa.x + wa.width &&
      pos.y + height <= wa.y + wa.height) {
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

    updateTrayIcon();

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('status-update', { data, error: null });
    }
  } catch (err) {
    lastIndicator = null;
    updateTrayIcon();

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('status-update', { data: null, error: err.message });
    }
  }
}

// ── Window ───────────────────────────────────────────────────────────────────
function createWindow() {
  const prefs = loadPrefs();
  const pos = validatePosition(prefs.position) || getDefaultPosition();
  const VALID_THEMES = ['dark', 'light', 'system'];
  currentThemeMode = VALID_THEMES.includes(prefs.theme) ? prefs.theme : 'system';

  mainWindow = new BrowserWindow({
    width: WIDGET_WIDTH,
    height: COLLAPSED_HEIGHT,
    x: pos.x,
    y: pos.y,
    show: !prefs.minimized,
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

  // ── Minimize to tray on close (Cmd+W) instead of quitting ────────────────
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
      const p = loadPrefs(); p.minimized = true; savePrefs(p);
    }
  });

  // Initial fetch + start polling
  pollAndNotify();
  pollTimer = setInterval(pollAndNotify, POLL_MS);
}

app.whenReady().then(() => {
  createWindow();

  // ── Tray ──────────────────────────────────────────────────────────────────
  tray = new Tray(createTrayIcon(TRAY_COLOR_UNKNOWN));
  tray.setToolTip('Claude Status');

  // Toggle widget visibility on tray click
  tray.on('click', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const p = loadPrefs();
    if (mainWindow.isVisible()) {
      mainWindow.hide();
      p.minimized = true;
    } else {
      mainWindow.show();
      p.minimized = false;
    }
    savePrefs(p);
  });

  // Right-click context menu
  tray.on('right-click', () => {
    const visible = mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible();
    const menu = Menu.buildFromTemplate([
      {
        label: visible ? 'Hide Widget' : 'Show Widget',
        click: () => {
          if (!mainWindow || mainWindow.isDestroyed()) return;
          const p = loadPrefs();
          if (visible) { mainWindow.hide(); p.minimized = true; }
          else { mainWindow.show(); p.minimized = false; }
          savePrefs(p);
        },
      },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ]);
    tray.popUpContextMenu(menu);
  });

  // Revalidate position when displays change
  const revalidatePosition = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const b = mainWindow.getBounds();
    if (!validatePosition({ x: b.x, y: b.y }, b.height)) {
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

app.on('before-quit', () => {
  isQuitting = true;
  clearInterval(pollTimer);
  if (tray && !tray.isDestroyed()) tray.destroy();
});

app.on('window-all-closed', () => {
  // With tray support, the app stays alive on macOS even when all windows are hidden.
  // On other platforms, quit normally.
  if (process.platform !== 'darwin') {
    clearInterval(pollTimer);
    app.quit();
  }
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
  // Re-render tray icon so asterisk color adapts to menu bar appearance
  updateTrayIcon(true);
});

// ── IPC ──────────────────────────────────────────────────────────────────────
ipcMain.on('toggle-expand', (_, expanded) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const b = mainWindow.getBounds();
  const newH = expanded ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT;
  let newY = b.y;
  if (expanded) {
    // Cache collapsed Y so we can restore it on collapse
    preExpandY = b.y;
    // Clamp within work area vertically
    const display = screen.getDisplayMatching(b);
    const wa = display.workArea;
    newY = Math.max(wa.y, Math.min(b.y, wa.y + wa.height - newH));
  } else {
    // Collapsing: restore to saved position, pre-expand position, or default
    const prefs = loadPrefs();
    const saved = validatePosition(prefs.position);
    newY = saved ? saved.y : (preExpandY ?? getDefaultPosition().y);
    preExpandY = null;
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
  const currentHeight = mainWindow.getBounds().height;
  let y = def.y;
  // If expanded, shift up so the panel doesn't overflow the work area
  if (currentHeight > COLLAPSED_HEIGHT) {
    const display = screen.getDisplayMatching(mainWindow.getBounds());
    const waBottom = display.workArea.y + display.workArea.height;
    if (def.y + currentHeight > waBottom) {
      y = waBottom - currentHeight;
    }
  }
  mainWindow.setBounds(
    { x: def.x, y, width: WIDGET_WIDTH, height: currentHeight },
    true
  );
});

ipcMain.on('quit', () => app.quit());

ipcMain.on('minimize-to-tray', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.hide();
    const p = loadPrefs(); p.minimized = true; savePrefs(p);
  }
});
