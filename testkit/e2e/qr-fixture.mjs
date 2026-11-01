// A tiny QR encoder for tests only: version 5-L, byte mode, mask 0. Writes a PNG for the image path and
// a Y4M for Chrome's fake camera, into a temp directory; nothing large is committed.
import { writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { join } from 'node:path';

const SIZE = 37;
const DATA_CODEWORDS = 108;
const EC_CODEWORDS = 26;

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) {
  EXP[i] = x;
  LOG[x] = i;
  x = (x << 1) ^ (x & 0x80 ? 0x11d : 0);
}
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];

function reedSolomon(data, n) {
  let gen = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(gen.length + 1).fill(0);
    gen.forEach((c, j) => {
      next[j] ^= c;
      next[j + 1] ^= c === 0 ? 0 : EXP[LOG[c] + i];
    });
    gen = next;
  }
  const rem = new Array(n).fill(0);
  for (const b of data) {
    const factor = b ^ rem.shift();
    rem.push(0);
    if (factor) for (let i = 0; i < n; i++) rem[i] ^= EXP[LOG[gen[i + 1]] + LOG[factor]];
  }
  return rem;
}

export function qrMatrix(text) {
  const bytes = Buffer.from(text, 'utf8');
  if (bytes.length > DATA_CODEWORDS - 2) throw new Error('too long for version 5-L');
  const bits = [];
  const push = (v, n) => {
    for (let i = n - 1; i >= 0; i--) bits.push((v >> i) & 1);
  };
  push(0b0100, 4);
  push(bytes.length, 8);
  for (const b of bytes) push(b, 8);
  push(0, Math.min(4, DATA_CODEWORDS * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let pad = 0xec; data.length < DATA_CODEWORDS; pad ^= 0xec ^ 0x11) data.push(pad);
  const all = [...data, ...reedSolomon(data, EC_CODEWORDS)];

  const m = Array.from({ length: SIZE }, () => new Array(SIZE).fill(null));
  const set = (x, y, v) => {
    if (x >= 0 && y >= 0 && x < SIZE && y < SIZE) m[y][x] = v ? 1 : 0;
  };
  const finder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      set(cx + dx, cy + dy, d !== 2 && d !== 4);
    }
  };
  finder(3, 3);
  finder(SIZE - 4, 3);
  finder(3, SIZE - 4);
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(30 + dx, 30 + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  for (let i = 8; i < SIZE - 8; i++) {
    set(i, 6, i % 2 === 0);
    set(6, i, i % 2 === 0);
  }
  set(8, SIZE - 8, 1);

  // Format info for EC level L (01), mask 0, with its BCH code and fixed XOR mask.
  let fmt = 0b01000 << 10;
  for (let i = 14; i >= 10; i--) if (fmt & (1 << i)) fmt ^= 0b10100110111 << (i - 10);
  fmt = ((0b01000 << 10) | fmt) ^ 0b101010000010010;
  const bit = (i) => (fmt >> i) & 1;
  for (let i = 0; i <= 5; i++) set(8, i, bit(i));
  set(8, 7, bit(6));
  set(8, 8, bit(7));
  set(7, 8, bit(8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
  for (let i = 0; i < 8; i++) set(SIZE - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) set(8, SIZE - 15 + i, bit(i));

  const stream = all.flatMap((b) => Array.from({ length: 8 }, (_, i) => (b >> (7 - i)) & 1));
  let k = 0;
  let upward = true;
  for (let col = SIZE - 1; col > 0; col -= 2) {
    if (col === 6) col = 5;
    for (let n = 0; n < SIZE; n++) {
      const y = upward ? SIZE - 1 - n : n;
      for (const x of [col, col - 1]) {
        if (m[y][x] !== null) continue;
        const b = k < stream.length ? stream[k++] : 0;
        m[y][x] = (b ^ ((x + y) % 2 === 0 ? 1 : 0)) & 1;
      }
    }
    upward = !upward;
  }
  return m;
}

// `side`×`side` grayscale (white background) with the code centred, each module `scale` pixels.
function raster(matrix, side, scale) {
  const px = new Uint8Array(side * side).fill(255);
  const off = Math.floor((side - matrix.length * scale) / 2);
  matrix.forEach((row, y) => row.forEach((v, x) => {
    if (!v) return;
    for (let j = 0; j < scale; j++) px.fill(0, off + (y * scale + j) * side + x * scale, off + (y * scale + j) * side + (x + 1) * scale);
  }));
  return px;
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(body));
  return Buffer.concat([head, body, tail]);
}

export function png(px, side) {
  const raw = Buffer.alloc((side + 1) * side);
  for (let y = 0; y < side; y++) Buffer.from(px.subarray(y * side, (y + 1) * side)).copy(raw, y * (side + 1) + 1);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(side, 0);
  ihdr.writeUInt32BE(side, 4);
  ihdr[8] = 8;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

export async function writeQrPng(dir, name, text) {
  const side = 400;
  const path = join(dir, name);
  await writeFile(path, png(raster(qrMatrix(text), side, 8), side));
  return path;
}

export async function writeBlankPng(dir, name) {
  const path = join(dir, name);
  await writeFile(path, png(new Uint8Array(100 * 100).fill(255), 100));
  return path;
}

export async function writeQrY4m(dir, name, text) {
  const [w, h] = [640, 480];
  const code = raster(qrMatrix(text), h, 10);
  const luma = new Uint8Array(w * h).fill(255);
  const left = Math.floor((w - h) / 2);
  for (let y = 0; y < h; y++) luma.set(code.subarray(y * h, (y + 1) * h), y * w + left);
  const chroma = new Uint8Array((w / 2) * (h / 2)).fill(128);
  const frame = Buffer.concat([Buffer.from('FRAME\n'), luma, chroma, chroma]);
  const path = join(dir, name);
  await writeFile(path, Buffer.concat([Buffer.from(`YUV4MPEG2 W${w} H${h} F30:1 Ip A1:1 C420jpeg\n`), frame, frame]));
  return path;
}
