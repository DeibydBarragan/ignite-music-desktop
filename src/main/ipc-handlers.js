'use strict';

const { ipcMain, app, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { ConfigManager, generateApiSecret } = require('./config-manager');
const { parseConfigFile } = require('./config-parser');
const { AuthManager } = require('./auth-manager');
const { verifyGuildMembership } = require('./gatekeeper');
const { ProcessSupervisor } = require('./process-supervisor');
const { TunnelSupervisor } = require('./tunnel-supervisor');
const { UpdaterEngine } = require('./updater-engine');
const { SupabaseAnnouncer } = require('./supabase-announcer');

let activeSupervisor = null;
let activeTunnel = null;

function getEnvOverrides(config) {
    const overrides = {
        TOKEN: config.discordToken,
        DISCORD_TOKEN: config.discordToken,
        CLIENT_ID: config.clientId,
        CLIENT_SECRET: config.clientSecret,
        GUILD_ID: config.guildId,
        API_SECRET: config.apiSecret,
        PORT: String(config.port),
        API_PORT: String(config.port),
        API_ENABLED: 'true',
        API_ALLOWED_ORIGINS: '*',
        AUTO_TUNNEL: 'false', // Desktop Launcher manages tunnel natively
    };
    if (config.cookiesFile) overrides.COOKIES_FILE = config.cookiesFile;
    if (config.cookiesFromBrowser) overrides.COOKIES_FROM_BROWSER = config.cookiesFromBrowser;
    if (config.supabaseUrl) overrides.SUPABASE_URL = config.supabaseUrl;
    if (config.supabaseKey) {
        overrides.SUPABASE_KEY = config.supabaseKey;
        overrides.SUPABASE_ANON_KEY = config.supabaseKey;
        overrides.SUPABASE_SERVICE_ROLE_KEY = config.supabaseKey;
    }
    if (config.voiceEnabled) {
        overrides.VOICE_ENABLED = 'true';
        if (config.groqApiKey) overrides.GROQ_API_KEY = config.groqApiKey;
    } else {
        overrides.VOICE_ENABLED = 'false';
    }
    if (activeTunnel?.url) overrides.PUBLIC_API_URL = activeTunnel.url;
    return overrides;
}

/**
 * Resolves the ignite-music directory.
 * Prioritizes:
 * 1. userData/service/current (active updated service)
 * 2. process.resourcesPath/service/bundled (packaged app first-run initialization)
 * 3. Relative workspace development paths
 * Never hardcodes machine-specific absolute paths.
 */
function ensureFingerprintMarker(dir) {
    try {
        const marker = path.join(dir, 'node_modules', '.musicbot-installed');
        if (fs.existsSync(path.join(dir, 'node_modules'))) {
            const hash = crypto.createHash('sha256');
            for (const file of ['package.json', 'package-lock.json']) {
                const full = path.join(dir, file);
                if (fs.existsSync(full)) hash.update(fs.readFileSync(full));
            }
            fs.writeFileSync(marker, hash.digest('hex'), 'utf8');
        }
    } catch { /* ignore */ }
}

function resolveServiceDir(configManager) {
    const dataDir = configManager?.dataDir || (app && typeof app.getPath === 'function' ? app.getPath('userData') : path.join(process.cwd(), '.data'));
    const currentDir = path.join(dataDir, 'service', 'current');
    const bundledDir = path.join(process.resourcesPath || '', 'service', 'bundled');
    if (fs.existsSync(path.join(currentDir, 'index.js'))) {
        // Auto-heal: if current directory is missing node_modules or has missing critical dependencies, copy from bundled snapshot
        const currentMarker = path.join(currentDir, 'node_modules', '.musicbot-installed');
        const isNodeModulesIncomplete = !fs.existsSync(path.join(currentDir, 'node_modules')) ||
            !fs.existsSync(path.join(currentDir, 'node_modules', 'discord.js')) ||
            !fs.existsSync(currentMarker);

        if (isNodeModulesIncomplete && fs.existsSync(path.join(bundledDir, 'node_modules'))) {
            try {
                fs.cpSync(path.join(bundledDir, 'node_modules'), path.join(currentDir, 'node_modules'), { recursive: true });
            } catch { /* ignore */ }
        }
        ensureFingerprintMarker(currentDir);
        return currentDir;
    }


    if (fs.existsSync(path.join(bundledDir, 'index.js'))) {
        try {
            fs.mkdirSync(currentDir, { recursive: true });
            fs.cpSync(bundledDir, currentDir, { recursive: true });
            ensureFingerprintMarker(currentDir);
            return currentDir;
        } catch {
            return bundledDir;
        }
    }

    const devCandidates = [
        path.resolve(__dirname, '../../../ignite-music'),
        path.resolve(__dirname, '../../../../ignite-music'),
        path.resolve(path.dirname(process.execPath), '../../../ignite-music'),
        path.resolve(path.dirname(process.execPath), '../../../../ignite-music'),
        path.resolve(process.cwd(), '../ignite-music'),
        path.resolve(process.cwd(), 'ignite-music'),
    ];

    for (const candidate of devCandidates) {
        if (candidate && fs.existsSync(path.join(candidate, 'index.js'))) {
            return candidate;
        }
    }
    return currentDir;
}

/**
 * Shuts down all active child services gracefully.
 * Used during application exit or window teardown.
 */
async function stopAllServices() {
    if (activeTunnel) {
        try { await activeTunnel.stop(); } catch { /* ignore */ }
    }
    if (activeSupervisor) {
        try { await activeSupervisor.stop(); } catch { /* ignore */ }
    }
}

function registerIpcHandlers(mainWindow, customConfig, customAuth, customSupervisor, customTunnel, customUpdater) {
    const configManager = customConfig || new ConfigManager();
    const authManager = customAuth || new AuthManager();
    const supervisor = customSupervisor || new ProcessSupervisor(path.join(configManager.dataDir, 'logs'));
    const tunnel = customTunnel || new TunnelSupervisor();
    const updater = customUpdater || new UpdaterEngine(configManager.dataDir);
    const announcer = new SupabaseAnnouncer();
    announcer.setConfig(configManager.loadConfig());

    activeSupervisor = supervisor;
    activeTunnel = tunnel;

    const safeSend = (ch, data) => !mainWindow.isDestroyed() && mainWindow.webContents.send(ch, data);

    supervisor.on('log', (entry) => safeSend('service:log-entry', entry));
    supervisor.on('status-changed', (s) => safeSend('service:status-changed', s));
    supervisor.on('logs-cleared', () => safeSend('service:logs-cleared'));
    tunnel.on('status-changed', (s) => {
        if (s.state === 'stopped' || s.state === 'error') announcer.clear();
        safeSend('tunnel:status-changed', s);
    });
    tunnel.on('url-ready', async (u) => {
        supervisor.emitLog({
            type: 'stdout',
            text: `[Tunnel] Cloudflare tunnel activo: ${u}`,
            timestamp: new Date().toISOString(),
        });
        const cfg = configManager.loadConfig();
        announcer.setConfig(cfg);
        const announced = await announcer.announce(u);
        if (announced) {
            supervisor.emitLog({
                type: 'stdout',
                text: `[Supabase] URL pública sincronizada con el dashboard web (${u})`,
                timestamp: new Date().toISOString(),
            });
        }
        announcer.startHeartbeat(() => tunnel.url);
        safeSend('tunnel:url-ready', u);
    });
    updater.on('status-changed', (s) => safeSend('updater:status-changed', s));
    updater.on('download-progress', (p) => safeSend('updater:download-progress', p));

    // Automatic crash loop detection within first 10 seconds of startup
    supervisor.on('crash-loop-detected', async ({ exitCode }) => {
        supervisor.emit('log', {
            type: 'stderr',
            text: `[Supervisor] ⚠️ ¡Crash loop detectado en los primeros 10 segundos (código ${exitCode})! Ejecutando rollback automático a la versión previa...`,
            timestamp: new Date().toISOString(),
        });

        const rolledBack = updater.rollback();
        if (rolledBack) {
            safeSend('updater:status-changed', { state: 'rolled-back', reason: 'CRASH_LOOP_DETECTED' });
            supervisor.emit('log', {
                type: 'stdout',
                text: '[Supervisor] ✅ Rollback completado exitosamente. Reiniciando versión previa estable...',
                timestamp: new Date().toISOString(),
            });
            const config = configManager.loadConfig();
            const serviceDir = resolveServiceDir(configManager);
            supervisor.start(serviceDir, getEnvOverrides(config));
        } else {
            supervisor.emit('log', {
                type: 'stderr',
                text: '[Supervisor] ❌ No hay copia de respaldo disponible para realizar rollback.',
                timestamp: new Date().toISOString(),
            });
        }
    });

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

        const serviceDir = resolveServiceDir(configManager);
        if (!fs.existsSync(path.join(serviceDir, 'index.js'))) {
            return {
                success: false,
                error: `No se encontró index.js en el directorio del bot: ${serviceDir}. Asegúrate de clonar el bot o descargar una versión.`,
            };
        }

        configManager.writeEnvFile(serviceDir, config);

        const res = supervisor.start(serviceDir, getEnvOverrides(config), { waitForReady: true });
        if (res.success) {
            tunnel.start(config.port).catch(() => {});
        }
        return res;
    });

    ipcMain.handle('service:stop', async () => {
        announcer.clear();
        await tunnel.stop();
        return supervisor.stop();
    });

    ipcMain.handle('service:restart', async () => {
        const config = configManager.loadConfig();
        const serviceDir = resolveServiceDir(configManager);
        configManager.writeEnvFile(serviceDir, config);
        announcer.clear();
        await tunnel.stop();
        const res = await supervisor.restart(serviceDir, getEnvOverrides(config), { waitForReady: true });
        if (res.success) {
            tunnel.start(config.port).catch(() => {});
        }
        return res;
    });

    ipcMain.handle('service:clear-logs', () => {
        supervisor.clearLogs();
        return { success: true };
    });

    // Cloudflare Tunnel
    ipcMain.handle('tunnel:get-status', () => tunnel.getStatus());
    ipcMain.handle('tunnel:start', (_e, port) => tunnel.start(port));
    ipcMain.handle('tunnel:stop', async () => {
        announcer.clear();
        return tunnel.stop();
    });

    // Configuration
    ipcMain.handle('config:get', () => configManager.loadConfig());
    ipcMain.handle('config:save', (_e, cfg) => {
        announcer.setConfig(cfg);
        return configManager.saveConfig(cfg);
    });
    ipcMain.handle('config:generate-secret', () => generateApiSecret());
    ipcMain.handle('config:select-cookies-file', async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
            title: 'Seleccionar archivo de cookies (cookies.txt)',
            filters: [
                { name: 'Archivos de cookies (*.txt)', extensions: ['txt'] },
                { name: 'Todos los archivos', extensions: ['*'] },
            ],
            properties: ['openFile'],
        });
        if (canceled || !filePaths || filePaths.length === 0) return { canceled: true };
        return { canceled: false, filePath: filePaths[0], filename: path.basename(filePaths[0]) };
    });

    ipcMain.handle('config:save-cookies-file', async (_e, { filePath, content }) => {
        if (content !== undefined) {
            return configManager.saveCookiesFile(content, true);
        }
        return configManager.saveCookiesFile(filePath, false);
    });

    ipcMain.handle('config:remove-cookies-file', () => {
        return configManager.removeCookiesFile();
    });

    ipcMain.handle('config:get-cookies-status', () => {
        return configManager.getCookiesStatus();
    });

    ipcMain.handle('config:parse-content', (_e, { content, filename }) => {
        return parseConfigFile(content, filename);
    });

    ipcMain.handle('config:import-file', async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
            title: 'Importar configuración (.env o .json)',
            filters: [
                { name: 'Archivos de configuración (.env, .json)', extensions: ['env', 'json', 'local'] },
                { name: 'Todos los archivos', extensions: ['*'] },
            ],
            properties: ['openFile'],
        });

        if (canceled || !filePaths || filePaths.length === 0) {
            return { canceled: true };
        }

        const selectedPath = filePaths[0];
        try {
            const content = fs.readFileSync(selectedPath, 'utf8');
            const parsed = parseConfigFile(content, path.basename(selectedPath));
            return { ...parsed, filename: path.basename(selectedPath) };
        } catch (err) {
            return { success: false, error: `No se pudo leer el archivo: ${err.message}` };
        }
    });

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
    ipcMain.handle('updater:apply', async (_e, downloadUrl) => {
        if (!downloadUrl) return { success: false, error: 'NO_DOWNLOAD_URL' };

        await tunnel.stop();
        await supervisor.stop();

        const updateRes = await updater.applyUpdate(downloadUrl);
        if (!updateRes.success) {
            return updateRes;
        }

        const config = configManager.loadConfig();
        const serviceDir = resolveServiceDir(configManager);
        configManager.writeEnvFile(serviceDir, config);

        const restartRes = supervisor.start(serviceDir, getEnvOverrides(config));
        if (restartRes.success) {
            tunnel.start(config.port).catch(() => {});
        }
        return { success: true };
    });
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
    ipcMain.handle('window:confirm-close', async () => {
        app.isQuitting = true;
        await stopAllServices();
        if (!mainWindow.isDestroyed()) {
            mainWindow.destroy();
        }
        app.quit();
        return { success: true };
    });
    ipcMain.on('window:minimize-to-tray', () => {
        if (!mainWindow.isDestroyed()) {
            mainWindow.hide();
        }
    });
}

function isServiceActive() {
    if (!activeSupervisor) return false;
    const state = activeSupervisor.getStatus()?.state;
    return state === 'running' || state === 'starting';
}

module.exports = {
    registerIpcHandlers,
    resolveServiceDir,
    stopAllServices,
    isServiceActive,
};

