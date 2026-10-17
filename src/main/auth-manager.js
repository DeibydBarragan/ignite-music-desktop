'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { shell, app, safeStorage } = require('electron');

class AuthManager {
    /**
     * @param {string} [customDataDir] Optional custom directory for testing
     * @param {typeof fetch} [customFetch] Optional fetch implementation for testing
     */
    constructor(customDataDir, customFetch = globalThis.fetch) {
        this.dataDir = customDataDir || (app && typeof app.getPath === 'function' ? app.getPath('userData') : path.join(process.cwd(), '.data'));
        this.sessionFile = path.join(this.dataDir, 'launcher-session.json');
        this.fetch = customFetch;
        this.currentServer = null;
    }

    /**
     * Loads persisted user session if available.
     *
     * @returns {object|null}
     */
    loadSession() {
        if (!fs.existsSync(this.sessionFile)) return null;
        try {
            const raw = fs.readFileSync(this.sessionFile, 'utf8');
            const data = JSON.parse(raw);
            if (!data.user || !data.user.id) return null;
            return data;
        } catch {
            return null;
        }
    }

    /**
     * Persists user session to disk.
     *
     * @param {object} session
     */
    saveSession(session) {
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }
        const tmp = `${this.sessionFile}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(session, null, 2), 'utf8');
        fs.renameSync(tmp, this.sessionFile);
    }

    /**
     * Clears current session.
     */
    clearSession() {
        try { fs.unlinkSync(this.sessionFile); } catch { /* ignore */ }
    }

    /**
     * Initiates the Discord OAuth2 handshake using an ephemeral loopback HTTP server.
     *
     * @param {string} clientId
     * @param {string} clientSecret
     * @returns {Promise<{ success: boolean, user?: object, error?: string }>}
     */
    async startOAuthFlow(clientId, clientSecret) {
        if (!clientId || !clientSecret) {
            return { success: false, error: 'CLIENT_ID_OR_SECRET_MISSING' };
        }

        // Clean up any lingering server
        if (this.currentServer) {
            try { this.currentServer.close(); } catch { /* ignore */ }
            this.currentServer = null;
        }

        return new Promise((resolve) => {
            let handled = false;

            const server = http.createServer(async (req, res) => {
                const reqUrl = new URL(req.url, `http://${req.headers.host}`);
                if (reqUrl.pathname !== '/callback') {
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    res.end('Not Found');
                    return;
                }

                const code = reqUrl.searchParams.get('code');
                const error = reqUrl.searchParams.get('error');

                if (error || !code) {
                    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                    res.end('<!DOCTYPE html><html><body style="background:#0b0f19;color:#fca5a5;font-family:sans-serif;text-align:center;padding:40px;"><h2>❌ Autenticación Cancelada</h2><p>Puedes cerrar esta ventana y reintentar desde Ignite Music.</p></body></html>');
                    finish({ success: false, error: error || 'NO_AUTH_CODE' });
                    return;
                }

                // Successful callback received
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end('<!DOCTYPE html><html><body style="background:#0b0f19;color:#6ee7b7;font-family:sans-serif;text-align:center;padding:40px;"><h2 style="color:#10b981;">✅ ¡Autenticación Completada!</h2><p>Puedes cerrar esta pestaña y volver a Ignite Music Launcher.</p><script>setTimeout(()=>window.close(),2500);</script></body></html>');

                try {
                    const port = server.address().port;
                    const redirectUri = `http://127.0.0.1:${port}/callback`;

                    // Exchange code for token
                    const tokenRes = await this.fetch('https://discord.com/api/v10/oauth2/token', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded',
                        },
                        body: new URLSearchParams({
                            client_id: clientId.trim(),
                            client_secret: clientSecret.trim(),
                            grant_type: 'authorization_code',
                            code,
                            redirect_uri: redirectUri,
                        }).toString(),
                    });

                    if (!tokenRes.ok) {
                        const tokenErr = await tokenRes.text();
                        finish({ success: false, error: `TOKEN_EXCHANGE_FAILED: ${tokenErr}` });
                        return;
                    }

                    const tokenData = await tokenRes.json();

                    // Fetch user info
                    const userRes = await this.fetch('https://discord.com/api/v10/users/@me', {
                        headers: {
                            Authorization: `${tokenData.token_type} ${tokenData.access_token}`,
                        },
                    });

                    if (!userRes.ok) {
                        finish({ success: false, error: 'FETCH_USER_FAILED' });
                        return;
                    }

                    const userData = await userRes.json();
                    const userProfile = {
                        id: userData.id,
                        username: userData.username,
                        globalName: userData.global_name || userData.username,
                        avatar: userData.avatar,
                        avatarUrl: userData.avatar
                            ? `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png?size=128`
                            : `https://cdn.discordapp.com/embed/avatars/${(BigInt(userData.id) >> 22n) % 6n}.png`,
                    };

                    const session = {
                        user: userProfile,
                        authenticatedAt: new Date().toISOString(),
                    };

                    this.saveSession(session);
                    finish({ success: true, user: userProfile });
                } catch (err) {
                    finish({ success: false, error: `AUTH_EXCEPTION: ${err.message}` });
                }
            });

            const finish = (result) => {
                if (handled) return;
                handled = true;
                try { server.close(); } catch { /* ignore */ }
                this.currentServer = null;
                resolve(result);
            };

            // Timeout after 120 seconds if user abandons auth
            const timeoutTimer = setTimeout(() => {
                finish({ success: false, error: 'AUTH_TIMEOUT' });
            }, 120_000);
            timeoutTimer.unref?.();

            server.listen(0, '127.0.0.1', () => {
                this.currentServer = server;
                const port = server.address().port;
                const redirectUri = `http://127.0.0.1:${port}/callback`;

                const authUrl = `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(clientId.trim())}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=identify`;

                try {
                    shell.openExternal(authUrl);
                } catch (err) {
                    finish({ success: false, error: `COULD_NOT_OPEN_BROWSER: ${err.message}` });
                }
            });

            server.on('error', (err) => {
                finish({ success: false, error: `SERVER_ERROR: ${err.message}` });
            });
        });
    }
}

module.exports = { AuthManager };
