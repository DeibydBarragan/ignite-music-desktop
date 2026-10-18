'use strict';

const path = require('node:path');
const { generateApiSecret } = require('./config-schema');

/**
 * Checks if filename or content matches a Netscape HTTP cookies file.
 *
 * @param {string} content
 * @param {string} [filename='']
 * @returns {boolean}
 */
function isNetscapeCookiesContent(content, filename = '') {
    const lowerName = path.basename(filename || '').toLowerCase();
    if (lowerName === 'cookies.txt' || lowerName.endsWith('-cookies.txt') || lowerName.endsWith('_cookies.txt')) {
        return true;
    }
    const trimmed = (content || '').trim();
    if (trimmed.startsWith('# Netscape HTTP Cookie File') || trimmed.startsWith('# HTTP Cookie File')) {
        return true;
    }
    const lines = trimmed.split(/\r?\n/).filter(l => l.trim() && !l.trim().startsWith('#'));
    if (lines.length > 0) {
        // Tab-delimited Netscape format has 7 columns
        const cookieLines = lines.slice(0, 10).filter(l => l.split('\t').length >= 6);
        if (cookieLines.length >= Math.min(lines.length, 3)) {
            return true;
        }
    }
    return false;
}

/**
 * Parses raw KEY=VALUE lines from .env text format.
 *
 * @param {string} content
 * @returns {Record<string, string>}
 */
function parseEnv(content) {
    const result = {};
    const lines = content.split(/\r?\n/);
    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const eqIdx = line.indexOf('=');
        if (eqIdx === -1) continue;
        const key = line.slice(0, eqIdx).trim();
        let val = line.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
        }
        result[key] = val;
    }
    return result;
}

/**
 * Extracts and strictly validates configuration from .env or .json file content.
 *
 * @param {string} content Raw file content
 * @param {string} [filename=''] Filename to determine parse strategy
 * @returns {{ success: boolean, config?: object, isValidComplete?: boolean, missingFields?: string[], foundKeysCount?: number, isCookiesFile?: boolean, error?: string }}
 */
function parseConfigFile(content, filename = '') {
    if (!content || typeof content !== 'string' || !content.trim()) {
        return { success: false, error: 'El archivo está vacío o no contiene texto legible.' };
    }

    // 1. Detect if the user mistakenly provided a cookies file instead of configuration
    if (isNetscapeCookiesContent(content, filename)) {
        return {
            success: false,
            isCookiesFile: true,
            error: 'El archivo seleccionado es un archivo de cookies (cookies.txt). Debes colocarlo en el espacio "2. Archivo de cookies de YouTube (cookies.txt)".',
        };
    }

    // 2. Validate supported file extensions if filename is provided
    if (filename) {
        const ext = path.extname(filename).toLowerCase();
        const base = path.basename(filename).toLowerCase();
        const isSupported = ext === '.json' || base === '.env' || base.startsWith('.env.') || ext === '.env';
        if (!isSupported) {
            return {
                success: false,
                error: `El formato "${ext || filename}" no es compatible. Por favor selecciona un archivo .env o .json.`,
            };
        }
    }

    let raw = {};
    const ext = path.extname(filename).toLowerCase();

    if (ext === '.json') {
        try {
            raw = JSON.parse(content);
            if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
                return { success: false, error: 'El archivo JSON no contiene un objeto de configuración válido.' };
            }
        } catch {
            return { success: false, error: 'El archivo JSON tiene un formato de sintaxis inválido.' };
        }
    } else {
        raw = parseEnv(content);
    }

    // 3. Count recognized configuration fields present in the raw input
    const recognizedKeys = [
        'discordToken', 'DISCORD_TOKEN', 'TOKEN',
        'clientId', 'CLIENT_ID', 'DISCORD_CLIENT_ID',
        'clientSecret', 'CLIENT_SECRET', 'DISCORD_CLIENT_SECRET',
        'guildId', 'GUILD_ID', 'DISCORD_GUILD_ID', 'NEXT_PUBLIC_DEFAULT_GUILD_ID',
        'apiSecret', 'API_SECRET', 'IGNITE_API_SECRET',
        'port', 'PORT', 'API_PORT',
        'supabaseUrl', 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL',
        'supabaseKey', 'SUPABASE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
        'cookiesFromBrowser', 'COOKIES_FROM_BROWSER',
        'minimizeToTray'
    ];
    const foundKeysCount = recognizedKeys.filter(k => raw[k] !== undefined && String(raw[k]).trim() !== '').length;

    if (foundKeysCount === 0) {
        return {
            success: false,
            error: 'El archivo no contiene ninguna variable o parámetro reconocible de Ignite Music (DISCORD_TOKEN, CLIENT_ID, GUILD_ID, etc.).',
        };
    }

    const discordToken = raw.discordToken || raw.DISCORD_TOKEN || raw.TOKEN || '';
    const clientId = raw.clientId || raw.CLIENT_ID || raw.DISCORD_CLIENT_ID || '';
    const clientSecret = raw.clientSecret || raw.CLIENT_SECRET || raw.DISCORD_CLIENT_SECRET || '';
    const guildId = raw.guildId || raw.GUILD_ID || raw.DISCORD_GUILD_ID || raw.NEXT_PUBLIC_DEFAULT_GUILD_ID || '';
    let apiSecret = raw.apiSecret || raw.API_SECRET || raw.IGNITE_API_SECRET || '';
    if (!apiSecret || apiSecret.trim().length < 32) {
        apiSecret = generateApiSecret();
    }
    // Note: cookiesFile is strictly decoupled and ignored from imported .env or .json files
    // because cookies.txt is an independent physical file managed in its own space.
    const cookiesFromBrowser = raw.cookiesFromBrowser || raw.COOKIES_FROM_BROWSER || '';
    const port = Number(raw.port || raw.PORT || raw.API_PORT) || 3001;
    const supabaseUrl = raw.supabaseUrl || raw.SUPABASE_URL || raw.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseKey = raw.supabaseKey || raw.SUPABASE_KEY || raw.NEXT_PUBLIC_SUPABASE_ANON_KEY || raw.SUPABASE_ANON_KEY || raw.SUPABASE_SERVICE_ROLE_KEY || '';
    const minimizeToTray = raw.minimizeToTray !== undefined ? Boolean(raw.minimizeToTray) : false;

    // 4. Validate essential fields required to operate the bot
    const missingFields = [];
    if (!discordToken || !String(discordToken).trim()) missingFields.push('Token del Bot (DISCORD_TOKEN / TOKEN)');
    if (!clientId || !String(clientId).trim()) missingFields.push('Client ID (CLIENT_ID)');
    if (!guildId || !String(guildId).trim()) missingFields.push('Servidor ID (GUILD_ID)');

    const isValidComplete = missingFields.length === 0;

    return {
        success: true,
        isValidComplete,
        missingFields,
        foundKeysCount,
        config: {
            discordToken: String(discordToken).trim(),
            clientId: String(clientId).trim(),
            clientSecret: String(clientSecret).trim(),
            guildId: String(guildId).trim(),
            apiSecret: String(apiSecret).trim(),
            port,
            cookiesFromBrowser: String(cookiesFromBrowser).trim(),
            supabaseUrl: String(supabaseUrl).trim(),
            supabaseKey: String(supabaseKey).trim(),
            minimizeToTray,
        },
    };
}

module.exports = {
    isNetscapeCookiesContent,
    parseEnv,
    parseConfigFile,
};
