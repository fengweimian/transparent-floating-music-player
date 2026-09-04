// 复现：模板三在线歌"上一首后歌词消失"
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");

app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("no-sandbox");

app.whenReady().then(async () => {
  try {
    ipcMain.handle("get-settings", () => ({}));
    ipcMain.handle("save-settings", () => {});
    ipcMain.handle("playlists:list", () => []);
    ipcMain.handle("fonts:list", () => ["微软雅黑"]);
    ipcMain.handle("music:url", () => "https://example.com/never.mp3");
    // lyric mock：每个 id 都返回带歌词（id 不同内容不同）
    let lrcCalls=0;
    ipcMain.handle("music:lyric", (e, id) => { lrcCalls++;
      const L = (t) => ({ lyric: `[00:00.00]${t}第一行\n[00:03.00]${t}第二行\n[00:06.00]${t}第三行`, tlyric: "", yrc: "" });
      return L("歌" + id + "·");
    });
    ["netease:login-status", "qqmusic:loginStatus", "kugou:loginStatus", "login:status"].forEach((c) => {
      try { ipcMain.handle(c, () => ({})); } catch (e) {}
    });

    const win = new BrowserWindow({
      show: true, width: 900, height: 640,
      webPreferences: { nodeIntegration: false, contextIsolation: true, preload: path.join(__dirname, "..", "preload.js") },
    });
    const errors = [];
    win.webContents.on("console-message", (e, level, message) => {
      if (level === 2 && !/No handler registered/.test(message)) errors.push(String(message).slice(0, 150));
    });

    const file = path.join(__dirname, "..", "renderer", "template3", "index.html");
    await win.loadFile(file);
    await new Promise((r) => setTimeout(r, 800));

    // 注入 3 首在线歌恢复状态（currentIndex=1 即第 2 首）→ 模拟"正在播放第2首"
    const state = JSON.stringify({
      playlist: [
        { type: "online", id: "111", server: "netease", name: "曲一", artist: "歌手A", url: "https://example.com/1.mp3" },
        { type: "online", id: "222", server: "netease", name: "曲二", artist: "歌手B", url: "https://example.com/2.mp3" },
        { type: "online", id: "333", server: "netease", name: "曲三", artist: "歌手C", url: "https://example.com/3.mp3" },
      ],
      currentIndex: 1, currentTime: 5, playing: true, volume: 0.8, mode: "sequential",
    });
    await win.webContents.executeJavaScript(`localStorage.setItem("music-player-state", ${JSON.stringify(state)}); localStorage.setItem("xf-settings", "{}")`);
    // 重新加载 → 自动恢复播放第 2 首（idx1）
    await win.loadFile(file);
    await new Promise((r) => setTimeout(r, 2500));

    const checkLrc = () => win.webContents.executeJavaScript(`(() => {
      const slot = document.querySelector(".lrc.cur");
      const all = [...document.querySelectorAll("#lrc-col .lrc")].map(el => el.textContent);
      return { cur: slot ? slot.textContent : "NO-SLOT", all: all.filter(t => t && t !== "暂无歌词 · 点击右上角 ⋯ 搜索歌曲"), hasLyricText: all.some(t => t.includes("第一行") || t.includes("第二行") || t.includes("第三行")) };
    })()`);

    console.log("=== 初始（恢复播放第2首 idx1）===");
    console.log(JSON.stringify(await checkLrc()));
        await new Promise((r) => setTimeout(r, 1500));

    // 点击"上一首"→ idx0
    console.log("=== 点击上一首（idx1→idx0）后 ===");
    await win.webContents.executeJavaScript(`document.getElementById("btn-prev").click()`);
    await new Promise((r) => setTimeout(r, 2500)); // 等歌词异步拉取
    console.log(JSON.stringify(await checkLrc()));

    // 再点下一首回到 idx1（对照）
    console.log("=== 再点下一首（idx0→idx1）后 ===");
    await win.webContents.executeJavaScript(`document.getElementById("btn-next").click()`);
    await new Promise((r) => setTimeout(r, 2500));
    console.log(JSON.stringify(await checkLrc()));

    console.log("lyric IPC 调用次数:", lrcCalls);
    console.log("=== 页面错误 ===");
    errors.slice(0, 8).forEach((e) => console.log("ERR:", e));
    app.quit();
  } catch (e) {
    console.error("测试异常:", e);
    app.exit(1);
  }
});
