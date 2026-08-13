// 小风音乐 · 新布局完整功能版（纯 HTML 单文件 JS）
// 在线功能走 Meting 公共代理 api.i-meto.com（CORS 允许），无需后端
(function () {
  "use strict";

  // ============ 常量 ============
  const METING = "https://api.i-meto.com/meting/api"; // Meting 公共代理
  const LS_SETTINGS = "xf-settings";
  const LS_PLAYLISTS = "xf-playlists";

  // ============ DOM ============
  const $ = (id) => document.getElementById(id);
  const cover = $("cover");
  const coverImg = $("cover-img");
  const mainTitle = $("main-title");
  const subTitle = $("sub-title");
  const folderInput = $("folder-input");
  const btnPlay = $("btn-play");
  const iconPlay = $("icon-play");
  const iconPause = $("icon-pause");
  const btnPrev = $("btn-prev");
  const btnNext = $("btn-next");
  const btnMode = $("btn-mode");
  const btnMore = $("btn-more");
  const moreMenu = $("more-menu");
  const progressEl = $("progress");
  const progressFill = $("progress-fill");
  const progressDot = $("progress-dot");
  const timeCurrent = $("time-current");
  const timeTotal = $("time-total");
  const lrcPrev = $("lrc-prev");
  const lrcCurrent = $("lrc-current");
  const lrcNext = $("lrc-next");
  const bg = $("bg");
  const searchInput = $("search-input");
  const searchSource = $("search-source");
  const searchHint = $("search-hint");
  const searchPanel = $("search-panel");
  const searchResults = $("search-results");
  const searchStatus = $("search-status");
  const queuePanel = $("queue-panel");
  const queueList = $("queue-list");
  const queueCount = $("queue-count");
  const playlistsPanel = $("playlists-panel");
  const playlistsList = $("playlists-list");
  const plCount = $("pl-count");
  const settingsPanel = $("settings-panel");
  const motivationEl = $("motivation");

  // ============ 设置（localStorage 持久化）============
  const defaultSettings = {
    theme: "aurora",
    slideInterval: 8,
    lyricsSize: 36,
    scanColor: "#ffffff",
    showTranslation: true,
    showScan: true,
    slideEnabled: true,
    quoteEnabled: true,
  };
  let settings = Object.assign({}, defaultSettings, loadJSON(LS_SETTINGS, {}));

  function loadJSON(key, def) {
    try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? def : v; }
    catch (e) { return def; }
  }
  function saveSettings() { localStorage.setItem(LS_SETTINGS, JSON.stringify(settings)); }

  // 应用主题
  function applyTheme() {
    const t = settings.theme || "aurora";
    // 主题色变量（与桌面版一致）
    const themes = {
      aurora: { a1: "100,140,255", a2: "120,100,255", panel: "20,22,36" },
      ocean:  { a1: "0,180,220",    a2: "0,120,220",    panel: "14,28,42" },
      sunset: { a1: "255,140,80",   a2: "255,90,150",   panel: "42,24,30" },
      forest: { a1: "60,190,140",   a2: "40,160,200",   panel: "16,32,26" },
    };
    const c = themes[t] || themes.aurora;
    const root = document.documentElement.style;
    root.setProperty("--a1", c.a1);
    root.setProperty("--a2", c.a2);
  }

  // ============ 播放器核心（本地+在线统一队列）============
  const audio = new Audio();
  let queue = [];          // 播放队列：{type:'local'|'online', ...}
  let currentIdx = -1;
  let playing = false;
  let modeIdx = 0;         // 0=列表循环 1=随机 2=单曲
  const modeOrder = ["repeat", "shuffle", "repeatOne"];
  const modeNames = { repeat: "列表循环", shuffle: "随机播放", repeatOne: "单曲循环" };
  const modeIcons = { repeat: $("mode-repeat"), shuffle: $("mode-shuffle"), repeatOne: $("mode-repeat-one") };

  // 当前歌曲（统一访问器）
  function curSong() { return queue[currentIdx] || null; }

  // ============ 播放控制 ============
  function playAt(idx) {
    if (idx < 0 || idx >= queue.length) return;
    currentIdx = idx;
    const song = queue[idx];
    initSpectrum();
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    audio.src = song.url;
    audio.play().then(() => { playing = true; updatePlayIcon(); }).catch(() => {});
    lastLyricIdx = -1;
    updateNowPlaying();
    renderQueue();
    renderPlaylistsIfOpen();
    renderSearchHighlight();
    // 在线歌曲：异步拉取歌词（Meting lrc 签名地址）
    if (song.type === "online" && song.lrcUrl) fetchOnlineLrc(song);
  }

  function playSong(song) {
    queue.push(song);
    playAt(queue.length - 1);
  }

  function updatePlayIcon() {
    iconPlay.style.display = playing ? "none" : "";
    iconPause.style.display = playing ? "" : "none";
  }

  btnPlay.addEventListener("click", () => {
    if (currentIdx < 0) { showFeedback("请先搜索歌曲或选择音乐文件夹"); return; }
    initSpectrum();
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    if (audio.paused) {
      audio.play().then(() => { playing = true; updatePlayIcon(); }).catch((err) => {
        // 浏览器自动播放策略：需用户手势解锁（首次点击播放按钮即是手势，一般可解）
        showFeedback("浏览器阻止了自动播放，请再点一次播放");
      });
    } else {
      audio.pause(); playing = false; updatePlayIcon();
    }
  });

  // 全局手势解锁：任何点击/键盘都尝试恢复音频上下文（规避浏览器自动播放策略）
  document.addEventListener("pointerdown", () => {
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  });
  document.addEventListener("keydown", () => {
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  });

  btnPrev.addEventListener("click", () => {
    if (!queue.length) return;
    if (audio.currentTime > 3) { audio.currentTime = 0; return; }
    let idx;
    if (modeIdx === 1 && queue.length > 1) { do { idx = Math.floor(Math.random() * queue.length); } while (idx === currentIdx); }
    else idx = (currentIdx - 1 + queue.length) % queue.length;
    playAt(idx);
  });

  btnNext.addEventListener("click", () => {
    if (!queue.length) return;
    let idx;
    if (modeIdx === 1 && queue.length > 1) { do { idx = Math.floor(Math.random() * queue.length); } while (idx === currentIdx); }
    else idx = (currentIdx + 1) % queue.length;
    playAt(idx);
  });

  audio.addEventListener("ended", () => {
    if (modeIdx === 2) { audio.currentTime = 0; audio.play().catch(() => {}); return; }
    btnNext.click();
  });

  // 播放模式
  btnMode.addEventListener("click", () => {
    modeIdx = (modeIdx + 1) % modeOrder.length;
    const key = modeOrder[modeIdx];
    for (const [k, v] of Object.entries(modeIcons)) v.style.display = k === key ? "" : "none";
    btnMode.title = "播放模式：" + modeNames[key];
  });

  // 进度条
  progressEl.addEventListener("mousedown", (e) => {
    seekFromEvent(e);
    const move = (ev) => seekFromEvent(ev);
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  });
  function seekFromEvent(e) {
    if (!audio.duration) return;
    const rect = progressEl.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * audio.duration;
    const pct = ratio * 100;
    progressFill.style.width = pct + "%";
    progressDot.style.left = pct + "%";
  }

  // 进度 + 时间
  audio.addEventListener("timeupdate", () => {
    const t = audio.currentTime, d = audio.duration || 0;
    const pct = d ? (t / d) * 100 : 0;
    progressFill.style.width = pct + "%";
    progressDot.style.left = pct + "%";
    timeCurrent.textContent = fmtTime(t);
    timeTotal.textContent = fmtTime(d);
  });
  function fmtTime(sec) {
    if (!isFinite(sec) || sec < 0) return "0:00";
    sec = Math.floor(sec);
    return Math.floor(sec / 60) + ":" + (sec % 60 < 10 ? "0" : "") + (sec % 60);
  }

  // ============ 界面更新（标题/封面/歌词）============
  function updateNowPlaying() {
    const song = curSong();
    if (!song) return;
    setMarquee(mainTitle, song.name);
    setMarquee(subTitle, song.artist || "未知歌手");
    if (song.cover) {
      coverImg.src = song.cover;
      coverImg.classList.add("show");
      cover.classList.add("has-cover");
      bg.classList.add("has-cover");
    } else {
      coverImg.classList.remove("show");
      cover.classList.remove("has-cover");
      bg.classList.remove("has-cover");
    }
    // 歌词预解析
    const lines = song.lrc ? parseLrc(song.lrc) : [];
    song._lines = lines;
    if (!lines.length) {
      lrcPrev.textContent = "";
      lrcCurrent.textContent = "暂无歌词";
      lrcCurrent.className = "lyric-line current";
      lrcNext.textContent = "";
    }
  }

  // 歌名/歌手滚动
  function setMarquee(container, text) {
    let inner = container.querySelector(".marquee-inner");
    if (!inner) {
      while (container.firstChild) container.removeChild(container.firstChild);
      inner = document.createElement("span");
      inner.className = "marquee-inner";
      container.appendChild(inner);
    }
    inner.textContent = text;
    requestAnimationFrame(() => {
      const avail = container.clientWidth;
      const full = inner.scrollWidth;
      if (full > avail) {
        container.style.textAlign = "left";
        const dist = avail - full - 80;
        inner.style.setProperty("--scroll-dist", dist + "px");
        const dur = Math.min(24, Math.max(8, Math.abs(dist) / 40));
        inner.style.setProperty("--scroll-dur", dur + "s");
        inner.classList.remove("static");
        inner.style.animation = "none";
        void inner.offsetWidth;
        inner.style.animation = "";
      } else {
        inner.classList.add("static");
        container.style.textAlign = "";
      }
    });
  }

  // ============ LRC 解析（含行内翻译）============
  function parseLrc(text) {
    const lines = [];
    const re = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
    const body = (text || "").replace(/^\uFEFF/, "");
    for (const raw of body.split(/\r?\n/)) {
      re.lastIndex = 0;
      let m;
      const tags = [];
      while ((m = re.exec(raw)) !== null) {
        const min = parseInt(m[1]), sec = parseInt(m[2]);
        let ms = parseInt(m[3] || "0");
        if (m[3] && m[3].length === 2) ms *= 10;
        else if (m[3] && m[3].length === 1) ms *= 100;
        tags.push(min * 60000 + sec * 1000 + ms);
      }
      if (tags.length === 0) continue;
      let content = raw.replace(re, "").trim();
      if (!content) continue;
      let trans = "";
      const m2 = content.match(/[（(]([^（）()]*)[）)]\s*$/);
      if (m2) {
        const before = content.slice(0, m2.index).trim();
        if (/[A-Za-z\u3040-\u30ff]/.test(before) && before) {
          content = before;
          trans = m2[1].trim();
        }
      }
      for (const t of tags) lines.push({ time: t, text: content, trans });
    }
    lines.sort((a, b) => a.time - b.time);
    return lines;
  }

  // 歌词行渲染
  function setLine(el, line, showTrans) {
    if (!line) { el.textContent = ""; return; }
    el.innerHTML = "";
    const main = document.createElement("span");
    main.className = "lyric-main";
    main.textContent = line.text;
    el.appendChild(main);
    if (showTrans && line.trans && settings.showTranslation) {
      const trans = document.createElement("span");
      trans.className = "lyric-trans";
      trans.textContent = line.trans;
      el.appendChild(trans);
    }
  }

  // 扫光 + 行切换统一 rAF 驱动
  let lastLyricIdx = -1;
  function scanLoop() {
    requestAnimationFrame(scanLoop);
    const song = curSong();
    if (!song || !song._lines || !song._lines.length) return;
    const lines = song._lines;
    const ms = audio.currentTime * 1000;
    let cur = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].time <= ms) cur = i;
      else break;
    }
    if (cur === -1) cur = 0;
    if (cur !== lastLyricIdx) {
      lastLyricIdx = cur;
      const last = cur === lines.length - 1;
      setLine(lrcPrev, cur > 0 ? lines[cur - 1] : null, false);
      setLine(lrcCurrent, lines[cur], true);
      setLine(lrcNext, last ? null : lines[cur + 1], false);
      lrcCurrent.className = "lyric-line current";
    }
    if (settings.showScan) {
      const start = lines[cur].time;
      const end = cur + 1 < lines.length ? lines[cur + 1].time : start + 6000;
      const p = Math.max(0, Math.min(1, (ms - start) / (end - start)));
      lrcCurrent.style.setProperty("--scan-p", (p * 100).toFixed(1) + "%");
    } else {
      lrcCurrent.style.setProperty("--scan-p", "100%");
    }
  }
  scanLoop();

  // 扫光颜色（CSS 变量）
  function applyScanColor() {
    const root = document.documentElement.style;
    root.setProperty("--scan-color", settings.scanColor || "#ffffff");
  }

  // ============ 频谱 ============
  const eqCanvas = $("eq-canvas");
  const eqCtx = eqCanvas.getContext("2d");
  let analyser = null, audioCtx = null, spectrumAttempted = false;

  function initSpectrum() {
    if (analyser || spectrumAttempted) return;
    spectrumAttempted = true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audioCtx = new AC();
      const src = audioCtx.createMediaElementSource(audio);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.82;
      src.connect(analyser);
      analyser.connect(audioCtx.destination);
      sizeEqCanvas();
      window.addEventListener("resize", sizeEqCanvas);
      drawEq();
    } catch (e) { /* 降级 */ }
  }
  function sizeEqCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    eqCanvas.width = Math.floor(window.innerWidth * dpr);
    eqCanvas.height = Math.floor(110 * dpr);
  }
  function drawEq() {
    requestAnimationFrame(drawEq);
    if (!analyser) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = eqCanvas.width, H = eqCanvas.height;
    eqCtx.clearRect(0, 0, W, H);
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    const N = 160;
    const barW = W / N;
    const gap = barW * 0.25;
    const barX = Math.max(1, barW - gap);
    for (let i = 0; i < N; i++) {
      const arch = 0.25 + 0.75 * Math.pow(Math.sin((i / (N - 1)) * Math.PI), 1.1);
      const t = i / N;
      const binIdx = Math.min(data.length - 1, Math.floor(Math.pow(t, 1.5) * (data.length - 1)));
      const v = data[binIdx] / 255;
      const h = Math.max(2, v * arch * H * 0.92);
      const x = i * barW + gap / 2;
      eqCtx.fillStyle = "rgba(255,255,255,0.38)";
      eqCtx.fillRect(x, H - h * dpr, barX * dpr, h * dpr);
      eqCtx.fillStyle = "rgba(255,255,255,0.55)";
      eqCtx.fillRect(x, H - h * dpr, barX * dpr, Math.max(1, 3 * dpr));
    }
  }

  // ============ 反馈提示 ============
  let tipTimer;
  function showFeedback(text) {
    const tip = $("feedback-tip");
    tip.textContent = text;
    tip.style.opacity = "1";
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => { tip.style.opacity = "0"; }, 1800);
  }

  // ============ 更多菜单 / 面板开关 ============
  btnMore.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = moreMenu.classList.toggle("open");
    if (open) closeAllPanels();
  });
  document.addEventListener("click", () => {
    moreMenu.classList.remove("open");
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { moreMenu.classList.remove("open"); closeAllPanels(); }
  });

  function closeAllPanels() {
    document.querySelectorAll(".panel.open").forEach((p) => p.classList.remove("open"));
  }
  document.querySelectorAll(".panel-close").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      $(btn.dataset.close).classList.remove("open");
    });
  });

  // 菜单项
  $("menu-local").addEventListener("click", (e) => { e.stopPropagation(); moreMenu.classList.remove("open"); openLocalPicker(); });
  $("menu-queue").addEventListener("click", (e) => { e.stopPropagation(); moreMenu.classList.remove("open"); closeAllPanels(); queuePanel.classList.add("open"); renderQueue(); });
  $("menu-playlists").addEventListener("click", (e) => { e.stopPropagation(); moreMenu.classList.remove("open"); closeAllPanels(); playlistsPanel.classList.add("open"); renderPlaylists(); });
  $("menu-settings").addEventListener("click", (e) => { e.stopPropagation(); moreMenu.classList.remove("open"); closeAllPanels(); settingsPanel.classList.add("open"); populateSettings(); });
  $("menu-import").addEventListener("click", (e) => { e.stopPropagation(); moreMenu.classList.remove("open"); openImportDialog(); });

  // ============ 本地音乐文件夹 ============
  function openLocalPicker() {
    folderInput.value = "";
    folderInput.click();
  }
  folderInput.addEventListener("change", async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    await loadLocalFolder(files);
  });

  async function loadLocalFolder(files) {
    const byDir = {};
    const audioFiles = [];
    for (const f of files) {
      const rel = f.webkitRelativePath || f.name;
      const parts = rel.split("/");
      const dir = parts.slice(0, -1).join("/");
      const name = parts[parts.length - 1];
      if (!byDir[dir]) byDir[dir] = { imgs: [], lrcs: [] };
      const ext = (name.match(/\.([^.]+)$/) || [])[1] || "";
      if (["jpg","jpeg","png","webp","bmp"].includes(ext.toLowerCase())) byDir[dir].imgs.push({ name, file: f });
      else if (ext.toLowerCase() === "lrc") byDir[dir].lrcs.push({ name, file: f });
      else if (["mp3","flac","wav","ogg","m4a","aac","wma","opus"].includes(ext.toLowerCase())) audioFiles.push(f);
    }

    const loaded = [];
    for (const f of audioFiles) {
      const rel = f.webkitRelativePath || f.name;
      const parts = rel.split("/");
      const dir = parts.slice(0, -1).join("/");
      const name = parts[parts.length - 1];
      const base = name.replace(/\.[^.]+$/, "");
      const bucket = byDir[dir] || { imgs: [], lrcs: [] };

      let tag = { title: "", artist: "", cover: null };
      try { tag = parseAudioTags(new Uint8Array(await f.arrayBuffer())); } catch (err) {}

      const nameParts = parseFileName(base);

      let coverUrl = null;
      if (!tag.cover) {
        const imgCandidates = [
          ...bucket.imgs.filter((i) => i.name.replace(/\.[^.]+$/, "").toLowerCase() === base.toLowerCase()),
          ...bucket.imgs.filter((i) => ["cover","folder","album","front","artwork","albumart"].includes(i.name.replace(/\.[^.]+$/, "").toLowerCase())),
          ...bucket.imgs,
        ];
        if (imgCandidates.length) coverUrl = URL.createObjectURL(imgCandidates[0].file);
      } else {
        coverUrl = URL.createObjectURL(new Blob([tag.cover], { type: "image/jpeg" }));
      }

      let lrcText = null;
      const lrcFile = bucket.lrcs.find((l) => l.name.replace(/\.[^.]+$/, "").toLowerCase() === base.toLowerCase()) || bucket.lrcs[0];
      if (lrcFile) lrcText = await lrcFile.file.text();

      loaded.push({
        type: "local",
        name: tag.title || nameParts.title || base,
        artist: tag.artist || nameParts.artist || "未知歌手",
        url: URL.createObjectURL(f),
        cover: coverUrl,
        lrc: lrcText,
        source: "本地音乐",
      });
    }
    if (!loaded.length) { showFeedback("未找到音频文件"); return; }
    // 本地歌曲加入队列
    queue.push(...loaded);
    renderQueue();
    showFeedback("已加载 " + loaded.length + " 首本地音乐");
    if (currentIdx < 0) playAt(0);
    else showFeedback("已加入队列 " + loaded.length + " 首本地音乐");
    const label = $("menu-local").querySelector("span");
    if (label) label.textContent = "重新选择文件夹";
  }

  // 文件名解析：`歌手 - 歌名`
  function parseFileName(base) {
    const idx = base.indexOf(" - ");
    if (idx > 0) {
      const artist = base.slice(0, idx).trim();
      const title = base.slice(idx + 3).trim();
      if (artist && title) return { artist, title };
    }
    return { artist: "", title: base.trim() };
  }

  // 音频标签解析（ID3v2 / FLAC）
  function parseAudioTags(buf) {
    const out = { title: "", artist: "", cover: null };
    const isMp3 = buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33;
    const isFlac = buf[0] === 0x66 && buf[1] === 0x4c && buf[2] === 0x61 && buf[3] === 0x43;
    if (isMp3) parseId3(buf, out);
    else if (isFlac) parseFlac(buf, out);
    return out;
  }

  function readSyncsafe(buf, off, len) {
    let v = 0;
    for (let i = 0; i < len; i++) v = (v << 7) | (buf[off + i] & 0x7f);
    return v;
  }
  function decodeText(buf, off, sz) {
    try {
      const enc = buf[off];
      let p = off + 1;
      if (enc === 1 || enc === 2) {
        let bytes = buf.slice(p, off + sz);
        while (bytes.length && bytes[bytes.length - 1] === 0) bytes = bytes.subarray(0, bytes.length - 1);
        return new TextDecoder("utf-16le").decode(bytes).replace(/\0/g, "").trim();
      }
      if (enc === 3) return new TextDecoder("utf-8").decode(buf.slice(p, off + sz)).replace(/\0/g, "").trim();
      return new TextDecoder("iso-8859-1").decode(buf.slice(p, off + sz)).replace(/\0/g, "").trim();
    } catch (e) { return ""; }
  }
  function parseId3(buf, out) {
    if (buf.length < 10) return;
    const ver = buf[3];
    const size = readSyncsafe(buf, 6, 4);
    let off = 10;
    const end = Math.min(buf.length, 10 + size);
    if (ver === 2) {
      while (off + 6 <= end) {
        const id = String.fromCharCode(buf[off], buf[off+1], buf[off+2]);
        const sz = (buf[off+3] << 16) | (buf[off+4] << 8) | buf[off+5];
        const d = off + 6;
        if (sz <= 0 || d + sz > buf.length) break;
        if (id === "TT2") out.title = decodeText(buf, d, sz);
        else if (id === "TP1") out.artist = decodeText(buf, d, sz);
        else if (id === "PIC") out.cover = parseApic(buf, d, sz, true);
        off = d + sz;
      }
    } else {
      while (off + 10 <= end) {
        const id = String.fromCharCode(buf[off], buf[off+1], buf[off+2], buf[off+3]);
        const sz = ver === 4 ? readSyncsafe(buf, off + 4, 4) : buf.readUInt32BE(off + 4);
        const d = off + 10;
        if (sz <= 0 || d + sz > buf.length) break;
        if (id === "TIT2") out.title = decodeText(buf, d, sz);
        else if (id === "TPE1") out.artist = decodeText(buf, d, sz);
        else if (id === "APIC") out.cover = parseApic(buf, d, sz, false);
        off = d + sz;
      }
    }
  }
  function parseApic(buf, off, sz, v22) {
    try {
      let p = off + 1;
      let mime;
      if (v22) { p += 3; } else {
        let e = p;
        while (e < off + sz && buf[e] !== 0) e++;
        p = e + 1;
      }
      p += 1;
      while (p < off + sz && buf[p] !== 0) p++;
      p += 1;
      if (buf[p] === 0) p += 1;
      const data = buf.slice(p, off + sz);
      if (data.length > 0) return data;
    } catch (e) {}
    return null;
  }
  function parseFlac(buf, out) {
    let off = 4, last = false;
    while (off + 4 <= buf.length && !last) {
      const header = buf.readUInt32BE(off);
      last = (header & 0x80000000) !== 0;
      const type = (header >> 24) & 0x7f;
      const size = header & 0x00ffffff;
      off += 4;
      if (off + size > buf.length) break;
      if (type === 6) {
        try {
          let p = off + 4;
          const mimeLen = buf.readUInt32BE(p); p += 4 + mimeLen;
          const descLen = buf.readUInt32BE(p); p += 4 + descLen;
          p += 16;
          const dataLen = buf.readUInt32BE(p); p += 4;
          if (dataLen > 0 && p + dataLen <= buf.length) out.cover = buf.slice(p, p + dataLen);
        } catch (e) {}
      } else if (type === 4) {
        try {
          let p = off + 4;
          const vendorLen = buf.readUInt32LE(p); p += 4 + vendorLen;
          const count = buf.readUInt32LE(p); p += 4;
          for (let i = 0; i < Math.min(count, 50); i++) {
            const clen = buf.readUInt32LE(p); p += 4;
            const s = new TextDecoder("utf-8").decode(buf.slice(p, p + clen));
            p += clen;
            const eq = s.indexOf("=");
            if (eq > 0) {
              const k = s.slice(0, eq).toUpperCase(), v = s.slice(eq + 1);
              if (k === "TITLE" && !out.title) out.title = v;
              else if (k === "ARTIST" && !out.artist) out.artist = v;
            }
          }
        } catch (e) {}
      }
      off += size;
    }
  }

  // ============ 队列渲染 ============
  function renderQueue() {
    queueCount.textContent = queue.length + " 首";
    queueList.innerHTML = "";
    if (!queue.length) {
      queueList.innerHTML = '<div class="empty-tip">队列为空 · 搜索歌曲或选择音乐文件夹</div>';
      return;
    }
    queue.forEach((s, i) => {
      const row = document.createElement("div");
      row.className = "song-row" + (i === currentIdx ? " playing" : "");
      const thumb = s.cover ? '<img src="' + escapeAttr(s.cover) + '" onerror="this.parentNode.textContent=\'♪\';this.remove()">' : "♪";
      row.innerHTML =
        '<div class="song-thumb">' + thumb + '</div>' +
        '<div class="song-info"><div class="song-name"></div><div class="song-artist"></div></div>' +
        '<div class="song-actions"><button class="act-btn play-btn" data-idx="' + i + '">播放</button>' +
        '<button class="act-btn" data-rm="' + i + '">移除</button></div>';
      row.querySelector(".song-name").textContent = s.name;
      row.querySelector(".song-artist").textContent = (s.artist || "") + (s.source ? " · " + s.source : "");
      row.addEventListener("click", (e) => {
        if (e.target.closest("[data-rm]")) {
          const idx = parseInt(e.target.closest("[data-rm]").dataset.rm);
          queue.splice(idx, 1);
          if (idx === currentIdx) { currentIdx = -1; audio.pause(); }
          else if (idx < currentIdx) currentIdx--;
          renderQueue();
          return;
        }
        if (e.target.closest("[data-idx]")) playAt(parseInt(e.target.closest("[data-idx]").dataset.idx));
        else playAt(i);
      });
      queueList.appendChild(row);
    });
  }
  $("btn-clear-queue").addEventListener("click", () => {
    queue = [];
    currentIdx = -1;
    audio.pause();
    audio.src = "";
    renderQueue();
    mainTitle.textContent = "小风音乐";
    subTitle.textContent = "此刻聆听";
  });

  function escapeAttr(s) { return String(s || "").replace(/["'<>]/g, (c) => ({'"':"&quot;","'":"&#39;","<":"&lt;",">":"&gt;"}[c])); }

  // 搜索面板高亮当前播放
  function renderSearchHighlight() {
    // 搜索结果行的高亮由 renderSearch 内部维护（通过 dataset）
    document.querySelectorAll("#search-results .song-row").forEach((row) => {
      const id = row.dataset.sid;
      row.classList.toggle("playing", curSong() && String(curSong().id) === String(id));
    });
  }

  // 统一在线请求（检测 CSP 拦截 → 明确提示）
  async function metingFetch(url) {
    try {
      const res = await fetch(url);
      return await res.json();
    } catch (e) {
      const msg = String(e && e.message || e);
      if (/Content Security Policy|CSP|Refused to connect/i.test(msg)) {
        throw new Error("浏览器安全策略(CSP)拦截了在线请求——请用浏览器直接打开本 HTML 文件（而非预览面板），在线功能即可使用");
      }
      throw e;
    }
  }

  // ============ 在线搜索（Meting 代理）============
  let searchResultsData = [];
  async function performSearch(kw) {
    const server = searchSource.value;
    searchResults.innerHTML = '<div class="empty-tip">搜索中...</div>';
    searchStatus.textContent = "正在搜索";
    try {
      const url = METING + "?server=" + server + "&type=search&id=" + encodeURIComponent(kw) + "&limit=30";
      const data = await metingFetch(url);
      if (!Array.isArray(data) || !data.length) {
        searchResults.innerHTML = '<div class="empty-tip">没有找到相关歌曲</div>';
        searchStatus.textContent = "0 结果";
        searchResultsData = [];
        return;
      }
      searchResultsData = data;
      searchStatus.textContent = data.length + " 结果";
      renderSearch(data);
    } catch (e) {
      searchResults.innerHTML = '<div class="empty-tip">' + escapeHtml(e.message) + '</div>';
      searchStatus.textContent = "失败";
    }
  }

  function renderSearch(data) {
    searchResults.innerHTML = "";
    data.forEach((s, i) => {
      const row = document.createElement("div");
      row.className = "song-row";
      row.dataset.sid = s.url || s.pic || "";
      row.innerHTML =
        '<div class="song-thumb">' +
        (s.pic ? '<img src="' + escapeAttr(s.pic) + '" onerror="this.parentNode.textContent=\'♪\';this.remove()">' : "♪") +
        '</div>' +
        '<div class="song-info"><div class="song-name"></div><div class="song-artist"></div></div>' +
        '<div class="song-actions">' +
        '<button class="act-btn play-btn" data-act="play">播放</button>' +
        '<button class="act-btn" data-act="queue">加入队列</button>' +
        '<button class="act-btn" data-act="download">下载</button>' +
        '</div>';
      row.querySelector(".song-name").textContent = s.title || "";
      row.querySelector(".song-artist").textContent = s.author || "";
      row.addEventListener("click", (e) => {
        const act = e.target.closest("[data-act]");
        const song = buildOnlineSong(s);
        if (act) {
          if (act.dataset.act === "play") { playSong(song); closeAllPanels(); }
          else if (act.dataset.act === "queue") { queue.push(song); renderQueue(); showFeedback("已加入队列"); }
          else if (act.dataset.act === "download") downloadOnlineSong(s);
        } else {
          playSong(song);
          closeAllPanels();
        }
      });
      searchResults.appendChild(row);
    });
  }

  // 在线歌曲对象（直接使用 Meting 返回的签名地址）
  function buildOnlineSong(s) {
    return {
      type: "online",
      id: s.url || "",
      name: s.title || "未知歌曲",
      artist: s.author || "",
      url: s.url || "",
      cover: s.pic || "",
      lrcUrl: s.lrc || "",
      lrc: null,  // 需要时单独拉取
      source: sourceName(searchSource.value),
    };
  }

  function sourceName(server) {
    return { netease: "网易云", tencent: "QQ音乐", kugou: "酷狗" }[server] || server;
  }

  // 在线歌词拉取（Meting lrc 签名地址）
  async function fetchOnlineLrc(song) {
    if (song._lrcFetched) return;
    song._lrcFetched = true;
    try {
      const res = await fetch(song.lrcUrl);
      const text = await res.text();
      song.lrc = text;
      song._lines = parseLrc(text);
      // 若当前正在播放这首，刷新歌词显示
      if (curSong() === song) {
        lastLyricIdx = -1;
        if (!song._lines.length) {
          lrcPrev.textContent = "";
          lrcCurrent.textContent = "暂无歌词";
          lrcCurrent.className = "lyric-line current";
          lrcNext.textContent = "";
        }
      }
    } catch (e) { /* 歌词获取失败忽略 */ }
  }

  // 在线下载
  function downloadOnlineSong(s) {
    const a = document.createElement("a");
    a.href = s.url;
    a.download = (s.author ? s.author + " - " : "") + (s.title || "song") + ".mp3";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    showFeedback("开始下载：" + (s.title || ""));
  }

  // ============ 在线搜索入口 ============
  searchHint.addEventListener("click", () => {
    const kw = searchInput.value.trim();
    if (!kw) { showFeedback("请输入歌名"); searchInput.focus(); return; }
    closeAllPanels();
    moreMenu.classList.remove("open");
    searchPanel.classList.add("open");
    performSearch(kw);
  });
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") searchHint.click();
  });

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = String(str == null ? "" : str);
    return div.innerHTML;
  }

  // ============ 歌单管理（localStorage）============
  function loadPlaylists() { return loadJSON(LS_PLAYLISTS, []); }
  function savePlaylists(list) { localStorage.setItem(LS_PLAYLISTS, JSON.stringify(list)); }

  function renderPlaylists() {
    const list = loadPlaylists();
    plCount.textContent = list.length + " 个";
    playlistsList.innerHTML = "";
    if (!list.length) {
      playlistsList.innerHTML = '<div class="empty-tip">还没有歌单 · 下方输入名称新建，或菜单「导入歌单」</div>';
      return;
    }
    list.forEach((pl, pi) => {
      const card = document.createElement("div");
      card.className = "pl-card";
      const head = document.createElement("div");
      head.className = "pl-card-head";
      head.innerHTML =
        '<span class="pl-card-name"></span>' +
        '<span class="pl-card-count">' + pl.songs.length + ' 首</span>' +
        '<div class="pl-card-actions">' +
        '<button class="act-btn play-btn" data-pl-act="play">播放</button>' +
        '<button class="act-btn" data-pl-act="rename">重命名</button>' +
        '<button class="act-btn" data-pl-act="del">删除</button>' +
        '</div>';
      head.querySelector(".pl-card-name").textContent = pl.name;
      head.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-pl-act]");
        if (!btn) { card.classList.toggle("open"); return; }
        const act = btn.dataset.plAct;
        if (act === "play") {
          queue.push(...pl.songs.map((s) => Object.assign({}, s)));
          renderQueue();
          playAt(queue.length - pl.songs.length);
          showFeedback("已载入歌单「" + pl.name + "」");
        } else if (act === "rename") {
          const nn = prompt("重命名歌单", pl.name);
          if (nn && nn.trim()) { pl.name = nn.trim(); savePlaylists(list); renderPlaylists(); }
        } else if (act === "del") {
          if (confirm("删除歌单「" + pl.name + "」？")) { list.splice(pi, 1); savePlaylists(list); renderPlaylists(); }
        }
      });
      // 歌曲子列表
      const body = document.createElement("div");
      body.className = "pl-card-body";
      pl.songs.forEach((s, si) => {
        const row = document.createElement("div");
        row.className = "song-row";
        row.innerHTML =
          '<div class="song-thumb">' + (s.cover ? '<img src="' + escapeAttr(s.cover) + '" onerror="this.parentNode.textContent=\'♪\';this.remove()">' : "♪") + '</div>' +
          '<div class="song-info"><div class="song-name"></div><div class="song-artist"></div></div>' +
          '<div class="song-actions"><button class="act-btn" data-rm="' + si + '">移除</button></div>';
        row.querySelector(".song-name").textContent = s.name;
        row.querySelector(".song-artist").textContent = s.artist || "";
        row.addEventListener("click", (e) => {
          if (e.target.closest("[data-rm]")) {
            pl.songs.splice(parseInt(e.target.closest("[data-rm]").dataset.rm), 1);
            savePlaylists(list); renderPlaylists();
            return;
          }
          playSong(Object.assign({}, s));
        });
        body.appendChild(row);
      });
      if (!pl.songs.length) body.innerHTML = '<div class="empty-tip" style="padding:14px">空歌单</div>';
      card.appendChild(head);
      card.appendChild(body);
      playlistsList.appendChild(card);
    });
  }

  $("btn-new-playlist").addEventListener("click", () => {
    const name = $("new-pl-name").value.trim();
    if (!name) { showFeedback("请输入歌单名称"); return; }
    const list = loadPlaylists();
    list.push({ name, songs: [] });
    savePlaylists(list);
    $("new-pl-name").value = "";
    renderPlaylists();
    showFeedback("已创建歌单「" + name + "」");
  });

  function renderPlaylistsIfOpen() {
    if (playlistsPanel.classList.contains("open")) renderPlaylists();
  }

  // ============ 导入歌单（Meting playlist 接口）============
  function openImportDialog() {
    const url = prompt("粘贴网易云/QQ音乐歌单链接或歌单ID：\n示例：\n网易云 https://music.163.com/playlist?id=123\nQQ https://y.qq.com/n/ryqq/playlist/123");
    if (!url) return;
    importPlaylist(url);
  }

  async function importPlaylist(input) {
    const s = String(input).trim();
    // QQ 分享短链（c6.y.qq.com/u?__=xxx）无法在浏览器解析（需跟随 302 重定向，纯 HTML 受 CORS 限制）
    if (/c6\.y\.qq\.com\/base\/fcgi-bin\/u/.test(s) || /^https?:\/\/[^\/]+\/u\?__=/.test(s)) {
      showFeedback("QQ 分享短链需桌面版解析：请在电脑版 QQ 音乐中打开后复制完整歌单链接，或直接输入歌单数字ID");
      return;
    }
    // 提取歌单 ID：数字串
    const m = s.match(/(\d{5,})/);
    if (!m) {
      showFeedback("无法识别歌单链接，请输入歌单数字ID");
      return;
    }
    const id = m[1];
    showFeedback("正在解析歌单...");
    try {
      // 先试网易云，再试 QQ（Meting server 参数）
      let data = await fetchPlaylist("netease", id);
      let server = "netease";
      if (!data || !data.length) { data = await fetchPlaylist("tencent", id); server = "tencent"; }
      if (!data || !data.length) { showFeedback("歌单为空或无法解析"); return; }
      const name = prompt("歌单名称（默认取歌单标题）：", "导入歌单 #" + id) || "导入歌单 #" + id;
      const list = loadPlaylists();
      list.push({
        name,
        songs: data.map((s2) => ({
          type: "online",
          name: s2.title || "",
          artist: s2.author || "",
          url: s2.url || "",
          cover: s2.pic || "",
          lrcUrl: s2.lrc || "",
          lrc: null,
          source: server === "netease" ? "网易云" : "QQ音乐",
        })),
      });
      savePlaylists(list);
      renderPlaylists();
      showFeedback("已导入 " + data.length + " 首到歌单「" + name + "」");
    } catch (e) {
      showFeedback("导入失败：" + e.message);
    }
  }

  async function fetchPlaylist(server, id) {
    try {
      const url = METING + "?server=" + server + "&type=playlist&id=" + id;
      return await metingFetch(url);
    } catch (e) {
      if (/CSP|Content Security/.test(e.message)) showFeedback(e.message);
      return null;
    }
  }

  // ============ 幻灯片背景 ============
  let slideImages = [];
  let slideIdx = 0;
  let slideTimer = null;
  let slideImgEl = null;  // 当前显示的 img

  function createSlideImg() {
    const img = document.createElement("img");
    img.className = "slide-img";
    bg.appendChild(img);
    return img;
  }

  function startSlideshow() {
    stopSlideshow();
    if (!settings.slideEnabled || !slideImages.length) return;
    slideIdx = 0;
    if (!slideImgEl) slideImgEl = createSlideImg();
    showSlide(slideIdx);
    slideTimer = setInterval(() => {
      slideIdx = (slideIdx + 1) % slideImages.length;
      showSlide(slideIdx);
    }, settings.slideInterval * 1000);
  }

  function showSlide(i) {
    if (!slideImgEl) slideImgEl = createSlideImg();
    // 先淡出再换图
    slideImgEl.classList.remove("on");
    setTimeout(() => {
      slideImgEl.src = slideImages[i].url;
      slideImgEl.classList.add("on");
    }, 300);
  }

  function stopSlideshow() {
    if (slideTimer) { clearInterval(slideTimer); slideTimer = null; }
    if (slideImgEl) { slideImgEl.classList.remove("on"); }
  }

  $("btn-pick-slide").addEventListener("click", () => $("slide-folder").click());
  $("slide-folder").addEventListener("change", async (e) => {
    const files = Array.from(e.target.files || []).filter((f) => /\.(jpg|jpeg|png|webp|bmp)$/i.test(f.name));
    slideImages = files.map((f) => ({ url: URL.createObjectURL(f) }));
    $("slide-count").textContent = slideImages.length + " 张图片";
    showFeedback("已加载 " + slideImages.length + " 张幻灯片图片");
    startSlideshow();
  });

  // ============ 设置面板 ============
  function populateSettings() {
    $("set-theme").value = settings.theme;
    $("set-slide-interval").value = settings.slideInterval;
    $("slide-interval-val").textContent = settings.slideInterval + "s";
    $("set-lyrics-size").value = settings.lyricsSize;
    $("lyrics-size-val").textContent = settings.lyricsSize + "px";
    $("set-scan-color").value = settings.scanColor;
    $("set-show-trans").checked = settings.showTranslation;
    $("set-show-scan").checked = settings.showScan;
    $("set-slide-on").checked = settings.slideEnabled;
    $("set-quote-on").checked = settings.quoteEnabled;
  }

  $("set-slide-interval").addEventListener("input", () => {
    $("slide-interval-val").textContent = $("set-slide-interval").value + "s";
  });
  $("set-lyrics-size").addEventListener("input", () => {
    $("lyrics-size-val").textContent = $("set-lyrics-size").value + "px";
  });

  $("btn-save-settings").addEventListener("click", () => {
    settings.theme = $("set-theme").value;
    settings.slideInterval = parseInt($("set-slide-interval").value) || 8;
    settings.lyricsSize = parseInt($("set-lyrics-size").value) || 36;
    settings.scanColor = $("set-scan-color").value || "#ffffff";
    settings.showTranslation = $("set-show-trans").checked;
    settings.showScan = $("set-show-scan").checked;
    settings.slideEnabled = $("set-slide-on").checked;
    settings.quoteEnabled = $("set-quote-on").checked;
    saveSettings();
    applyAllSettings();
    showFeedback("设置已保存");
  });

  function applyAllSettings() {
    applyTheme();
    applyScanColor();
    // 歌词字号
    const root = document.documentElement.style;
    root.setProperty("--lyrics-size", settings.lyricsSize + "px");
    root.setProperty("--lyrics-size-current", (settings.lyricsSize + 8) + "px");
    // 励志句
    motivationEl.style.display = settings.quoteEnabled ? "" : "none";
    // 幻灯片
    startSlideshow();
  }

  // 励志句轮换
  const quotes = [
    "把平凡的日子，过成滚烫的诗",
    "音乐响起的地方，就是诗和远方",
    "生活不止眼前的苟且，还有歌和星光",
    "所有的美好，都藏在下一次播放里",
    "愿你眼里有光，心中有歌，脚下有风",
    "慢慢来，比较快",
  ];
  let qi = 0;
  setInterval(() => {
    if (!settings.quoteEnabled) return;
    motivationEl.classList.add("fade");
    setTimeout(() => {
      qi = (qi + 1) % quotes.length;
      motivationEl.textContent = quotes[qi];
      motivationEl.classList.remove("fade");
    }, 600);
  }, 6000);

  // ============ 初始化 ============
  setMarquee(mainTitle, mainTitle.textContent.trim());
  setMarquee(subTitle, subTitle.textContent.trim());
  applyAllSettings();

  // 暴露调试接口
  window.__player = { playAt, playSong, queue, get curSong() { return curSong(); } };
})();
