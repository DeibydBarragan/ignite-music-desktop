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
COOKIES_FILE=./cookies.txt
COOKIES_FROM_BROWSER=chrome
NEXT_PUBLIC_SUPABASE_URL=https://test.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=anon-token-123
`;
        const result = parseConfigFile(envContent, '.env');
        assert.equal(result.success, true);
        assert.equal(result.config.discordToken, 'my-discord-bot-token-1234567890');
        assert.equal(result.config.clientId, '1557938456225915001');
        assert.equal(result.config.clientSecret, 'oauth-secret-key-456');
        assert.equal(result.config.guildId, '1011718919473610863');
        assert.equal(result.config.apiSecret, 'ea02b1d82a1970cd732e7ddd2b3a8452dece30d170d137fac13ce21f1cb65186');
        assert.equal(result.config.port, 3005);
        assert.equal(result.config.cookiesFile, undefined);
        assert.equal(result.config.cookiesFromBrowser, 'chrome');
        assert.equal(result.config.supabaseUrl, 'https://test.supabase.co');
        assert.equal(result.config.supabaseKey, 'anon-token-123');
    });

    test('parseConfigFile parses .json format accurately', () => {
        const jsonContent = JSON.stringify({
            discordToken: 'token-abc',
            clientId: '123456789',
            clientSecret: 'secret-xyz',
            guildId: '987654321',
            apiSecret: '12345678901234567890123456789012',
            port: 3002,
            cookiesFile: 'C:\\Stale\\Path\\cookies.txt',
        });

        const result = parseConfigFile(jsonContent, 'config.json');
        assert.equal(result.success, true);
        assert.equal(result.config.discordToken, 'token-abc');
        assert.equal(result.config.clientId, '123456789');
        assert.equal(result.config.clientSecret, 'secret-xyz');
        assert.equal(result.config.guildId, '987654321');
        assert.equal(result.config.apiSecret, '12345678901234567890123456789012');
        assert.equal(result.config.port, 3002);
        assert.equal(result.config.cookiesFile, undefined);
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

    test('parseConfigFile rejects Netscape cookies file with descriptive error', () => {
        const cookieContent = `# Netscape HTTP Cookie File
# https://curl.haxx.se/rfc/cookie_spec.html
.youtube.com\tTRUE\t/\tTRUE\t1789456789\tSID\tsample-cookie-value
.youtube.com\tTRUE\t/\tTRUE\t1789456789\tHSID\tsample-hsid-value
`;
        const res1 = parseConfigFile(cookieContent, 'cookies.txt');
        assert.equal(res1.success, false);
        assert.equal(res1.isCookiesFile, true);
        assert.ok(res1.error.includes('cookies'));

        // Reject even if renamed to .env but content is Netscape cookies
        const res2 = parseConfigFile(cookieContent, 'my-file.env');
        assert.equal(res2.success, false);
        assert.equal(res2.isCookiesFile, true);
    });

    test('parseConfigFile rejects unsupported extensions and files with no recognized parameters', () => {
        // Unsupported extension
        const resExt = parseConfigFile('TOKEN=123', 'avatar.png');
        assert.equal(resExt.success, false);
        assert.ok(resExt.error.includes('no es compatible'));

        // Zero recognized parameters
        const resZero = parseConfigFile('RANDOM_VAR=hello\nOTHER_VAR=world', '.env');
        assert.equal(resZero.success, false);
        assert.ok(resZero.error.includes('no contiene ninguna variable'));
    });

    test('parseConfigFile flags incomplete configuration when required bot fields are missing', () => {
        const incompleteEnv = `
PORT=3001
API_SECRET=12345678901234567890123456789012
`;
        const res = parseConfigFile(incompleteEnv, '.env');
        assert.equal(res.success, true);
        assert.equal(res.isValidComplete, false);
        assert.ok(res.missingFields.length >= 3);
    });

    test('parseConfigFile parses VOICE_ENABLED and GROQ_API_KEY from .env and .json', () => {
        const envContent = `
TOKEN=my-token-12345678901234567890
CLIENT_ID=1557938456225915001
CLIENT_SECRET=client-secret-12345
GUILD_ID=1011718919473610863
VOICE_ENABLED=true
GROQ_API_KEY=gsk_test_api_key_abc123
`;
        const res = parseConfigFile(envContent, '.env');
        assert.equal(res.success, true);
        assert.equal(res.config.voiceEnabled, true);
        assert.equal(res.config.groqApiKey, 'gsk_test_api_key_abc123');

        const jsonContent = JSON.stringify({
            discordToken: 'my-token-12345678901234567890',
            clientId: '1557938456225915001',
            clientSecret: 'client-secret-12345',
            guildId: '1011718919473610863',
            voiceEnabled: true,
            groqApiKey: 'gsk_from_json_key',
        });
        const resJson = parseConfigFile(jsonContent, 'config.json');
        assert.equal(resJson.success, true);
        assert.equal(resJson.config.voiceEnabled, true);
        assert.equal(resJson.config.groqApiKey, 'gsk_from_json_key');
    });
});
