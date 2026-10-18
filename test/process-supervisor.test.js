'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { ProcessSupervisor, resolveNodeBinary } = require('../src/main/process-supervisor');
const { resolveServiceDir, stopAllServices } = require('../src/main/ipc-handlers');

describe('Fase 4: Process Supervisor Tests', () => {
    let tmpDir;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ignite-proc-test-'));
    });

    afterEach(() => {
        if (tmpDir && fs.existsSync(tmpDir)) {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    test('start returns error when entry point index.js is missing', () => {
        const supervisor = new ProcessSupervisor();
        const res = supervisor.start(tmpDir);

        assert.equal(res.success, false);
        assert.ok(res.error.includes('ENTRY_NOT_FOUND'));
        assert.equal(supervisor.getStatus().state, 'stopped');
    });

    test('resolveNodeBinary prioritizes bundled node when process.resourcesPath has bin/node', () => {
        const origResourcesPath = process.resourcesPath;
        const fakeBinDir = path.join(tmpDir, 'bin');
        fs.mkdirSync(fakeBinDir, { recursive: true });
        const binName = process.platform === 'win32' ? 'node.exe' : 'node';
        const fakeNode = path.join(fakeBinDir, binName);
        fs.writeFileSync(fakeNode, 'MOCK_NODE_BIN');

        try {
            process.resourcesPath = tmpDir;
            const resolved = resolveNodeBinary();
            assert.equal(resolved, fakeNode);
        } finally {
            process.resourcesPath = origResourcesPath;
        }
    });

    test('resolveServiceDir initializes userData/service/current from bundled snapshot on first run', () => {
        const fakeUserData = path.join(tmpDir, 'userdata');
        const fakeResources = path.join(tmpDir, 'resources');
        const fakeBundled = path.join(fakeResources, 'service', 'bundled');
        fs.mkdirSync(fakeBundled, { recursive: true });
        fs.writeFileSync(path.join(fakeBundled, 'index.js'), '// Bundled bot entry');

        const origResourcesPath = process.resourcesPath;
        try {
            process.resourcesPath = fakeResources;
            const resolvedDir = resolveServiceDir({ dataDir: fakeUserData });

            assert.equal(resolvedDir, path.join(fakeUserData, 'service', 'current'));
            assert.ok(fs.existsSync(path.join(fakeUserData, 'service', 'current', 'index.js')));
        } finally {
            process.resourcesPath = origResourcesPath;
        }
    });

    test('stopAllServices gracefully stops active services without error', async () => {
        await assert.doesNotReject(async () => {
            await stopAllServices();
        });
    });

    test('supervisor spawns child, captures stdout/stderr streams and handles graceful stop', async () => {
        const supervisor = new ProcessSupervisor();

        // Create mock index.js that writes logs and stays alive until SIGTERM
        const mockScript = `
            console.log('Bot initialized successfully');
            console.error('Warning: Audio buffer warm');
            setInterval(() => {}, 1000);
            process.on('SIGTERM', () => {
                console.log('Shutting down cleanly');
                process.exit(0);
            });
        `;
        fs.writeFileSync(path.join(tmpDir, 'index.js'), mockScript, 'utf8');

        const logs = [];
        supervisor.on('log', (entry) => logs.push(entry));

        const startRes = supervisor.start(tmpDir, {}, { waitForReady: false });
        assert.equal(startRes.success, true);
        assert.ok(startRes.pid > 0);
        assert.equal(supervisor.getStatus().state, 'running');

        // Wait a short moment for stdio to flush
        await new Promise((r) => setTimeout(r, 200));

        assert.ok(logs.some((l) => l.type === 'stdout' && l.text.includes('Bot initialized successfully')));
        assert.ok(logs.some((l) => l.type === 'stderr' && l.text.includes('Warning: Audio buffer warm')));

        // Graceful stop
        const stopRes = await supervisor.stop(2000);
        assert.equal(stopRes.success, true);
        assert.equal(supervisor.getStatus().state, 'stopped');
    });

    test('supervisor transitions to crashed state when process exits with error code', async () => {
        const supervisor = new ProcessSupervisor();

        const crashScript = `
            console.error('Fatal crash on startup');
            process.exit(1);
        `;
        fs.writeFileSync(path.join(tmpDir, 'index.js'), crashScript, 'utf8');

        const startRes = supervisor.start(tmpDir);
        assert.equal(startRes.success, true);

        // Wait for child to exit
        await new Promise((r) => setTimeout(r, 200));

        const status = supervisor.getStatus();
        assert.equal(status.state, 'crashed');
        assert.equal(status.exitCode, 1);
    });

    test('supervisor emits crash-loop-detected when process exits with error during initial 10s health check', async () => {
        const supervisor = new ProcessSupervisor();

        const crashScript = `
            console.error('Fatal crash on startup');
            process.exit(1);
        `;
        fs.writeFileSync(path.join(tmpDir, 'index.js'), crashScript, 'utf8');

        let crashEvent = null;
        supervisor.on('crash-loop-detected', (data) => {
            crashEvent = data;
        });

        supervisor.start(tmpDir);

        // Wait for child to exit
        await new Promise((r) => setTimeout(r, 200));

        assert.ok(crashEvent, 'Should emit crash-loop-detected');
        assert.equal(crashEvent.exitCode, 1);
    });

    test('supervisor persists logs to daily rotating file and clearLogs truncates it', () => {
        const logsDir = path.join(tmpDir, 'logs');
        const supervisor = new ProcessSupervisor(logsDir);

        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const logFile = path.join(logsDir, `ignite-service-${dateStr}.log`);

        supervisor.emitLog({
            type: 'stdout',
            text: 'Test log line 1',
            timestamp: now.toISOString(),
        });

        assert.ok(fs.existsSync(logFile), 'Log file should be created');
        const content = fs.readFileSync(logFile, 'utf8');
        assert.ok(content.includes('Test log line 1'));

        let clearedEmitted = false;
        supervisor.on('logs-cleared', () => {
            clearedEmitted = true;
        });

        supervisor.clearLogs();
        assert.equal(clearedEmitted, true);
        assert.equal(fs.readFileSync(logFile, 'utf8'), '');
    });

    test('supervisor rotates and removes logs older than maxDays', () => {
        const logsDir = path.join(tmpDir, 'logs');
        fs.mkdirSync(logsDir, { recursive: true });
        const supervisor = new ProcessSupervisor(logsDir);

        const oldFile = path.join(logsDir, 'ignite-service-2020-01-01.log');
        fs.writeFileSync(oldFile, 'old log content');
        const recentFile = path.join(logsDir, 'ignite-service-2026-10-17.log');
        fs.writeFileSync(recentFile, 'recent log content');

        // Set mtime of oldFile to 10 days ago
        const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
        fs.utimesSync(oldFile, tenDaysAgo, tenDaysAgo);

        supervisor.rotateLogs(5);

        assert.equal(fs.existsSync(oldFile), false, 'Old log file should be removed');
        assert.equal(fs.existsSync(recentFile), true, 'Recent log file should be kept');
    });

    test('supervisor with waitForReady remains starting until REST API server listening log is emitted', async () => {
        const supervisor = new ProcessSupervisor();

        const readyScript = `
            console.log('Booting worker...');
            setTimeout(() => {
                console.log('{"level":"ok","shard":"0","scope":"api","msg":"REST API server listening on http://0.0.0.0:3001"}');
            }, 100);
            setInterval(() => {}, 1000);
        `;
        fs.writeFileSync(path.join(tmpDir, 'index.js'), readyScript, 'utf8');

        const startRes = supervisor.start(tmpDir, {}, { waitForReady: true });
        assert.equal(startRes.success, true);
        assert.equal(supervisor.getStatus().state, 'starting');

        // Wait for log emission and state transition
        await new Promise((resolve) => {
            supervisor.on('status-changed', (s) => {
                if (s.state === 'running') resolve();
            });
        });

        assert.equal(supervisor.getStatus().state, 'running');
        await supervisor.stop(2000);
    });

    test('supervisor restart preserves starting state and waits for ready log', async () => {
        const supervisor = new ProcessSupervisor();

        const readyScript = `
            console.log('Booting worker...');
            setTimeout(() => {
                console.log('{"level":"ok","shard":"0","scope":"api","msg":"REST API server listening on http://0.0.0.0:3001"}');
            }, 80);
            setInterval(() => {}, 1000);
            process.on('SIGTERM', () => process.exit(0));
        `;
        fs.writeFileSync(path.join(tmpDir, 'index.js'), readyScript, 'utf8');

        await supervisor.start(tmpDir);
        await new Promise((resolve) => {
            supervisor.on('status-changed', (s) => {
                if (s.state === 'running') resolve();
            });
        });
        assert.equal(supervisor.getStatus().state, 'running');

        // Trigger restart
        const restartPromise = supervisor.restart(tmpDir);

        // Wait for ready log after restart
        await new Promise((resolve) => {
            const onStatus = (s) => {
                if (s.state === 'running') {
                    supervisor.off('status-changed', onStatus);
                    resolve();
                }
            };
            supervisor.on('status-changed', onStatus);
        });

        await restartPromise;
        assert.equal(supervisor.getStatus().state, 'running');
        await supervisor.stop(2000);
    });
});

