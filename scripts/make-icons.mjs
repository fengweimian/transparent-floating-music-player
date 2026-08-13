// 生成应用图标：build/icon.ico（多尺寸）+ resources/icon.png(256) + resources/tray-icon.png(32)
// 纯 Node 实现 PNG/ICO 编码，无第三方依赖
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ===== PNG 编码 =====
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function encodePNG(w, h, rgba) {
  const stride = w * 4 + 1;
  const raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    raw[y * stride] = 0;
    rgba.copy(raw, y * stride + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ===== 图标绘制 =====
function inEllipse(px, py, cx, cy, rx, ry) {
  const dx = (px - cx) / rx;
  const dy = (py - cy) / ry;
  return dx * dx + dy * dy <= 1;
}

function drawIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const radius = size * 0.22;
  const top = [0x53, 0x4a, 0xb7];   // #534AB7
  const bottom = [0x18, 0x5f, 0xa5]; // #185FA5
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const cx = Math.max(radius, Math.min(size - 1 - radius, x));
      const cy = Math.max(radius, Math.min(size - 1 - radius, y));
      const dx = x - cx;
      const dy = y - cy;
      if (Math.sqrt(dx * dx + dy * dy) > radius) continue; // 圆角外透明
      const t = y / (size - 1);
      rgba[i] = Math.round(top[0] + (bottom[0] - top[0]) * t);
      rgba[i + 1] = Math.round(top[1] + (bottom[1] - top[1]) * t);
      rgba[i + 2] = Math.round(top[2] + (bottom[2] - top[2]) * t);
      rgba[i + 3] = 255;
    }
  }

  // 白色双音符（归一化坐标）
  const head1 = { cx: 0.37, cy: 0.60, rx: 0.135, ry: 0.105 };
  const head2 = { cx: 0.71, cy: 0.44, rx: 0.10, ry: 0.08 };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x / size;
      const py = y / size;
      let note = false;
      if (inEllipse(px, py, head1.cx, head1.cy, head1.rx, head1.ry)) note = true;
      else if (inEllipse(px, py, head2.cx, head2.cy, head2.rx, head2.ry)) note = true;
      else if (px >= 0.475 && px <= 0.535 && py >= 0.30 && py <= 0.63) note = true; // 符干1
      else if (px >= 0.775 && px <= 0.83 && py >= 0.16 && py <= 0.46) note = true; // 符干2
      else if (px >= 0.83 && px <= 0.96) { // 小旗三角
        const t = (px - 0.83) / 0.13;
        const topY = 0.17 + t * 0.08;
        const botY = 0.33 - t * 0.08;
        if (py >= topY && py <= botY) note = true;
      }
      if (note) {
        const i = (y * size + x) * 4;
        if (rgba[i + 3] > 0) {
          rgba[i] = 255; rgba[i + 1] = 255; rgba[i + 2] = 255; rgba[i + 3] = 255;
        }
      }
    }
  }
  return rgba;
}

// ===== 缩放（alpha 加权平均）=====
function scaleDown(src, srcSize, dstSize) {
  const out = Buffer.alloc(dstSize * dstSize * 4);
  for (let ty = 0; ty < dstSize; ty++) {
    const y0 = Math.floor((ty * srcSize) / dstSize);
    const y1 = Math.max(y0 + 1, Math.floor(((ty + 1) * srcSize) / dstSize));
    for (let tx = 0; tx < dstSize; tx++) {
      const x0 = Math.floor((tx * srcSize) / dstSize);
      const x1 = Math.max(x0 + 1, Math.floor(((tx + 1) * srcSize) / dstSize));
      let sr = 0, sg = 0, sb = 0, sa = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * srcSize + x) * 4;
          const a = src[i + 3];
          if (a > 0) {
            sr += src[i] * a; sg += src[i + 1] * a; sb += src[i + 2] * a; sa += a;
          }
        }
      }
      const o = (ty * dstSize + tx) * 4;
      if (sa > 0) {
        out[o] = Math.round(sr / sa);
        out[o + 1] = Math.round(sg / sa);
        out[o + 2] = Math.round(sb / sa);
        // sa 是 alpha(0-255) 之和，除以覆盖像素数即平均 alpha(0-255)，无需再乘 255
        out[o + 3] = Math.round(sa / ((x1 - x0) * (y1 - y0)));
      }
    }
  }
  return out;
}

// ===== ICO 封装（PNG-in-ICO）=====
function encodeICO(images) {
  const n = images.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // icon
  header.writeUInt16LE(n, 4);
  const entries = [];
  const datas = [];
  let offset = 6 + 16 * n;
  for (const img of images) {
    const e = Buffer.alloc(16);
    e.writeUInt8(img.w >= 256 ? 0 : img.w, 0);
    e.writeUInt8(img.h >= 256 ? 0 : img.h, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(img.png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += img.png.length;
    entries.push(e);
    datas.push(img.png);
  }
  return Buffer.concat([header, ...entries, ...datas]);
}

// ===== 主流程 =====
const sizes = [256, 128, 64, 48, 32, 24, 16];
const master = drawIcon(256);
const images = sizes.map((s) => ({
  w: s,
  h: s,
  png: encodePNG(s, s, s === 256 ? master : scaleDown(master, 256, s)),
}));

fs.mkdirSync(path.join(ROOT, "build"), { recursive: true });
fs.mkdirSync(path.join(ROOT, "resources"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "build", "icon.ico"), encodeICO(images));
fs.writeFileSync(path.join(ROOT, "resources", "icon.png"), images[0].png);
fs.writeFileSync(path.join(ROOT, "resources", "tray-icon.png"), images.find((i) => i.w === 32).png);
console.log("图标生成完成:");
console.log(" - build/icon.ico (" + sizes.join("/") + ")");
console.log(" - resources/icon.png (256x256)");
console.log(" - resources/tray-icon.png (32x32)");
