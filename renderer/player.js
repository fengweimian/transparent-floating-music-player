const STATE_KEY = "music-player-state";

class MusicPlayer {
  constructor() {
    this.audio = new Audio();
    this.playlist = [];
    this.currentIndex = -1;
    this.musicFolder = "";
    this.mode = "sequential";
    this._volume = 0.8;
    this.callbacks = {};
    this.currentTrack = null;

    // 切歌竞态防护：请求序号，只应用最后一次切歌的请求结果
    this._loadSeq = 0;
    // 连续播放错误计数（防止整列表不可播时无限跳歌）
    this._errorCount = 0;
    // 持久化
    this._saveTimer = null;
    this._lastTimeSave = 0;
    // 恢复进度（仅同一首歌时生效）
    this._restoreTime = 0;
    this._restoreTrackId = null;
    // v3.5.2 自动续播：保存时是否在播放（切换模板后自动继续，不丢播放状态）
    this._restorePlaying = false;

    this._loadState();

    this.audio.volume = this._volume;
    this.audio.crossOrigin = "anonymous";

    this.audio.addEventListener("timeupdate", () => {
      this._emit("timeupdate", { currentTime: this.audio.currentTime, duration: this.audio.duration });
      // 节流保存进度（每 5 秒）
      const now = Date.now();
      if (now - this._lastTimeSave > 5000) {
        this._lastTimeSave = now;
        this._saveState();
      }
    });
    this.audio.addEventListener("ended", () => { this._emit("ended"); this.next(); });
    this.audio.addEventListener("loadedmetadata", () =>
      this._emit("duration", { duration: this.audio.duration })
    );
    this.audio.addEventListener("play", () => {
      this._errorCount = 0;
      this._emit("play");
    });
    this.audio.addEventListener("pause", () => this._emit("pause"));
    this.audio.addEventListener("error", () => {
      const err = this.audio.error;
      let msg = "播放失败";
      if (err) {
        if (err.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) msg = "不支持的音频格式";
        else if (err.code === MediaError.MEDIA_ERR_NETWORK) msg = "网络错误或链接失效";
        else if (err.code === MediaError.MEDIA_ERR_DECODE) msg = "音频解码失败";
        else msg = "播放错误: " + (err.message || err.code);
      }
      console.error("Audio error:", msg, (this.audio.src || "").slice(0, 80));
      this._emit("error", { message: msg });
      // 连续失败 3 次停止自动切换，避免死循环跳歌
      this._errorCount++;
      if (this._errorCount >= 3) {
        this._emit("error", { message: msg + "（连续失败，已停止自动切换）" });
        return;
      }
      this.next();
    });
  }

  // ========== 持久化 ==========

  _loadState() {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (s && Array.isArray(s.playlist) && s.playlist.length > 0) {
        this.playlist = s.playlist;
        if (typeof s.currentIndex === "number" && s.currentIndex >= 0 && s.currentIndex < s.playlist.length) {
          this.currentIndex = s.currentIndex;
          this.currentTrack = s.playlist[s.currentIndex];
          this._restoreTime = s.currentTime || 0;
          this._restoreTrackId = String(s.playlist[s.currentIndex].id);
          // v3.5.2：保存时在播放 → 恢复后自动续播
          this._restorePlaying = !!s.playing;
        }
        if (s.mode) this.mode = s.mode;
        if (typeof s.volume === "number") this._volume = Math.max(0, Math.min(1, s.volume));
      }
    } catch (e) {
      console.warn("恢复播放状态失败:", e);
    }
  }

  _scheduleSave() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this._saveState(), 500);
  }

  _saveState() {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify({
        playlist: this.playlist,
        currentIndex: this.currentIndex,
        currentTime: this.currentIndex >= 0 ? (this.audio.currentTime || 0) : 0,
        volume: this._volume,
        mode: this.mode,
        // v3.5.2：记录是否在播放 → 切换模板后自动续播
        playing: !this.audio.paused,
      }));
    } catch (e) {}
  }

  // v3.5.2 自动续播：切换模板（reload）后若保存时在播放 → 恢复当前歌并继续（_loadAndPlay 内部 _applyRestore 会 seek 到上次进度）
  resumeIfNeeded() {
    if (!this._restorePlaying) return;
    this._restorePlaying = false;
    if (this.currentIndex >= 0 && this.currentIndex < this.playlist.length && this.currentTrack) {
      this._loadAndPlay(this.currentIndex);
    }
  }

  // ========== Events ==========

  on(event, cb) {
    if (!this.callbacks[event]) this.callbacks[event] = [];
    this.callbacks[event].push(cb);
  }

  _emit(event, data) {
    if (this.callbacks[event]) this.callbacks[event].forEach((cb) => cb(data));
  }

  // ========== Playlist ==========

  async setMusicFolder(folderPath) {
    this.musicFolder = folderPath;
    let localTracks = [];
    if (folderPath) {
      const files = await window.electronAPI.fs.scanFiles(folderPath, [
        ".mp3", ".wav", ".ogg", ".flac", ".aac", ".m4a", ".wma", ".opus"
      ]);
      localTracks = files.map((f) => ({
        type: "local",
        name: f,
        url: null,
        folder: folderPath,
        id: f,
        artist: "",
        pic: "",
      }));
    }
    const onlineTracks = this.playlist.filter((t) => t.type === "online");
    this.playlist = [...localTracks, ...onlineTracks];

    // 在线歌曲正在播放时，重定位 currentIndex（playlist 头部插入了本地歌）
    if (this.currentTrack && this.currentTrack.type === "online") {
      const idx = onlineTracks.findIndex((t) => t.id === this.currentTrack.id);
      this.currentIndex = idx >= 0 ? localTracks.length + idx : -1;
      if (this.currentIndex < 0) this.currentTrack = null;
    } else if (this.currentTrack && this.currentTrack.type === "local") {
      const idx = localTracks.findIndex((t) => t.id === this.currentTrack.id);
      this.currentIndex = idx;
    } else if (this.currentIndex < 0 && this.playlist.length > 0) {
      this.currentIndex = 0;
      await this._loadTrack(0);
    }
    this._saveState();
    return this.playlist.length > 0;
  }

  addOnlineSongs(songs, server = "netease") {
    const existingIds = new Set(this.playlist.filter((t) => t.type === "online").map((t) => t.id));
    let added = 0;
    for (const song of songs) {
      const sid = String(song.id || (song.url_id));
      if (existingIds.has(sid)) continue;
      existingIds.add(sid);
      this.playlist.push({
        type: "online",
        name: song.name || "",
        artist: Array.isArray(song.artist) ? song.artist.join(", ") : (song.artist || ""),
        id: sid,
        server: server,
        pic: song.pic || song.pic_id || "",
        picId: song.picId || song.pic_id || "",
        album: song.album || "",
      });
      added++;
    }
    if (added > 0) this._scheduleSave();
    return added;
  }

  clearOnlineSongs() {
    const wasPlayingOnline = this.currentTrack && this.currentTrack.type === "online";
    this.playlist = this.playlist.filter((t) => t.type === "local");
    if (wasPlayingOnline) {
      this.currentTrack = null;
      this.audio.pause();
      this.audio.removeAttribute("src");
      this.currentIndex = -1;
      if (this.playlist.length > 0) {
        this._loadAndPlay(0);
      } else {
        // 清空后无任何歌曲 → 通知 UI 清空歌词/歌名/封面
        this._emit("trackchange", null);
      }
    }
    this._saveState();
    return this.playlist.length;
  }

  removeTrack(index) {
    if (index < 0 || index >= this.playlist.length) return this.playlist.length;
    this.playlist.splice(index, 1);
    if (index === this.currentIndex) {
      this.audio.pause();
      this.audio.removeAttribute("src");
      if (this.playlist.length === 0) {
        this.currentIndex = -1;
        this.currentTrack = null;
        // 队列被移除到空 → 通知 UI 清空歌词/歌名/封面
        this._emit("trackchange", null);
      } else if (index >= this.playlist.length) {
        this._loadTrack(0);
      } else {
        this._loadTrack(index);
      }
    } else if (index < this.currentIndex) {
      this.currentIndex--;
    }
    this._saveState();
    return this.playlist.length;
  }

  getPlaylist() {
    return this.playlist;
  }

  // 把歌曲插入到当前播放之后（"下一曲播放"），不立即播放
  insertNext(songs, server = "netease") {
    const insertAt = this.currentIndex >= 0 ? this.currentIndex + 1 : 0;
    const existingIds = new Set(this.playlist.map((t) => t.id));
    let added = 0;
    // 逆序插入，保持原顺序（后插的在前）
    for (let i = songs.length - 1; i >= 0; i--) {
      const song = songs[i];
      const sid = String(song.id || (song.url_id));
      if (existingIds.has(sid)) continue;
      existingIds.add(sid);
      this.playlist.splice(insertAt, 0, {
        type: "online",
        name: song.name || "",
        artist: Array.isArray(song.artist) ? song.artist.join(", ") : (song.artist || ""),
        id: sid,
        server: song.server || server,
        pic: song.pic || song.pic_id || "",
        picId: song.picId || song.pic_id || "",
        album: song.album || "",
      });
      added++;
    }
    if (added > 0) this._scheduleSave();
    return added;
  }

  // 把队列中已存在的歌移到当前播放之后（播放列表面板的"下一曲"）
  moveToNext(index) {
    if (index < 0 || index >= this.playlist.length) return false;
    if (index === this.currentIndex) return false;
    const [track] = this.playlist.splice(index, 1);
    if (index < this.currentIndex) this.currentIndex--;
    const insertAt = this.currentIndex + 1;
    this.playlist.splice(insertAt, 0, track);
    this._scheduleSave();
    return true;
  }

  // ========== Playback ==========

  async playOnlineTrack(index) {
    if (index < 0 || index >= this.playlist.length) return;
    const track = this.playlist[index];
    if (track.type !== "online") {
      await this._loadAndPlay(index);
      return;
    }
    const seq = ++this._loadSeq;
    const result = { url: await XFApi.url(track.id, track.server) };
    if (seq !== this._loadSeq) return; // 已被更新的切歌请求取代
    if (!result || !result.url) {
      this._emit("error", { message: "无法获取播放地址" });
      return;
    }
    this.currentIndex = index;
    this.currentTrack = track;
    this.audio.src = result.url;
    this._applyRestore(track);
    this.audio.play().catch(() => {});
    this._emit("trackchange", { ...track });
    this._saveState();
  }

  async _loadTrack(index) {
    if (this.playlist.length === 0) return;
    const seq = ++this._loadSeq;
    this.currentIndex = index;
    const track = this.playlist[index];
    this.currentTrack = track;

    if (track.type === "online") {
      const result = { url: await XFApi.url(track.id, track.server) };
      if (seq !== this._loadSeq) return;
      if (!result || !result.url) {
        this._emit("error", { message: "无法获取播放地址" });
        return;
      }
      this.audio.src = result.url;
    } else {
      if (seq !== this._loadSeq) return;
      const fp = await window.electronAPI.path.join(track.folder || this.musicFolder, track.name);
      this.audio.src = "file:///" + fp.replace(/\\/g, "/");
    }
    this._applyRestore(track);
    this._emit("trackchange", { ...track });
    this._saveState();
  }

  async _loadAndPlay(index) {
    if (this.playlist.length === 0) return;
    const seq = ++this._loadSeq;
    const track = this.playlist[index];
    this.currentIndex = index;
    this.currentTrack = track;

    if (track.type === "online") {
      const result = { url: await XFApi.url(track.id, track.server) };
      if (seq !== this._loadSeq) return; // 竞态：已被更新的切歌取代
      if (!result || !result.url) {
        this._emit("error", { message: "无法获取播放地址" });
        return;
      }
      this.audio.src = result.url;
    } else {
      if (seq !== this._loadSeq) return;
      const fp = await window.electronAPI.path.join(track.folder || this.musicFolder, track.name);
      this.audio.src = "file:///" + fp.replace(/\\/g, "/");
    }
    this._applyRestore(track);
    this.audio.play().catch(() => {});
    this._emit("trackchange", { ...track });
    this._saveState();
  }

  // 恢复上次进度（仅当与保存时是同一首歌）
  _applyRestore(track) {
    if (!track) return;
    if (this._restoreTrackId === String(track.id) && this._restoreTime > 0) {
      const t = this._restoreTime;
      const id = this._restoreTrackId;
      this._restoreTime = 0;
      this._restoreTrackId = null;
      this.audio.addEventListener("loadedmetadata", function restore() {
        try { if (this.currentTime === 0 && this.duration) this.currentTime = Math.min(t, this.duration - 1); } catch (e) {}
        this.removeEventListener("loadedmetadata", restore);
      });
    } else {
      this._restoreTime = 0;
      this._restoreTrackId = null;
    }
  }

  playPause() {
    if (this.audio.paused) {
      if (this.audio.src) {
        this.audio.play().catch(() => {});
      } else if (this.playlist.length > 0) {
        // 恢复队列场景：从当前索引播放（而不是从 0）
        this._loadAndPlay(this.currentIndex >= 0 ? this.currentIndex : 0);
      }
    } else {
      this.audio.pause();
    }
  }

  next() {
    if (this.playlist.length === 0) return;
    let idx;
    if (this.mode === "random") {
      idx = Math.floor(Math.random() * this.playlist.length);
    } else if (this.mode === "single") {
      idx = this.currentIndex;
    } else {
      idx = (this.currentIndex + 1) % this.playlist.length;
    }
    this._loadAndPlay(idx);
  }

  prev() {
    if (this.playlist.length === 0) return;
    if (this.audio.currentTime > 3) {
      this.audio.currentTime = 0;
      return;
    }
    let idx;
    if (this.mode === "random") {
      idx = Math.floor(Math.random() * this.playlist.length);
    } else {
      idx = (this.currentIndex - 1 + this.playlist.length) % this.playlist.length;
    }
    this._loadAndPlay(idx);
  }

  seek(ratio) {
    if (this.audio.duration) this.audio.currentTime = ratio * this.audio.duration;
  }

  setVolume(v) {
    this._volume = Math.max(0, Math.min(1, v));
    this.audio.volume = this._volume;
    this._scheduleSave();
  }

  getVolume() { return this._volume; }
  getCurrentTime() { return this.audio.currentTime || 0; }
  getDuration() { return this.audio.duration || 0; }
  get isPlaying() { return !this.audio.paused; }

  cycleMode() {
    const modes = ["sequential", "random", "single"];
    const idx = modes.indexOf(this.mode);
    this.mode = modes[(idx + 1) % modes.length];
    this._scheduleSave();
    return this.mode;
  }
}
