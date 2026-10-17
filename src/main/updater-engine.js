'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { app } = require('electron');

/**
 * Compares two semantic version strings (e.g. "17.0.0" vs "17.1.0").
 * Returns true if candidate is strictly newer than current.
 *
 * @param {string} current
 * @param {string} candidate
 * @returns {boolean}
 */
function isNewerVersion(current, candidate) {
    if (!current || !candidate) return false;
    const cleanCur = current.replace(/^v/i, '').trim();
    const cleanCand = candidate.replace(/^v/i, '').trim();

    const partsCur = cleanCur.split('.').map(Number);
    const partsCand = cleanCand.split('.').map(Number);

    for (let i = 0; i < 3; i++) {
        const a = partsCand[i] || 0;
        const b = partsCur[i] || 0;
        if (a > b) return true;
        if (a < b) return false;
    }
    return false;
}

class UpdaterEngine extends EventEmitter {
    /**
     * @param {string} [customDataDir]
     * @param {typeof fetch} [customFetch]
     */
    constructor(customDataDir, customFetch = globalThis.fetch) {
        super();
        this.dataDir = customDataDir || (app && typeof app.getPath === 'function' ? app.getPath('userData') : path.join(process.cwd(), '.data'));
        this.serviceDir = path.join(this.dataDir, 'service');
        this.currentDir = path.join(this.serviceDir, 'current');
        this.backupDir = path.join(this.serviceDir, 'backup');
        this.fetch = customFetch;
        this.state = 'idle'; // 'idle' | 'checking' | 'downloading' | 'verifying' | 'error'
    }

    setState(newState) {
        this.state = newState;
        this.emit('status-changed', { state: this.state });
    }

    async checkForUpdates(currentVersion = '17.0.0', repo = 'DeibydBarragan/ignite-music') {
        this.setState('checking');
        const url = `https://api.github.com/repos/${repo}/releases/latest`;

        try {
            const res = await this.fetch(url, {
                headers: {
                    'User-Agent': 'IgniteLauncher-Updater/1.0.0',
                    Accept: 'application/vnd.github.v3+json',
                },
            });

            if (!res.ok) {
                this.setState('idle');
                return { available: false, error: `HTTP_${res.status}` };
            }

            const release = await res.json();
            const latestTag = release.tag_name || release.name || '';
            const newer = isNewerVersion(currentVersion, latestTag);

            // Find release zip asset or fallback to zipball_url
            const zipAsset = Array.isArray(release.assets)
                ? release.assets.find((a) => a.name.endsWith('.zip'))
                : null;
            const downloadUrl = zipAsset ? zipAsset.browser_download_url : release.zipball_url;

            this.setState('idle');
            return {
                available: newer,
                currentVersion,
                latestVersion: latestTag,
                releaseNotes: release.body || '',
                downloadUrl,
            };
        } catch (err) {
            this.setState('error');
            return { available: false, error: err.message };
        }
    }

    /**
     * Creates an atomic backup of current directory before replacing files.
     */
    createBackup() {
        if (!fs.existsSync(this.currentDir)) return false;
        try {
            if (fs.existsSync(this.backupDir)) {
                fs.rmSync(this.backupDir, { recursive: true, force: true });
            }
            fs.cpSync(this.currentDir, this.backupDir, { recursive: true });
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Restores backup directory in case new version fails startup health check.
     */
    rollback() {
        if (!fs.existsSync(this.backupDir)) return false;
        try {
            if (fs.existsSync(this.currentDir)) {
                fs.rmSync(this.currentDir, { recursive: true, force: true });
            }
            fs.renameSync(this.backupDir, this.currentDir);
            this.emit('status-changed', { state: 'rolled-back' });
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Updates yt-dlp binary to latest release.
     *
     * @param {string} targetBinDir
     * @returns {Promise<{ success: boolean, version?: string, error?: string }>}
     */
    async updateYtDlp(targetBinDir) {
        const apiUrl = 'https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest';
        try {
            const res = await this.fetch(apiUrl, {
                headers: { 'User-Agent': 'IgniteLauncher/1.0.0' },
            });
            if (!res.ok) return { success: false, error: `HTTP_${res.status}` };

            const data = await res.json();
            const tag = data.tag_name || 'latest';

            const assetName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
            const asset = data.assets?.find((a) => a.name === assetName);
            if (!asset?.browser_download_url) {
                return { success: false, error: 'ASSET_NOT_FOUND' };
            }

            const downloadRes = await this.fetch(asset.browser_download_url);
            if (!downloadRes.ok) return { success: false, error: 'DOWNLOAD_FAILED' };

            const buffer = Buffer.from(await downloadRes.arrayBuffer());
            if (!fs.existsSync(targetBinDir)) fs.mkdirSync(targetBinDir, { recursive: true });

            const outPath = path.join(targetBinDir, assetName);
            fs.writeFileSync(outPath, buffer);
            if (process.platform !== 'win32') {
                fs.chmodSync(outPath, 0o755);
            }

            return { success: true, version: tag };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }
}

module.exports = {
    UpdaterEngine,
    isNewerVersion,
};
