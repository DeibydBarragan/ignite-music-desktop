'use strict';

import { showToast } from './toast.js';
import { Icons } from './icons.js';

export function initServiceControls() {
    const btnStart = document.getElementById('btnStartService');
    const btnStop = document.getElementById('btnStopService');
    const btnRestart = document.getElementById('btnRestartService');

    const startServiceIconSlot = document.getElementById('startServiceIconSlot');
    const startServiceText = document.getElementById('startServiceText');
    const restartServiceIconSlot = document.getElementById('restartServiceIconSlot');
    const restartServiceText = document.getElementById('restartServiceText');
    const stopServiceIconSlot = document.getElementById('stopServiceIconSlot');
    const stopServiceText = document.getElementById('stopServiceText');

    const botStatusDot = document.getElementById('botStatusDot');
    const botStatusLabel = document.getElementById('botStatusLabel');
    const botUptimeEl = document.getElementById('botUptime');
    const headerStatusDot = document.getElementById('serviceDot');
    const headerStatusLabel = document.getElementById('serviceStatusLabel');
    const serviceCard = document.getElementById('serviceControlCard') || document.querySelector('.service-control-card');

    let uptimeInterval = null;
    let currentUptimeSeconds = 0;
    let pendingAction = null; // 'start' | 'restart' | null
    let previousState = null;

    function formatUptime(seconds) {
        const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
        const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        return `${h}:${m}:${s}`;
    }

    function setUptimeActive(active, initialSeconds = 0) {
        if (uptimeInterval) {
            clearInterval(uptimeInterval);
            uptimeInterval = null;
        }
        currentUptimeSeconds = initialSeconds;
        if (botUptimeEl) botUptimeEl.textContent = formatUptime(currentUptimeSeconds);

        if (active) {
            uptimeInterval = setInterval(() => {
                currentUptimeSeconds++;
                if (botUptimeEl) botUptimeEl.textContent = formatUptime(currentUptimeSeconds);
            }, 1000);
        }
    }

    function setStartButtonLoading(loading) {
        if (!startServiceIconSlot) return;
        if (loading) {
            startServiceIconSlot.innerHTML = `<span class="spin">${Icons.Loader2(14)}</span>`;
            if (startServiceText) startServiceText.textContent = 'Iniciando...';
        } else {
            startServiceIconSlot.innerHTML = Icons.Play(14);
            if (startServiceText) startServiceText.textContent = 'Iniciar Bot';
        }
    }

    function setRestartButtonLoading(loading) {
        if (!restartServiceIconSlot) return;
        if (loading) {
            restartServiceIconSlot.innerHTML = `<span class="spin">${Icons.Loader2(14)}</span>`;
            if (restartServiceText) restartServiceText.textContent = 'Reiniciando...';
        } else {
            restartServiceIconSlot.innerHTML = Icons.RotateCw(14);
            if (restartServiceText) restartServiceText.textContent = 'Reiniciar';
        }
    }

    function updateUI(status) {
        const state = status.state || 'stopped';
        const serviceBadge = document.getElementById('serviceBadge');

        if (state === 'running') {
            pendingAction = null;
            setStartButtonLoading(false);
            setRestartButtonLoading(false);

            if (btnStart) btnStart.disabled = true;
            if (btnStop) btnStop.disabled = false;
            if (btnRestart) btnRestart.disabled = false;

            if (botStatusDot) botStatusDot.className = 'status-indicator status-online';
            if (botStatusLabel) botStatusLabel.textContent = 'En Línea';
            if (headerStatusDot) headerStatusDot.className = 'badge-dot active';
            if (headerStatusLabel) headerStatusLabel.textContent = 'Bot Activo';
            if (serviceBadge) serviceBadge.className = 'tab-service-badge tab-service-badge-online';
            if (serviceCard) serviceCard.classList.add('service-active');

            setUptimeActive(true, status.uptime || 0);
        } else if (state === 'starting') {
            if (serviceCard) serviceCard.classList.remove('service-active');
            if (btnStart) btnStart.disabled = true;
            if (btnStop) btnStop.disabled = true;
            if (btnRestart) btnRestart.disabled = true;

            const isRestart = pendingAction === 'restart';
            if (isRestart) {
                setRestartButtonLoading(true);
                setStartButtonLoading(false);
            } else {
                setStartButtonLoading(true);
                setRestartButtonLoading(false);
            }

            if (botStatusDot) botStatusDot.className = 'status-indicator status-starting';
            if (botStatusLabel) botStatusLabel.textContent = isRestart ? 'Reiniciando...' : 'Iniciando...';
            if (headerStatusDot) headerStatusDot.className = 'badge-dot';
            if (headerStatusLabel) headerStatusLabel.textContent = isRestart ? 'Reiniciando...' : 'Iniciando...';
            if (serviceBadge) serviceBadge.className = 'tab-service-badge tab-service-badge-warning';

            setUptimeActive(false);
        } else if (state === 'stopping') {
            if (serviceCard) serviceCard.classList.remove('service-active');
            if (btnStart) btnStart.disabled = true;
            if (btnStop) btnStop.disabled = true;
            if (btnRestart) btnRestart.disabled = true;

            if (pendingAction === 'restart') {
                setRestartButtonLoading(true);
                setStartButtonLoading(false);
                if (botStatusDot) botStatusDot.className = 'status-indicator status-starting';
                if (botStatusLabel) botStatusLabel.textContent = 'Reiniciando...';
                if (headerStatusDot) headerStatusDot.className = 'badge-dot';
                if (headerStatusLabel) headerStatusLabel.textContent = 'Reiniciando...';
            } else {
                setStartButtonLoading(false);
                setRestartButtonLoading(false);
                if (botStatusDot) botStatusDot.className = 'status-indicator status-starting';
                if (botStatusLabel) botStatusLabel.textContent = 'Deteniendo...';
                if (headerStatusDot) headerStatusDot.className = 'badge-dot';
                if (headerStatusLabel) headerStatusLabel.textContent = 'Deteniendo...';
            }

            if (serviceBadge) serviceBadge.className = 'tab-service-badge tab-service-badge-warning';
            setUptimeActive(false);
        } else {
            // stopped or crashed
            if (serviceCard) serviceCard.classList.remove('service-active');
            if (pendingAction === 'restart' && state === 'stopped') {
                // Intermediate stop during restart sequence; maintain loading state
                if (btnStart) btnStart.disabled = true;
                if (btnStop) btnStop.disabled = true;
                if (btnRestart) btnRestart.disabled = true;
                setRestartButtonLoading(true);
                setStartButtonLoading(false);
                if (botStatusDot) botStatusDot.className = 'status-indicator status-starting';
                if (botStatusLabel) botStatusLabel.textContent = 'Reiniciando...';
                if (headerStatusDot) headerStatusDot.className = 'badge-dot';
                if (headerStatusLabel) headerStatusLabel.textContent = 'Reiniciando...';
                return;
            }

            const wasAttempting = (previousState === 'starting' || previousState === 'stopping' || pendingAction !== null);
            pendingAction = null;
            setStartButtonLoading(false);
            setRestartButtonLoading(false);

            if (btnStart) btnStart.disabled = false;
            if (btnStop) btnStop.disabled = true;
            if (btnRestart) btnRestart.disabled = true;

            const isCrash = state === 'crashed';
            if (botStatusDot) botStatusDot.className = `status-indicator ${isCrash ? 'status-crashed' : 'status-offline'}`;
            if (botStatusLabel) botStatusLabel.textContent = isCrash ? 'Error / Detenido' : 'Detenido';
            if (headerStatusDot) headerStatusDot.className = 'badge-dot';
            if (headerStatusLabel) headerStatusLabel.textContent = isCrash ? 'Error en Bot' : 'Bot Detenido';
            if (serviceBadge) serviceBadge.className = 'tab-service-badge tab-service-badge-offline';

            setUptimeActive(false);

            if (isCrash && wasAttempting) {
                showToast(
                    'Fallo al iniciar el bot',
                    'El proceso finalizó antes de que la API REST estuviera lista. Revisa la consola de logs para ver el error.',
                    'error'
                );
            } else if (isCrash) {
                showToast(
                    'Servicio finalizado inesperadamente',
                    `El proceso de Ignite Music se cerró (código ${status.exitCode ?? 'desconocido'}).`,
                    'error'
                );
            }
        }

        previousState = state;
    }

    if (btnStart) {
        btnStart.addEventListener('click', async () => {
            pendingAction = 'start';
            btnStart.disabled = true;
            btnStop.disabled = true;
            btnRestart.disabled = true;
            setStartButtonLoading(true);
            if (serviceCard) serviceCard.classList.remove('service-active');

            if (botStatusDot) botStatusDot.className = 'status-indicator status-starting';
            if (botStatusLabel) botStatusLabel.textContent = 'Iniciando...';
            if (headerStatusDot) headerStatusDot.className = 'badge-dot';
            if (headerStatusLabel) headerStatusLabel.textContent = 'Iniciando...';

            try {
                const res = await window.igniteLauncher.startService();
                if (res && !res.success) {
                    pendingAction = null;
                    setStartButtonLoading(false);
                    btnStart.disabled = false;
                    btnStop.disabled = true;
                    btnRestart.disabled = true;
                    if (botStatusDot) botStatusDot.className = 'status-indicator status-offline';
                    if (botStatusLabel) botStatusLabel.textContent = 'Detenido';
                    if (headerStatusDot) headerStatusDot.className = 'badge-dot';
                    if (headerStatusLabel) headerStatusLabel.textContent = 'Bot Detenido';
                    showToast('No se pudo iniciar el servicio', res.error || 'Error desconocido al arrancar el bot.', 'error');
                }
            } catch (err) {
                pendingAction = null;
                setStartButtonLoading(false);
                btnStart.disabled = false;
                btnStop.disabled = true;
                btnRestart.disabled = true;
                if (botStatusDot) botStatusDot.className = 'status-indicator status-offline';
                if (botStatusLabel) botStatusLabel.textContent = 'Detenido';
                if (headerStatusDot) headerStatusDot.className = 'badge-dot';
                if (headerStatusLabel) headerStatusLabel.textContent = 'Bot Detenido';
                showToast('Error al iniciar el servicio', err.message, 'error');
            }
        });
    }

    if (btnStop) {
        btnStop.addEventListener('click', async () => {
            btnStop.disabled = true;
            btnRestart.disabled = true;
            if (serviceCard) serviceCard.classList.remove('service-active');
            try {
                const res = await window.igniteLauncher.stopService();
                if (res && !res.success) {
                    btnStop.disabled = false;
                    btnRestart.disabled = false;
                    showToast('Error al detener el servicio', res.error || 'No se pudo detener.', 'error');
                }
            } catch (err) {
                btnStop.disabled = false;
                btnRestart.disabled = false;
                showToast('Error al detener', err.message, 'error');
            }
        });
    }

    if (btnRestart) {
        btnRestart.addEventListener('click', async () => {
            pendingAction = 'restart';
            btnStart.disabled = true;
            btnStop.disabled = true;
            btnRestart.disabled = true;
            setRestartButtonLoading(true);
            if (serviceCard) serviceCard.classList.remove('service-active');

            if (botStatusDot) botStatusDot.className = 'status-indicator status-starting';
            if (botStatusLabel) botStatusLabel.textContent = 'Reiniciando...';
            if (headerStatusDot) headerStatusDot.className = 'badge-dot';
            if (headerStatusLabel) headerStatusLabel.textContent = 'Reiniciando...';

            try {
                const res = await window.igniteLauncher.restartService();
                if (res && !res.success) {
                    pendingAction = null;
                    setRestartButtonLoading(false);
                    btnRestart.disabled = false;
                    btnStop.disabled = false;
                    btnStart.disabled = true;
                    showToast('No se pudo reiniciar el servicio', res.error || 'Error al reiniciar el bot.', 'error');
                }
            } catch (err) {
                pendingAction = null;
                setRestartButtonLoading(false);
                btnRestart.disabled = false;
                btnStop.disabled = false;
                btnStart.disabled = true;
                showToast('Error al reiniciar el servicio', err.message, 'error');
            }
        });
    }

    if (window.igniteLauncher && typeof window.igniteLauncher.onStatusChange === 'function') {
        window.igniteLauncher.onStatusChange((status) => {
            updateUI(status);
        });
    }

    // Initial status fetch
    if (window.igniteLauncher && typeof window.igniteLauncher.getStatus === 'function') {
        window.igniteLauncher.getStatus().then(updateUI).catch(() => {});
    }

    return { updateUI };
}

