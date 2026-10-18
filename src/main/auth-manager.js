'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { shell, app, safeStorage } = require('electron');

const OAUTH_PORT = 53134;
const OAUTH_REDIRECT_URI = `http://127.0.0.1:${OAUTH_PORT}/callback`;

class AuthManager {
    static get REDIRECT_URI() {
        return OAUTH_REDIRECT_URI;
    }

    constructor(customDataDir, customFetch = globalThis.fetch) {
        this.dataDir = customDataDir || (app && typeof app.getPath === 'function' ? app.getPath('userData') : path.join(process.cwd(), '.data'));
        this.sessionFile = path.join(this.dataDir, 'launcher-session.json');
        this.fetch = customFetch;
        this.currentServer = null;
    }

    /**
     * Encrypts sensitive string using safeStorage if available.
     *
     * @param {string} plainText
     * @returns {string}
     */
    encryptField(plainText) {
        if (!plainText) return '';
        try {
            if (safeStorage && typeof safeStorage.isEncryptionAvailable === 'function' && safeStorage.isEncryptionAvailable()) {
                const encrypted = safeStorage.encryptString(plainText);
                return `enc:safe:${encrypted.toString('base64')}`;
            }
        } catch {
            // Fall back to protected encoding below
        }
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

    loadSession() {
        if (!fs.existsSync(this.sessionFile)) return null;
        try {
            const data = JSON.parse(fs.readFileSync(this.sessionFile, 'utf8'));
            if (!data.user?.id) return null;
            return {
                user: data.user,
                authenticatedAt: data.authenticatedAt,
                expiresAt: data.expiresAt || null,
                tokenType: data.tokenType || 'Bearer',
                accessToken: this.decryptField(data.accessToken),
                refreshToken: this.decryptField(data.refreshToken),
            };
        } catch {
            return null;
        }
    }

    saveSession(session) {
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }
        const toStore = {
            user: session.user || null,
            authenticatedAt: session.authenticatedAt || new Date().toISOString(),
            expiresAt: session.expiresAt || null,
            tokenType: session.tokenType || 'Bearer',
            accessToken: session.accessToken ? this.encryptField(session.accessToken) : '',
            refreshToken: session.refreshToken ? this.encryptField(session.refreshToken) : '',
        };
        const tmp = `${this.sessionFile}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(toStore, null, 2), 'utf8');
        fs.renameSync(tmp, this.sessionFile);
    }

    clearSession() {
        try { fs.unlinkSync(this.sessionFile); } catch { /* ignore */ }
    }

    async refreshSession(clientId, clientSecret) {
        const session = this.loadSession();
        if (!session || !session.refreshToken) {
            return { success: false, error: 'NO_REFRESH_TOKEN' };
        }

        try {
            const res = await this.fetch('https://discord.com/api/v10/oauth2/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: clientId.trim(),
                    client_secret: clientSecret.trim(),
                    grant_type: 'refresh_token',
                    refresh_token: session.refreshToken,
                }).toString(),
            });

            if (!res.ok) {
                this.clearSession();
                return { success: false, error: 'REFRESH_TOKEN_EXPIRED' };
            }

            const tokenData = await res.json();
            const userRes = await this.fetch('https://discord.com/api/v10/users/@me', {
                headers: { Authorization: `${tokenData.token_type || 'Bearer'} ${tokenData.access_token}` },
            });

            let userProfile = session.user;
            if (userRes.ok) {
                const userData = await userRes.json();
                userProfile = {
                    id: userData.id,
                    username: userData.username,
                    globalName: userData.global_name || userData.username,
                    avatar: userData.avatar,
                    avatarUrl: userData.avatar
                        ? `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png?size=128`
                        : `https://cdn.discordapp.com/embed/avatars/${(BigInt(userData.id) >> 22n) % 6n}.png`,
                };
            }

            const expiresAt = new Date(Date.now() + (Number(tokenData.expires_in) || 604800) * 1000).toISOString();
            this.saveSession({
                user: userProfile,
                authenticatedAt: new Date().toISOString(),
                expiresAt,
                tokenType: tokenData.token_type || 'Bearer',
                accessToken: tokenData.access_token,
                refreshToken: tokenData.refresh_token || session.refreshToken,
            });

            return { success: true, user: userProfile };
        } catch (err) {
            return { success: false, error: `REFRESH_EXCEPTION: ${err.message}` };
        }
    }

    async startOAuthFlow(clientId, clientSecret) {
        if (!clientId || !clientSecret) {
            return { success: false, error: 'CLIENT_ID_OR_SECRET_MISSING' };
        }

        if (this.currentServer) {
            try { this.currentServer.close(); } catch { /* ignore */ }
            this.currentServer = null;
        }

        return new Promise((resolve) => {
            let handled = false;

            const finish = (result) => {
                if (handled) return;
                handled = true;
                try { server.close(); } catch { /* ignore */ }
                this.currentServer = null;
                resolve(result);
            };

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

                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end('<!DOCTYPE html><html><body style="background:#0b0f19;color:#6ee7b7;font-family:sans-serif;text-align:center;padding:40px;"><h2 style="color:#10b981;">✅ ¡Autenticación Completada!</h2><p>Puedes cerrar esta pestaña y volver a Ignite Music Launcher.</p><script>setTimeout(()=>window.close(),2500);</script></body></html>');

                try {
                    const tokenRes = await this.fetch('https://discord.com/api/v10/oauth2/token', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: new URLSearchParams({
                            client_id: clientId.trim(),
                            client_secret: clientSecret.trim(),
                            grant_type: 'authorization_code',
                            code,
                            redirect_uri: OAUTH_REDIRECT_URI,
                        }).toString(),
                    });

                    if (!tokenRes.ok) {
                        const tokenErr = await tokenRes.text();
                        finish({ success: false, error: `TOKEN_EXCHANGE_FAILED: ${tokenErr}` });
                        return;
                    }

                    const tokenData = await tokenRes.json();
                    const userRes = await this.fetch('https://discord.com/api/v10/users/@me', {
                        headers: { Authorization: `${tokenData.token_type} ${tokenData.access_token}` },
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

                    const expiresAt = new Date(Date.now() + (Number(tokenData.expires_in) || 604800) * 1000).toISOString();
                    this.saveSession({
                        user: userProfile,
                        authenticatedAt: new Date().toISOString(),
                        expiresAt,
                        tokenType: tokenData.token_type || 'Bearer',
                        accessToken: tokenData.access_token,
                        refreshToken: tokenData.refresh_token,
                    });
                    finish({ success: true, user: userProfile });
                } catch (err) {
                    finish({ success: false, error: `AUTH_EXCEPTION: ${err.message}` });
                }
            });

            const timeoutTimer = setTimeout(() => {
                finish({ success: false, error: 'AUTH_TIMEOUT' });
            }, 120_000);
            timeoutTimer.unref?.();

            server.listen(OAUTH_PORT, '127.0.0.1', () => {
                this.currentServer = server;
                const authUrl = `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(clientId.trim())}&response_type=code&redirect_uri=${encodeURIComponent(OAUTH_REDIRECT_URI)}&scope=identify`;
                try {
                    shell.openExternal(authUrl);
                } catch (err) {
                    finish({ success: false, error: `COULD_NOT_OPEN_BROWSER: ${err.message}` });
                }
            });

            server.on('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    finish({
                        success: false,
                        error: `PORT_IN_USE: El puerto local ${OAUTH_PORT} para OAuth2 está ocupado por otro proceso o instancia. Cierra la aplicación que use el puerto e intenta de nuevo.`,
                    });
                } else {
                    finish({ success: false, error: `SERVER_ERROR: ${err.message}` });
                }
            });
        });
    }
}

module.exports = { AuthManager, OAUTH_PORT, OAUTH_REDIRECT_URI };
