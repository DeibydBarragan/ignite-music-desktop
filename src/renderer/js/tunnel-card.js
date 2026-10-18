'use strict';

import { Icons } from './icons.js';

export function initTunnelCard() {
    const tunnelDot = document.getElementById('tunnelDot');
    const tunnelStatusLabel = document.getElementById('tunnelStatusLabel');
    const tunnelUrlInput = document.getElementById('tunnelUrlDisplay');
    const btnCopyTunnelUrl = document.getElementById('btnCopyTunnelUrl');
    const tunnelCard = document.querySelector('.tunnel-card-box');
    const tunnelCloudIconSlot = document.getElementById('tunnelCloudIconSlot');

    let currentUrl = null;

    function updateTunnelUI(status) {
        const state = status.state || 'stopped';
        currentUrl = status.url || null;

        if (state === 'connected' && currentUrl) {
            if (tunnelDot) tunnelDot.className = 'status-indicator status-online';
            if (tunnelCard) tunnelCard.classList.add('tunnel-active');
            if (tunnelStatusLabel) {
                tunnelStatusLabel.textContent = 'Túnel Activo';
                tunnelStatusLabel.style.color = 'var(--status-online)';
            }
            if (tunnelCloudIconSlot) tunnelCloudIconSlot.innerHTML = Icons.Cloud(18);
            if (tunnelUrlInput) tunnelUrlInput.value = currentUrl;
            if (btnCopyTunnelUrl) btnCopyTunnelUrl.disabled = false;
        } else if (state === 'connecting') {
            if (tunnelDot) tunnelDot.className = 'status-indicator status-starting';
            if (tunnelCard) tunnelCard.classList.remove('tunnel-active');
            if (tunnelStatusLabel) {
                tunnelStatusLabel.textContent = 'Conectando túnel...';
                tunnelStatusLabel.style.color = 'var(--status-warning)';
            }
            if (tunnelCloudIconSlot) {
                tunnelCloudIconSlot.innerHTML = `<span class="spin">${Icons.Loader2(18)}</span>`;
            }
            if (tunnelUrlInput) {
                tunnelUrlInput.value = 'Conectando túnel seguro de Cloudflare...';
            }
            if (btnCopyTunnelUrl) btnCopyTunnelUrl.disabled = true;
        } else if (state === 'error') {
            if (tunnelDot) tunnelDot.className = 'status-indicator status-crashed';
            if (tunnelCard) tunnelCard.classList.remove('tunnel-active');
            if (tunnelStatusLabel) {
                tunnelStatusLabel.textContent = 'Error en Túnel';
                tunnelStatusLabel.style.color = '#ef4444';
            }
            if (tunnelCloudIconSlot) tunnelCloudIconSlot.innerHTML = Icons.Cloud(18);
            if (tunnelUrlInput) {
                tunnelUrlInput.value = 'No se pudo iniciar el túnel de Cloudflare';
            }
            if (btnCopyTunnelUrl) btnCopyTunnelUrl.disabled = true;
        } else {
            if (tunnelDot) tunnelDot.className = 'status-indicator status-offline';
            if (tunnelCard) tunnelCard.classList.remove('tunnel-active');
            if (tunnelStatusLabel) {
                tunnelStatusLabel.textContent = 'Inactivo';
                tunnelStatusLabel.style.color = 'var(--muted)';
            }
            if (tunnelCloudIconSlot) tunnelCloudIconSlot.innerHTML = Icons.Cloud(18);
            if (tunnelUrlInput) {
                tunnelUrlInput.value = 'Esperando inicio del servicio...';
            }
            if (btnCopyTunnelUrl) btnCopyTunnelUrl.disabled = true;
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
        });
    }

    // Initial status fetch
    if (window.igniteLauncher && typeof window.igniteLauncher.getTunnelStatus === 'function') {
        window.igniteLauncher.getTunnelStatus().then(updateTunnelUI).catch(() => {});
    }

    return { updateTunnelUI };
}
