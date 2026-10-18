'use strict';

import { Icons } from './icons.js';

/**
 * Initializes the exit confirmation modal dialog.
 * Triggered when the user attempts to close the application while
 * the music bot service is active.
 *
 * @returns {{ openModal: () => void, closeModal: () => void }}
 */
export function initExitModal() {
    const confirmExitModal = document.getElementById('confirmExitModal');
    const exitConfirmIconSlot = document.getElementById('exitConfirmIconSlot');
    const minimizeExitIconSlot = document.getElementById('minimizeExitIconSlot');
    const confirmExitIconSlot = document.getElementById('confirmExitIconSlot');
    const btnCancelExit = document.getElementById('btnCancelExit');
    const btnMinimizeExit = document.getElementById('btnMinimizeExit');
    const btnConfirmExit = document.getElementById('btnConfirmExit');

    if (exitConfirmIconSlot) exitConfirmIconSlot.innerHTML = Icons.AlertTriangle(24);
    if (minimizeExitIconSlot) minimizeExitIconSlot.innerHTML = Icons.Minimize2(14);
    if (confirmExitIconSlot) confirmExitIconSlot.innerHTML = Icons.Power(14);

    function openModal() {
        if (!confirmExitModal) return;
        confirmExitModal.style.display = 'flex';
    }

    function closeModal() {
        if (!confirmExitModal) return;
        confirmExitModal.style.display = 'none';
        if (btnConfirmExit) {
            btnConfirmExit.disabled = false;
            btnConfirmExit.innerHTML = `<span id="confirmExitIconSlot">${Icons.Power(14)}</span> <span>Detener y Salir</span>`;
        }
        if (btnCancelExit) btnCancelExit.disabled = false;
        if (btnMinimizeExit) btnMinimizeExit.disabled = false;
    }

    if (btnCancelExit) {
        btnCancelExit.addEventListener('click', closeModal);
    }

    if (btnMinimizeExit) {
        btnMinimizeExit.addEventListener('click', () => {
            closeModal();
            if (window.igniteLauncher && typeof window.igniteLauncher.minimizeToTray === 'function') {
                window.igniteLauncher.minimizeToTray();
            }
        });
    }

    if (btnConfirmExit) {
        btnConfirmExit.addEventListener('click', async () => {
            btnConfirmExit.disabled = true;
            if (btnCancelExit) btnCancelExit.disabled = true;
            if (btnMinimizeExit) btnMinimizeExit.disabled = true;
            btnConfirmExit.innerHTML = '<span class="spinner-sm" style="display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:spin 0.8s linear infinite;margin-right:6px;"></span> <span>Deteniendo y saliendo...</span>';

            try {
                if (window.igniteLauncher && typeof window.igniteLauncher.confirmExit === 'function') {
                    await window.igniteLauncher.confirmExit();
                }
            } catch (err) {
                console.error('Error confirming exit:', err);
                closeModal();
            }
        });
    }

    if (confirmExitModal) {
        confirmExitModal.addEventListener('click', (e) => {
            if (e.target === confirmExitModal) closeModal();
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && confirmExitModal && confirmExitModal.style.display !== 'none') {
            closeModal();
        }
    });

    // Listen for close interception event from Electron main process
    if (window.igniteLauncher && typeof window.igniteLauncher.onCloseRequested === 'function') {
        window.igniteLauncher.onCloseRequested(() => {
            openModal();
        });
    }

    return {
        openModal,
        closeModal,
    };
}
