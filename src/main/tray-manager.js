'use strict';

const { Tray, Menu, nativeImage, app } = require('electron');
const path = require('node:path');

let tray = null;

/**
 * Creates or retrieves a default tray icon.
 * Uses resources/icon.png if present, otherwise creates a 16x16 fallback bitmap.
 *
 * @param {string} resourcesDir
 * @returns {Electron.NativeImage}
 */
function getTrayIcon(resourcesDir) {
    const iconPath = path.join(resourcesDir, 'icon.png');
    try {
        const image = nativeImage.createFromPath(iconPath);
        if (!image.isEmpty()) {
            return image.resize({ width: 16, height: 16 });
        }
    } catch {
        // Fall back to generated icon below
    }

    // Fallback: 16x16 solid orange flame icon in raw RGBA
    const width = 16;
    const height = 16;
    const buffer = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            // Flame diamond shape
            const dx = Math.abs(x - 7.5);
            const dy = Math.abs(y - 8);
            if (dx + dy <= 6) {
                buffer[idx] = 249;     // R (orange-500 #f97316)
                buffer[idx + 1] = 115; // G
                buffer[idx + 2] = 22;  // B
                buffer[idx + 3] = 255; // A
            } else {
                buffer[idx + 3] = 0;   // Transparent
            }
        }
    }
    return nativeImage.createFromBuffer(buffer, { width, height });
}

/**
 * Setup and initialize the system tray.
 *
 * @param {Electron.BrowserWindow} mainWindow
 * @param {string} resourcesDir
 * @returns {Electron.Tray}
 */
function createTray(mainWindow, resourcesDir) {
    if (tray) return tray;

    const icon = getTrayIcon(resourcesDir);
    tray = new Tray(icon);
    tray.setToolTip('Ignite Music Launcher');

    const updateMenu = (statusLabel = 'Detenido') => {
        const contextMenu = Menu.buildFromTemplate([
            {
                label: 'Abrir Ignite Launcher',
                click: () => {
                    if (mainWindow.isMinimized()) mainWindow.restore();
                    mainWindow.show();
                    mainWindow.focus();
                },
            },
            { type: 'separator' },
            {
                label: `Estado: ${statusLabel}`,
                enabled: false,
            },
            { type: 'separator' },
            {
                label: 'Salir',
                click: () => {
                    app.isQuitting = true;
                    app.quit();
                },
            },
        ]);
        tray.setContextMenu(contextMenu);
    };

    updateMenu('Detenido');

    // Click / Double Click behavior on tray icon
    tray.on('click', () => {
        if (mainWindow.isVisible()) {
            mainWindow.hide();
        } else {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
        }
    });

    return tray;
}

module.exports = { createTray };
