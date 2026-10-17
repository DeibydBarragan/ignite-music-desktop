'use strict';

/**
 * Initializes the OTA Update Banner and Audio Extractor maintenance controls.
 */
export function initUpdateBanner() {
    const updateBanner = document.getElementById('updateBanner');
    const updateTitle = document.getElementById('updateBannerTitle');
    const updateSubtitle = document.getElementById('updateBannerSubtitle');
    const btnApplyUpdate = document.getElementById('btnApplyUpdate');
    const btnDismissUpdate = document.getElementById('btnDismissUpdate');

    const btnCheckUpdates = document.getElementById('btnCheckUpdates');
    const btnUpdateExtractors = document.getElementById('btnUpdateExtractors');
    const maintenanceStatusLabel = document.getElementById('maintenanceStatusLabel');

    let currentDownloadUrl = '';

    function showBanner(title, subtitle, downloadUrl) {
        if (!updateBanner) return;
        if (updateTitle) updateTitle.textContent = title;
        if (updateSubtitle) updateSubtitle.textContent = subtitle;
        currentDownloadUrl = downloadUrl || '';
        updateBanner.style.display = 'flex';
    }

    function hideBanner() {
        if (updateBanner) updateBanner.style.display = 'none';
    }

    if (btnDismissUpdate) {
        btnDismissUpdate.addEventListener('click', hideBanner);
    }

    if (btnApplyUpdate) {
        btnApplyUpdate.addEventListener('click', () => {
            if (currentDownloadUrl) {
                window.open(currentDownloadUrl, '_blank');
            }
        });
    }

    // Check for updates
    async function checkForUpdates(manual = false) {
        if (maintenanceStatusLabel && manual) {
            maintenanceStatusLabel.textContent = 'Buscando actualizaciones...';
        }

        try {
            const res = await window.igniteLauncher.checkForUpdates();
            if (res.available) {
                showBanner(
                    `Nueva versión disponible: ${res.latestVersion}`,
                    `Versión actual: ${res.currentVersion}. Hay una nueva entrega disponible en GitHub Releases.`,
                    res.downloadUrl
                );
                if (maintenanceStatusLabel && manual) {
                    maintenanceStatusLabel.textContent = `¡Nueva versión ${res.latestVersion} disponible!`;
                    maintenanceStatusLabel.style.color = '#f97316';
                }
            } else {
                if (maintenanceStatusLabel && manual) {
                    maintenanceStatusLabel.textContent = 'Tienes la versión más reciente instalada.';
                    maintenanceStatusLabel.style.color = 'var(--status-online)';
                }
            }
        } catch (err) {
            if (maintenanceStatusLabel && manual) {
                maintenanceStatusLabel.textContent = `Error al verificar: ${err.message}`;
                maintenanceStatusLabel.style.color = '#ef4444';
            }
        }
    }

    // Manual update check button
    if (btnCheckUpdates) {
        btnCheckUpdates.addEventListener('click', () => checkForUpdates(true));
    }

    // Audio extractors (yt-dlp) updater
    if (btnUpdateExtractors) {
        btnUpdateExtractors.addEventListener('click', async () => {
            btnUpdateExtractors.disabled = true;
            if (maintenanceStatusLabel) {
                maintenanceStatusLabel.textContent = 'Descargando última versión de yt-dlp...';
                maintenanceStatusLabel.style.color = '#60a5fa';
            }

            try {
                const res = await window.igniteLauncher.updateAudioExtractors();
                if (res.success) {
                    if (maintenanceStatusLabel) {
                        maintenanceStatusLabel.textContent = `¡yt-dlp actualizado con éxito (${res.version})!`;
                        maintenanceStatusLabel.style.color = 'var(--status-online)';
                    }
                } else {
                    if (maintenanceStatusLabel) {
                        maintenanceStatusLabel.textContent = `Fallo al actualizar: ${res.error || 'Desconocido'}`;
                        maintenanceStatusLabel.style.color = '#ef4444';
                    }
                }
            } catch (err) {
                if (maintenanceStatusLabel) {
                    maintenanceStatusLabel.textContent = `Error: ${err.message}`;
                    maintenanceStatusLabel.style.color = '#ef4444';
                }
            } finally {
                btnUpdateExtractors.disabled = false;
            }
        });
    }

    // Status changed listener
    if (window.igniteLauncher.onUpdaterStatus) {
        window.igniteLauncher.onUpdaterStatus((status) => {
            console.log('[Updater Status]:', status);
        });
    }

    // Auto-check on boot
    checkForUpdates(false).catch(() => {});
}
