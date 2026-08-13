// 用用户精修的 256/32 ICO 合并生成完整多尺寸图标三件套
// 输入：C:/Users/nimo/Desktop/ico/256256.ico + 3232.ico
// 输出：build/icon.ico（多尺寸）+ resources/icon.png(256) + resources/tray-icon.png(32)
// 256 与 32 用用户原版像素（保持精修质量），中间尺寸从 256 缩放补齐
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIR = "C:/Users/nimo/Desktop/ico";

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
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ===== PNG 解码（8-bit RGBA 非交错，直接内存 Buffer，不落盘）=====
function decodePNGBuffer(buf) {
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
  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const bpp = ihdr[9] === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const pixels = Buffer.alloc(width * height * 4);
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
        case 4: {
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
        default: throw new Error("未知过滤: " + filter);
      }
      pixels[y * stride + x] = val;
    }
    if (bpp === 3) {
      for (let x = stride - 1, o = y * width * 4 + width * 4 - 1; x >= 0; x -= 3) {
        pixels[o] = pixels[y * stride + x];
        pixels[o - 1] = pixels[y * stride + x - 1];
        pixels[o - 2] = pixels[y * stride + x - 2];
        pixels[o - 3] = 255;
        o -= 4;
      }
    }
  }
  return { width, height, rgba: pixels };
}

// ===== ICO 帧提取 =====
// 从 ICO 提取指定尺寸的帧像素；PNG-in-ICO 走 PNG 解码，DIB-in-ICO 走 DIB 解码
function extractIcoFrame(icoPath) {
  const buf = fs.readFileSync(icoPath);
  const count = buf.readUInt16LE(4);
  for (let i = 0; i < count; i++) {
    const e = buf.subarray(6 + i * 16, 6 + i * 16 + 16);
    const w = e[0] || 256;
    const h = e[1] || 256;
    const sz = e.readUInt32LE(8);
    const off = e.readUInt32LE(12);
    const frame = buf.subarray(off, off + sz);
    // PNG-in-ICO？
    if (frame.length > 8 && frame[0] === 0x89 && frame[1] === 0x50) {
      const r = decodePNGBuffer(frame);
      if (r.width === w && r.height === h) return { width: w, height: h, rgba: r.rgba };
      return { width: w, height: h, rgba: scaleDown(r.rgba, r.width, w) };
    }
    // DIB-in-ICO（BITMAPINFOHEADER）
    const dib = frame;
    const bpp = dib.readUInt16LE(14);
    const dibH = Math.abs(dib.readInt32LE(8)) / 2; // 高含 AND mask
    if (bpp !== 32) throw new Error("仅支持 32bpp DIB，实际 " + bpp);
    const xorSize = w * h * 4;
    // DIB 数据自下而上存储（bottom-up）：第 0 行是图像最底行
    const px = Buffer.alloc(w * h * 4);
    const dataStart = 40; // BITMAPINFOHEADER 固定 40 字节
    for (let row = 0; row < h; row++) {
      const srcRow = dataStart + row * w * 4; // bottom-up: row 0 = 最底
      const dstY = h - 1 - row;
      for (let x = 0; x < w; x++) {
        const si = srcRow + x * 4;
        const di = (dstY * w + x) * 4;
        // ICO 中 BGRA 顺序
        px[di] = dib[si + 2];     // R
        px[di + 1] = dib[si + 1]; // G
        px[di + 2] = dib[si];     // B
        px[di + 3] = dib[si + 3]; // A
      }
    }
    // AND 掩码处理：DIB 高=2h 时掩码在 XOR 之后，1 表示透明
    const andRowBytes = Math.ceil(w / 32) * 4;
    const andStart = dataStart + h * w * 4;
    for (let row = 0; row < h; row++) {
      const srcRow = andStart + row * andRowBytes;
      const dstY = h - 1 - row;
      for (let x = 0; x < w; x++) {
        const byte = dib[srcRow + Math.floor(x / 8)];
        const bit = (byte >> (7 - (x % 8))) & 1;
        if (bit === 1) px[(dstY * w + x) * 4 + 3] = 0;
      }
    }
    return { width: w, height: h, rgba: px };
  }
  throw new Error("ICO 无帧: " + icoPath);
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
const p256 = path.join(SRC_DIR, "256256.ico");
const p32 = path.join(SRC_DIR, "3232.ico");
console.log("提取 256 帧...");
const f256 = extractIcoFrame(p256);
console.log("  256: " + f256.width + "x" + f256.height + " RGBA " + (f256.rgba.length / 1024).toFixed(1) + " KB");
console.log("提取 32 帧...");
const f32 = extractIcoFrame(p32);
console.log("  32: " + f32.width + "x" + f32.height + " RGBA " + (f32.rgba.length / 1024).toFixed(1) + " KB");

// 尺寸集合：256/32 用用户原版，其余从 256 缩放
const sizes = [256, 128, 64, 48, 32, 24, 16];
const images = sizes.map((s) => {
  let rgba;
  if (s === 256) rgba = f256.rgba;
  else if (s === 32) rgba = f32.rgba;
  else rgba = scaleDown(f256.rgba, 256, s);
  return { w: s, h: s, png: encodePNG(s, s, rgba) };
});

fs.mkdirSync(path.join(ROOT, "build"), { recursive: true });
fs.mkdirSync(path.join(ROOT, "resources"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "build", "icon.ico"), encodeICO(images));
fs.writeFileSync(path.join(ROOT, "resources", "icon.png"), encodePNG(256, 256, f256.rgba));
fs.writeFileSync(path.join(ROOT, "resources", "tray-icon.png"), encodePNG(32, 32, f32.rgba));
console.log("✓ 图标已生成（256/32 为用户精修原版，其余从 256 缩放）:");
console.log("  - build/icon.ico (" + sizes.join("/") + ")");
console.log("  - resources/icon.png (256x256)");
console.log("  - resources/tray-icon.png (32x32)");
