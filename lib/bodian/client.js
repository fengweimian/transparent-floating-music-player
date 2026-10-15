// ============================================================
// 小风音乐 · 波点音乐业务层（lib/bodian/client.js）
// 端点映射参考 MIT 许可的 MoeclubM/PyBodian；具体字段以实测响应为准
// ============================================================
"use strict";

const { createBodianClient, BodianError } = require("./http");
const { decodeLyrics } = require("./lyrics");

// 音质档位（hires 当前平台回退 lossless）
const QUALITIES = {
  standard: { format: "mp3", br: "128kmp3" },
  high: { format: "mp3", br: "320kmp3" },
  lossless: { format: "flac", br: "2000kflac" },
};

function pickString(...values) {
  for (const v of values) {
    if (v === undefined || v === null) continue;
    const s = String(v);
    if (s) return s;
  }
  return "";
}

function mediaId(value) {
  let id = String(value === undefined || value === null ? "" : value).trim();
  // 目录接口有时返回 "MUSIC_1234567" / "MUSIC_1234567_2" 形式
  const m = id.match(/^MUSIC_(\d+)/i);
  if (m) id = m[1];
  if (!/^\d+$/.test(id)) throw new BodianError("invalid-response", `非法波点歌曲 ID：${value}`);
  return id;
}

// 分页游标：⚠️ 必须用 nextOffset 续页，不能用 list.length 推算偏移
// firstPage=0 的接口（搜索/推荐）页号从 0 开始，firstPage=1 的接口（歌单/专辑/歌手）页号从 1 开始
function makePagination(params = {}, firstPage = 0) {
  const limit = Math.min(Math.max(Number(params.limit) || 20, 1), 100);
  const offset = Math.max(Number(params.offset) || 0, 0);
  const page = firstPage === 1 ? Math.floor(offset / limit) + 1 : offset;
  return { pn: String(page), rn: String(limit), offset, limit };
}

function slicePage(data, candidates, p) {
  let raw = [];
  for (const key of candidates) {
    if (Array.isArray(data && data[key])) { raw = data[key]; break; }
  }
  const hasMore = raw.length >= p.limit;
  return {
    list: raw,
    pagination: { nextOffset: p.offset + raw.length, hasMore },
  };
}

// ---------- 歌曲字段归一化 ----------
// ⚠️ 波点字段名不保证与文档一致，此处多路兜底；实测后按真实字段收敛（见 scripts/bodian-probe.cjs 输出）
function normalizeSong(raw) {
  if (!raw || typeof raw !== "object") return null;

  const prefixed = String(pickString(raw.id, raw.musicId, raw.rid, raw.musicrid, raw.songId, raw.audioId)).match(/^MUSIC_(\d+)/i);
  const id = prefixed ? prefixed[1] : pickString(raw.id, raw.musicId, raw.rid, raw.musicrid, raw.songId, raw.audioId);

  const artistRaw = raw.artist !== undefined ? raw.artist
    : raw.artistName !== undefined ? raw.artistName
    : raw.singer !== undefined ? raw.singer
    : raw.author;
  let artist = "";
  if (Array.isArray(artistRaw)) {
    artist = artistRaw.map((a) => (a && (a.name || a)) || "").filter(Boolean).join(" / ");
  } else if (artistRaw && typeof artistRaw === "object") {
    artist = String(artistRaw.name || "");
  } else {
    artist = String(artistRaw || "");
  }

  // 封面：可能是完整 URL、裸 hash，或相对路径
  let pic = pickString(raw.pic, raw.cover, raw.albumPic, raw.img);
  if (pic && !/^https?:/i.test(pic)) {
    if (/^[0-9a-f]{32}$/i.test(pic)) pic = `https://img1.kuwo.cn/star/albumcover/${pic}`;
    else if (pic.startsWith("/")) pic = `https://img1.kuwo.cn${pic}`;
    else pic = "";
  }

  const albumRaw = raw.album;
  const album = albumRaw && typeof albumRaw === "object"
    ? String(albumRaw.name || "")
    : pickString(albumRaw, raw.albumName);

  return {
    id,
    name: pickString(raw.name, raw.songName, raw.title),
    artist,
    album,
    pic,
    duration: Number(raw.duration || raw.songDuration || 0) || 0,
    // ⚠️ freeSign 是逐曲字段，播放权限与取址都依赖它——必须随歌曲一起保存
    freeSign: pickString(raw.freeSign, raw.fsig),
    raw,
  };
}

function createBodianApi({ deviceId, getSession = () => null, now = Date.now } = {}) {
  const client = createBodianClient({ deviceId, getSession, now });
  const call = async (path, opts) => (await client.call(`/api/${path}`, opts)).data;

  // ---------- 目录 ----------
  async function search(keyword, params = {}) {
    const kw = String(keyword || "").trim();
    if (!kw) throw new BodianError("invalid-response", "搜索关键词为空");
    const p = makePagination(params, 0);
    const data = await call("search/music/list", {
      params: { keyword: kw, correct: 1, pn: p.pn, rn: p.rn },
    });
    const page = slicePage(data, ["resultList", "list", "musicList"], p);
    return { songs: page.list.map(normalizeSong).filter(Boolean), pagination: page.pagination };
  }

  async function songDetail(id) {
    const data = await call("service/music/info", { params: { musicId: mediaId(id) } });
    return normalizeSong(data);
  }

  // ---------- 播放 ----------
  async function checkRight(id, freeSign = "") {
    const mid = mediaId(id);
    const sign = String(freeSign || "");
    const body = { musicId: Number(mid), freeSign: sign };
    const data = await call("play/music/v2/checkRight", {
      params: { musicId: mid, freeSign: sign },
      body,
      signed: true,
    });
    const status = Number(data && data.status);
    const audition = data && data.audition;
    return {
      status,
      preview: status === 3 && audition
        ? { start: Number(audition.start), end: Number(audition.end), url: String(audition.https || audition.url || "") }
        : null,
      raw: data,
    };
  }

  async function audioUrl(id, quality = "high", freeSign = "") {
    const mid = mediaId(id);
    const key = quality === "hires" ? "lossless" : quality;
    const fmt = QUALITIES[key];
    if (!fmt) throw new BodianError("unsupported", `不支持的波点音质：${quality}`);
    const sign = String(freeSign || "");
    // ⚠️ devId 必须进 body（协议要求），且 GET 请求要带精确 JSON body + 签名
    const body = { devId: deviceId, musicId: Number(mid), format: fmt.format, br: fmt.br, freeSign: sign };
    const data = await call("play/music/v2/audioUrl", {
      params: { devId: deviceId, musicId: mid, format: fmt.format, br: fmt.br, freeSign: sign },
      body,
      signed: true,
    });
    const url = pickString(data && data.audioHttpsUrl, data && data.audioUrl);
    if (!/^https?:\/\//i.test(url)) throw new BodianError("invalid-response", "波点未返回可用的音频地址");
    return { url, quality: key, raw: data };
  }

  // 统一取址：权限校验 → 试听判定 → 正式取址
  async function audio(id, params = {}) {
    const freeSign = String(params.freeSign || "");
    const right = await checkRight(id, freeSign);
    if (right.status === 3) {
      if (!right.preview || !right.preview.url) {
        throw new BodianError("not-playable", "该歌曲为试听且未返回试听地址");
      }
      return {
        url: right.preview.url,
        quality: "standard",
        preview: { startTime: right.preview.start, endTime: right.preview.end },
      };
    }
    if (right.status === 7) {
      throw new BodianError(
        getSession() ? "not-playable" : "auth-required",
        "该歌曲需要额外播放权限（可能需要登录或会员）"
      );
    }
    const got = await audioUrl(id, params.quality || "high", freeSign);
    return { url: got.url, quality: got.quality };
  }

  // ---------- 歌词 ----------
  async function lyrics(id) {
    const mid = mediaId(id);
    const query = `type=lyric&req=2&lrcx=1&rid=${mid}&songname=&artist=&corp=kuwo&fromchannel=bodian`;
    const data = (await client.call("/mobi.s", {
      lyric: true,
      params: { f: "bodian", q: Buffer.from(query, "utf8").toString("base64") },
    })).data;
    const content = data && data.content;
    if (typeof content !== "string" || !content) {
      throw new BodianError("invalid-response", "波点未返回歌词内容");
    }
    return decodeLyrics(content);
  }

  // ---------- 歌单 / 专辑 / 歌手 ----------
  async function playlistTracks(id, params = {}) {
    const p = makePagination(params, 1);
    const data = await call(`service/playlist/${mediaId(id)}/musicList`, {
      params: { source: String(params.source || 4), pn: p.pn, rn: p.rn },
    });
    const page = slicePage(data, ["list", "musicList", "resultList"], p);
    return { songs: page.list.map(normalizeSong).filter(Boolean), pagination: page.pagination };
  }

  async function playlistDetail(id, source = 4) {
    return await call(`service/playlist/info/${mediaId(id)}`, { params: { source: String(source) } });
  }

  async function albumTracks(id, params = {}) {
    const p = makePagination(params, 1);
    const data = await call(`service/album/music/${mediaId(id)}`, { params: { pn: p.pn, rn: p.rn } });
    const page = slicePage(data, ["resultList", "list", "musicList"], p);
    return { songs: page.list.map(normalizeSong).filter(Boolean), pagination: page.pagination };
  }

  async function artistSongs(id, params = {}) {
    const p = makePagination(params, 1);
    const data = await call(`service/artist/music/${mediaId(id)}`, { params: { pn: p.pn, rn: p.rn } });
    const page = slicePage(data, ["resultList", "list", "musicList"], p);
    return { songs: page.list.map(normalizeSong).filter(Boolean), pagination: page.pagination };
  }

  // ---------- 推荐 ----------
  async function recommendations(params = {}) {
    const p = makePagination(params, 0);
    const data = await call("service/music/recommendList", { params: { pn: p.pn, rn: p.rn } });
    return slicePage(data, ["resultList", "list", "musicList"], p).list.map(normalizeSong).filter(Boolean);
  }

  async function homeModule(moduleId = 1) {
    return await call("service/home/module", { params: { moduleId: String(moduleId) } });
  }

  return {
    search,
    songDetail,
    checkRight,
    audioUrl,
    audio,
    lyrics,
    playlistTracks,
    playlistDetail,
    albumTracks,
    artistSongs,
    recommendations,
    homeModule,
  };
}

module.exports = { QUALITIES, mediaId, normalizeSong, makePagination, createBodianApi };
