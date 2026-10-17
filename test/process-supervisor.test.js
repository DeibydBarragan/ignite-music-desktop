'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { ProcessSupervisor } = require('../src/main/process-supervisor');

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

        const startRes = supervisor.start(tmpDir);
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
});
