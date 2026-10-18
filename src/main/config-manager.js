'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app, safeStorage } = require('electron');
const { DEFAULT_CONFIG, validateConfig, generateApiSecret } = require('./config-schema');

class ConfigManager {
    /**
     * @param {string} [customDataDir] Optional custom directory for testing
     */
    constructor(customDataDir) {
        this.dataDir = customDataDir || (app && typeof app.getPath === 'function' ? app.getPath('userData') : path.join(process.cwd(), '.data'));
        this.configFile = path.join(this.dataDir, 'launcher-config.json');
        this.ensureDir();
    }

    ensureDir() {
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }
    }

    /** Encrypts sensitive string using safeStorage if available. */
    encryptField(plainText) {
        if (!plainText) return '';
        try {
            if (safeStorage?.isEncryptionAvailable?.()) {
                const encrypted = safeStorage.encryptString(plainText);
                return `enc:safe:${encrypted.toString('base64')}`;
            }
        } catch { /* Fall back to protected encoding below */ }
        const b64 = Buffer.from(plainText, 'utf8').toString('base64');
        return `enc:b64:${b64}`;
    }

    /**
     * Decrypts field previously encrypted with encryptField.
     *
     * @param {string} cipherText
     * @returns {string}
     */
    decryptField(cipherText) {
        if (!cipherText || typeof cipherText !== 'string') return '';
        if (cipherText.startsWith('enc:safe:')) {
            try {
                const buf = Buffer.from(cipherText.slice(9), 'base64');
                return safeStorage.decryptString(buf);
            } catch {
                return '';
            }
        }
        if (cipherText.startsWith('enc:b64:')) {
            try {
                return Buffer.from(cipherText.slice(8), 'base64').toString('utf8');
            } catch {
                return '';
            }
        }
        return cipherText;
    }

    /**
     * Loads and decrypts launcher configuration from disk.
     *
     * @returns {object}
     */
    loadConfig() {
        if (!fs.existsSync(this.configFile)) {
            return { ...DEFAULT_CONFIG };
        }

        try {
            const raw = fs.readFileSync(this.configFile, 'utf8');
            const parsed = JSON.parse(raw);

            return {
                discordToken: this.decryptField(parsed.discordToken),
                clientId: parsed.clientId || '',
                clientSecret: this.decryptField(parsed.clientSecret),
                guildId: parsed.guildId || '',
                apiSecret: this.decryptField(parsed.apiSecret),
                port: Number(parsed.port) || 3001,
                isConfigured: Boolean(parsed.isConfigured),
                cookiesFile: parsed.cookiesFile || '',
                cookiesFromBrowser: parsed.cookiesFromBrowser || '',
                supabaseUrl: parsed.supabaseUrl || DEFAULT_CONFIG.supabaseUrl,
                supabaseKey: this.decryptField(parsed.supabaseKey) || DEFAULT_CONFIG.supabaseKey,
            };
        } catch {
            return { ...DEFAULT_CONFIG };
        }
    }

    /**
     * Saves configuration to disk with encrypted sensitive fields.
     *
     * @param {object} newConfig
     * @returns {{ success: boolean, errors?: string[] }}
     */
    saveConfig(newConfig) {
        const validation = validateConfig(newConfig);
        if (!validation.valid) {
            return { success: false, errors: validation.errors };
        }

        const toStore = {
            discordToken: this.encryptField(newConfig.discordToken.trim()),
            clientId: String(newConfig.clientId).trim(),
            clientSecret: this.encryptField(newConfig.clientSecret.trim()),
            guildId: String(newConfig.guildId).trim(),
            apiSecret: this.encryptField(newConfig.apiSecret.trim()),
            port: Number(newConfig.port),
            isConfigured: true,
            cookiesFile: (newConfig.cookiesFile || '').trim(),
            cookiesFromBrowser: (newConfig.cookiesFromBrowser || '').trim(),
            supabaseUrl: (newConfig.supabaseUrl || '').trim(),
            supabaseKey: this.encryptField((newConfig.supabaseKey || '').trim()),
            updatedAt: new Date().toISOString(),
        };

        const tmpFile = `${this.configFile}.tmp`;
        fs.writeFileSync(tmpFile, JSON.stringify(toStore, null, 2), 'utf8');
        fs.renameSync(tmpFile, this.configFile);

        return { success: true };
    }

    /**
     * Generates standard .env string matching ignite-music requirements.
     *
     * @param {object} config Decrypted config
     * @returns {string}
     */
    formatEnvContent(config) {
        const lines = [
            '# Generated automatically by Ignite Music Desktop Launcher',
            `# Updated: ${new Date().toISOString()}`,
            '',
            `TOKEN=${config.discordToken.trim()}`,
            `DISCORD_TOKEN=${config.discordToken.trim()}`,
            `CLIENT_ID=${String(config.clientId).trim()}`,
            `CLIENT_SECRET=${config.clientSecret.trim()}`,
            `GUILD_ID=${String(config.guildId).trim()}`,
            `API_SECRET=${config.apiSecret.trim()}`,
            `PORT=${Number(config.port) || 3001}`,
            `API_PORT=${Number(config.port) || 3001}`,
            'API_ENABLED=true',
            'API_ALLOWED_ORIGINS=*',
            'NODE_ENV=production',
            'AUTO_TUNNEL=true',
        ];

        if (config.cookiesFile) lines.push(`COOKIES_FILE=${config.cookiesFile.trim()}`);
        if (config.cookiesFromBrowser) lines.push(`COOKIES_FROM_BROWSER=${config.cookiesFromBrowser.trim()}`);
        if (config.supabaseUrl) lines.push(`SUPABASE_URL=${config.supabaseUrl.trim()}`);
        if (config.supabaseKey) {
            lines.push(`SUPABASE_KEY=${config.supabaseKey.trim()}`);
            lines.push(`SUPABASE_ANON_KEY=${config.supabaseKey.trim()}`);
            lines.push(`SUPABASE_SERVICE_ROLE_KEY=${config.supabaseKey.trim()}`);
        }

        lines.push('');
        return lines.join('\n');
    }

    /**
     * Writes .env file to the target ignite-music directory atomically.
     *
     * @param {string} targetDir Path to ignite-music directory
     * @param {object} [providedConfig] Optional config override (decrypted)
     * @returns {boolean}
     */
    writeEnvFile(targetDir, providedConfig) {
        const config = providedConfig || this.loadConfig();
        if (!config.isConfigured) return false;

        const envContent = this.formatEnvContent(config);
        const envPath = path.join(targetDir, '.env');
        const tmpPath = `${envPath}.tmp`;

        fs.writeFileSync(tmpPath, envContent, 'utf8');
        fs.renameSync(tmpPath, envPath);
        return true;
    }
}

module.exports = {
    ConfigManager,
    validateConfig,
    generateApiSecret,
    DEFAULT_CONFIG,
};
