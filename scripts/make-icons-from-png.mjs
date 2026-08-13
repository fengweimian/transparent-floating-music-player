// 从外部 PNG 文件生成图标三件套：build/icon.ico + resources/icon.png + resources/tray-icon.png
// 纯 Node 实现 PNG 解码 + 缩放 + 多尺寸 ICO 封装，无第三方依赖
// 用法：node scripts/make-icons-from-png.mjs [源PNG路径]  (默认 C:/Users/nimo/Desktop/xiaofeng.png)

import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcPath = process.argv[2] || "C:/Users/nimo/Desktop/xiaofeng.png";

// ===== PNG 解码（仅支持 8-bit RGBA 非交错，这是 xiaofeng.png 的格式）=====
function decodePNG(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf.readUInt32BE(0) !== 0x89504e47 || buf.readUInt32BE(4) !== 0x0d0a1a0a) {
    throw new Error("不是有效 PNG 文件: " + filePath);
  }
  let off = 8;
  let ihdr = null;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    off += 8 + len + 4;
    if (type === "IHDR") ihdr = data;
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
  }
  if (!ihdr) throw new Error("PNG 缺 IHDR chunk");
  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const bitDepth = ihdr[8];
  const colorType = ihdr[9]; // 2=RGB, 6=RGBA
  const interlace = ihdr[12];
  if (bitDepth !== 8) throw new Error("仅支持 8-bit PNG (实际 bitDepth=" + bitDepth + ")");
  if (colorType !== 2 && colorType !== 6) throw new Error("仅支持 RGB/RGBA PNG (colorType=" + colorType + ")");
  if (interlace !== 0) throw new Error("不支持交错 PNG");

  const bpp = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const pixels = Buffer.alloc(width * height * 4); // 输出统一 RGBA

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const lineStart = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x++) {
      const cur = raw[lineStart + x];
      const left = x >= bpp ? pixels[y * stride + x - bpp] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upLeft = (x >= bpp && y > 0) ? pixels[(y - 1) * stride + x - bpp] : 0;
      let val;
      switch (filter) {
        case 0: val = cur; break;
        case 1: val = (cur + left) & 0xff; break;
        case 2: val = (cur + up) & 0xff; break;
        case 3: val = (cur + Math.floor((left + up) / 2)) & 0xff; break;
        case 4: { // Paeth
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);
          let pr;
          if (pa <= pb && pa <= pc) pr = left;
          else if (pb <= pc) pr = up;
          else pr = upLeft;
          val = (cur + pr) & 0xff;
          break;
        }
        default: throw new Error("未知过滤类型: " + filter);
      }
      pixels[y * stride + x] = val;
    }
    // 若是 RGB（无 alpha），补上 alpha=255
    if (bpp === 3) {
      for (let x = stride - 1, o = y * width * 4 + width * 4 - 1; x >= 0; x -= 3) {
        const a = pixels[y * stride + x];
        pixels[o] = a;            // R
        pixels[o - 1] = pixels[y * stride + x - 1]; // G
        pixels[o - 2] = pixels[y * stride + x - 2]; // B
        pixels[o - 3] = 255;      // A
        o -= 4;
      }
    }
  }
  return { width, height, rgba: pixels };
}

// ===== PNG 编码（与 make-icons.mjs 一致）=====
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

// ===== 缩放（alpha 加权平均，与 make-icons.mjs 一致）=====
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
        out[o + 3] = Math.round(sa / ((x1 - x0) * (y1 - y0)));
      }
    }
  }
  return out;
}

// ===== ICO 封装（PNG-in-ICO，与 make-icons.mjs 一致）=====
function encodeICO(images) {
  const n = images.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
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
if (!fs.existsSync(srcPath)) {
  console.error("✘ 源文件不存在: " + srcPath);
  process.exit(1);
}
console.log("解码 PNG: " + srcPath);
const src = decodePNG(srcPath);
console.log("源图: " + src.width + "x" + src.height + " (RGBA " + (src.rgba.length / 1024).toFixed(1) + " KB)");

// 多尺寸缩放（256 是 master）
const sizes = [256, 128, 64, 48, 32, 24, 16];
const images = sizes.map((s) => ({
  w: s,
  h: s,
  png: encodePNG(s, s, s === src.width && s === src.height ? src.rgba : scaleDown(src.rgba, src.width, s)),
}));

fs.mkdirSync(path.join(ROOT, "build"), { recursive: true });
fs.mkdirSync(path.join(ROOT, "resources"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "build", "icon.ico"), encodeICO(images));
fs.writeFileSync(path.join(ROOT, "resources", "icon.png"), images[0].png);
fs.writeFileSync(path.join(ROOT, "resources", "tray-icon.png"), images.find((i) => i.w === 32).png);
console.log("✓ 图标已生成:");
console.log("  - build/icon.ico (" + sizes.join("/") + ")");
console.log("  - resources/icon.png (256x256)");
console.log("  - resources/tray-icon.png (32x32)");