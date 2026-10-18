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

function pruneUnnecessaryFiles(dir) {
    const nodeModulesDir = path.join(dir, 'node_modules');
    if (!fs.existsSync(nodeModulesDir)) return;

    console.log('[bundle-service] Pruning devDependencies and build artifacts from bundled snapshot...');

    // Heavy devDependencies that are not used at runtime
    const devPkgs = ['@typescript', 'typescript', 'eslint', '@types'];
    for (const pkg of devPkgs) {
        const fullPkgPath = path.join(nodeModulesDir, pkg);
        if (fs.existsSync(fullPkgPath)) {
            try {
                fs.rmSync(fullPkgPath, { recursive: true, force: true });
                console.log(`[bundle-service] Removed unused dev dependency: ${pkg}`);
            } catch (err) {
                console.warn(`[bundle-service] Warning removing ${pkg}:`, err.message);
            }
        }
    }

    // Clean source maps, type definitions, doc files and test directories
    function cleanTree(current) {
        if (!fs.existsSync(current)) return;
        const entries = fs.readdirSync(current, { withFileTypes: true });
        for (const entry of entries) {
            const full = path.join(current, entry.name);
            if (entry.isDirectory()) {
                if (['.bin', 'test', 'tests', '__tests__', 'example', 'examples', 'docs'].includes(entry.name)) {
                    try { fs.rmSync(full, { recursive: true, force: true }); } catch { /* ignore */ }
                } else {
                    cleanTree(full);
                }
            } else if (entry.isFile()) {
                if (entry.name.endsWith('.map') ||
                    entry.name.endsWith('.d.ts') ||
                    entry.name.endsWith('.md') ||
                    entry.name === 'CHANGELOG' ||
                    entry.name === 'LICENSE') {
                    try { fs.unlinkSync(full); } catch { /* ignore */ }
                }
            }
        }
    }

    try {
        cleanTree(nodeModulesDir);
        console.log('[bundle-service] Pruning finished successfully.');
    } catch (err) {
        console.warn('[bundle-service] Warning during pruning:', err.message);
    }
}

function bundleService() {
    console.log('[bundle-service] Checking bundled bot service snapshot...');

    if (fs.existsSync(path.join(targetDir, 'index.js'))) {
        console.log('[bundle-service] Bundled snapshot already exists in resources/service/bundled.');
        ensureFingerprint(targetDir);
        pruneUnnecessaryFiles(targetDir);
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
        pruneUnnecessaryFiles(targetDir);
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
