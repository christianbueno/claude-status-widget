'use strict';

// ── Constants ──────────────────────────────────────────────────────────────
const STATUS_PAGE_URL = 'https://status.claude.com';

const INDICATOR_MAP = {
  none:        { cls: 'operational' },
  minor:       { cls: 'degraded' },
  major:       { cls: 'partial' },
  critical:    { cls: 'critical' },
  maintenance: { cls: 'maintenance' },
};

const COMP_STATUS_MAP = {
  operational:         { badge: 'Operational',    bCls: 'badge-operational' },
  degraded_performance:{ badge: 'Degraded',       bCls: 'badge-degraded' },
  partial_outage:      { badge: 'Partial Outage', bCls: 'badge-partial' },
  major_outage:        { badge: 'Major Outage',   bCls: 'badge-critical' },
  under_maintenance:   { badge: 'Maintenance',    bCls: 'badge-maintenance' },
};

// ── DOM Refs ───────────────────────────────────────────────────────────────
const pill         = document.getElementById('pill');
const panel        = document.getElementById('panel');
const pillDot      = document.getElementById('pill-dot');
const pillText     = document.getElementById('pill-text');
const panelDot     = document.getElementById('panel-dot');
const panelDesc    = document.getElementById('panel-desc');
const componentsEl = document.getElementById('components');
const incidentsEl  = document.getElementById('incidents');
const incidentsSec = document.getElementById('incidents-section');
const updatedAt    = document.getElementById('updated-at');
const btnToggle    = document.getElementById('btn-toggle');
const btnRefresh   = document.getElementById('btn-refresh');
const btnRefreshPanel = document.getElementById('btn-refresh-panel');
const btnClose     = document.getElementById('btn-close');
const btnExt       = document.getElementById('btn-ext');
const btnQuit      = document.getElementById('btn-quit');
const btnMinimize  = document.getElementById('btn-minimize');
const btnMinPill   = document.getElementById('btn-minimize-pill');
const pillIcon     = document.getElementById('pill-icon');
const btnSettings  = document.getElementById('btn-settings');
const settingsEl   = document.getElementById('settings');
const themeToggle  = document.getElementById('theme-toggle');
const btnResetPos  = document.getElementById('btn-reset-pos');

// ── State ──────────────────────────────────────────────────────────────────
let expanded = false;
let settingsOpen = false;

// ── Helpers ────────────────────────────────────────────────────────────────
function esc(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

function relTime(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return 'upcoming';
  const m = Math.floor(diff / 60_000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function setDot(el, cls, pulse = false) {
  el.className = `dot ${cls}`;
  if (pulse) el.classList.add('pulse');
}

// ── Expand / Collapse ──────────────────────────────────────────────────────
function setExpanded(state) {
  expanded = state;
  if (expanded) {
    pill.classList.add('hidden');
    panel.classList.remove('hidden');
    btnToggle.classList.add('open');
  } else {
    pill.classList.remove('hidden');
    panel.classList.add('hidden');
    btnToggle.classList.remove('open');
  }
  window.widget?.toggleExpand(expanded);
}

btnToggle.addEventListener('click', () => setExpanded(!expanded));
btnClose.addEventListener('click',  () => setExpanded(false));
pillIcon.addEventListener('click',  () => setExpanded(true));
btnExt.addEventListener('click',    () => window.widget?.openExternal(STATUS_PAGE_URL));
btnQuit.addEventListener('click',   () => window.widget?.quit());
btnMinimize.addEventListener('click', () => window.widget?.minimizeToTray());
btnMinPill.addEventListener('click',  () => window.widget?.minimizeToTray());

btnRefresh.addEventListener('click', () => {
  btnRefresh.classList.add('spinning');
  window.widget?.refresh();
  // spinner stops when status-update fires
});

btnRefreshPanel.addEventListener('click', () => {
  btnRefreshPanel.classList.add('spinning');
  window.widget?.refresh();
  // spinner stops when status-update fires
});

// ── Render ─────────────────────────────────────────────────────────────────
function render({ data, error }) {
  btnRefresh.classList.remove('spinning');
  btnRefreshPanel.classList.remove('spinning');

  if (error || !data) {
    const msg = error || 'Unknown error';
    pillDot.className = 'dot critical';
    pillText.textContent = 'Status unavailable';
    panelDesc.textContent = msg;
    setDot(panelDot, 'critical', false);
    componentsEl.innerHTML = `
      <div class="error-state">
        <div class="error-icon">⚠️</div>
        <div>Could not reach status.claude.com<br><small>${esc(msg)}</small></div>
      </div>`;
    incidentsSec.classList.add('hidden');
    return;
  }

  // ── Overall status ──────────────────────────────────────────────────────
  const indicator = data.status?.indicator ?? 'none';
  const desc      = data.status?.description ?? 'Unknown';
  const info      = INDICATOR_MAP[indicator] ?? INDICATOR_MAP.none;
  const notOk     = indicator !== 'none';

  setDot(pillDot, info.cls, notOk);
  pillText.textContent = desc;

  setDot(panelDot, info.cls, notOk);
  panelDesc.textContent = desc;

  // ── Components ──────────────────────────────────────────────────────────
  const components = (data.components ?? []).filter(c => {
    if (c.group) return false;                         // skip group headers
    if (c.only_show_if_degraded && c.status === 'operational') return false;
    return true;
  });

  componentsEl.innerHTML = components.map(c => {
    const s = COMP_STATUS_MAP[c.status] ?? { badge: c.status, bCls: 'badge-unknown' };
    return `
      <div class="comp-row">
        <span class="comp-name">${esc(c.name)}</span>
        <span class="comp-badge ${s.bCls}">${s.badge}</span>
      </div>`;
  }).join('');

  // ── Incidents ───────────────────────────────────────────────────────────
  const activeIncidents = (data.incidents ?? []).filter(i => i.status !== 'resolved');
  const maintenances    = (data.scheduled_maintenances ?? []).filter(m => m.status === 'in_progress');
  const allEvents       = [...activeIncidents, ...maintenances];

  if (allEvents.length > 0) {
    incidentsSec.classList.remove('hidden');
    incidentsEl.innerHTML = allEvents.map(evt => {
      const isMaint = evt.scheduled_for !== undefined;
      const latestUpdate = evt.incident_updates?.[0];
      const statusText = evt.status?.replace(/_/g, ' ') ?? '';
      return `
        <div class="incident-card ${isMaint ? 'maintenance' : ''}">
          <div class="incident-title">${esc(evt.name)}</div>
          ${latestUpdate
            ? `<div class="incident-body">${esc(latestUpdate.body)}</div>`
            : ''}
          <div class="incident-meta">
            <span class="incident-status">${esc(statusText)}</span>
            <span>${relTime(evt.created_at)}</span>
          </div>
        </div>`;
    }).join('');
  } else {
    incidentsSec.classList.add('hidden');
  }

  // ── Timestamp ───────────────────────────────────────────────────────────
  const now = new Date();
  updatedAt.textContent = `Updated ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

// ── Settings ──────────────────────────────────────────────────────────────
btnSettings.addEventListener('click', () => {
  settingsOpen = !settingsOpen;
  settingsEl.classList.toggle('hidden', !settingsOpen);
  btnSettings.classList.toggle('settings-active', settingsOpen);
});

themeToggle.addEventListener('click', (e) => {
  const btn = e.target.closest('.seg-btn');
  if (!btn) return;
  const mode = btn.dataset.theme;
  window.widget?.setTheme(mode);
});

btnResetPos.addEventListener('click', () => {
  window.widget?.resetPosition();
});

// ── Theme ─────────────────────────────────────────────────────────────────
function applyTheme({ mode, resolved }) {
  if (resolved === 'light') {
    document.documentElement.classList.add('light');
  } else {
    document.documentElement.classList.remove('light');
  }
  // Update segmented control active state
  themeToggle.querySelectorAll('.seg-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === mode);
  });
}

// ── Wire up main-process updates ───────────────────────────────────────────
window.widget?.onStatusUpdate(render);
window.widget?.onThemeUpdate(applyTheme);
