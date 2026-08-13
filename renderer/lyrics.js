class Lyrics {
  constructor(container, content) {
    this.lines = [];
    this.tlines = [];
    this.currentIdx = -1;
    this.musicFolder = "";
    this.hasLyrics = false;
    this.showTranslation = false;

    this.container = container || document.getElementById("lyrics");
    this.content = content || document.getElementById("lyrics-content");
  }

  setMusicFolder(path) {
    this.musicFolder = path;
  }

  setShowTranslation(show) {
    this.showTranslation = !!show;
    if (this.hasLyrics) this.renderAll();
  }

  async loadForTrack(track) {
    this.lines = [];
    this.tlines = [];
    this.currentIdx = -1;
    this.hasLyrics = false;
    if (this.content) this.content.innerHTML = "";

    if (!track) return;

    let raw = null;
    let traw = "";
    let yrc = "";

    if (track.type === "online") {
      const result = await window.electronAPI.music.lyric(track.id, track.server);
      if (result && result.lyric) {
        raw = result.lyric;
        traw = result.tlyric || "";
        // QQ 音乐返回 qrc 字段，网易云返回 yrc 字段，统一合并传入 parse
        yrc = result.qrc || result.yrc || "";
      }
    }

    if (!raw && track.type === "local" && track.name) {
      const baseName = track.name.replace(/\.[^.]+$/, "");
      const lrcPath = await window.electronAPI.path.join(this.musicFolder, baseName + ".lrc");
      raw = await window.electronAPI.fs.readFile(lrcPath);
    }

    if (!raw) {
      if (this.content) this.content.innerHTML = '<div class="lyrics-placeholder">No lyrics found</div>';
      return;
    }

    this.parse(raw, traw, yrc);

    if (this.lines.length > 0) {
      this.hasLyrics = true;
      this.renderAll();
      if (this.container) this.container.classList.add("visible");
      requestAnimationFrame(() => {
        const firstLine = this.content.querySelector(".lyrics-line");
        if (firstLine) {
          firstLine.scrollIntoView({ behavior: "instant", block: "center" });
        }
      });
    } else {
      if (this.content) this.content.innerHTML = '<div class="lyrics-placeholder">No lyrics</div>';
    }
  }

  parse(raw, traw = "", yrc = "") {
    this.lines = this.parseLines(raw);
    this.tlines = traw ? this.parseLines(traw) : [];
    // 逐字歌词：自动识别 QQ 音乐 QRC（[ms,ms]字(偏移,时长)） vs 网易云 YRC
    if (yrc) {
      // 先试 QRC（QQ 音乐，字在括号前）
      let lyricLines = this.parseQrc(yrc);
      if (lyricLines.length > 0) {
        // QRC 自包含行信息（行时间 + 行文本 + 逐字时间），直接替换 this.lines，无需 LRC 匹配
        this.lines = lyricLines.map((l) => ({
          time: l.start,
          text: l.chars.map((c) => c.text).join(""),
          chars: l.chars,
        }));
      } else {
        // 再试 YRC（网易云，时间戳在前），需要与 LRC 行匹配挂载
        lyricLines = this.parseYrc(yrc);
        if (lyricLines.length > 0) {
          this._matchAndAttach(lyricLines);
        }
      }
    }
  }

  // QQ 音乐 QRC 逐字格式：[行开始ms,行时长ms]字(偏移ms,时长ms)字(偏移,时长)...
  // 字时间为相对行开始的偏移；标点/空格也可能有独立时间戳。
  parseQrc(raw) {
    const out = [];
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\[(\d+),(\d+)\](.*)$/);
      if (!m) continue;
      const lineStart = parseInt(m[1], 10);
      const body = m[3];
      const chars = [];
      // 字格式：文本(偏移,时长) —— 文本在括号前
      const re = /([^()]+)\((\d+),(\d+)\)/g;
      let mm;
      while ((mm = re.exec(body)) !== null) {
        const text = mm[1].trim();
        const offset = parseInt(mm[2], 10);
        const dur = parseInt(mm[3], 10);
        if (!text) continue;
        chars.push({ text, start: offset / 1000, dur: dur / 1000 });
      }
      if (chars.length > 0) {
        out.push({ start: lineStart / 1000, chars });
      }
    }
    return out;
  }

  // YRC/QRC 行挂载到 LRC 行（顺序匹配 + 文本优先 + 3s 容差）
  _matchAndAttach(lyricLines) {
    let yi = 0;
    for (let li = 0; li < this.lines.length && yi < lyricLines.length; li++) {
      const lrcTime = this.lines[li].time;
      const lrcText = this.lines[li].text.replace(/\s+/g, "");
      let best = -1;
      let bestScore = Infinity;
      for (let j = yi; j < lyricLines.length; j++) {
        const yl = lyricLines[j];
        const yText = yl.chars.map((c) => c.text).join("").replace(/\s+/g, "");
        const dTime = Math.abs(yl.start - lrcTime);
        const score = yText === lrcText ? dTime / 100 : 1 + dTime;
        if (score < bestScore && dTime < 3) { bestScore = score; best = j; }
        if (yl.start - lrcTime > 5 && best >= 0) break;
      }
      if (best >= 0) { this.lines[li].chars = lyricLines[best].chars; yi = best + 1; }
    }
  }

  // 网易云 YRC 逐字歌词，两种行格式（单位均为毫秒）：
  //   带方括号: [行开始ms,行时长ms]字(字开始ms,字时长ms,0)字(...)...
  //   无方括号: 行开始ms,行时长ms字(字开始ms,字时长ms,0)字(...)...
  // 字(开始,时长,0) 的「开始」为相对歌曲开头的绝对毫秒；前 1-2 行可能为 JSON 元数据需跳过
  parseYrc(yrc) {
    const out = [];
    for (const line of yrc.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith("{") || trimmed.startsWith("<")) continue; // JSON/XML 元数据行
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
      const chars = this.parseYrcChars(body);
      if (chars.length > 0) {
        out.push({ start: lineStart / 1000, chars });
      }
    }
    return out;
  }

  // 解析一行 YRC 内的字级片段。
  // ⚠️ 网易云 API 实测格式：行头是 [行开始ms,行时长ms]，字级为 (cursor,dur,unused)text ——
  //    【时间戳在文本前面】！例如 [29150,2560](29150,250,0)看(29400,160,0)电...
  //    旧实现按 text(cursor,dur,unused) 解析（文本在前）导致首字时间戳丢失、全部错位。
  //    兼容两种方向：主格式(时间戳)文本，备选格式 文本(时间戳)。
  // cursor 为绝对毫秒（相对歌曲开头），转换为秒
  parseYrcChars(body) {
    const chars = [];
    // 主格式（网易云 API）：(cursor,dur,unused)text
    let re = /\((\d+),(\d+)(?:,\d+)?\)([^()]*)/g;
    let mm;
    while ((mm = re.exec(body)) !== null) {
      const text = (mm[3] || "").trim();
      if (!text) continue;
      chars.push({ text, start: parseInt(mm[1], 10) / 1000, dur: parseInt(mm[2], 10) / 1000 });
    }
    // 备选格式（部分渠道）：text(cursor,dur,unused)
    if (chars.length === 0) {
      re = /([^()]+)\((\d+),(\d+)(?:,\d+)?\)/g;
      while ((mm = re.exec(body)) !== null) {
        const text = mm[1].trim();
        if (!text) continue;
        chars.push({ text, start: parseInt(mm[2], 10) / 1000, dur: parseInt(mm[3], 10) / 1000 });
      }
    }
    return chars;
  }

  parseLines(raw) {
    const textLines = raw.split(/\r?\n/);
    const out = [];
    for (const line of textLines) {
      // ⚠️ 网易云官方 lrc 时间戳毫秒部分可能只有 1 位（如 [00:30.0]），
      //    正则必须 \d{1,3}（旧 \d{2,3} 会导致除元数据行外全部丢弃）
      const matches = line.match(/\[(\d{2}):(\d{2})(?:[.:](\d{1,3}))?\]/g);
      if (!matches) continue;

      const text = line.replace(/\[.*?\]/g, "").trim();
      if (!text) continue;

      for (const m of matches) {
        const parts = m.match(/\[(\d{2}):(\d{2})(?:[.:](\d{1,3}))?\]/);
        if (!parts) continue;
        const min = parseInt(parts[1], 10);
        const sec = parseInt(parts[2], 10);
        let ms = 0;
        if (parts[3]) {
          ms = parseInt(parts[3].padEnd(3, "0").substring(0, 3), 10);
        }
        out.push({ time: min * 60 + sec + ms / 1000, text });
      }
    }
    out.sort((a, b) => a.time - b.time);
    return out;
  }

  // 二分查找 time 时刻对应行（返回索引，找不到返回 -1）
  findLineIndex(lines, time) {
    let lo = 0, hi = lines.length - 1, result = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (lines[mid].time <= time) {
        result = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return result;
  }

  // 获取原文行 i 对应的翻译文本（时间最接近且不超过该行时间的翻译）
  translationFor(i) {
    if (!this.tlines || this.tlines.length === 0) return "";
    const time = this.lines[i] ? this.lines[i].time : null;
    if (time == null) return "";
    const idx = this.findLineIndex(this.tlines, time);
    return idx >= 0 ? this.tlines[idx].text : "";
  }

  renderAll() {
    this.content.innerHTML = this.lines
      .map((l, i) => {
        const trans = this.showTranslation ? this.translationFor(i) : "";
        let textHtml;
        // ⚠️ 无论有无逐字时间戳都渲染 .lyrics-scan 容器：
        //   有 chars → 逐字前沿；无 chars → 行级时间前沿（整行扫光，与新模板一致）
        const scanText = l.chars && l.chars.length > 0
          ? l.chars.map((c) => this.escape(c.text)).join("")
          : this.escape(l.text);
        textHtml = `<span class="lyrics-scan" data-idx="${i}" style="--scan-p:0%">${scanText}</span>`;
        return `<div class="lyrics-line" data-idx="${i}"><span class="lyrics-text">${textHtml}</span>${
          trans ? `<span class="lyrics-trans">${this.escape(trans)}</span>` : ""
        }</div>`;
      })
      .join("");
  }

  update(currentTime) {
    if (!this.hasLyrics) return;

    const newIdx = this.findLine(currentTime);
    if (newIdx === this.currentIdx) {
      // 同一行：持续刷新扫光进度（有逐字→逐字前沿；无逐字→行级前沿）
      if (newIdx >= 0) this.updateCharProgress(newIdx, currentTime);
      return;
    }

    this.currentIdx = newIdx;
    const els = this.content.querySelectorAll(".lyrics-line");

    els.forEach((el, i) => {
      el.classList.remove("active", "past");
      if (i === newIdx) {
        el.classList.add("active");
      } else if (i < newIdx) {
        el.classList.add("past");
      }
    });

    // 切到新行：刷新扫光进度
    if (newIdx >= 0) this.updateCharProgress(newIdx, currentTime);

    if (newIdx >= 0 && els[newIdx]) {
      els[newIdx].scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  // 卡拉OK扫光：更新整行渐变的前沿位置（--scan-p）
  // 有逐字时间戳 → 前沿 = (字索引 + 字内进度) / 总字数 × 100%（连续值，无字粒断点）
  // 无逐字时间戳 → 前沿 = 行内播放进度（当前行开始 → 下一行开始，最后一行 +6s 兜底），
  //                    整行扫光效果与新版模板一致
  updateCharProgress(idx, currentTime) {
    const lineEl = this.content.querySelector(`.lyrics-line[data-idx="${idx}"]`);
    if (!lineEl) return;
    const scan = lineEl.querySelector(".lyrics-scan");
    if (!scan) return;
    const chars = this.lines[idx].chars;
    let p;
    if (!chars || chars.length === 0) {
      // 无逐字数据 → 行级时间前沿（行 time 单位是【秒】，最后一行 +6 秒兜底）
      const start = this.lines[idx].time;
      const end = idx + 1 < this.lines.length ? this.lines[idx + 1].time : start + 6;
      const segDur = Math.max(0.001, end - start);
      p = Math.max(0, Math.min(1, (currentTime - start) / segDur)) * 100;
    } else {
      // 当前时间所在的字区间（chars 按 start 升序）
      let i = 0;
      while (i < chars.length - 1 && currentTime >= chars[i + 1].start) i++;
      // 字内进度：到下一字开始（或该字结束）的线性插值，clamp 0~1
      const segEnd = i < chars.length - 1 ? chars[i + 1].start : chars[i].start + (chars[i].dur || 0.2);
      const segDur = Math.max(0.001, segEnd - chars[i].start);
      const inner = Math.max(0, Math.min(1, (currentTime - chars[i].start) / segDur));
      p = ((i + inner) / chars.length) * 100;
    }
    scan.style.setProperty("--scan-p", p.toFixed(2) + "%");
  }

  findLine(currentTime) {
    if (this.lines.length === 0) return -1;
    let lo = 0, hi = this.lines.length - 1, result = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (this.lines[mid].time <= currentTime) {
        result = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return result;
  }

  clear() {
    this.lines = [];
    this.tlines = [];
    this.currentIdx = -1;
    this.hasLyrics = false;
    if (this.content) this.content.innerHTML = "";
    if (this.container) this.container.classList.remove("visible");
  }

  escape(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
}
