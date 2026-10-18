'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
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
        this.state = 'idle'; // 'idle' | 'checking' | 'downloading' | 'verifying' | 'updated' | 'rolled-back' | 'error'
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
     * Extracts zip file into target directory using native tar.exe (libarchive) or PowerShell.
     *
     * @param {string} zipPath
     * @param {string} targetDir
     * @returns {boolean}
     */
    extractZip(zipPath, targetDir) {
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }
        try {
            const tarCmd = process.platform === 'win32' ? 'tar.exe' : 'tar';
            execSync(`${tarCmd} -xf "${zipPath}" -C "${targetDir}"`, { stdio: 'ignore' });
            return true;
        } catch {
            if (process.platform === 'win32') {
                try {
                    execSync(`powershell -NoProfile -NonInteractive -Command "Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${targetDir}' -Force"`, { stdio: 'ignore' });
                    return true;
                } catch {
                    return false;
                }
            }
            return false;
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
            this.setState('rolled-back');
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Downloads and applies release zip package in place with progress tracking.
     *
     * @param {string} downloadUrl
     * @returns {Promise<{ success: boolean, error?: string }>}
     */
    async applyUpdate(downloadUrl) {
        if (!downloadUrl) return { success: false, error: 'NO_DOWNLOAD_URL' };

        this.setState('downloading');
        if (!fs.existsSync(this.serviceDir)) {
            fs.mkdirSync(this.serviceDir, { recursive: true });
        }

        const zipPath = path.join(this.serviceDir, 'update.zip');
        const stagingDir = path.join(this.serviceDir, 'staging');

        try {
            const res = await this.fetch(downloadUrl, {
                headers: { 'User-Agent': 'IgniteLauncher-Updater/1.0.0' },
            });

            if (!res.ok) {
                this.setState('error');
                return { success: false, error: `DOWNLOAD_FAILED_HTTP_${res.status}` };
            }

            const contentLength = Number(res.headers.get?.('content-length')) || 0;
            let transferred = 0;

            if (res.body && typeof res.body.getReader === 'function') {
                const reader = res.body.getReader();
                const chunks = [];
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    chunks.push(value);
                    transferred += value.length;
                    const percent = contentLength > 0 ? Math.round((transferred / contentLength) * 100) : 0;
                    this.emit('download-progress', { transferred, total: contentLength, percent });
                }
                fs.writeFileSync(zipPath, Buffer.concat(chunks));
            } else {
                const buffer = Buffer.from(await res.arrayBuffer());
                fs.writeFileSync(zipPath, buffer);
                this.emit('download-progress', { transferred: buffer.length, total: buffer.length, percent: 100 });
            }

            this.setState('verifying');
            if (fs.existsSync(stagingDir)) {
                fs.rmSync(stagingDir, { recursive: true, force: true });
            }
            fs.mkdirSync(stagingDir, { recursive: true });

            const extracted = this.extractZip(zipPath, stagingDir);
            if (!extracted) {
                this.setState('error');
                return { success: false, error: 'EXTRACTION_FAILED' };
            }

            // Find root directory containing code if GitHub wrapped in a folder
            let contentDir = stagingDir;
            const entries = fs.readdirSync(stagingDir);
            if (entries.length === 1 && fs.statSync(path.join(stagingDir, entries[0])).isDirectory()) {
                contentDir = path.join(stagingDir, entries[0]);
            }

            // Create backup of current files
            this.createBackup();

            // Atomic swap
            if (fs.existsSync(this.currentDir)) {
                fs.rmSync(this.currentDir, { recursive: true, force: true });
            }
            fs.renameSync(contentDir, this.currentDir);

            // Cleanup
            try { fs.rmSync(stagingDir, { recursive: true, force: true }); } catch { /* ignore */ }
            try { fs.unlinkSync(zipPath); } catch { /* ignore */ }

            this.setState('updated');
            return { success: true };
        } catch (err) {
            this.setState('error');
            return { success: false, error: err.message };
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
