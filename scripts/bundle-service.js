'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const targetDir = path.join(__dirname, '../resources/service/bundled');
const sourceDir = path.resolve(__dirname, '../../ignite-music');

function ensureFingerprint(dir) {
    try {
        const marker = path.join(dir, 'node_modules', '.musicbot-installed');
        if (fs.existsSync(path.join(dir, 'node_modules')) && (!fs.existsSync(marker) || fs.readFileSync(marker, 'utf8').trim() === '')) {
            const hash = crypto.createHash('sha256');
            for (const file of ['package.json', 'package-lock.json']) {
                const full = path.join(dir, file);
                if (fs.existsSync(full)) hash.update(fs.readFileSync(full));
            }
            fs.writeFileSync(marker, hash.digest('hex'), 'utf8');
            console.log('[bundle-service] Ensured .musicbot-installed marker.');
        }
    } catch { /* ignore */ }
}

function copyRecursive(src, dest, filterFn) {
    if (!fs.existsSync(src)) return;
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
        fs.mkdirSync(dest, { recursive: true });
        for (const item of fs.readdirSync(src)) {
            const srcItem = path.join(src, item);
            const destItem = path.join(dest, item);
            if (filterFn ? filterFn(srcItem, item) : true) {
                copyRecursive(srcItem, destItem, filterFn);
            }
        }
    } else {
        fs.copyFileSync(src, dest);
    }
}

function bundleService() {
    console.log('[bundle-service] Checking bundled bot service snapshot...');

    if (fs.existsSync(path.join(targetDir, 'index.js'))) {
        console.log('[bundle-service] Bundled snapshot already exists in resources/service/bundled.');
        ensureFingerprint(targetDir);
        return;
    }

    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }

    if (fs.existsSync(path.join(sourceDir, 'index.js'))) {
        console.log(`[bundle-service] Copying bot from ${sourceDir} to ${targetDir}...`);
        
        const ignoredDirs = new Set(['.git', '.github', 'data', 'test', 'bin']);
        const ignoredFiles = new Set(['.env', 'cookies.txt']);

        for (const entry of fs.readdirSync(sourceDir)) {
            if (ignoredDirs.has(entry) || ignoredFiles.has(entry)) continue;
            const srcPath = path.join(sourceDir, entry);
            const destPath = path.join(targetDir, entry);

            copyRecursive(srcPath, destPath, (_full, name) => {
                return name !== '.git' && name !== '.env';
            });
        }
        ensureFingerprint(targetDir);
        console.log('[bundle-service] Service bundled successfully.');
    } else {
        console.warn(`[bundle-service] Source directory ${sourceDir} not found. Creating placeholder index.js...`);
        fs.writeFileSync(
            path.join(targetDir, 'index.js'),
            '// Ignite Music bundled service placeholder\nconsole.log("Ignite Music Service initialized");\n',
            'utf8'
        );
        fs.writeFileSync(
            path.join(targetDir, 'package.json'),
            JSON.stringify({ name: 'ignite-music-bundled', version: '1.0.0', main: 'index.js' }, null, 2),
            'utf8'
        );
        console.log('[bundle-service] Placeholder created.');
    }
}

bundleService();
