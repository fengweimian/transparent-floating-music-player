// ============================================================
// 小风音乐 · 共享账号层（renderer/shared/account.js）
// 网易云 / QQ 音乐登录后数据（我的歌单/红心/每日推荐/最近听过）
// 仅桌面版可用（需主进程 weapi/QRC 通道）；浏览器预览返回 null
// ============================================================
(function () {
  "use strict";

  const isElectron = !!(window.electronAPI && window.electronAPI.netease && window.electronAPI.qqmusic);

  // ---------- 登录状态 ----------
  async function neteaseStatus() {
    if (!isElectron) return { loggedIn: false, electron: false };
    try {
      const r = await window.electronAPI.netease.loginStatus();
      return { loggedIn: !!(r && r.code === 200 && r.loggedIn), profile: (r && r.profile) || null, code: r && r.code };
    } catch (e) { return { loggedIn: false, error: e.message }; }
  }

  async function qqStatus() {
    if (!isElectron) return { loggedIn: false, electron: false };
    try {
      // ⚠️ 用纯本地的 loginStatus（读 cookie 文件，不联网）——与经典模板一致。
      //    之前用 user-info（联网调 c.y.qq.com 验证），SSL 抖动时会误判"未登录"，
      //    导致新模板永远显示未登录（经典模板读本地一直正常）。
      const r = await window.electronAPI.qqmusic.loginStatus();
      return {
        loggedIn: !!(r && r.loggedIn),
        user: (r && r.loggedIn) ? { nick: r.nickname || "", avatar: r.avatarUrl || "" } : null,
        code: (r && r.loggedIn) ? 200 : 301,
      };
    } catch (e) { return { loggedIn: false, error: e.message }; }
  }

  // ---------- 网易云 ----------
  // 我的歌单 → [{ id, name, trackCount, heart }]
  async function neteasePlaylists() {
    if (!isElectron) return null;
    try {
      const r = await window.electronAPI.netease.userPlaylists();
      if (r.code !== 200 || !r.playlists) return [];
      return r.playlists
        .slice()
        .sort((a, b) => (b.specialType === 5 ? 1 : 0) - (a.specialType === 5 ? 1 : 0))
        .map((p) => ({ id: p.id, name: p.name, trackCount: p.trackCount || 0, heart: p.specialType === 5, creator: p.creator || "" }));
    } catch (e) { return []; }
  }

  // 红心歌曲 → 统一歌曲列表
  async function neteaseLiked() {
    if (!isElectron) return null;
    try {
      const r = await window.electronAPI.netease.likedSongs();
      return mapNeteaseSongs(r);
    } catch (e) { return []; }
  }

  // 每日推荐 → { songs: [...], playlists: [...] }
  async function neteaseDaily() {
    if (!isElectron) return null;
    try {
      const [songsR, plsR] = await Promise.all([
        window.electronAPI.netease.dailySongs(),
        window.electronAPI.netease.dailyPlaylists(),
      ]);
      return {
        songs: (songsR.code === 200 && songsR.songs) ? mapNeteaseSongs({ songs: songsR.songs }) : [],
        playlists: (plsR.code === 200 && plsR.playlists) ? plsR.playlists.map((p) => ({ id: p.id, name: p.name, trackCount: p.trackCount || 0, pic: (p.coverImgUrl || p.picUrl) || "" })) : [],
      };
    } catch (e) { return { songs: [], playlists: [] }; }
  }

  // 最近听过 type=1 周 / 0 全部
  async function neteaseRecord(type) {
    if (!isElectron) return null;
    try {
      const r = await window.electronAPI.netease.listenRecord(type);
      return mapNeteaseSongs(r);
    } catch (e) { return []; }
  }

  // 网易云歌曲统一结构（红心/每日/记录共用）
  function mapNeteaseSongs(r) {
    const list = (r && r.songs) || (r && r.list) || [];
    if (!Array.isArray(list)) return [];
    return list.map((s) => ({
      id: String(s.id || ""),
      server: "netease",
      name: s.name || s.title || "",
      artist: Array.isArray(s.ar) ? s.ar.map((a) => a.name).join(" / ") : (s.artists ? s.artists.map((a) => a.name).join(" / ") : (s.artist || "")),
      album: (s.al && s.al.name) || s.album || "",
      pic: (s.al && s.al.picUrl) || s.picUrl || (s.album && s.album.picUrl) || "",
      url: "",
      lrcUrl: "",
    }));
  }

  // ---------- QQ 音乐 ----------
  async function qqPlaylists() {
    if (!isElectron) return null;
    try {
      const r = await window.electronAPI.qqmusic.userPlaylists();
      if (r.code !== 200 || !r.playlists) return [];
      return r.playlists.map((p) => ({ id: p.id || p.tid || p.dirid, name: p.name || p.dirname || "", trackCount: p.songnum || p.cnt || 0, creator: "" }));
    } catch (e) { return []; }
  }

  async function qqCollectPlaylists() {
    if (!isElectron) return null;
    try {
      const r = await window.electronAPI.qqmusic.collectPlaylists();
      if (r.code !== 200 || !r.playlists) return [];
      return r.playlists.map((p) => ({ id: p.id || p.tid || p.dirid, name: p.name || p.dirname || "", trackCount: p.songnum || p.cnt || 0, creator: "" }));
    } catch (e) { return []; }
  }

  async function qqLiked() {
    if (!isElectron) return null;
    try {
      const r = await window.electronAPI.qqmusic.likedSongs();
      return mapQqSongs(r);
    } catch (e) { return []; }
  }

  async function qqDaily() {
    if (!isElectron) return null;
    try {
      const r = await window.electronAPI.qqmusic.daily();
      return {
        songs: (r.code === 200 && r.songs) ? mapQqSongs({ songs: r.songs }) : [],
        playlists: (r.code === 200 && r.playlists) ? r.playlists.map((p) => ({ id: p.id, name: p.name, trackCount: p.songnum || 0, pic: p.picUrl || "" })) : [],
      };
    } catch (e) { return { songs: [], playlists: [] }; }
  }

  function mapQqSongs(r) {
    const list = (r && r.songs) || (r && r.list) || [];
    if (!Array.isArray(list)) return [];
    return list.map((s) => ({
      id: String(s.id || s.songmid || s.mid || ""),
      server: "qq",
      name: s.name || s.title || "",
      artist: Array.isArray(s.singer) ? s.singer.map((x) => x.name).join(" / ") : (s.artist || ""),
      album: (s.album && s.album.name) || s.albumName || "",
      pic: s.picUrl || (s.album && s.album.mid ? "https://y.gtimg.cn/music/photo_new/T002R300x300M000" + s.album.mid + ".jpg" : ""),
      url: "",
      lrcUrl: "",
    }));
  }

  window.XFAccount = {
    isElectron,
    neteaseStatus,
    qqStatus,
    neteasePlaylists,
    neteaseLiked,
    neteaseDaily,
    neteaseRecord,
    qqPlaylists,
    qqCollectPlaylists,
    qqLiked,
    qqDaily,
  };
})();
