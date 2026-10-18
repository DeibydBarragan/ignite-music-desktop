'use strict';

const dns = require('node:dns');

// On Windows, getaddrinfo defaults to querying IPv6 first (AAAA), which throws EAI_FAIL (-3004)
// on networks without IPv6 routes. Enforcing 'ipv4first' guarantees immediate, reliable DNS lookups.
if (typeof dns.setDefaultResultOrder === 'function') {
    dns.setDefaultResultOrder('ipv4first');
}

const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const { createTray } = require('./tray-manager');
const { registerIpcHandlers, stopAllServices } = require('./ipc-handlers');
const { ConfigManager } = require('./config-manager');

const configManager = new ConfigManager();

// Prevent multiple instances of the launcher
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
    process.exit(0);
}

let mainWindow = null;
app.isQuitting = false;
let isShuttingDown = false;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 980,
        height: 750,
        minWidth: 880,
        minHeight: 640,
        backgroundColor: '#0f172a',
        autoHideMenuBar: true,
        show: false, // Show once ready-to-show to prevent white flash
        title: 'Ignite Music Launcher',
        icon: path.join(__dirname, '../../resources/icon.png'),
        webPreferences: {
            preload: path.join(__dirname, '../preload/index.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            spellcheck: false,
        },
    });

    // Register IPC channels
    registerIpcHandlers(mainWindow);

    // Initialize System Tray
    const resourcesDir = path.join(__dirname, '../../resources');
    createTray(mainWindow, resourcesDir);

    // Load UI
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

    // In development mode, enable live reload (F5 / Ctrl+R) and DevTools (F12 / Ctrl+Shift+I)
    if (!app.isPackaged) {
        mainWindow.webContents.on('before-input-event', (event, input) => {
            if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
                mainWindow.webContents.toggleDevTools();
                event.preventDefault();
            }
            if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r')) {
                mainWindow.webContents.reload();
                event.preventDefault();
            }
        });
    }

    // Gracefully reveal window
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        mainWindow.focus();
    });

    // Fallback safety to guarantee window visibility
    setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
            mainWindow.show();
            mainWindow.focus();
        }
    }, 600);

    // Intercept close button: check if minimize to tray is enabled
    mainWindow.on('close', (event) => {
        let shouldMinimize = false;
        try {
            const config = configManager.loadConfig();
            shouldMinimize = config.minimizeToTray === true;
        } catch {
            shouldMinimize = false;
        }

        if (!app.isQuitting && shouldMinimize) {
            event.preventDefault();
            mainWindow.hide();
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// Second instance triggered: restore and focus
app.on('second-instance', () => {
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
    }
});

// App ready
app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        } else if (mainWindow) {
            mainWindow.show();
        }
    });
});

// Platform lifecycle & clean process tree teardown
app.on('before-quit', async (event) => {
    if (isShuttingDown) return;
    app.isQuitting = true;
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.removeAllListeners('close');
    }
    event.preventDefault();
    isShuttingDown = true;
    try {
        await stopAllServices();
    } catch {
        // ignore
    } finally {
        app.quit();
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
