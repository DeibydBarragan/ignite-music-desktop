'use strict';

export function initServiceControls() {
    const btnStart = document.getElementById('btnStartService');
    const btnStop = document.getElementById('btnStopService');
    const btnRestart = document.getElementById('btnRestartService');

    const botStatusDot = document.getElementById('botStatusDot');
    const botStatusLabel = document.getElementById('botStatusLabel');
    const botUptimeEl = document.getElementById('botUptime');
    const headerStatusDot = document.getElementById('serviceDot');
    const headerStatusLabel = document.getElementById('serviceStatusLabel');

    let uptimeInterval = null;
    let currentUptimeSeconds = 0;

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

    function updateUI(status) {
        const state = status.state || 'stopped';

        if (state === 'running') {
            if (btnStart) btnStart.disabled = true;
            if (btnStop) btnStop.disabled = false;
            if (btnRestart) btnRestart.disabled = false;

            if (botStatusDot) botStatusDot.className = 'status-indicator status-online';
            if (botStatusLabel) botStatusLabel.textContent = 'En Línea';
            if (headerStatusDot) headerStatusDot.className = 'badge-dot active';
            if (headerStatusLabel) headerStatusLabel.textContent = 'Bot Activo';

            setUptimeActive(true, status.uptime || 0);
        } else if (state === 'starting' || state === 'stopping') {
            if (btnStart) btnStart.disabled = true;
            if (btnStop) btnStop.disabled = true;
            if (btnRestart) btnRestart.disabled = true;

            const isStarting = state === 'starting';
            if (botStatusDot) botStatusDot.className = 'status-indicator status-starting';
            if (botStatusLabel) botStatusLabel.textContent = isStarting ? 'Iniciando...' : 'Deteniendo...';
            if (headerStatusDot) headerStatusDot.className = 'badge-dot';
            if (headerStatusLabel) headerStatusLabel.textContent = isStarting ? 'Iniciando...' : 'Deteniendo...';
        } else {
            // stopped or crashed
            if (btnStart) btnStart.disabled = false;
            if (btnStop) btnStop.disabled = true;
            if (btnRestart) btnRestart.disabled = true;

            const isCrash = state === 'crashed';
            if (botStatusDot) botStatusDot.className = `status-indicator ${isCrash ? 'status-crashed' : 'status-offline'}`;
            if (botStatusLabel) botStatusLabel.textContent = isCrash ? 'Error / Detenido' : 'Detenido';
            if (headerStatusDot) headerStatusDot.className = 'badge-dot';
            if (headerStatusLabel) headerStatusLabel.textContent = isCrash ? 'Error en Bot' : 'Bot Detenido';

            setUptimeActive(false);
        }
    }

    if (btnStart) {
        btnStart.addEventListener('click', async () => {
            btnStart.disabled = true;
            try {
                const res = await window.igniteLauncher.startService();
                if (res && !res.success) {
                    btnStart.disabled = false;
                    alert(`No se pudo iniciar el servicio:\n${res.error || 'Error desconocido'}`);
                }
            } catch (err) {
                btnStart.disabled = false;
                alert(`Error al iniciar el servicio: ${err.message}`);
            }
        });
    }

    if (btnStop) {
        btnStop.addEventListener('click', async () => {
            btnStop.disabled = true;
            try {
                const res = await window.igniteLauncher.stopService();
                if (res && !res.success) btnStop.disabled = false;
            } catch {
                btnStop.disabled = false;
            }
        });
    }

    if (btnRestart) {
        btnRestart.addEventListener('click', async () => {
            btnRestart.disabled = true;
            try {
                const res = await window.igniteLauncher.restartService();
                if (res && !res.success) {
                    btnRestart.disabled = false;
                    alert(`No se pudo reiniciar el servicio:\n${res.error || 'Error'}`);
                }
            } catch {
                btnRestart.disabled = false;
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
