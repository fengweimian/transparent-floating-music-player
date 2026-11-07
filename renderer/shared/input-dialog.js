// ============================================================
// 小风音乐 · 页面内输入弹层（renderer/shared/input-dialog.js）
//
// ⚠️ v3.11.0：替代 window.prompt()
//    Electron 内核**不支持** prompt —— 调用会直接 throw：
//      Uncaught Error: prompt() is not supported.
//    （alert / confirm 仍可用，只有 prompt 被禁）
//    之前四个新模板用 prompt 做「导入歌单 / 重命名歌单」，
//    结果「导入歌单」按钮点了毫无反应（异常冒在事件处理器里），
//    重命名则弹「导入失败：prompt() is not supported.」
//
// 用法：
//   const v = await XFDialog.input({ title:"重命名歌单", value: pl.name });
//   if (v === null) return;          // 用户取消
//   const url = await XFDialog.input({ title:"导入歌单", message:"粘贴链接…", okText:"解析" });
//
// 返回：Promise<string|null>（取消为 null）
// ============================================================
(function () {
  "use strict";

  const CSS_ID = "xf-input-dialog-style";
  let active = null;   // 同时只允许一个

  function ensureStyle() {
    if (document.getElementById(CSS_ID)) return;
    const st = document.createElement("style");
    st.id = CSS_ID;
    st.textContent = `
      .xfdlg-mask {
        position: fixed; inset: 0; z-index: 2147483000;
        display: flex; align-items: center; justify-content: center;
        background: rgba(0, 0, 0, 0.45);
        -webkit-backdrop-filter: blur(2px); backdrop-filter: blur(2px);
        animation: xfdlg-fade 0.15s ease-out;
        /* ⚠️ 无边框窗口里 body 常带 -webkit-app-region: drag，弹层必须显式取消，否则点不动 */
        -webkit-app-region: no-drag;
      }
      @keyframes xfdlg-fade { from { opacity: 0 } to { opacity: 1 } }
      @keyframes xfdlg-in { from { opacity: 0; transform: translateY(8px) scale(0.985) } to { opacity: 1; transform: none } }
      .xfdlg-card {
        width: min(430px, 86vw); box-sizing: border-box;
        padding: 20px 22px; border-radius: 14px;
        background: rgba(30, 32, 52, 0.98);
        border: 1px solid rgba(255, 255, 255, 0.14);
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.55);
        color: #fff; font-family: "Microsoft YaHei", "PingFang SC", "Segoe UI", system-ui, sans-serif;
        animation: xfdlg-in 0.18s ease-out;
        -webkit-app-region: no-drag;
      }
      .xfdlg-title { font-size: 15px; font-weight: 600; letter-spacing: 0.5px; margin-bottom: 8px; }
      .xfdlg-msg {
        font-size: 12.5px; line-height: 1.65; color: rgba(255, 255, 255, 0.62);
        margin-bottom: 14px; white-space: pre-wrap; word-break: break-word;
      }
      .xfdlg-input {
        width: 100%; box-sizing: border-box; padding: 10px 12px;
        border-radius: 9px; border: 1px solid rgba(255, 255, 255, 0.18);
        background: rgba(0, 0, 0, 0.3); color: #fff;
        font-size: 13px; font-family: inherit; outline: none;
        -webkit-app-region: no-drag;
      }
      .xfdlg-input::placeholder { color: rgba(255, 255, 255, 0.3); }
      .xfdlg-input:focus {
        border-color: rgba(120, 160, 255, 0.8);
        box-shadow: 0 0 0 3px rgba(120, 160, 255, 0.15);
      }
      .xfdlg-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; -webkit-app-region: no-drag; }
      .xfdlg-btn {
        padding: 7px 18px; border-radius: 8px; border: 1px solid transparent;
        font-size: 13px; font-family: inherit; cursor: pointer;
        transition: background 0.15s, border-color 0.15s;
        -webkit-app-region: no-drag;
      }
      .xfdlg-btn.ok { background: rgba(112, 152, 255, 0.92); color: #fff; }
      .xfdlg-btn.ok:hover { background: rgba(132, 168, 255, 1); }
      .xfdlg-btn.cancel { background: transparent; border-color: rgba(255, 255, 255, 0.2); color: rgba(255, 255, 255, 0.72); }
      .xfdlg-btn.cancel:hover { background: rgba(255, 255, 255, 0.08); }
    `;
    document.head.appendChild(st);
  }

  function input(opts) {
    opts = opts || {};
    ensureStyle();
    // 已有弹层时复用它（避免叠加/重复弹两个）
    if (active) return active.promise;

    let resolveFn = null;
    const promise = new Promise(function (res) { resolveFn = res; });
    const state = { open: true, promise: promise };
    active = state;

    const mask = document.createElement("div");
    mask.className = "xfdlg-mask";

    const card = document.createElement("div");
    card.className = "xfdlg-card";

    const title = document.createElement("div");
    title.className = "xfdlg-title";
    title.textContent = opts.title || "请输入";
    card.appendChild(title);

    if (opts.message) {
      const msg = document.createElement("div");
      msg.className = "xfdlg-msg";
      msg.textContent = opts.message;
      card.appendChild(msg);
    }

    const inp = document.createElement("input");
    inp.className = "xfdlg-input";
    inp.type = "text";
    inp.value = opts.value == null ? "" : String(opts.value);
    inp.placeholder = opts.placeholder || "";
    inp.spellcheck = false;
    card.appendChild(inp);

    const actions = document.createElement("div");
    actions.className = "xfdlg-actions";

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "xfdlg-btn cancel";
    cancelBtn.type = "button";
    cancelBtn.textContent = opts.cancelText || "取消";
    cancelBtn.addEventListener("click", function () { done(null); });

    const okBtn = document.createElement("button");
    okBtn.className = "xfdlg-btn ok";
    okBtn.type = "button";
    okBtn.textContent = opts.okText || "确定";
    okBtn.addEventListener("click", function () { done(inp.value); });

    actions.appendChild(cancelBtn);
    actions.appendChild(okBtn);
    card.appendChild(actions);

    function done(val) {
      if (!state.open) return;
      state.open = false;
      if (active === state) active = null;
      document.removeEventListener("keydown", onKey, true);
      if (mask.parentNode) mask.parentNode.removeChild(mask);
      resolveFn(val);
    }

    // 点遮罩空白处 = 取消（点卡片内部不关）
    mask.addEventListener("mousedown", function (e) { if (e.target === mask) done(null); });

    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done(null); }
      else if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); done(inp.value); }
    }
    // capture 阶段拦住，避免 Enter 被模板自己的快捷键（搜索/播放）先吃掉
    document.addEventListener("keydown", onKey, true);

    mask.appendChild(card);
    document.body.appendChild(mask);

    // 聚焦并全选，方便直接覆盖输入
    setTimeout(function () {
      try { inp.focus(); inp.select(); } catch (e) {}
    }, 30);

    return promise;
  }

  window.XFDialog = { input: input };
})();
