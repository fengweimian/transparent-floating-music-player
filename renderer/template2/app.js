// 小风音乐 · 新布局完整功能版（纯 HTML 单文件 JS）
// 在线功能走 Meting 公共代理 api.i-meto.com（CORS 允许），无需后端
(function () {
  "use strict";

  // 工具函数下沉共享层 XFUtils（两模板统一实现）
  const escapeHtml = XFUtils.escapeHtml;
  const fmtTime = XFUtils.fmtTime;

  // ============ 常量 ============
  const METING = "https://api.i-meto.com/meting/api"; // Meting 公共代理
  const LS_SETTINGS = "xf-settings";
  const LS_PLAYLISTS = "xf-playlists";

  // ============ DOM ============
  const $ = (id) => document.getElementById(id);
  const cover = $("cover");
  const coverImg = $("cover-img");
  const vinylLabel = $("vinyl-label");
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
  const searchChannels = $("search-channels");
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
  // 右上角登录入口（未登录→登录按钮；已登录→头像+昵称徽标）
  const loginEntry = $("login-entry");
  const btnLoginEntry = $("btn-login-entry");
  const loginSummary = $("login-summary");
  const loginAvatars = $("login-avatars");
  const loginSummaryText = $("login-summary-text");

  // ============ 设置（localStorage 持久化）============
  const defaultSettings = {
    theme: "aurora",
    template: "new",
    slideInterval: 8,
    lyricsSize: 36,
    lyricsFont: "",
    scanColor: "#ffffff",
    showTranslation: true,
    showScan: true,
    slideEnabled: true,
    quoteEnabled: true,
    desktopLyrics: false,
    desktopLyricsLines: 1,
    desktopLyricsFont: "微软雅黑",
    desktopLyricsFontSize: 36,
    desktopLyricsPlayedColor: "#ffffff",
    desktopLyricsUnplayedColor: "#9a9aa8",
    desktopLyricsOpacity: 1,
    desktopLyricsBorder: false,
    desktopLyricsOverTaskbar: true,
    desktopLyricsBold: false,
    startup: false,
    downloadFolder: "",
  };
  let settings = Object.assign({}, defaultSettings, loadJSON(LS_SETTINGS, {}));

  function loadJSON(key, def) {
    try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? def : v; }
    catch (e) { return def; }
  }
  // 保存：同步写 localStorage（浏览器预览一致）+ 桌面版同步到主进程（两模板数据统一）
  function saveSettings() {
    localStorage.setItem(LS_SETTINGS, JSON.stringify(settings));
    if (XFStore.isElectron) {
      XFStore.saveSettings({
        theme: settings.theme || "aurora",
        template: settings.template || "classic",
        slideshowInterval: settings.slideInterval || 8,
        lyricsFontSize: settings.lyricsSize || 36,
        lyricsFont: settings.lyricsFont || "",
        showTranslation: !!settings.showTranslation,
        charColor: settings.scanColor || "#ffffff",
        desktopLyrics: !!settings.desktopLyrics,
        desktopLyricsLines: settings.desktopLyricsLines === 2 ? 2 : 1,
        desktopLyricsFont: settings.desktopLyricsFont || "微软雅黑",
        desktopLyricsFontSize: settings.desktopLyricsFontSize || 36,
        desktopLyricsPlayedColor: settings.desktopLyricsPlayedColor || "#ffffff",
        desktopLyricsUnplayedColor: settings.desktopLyricsUnplayedColor || "#9a9aa8",
        desktopLyricsOpacity: settings.desktopLyricsOpacity != null ? settings.desktopLyricsOpacity : 1,
        desktopLyricsBorder: !!settings.desktopLyricsBorder,
        desktopLyricsOverTaskbar: settings.desktopLyricsOverTaskbar !== false,
        desktopLyricsBold: !!settings.desktopLyricsBold,
        startup: !!settings.startup,
        downloadFolder: settings.downloadFolder || "",
        // ⚠️ 文件夹字段仅在本地有值时同步（未选过时为 undefined，避免空串覆盖主进程已有值）
        ...(settings.musicFolder ? { musicFolder: settings.musicFolder } : {}),
        ...(settings.imageFolder ? { imageFolder: settings.imageFolder } : {}),
      }).catch(() => {});
    }
  }
  // 桌面版：以主进程设置为权威数据合并（双模板共享同一份设置）
  (async () => {
    try {
      const main = await XFStore.getSettings();
      if (main && Object.keys(main).length) {
        const merged = Object.assign({}, settings, {
          theme: main.theme || settings.theme || "aurora",
          template: main.template || settings.template || "classic",
          slideInterval: main.slideshowInterval || settings.slideInterval,
          lyricsSize: main.lyricsFontSize || settings.lyricsSize,
          lyricsFont: main.lyricsFont || settings.lyricsFont || "",
          showTranslation: main.showTranslation !== undefined ? !!main.showTranslation : settings.showTranslation,
          scanColor: main.charColor || settings.scanColor,
          desktopLyrics: main.desktopLyrics !== undefined ? !!main.desktopLyrics : settings.desktopLyrics,
          desktopLyricsLines: main.desktopLyricsLines !== undefined ? main.desktopLyricsLines : settings.desktopLyricsLines,
          desktopLyricsFont: main.desktopLyricsFont || settings.desktopLyricsFont || "微软雅黑",
          desktopLyricsFontSize: main.desktopLyricsFontSize || settings.desktopLyricsFontSize || 36,
          desktopLyricsPlayedColor: main.desktopLyricsPlayedColor || settings.desktopLyricsPlayedColor || "#ffffff",
          desktopLyricsUnplayedColor: main.desktopLyricsUnplayedColor || settings.desktopLyricsUnplayedColor || "#9a9aa8",
          desktopLyricsOpacity: main.desktopLyricsOpacity != null ? main.desktopLyricsOpacity : (settings.desktopLyricsOpacity != null ? settings.desktopLyricsOpacity : 1),
          desktopLyricsBorder: main.desktopLyricsBorder !== undefined ? !!main.desktopLyricsBorder : !!settings.desktopLyricsBorder,
          desktopLyricsOverTaskbar: main.desktopLyricsOverTaskbar !== undefined ? main.desktopLyricsOverTaskbar : (settings.desktopLyricsOverTaskbar !== false),
          desktopLyricsBold: main.desktopLyricsBold !== undefined ? !!main.desktopLyricsBold : !!settings.desktopLyricsBold,
          startup: main.startup !== undefined ? !!main.startup : !!settings.startup,
          downloadFolder: main.downloadFolder || settings.downloadFolder || "",
          musicFolder: main.musicFolder || settings.musicFolder || "",
          imageFolder: main.imageFolder || settings.imageFolder || "",
        });
        settings = merged;
        localStorage.setItem(LS_SETTINGS, JSON.stringify(settings));
        applyAllSettings();
        populateSettings();
      }
    } catch (e) { /* 主进程不可用时保持 localStorage 设置 */ }
  })();

  // 听歌打卡：网易云歌曲播放够久后上报（每首歌只报一次）
  let lastScrobbleId = null;
  let scrobbleLoggedIn = false;

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
    root.setProperty("--panel", c.panel);
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

  // ============ 播放状态持久化（与经典模板共享 localStorage 的 music-player-state）============
  // 经典模板 player.js 用同一 key + 同结构：{ playlist, currentIndex, currentTime, volume, mode }
  // → 切换模板后队列/进度/音量/播放模式无缝延续
  const STATE_KEY = "music-player-state";
  let _restoreTime = 0;    // 恢复的播放进度（秒）
  let _lastStateSave = 0;

  // 模式映射：经典(sequential/random/single) ↔ 新(repeat/shuffle/repeatOne)
  const MODE_TO_CLASSIC = { repeat: "sequential", shuffle: "random", repeatOne: "single" };
  const MODE_FROM_CLASSIC = { sequential: "repeat", random: "shuffle", single: "repeatOne" };

  // 歌曲 → 可持久化元数据（剥离 blob/有时效的 URL；本地歌存绝对路径，恢复时 file:// 直播）
  function persistSong(s) {
    if (s.type === "online") {
      return {
        type: "online", id: s.id || "", server: s.server || "netease",
        name: s.name || "", artist: s.artist || "", pic: s.cover || "",
        source: s.source || "在线",
      };
    }
    const file = s.fileName || s.name || "";
    return {
      type: "local", id: s.id || file, name: file,            // name 用文件名（经典模板拼路径用）
      title: s.name || "", artist: s.artist || "",            // title 存显示名（经典模板忽略该字段）
      folder: s.folder || "", file: file,
      lrc: s.lrc || "",
    };
  }

  function savePlayerState() {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify({
        playlist: queue.map(persistSong),
        currentIndex: currentIdx,
        currentTime: currentIdx >= 0 ? (audio.currentTime || 0) : 0,
        volume: audio.volume !== undefined ? audio.volume : 0.8,
        mode: MODE_TO_CLASSIC[modeOrder[modeIdx]] || "sequential",
        // v3.5.2：记录是否在播放 → 切换模板后自动续播
        playing: playing,
      }));
    } catch (e) {}
  }
  let _stateTimer = null;
  function scheduleSaveState() {
    clearTimeout(_stateTimer);
    _stateTimer = setTimeout(savePlayerState, 400);
  }

  // 恢复：读经典模板同 key 数据（切模板后无缝延续队列/进度/音量/模式）
  function restorePlayerState() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(STATE_KEY)); } catch (e) {}
    if (!s || !Array.isArray(s.playlist) || !s.playlist.length) return;
    queue = s.playlist.map((t) => {
      if (t.type === "online") {
        return {
          type: "online", id: String(t.id || ""), server: t.server || "netease",
          name: t.name || "未知歌曲", artist: t.artist || "",
          cover: t.pic || "", url: "", lrcUrl: "", lrc: null,
          source: t.source || "在线",
        };
      }
      // 本地歌：folder+file → file:// URL（桌面版直播；浏览器预览 file 受限则置空）
      const folder = t.folder || "";
      const file = t.file || t.name || "";
      return {
        type: "local", id: t.id || file,
        name: t.title || t.name || file.replace(/\.[^.]+$/, ""),
        artist: t.artist || "", folder, fileName: file,
        url: folder ? "file:///" + folder.replace(/\\/g, "/") + "/" + encodeURI(file) : "",
        cover: "", lrc: t.lrc || null, source: "本地音乐",
      };
    });
    if (typeof s.currentIndex === "number" && s.currentIndex >= 0 && s.currentIndex < queue.length) {
      currentIdx = s.currentIndex;
      _restoreTime = s.currentTime || 0;
      if (typeof s.volume === "number") audio.volume = Math.max(0, Math.min(1, s.volume));
      syncVolumeUI();
      const mi = MODE_FROM_CLASSIC[s.mode] ? modeOrder.indexOf(MODE_FROM_CLASSIC[s.mode]) : -1;
      if (mi >= 0) { modeIdx = mi; updateModeIcon(); }
      // 恢复歌词行（local 存了 lrc 文本；online 播放时 fetchOnlineLrc 重拉）
      const song = queue[currentIdx];
      if (song && song.lrc) { song._lines = XFLyrics.parseLrc(song.lrc); }
      // 恢复 UI：标题/封面/进度/队列
      updateNowPlaying();
      renderQueue();
      if (song && song.url) {
        audio.src = song.url;
        const applyT = () => {
          try { audio.currentTime = Math.min(_restoreTime, audio.duration || 0); } catch (e) {}
          audio.removeEventListener("loadedmetadata", applyT);
        };
        audio.addEventListener("loadedmetadata", applyT);
        const d = audio.duration || 0;
        const pct = d ? (_restoreTime / d) * 100 : 0;
        progressFill.style.width = pct + "%";
        progressDot.style.left = pct + "%";
        timeCurrent.textContent = fmtTime(_restoreTime);
        timeTotal.textContent = fmtTime(d);
      }
      // v3.5.2 自动续播：保存时正在播放 → 恢复后自动继续（桌面版已放宽 autoplay 策略）
      //    online 歌 url 为空 → 先拉播放地址再播；local 歌 restore 已设 src（applyT 处理 seek）
      if (s.playing && song) {
        const resume = () => {
          initSpectrum();
          if (audioCtx && audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
          if (song.type === "online" && !song.url && song.id && song.server) {
            XFApi.url(song.id, song.server).then((u) => {
              if (u) {
                song.url = u;
                if (curSong() === song) { startPlay(song); applyRestoreSeek(); }
              }
            }).catch(() => {});
          } else if (song.url) {
            startPlay(song);
            if (song.type === "online") applyRestoreSeek(); // local 由上面 applyT 处理 seek
          }
          if (song.type === "online" && (song.lrcUrl || (song.id && song.server))) fetchOnlineLrc(song);
          scheduleSaveState();
        };
        resume();
      }
    }
  }

  // v3.5.2：自动续播用——把 _restoreTime 应用到 audio（online 歌 startPlay 后调用）
  function applyRestoreSeek() {
    const t = _restoreTime;
    if (!(t > 0)) return;
    _restoreTime = 0;
    const doSeek = () => {
      try { audio.currentTime = Math.min(t, audio.duration || 0); } catch (e) {}
      audio.removeEventListener("loadedmetadata", doSeek);
    };
    if (audio.readyState >= 1 && audio.duration) doSeek();
    else audio.addEventListener("loadedmetadata", doSeek);
  }

  // 模式图标显示（切换/恢复时调用）
  function updateModeIcon() {
    const key = modeOrder[modeIdx];
    for (const [k, v] of Object.entries(modeIcons)) v.style.display = k === key ? "" : "none";
  }

  // 当前歌曲（统一访问器）
  function curSong() { return queue[currentIdx] || null; }

  // ============ 窗口控制（仅桌面版 Electron；浏览器预览自动隐藏）============
  const winMin = $("win-min");
  const winClose = $("win-close");
  const winControls = $("window-controls");
  if (window.electronAPI && window.electronAPI.window) {
    if (winMin) winMin.addEventListener("click", () => window.electronAPI.window.minimize());
    if (winClose) winClose.addEventListener("click", () => window.electronAPI.window.close());
  } else if (winControls) {
    winControls.style.display = "none";
  }

  // ============ 播放控制 ============
  // 桌面歌词转发（仅桌面版开启时）
  function dlTrack(song) {
    return {
      id: song.id || "",
      server: song.server || (song.type === "local" ? "local" : "netease"),
      name: song.name || "",
      artist: song.artist || "",
    };
  }
  function forwardDl(data) {
    if (window.electronAPI && window.electronAPI.desktopLyrics && settings.desktopLyrics) {
      window.electronAPI.desktopLyrics.forward(data);
    }
  }
  function startPlay(song) {
    audio.src = song.url;
    audio.play().then(() => {
      playing = true; updatePlayIcon();
      forwardDl({ type: "playstate", playing: true });
    }).catch((e) => {
      showFeedback("播放失败：" + (e && e.message ? e.message : "未知错误"));
      forwardDl({ type: "playstate", playing: false });
    });
  }
  function playAt(idx) {
    if (idx < 0 || idx >= queue.length) return;
    currentIdx = idx;
    const song = queue[idx];
    initSpectrum();
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    lastLyricIdx = -1;
    updateNowPlaying();
    renderQueue();
    renderPlaylistsIfOpen();
    renderSearchHighlight();
    // 桌面歌词：切歌
    forwardDl({ type: "trackchange", track: dlTrack(song) });
    // 在线歌曲：主进程搜索返回的 url 为空 → 先拉取音频地址再播放（静默，不弹提示）
    if (song.type === "online" && !song.url && song.id && song.server) {
      XFApi.url(song.id, song.server).then((u) => {
        if (u) {
          song.url = u;
          if (curSong() === song) startPlay(song);
        } else {
          showFeedback("获取音频失败，请换一首试试");
          forwardDl({ type: "playstate", playing: false });
        }
      }).catch(() => {
        showFeedback("获取音频失败，请换一首试试");
        forwardDl({ type: "playstate", playing: false });
      });
    } else {
      startPlay(song);
    }
    // 在线歌曲：异步拉取歌词（桌面版主进程含逐字 yrc/qrc；浏览器回退 lrcUrl）
    if (song.type === "online" && (song.lrcUrl || (song.id && song.server))) fetchOnlineLrc(song);
    scheduleSaveState();
  }

  function playSong(song) {
    queue.push(song);
    playAt(queue.length - 1);
  }

  function updatePlayIcon() {
    iconPlay.style.display = playing ? "none" : "";
    iconPause.style.display = playing ? "" : "none";
    // 唱片旋转：有歌曲才转；播放中转、暂停停转（保持当前角度）
    cover.classList.toggle("spinning", !!curSong());
    cover.classList.toggle("paused", !playing);
  }

  btnPlay.addEventListener("click", () => {
    if (currentIdx < 0) { showFeedback("请先搜索歌曲或选择音乐文件夹"); return; }
    initSpectrum();
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    const song = curSong();
    if (!song) return;
    // 音频未就绪（url 缺失）→ 重新走 playAt 完整流程（含拉取音频地址）
    if (!song.url || !audio.src) {
      playAt(currentIdx);
      return;
    }
    if (audio.paused) {
      audio.play().then(() => { playing = true; updatePlayIcon(); forwardDl({ type: "playstate", playing: true }); savePlayerState(); }).catch((err) => {
        // 浏览器自动播放策略：需用户手势解锁（首次点击播放按钮即是手势，一般可解）
        showFeedback("浏览器阻止了自动播放，请再点一次播放");
      });
    } else {
      audio.pause(); playing = false; updatePlayIcon();
      forwardDl({ type: "playstate", playing: false });
      savePlayerState();
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
    scheduleSaveState();
  });

  // 播放模式
  btnMode.addEventListener("click", () => {
    modeIdx = (modeIdx + 1) % modeOrder.length;
    const key = modeOrder[modeIdx];
    for (const [k, v] of Object.entries(modeIcons)) v.style.display = k === key ? "" : "none";
    btnMode.title = "播放模式：" + modeNames[key];
    savePlayerState();
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
  let lastDlTime = 0;
  audio.addEventListener("timeupdate", () => {
    const t = audio.currentTime, d = audio.duration || 0;
    const pct = d ? (t / d) * 100 : 0;
    progressFill.style.width = pct + "%";
    progressDot.style.left = pct + "%";
    timeCurrent.textContent = fmtTime(t);
    timeTotal.textContent = fmtTime(d);
    // 桌面歌词：低频转发（~250ms）
    const now = Date.now();
    if (now - lastDlTime > 250) {
      lastDlTime = now;
      forwardDl({ type: "timeupdate", currentTime: t, duration: d });
    }
    // 听歌打卡：网易云歌曲播放够久 → 上报到网易云"最近听过"
    // 阈值 = min(60s, 时长一半)（网易云规则：播放超过 1 分钟或一半才算一次听歌）
    if (d > 0) {
      const sc = curSong();
      if (sc && sc.server === "netease" && scrobbleLoggedIn && lastScrobbleId !== String(sc.id)) {
        const threshold = Math.min(60, d / 2);
        if (t >= threshold) {
          lastScrobbleId = String(sc.id);
          if (window.electronAPI && window.electronAPI.netease) {
            window.electronAPI.netease.scrobble(sc.id, Math.floor(t)).catch(() => {});
          }
        }
      }
    }
    // 播放状态持久化：3 秒节流（切模板后无缝恢复进度）
    if (now - _lastStateSave > 3000) {
      _lastStateSave = now;
      savePlayerState();
    }
  });

  function updateNowPlaying() {
    const song = curSong();
    if (!song) return;
    setMarquee(mainTitle, song.name);
    setMarquee(subTitle, song.artist || "未知歌手");
    // 唱片中心标签：歌名首字
    if (vinylLabel) vinylLabel.textContent = (song.name || "♫").trim().charAt(0);
    if (song.cover) {
      coverImg.src = song.cover;
      coverImg.classList.add("show");
      cover.classList.add("has-cover");
      bg.classList.add("has-cover");
    } else {
      // 搜索/歌单未带封面（酷狗/歌曲宝）→ 调 music.pic 兜底（对齐旧模板：酷狗 getSongInfo / 歌曲宝详情页 mp3_cover）
      if (song.type === "online" && song.id && XFStore.isElectron) {
        XFApi.pic(song.id, song.server, song.picId || "").then((u) => {
          if (u && curSong() === song) {
            song.cover = u;
            coverImg.src = u;
            coverImg.classList.add("show");
            cover.classList.add("has-cover");
            bg.classList.add("has-cover");
          }
        }).catch(() => {});
      }
      coverImg.classList.remove("show");
      cover.classList.remove("has-cover");
      bg.classList.remove("has-cover");
    }
    // 歌词预解析
    const lines = song.lrc ? XFLyrics.parseLrc(song.lrc) : [];
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

  // ============ 歌词行渲染 ============
  function setLine(el, line, showTrans) {
    if (!line) { el.textContent = ""; return; }
    el.innerHTML = "";
    const main = document.createElement("span");
    main.className = "lyric-main";
    // 逐字行 text 已是 chars 拼接（fetchOnlineLrc 生成），统一整行渐变扫光
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
      const curLine = lines[cur];
      // 逐字数据：整行渐变连续前沿（经典模板同款）——前沿 = (字索引 + 字内进度) / 总字数 × 100%
      if (curLine.chars && curLine.chars.length) {
        const chars = curLine.chars;
        const t = ms / 1000;
        let i = 0;
        while (i < chars.length - 1 && t >= chars[i + 1].start) i++;
        const segEnd = i < chars.length - 1 ? chars[i + 1].start : chars[i].start + (chars[i].dur || 0.2);
        const segDur = Math.max(0.001, segEnd - chars[i].start);
        const inner = Math.max(0, Math.min(1, (t - chars[i].start) / segDur));
        const p = ((i + inner) / chars.length) * 100;
        lrcCurrent.style.setProperty("--scan-p", p.toFixed(2) + "%");
      } else {
        // 整行比例（无逐字数据）
        const start = lines[cur].time;
        const end = cur + 1 < lines.length ? lines[cur + 1].time : start + 6000;
        const p = Math.max(0, Math.min(1, (ms - start) / (end - start)));
        lrcCurrent.style.setProperty("--scan-p", (p * 100).toFixed(1) + "%");
      }
    } else {
      lrcCurrent.style.setProperty("--scan-p", "100%");
    }
  }
  scanLoop();

  // 扫光颜色（CSS 变量）
  function applyScanColor() {
    const root = document.documentElement.style;
    const hex = settings.scanColor || "#ffffff";
    root.setProperty("--scan-color", hex);
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    if (!isNaN(r) && !isNaN(g) && !isNaN(b)) root.setProperty("--scan-rgb", r + "," + g + "," + b);
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
    if (open) { closeAllPanels(); }
  });

  // ============ 音量控制（点击音量图标弹出滑杆）============
  const btnVolume = $("btn-volume");
  const volumePop = $("volume-pop");
  const volumeSlider = $("volume-slider");
  const volumePct = $("volume-pct");
  const iconVolOn = $("icon-vol-on");
  const iconVolMute = $("icon-vol-mute");
  let _lastVolume = 0.8;   // 记住非零音量（静音后恢复用）

  function updateVolumeIcon() {
    const muted = audio.muted || audio.volume === 0;
    iconVolOn.style.display = muted ? "none" : "";
    iconVolMute.style.display = muted ? "" : "none";
    btnVolume.title = muted ? "音量：静音" : "音量：" + Math.round(audio.volume * 100) + "%";
  }
  function syncVolumeUI() {
    volumeSlider.value = Math.round(audio.volume * 100);
    volumePct.textContent = Math.round(audio.volume * 100) + "%";
    updateVolumeIcon();
  }
  function openVolumePop() {
    const r = btnVolume.getBoundingClientRect();
    volumePop.style.left = (r.left + r.width / 2) + "px";
    volumePop.style.bottom = (window.innerHeight - r.top + 12) + "px";
    volumePop.style.display = "flex";
    syncVolumeUI();
  }
  btnVolume.addEventListener("click", (e) => {
    e.stopPropagation();
    if (volumePop.style.display === "flex") volumePop.style.display = "none";
    else { closeAllPanels(); moreMenu.classList.remove("open"); openVolumePop(); }
  });
  volumeSlider.addEventListener("input", () => {
    const v = parseInt(volumeSlider.value) / 100;
    audio.volume = v;
    if (v > 0) _lastVolume = v;
    volumePct.textContent = Math.round(v * 100) + "%";
    updateVolumeIcon();
    scheduleSaveState();   // 音量持久化（跨模板延续）
  });
  volumeSlider.addEventListener("dblclick", () => {
    // 双击滑杆：静音/恢复
    if (audio.volume > 0) { _lastVolume = audio.volume; audio.volume = 0; }
    else audio.volume = _lastVolume > 0 ? _lastVolume : 0.8;
    syncVolumeUI();
    savePlayerState();
  });
  document.addEventListener("click", () => {
    volumePop.style.display = "none";
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") volumePop.style.display = "none";
  });

  document.addEventListener("click", () => {
    moreMenu.classList.remove("open");
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { moreMenu.classList.remove("open"); closeAllPanels(); }
  });

  // ============ 右上角登录入口（未登录→登录按钮；已登录→头像叠加+昵称徽标）============
  async function updateLoginEntry() {
    if (!loginEntry) return;
    // 浏览器预览：登录不可用，直接隐藏（window-controls 本身也会隐藏，双保险）
    if (!XFAccount.isElectron) { loginEntry.style.display = "none"; return; }
    try {
      const [ns, qs, ks] = await Promise.all([XFAccount.neteaseStatus(), XFAccount.qqStatus(), XFAccount.kugouStatus()]);
      const neLogged = !!(ns && ns.loggedIn);
      const qqLogged = !!(qs && qs.loggedIn);
      const kgLogged = !!(ks && ks.loggedIn);
      if (neLogged || qqLogged || kgLogged) {
        btnLoginEntry.style.display = "none";
        loginSummary.style.display = "flex";
        loginAvatars.innerHTML = "";
        const addAvatar = (url, ch) => {
          if (url) {
            const img = document.createElement("img");
            img.src = url.replace(/^http:/, "https:");
            img.alt = "";
            img.onerror = () => { img.style.display = "none"; };
            loginAvatars.appendChild(img);
          } else {
            const ph = document.createElement("div");
            ph.className = "login-avatar-placeholder";
            ph.textContent = ch === "netease" ? "云" : (ch === "qq" ? "Q" : "狗");
            loginAvatars.appendChild(ph);
          }
        };
        if (neLogged) addAvatar(ns.profile && ns.profile.avatarUrl, "netease");
        if (qqLogged) addAvatar(qs.user && qs.user.avatar, "qq");
        if (kgLogged) addAvatar(ks.user && ks.user.avatar, "kugou");
        const names = [];
        if (neLogged) names.push((ns.profile && ns.profile.nickname) || "网易云");
        if (qqLogged) names.push((qs.user && qs.user.nick) || "QQ");
        if (kgLogged) names.push((ks.user && ks.user.nick) || "酷狗");
        loginSummaryText.textContent = names.join(" · ") || "已登录";
      } else {
        loginSummary.style.display = "none";
        btnLoginEntry.style.display = "flex";
      }
    } catch (e) { /* 忽略 */ }
  }

  function openAccountTab(tab) {
    accountTab = tab;
    document.querySelectorAll(".acct-tab").forEach((b) => b.classList.toggle("active", b.dataset.atab === tab));
    closeAllPanels();
    accountPanel.classList.add("open");
    renderAccount();
  }

  function closeAllPanels() {
    document.querySelectorAll(".panel.open").forEach((p) => p.classList.remove("open"));
    stopKgQrPoll();   // 关闭面板时停止酷狗二维码轮询
    stopQqQrPoll();   // 关闭面板时停止 QQ 二维码轮询
    // 关闭面板时若网易云未登录 → 关闭隐藏登录窗口（避免后台残留）
    if (window.electronAPI.login && window.electronAPI.login.closeWindow) {
      window.electronAPI.login.closeWindow();
    }
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

  // ============ 我的音乐（登录后功能：网易云/QQ 歌单·红心·每日推荐·最近听过）============
  const accountPanel = $("account-panel");
  const accountContent = $("account-content");
  const accountStatus = $("account-status");
  let accountTab = "netease";

  // 右上角登录入口点击 → 打开"我的音乐"面板（未登录可在此登录，已登录可管理账号/退出）
  const openAccountPanel = (e) => {
    e.stopPropagation();
    moreMenu.classList.remove("open");
    closeAllPanels();
    accountPanel.classList.add("open");
    renderAccount();
  };
  if (btnLoginEntry) btnLoginEntry.addEventListener("click", openAccountPanel);
  if (loginSummary) loginSummary.addEventListener("click", openAccountPanel);
  updateLoginEntry();   // 初始状态（右上角徽标/登录按钮）

  $("menu-account").addEventListener("click", (e) => {
    e.stopPropagation();
    moreMenu.classList.remove("open");
    closeAllPanels();
    accountPanel.classList.add("open");
    renderAccount();
  });

  document.querySelectorAll(".acct-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      // 离开网易云 tab → 关闭隐藏登录窗口（避免后台残留）
      if (accountTab === "netease" && btn.dataset.atab !== "netease") {
        window.electronAPI.login.closeWindow();
      }
      accountTab = btn.dataset.atab;
      document.querySelectorAll(".acct-tab").forEach((b) => b.classList.toggle("active", b === btn));
      renderAccount();
    });
  });

  // 通用：歌单卡片（点击播放）
  function acctPlCardHtml(p) {
    return '<div class="acct-pl-card" data-plid="' + p.id + '" data-server="' + (p.server || "netease") + '">' +
      '<div class="acct-pl-name">' + escapeHtml(p.name) + (p.heart ? ' <span class="acct-heart">♥</span>' : "") + '</div>' +
      '<div class="acct-pl-meta">' + (p.trackCount || 0) + ' 首</div></div>';
  }

  // 通用：歌曲行（播放/加入队列）
  function acctSongRowHtml(s) {
    return '<div class="song-row" data-sid="' + escapeAttr(s.id) + '">' +
      '<div class="song-thumb">' + (s.pic ? '<img src="' + escapeAttr(s.pic) + '" onerror="this.parentNode.textContent=\'♪\';this.remove()">' : "♪") + '</div>' +
      '<div class="song-info"><div class="song-name"></div><div class="song-artist"></div></div>' +
      '<div class="song-actions">' +
      '<button class="act-btn play-btn" data-sact="play">播放</button>' +
      '<button class="act-btn" data-sact="queue">加入队列</button>' +
      '</div></div>';
  }

  function bindAcctSongRows(container, songs) {
    container.querySelectorAll(".song-row").forEach((row, i) => {
      row.querySelector(".song-name").textContent = songs[i].name;
      row.querySelector(".song-artist").textContent = songs[i].artist || "";
      row.addEventListener("click", (e) => {
        const act = e.target.closest("[data-sact]");
        const song = buildOnlineSong(songs[i]);
        if (act && act.dataset.sact === "queue") {
          queue.push(song); renderQueue(); showFeedback("已加入队列");
        } else {
          playSong(song); closeAllPanels();
        }
      });
    });
  }

  // 歌单 → 播放队列
  async function playAccountPlaylist(id, server) {
    try {
      const songs = await XFApi.playlist(id, server);
      if (!songs || !songs.length) { showFeedback("歌单为空或加载失败"); return; }
      queue.push(...songs.map((s) => buildOnlineSong(s)));
      renderQueue();
      playAt(queue.length - songs.length);
      closeAllPanels();
      showFeedback("已载入歌单播放");
    } catch (e) {
      showFeedback("歌单加载失败：" + e.message);
    }
  }

  function loginTipHtml(platform, onLogin) {
    const tip = document.createElement("div");
    tip.className = "acct-login-tip";
    tip.innerHTML =
      '<div>未登录' + platform + '</div>' +
      '<div class="acct-login-btns"><button class="acct-login-btn" id="btn-acct-login">登录 ' + platform + '</button></div>';
    tip.querySelector("#btn-acct-login").addEventListener("click", onLogin);
    return tip;
  }

  function userLineHtml(name, avatar) {
    return '<div class="acct-user-line">' +
      (avatar ? '<img class="acct-user-avatar" src="' + escapeAttr(avatar) + '" onerror="this.style.display=\'none\'">' : '<span class="acct-user-avatar" style="display:inline-flex;align-items:center;justify-content:center;font-size:16px">♪</span>') +
      '<span class="acct-user-name">' + escapeHtml(name) + '</span></div>';
  }

  async function renderAccount() {
    accountContent.innerHTML = '<div class="empty-tip">加载中...</div>';
    accountStatus.textContent = "";
    if (!XFAccount.isElectron) {
      accountContent.innerHTML = '<div class="empty-tip">登录功能需桌面版（浏览器预览不可用）</div>';
      return;
    }
    if (accountTab === "netease") {
      const st = await XFAccount.neteaseStatus();
      if (!st.loggedIn) {
        accountStatus.textContent = "未登录";
        accountContent.innerHTML = "";
        renderNeteaseLogin();
        return;
      }
      accountStatus.textContent = st.profile ? st.profile.nickname : "已登录";
      await renderNeteaseAccount(st.profile);
    } else if (accountTab === "qq") {
      const st = await XFAccount.qqStatus();
      if (!st.loggedIn) {
        accountStatus.textContent = "未登录";
        accountContent.innerHTML = "";
        renderQqLogin();
        return;
      }
      accountStatus.textContent = st.user ? st.user.nick : "已登录";
      await renderQqAccount(st.user);
    } else {
      // 酷狗：二维码扫码登录（无风控，二维码 base64 直接显示）
      const st = await XFAccount.kugouStatus();
      if (!st.loggedIn) {
        accountStatus.textContent = "未登录";
        accountContent.innerHTML = "";
        renderKugouLogin();
        return;
      }
      accountStatus.textContent = st.user ? st.user.nick : "已登录";
      await renderKugouAccount(st.user);
    }
  }

  // ---- 网易云：内嵌二维码登录（v3.4.x，后台隐藏窗口抓官方页 canvas 二维码）----
  let neQrListenerAttached = false;
  let neQrWrap = null;   // 当前活动的二维码容器（切 tab 重建后回调仍能定位）
  async function renderNeteaseLogin() {
    const wrap = document.createElement("div");
    wrap.className = "kg-qr-wrap";
    wrap.innerHTML =
      '<div class="kg-qr-img" id="ne-qr-img"><div class="empty-tip" style="padding:60px 0">正在打开官方登录页...</div></div>' +
      '<div class="kg-qr-status" id="ne-qr-status">正在加载登录二维码...</div>' +
      '<button class="kg-qr-refresh" id="ne-qr-refresh">重新加载</button>';
    accountContent.appendChild(wrap);
    neQrWrap = wrap;
    const imgBox = wrap.querySelector("#ne-qr-img");
    const statusEl = wrap.querySelector("#ne-qr-status");
    const refreshBtn = wrap.querySelector("#ne-qr-refresh");

    const openWindow = () => {
      imgBox.innerHTML = '<div class="empty-tip" style="padding:60px 0">正在打开官方登录页...</div>';
      statusEl.textContent = "正在加载登录二维码...";
      window.electronAPI.login.openWindow();
    };
    refreshBtn.addEventListener("click", () => {
      window.electronAPI.login.closeWindow();
      setTimeout(openWindow, 300);
    });
    // 只注册一次二维码监听（回调通过 neQrWrap 定位当前容器）
    if (!neQrListenerAttached) {
      neQrListenerAttached = true;
      window.electronAPI.login.onQrImage((qrDataUrl) => {
        const w = neQrWrap;
        if (!w || !document.body.contains(w)) return;
        const ib = w.querySelector("#ne-qr-img");
        const st = w.querySelector("#ne-qr-status");
        if (!ib) return;
        ib.innerHTML = '<img src="' + qrDataUrl + '" alt="网易云登录二维码">';
        st.textContent = "请使用网易云 App 扫码登录";
      });
    }
    openWindow();
  }

  // ---- QQ音乐：内嵌二维码登录（v3.4.x，ptlogin2 纯 HTTP，无窗口）----
  let qqQrTimer = null;
  function stopQqQrPoll() {
    if (qqQrTimer) { clearInterval(qqQrTimer); qqQrTimer = null; }
  }
  async function renderQqLogin() {
    stopQqQrPoll();
    const wrap = document.createElement("div");
    wrap.className = "kg-qr-wrap";
    wrap.innerHTML =
      '<div class="kg-qr-img" id="qq-qr-img"><div class="empty-tip" style="padding:60px 0">二维码加载中...</div></div>' +
      '<div class="kg-qr-status" id="qq-qr-status">正在生成二维码...</div>' +
      '<button class="kg-qr-refresh" id="qq-qr-refresh">刷新二维码</button>';
    accountContent.appendChild(wrap);
    const imgBox = wrap.querySelector("#qq-qr-img");
    const statusEl = wrap.querySelector("#qq-qr-status");
    const refreshBtn = wrap.querySelector("#qq-qr-refresh");
    refreshBtn.addEventListener("click", () => {
      stopQqQrPoll();
      statusEl.textContent = "正在生成二维码...";
      startQqQr();
    });
    const startQqQr = async () => {
      try {
        const r = await window.electronAPI.qqmusic.qrKey();
        if (!r || !r.success) {
          imgBox.innerHTML = '<div class="empty-tip" style="padding:60px 0">二维码获取失败</div>';
          statusEl.textContent = (r && r.message) || "获取失败";
          return;
        }
        imgBox.innerHTML = '<img src="' + r.qrDataUrl + '" alt="QQ音乐登录二维码">';
        statusEl.textContent = "请使用 QQ / 手机QQ 扫码登录";
        stopQqQrPoll();
        qqQrTimer = setInterval(async () => {
          try {
            const c = await window.electronAPI.qqmusic.qrCheck();
            if (c.status === 0) {
              stopQqQrPoll();
              statusEl.textContent = "登录成功！";
              showFeedback("QQ音乐登录成功");
              updateLoginEntry();
              renderAccount();
              return;
            }
            if (c.status === 67) { statusEl.textContent = "请在手机上确认登录"; return; }
            if (c.status === 66) { statusEl.textContent = "等待扫码..."; return; }
            if (c.status === 65) {
              stopQqQrPoll();
              statusEl.textContent = "二维码已过期，正在刷新...";
              startQqQr();
              return;
            }
            if (c.status === 98 || c.status === 99) {
              stopQqQrPoll();
              statusEl.textContent = c.message || "登录异常，请刷新重试";
              return;
            }
            statusEl.textContent = c.message || "等待扫码...";
          } catch (e) { /* 单次轮询失败忽略 */ }
        }, 2000);
      } catch (e) {
        imgBox.innerHTML = '<div class="empty-tip" style="padding:60px 0">二维码获取失败</div>';
        statusEl.textContent = e.message || "网络错误";
      }
    };
    startQqQr();
  }

  // ---- 酷狗：二维码登录（生成 → 轮询 2s → status=4 成功）----
  let kgQrTimer = null;
  let kgQrKey = "";
  function stopKgQrPoll() {
    if (kgQrTimer) { clearInterval(kgQrTimer); kgQrTimer = null; }
  }
  async function renderKugouLogin() {
    stopKgQrPoll();
    const wrap = document.createElement("div");
    wrap.className = "kg-qr-wrap";
    wrap.innerHTML =
      '<div class="kg-qr-img" id="kg-qr-img"><div class="empty-tip" style="padding:60px 0">二维码加载中...</div></div>' +
      '<div class="kg-qr-status" id="kg-qr-status">正在生成二维码...</div>' +
      '<button class="kg-qr-refresh" id="kg-qr-refresh">刷新二维码</button>';
    accountContent.appendChild(wrap);
    const imgBox = wrap.querySelector("#kg-qr-img");
    const statusEl = wrap.querySelector("#kg-qr-status");
    const refreshBtn = wrap.querySelector("#kg-qr-refresh");
    refreshBtn.addEventListener("click", () => {
      stopKgQrPoll();
      statusEl.textContent = "正在生成二维码...";
      startKgQr();
    });
    // 生成二维码
    const startKgQr = async () => {
      try {
        const r = await window.electronAPI.kugou.qrKey();
        if (!r || !r.success) {
          imgBox.innerHTML = '<div class="empty-tip" style="padding:60px 0">二维码获取失败</div>';
          statusEl.textContent = (r && r.message) || "获取失败";
          return;
        }
        kgQrKey = r.key;
        imgBox.innerHTML = '<img src="' + r.qrDataUrl + '" alt="酷狗登录二维码">';
        statusEl.textContent = "请使用酷狗 App 扫码登录";
        // 轮询（2s）
        stopKgQrPoll();
        kgQrTimer = setInterval(async () => {
          try {
            const c = await window.electronAPI.kugou.qrCheck(kgQrKey);
            if (c.status === 4) {
              stopKgQrPoll();
              statusEl.textContent = "登录成功！";
              showFeedback("酷狗登录成功");
              updateLoginEntry();
              renderAccount();
              return;
            }
            if (c.status === 2) { statusEl.textContent = "请在手机上确认登录"; return; }
            if (c.status === 0) {
              // 二维码过期 → 自动刷新
              stopKgQrPoll();
              statusEl.textContent = "二维码已过期，正在刷新...";
              startKgQr();
              return;
            }
            statusEl.textContent = "等待扫码...";
          } catch (e) { /* 单次轮询失败忽略 */ }
        }, 2000);
      } catch (e) {
        imgBox.innerHTML = '<div class="empty-tip" style="padding:60px 0">二维码获取失败</div>';
        statusEl.textContent = e.message || "网络错误";
      }
    };
    startKgQr();
  }

  // ---- 酷狗：登录后（用户信息 + 我的歌单 + 每日推荐）----
  async function renderKugouAccount(user) {
    const wrap = document.createElement("div");
    wrap.innerHTML = userLineHtml(user.nick || "酷狗用户", user.avatar || "");

    // 退出登录
    const logoutBtn = document.createElement("button");
    logoutBtn.className = "acct-logout-btn";
    logoutBtn.textContent = "退出登录";
    logoutBtn.addEventListener("click", async () => {
      if (!window.confirm("确定要退出酷狗登录吗？")) return;
      try { await window.electronAPI.kugou.logout(); } catch (e) {}
      showFeedback("已退出酷狗");
      stopKgQrPoll();
      updateLoginEntry();
      renderAccount();
    });
    wrap.appendChild(logoutBtn);

    // 我的歌单（get_all_list 内嵌歌曲，直接播放）
    const pls = await XFAccount.kugouPlaylists();
    if (pls.length) {
      const sec = document.createElement("div");
      sec.innerHTML = '<div class="acct-section-title">我的歌单（' + pls.length + '）</div>' +
        '<div class="acct-pl-grid">' + pls.map((p) => acctPlCardHtml(Object.assign({ server: "kugou" }, p))).join("") + '</div>';
      sec.querySelectorAll(".acct-pl-card").forEach((card) => {
        card.addEventListener("click", () => playKugouPlaylist(card.dataset.plid));
      });
      wrap.appendChild(sec);
    }

    // 每日推荐
    const daily = await XFAccount.kugouDaily();
    if (daily.songs.length) {
      const sec = document.createElement("div");
      sec.innerHTML = '<div class="acct-section-title">每日推荐（' + daily.songs.length + '）</div>';
      const list = document.createElement("div");
      list.innerHTML = daily.songs.slice(0, 100).map((s) => acctSongRowHtml(s)).join("");
      bindAcctSongRows(list, daily.songs.slice(0, 100));
      sec.appendChild(list);
      wrap.appendChild(sec);
    }

    if (!wrap.querySelector(".acct-pl-grid") && !wrap.querySelector(".song-row")) {
      wrap.innerHTML += '<div class="empty-tip">暂无可用数据</div>';
    }
    accountContent.innerHTML = "";
    accountContent.appendChild(wrap);
  }

  // 酷狗歌单 → 播放队列（歌单数据已内嵌，无需额外接口）
  async function playKugouPlaylist(id) {
    try {
      const pls = await XFAccount.kugouPlaylists();
      const pl = pls.find((p) => String(p.id) === String(id));
      if (!pl || !pl.songs || !pl.songs.length) { showFeedback("歌单为空或加载失败"); return; }
      queue.push(...pl.songs.map((s) => buildOnlineSong(s)));
      renderQueue();
      playAt(queue.length - pl.songs.length);
      closeAllPanels();
      showFeedback("已载入歌单播放");
    } catch (e) {
      showFeedback("歌单加载失败：" + e.message);
    }
  }

  // ---- 网易云 ----
  async function renderNeteaseAccount(profile) {
    const wrap = document.createElement("div");
    wrap.innerHTML = userLineHtml(profile.nickname || "网易云用户", profile.avatarUrl || "");

    // 退出登录（右上角账号管理入口复用本面板）
    const logoutBtn = document.createElement("button");
    logoutBtn.className = "acct-logout-btn";
    logoutBtn.textContent = "退出登录";
    logoutBtn.addEventListener("click", async () => {
      if (!window.confirm("确定要退出网易云登录吗？")) return;
      try { await window.electronAPI.login.logout(); } catch (e) {}
      showFeedback("已退出网易云");
      updateLoginEntry();
      renderAccount();
    });
    wrap.appendChild(logoutBtn);

    // 我的歌单
    const pls = await XFAccount.neteasePlaylists();
    if (pls.length) {
      const sec = document.createElement("div");
      sec.innerHTML = '<div class="acct-section-title">我的歌单（' + pls.length + '）</div>' +
        '<div class="acct-pl-grid">' + pls.map((p) => acctPlCardHtml(Object.assign({ server: "netease" }, p))).join("") + '</div>';
      sec.querySelectorAll(".acct-pl-card").forEach((card) => {
        card.addEventListener("click", () => playAccountPlaylist(card.dataset.plid, "netease"));
      });
      wrap.appendChild(sec);
    }

    // 红心
    const liked = await XFAccount.neteaseLiked();
    if (liked.length) {
      const sec = document.createElement("div");
      sec.innerHTML = '<div class="acct-section-title">红心歌曲（' + liked.length + '）</div>';
      const list = document.createElement("div");
      list.innerHTML = liked.slice(0, 100).map((s) => acctSongRowHtml(s)).join("");
      bindAcctSongRows(list, liked.slice(0, 100));
      sec.appendChild(list);
      wrap.appendChild(sec);
    }

    // 每日推荐
    const daily = await XFAccount.neteaseDaily();
    if (daily.songs.length) {
      const sec = document.createElement("div");
      sec.innerHTML = '<div class="acct-section-title">每日推荐歌曲（' + daily.songs.length + '）</div>';
      const list = document.createElement("div");
      list.innerHTML = daily.songs.map((s) => acctSongRowHtml(s)).join("");
      bindAcctSongRows(list, daily.songs);
      sec.appendChild(list);
      wrap.appendChild(sec);
    }

    // 最近听过（周）
    const record = await XFAccount.neteaseRecord(1);
    if (record.length) {
      const sec = document.createElement("div");
      sec.innerHTML = '<div class="acct-section-title">最近听过（本周）</div>';
      const list = document.createElement("div");
      list.innerHTML = record.slice(0, 50).map((s) => acctSongRowHtml(s)).join("");
      bindAcctSongRows(list, record.slice(0, 50));
      sec.appendChild(list);
      wrap.appendChild(sec);
    }

    if (!wrap.querySelector(".acct-pl-grid") && !wrap.querySelector(".song-row")) {
      wrap.innerHTML += '<div class="empty-tip">暂无可用数据</div>';
    }
    accountContent.innerHTML = "";
    accountContent.appendChild(wrap);
  }

  // ---- QQ 音乐 ----
  async function renderQqAccount(user) {
    const wrap = document.createElement("div");
    wrap.innerHTML = userLineHtml(user.nick || "QQ音乐用户", user.avatar || "");

    // 退出登录（右上角账号管理入口复用本面板）
    const logoutBtn = document.createElement("button");
    logoutBtn.className = "acct-logout-btn";
    logoutBtn.textContent = "退出登录";
    logoutBtn.addEventListener("click", async () => {
      if (!window.confirm("确定要退出QQ音乐登录吗？")) return;
      try { await window.electronAPI.qqmusic.logout(); } catch (e) {}
      showFeedback("已退出QQ音乐");
      updateLoginEntry();
      renderAccount();
    });
    wrap.appendChild(logoutBtn);

    const pls = await XFAccount.qqPlaylists();
    if (pls.length) {
      const sec = document.createElement("div");
      sec.innerHTML = '<div class="acct-section-title">我的歌单（' + pls.length + '）</div>' +
        '<div class="acct-pl-grid">' + pls.map((p) => acctPlCardHtml(Object.assign({ server: "qq" }, p))).join("") + '</div>';
      sec.querySelectorAll(".acct-pl-card").forEach((card) => {
        card.addEventListener("click", () => playAccountPlaylist(card.dataset.plid, "qq"));
      });
      wrap.appendChild(sec);
    }

    const collect = await XFAccount.qqCollectPlaylists();
    if (collect.length) {
      const sec = document.createElement("div");
      sec.innerHTML = '<div class="acct-section-title">收藏的歌单（' + collect.length + '）</div>' +
        '<div class="acct-pl-grid">' + collect.map((p) => acctPlCardHtml(Object.assign({ server: "qq" }, p))).join("") + '</div>';
      sec.querySelectorAll(".acct-pl-card").forEach((card) => {
        card.addEventListener("click", () => playAccountPlaylist(card.dataset.plid, "qq"));
      });
      wrap.appendChild(sec);
    }

    const liked = await XFAccount.qqLiked();
    if (liked.length) {
      const sec = document.createElement("div");
      sec.innerHTML = '<div class="acct-section-title">红心歌曲（' + liked.length + '）</div>';
      const list = document.createElement("div");
      list.innerHTML = liked.slice(0, 100).map((s) => acctSongRowHtml(s)).join("");
      bindAcctSongRows(list, liked.slice(0, 100));
      sec.appendChild(list);
      wrap.appendChild(sec);
    }

    const daily = await XFAccount.qqDaily();
    if (daily.songs.length) {
      const sec = document.createElement("div");
      sec.innerHTML = '<div class="acct-section-title">每日推荐（' + daily.songs.length + '）</div>';
      const list = document.createElement("div");
      list.innerHTML = daily.songs.map((s) => acctSongRowHtml(s)).join("");
      bindAcctSongRows(list, daily.songs);
      sec.appendChild(list);
      wrap.appendChild(sec);
    }

    if (!wrap.querySelector(".acct-pl-grid") && !wrap.querySelector(".song-row")) {
      wrap.innerHTML += '<div class="empty-tip">暂无可用数据</div>';
    }
    accountContent.innerHTML = "";
    accountContent.appendChild(wrap);
  }

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
        // ⚠️ 持久化用：绝对目录 + 文件名（blob URL reload 即失效，恢复时用 file:// 直播）
        folder: f.path ? f.path.replace(/[\\/][^\\/]+$/, "") : "",
        fileName: f.name || name,
      });
    }
    if (!loaded.length) { showFeedback("未找到音频文件"); return; }
    // ⚠️ 记住选择的根目录 → 写入主进程 musicFolder（跨模板共享：经典模板/下次启动自动加载）
    if (XFStore.isElectron && audioFiles.length) {
      const f0 = audioFiles[0];
      const abs = f0.path || "";
      const rel = (f0.webkitRelativePath || "").split("/").join("\\");
      let root = "";
      if (abs && rel && abs.endsWith(rel)) root = abs.slice(0, abs.length - rel.length);
      else if (abs) root = abs.replace(/[\\/][^\\/]*$/, "");
      if (root) {
        settings.musicFolder = root;
        XFStore.saveSettings({ musicFolder: root }).catch(() => {});
      }
    }
    // 本地歌曲加入队列
    queue.push(...loaded);
    renderQueue();
    scheduleSaveState();
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
  // 把队列中某首歌设为"下一曲播放"（插入到当前播放之后）
  function moveToNext(idx) {
    if (idx < 0 || idx >= queue.length) return;
    if (idx === currentIdx) { showFeedback("当前播放的歌曲不能设为下一曲"); return; }
    const [song] = queue.splice(idx, 1);
    if (idx < currentIdx) currentIdx--;   // 从前面移除 → 当前索引前移
    let target = Math.max(0, Math.min(currentIdx + 1, queue.length));
    queue.splice(target, 0, song);
    renderQueue();
    scheduleSaveState();
    showFeedback("已设为下一曲：\"" + (song.name || "") + "\"");
  }

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
      const dlBtn = s.type === "online" && s.id ? '<button class="act-btn" data-dl="' + i + '">下载</button>' : "";
      row.innerHTML =
        '<div class="song-thumb">' + thumb + '</div>' +
        '<div class="song-info"><div class="song-name"></div><div class="song-artist"></div></div>' +
        '<div class="song-actions"><button class="act-btn play-btn" data-idx="' + i + '">播放</button>' +
        '<button class="act-btn" data-next="' + i + '" title="设为下一曲播放">下一曲</button>' +
        dlBtn +
        '<button class="act-btn" data-rm="' + i + '">移除</button></div>';
      row.querySelector(".song-name").textContent = s.name;
      row.querySelector(".song-artist").textContent = (s.artist || "") + (s.source ? " · " + s.source : "");
      row.addEventListener("click", (e) => {
        if (e.target.closest("[data-dl]")) {
          const idx = parseInt(e.target.closest("[data-dl]").dataset.dl);
          downloadOnlineSong(queue[idx]);
          return;
        }
        if (e.target.closest("[data-next]")) {
          moveToNext(parseInt(e.target.closest("[data-next]").dataset.next));
          return;
        }
        if (e.target.closest("[data-rm]")) {
          const idx = parseInt(e.target.closest("[data-rm]").dataset.rm);
          queue.splice(idx, 1);
          if (idx === currentIdx) {
            currentIdx = -1; playing = false;
            audio.pause(); audio.src = "";
            updatePlayIcon();
            resetNowPlayingUI();
          }
          else if (idx < currentIdx) currentIdx--;
          renderQueue();
          scheduleSaveState();
          return;
        }
        if (e.target.closest("[data-idx]")) playAt(parseInt(e.target.closest("[data-idx]").dataset.idx));
        else playAt(i);
      });
      queueList.appendChild(row);
    });
  }
  // 清空"正在播放"的 UI 状态（队列清空 / 当前曲被移除时调用）：封面、歌词、标题、进度、播放态全重置
  function resetNowPlayingUI() {
    coverImg.src = "";
    coverImg.classList.remove("show");
    cover.classList.remove("has-cover");
    cover.classList.remove("spinning", "paused");
    if (vinylLabel) vinylLabel.textContent = "♫";
    bg.classList.remove("has-cover");
    mainTitle.textContent = "小风音乐";
    subTitle.textContent = "此刻聆听";
    lrcPrev.textContent = "";
    lrcCurrent.textContent = "";
    lrcCurrent.className = "lyric-line current";
    lrcCurrent.style.removeProperty("--scan-p");
    lrcNext.textContent = "";
    progressFill.style.width = "0%";
    progressDot.style.left = "0%";
    timeCurrent.textContent = "0:00";
    timeTotal.textContent = "0:00";
    lastLyricIdx = -1;
    // 桌面歌词：清空 + 停止
    forwardDl({ type: "trackchange", track: null });
    forwardDl({ type: "playstate", playing: false });
    forwardDl({ type: "timeupdate", currentTime: 0, duration: 0 });
  }

  $("btn-clear-queue").addEventListener("click", () => {
    queue = [];
    currentIdx = -1;
    playing = false;
    audio.pause();
    audio.src = "";
    updatePlayIcon();
    resetNowPlayingUI();
    renderQueue();
    savePlayerState();
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

  // ============ 在线搜索（XFApi：桌面版主进程 / 浏览器 Meting）============
  let searchResultsData = [];
  // 当前搜索关键词 + 当前渠道（切换渠道 tab 自动用关键词重新搜索）
  let lastKeyword = "";
  let lastServer = localStorage.getItem("xf-search-server") || "netease";
  // v3.4.0 移除全民K歌：本地残留的旧渠道值（gqh/tencent）回退到有效渠道
  if (window.XFSearch && !XFSearch.CHANNELS.some((c) => c.id === lastServer)) {
    lastServer = lastServer === "tencent" ? "qq" : "netease";
    localStorage.setItem("xf-search-server", lastServer);
  }

  // 渠道栏：共享模块渲染（网易云/QQ/酷狗/歌曲宝，v3.4.0 移除全民K歌）
  function renderChannels() {
    if (!searchChannels) return;
    if (window.XFSearch) {
      XFSearch.populateTabs(searchChannels, lastServer);
    }
    searchChannels.querySelectorAll(".ch-tab").forEach((t) => {
      t.classList.toggle("active", t.dataset.server === lastServer);
    });
  }
  if (searchChannels) {
    searchChannels.addEventListener("click", (e) => {
      const tab = e.target.closest(".ch-tab");
      if (!tab) return;
      const server = tab.dataset.server;
      if (server === lastServer) return;
      lastServer = server;
      localStorage.setItem("xf-search-server", server);
      renderChannels();
      // 切换渠道：用当前关键词自动重新搜索
      if (lastKeyword) performSearch(lastKeyword);
    });
  }

  async function performSearch(kw) {
    const server = lastServer;
    searchResults.innerHTML = '<div class="empty-tip">搜索中...</div>';
    searchStatus.textContent = "正在搜索";
    try {
      const data = await XFApi.search(kw, server);
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
      row.querySelector(".song-name").textContent = s.name || s.title || "";
      row.querySelector(".song-artist").textContent = s.artist || s.author || "";
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

  // 在线歌曲对象（统一结构：id/server 供歌词与下载使用）
  function buildOnlineSong(s) {
    return {
      type: "online",
      id: s.id || s.url || "",
      server: s.server || lastServer,
      name: s.name || s.title || "未知歌曲",
      artist: s.artist || s.author || "",
      url: s.url || "",
      cover: s.pic || "",
      lrcUrl: s.lrcUrl || s.lrc || "",
      lrc: null,  // 需要时单独拉取
      source: sourceName(s.server || lastServer),
    };
  }

  function sourceName(server) {
    return window.XFSearch ? XFSearch.channelName(server) : server;
  }

  // 在线歌词拉取（桌面版主进程含逐字 yrc/qrc；浏览器回退 lrcUrl 签名地址）
  async function fetchOnlineLrc(song) {
    if (song._lrcFetched) return;
    song._lrcFetched = true;
    try {
      let text = "";
      if (XFStore.isElectron && song.id && song.server) {
        const r = await XFApi.lyric(song.id, song.server);
        if (r && r.lyric) {
          text = r.lyric;
          song.tlyric = r.tlyric || "";
          song.yrc = r.qrc || r.yrc || "";
        }
      }
      if (!text && song.lrcUrl) {
        const res = await fetch(song.lrcUrl);
        text = await res.text();
      }
      if (!text) { song._lines = []; return; }
      song.lrc = text;
      song._lines = XFLyrics.parseLrc(text);
      // ⚠️ QQ 音乐接口返回的 lyric 字段本身是 QRC 格式（[ms,ms]字(偏移,时长)字...），
      //    标准 LRC 解析（parseLrc）解析不出 0 行 → 直接用 QRC 行替换（含逐字时间戳）
      if (!song._lines.length && song.yrc) {
        const charLines = XFLyrics.parseQrc(song.yrc) || XFLyrics.parseYrc(song.yrc);
        if (charLines && charLines.length) {
          song._lines = charLines.map((cl) => ({
            time: Math.round(cl.start * 1000),
            text: cl.chars.map((c) => c.text).join(""),
            chars: cl.chars,
          }));
        }
      } else if (song.yrc) {
        // 网易云 YRC：标准 LRC 行 + 逐字挂载
        const charLines = song.yrc.trim().startsWith("[")
          ? XFLyrics.parseQrc(song.yrc) || XFLyrics.parseYrc(song.yrc)
          : XFLyrics.parseYrc(song.yrc) || XFLyrics.parseQrc(song.yrc);
        XFLyrics.attachChars(song._lines, charLines);
      }
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

  // 在线下载（桌面版主进程落盘 + 进度；浏览器 a 标签）
  function downloadOnlineSong(s) {
    const name = s.name || s.title || "song";
    const artist = s.artist || s.author || "";
    if (XFStore.isElectron && s.id) {
      XFApi.download(s.id, s.server || lastServer, name, artist);
      showFeedback("开始下载：" + name);
      return;
    }
    if (s.url) {
      const a = document.createElement("a");
      a.href = s.url;
      a.download = (artist ? artist + " - " : "") + name + ".mp3";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      showFeedback("开始下载：" + name);
    } else {
      showFeedback("该歌曲无可用下载地址");
    }
  }

  // ============ 在线搜索入口 ============
  searchHint.addEventListener("click", () => {
    const kw = searchInput.value.trim();
    if (!kw) { showFeedback("请输入歌名"); searchInput.focus(); return; }
    closeAllPanels();
    moreMenu.classList.remove("open");
    searchPanel.classList.add("open");
    lastKeyword = kw;
    renderChannels();
    performSearch(kw);
  });
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") searchHint.click();
  });

  // ============ 歌单管理（XFStore：桌面版主进程 / 浏览器 localStorage）============
  let playlistsCache = [];
  // 桌面版歌单列表首项为"本地音乐"（虚拟歌单）时，真实歌单下标需要 +1 偏移
  function getPlaylistOffset() {
    return (playlistsCache[0] && playlistsCache[0].source === "local") ? 1 : 0;
  }
  async function refreshPlaylists() {
    try {
      const list = await XFStore.getPlaylists();
      playlistsCache = Array.isArray(list) ? list : [];
      renderPlaylists();
      return playlistsCache;
    } catch (e) {
      playlistsCache = [];
      renderPlaylists();
      return playlistsCache;
    }
  }

  function renderPlaylists() {
    const list = playlistsCache;
    plCount.textContent = list.length + " 个";
    playlistsList.innerHTML = "";
    if (!list.length) {
      playlistsList.innerHTML = '<div class="empty-tip">还没有歌单 · 下方输入名称新建，或菜单「导入歌单」</div>';
      return;
    }
    list.forEach((pl, pi) => {
      const card = document.createElement("div");
      card.className = "pl-card";
      const isLocalPl = pl.source === "local";
      const head = document.createElement("div");
      head.className = "pl-card-head";
      head.innerHTML =
        '<span class="pl-card-name"></span>' +
        '<span class="pl-card-count">' + (pl.songs ? pl.songs.length : 0) + ' 首</span>' +
        '<div class="pl-card-actions">' +
        '<button class="act-btn play-btn" data-pl-act="play">播放</button>' +
        (isLocalPl ? "" :
        '<button class="act-btn" data-pl-act="rename">重命名</button>' +
        '<button class="act-btn" data-pl-act="del">删除</button>') +
        '</div>';
      head.querySelector(".pl-card-name").textContent = pl.name;
      head.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-pl-act]");
        if (!btn) { card.classList.toggle("open"); return; }
        const act = btn.dataset.plAct;
        const offset = getPlaylistOffset();
        if (act === "play") {
          queue.push(...(pl.songs || []).map((s) => Object.assign({}, s)));
          renderQueue();
          playAt(queue.length - (pl.songs ? pl.songs.length : 0));
          showFeedback("已载入歌单「" + pl.name + "」");
        } else if (act === "rename") {
          const nn = prompt("重命名歌单", pl.name);
          if (nn && nn.trim()) {
            XFStore.renamePlaylist(pi - offset, nn.trim()).then(refreshPlaylists);
          }
        } else if (act === "del") {
          if (confirm("删除歌单「" + pl.name + "」？")) {
            XFStore.removePlaylist(pi - offset).then(refreshPlaylists);
          }
        }
      });
      // 歌曲子列表
      const body = document.createElement("div");
      body.className = "pl-card-body";
      pl.songs.forEach((s, si) => {
        const row = document.createElement("div");
        row.className = "song-row";
        const dlBtn = s.type === "online" && s.id ? '<button class="act-btn" data-dlpl="' + si + '">下载</button>' : "";
        row.innerHTML =
          '<div class="song-thumb">' + (s.cover ? '<img src="' + escapeAttr(s.cover) + '" onerror="this.parentNode.textContent=\'♪\';this.remove()">' : "♪") + '</div>' +
          '<div class="song-info"><div class="song-name"></div><div class="song-artist"></div></div>' +
          '<div class="song-actions">' + dlBtn +
          '<button class="act-btn" data-rm="' + si + '">移除</button></div>';
        row.querySelector(".song-name").textContent = s.name;
        row.querySelector(".song-artist").textContent = s.artist || "";
        row.addEventListener("click", (e) => {
          if (e.target.closest("[data-dlpl]")) {
            const si2 = parseInt(e.target.closest("[data-dlpl]").dataset.dlpl);
            downloadOnlineSong(pl.songs[si2]);
            return;
          }
          if (e.target.closest("[data-rm]")) {
            const si = parseInt(e.target.closest("[data-rm]").dataset.rm);
            const offset = getPlaylistOffset();
            XFStore.removeSong(pi - offset, si).then(refreshPlaylists);
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

  $("btn-new-playlist").addEventListener("click", async () => {
    const name = $("new-pl-name").value.trim();
    if (!name) { showFeedback("请输入歌单名称"); return; }
    await XFStore.addPlaylist(name, []);
    $("new-pl-name").value = "";
    refreshPlaylists();
    showFeedback("已创建歌单「" + name + "」");
  });

  function renderPlaylistsIfOpen() {
    if (playlistsPanel.classList.contains("open")) renderPlaylists();
  }

  // ============ 导入歌单（XFApi：桌面版主进程支持 QQ 短链 / 浏览器 Meting）============
  function openImportDialog() {
    const url = prompt("粘贴网易云/QQ音乐歌单链接或歌单ID：\n示例：\n网易云 https://music.163.com/playlist?id=123\nQQ https://y.qq.com/n/ryqq/playlist/123");
    if (!url) return;
    importPlaylist(url);
  }

  async function importPlaylist(input) {
    const s = String(input).trim();
    showFeedback("正在解析歌单...");
    try {
      const result = await XFApi.importPlaylist(s);
      if (!result || !result.songs || !result.songs.length) {
        showFeedback("歌单为空或无法解析（QQ分享短链需桌面版）");
        return;
      }
      const name = prompt("歌单名称（默认取歌单标题）：", result.name || "导入歌单") || "导入歌单";
      const songs = result.songs.map((x) => ({
        type: "online",
        name: x.name || "",
        artist: x.artist || "",
        id: x.id || "",
        server: x.server || result.server || "netease",
        url: x.url || "",
        cover: x.pic || "",
        lrcUrl: x.lrcUrl || "",
        lrc: null,
        source: (result.server === "tencent" || x.server === "qq") ? "QQ音乐" : "网易云",
      }));
      await XFStore.addPlaylist(name, songs);
      refreshPlaylists();
      showFeedback("已导入 " + songs.length + " 首到歌单「" + name + "」");
    } catch (e) {
      showFeedback("导入失败：" + e.message);
    }
  }

  // ============ 幻灯片背景（图片 + 视频混合，双视频交叉淡入淡出）============
  let slides = [];
  let slideIdx = -1;
  let slideTimer = null;
  let slideLoading = false;
  let slideUsingImgFront = false;   // 当前显示的图片层
  let slideActiveVideo = null;      // 当前播放的视频
  let slideVideoEndBound = null;
  let slideVideoFallback = null;
  const slideImgBack = $("slide-img-back");
  const slideImgFront = $("slide-img-front");
  const slideVideoBack = $("slide-video-back");
  const slideVideoFront = $("slide-video-front");
  const slideSearchBar = document.querySelector(".online-search");

  // 导入背景后进入 B 状态布局（body.bg-imported），并启用搜索框空闲自动隐藏
  let searchHideTimer = null, searchAutoHideBound = false;
  function slideSetBgMode(on) {
    document.body.classList.toggle("bg-imported", on);
    if (on) {
      if (!searchAutoHideBound && slideSearchBar) {
        searchAutoHideBound = true;
        slideSearchBar.classList.add("auto-hide");
        const schedule = () => {
          clearTimeout(searchHideTimer);
          searchHideTimer = setTimeout(() => slideSearchBar.classList.add("search-hidden"), 2000);
        };
        document.addEventListener("mousemove", () => {
          slideSearchBar.classList.remove("search-hidden");
          schedule();
        }, { passive: true });
        schedule();
      }
    } else {
      if (slideSearchBar) slideSearchBar.classList.remove("auto-hide", "search-hidden");
      clearTimeout(searchHideTimer);
      searchAutoHideBound = false;
    }
  }

  function slideHideLayer(el) { if (el) el.classList.remove("on"); }

  function slidePauseVideos() {
    slideVideoFront.pause();
    slideVideoBack.pause();
  }
  function slideClearVideoWatch() {
    if (slideVideoEndBound && slideActiveVideo) {
      slideActiveVideo.removeEventListener("ended", slideVideoEndBound);
    }
    slideVideoEndBound = null;
    if (slideVideoFallback) { clearTimeout(slideVideoFallback); slideVideoFallback = null; }
  }

  // 播放视频：ended 驱动切下一张（30s 兜底防卡死）
  function slidePlayVideo(el) {
    slideActiveVideo = el;
    el.classList.add("on");
    el.currentTime = 0;
    el.play().catch(() => {});
    slideVideoEndBound = () => { slideVideoEndBound = null; slideNext(); };
    el.addEventListener("ended", slideVideoEndBound, { once: true });
    slideVideoFallback = setTimeout(() => {
      if (slideVideoEndBound) {
        el.removeEventListener("ended", slideVideoEndBound);
        slideVideoEndBound = null;
      }
      slideNext();
    }, 30000);
  }

  function slideNext() {
    if (!slides.length || slideLoading) return;
    slideIdx = (slideIdx + 1) % slides.length;
    slideShow(slideIdx);
  }

  function slideShow(i) {
    const s = slides[i];
    if (!s) return;
    slideClearVideoWatch();
    if (s.type === "video") {
      // 视频：双缓冲交叉淡入淡出（视频由 ended 驱动，图片定时器暂停）
      if (slideTimer) { clearInterval(slideTimer); slideTimer = null; }
      const newV = slideActiveVideo === slideVideoFront ? slideVideoBack : slideVideoFront;
      if (slideActiveVideo) slideHideLayer(slideActiveVideo);
      slideHideLayer(slideImgFront);
      slideHideLayer(slideImgBack);
      newV.src = s.url;
      slideLoading = true;
      const onReady = () => {
        newV.removeEventListener("loadeddata", onReady);
        slideLoading = false;
        slidePlayVideo(newV);
      };
      newV.addEventListener("loadeddata", onReady, { once: true });
      newV.load();
    } else {
      // 图片：切回图片双缓冲 + 定时轮换
      if (slideActiveVideo) { slideHideLayer(slideActiveVideo); slideActiveVideo.pause(); }
      slideActiveVideo = null;
      const target = slideUsingImgFront ? slideImgBack : slideImgFront;
      slideHideLayer(slideUsingImgFront ? slideImgFront : slideImgBack);
      target.src = s.url;
      target.classList.add("on");
      slideUsingImgFront = !slideUsingImgFront;
      if (!slideTimer) {
        slideTimer = setInterval(() => slideNext(), (settings.slideInterval || 8) * 1000);
      }
    }
  }

  function startSlideshow() {
    stopSlideshow();
    if (!settings.slideEnabled || !slides.length) return;
    slideIdx = 0;
    slideShow(0);
    slideSetBgMode(true);   // 进入 B 状态布局（唱片左/歌词右/控件缩左上 + 搜索框自动隐藏）
  }

  function stopSlideshow() {
    if (slideTimer) { clearInterval(slideTimer); slideTimer = null; }
    slideClearVideoWatch();
    slidePauseVideos();
    slideHideLayer(slideImgFront);
    slideHideLayer(slideImgBack);
    slideHideLayer(slideVideoFront);
    slideHideLayer(slideVideoBack);
    slideActiveVideo = null;
    slideSetBgMode(false);  // 回到 A 状态布局
  }

  $("btn-pick-slide").addEventListener("click", () => $("slide-folder").click());
  $("slide-folder").addEventListener("change", async (e) => {
    const files = Array.from(e.target.files || []).filter((f) =>
      /\.(jpg|jpeg|png|webp|bmp|mp4|webm|mov|avi|mkv)$/i.test(f.name));
    slides = files.map((f) => ({
      type: /\.(mp4|webm|mov|avi|mkv)$/i.test(f.name) ? "video" : "image",
      url: URL.createObjectURL(f),
    }));
    const imgN = slides.filter((s) => s.type === "image").length;
    const vidN = slides.length - imgN;
    $("slide-count").textContent = slides.length + " 个（图片 " + imgN + " / 视频 " + vidN + "）";
    // ⚠️ 记住选择的根目录 → 写入主进程 imageFolder（跨模板共享 + 下次启动自动加载）
    if (XFStore.isElectron && files.length) {
      const f0 = files[0];
      const abs = f0.path || "";
      const rel = (f0.webkitRelativePath || "").split("/").join("\\");
      let root = "";
      if (abs && rel && abs.endsWith(rel)) root = abs.slice(0, abs.length - rel.length);
      else if (abs) root = abs.replace(/[\\/][^\\/]*$/, "");
      if (root) {
        settings.imageFolder = root;
        XFStore.saveSettings({ imageFolder: root }).catch(() => {});
        $("slide-count").textContent = root + " · " + slides.length + " 个（图片 " + imgN + " / 视频 " + vidN + "）";
      }
    }
    showFeedback("已加载 " + slides.length + " 个幻灯片背景");
    startSlideshow();
  });

  // 启动自动加载主进程 imageFolder（跨模板共享：经典模板设置的背景文件夹这里也能用，重启不丢）
  async function autoLoadImageFolder() {
    try {
      if (!XFStore.isElectron || !window.electronAPI.fs) return;
      let folder = "";
      try { const s = await XFStore.getSettings(); folder = s.imageFolder || ""; } catch (e) {}
      if (!folder) return;
      const exts = [".jpg", ".jpeg", ".png", ".webp", ".bmp", ".mp4", ".webm", ".mov", ".avi", ".mkv"];
      const files = await window.electronAPI.fs.scanFiles(folder, exts, true);
      if (!files || !files.length) return;
      slides = files.map((f) => {
        const rel = f.replace(/\\/g, "/");
        return {
          type: /\.(mp4|webm|mov|avi|mkv)$/i.test(f) ? "video" : "image",
          // file:// 直链（分段 encodeURIComponent 处理空格/中文路径）
          url: "file:///" + folder.replace(/\\/g, "/") + "/" + rel.split("/").map(encodeURIComponent).join("/"),
          name: f,
        };
      });
      const imgN = slides.filter((s) => s.type === "image").length;
      $("slide-count").textContent = folder + " · " + slides.length + " 个（图片 " + imgN + " / 视频 " + (slides.length - imgN) + "）";
      startSlideshow();
    } catch (e) { /* 目录不可用则保持默认深色渐变 */ }
  }

  // ============ 设置面板 ============
  // 回填歌词字体选择（populate 与字体列表加载完成后都要调用）
  function applyLyricsFontSelection() {
    const sel = $("set-lyrics-font");
    if (!sel || !settings.lyricsFont) return;
    if ([...sel.options].some((o) => o.value === settings.lyricsFont)) {
      sel.value = settings.lyricsFont;
    }
  }
  // 回填桌面歌词字体选择（同样要等字体列表加载完）
  function applyDlFontSelection() {
    const sel = $("set-dl-font");
    if (!sel) return;
    const font = settings.desktopLyricsFont || "微软雅黑";
    if ([...sel.options].some((o) => o.value === font)) {
      sel.value = font;
    }
  }

  // 加载系统字体列表（异步；⚠️ 字体列表就绪后再回填保存的字体，否则选项不存在显示"默认"）
  (async function loadLyricsFonts() {
    try {
      if (!window.electronAPI || !window.electronAPI.fonts) return;
      const fonts = await window.electronAPI.fonts.list();
      const sel = $("set-lyrics-font");
      if (sel) {
        fonts.forEach((f) => {
          const opt = document.createElement("option");
          opt.value = f;
          opt.textContent = f;
          sel.appendChild(opt);
        });
      }
      const dlSel = $("set-dl-font");
      if (dlSel) {
        fonts.forEach((f) => {
          const opt = document.createElement("option");
          opt.value = f;
          opt.textContent = f;
          dlSel.appendChild(opt);
        });
      }
      applyLyricsFontSelection();
      applyDlFontSelection();
    } catch (e) { /* 字体加载失败，仅"默认"选项 */ }
  })();

  function populateSettings() {
    $("set-theme").value = settings.theme;
    if ($("set-template")) $("set-template").value = settings.template || "classic";
    $("set-slide-interval").value = settings.slideInterval;
    $("slide-interval-val").textContent = settings.slideInterval + "s";
    $("set-lyrics-size").value = settings.lyricsSize;
    $("lyrics-size-val").textContent = settings.lyricsSize + "px";
    $("set-scan-color").value = settings.scanColor;
    $("set-show-trans").checked = settings.showTranslation;
    $("set-show-scan").checked = settings.showScan;
    $("set-slide-on").checked = settings.slideEnabled;
    $("set-quote-on").checked = settings.quoteEnabled;
    applyLyricsFontSelection();
    // 桌面歌词
    if ($("set-dl-on")) {
      $("set-dl-on").checked = !!settings.desktopLyrics;
      $("set-dl-lines").value = settings.desktopLyricsLines === 2 ? "2" : "1";
      $("set-dl-size").value = settings.desktopLyricsFontSize || 36;
      $("dl-size-val").textContent = $("set-dl-size").value + "px";
      $("set-dl-played").value = settings.desktopLyricsPlayedColor || "#ffffff";
      $("set-dl-unplayed").value = settings.desktopLyricsUnplayedColor || "#9a9aa8";
      $("set-dl-opacity").value = Math.round((settings.desktopLyricsOpacity != null ? settings.desktopLyricsOpacity : 1) * 100);
      $("dl-opacity-val").textContent = $("set-dl-opacity").value + "%";
      $("set-dl-border").checked = !!settings.desktopLyricsBorder;
      $("set-dl-taskbar").checked = settings.desktopLyricsOverTaskbar !== false;
      $("set-dl-bold").checked = !!settings.desktopLyricsBold;
      applyDlFontSelection();
    }
    // 常规
    if ($("set-startup")) {
      $("set-startup").checked = !!settings.startup;
      $("download-folder-name").textContent = settings.downloadFolder || "未设置";
      $("download-folder-name").title = settings.downloadFolder || "";
    }
    // 打开时重置导航到顶部 + 高亮第一项（v3.4.0 分区导航）
    const navWin = $("settings-window");
    if (navWin) navWin.scrollTop = 0;
    const navBar = $("settings-nav");
    if (navBar) {
      const first = navBar.querySelector(".settings-nav-item");
      if (first) {
        navBar.querySelectorAll(".settings-nav-item").forEach((it) => it.classList.toggle("active", it === first));
      }
    }
  }

  $("set-slide-interval").addEventListener("input", () => {
    $("slide-interval-val").textContent = $("set-slide-interval").value + "s";
  });
  $("set-lyrics-size").addEventListener("input", () => {
    $("lyrics-size-val").textContent = $("set-lyrics-size").value + "px";
    // 实时预览字号（未保存不持久化，保存按钮才写入 settings）
    const px = parseInt($("set-lyrics-size").value) || 36;
    const root = document.documentElement.style;
    root.setProperty("--lyrics-size", px + "px");
    root.setProperty("--lyrics-size-current", (px + 8) + "px");
  });
  $("set-dl-size").addEventListener("input", () => {
    $("dl-size-val").textContent = $("set-dl-size").value + "px";
  });
  $("set-dl-opacity").addEventListener("input", () => {
    $("dl-opacity-val").textContent = $("set-dl-opacity").value + "%";
  });
  $("btn-pick-download").addEventListener("click", async () => {
    if (!XFStore.isElectron || !window.electronAPI.dialog) { showFeedback("请使用桌面版设置下载目录"); return; }
    const folder = await window.electronAPI.dialog.selectFolder();
    if (folder) {
      settings.downloadFolder = folder;
      $("download-folder-name").textContent = folder;
      $("download-folder-name").title = folder;
      // 立即持久化（不必等保存按钮，下载立即可用）
      localStorage.setItem(LS_SETTINGS, JSON.stringify(settings));
      XFStore.saveSettings({ downloadFolder: folder }).catch(() => {});
      showFeedback("下载目录已设置");
    }
  });

  $("btn-save-settings").addEventListener("click", async () => {
    const prevDlOn = !!settings.desktopLyrics;
    settings.theme = $("set-theme").value;
    settings.slideInterval = parseInt($("set-slide-interval").value) || 8;
    settings.lyricsSize = parseInt($("set-lyrics-size").value) || 36;
    settings.lyricsFont = $("set-lyrics-font") ? $("set-lyrics-font").value || "" : "";
    settings.scanColor = $("set-scan-color").value || "#ffffff";
    settings.showTranslation = $("set-show-trans").checked;
    settings.showScan = $("set-show-scan").checked;
    settings.slideEnabled = $("set-slide-on").checked;
    settings.quoteEnabled = $("set-quote-on").checked;
    // 桌面歌词
    settings.desktopLyrics = $("set-dl-on") ? $("set-dl-on").checked : settings.desktopLyrics;
    settings.desktopLyricsLines = parseInt(($("set-dl-lines") || {}).value) || 1;
    settings.desktopLyricsFont = $("set-dl-font") ? $("set-dl-font").value || "微软雅黑" : settings.desktopLyricsFont;
    settings.desktopLyricsFontSize = parseInt($("set-dl-size").value) || 36;
    settings.desktopLyricsPlayedColor = $("set-dl-played").value || "#ffffff";
    settings.desktopLyricsUnplayedColor = $("set-dl-unplayed").value || "#9a9aa8";
    settings.desktopLyricsOpacity = (parseInt($("set-dl-opacity").value) || 100) / 100;
    settings.desktopLyricsBorder = $("set-dl-border").checked;
    settings.desktopLyricsOverTaskbar = $("set-dl-taskbar").checked;
    settings.desktopLyricsBold = $("set-dl-bold").checked;
    // 常规
    const prevStartup = !!settings.startup;
    settings.startup = $("set-startup") ? $("set-startup").checked : settings.startup;
    settings.downloadFolder = settings.downloadFolder || "";
    // 界面模板切换（桌面版：保存后主窗口重载应用新模板）
    const nextTemplate = $("set-template") ? $("set-template").value : "classic";
    const prevTemplate = settings.template || "classic";
    settings.template = nextTemplate;
    saveSettings();
    applyAllSettings();
    // 桌面歌词：开关变化 → 打开/关闭窗口；开启中改设置 → 立即应用
    if (XFStore.isElectron && window.electronAPI.desktopLyrics) {
      if (prevDlOn !== settings.desktopLyrics) {
        window.electronAPI.desktopLyrics.toggle(settings.desktopLyrics);
      } else if (settings.desktopLyrics) {
        window.electronAPI.desktopLyrics.applySettings();
      }
    }
    // 开机自启：变化时立即写入系统登录项
    if (XFStore.isElectron && prevStartup !== settings.startup && window.electronAPI.settings && window.electronAPI.settings.setStartup) {
      window.electronAPI.settings.setStartup(settings.startup).catch(() => {});
    }
    if (XFStore.isElectron && nextTemplate !== prevTemplate) {
      showFeedback("正在切换界面模板...");
      await window.electronAPI.app.switchTemplate(nextTemplate);
      // 主窗口已重载，本页面即将销毁
      return;
    }
    showFeedback("设置已保存");
  });

  function applyAllSettings() {
    applyTheme();
    applyScanColor();
    // 歌词字号
    const root = document.documentElement.style;
    root.setProperty("--lyrics-size", settings.lyricsSize + "px");
    root.setProperty("--lyrics-size-current", (settings.lyricsSize + 8) + "px");
    // 歌词字体（留空回退默认字体栈）
    if (settings.lyricsFont) {
      root.setProperty("--lyrics-font", settings.lyricsFont + ', "Microsoft YaHei", "PingFang SC", sans-serif');
    } else {
      root.removeProperty("--lyrics-font");
    }
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
  // 自动加载经典模板设置的本地音乐文件夹（跨模板共享：队列空时自动扫描，含子目录）
  async function autoLoadMusicFolder() {
    if (!XFStore.isElectron || !window.electronAPI.fs) return;
    if (queue.length > 0) return;   // 已有队列（播放状态已恢复）不重复加载
    let folder = "";
    try { const s = await XFStore.getSettings(); folder = s.musicFolder || ""; } catch (e) {}
    if (!folder) return;
    let files = [];
    try {
      files = await window.electronAPI.fs.scanFiles(folder, [".mp3",".wav",".ogg",".flac",".aac",".m4a",".wma",".opus"], true) || [];
    } catch (e) { return; }
    if (!files.length) return;
    const loaded = [];
    for (const rel of files) {
      const fileName = rel.split("/").pop();
      const base = fileName.replace(/\.[^.]+$/, "");
      const parts = parseFileName(base);
      const song = {
        type: "local", name: parts.title || base, artist: parts.artist || "未知歌手",
        url: "file:///" + folder.replace(/\\/g, "/") + "/" + rel.split("/").map(encodeURIComponent).join("/"),
        folder, fileName, cover: "", lrc: null, source: "本地音乐",
      };
      // 尝试读同名 .lrc（主进程接口，utf8）
      if (window.electronAPI.fs.readFile) {
        const lrcPath = folder + "\\" + rel.replace(/\//g, "\\").replace(/\.[^.]+$/, "") + ".lrc";
        try {
          const t = await window.electronAPI.fs.readFile(lrcPath);
          if (t) { song.lrc = t; song._lines = XFLyrics.parseLrc(t); }
        } catch (e) {}
      }
      loaded.push(song);
    }
    queue.push(...loaded);
    renderQueue();
    if (currentIdx < 0) { currentIdx = 0; updateNowPlaying(); }
    showFeedback("已加载本地音乐 " + loaded.length + " 首");
    scheduleSaveState();
  }

  setMarquee(mainTitle, mainTitle.textContent.trim());
  setMarquee(subTitle, subTitle.textContent.trim());
  applyAllSettings();
  refreshPlaylists();
  // 恢复上次播放状态（经典模板共享 music-player-state，切换模板后无缝延续队列/进度）
  restorePlayerState();
  syncVolumeUI();   // 初始音量 UI（默认 0.8）
  autoLoadMusicFolder();  // 队列为空时自动加载主进程 musicFolder（跨模板共享）
  autoLoadImageFolder();  // 自动加载主进程 imageFolder（背景文件夹持久化，重启/切模板不丢）
  // 切模板/关闭前兜底保存最新进度（reload 前确保数据最新）
  window.addEventListener("beforeunload", () => savePlayerState());

  // 桌面版：桌面歌词（开关 / 就绪推送 / 控制栏按钮）
  if (XFStore.isElectron && window.electronAPI.desktopLyrics) {
    // 设置开启 → 打开桌面歌词窗口
    if (settings.desktopLyrics) window.electronAPI.desktopLyrics.toggle(true);
    // 窗口就绪：推送当前播放状态（新窗口收不到已发生的 trackchange）
    window.electronAPI.desktopLyrics.onReady(() => {
      if (curSong() && playing) {
        forwardDl({ type: "trackchange", track: dlTrack(curSong()) });
        forwardDl({ type: "playstate", playing: true });
        forwardDl({ type: "timeupdate", currentTime: audio.currentTime, duration: audio.duration || 0 });
      } else {
        forwardDl({ type: "trackchange", track: null });
        forwardDl({ type: "playstate", playing: false });
      }
    });
    // 桌面歌词窗口控制栏 → 主播放器
    window.electronAPI.desktopLyrics.onControl((action) => {
      if (action === "prev") btnPrev.click();
      else if (action === "play") btnPlay.click();
      else if (action === "next") btnNext.click();
    });
  }

  // 桌面版：登录状态变化实时刷新（QQ / 网易云）
  if (XFAccount.isElectron) {
    const onLoginChanged = (data) => {
      // 听歌打卡：网易云登录态同步（登录 → 播放网易云歌曲自动上报"最近听过"）
      if (data && typeof data.loggedIn === "boolean") scrobbleLoggedIn = data.loggedIn;
      updateLoginEntry();
      // 我的音乐面板开着时也刷新
      if (accountPanel.classList.contains("open")) renderAccount();
      if (data && data.loggedIn) {
        showFeedback("登录成功：" + (data.nickname || ""));
      } else if (data && data.loggedIn === false) {
        showFeedback("已退出登录");
      }
    };
    if (window.electronAPI.qqmusic && window.electronAPI.qqmusic.onLoginChanged) {
      window.electronAPI.qqmusic.onLoginChanged(onLoginChanged);
    }
    if (window.electronAPI.login && window.electronAPI.login.onLoginChanged) {
      window.electronAPI.login.onLoginChanged(onLoginChanged);
    }
    // 酷狗登录变化：只刷新 UI（不影响网易云听歌打卡状态）
    if (window.electronAPI.kugou && window.electronAPI.kugou.onLoginChanged) {
      window.electronAPI.kugou.onLoginChanged((data) => {
        updateLoginEntry();
        if (accountPanel.classList.contains("open")) renderAccount();
        if (data && data.loggedIn) {
          showFeedback("酷狗登录成功：" + (data.nickname || ""));
        } else if (data && data.loggedIn === false) {
          showFeedback("已退出酷狗");
        }
      });
    }
    // 初始网易云登录状态（听歌打卡用）
    XFAccount.neteaseStatus().then((ns) => { scrobbleLoggedIn = !!(ns && ns.loggedIn); }).catch(() => {});
  }

  // 桌面版：启动自检（登录态过期提示）
  if (XFStore.isElectron && window.electronAPI.app && window.electronAPI.app.startupCheck) {
    setTimeout(async () => {
      try {
        const r = await window.electronAPI.app.startupCheck();
        const expired = [];
        if (r && r.netease && r.netease.saved && !r.netease.valid) expired.push("网易云");
        if (r && r.qq && r.qq.saved && !r.qq.valid) expired.push("QQ音乐");
        if (expired.length) {
          showFeedback(expired.join("、") + " 登录已过期，点击菜单「我的音乐」重新登录");
        }
      } catch (e) { /* 忽略 */ }
    }, 3000);
  }

  // 桌面版：下载进度提示（主进程 music.download 落盘时）
  if (XFStore.isElectron && window.electronAPI.music.onDownloadProgress) {
    window.electronAPI.music.onDownloadProgress((info) => {
      if (info.status === "downloading") {
        searchStatus.textContent = "⬇ 正在下载: " + (info.file || "");
      } else if (info.status === "done") {
        searchStatus.textContent = "✅ 下载完成: " + (info.file || "");
        showFeedback("下载完成：" + info.file + "（" + (info.size || "") + "）");
      } else if (info.status === "error") {
        searchStatus.textContent = "下载失败: " + (info.error || "");
        showFeedback("下载失败：" + (info.error || "未知错误"));
      }
    });
  }

  // 设置面板分区导航（v3.4.0，复刻经典模板：点击滚动 + 滚动监听高亮）
  const settingsNav = $("settings-nav");
  const settingsWin = $("settings-window");
  if (settingsNav && settingsWin) {
    const navItems = Array.from(settingsNav.querySelectorAll(".settings-nav-item"));
    const setActiveNav = (id) => {
      navItems.forEach((it) => it.classList.toggle("active", it.dataset.target === id));
    };
    settingsNav.addEventListener("click", (e) => {
      const item = e.target.closest(".settings-nav-item");
      if (!item) return;
      const target = document.getElementById(item.dataset.target);
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const winRect = settingsWin.getBoundingClientRect();
      settingsWin.scrollTo({ top: settingsWin.scrollTop + (rect.top - winRect.top) - 10, behavior: "smooth" });
      setActiveNav(item.dataset.target);
    });
    let navScrollTimer = null;
    settingsWin.addEventListener("scroll", () => {
      if (navScrollTimer) return;
      navScrollTimer = setTimeout(() => {
        navScrollTimer = null;
        const winRect = settingsWin.getBoundingClientRect();
        let current = navItems.length ? navItems[0].dataset.target : "";
        for (const item of navItems) {
          const sec = document.getElementById(item.dataset.target);
          if (sec && sec.getBoundingClientRect().top - winRect.top <= 64) current = item.dataset.target;
        }
        setActiveNav(current);
      }, 80);
    }, { passive: true });
  }

  // 暴露调试接口
  window.__player = { playAt, playSong, get queue() { return queue; }, get currentIdx() { return currentIdx; }, get curSong() { return curSong(); }, get volume() { return audio.volume; }, _restore: restorePlayerState, _save: savePlayerState };
})();
