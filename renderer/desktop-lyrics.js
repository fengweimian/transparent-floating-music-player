// 桌面歌词窗口逻辑
// 复用 lyrics.js 的 Lyrics 解析器（仅解析，不依赖主窗口 DOM）
const parser = new Lyrics(null, null);

const prevEl = document.getElementById("dl-prev");
const currentEl = document.getElementById("dl-current");
const nextEl = document.getElementById("dl-next");
const emptyEl = document.getElementById("dl-empty");
const closeBtn = document.getElementById("dl-close");
const openMainBtn = document.getElementById("dl-open-main");
const prevBtn = document.getElementById("dl-prev-btn");
const playBtn = document.getElementById("dl-play-btn");
const nextBtn = document.getElementById("dl-next-btn");
const lockBtn = document.getElementById("dl-lock-btn");
const settingsBtn = document.getElementById("dl-settings-btn");
const hoverZone = document.getElementById("dl-hover-zone");
const controls = document.getElementById("dl-controls");

// 控制栏显示/隐藏：鼠标移到顶部 hover 触发区显示；移出控制栏隐藏
// （整窗是 drag 区不接收鼠标事件，只能用 no-drag 的 hover 触发区）
// 锁定后 hover 顶部仍可显示控制栏（用于解锁）
hoverZone.addEventListener("mouseenter", () => {
  controls.style.display = "flex";
});
controls.addEventListener("mouseleave", () => {
  controls.style.display = "none";
});

let currentTrack = null;
let locked = false;
let isPlaying = false;
let dlSettings = {};
// 当前已渲染逐字歌词的行索引（行变化时才重建 DOM，渲染循环期间只更新 --scan-p）
let currentCharLineIdx = -1;
// 播放时间同步基准：主窗口 timeupdate 约 250ms 一次（~4fps），扫光需要 ~20fps。
// 方案：记录「主窗口最后报告的播放时间 + 收到时刻的墙上时钟」，本地高频推算当前时间
let syncPlayTime = 0; // 主窗口最后报告的 currentTime（秒）
let syncWallTime = 0; // 收到该时间时的 Date.now()
let localPlaying = false; // 播放状态（playstate 同步）

// 控制栏按钮
closeBtn.addEventListener("click", () => {
  window.electronAPI.desktopLyrics.close();
});
openMainBtn.addEventListener("click", () => {
  window.electronAPI.desktopLyrics.control("open-main");
});
prevBtn.addEventListener("click", () => {
  window.electronAPI.desktopLyrics.control("prev");
});
playBtn.addEventListener("click", () => {
  window.electronAPI.desktopLyrics.control("play");
});
nextBtn.addEventListener("click", () => {
  window.electronAPI.desktopLyrics.control("next");
});
settingsBtn.addEventListener("click", () => {
  window.electronAPI.desktopLyrics.control("settings");
});
lockBtn.addEventListener("click", () => {
  locked = !locked;
  document.body.classList.toggle("locked", locked);
  lockBtn.classList.toggle("dl-active", locked);
  lockBtn.textContent = locked ? "🔓" : "🔒";
});

// 应用桌面歌词设置（字体/字号/颜色/对齐/行数/透明度/描边/粗体）
function applySettings(s) {
  dlSettings = s || {};
  const style = document.documentElement.style;
  // 字体/字号
  const font = dlSettings.desktopLyricsFont || "微软雅黑";
  const size = dlSettings.desktopLyricsFontSize || 36;
  document.body.style.fontFamily = font + ', "Microsoft YaHei", "PingFang SC", sans-serif';
  // ⚠️ 官方双行（网易云/QQ音乐）：当前句与下一句字号相同，仅颜色/透明度区分
  currentEl.style.fontSize = size + "px";
  nextEl.style.fontSize = size + "px";
  // 已播/未播字色
  const played = dlSettings.desktopLyricsPlayedColor || "#ffffff";
  const unplayed = dlSettings.desktopLyricsUnplayedColor || "#9a9aa8";
  style.setProperty("--dl-played", played);
  style.setProperty("--dl-unplayed", unplayed);
  // 透明度
  const op = dlSettings.desktopLyricsOpacity != null ? dlSettings.desktopLyricsOpacity : 1;
  document.body.style.opacity = String(op);
  // 描边
  const border = !!dlSettings.desktopLyricsBorder;
  currentEl.style.textShadow = border
    ? "0 0 2px rgba(0,0,0,0.95), 0 0 8px rgba(0,0,0,0.6), 1px 1px 2px rgba(0,0,0,0.9)"
    : "0 2px 10px rgba(0, 0, 0, 0.8)";
  prevEl.style.textShadow = border ? "0 0 2px rgba(0,0,0,0.9)" : "0 1px 4px rgba(0, 0, 0, 0.7)";
  nextEl.style.textShadow = border ? "0 0 2px rgba(0,0,0,0.9)" : "0 1px 4px rgba(0, 0, 0, 0.7)";
  // 粗体
  currentEl.style.fontWeight = dlSettings.desktopLyricsBold ? "bold" : "600";
  // 行数：单行只显示当前句；双行 = 当前句 + 下一句（官方标准，无上一句）
  const lines = dlSettings.desktopLyricsLines === 2 ? 2 : 1;
  prevEl.style.display = "none"; // 上一句永远隐藏
  nextEl.style.display = lines === 2 ? "" : "none";
}

// 卡拉OK扫光前沿（--scan-p，0~100）：与主窗口 lyrics.js 的 updateCharProgress 完全对齐的两条时间轴
//   ① 有官方逐字（网易云 YRC / QQ QRC）→ 字级前沿 = (字索引 + 字内进度) / 总字数
//   ② 无逐字（酷狗 / 歌曲宝 / 歌曲海只给普通 LRC，或官方压根没出逐字）→ 行级前沿 = 行内播放进度
// ⚠️ v3.8.2 修复：本窗口此前只实现了 ①，② 直接退化成静态文本 →
//    酷狗《少年》《起风了》这类「源不给逐字」的歌，主界面有扫光（走的是②行级兜底）、桌面歌词完全没有。
function scanPercent(line, nextLine, time) {
  const chars = line.chars;
  if (chars && chars.length > 0) {
    // ① 字级前沿：当前时间落在第 i 个字内，前沿 = (i + 字内进度) / 总字数
    let i = 0;
    while (i < chars.length - 1 && time >= chars[i + 1].start) i++;
    const segEnd = i < chars.length - 1 ? chars[i + 1].start : chars[i].start + (chars[i].dur || 0.2);
    const segDur = Math.max(0.001, segEnd - chars[i].start);
    const inner = Math.max(0, Math.min(1, (time - chars[i].start) / segDur));
    return ((i + inner) / chars.length) * 100;
  }
  // ② 行级前沿（line.time 单位是【秒】，与主窗口一致：本行开始 → 下一行开始，末行 +6s 兜底）
  const start = line.time;
  const end = nextLine ? nextLine.time : start + 6;
  const segDur = Math.max(0.001, end - start);
  return Math.max(0, Math.min(1, (time - start) / segDur)) * 100;
}

function updateScanProgress(scanEl, line, nextLine, time) {
  if (!scanEl || !line) return;
  scanEl.style.setProperty("--scan-p", scanPercent(line, nextLine, time).toFixed(2) + "%");
}

// 渲染某时刻的歌词（单行/双行 + 卡拉OK扫光）
// ⚠️ v3.8.2：清空当前句内容时必须同步重置 currentCharLineIdx。
//   否则「行 idx 相同但 DOM 已被清空」时（如 seek 到首行之前再跳回来），
//   重建判定跳过 → querySelector('.dl-scan') 拿到 null → 该行永远不再扫光。
function renderAt(time) {
  if (!parser.hasLyrics || parser.lines.length === 0) {
    emptyEl.style.display = "block";
    prevEl.textContent = "";
    currentEl.textContent = "";
    nextEl.textContent = "";
    currentCharLineIdx = -1;
    return;
  }

  const idx = parser.findLine(time);
  if (idx < 0) {
    emptyEl.style.display = "block";
    prevEl.textContent = "";
    currentEl.textContent = "";
    nextEl.textContent = "";
    currentCharLineIdx = -1;
    return;
  }
  emptyEl.style.display = "none";

  // 双行模式（官方标准：当前句 + 下一句，无上一句）
  // ⚠️ 之前双行显示 3 行（上句+当前+下句）导致固定高度窗口挤压变形
  const lines = dlSettings.desktopLyricsLines === 2 ? 2 : 1;
  prevEl.textContent = ""; // 上一句不再显示
  nextEl.textContent = lines === 2 && idx < parser.lines.length - 1 ? parser.lines[idx + 1].text : "";

  // 当前句：卡拉OK扫光（整行渐变）——有官方逐字走①字级前沿，无逐字走②行级前沿（与主界面一致）
  // ⚠️ 流畅性优化：只在行变化时重建 innerHTML，渲染循环期间只更新 --scan-p（不重建 DOM）
  const line = parser.lines[idx];
  const nextLine = idx + 1 < parser.lines.length ? parser.lines[idx + 1] : null;
  const played = dlSettings.desktopLyricsPlayedColor || "#ffffff";
  const unplayed = dlSettings.desktopLyricsUnplayedColor || "#9a9aa8";
  if (currentCharLineIdx !== idx) {
    currentCharLineIdx = idx;
    // 有逐字 → 拼字（字级前沿）；无逐字 → 整行文本（行级前沿）。两者共用同一个 .dl-scan 容器。
    // ⚠️ v3.8.1 修复：Lyrics 类没有 escape() 方法（全仓库唯一引用点，主窗口用的是 XFUtils.escapeHtml）
    //  → 逐字歌词（网易云 YRC / QQ QRC）走到这里必抛 "parser.escape is not a function"，扫光失效。
    const scanText = line.chars && line.chars.length > 0
      ? line.chars.map((c) => XFUtils.escapeHtml(c.text)).join("")
      : XFUtils.escapeHtml(line.text);
    currentEl.innerHTML = `<span class="dl-scan" style="--scan-p:0%;--dl-played:${played};--dl-unplayed:${unplayed}">${scanText}</span>`;
  }
  // 每帧更新渐变前沿位置（光带从左到右推进，平滑连续）
  updateScanProgress(currentEl.querySelector(".dl-scan"), line, nextLine, time);
}

function clearLyrics() {
  parser.hasLyrics = false;
  parser.lines = [];
  emptyEl.style.display = "block";
  prevEl.textContent = "";
  currentEl.textContent = "";
  nextEl.textContent = "";
  currentCharLineIdx = -1;
}

// 播放状态图标（▶/⏸）
function updatePlayIcon(playing) {
  isPlaying = playing;
  playBtn.textContent = playing ? "⏸" : "▶";
}

// 监听主窗口转发的事件（trackchange / timeupdate）
window.electronAPI.desktopLyrics.onData(async (data) => {
  if (!data) return;

  if (data.type === "trackchange") {
    currentTrack = data.track;
    if (!currentTrack) {
      clearLyrics();
      return;
    }
    // 切歌：重新加载歌词（第三个参数 qrc/yrc 带逐字数据）
    try {
      const result = await window.electronAPI.music.lyric(currentTrack.id, currentTrack.server);
      if (result && result.lyric) {
        parser.parse(result.lyric, result.tlyric || "", result.qrc || result.yrc || "");
        parser.hasLyrics = parser.lines.length > 0;
        // ⚠️ v3.8.1 修复：换歌必须重置「已渲染逐字行」缓存。
        //   currentCharLineIdx 是跨歌的模块级状态，新歌第一行 idx=0 若与旧值相等，
        //   renderAt 会判定「行没变」而跳过重建 innerHTML → 短暂显示上一首的逐字内容（实测复现）。
        currentCharLineIdx = -1;
        renderAt(0);
      } else {
        clearLyrics();
      }
    } catch (e) {
      clearLyrics();
    }
  } else if (data.type === "timeupdate") {
    // 主窗口低频转发（~250ms）：timeupdate 到达即代表正在播放（新窗口打开时不会收到 playstate，
    // 只能靠这里启动本地渲染循环），只更新同步基准，高频渲染交给本地渲染循环
    localPlaying = true;
    syncPlayTime = data.currentTime;
    syncWallTime = Date.now();
    if (parser.hasLyrics && parser.lines.length > 0) {
      renderAt(data.currentTime); // 顺手立即渲染一次（响应 seek 等跳变）
    }
  } else if (data.type === "playstate") {
    updatePlayIcon(data.playing);
    localPlaying = data.playing;
    if (data.playing) syncWallTime = Date.now(); // 恢复播放：重置推算基准
  }
});

// 本地高频渲染循环（20fps，与首页歌词一致）：用推算时间驱动扫光，不再等低频 timeupdate
setInterval(() => {
  if (!localPlaying || !parser.hasLyrics || parser.lines.length === 0) return;
  // 推算当前播放时间 = 上次同步值 + 墙上时钟流逝（限幅 2s 防止主窗口卡顿/最小化时漂移）
  const drift = Math.min(2, (Date.now() - syncWallTime) / 1000);
  renderAt(syncPlayTime + drift);
}, 50);

// 设置变更（主设置窗口保存后推送）
window.electronAPI.desktopLyrics.onSettings((s) => {
  applySettings(s);
});

// 初始：读取当前设置
window.electronAPI.desktopLyrics.applySettings().then(() => {});
window.electronAPI.settings.get().then((s) => applySettings(s));

// 初始显示提示（等主窗口第一次转发）
emptyEl.style.display = "block";
currentEl.textContent = "";
