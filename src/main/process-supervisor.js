'use strict';

const { fork } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { EventEmitter } = require('node:events');

class ProcessSupervisor extends EventEmitter {
    constructor() {
        super();
        this.child = null;
        this.state = 'stopped'; // 'stopped' | 'starting' | 'running' | 'stopping' | 'crashed'
        this.startedAt = null;
        this.exitCode = null;
        this.stopTimeout = null;
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

    start(serviceDir, envOverrides = {}) {
        if (this.child && !this.child.killed) {
            return { success: false, error: 'SERVICE_ALREADY_RUNNING' };
        }

        const entryPoint = path.join(serviceDir, 'index.js');
        if (!fs.existsSync(entryPoint)) {
            return { success: false, error: `ENTRY_NOT_FOUND: ${entryPoint}` };
        }

        this.setState('starting');
        this.startedAt = Date.now();
        this.exitCode = null;

        const mergedEnv = {
            ...process.env,
            ...envOverrides,
            FORCE_COLOR: '1',
            NODE_ENV: 'production',
        };

        try {
            this.child = fork(entryPoint, [], {
                cwd: serviceDir,
                env: mergedEnv,
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
                    this.emit('log', {
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
            this.child = null;
            this.startedAt = null;
            this.exitCode = code;

            if (this.state === 'stopping') {
                this.setState('stopped');
            } else {
                this.setState(code === 0 ? 'stopped' : 'crashed');
            }

            this.emit('log', {
                type: 'stderr',
                text: `[Supervisor] Proceso finalizado (código: ${code}, señal: ${signal || 'ninguna'})`,
                timestamp: new Date().toISOString(),
            });
        });
    }

    async stop(timeoutMs = 5000) {
        if (!this.child || this.child.killed) {
            this.setState('stopped');
            return { success: true };
        }

        this.setState('stopping');
        const child = this.child;

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

            // Force SIGKILL after timeout
            this.stopTimeout = setTimeout(() => {
                if (!settled) {
                    try {
                        child.kill('SIGKILL');
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

module.exports = { ProcessSupervisor };
