'use strict';

/**
 * Discord Permission Flags:
 * ADMINISTRATOR = 0x8 (1 << 3)
 * MANAGE_GUILD  = 0x20 (1 << 5)
 */
const PERM_ADMINISTRATOR = 0x8n;
const PERM_MANAGE_GUILD = 0x20n;

/**
 * Verifies guild membership and administrative rights using Bot token REST calls.
 * Robustly checks:
 * 1. Direct guild membership status.
 * 2. Guild ownership (Owner has absolute bypass).
 * 3. Cumulative role permissions (including @everyone role and all assigned member roles).
 * 4. Backward-compatible fallback for explicit permissions field.
 *
 * @param {string} botToken Discord bot token
 * @param {string} guildId Target guild snowflake
 * @param {string} userId Member user snowflake
 * @param {typeof fetch} [fetchFn] Optional fetch implementation for testing
 * @returns {Promise<{ isMember: boolean, isAdmin?: boolean, canManage?: boolean, isOwner?: boolean, nick?: string, roles?: string[], error?: string }>}
 */
async function verifyGuildMembership(botToken, guildId, userId, fetchFn = globalThis.fetch) {
    if (!botToken || !guildId || !userId) {
        return {
            isMember: false,
            error: 'MISSING_PARAMETERS',
        };
    }

    const cleanToken = botToken.trim().replace(/^Bot\s+/i, '');
    const cleanGuildId = guildId.trim();
    const cleanUserId = userId.trim();
    const memberUrl = `https://discord.com/api/v10/guilds/${cleanGuildId}/members/${cleanUserId}`;
    const defaultHeaders = {
        Authorization: `Bot ${cleanToken}`,
        'User-Agent': 'IgniteLauncher/1.0.0',
    };

    let lastError = null;
    const maxRetries = 2;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetchFn(memberUrl, {
                method: 'GET',
                headers: defaultHeaders,
            });

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

            if (response.status === 429 && attempt < maxRetries) {
                await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
                continue;
            }

            if (response.status !== 200) {
                const errText = await response.text();
                return {
                    isMember: false,
                    error: `DISCORD_API_ERROR_${response.status}: ${errText}`,
                };
            }

            const data = await response.json();
            let isOwner = false;
            let cumulativePermissions = 0n;

            // 1. Backwards compatibility / interaction context permissions field
            if (data.permissions) {
                try {
                    cumulativePermissions |= BigInt(data.permissions);
                } catch { /* ignore parse error */ }
            }

            // 2. Check guild ownership (Owner has all administrator permissions)
            try {
                const guildRes = await fetchFn(`https://discord.com/api/v10/guilds/${cleanGuildId}`, {
                    method: 'GET',
                    headers: defaultHeaders,
                });
                if (guildRes.status === 200) {
                    const guildData = await guildRes.json();
                    if (guildData?.owner_id === cleanUserId) {
                        isOwner = true;
                    }
                }
            } catch {
                // Non-fatal: if guild endpoint fails or is rate-limited, continue with roles
            }

            // 3. Compute cumulative permissions from assigned roles + @everyone role
            if (!isOwner) {
                try {
                    const rolesRes = await fetchFn(`https://discord.com/api/v10/guilds/${cleanGuildId}/roles`, {
                        method: 'GET',
                        headers: defaultHeaders,
                    });
                    if (rolesRes.status === 200) {
                        const rolesList = await rolesRes.json();
                        if (Array.isArray(rolesList)) {
                            const memberRoleSet = new Set(Array.isArray(data.roles) ? data.roles : []);
                            for (const role of rolesList) {
                                // @everyone role has id equal to guildId, applies to all members
                                if (role.id === cleanGuildId || memberRoleSet.has(role.id)) {
                                    if (role.permissions) {
                                        cumulativePermissions |= BigInt(role.permissions);
                                    }
                                }
                            }
                        }
                    }
                } catch {
                    // Non-fatal: fallback to direct permissions
                }
            }

            const isAdmin = isOwner || ((cumulativePermissions & PERM_ADMINISTRATOR) === PERM_ADMINISTRATOR);
            const canManage = isAdmin || ((cumulativePermissions & PERM_MANAGE_GUILD) === PERM_MANAGE_GUILD);

            return {
                isMember: true,
                isAdmin,
                canManage,
                isOwner,
                nick: data.nick || data.user?.global_name || data.user?.username || null,
                roles: Array.isArray(data.roles) ? data.roles : [],
            };
        } catch (err) {
            lastError = err;
            if (attempt < maxRetries) {
                await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
                continue;
            }
        }
    }

    return {
        isMember: false,
        error: `NETWORK_ERROR: ${lastError?.message || 'unknown error'}`,
    };
}

module.exports = {
    verifyGuildMembership,
    PERM_ADMINISTRATOR,
    PERM_MANAGE_GUILD,
};
