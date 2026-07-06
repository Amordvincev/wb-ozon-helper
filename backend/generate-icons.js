const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const iconsDir = path.join(__dirname, '..', 'extension', 'icons');
const sizes = [16, 48, 128];

function createPNG(width, height, r, g, b) {
  // Minimal PNG generator for solid color icons
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function createChunk(type, data) {
    const typeBuffer = Buffer.from(type, 'ascii');
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crcData = Buffer.concat([typeBuffer, data]);
    const crc = crc32(crcData);
    const crcBuffer = Buffer.alloc(4);
    crcBuffer.writeUInt32BE(crc);
    return Buffer.concat([length, typeBuffer, data, crcBuffer]);
  }

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // IDAT - raw pixel data
  const rawData = [];
  for (let y = 0; y < height; y++) {
    rawData.push(0); // filter byte (none)
    for (let x = 0; x < width; x++) {
      // Simple gradient: lighter towards bottom-right
      const factor = ((x / width) * 0.3 + (y / height) * 0.3);
      const rr = Math.min(255, Math.round(r + factor * 60));
      const gg = Math.min(255, Math.round(g + factor * 50));
      const bb = Math.min(255, Math.round(b + factor * 80));
      rawData.push(rr, gg, bb, 255);
    }
  }

  const compressed = zlib.deflateSync(Buffer.from(rawData));
  const ihdrChunk = createChunk('IHDR', ihdr);
  const idatChunk = createChunk('IDAT', compressed);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// WB-Ozon brand color: purple #6c5ce7
for (const size of sizes) {
  const png = createPNG(size, size, 108, 92, 231);
  fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), png);
  console.log(`Created icon${size}.png (${size}x${size})`);
}

console.log('All icons generated!');
