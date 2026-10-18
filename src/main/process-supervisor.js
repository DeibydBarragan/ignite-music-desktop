'use strict';

const { fork, execSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { EventEmitter } = require('node:events');

function resolveNodeBinary() {
    const binName = process.platform === 'win32' ? 'node.exe' : 'node';
    const bundled = [
        process.resourcesPath ? path.join(process.resourcesPath, 'bin', binName) : null,
        path.resolve(__dirname, '../../resources/bin', binName),
        path.resolve(process.cwd(), 'resources/bin', binName),
    ].filter(Boolean);

    for (const b of bundled) {
        if (fs.existsSync(b)) return b;
    }

    try {
        const whichCmd = process.platform === 'win32' ? 'where.exe node' : 'which node';
        const first = execSync(whichCmd, { encoding: 'utf8' }).split(/\r?\n/)[0]?.trim();
        if (first && fs.existsSync(first)) return first;
    } catch { /* fallback */ }

    const standardWindowsPath = 'C:\\Program Files\\nodejs\\node.exe';
    if (process.platform === 'win32' && fs.existsSync(standardWindowsPath)) {
        return standardWindowsPath;
    }

    return process.execPath;
}

class ProcessSupervisor extends EventEmitter {
    /**
     * @param {string} [customLogsDir] Optional directory for persistent rotating log files
     */
    constructor(customLogsDir = null) {
        super();
        this.child = null;
        this.state = 'stopped'; // 'stopped' | 'starting' | 'running' | 'stopping' | 'crashed'
        this.startedAt = null;
        this.exitCode = null;
        this.stopTimeout = null;
        this.healthCheckTimer = null;
        this.isHealthChecking = false;
        this.logsDir = customLogsDir || null;
    }

    getStatus() {
        return {
            state: this.state,
            pid: this.child?.pid || null,
            uptime: this.startedAt ? Math.floor((Date.now() - this.startedAt) / 1000) : 0,
            exitCode: this.exitCode,
        };
    }

    setState(newState) {
        if (this.state === newState) return;
        this.state = newState;
        this.emit('status-changed', this.getStatus());
    }

    /**
     * Emits a log entry and appends it to daily rotating log file if logsDir is configured.
     *
     * @param {{ type: 'stdout'|'stderr', text: string, timestamp: string }} entry
     */
    emitLog(entry) {
        this.emit('log', entry);

        if (this.logsDir) {
            try {
                if (!fs.existsSync(this.logsDir)) {
                    fs.mkdirSync(this.logsDir, { recursive: true });
                }
                const dateStr = entry.timestamp ? entry.timestamp.split('T')[0] : new Date().toISOString().split('T')[0];
                const logFilePath = path.join(this.logsDir, `ignite-service-${dateStr}.log`);
                const line = `[${entry.timestamp}] [${entry.type.toUpperCase()}] ${entry.text}\n`;
                fs.appendFileSync(logFilePath, line, 'utf8');
            } catch {
                // Non-fatal: do not block event emission if disk append fails
            }
        }
    }

    /**
     * Clears or truncates active log file and notifies listeners.
     */
    clearLogs() {
        if (this.logsDir && fs.existsSync(this.logsDir)) {
            try {
                const dateStr = new Date().toISOString().split('T')[0];
                const logFilePath = path.join(this.logsDir, `ignite-service-${dateStr}.log`);
                if (fs.existsSync(logFilePath)) {
                    fs.truncateSync(logFilePath, 0);
                }
            } catch { /* ignore */ }
        }
        this.emit('logs-cleared');
    }

    /**
     * Rotates log files in logsDir, removing any older than maxDays.
     *
     * @param {number} [maxDays]
     */
    rotateLogs(maxDays = 5) {
        if (!this.logsDir || !fs.existsSync(this.logsDir)) return;
        try {
            const files = fs.readdirSync(this.logsDir);
            const now = Date.now();
            const maxAgeMs = maxDays * 24 * 60 * 60 * 1000;
            for (const file of files) {
                if (file.startsWith('ignite-service-') && file.endsWith('.log')) {
                    const fullPath = path.join(this.logsDir, file);
                    const stats = fs.statSync(fullPath);
                    if (now - stats.mtimeMs > maxAgeMs) {
                        try { fs.unlinkSync(fullPath); } catch { /* ignore */ }
                    }
                }
            }
        } catch { /* ignore */ }
    }

    start(serviceDir, envOverrides = {}) {
        if (this.child && !this.child.killed) {
            return { success: false, error: 'SERVICE_ALREADY_RUNNING' };
        }

        const entryPoint = path.join(serviceDir, 'index.js');
        if (!fs.existsSync(entryPoint)) {
            return { success: false, error: `ENTRY_NOT_FOUND: ${entryPoint}` };
        }

        // Clean up obsolete logs before starting
        this.rotateLogs(5);

        this.setState('starting');
        this.startedAt = Date.now();
        this.exitCode = null;

        // Arm 10-second crash loop health check
        this.isHealthChecking = true;
        if (this.healthCheckTimer) {
            clearTimeout(this.healthCheckTimer);
        }
        this.healthCheckTimer = setTimeout(() => {
            this.isHealthChecking = false;
            this.healthCheckTimer = null;
            this.emit('health-check-passed');
        }, 10_000);
        this.healthCheckTimer.unref?.();

        const mergedEnv = {
            ...process.env,
            ...envOverrides,
            ELECTRON_RUN_AS_NODE: '1',
            FORCE_COLOR: '1',
            NODE_ENV: 'production',
        };

        this.emitLog({
            type: 'stdout',
            text: `[Supervisor] Iniciando servicio de Ignite Music (${entryPoint})...`,
            timestamp: new Date().toISOString(),
        });

        try {
            this.child = fork(entryPoint, [], {
                cwd: serviceDir,
                env: mergedEnv,
                execPath: resolveNodeBinary(),
                stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
            });

            this.setupStreams(this.child);
            this.setState('running');
            return { success: true, pid: this.child.pid };
        } catch (err) {
            this.setState('crashed');
            return { success: false, error: err.message };
        }
    }

    setupStreams(child) {
        const pipeStream = (stream, type) => {
            if (!stream) return;
            stream.setEncoding('utf8');
            stream.on('data', (chunk) => {
                const lines = chunk.split('\n');
                for (const line of lines) {
                    if (!line.trim()) continue;
                    this.emitLog({
                        type,
                        text: line,
                        timestamp: new Date().toISOString(),
                    });
                }
            });
        };

        pipeStream(child.stdout, 'stdout');
        pipeStream(child.stderr, 'stderr');

        child.on('exit', (code, signal) => {
            if (this.stopTimeout) {
                clearTimeout(this.stopTimeout);
                this.stopTimeout = null;
            }

            const wasHealthChecking = this.isHealthChecking;
            if (this.healthCheckTimer) {
                clearTimeout(this.healthCheckTimer);
                this.healthCheckTimer = null;
            }
            this.isHealthChecking = false;

            this.child = null;
            this.startedAt = null;
            this.exitCode = code;

            const isManualStop = this.state === 'stopping';

            if (isManualStop) {
                this.setState('stopped');
            } else {
                this.setState(code === 0 ? 'stopped' : 'crashed');
            }

            this.emitLog({
                type: 'stderr',
                text: `[Supervisor] Proceso finalizado (código: ${code}, señal: ${signal || 'ninguna'})`,
                timestamp: new Date().toISOString(),
            });

            // Trigger crash loop event if process died with non-zero exit during 10-second startup
            if (!isManualStop && code !== 0 && wasHealthChecking) {
                this.emit('crash-loop-detected', { exitCode: code, signal });
            }
        });
    }

    async stop(timeoutMs = 5000) {
        if (!this.child || this.child.killed) {
            this.setState('stopped');
            return { success: true };
        }

        this.setState('stopping');
        const child = this.child;
        const pid = child.pid;

        return new Promise((resolve) => {
            let settled = false;

            const onExit = () => {
                if (!settled) {
                    settled = true;
                    if (this.stopTimeout) clearTimeout(this.stopTimeout);
                    this.stopTimeout = null;
                    resolve({ success: true });
                }
            };

            child.once('exit', onExit);

            // Send graceful SIGTERM first
            try {
                child.kill('SIGTERM');
            } catch {
                // already dead
            }

            // Force termination after timeout (tree-kill on Windows)
            this.stopTimeout = setTimeout(() => {
                if (!settled) {
                    try {
                        if (process.platform === 'win32' && pid) {
                            try {
                                execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
                            } catch { /* ignore */ }
                        } else {
                            child.kill('SIGKILL');
                        }
                    } catch {
                        // ignore
                    }
                    onExit();
                }
            }, timeoutMs);
            this.stopTimeout.unref?.();
        });
    }

    async restart(serviceDir, envOverrides) {
        await this.stop();
        return this.start(serviceDir, envOverrides);
    }
}

module.exports = { ProcessSupervisor, resolveNodeBinary };
