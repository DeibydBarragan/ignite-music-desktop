'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const targetPath = path.join(__dirname, '../resources/bin/node.exe');

function ensureNode() {
    if (fs.existsSync(targetPath)) {
        console.log('[ensure-node] resources/bin/node.exe already exists.');
        return;
    }

    const binDir = path.dirname(targetPath);
    if (!fs.existsSync(binDir)) {
        fs.mkdirSync(binDir, { recursive: true });
    }

    // Try copying from local node if it's Node 22+
    try {
        const localNode = execSync('where.exe node', { encoding: 'utf8' }).split(/\r?\n/)[0]?.trim();
        if (localNode && fs.existsSync(localNode)) {
            const ver = execSync(`"${localNode}" -v`, { encoding: 'utf8' }).trim();
            const major = Number(ver.replace(/^v/, '').split('.')[0]);
            if (major >= 22) {
                console.log(`[ensure-node] Copying local Node.js ${ver} from ${localNode}...`);
                fs.copyFileSync(localNode, targetPath);
                console.log('[ensure-node] Copied successfully.');
                return;
            }
        }
    } catch { /* ignore */ }

    console.log('[ensure-node] Local Node 22+ not found to copy.');
}

ensureNode();
