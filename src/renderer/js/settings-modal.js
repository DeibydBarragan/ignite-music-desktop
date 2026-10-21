'use strict';

import { Icons } from './icons.js';

export function initSettingsModal(optionsOrOnSaveSuccess) {
    const callbacks = typeof optionsOrOnSaveSuccess === 'function'
        ? { onSaveSuccess: optionsOrOnSaveSuccess }
        : (optionsOrOnSaveSuccess || {});
    const { onSaveSuccess, onClose } = callbacks;

    const settingsModal = document.getElementById('settingsModal');
    const settingsAlert = document.getElementById('settingsAlert');
    const btnOpenSettings = document.getElementById('btnOpenSettings');
    const btnCloseSettings = document.getElementById('btnCloseSettings');
    const btnCancelSettings = document.getElementById('btnCancelSettings');
    const btnSaveSettings = document.getElementById('btnSaveSettings');
    const btnGenSecret = document.getElementById('btnGenSecret');
    const btnImportConfig = document.getElementById('btnImportConfig');

    const inputToken = document.getElementById('inputToken');
    const statusBadgeToken = document.getElementById('statusBadgeToken');

    const inputClientId = document.getElementById('inputClientId');
    const inputGuildId = document.getElementById('inputGuildId');

    const inputClientSecret = document.getElementById('inputClientSecret');
    const statusBadgeClientSecret = document.getElementById('statusBadgeClientSecret');

    const inputApiSecret = document.getElementById('inputApiSecret');
    const statusBadgeApiSecret = document.getElementById('statusBadgeApiSecret');

    const inputPort = document.getElementById('inputPort');
    const inputCookiesFile = document.getElementById('inputCookiesFile');
    const btnSelectCookiesFile = document.getElementById('btnSelectCookiesFile');
    const btnClearCookiesFile = document.getElementById('btnClearCookiesFile');
    const selectCookiesFromBrowser = document.getElementById('selectCookiesFromBrowser');

    const inputSupabaseUrl = document.getElementById('inputSupabaseUrl');
    const inputSupabaseKey = document.getElementById('inputSupabaseKey');
    const statusBadgeSupabaseKey = document.getElementById('statusBadgeSupabaseKey');

    const checkboxMinimizeToTray = document.getElementById('checkboxMinimizeToTray');
    const checkboxVoiceEnabled = document.getElementById('checkboxVoiceEnabled');
    const inputGroqApiKey = document.getElementById('inputGroqApiKey');
    const statusBadgeGroqApiKey = document.getElementById('statusBadgeGroqApiKey');
    const groqKeyRequiredMark = document.getElementById('groqKeyRequiredMark');

    let currentLoadedConfig = null;

    function openModal() {
        if (!settingsModal) return;
        hideAlert();
        settingsModal.style.display = 'flex';
    }

    function closeModal() {
        if (!settingsModal) return;
        settingsModal.style.display = 'none';
        hideAlert();
        if (typeof onClose === 'function') {
            onClose();
        }
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

    // Dynamic secret input tracking: show "Modificado" when user types, or restore badge when cleared
    function bindSecretInputTracker(inputEl, badgeEl, fieldName) {
        if (!inputEl || !badgeEl) return;
        inputEl.addEventListener('input', () => {
            if (inputEl.value.trim().length > 0) {
                badgeEl.className = 'badge-pill-status pill-status-warning';
                badgeEl.textContent = 'Modificado (sin guardar)';
            } else {
                const wasConfigured = Boolean(currentLoadedConfig && currentLoadedConfig[fieldName]);
                badgeEl.className = `badge-pill-status ${wasConfigured ? 'pill-status-online' : 'pill-status-offline'}`;
                badgeEl.textContent = wasConfigured ? 'Configurado ✓' : 'Sin configurar';
            }
        });
    }

    bindSecretInputTracker(inputToken, statusBadgeToken, 'discordToken');
    bindSecretInputTracker(inputClientSecret, statusBadgeClientSecret, 'clientSecret');
    bindSecretInputTracker(inputApiSecret, statusBadgeApiSecret, 'apiSecret');
    bindSecretInputTracker(inputSupabaseKey, statusBadgeSupabaseKey, 'supabaseKey');
    bindSecretInputTracker(inputGroqApiKey, statusBadgeGroqApiKey, 'groqApiKey');

    if (checkboxVoiceEnabled) {
        checkboxVoiceEnabled.addEventListener('change', () => {
            if (groqKeyRequiredMark) {
                groqKeyRequiredMark.style.display = checkboxVoiceEnabled.checked ? 'inline' : 'none';
            }
        });
    }

    // YouTube cookies file picker (independent from config files)
    if (btnSelectCookiesFile) {
        btnSelectCookiesFile.addEventListener('click', async () => {
            try {
                const res = await window.igniteLauncher.selectCookiesFile();
                if (!res || res.canceled || !res.filePath) return;
                const saveRes = await window.igniteLauncher.saveCookiesFile(res.filePath);
                if (saveRes.success && inputCookiesFile) {
                    inputCookiesFile.value = saveRes.filePath;
                    if (currentLoadedConfig) currentLoadedConfig.cookiesFile = saveRes.filePath;
                    showAlert('success', 'Archivo de cookies guardado y vinculado correctamente.');
                }
            } catch (err) {
                showAlert('error', `Error al seleccionar archivo de cookies: ${err.message}`);
            }
        });
    }
    if (btnClearCookiesFile) {
        btnClearCookiesFile.addEventListener('click', async () => {
            try {
                await window.igniteLauncher.removeCookiesFile();
                if (inputCookiesFile) inputCookiesFile.value = '';
                if (currentLoadedConfig) currentLoadedConfig.cookiesFile = '';
                showAlert('info', 'Archivo de cookies removido.');
            } catch {
                if (inputCookiesFile) inputCookiesFile.value = '';
            }
        });
    }

    // Generate secret
    if (btnGenSecret) {
        btnGenSecret.addEventListener('click', async () => {
            try {
                const secret = await window.igniteLauncher.generateApiSecret();
                if (inputApiSecret) {
                    inputApiSecret.value = secret;
                    if (statusBadgeApiSecret) {
                        statusBadgeApiSecret.className = 'badge-pill-status pill-status-warning';
                        statusBadgeApiSecret.textContent = 'Nuevo secreto generado';
                    }
                }
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
                // Decouple cookies.txt: explicitly preserve existing cookies configuration
                const cookiesToKeep = currentLoadedConfig?.cookiesFile || inputCookiesFile?.value || '';
                populateFields({
                    ...res.config,
                    cookiesFile: cookiesToKeep,
                });
                const fileLabel = res.filename ? `<strong>${res.filename}</strong>` : 'el archivo seleccionado';
                showAlert('success', `Datos importados desde ${fileLabel}. <em>(La configuración de cookies.txt se mantiene independiente)</em>.`);
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

            const tokenTyped = inputToken?.value?.trim() || '';
            const clientSecretTyped = inputClientSecret?.value?.trim() || '';
            const apiSecretTyped = inputApiSecret?.value?.trim() || '';
            const supabaseKeyTyped = inputSupabaseKey?.value?.trim() || '';
            const groqApiKeyTyped = inputGroqApiKey?.value?.trim() || '';

            const payload = {
                discordToken: tokenTyped !== '' ? tokenTyped : (currentLoadedConfig?.discordToken || ''),
                clientId: inputClientId?.value?.trim() || '',
                guildId: inputGuildId?.value?.trim() || '',
                clientSecret: clientSecretTyped !== '' ? clientSecretTyped : (currentLoadedConfig?.clientSecret || ''),
                apiSecret: apiSecretTyped !== '' ? apiSecretTyped : (currentLoadedConfig?.apiSecret || ''),
                port: Number(inputPort?.value) || 3001,
                cookiesFile: inputCookiesFile?.value?.trim() || '',
                cookiesFromBrowser: selectCookiesFromBrowser?.value || '',
                supabaseUrl: inputSupabaseUrl?.value?.trim() || '',
                supabaseKey: supabaseKeyTyped !== '' ? supabaseKeyTyped : (currentLoadedConfig?.supabaseKey || ''),
                minimizeToTray: checkboxMinimizeToTray ? checkboxMinimizeToTray.checked : false,
                voiceEnabled: checkboxVoiceEnabled ? checkboxVoiceEnabled.checked : false,
                groqApiKey: groqApiKeyTyped !== '' ? groqApiKeyTyped : (currentLoadedConfig?.groqApiKey || ''),
            };

            btnSaveSettings.disabled = true;
            btnSaveSettings.textContent = 'Guardando...';

            try {
                const res = await window.igniteLauncher.saveConfig(payload);
                if (res.success) {
                    showAlert('success', '<strong>¡Configuración guardada exitosamente!</strong>');
                    currentLoadedConfig = { ...payload };
                    populateFields(currentLoadedConfig);
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
        currentLoadedConfig = { ...cfg };

        // Masked Discord Token
        if (inputToken) {
            inputToken.value = '';
            if (cfg.discordToken) {
                inputToken.placeholder = '•••••••••••••••••••••••••••••••• (Escribe para cambiar)';
                if (statusBadgeToken) {
                    statusBadgeToken.className = 'badge-pill-status pill-status-online';
                    statusBadgeToken.textContent = 'Configurado ✓';
                }
            } else {
                inputToken.placeholder = 'MTAy... Ingresa tu token de bot';
                if (statusBadgeToken) {
                    statusBadgeToken.className = 'badge-pill-status pill-status-offline';
                    statusBadgeToken.textContent = 'Sin configurar';
                }
            }
        }

        // Public Snowflakes
        if (inputClientId) inputClientId.value = cfg.clientId || '';
        if (inputGuildId) inputGuildId.value = cfg.guildId || '';

        // Masked Client Secret
        if (inputClientSecret) {
            inputClientSecret.value = '';
            if (cfg.clientSecret) {
                inputClientSecret.placeholder = '•••••••••••••••••••••••• (Escribe para cambiar)';
                if (statusBadgeClientSecret) {
                    statusBadgeClientSecret.className = 'badge-pill-status pill-status-online';
                    statusBadgeClientSecret.textContent = 'Configurado ✓';
                }
            } else {
                inputClientSecret.placeholder = 'Client Secret de Discord Portal';
                if (statusBadgeClientSecret) {
                    statusBadgeClientSecret.className = 'badge-pill-status pill-status-offline';
                    statusBadgeClientSecret.textContent = 'Sin configurar';
                }
            }
        }

        // Masked API Secret
        if (inputApiSecret) {
            inputApiSecret.value = '';
            if (cfg.apiSecret) {
                inputApiSecret.placeholder = '•••••••••••••••••••••••••••••••• (Escribe o genera nuevo)';
                if (statusBadgeApiSecret) {
                    statusBadgeApiSecret.className = 'badge-pill-status pill-status-online';
                    statusBadgeApiSecret.textContent = 'Configurado ✓';
                }
            } else {
                inputApiSecret.placeholder = '64-hex secret (o clic en Generar)';
                if (statusBadgeApiSecret) {
                    statusBadgeApiSecret.className = 'badge-pill-status pill-status-offline';
                    statusBadgeApiSecret.textContent = 'Sin configurar';
                }
            }
        }

        if (inputPort) inputPort.value = cfg.port || 3001;
        if (inputCookiesFile) inputCookiesFile.value = cfg.cookiesFile || '';
        if (selectCookiesFromBrowser) selectCookiesFromBrowser.value = cfg.cookiesFromBrowser || '';
        if (inputSupabaseUrl) inputSupabaseUrl.value = cfg.supabaseUrl || '';

        // Masked Supabase Key
        if (inputSupabaseKey) {
            inputSupabaseKey.value = '';
            if (cfg.supabaseKey) {
                inputSupabaseKey.placeholder = '•••••••••••••••••••••••• (Escribe para cambiar)';
                if (statusBadgeSupabaseKey) {
                    statusBadgeSupabaseKey.className = 'badge-pill-status pill-status-online';
                    statusBadgeSupabaseKey.textContent = 'Configurado ✓';
                }
            } else {
                inputSupabaseKey.placeholder = 'eyJhbGciOi... (Opcional)';
                if (statusBadgeSupabaseKey) {
                    statusBadgeSupabaseKey.className = 'badge-pill-status pill-status-offline';
                    statusBadgeSupabaseKey.textContent = 'Sin configurar';
                }
            }
        }

        // System Tray Preference
        if (checkboxMinimizeToTray) {
            checkboxMinimizeToTray.checked = Boolean(cfg.minimizeToTray);
        }

        // Voice Commands & Groq API Key
        if (checkboxVoiceEnabled) {
            checkboxVoiceEnabled.checked = Boolean(cfg.voiceEnabled);
            if (groqKeyRequiredMark) {
                groqKeyRequiredMark.style.display = checkboxVoiceEnabled.checked ? 'inline' : 'none';
            }
        }
        if (inputGroqApiKey) {
            inputGroqApiKey.value = '';
            if (cfg.groqApiKey) {
                inputGroqApiKey.placeholder = '•••••••••••••••••••••••••••••••• (Escribe para cambiar)';
                if (statusBadgeGroqApiKey) {
                    statusBadgeGroqApiKey.className = 'badge-pill-status pill-status-online';
                    statusBadgeGroqApiKey.textContent = 'Configurado ✓';
                }
            } else {
                inputGroqApiKey.placeholder = 'gsk_... Clave de API de Groq';
                if (statusBadgeGroqApiKey) {
                    statusBadgeGroqApiKey.className = 'badge-pill-status pill-status-offline';
                    statusBadgeGroqApiKey.textContent = 'Sin configurar';
                }
            }
        }

        // Cancel Button Text: if not configured, clearly signal return to wizard
        if (btnCancelSettings) {
            btnCancelSettings.textContent = !cfg.isConfigured ? '← Volver al Asistente' : 'Cancelar';
        }
    }

    return {
        openModal,
        closeModal,
        populateFields,
    };
}
