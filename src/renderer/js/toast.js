'use strict';

import { Icons } from './icons.js';

let toastTimeout = null;

/**
 * Displays an in-app frosted glass toast notification modeled directly on ignite-frontend.
 * Appears in the bottom-right corner.
 *
 * @param {string} title
 * @param {string} message
 * @param {'error'|'success'|'info'|'warning'} [type='error']
 * @param {number} [duration=5000]
 */
export function showToast(title, message, type = 'error', duration = 5000) {
    const toast = document.getElementById('appToast');
    const toastTitle = document.getElementById('appToastTitle');
    const toastMessage = document.getElementById('appToastMessage');
    const toastIconSlot = document.getElementById('appToastIconSlot');
    const btnDismissToast = document.getElementById('btnDismissToast');

    if (!toast) return;

    if (toastTimeout) {
        clearTimeout(toastTimeout);
        toastTimeout = null;
    }

    toast.className = `app-toast toast-${type}`;
    if (toastTitle) toastTitle.textContent = title;
    if (toastMessage) toastMessage.textContent = message;

    if (toastIconSlot) {
        if (type === 'success') {
            toastIconSlot.innerHTML = Icons.CheckCircle2(18);
        } else if (type === 'error') {
            toastIconSlot.innerHTML = Icons.AlertCircle(18);
        } else if (type === 'info') {
            toastIconSlot.innerHTML = Icons.Sparkles(18);
        } else {
            toastIconSlot.innerHTML = Icons.AlertCircle(18);
        }
    }

    if (btnDismissToast) {
        btnDismissToast.innerHTML = Icons.X(14);
        btnDismissToast.onclick = () => {
            toast.style.display = 'none';
        };
    }

    toast.style.display = 'flex';
    toast.style.animation = 'none';
    void toast.offsetWidth;
    toast.style.animation = '';

    toastTimeout = setTimeout(() => {
        toast.style.display = 'none';
        toastTimeout = null;
    }, duration);
}

