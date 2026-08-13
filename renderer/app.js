(function () {
  "use strict";

  const $ = (s) => document.querySelector(s);

  const player = new MusicPlayer();
  const slideshow = new Slideshow();
  const lyrics = new Lyrics();

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

  // DOM — 登录入口（右上角）
  const loginEntry = $("#login-entry");
  const loginBtnEntry = $("#btn-login-entry");
  const loginUserChip = $("#login-user-chip");
  const loginAvatar = $("#login-avatar");
  const loginNickname = $("#login-nickname");
  const loginMenu = $("#login-menu");
  const menuOpenSettings = $("#menu-login-open-settings");
  const menuLogout = $("#menu-login-logout");
  const menuLoginPlaylists = $("#menu-login-playlists");
  const menuLoginDaily = $("#menu-login-daily");
  const menuLoginRecord = $("#menu-login-record");
  const neteaseDailyStatus = $("#netease-daily-status");
  const neteaseDailyList = $("#netease-daily-list");
  const neteaseRecordStatus = $("#netease-record-status");
  const neteaseRecordList = $("#netease-record-list");
  const neteasePlaylistWrap = $("#netease-playlist-wrap");
  // DOM — QQ音乐登录入口（右上角）
  const qqloginEntry = $("#qqlogin-entry");
  const qqloginBtnEntry = $("#btn-qqlogin-entry");
  const qqloginUserChip = $("#qqlogin-user-chip");
  const qqloginAvatar = $("#qqlogin-avatar");
  const qqloginNickname = $("#qqlogin-nickname");
  const qqloginMenu = $("#qqlogin-menu");
  const menuQqloginPlaylists = $("#menu-qqlogin-playlists");
  const menuQqloginDaily = $("#menu-qqlogin-daily");
  const menuQqloginOpenSettings = $("#menu-qqlogin-open-settings");
  const menuQqloginLogout = $("#menu-qqlogin-logout");
  const qqmusicPlaylistWrap = $("#qqmusic-playlist-wrap");
  const qqmusicDailyStatus = $("#qqmusic-daily-status");
  const qqmusicDailyList = $("#qqmusic-daily-list");
  // 下拉菜单延迟隐藏定时器（防鼠标移动到菜单途中菜单消失）
  let loginMenuHideTimer = null;

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
    btnMode.innerHTML = "\u{1F501}";
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
    setupQqloginEntry();
    setupImportDialog();
    setupNewPlaylistDialog();
    setupRenameDialog();
    setupDownloadListener();

    window.electronAPI.settings.onChanged(onSettingsChanged);

    // 网易云登录/登出 → 重新加载当前歌词（启用/停用逐字 YRC）+ 更新右上角入口
    window.electronAPI.login.onLoginChanged(async (data) => {
      scrobbleLoggedIn = !!(data && data.loggedIn);
      updateLoginEntry(data);
      const track = player.currentTrack;
      if (track && track.server === "netease") {
        await lyrics.loadForTrack(track);
        // 桌面歌词同步重新加载
        if (settings.desktopLyrics) {
          window.electronAPI.desktopLyrics.forward({ type: "trackchange", track });
        }
      }
    });
    // 初始登录状态（听歌打卡用）
    window.electronAPI.login.status().then((st) => { scrobbleLoggedIn = !!(st && st.loggedIn); });

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
      const icons = { sequential: "\u{1F501}", random: "\u{1F500}", single: "\u{1F502}" };
      btnMode.innerHTML = icons[m];
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

  // 防抖保存音量，重启后音量不丢失
  function saveVolumeDebounced() {
    clearTimeout(volumeSaveTimer);
    volumeSaveTimer = setTimeout(() => {
      window.electronAPI.settings.save({ volume: player.getVolume() });
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
  }

  function closeSearchPanel() { searchPanel.classList.remove("open"); }

  async function performSearch() {
    const keyword = searchInput.value.trim();
    if (!keyword) return;
    const source = document.getElementById("search-source").value;
    searchStatus.textContent = "搜索中...";
    searchResultsEl.innerHTML = "";
    try {
      let raw;
      if (source === "gqh") {
        raw = await window.electronAPI.music.gqhSearch(keyword);
      } else if (source === "gqb") {
        raw = await window.electronAPI.music.gqbSearch(keyword);
      } else {
        raw = await window.electronAPI.music.search(keyword, source === "qq" ? "qq" : "netease");
      }
      searchResults = (Array.isArray(raw) ? raw : []).map((s) => ({ ...s, server: source }));
      if (searchResults.length === 0) { searchStatus.textContent = "未找到结果"; return; }
      renderSearchResults();
      searchStatus.textContent = `找到 ${searchResults.length} 首歌曲`;
    } catch (e) {
      searchStatus.textContent = "搜索失败: " + e.message;
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

    searchResultsEl.querySelectorAll(".btn-play-now").forEach((btn) => {
      btn.addEventListener("click", (e) => { e.stopPropagation(); playSearchResult(parseInt(btn.dataset.idx)); });
    });
    searchResultsEl.querySelectorAll(".btn-play-next").forEach((btn) => {
      btn.addEventListener("click", (e) => { e.stopPropagation(); playNextSearchResult(parseInt(btn.dataset.idx)); });
    });
    searchResultsEl.querySelectorAll(".btn-add-queue").forEach((btn) => {
      btn.addEventListener("click", (e) => { e.stopPropagation(); addToQueue(parseInt(btn.dataset.idx)); });
    });
    searchResultsEl.querySelectorAll(".btn-download").forEach((btn) => {
      btn.addEventListener("click", (e) => { e.stopPropagation(); downloadSong(parseInt(btn.dataset.idx)); });
    });
    searchResultsEl.querySelectorAll(".btn-add-to-playlist").forEach((btn) => {
      btn.addEventListener("click", (e) => { e.stopPropagation(); showAddToPlaylistMenu(btn, parseInt(btn.dataset.idx)); });
    });
    searchResultsEl.querySelectorAll(".search-result-item").forEach((item, i) => {
      item.addEventListener("dblclick", () => playSearchResult(i));
    });
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

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = String(str || "");
    return div.innerHTML;
  }

  function downloadSong(idx) {
    if (idx < 0 || idx >= searchResults.length) return;
    const song = searchResults[idx];
    downloadTrack(song.id, song.server || "netease", song.name, song.artist);
  }

  async function downloadTrack(id, server, name, artist) {
    searchStatus.textContent = `⬇ 开始下载: ${artist ? artist + " - " : ""}${name}`;
    const result = await window.electronAPI.music.download(id, server, name, artist);
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
          await window.electronAPI.playlists.addSongs(pi, [song]);
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
    myPlaylists = await window.electronAPI.playlists.list();
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
              ${isLocal ? "" : `<button class="btn-rename" data-idx="${i}" title="重命名">✏️</button>`}
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
                  ${isLocal ? "" : `<button class="pl-song-next" data-pi="${i}" data-si="${si}" title="下一曲播放">⏭</button>`}
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
        await window.electronAPI.playlists.remove(renderedIdx - getPlaylistOffset());
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
        await window.electronAPI.playlists.removeSong(pi - getPlaylistOffset(), si);
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
      const result = await window.electronAPI.music.importPlaylist(url);
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
    await window.electronAPI.playlists.saveImport(name, importSongs, importUrlInput.value.trim());
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
    await window.electronAPI.playlists.add(name, []);
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
    const ok = await window.electronAPI.playlists.rename(renameTargetIdx, name);
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
      playlistList.innerHTML = '<div class="playlist-empty">列表为空<br>搜索并添加歌曲，或加载歌单</div>';
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
          <button class="playlist-item-next" data-idx="${i}" title="下一曲播放">⏭</button>
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

  // ========== 网易云登录入口（右上角） ==========

  function scheduleLoginMenuHide() {
    if (loginMenuHideTimer) clearTimeout(loginMenuHideTimer);
    loginMenuHideTimer = setTimeout(() => {
      loginMenu.style.display = "none";
      if (qqloginMenu) qqloginMenu.style.display = "none";
      loginMenuHideTimer = null;
    }, 250);
  }
  function cancelLoginMenuHide() {
    if (loginMenuHideTimer) {
      clearTimeout(loginMenuHideTimer);
      loginMenuHideTimer = null;
    }
  }

  function setupLoginEntry() {
    // 初始状态
    window.electronAPI.login.status().then((st) => updateLoginEntry(st));

    // 点击登录按钮 → 打开网易云官方登录窗口（真实浏览器环境，绕开 8821 风控）
    loginBtnEntry.addEventListener("click", async () => {
      const r = await window.electronAPI.login.openWindow();
      if (r && r.success) {
        showToast("网易云登录", "已打开登录窗口，请扫码并点「授权登录」", "info");
      } else {
        showToast("打开登录窗口失败", "请重试", "error");
      }
    });

    // 已登录：悬停头像/昵称显示下拉菜单
    // 隐藏带 250ms 延迟 + 菜单悬停取消延迟，避免鼠标移到菜单途中（经过间隙）菜单就消失
    loginUserChip.addEventListener("mouseenter", () => {
      cancelLoginMenuHide();
      loginMenu.style.display = "block";
    });
    loginEntry.addEventListener("mouseleave", () => {
      scheduleLoginMenuHide();
    });
    loginMenu.addEventListener("mouseenter", () => {
      cancelLoginMenuHide();
      loginMenu.style.display = "block";
    });
    loginMenu.addEventListener("mouseleave", () => {
      scheduleLoginMenuHide();
    });

    // 菜单：我的网易云歌单 / 每日推荐 / 最近听过（跳转到搜索面板「我的歌单」tab）
    menuLoginPlaylists.addEventListener("click", () => {
      loginMenu.style.display = "none";
      openNeteaseTab("my");
    });
    menuLoginDaily.addEventListener("click", () => {
      loginMenu.style.display = "none";
      openNeteaseTab("daily");
    });
    menuLoginRecord.addEventListener("click", () => {
      loginMenu.style.display = "none";
      openNeteaseTab("record");
    });

    // 菜单：打开设置
    menuOpenSettings.addEventListener("click", () => {
      loginMenu.style.display = "none";
      window.openSettingsPanel(false);
    });

    // 菜单：退出登录（带确认）
    menuLogout.addEventListener("click", async () => {
      loginMenu.style.display = "none";
      const confirmLogout = await window.electronAPI.dialog.confirm(
        "确认退出登录？",
        "退出后逐字歌词将不可用（其他功能不受影响）。"
      );
      if (!confirmLogout) return;
      await window.electronAPI.login.logout();
    });

    // 全局回调：登录状态变化（官方登录窗口扫码成功后由 main.js 广播）
    window.electronAPI.login.onLoginChanged((data) => {
      if (data && data.loggedIn) {
        showToast("✓ 登录成功", `欢迎 ${data.nickname || "网易云用户"}`, "info");
        updateLoginEntry(data);
      } else {
        updateLoginEntry({ loggedIn: false });
      }
    });
  }

  function updateLoginEntry(data) {
    if (!data) return;
    if (data.loggedIn) {
      loginBtnEntry.style.display = "none";
      loginUserChip.style.display = "flex";
      loginNickname.textContent = data.nickname || "网易云用户";
      if (data.avatarUrl) {
        // 头像 URL 是 http，转 https 避免混合内容问题
        loginAvatar.src = data.avatarUrl.replace(/^http:/, "https:");
        loginAvatar.style.display = "";
      } else {
        loginAvatar.style.display = "none";
      }
    } else {
      loginUserChip.style.display = "none";
      loginBtnEntry.style.display = "";
    }
  }

  // ========== QQ音乐登录入口（右上角） ==========

  function setupQqloginEntry() {
    // 初始状态
    window.electronAPI.qqmusic.loginStatus().then((st) => updateQqloginEntry(st));

    // 点击登录按钮 → 打开 QQ音乐网页版登录窗口
    qqloginBtnEntry.addEventListener("click", async () => {
      const r = await window.electronAPI.qqmusic.login();
      if (r && r.success) {
        showToast("QQ音乐登录", "已打开登录窗口，请扫码/账号登录后关闭即可", "info");
      } else {
        showToast("打开登录窗口失败", "请重试", "error");
      }
    });

    // 已登录：悬停头像/昵称显示下拉菜单（与网易云同款延迟隐藏）
    qqloginUserChip.addEventListener("mouseenter", () => {
      cancelLoginMenuHide();
      qqloginMenu.style.display = "block";
    });
    qqloginEntry.addEventListener("mouseleave", () => {
      scheduleLoginMenuHide();
    });
    qqloginMenu.addEventListener("mouseenter", () => {
      cancelLoginMenuHide();
      qqloginMenu.style.display = "block";
    });
    qqloginMenu.addEventListener("mouseleave", () => {
      scheduleLoginMenuHide();
    });

    // 菜单：我的QQ音乐歌单 / 每日推荐
    menuQqloginPlaylists.addEventListener("click", () => {
      qqloginMenu.style.display = "none";
      openNeteaseTab("my");
    });
    menuQqloginDaily.addEventListener("click", () => {
      qqloginMenu.style.display = "none";
      openNeteaseTab("daily");
    });

    // 菜单：打开设置
    menuQqloginOpenSettings.addEventListener("click", () => {
      qqloginMenu.style.display = "none";
      window.openSettingsPanel(false);
    });

    // 菜单：退出登录（带确认）
    menuQqloginLogout.addEventListener("click", async () => {
      qqloginMenu.style.display = "none";
      const confirmLogout = await window.electronAPI.dialog.confirm(
        "确认退出QQ音乐登录？",
        "退出后QQ音乐的歌单/每日推荐/最近听过将不可用。"
      );
      if (!confirmLogout) return;
      await window.electronAPI.qqmusic.logout();
    });

    // 全局回调：登录状态变化
    window.electronAPI.qqmusic.onLoginChanged((data) => {
      if (data && data.loggedIn) {
        showToast("✓ QQ音乐登录成功", `欢迎 ${data.nickname || "QQ音乐用户"}`, "info");
        updateQqloginEntry(data);
      } else {
        updateQqloginEntry({ loggedIn: false });
      }
    });
  }

  function updateQqloginEntry(data) {
    if (!data) return;
    if (data.loggedIn) {
      qqloginBtnEntry.style.display = "none";
      qqloginUserChip.style.display = "flex";
      qqloginNickname.textContent = data.nickname || "QQ音乐用户";
      if (data.avatarUrl) {
        qqloginAvatar.src = data.avatarUrl.replace(/^http:/, "https:");
        qqloginAvatar.style.display = "";
      } else {
        qqloginAvatar.style.display = "none";
      }
    } else {
      qqloginUserChip.style.display = "none";
      qqloginBtnEntry.style.display = "";
    }
  }

  // ========== QQ音乐登录后功能（我的歌单/每日推荐/最近听过） ==========

  async function isQqmusicLoggedIn() {
    const st = await window.electronAPI.qqmusic.loginStatus();
    return !!(st && st.loggedIn);
  }

  // 把 QQ 音乐 API 歌曲数组转换成播放器轨道（qq 源，id=songmid）
  function toQqTracks(songs) {
    return (songs || []).map((s) => ({
      id: s.id || s.mid || s.songmid || s.url_id,
      name: s.name || s.songname || "",
      artist: Array.isArray(s.singer) ? s.singer.map((a) => a.name).join(", ") : (s.singer || s.artist || ""),
      album: (s.album && (s.album.name || s.album.title)) || s.albumName || "",
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
      const r = await window.electronAPI.music.playlist(playlistId, "qq");
      if (!r || r.length === 0) {
        showToast("QQ音乐", "歌单为空或加载失败", "error");
        return;
      }
      const tracks = r.map((s) => ({
        id: s.id || s.url_id,
        name: s.name || "",
        artist: Array.isArray(s.singer) ? s.singer.map((a) => a.name).join(", ") : (s.singer || s.artist || ""),
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
    const [mineR, collectR] = await Promise.all([
      window.electronAPI.qqmusic.userPlaylists(),
      window.electronAPI.qqmusic.collectPlaylists(),
    ]);
    // 我创建的 + 我收藏的 合并为「QQ音乐歌单」一个区块（红心♥ 歌单排最前）
    const all = [];
    if (mineR.code === 200 && mineR.playlists) all.push(...mineR.playlists);
    if (collectR.code === 200 && collectR.playlists) all.push(...collectR.playlists);
    // 去重（同 id 只保留一次）+ 红心优先
    const seen = new Set();
    const merged = all.filter((p) => {
      const key = String(p.id);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a, b) => (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0));
    let html = "";
    if (merged.length > 0) {
      html += `<div class="netease-pl-section-title">QQ音乐歌单（${merged.length}）</div>` +
        `<div class="netease-pl-grid">` +
        merged.map((p) => `
          <div class="netease-pl-card" data-id="${p.id}">
            <div class="netease-pl-card-name">${escapeHtml(p.name)}${p.isFavorite ? ' <span class="netease-pl-heart">♥</span>' : ""}</div>
            <div class="netease-pl-card-meta">${p.trackCount} 首</div>
            <button class="btn-load" data-plid="${p.id}">播放</button>
          </div>`).join("") + `</div>`;
    }
    qqmusicPlaylistWrap.innerHTML = html || '<div class="netease-panel-status">暂无歌单</div>';
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
    const r = await window.electronAPI.qqmusic.daily();
    if (r.code !== 200) {
      qqmusicDailyStatus.textContent = "加载失败: " + (r.error || r.code);
      qqmusicDailyList.innerHTML = "";
      return;
    }
    let html = "";
    if (r.songs && r.songs.length > 0) {
      html += `<div class="netease-pl-section-title">今日推荐歌曲（${r.songs.length}）</div>` +
        r.songs.map((s, i) => `
          <div class="netease-song-row" data-idx="${i}" data-id="${s.id}">
            <span class="netease-song-idx">${i + 1}</span>
            <span class="netease-song-name">${escapeHtml(s.name)}</span>
            <span class="netease-song-artist">${escapeHtml(s.singer || "")}</span>
          </div>`).join("");
    } else {
      html += '<div class="netease-pl-section-title">今日推荐歌曲</div><div class="netease-panel-status">无数据</div>';
    }
    if (r.playlists && r.playlists.length > 0) {
      html += `<div class="netease-pl-section-title">今日推荐歌单（${r.playlists.length}）</div>` +
        r.playlists.map((p) => `
          <div class="netease-pl-card" data-id="${p.id}">
            <div class="netease-pl-card-name">${escapeHtml(p.name)}</div>
            <div class="netease-pl-card-meta">${p.trackCount} 首</div>
            <button class="btn-load" data-plid="${p.id}">播放</button>
          </div>`).join("");
    }
    qqmusicDailyStatus.textContent = "";
    qqmusicDailyList.innerHTML = html || '<div class="netease-panel-status">暂无数据</div>';

    // 歌曲点击播放
    qqmusicDailyList.querySelectorAll(".netease-song-row").forEach((row) => {
      row.addEventListener("click", () => {
        const idx = parseInt(row.dataset.idx, 10);
        playQqSongs(r.songs.slice(idx));
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

  // 每日推荐：切换平台显示
  function switchDailyPlatform() {
    const showQq = dailyPlatform === "qq";
    neteaseDailyStatus.style.display = showQq ? "none" : "";
    neteaseDailyList.style.display = showQq ? "none" : "";
    qqmusicDailyStatus.style.display = showQq ? "" : "none";
    qqmusicDailyList.style.display = showQq ? "" : "none";
    if (showQq) loadQqmusicDaily();
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
      album: (s.al && s.al.name) || (s.album && s.album.name) || "",
      picId: (s.al && (s.al.pic_str || s.al.pic)) || (s.album && (s.album.pic_str || s.album.pic)) || "",
      pic: (s.al && s.al.picUrl) || (s.album && s.album.picUrl) || "",
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
      const songs = await window.electronAPI.music.playlist(playlistId, "netease");
      if (!songs || songs.length === 0) {
        showToast("网易云", "歌单为空或加载失败", "error");
        return;
      }
      const tracks = songs.map((s) => ({
        id: s.id || s.url_id,
        name: s.name || "",
        artist: Array.isArray(s.artist) ? s.artist.join(", ") : (s.artist || ""),
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
    const r = await window.electronAPI.netease.userPlaylists();
    if (r.code !== 200 || !r.playlists) {
      neteasePlaylistWrap.innerHTML = '<div class="netease-panel-status">加载失败: ' + (r.error || r.code) + '</div>';
      return;
    }
    const cards = r.playlists
      .slice()
      .sort((a, b) => (b.specialType === 5 ? 1 : 0) - (a.specialType === 5 ? 1 : 0))
      .map((p) => `
        <div class="netease-pl-card" data-id="${p.id}">
          <div class="netease-pl-card-name">${escapeHtml(p.name)}${p.specialType === 5 ? ' <span class="netease-pl-heart">♥</span>' : ""}</div>
          <div class="netease-pl-card-meta">${p.trackCount} 首${p.creator ? " · " + escapeHtml(p.creator) : ""}</div>
          <button class="btn-load" data-plid="${p.id}">播放</button>
        </div>`)
      .join("");
    neteasePlaylistWrap.innerHTML =
      `<div class="netease-pl-section-title">网易云歌单（${r.playlists.length}）</div>` +
      `<div class="netease-pl-grid">${cards}</div>`;
    // 播放按钮
    neteasePlaylistWrap.querySelectorAll(".netease-pl-card .btn-load").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        playNeteasePlaylist(parseInt(btn.dataset.plid));
      });
    });
  }

  async function isNeteaseLoggedIn() {
    const st = await window.electronAPI.login.status();
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
    const [songsR, plsR] = await Promise.all([
      window.electronAPI.netease.dailySongs(),
      window.electronAPI.netease.dailyPlaylists(),
    ]);
    const songs = (songsR.code === 200 && songsR.songs) ? songsR.songs : [];
    let html = "";
    if (songs.length > 0) {
      html += `<div class="netease-pl-section-title">今日推荐歌曲（${songs.length}）</div>` +
        songs.map((s, i) => `
          <div class="netease-song-row" data-idx="${i}" data-id="${s.id}">
            <span class="netease-song-idx">${i + 1}</span>
            <span class="netease-song-name">${escapeHtml(s.name)}</span>
            <span class="netease-song-artist">${escapeHtml((s.ar || []).map((a) => a.name).join(" / "))}</span>
          </div>`).join("");
    } else {
      html += `<div class="netease-pl-section-title">今日推荐歌曲</div><div class="netease-panel-status">${songsR.error || "加载失败"}</div>`;
    }
    if (plsR.code === 200 && plsR.playlists && plsR.playlists.length > 0) {
      html += `<div class="netease-pl-section-title">今日推荐歌单（${plsR.playlists.length}）</div>` +
        plsR.playlists.map((p) => `
          <div class="netease-pl-card" data-id="${p.id}">
            <div class="netease-pl-card-name">${escapeHtml(p.name)}</div>
            <div class="netease-pl-card-meta">${p.trackCount} 次播放</div>
            <button class="btn-load" data-plid="${p.id}">播放</button>
          </div>`).join("");
    }
    neteaseDailyStatus.textContent = "";
    neteaseDailyList.innerHTML = html || '<div class="netease-panel-status">暂无数据</div>';

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
    const r = await window.electronAPI.netease.listenRecord(type);
    if (r.code !== 200 || !r.songs) {
      neteaseRecordStatus.textContent = "加载失败: " + (r.error || r.code);
      return;
    }
    neteaseRecordStatus.textContent = "";
    const label = type === 1 ? "最近一周听过" : "全部听过";
    neteaseRecordList.innerHTML =
      `<div class="netease-pl-section-title">${label}（${r.songs.length}）</div>` +
      r.songs.map((s, i) => `
        <div class="netease-song-row" data-idx="${i}" data-id="${s.id}">
          <span class="netease-song-idx">${i + 1}</span>
          <span class="netease-song-name">${escapeHtml(s.name)}</span>
          <span class="netease-song-artist">${escapeHtml((s.ar || []).map((a) => a.name).join(" / "))}</span>
        </div>`).join("");
    neteaseRecordList.querySelectorAll(".netease-song-row").forEach((row) => {
      row.addEventListener("click", () => {
        const idx = parseInt(row.dataset.idx);
        playNeteaseSongs(r.songs.slice(idx));
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

  function fmt(s) {
    if (!s || isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return m + ":" + (sec < 10 ? "0" : "") + sec;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  init();
})();
