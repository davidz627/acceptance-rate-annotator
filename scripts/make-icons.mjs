// Writes the extension icons (green rounded square with a white "%") as PNGs, no dependencies.
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

// Shape functions in unit coordinates (0..1). Return true if the point is inside.
const inRoundedSquare = (x, y, r = 0.22) => {
  const cx = Math.min(Math.max(x, r), 1 - r), cy = Math.min(Math.max(y, r), 1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};
const inRing = (x, y, cx, cy, ro, ri) => { const d = (x - cx) ** 2 + (y - cy) ** 2; return d <= ro * ro && d >= ri * ri; };
const inBar = (x, y) => { // diagonal from bottom-left to top-right, thick
  const u = (x + y - 1) / Math.SQRT2, v = (x - y) / Math.SQRT2; // rotate 45°
  return Math.abs(u) <= 0.075 && Math.abs(v) <= 0.36;
};
const inPercent = (x, y) => inRing(x, y, 0.32, 0.32, 0.15, 0.07) || inRing(x, y, 0.68, 0.68, 0.15, 0.07) || inBar(x, y);

function png(size) {
  const SS = 4; // supersampling for anti-aliasing
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let bg = 0, fg = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const px = (x + (sx + 0.5) / SS) / size, py = (y + (sy + 0.5) / SS) / size;
        if (inRoundedSquare(px, py)) { bg++; if (inPercent(px, py)) fg++; }
      }
      const a = bg / (SS * SS), f = fg / Math.max(bg, 1);
      const i = y * (size * 4 + 1) + 1 + x * 4;
      raw[i] = Math.round(0x15 + (255 - 0x15) * f);
      raw[i + 1] = Math.round(0x80 + (255 - 0x80) * f);
      raw[i + 2] = Math.round(0x3d + (255 - 0x3d) * f);
      raw[i + 3] = Math.round(255 * a);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
  ]);
}
for (const s of [16, 48, 128]) writeFileSync(new URL(`../icons/icon${s}.png`, import.meta.url), png(s));
console.log("icons written");
