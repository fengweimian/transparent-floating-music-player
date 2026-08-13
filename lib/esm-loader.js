// ============================================================
// 小风音乐 · ESM 包动态加载器（CJS）
// ⚠️ 必须保持 CJS 明文，不能参与 bytenode 字节码编译：
//    V8 字节码模块中的 import() 会报 "A dynamic import callback was not specified"
//    本文件将全部动态 import 集中于此，main.js（字节码）通过 require() 调用
// 覆盖：@meting/core（QQ/网易云搜索、URL、歌单）、qrc-decoder（QQ QRC 逐字歌词解密）
// ============================================================
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");

let decryptQrc = null;
let MetingCtor = null;

// qrc-decoder 是 ESM 包，生产环境从 extraResources 拷贝的绝对路径导入（须指向具体 .mjs），
// 开发环境直接用模块名
function getQrcDecoderImportPath() {
  if (process.resourcesPath) {
    const prodPath = path.join(process.resourcesPath, "node_modules", "qrc-decoder", "dist", "qrc_codec.mjs");
    if (fs.existsSync(prodPath)) return pathToFileURL(prodPath).href;
  }
  return "qrc-decoder";
}

async function loadQrcDecoder() {
  if (!decryptQrc) {
    const m = await import(getQrcDecoderImportPath());
    decryptQrc = m.decryptQrc;
  }
  return decryptQrc;
}

async function loadMeting() {
  if (!MetingCtor) {
    const mod = await import("@meting/core");
    MetingCtor = mod.default;
  }
  return MetingCtor;
}

module.exports = { loadQrcDecoder, loadMeting };
