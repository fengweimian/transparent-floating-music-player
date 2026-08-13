// 验证：打开 QQ 登录窗口后，session 里是否残留旧 qm_keyst（→ 轮询误判 → 主动 close）
const path = require("path");
const { app, BrowserWindow } = require("electron");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  try {
    require(path.join(__dirname, "..", "main.js"));
    await sleep(3000);
    const wins = BrowserWindow.getAllWindows();
    const main = wins.find((w) => w.webContents.getURL().includes("renderer/index.html") || w.webContents.getURL().includes("template2"));
    if (!main) throw new Error("未找到主窗口");

    // 触发 QQ 登录
    await main.webContents.executeJavaScript("window.electronAPI.qqmusic.login()");
    await sleep(3000);

    const qqWin = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("y.qq.com"));
    if (!qqWin) { console.log("❌ 窗口已消失（可能已被轮询 close）"); app.exit(1); return; }

    // 检查该窗口 session 的 cookie
    const cookies = await qqWin.webContents.session.cookies.get({});
    const qq = cookies.filter((c) => /qq\.com|gtimg/.test(c.domain || ""));
    const keyst = qq.find((c) => (c.name === "qm_keyst" || c.name === "qqmusic_key") && c.value && c.value.length > 20);
    const uin = qq.find((c) => c.name === "uin" && c.value && c.value !== "0");
    console.log("QQ 相关 cookie 数:", qq.length);
    console.log("含 qm_keyst/qqmusic_key:", keyst ? "⚠️ 有残留（长度 " + keyst.value.length + "）→ 会误判登录成功!" : "无");
    console.log("uin cookie:", uin ? uin.value : "无");
    console.log("cookie 名列表:", qq.map((c) => c.name + "@" + c.domain).slice(0, 12).join(", "));

    // 窗口当前状态
    console.log("窗口仍存在:", !qqWin.isDestroyed() ? "✓" : "✘");
    if (!qqWin.isDestroyed()) qqWin.close();
    app.exit(0);
  } catch (e) {
    console.error("❌ 验证异常:", e.message);
    app.exit(2);
  }
});
