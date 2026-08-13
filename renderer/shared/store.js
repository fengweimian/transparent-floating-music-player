// ============================================================
// 小风音乐 · 共享存储层（renderer/shared/store.js）
// 歌单 + 设置统一存储：Electron 主进程优先（两模板数据互通），
// 浏览器预览时 fallback localStorage（纯前端可用）
// 经典模板与新模板共用本模块，公共逻辑只在这里维护
// ============================================================
(function () {
  "use strict";

  const LS_SETTINGS = "xf-settings";
  const LS_PLAYLISTS = "xf-playlists";

  const isElectron = !!(window.electronAPI && window.electronAPI.settings && window.electronAPI.playlists);

  // ---------- 浏览器 fallback：localStorage 读写 ----------
  function lsGet(key, def) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : def;
    } catch (e) { return def; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* 忽略 */ }
  }

  // ---------- 设置 ----------
  async function getSettings() {
    if (isElectron) {
      return await window.electronAPI.settings.get();
    }
    return lsGet(LS_SETTINGS, {});
  }

  async function saveSettings(update) {
    if (isElectron) {
      const saved = await window.electronAPI.settings.save(update);
      return saved;
    }
    const cur = lsGet(LS_SETTINGS, {});
    const merged = { ...cur, ...update };
    lsSet(LS_SETTINGS, merged);
    return merged;
  }

  // ---------- 歌单（主进程结构：{ name, songs, source, createdAt }）----------
  async function getPlaylists() {
    if (isElectron) {
      const list = await window.electronAPI.playlists.list();
      return Array.isArray(list) ? list : [];
    }
    return lsGet(LS_PLAYLISTS, []);
  }

  async function addPlaylist(name, songs) {
    if (isElectron) {
      return await window.electronAPI.playlists.add(name, songs);
    }
    const list = lsGet(LS_PLAYLISTS, []);
    const pl = { name, songs: songs || [], source: "manual", createdAt: new Date().toISOString() };
    list.push(pl);
    lsSet(LS_PLAYLISTS, list);
    return pl;
  }

  async function removePlaylist(index) {
    if (isElectron) {
      return !!(await window.electronAPI.playlists.remove(index));
    }
    const list = lsGet(LS_PLAYLISTS, []);
    if (index < 0 || index >= list.length) return false;
    list.splice(index, 1);
    lsSet(LS_PLAYLISTS, list);
    return true;
  }

  async function renamePlaylist(index, name) {
    if (isElectron) {
      return !!(await window.electronAPI.playlists.rename(index, name));
    }
    const list = lsGet(LS_PLAYLISTS, []);
    if (index < 0 || index >= list.length) return false;
    list[index].name = name;
    lsSet(LS_PLAYLISTS, list);
    return true;
  }

  async function removeSong(playlistIndex, songIndex) {
    if (isElectron) {
      return !!(await window.electronAPI.playlists.removeSong(playlistIndex, songIndex));
    }
    const list = lsGet(LS_PLAYLISTS, []);
    if (playlistIndex < 0 || playlistIndex >= list.length) return false;
    const pl = list[playlistIndex];
    if (!pl || !Array.isArray(pl.songs) || songIndex < 0 || songIndex >= pl.songs.length) return false;
    pl.songs.splice(songIndex, 1);
    lsSet(LS_PLAYLISTS, list);
    return true;
  }

  async function addSongsToPlaylist(playlistIndex, songs) {
    if (isElectron) {
      return await window.electronAPI.playlists.addSongs(playlistIndex, songs);
    }
    const list = lsGet(LS_PLAYLISTS, []);
    if (playlistIndex < 0 || playlistIndex >= list.length) return null;
    list[playlistIndex].songs = (list[playlistIndex].songs || []).concat(songs || []);
    lsSet(LS_PLAYLISTS, list);
    return list[playlistIndex];
  }

  async function saveImport(name, songs, importUrl) {
    if (isElectron) {
      return await window.electronAPI.playlists.saveImport(name, songs, importUrl);
    }
    return addPlaylist(name, songs);
  }

  window.XFStore = {
    isElectron,
    getSettings,
    saveSettings,
    getPlaylists,
    addPlaylist,
    removePlaylist,
    renamePlaylist,
    removeSong,
    addSongsToPlaylist,
    saveImport,
  };
})();
