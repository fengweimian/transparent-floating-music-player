(function () {
  "use strict";

  const $ = (s) => document.querySelector(s);

  // 工具函数下沉共享层 XFUtils（两模板统一实现）
  const escapeHtml = XFUtils.escapeHtml;
  const fmt = XFUtils.fmtTime;

  const player = new MusicPlayer();
  const slideshow = new Slideshow();
  const lyrics = new Lyrics();

  // 播放模式图标（SVG，与控制栏其它图标风格统一，替代 emoji）
  const MODE_ICONS = {
    sequential: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>',
    random: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>',
    single: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zm-4-2V9h-1l-2 1v1h1.5v4H13z"/></svg>',
  };

  // 空状态插画（内联 SVG，随主题 currentColor 着色）
  const EMPTY_ICONS = {
    search: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>',
    playlist: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 6H4v2h10V6zm0 5H4v2h10v-2zm0 5H4v2h10v-2zm6-4V8l-4 3h2v6h-2l4 4 4-4h-2V9h2l-4-3z"/></svg>',
    music: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>',
    heart: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>',
  };
  // 空状态块 HTML：icon 用 EMPTY_ICONS 的 key，title/sub 为文案
  function emptyStateHTML(iconKey, title, sub) {
    return `<div class="empty-state">
      <div class="empty-icon">${EMPTY_ICONS[iconKey] || EMPTY_ICONS.music}</div>
      <div class="empty-title">${title || ""}</div>
      ${sub ? `<div class="empty-sub">${sub}</div>` : ""}
    </div>`;
  }

  let settings = {};
  let controlsVisible = false;
  let controlsTimeout = null;
  let mouseInZone = false;
  let lyricsTimer = null;
  let searchResults = [];
  let playlistVisible = false;
  let myPlaylists = [];
  let importSongs = [];
  let coverAutoHideTimer = null;
  let volumeSaveTimer = null;
  let coverSeq = 0;
  // 听歌打卡：网易云歌曲播放够久后上报（每首歌只报一次）
  let lastScrobbleId = null;
  let scrobbleLoggedIn = false;
  // M 键静音：记住静音前的音量
  let lastVolume = 0.8;

  // DOM — Controls
  const controlsEl = $("#controls");
  const progressFill = $("#progress-fill");
  const progressWrap = $("#progress-wrap");
  const timeCurrent = $("#time-current");
  const timeTotal = $("#time-total");
  const trackInfo = $("#track-info");
  const trackName = $("#track-name");
  const iconPlay = $("#icon-play");
  const iconPause = $("#icon-pause");
  const volumeSlider = $("#volume-slider");
  const btnMode = $("#btn-mode");

  // DOM — Search Panel + Tabs
  const searchPanel = $("#search-panel");
  const tabSearch = $("#tab-search");
  const tabPlaylists = $("#tab-playlists");
  const searchInput = $("#search-input");
  const searchResultsEl = $("#search-results");
  const searchStatus = $("#search-status");
  const playlistListWrap = $("#playlist-list-wrap");
  const playlistStatus = $("#playlist-status");

  // DOM — Playlist Panel (queue sidebar)
  const playlistPanel = $("#playlist-panel");
  const playlistList = $("#playlist-list");
  const playlistCount = $("#playlist-count");

  // DOM — Cover Art
  const coverArt = $("#cover-art");
  const coverImg = $("#cover-img");
  const coverName = $("#cover-name");
  const coverArtist = $("#cover-artist");

  // DOM — Import Dialog
  const importDialog = $("#import-dialog");
  const importUrlInput = $("#import-url-input");
  const importNameInput = $("#import-name-input");
  const importPreview = $("#import-preview");
  const importCount = $("#import-count");

  // DOM — New Playlist Dialog
  const newPlaylistDialog = $("#new-playlist-dialog");
  const newPlaylistName = $("#new-playlist-name");

  // DOM — Rename Dialog
  const renameDialog = $("#rename-dialog");
  const renameInput = $("#rename-input");

  // DOM — 统一登录入口（右上角，网易云 + QQ音乐两个渠道）
  const loginEntry = $("#login-entry");
  const btnLoginEntry = $("#btn-login-entry");
  const loginSummary = $("#login-summary");
  const loginAvatars = $("#login-avatars");
  const loginSummaryText = $("#login-summary-text");
  const loginMenu = $("#login-menu");
  // 网易云渠道
  const loginNeteaseState = $("#login-netease-state");
  const loginNeteaseLogin = $("#login-netease-login");
  const loginNeteaseInfo = $("#login-netease-info");
  const loginAvatar = $("#login-avatar");
  const loginNickname = $("#login-nickname");
  const loginNeteaseActions = $("#login-netease-actions");
  const menuLoginPlaylists = $("#menu-login-playlists");
  const menuLoginDaily = $("#menu-login-daily");
  const menuLoginRecord = $("#menu-login-record");
  const menuLoginLogout = $("#menu-login-logout");
  // QQ音乐渠道
  const loginQqState = $("#login-qq-state");
  const loginQqLogin = $("#login-qq-login");
  const loginQqInfo = $("#login-qq-info");
  const qqloginAvatar = $("#qqlogin-avatar");
  const qqloginNickname = $("#qqlogin-nickname");
  const loginQqActions = $("#login-qq-actions");
  const menuQqloginPlaylists = $("#menu-qqlogin-playlists");
  const menuQqloginDaily = $("#menu-qqlogin-daily");
  const menuQqloginLogout = $("#menu-qqlogin-logout");
  // 酷狗渠道（v3.4.x 新增，与新版模板共用主进程酷狗登录/歌单/每日推荐）
  const loginKugouState = $("#login-kugou-state");
  const loginKugouLogin = $("#login-kugou-login");
  const loginKugouInfo = $("#login-kugou-info");
  const kugouloginAvatar = $("#kugoulogin-avatar");
  const kugouloginNickname = $("#kugoulogin-nickname");
  const loginKugouActions = $("#login-kugou-actions");
  const menuKugouloginPlaylists = $("#menu-kugoulogin-playlists");
  const menuKugouloginDaily = $("#menu-kugoulogin-daily");
  const menuKugouloginLogout = $("#menu-kugoulogin-logout");
  const menuOpenSettings = $("#menu-open-settings");
  const neteaseDailyStatus = $("#netease-daily-status");
  const neteaseDailyList = $("#netease-daily-list");
  const neteaseRecordStatus = $("#netease-record-status");
  const neteaseRecordList = $("#netease-record-list");
  const neteasePlaylistWrap = $("#netease-playlist-wrap");
  const qqmusicPlaylistWrap = $("#qqmusic-playlist-wrap");
  const kugouPlaylistWrap = $("#kugou-playlist-wrap");
  const kugouDailyStatus = $("#kugou-daily-status");
  const kugouDailyList = $("#kugou-daily-list");
  const qqmusicDailyStatus = $("#qqmusic-daily-status");
  const qqmusicDailyList = $("#qqmusic-daily-list");
  // 登录状态缓存（合并徽标与面板展示用）
  let neteaseLoggedIn = false;
  let neteaseNickname = "";
  let neteaseAvatarUrl = "";
  let qqLoggedIn = false;
  let qqNickname = "";
  let qqAvatarUrl = "";
  // 酷狗登录状态缓存
  let kugouLoggedIn = false;
  let kugouNickname = "";
  let kugouAvatarUrl = "";

  // ========== Init ==========

  async function init() {
    settings = await window.electronAPI.settings.get();
    // 应用主题（html[data-theme] 由 style.css 定义多套强调色）
    document.documentElement.dataset.theme = settings.theme || "aurora";
    player.setVolume(settings.volume || 0.8);
    volumeSlider.value = (settings.volume || 0.8) * 100;
    if (settings.slideshowInterval) slideshow.setInterval(settings.slideshowInterval);
    applyLyricsFontSize(settings.lyricsFontSize || 22);
    applyLyricsFont(settings.lyricsFont || "");
    applyCharColor(settings.charColor || "#ff4d4f");
    lyrics.setShowTranslation(!!settings.showTranslation);

    bindControls();
    btnMode.innerHTML = MODE_ICONS[player.mode] || MODE_ICONS.sequential;
    setupMouseTracking();
    setupKeyboard();
    setupPlayerEvents();
    // 桌面歌词控制栏按钮 → 主播放器控制（上首/播放暂停/下首）
    window.electronAPI.desktopLyrics.onControl((action) => {
      if (action === "prev") player.prev();
      else if (action === "play") player.playPause();
      else if (action === "next") player.next();
    });
    setupTabs();
    setupSearchPanel();
    setupPlaylistPanel();
    setupNeteaseUserFeatures();
    setupImportDialog();
    setupNewPlaylistDialog();
    setupRenameDialog();
    setupDownloadListener();

    window.electronAPI.settings.onChanged(onSettingsChanged);

    // 网易云登录/登出 → 重新加载当前歌词（启用/停用逐字 YRC）+ 更新右上角入口
    // ⚠️ 唯一注册点（合并自 setupLoginEntry 的 toast 逻辑，避免双注册双触发）
    window.electronAPI.login.onLoginChanged(async (data) => {
      scrobbleLoggedIn = !!(data && data.loggedIn);
      if (data && data.loggedIn) {
        showToast("✓ 登录成功", `欢迎 ${data.nickname || "网易云用户"}`, "info");
      }
      updateLoginEntry(data || { loggedIn: false });
      const track = player.currentTrack;
      if (track && track.server === "netease") {
        await lyrics.loadForTrack(track);
        // 桌面歌词同步重新加载
        if (settings.desktopLyrics) {
          window.electronAPI.desktopLyrics.forward({ type: "trackchange", track });
        }
      }
    });
    // 初始登录状态（听歌打卡用；登录状态走共享层 XFAccount）
    XFAccount.neteaseStatus().then((st) => { scrobbleLoggedIn = !!(st && st.loggedIn); });

    // 右上角登录入口
    setupLoginEntry();

    // 桌面歌词窗口就绪：立即推送当前播放状态（新窗口收不到已发生的 trackchange/timeupdate）
    // ⚠️ 必须先注册再 toggle（窗口可能加载很快，就绪事件先到）
    window.electronAPI.desktopLyrics.onReady(() => {
      pushDesktopLyricsState();
    });
    // 桌面歌词：启动时同步开关状态（main 端已按设置创建窗口）
    if (settings.desktopLyrics) {
      window.electronAPI.desktopLyrics.toggle(true);
    }

    if (settings.musicFolder) {
      lyrics.setMusicFolder(settings.musicFolder);
      await player.setMusicFolder(settings.musicFolder);
    }

    if (settings.imageFolder) {
      await slideshow.setImageFolder(settings.imageFolder);
      slideshow.start();
    }

    startLyricsUpdater();

    // v3.5.2 自动续播：切换模板（reload）后若保存时在播放 → 恢复当前歌并继续
    player.resumeIfNeeded();

    // 启动自检：检测已保存的网易云/QQ 登录态是否过期（延迟 3s，不阻塞启动）
    // ⚠️ 只在「本地保存了登录态但已失效」时提示，未登录/网络错误静默跳过
    setTimeout(async () => {
      try {
        const r = await window.electronAPI.app.startupCheck();
        if (!r) return;
        const expired = [];
        if (r.netease && r.netease.saved && !r.netease.valid) expired.push("网易云");
        if (r.qq && r.qq.saved && !r.qq.valid) expired.push("QQ音乐");
        if (expired.length > 0) {
          showToast("登录状态", `${expired.join("、")} 登录已过期，点击打开设置重新登录`, "info", "settings");
        }
      } catch (e) { /* 自检失败静默 */ }
    }, 3000);
  }

  // ========== Controls ==========

  function bindControls() {
    $("#btn-play").addEventListener("click", () => player.playPause());
    $("#btn-prev").addEventListener("click", () => player.prev());
    $("#btn-next").addEventListener("click", () => player.next());
    $("#btn-settings").addEventListener("click", () => window.openSettingsPanel());
    $("#btn-close").addEventListener("click", () => window.electronAPI.window.close());
    $("#btn-min").addEventListener("click", () => window.electronAPI.window.minimize());

    btnMode.addEventListener("click", () => {
      const m = player.cycleMode();
      btnMode.innerHTML = MODE_ICONS[m] || MODE_ICONS.sequential;
    });

    volumeSlider.addEventListener("input", () => {
      player.setVolume(volumeSlider.value / 100);
      settings.volume = volumeSlider.value / 100;
      saveVolumeDebounced();
    });

    progressWrap.addEventListener("click", (e) => {
      const rect = progressWrap.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      player.seek(Math.max(0, Math.min(1, ratio)));
    });
  }

  // 防抖保存音量，重启后音量不丢失（走共享层 XFStore，与模板统一）
  function saveVolumeDebounced() {
    clearTimeout(volumeSaveTimer);
    volumeSaveTimer = setTimeout(() => {
      XFStore.saveSettings({ volume: player.getVolume() });
    }, 400);
  }

  function showControls() {
    controlsEl.classList.add("visible");
    trackInfo.classList.add("visible");
    controlsVisible = true;
    resetControlsTimeout();
  }

  function hideControls() {
    if (mouseInZone) return;
    controlsEl.classList.remove("visible");
    trackInfo.classList.remove("visible");
    controlsVisible = false;
  }

  function resetControlsTimeout() {
    if (controlsTimeout) clearTimeout(controlsTimeout);
    controlsTimeout = setTimeout(() => hideControls(), 3000);
  }

  // ========== Mouse Tracking ==========

  function setupMouseTracking() {
    document.addEventListener("mousemove", (e) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const inZone = e.clientY > window.innerHeight - 140
        || (el && (el.closest("#playlist-panel") || el.closest("#search-panel")));
      if (inZone && !mouseInZone) { mouseInZone = true; showControls(); }
      else if (!inZone && mouseInZone) { mouseInZone = false; hideControls(); }
      if (inZone) resetControlsTimeout();
    });
  }

  // ========== Keyboard Shortcuts ==========

  function setupKeyboard() {
    document.addEventListener("keydown", (e) => {
      if (importDialog.classList.contains("open") || newPlaylistDialog.classList.contains("open")) {
        if (e.code === "Escape") { closeImportDialog(); closeNewPlaylistDialog(); }
        return;
      }
      if (searchPanel.classList.contains("open")) {
        if (e.code === "Escape") { closeSearchPanel(); }
        return;
      }
      if (playlistPanel.classList.contains("open")) {
        if (e.code === "Escape") { closePlaylistPanel(); }
        return;
      }

      switch (e.code) {
        case "Space": e.preventDefault(); player.playPause(); showControls(); break;
        case "ArrowLeft": e.preventDefault(); player.prev(); showControls(); break;
        case "ArrowRight": e.preventDefault(); player.next(); showControls(); break;
        case "ArrowUp":
          e.preventDefault();
          player.setVolume(Math.min(1, player.getVolume() + 0.05));
          volumeSlider.value = player.getVolume() * 100;
          saveVolumeDebounced();
          showControls();
          break;
        case "ArrowDown":
          e.preventDefault();
          player.setVolume(Math.max(0, player.getVolume() - 0.05));
          volumeSlider.value = player.getVolume() * 100;
          saveVolumeDebounced();
          showControls();
          break;
        case "KeyF": if (e.ctrlKey) { e.preventDefault(); toggleSearchPanel(); } break;
        case "KeyP": if (e.ctrlKey) { e.preventDefault(); togglePlaylistPanel(); } break;
        case "KeyS": if (e.ctrlKey) { e.preventDefault(); window.openSettingsPanel(); } break;
        // M：静音/恢复（记住静音前的音量）
        case "KeyM": {
          e.preventDefault();
          if (player.getVolume() > 0) {
            lastVolume = player.getVolume();
            player.setVolume(0);
            volumeSlider.value = 0;
            showToast("静音", "音量已静音（按 M 恢复）", "info");
          } else {
            player.setVolume(lastVolume || 0.8);
            volumeSlider.value = player.getVolume() * 100;
            showToast("恢复音量", `音量 ${Math.round(player.getVolume() * 100)}%`, "info");
          }
          saveVolumeDebounced();
          showControls();
          break;
        }
      }
    });
  }

  // ========== Tabs ==========

  function setupTabs() {
    document.querySelectorAll(".panel-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".panel-tab").forEach((t) => t.classList.remove("active"));
        document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
        tab.classList.add("active");
        const target = tab.dataset.tab;
        if (target === "search") {
          document.getElementById("tab-search").classList.add("active");
        } else if (target === "playlists") {
          document.getElementById("tab-playlists").classList.add("active");
          loadPlaylists();
          // 已登录网易云 → 自动加载网易云歌单（"我的歌单"子标签默认激活）
          switchNeteaseSubtab("my");
        }
      });
    });
  }

  // ========== Search Panel ==========

  function setupSearchPanel() {
    // 渠道下拉框由共享模块渲染（网易云/QQ/酷狗/歌曲宝）
    if (window.XFSearch) XFSearch.populateSelect(document.getElementById("search-source"), "netease");
    $("#btn-search-toggle").addEventListener("click", () => toggleSearchPanel());

    $("#btn-search").addEventListener("click", () => performSearch());
    searchInput.addEventListener("keydown", (e) => { if (e.code === "Enter") performSearch(); });

    const closeBtn = document.createElement("button");
    closeBtn.className = "btn-search-close"; closeBtn.textContent = "✕";
    closeBtn.addEventListener("click", () => closeSearchPanel());
    searchPanel.appendChild(closeBtn);
  }

  function toggleSearchPanel() {
    if (searchPanel.classList.contains("open")) { closeSearchPanel(); } else { openSearchPanel(); }
  }

  function openSearchPanel() {
    searchPanel.classList.add("open");
    document.querySelector(".panel-tab[data-tab=\"search\"]").click();
    searchInput.focus();
    searchInput.select();
    // 首次打开且还没搜过 → 展示引导空状态
    if (searchResults.length === 0 && !searchStatus.textContent) {
      searchResultsEl.innerHTML = emptyStateHTML("search", "搜索在线歌曲", "支持网易云 / QQ音乐 / 酷狗 / 歌曲宝\n输入关键词后回车即可搜索");
    }
  }

  function closeSearchPanel() { searchPanel.classList.remove("open"); }

  async function performSearch() {
    const keyword = searchInput.value.trim();
    if (!keyword) return;
    const source = document.getElementById("search-source").value;
    searchStatus.textContent = "搜索中...";
    searchResultsEl.innerHTML = "";
    try {
      // 搜索渠道走共享层 XFApi（与新版模板同一套逻辑：网易云/QQ/酷狗/歌曲宝 + 统一数据结构 + 浏览器 fallback）
      const raw = await XFApi.search(keyword, source);
      searchResults = Array.isArray(raw) ? raw : [];
      if (searchResults.length === 0) {
        searchResultsEl.innerHTML = emptyStateHTML("search", `未找到与「${escapeHtml(keyword)}」相关的歌曲`, "换个关键词，或切换到其他音乐渠道试试");
        searchStatus.textContent = "未找到结果";
        return;
      }
      renderSearchResults();
      searchStatus.textContent = `找到 ${searchResults.length} 首歌曲`;
    } catch (e) {
      searchResultsEl.innerHTML = emptyStateHTML("music", "搜索失败", escapeHtml(e.message));
      searchStatus.textContent = "搜索失败";
    }
  }

  function renderSearchResults() {
    searchResultsEl.innerHTML = searchResults.map((song, i) => {
      const name = escapeHtml(song.name || "");
      const artist = escapeHtml(Array.isArray(song.artist) ? song.artist.join(", ") : (song.artist || ""));
      return `
        <div class="search-result-item">
          <span class="search-result-index">${i + 1}</span>
          <div class="search-result-info">
            <div class="search-result-name">${name}</div>
            <div class="search-result-artist">${artist}</div>
          </div>
          <div class="search-result-actions">
            <button class="btn-play-now" data-idx="${i}">播放</button>
            <button class="btn-play-next" data-idx="${i}">下一曲</button>
            <button class="btn-add-queue" data-idx="${i}">加入队列</button>
            <button class="btn-download" data-idx="${i}">下载</button>
            <button class="btn-add-to-playlist" data-idx="${i}">加到歌单 ▾</button>
          </div>
        </div>`;
    }).join("");

    // 事件委托：容器只绑定一次，500 首大列表也不卡（旧实现每行绑 6 个监听器）
    if (!searchResultsEl.dataset.delegated) {
      searchResultsEl.dataset.delegated = "1";
      searchResultsEl.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-idx]");
        if (!btn) return;
        e.stopPropagation();
        const idx = parseInt(btn.dataset.idx, 10);
        if (btn.classList.contains("btn-play-now")) playSearchResult(idx);
        else if (btn.classList.contains("btn-play-next")) playNextSearchResult(idx);
        else if (btn.classList.contains("btn-add-queue")) addToQueue(idx);
        else if (btn.classList.contains("btn-download")) downloadSong(idx);
        else if (btn.classList.contains("btn-add-to-playlist")) showAddToPlaylistMenu(btn, idx);
      });
      searchResultsEl.addEventListener("dblclick", (e) => {
        const item = e.target.closest(".search-result-item");
        if (!item || e.target.closest("button")) return; // 按钮双击不触发行双击
        const idx = Array.prototype.indexOf.call(searchResultsEl.children, item);
        playSearchResult(idx);
      });
    }
  }

  function playSearchResult(idx) {
    if (idx < 0 || idx >= searchResults.length) return;
    const song = searchResults[idx];
    player.addOnlineSongs([song], song.server || "netease");
    // 去重后目标歌可能不在队列尾部，按 id 定位
    const targetIdx = findOnlineTrackIndex(song);
    player.playOnlineTrack(targetIdx >= 0 ? targetIdx : player.playlist.length - 1);
    closeSearchPanel();
  }

  // 在播放队列中按歌曲 id 定位在线歌曲索引
  function findOnlineTrackIndex(song) {
    const pl = player.getPlaylist();
    const sid = String(song.id || song.url_id || "");
    return pl.findIndex((t) => t.type === "online" && String(t.id) === sid);
  }

  function addToQueue(idx) {
    if (idx < 0 || idx >= searchResults.length) return;
    const song = searchResults[idx];
    const count = player.addOnlineSongs([song], song.server || "netease");
    searchStatus.textContent = count > 0 ? `已添加: ${song.name}` : "歌曲已在队列中";
    setTimeout(() => {
      if (searchResults.length > 0) {
        searchStatus.textContent = `找到 ${searchResults.length} 首歌曲`;
      }
    }, 2000);
  }

  // "下一曲播放"：插入到当前播放之后
  function playNextSearchResult(idx) {
    if (idx < 0 || idx >= searchResults.length) return;
    const song = searchResults[idx];
    const count = player.insertNext([song], song.server || "netease");
    searchStatus.textContent = count > 0 ? `已设为下一曲: ${song.name}` : "歌曲已在队列中";
    setTimeout(() => {
      if (searchResults.length > 0) {
        searchStatus.textContent = `找到 ${searchResults.length} 首歌曲`;
      }
    }, 2000);
  }

  function setupDownloadListener() {
    window.electronAPI.music.onDownloadProgress((info) => {
      if (info.status === "downloading") {
        searchStatus.textContent = `⬇ 正在下载: ${info.file} ...`;
        showToast("正在下载", info.file, "info");
      } else if (info.status === "done") {
        searchStatus.textContent = `✅ 下载完成! ${info.file} (${info.size})`;
        showToast(
          `✅ 下载完成 (${info.size})`,
          `${info.file}.mp3\n${info.path || ""}`,
          "success",
          info.path
        );
      } else if (info.status === "error") {
        searchStatus.textContent = `下载失败: ${info.error}`;
        showToast("❌ 下载失败", info.error || "未知错误", "error");
      }
    });
  }

  // ===== 全局 Toast（右上角） =====
  function showToast(title, message, type = "info", clickPath = "") {
    const container = document.getElementById("global-toast");
    if (!container) return;

    const item = document.createElement("div");
    item.className = `toast-item toast-${type}`;
    item.innerHTML = `<span class="toast-title">${escapeHtml(title)}</span>${
      message ? `<span class="toast-sub">${escapeHtml(message)}</span>` : ""
    }`;

    if (clickPath) {
      item.classList.add("toast-clickable");
      if (clickPath === "settings") {
        item.title = "点击打开设置";
        item.addEventListener("click", () => {
          window.openSettingsPanel();
          removeToast(item);
        });
      } else {
        item.title = "点击在文件夹中显示";
        item.addEventListener("click", () => {
          window.electronAPI.shell.showItemInFolder(clickPath);
          removeToast(item);
        });
      }
    } else {
      // 无点击行为时自动消失
      setTimeout(() => removeToast(item), 4000);
    }
    container.appendChild(item);

    // 同一时间只保留最近 3 条
    while (container.children.length > 3) {
      removeToast(container.firstElementChild);
    }
  }

  function removeToast(item) {
    if (!item) return;
    item.classList.add("toast-out");
    setTimeout(() => {
      if (item.parentNode) item.parentNode.removeChild(item);
    }, 300);
  }

  function downloadSong(idx) {
    if (idx < 0 || idx >= searchResults.length) return;
    const song = searchResults[idx];
    downloadTrack(song.id, song.server || "netease", song.name, song.artist);
  }

  async function downloadTrack(id, server, name, artist) {
    searchStatus.textContent = `⬇ 开始下载: ${artist ? artist + " - " : ""}${name}`;
    const result = await XFApi.download(id, server, name, artist);
    if (result && !result.success) {
      searchStatus.textContent = `下载失败: ${result.error}`;
      showToast("❌ 下载失败", result.error || "未知错误", "error");
    }
  }

  async function showAddToPlaylistMenu(btn, songIdx) {
    let menu = document.getElementById("playlist-dropdown-menu");
    if (menu) { menu.remove(); return; }

    const song = searchResults[songIdx];
    if (!song) return;

    const rect = btn.getBoundingClientRect();
    menu = document.createElement("div");
    menu.id = "playlist-dropdown-menu";
    menu.className = "dropdown-menu";
    menu.style.top = (rect.bottom + 4) + "px";
    menu.style.left = (rect.left) + "px";

    const pls = myPlaylists.filter((pl) => pl.source !== "local");
    // 主进程 playlists 数组不含"本地音乐"，local 存在时真实下标需 +1
    const offset = getPlaylistOffset();
    if (pls.length === 0) {
      menu.innerHTML = '<div class="dropdown-item empty">暂无歌单，请先创建或导入</div>';
    } else {
      menu.innerHTML = pls.map((pl, pi) => {
        const realIdx = pi + offset;
        return `<div class="dropdown-item" data-pi="${realIdx}">${escapeHtml(pl.name)} (${pl.songs ? pl.songs.length : 0}首)</div>`;
      }).join("");
      menu.querySelectorAll(".dropdown-item").forEach((item) => {
        item.addEventListener("click", async (e) => {
          e.stopPropagation();
          const pi = parseInt(item.dataset.pi);
          await XFStore.addSongsToPlaylist(pi, [song]);
          menu.remove();
          searchStatus.textContent = `已添加 "${song.name}" 到歌单`;
          loadPlaylists();
          setTimeout(() => {
            searchStatus.textContent = `找到 ${searchResults.length} 首歌曲`;
          }, 2000);
        });
      });
    }
    document.body.appendChild(menu);
    menu.addEventListener("click", (e) => { e.stopPropagation(); });
    document.addEventListener("click", function close() { menu.remove(); document.removeEventListener("click", close); }, { once: true });
  }

  // ========== My Playlists ==========

  async function loadPlaylists() {
    myPlaylists = await XFStore.getPlaylists();
    renderMyPlaylists();
  }

  function renderMyPlaylists() {
    if (myPlaylists.length === 0) {
      playlistListWrap.innerHTML = '<div class="playlist-empty">还没有歌单<br>点击 "+ 导入歌单" 或 "+ 新建歌单"</div>';
      playlistStatus.textContent = "";
      return;
    }
    playlistListWrap.innerHTML = myPlaylists.map((pl, i) => {
      const count = pl.songs ? pl.songs.length : 0;
      const badgeClass = pl.source === "local" ? "local" : (pl.source === "import" ? "import" : "");
      const badgeText = pl.source === "local" ? "本地" : (pl.source === "import" ? "导入" : "自定义");
      const isLocal = pl.source === "local";
      const expandedClass = pl._expanded ? " expanded" : "";
      return `
        <div class="playlist-card${expandedClass}" data-idx="${i}">
          <div class="playlist-card-header">
            <div class="playlist-card-info">
              <div class="playlist-card-name">${escapeHtml(pl.name)}</div>
              <div class="playlist-card-meta">${count} 首歌曲</div>
            </div>
            <span class="playlist-card-badge ${badgeClass}">${badgeText}</span>
            <div class="playlist-card-actions">
              <button class="btn-load" data-idx="${i}">加载</button>
              ${isLocal ? "" : `<button class="btn-rename" data-idx="${i}" title="重命名"><svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></button>`}
              ${isLocal ? "" : `<button class="btn-delete" data-idx="${i}" title="删除歌单">✕</button>`}
            </div>
          </div>
          <div class="playlist-card-songs">
            ${(pl.songs || []).length === 0
              ? '<div class="playlist-card-empty">暂无歌曲</div>'
              : (pl.songs || []).map((s, si) => `
                <div class="pl-song-item">
                  <span class="pl-song-name">${escapeHtml(s.name || "")}</span>
                  <span class="pl-song-artist">${escapeHtml(s.artist || "")}</span>
                  ${isLocal ? "" : `<button class="pl-song-next" data-pi="${i}" data-si="${si}" title="下一曲播放"><svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg></button>`}
                  <button class="pl-song-remove" data-pi="${i}" data-si="${si}" title="移除">✕</button>
                </div>
              `).join("")
            }
          </div>
        </div>`;
    }).join("");

    // playlist card header click → toggle expand
    playlistListWrap.querySelectorAll(".playlist-card-header").forEach((header) => {
      header.addEventListener("click", () => {
        const card = header.parentElement;
        const idx = parseInt(card.dataset.idx);
        myPlaylists[idx]._expanded = !myPlaylists[idx]._expanded;
        renderMyPlaylists();
      });
    });

    // load button
    playlistListWrap.querySelectorAll(".btn-load").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        loadPlaylistToQueue(parseInt(btn.dataset.idx));
      });
    });

    // rename playlist button
    playlistListWrap.querySelectorAll(".btn-rename").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        openRenameDialog(parseInt(btn.dataset.idx));
      });
    });

    // delete playlist button
    playlistListWrap.querySelectorAll(".btn-delete").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const renderedIdx = parseInt(btn.dataset.idx);
        await XFStore.removePlaylist(renderedIdx - getPlaylistOffset());
        await loadPlaylists();
      });
    });

    // 歌单歌曲：下一曲播放
    playlistListWrap.querySelectorAll(".pl-song-next").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const pi = parseInt(btn.dataset.pi);
        const si = parseInt(btn.dataset.si);
        const pl = myPlaylists[pi];
        const song = pl && pl.songs[si];
        if (!song) return;
        const server = song.server || (pl.songs[0] && pl.songs[0].server) || "netease";
        player.insertNext([song], server);
        playlistStatus.textContent = `已设为下一曲: ${song.name}`;
      });
    });

    // remove song from playlist
    playlistListWrap.querySelectorAll(".pl-song-remove").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const pi = parseInt(btn.dataset.pi);
        const si = parseInt(btn.dataset.si);
        await XFStore.removeSong(pi - getPlaylistOffset(), si);
        await loadPlaylists();
      });
    });

    playlistStatus.textContent = `共 ${myPlaylists.length} 个歌单`;
  }

  // 歌单列表首项为"本地音乐"时，真实歌单下标需要 +1 偏移
  function getPlaylistOffset() {
    return (myPlaylists[0] && myPlaylists[0].source === "local") ? 1 : 0;
  }

  function loadPlaylistToQueue(idx) {
    if (idx < 0 || idx >= myPlaylists.length) return;
    const pl = myPlaylists[idx];
    if (!pl.songs || pl.songs.length === 0) {
      playlistStatus.textContent = "歌单为空";
      return;
    }
    // "本地音乐"歌单：直接在队列中找到本地歌曲播放（本地曲目由 setMusicFolder 已载入）
    if (pl.source === "local") {
      const lp = player.getPlaylist();
      const localIdx = lp.findIndex((t) => t.type === "local");
      if (localIdx >= 0) {
        player.playOnlineTrack(localIdx);
        playlistStatus.textContent = `已切换到本地音乐`;
      } else {
        playlistStatus.textContent = "尚未加载音乐文件夹";
      }
      return;
    }
    const server = pl.songs[0].server || "netease";
    const count = player.addOnlineSongs(pl.songs, server);
    // 歌单歌曲可能部分已存在（去重），按歌单第一首定位播放位置
    const first = pl.songs[0];
    let targetIdx = findOnlineTrackIndex(first);
    if (targetIdx < 0) targetIdx = player.playlist.length - 1;
    player.playOnlineTrack(targetIdx);
    playlistStatus.textContent = `已加载 "${pl.name}" (${count} 首) 到播放队列`;
  }

  // ========== Import Playlist ==========

  function setupImportDialog() {
    $("#btn-import-playlist").addEventListener("click", () => openImportDialog());
    importDialog.querySelector(".btn-dialog-close").addEventListener("click", () => closeImportDialog());
    $("#btn-import-cancel").addEventListener("click", () => closeImportDialog());
    $("#btn-import-confirm").addEventListener("click", () => confirmImport());

    importUrlInput.addEventListener("keydown", (e) => { if (e.code === "Enter") fetchPlaylistPreview(); });
    importUrlInput.addEventListener("input", () => {
      if (importUrlInput.value.trim()) fetchPlaylistPreview();
    });
    importUrlInput.addEventListener("paste", () => {
      setTimeout(() => { if (importUrlInput.value.trim()) fetchPlaylistPreview(); }, 100);
    });
    importNameInput.addEventListener("keydown", (e) => {
      if (e.code === "Enter" && importSongs.length > 0) confirmImport();
    });

    importDialog.addEventListener("click", (e) => { if (e.target === importDialog) closeImportDialog(); });
  }

  function openImportDialog() {
    importUrlInput.value = "";
    importNameInput.value = "";
    importNameInput.style.display = "none";
    importPreview.innerHTML = "";
    importCount.textContent = "";
    importSongs = [];
    $("#btn-import-confirm").disabled = true;
    importDialog.classList.add("open");
    importUrlInput.focus();
  }

  function closeImportDialog() { importDialog.classList.remove("open"); }

  async function fetchPlaylistPreview() {
    const url = importUrlInput.value.trim();
    if (!url) return;
    importCount.textContent = "解析中...";
    importPreview.innerHTML = "";
    importSongs = [];
    $("#btn-import-confirm").disabled = true;
    try {
      const result = await XFApi.importPlaylist(url);
      if (!result || !result.songs || result.songs.length === 0) {
        importCount.textContent = "无法识别歌单链接";
        return;
      }
      importSongs = result.songs;
      importCount.textContent = `识别到 ${importSongs.length} 首歌曲`;
      importPreview.innerHTML = importSongs.slice(0, 20).map((s) =>
        `<div class="import-preview-item">${escapeHtml(s.name)} - ${escapeHtml(s.artist)}</div>`
      ).join("") + (importSongs.length > 20 ? `<div class="import-preview-item">... 还有 ${importSongs.length - 20} 首</div>` : "");
      importNameInput.style.display = "";
      // 优先使用平台返回的歌单名，用户可自由修改
      importNameInput.value = result.name || "导入的歌单";
      importNameInput.focus();
      importNameInput.select();
      $("#btn-import-confirm").disabled = false;
    } catch (e) {
      importCount.textContent = "解析失败: " + (e.message || "网络错误");
    }
  }

  async function confirmImport() {
    if (importSongs.length === 0) return;
    const name = importNameInput.value.trim() || "导入的歌单";
    await XFStore.saveImport(name, importSongs, importUrlInput.value.trim());
    closeImportDialog();
    await loadPlaylists();
    playlistStatus.textContent = `已保存 "${name}" (${importSongs.length} 首)`;
  }

  // ========== New Playlist ==========

  function setupNewPlaylistDialog() {
    $("#btn-new-playlist").addEventListener("click", () => openNewPlaylistDialog());
    newPlaylistDialog.querySelector(".btn-dialog-close").addEventListener("click", () => closeNewPlaylistDialog());
    $("#btn-new-cancel").addEventListener("click", () => closeNewPlaylistDialog());
    $("#btn-new-confirm").addEventListener("click", () => confirmNewPlaylist());

    newPlaylistName.addEventListener("input", () => {
      $("#btn-new-confirm").disabled = !newPlaylistName.value.trim();
    });
    newPlaylistName.addEventListener("keydown", (e) => {
      if (e.code === "Enter" && newPlaylistName.value.trim()) confirmNewPlaylist();
    });

    newPlaylistDialog.addEventListener("click", (e) => { if (e.target === newPlaylistDialog) closeNewPlaylistDialog(); });
  }

  function openNewPlaylistDialog() {
    newPlaylistName.value = "";
    $("#btn-new-confirm").disabled = true;
    newPlaylistDialog.classList.add("open");
    newPlaylistName.focus();
  }

  function closeNewPlaylistDialog() { newPlaylistDialog.classList.remove("open"); }

  async function confirmNewPlaylist() {
    const name = newPlaylistName.value.trim();
    if (!name) return;
    await XFStore.addPlaylist(name, []);
    closeNewPlaylistDialog();
    await loadPlaylists();
    playlistStatus.textContent = `已创建 "${name}"`;
  }

  // ========== Rename Playlist ==========

  let renameTargetIdx = -1;

  function setupRenameDialog() {
    renameDialog.querySelector(".btn-dialog-close").addEventListener("click", () => closeRenameDialog());
    $("#btn-rename-cancel").addEventListener("click", () => closeRenameDialog());
    $("#btn-rename-confirm").addEventListener("click", () => confirmRename());
    renameInput.addEventListener("input", () => {
      $("#btn-rename-confirm").disabled = !renameInput.value.trim();
    });
    renameInput.addEventListener("keydown", (e) => {
      if (e.code === "Enter" && renameInput.value.trim()) confirmRename();
    });
    renameDialog.addEventListener("click", (e) => { if (e.target === renameDialog) closeRenameDialog(); });
  }

  function openRenameDialog(renderedIdx) {
    const pl = myPlaylists[renderedIdx];
    if (!pl) return;
    renameTargetIdx = renderedIdx - getPlaylistOffset();
    renameInput.value = pl.name || "";
    $("#btn-rename-confirm").disabled = !renameInput.value.trim();
    renameDialog.classList.add("open");
    renameInput.focus();
    renameInput.select();
  }

  function closeRenameDialog() { renameDialog.classList.remove("open"); }

  async function confirmRename() {
    const name = renameInput.value.trim();
    if (!name || renameTargetIdx < 0) return;
    const ok = await XFStore.renamePlaylist(renameTargetIdx, name);
    closeRenameDialog();
    await loadPlaylists();
    playlistStatus.textContent = ok ? `已重命名为 "${name}"` : "重命名失败";
  }

  // ========== Playlist Panel (Queue Sidebar) ==========

  function setupPlaylistPanel() {
    $("#btn-playlist-toggle").addEventListener("click", () => togglePlaylistPanel());
    $("#btn-playlist-close").addEventListener("click", () => closePlaylistPanel());
    $("#btn-playlist-clear").addEventListener("click", () => { player.clearOnlineSongs(); renderPlaylist(); });
    player.on("trackchange", () => renderPlaylist());
    player.on("play", () => renderPlaylist());
  }

  function togglePlaylistPanel() {
    if (playlistPanel.classList.contains("open")) { closePlaylistPanel(); } else { openPlaylistPanel(); }
  }

  function openPlaylistPanel() { playlistPanel.classList.add("open"); playlistVisible = true; renderPlaylist(); }
  function closePlaylistPanel() { playlistPanel.classList.remove("open"); playlistVisible = false; }

  function renderPlaylist() {
    const pl = player.getPlaylist();
    const currentIdx = player.currentIndex;
    playlistCount.textContent = pl.length + " 首";
    if (pl.length === 0) {
      playlistList.innerHTML = emptyStateHTML("playlist", "播放列表为空", "搜索并添加歌曲，或加载一个歌单开始播放");
      return;
    }
    playlistList.innerHTML = pl.map((track, i) => {
      const isCurrent = i === currentIdx;
      const cls = "playlist-item" + (isCurrent ? " current" : "");
      let name = track.name || "";
      let artist = track.artist || "";
      if (track.type === "local") { name = name.replace(/\.[^.]+$/, ""); artist = "本地"; }
      return `
        <div class="${cls}" data-idx="${i}">
          <span class="playlist-item-index">${isCurrent ? "▶" : (i + 1)}</span>
          <div class="playlist-item-info">
            <div class="playlist-item-name">${escapeHtml(name)}</div>
            <div class="playlist-item-artist">${escapeHtml(artist)}</div>
          </div>
          <span class="playlist-item-badge">${track.type === "local" ? "本地" : "在线"}</span>
          <button class="playlist-item-next" data-idx="${i}" title="下一曲播放"><svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg></button>
          ${track.type === "online" ? `<button class="playlist-item-download" data-idx="${i}" title="下载">⬇</button>` : ""}
          <button class="playlist-item-remove" data-idx="${i}" title="移除">✕</button>
        </div>`;
    }).join("");

    playlistList.querySelectorAll(".playlist-item").forEach((item) => {
      item.addEventListener("click", (e) => {
        if (e.target.classList.contains("playlist-item-remove")) return;
        if (e.target.classList.contains("playlist-item-download")) return;
        const idx = parseInt(item.dataset.idx);
        if (idx === currentIdx) return;
        player._loadAndPlay(idx);
      });
    });

    playlistList.querySelectorAll(".playlist-item-next").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.idx);
        const moved = player.moveToNext(idx);
        renderPlaylist();
        if (moved) {
          const track = player.getPlaylist()[player.currentIndex + 1];
          showToast("⏭ 已设为下一曲", track ? track.name : "", "info");
        }
      });
    });

    playlistList.querySelectorAll(".playlist-item-download").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.idx);
        const track = player.getPlaylist()[idx];
        if (track && track.type === "online") {
          downloadTrack(track.id, track.server, track.name, track.artist);
        }
      });
    });

    playlistList.querySelectorAll(".playlist-item-remove").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        player.removeTrack(parseInt(btn.dataset.idx));
        renderPlaylist();
      });
    });
  }

  // ========== Player Events ==========

  // 桌面歌词窗口就绪 → 推送当前播放状态（新窗口收不到已发生的 trackchange/timeupdate）
  function pushDesktopLyricsState() {
    // ⚠️ 只在真正播放中才推歌：否则会推送从 localStorage 恢复的"上次播放的歌"，
    //    导致没在播放时桌面歌词也显示旧歌词。没播放 → 推 null 清空桌面歌词。
    if (player.isPlaying && player.currentTrack) {
      const t = player.currentTrack;
      window.electronAPI.desktopLyrics.forward({ type: "trackchange", track: t });
      window.electronAPI.desktopLyrics.forward({ type: "playstate", playing: true });
      window.electronAPI.desktopLyrics.forward({
        type: "timeupdate",
        currentTime: player.getCurrentTime(),
        duration: player.getDuration(),
      });
    } else {
      window.electronAPI.desktopLyrics.forward({ type: "trackchange", track: null });
      window.electronAPI.desktopLyrics.forward({ type: "playstate", playing: false });
    }
  }

  function setupPlayerEvents() {
    player.on("play", () => {
      iconPlay.style.display = "none"; iconPause.style.display = "";
      if (settings.desktopLyrics) window.electronAPI.desktopLyrics.forward({ type: "playstate", playing: true });
    });
    player.on("pause", () => {
      iconPlay.style.display = ""; iconPause.style.display = "none";
      if (settings.desktopLyrics) window.electronAPI.desktopLyrics.forward({ type: "playstate", playing: false });
    });
    player.on("timeupdate", ({ currentTime, duration }) => {
      if (duration > 0) {
        progressFill.style.setProperty("--progress", (currentTime / duration * 100) + "%");
        timeCurrent.textContent = fmt(currentTime);
        timeTotal.textContent = fmt(duration);
        // 听歌打卡：网易云歌曲播放够久 → 上报到网易云"最近听过"
        // 阈值 = min(60s, 时长一半)（网易云规则：播放超过 1 分钟或一半才算一次听歌）
        const t = player.currentTrack;
        if (t && t.server === "netease" && scrobbleLoggedIn && lastScrobbleId !== String(t.id)) {
          const threshold = Math.min(60, duration / 2);
          if (currentTime >= threshold) {
            lastScrobbleId = String(t.id);
            window.electronAPI.netease.scrobble(t.id, Math.floor(currentTime)).catch(() => {});
          }
        }
      }
      // 转发给桌面歌词窗口（仅在开启时）
      if (settings.desktopLyrics) {
        window.electronAPI.desktopLyrics.forward({ type: "timeupdate", currentTime, duration });
      }
    });
    player.on("trackchange", async (track) => {
      const seq = ++coverSeq; // 封面竞态防护：只应用最后一次切歌的封面

      // 转发给桌面歌词窗口（track 可能为 null = 队列清空）
      if (settings.desktopLyrics) {
        window.electronAPI.desktopLyrics.forward({ type: "trackchange", track });
      }

      // 队列清空/移除到空：track 为 null → 清空歌词、歌名、封面后返回
      if (!track) {
        await lyrics.clear();
        trackName.textContent = "";
        trackInfo.classList.remove("visible");
        coverImg.src = "";
        coverImg.onerror = null;
        coverName.textContent = "";
        coverArtist.textContent = "";
        hideCover();
        return;
      }

      let displayName = "";
      if (track.type === "online") {
        displayName = (track.artist ? track.artist + " - " : "") + track.name;
      } else {
        displayName = track.name || "";
      }
      trackName.textContent = displayName || "";
      trackInfo.classList.add("visible");
      await lyrics.loadForTrack(track);

      // 防御：切歌前清理封面文字残影，避免上一首的 name/artist 文字残留
      coverName.textContent = "";
      coverArtist.textContent = "";
      coverImg.src = ""; // 立刻置空，避免显示上一首的图
      coverImg.onerror = null;

      // cover art
      if (track.type === "online") {
        if (track.pic) {
          // ① 搜索时已带封面 URL（网易云通过 /api/song/detail 拿到的真封面）→ 直接用
          if (seq !== coverSeq) return;
          coverImg.onerror = () => { if (seq === coverSeq) hideCover(); };
          coverImg.src = track.pic;
          coverName.textContent = track.name || "";
          coverArtist.textContent = track.artist || "";
          showCover();
        } else {
          // ② 搜索未带封面 → 调 music.pic（QQ 走 picId 构造，歌曲宝从详情页取 mp3_cover）
          const picResult = await window.electronAPI.music.pic(track.id, track.server, track.picId);
          if (seq !== coverSeq) return; // 已被更新的切歌取代
          if (picResult && picResult.pic) {
            coverImg.onerror = () => { if (seq === coverSeq) hideCover(); };
            coverImg.src = picResult.pic;
            coverName.textContent = track.name || "";
            coverArtist.textContent = track.artist || "";
            showCover();
          } else {
            hideCover();
          }
        }
      } else if (track.type === "local" && settings.musicFolder) {
        const coverPath = await window.electronAPI.fs.findCover(settings.musicFolder, track.name);
        if (seq !== coverSeq) return;
        if (coverPath) {
          coverImg.onerror = () => { if (seq === coverSeq) hideCover(); };
          coverImg.src = "file:///" + coverPath.replace(/\\/g, "/");
          coverName.textContent = (track.name || "").replace(/\.[^.]+$/, "");
          coverArtist.textContent = "";
          showCover();
        } else {
          hideCover();
        }
      } else {
        hideCover();
      }
    });
    player.on("error", ({ message }) => {
      searchStatus.textContent = message || "播放出错";
      showToast("❌ 播放出错", message || "未知错误", "error");
    });
  }

  function showCover() {
    coverArt.style.transition = "none";
    coverArt.classList.add("visible");
    coverArt.offsetHeight;
    coverArt.style.transition = "opacity 1.5s ease-out";
    if (coverAutoHideTimer) clearTimeout(coverAutoHideTimer);
    coverAutoHideTimer = setTimeout(() => {
      coverArt.classList.remove("visible");
    }, 3000);
  }

  function hideCover() {
    if (coverAutoHideTimer) clearTimeout(coverAutoHideTimer);
    coverArt.classList.remove("visible");
  }

  // ========== 统一登录入口（右上角：网易云 + QQ音乐一个面板） ==========

  function setLoginMenuVisible(visible) {
    loginMenu.style.display = visible ? "block" : "none";
    if (visible) loginMenu.classList.add("show");
    const anyLoggedIn = neteaseLoggedIn || qqLoggedIn || kugouLoggedIn;
    btnLoginEntry.classList.toggle("active", visible && !anyLoggedIn);
    loginSummary.classList.toggle("active", visible && anyLoggedIn);
  }
  function isLoginMenuVisible() {
    return loginMenu.style.display !== "none";
  }

  // 合并徽标：顶部按钮区根据登录态展示（未登录=登录按钮；任一登录=头像叠加+昵称）
  function rebuildLoginSummary() {
    const anyLoggedIn = neteaseLoggedIn || qqLoggedIn || kugouLoggedIn;
    if (anyLoggedIn) {
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
      if (neteaseLoggedIn) addAvatar(neteaseAvatarUrl, "netease");
      if (qqLoggedIn) addAvatar(qqAvatarUrl, "qq");
      if (kugouLoggedIn) addAvatar(kugouAvatarUrl, "kugou");
      const names = [];
      if (neteaseLoggedIn) names.push(neteaseNickname || "网易云");
      if (qqLoggedIn) names.push(qqNickname || "QQ");
      if (kugouLoggedIn) names.push(kugouNickname || "酷狗");
      loginSummaryText.textContent = names.join(" · ") || "已登录";
    } else {
      loginSummary.style.display = "none";
      btnLoginEntry.style.display = "flex";
    }
  }

  function setupLoginEntry() {
    // 初始状态（登录状态走共享层 XFAccount，与新版模板同一份数据源）
    XFAccount.neteaseStatus().then((st) => updateLoginEntry(st));
    XFAccount.qqStatus().then((st) => updateQqloginEntry(st));
    if (XFAccount.kugouStatus) XFAccount.kugouStatus().then((st) => updateKugouloginEntry(st));

    // 顶部按钮/徽标点击 → 开关面板
    btnLoginEntry.addEventListener("click", (e) => {
      e.stopPropagation();
      setLoginMenuVisible(!isLoginMenuVisible());
    });
    loginSummary.addEventListener("click", (e) => {
      e.stopPropagation();
      setLoginMenuVisible(!isLoginMenuVisible());
    });

    // 点击面板外部 / 窗口失焦 → 关闭面板
    document.addEventListener("click", (e) => {
      if (isLoginMenuVisible() && !loginEntry.contains(e.target)) {
        setLoginMenuVisible(false);
      }
    });
    window.addEventListener("blur", () => setLoginMenuVisible(false));

    // —— 网易云渠道 ——
    // 登录 → 内嵌扫码弹窗（后台隐藏窗口抓官方页 canvas 二维码，无需打开可见窗口）
    loginNeteaseLogin.addEventListener("click", () => {
      setLoginMenuVisible(false);
      openNeteaseLoginWindow();
    });
    // 已登录：我的歌单 / 每日推荐 / 最近听过（跳转到搜索面板「我的歌单」tab）
    menuLoginPlaylists.addEventListener("click", () => { setLoginMenuVisible(false); openNeteaseTab("my"); });
    menuLoginDaily.addEventListener("click", () => { setLoginMenuVisible(false); openNeteaseTab("daily"); });
    menuLoginRecord.addEventListener("click", () => { setLoginMenuVisible(false); openNeteaseTab("record"); });
    // 退出登录（带确认）
    menuLoginLogout.addEventListener("click", async () => {
      setLoginMenuVisible(false);
      const confirmLogout = await window.electronAPI.dialog.confirm(
        "确认退出登录？",
        "退出后逐字歌词将不可用（其他功能不受影响）。"
      );
      if (!confirmLogout) return;
      await window.electronAPI.login.logout();
    });

    // —— QQ音乐渠道 ——
    // 登录 → 内嵌扫码弹窗（ptlogin2 纯 HTTP，无需打开网页窗口）
    loginQqLogin.addEventListener("click", () => {
      setLoginMenuVisible(false);
      openQqLoginWindow();
    });
    // 已登录：我的歌单 / 每日推荐
    menuQqloginPlaylists.addEventListener("click", () => { setLoginMenuVisible(false); openNeteaseTab("my"); });
    menuQqloginDaily.addEventListener("click", () => { setLoginMenuVisible(false); openNeteaseTab("daily"); });
    // 退出登录（带确认）
    menuQqloginLogout.addEventListener("click", async () => {
      setLoginMenuVisible(false);
      const confirmLogout = await window.electronAPI.dialog.confirm(
        "确认退出QQ音乐登录？",
        "退出后QQ音乐的歌单/每日推荐/最近听过将不可用。"
      );
      if (!confirmLogout) return;
      await window.electronAPI.qqmusic.logout();
    });

    // —— 酷狗渠道 ——
    // 登录 → 弹出扫码登录窗口（酷狗官方 qrcode 接口，base64 图直接显示，无风控）
    loginKugouLogin.addEventListener("click", () => {
      setLoginMenuVisible(false);
      openKugouLoginWindow();
    });
    // 已登录：我的歌单 / 每日推荐
    menuKugouloginPlaylists.addEventListener("click", () => { setLoginMenuVisible(false); openNeteaseTab("my"); loadKugouMyPlaylists(); });
    menuKugouloginDaily.addEventListener("click", () => { setLoginMenuVisible(false); openNeteaseTab("daily"); switchDailyPlatform("kugou"); });
    // 退出登录（带确认）
    menuKugouloginLogout.addEventListener("click", async () => {
      setLoginMenuVisible(false);
      const confirmLogout = await window.electronAPI.dialog.confirm(
        "确认退出酷狗登录？",
        "退出后酷狗的歌单/每日推荐将不可用。"
      );
      if (!confirmLogout) return;
      await window.electronAPI.kugou.logout();
      updateKugouloginEntry({ loggedIn: false });
    });

    // 全局回调：酷狗登录状态变化（扫码窗口轮询成功后由 main.js 广播）
    if (window.electronAPI.kugou && window.electronAPI.kugou.onLoginChanged) {
      window.electronAPI.kugou.onLoginChanged((data) => {
        if (data && data.loggedIn) {
          showToast("✓ 酷狗登录成功", `欢迎 ${data.nickname || "酷狗用户"}`, "info");
          updateKugouloginEntry(data);
        } else {
          updateKugouloginEntry({ loggedIn: false });
        }
      });
    }

    // —— 面板底部：打开设置 ——
    menuOpenSettings.addEventListener("click", () => {
      setLoginMenuVisible(false);
      window.openSettingsPanel(false);
    });

    // 全局回调：QQ 音乐登录状态变化（官方登录窗口扫码成功后由 main.js 广播）
    window.electronAPI.qqmusic.onLoginChanged((data) => {
      if (data && data.loggedIn) {
        showToast("✓ QQ音乐登录成功", `欢迎 ${data.nickname || "QQ音乐用户"}`, "info");
        updateQqloginEntry(data);
      } else {
        updateQqloginEntry({ loggedIn: false });
      }
    });
  }

  // 网易云渠道状态（兼容主进程 {loggedIn,nickname,avatarUrl} 与 XFAccount {loggedIn,profile}）
  function updateLoginEntry(data) {
    if (!data) return;
    const nickname = data.nickname || (data.profile && data.profile.nickname) || "";
    const avatarUrl = data.avatarUrl || (data.profile && data.profile.avatarUrl) || "";
    neteaseLoggedIn = !!data.loggedIn;
    neteaseNickname = nickname;
    neteaseAvatarUrl = avatarUrl;
    loginNeteaseState.textContent = data.loggedIn ? "已登录" : "未登录";
    loginNeteaseState.classList.toggle("logged-in", !!data.loggedIn);
    loginNeteaseLogin.style.display = data.loggedIn ? "none" : "";
    loginNeteaseInfo.style.display = data.loggedIn ? "flex" : "none";
    loginNeteaseActions.style.display = data.loggedIn ? "block" : "none";
    loginNickname.textContent = nickname || "网易云用户";
    if (avatarUrl) {
      // 头像 URL 是 http，转 https 避免混合内容问题
      loginAvatar.src = avatarUrl.replace(/^http:/, "https:");
      loginAvatar.style.display = "";
    } else {
      loginAvatar.style.display = "none";
    }
    rebuildLoginSummary();
  }

  // QQ音乐渠道状态（兼容主进程 {loggedIn,nickname,avatarUrl} 与 XFAccount {loggedIn,user:{nick,avatar}}）
  function updateQqloginEntry(data) {
    if (!data) return;
    const nickname = data.nickname || (data.user && data.user.nick) || "";
    const avatarUrl = data.avatarUrl || (data.user && data.user.avatar) || "";
    qqLoggedIn = !!data.loggedIn;
    qqNickname = nickname;
    qqAvatarUrl = avatarUrl;
    loginQqState.textContent = data.loggedIn ? "已登录" : "未登录";
    loginQqState.classList.toggle("logged-in", !!data.loggedIn);
    loginQqLogin.style.display = data.loggedIn ? "none" : "";
    loginQqInfo.style.display = data.loggedIn ? "flex" : "none";
    loginQqActions.style.display = data.loggedIn ? "block" : "none";
    qqloginNickname.textContent = nickname || "QQ音乐用户";
    if (avatarUrl) {
      qqloginAvatar.src = avatarUrl.replace(/^http:/, "https:");
      qqloginAvatar.style.display = "";
    } else {
      qqloginAvatar.style.display = "none";
    }
    rebuildLoginSummary();
  }

  // 酷狗渠道状态（兼容主进程 {loggedIn,nickname,avatarUrl} 与 XFAccount {loggedIn,user:{nick,avatar}}）
  function updateKugouloginEntry(data) {
    if (!data) return;
    const nickname = data.nickname || (data.user && data.user.nick) || "";
    const avatarUrl = data.avatarUrl || (data.user && data.user.avatar) || "";
    kugouLoggedIn = !!data.loggedIn;
    kugouNickname = nickname;
    kugouAvatarUrl = avatarUrl;
    loginKugouState.textContent = data.loggedIn ? "已登录" : "未登录";
    loginKugouState.classList.toggle("logged-in", !!data.loggedIn);
    loginKugouLogin.style.display = data.loggedIn ? "none" : "";
    loginKugouInfo.style.display = data.loggedIn ? "flex" : "none";
    loginKugouActions.style.display = data.loggedIn ? "block" : "none";
    kugouloginNickname.textContent = nickname || "酷狗用户";
    if (avatarUrl) {
      kugouloginAvatar.src = avatarUrl.replace(/^http:/, "https:");
      kugouloginAvatar.style.display = "";
    } else {
      kugouloginAvatar.style.display = "none";
    }
    rebuildLoginSummary();
  }

  // ========== QQ音乐登录后功能（我的歌单/每日推荐/最近听过） ==========

  async function isQqmusicLoggedIn() {
    const st = await XFAccount.qqStatus();
    return !!(st && st.loggedIn);
  }

  // 把 QQ 音乐 API 歌曲数组转换成播放器轨道（qq 源，id=songmid）
  function toQqTracks(songs) {
    return (songs || []).map((s) => ({
      id: s.id || s.mid || s.songmid || s.url_id,
      name: s.name || s.songname || "",
      artist: Array.isArray(s.singer) ? s.singer.map((a) => a.name).join(", ") : (s.singer || s.artist || ""),
      album: (s.album && (s.album.name || s.album.title)) || s.albumName || s.album || "",
      pic: s.pic || "",
      picId: s.picId || "",
    }));
  }

  // 播放 QQ 音乐歌曲（追加到在线队列并播放第一首）
  function playQqSongs(songs) {
    if (!songs || songs.length === 0) {
      showToast("QQ音乐", "没有可播放的歌曲", "info");
      return;
    }
    const tracks = toQqTracks(songs);
    const added = player.addOnlineSongs(tracks, "qq");
    if (added <= 0) {
      showToast("QQ音乐", "歌曲已在播放队列中", "info");
      return;
    }
    const startIdx = player.getPlaylist().length - added;
    player.playOnlineTrack(startIdx);
  }

  // 播放 QQ 音乐歌单（按 disstid 拉歌曲列表）
  async function playQqPlaylist(playlistId) {
    try {
      const r = await XFApi.playlist(playlistId, "qq");
      if (!r || r.length === 0) {
        showToast("QQ音乐", "歌单为空或加载失败", "error");
        return;
      }
      const tracks = r.map((s) => ({
        id: s.id || s.url_id,
        name: s.name || "",
        artist: s.artist || "",
        album: s.album || "",
        picId: s.picId || "",
        pic: s.pic || "",
      }));
      const added = player.addOnlineSongs(tracks, "qq");
      if (added <= 0) {
        showToast("QQ音乐", "歌曲已在播放队列中", "info");
        return;
      }
      const startIdx = player.getPlaylist().length - added;
      player.playOnlineTrack(startIdx);
    } catch (e) {
      showToast("加载歌单失败", e.message, "error");
    }
  }

  // ②③ 我的QQ音乐歌单（创建+收藏，渲染到 qqmusic-playlist-wrap）
  async function loadQqmusicMyPlaylists() {
    if (!(await isQqmusicLoggedIn())) {
      qqmusicPlaylistWrap.innerHTML = '<div class="netease-panel-status">未登录QQ音乐（登录后可用）</div>';
      return;
    }
    qqmusicPlaylistWrap.innerHTML = '<div class="netease-panel-status">加载中...</div>';
    // 登录数据走共享层 XFAccount（与新版模板同一份数据源）
    const [mine, collect] = await Promise.all([XFAccount.qqPlaylists(), XFAccount.qqCollectPlaylists()]);
    const all = [...(mine || []), ...(collect || [])];
    // 去重（同 id 只保留一次）
    const seen = new Set();
    const merged = all.filter((p) => {
      const key = String(p.id);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    let html = "";
    if (merged.length > 0) {
      html += `<div class="netease-pl-section-title">QQ音乐歌单（${merged.length}）</div>` +
        `<div class="netease-pl-grid">` +
        merged.map((p) => `
          <div class="netease-pl-card" data-id="${p.id}">
            <div class="netease-pl-card-name">${escapeHtml(p.name)}</div>
            <div class="netease-pl-card-meta">${p.trackCount} 首</div>
            <button class="btn-load" data-plid="${p.id}">播放</button>
          </div>`).join("") + `</div>`;
    }
    qqmusicPlaylistWrap.innerHTML = html || emptyStateHTML("playlist", "暂无QQ音乐歌单", "在QQ音乐 App 里收藏/创建歌单后，这里会自动同步");
    qqmusicPlaylistWrap.querySelectorAll(".netease-pl-card .btn-load").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        playQqPlaylist(parseInt(btn.dataset.plid, 10));
      });
    });
  }

  // ④⑤ QQ音乐每日推荐（歌曲 + 歌单）
  async function loadQqmusicDaily() {
    if (!(await isQqmusicLoggedIn())) {
      qqmusicDailyStatus.textContent = "未登录QQ音乐（登录后可用每日推荐）";
      qqmusicDailyList.innerHTML = "";
      return;
    }
    qqmusicDailyStatus.textContent = "加载中...";
    // 登录数据走共享层 XFAccount（与新版模板同一份数据源）
    const daily = await XFAccount.qqDaily();
    const songs = daily.songs || [];
    let html = "";
    if (songs.length > 0) {
      html += `<div class="netease-pl-section-title">今日推荐歌曲（${songs.length}）</div>` +
        songs.map((s, i) => `
          <div class="netease-song-row" data-idx="${i}" data-id="${s.id}">
            <span class="netease-song-idx">${i + 1}</span>
            <span class="netease-song-name">${escapeHtml(s.name)}</span>
            <span class="netease-song-artist">${escapeHtml(s.artist)}</span>
          </div>`).join("");
    } else {
      html += '<div class="netease-pl-section-title">今日推荐歌曲</div><div class="netease-panel-status">无数据</div>';
    }
    const pls = daily.playlists || [];
    if (pls.length > 0) {
      html += `<div class="netease-pl-section-title">今日推荐歌单（${pls.length}）</div>` +
        pls.map((p) => `
          <div class="netease-pl-card" data-id="${p.id}">
            <div class="netease-pl-card-name">${escapeHtml(p.name)}</div>
            <div class="netease-pl-card-meta">${p.trackCount} 首</div>
            <button class="btn-load" data-plid="${p.id}">播放</button>
          </div>`).join("");
    }
    qqmusicDailyStatus.textContent = "";
    qqmusicDailyList.innerHTML = html || emptyStateHTML("music", "今日暂无推荐", "登录账号后每天都有专属推荐歌曲和歌单");

    // 歌曲点击播放
    qqmusicDailyList.querySelectorAll(".netease-song-row").forEach((row) => {
      row.addEventListener("click", () => {
        const idx = parseInt(row.dataset.idx, 10);
        playQqSongs(songs.slice(idx));
      });
    });
    // 歌单播放
    qqmusicDailyList.querySelectorAll(".netease-pl-card .btn-load").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        playQqPlaylist(parseInt(btn.dataset.plid, 10));
      });
    });
  }

  // ========== 酷狗登录后功能（扫码窗口 / 我的歌单 / 每日推荐） ==========

  // ========== 网易云内嵌扫码登录弹窗（v3.4.x，后台隐藏窗口抓官方页 canvas 二维码） ==========
  let neQrModalListenerAttached = false;
  function openNeteaseLoginWindow() {
    const existing = document.getElementById("kugou-login-modal");
    if (existing) existing.remove();
    const modal = document.createElement("div");
    modal.id = "kugou-login-modal";
    modal.className = "kugou-login-modal";
    modal.innerHTML = `
      <div class="kugou-login-box">
        <div class="kugou-login-head">
          <span>网易云音乐 · 扫码登录</span>
          <button class="kugou-login-close" id="kugou-login-close">✕</button>
        </div>
        <div class="kugou-login-body">
          <div class="kugou-login-qr" id="kugou-login-qr"><div class="netease-panel-status">正在打开官方登录页...</div></div>
          <div class="kugou-login-status" id="kugou-login-status">正在加载登录二维码...</div>
          <button class="btn-action" id="kugou-login-refresh" style="margin:0 auto;display:block;">重新加载</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    const qrBox = modal.querySelector("#kugou-login-qr");
    const statusEl = modal.querySelector("#kugou-login-status");
    const refreshBtn = modal.querySelector("#kugou-login-refresh");
    const close = () => { modal.remove(); window.electronAPI.login.closeWindow(); };
    modal.querySelector("#kugou-login-close").addEventListener("click", close);
    modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

    // 二维码事件（只注册一次，回调定位当前 modal）
    if (!neQrModalListenerAttached) {
      neQrModalListenerAttached = true;
      window.electronAPI.login.onQrImage((qrDataUrl) => {
        const m = document.getElementById("kugou-login-modal");
        if (!m) return;
        const qb = m.querySelector("#kugou-login-qr");
        const st = m.querySelector("#kugou-login-status");
        if (!qb) return;
        qb.innerHTML = '<img src="' + qrDataUrl + '" alt="网易云登录二维码">';
        st.textContent = "请使用网易云 App 扫码登录";
      });
    }
    const openWindow = () => {
      qrBox.innerHTML = '<div class="netease-panel-status">正在打开官方登录页...</div>';
      statusEl.textContent = "正在加载登录二维码...";
      window.electronAPI.login.openWindow();
    };
    refreshBtn.addEventListener("click", () => {
      window.electronAPI.login.closeWindow();
      setTimeout(openWindow, 300);
    });
    openWindow();
  }

  // ========== QQ音乐内嵌扫码登录弹窗（v3.4.x，ptlogin2 纯 HTTP） ==========
  function openQqLoginWindow() {
    const existing = document.getElementById("kugou-login-modal");
    if (existing) existing.remove();
    const modal = document.createElement("div");
    modal.id = "kugou-login-modal";
    modal.className = "kugou-login-modal";
    modal.innerHTML = `
      <div class="kugou-login-box">
        <div class="kugou-login-head">
          <span>QQ音乐 · 扫码登录</span>
          <button class="kugou-login-close" id="kugou-login-close">✕</button>
        </div>
        <div class="kugou-login-body">
          <div class="kugou-login-qr" id="kugou-login-qr"><div class="netease-panel-status">二维码加载中...</div></div>
          <div class="kugou-login-status" id="kugou-login-status">正在生成二维码...</div>
          <button class="btn-action" id="kugou-login-refresh" style="margin:0 auto;display:block;">刷新二维码</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    const qrBox = modal.querySelector("#kugou-login-qr");
    const statusEl = modal.querySelector("#kugou-login-status");
    const refreshBtn = modal.querySelector("#kugou-login-refresh");
    let timer = null;
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    const close = () => { stop(); modal.remove(); };
    modal.querySelector("#kugou-login-close").addEventListener("click", close);
    modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

    const startQr = async () => {
      try {
        const r = await window.electronAPI.qqmusic.qrKey();
        if (!r || !r.success) {
          qrBox.innerHTML = '<div class="netease-panel-status">二维码获取失败</div>';
          statusEl.textContent = (r && r.message) || "获取失败";
          return;
        }
        qrBox.innerHTML = '<img src="' + r.qrDataUrl + '" alt="QQ音乐登录二维码">';
        statusEl.textContent = "请使用 QQ / 手机QQ 扫码登录";
        stop();
        timer = setInterval(async () => {
          try {
            const c = await window.electronAPI.qqmusic.qrCheck();
            if (c.status === 0) {
              stop();
              statusEl.textContent = "登录成功！";
              showToast("✓ QQ音乐登录成功", "正在同步歌单和每日推荐", "info");
              const st = await XFAccount.qqStatus();
              updateQqloginEntry(st);
              setTimeout(close, 800);
              return;
            }
            if (c.status === 67) { statusEl.textContent = "请在手机上确认登录"; return; }
            if (c.status === 66) { statusEl.textContent = "等待扫码..."; return; }
            if (c.status === 65) {
              stop();
              statusEl.textContent = "二维码已过期，正在刷新...";
              startQr();
              return;
            }
            if (c.status === 98 || c.status === 99) {
              stop();
              statusEl.textContent = c.message || "登录异常，请刷新重试";
              return;
            }
            statusEl.textContent = c.message || "等待扫码...";
          } catch (e) { /* 单次轮询失败忽略 */ }
        }, 2000);
      } catch (e) {
        qrBox.innerHTML = '<div class="netease-panel-status">二维码获取失败</div>';
        statusEl.textContent = e.message || "网络错误";
      }
    };
    refreshBtn.addEventListener("click", () => { stop(); statusEl.textContent = "正在生成二维码..."; startQr(); });
    startQr();
  }

  // 酷狗扫码登录窗口（modal：二维码 base64 直接显示 + 2s 轮询，与新版模板同链路）
  function openKugouLoginWindow() {
    const existing = document.getElementById("kugou-login-modal");
    if (existing) existing.remove();
    const modal = document.createElement("div");
    modal.id = "kugou-login-modal";
    modal.className = "kugou-login-modal";
    modal.innerHTML = `
      <div class="kugou-login-box">
        <div class="kugou-login-head">
          <span>酷狗音乐 · 扫码登录</span>
          <button class="kugou-login-close" id="kugou-login-close">✕</button>
        </div>
        <div class="kugou-login-body">
          <div class="kugou-login-qr" id="kugou-login-qr"><div class="netease-panel-status">二维码加载中...</div></div>
          <div class="kugou-login-status" id="kugou-login-status">正在生成二维码...</div>
          <button class="btn-action" id="kugou-login-refresh" style="margin:0 auto;display:block;">刷新二维码</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    const qrBox = modal.querySelector("#kugou-login-qr");
    const statusEl = modal.querySelector("#kugou-login-status");
    const refreshBtn = modal.querySelector("#kugou-login-refresh");
    let timer = null;
    let key = "";
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    const close = () => { stop(); modal.remove(); };
    modal.querySelector("#kugou-login-close").addEventListener("click", close);
    modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

    const startQr = async () => {
      try {
        const r = await window.electronAPI.kugou.qrKey();
        if (!r || !r.success) {
          qrBox.innerHTML = '<div class="netease-panel-status">二维码获取失败</div>';
          statusEl.textContent = (r && r.message) || "获取失败";
          return;
        }
        key = r.key;
        qrBox.innerHTML = '<img src="' + r.qrDataUrl + '" alt="酷狗登录二维码">';
        statusEl.textContent = "请使用酷狗 App 扫码登录";
        stop();
        timer = setInterval(async () => {
          try {
            const c = await window.electronAPI.kugou.qrCheck(key);
            if (c.status === 4) {
              stop();
              statusEl.textContent = "登录成功！";
              showToast("✓ 酷狗登录成功", "正在同步歌单和每日推荐", "info");
              const st = await XFAccount.kugouStatus();
              updateKugouloginEntry(st);
              setTimeout(close, 800);
              return;
            }
            if (c.status === 2) { statusEl.textContent = "请在手机上确认登录"; return; }
            if (c.status === 0) {
              stop();
              statusEl.textContent = "二维码已过期，正在刷新...";
              startQr();
              return;
            }
            statusEl.textContent = "等待扫码...";
          } catch (e) { /* 单次轮询失败忽略 */ }
        }, 2000);
      } catch (e) {
        qrBox.innerHTML = '<div class="netease-panel-status">二维码获取失败</div>';
        statusEl.textContent = e.message || "网络错误";
      }
    };
    refreshBtn.addEventListener("click", () => { stop(); statusEl.textContent = "正在生成二维码..."; startQr(); });
    startQr();
  }

  // 把酷狗 API 歌曲数组转换成播放器轨道（kugou 源，id=hash）
  function toKugouTracks(songs) {
    return (songs || []).map((s) => ({
      id: s.id || s.hash || s.url_id,
      name: s.name || s.songname || "",
      artist: s.artist || s.singername || "",
      album: s.album || "",
      pic: s.pic || "",
      picId: s.picId || "",
    }));
  }

  // 播放酷狗歌曲（追加到在线队列并播放第一首）
  function playKugouSongs(songs) {
    if (!songs || songs.length === 0) {
      showToast("酷狗", "没有可播放的歌曲", "info");
      return;
    }
    const tracks = toKugouTracks(songs);
    const added = player.addOnlineSongs(tracks, "kugou");
    if (added <= 0) {
      showToast("酷狗", "歌曲已在播放队列中", "info");
      return;
    }
    const startIdx = player.getPlaylist().length - added;
    player.playOnlineTrack(startIdx);
  }

  // 我的酷狗歌单（kugouPlaylists 返回的歌单已内嵌歌曲，点击即播）
  async function loadKugouMyPlaylists() {
    if (!kugouLoggedIn) {
      kugouPlaylistWrap.innerHTML = '<div class="netease-panel-status">未登录酷狗（登录后可用）</div>';
      return;
    }
    kugouPlaylistWrap.innerHTML = '<div class="netease-panel-status">加载中...</div>';
    try {
      const pls = await XFAccount.kugouPlaylists();
      let html = "";
      if (pls.length > 0) {
        html += `<div class="netease-pl-section-title">酷狗歌单（${pls.length}）</div>` +
          `<div class="netease-pl-grid">` +
          pls.map((p) => `
            <div class="netease-pl-card" data-id="${p.id}">
              <div class="netease-pl-card-name">${escapeHtml(p.name)}</div>
              <div class="netease-pl-card-meta">${p.trackCount} 首</div>
              <button class="btn-load" data-plid="${p.id}">播放</button>
            </div>`).join("") + `</div>`;
      }
      kugouPlaylistWrap.innerHTML = html || emptyStateHTML("playlist", "暂无酷狗歌单", "在酷狗音乐 App 里创建歌单后，这里会自动同步");
      // 歌单点击：直接播内嵌歌曲（kugouPlaylists 已带 songs）
      kugouPlaylistWrap.querySelectorAll(".netease-pl-card .btn-load").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const p = pls.find((x) => String(x.id) === String(btn.dataset.plid));
          if (p && p.songs && p.songs.length) playKugouSongs(p.songs);
          else showToast("酷狗", "该歌单暂无歌曲", "info");
        });
      });
    } catch (e) {
      kugouPlaylistWrap.innerHTML = '<div class="netease-panel-status">加载失败：' + escapeHtml(e.message) + "</div>";
    }
  }

  // 酷狗每日推荐
  async function loadKugouDaily() {
    if (!kugouLoggedIn) {
      kugouDailyStatus.style.display = "";
      kugouDailyStatus.textContent = "未登录酷狗（登录后可用每日推荐）";
      kugouDailyList.style.display = "none";
      kugouDailyList.innerHTML = "";
      return;
    }
    kugouDailyStatus.style.display = "";
    kugouDailyStatus.textContent = "加载中...";
    try {
      const daily = await XFAccount.kugouDaily();
      const songs = daily.songs || [];
      let html = "";
      if (songs.length > 0) {
        html += `<div class="netease-pl-section-title">今日推荐歌曲（${songs.length}）</div>` +
          songs.map((s, i) => `
            <div class="netease-song-row" data-idx="${i}" data-id="${s.id}">
              <span class="netease-song-idx">${i + 1}</span>
              <span class="netease-song-name">${escapeHtml(s.name)}</span>
              <span class="netease-song-artist">${escapeHtml(s.artist)}</span>
            </div>`).join("");
      } else {
        html += '<div class="netease-pl-section-title">今日推荐歌曲</div><div class="netease-panel-status">无数据</div>';
      }
      kugouDailyStatus.textContent = "";
      kugouDailyStatus.style.display = "none";
      kugouDailyList.style.display = "";
      kugouDailyList.innerHTML = html || emptyStateHTML("music", "今日暂无推荐", "登录酷狗后每天都有专属推荐歌曲");
      // 歌曲点击播放
      kugouDailyList.querySelectorAll(".netease-song-row").forEach((row) => {
        row.addEventListener("click", () => {
          const idx = parseInt(row.dataset.idx, 10);
          playKugouSongs(songs.slice(idx));
        });
      });
    } catch (e) {
      kugouDailyStatus.style.display = "";
      kugouDailyStatus.textContent = "加载失败：" + e.message;
      kugouDailyList.style.display = "none";
    }
  }

  // ========== 网易云登录后功能（我的歌单/每日推荐/最近听过） ==========

  // 每日推荐的平台选择（netease/qq），切换时只加载选中平台
  let dailyPlatform = "netease";

  function setupNeteaseUserFeatures() {
    // 「我的歌单」tab 内子标签切换
    document.querySelectorAll(".netease-subtab").forEach((tab) => {
      tab.addEventListener("click", () => {
        switchNeteaseSubtab(tab.dataset.subtab);
      });
    });
    // 每日推荐：平台切换（网易云/QQ音乐）
    // ⚠️ netease-subtab-daily 是 id 不是 class（HTML: <div id="netease-subtab-daily">），必须用 # 前缀
    document.querySelectorAll("#netease-subtab-daily .platform-type").forEach((t) => {
      t.addEventListener("click", () => {
        const platform = t.dataset.platform;
        // 高亮切换
        document.querySelectorAll("#netease-subtab-daily .platform-type").forEach((x) => x.classList.remove("active"));
        t.classList.add("active");
        dailyPlatform = platform;
        switchDailyPlatform();
      });
    });
    // 最近听过：本周/全部切换（⚠️ 排除 platform-type，否则会误绑定 daily 的平台切换按钮）
    document.querySelectorAll(".record-type:not(.platform-type)").forEach((t) => {
      t.addEventListener("click", () => {
        loadNeteaseRecord(parseInt(t.dataset.recordType));
      });
    });
  }

  // 每日推荐：切换平台显示（网易云 / QQ音乐 / 酷狗）
  function switchDailyPlatform() {
    const showQq = dailyPlatform === "qq";
    const showKg = dailyPlatform === "kugou";
    neteaseDailyStatus.style.display = (showQq || showKg) ? "none" : "";
    neteaseDailyList.style.display = (showQq || showKg) ? "none" : "";
    qqmusicDailyStatus.style.display = showQq ? "" : "none";
    qqmusicDailyList.style.display = showQq ? "" : "none";
    kugouDailyStatus.style.display = showKg ? "" : "none";
    kugouDailyList.style.display = showKg ? "" : "none";
    if (showKg) loadKugouDaily();
    else if (showQq) loadQqmusicDaily();
    else loadNeteaseDaily();
  }

  function switchNeteaseSubtab(sub) {
    document.querySelectorAll(".netease-subtab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".netease-subtab-content").forEach((c) => c.classList.remove("active"));
    const tab = document.querySelector(`.netease-subtab[data-subtab="${sub}"]`);
    if (tab) tab.classList.add("active");
    const content = document.getElementById("netease-subtab-" + sub);
    if (content) content.classList.add("active");
    if (sub === "my") {
      loadNeteaseMyPlaylists();
      loadQqmusicMyPlaylists();
      loadKugouMyPlaylists();
    } else if (sub === "daily") {
      switchDailyPlatform();
    } else if (sub === "record") {
      loadNeteaseRecord();
    }
  }

  // 从登录菜单跳转到「我的歌单」tab 的指定子标签
  function openNeteaseTab(sub) {
    // ⚠️ 必须先展开搜索面板（面板默认收起，只切 tab 的 active 会"无反应"）
    if (!searchPanel.classList.contains("open")) openSearchPanel();
    document.querySelectorAll(".panel-tab").forEach((t) => t.classList.remove("active"));
    const pt = document.querySelector('.panel-tab[data-tab="playlists"]');
    if (pt) pt.classList.add("active");
    tabSearch.classList.remove("active");
    tabPlaylists.classList.add("active");
    switchNeteaseSubtab(sub);
  }

  // 把网易云 API 歌曲数组转换成播放器轨道（netease 源）
  function toNeteaseTracks(songs) {
    return (songs || []).map((s) => ({
      id: s.id,
      name: s.name || "",
      artist: Array.isArray(s.ar) ? s.ar.map((a) => a.name).join(", ") : (Array.isArray(s.artists) ? s.artists.map((a) => a.name).join(", ") : (s.artist || "")),
      album: (s.al && s.al.name) || (s.album && s.album.name) || s.album || "",
      picId: (s.al && (s.al.pic_str || s.al.pic)) || (s.album && (s.album.pic_str || s.album.pic)) || s.picId || "",
      pic: (s.al && s.al.picUrl) || (s.album && s.album.picUrl) || s.pic || "",
    }));
  }

  // 播放网易云歌曲（追加到在线队列并播放第一首）
  function playNeteaseSongs(songs) {
    if (!songs || songs.length === 0) {
      showToast("网易云", "没有可播放的歌曲", "info");
      return;
    }
    const tracks = toNeteaseTracks(songs);
    const added = player.addOnlineSongs(tracks, "netease");
    if (added <= 0) {
      showToast("网易云", "歌曲已在播放队列中", "info");
      return;
    }
    const startIdx = player.getPlaylist().length - added;
    player.playOnlineTrack(startIdx);
  }

  // 加载网易云歌单详情并播放
  async function playNeteasePlaylist(playlistId) {
    try {
      const songs = await XFApi.playlist(playlistId, "netease");
      if (!songs || songs.length === 0) {
        showToast("网易云", "歌单为空或加载失败", "error");
        return;
      }
      const tracks = songs.map((s) => ({
        id: s.id || s.url_id,
        name: s.name || "",
        artist: s.artist || "",
        album: s.album || "",
        picId: s.picId || s.pic_id || "",
        pic: s.pic || "",
      }));
      const added = player.addOnlineSongs(tracks, "netease");
      if (added <= 0) {
        showToast("网易云", "歌曲已在播放队列中", "info");
        return;
      }
      const startIdx = player.getPlaylist().length - added;
      player.playOnlineTrack(startIdx);
    } catch (e) {
      showToast("加载歌单失败", e.message, "error");
    }
  }

  // ② 我的歌单（渲染到 playlist-list-wrap 顶部，网易云歌单卡片）
  async function loadNeteaseMyPlaylists() {
    if (!(await isNeteaseLoggedIn())) {
      neteasePlaylistWrap.innerHTML = "";
      return;
    }
    const pls = await XFAccount.neteasePlaylists();
    const cards = pls.map((p) => `
      <div class="netease-pl-card" data-id="${p.id}">
        <div class="netease-pl-card-name">${escapeHtml(p.name)}${p.heart ? ' <span class="netease-pl-heart">♥</span>' : ""}</div>
        <div class="netease-pl-card-meta">${p.trackCount} 首${p.creator ? " · " + escapeHtml(p.creator) : ""}</div>
        <button class="btn-load" data-plid="${p.id}">播放</button>
      </div>`)
      .join("");
    neteasePlaylistWrap.innerHTML =
      `<div class="netease-pl-section-title">网易云歌单（${pls.length}）</div>` +
      (pls.length === 0
        ? emptyStateHTML("heart", "暂无网易云歌单", "在网易云音乐 App 里收藏歌单后，这里会自动同步")
        : `<div class="netease-pl-grid">${cards}</div>`);
    // 播放按钮
    neteasePlaylistWrap.querySelectorAll(".netease-pl-card .btn-load").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        playNeteasePlaylist(parseInt(btn.dataset.plid));
      });
    });
  }

  async function isNeteaseLoggedIn() {
    const st = await XFAccount.neteaseStatus();
    return !!(st && st.loggedIn);
  }

  // ④⑤ 每日推荐（歌曲 30 首 + 推荐歌单）
  async function loadNeteaseDaily() {
    if (!(await isNeteaseLoggedIn())) {
      neteaseDailyStatus.textContent = "未登录网易云（登录后可用每日推荐）";
      neteaseDailyList.innerHTML = "";
      return;
    }
    neteaseDailyStatus.textContent = "加载中...";
    const daily = await XFAccount.neteaseDaily();
    const songs = daily.songs || [];
    let html = "";
    if (songs.length > 0) {
      html += `<div class="netease-pl-section-title">今日推荐歌曲（${songs.length}）</div>` +
        songs.map((s, i) => `
          <div class="netease-song-row" data-idx="${i}" data-id="${s.id}">
            <span class="netease-song-idx">${i + 1}</span>
            <span class="netease-song-name">${escapeHtml(s.name)}</span>
            <span class="netease-song-artist">${escapeHtml(s.artist)}</span>
          </div>`).join("");
    } else {
      html += `<div class="netease-pl-section-title">今日推荐歌曲</div><div class="netease-panel-status">无数据</div>`;
    }
    const pls = daily.playlists || [];
    if (pls.length > 0) {
      html += `<div class="netease-pl-section-title">今日推荐歌单（${pls.length}）</div>` +
        pls.map((p) => `
          <div class="netease-pl-card" data-id="${p.id}">
            <div class="netease-pl-card-name">${escapeHtml(p.name)}</div>
            <div class="netease-pl-card-meta">${p.trackCount} 次播放</div>
            <button class="btn-load" data-plid="${p.id}">播放</button>
          </div>`).join("");
    }
    neteaseDailyStatus.textContent = "";
    neteaseDailyList.innerHTML = html || emptyStateHTML("music", "今日暂无推荐", "登录账号后每天都有专属推荐歌曲和歌单");

    // 歌曲点击播放
    neteaseDailyList.querySelectorAll(".netease-song-row").forEach((row) => {
      row.addEventListener("click", () => {
        const idx = parseInt(row.dataset.idx);
        playNeteaseSongs(songs.slice(idx));
      });
    });
    // 歌单播放
    neteaseDailyList.querySelectorAll(".netease-pl-card .btn-load").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        playNeteasePlaylist(parseInt(btn.dataset.plid));
      });
    });
  }

  // ⑥ 最近听过（type=1 本周 / 0 全部）
  let lastRecordType = 1;
  async function loadNeteaseRecord(type = lastRecordType) {
    lastRecordType = type;
    // 同步切换按钮高亮（⚠️ 排除 platform-type，避免误改 daily 平台按钮的 active）
    document.querySelectorAll(".record-type:not(.platform-type)").forEach((t) => {
      t.classList.toggle("active", String(t.dataset.recordType) === String(type));
    });
    if (!(await isNeteaseLoggedIn())) {
      neteaseRecordStatus.textContent = "未登录网易云（登录后可用最近听过）";
      neteaseRecordList.innerHTML = "";
      return;
    }
    neteaseRecordStatus.textContent = "加载中...";
    const songs = await XFAccount.neteaseRecord(type);
    neteaseRecordStatus.textContent = "";
    const label = type === 1 ? "最近一周听过" : "全部听过";
    neteaseRecordList.innerHTML =
      `<div class="netease-pl-section-title">${label}（${songs.length}）</div>` +
      (songs.length === 0
        ? emptyStateHTML("music", "还没有听过歌曲", "播放几首歌曲后，这里会记录你的听歌足迹")
        : songs.map((s, i) => `
          <div class="netease-song-row" data-idx="${i}" data-id="${s.id}">
            <span class="netease-song-idx">${i + 1}</span>
            <span class="netease-song-name">${escapeHtml(s.name)}</span>
            <span class="netease-song-artist">${escapeHtml(s.artist)}</span>
          </div>`).join(""));
    neteaseRecordList.querySelectorAll(".netease-song-row").forEach((row) => {
      row.addEventListener("click", () => {
        const idx = parseInt(row.dataset.idx);
        playNeteaseSongs(songs.slice(idx));
      });
    });
  }

  // ========== Lyrics Updater ==========

  function startLyricsUpdater() {
    if (lyricsTimer) clearInterval(lyricsTimer);
    lyricsTimer = setInterval(() => { if (player.isPlaying) lyrics.update(player.getCurrentTime()); }, 50);
  }

  // ========== Settings Change Handler ==========

  async function onSettingsChanged(newSettings) {
    const oldMusic = settings.musicFolder;
    const oldImage = settings.imageFolder;
    settings = { ...settings, ...newSettings };
    if (settings.slideshowInterval) slideshow.setInterval(settings.slideshowInterval);
    applyLyricsFontSize(settings.lyricsFontSize || 22);
    applyLyricsFont(settings.lyricsFont || "");
    if (typeof newSettings.charColor !== "undefined") {
      applyCharColor(newSettings.charColor);
    }
    if (typeof newSettings.showTranslation !== "undefined") {
      lyrics.setShowTranslation(!!settings.showTranslation);
    }
    if (typeof newSettings.theme !== "undefined") {
      document.documentElement.dataset.theme = settings.theme || "aurora";
    }
    if (typeof newSettings.desktopLyrics !== "undefined") {
      window.electronAPI.desktopLyrics.toggle(!!settings.desktopLyrics);
    }
    if (settings.musicFolder !== oldMusic) {
      // 空值 = 清空本地音乐目录，同样生效
      lyrics.setMusicFolder(settings.musicFolder || "");
      await player.setMusicFolder(settings.musicFolder || "");
    }
    if (settings.imageFolder && settings.imageFolder !== oldImage) {
      slideshow.stop();
      await slideshow.setImageFolder(settings.imageFolder);
      slideshow.start();
    }
  }

  function applyLyricsFontSize(size) {
    const el = document.getElementById("dynamic-lyrics-style");
    if (el) el.remove();
    const style = document.createElement("style");
    style.id = "dynamic-lyrics-style";
    style.textContent = `
      .lyrics-line { font-size: ${size}px !important; line-height: 2.6 !important; padding: ${Math.round(size * 0.25)}px 0 !important; }
      .lyrics-line.active { font-size: ${size + 6}px !important; }
      .lyrics-line.past { font-size: ${size - 2}px !important; }
    `;
    document.head.appendChild(style);
  }

  function applyLyricsFont(font) {
    const el = document.getElementById("dynamic-lyrics-font");
    if (el) el.remove();
    if (!font) return;
    const style = document.createElement("style");
    style.id = "dynamic-lyrics-font";
    style.textContent = `.lyrics-line, .lyrics-placeholder { font-family: ${JSON.stringify(font)}, "Microsoft YaHei", sans-serif !important; }`;
    document.head.appendChild(style);
  }

  // 逐字歌词已播放字颜色（设置页可配，CSS 变量方式）
  function applyCharColor(color) {
    if (!color) return;
    const root = document.documentElement;
    root.style.setProperty("--char-color", color);
    // 辉光用同色 60% 透明度
    let r = 255, g = 77, b = 79;
    const m = /^#([0-9a-fA-F]{6})$/.exec(color);
    if (m) {
      r = parseInt(m[1].substring(0, 2), 16);
      g = parseInt(m[1].substring(2, 4), 16);
      b = parseInt(m[1].substring(4, 6), 16);
    }
    root.style.setProperty("--char-glow", `rgba(${r}, ${g}, ${b}, 0.65)`);
  }

  init();
})();
