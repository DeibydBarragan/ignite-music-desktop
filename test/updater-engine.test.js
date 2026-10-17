'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { UpdaterEngine, isNewerVersion } = require('../src/main/updater-engine');

describe('Fase 6: Updater Engine Unit Tests', () => {
    test('isNewerVersion compares semver strings accurately', () => {
        assert.equal(isNewerVersion('1.0.0', '1.0.1'), true);
        assert.equal(isNewerVersion('1.0.0', '1.1.0'), true);
        assert.equal(isNewerVersion('1.0.0', '2.0.0'), true);
        assert.equal(isNewerVersion('v1.0.0', 'v1.0.1'), true);
        assert.equal(isNewerVersion('1.5.0', '1.5.0'), false);
        assert.equal(isNewerVersion('2.0.0', '1.9.9'), false);
        assert.equal(isNewerVersion('1.2.3', '1.2.2'), false);
        assert.equal(isNewerVersion('', '1.0.0'), false);
        assert.equal(isNewerVersion('1.0.0', ''), false);
    });

    test('checkForUpdates detects newer release from mock GitHub API', async () => {
        const mockFetch = async () => ({
            ok: true,
            status: 200,
            json: async () => ({
                tag_name: 'v1.1.0',
                body: 'Fix audio issues and update dependencies',
                assets: [
                    { name: 'ignite-music-v1.1.0.zip', browser_download_url: 'https://github.com/test/download.zip' },
                ],
            }),
        });

        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ignite-updater-test-'));
        try {
            const updater = new UpdaterEngine(tempDir, mockFetch);
            const res = await updater.checkForUpdates('1.0.0');

            assert.equal(res.available, true);
            assert.equal(res.latestVersion, 'v1.1.0');
            assert.equal(res.currentVersion, '1.0.0');
            assert.equal(res.downloadUrl, 'https://github.com/test/download.zip');
            assert.ok(res.releaseNotes.includes('Fix audio issues'));
        } finally {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    test('checkForUpdates reports available: false when already on latest version', async () => {
        const mockFetch = async () => ({
            ok: true,
            status: 200,
            json: async () => ({
                tag_name: 'v1.0.0',
                body: 'Initial release',
                assets: [],
                zipball_url: 'https://github.com/test/zipball.zip',
            }),
        });

        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ignite-updater-test-'));
        try {
            const updater = new UpdaterEngine(tempDir, mockFetch);
            const res = await updater.checkForUpdates('1.0.0');

            assert.equal(res.available, false);
            assert.equal(res.latestVersion, 'v1.0.0');
        } finally {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    test('createBackup and rollback restores previous service files upon failure', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ignite-updater-rollback-'));
        try {
            const updater = new UpdaterEngine(tempDir);
            fs.mkdirSync(updater.currentDir, { recursive: true });
            fs.writeFileSync(path.join(updater.currentDir, 'version.txt'), 'v1.0.0-stable');

            // Create backup
            const backedUp = updater.createBackup();
            assert.equal(backedUp, true);
            assert.ok(fs.existsSync(path.join(updater.backupDir, 'version.txt')));

            // Simulate corrupt or broken update
            fs.writeFileSync(path.join(updater.currentDir, 'version.txt'), 'v1.1.0-corrupted');

            // Trigger rollback
            let rollbackEmitted = false;
            updater.on('status-changed', (s) => {
                if (s.state === 'rolled-back') rollbackEmitted = true;
            });

            const rolledBack = updater.rollback();
            assert.equal(rolledBack, true);
            assert.equal(rollbackEmitted, true);

            // Verify content restored
            const restoredContent = fs.readFileSync(path.join(updater.currentDir, 'version.txt'), 'utf8');
            assert.equal(restoredContent, 'v1.0.0-stable');
        } finally {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    test('updateYtDlp downloads mock yt-dlp binary to target dir', async () => {
        const mockBinaryBuffer = Buffer.from('MOCK_YTDLP_BINARY_CONTENT');
        const mockFetch = async (url) => {
            if (url.includes('/releases/latest')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        tag_name: '2026.10.15',
                        assets: [
                            {
                                name: process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp',
                                browser_download_url: 'https://github.com/yt-dlp/yt-dlp/releases/download/bin',
                            },
                        ],
                    }),
                };
            }
            if (url.includes('/download/bin')) {
                return {
                    ok: true,
                    status: 200,
                    arrayBuffer: async () => mockBinaryBuffer,
                };
            }
            return { ok: false, status: 404 };
        };

        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ignite-ytdlp-test-'));
        try {
            const updater = new UpdaterEngine(tempDir, mockFetch);
            const targetBin = path.join(tempDir, 'bin');

            const res = await updater.updateYtDlp(targetBin);
            assert.equal(res.success, true);
            assert.equal(res.version, '2026.10.15');

            const expectedFile = path.join(targetBin, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
            assert.ok(fs.existsSync(expectedFile));
            assert.equal(fs.readFileSync(expectedFile).toString(), 'MOCK_YTDLP_BINARY_CONTENT');
        } finally {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });
});
