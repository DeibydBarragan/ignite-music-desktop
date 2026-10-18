# ignite-music-desktop — Agent & Contributor Guide

Desktop companion launcher, graphical supervisor, and zero-configuration orchestrator for **Ignite Music** (Discord bot). Built on **Electron 33**, featuring an isolated sandbox with `contextBridge`, bundled portable **Node.js 22 LTS**, embedded **Cloudflare Tunnel**, system tray management, Discord OAuth2 loopback authentication, credentials encryption at rest (`safeStorage`), OTA updates, and an in-house glassmorphic UI.

---

## 1. Fast Verification & Gates (Mandatory)

Always run and verify all gates before considering any task complete:

```powershell
npm test            # Run all 47 automated tests via native node:test
npm start           # Launch Electron in development mode (F12 DevTools, F5 reload)
npm run dist:win    # Compile production Windows installer (.exe) to dist/
```

- **Run specific test suite:** `node --test test/config-parser.test.js`
- **Single test execution:** `node --test "test/**/*.test.js"`
- **Prebuild check:** `npm run prebuild` (verifies portable Node.js and packages service snapshot)

---

## 2. Directory Architecture

```text
ignite-music-desktop/
├── src/
│   ├── main/                         # Electron Main Process (Node.js runtime)
│   │   ├── index.js                  # App lifecycle, single-instance lock, window instantiation, exit interceptor
│   │   ├── ipc-handlers.js           # Central IPC registry, service supervisor, window controls, stopAllServices
│   │   ├── config-manager.js         # Config persistence, safeStorage AES-256 encryption, cookies lifecycle
│   │   ├── config-parser.js          # .env & .json parser, credential normalizer, Netscape cookies guard
│   │   ├── config-schema.js          # Default schema definition (minimizeToTray: false, default ports)
│   │   ├── process-supervisor.js     # Child process manager, stdout/stderr streams, daily rotating logs, crash loops
│   │   ├── tunnel-supervisor.js      # Cloudflare tunnel manager, regex URL extraction, auto-reconnect
│   │   ├── supabase-announcer.js     # Public tunnel URL sync & heartbeat to Supabase app_settings
│   │   ├── auth-manager.js           # Local HTTP loopback server (port 53134) for Discord OAuth2 token exchange
│   │   ├── gatekeeper.js             # Discord API guild membership verification for login gating
│   │   ├── tray-manager.js           # Windows system tray icon, context menu, minimize & restore
│   │   └── updater-engine.js         # OTA GitHub releases updater, backup/rollback engine, yt-dlp downloader
│   ├── preload/                      # Security Boundary (Context Isolation)
│   │   └── index.js                  # contextBridge exposing only whitelisted methods on window.igniteLauncher
│   └── renderer/                     # Presentation Layer (Pure Web Standard ES Modules)
│       ├── index.html                # Main UI markup, GlassModal dialogs, toast container
│       ├── css/
│       │   ├── app.css               # Ignite Dark Glassmorphic Design System, variables, buttons, badges
│       │   └── fonts.css             # Offline local @font-face rules (unrestricted unicode ranges)
│       ├── fonts/                    # Local Plus Jakarta Sans & JetBrains Mono (.woff2)
│       └── js/
│           ├── app.js                # UI coordinator, access evaluation, dual ready sequence
│           ├── auth-view.js          # Login, Discord user card, guild access denial view
│           ├── service-controls.js   # Start, stop, restart bot buttons, status badges
│           ├── tunnel-card.js        # Cloudflare tunnel card, public URL copy, quick open
│           ├── log-viewer.js         # Streaming console log viewer with autoscroll & copy
│           ├── settings-modal.js     # Credentials settings, API secret generator, maintenance
│           ├── onboarding-modal.js   # First-run wizard, drag & drop config and cookies importer
│           ├── exit-modal.js         # Exit confirmation dialog when bot service is active
│           ├── toast.js              # In-app bottom-right floating glass toast notifications
│           └── icons.js              # Pure inline Lucide-style SVG icon helpers (zero npm dependencies)
├── scripts/                          # Build & Packaging Utilities
│   ├── ensure-node.js                # Downloads and verifies portable Node 22 for packaged app
│   ├── bundle-service.js             # Pre-packages bot snapshot into resources/service/bundled/
│   └── generate-icon.js              # Generates application icons (.ico, .png, .svg)
├── test/                             # Native Unit Tests (node:test + node:assert/strict)
│   ├── preload-contract.test.js      # Whitelist contract integrity of window.igniteLauncher
│   ├── config-manager.test.js        # Encryption, decryption, fallback integrity, cookies management
│   ├── config-parser.test.js         # Config parsing, alias resolution, Netscape cookie rejection
│   ├── process-supervisor.test.js    # Process spawning, logging, crash loop detection & rollback
│   ├── tunnel-supervisor.test.js     # Regex URL detection, binary discovery, status transitions
│   ├── auth-gatekeeper.test.js       # Discord API OAuth2 and guild membership gating mocks
│   └── updater-engine.test.js        # Semver comparison, mock releases, backup and rollback
└── electron-builder.yml              # NSIS installer configuration & extraResources definition
```

---

## 3. Strict Security & Architectural Directives

1. **Zero Secret Leakage:**
   - **Never commit `.env*`, `.data/`, `cookies.txt`, or real Discord bot tokens.**
   - All tests must use dummy placeholders (e.g., `MTAyOTM4NDc1NjQ3MzgxOTI4Mw...`).
   - `.gitignore` strictly protects `.data/`, `ignite-config.*`, `.env*`, and `resources/service/bundled/`.

2. **Isolated Renderer & IPC Whitelist:**
   - Context isolation (`contextIsolation: true`) and sandbox (`sandbox: true`) are mandatory.
   - `nodeIntegration` must remain `false`.
   - Never expose `ipcRenderer`, `require`, `process`, or Node.js primitives directly to the window.
   - All renderer-to-main communication goes strictly through `window.igniteLauncher` via `contextBridge`.

3. **Credential Encryption at Rest:**
   - Sensitive keys (`discordToken`, `clientSecret`, `apiSecret`) must be encrypted on disk using `safeStorage` (Windows DPAPI) with an AES-256 fallback (`enc:...`).
   - Plaintext credentials must never be written into unencrypted JSON config files.

4. **Independent Cookies Lifecycle:**
   - YouTube `cookies.txt` must remain completely separate from credentials configuration.
   - The config parser must **reject Netscape cookies files** if provided in the configuration dropzone and vice versa.

5. **Graceful Teardown & Zombie Prevention:**
   - When the app quits or exits, `stopAllServices()` must terminate both the bot process and `cloudflared.exe`.
   - The window interceptor prompts confirmation (`confirmExitModal`) when the bot is active to prevent accidental shutdown.

6. **Offline-First Assets:**
   - No external CDN links (`cdnjs`, `fonts.googleapis.com`, etc.).
   - All fonts (`Plus Jakarta Sans` and `JetBrains Mono`) and SVG icons must be self-contained locally.

7. **Language Consistency:**
   - All user-facing copy, labels, tooltips, modals, toasts, and error messages must be in **Spanish**.

---

## 4. Testing Conventions

- Tests rely exclusively on Node.js native testing: `const { test, describe } = require('node:test')`.
- Assertions use `const assert = require('node:assert/strict')`.
- Tests must execute completely offline with zero network or external hardware dependencies.
