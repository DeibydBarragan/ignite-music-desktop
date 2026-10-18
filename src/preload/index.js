'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/**
 * Valid IPC channels whitelist to prevent arbitrary event emission.
 */
const ALLOWED_SEND_CHANNELS = new Set([
    'window:minimize',
    'window:maximize',
    'window:close',
]);

const ALLOWED_INVOKE_CHANNELS = new Set([
    'app:ping',
    'app:get-info',
    'service:get-status',
    'service:start',
    'service:stop',
    'service:restart',
    'service:clear-logs',
    'tunnel:get-status',
    'tunnel:start',
    'tunnel:stop',
    'updater:check',
    'updater:apply',
    'updater:rollback',
    'updater:update-extractors',
    'config:get',
    'config:save',
    'config:generate-secret',
    'config:import-file',
    'config:select-cookies-file',
    'auth:login',
    'auth:logout',
    'auth:get-current-user',
    'auth:check-membership',
]);

const ALLOWED_LISTEN_CHANNELS = new Set([
    'service:status-changed',
    'service:log-entry',
    'service:logs-cleared',
    'tunnel:status-changed',
    'tunnel:url-ready',
    'updater:status-changed',
    'updater:download-progress',
]);

/**
 * Secure contextBridge exposed to renderer as window.igniteLauncher
 */
contextBridge.exposeInMainWorld('igniteLauncher', {
    ping: () => ipcRenderer.invoke('app:ping'),
    getAppInfo: () => ipcRenderer.invoke('app:get-info'),

    // Service Supervisor
    getStatus: () => ipcRenderer.invoke('service:get-status'),
    startService: () => ipcRenderer.invoke('service:start'),
    stopService: () => ipcRenderer.invoke('service:stop'),
    restartService: () => ipcRenderer.invoke('service:restart'),
    clearLogs: () => ipcRenderer.invoke('service:clear-logs'),

    // Cloudflare Tunnel (Phase 5)
    getTunnelStatus: () => ipcRenderer.invoke('tunnel:get-status'),
    getTunnelUrl: async () => {
        const status = await ipcRenderer.invoke('tunnel:get-status');
        return status?.url || null;
    },
    startTunnel: (port) => ipcRenderer.invoke('tunnel:start', port),
    stopTunnel: () => ipcRenderer.invoke('tunnel:stop'),

    // Configuration
    getConfig: () => ipcRenderer.invoke('config:get'),
    saveConfig: (cfg) => ipcRenderer.invoke('config:save', cfg),
    generateApiSecret: () => ipcRenderer.invoke('config:generate-secret'),
    importConfigFile: () => ipcRenderer.invoke('config:import-file'),
    selectCookiesFile: () => ipcRenderer.invoke('config:select-cookies-file'),

    // Authentication & Gatekeeper
    loginWithDiscord: () => ipcRenderer.invoke('auth:login'),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getCurrentUser: () => ipcRenderer.invoke('auth:get-current-user'),
    checkMembership: () => ipcRenderer.invoke('auth:check-membership'),
    getMembershipStatus: () => ipcRenderer.invoke('auth:check-membership'),

    // Window controls
    minimizeWindow: () => ipcRenderer.send('window:minimize'),
    maximizeWindow: () => ipcRenderer.send('window:maximize'),
    closeWindow: () => ipcRenderer.send('window:close'),

    // Event listeners
    onStatusChange: (callback) => {
        if (typeof callback !== 'function') return () => {};
        const subscription = (_event, status) => callback(status);
        ipcRenderer.on('service:status-changed', subscription);
        return () => {
            ipcRenderer.removeListener('service:status-changed', subscription);
        };
    },

    onLogEntry: (callback) => {
        if (typeof callback !== 'function') return () => {};
        const subscription = (_event, entry) => callback(entry);
        ipcRenderer.on('service:log-entry', subscription);
        return () => {
            ipcRenderer.removeListener('service:log-entry', subscription);
        };
    },

    onLogsCleared: (callback) => {
        if (typeof callback !== 'function') return () => {};
        const subscription = () => callback();
        ipcRenderer.on('service:logs-cleared', subscription);
        return () => {
            ipcRenderer.removeListener('service:logs-cleared', subscription);
        };
    },

    onTunnelStatus: (callback) => {
        if (typeof callback !== 'function') return () => {};
        const subscription = (_event, status) => callback(status);
        ipcRenderer.on('tunnel:status-changed', subscription);
        return () => {
            ipcRenderer.removeListener('tunnel:status-changed', subscription);
        };
    },

    onTunnelUrl: (callback) => {
        if (typeof callback !== 'function') return () => {};
        const subscription = (_event, url) => callback(url);
        ipcRenderer.on('tunnel:url-ready', subscription);
        return () => {
            ipcRenderer.removeListener('tunnel:url-ready', subscription);
        };
    },

    onTunnelUrlChange: (callback) => {
        if (typeof callback !== 'function') return () => {};
        const subscription = (_event, url) => callback(url);
        ipcRenderer.on('tunnel:url-ready', subscription);
        return () => {
            ipcRenderer.removeListener('tunnel:url-ready', subscription);
        };
    },

    // Updater & Audio Extractors (OTA Updates)
    checkForUpdates: (force) => ipcRenderer.invoke('updater:check', force),
    applyUpdate: (downloadUrl) => ipcRenderer.invoke('updater:apply', downloadUrl),
    rollbackUpdate: () => ipcRenderer.invoke('updater:rollback'),
    updateAudioExtractors: () => ipcRenderer.invoke('updater:update-extractors'),
    onUpdaterStatus: (callback) => {
        if (typeof callback !== 'function') return () => {};
        const subscription = (_event, status) => callback(status);
        ipcRenderer.on('updater:status-changed', subscription);
        return () => {
            ipcRenderer.removeListener('updater:status-changed', subscription);
        };
    },
    onUpdateProgress: (callback) => {
        if (typeof callback !== 'function') return () => {};
        const subscription = (_event, progress) => callback(progress);
        ipcRenderer.on('updater:download-progress', subscription);
        return () => {
            ipcRenderer.removeListener('updater:download-progress', subscription);
        };
    },
});
