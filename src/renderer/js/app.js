'use strict';

import { initSettingsModal } from './settings-modal.js';
import { initAuthView } from './auth-view.js';
import { initLogViewer } from './log-viewer.js';
import { initServiceControls } from './service-controls.js';
import { initTunnelCard } from './tunnel-card.js';
import { initUpdateBanner } from './update-banner.js';

document.addEventListener('DOMContentLoaded', async () => {
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
        if (isConfigured) {
            configDot.classList.add('active');
            configStatusLabel.textContent = 'Configurado';
            configStatusLabel.style.color = 'var(--status-online)';
        } else {
            configDot.classList.remove('active');
            configStatusLabel.textContent = 'Configuración Requerida';
            configStatusLabel.style.color = '#f59e0b';
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
            if (pingResultEl) pingResultEl.textContent = 'Enviando...';

            const start = performance.now();
            try {
                const res = await window.igniteLauncher.ping();
                const elapsed = (performance.now() - start).toFixed(2);
                if (pingResultEl) {
                    pingResultEl.innerHTML = `<span style="color: var(--status-online);">OK (${res}) en ${elapsed} ms</span>`;
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
