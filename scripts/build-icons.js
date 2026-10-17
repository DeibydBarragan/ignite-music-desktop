'use strict';

const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

/**
 * Packs one or more PNG buffers into a standard Windows .ico file.
 *
 * @param {Array<{ width: number, height: number, buffer: Buffer }>} images
 * @returns {Buffer}
 */
function createIco(images) {
    const count = images.length;
    const headerSize = 6;
    const entrySize = 16;
    let offset = headerSize + entrySize * count;

    const out = [];

    // Header
    const header = Buffer.alloc(headerSize);
    header.writeUInt16LE(0, 0); // reserved
    header.writeUInt16LE(1, 2); // type 1 = icon
    header.writeUInt16LE(count, 4); // image count
    out.push(header);

    // Entries
    for (const img of images) {
        const entry = Buffer.alloc(entrySize);
        entry.writeUInt8(img.width >= 256 ? 0 : img.width, 0);
        entry.writeUInt8(img.height >= 256 ? 0 : img.height, 1);
        entry.writeUInt8(0, 2); // color count
        entry.writeUInt8(0, 3); // reserved
        entry.writeUInt16LE(1, 4); // color planes
        entry.writeUInt16LE(32, 6); // bit count
        entry.writeUInt32LE(img.buffer.length, 8); // size
        entry.writeUInt32LE(offset, 12); // offset
        out.push(entry);

        offset += img.buffer.length;
    }

    // Images
    for (const img of images) {
        out.push(img.buffer);
    }

    return Buffer.concat(out);
}

app.whenReady().then(async () => {
    try {
        const svgPath = path.join(__dirname, '../resources/icon.svg');
        const svgContent = fs.readFileSync(svgPath, 'utf8');

        const win = new BrowserWindow({
            width: 256,
            height: 256,
            useContentSize: true,
            show: false,
            transparent: true,
            frame: false,
            webPreferences: {
                offscreen: true,
            },
        });

        const dataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgContent)}`;
        await win.loadURL(dataUri);

        // Wait a tick for SVG rendering
        await new Promise((r) => setTimeout(r, 400));

        const nativeImg256 = await win.capturePage({ x: 0, y: 0, width: 256, height: 256 });
        const png256 = nativeImg256.toPNG();

        // Write PNGs
        const resPng = path.join(__dirname, '../resources/icon.png');
        const buildPng = path.join(__dirname, '../build/icon.png');
        fs.writeFileSync(resPng, png256);
        fs.writeFileSync(buildPng, png256);
        console.log(`Generated PNG icon (256x256): ${resPng}`);

        // Generate resized icons for crisp scaling
        const nativeImg128 = nativeImg256.resize({ width: 128, height: 128 });
        const nativeImg64 = nativeImg256.resize({ width: 64, height: 64 });
        const nativeImg48 = nativeImg256.resize({ width: 48, height: 48 });
        const nativeImg32 = nativeImg256.resize({ width: 32, height: 32 });
        const nativeImg16 = nativeImg256.resize({ width: 16, height: 16 });

        const icoBuffer = createIco([
            { width: 256, height: 256, buffer: png256 },
            { width: 128, height: 128, buffer: nativeImg128.toPNG() },
            { width: 64, height: 64, buffer: nativeImg64.toPNG() },
            { width: 48, height: 48, buffer: nativeImg48.toPNG() },
            { width: 32, height: 32, buffer: nativeImg32.toPNG() },
            { width: 16, height: 16, buffer: nativeImg16.toPNG() },
        ]);

        const buildIco = path.join(__dirname, '../build/icon.ico');
        const resIco = path.join(__dirname, '../resources/icon.ico');
        fs.writeFileSync(buildIco, icoBuffer);
        fs.writeFileSync(resIco, icoBuffer);
        console.log(`Generated multi-resolution ICO (16, 32, 48, 64, 128, 256): ${buildIco}`);

        app.quit();
    } catch (err) {
        console.error('Error generating icons:', err);
        process.exit(1);
    }
});
