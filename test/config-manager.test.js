'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
    ConfigManager,
    validateConfig,
    generateApiSecret,
} = require('../src/main/config-manager');

describe('Fase 2: ConfigManager & Credentials Security Tests', () => {
    let tmpDir;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ignite-config-test-'));
    });

    afterEach(() => {
        if (tmpDir && fs.existsSync(tmpDir)) {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    test('generateApiSecret generates a 64-character hex string with sufficient entropy', () => {
        const secret1 = generateApiSecret();
        const secret2 = generateApiSecret();

        assert.equal(typeof secret1, 'string');
        assert.equal(secret1.length, 64);
        assert.match(secret1, /^[0-9a-f]{64}$/);
        assert.notEqual(secret1, secret2);
    });

    test('validateConfig catches missing or malformed fields', () => {
        // Missing fields
        const invalid = validateConfig({});
        assert.equal(invalid.valid, false);
        assert.ok(invalid.errors.length >= 4);

        // Invalid snowflakes
        const badSnowflake = validateConfig({
            discordToken: 'MTAyOTM4NDc1NjQ3MzgxOTI4Mw.G_abcd.1234567890abcdef',
            clientId: 'not-a-number',
            clientSecret: 'secret12345678',
            guildId: '123', // too short
            apiSecret: '12345678901234567890123456789012',
            port: 3001,
        });
        assert.equal(badSnowflake.valid, false);
        assert.ok(badSnowflake.errors.some((e) => e.includes('Client ID')));
        assert.ok(badSnowflake.errors.some((e) => e.includes('Guild ID')));

        // Valid payload
        const valid = validateConfig({
            discordToken: 'MTAyOTM4NDc1NjQ3MzgxOTI4Mw.G_abcd.1234567890abcdef',
            clientId: '102938475647381928',
            clientSecret: 'abcdef1234567890',
            guildId: '987654321098765432',
            apiSecret: '12345678901234567890123456789012',
            port: 3001,
        });
        assert.equal(valid.valid, true);
        assert.equal(valid.errors.length, 0);
    });

    test('ConfigManager encrypts sensitive tokens and decrypts cleanly on load', () => {
        const manager = new ConfigManager(tmpDir);

        const testConfig = {
            discordToken: 'MTAyOTM4NDc1NjQ3MzgxOTI4Mw.G_abcd.1234567890abcdef',
            clientId: '102938475647381928',
            clientSecret: 'my-super-secret-oauth2-key',
            guildId: '987654321098765432',
            apiSecret: 'f87a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8',
            port: 3001,
        };

        const saveRes = manager.saveConfig(testConfig);
        assert.equal(saveRes.success, true);

        // Inspect raw file on disk to ensure sensitive fields are encrypted
        const rawContent = fs.readFileSync(manager.configFile, 'utf8');
        const parsedDisk = JSON.parse(rawContent);

        assert.ok(parsedDisk.discordToken.startsWith('enc:'));
        assert.notEqual(parsedDisk.discordToken, testConfig.discordToken);
        assert.ok(parsedDisk.clientSecret.startsWith('enc:'));
        assert.notEqual(parsedDisk.clientSecret, testConfig.clientSecret);
        assert.ok(parsedDisk.apiSecret.startsWith('enc:'));
        assert.notEqual(parsedDisk.apiSecret, testConfig.apiSecret);

        // Load config through manager
        const loaded = manager.loadConfig();
        assert.equal(loaded.isConfigured, true);
        assert.equal(loaded.discordToken, testConfig.discordToken);
        assert.equal(loaded.clientId, testConfig.clientId);
        assert.equal(loaded.clientSecret, testConfig.clientSecret);
        assert.equal(loaded.guildId, testConfig.guildId);
        assert.equal(loaded.apiSecret, testConfig.apiSecret);
        assert.equal(loaded.port, 3001);
    });

    test('ConfigManager generates and atomically writes valid .env file for ignite-music', () => {
        const manager = new ConfigManager(tmpDir);

        const testConfig = {
            discordToken: 'MTAyOTM4NDc1NjQ3MzgxOTI4Mw.G_abcd.1234567890abcdef',
            clientId: '102938475647381928',
            clientSecret: 'my-super-secret-oauth2-key',
            guildId: '987654321098765432',
            apiSecret: 'f87a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8',
            port: 3001,
        };

        manager.saveConfig(testConfig);

        const targetServiceDir = path.join(tmpDir, 'service');
        fs.mkdirSync(targetServiceDir, { recursive: true });

        const wrote = manager.writeEnvFile(targetServiceDir);
        assert.equal(wrote, true);

        const envFile = path.join(targetServiceDir, '.env');
        assert.ok(fs.existsSync(envFile), '.env file should exist');

        const envContent = fs.readFileSync(envFile, 'utf8');
        assert.ok(envContent.includes('TOKEN=MTAyOTM4NDc1NjQ3MzgxOTI4Mw.G_abcd.1234567890abcdef'));
        assert.ok(envContent.includes('CLIENT_ID=102938475647381928'));
        assert.ok(envContent.includes('CLIENT_SECRET=my-super-secret-oauth2-key'));
        assert.ok(envContent.includes('GUILD_ID=987654321098765432'));
        assert.ok(envContent.includes('PORT=3001'));
        assert.ok(envContent.includes('AUTO_TUNNEL=true'));
    });
});
