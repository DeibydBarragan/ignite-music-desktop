'use strict';

/**
 * Escapes HTML characters to prevent XSS in log streams.
 */
function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Converts standard ANSI 16-color codes into styled HTML spans.
 */
function ansiToHtml(text) {
    const escaped = escapeHtml(text);
    return escaped
        .replace(/\x1b\[0m/g, '</span>')
        .replace(/\x1b\[1m/g, '<span style="font-weight:bold;">')
        .replace(/\x1b\[31m/g, '<span style="color:#f87171;">')
        .replace(/\x1b\[32m/g, '<span style="color:#4ade80;">')
        .replace(/\x1b\[33m/g, '<span style="color:#facc15;">')
        .replace(/\x1b\[34m/g, '<span style="color:#60a5fa;">')
        .replace(/\x1b\[35m/g, '<span style="color:#c084fc;">')
        .replace(/\x1b\[36m/g, '<span style="color:#2dd4bf;">')
        .replace(/\x1b\[90m/g, '<span style="color:#9ca3af;">')
        .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, ''); // strip unknown sequences
}

export function initLogViewer() {
    const logContainer = document.getElementById('logContainer');
    const btnClearLogs = document.getElementById('btnClearLogs');
    const btnCopyLogs = document.getElementById('btnCopyLogs');
    const logScrollNotice = document.getElementById('logScrollNotice');

    const MAX_LINES = 1000;
    const entries = [];
    let autoScroll = true;
    let currentFilter = 'all'; // 'all' | 'stdout' | 'stderr'

    function renderLine(entry) {
        if (!logContainer) return;
        if (currentFilter !== 'all' && entry.type !== currentFilter) return;

        const lineEl = document.createElement('div');
        lineEl.className = `log-line log-${entry.type}`;

        const timeStr = entry.timestamp ? entry.timestamp.split('T')[1].slice(0, 8) : '--:--:--';
        lineEl.innerHTML = `<span class="log-time">[${timeStr}]</span> <span class="log-msg">${ansiToHtml(entry.text)}</span>`;

        logContainer.appendChild(lineEl);

        if (autoScroll) {
            logContainer.scrollTop = logContainer.scrollHeight;
        }
    }

    function addLogEntry(entry) {
        entries.push(entry);
        if (entries.length > MAX_LINES) {
            entries.shift();
            if (logContainer && logContainer.firstChild) {
                logContainer.removeChild(logContainer.firstChild);
            }
        }
        renderLine(entry);
    }

    function reRenderAll() {
        if (!logContainer) return;
        logContainer.innerHTML = '';
        for (const entry of entries) {
            renderLine(entry);
        }
        if (autoScroll) {
            logContainer.scrollTop = logContainer.scrollHeight;
        }
    }

    if (logContainer) {
        logContainer.addEventListener('scroll', () => {
            const distanceFromBottom = logContainer.scrollHeight - logContainer.scrollTop - logContainer.clientHeight;
            autoScroll = distanceFromBottom < 30;
            if (logScrollNotice) {
                logScrollNotice.style.display = autoScroll ? 'none' : 'block';
            }
        });
    }

    if (logScrollNotice) {
        logScrollNotice.addEventListener('click', () => {
            autoScroll = true;
            if (logContainer) logContainer.scrollTop = logContainer.scrollHeight;
            logScrollNotice.style.display = 'none';
        });
    }

    if (btnClearLogs) {
        btnClearLogs.addEventListener('click', () => {
            entries.length = 0;
            if (logContainer) logContainer.innerHTML = '';
        });
    }

    if (btnCopyLogs) {
        btnCopyLogs.addEventListener('click', async () => {
            const rawText = entries.map((e) => `[${e.timestamp}] ${e.text}`).join('\n');
            try {
                await navigator.clipboard.writeText(rawText);
                const prev = btnCopyLogs.textContent;
                btnCopyLogs.textContent = '¡Copiado!';
                setTimeout(() => { btnCopyLogs.textContent = prev; }, 1500);
            } catch (err) {
                console.warn('Copy to clipboard failed:', err);
            }
        });
    }

    // Filter tabs
    document.querySelectorAll('.log-filter-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.log-filter-btn').forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.getAttribute('data-filter') || 'all';
            reRenderAll();
        });
    });

    // Listen for live log events from supervisor
    if (window.igniteLauncher && typeof window.igniteLauncher.onLogEntry === 'function') {
        window.igniteLauncher.onLogEntry((entry) => {
            addLogEntry(entry);
        });
    }

    return {
        addLogEntry,
        clear: () => {
            entries.length = 0;
            if (logContainer) logContainer.innerHTML = '';
        },
    };
}
