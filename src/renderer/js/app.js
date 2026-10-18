'use strict';

import { initSettingsModal } from './settings-modal.js';
import { initAuthView } from './auth-view.js';
import { initLogViewer } from './log-viewer.js';
import { initServiceControls } from './service-controls.js';
import { initTunnelCard } from './tunnel-card.js';
import { initUpdateBanner } from './update-banner.js';
import { Icons } from './icons.js';

document.addEventListener('DOMContentLoaded', async () => {
    // Populate header & auth icons
    const settingsIconSlot = document.getElementById('settingsIconSlot');
    if (settingsIconSlot) settingsIconSlot.innerHTML = Icons.Settings(15);
    const logoutIconSlot = document.getElementById('logoutIconSlot');
    if (logoutIconSlot) logoutIconSlot.innerHTML = Icons.LogOut(14);
    const discordLoginIconSlot = document.getElementById('discordLoginIconSlot');
    if (discordLoginIconSlot) discordLoginIconSlot.innerHTML = Icons.LogIn(16);
    const deniedIconSlot = document.getElementById('deniedIconSlot');
    if (deniedIconSlot) deniedIconSlot.innerHTML = Icons.ShieldAlert(32);
    const recheckIconSlot = document.getElementById('recheckIconSlot');
    if (recheckIconSlot) recheckIconSlot.innerHTML = Icons.RotateCw(14);
    const switchAccountIconSlot = document.getElementById('switchAccountIconSlot');
    if (switchAccountIconSlot) switchAccountIconSlot.innerHTML = Icons.LogIn(14);

    // Populate dashboard icons (Phase 4)
    const startServiceIconSlot = document.getElementById('startServiceIconSlot');
    if (startServiceIconSlot) startServiceIconSlot.innerHTML = Icons.Play(14);
    const restartServiceIconSlot = document.getElementById('restartServiceIconSlot');
    if (restartServiceIconSlot) restartServiceIconSlot.innerHTML = Icons.RotateCw(14);
    const stopServiceIconSlot = document.getElementById('stopServiceIconSlot');
    if (stopServiceIconSlot) stopServiceIconSlot.innerHTML = Icons.Square(14);

    const tunnelCloudIconSlot = document.getElementById('tunnelCloudIconSlot');
    if (tunnelCloudIconSlot) tunnelCloudIconSlot.innerHTML = Icons.Cloud(18);
    const copyTunnelIconSlot = document.getElementById('copyTunnelIconSlot');
    if (copyTunnelIconSlot) copyTunnelIconSlot.innerHTML = Icons.Copy(13);
    const openTunnelIconSlot = document.getElementById('openTunnelIconSlot');
    if (openTunnelIconSlot) openTunnelIconSlot.innerHTML = Icons.ExternalLink(13);

    const terminalIconSlot = document.getElementById('terminalIconSlot');
    if (terminalIconSlot) terminalIconSlot.innerHTML = Icons.Terminal(15);
    const copyLogsIconSlot = document.getElementById('copyLogsIconSlot');
    if (copyLogsIconSlot) copyLogsIconSlot.innerHTML = Icons.Copy(13);
    const clearLogsIconSlot = document.getElementById('clearLogsIconSlot');
    if (clearLogsIconSlot) clearLogsIconSlot.innerHTML = Icons.Trash2(13);

    const pingIconSlot = document.getElementById('pingIconSlot');
    if (pingIconSlot) pingIconSlot.innerHTML = Icons.RotateCw(13);
    const noticeIconSlot = document.getElementById('noticeIconSlot');
    if (noticeIconSlot) noticeIconSlot.innerHTML = Icons.Sparkles(16);

    // Populate modals & update banner icons (Phase 5)
    const settingsModalHeaderIconSlot = document.getElementById('settingsModalHeaderIconSlot');
    if (settingsModalHeaderIconSlot) settingsModalHeaderIconSlot.innerHTML = Icons.Sliders(18);
    const importConfigIconSlot = document.getElementById('importConfigIconSlot');
    if (importConfigIconSlot) importConfigIconSlot.innerHTML = Icons.FileUp(14);
    const closeSettingsIconSlot = document.getElementById('closeSettingsIconSlot');
    if (closeSettingsIconSlot) closeSettingsIconSlot.innerHTML = Icons.X(14);
    const genSecretIconSlot = document.getElementById('genSecretIconSlot');
    if (genSecretIconSlot) genSecretIconSlot.innerHTML = Icons.Sparkles(13);
    const updateExtractorsIconSlot = document.getElementById('updateExtractorsIconSlot');
    if (updateExtractorsIconSlot) updateExtractorsIconSlot.innerHTML = Icons.RotateCw(13);
    const checkUpdatesIconSlot = document.getElementById('checkUpdatesIconSlot');
    if (checkUpdatesIconSlot) checkUpdatesIconSlot.innerHTML = Icons.Search(13);
    const saveSettingsIconSlot = document.getElementById('saveSettingsIconSlot');
    if (saveSettingsIconSlot) saveSettingsIconSlot.innerHTML = Icons.Check(14);

    const logoutConfirmIconSlot = document.getElementById('logoutConfirmIconSlot');
    if (logoutConfirmIconSlot) logoutConfirmIconSlot.innerHTML = Icons.LogOut(20);

    const updateRocketIconSlot = document.getElementById('updateRocketIconSlot');
    if (updateRocketIconSlot) updateRocketIconSlot.innerHTML = Icons.Sparkles(18);
    const btnDismissUpdate = document.getElementById('btnDismissUpdate');
    if (btnDismissUpdate) btnDismissUpdate.innerHTML = Icons.X(14);

    // Environment DOM elements
    const platformEl = document.getElementById('platformValue');
    const archEl = document.getElementById('archValue');
    const electronEl = document.getElementById('electronValue');
    const nodeEl = document.getElementById('nodeValue');
    const appVersionEl = document.getElementById('appVersion');
    const pingResultEl = document.getElementById('pingResult');
    const btnPing = document.getElementById('btnPing');

    const configDot = document.getElementById('configDot');
    const configStatusLabel = document.getElementById('configStatusLabel');

    if (!window.igniteLauncher) {
        console.error('Fatal: window.igniteLauncher bridge not found.');
        return;
    }

    // Load App & Environment Info
    try {
        const info = await window.igniteLauncher.getAppInfo();
        if (platformEl) platformEl.textContent = info.platform;
        if (archEl) archEl.textContent = info.arch;
        if (electronEl) electronEl.textContent = `v${info.electronVersion}`;
        if (nodeEl) nodeEl.textContent = `v${info.nodeVersion}`;
        if (appVersionEl) appVersionEl.textContent = `v${info.version}`;
    } catch (err) {
        console.warn('Could not fetch app info:', err);
    }

    // Initialize submodules
    initLogViewer();
    initServiceControls();
    initTunnelCard();
    initUpdateBanner();

    const settings = initSettingsModal(async () => {
        await evaluateAccess();
    });

    const auth = initAuthView({
        onLoginSuccess: async () => {
            await evaluateAccess();
        },
        onLogout: async () => {
            await evaluateAccess();
        },
        onRecheck: async () => {
            await evaluateAccess();
        },
    });

    function updateConfigBadge(isConfigured) {
        if (!configDot || !configStatusLabel) return;
        const configBadge = document.getElementById('configBadge');
        if (isConfigured) {
            configDot.classList.add('active');
            configStatusLabel.textContent = 'Configurado';
            if (configBadge) {
                configBadge.className = 'tab-service-badge tab-service-badge-online';
            }
        } else {
            configDot.classList.remove('active');
            configStatusLabel.textContent = 'Configuración Requerida';
            if (configBadge) {
                configBadge.className = 'tab-service-badge tab-service-badge-warning';
            }
        }
    }

    async function evaluateAccess() {
        const config = await window.igniteLauncher.getConfig();
        updateConfigBadge(config.isConfigured);
        settings.populateFields(config);

        if (!config.isConfigured) {
            auth.showView('login');
            auth.renderUserBadge(null);
            settings.openModal();
            return;
        }

        const currentUser = await window.igniteLauncher.getCurrentUser();
        if (!currentUser) {
            auth.showView('login');
            auth.renderUserBadge(null);
            return;
        }

        try {
            const membership = await window.igniteLauncher.checkMembership();
            auth.renderUserBadge(currentUser, membership);

            if (membership.isMember) {
                auth.showView('dashboard');
            } else {
                auth.setDeniedInfo(currentUser.username, config.guildId);
                auth.showView('denied');
            }
        } catch (err) {
            console.error('Error during membership check:', err);
            auth.showView('login');
        }
    }

    // Ping IPC Handler
    if (btnPing) {
        btnPing.addEventListener('click', async () => {
            btnPing.disabled = true;
            if (pingResultEl) pingResultEl.textContent = 'Midiendo...';

            const start = performance.now();
            try {
                await window.igniteLauncher.ping();
                const elapsed = (performance.now() - start).toFixed(2);
                if (pingResultEl) {
                    pingResultEl.innerHTML = `<span style="color: var(--status-online);">${elapsed} ms (OK)</span>`;
                }
            } catch (err) {
                if (pingResultEl) {
                    pingResultEl.innerHTML = `<span style="color: #ef4444;">Error: ${err.message}</span>`;
                }
            } finally {
                btnPing.disabled = false;
            }
        });
    }

    // Run initial access check
    await evaluateAccess();
});
