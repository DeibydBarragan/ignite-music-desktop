'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

// CRC32 table
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[n] = c;
}

function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
        c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
    const len = data.length;
    const chunk = Buffer.alloc(12 + len);
    chunk.writeUInt32BE(len, 0);
    chunk.write(type, 4, 4, 'ascii');
    data.copy(chunk, 8);
    const crc = crc32(chunk.subarray(4, 8 + len));
    chunk.writeUInt32BE(crc, 8 + len);
    return chunk;
}

const width = 32;
const height = 32;

// Raw RGBA scanlines (with filter byte 0 at start of each line)
const raw = Buffer.alloc(height * (1 + width * 4));
let offset = 0;

for (let y = 0; y < height; y++) {
    raw[offset++] = 0; // Filter byte: None
    for (let x = 0; x < width; x++) {
        const dx = Math.abs(x - 15.5);
        const dy = Math.abs(y - 17);

        // Stylized flame shape
        if (dx + dy <= 12 && y >= 6) {
            raw[offset++] = 249; // R #f97316
            raw[offset++] = 115; // G
            raw[offset++] = 22;  // B
            raw[offset++] = 255; // Alpha
        } else if (dx + dy <= 6 && y >= 14) {
            raw[offset++] = 254; // Yellow flame center #fde047
            raw[offset++] = 224;
            raw[offset++] = 71;
            raw[offset++] = 255;
        } else {
            raw[offset++] = 0;
            raw[offset++] = 0;
            raw[offset++] = 0;
            raw[offset++] = 0; // Transparent
        }
    }
}

const compressed = zlib.deflateSync(raw);

const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const ihdrData = Buffer.alloc(13);
ihdrData.writeUInt32BE(width, 0);
ihdrData.writeUInt32BE(height, 4);
ihdrData[8] = 8; // bit depth
ihdrData[9] = 6; // color type: RGBA
ihdrData[10] = 0; // compression
ihdrData[11] = 0; // filter
ihdrData[12] = 0; // interlace

const ihdr = makeChunk('IHDR', ihdrData);
const idat = makeChunk('IDAT', compressed);
const iend = makeChunk('IEND', Buffer.alloc(0));

const png = Buffer.concat([header, ihdr, idat, iend]);
const outDir = path.join(__dirname, '../resources');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'icon.png'), png);
console.log('Icon generated at resources/icon.png');
