// ============================================================
// 小风音乐 · 波点音乐接入入口（lib/bodian/index.js）
// 职责：设备号持久化 + 会话持久化 + 对外工厂
//
// 许可说明：实现参考 MIT 许可的 MoeclubM/PyBodian；
//           ⚠️ 不得以 AGPL-3.0 的 Folia / bodian-music-api 为源码来源。
// ============================================================
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const { createBodianApi } = require("./client");
const { decodeLyrics, parseAwlrc, maybeBase64Decode, decodeBodianWordTiming } = require("./lyrics");
const http = require("./http");

const DEVICE_FILE = "bodian-device.json";
const SESSION_FILE = "bodian-session.json";

// ---------- 设备号：32 位小写 hex，必须稳定（换号会掉播放权限）----------
function getOrCreateDeviceId(stateDir) {
  const file = path.join(stateDir, DEVICE_FILE);
  try {
    if (fs.existsSync(file)) {
      const saved = JSON.parse(fs.readFileSync(file, "utf-8"));
      if (saved && typeof saved.deviceId === "string" && /^[a-f0-9]{32}$/.test(saved.deviceId)) {
        return saved.deviceId;
      }
    }
  } catch (_) { /* 损坏则重建 */ }
  const deviceId = crypto.randomBytes(16).toString("hex");
  try {
    if (!fs.existsSync(stateDir)) fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ deviceId }, null, 2));
  } catch (_) { /* 落盘失败仍可用，只是重启后换号 */ }
  return deviceId;
}

// ---------- 会话存储（同步接口 + revision 递增，与协议包契约一致）----------
function createSessionStore(stateDir) {
  const file = path.join(stateDir, SESSION_FILE);
  let revision = 0;
  let session = null;

  try {
    if (fs.existsSync(file)) {
      const saved = JSON.parse(fs.readFileSync(file, "utf-8"));
      if (saved && saved.uid && saved.token) session = saved;
    }
  } catch (_) { session = null; }

  const persist = () => {
    try {
      if (!fs.existsSync(stateDir)) fs.mkdirSync(stateDir, { recursive: true });
      if (session) fs.writeFileSync(file, JSON.stringify(session, null, 2));
      else if (fs.existsSync(file)) fs.unlinkSync(file);
    } catch (_) { /* ignore */ }
  };

  return {
    get revision() { return revision; },
    get() { return session; },
    set(next) {
      revision += 1;
      session = next ? { uid: String(next.uid), token: String(next.token), user: next.user || null } : null;
      persist();
    },
    clear() {
      revision += 1;
      session = null;
      persist();
    },
  };
}

// ---------- 工厂 ----------
function createBodian({ stateDir } = {}) {
  const dir = stateDir || path.join(require("node:os").tmpdir(), "xiaofeng-bodian");
  const deviceId = getOrCreateDeviceId(dir);
  const sessions = createSessionStore(dir);
  const api = createBodianApi({ deviceId, getSession: () => sessions.get() });
  return { deviceId, sessions, api, stateDir: dir };
}

module.exports = {
  createBodian,
  createBodianApi,
  getOrCreateDeviceId,
  createSessionStore,
  decodeLyrics,
  parseAwlrc,
  maybeBase64Decode,
  decodeBodianWordTiming,
  ...http,
};
