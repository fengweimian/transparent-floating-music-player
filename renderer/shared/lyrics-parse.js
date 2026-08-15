// ============================================================
// 小风音乐 · 共享歌词解析层（renderer/shared/lyrics-parse.js）
// LRC（含翻译拆分）+ 逐字歌词（网易云 YRC / QQ 音乐 QRC）解析
// 提取自经典模板 lyrics.js 的成熟实现，两模板共用
// ============================================================
(function () {
  "use strict";

  // ---------- LRC 解析（含「原文 (翻译)」拆分）----------
  // 返回 [{ time: ms, text, trans }]
  function parseLrc(text) {
    const lines = [];
    const re = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
    const body = String(text || "").replace(/^\uFEFF/, "");
    for (const raw of body.split(/\r?\n/)) {
      re.lastIndex = 0;
      let m;
      const tags = [];
      while ((m = re.exec(raw)) !== null) {
        const min = parseInt(m[1]);
        const sec = parseInt(m[2]);
        let ms = parseInt(m[3] || "0");
        if (m[3] && m[3].length === 2) ms *= 10;
        else if (m[3] && m[3].length === 1) ms *= 100;
        tags.push(min * 60000 + sec * 1000 + ms);
      }
      if (tags.length === 0) continue;
      let content = raw.replace(re, "").trim();
      if (!content) continue;
      // 翻译拆分：行尾 (翻译)，且括号前是外文才拆
      // ⚠️ v3.5.2：语言范围从"英/日/韩"扩展为"任何非中文书写字符"（俄/阿/泰/西里尔等），
      //    中文歌词的"（合唱）（伴奏）"等说明括号仍不会误拆（括号前为纯中文/数字/标点）
      let trans = "";
      const m2 = content.match(/[（(]([^（）()]*)[）)]\s*$/);
      if (m2) {
        const before = content.slice(0, m2.index).trim();
        const hasForeign = /[^\u4e00-\u9fff\u3000-\u303f\uff00-\uffef\d\s]/.test(before);
        if (hasForeign && before) { content = before; trans = m2[1].trim(); }
      }
      for (const t of tags) lines.push({ time: t, text: content, trans });
    }
    lines.sort((a, b) => a.time - b.time);
    return lines;
  }

  // ---------- QQ 音乐 QRC 逐字 ----------
  // [行开始ms,行时长ms]字(偏移ms,时长ms)字(偏移,时长)... → [{ start: sec, chars: [{text,start,dur}] }]
  function parseQrc(raw) {
    const out = [];
    for (const line of String(raw || "").split(/\r?\n/)) {
      const m = line.match(/^\[(\d+),(\d+)\](.*)$/);
      if (!m) continue;
      const lineStart = parseInt(m[1], 10);
      const body = m[3];
      const chars = [];
      const re = /([^()]+)\((\d+),(\d+)\)/g;
      let mm;
      while ((mm = re.exec(body)) !== null) {
        // ⚠️ v3.5.2：保留空格字（QRC 中空格也带时间戳，trim 后为空不应丢弃——否则英文歌词连写）
        const rawText = mm[1];
        const text = rawText.trim() || (rawText ? " " : "");
        const offset = parseInt(mm[2], 10);
        const dur = parseInt(mm[3], 10);
        if (!text) continue;
        chars.push({ text, start: offset / 1000, dur: dur / 1000 });
      }
      if (chars.length > 0) out.push({ start: lineStart / 1000, chars });
    }
    return out;
  }

  // ---------- 网易云 YRC 逐字 ----------
  // 两种行格式：带方括号 [行开始ms,行时长ms] 或 无方括号 行开始ms,行时长ms
  // 字级：(cursor,dur,unused)text 主格式 / text(cursor,dur,unused) 备选
  function parseYrc(yrc) {
    const out = [];
    for (const line of String(yrc || "").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith("{") || trimmed.startsWith("<")) continue;
      let m = trimmed.match(/^\[(\d+),(\d+)\](.*)$/);
      let body = null;
      let lineStart = 0;
      if (m) {
        lineStart = parseInt(m[1], 10);
        body = m[3];
      } else {
        m = trimmed.match(/^(\d+),(\d+)\s*(.*)$/);
        if (m && m[3]) {
          lineStart = parseInt(m[1], 10);
          body = m[3];
        }
      }
      if (body == null) continue;
      const chars = parseYrcChars(body);
      if (chars.length > 0) out.push({ start: lineStart / 1000, chars });
    }
    return out;
  }

  function parseYrcChars(body) {
    const chars = [];
    const b = String(body || "").trim();
    if (!b) return chars;
    // ⚠️ v3.5.2：按格式判断而非匹配结果判断——
    //    以 ( 开头 → (cursor,dur)text 主格式；否则 → text(cursor,dur) 备选格式。
    //    旧逻辑"主格式匹配 0 个才用备选"会在混合数据上漏掉首字（如 H(2000,100)e... 丢 H）
    if (b.startsWith("(")) {
      // 主格式（网易云 API）：(cursor,dur,unused)text —— 时间戳在文本前面
      const re = /\((\d+),(\d+)(?:,\d+)?\)([^()]*)/g;
      let mm;
      while ((mm = re.exec(b)) !== null) {
        // ⚠️ v3.5.2：保留空格字（YRC 中空格带时间戳，trim 后为空不应丢弃）
        const rawText = mm[3] || "";
        const text = rawText.trim() || (rawText ? " " : "");
        if (!text) continue;
        chars.push({ text, start: parseInt(mm[1], 10) / 1000, dur: parseInt(mm[2], 10) / 1000 });
      }
    } else {
      // 备选格式（部分渠道）：text(cursor,dur,unused)
      const re = /([^()]+)\((\d+),(\d+)(?:,\d+)?\)/g;
      let mm;
      while ((mm = re.exec(b)) !== null) {
        const rawText = mm[1];
        const text = rawText.trim() || (rawText ? " " : "");
        if (!text) continue;
        chars.push({ text, start: parseInt(mm[2], 10) / 1000, dur: parseInt(mm[3], 10) / 1000 });
      }
    }
    return chars;
  }

  // ---------- 逐字行挂载到 LRC 行（顺序匹配 + 文本优先 + 3s 容差）----------
  // lines: [{time:ms, text}], charLines: [{start:sec, chars}]
  function attachChars(lines, charLines) {
    if (!lines || !charLines || !lines.length || !charLines.length) return;
    let yi = 0;
    for (let li = 0; li < lines.length && yi < charLines.length; li++) {
      const lrcTime = lines[li].time;
      const lrcText = lines[li].text.replace(/\s+/g, "");
      let best = -1;
      let bestScore = Infinity;
      for (let j = yi; j < charLines.length; j++) {
        const yl = charLines[j];
        const yText = yl.chars.map((c) => c.text).join("").replace(/\s+/g, "");
        const dTime = Math.abs(yl.start * 1000 - lrcTime);
        const score = yText === lrcText ? dTime / 100 : 1 + dTime;
        if (score < bestScore && dTime < 3000) { bestScore = score; best = j; }
        if (yl.start * 1000 - lrcTime > 5000 && best >= 0) break;
      }
      if (best >= 0) { lines[li].chars = charLines[best].chars; yi = best + 1; }
    }
  }

  window.XFLyrics = { parseLrc, parseQrc, parseYrc, attachChars };
})();
