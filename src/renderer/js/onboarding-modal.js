'use strict';

import { Icons } from './icons.js';

/**
 * Initializes the First-Run Onboarding Wizard Modal.
 *
 * @param {object} callbacks
 * @param {() => void} callbacks.onManualSelected Called when user chooses manual setup
 * @param {(config: object) => Promise<void>} callbacks.onConfigApplied Called when import is applied
 * @returns {object} API to open/close the modal
 */
export function initOnboardingModal({ onManualSelected, onConfigApplied } = {}) {
    const onboardingModal = document.getElementById('onboardingModal');
    const stepChoice = document.getElementById('onboardingStepChoice');
    const stepImport = document.getElementById('onboardingStepImport');
    const onboardingAlert = document.getElementById('onboardingAlert');

    // Step 1 choices
    const btnOnboardingManual = document.getElementById('btnOnboardingManual');
    const btnOnboardingImport = document.getElementById('btnOnboardingImport');
    const onboardingManualIconSlot = document.getElementById('onboardingManualIconSlot');
    const onboardingImportIconSlot = document.getElementById('onboardingImportIconSlot');

    // Step 2 header & actions
    const onboardingImportHeaderIconSlot = document.getElementById('onboardingImportHeaderIconSlot');
    const btnOnboardingBack = document.getElementById('btnOnboardingBack');
    const btnOnboardingApply = document.getElementById('btnOnboardingApply');
    const onboardingApplyIconSlot = document.getElementById('onboardingApplyIconSlot');

    // Dropzone 1 (Config)
    const dropzoneConfig = document.getElementById('dropzoneConfig');
    const dropzoneConfigIdle = document.getElementById('dropzoneConfigIdle');
    const dropzoneConfigLoaded = document.getElementById('dropzoneConfigLoaded');
    const dropzoneConfigIconSlot = document.getElementById('dropzoneConfigIconSlot');
    const chipConfigIconSlot = document.getElementById('chipConfigIconSlot');
    const labelConfigFilename = document.getElementById('labelConfigFilename');
    const labelConfigMeta = document.getElementById('labelConfigMeta');
    const btnRemoveConfigFile = document.getElementById('btnRemoveConfigFile');
    const badgeConfigStatus = document.getElementById('badgeConfigStatus');
    const fileInputConfig = document.getElementById('fileInputConfig');

    // Dropzone 2 (Cookies)
    const dropzoneCookies = document.getElementById('dropzoneCookies');
    const dropzoneCookiesIdle = document.getElementById('dropzoneCookiesIdle');
    const dropzoneCookiesLoaded = document.getElementById('dropzoneCookiesLoaded');
    const dropzoneCookiesIconSlot = document.getElementById('dropzoneCookiesIconSlot');
    const chipCookiesIconSlot = document.getElementById('chipCookiesIconSlot');
    const labelCookiesFilename = document.getElementById('labelCookiesFilename');
    const labelCookiesMeta = document.getElementById('labelCookiesMeta');
    const btnRemoveCookiesFile = document.getElementById('btnRemoveCookiesFile');
    const badgeCookiesStatus = document.getElementById('badgeCookiesStatus');
    const fileInputCookies = document.getElementById('fileInputCookies');

    // In-memory state for import
    let stagedConfig = null;
    let stagedConfigFilename = '';
    let stagedCookiesContent = null;
    let stagedCookiesFilename = '';

    // Populate Icons
    if (onboardingManualIconSlot) onboardingManualIconSlot.innerHTML = Icons.Sliders(22);
    if (onboardingImportIconSlot) onboardingImportIconSlot.innerHTML = Icons.FileUp(22);
    if (onboardingImportHeaderIconSlot) onboardingImportHeaderIconSlot.innerHTML = Icons.FileUp(18);
    if (dropzoneConfigIconSlot) dropzoneConfigIconSlot.innerHTML = Icons.UploadCloud(26);
    if (chipConfigIconSlot) chipConfigIconSlot.innerHTML = Icons.FileText(16);
    if (dropzoneCookiesIconSlot) dropzoneCookiesIconSlot.innerHTML = Icons.UploadCloud(26);
    if (chipCookiesIconSlot) chipCookiesIconSlot.innerHTML = Icons.FileText(16);
    if (onboardingApplyIconSlot) onboardingApplyIconSlot.innerHTML = Icons.Check(14);

    function showAlert(type, messageHtml) {
        if (!onboardingAlert) return;
        onboardingAlert.className = `alert-box alert-${type}`;
        onboardingAlert.innerHTML = messageHtml;
        onboardingAlert.style.display = 'block';
    }

    function hideAlert() {
        if (!onboardingAlert) return;
        onboardingAlert.style.display = 'none';
        onboardingAlert.innerHTML = '';
    }

    function openModal() {
        if (!onboardingModal) return;
        hideAlert();
        showStep('choice');
        onboardingModal.style.display = 'flex';
    }

    function closeModal() {
        if (!onboardingModal) return;
        onboardingModal.style.display = 'none';
        hideAlert();
    }

    function showStep(step) {
        hideAlert();
        if (step === 'choice') {
            if (stepChoice) stepChoice.style.display = 'block';
            if (stepImport) stepImport.style.display = 'none';
        } else if (step === 'import') {
            if (stepChoice) stepChoice.style.display = 'none';
            if (stepImport) stepImport.style.display = 'block';
        }
    }

    function updateApplyButtonState() {
        if (!btnOnboardingApply) return;
        const canApply = Boolean(
            stagedConfig &&
            stagedConfig.discordToken &&
            stagedConfig.clientId &&
            stagedConfig.guildId
        );
        btnOnboardingApply.disabled = !canApply;
    }

    // Step 1: User choices
    if (btnOnboardingManual) {
        btnOnboardingManual.addEventListener('click', () => {
            closeModal();
            if (typeof onManualSelected === 'function') {
                onManualSelected();
            }
        });
    }

    if (btnOnboardingImport) {
        btnOnboardingImport.addEventListener('click', () => {
            showStep('import');
        });
    }

    if (btnOnboardingBack) {
        btnOnboardingBack.addEventListener('click', () => {
            showStep('choice');
        });
    }

    // ─────────────────────────────────────────────────────────────────
    // Dropzone 1: Configuration (.env / .json)
    // ─────────────────────────────────────────────────────────────────
    async function handleConfigFile(file) {
        hideAlert();
        if (!file) return;

        // 1. File Type & Name Validation: Reject cookies file in config dropzone
        const lowerName = file.name.toLowerCase();
        if (lowerName === 'cookies.txt' || lowerName.endsWith('-cookies.txt') || lowerName.endsWith('_cookies.txt')) {
            showAlert(
                'error',
                `⚠️ <strong>Archivo de cookies detectado:</strong> El archivo <code>${file.name}</code> no es una configuración (.env / .json). Debes colocarlo en el espacio <strong>2. Archivo de cookies de YouTube (cookies.txt)</strong>.`
            );
            removeConfigFile();
            return;
        }

        const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')).toLowerCase() : '';
        const isEnv = lowerName === '.env' || lowerName.startsWith('.env.') || ext === '.env';
        const isJson = ext === '.json';

        if (!isEnv && !isJson) {
            showAlert(
                'error',
                `❌ <strong>Formato no compatible:</strong> Se detectó "<code>${file.name}</code>". El archivo de configuración debe ser estrictamente un archivo <strong>.env</strong> o <strong>.json</strong>.`
            );
            removeConfigFile();
            return;
        }

        try {
            const content = await file.text();
            if (!content || !content.trim()) {
                showAlert('error', `❌ El archivo <code>${file.name}</code> está vacío.`);
                removeConfigFile();
                return;
            }

            const parsed = await window.igniteLauncher.parseConfigContent(content, file.name);

            if (!parsed.success || !parsed.config) {
                showAlert('error', `❌ ${parsed.error || 'No se pudo interpretar el archivo de configuración.'}`);
                removeConfigFile();
                return;
            }

            // Explicitly ignore cookies from config file: cookies come strictly from dropzone 2
            delete parsed.config.cookiesFile;

            // Content Validation: Check essential tokens required to run the bot
            if (!parsed.isValidComplete) {
                stagedConfig = null;
                stagedConfigFilename = file.name;
                const missingList = parsed.missingFields ? parsed.missingFields.join(', ') : 'credenciales de Discord';
                showAlert(
                    'warning',
                    `⚠️ <strong>Configuración incompleta:</strong> Faltan credenciales requeridas para el bot en este archivo: <strong>${missingList}</strong>.`
                );

                if (labelConfigFilename) labelConfigFilename.textContent = file.name;
                if (labelConfigMeta) {
                    labelConfigMeta.textContent = `Incompleto (faltan ${parsed.missingFields?.length || 0} campos)`;
                }
                if (dropzoneConfigIdle) dropzoneConfigIdle.style.display = 'none';
                if (dropzoneConfigLoaded) dropzoneConfigLoaded.style.display = 'flex';
                if (badgeConfigStatus) {
                    badgeConfigStatus.className = 'badge-pill-status pill-status-warning';
                    badgeConfigStatus.textContent = 'Incompleto ⚠️';
                }
                updateApplyButtonState();
                return;
            }

            stagedConfig = parsed.config;
            stagedConfigFilename = file.name;

            showAlert(
                'success',
                `✓ <strong>Archivo de configuración validado:</strong> Se detectaron ${parsed.foundKeysCount || 3} parámetros válidos listos para aplicar.`
            );

            // Update UI
            if (labelConfigFilename) labelConfigFilename.textContent = file.name;
            if (labelConfigMeta) {
                labelConfigMeta.textContent = `${parsed.foundKeysCount || 3} parámetros detectados`;
            }
            if (dropzoneConfigIdle) dropzoneConfigIdle.style.display = 'none';
            if (dropzoneConfigLoaded) dropzoneConfigLoaded.style.display = 'flex';
            if (badgeConfigStatus) {
                badgeConfigStatus.className = 'badge-pill-status pill-status-online';
                badgeConfigStatus.textContent = 'Listo ✓';
            }

            updateApplyButtonState();
        } catch (err) {
            showAlert('error', `Error al leer el archivo: ${err.message}`);
            removeConfigFile();
        }
    }

    function removeConfigFile() {
        stagedConfig = null;
        stagedConfigFilename = '';
        if (fileInputConfig) fileInputConfig.value = '';
        if (dropzoneConfigIdle) dropzoneConfigIdle.style.display = 'flex';
        if (dropzoneConfigLoaded) dropzoneConfigLoaded.style.display = 'none';
        if (badgeConfigStatus) {
            badgeConfigStatus.className = 'badge-pill-status pill-status-offline';
            badgeConfigStatus.textContent = 'Requerido';
        }
        updateApplyButtonState();
    }

    if (btnRemoveConfigFile) {
        btnRemoveConfigFile.addEventListener('click', (e) => {
            e.stopPropagation();
            removeConfigFile();
        });
    }

    // Bind click to open file picker for Config
    if (dropzoneConfig) {
        dropzoneConfig.addEventListener('click', (e) => {
            if (e.target.closest('#btnRemoveConfigFile')) return;
            if (fileInputConfig) fileInputConfig.click();
        });

        // Drag and Drop listeners
        ['dragenter', 'dragover'].forEach((eventName) => {
            dropzoneConfig.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzoneConfig.classList.add('dropzone-active');
            });
        });

        ['dragleave', 'drop'].forEach((eventName) => {
            dropzoneConfig.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzoneConfig.classList.remove('dropzone-active');
            });
        });

        dropzoneConfig.addEventListener('drop', (e) => {
            const files = e.dataTransfer?.files;
            if (files && files.length > 0) {
                handleConfigFile(files[0]);
            }
        });
    }

    if (fileInputConfig) {
        fileInputConfig.addEventListener('change', (e) => {
            const files = e.target.files;
            if (files && files.length > 0) {
                handleConfigFile(files[0]);
            }
        });
    }

    // ─────────────────────────────────────────────────────────────────
    // Dropzone 2: Cookies (cookies.txt)
    // ─────────────────────────────────────────────────────────────────
    async function handleCookiesFile(file) {
        hideAlert();
        if (!file) return;

        // Check if user accidentally dragged a config file into Cookies dropzone
        const lowerName = file.name.toLowerCase();
        const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')).toLowerCase() : '';
        const isEnv = lowerName === '.env' || lowerName.startsWith('.env.') || ext === '.env';
        const isJson = ext === '.json';

        if (isEnv || isJson) {
            showAlert(
                'error',
                `⚠️ <strong>Archivo de configuración detectado:</strong> <code>${file.name}</code> parece ser un archivo de configuración. Por favor arrástralo o selecciónalo en el espacio <strong>1. Archivo de configuración</strong>.`
            );
            removeCookiesFile();
            return;
        }

        if (ext && ext !== '.txt') {
            showAlert(
                'error',
                `❌ <strong>Formato no compatible:</strong> El archivo de cookies debe ser un archivo de texto <strong>.txt</strong> en formato Netscape. Se detectó "<code>${file.name}</code>".`
            );
            removeCookiesFile();
            return;
        }

        try {
            const content = await file.text();
            const trimmed = content.trim();
            if (!trimmed) {
                showAlert('warning', '⚠️ El archivo cookies.txt seleccionado está vacío.');
                removeCookiesFile();
                return;
            }

            // Check if content is actually a .env or json config
            if (trimmed.includes('DISCORD_TOKEN') || trimmed.includes('CLIENT_ID=') || trimmed.startsWith('{')) {
                showAlert(
                    'error',
                    `⚠️ <strong>Contenido no válido para cookies:</strong> El archivo contiene variables de Discord. Cárgalo en el espacio <strong>1. Archivo de configuración</strong>.`
                );
                removeCookiesFile();
                return;
            }

            const lines = trimmed.split(/\r?\n/).filter(l => l.trim());
            const isNetscapeHeader = trimmed.startsWith('# Netscape HTTP Cookie File') || trimmed.startsWith('# HTTP Cookie File');
            const dataLines = lines.filter(l => !l.startsWith('#'));
            const hasTabCookies = dataLines.some(l => l.split('\t').length >= 5 || l.includes('youtube.com') || l.includes('google.com'));

            if (!isNetscapeHeader && !hasTabCookies && dataLines.length > 0) {
                showAlert('warning', '⚠️ <strong>Aviso:</strong> El archivo no parece seguir el formato Netscape estándar con columnas tabuladas. Asegúrate de exportarlo con una extensión compatible.');
            } else {
                showAlert('success', `✓ Archivo de cookies de YouTube cargado correctamente (${dataLines.length} cookies detectadas).`);
            }

            stagedCookiesContent = content;
            stagedCookiesFilename = file.name;

            const sizeKb = (file.size / 1024).toFixed(1);
            if (labelCookiesFilename) labelCookiesFilename.textContent = file.name;
            if (labelCookiesMeta) labelCookiesMeta.textContent = `${sizeKb} KB (${dataLines.length} cookies)`;

            if (dropzoneCookiesIdle) dropzoneCookiesIdle.style.display = 'none';
            if (dropzoneCookiesLoaded) dropzoneCookiesLoaded.style.display = 'flex';
            if (badgeCookiesStatus) {
                badgeCookiesStatus.className = 'badge-pill-status pill-status-online';
                badgeCookiesStatus.textContent = 'Cargado ✓';
            }
        } catch (err) {
            showAlert('error', `Error al leer archivo de cookies: ${err.message}`);
            removeCookiesFile();
        }
    }

    function removeCookiesFile() {
        stagedCookiesContent = null;
        stagedCookiesFilename = '';
        if (fileInputCookies) fileInputCookies.value = '';
        if (dropzoneCookiesIdle) dropzoneCookiesIdle.style.display = 'flex';
        if (dropzoneCookiesLoaded) dropzoneCookiesLoaded.style.display = 'none';
        if (badgeCookiesStatus) {
            badgeCookiesStatus.className = 'badge-pill-status pill-status-offline';
            badgeCookiesStatus.textContent = 'Opcional';
        }
    }

    if (btnRemoveCookiesFile) {
        btnRemoveCookiesFile.addEventListener('click', (e) => {
            e.stopPropagation();
            removeCookiesFile();
        });
    }

    if (dropzoneCookies) {
        dropzoneCookies.addEventListener('click', (e) => {
            if (e.target.closest('#btnRemoveCookiesFile')) return;
            if (fileInputCookies) fileInputCookies.click();
        });

        ['dragenter', 'dragover'].forEach((eventName) => {
            dropzoneCookies.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzoneCookies.classList.add('dropzone-active');
            });
        });

        ['dragleave', 'drop'].forEach((eventName) => {
            dropzoneCookies.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzoneCookies.classList.remove('dropzone-active');
            });
        });

        dropzoneCookies.addEventListener('drop', (e) => {
            const files = e.dataTransfer?.files;
            if (files && files.length > 0) {
                handleCookiesFile(files[0]);
            }
        });
    }

    if (fileInputCookies) {
        fileInputCookies.addEventListener('change', (e) => {
            const files = e.target.files;
            if (files && files.length > 0) {
                handleCookiesFile(files[0]);
            }
        });
    }

    // ─────────────────────────────────────────────────────────────────
    // Apply and Save Configuration
    // ─────────────────────────────────────────────────────────────────
    if (btnOnboardingApply) {
        btnOnboardingApply.addEventListener('click', async () => {
            if (!stagedConfig) return;
            hideAlert();

            btnOnboardingApply.disabled = true;
            const originalContent = btnOnboardingApply.innerHTML;
            btnOnboardingApply.innerHTML = `${Icons.Loader2(14, 'spin')} <span>Aplicando...</span>`;

            try {
                // 1. If cookies were staged, save them first
                if (stagedCookiesContent) {
                    const cookieRes = await window.igniteLauncher.saveCookiesFile({ content: stagedCookiesContent });
                    if (cookieRes.success && cookieRes.filePath) {
                        stagedConfig.cookiesFile = cookieRes.filePath;
                    }
                }

                // 2. Save configuration
                const saveRes = await window.igniteLauncher.saveConfig(stagedConfig);
                if (!saveRes.success) {
                    const errMsg = (saveRes.errors || []).join(', ') || 'Error al guardar configuración.';
                    showAlert('error', errMsg);
                    btnOnboardingApply.disabled = false;
                    btnOnboardingApply.innerHTML = originalContent;
                    return;
                }

                closeModal();

                if (typeof onConfigApplied === 'function') {
                    await onConfigApplied(stagedConfig);
                }
            } catch (err) {
                showAlert('error', `Error inesperado: ${err.message}`);
                btnOnboardingApply.disabled = false;
                btnOnboardingApply.innerHTML = originalContent;
            }
        });
    }

    return {
        openModal,
        closeModal,
        showStep,
    };
}
