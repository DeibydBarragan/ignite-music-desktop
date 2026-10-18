'use strict';

const crypto = require('node:crypto');

const DEFAULT_CONFIG = {
    discordToken: '',
    clientId: '',
    clientSecret: '',
    guildId: '',
    apiSecret: '',
    port: 3001,
    isConfigured: false,
    cookiesFile: '',
    cookiesFromBrowser: '',
    supabaseUrl: '',
    supabaseKey: '',
};

/**
 * Validates configuration values against schema rules.
 *
 * @param {object} config
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateConfig(config) {
    const errors = [];

    if (!config || typeof config !== 'object') {
        return { valid: false, errors: ['La configuración enviada no es válida.'] };
    }

    if (!config.discordToken || typeof config.discordToken !== 'string' || config.discordToken.trim().length < 20) {
        errors.push('El Discord Token del bot es requerido y debe tener al menos 20 caracteres.');
    }

    if (!config.clientId || !/^\d{17,20}$/.test(String(config.clientId).trim())) {
        errors.push('El Client ID debe ser un identificador numérico de Discord válido (17-20 dígitos).');
    }

    if (!config.clientSecret || typeof config.clientSecret !== 'string' || config.clientSecret.trim().length < 10) {
        errors.push('El Client Secret es requerido para el inicio de sesión y OAuth2.');
    }

    if (!config.guildId || !/^\d{17,20}$/.test(String(config.guildId).trim())) {
        errors.push('El Guild ID (ID del servidor) debe ser numérico (17-20 dígitos).');
    }

    if (!config.apiSecret || typeof config.apiSecret !== 'string' || config.apiSecret.trim().length < 32) {
        errors.push('El API Secret debe tener al menos 32 caracteres para garantizar la seguridad.');
    }

    const portNum = Number(config.port);
    if (!Number.isInteger(portNum) || portNum < 1024 || portNum > 65535) {
        errors.push('El puerto debe ser un número entero entre 1024 y 65535 (por defecto: 3001).');
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}

/**
 * Generates a cryptographically strong 64-character hex secret.
 *
 * @returns {string}
 */
function generateApiSecret() {
    return crypto.randomBytes(32).toString('hex');
}

module.exports = {
    DEFAULT_CONFIG,
    validateConfig,
    generateApiSecret,
};
