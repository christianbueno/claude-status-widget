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

## Running on Linux

macOS is still the primary target (CI/release only build `.dmg`s via the `mac` electron-builder target), but the app runs fine on Linux too. There are two ways to run it: dev mode (`npm start`) or a packaged `.deb`. The `.deb` is the better option if you want it running persistently / on login, since its installer handles the sandbox-permission quirk below automatically.

### Dev mode caveats

- **`chrome-sandbox` permissions.** Electron's SUID sandbox helper ships without the right ownership/permission bits, so a fresh `npm install` + `npm start` fails immediately with a `FATAL` error from `setuid_sandbox_host.cc`. Fix once per machine:
  ```bash
  sudo chown root:root node_modules/electron/dist/chrome-sandbox
  sudo chmod 4755 node_modules/electron/dist/chrome-sandbox
  ```
  (Alternatively, run `electron . --no-sandbox` to skip Chromium's sandbox — fine for local use, not something to ship in a distributed build. Not needed at all for the packaged `.deb` below — its installer sets this up correctly for you.)

- **Widget centers instead of docking to a corner on native Wayland.** Wayland's protocol deliberately gives clients no way to read or set their own absolute screen position (unlike X11), so the bottom-right placement in [main.js](main.js) is silently ignored under a native-Wayland session (e.g. stock GNOME) — the compositor just centers it instead. Drag-to-reposition and position persistence likely inherit the same limitation. The workaround is forcing the XWayland (X11) compatibility path, which does support absolute positioning:
  ```bash
  ELECTRON_OZONE_PLATFORM_HINT=x11 npm start
  ```
  This is a known Electron/Wayland limitation, not something fixable with an app-level flag on native Wayland itself.

- **System tray** works fine on GNOME as long as the "AppIndicator and KStatusNotifierItem Support" extension is enabled (Ubuntu ships it enabled by default; other distros/desktops may need it installed separately).

### Build and install a `.deb`

```bash
npm run build:linux
```

Produces `dist/claude-status-widget_<version>_amd64.deb`. Install it with `apt` (not bare `dpkg -i`, so its dependencies get pulled in automatically):

```bash
sudo apt install ./dist/claude-status-widget_1.1.0_amd64.deb
```

This installs the app to `/opt/Claude Status/`, adds a `claude-status-widget` command to `/usr/bin`, and registers an application-menu launcher at `/usr/share/applications/claude-status-widget.desktop`. The installer's `postinst` script also sets up `chrome-sandbox` correctly for your kernel (SUID or plain, depending on whether unprivileged user namespaces are available) and installs an AppArmor profile on Ubuntu 24+ — no manual sandbox fix needed.

### Auto-start on login

Copy the installed launcher into your XDG autostart directory:

```bash
mkdir -p ~/.config/autostart
cp /usr/share/applications/claude-status-widget.desktop ~/.config/autostart/
```

It'll now launch automatically at every login. To undo, delete the copy in `~/.config/autostart/` (this doesn't affect the app-menu launcher or the install itself).

To uninstall the app entirely:

```bash
sudo apt remove claude-status-widget
```

## Usage

| Action | Result |
|---|---|
| Click the pill | Expand full panel |
| Click `‹` in panel header | Collapse back to pill |
| Click `—` (minimize) on pill or panel | Hide widget to tray |
| Click tray icon | Toggle widget visibility |
| Right-click tray icon | Show/Hide Widget or Quit |
| Click `↗` in panel header | Open status.claude.com in browser |
| Click `⟳` (pill or panel header) | Force refresh |
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
  icon.png         Linux app icon (build:linux target)
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

## Auto-start on login (optional, macOS)

In **System Settings → General → Login Items**, add the built `.app`
or use the `app.setLoginItemSettings({ openAtLogin: true })` Electron API.

(On Linux, see [Auto-start on login](#auto-start-on-login) under "Running on Linux" above.)

## Contributing

This is a personal project — pull requests are not accepted. You're welcome to fork the repo and build on it however you like. Bug reports and feature suggestions via issues are appreciated. See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## License

[MIT](LICENSE)
