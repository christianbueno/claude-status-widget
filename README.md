# Claude Status Widget

A lightweight, always-on-top macOS desktop widget that monitors [status.claude.com](https://status.claude.com) in real time. Built with Electron and vanilla JavaScript with zero runtime dependencies.

Know instantly when Claude is experiencing issues — without keeping a browser tab open or manually checking the status page. The widget lives in the corner of your screen as a small pill, expanding on click to show full component-level status and active incidents.

## Features

- **Floating overlay** pinned to bottom-right corner, always on top
- **Collapsed pill** shows overall status at a glance
- **Expanded panel** shows per-component status + active incidents
- **Native macOS notifications** when status changes (e.g., operational to degraded)
- **Auto-polls** every 60 seconds; manual refresh available
- **Draggable** — drag either the pill or panel header to reposition
- **Glassmorphic UI** — translucent, dark-themed design that blends with your desktop

## How It Works

The widget polls the public [Atlassian Statuspage API](https://status.claude.com/api/v2/summary.json) from the main Electron process using Node's `https` module (no CORS issues). Status data is sent to the renderer via IPC, where it's rendered into the UI. When the overall status indicator changes between polls, a native macOS notification is fired.

The app uses Electron's security best practices: context isolation is enabled, Node integration is disabled in the renderer, the preload script exposes a minimal bridge, and a strict Content Security Policy is enforced.

## Setup

### Prerequisites

- **Node.js** v18+ (`node -v` to check)
- **npm** or **yarn**

### Install & Run

```bash
cd claude-status-widget
npm install
npm start
```

The widget will appear in the **bottom-right corner** of your primary display.

### Build a standalone .app (optional)

```bash
npm run build
```

This produces a distributable `.dmg` in the `dist/` folder via `electron-builder`.

## Usage

| Action | Result |
|---|---|
| Click the pill | Expand full panel |
| Click `‹` in panel header | Collapse back to pill |
| Click `↗` in panel header | Open status.claude.com in browser |
| Click `↻` | Force refresh |
| Drag pill / panel header | Reposition widget |
| Click `Quit` | Exit the app |

## Project Structure

```
main.js            Electron main process — window creation, API polling, IPC, notifications
preload.js         Context bridge exposing a minimal API to the renderer
renderer/
  index.html       Widget markup (collapsed pill + expanded panel)
  app.js           Renderer logic — state management, DOM rendering
  style.css        Glassmorphic styling, status colors, animations
build/
  icon.icns        macOS app icon
```

## Config

Edit `main.js` to adjust:

```js
const COLLAPSED_HEIGHT = 52;   // px
const EXPANDED_HEIGHT  = 520;  // px
const WIDGET_WIDTH     = 320;  // px
const MARGIN           = 20;   // px from screen edge
const POLL_MS          = 60_000; // poll interval (ms)
```

## Auto-start on login (optional)

In **System Settings → General → Login Items**, add the built `.app`
or use the `app.setLoginItemSettings({ openAtLogin: true })` Electron API.
