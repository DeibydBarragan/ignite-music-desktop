'use strict';

import { Icons } from './icons.js';

let toastTimeout = null;

/**
 * Displays an in-app frosted glass toast notification, replacing native OS alerts.
 * @param {string} title
 * @param {string} message
 * @param {'error'|'success'|'warning'} [type='error']
 */
export function showToast(title, message, type = 'error') {
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
            toastIconSlot.innerHTML = Icons.ShieldCheck(20);
        } else {
            toastIconSlot.innerHTML = Icons.ShieldAlert(20);
        }
    }

    toast.style.display = 'flex';

    if (btnDismissToast) {
        btnDismissToast.onclick = () => {
            toast.style.display = 'none';
        };
    }

    toastTimeout = setTimeout(() => {
        toast.style.display = 'none';
        toastTimeout = null;
    }, 6000);
}
