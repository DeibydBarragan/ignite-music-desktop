'use strict';

const { test, describe, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { verifyGuildMembership, PERM_ADMINISTRATOR } = require('../src/main/gatekeeper');
const { AuthManager } = require('../src/main/auth-manager');

describe('Fase 3: Discord OAuth2 & Gatekeeper Tests', () => {
    let tmpDir;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ignite-auth-test-'));
    });

    afterEach(() => {
        if (tmpDir && fs.existsSync(tmpDir)) {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    test('verifyGuildMembership validates administrator member on HTTP 200', async () => {
        const mockFetch = mock.fn(async (url, opts) => {
            assert.ok(url.includes('/guilds/111222333444/members/555666777888'));
            assert.equal(opts.headers.Authorization, 'Bot my-bot-token');

            return {
                status: 200,
                json: async () => ({
                    user: { id: '555666777888', username: 'TestAdmin', global_name: 'Test Administrator' },
                    nick: 'The Boss',
                    roles: ['admin-role-id'],
                    permissions: '8', // 0x8 = ADMINISTRATOR
                }),
            };
        });

        const res = await verifyGuildMembership(
            'Bot my-bot-token',
            '111222333444',
            '555666777888',
            mockFetch
        );

        assert.equal(res.isMember, true);
        assert.equal(res.isAdmin, true);
        assert.equal(res.canManage, true);
        assert.equal(res.nick, 'The Boss');
        assert.deepEqual(res.roles, ['admin-role-id']);
    });

    test('verifyGuildMembership handles regular member without administrator rights', async () => {
        const mockFetch = mock.fn(async () => ({
            status: 200,
            json: async () => ({
                user: { id: '999888777', username: 'NormalUser' },
                nick: null,
                roles: ['dj-role-id'],
                permissions: '0',
            }),
        }));

        const res = await verifyGuildMembership('token', '111', '999888777', mockFetch);
        assert.equal(res.isMember, true);
        assert.equal(res.isAdmin, false);
        assert.equal(res.canManage, false);
        assert.equal(res.nick, 'NormalUser');
    });

    test('verifyGuildMembership detects when user is NOT in the guild (HTTP 404)', async () => {
        const mockFetch = mock.fn(async () => ({
            status: 404,
            text: async () => 'Unknown Member',
        }));

        const res = await verifyGuildMembership('token', '111', 'non-member-id', mockFetch);
        assert.equal(res.isMember, false);
        assert.equal(res.error, 'NOT_IN_GUILD');
    });

    test('verifyGuildMembership detects bot unauthorized / not in guild (HTTP 403)', async () => {
        const mockFetch = mock.fn(async () => ({
            status: 403,
            text: async () => 'Missing Access',
        }));

        const res = await verifyGuildMembership('token', '111', 'any-id', mockFetch);
        assert.equal(res.isMember, false);
        assert.equal(res.error, 'BOT_UNAUTHORIZED_OR_NOT_IN_GUILD');
    });

    test('AuthManager saves, loads and clears user session cleanly', () => {
        const auth = new AuthManager(tmpDir);

        assert.equal(auth.loadSession(), null);

        const sessionData = {
            user: {
                id: '123456789012345678',
                username: 'Deibyd',
                globalName: 'Deibyd Barragan',
                avatar: 'abcdef123456',
                avatarUrl: 'https://cdn.discordapp.com/avatars/123456789012345678/abcdef123456.png',
            },
            authenticatedAt: new Date().toISOString(),
        };

        auth.saveSession(sessionData);

        const loaded = auth.loadSession();
        assert.ok(loaded);
        assert.equal(loaded.user.id, '123456789012345678');
        assert.equal(loaded.user.username, 'Deibyd');

        auth.clearSession();
        assert.equal(auth.loadSession(), null);
    });

    test('AuthManager rejects OAuth flow if client credentials are empty', async () => {
        const auth = new AuthManager(tmpDir);
        const res = await auth.startOAuthFlow('', '');
        assert.equal(res.success, false);
        assert.equal(res.error, 'CLIENT_ID_OR_SECRET_MISSING');
    });
});
