// 代码保护构建脚本：
// 1. Babel 转换 main.js 的 async 箭头函数 → 普通 async function（bytenode 已知崩溃点）
// 2. 字符串保护：weapi 密钥（WEMODULUS/WENONCE/WEPUB_KEY/WEIV）+ qrc 密钥 → String.fromCharCode IIFE
// 3. bytenode 编译为 V8 字节码 main.jsc
// 4. 生成入口 main.js（bytenode loader）
// 必须用 Electron 的 Node 运行时执行（V8 版本匹配）：ELECTRON_RUN_AS_NODE=1 electron.exe scripts/build-protected.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { transformSync as babelTransform } from "@babel/core";
import pluginArrow from "@babel/plugin-transform-arrow-functions";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// ⚠️ 源码在 scripts/main.original.js（main.js 是编译生成的 loader）
const SRC = path.join(ROOT, "scripts", "main.original.js");
const SRC_LOADER = path.join(ROOT, "main.js");
const WORK = path.join(ROOT, "scripts", "_protected");

// ===== 需要保护的字符串（密钥类，字节码中可读，必须转为 fromCharCode）=====
const PROTECTED_STRINGS = [
  "00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d813cfe4875d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7",
  "0CoJUm6Qyw8W8jud",
  "010001",
  "0102030405060708",
  "!@#)(*$%",
  "123ZXC!@",
  "!@#)(NHL",
];

// 把字符串字面量替换为 String.fromCharCode(...) 构造（字符串在源码与字节码中均不可见）
function protectStrings(code, strings) {
  for (const s of strings) {
    const fromChar = "String.fromCharCode(" + [...s].map((c) => c.charCodeAt(0)).join(",") + ")";
    // 匹配双引号或单引号包裹的字面量，注意转义
    const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(["'])${escaped}\\1`, "g");
    const before = (code.match(re) || []).length;
    code = code.replace(re, () => fromChar);
    console.log(`  [保护] "${s.slice(0, 24)}..." ${before} 处`);
  }
  return code;
}

// Babel 转换 async 箭头函数为普通函数（bytenode 兼容）
function transformAsyncArrows(code) {
  const r = babelTransform(code, {
    filename: "main.js",
    plugins: [pluginArrow],
    babelrc: false,
    configFile: false,
    sourceMaps: false,
    comments: false,
    compact: false,
    retainLines: true,
  });
  return r.code;
}

// 主流程
console.log("=== 1. 读取 main.js ===");
let code = fs.readFileSync(SRC, "utf-8");
console.log("  原始大小:", (code.length / 1024).toFixed(1), "KB");

console.log("=== 2. 字符串保护 ===");
code = protectStrings(code, PROTECTED_STRINGS);

console.log("=== 3. Babel 转换 async 箭头函数 ===");
code = transformAsyncArrows(code);
const asyncArrowsLeft = (code.match(/async\s*\(/g) || []).length;
console.log("  转换后剩余 async( 箭头:", asyncArrowsLeft, "（0 为成功）");

// 验证没有字符串残留
const leaked = PROTECTED_STRINGS.filter((s) => code.includes(s));
if (leaked.length > 0) {
  console.error("⚠️ 警告: 仍有密钥明文残留:", leaked.map((s) => s.slice(0, 16)));
} else {
  console.log("  密钥明文残留: 0 ✓");
}

fs.mkdirSync(WORK, { recursive: true });
const workMain = path.join(WORK, "main-transformed.js");
fs.writeFileSync(workMain, code);
console.log("  转换后大小:", (code.length / 1024).toFixed(1), "KB →", path.relative(ROOT, workMain));

console.log("=== 4. bytenode 编译为 V8 字节码 ===");
console.log("  当前 Node/V8:", process.version, "|", process.versions.v8);
// ⚠️ 用 electronMain:true 在真实 Electron 主进程内编译（非 ELECTRON_RUN_AS_NODE），
//    保证字节码 read-only snapshot checksum 与运行时主进程完全匹配（Electron≥42 必须，33 也推荐）
const bytenode = (await import("bytenode")).default;
await bytenode.compileFile({
  filename: workMain,
  output: path.join(ROOT, "main.jsc"),
  compileAsModule: true,
  createCache: false,
  // ⚠️ Electron 33 (V8 12.4) ≤ 41，electron:true（ELECTRON_RUN_AS_NODE 编译）的
  //    read-only snapshot checksum 与主进程兼容（electronMain 模式在本机 temp 目录
  //    无法解析 electron 模块，已弃用）
  electron: true,
  electronPath: path.join(ROOT, "node_modules", "electron", "dist", "electron.exe"),
});
console.log("  → main.jsc 已生成");

console.log("=== 5. 生成入口 main.js（bytenode loader）===");
const loader = `// ⚠️ 本文件由 scripts/build-protected.js 自动生成——真实代码在 main.jsc（V8 字节码）
// 源码备份：scripts/main.original.js
require("bytenode");
require("./main.jsc");
`;
fs.writeFileSync(SRC_LOADER, loader);
console.log("  main.js 已替换为 loader（真实代码仅存在于 main.jsc 字节码）");

// 清理工作目录
try {
  fs.rmSync(WORK, { recursive: true, force: true });
} catch (e) {
  console.log("  （工作目录清理跳过）");
}
console.log("✓ 保护构建完成");
