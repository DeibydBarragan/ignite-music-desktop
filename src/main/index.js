'use strict';

const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const { createTray } = require('./tray-manager');
const { registerIpcHandlers } = require('./ipc-handlers');

// Prevent multiple instances of the launcher
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
    process.exit(0);
}

let mainWindow = null;
app.isQuitting = false;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 960,
        height: 680,
        minWidth: 840,
        minHeight: 600,
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

    // Gracefully reveal window
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // Intercept close button: minimize to tray instead of quitting
    mainWindow.on('close', (event) => {
        if (!app.isQuitting) {
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

// Platform lifecycle
app.on('before-quit', () => {
    app.isQuitting = true;
});

app.on('window-all-closed', () => {
    // Keep alive in tray on Windows/Linux as well
    if (process.platform === 'darwin') {
        // macOS standard behavior
    }
});
