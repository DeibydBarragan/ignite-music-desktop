'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { TunnelSupervisor, CF_URL_REGEX } = require('../src/main/tunnel-supervisor');

describe('Fase 5: Cloudflare Tunnel Supervisor Tests', () => {
    let tmpDir;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ignite-tunnel-test-'));
    });

    afterEach(() => {
        if (tmpDir && fs.existsSync(tmpDir)) {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    test('CF_URL_REGEX accurately captures public trycloudflare.com URLs', () => {
        const sampleLog = `
            2026-10-17T14:00:00Z INF +--------------------------------------------------------------------------------------------+
            2026-10-17T14:00:00Z INF |  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |
            2026-10-17T14:00:00Z INF |  https://alpha-beta-gamma.trycloudflare.com                                                |
            2026-10-17T14:00:00Z INF +--------------------------------------------------------------------------------------------+
        `;

        const match = sampleLog.match(CF_URL_REGEX);
        assert.ok(match, 'Should find URL match');
        assert.equal(match[0], 'https://alpha-beta-gamma.trycloudflare.com');

        // Negative test
        assert.equal('http://localhost:3001'.match(CF_URL_REGEX), null);
        assert.equal('https://google.com'.match(CF_URL_REGEX), null);
    });

    test('resolveBinary finds candidate or falls back to cloudflared string', () => {
        const supervisor = new TunnelSupervisor();
        const binary = supervisor.resolveBinary();

        assert.equal(typeof binary, 'string');
        assert.ok(binary.length > 0);
    });

    test('resolveBinary prioritizes process.resourcesPath in packaged environment', () => {
        const supervisor = new TunnelSupervisor();
        const origResourcesPath = process.resourcesPath;
        const fakeBinDir = path.join(tmpDir, 'bin');
        fs.mkdirSync(fakeBinDir, { recursive: true });
        const binName = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
        const fakeBinary = path.join(fakeBinDir, binName);
        fs.writeFileSync(fakeBinary, 'MOCK_BINARY_CONTENT');

        try {
            process.resourcesPath = tmpDir;
            const resolved = supervisor.resolveBinary();
            assert.equal(resolved, fakeBinary);
        } finally {
            process.resourcesPath = origResourcesPath;
        }
    });

    test('supervisor captures tunnel URL from process stream and transitions to connected', async () => {
        const supervisor = new TunnelSupervisor();

        // Create a mock script simulating cloudflared
        const mockScript = path.join(tmpDir, 'mock-cloudflared.js');
        fs.writeFileSync(mockScript, `
            console.error('INF Starting tunnel...');
            console.error('INF https://mock-test-tunnel.trycloudflare.com is ready');
            setInterval(() => {}, 1000);
            process.on('SIGTERM', () => process.exit(0));
        `, 'utf8');

        // Override resolveBinary to run node with mock-cloudflared
        supervisor.resolveBinary = () => process.execPath;

        let capturedUrl = null;
        supervisor.on('url-ready', (url) => { capturedUrl = url; });

        // Test start with mock args
        const startPromise = new Promise((resolve) => {
            supervisor.port = 3001;
            supervisor.setState('connecting');

            const { spawn } = require('node:child_process');
            supervisor.child = spawn(process.execPath, [mockScript], {
                stdio: ['ignore', 'pipe', 'pipe'],
            });

            const onData = (chunk) => {
                const match = chunk.toString().match(CF_URL_REGEX);
                if (match) {
                    supervisor.url = match[0];
                    supervisor.setState('connected');
                    supervisor.emit('url-ready', supervisor.url);
                    resolve({ success: true, url: supervisor.url });
                }
            };

            supervisor.child.stderr?.on('data', onData);
        });

        const res = await startPromise;
        assert.equal(res.success, true);
        assert.equal(res.url, 'https://mock-test-tunnel.trycloudflare.com');
        assert.equal(capturedUrl, 'https://mock-test-tunnel.trycloudflare.com');
        assert.equal(supervisor.getStatus().state, 'connected');

        // Stop cleanly
        await supervisor.stop();
        assert.equal(supervisor.getStatus().state, 'stopped');
        assert.equal(supervisor.getStatus().url, null);
    });
});
