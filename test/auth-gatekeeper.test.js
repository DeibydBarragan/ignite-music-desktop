'use strict';

const { test, describe, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { verifyGuildMembership, PERM_ADMINISTRATOR, PERM_MANAGE_GUILD } = require('../src/main/gatekeeper');
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

    test('verifyGuildMembership validates administrator member on HTTP 200 (direct permissions)', async () => {
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

    test('verifyGuildMembership recognizes server owner without explicit roles', async () => {
        const guildId = '111222333444';
        const ownerId = '999111222333';

        const mockFetch = mock.fn(async (url) => {
            if (url.includes(`/guilds/${guildId}/members/${ownerId}`)) {
                return {
                    status: 200,
                    json: async () => ({
                        user: { id: ownerId, username: 'ServerOwner' },
                        nick: 'Founder',
                        roles: [], // No explicit roles
                    }),
                };
            }
            if (url.endsWith(`/guilds/${guildId}`)) {
                return {
                    status: 200,
                    json: async () => ({
                        id: guildId,
                        name: 'My Awesome Guild',
                        owner_id: ownerId,
                    }),
                };
            }
            return { status: 404, json: async () => ({}) };
        });

        const res = await verifyGuildMembership('token', guildId, ownerId, mockFetch);
        assert.equal(res.isMember, true);
        assert.equal(res.isOwner, true);
        assert.equal(res.isAdmin, true);
        assert.equal(res.canManage, true);
    });

    test('verifyGuildMembership computes admin rights from assigned role permissions in Discord REST', async () => {
        const guildId = '111222333444';
        const userId = '444555666777';

        const mockFetch = mock.fn(async (url) => {
            if (url.includes(`/guilds/${guildId}/members/${userId}`)) {
                // Discord REST endpoint does NOT return data.permissions directly
                return {
                    status: 200,
                    json: async () => ({
                        user: { id: userId, username: 'ModUser' },
                        roles: ['moderator-role-id'],
                    }),
                };
            }
            if (url.endsWith(`/guilds/${guildId}`)) {
                return {
                    status: 200,
                    json: async () => ({ owner_id: 'some-other-owner' }),
                };
            }
            if (url.endsWith(`/guilds/${guildId}/roles`)) {
                return {
                    status: 200,
                    json: async () => ([
                        { id: guildId, name: '@everyone', permissions: '0' },
                        { id: 'moderator-role-id', name: 'Moderator', permissions: String(PERM_ADMINISTRATOR) },
                    ]),
                };
            }
            return { status: 404, json: async () => ({}) };
        });

        const res = await verifyGuildMembership('token', guildId, userId, mockFetch);
        assert.equal(res.isMember, true);
        assert.equal(res.isAdmin, true);
        assert.equal(res.canManage, true);
    });

    test('verifyGuildMembership computes permissions granted to @everyone role', async () => {
        const guildId = '111222333444';
        const userId = '222333444555';

        const mockFetch = mock.fn(async (url) => {
            if (url.includes(`/guilds/${guildId}/members/${userId}`)) {
                return {
                    status: 200,
                    json: async () => ({
                        user: { id: userId, username: 'CommunityUser' },
                        roles: [],
                    }),
                };
            }
            if (url.endsWith(`/guilds/${guildId}`)) {
                return {
                    status: 200,
                    json: async () => ({ owner_id: 'owner-id' }),
                };
            }
            if (url.endsWith(`/guilds/${guildId}/roles`)) {
                return {
                    status: 200,
                    json: async () => ([
                        { id: guildId, name: '@everyone', permissions: String(PERM_MANAGE_GUILD) },
                    ]),
                };
            }
            return { status: 404, json: async () => ({}) };
        });

        const res = await verifyGuildMembership('token', guildId, userId, mockFetch);
        assert.equal(res.isMember, true);
        assert.equal(res.isAdmin, false);
        assert.equal(res.canManage, true);
    });

    test('verifyGuildMembership handles regular member without administrator rights', async () => {
        const mockFetch = mock.fn(async (url) => {
            if (url.includes('/members/')) {
                return {
                    status: 200,
                    json: async () => ({
                        user: { id: '999888777', username: 'NormalUser' },
                        nick: null,
                        roles: ['dj-role-id'],
                        permissions: '0',
                    }),
                };
            }
            return { status: 200, json: async () => [] };
        });

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

    test('AuthManager saves, loads and clears user session cleanly with token encryption', () => {
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
            accessToken: 'sensitive-access-token-12345',
            refreshToken: 'sensitive-refresh-token-67890',
            authenticatedAt: new Date().toISOString(),
        };

        auth.saveSession(sessionData);

        // Verify disk contents are encrypted
        const rawFile = fs.readFileSync(auth.sessionFile, 'utf8');
        assert.ok(!rawFile.includes('sensitive-access-token-12345'), 'Access token must be encrypted on disk');
        assert.ok(!rawFile.includes('sensitive-refresh-token-67890'), 'Refresh token must be encrypted on disk');

        // Verify clean decryption
        const loaded = auth.loadSession();
        assert.ok(loaded);
        assert.equal(loaded.user.id, '123456789012345678');
        assert.equal(loaded.user.username, 'Deibyd');
        assert.equal(loaded.accessToken, 'sensitive-access-token-12345');
        assert.equal(loaded.refreshToken, 'sensitive-refresh-token-67890');

        auth.clearSession();
        assert.equal(auth.loadSession(), null);
    });

    test('AuthManager refreshes session seamlessly when refresh token is valid', async () => {
        const mockFetch = mock.fn(async (url) => {
            if (url.includes('/oauth2/token')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        access_token: 'new-refreshed-access-token',
                        refresh_token: 'new-refreshed-refresh-token',
                        token_type: 'Bearer',
                        expires_in: 604800,
                    }),
                };
            }
            if (url.includes('/users/@me')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        id: '123456789012345678',
                        username: 'DeibydUpdated',
                        global_name: 'Deibyd Renewed',
                        avatar: null,
                    }),
                };
            }
            return { ok: false, status: 404 };
        });

        const auth = new AuthManager(tmpDir, mockFetch);
        auth.saveSession({
            user: { id: '123456789012345678', username: 'Deibyd' },
            accessToken: 'old-access-token',
            refreshToken: 'old-refresh-token',
        });

        const res = await auth.refreshSession('client_123', 'secret_456');
        assert.equal(res.success, true);
        assert.equal(res.user.username, 'DeibydUpdated');

        const updated = auth.loadSession();
        assert.equal(updated.accessToken, 'new-refreshed-access-token');
        assert.equal(updated.refreshToken, 'new-refreshed-refresh-token');
    });

    test('AuthManager clears session if refresh token has been revoked', async () => {
        const mockFetch = mock.fn(async () => ({
            ok: false,
            status: 400,
            text: async () => 'invalid_grant',
        }));

        const auth = new AuthManager(tmpDir, mockFetch);
        auth.saveSession({
            user: { id: '123' },
            refreshToken: 'expired-or-revoked-token',
        });

        const res = await auth.refreshSession('client_123', 'secret_456');
        assert.equal(res.success, false);
        assert.equal(res.error, 'REFRESH_TOKEN_EXPIRED');
        assert.equal(auth.loadSession(), null);
    });

    test('AuthManager rejects OAuth flow if client credentials are empty', async () => {
        const auth = new AuthManager(tmpDir);
        const res = await auth.startOAuthFlow('', '');
        assert.equal(res.success, false);
        assert.equal(res.error, 'CLIENT_ID_OR_SECRET_MISSING');
    });
});
