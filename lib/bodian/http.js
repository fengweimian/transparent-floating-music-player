// ============================================================
// 小风音乐 · 波点音乐协议层（lib/bodian/http.js）
// 桌面协议：bd-api.kuwo.cn（主站）/ mlyric.kuwo.cn（歌词站）
//
// ⚠️ 实现参考来源与许可：
//    协议以 MIT 许可的 MoeclubM/PyBodian 为参考独立重写（Copyright (c) 2026 MoeclubM）。
//    ⚠️ 不得以 AGPL-3.0 的 Folia / bodian-music-api 的代码为来源——
//       本项目为 MIT，引入 AGPL 代码会污染整个项目许可。
//
// 协议要点（实测/文档双重核对）：
//   · 请求头固定桌面标识：plat=win / channel=W1 / ver / svrver=13
//   · devid = qimei36 = 32 位小写 hex 设备号，必须持久化（换号会掉播放权限）
//   · 签名 sign = md5(seed + path)，seed = "kuwotest" + sorted(query 中的字母数字)，
//     有 body 时再拼 md5(body + "kuwotest")；仅部分接口需要签名
//   · 播放两个接口是 GET + 精确 JSON body + 签名，不能用 fetch GET 丢掉 body
// ============================================================
"use strict";

const https = require("node:https");
const crypto = require("node:crypto");
const zlib = require("node:zlib");

const API_ORIGIN = "https://bd-api.kuwo.cn";
const LYRIC_ORIGIN = "https://mlyric.kuwo.cn";
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 15000;

// ⚠️ 协议版本号：随官方客户端更新，失效时集中改这一处
const PROTOCOL_VER = "1.1.7";

const md5 = (text) => crypto.createHash("md5").update(String(text)).digest("hex");

// ---------- 签名 ----------
// 注意：必须与参考实现逐字节一致——签名对象包含 uid/token/timestamp，但不含 sign 自身；
// query 的字符顺序即 URLSearchParams 的插入顺序，改动顺序会直接导致签名错误（服务端拒绝）。
function signQuery(path, params, body = "") {
  const query = new URLSearchParams(params).toString();
  let seed = "kuwotest" + Array.from(query).filter((ch) => /[a-z0-9]/i.test(ch)).sort().join("");
  if (body) seed += md5(`${body}kuwotest`);
  return md5(`${seed}${path}`);
}

function desktopHeaders(deviceId) {
  return {
    "User-Agent": "Dart/3.3 (dart:io)",
    plat: "win",
    channel: "W1",
    ver: PROTOCOL_VER,
    svrver: "13",
    "api-ver": "application/json",
    brand: "Windows",
    net: "wifi",
    devid: deviceId,
    qimei36: deviceId,
    "Content-Type": "application/json",
    "Accept-Encoding": "gzip",
  };
}

class BodianError extends Error {
  constructor(code, message, upstreamCode) {
    super(message);
    this.name = "BodianError";
    this.code = code;
    this.upstreamCode = upstreamCode;
  }
}

// ---------- 底层请求 ----------
// 支持给 GET 请求带 body（Chromium/Node 都允许；不能用 fetch GET，那会丢掉 body）
function requestJson(url, options = {}) {
  const {
    method = "GET",
    headers = {},
    body = "",
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxBytes = MAX_RESPONSE_BYTES,
  } = options;

  return new Promise((resolve, reject) => {
    let settled = false;
    let timer = null;

    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (error) reject(error);
      else resolve(result);
    };

    let req;
    const abort = () => {
      try {
        if (req && typeof req.destroy === "function") req.destroy();
      } catch (_) { /* ignore */ }
    };

    try {
      req = https.request(url, { method }, (res) => {
        const chunks = [];
        let size = 0;

        res.on("data", (chunk) => {
          size += chunk.length;
          if (size > maxBytes) {
            finish(new BodianError("invalid-response", "波点响应超过大小上限"));
            abort();
            return;
          }
          chunks.push(Buffer.from(chunk));
        });

        res.on("error", () => finish(new BodianError("network", "波点响应中断")));

        res.on("end", () => {
          if (settled) return;
          const status = res.statusCode || 0;
          const bytes = Buffer.concat(chunks);
          const encoding = String(res.headers["content-encoding"] || "");
          // 有些链路已解压但仍保留 Content-Encoding，按 gzip 魔数判断更稳
          const isGzip = encoding.includes("gzip") && bytes.length > 1 && bytes[0] === 0x1f && bytes[1] === 0x8b;
          let decoded = bytes;
          try {
            if (isGzip) decoded = zlib.gunzipSync(bytes, { maxOutputLength: maxBytes });
          } catch (_) {
            return finish(new BodianError("invalid-response", "波点响应解压失败"));
          }
          if (status < 200 || status >= 300) {
            return finish(
              new BodianError(status === 401 ? "auth-required" : "network", `波点 HTTP ${status}`)
            );
          }
          try {
            finish(null, JSON.parse(decoded.toString("utf8")));
          } catch (_) {
            finish(new BodianError("invalid-response", "波点返回了无法解析的内容"));
          }
        });
      });
    } catch (e) {
      return finish(new BodianError("network", `波点请求构造失败：${e.message}`));
    }

    timer = setTimeout(() => {
      finish(new BodianError("network", "波点请求超时"));
      abort();
    }, timeoutMs);

    req.on("error", (e) => finish(new BodianError("network", `波点请求失败：${e.message}`)));

    for (const [key, value] of Object.entries(headers)) {
      try { req.setHeader(key, String(value)); } catch (_) { /* ignore */ }
    }
    if (body) req.setHeader("Content-Length", String(Buffer.byteLength(body)));
    req.end(body || undefined);
  });
}

// ---------- 协议客户端 ----------
function createBodianClient({ deviceId, getSession = () => null, now = Date.now } = {}) {
  if (typeof deviceId !== "string" || !/^[a-f0-9]{32}$/.test(deviceId)) {
    throw new TypeError("波点 deviceId 必须是 32 位小写十六进制字符串");
  }

  return {
    async call(path, opts = {}) {
      const {
        params = {},
        body,
        method = "GET",
        signed = false,
        anonymous = false,
        lyric = false,
      } = opts;

      if (!path.startsWith("/") || path.includes("..")) {
        throw new BodianError("unsupported", "非法波点路径");
      }

      const session = anonymous ? null : getSession();
      // ⚠️ 顺序敏感：params → uid → token →（签名时）timestamp → sign
      const query = { ...params, uid: String((session && session.uid) || "-1"), token: (session && session.token) || "" };
      const bodyText = body === undefined ? "" : JSON.stringify(body);

      if (signed) {
        query.timestamp = String(now());
        query.sign = signQuery(path, query, bodyText);
      }

      const base = lyric ? LYRIC_ORIGIN : API_ORIGIN;
      const url = new URL(path, base);
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }

      const headers = desktopHeaders(deviceId);
      if (session) {
        headers.uid = String(session.uid);
        headers.token = session.token;
      }

      const response = await requestJson(url.toString(), { method, headers, body: bodyText });

      if (Number(response && response.code) !== 200) {
        const code = Number(response && response.code);
        // 407 = 地区限制（仅中国大陆），不清会话
        if (code === 407) {
          const msg = response.msg || response.message;
          throw new BodianError(
            "region-restricted",
            typeof msg === "string" && msg.trim() ? msg.trim() : "由于版权保护，该资源仅限中国大陆地区使用",
            code
          );
        }
        if (code === 11012) throw new BodianError("auth-required", "波点登录态失效，请重新登录", code);
        if (code === 20018) throw new BodianError("not-playable", "该歌曲当前不可播放", code);
        throw new BodianError(
          "invalid-response",
          `波点拒绝了请求（code ${response && response.code}）`,
          code
        );
      }

      return response;
    },
  };
}

module.exports = {
  API_ORIGIN,
  LYRIC_ORIGIN,
  PROTOCOL_VER,
  MAX_RESPONSE_BYTES,
  BodianError,
  md5,
  signQuery,
  desktopHeaders,
  requestJson,
  createBodianClient,
};
