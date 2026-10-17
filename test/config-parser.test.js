'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { parseEnv, parseConfigFile } = require('../src/main/config-parser');

describe('ConfigParser Unit Tests', () => {
    test('parseEnv parses key=value pairs, ignores comments and trims quotes', () => {
        const raw = `
# Comment line
DISCORD_TOKEN="my-secret-token"
CLIENT_ID='1557938456225915001'
CLIENT_SECRET=my-oauth-secret
PORT=3001
`;
        const res = parseEnv(raw);
        assert.equal(res.DISCORD_TOKEN, 'my-secret-token');
        assert.equal(res.CLIENT_ID, '1557938456225915001');
        assert.equal(res.CLIENT_SECRET, 'my-oauth-secret');
        assert.equal(res.PORT, '3001');
    });

    test('parseConfigFile parses .env format and normalizes known field aliases', () => {
        const envContent = `
TOKEN=my-discord-bot-token-1234567890
DISCORD_CLIENT_ID=1557938456225915001
DISCORD_CLIENT_SECRET=oauth-secret-key-456
NEXT_PUBLIC_DEFAULT_GUILD_ID=1011718919473610863
IGNITE_API_SECRET=ea02b1d82a1970cd732e7ddd2b3a8452dece30d170d137fac13ce21f1cb65186
API_PORT=3005
`;
        const result = parseConfigFile(envContent, '.env');
        assert.equal(result.success, true);
        assert.equal(result.config.discordToken, 'my-discord-bot-token-1234567890');
        assert.equal(result.config.clientId, '1557938456225915001');
        assert.equal(result.config.clientSecret, 'oauth-secret-key-456');
        assert.equal(result.config.guildId, '1011718919473610863');
        assert.equal(result.config.apiSecret, 'ea02b1d82a1970cd732e7ddd2b3a8452dece30d170d137fac13ce21f1cb65186');
        assert.equal(result.config.port, 3005);
    });

    test('parseConfigFile parses .json format accurately', () => {
        const jsonContent = JSON.stringify({
            discordToken: 'token-abc',
            clientId: '123456789',
            clientSecret: 'secret-xyz',
            guildId: '987654321',
            apiSecret: '12345678901234567890123456789012',
            port: 3002,
        });

        const result = parseConfigFile(jsonContent, 'config.json');
        assert.equal(result.success, true);
        assert.equal(result.config.discordToken, 'token-abc');
        assert.equal(result.config.clientId, '123456789');
        assert.equal(result.config.clientSecret, 'secret-xyz');
        assert.equal(result.config.guildId, '987654321');
        assert.equal(result.config.apiSecret, '12345678901234567890123456789012');
        assert.equal(result.config.port, 3002);
    });

    test('parseConfigFile autogenerates API Secret if missing or too short', () => {
        const envContent = `
TOKEN=token-abc-12345678901234567890
CLIENT_ID=123456789012345678
CLIENT_SECRET=secret-12345
GUILD_ID=987654321098765432
`;
        const result = parseConfigFile(envContent, '.env');
        assert.equal(result.success, true);
        assert.equal(typeof result.config.apiSecret, 'string');
        assert.equal(result.config.apiSecret.length, 64);
    });

    test('parseConfigFile handles empty or invalid inputs gracefully', () => {
        const empty = parseConfigFile('', '.env');
        assert.equal(empty.success, false);

        const badJson = parseConfigFile('{ bad json', 'config.json');
        assert.equal(badJson.success, false);
    });
});
