'use strict';

export function initSettingsModal(onSaveSuccess) {
    const settingsModal = document.getElementById('settingsModal');
    const settingsAlert = document.getElementById('settingsAlert');
    const btnOpenSettings = document.getElementById('btnOpenSettings');
    const btnCloseSettings = document.getElementById('btnCloseSettings');
    const btnCancelSettings = document.getElementById('btnCancelSettings');
    const btnSaveSettings = document.getElementById('btnSaveSettings');
    const btnGenSecret = document.getElementById('btnGenSecret');
    const btnImportConfig = document.getElementById('btnImportConfig');

    const inputToken = document.getElementById('inputToken');
    const inputClientId = document.getElementById('inputClientId');
    const inputGuildId = document.getElementById('inputGuildId');
    const inputClientSecret = document.getElementById('inputClientSecret');
    const inputApiSecret = document.getElementById('inputApiSecret');
    const inputPort = document.getElementById('inputPort');

    function openModal() {
        if (!settingsModal) return;
        hideAlert();
        settingsModal.style.display = 'flex';
    }

    function closeModal() {
        if (!settingsModal) return;
        settingsModal.style.display = 'none';
        hideAlert();
    }

    function showAlert(type, messageHtml) {
        if (!settingsAlert) return;
        settingsAlert.className = `alert-box alert-${type}`;
        settingsAlert.innerHTML = messageHtml;
        settingsAlert.style.display = 'block';
    }

    function hideAlert() {
        if (!settingsAlert) return;
        settingsAlert.style.display = 'none';
        settingsAlert.innerHTML = '';
    }

    if (btnOpenSettings) btnOpenSettings.addEventListener('click', openModal);
    if (btnCloseSettings) btnCloseSettings.addEventListener('click', closeModal);
    if (btnCancelSettings) btnCancelSettings.addEventListener('click', closeModal);

    if (settingsModal) {
        settingsModal.addEventListener('click', (e) => {
            if (e.target === settingsModal) closeModal();
        });
    }

    // Toggle password fields
    document.querySelectorAll('.btn-toggle-pw').forEach((btn) => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            const target = document.getElementById(targetId);
            if (!target) return;
            if (target.type === 'password') {
                target.type = 'text';
                btn.textContent = '🔒';
            } else {
                target.type = 'password';
                btn.textContent = '👁️';
            }
        });
    });

    // Generate secret
    if (btnGenSecret) {
        btnGenSecret.addEventListener('click', async () => {
            try {
                const secret = await window.igniteLauncher.generateApiSecret();
                if (inputApiSecret) inputApiSecret.value = secret;
            } catch (err) {
                console.warn('Could not generate secret:', err);
            }
        });
    }

    // Import configuration from file (.env or .json)
    if (btnImportConfig) {
        btnImportConfig.addEventListener('click', async () => {
            try {
                const res = await window.igniteLauncher.importConfigFile();
                if (!res || res.canceled) return;
                if (!res.success) {
                    showAlert('error', res.error || 'No se pudo importar el archivo.');
                    return;
                }
                populateFields(res.config);
                const fileLabel = res.filename ? `<strong>${res.filename}</strong>` : 'el archivo seleccionado';
                showAlert('success', `Datos importados desde ${fileLabel}. Revisa los campos y haz clic en Guardar.`);
            } catch (err) {
                showAlert('error', `Error al importar: ${err.message}`);
            }
        });
    }

    // Save configuration
    if (btnSaveSettings) {
        btnSaveSettings.addEventListener('click', async (e) => {
            e.preventDefault();
            hideAlert();

            const payload = {
                discordToken: inputToken?.value || '',
                clientId: inputClientId?.value || '',
                guildId: inputGuildId?.value || '',
                clientSecret: inputClientSecret?.value || '',
                apiSecret: inputApiSecret?.value || '',
                port: Number(inputPort?.value) || 3001,
            };

            btnSaveSettings.disabled = true;
            btnSaveSettings.textContent = 'Guardando...';

            try {
                const res = await window.igniteLauncher.saveConfig(payload);
                if (res.success) {
                    showAlert('success', '<strong>¡Configuración guardada exitosamente!</strong>');
                    setTimeout(() => {
                        closeModal();
                        if (typeof onSaveSuccess === 'function') onSaveSuccess();
                    }, 800);
                } else {
                    const list = (res.errors || []).map((err) => `<li>${err}</li>`).join('');
                    showAlert('error', `<ul>${list}</ul>`);
                }
            } catch (err) {
                showAlert('error', `Error: ${err.message}`);
            } finally {
                btnSaveSettings.disabled = false;
                btnSaveSettings.textContent = 'Guardar Credenciales';
            }
        });
    }

    function populateFields(cfg) {
        if (!cfg) return;
        if (inputToken) inputToken.value = cfg.discordToken || '';
        if (inputClientId) inputClientId.value = cfg.clientId || '';
        if (inputGuildId) inputGuildId.value = cfg.guildId || '';
        if (inputClientSecret) inputClientSecret.value = cfg.clientSecret || '';
        if (inputApiSecret) inputApiSecret.value = cfg.apiSecret || '';
        if (inputPort) inputPort.value = cfg.port || 3001;
    }

    return {
        openModal,
        closeModal,
        populateFields,
    };
}
