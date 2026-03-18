# Claude Status Widget

A lightweight, always-on-top macOS desktop widget that monitors [status.claude.com](https://status.claude.com) in real time. Built with Electron and vanilla JavaScript with zero runtime dependencies.

Know instantly when Claude is experiencing issues — without keeping a browser tab open or manually checking the status page. The widget lives in the corner of your screen as a small pill, expanding on click to show full component-level status and active incidents.

## Features

- **Floating overlay** — always-on-top widget, pinned to bottom-right by default
- **Collapsed pill** shows overall status at a glance with a color-coded dot
- **Expanded panel** shows per-component status + active incidents
- **System tray icon** — Claude logo with a color-coded status dot in the menu bar
- **Minimize to tray** — close or minimize the widget and it hides to the tray; click the tray icon to toggle visibility
- **Native macOS notifications** when status changes (e.g., operational to degraded)
- **Auto-polls** every 60 seconds; manual refresh available
- **Draggable** — drag either the pill or panel header to reposition; position is persisted across sessions
- **Theme support** — Dark, Light, or System (follows macOS appearance); persisted in preferences
- **Position persistence** — widget remembers its position across restarts, with automatic screen-bounds clamping on display changes
- **Settings panel** — in-app settings for theme switching and position reset
- **Glassmorphic UI** — translucent design that blends with your desktop, with full light/dark theme support
- **Branded header** — Claude asterisk logo in the pill and expanded panel header

## How It Works

The widget polls the public [Atlassian Statuspage API](https://status.claude.com/api/v2/summary.json) from the main Electron process using Node's `https` module (no CORS issues). Status data is sent to the renderer via IPC, where it's rendered into the UI. When the overall status indicator changes between polls, a native macOS notification is fired.

A system tray icon displays the Claude logo with a color-coded status dot (green = operational, yellow = minor, orange = major, red = critical, indigo = maintenance, grey = unknown). The tray provides quick access to show/hide the widget and quit the app.

Preferences (window position, theme, minimized state) are stored as JSON in the Electron `userData` directory and persist across sessions.

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

The widget will appear in the **bottom-right corner** of your primary display, and a status icon will appear in your **menu bar**.

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
| Click `—` (minimize) on pill or panel | Hide widget to tray |
| Click tray icon | Toggle widget visibility |
| Right-click tray icon | Show/Hide Widget or Quit |
| Click `↗` in panel header | Open status.claude.com in browser |
| Click `⟳` | Force refresh |
| Click `⚙` in panel header | Open settings (theme & position) |
| Drag pill / panel header | Reposition widget |
| Click `Quit` | Exit the app |

## Project Structure

```
main.js            Electron main process — window, tray, API polling, IPC, notifications, preferences
preload.js         Context bridge exposing a minimal API to the renderer
renderer/
  index.html       Widget markup (collapsed pill + expanded panel + settings)
  app.js           Renderer logic — state management, DOM rendering, theme handling
  style.css        Glassmorphic styling, status colors, animations, light/dark themes
build/
  icon.icns        macOS app icon
eslint.config.js   ESLint 9 flat config (Node + browser globals)
.github/workflows/
  ci.yml           Lint + build on push/PR
  release.yml      Build DMG + publish GitHub Release on version tags
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

## CI/CD

### Continuous Integration

Every push to `main` and every pull request runs the [CI workflow](.github/workflows/ci.yml):

1. **Lint** — ESLint on `ubuntu-latest`
2. **Build** — `electron-builder --mac` on `macos-latest`, with the `.dmg` uploaded as an artifact (retained 14 days)

### Releasing

The [Release workflow](.github/workflows/release.yml) triggers on version tags:

```bash
# bump version in package.json, commit, then:
git tag v1.1.0
git push origin main --tags
```

This builds the DMG, creates a GitHub Release with auto-generated notes, and attaches the `.dmg` as a downloadable asset.

### Linting

```bash
npm run lint
```

Uses ESLint 9 with separate configurations for the Node/Electron main process and the browser renderer.

## Auto-start on login (optional)

In **System Settings → General → Login Items**, add the built `.app`
or use the `app.setLoginItemSettings({ openAtLogin: true })` Electron API.

## Contributing

This is a personal project — pull requests are not accepted. You're welcome to fork the repo and build on it however you like. Bug reports and feature suggestions via issues are appreciated. See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## License

[MIT](LICENSE)
