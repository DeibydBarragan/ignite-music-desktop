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
    'tunnel:get-status',
    'tunnel:start',
    'tunnel:stop',
    'updater:check',
    'updater:rollback',
    'updater:update-extractors',
    'config:get',
    'config:save',
    'config:generate-secret',
    'auth:login',
    'auth:logout',
    'auth:get-current-user',
    'auth:check-membership',
]);

const ALLOWED_LISTEN_CHANNELS = new Set([
    'service:status-changed',
    'service:log-entry',
    'tunnel:status-changed',
    'tunnel:url-ready',
    'updater:status-changed',
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

    // Cloudflare Tunnel (Phase 5)
    getTunnelStatus: () => ipcRenderer.invoke('tunnel:get-status'),
    startTunnel: (port) => ipcRenderer.invoke('tunnel:start', port),
    stopTunnel: () => ipcRenderer.invoke('tunnel:stop'),

    // Configuration
    getConfig: () => ipcRenderer.invoke('config:get'),
    saveConfig: (cfg) => ipcRenderer.invoke('config:save', cfg),
    generateApiSecret: () => ipcRenderer.invoke('config:generate-secret'),

    // Authentication & Gatekeeper
    loginWithDiscord: () => ipcRenderer.invoke('auth:login'),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getCurrentUser: () => ipcRenderer.invoke('auth:get-current-user'),
    checkMembership: () => ipcRenderer.invoke('auth:check-membership'),

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

    // Updater & Audio Extractors (Phase 6)
    checkForUpdates: (force) => ipcRenderer.invoke('updater:check', force),
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
});

