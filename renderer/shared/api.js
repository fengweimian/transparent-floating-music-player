// ============================================================
// 小风音乐 · 共享在线 API 层（renderer/shared/api.js）
// 在线搜索/歌词/歌单/下载：Electron 主进程优先（weapi/QRC 等完整能力），
// 浏览器预览时 fallback Meting 公共代理（api.i-meto.com）
// 两模板共用本模块，在线逻辑只在这里维护
// ============================================================
(function () {
  "use strict";

  const METING = "https://api.i-meto.com/meting/api";
  const isElectron = !!(window.electronAPI && window.electronAPI.music);

  // 主进程搜索 → 统一在线歌曲结构（供 buildOnlineSong 使用）
  function normalizeMainSong(s, server) {
    // QQ 音乐：pic 为空但 picId（专辑 mid）有值 → 直接拼 CDN 封面地址
    let pic = s.pic || "";
    if (!pic && (server === "qq" || server === "tencent") && s.picId) {
      pic = "https://y.gtimg.cn/music/photo_new/T002R300x300M000" + s.picId + ".jpg?max_age=2592000";
    }
    // 网易云：picId 直拼的 p1.music.126.net 格式实测 404，保留 pic 原值交给 onerror 降级
    return {
      name: s.name || s.title || "",
      artist: s.artist || s.author || "",
      id: String(s.id || s.url_id || ""),
      server: server === "tencent" ? "qq" : server,
      pic,
      picId: s.picId || s.pic_id || "",
      album: s.album || "",
      url: s.url || "",
      lrcUrl: s.lrc || "",
    };
  }

  // Meting 搜索 → 统一在线歌曲结构
  function normalizeMetingSong(s, server) {
    return {
      name: s.title || "",
      artist: s.author || "",
      id: String(s.url_id || s.pic_id || ""),
      server,
      pic: s.pic || "",
      picId: "",
      album: "",
      url: s.url || "",
      lrcUrl: s.lrc || "",
    };
  }

  // 统一 fetch（检测 CSP 拦截 → 明确提示）
  async function netFetch(url) {
    try {
      const res = await fetch(url);
      return await res.json();
    } catch (e) {
      const msg = String((e && e.message) || e);
      if (/Content Security Policy|CSP|Refused to connect/i.test(msg)) {
        throw new Error("浏览器安全策略(CSP)拦截了在线请求——请用浏览器直接打开本 HTML 文件（而非预览面板），在线功能即可使用");
      }
      throw e;
    }
  }

  // ---------- 在线搜索 ----------
  async function search(keyword, server) {
    if (!keyword || !keyword.trim()) return [];
    if (isElectron) {
      try {
        if (server === "gqh") {
          const raw = await window.electronAPI.music.gqhSearch(keyword);
          return Array.isArray(raw) ? raw.map((s) => normalizeMainSong(s, "gqh")) : [];
        }
        if (server === "gqb") {
          const raw = await window.electronAPI.music.gqbSearch(keyword);
          return Array.isArray(raw) ? raw.map((s) => normalizeMainSong(s, "gqb")) : [];
        }
        const raw = await window.electronAPI.music.search(keyword, server);
        return Array.isArray(raw) ? raw.map((s) => normalizeMainSong(s, server)) : [];
      } catch (e) {
        console.error("XFApi.search 主进程失败:", e.message);
        return [];
      }
    }
    // 浏览器 fallback：Meting 代理（网易云/QQ/酷狗；歌曲宝/全民K歌需桌面版）
    if (server === "gqb" || server === "gqh") {
      throw new Error("歌曲宝/全民K歌搜索需桌面版");
    }
    try {
      const data = await netFetch(METING + "?server=" + server + "&type=search&id=" + encodeURIComponent(keyword) + "&limit=30");
      if (!Array.isArray(data)) return [];
      return data.map((s) => normalizeMetingSong(s, server));
    } catch (e) {
      throw e;
    }
  }

  // ---------- 歌词（网易云含 yrc 逐字，QQ 含 qrc 逐字）----------
  async function lyric(id, server) {
    if (!id) return null;
    if (isElectron) {
      try {
        const r = await window.electronAPI.music.lyric(id, server);
        return r || null; // { lyric, tlyric, yrc / qrc }
      } catch (e) { return null; }
    }
    // 浏览器 fallback：Meting lrc（签名地址需 search 结果提供，这里直接用 lrcUrl）
    return null;
  }

  // ---------- 音频地址（主进程搜索返回的 url 为空，播放前需单独获取）----------
  async function url(id, server) {
    if (!id) return "";
    if (isElectron) {
      try {
        const r = await window.electronAPI.music.url(id, server);
        return (r && r.url) || "";
      } catch (e) { return ""; }
    }
    // 浏览器 fallback：Meting 搜索已带签名 url，直接返回空由调用方用 song.url
    return "";
  }

  // ---------- 封面补全（酷狗 getSongInfo / 歌曲宝详情页 mp3_cover / QQ picId 构造）----------
  async function pic(id, server, picId) {
    if (!id) return "";
    if (isElectron) {
      try {
        const r = await window.electronAPI.music.pic(id, server, picId || "");
        return (r && r.pic) || "";
      } catch (e) { return ""; }
    }
    return "";
  }

  // ---------- 歌单详情 ----------
  async function playlist(id, server) {
    if (isElectron) {
      try {
        const raw = await window.electronAPI.music.playlist(id, server);
        if (Array.isArray(raw)) return raw.map((s) => normalizeMainSong(s, server));
        return [];
      } catch (e) { return []; }
    }
    try {
      const res = await fetch(METING + "?server=" + server + "&type=playlist&id=" + id);
      const data = await res.json();
      if (!Array.isArray(data)) return [];
      return data.map((s) => normalizeMetingSong(s, server));
    } catch (e) { return []; }
  }

  // ---------- 歌单导入（主进程支持 QQ 短链跟随 302）----------
  async function importPlaylist(url) {
    if (isElectron) {
      return await window.electronAPI.music.importPlaylist(url);
    }
    // 浏览器 fallback：尝试 Meting playlist（QQ 短链不支持，返回 null）
    const m = String(url).match(/(\d{5,})/);
    if (!m) return null;
    const songs = await playlist(m[1], "netease");
    if (songs.length) return { name: "导入歌单 #" + m[1], songs, server: "netease", playlistId: m[1] };
    const qsongs = await playlist(m[1], "tencent");
    if (qsongs.length) return { name: "导入歌单 #" + m[1], songs: qsongs, server: "tencent", playlistId: m[1] };
    return null;
  }

  // ---------- 下载（主进程真实落盘 + 进度事件；浏览器用 a 标签）----------
  async function download(id, server, name, artist) {
    if (isElectron) {
      return await window.electronAPI.music.download(id, server, name, artist);
    }
    // 浏览器 fallback：直接打开 url（由调用方提供）
    return { success: false, error: "浏览器环境请直接播放（下载需桌面版）" };
  }

  window.XFApi = {
    isElectron,
    search,
    lyric,
    url,
    pic,
    playlist,
    importPlaylist,
    download,
  };
})();
