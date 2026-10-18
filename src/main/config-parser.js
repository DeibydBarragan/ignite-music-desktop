'use strict';

const path = require('node:path');
const { generateApiSecret } = require('./config-schema');

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
 * Extracts normalized app configuration from .env or .json file content.
 *
 * @param {string} content Raw file content
 * @param {string} [filename=''] Filename to determine parse strategy
 * @returns {{ success: boolean, config?: object, error?: string }}
 */
function parseConfigFile(content, filename = '') {
    if (!content || typeof content !== 'string') {
        return { success: false, error: 'El archivo está vacío o no contiene texto legible.' };
    }

    let raw = {};
    const ext = path.extname(filename).toLowerCase();

    if (ext === '.json') {
        try {
            raw = JSON.parse(content);
        } catch {
            return { success: false, error: 'El archivo JSON tiene un formato inválido.' };
        }
    } else {
        raw = parseEnv(content);
    }

    const discordToken = raw.discordToken || raw.DISCORD_TOKEN || raw.TOKEN || '';
    const clientId = raw.clientId || raw.CLIENT_ID || raw.DISCORD_CLIENT_ID || '';
    const clientSecret = raw.clientSecret || raw.CLIENT_SECRET || raw.DISCORD_CLIENT_SECRET || '';
    const guildId = raw.guildId || raw.GUILD_ID || raw.DISCORD_GUILD_ID || raw.NEXT_PUBLIC_DEFAULT_GUILD_ID || '';
    let apiSecret = raw.apiSecret || raw.API_SECRET || raw.IGNITE_API_SECRET || '';
    if (!apiSecret || apiSecret.trim().length < 32) {
        apiSecret = generateApiSecret();
    }
    const cookiesFile = raw.cookiesFile || raw.COOKIES_FILE || '';
    const cookiesFromBrowser = raw.cookiesFromBrowser || raw.COOKIES_FROM_BROWSER || '';
    const port = Number(raw.port || raw.PORT || raw.API_PORT) || 3001;
    const supabaseUrl = raw.supabaseUrl || raw.SUPABASE_URL || raw.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseKey = raw.supabaseKey || raw.SUPABASE_KEY || raw.NEXT_PUBLIC_SUPABASE_ANON_KEY || raw.SUPABASE_ANON_KEY || raw.SUPABASE_SERVICE_ROLE_KEY || '';

    return {
        success: true,
        config: {
            discordToken: String(discordToken).trim(),
            clientId: String(clientId).trim(),
            clientSecret: String(clientSecret).trim(),
            guildId: String(guildId).trim(),
            apiSecret: String(apiSecret).trim(),
            port,
            cookiesFile: String(cookiesFile).trim(),
            cookiesFromBrowser: String(cookiesFromBrowser).trim(),
            supabaseUrl: String(supabaseUrl).trim(),
            supabaseKey: String(supabaseKey).trim(),
        },
    };
}

module.exports = {
    parseEnv,
    parseConfigFile,
};
