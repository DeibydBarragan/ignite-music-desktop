'use strict';

const { ipcMain, app } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { ConfigManager, generateApiSecret } = require('./config-manager');
const { AuthManager } = require('./auth-manager');
const { verifyGuildMembership } = require('./gatekeeper');
const { ProcessSupervisor } = require('./process-supervisor');
const { TunnelSupervisor } = require('./tunnel-supervisor');
const { UpdaterEngine } = require('./updater-engine');

function getEnvOverrides(config) {
    return {
        TOKEN: config.discordToken,
        CLIENT_ID: config.clientId,
        CLIENT_SECRET: config.clientSecret,
        GUILD_ID: config.guildId,
        API_SECRET: config.apiSecret,
        PORT: String(config.port),
        AUTO_TUNNEL: 'false', // Desktop Launcher manages tunnel natively
    };
}

function registerIpcHandlers(mainWindow, customConfig, customAuth, customSupervisor, customTunnel, customUpdater) {
    const configManager = customConfig || new ConfigManager();
    const authManager = customAuth || new AuthManager();
    const supervisor = customSupervisor || new ProcessSupervisor();
    const tunnel = customTunnel || new TunnelSupervisor();
    const updater = customUpdater || new UpdaterEngine(configManager.dataDir);

    const safeSend = (ch, data) => !mainWindow.isDestroyed() && mainWindow.webContents.send(ch, data);

    supervisor.on('log', (entry) => safeSend('service:log-entry', entry));
    supervisor.on('status-changed', (s) => safeSend('service:status-changed', s));
    tunnel.on('status-changed', (s) => safeSend('tunnel:status-changed', s));
    tunnel.on('url-ready', (u) => safeSend('tunnel:url-ready', u));
    updater.on('status-changed', (s) => safeSend('updater:status-changed', s));

    function resolveServiceDir() {
        const userServiceDir = path.join(configManager.dataDir, 'service', 'current');
        if (fs.existsSync(path.join(userServiceDir, 'index.js'))) return userServiceDir;
        const siblingDev = path.resolve(__dirname, '../../../ignite-music');
        if (fs.existsSync(path.join(siblingDev, 'index.js'))) return siblingDev;
        return process.cwd();
    }

    // App & Base
    ipcMain.handle('app:ping', () => 'pong');
    ipcMain.handle('app:get-info', () => ({
        name: app.getName(),
        version: app.getVersion(),
        platform: process.platform,
        arch: process.arch,
        electronVersion: process.versions.electron,
        nodeVersion: process.versions.node,
    }));

    // Service Supervisor
    ipcMain.handle('service:get-status', () => supervisor.getStatus());
    ipcMain.handle('service:start', async () => {
        const config = configManager.loadConfig();
        if (!config.isConfigured) return { success: false, error: 'CONFIG_REQUIRED' };

        const serviceDir = resolveServiceDir();
        configManager.writeEnvFile(serviceDir, config);

        const res = supervisor.start(serviceDir, getEnvOverrides(config));
        if (res.success) {
            tunnel.start(config.port).catch(() => {});
        }
        return res;
    });

    ipcMain.handle('service:stop', async () => {
        await tunnel.stop();
        return supervisor.stop();
    });

    ipcMain.handle('service:restart', async () => {
        const config = configManager.loadConfig();
        const serviceDir = resolveServiceDir();
        configManager.writeEnvFile(serviceDir, config);
        await tunnel.stop();
        const res = await supervisor.restart(serviceDir, getEnvOverrides(config));
        if (res.success) {
            tunnel.start(config.port).catch(() => {});
        }
        return res;
    });

    // Cloudflare Tunnel
    ipcMain.handle('tunnel:get-status', () => tunnel.getStatus());
    ipcMain.handle('tunnel:start', (_e, port) => tunnel.start(port));
    ipcMain.handle('tunnel:stop', () => tunnel.stop());

    // Configuration
    ipcMain.handle('config:get', () => configManager.loadConfig());
    ipcMain.handle('config:save', (_e, cfg) => configManager.saveConfig(cfg));
    ipcMain.handle('config:generate-secret', () => generateApiSecret());

    // Auth & Gatekeeper
    ipcMain.handle('auth:login', async () => {
        const config = configManager.loadConfig();
        if (!config.clientId || !config.clientSecret) {
            return { success: false, error: 'CONFIG_REQUIRED' };
        }
        const authResult = await authManager.startOAuthFlow(config.clientId, config.clientSecret);
        if (!authResult.success) return authResult;

        const membership = await verifyGuildMembership(config.discordToken, config.guildId, authResult.user.id);
        return { success: true, user: authResult.user, membership };
    });

    ipcMain.handle('auth:logout', () => {
        authManager.clearSession();
        return { success: true };
    });

    ipcMain.handle('auth:get-current-user', () => {
        const session = authManager.loadSession();
        return session ? session.user : null;
    });

    ipcMain.handle('auth:check-membership', async () => {
        const session = authManager.loadSession();
        if (!session?.user) return { isMember: false, error: 'NOT_AUTHENTICATED' };
        const config = configManager.loadConfig();
        return verifyGuildMembership(config.discordToken, config.guildId, session.user.id);
    });

    // Updater & Audio Extractors
    ipcMain.handle('updater:check', () => updater.checkForUpdates(app.getVersion()));
    ipcMain.handle('updater:rollback', () => ({ success: updater.rollback() }));
    ipcMain.handle('updater:update-extractors', () => {
        const binDir = path.join(configManager.dataDir, 'bin');
        return updater.updateYtDlp(binDir);
    });

    // Window controls
    ipcMain.on('window:minimize', () => !mainWindow.isDestroyed() && mainWindow.minimize());
    ipcMain.on('window:maximize', () => {
        if (!mainWindow.isDestroyed()) {
            mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
        }
    });
    ipcMain.on('window:close', () => !mainWindow.isDestroyed() && mainWindow.close());
}

module.exports = { registerIpcHandlers };
