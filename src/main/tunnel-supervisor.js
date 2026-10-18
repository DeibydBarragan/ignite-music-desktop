'use strict';

const { spawn, execSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { EventEmitter } = require('node:events');

const CF_URL_REGEX = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

class TunnelSupervisor extends EventEmitter {
    constructor() {
        super();
        this.child = null;
        this.url = null;
        this.state = 'stopped'; // 'stopped' | 'connecting' | 'connected' | 'error'
        this.port = null;
    }

    getStatus() {
        return {
            state: this.state,
            url: this.url,
            port: this.port,
        };
    }

    setState(newState) {
        if (this.state === newState) return;
        this.state = newState;
        this.emit('status-changed', this.getStatus());
    }

    /**
     * Resolves the cloudflared executable path.
     * Prioritizes production paths (outside app.asar) via process.resourcesPath.
     */
    resolveBinary() {
        const binName = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
        const candidates = [
            // 1. Packaged Electron extraResources: <installDir>/resources/bin/
            process.resourcesPath ? path.join(process.resourcesPath, 'bin', binName) : null,
            process.resourcesPath ? path.join(process.resourcesPath, binName) : null,
            // 2. Development paths (local workspace)
            path.join(__dirname, '../../resources/bin', binName),
            path.resolve(__dirname, '../../../ignite-music/bin', binName),
            // 3. System installed binary paths (Windows)
            'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
            'C:\\Program Files\\cloudflared\\cloudflared.exe',
        ].filter(Boolean);

        for (const candidate of candidates) {
            if (fs.existsSync(candidate)) return candidate;
        }
        return 'cloudflared';
    }

    async start(port = 3001, timeoutMs = 30_000) {
        if (this.child && !this.child.killed && this.url) {
            return { success: true, url: this.url };
        }

        await this.stop();

        this.port = port;
        this.url = null;
        this.setState('connecting');

        const binary = this.resolveBinary();

        return new Promise((resolve) => {
            let settled = false;

            const timer = setTimeout(() => {
                if (!settled) {
                    settled = true;
                    this.setState('error');
                    this.stop();
                    resolve({ success: false, error: 'TIMEOUT_WAITING_FOR_TUNNEL_URL' });
                }
            }, timeoutMs);
            timer.unref?.();

            try {
                this.child = spawn(binary, ['tunnel', '--url', `http://127.0.0.1:${port}`, '--no-autoupdate'], {
                    stdio: ['ignore', 'pipe', 'pipe'],
                    windowsHide: true,
                });

                const onData = (chunk) => {
                    const text = chunk.toString();
                    const match = text.match(CF_URL_REGEX);
                    if (match && !settled) {
                        settled = true;
                        clearTimeout(timer);
                        this.url = match[0];
                        this.setState('connected');
                        this.emit('url-ready', this.url);
                        resolve({ success: true, url: this.url });
                    }
                };

                this.child.stdout?.on('data', onData);
                this.child.stderr?.on('data', onData);

                this.child.on('error', (err) => {
                    if (!settled) {
                        settled = true;
                        clearTimeout(timer);
                        this.setState('error');
                        resolve({ success: false, error: err.message });
                    }
                });

                this.child.on('exit', () => {
                    this.child = null;
                    this.url = null;
                    if (this.state !== 'stopped') {
                        this.setState('stopped');
                    }
                });
            } catch (err) {
                if (!settled) {
                    settled = true;
                    clearTimeout(timer);
                    this.setState('error');
                    resolve({ success: false, error: err.message });
                }
            }
        });
    }

    async stop() {
        if (!this.child || this.child.killed) {
            this.url = null;
            this.setState('stopped');
            return { success: true };
        }

        const child = this.child;
        const pid = child.pid;
        this.child = null;
        this.url = null;
        this.setState('stopped');

        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                try {
                    if (process.platform === 'win32' && pid) {
                        try {
                            execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
                        } catch { /* ignore */ }
                    } else {
                        child.kill('SIGKILL');
                    }
                } catch { /* ignore */ }
                resolve({ success: true });
            }, 2000);
            timer.unref?.();

            child.once('exit', () => {
                clearTimeout(timer);
                resolve({ success: true });
            });

            try {
                child.kill('SIGTERM');
            } catch {
                try { child.kill('SIGKILL'); } catch { /* ignore */ }
            }
        });
    }
}

module.exports = {
    TunnelSupervisor,
    CF_URL_REGEX,
};
