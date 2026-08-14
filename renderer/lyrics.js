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
      const result = await XFApi.lyric(track.id, track.server);
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

  // 歌词解析统一走共享层 XFLyrics（三份实现合一的唯一真源）：
  //   parseLrc 输出毫秒 time + 行内翻译 trans；QRC/YRC 输出秒 + 逐字 chars。
  // 本模板渲染层依赖「秒」单位，故 time 统一 /1000 换算；
  // 行内翻译原样拼回文本（与旧 parseLines 行为一致，tlyric 翻译另走 tlines）。
  parse(raw, traw = "", yrc = "") {
    const linesMs = XFLyrics.parseLrc(raw);
    const toSeconds = (l) => ({
      time: l.time / 1000,
      text: l.trans ? l.text + "(" + l.trans + ")" : l.text,
    });
    this.lines = linesMs.map(toSeconds);
    this.tlines = traw ? XFLyrics.parseLrc(traw).map((l) => ({ time: l.time / 1000, text: l.text })) : [];
    // 逐字歌词：自动识别 QQ 音乐 QRC（[ms,ms]字(偏移,时长)） vs 网易云 YRC
    if (yrc) {
      // 先试 QRC（QQ 音乐，字在括号前，自包含行信息 → 直接替换 this.lines，无需 LRC 匹配）
      let lyricLines = XFLyrics.parseQrc(yrc);
      if (lyricLines.length > 0) {
        this.lines = lyricLines.map((l) => ({
          time: l.start,
          text: l.chars.map((c) => c.text).join(""),
          chars: l.chars,
        }));
      } else {
        // 再试 YRC（网易云，时间戳在前），需要与 LRC 行匹配挂载（在毫秒 lines 上执行）
        lyricLines = XFLyrics.parseYrc(yrc);
        if (lyricLines.length > 0) {
          XFLyrics.attachChars(linesMs, lyricLines);
          this.lines = linesMs.map((l) => ({
            time: l.time / 1000,
            text: l.trans ? l.text + "(" + l.trans + ")" : l.text,
            chars: l.chars,
          }));
        }
      }
    }
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
          ? l.chars.map((c) => XFUtils.escapeHtml(c.text)).join("")
          : XFUtils.escapeHtml(l.text);
        textHtml = `<span class="lyrics-scan" data-idx="${i}" style="--scan-p:0%">${scanText}</span>`;
        return `<div class="lyrics-line" data-idx="${i}"><span class="lyrics-text">${textHtml}</span>${
          trans ? `<span class="lyrics-trans">${XFUtils.escapeHtml(trans)}</span>` : ""
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
}
