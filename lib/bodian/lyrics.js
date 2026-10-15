// ============================================================
// 小风音乐 · 波点歌词解码（lib/bodian/lyrics.js）
//
// 波点歌词为「混淆后的 AWLRC」：
//   · 请求：mlyric.kuwo.cn/mobi.s?f=bodian&q=base64(type=lyric&req=2&lrcx=1&rid={id}&...)
//   · `q` 与响应 data.content 均为 Base64
//   · 逐字系数藏在 [kuwo:NN]（⚠️ 八进制）：factors=parseInt(NN,8)
//       startFactor = ⌊factors/10⌋，durationFactor = factors%10
//   · 字级标记 <a,b> → start=⌊|a+b|/(2*startFactor)⌋、duration=⌊|a-b|/(2*durationFactor)⌋
//     输出标准 AWLRC 的 <start,duration>（**相对行首**的毫秒）
//   · 行级歌词 = 去掉 <> 与 [kuwo:] 后的纯文本
//
// 参考实现：MIT 许可的 MoeclubM/PyBodian（见 NOTICE 说明）
// ============================================================
"use strict";

// ---------- Base64 判定与解码 ----------
// 协议上 content 是 Base64，但个别渠道会直接给明文；两边都要能认
function maybeBase64Decode(raw) {
  const text = String(raw || "");
  // 明文（含 LRC 行标签或行尾标签）直接返回
  if (text.includes("[") && /\[\d{1,3}:\d{1,2}/.test(text)) return text;
  if (text.includes("[kuwo:")) return text;
  if (!/^[A-Za-z0-9+/=\s]+$/.test(text.trim())) return text;
  try {
    const decoded = Buffer.from(text.trim(), "base64").toString("utf8");
    if (decoded.includes("[") && (/\[\d{1,3}:\d{1,2}/.test(decoded) || decoded.includes("[kuwo:"))) {
      return decoded;
    }
  } catch (_) { /* ignore */ }
  return text;
}

// ---------- 逐字系数还原 → AWLRC ----------
function decodeBodianWordTiming(content) {
  const tag = String(content || "").match(/\[kuwo:([0-7]+)(?:\]\[.*)?\]/);
  const factors = tag ? parseInt(tag[1], 8) : 11; // 无标签时缺省 11 → 系数 1/1
  const startFactor = Math.trunc(factors / 10);
  const durationFactor = factors % 10;
  if (!startFactor || !durationFactor) return null;
  return String(content)
    .replace(/\[kuwo:[^\]]*\]/g, "")
    .replace(/<(-?\d+),(-?\d+)>/g, (_m, left, right) => {
      const a = Number(left);
      const b = Number(right);
      const start = Math.trunc(Math.abs((a + b) / (2 * startFactor)));
      const duration = Math.trunc(Math.abs((a - b) / (2 * durationFactor)));
      return `<${start},${duration}>`;
    });
}

// ---------- 解码入口：{ mainText, wordByWordText } ----------
function decodeLyrics(raw) {
  const content = maybeBase64Decode(raw);
  const hasWordTiming = /<-?\d+,-?\d+>/.test(content);
  return {
    mainText: content.replace(/<-?\d+,-?\d+>/g, "").replace(/\[kuwo:[^\]]*\]/g, ""),
    wordByWordText: hasWordTiming ? decodeBodianWordTiming(content) : null,
  };
}

// ---------- AWLRC → 行数组 ----------
// 输出：[{ time(ms), text, chars: [{ text, start(秒，绝对), dur(秒) }] }]
// ⚠️ 渲染层拿 chars[i].start 直接与播放秒数比较 → 必须是**绝对秒**（行时间 + 字偏移）
function parseAwlrc(awlrcText) {
  const out = [];
  const body = String(awlrcText || "").replace(/^\uFEFF/, "");
  const timeRe = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;

  for (const rawLine of body.split(/\r?\n/)) {
    timeRe.lastIndex = 0;
    const tags = [];
    let m;
    while ((m = timeRe.exec(rawLine)) !== null) {
      const min = parseInt(m[1], 10);
      const sec = parseInt(m[2], 10);
      let ms = parseInt(m[3] || "0", 10);
      if (m[3] && m[3].length === 2) ms *= 10;
      else if (m[3] && m[3].length === 1) ms *= 100;
      tags.push(min * 60000 + sec * 1000 + ms);
    }
    if (!tags.length) continue;

    const content = rawLine.replace(timeRe, "").replace(/\[kuwo:[^\]]*\]/g, "");
    if (!content.trim()) continue;

    const chars = splitAwlrcChars(content);
    const text = chars.length ? chars.map((c) => c.text).join("") : content;
    for (const t of tags) {
      out.push({ time: t, text, chars: chars.length ? shiftChars(chars, t) : [] });
    }
  }

  out.sort((a, b) => a.time - b.time);
  return out;
}

// 把行内标记拆成 [text][mark][text][mark]… 序列，兼容「标记在字前」与「标记在字后」两种排布
function splitAwlrcChars(content) {
  const parts = [];
  const re = /<(-?\d+),(-?\d+)>/g;
  let idx = 0;
  let m;
  while ((m = re.exec(content)) !== null) {
    if (m.index > idx) parts.push({ type: "text", value: content.slice(idx, m.index) });
    parts.push({ type: "mark", start: Number(m[1]), dur: Number(m[2]) });
    idx = re.lastIndex;
  }
  if (idx < content.length) parts.push({ type: "text", value: content.slice(idx) });

  if (!parts.length) return [];
  // 首个元素是标记 → 「标记在字前」；否则「标记在字后」
  const markFirst = parts[0].type === "mark";
  const chars = [];

  if (markFirst) {
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (p.type !== "mark") continue;
      const next = parts[i + 1];
      const text = next && next.type === "text" ? next.value : "";
      if (!text) continue;
      chars.push({ text, start: p.start, dur: p.dur });
    }
  } else {
    let pending = null;
    for (const p of parts) {
      if (p.type === "text") {
        if (pending) { chars.push({ text: pending.value, start: pending.mark.start, dur: pending.mark.dur }); }
        pending = { value: p.value, mark: null };
      } else if (pending) {
        pending.mark = p;
      }
    }
    // 行尾无标记的残余文本：沿用上一字的结束时间兜底
    if (pending && pending.value && !pending.mark) {
      const prev = chars[chars.length - 1];
      const start = prev ? prev.start + (prev.dur || 0) : 0;
      chars.push({ text: pending.value, start, dur: 0 });
    }
  }

  return chars.filter((c) => c.text);
}

// 行内相对毫秒 → 绝对秒
function shiftChars(chars, lineTimeMs) {
  return chars.map((c) => ({
    text: c.text,
    start: (lineTimeMs + c.start) / 1000,
    dur: Math.max(0, (c.dur || 0) / 1000),
  }));
}

module.exports = { maybeBase64Decode, decodeBodianWordTiming, decodeLyrics, parseAwlrc };
