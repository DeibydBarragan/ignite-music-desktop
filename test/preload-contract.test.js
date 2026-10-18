'use strict';

const { test, describe, mock } = require('node:test');
const assert = require('node:assert/strict');

describe('Fase 1: Electron Scaffolding & IPC Contract Tests', () => {
    test('preload script exposes only whitelisted methods on igniteLauncher', () => {
        let exposedName = null;
        let exposedApi = null;

        // Mock electron module before requiring preload
        const mockContextBridge = {
            exposeInMainWorld: (name, api) => {
                exposedName = name;
                exposedApi = api;
            },
        };

        const mockIpcRenderer = {
            invoke: mock.fn(async () => 'mock-response'),
            send: mock.fn(),
            on: mock.fn(),
            removeListener: mock.fn(),
        };

        // Inject mocks into require cache
        const electronMock = {
            contextBridge: mockContextBridge,
            ipcRenderer: mockIpcRenderer,
        };

        require.cache[require.resolve('electron')] = {
            exports: electronMock,
        };

        // Load preload script
        require('../src/preload/index');

        assert.equal(exposedName, 'igniteLauncher');
        assert.ok(exposedApi, 'API object should be exposed');

        // Check required methods
        assert.equal(typeof exposedApi.ping, 'function');
        assert.equal(typeof exposedApi.getAppInfo, 'function');
        assert.equal(typeof exposedApi.getStatus, 'function');
        assert.equal(typeof exposedApi.startService, 'function');
        assert.equal(typeof exposedApi.stopService, 'function');
        assert.equal(typeof exposedApi.restartService, 'function');
        assert.equal(typeof exposedApi.clearLogs, 'function');
        assert.equal(typeof exposedApi.getTunnelStatus, 'function');
        assert.equal(typeof exposedApi.getTunnelUrl, 'function');
        assert.equal(typeof exposedApi.startTunnel, 'function');
        assert.equal(typeof exposedApi.stopTunnel, 'function');
        assert.equal(typeof exposedApi.getConfig, 'function');
        assert.equal(typeof exposedApi.saveConfig, 'function');
        assert.equal(typeof exposedApi.generateApiSecret, 'function');
        assert.equal(typeof exposedApi.importConfigFile, 'function');
        assert.equal(typeof exposedApi.selectCookiesFile, 'function');
        assert.equal(typeof exposedApi.saveCookiesFile, 'function');
        assert.equal(typeof exposedApi.removeCookiesFile, 'function');
        assert.equal(typeof exposedApi.getCookiesStatus, 'function');
        assert.equal(typeof exposedApi.parseConfigContent, 'function');
        assert.equal(typeof exposedApi.loginWithDiscord, 'function');
        assert.equal(typeof exposedApi.logout, 'function');
        assert.equal(typeof exposedApi.getCurrentUser, 'function');
        assert.equal(typeof exposedApi.checkMembership, 'function');
        assert.equal(typeof exposedApi.getMembershipStatus, 'function');
        assert.equal(typeof exposedApi.minimizeWindow, 'function');
        assert.equal(typeof exposedApi.maximizeWindow, 'function');
        assert.equal(typeof exposedApi.closeWindow, 'function');
        assert.equal(typeof exposedApi.confirmExit, 'function');
        assert.equal(typeof exposedApi.minimizeToTray, 'function');
        assert.equal(typeof exposedApi.onCloseRequested, 'function');
        assert.equal(typeof exposedApi.onStatusChange, 'function');
        assert.equal(typeof exposedApi.onLogEntry, 'function');
        assert.equal(typeof exposedApi.onLogsCleared, 'function');
        assert.equal(typeof exposedApi.onTunnelStatus, 'function');
        assert.equal(typeof exposedApi.onTunnelUrl, 'function');
        assert.equal(typeof exposedApi.onTunnelUrlChange, 'function');
        assert.equal(typeof exposedApi.checkForUpdates, 'function');
        assert.equal(typeof exposedApi.applyUpdate, 'function');
        assert.equal(typeof exposedApi.rollbackUpdate, 'function');
        assert.equal(typeof exposedApi.updateAudioExtractors, 'function');
        assert.equal(typeof exposedApi.onUpdaterStatus, 'function');
        assert.equal(typeof exposedApi.onUpdateProgress, 'function');

        // Verify that dangerous Node APIs are NOT on the exposed object
        assert.equal(exposedApi.require, undefined);
        assert.equal(exposedApi.process, undefined);
        assert.equal(exposedApi.ipcRenderer, undefined);
    });

    test('main IPC handlers register expected channels and ping returns pong', async () => {
        const registeredHandlers = new Map();
        const registeredListeners = new Map();

        const mockIpcMain = {
            handle: (channel, fn) => {
                registeredHandlers.set(channel, fn);
            },
            on: (channel, fn) => {
                registeredListeners.set(channel, fn);
            },
        };

        const mockApp = {
            getName: () => 'ignite-music-desktop',
            getVersion: () => '1.0.0',
            getPath: () => require('node:os').tmpdir(),
        };

        const mockSafeStorage = {
            isEncryptionAvailable: () => false,
        };

        const mockDialog = {
            showOpenDialog: mock.fn(async () => ({ canceled: true })),
        };

        const mockShell = {
            openExternal: mock.fn(),
        };

        require.cache[require.resolve('electron')] = {
            exports: {
                ipcMain: mockIpcMain,
                app: mockApp,
                safeStorage: mockSafeStorage,
                dialog: mockDialog,
                shell: mockShell,
            },
        };

        const { registerIpcHandlers, isServiceActive } = require('../src/main/ipc-handlers');
        const mockWindow = {
            isDestroyed: () => false,
            minimize: mock.fn(),
            maximize: mock.fn(),
            unmaximize: mock.fn(),
            isMaximized: () => false,
            close: mock.fn(),
            hide: mock.fn(),
            destroy: mock.fn(),
        };


        registerIpcHandlers(mockWindow);

        // Verify registered handle channels
        assert.ok(registeredHandlers.has('app:ping'));
        assert.ok(registeredHandlers.has('app:get-info'));
        assert.ok(registeredHandlers.has('service:get-status'));
        assert.ok(registeredHandlers.has('service:clear-logs'));
        assert.ok(registeredHandlers.has('updater:check'));
        assert.ok(registeredHandlers.has('updater:apply'));
        assert.ok(registeredHandlers.has('updater:rollback'));
        assert.ok(registeredHandlers.has('updater:update-extractors'));
        assert.ok(registeredHandlers.has('config:import-file'));
        assert.ok(registeredHandlers.has('config:select-cookies-file'));
        assert.ok(registeredHandlers.has('config:save-cookies-file'));
        assert.ok(registeredHandlers.has('config:remove-cookies-file'));
        assert.ok(registeredHandlers.has('config:get-cookies-status'));
        assert.ok(registeredHandlers.has('config:parse-content'));

        // Verify ping response
        const pingFn = registeredHandlers.get('app:ping');
        const pong = await pingFn();
        assert.equal(pong, 'pong');

        // Verify app:get-info response
        const infoFn = registeredHandlers.get('app:get-info');
        const info = await infoFn();
        assert.equal(info.name, 'ignite-music-desktop');
        assert.equal(info.version, '1.0.0');

        // Verify window controls
        assert.ok(registeredListeners.has('window:minimize'));
        assert.ok(registeredListeners.has('window:maximize'));
        assert.ok(registeredListeners.has('window:close'));
        assert.ok(registeredHandlers.has('window:confirm-close'));
        assert.ok(registeredListeners.has('window:minimize-to-tray'));

        registeredListeners.get('window:minimize')();
        assert.equal(mockWindow.minimize.mock.callCount(), 1);

        registeredListeners.get('window:maximize')();
        assert.equal(mockWindow.maximize.mock.callCount(), 1);

        registeredListeners.get('window:close')();
        assert.equal(mockWindow.close.mock.callCount(), 1);

        registeredListeners.get('window:minimize-to-tray')();
        assert.equal(mockWindow.hide.mock.callCount(), 1);

        // Service is initially stopped in this test suite
        assert.equal(isServiceActive(), false);
    });
});


