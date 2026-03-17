# Claude Status Widget

A floating macOS desktop widget that monitors [status.claude.com](https://status.claude.com) in real time.

## Features

- **Floating overlay** pinned to bottom-right corner, always on top
- **Collapsed pill** shows overall status at a glance
- **Expanded panel** shows per-component status + active incidents
- **Native macOS notifications** when status changes
- **Auto-polls** every 60 seconds; manual refresh available
- **Draggable** — drag either the pill or panel header to reposition

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
