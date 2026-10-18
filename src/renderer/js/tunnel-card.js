'use strict';

import { Icons } from './icons.js';

export function initTunnelCard() {
    const tunnelDot = document.getElementById('tunnelDot');
    const tunnelStatusLabel = document.getElementById('tunnelStatusLabel');
    const tunnelUrlInput = document.getElementById('tunnelUrlDisplay');
    const btnCopyTunnelUrl = document.getElementById('btnCopyTunnelUrl');
    const btnOpenTunnelUrl = document.getElementById('btnOpenTunnelUrl');
    const tunnelCard = document.querySelector('.tunnel-card-box');

    let currentUrl = null;

    function updateTunnelUI(status) {
        const state = status.state || 'stopped';
        currentUrl = status.url || null;

        if (tunnelUrlInput) {
            tunnelUrlInput.value = currentUrl || 'Esperando inicio del servicio...';
        }

        if (btnCopyTunnelUrl) btnCopyTunnelUrl.disabled = !currentUrl;
        if (btnOpenTunnelUrl) btnOpenTunnelUrl.disabled = !currentUrl;

        if (state === 'connected' && currentUrl) {
            if (tunnelDot) tunnelDot.className = 'status-indicator status-online';
            if (tunnelCard) tunnelCard.classList.add('tunnel-active');
            if (tunnelStatusLabel) {
                tunnelStatusLabel.textContent = 'Túnel Activo';
                tunnelStatusLabel.style.color = 'var(--status-online)';
            }
        } else if (state === 'connecting') {
            if (tunnelDot) tunnelDot.className = 'status-indicator status-starting';
            if (tunnelCard) tunnelCard.classList.remove('tunnel-active');
            if (tunnelStatusLabel) {
                tunnelStatusLabel.textContent = 'Conectando con Cloudflare...';
                tunnelStatusLabel.style.color = 'var(--status-warning)';
            }
        } else if (state === 'error') {
            if (tunnelDot) tunnelDot.className = 'status-indicator status-crashed';
            if (tunnelCard) tunnelCard.classList.remove('tunnel-active');
            if (tunnelStatusLabel) {
                tunnelStatusLabel.textContent = 'Error en Túnel';
                tunnelStatusLabel.style.color = '#ef4444';
            }
        } else {
            if (tunnelDot) tunnelDot.className = 'status-indicator status-offline';
            if (tunnelCard) tunnelCard.classList.remove('tunnel-active');
            if (tunnelStatusLabel) {
                tunnelStatusLabel.textContent = 'Inactivo';
                tunnelStatusLabel.style.color = 'var(--muted)';
            }
        }
    }

    if (btnCopyTunnelUrl) {
        btnCopyTunnelUrl.addEventListener('click', async () => {
            if (!currentUrl) return;
            try {
                await navigator.clipboard.writeText(currentUrl);
                const copyIconSlot = document.getElementById('copyTunnelIconSlot');
                const copyText = document.getElementById('copyTunnelText');
                if (copyIconSlot) copyIconSlot.innerHTML = Icons.Check(13);
                if (copyText) copyText.textContent = '¡Copiado!';
                setTimeout(() => {
                    if (copyIconSlot) copyIconSlot.innerHTML = Icons.Copy(13);
                    if (copyText) copyText.textContent = 'Copiar URL';
                }, 1800);
            } catch (err) {
                console.warn('Copy to clipboard failed:', err);
            }
        });
    }

    if (btnOpenTunnelUrl) {
        btnOpenTunnelUrl.addEventListener('click', () => {
            if (currentUrl) {
                window.open(currentUrl, '_blank');
            }
        });
    }

    // Listeners from supervisor
    if (window.igniteLauncher && typeof window.igniteLauncher.onTunnelStatus === 'function') {
        window.igniteLauncher.onTunnelStatus((status) => {
            updateTunnelUI(status);
        });
    }

    if (window.igniteLauncher && typeof window.igniteLauncher.onTunnelUrl === 'function') {
        window.igniteLauncher.onTunnelUrl((url) => {
            currentUrl = url;
            if (tunnelUrlInput) tunnelUrlInput.value = url;
            if (tunnelDot) tunnelDot.className = 'status-indicator status-online';
            if (tunnelStatusLabel) {
                tunnelStatusLabel.textContent = 'Túnel Activo';
                tunnelStatusLabel.style.color = '#10b981';
            }
            if (btnCopyTunnelUrl) btnCopyTunnelUrl.disabled = false;
            if (btnOpenTunnelUrl) btnOpenTunnelUrl.disabled = false;
        });
    }

    // Initial status fetch
    if (window.igniteLauncher && typeof window.igniteLauncher.getTunnelStatus === 'function') {
        window.igniteLauncher.getTunnelStatus().then(updateTunnelUI).catch(() => {});
    }

    return { updateTunnelUI };
}
