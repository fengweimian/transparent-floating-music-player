const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  window: {
    close: () => ipcRenderer.invoke("window:close"),
    minimize: () => ipcRenderer.invoke("window:minimize"),
  },
  mouse: {
    setIgnore: (ignore) => ipcRenderer.invoke("set-ignore-mouse", ignore),
  },
  dialog: {
    selectFolder: () => ipcRenderer.invoke("dialog:selectFolder"),
    confirm: (title, message) => ipcRenderer.invoke("dialog:confirm", title, message),
  },
  fs: {
    scanFiles: (folderPath, extensions, recursive) =>
      ipcRenderer.invoke("fs:scanFiles", folderPath, extensions, recursive),
    readFile: (filePath) => ipcRenderer.invoke("fs:readFile", filePath),
    getFileName: (filePath) => ipcRenderer.invoke("fs:getFileName", filePath),
    findCover: (folderPath, trackFileName) => ipcRenderer.invoke("fs:findCover", folderPath, trackFileName),
  },
  path: {
    join: (...args) => ipcRenderer.invoke("path:join", ...args),
  },
  settings: {
    get: () => ipcRenderer.invoke("get-settings"),
    save: (settings) => ipcRenderer.invoke("save-settings", settings),
    openWindow: (autoLogin) => ipcRenderer.invoke("open-settings-window", !!autoLogin),
    setStartup: (enable) => ipcRenderer.invoke("set-startup", enable),
    onChanged: (callback) => {
      ipcRenderer.on("settings-changed", (_event, settings) => callback(settings));
    },
    onAutoLogin: (callback) => {
      ipcRenderer.on("settings:auto-login", () => callback());
    },
    onOpenPanel: (callback) => {
      ipcRenderer.on("settings:open-panel", () => callback());
    },
  },
  screen: {
    getSize: () => ipcRenderer.invoke("get-screen-size"),
  },
  fonts: {
    list: () => ipcRenderer.invoke("fonts:list"),
  },
  music: {
    search: (keyword, server) => ipcRenderer.invoke("music:search", keyword, server),
    gqhSearch: (keyword) => ipcRenderer.invoke("music:gqhSearch", keyword),
    gqbSearch: (keyword) => ipcRenderer.invoke("music:gqbSearch", keyword),
    songDetail: (id, server) => ipcRenderer.invoke("music:songDetail", id, server),
    url: (id, server) => ipcRenderer.invoke("music:url", id, server),
    lyric: (id, server) => ipcRenderer.invoke("music:lyric", id, server),
    pic: (id, server, picId) => ipcRenderer.invoke("music:pic", id, server, picId),
    playlist: (id, server) => ipcRenderer.invoke("music:playlist", id, server),
    importPlaylist: (url) => ipcRenderer.invoke("music:importPlaylist", url),
    download: (id, server, name, artist) => ipcRenderer.invoke("music:download", id, server, name, artist),
    onDownloadProgress: (callback) => {
      ipcRenderer.on("download:progress", (_event, info) => callback(info));
    },
  },
  shell: {
    showItemInFolder: (filePath) => ipcRenderer.invoke("shell:showItemInFolder", filePath),
  },
  playlists: {
    list: () => ipcRenderer.invoke("playlists:list"),
    add: (name, songs) => ipcRenderer.invoke("playlists:add", name, songs),
    remove: (index) => ipcRenderer.invoke("playlists:remove", index),
    addSongs: (playlistIndex, songs) => ipcRenderer.invoke("playlists:addSongsToPlaylist", playlistIndex, songs),
    saveImport: (name, songs, importUrl) => ipcRenderer.invoke("playlists:saveImport", name, songs, importUrl),
    removeSong: (playlistIndex, songIndex) => ipcRenderer.invoke("playlists:removeSong", playlistIndex, songIndex),
    rename: (playlistIndex, newName) => ipcRenderer.invoke("playlists:rename", playlistIndex, newName),
  },
  desktopLyrics: {
    toggle: (enabled) => ipcRenderer.invoke("desktop-lyrics:toggle", enabled),
    close: () => ipcRenderer.invoke("desktop-lyrics:close"),
    forward: (data) => ipcRenderer.invoke("desktop-lyrics:forward", data),
    control: (action) => ipcRenderer.invoke("desktop-lyrics:control", action),
    applySettings: () => ipcRenderer.invoke("desktop-lyrics:apply-settings"),
    onData: (callback) => {
      ipcRenderer.on("desktop-lyrics:data", (_event, data) => callback(data));
    },
    onControl: (callback) => {
      // 主窗口收到桌面歌词控制栏的播放控制
      ipcRenderer.on("desktop-lyrics-control", (_event, action) => callback(action));
    },
    onSettings: (callback) => {
      ipcRenderer.on("desktop-lyrics:settings", (_event, settings) => callback(settings));
    },
    // 桌面歌词窗口就绪 → 主窗口推送当前播放状态（新窗口收不到已发生的 trackchange）
    onReady: (callback) => {
      ipcRenderer.on("desktop-lyrics-ready", () => callback());
    },
  },
  login: {
    qrcode: () => ipcRenderer.invoke("login:qrcode"),
    poll: (unikey) => ipcRenderer.invoke("login:poll", unikey),
    openWindow: () => ipcRenderer.invoke("login:openWindow"),
    closeWindow: () => ipcRenderer.invoke("login:closeWindow"),
    status: () => ipcRenderer.invoke("login:status"),
    logout: () => ipcRenderer.invoke("login:logout"),
    onLoginChanged: (callback) => {
      ipcRenderer.on("netease-login-changed", (_event, data) => callback(data));
    },
  },
  netease: {
    // 登录后接口（②④⑤⑥⑪⑫）
    loginStatus: () => ipcRenderer.invoke("netease:login-status"),
    userPlaylists: () => ipcRenderer.invoke("netease:user-playlists"),
    likedSongs: () => ipcRenderer.invoke("netease:liked-songs"),
    dailySongs: () => ipcRenderer.invoke("netease:daily-songs"),
    dailyPlaylists: () => ipcRenderer.invoke("netease:daily-playlists"),
    listenRecord: (type) => ipcRenderer.invoke("netease:listen-record", type),
    scrobble: (songId, timeSeconds) => ipcRenderer.invoke("netease:scrobble", songId, timeSeconds),
  },
  qqmusic: {
    login: () => ipcRenderer.invoke("qqmusic:login"),
    loginStatus: () => ipcRenderer.invoke("qqmusic:loginStatus"),
    logout: () => ipcRenderer.invoke("qqmusic:logout"),
    refresh: () => ipcRenderer.invoke("qqmusic:refresh"),
    userInfo: () => ipcRenderer.invoke("qqmusic:user-info"),
    userPlaylists: () => ipcRenderer.invoke("qqmusic:user-playlists"),
    collectPlaylists: () => ipcRenderer.invoke("qqmusic:collect-playlists"),
    likedSongs: () => ipcRenderer.invoke("qqmusic:liked-songs"),
    daily: () => ipcRenderer.invoke("qqmusic:daily"),
    onLoginChanged: (callback) => {
      ipcRenderer.on("qqmusic-login-changed", (_event, data) => callback(data));
    },
  },
  kugou: {
    // 酷狗二维码登录（v3.3.0 新增，无风控）+ 登录后接口
    qrKey: () => ipcRenderer.invoke("kugou:qrKey"),
    qrCheck: (key) => ipcRenderer.invoke("kugou:qrCheck", key),
    loginStatus: () => ipcRenderer.invoke("kugou:loginStatus"),
    logout: () => ipcRenderer.invoke("kugou:logout"),
    userPlaylists: () => ipcRenderer.invoke("kugou:playlists"),
    daily: () => ipcRenderer.invoke("kugou:daily"),
    onLoginChanged: (callback) => {
      ipcRenderer.on("kugou-login-changed", (_event, data) => callback(data));
    },
  },
  app: {
    // 启动自检：检测已保存的网易云/QQ 登录态是否过期（不做登出，只报告）
    startupCheck: () => ipcRenderer.invoke("app:startup-check"),
    // 界面模板切换（classic/new）：保存设置并重载主窗口，进度通过 onTemplateSwitch 回调
    switchTemplate: (template) => ipcRenderer.invoke("app:switch-template", template),
    onTemplateSwitch: (callback) => {
      ipcRenderer.on("template-switch", (_event, data) => callback(data));
    },
  },
});
