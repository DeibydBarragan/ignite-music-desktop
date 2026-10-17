'use strict';

/**
 * Discord Permission Flags:
 * ADMINISTRATOR = 0x8 (1 << 3)
 * MANAGE_GUILD  = 0x20 (1 << 5)
 */
const PERM_ADMINISTRATOR = 0x8n;
const PERM_MANAGE_GUILD = 0x20n;

/**
 * Verifies guild membership and administrative rights using Bot token REST call.
 *
 * @param {string} botToken Discord bot token
 * @param {string} guildId Target guild snowflake
 * @param {string} userId Member user snowflake
 * @param {typeof fetch} [fetchFn] Optional fetch implementation for testing
 * @returns {Promise<{ isMember: boolean, isAdmin?: boolean, canManage?: boolean, nick?: string, roles?: string[], error?: string }>}
 */
async function verifyGuildMembership(botToken, guildId, userId, fetchFn = globalThis.fetch) {
    if (!botToken || !guildId || !userId) {
        return {
            isMember: false,
            error: 'MISSING_PARAMETERS',
        };
    }

    const cleanToken = botToken.trim().replace(/^Bot\s+/i, '');
    const url = `https://discord.com/api/v10/guilds/${guildId.trim()}/members/${userId.trim()}`;

    try {
        const response = await fetchFn(url, {
            method: 'GET',
            headers: {
                Authorization: `Bot ${cleanToken}`,
                'User-Agent': 'IgniteLauncher/1.0.0',
            },
        });

        if (response.status === 200) {
            const data = await response.json();
            const permissionsBitfield = data.permissions ? BigInt(data.permissions) : 0n;
            const isAdmin = (permissionsBitfield & PERM_ADMINISTRATOR) === PERM_ADMINISTRATOR;
            const canManage = (permissionsBitfield & PERM_MANAGE_GUILD) === PERM_MANAGE_GUILD;

            return {
                isMember: true,
                isAdmin,
                canManage: isAdmin || canManage,
                nick: data.nick || data.user?.global_name || data.user?.username || null,
                roles: Array.isArray(data.roles) ? data.roles : [],
            };
        }

        if (response.status === 404) {
            return {
                isMember: false,
                error: 'NOT_IN_GUILD',
            };
        }

        if (response.status === 401 || response.status === 403) {
            return {
                isMember: false,
                error: 'BOT_UNAUTHORIZED_OR_NOT_IN_GUILD',
            };
        }

        const errText = await response.text();
        return {
            isMember: false,
            error: `DISCORD_API_ERROR_${response.status}: ${errText}`,
        };
    } catch (err) {
        return {
            isMember: false,
            error: `NETWORK_ERROR: ${err.message}`,
        };
    }
}

module.exports = {
    verifyGuildMembership,
    PERM_ADMINISTRATOR,
    PERM_MANAGE_GUILD,
};
