(async function () {
  "use strict";
  const $ = (s) => document.querySelector(s);

  const musicFolderEl = $("#music-folder");
  const imageFolderEl = $("#image-folder");
  const downloadFolderEl = $("#download-folder");
  const musicCountEl = $("#music-count");
  const imageCountEl = $("#image-count");
  const intervalSlider = $("#slideshow-interval");
  const intervalValue = $("#interval-value");
  const fontSizeSlider = $("#lyrics-font-size");
  const fontSizeValue = $("#font-size-value");
  const fontSelect = $("#lyrics-font");
  const fontCount = $("#font-count");
  const translationToggle = $("#show-translation");
  const desktopLyricsToggle = $("#desktop-lyrics-toggle");
  const charColorInput = $("#char-color");
  // 桌面歌词设置
  const dlFontSelect = $("#dl-font");
  const dlFontSize = $("#dl-font-size");
  const dlFontSizeValue = $("#dl-font-size-value");
  const dlPlayedColor = $("#dl-played-color");
  const dlUnplayedColor = $("#dl-unplayed-color");
  const dlOpacity = $("#dl-opacity");
  const dlOpacityValue = $("#dl-opacity-value");
  const dlBorder = $("#dl-border");
  const dlOverTaskbar = $("#dl-over-taskbar");
  const dlBold = $("#dl-bold");
  const saveBtn = $("#btn-save");
  const startupToggle = $("#startup-toggle");
  const themeSelect = $("#theme-select");

  // 登录相关 DOM
  const loginNot = $("#login-not");
  const loginYes = $("#login-yes");
  const loginUserInfo = $("#login-user-info");
  const loginVipInfo = $("#login-vip-info");
  const settingsLoginAvatar = $("#settings-login-avatar");
  const loginBtn = $("#btn-login");
  const loginQrArea = $("#login-qr-area");
  const loginQrImg = $("#login-qr-img");
  const loginQrStatus = $("#login-qr-status");
  const loginCancelBtn = $("#btn-login-cancel");
  const logoutBtn = $("#btn-logout");
  let loginPollTimer = null;
  let loginUnikey = "";

  // QQ 音乐登录相关 DOM
  const qqloginNot = $("#qqlogin-not");
  const qqloginYes = $("#qqlogin-yes");
  const qqloginUserInfo = $("#qqlogin-user-info");
  const settingsQqloginAvatar = $("#settings-qqlogin-avatar");
  const qqloginBtn = $("#btn-qqlogin");
  const qqlogoutBtn = $("#btn-qqlogout");

  let settings = await window.electronAPI.settings.get();

  // 回填歌词字体选择（populate 与字体列表加载完成后都要调用）
  // ⚠️ 字体列表是异步加载的，若在加载完成前回填（options 只有"默认"），保存的字体选不上
  function applyFontSelections() {
    if (settings.lyricsFont && [...fontSelect.options].some((o) => o.value === settings.lyricsFont)) {
      fontSelect.value = settings.lyricsFont;
    }
    if (settings.desktopLyricsFont && [...dlFontSelect.options].some((o) => o.value === settings.desktopLyricsFont)) {
      dlFontSelect.value = settings.desktopLyricsFont;
    }
  }

  // 加载系统字体列表
  (async function loadFonts() {
    try {
      const fonts = await window.electronAPI.fonts.list();
      fonts.forEach((f) => {
        const opt = document.createElement("option");
        opt.value = f;
        opt.textContent = f;
        fontSelect.appendChild(opt);
        const opt2 = document.createElement("option");
        opt2.value = f;
        opt2.textContent = f;
        dlFontSelect.appendChild(opt2);
      });
      fontCount.textContent = `${fonts.length} 个可用字体`;
      // ⚠️ 字体列表就绪后再回填保存的字体（否则设置丢失显示"默认"）
      applyFontSelections();
    } catch (e) {
      fontCount.textContent = "字体加载失败";
    }
  })();

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme || "aurora";
  }

  // 主题切换实时预览
  themeSelect.addEventListener("change", () => {
    applyTheme(themeSelect.value);
  });

  function populate() {
    if (settings.theme) themeSelect.value = settings.theme;
    applyTheme(settings.theme);
    if (settings.musicFolder) {
      musicFolderEl.value = settings.musicFolder;
      scanCount("music", settings.musicFolder);
    }
    if (settings.imageFolder) {
      imageFolderEl.value = settings.imageFolder;
      scanCount("image", settings.imageFolder);
    }
    if (settings.downloadFolder) {
      downloadFolderEl.value = settings.downloadFolder;
    }
    intervalSlider.value = settings.slideshowInterval || 8;
    intervalValue.textContent = intervalSlider.value + "s";
    fontSizeSlider.value = settings.lyricsFontSize || 22;
    fontSizeValue.textContent = fontSizeSlider.value + "px";
    applyFontSelections();
    translationToggle.checked = !!settings.showTranslation;
    desktopLyricsToggle.checked = !!settings.desktopLyrics;
    if (settings.charColor) charColorInput.value = settings.charColor;
    startupToggle.checked = !!settings.startup;
    // 桌面歌词设置
    document.querySelector(`input[name="dl-lines"][value="${settings.desktopLyricsLines === 2 ? 2 : 1}"]`).checked = true;
    if (settings.desktopLyricsPlayedColor) dlPlayedColor.value = settings.desktopLyricsPlayedColor;
    dlFontSize.value = settings.desktopLyricsFontSize || 36;
    dlFontSizeValue.textContent = dlFontSize.value;
    if (settings.desktopLyricsUnplayedColor) dlUnplayedColor.value = settings.desktopLyricsUnplayedColor;
    dlOpacity.value = settings.desktopLyricsOpacity != null ? settings.desktopLyricsOpacity : 1;
    dlOpacityValue.textContent = Math.round(dlOpacity.value * 100) + "%";
    dlBorder.checked = !!settings.desktopLyricsBorder;
    dlOverTaskbar.checked = settings.desktopLyricsOverTaskbar !== false;
    dlBold.checked = !!settings.desktopLyricsBold;
  }

  async function scanCount(type, folder) {
    if (type === "music") {
      const files = await window.electronAPI.fs.scanFiles(folder, [
        ".mp3", ".wav", ".ogg", ".flac", ".aac", ".m4a", ".wma", ".opus"
      ]);
      musicCountEl.textContent = files.length + " 个音频文件";
    } else {
      const images = await window.electronAPI.fs.scanFiles(folder, [
        ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"
      ]);
      const videos = await window.electronAPI.fs.scanFiles(folder, [
        ".mp4", ".webm", ".mov", ".avi", ".mkv"
      ]);
      imageCountEl.textContent = images.length + " 张图片, " + videos.length + " 个视频";
    }
  }

  $("#btn-music").addEventListener("click", async () => {
    const folder = await window.electronAPI.dialog.selectFolder();
    if (folder) {
      musicFolderEl.value = folder;
      settings.musicFolder = folder;
      scanCount("music", folder);
    }
  });

  $("#btn-image").addEventListener("click", async () => {
    const folder = await window.electronAPI.dialog.selectFolder();
    if (folder) {
      imageFolderEl.value = folder;
      settings.imageFolder = folder;
      scanCount("image", folder);
    }
  });

  $("#btn-download").addEventListener("click", async () => {
    const folder = await window.electronAPI.dialog.selectFolder();
    if (folder) {
      downloadFolderEl.value = folder;
      settings.downloadFolder = folder;
    }
  });

  intervalSlider.addEventListener("input", () => {
    intervalValue.textContent = intervalSlider.value + "s";
  });

  fontSizeSlider.addEventListener("input", () => {
    fontSizeValue.textContent = fontSizeSlider.value + "px";
  });

  dlFontSize.addEventListener("input", () => {
    dlFontSizeValue.textContent = dlFontSize.value;
  });
  dlOpacity.addEventListener("input", () => {
    dlOpacityValue.textContent = Math.round(dlOpacity.value * 100) + "%";
  });

  saveBtn.addEventListener("click", async () => {
    const update = {
      musicFolder: settings.musicFolder || "",
      imageFolder: settings.imageFolder || "",
      downloadFolder: settings.downloadFolder || "",
      slideshowInterval: parseInt(intervalSlider.value),
      lyricsFontSize: parseInt(fontSizeSlider.value),
      lyricsFont: fontSelect.value || "",
      showTranslation: translationToggle.checked,
      desktopLyrics: desktopLyricsToggle.checked,
      charColor: charColorInput.value || "#ff4d4f",
      startup: startupToggle.checked,
      theme: themeSelect.value || "aurora",
      // 桌面歌词设置
      desktopLyricsLines: parseInt(document.querySelector('input[name="dl-lines"]:checked').value) || 1,
      desktopLyricsFont: dlFontSelect.value || "微软雅黑",
      desktopLyricsFontSize: parseInt(dlFontSize.value) || 36,
      desktopLyricsPlayedColor: dlPlayedColor.value || "#ffffff",
      desktopLyricsUnplayedColor: dlUnplayedColor.value || "#9a9aa8",
      desktopLyricsOpacity: parseFloat(dlOpacity.value) || 1,
      desktopLyricsBorder: dlBorder.checked,
      desktopLyricsOverTaskbar: dlOverTaskbar.checked,
      desktopLyricsBold: dlBold.checked,
    };
    await window.electronAPI.settings.save(update);
    await window.electronAPI.settings.setStartup(startupToggle.checked);
    // 通知桌面歌词窗口立即应用新设置
    if (desktopLyricsToggle.checked) {
      window.electronAPI.desktopLyrics.applySettings();
    }

    saveBtn.textContent = "已保存!";
    saveBtn.style.background = "linear-gradient(135deg, rgba(100,255,100,0.3), rgba(100,200,100,0.3))";
    setTimeout(() => {
      saveBtn.textContent = "保存并应用";
      saveBtn.style.background = "";
    }, 1500);
  });

  // ========== 网易云登录 ==========
  function stopLoginPoll() {
    if (loginPollTimer) { clearInterval(loginPollTimer); loginPollTimer = null; }
  }

  function showLoginState(loggedIn, nickname) {
    if (loggedIn) {
      loginNot.style.display = "none";
      loginYes.style.display = "";
      loginUserInfo.textContent = `已登录：${nickname || "网易云用户"}`;
      // 头像 + VIP
      window.electronAPI.login.status().then((st) => {
        if (st.avatarUrl) {
          settingsLoginAvatar.src = st.avatarUrl.replace(/^http:/, "https:");
          settingsLoginAvatar.style.display = "";
        } else {
          settingsLoginAvatar.style.display = "none";
        }
        const vipNames = { 0: "", 11: "VIP", 111: "黑胶 VIP" };
        loginVipInfo.textContent = st.vipType ? (vipNames[st.vipType] || "VIP") : "";
      });
    } else {
      loginYes.style.display = "none";
      loginNot.style.display = "";
    }
  }

  async function refreshLoginStatus() {
    const st = await window.electronAPI.login.status();
    showLoginState(st.loggedIn, st.nickname);
  }

  // ===== QQ 音乐登录状态 =====
  function showQqloginState(loggedIn, nickname, avatarUrl) {
    if (loggedIn) {
      qqloginNot.style.display = "none";
      qqloginYes.style.display = "";
      qqloginUserInfo.textContent = `已登录：${nickname || "QQ音乐用户"}`;
      if (avatarUrl) {
        settingsQqloginAvatar.src = avatarUrl.replace(/^http:/, "https:");
        settingsQqloginAvatar.style.display = "";
      } else {
        settingsQqloginAvatar.style.display = "none";
      }
    } else {
      qqloginYes.style.display = "none";
      qqloginNot.style.display = "";
    }
  }

  async function refreshQqloginStatus() {
    const st = await window.electronAPI.qqmusic.loginStatus();
    showQqloginState(st.loggedIn, st.nickname, st.avatarUrl);
  }

  qqloginBtn.addEventListener("click", async () => {
    const r = await window.electronAPI.qqmusic.login();
    if (r && r.success) {
      qqloginNot.querySelector(".info").textContent = "已打开登录窗口，请扫码/账号登录，登录成功窗口自动关闭。";
    }
  });
  qqlogoutBtn.addEventListener("click", async () => {
    const ok = await window.electronAPI.dialog.confirm("退出QQ音乐登录", "退出后 QQ 音乐的歌单/每日推荐/最近听过将不可用。确定退出吗？");
    if (!ok) return;
    await window.electronAPI.qqmusic.logout();
    showQqloginState(false);
  });
  // QQ 音乐登录状态变化（main.js 广播）→ 更新设置页
  window.electronAPI.qqmusic.onLoginChanged((data) => {
    if (data && data.loggedIn) {
      showQqloginState(true, data.nickname, data.avatarUrl);
    } else {
      showQqloginState(false);
    }
  });
  refreshQqloginStatus();

  async function startLogin() {
    stopLoginPoll();
    // 网易云 2025 起对非官方客户端扫码接口全部拦截（8821 行为验证风控），
    // 自研 weapi 二维码不再可用。改为打开官方登录页（真实浏览器环境），
    // 扫码成功后 main.js 自动捕获 cookie 并广播。
    loginQrStatus.textContent = "正在打开网易云登录窗口...";
    const r = await window.electronAPI.login.openWindow();
    if (r && r.success) {
      loginQrStatus.textContent = "已打开登录窗口，请扫码并授权";
    } else {
      loginQrStatus.textContent = "打开登录窗口失败，请重试";
    }
  }

  function cancelLogin() {
    stopLoginPoll();
    loginQrArea.style.display = "none";
    loginBtn.style.display = "";
  }

  loginBtn.addEventListener("click", startLogin);
  loginCancelBtn.addEventListener("click", cancelLogin);
  logoutBtn.addEventListener("click", async () => {
    const ok = await window.electronAPI.dialog.confirm("退出登录", "退出后逐字歌词将不可用（其他功能不受影响）。确定退出吗？");
    if (!ok) return;
    await window.electronAPI.login.logout();
    showLoginState(false);
  });

  // 主窗口右上角点击登录 → 自动弹出扫码
  window.electronAPI.settings.onAutoLogin(() => {
    startLogin();
  });

  // 官方登录窗口扫码成功后（main.js 广播）→ 更新设置页登录状态
  window.electronAPI.login.onLoginChanged((data) => {
    if (data && data.loggedIn) {
      stopLoginPoll();
      loginQrStatus.textContent = "登录成功！";
      loginQrArea.style.display = "none";
      loginBtn.style.display = "";
      showLoginState(true, data.nickname || "网易云用户");
    } else {
      showLoginState(false);
    }
  });

  // 初始加载登录状态
  refreshLoginStatus();

  populate();
})();
