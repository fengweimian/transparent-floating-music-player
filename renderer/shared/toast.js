// ============================================================
// 小风音乐 · 通知卡片（renderer/shared/toast.js）
//
// 背景：经典模板（renderer/app.js showToast）一直有一套「双行卡片」通知：
//   深色面板底 + 左侧 4px 类型色条 + 圆角 + 背景模糊，右上角堆叠，最多 3 条；
//   传了点击回调时**常驻不消失**，点一下执行动作（打开设置 / 在文件夹中显示）。
//   而 t2/t3/t5 只有 showFeedback() 单行文字，1.8 秒就没了，也点不了。
//
// 用法（四个模板通用）：
//   XFToast.show({ title: "登录状态", message: "网易云 登录已过期，点击打开设置重新登录", type: "info", onClick: fn });
//   XFToast.show({ title: "✓ 下载完成", message: "歌名.mp3\nD:\\xxx", type: "success", onClick: fn });
//   XFToast.show({ title: "音效", message: "8D 环绕" });            // 4 秒自动消失
//
// 参数：
//   title    标题（粗体，按类型着色）
//   message  正文（可含 \n）
//   type     "info" | "success" | "error"（默认 info）
//   sticky   true = 永不自动消失（有 onClick 时默认 true）
//   onClick  点击卡片执行；执行后自动关闭
//   duration 自动消失毫秒数（默认 4000）
// ============================================================
(function () {
  "use strict";

  const CSS_ID = "xf-toast-style";
  const CONTAINER_ID = "xf-toast-container";
  const MAX_ITEMS = 3;

  function ensureStyle() {
    if (document.getElementById(CSS_ID)) return;
    const st = document.createElement("style");
    st.id = CSS_ID;
    st.textContent = `
      #xf-toast-container {
        position: fixed; top: 18px; right: 18px; z-index: 2147482000;
        display: flex; flex-direction: column; gap: 8px;
        max-width: 380px; pointer-events: none;
        -webkit-app-region: no-drag;
      }
      .xf-toast-item {
        pointer-events: auto;
        box-sizing: border-box;
        background: rgba(30, 32, 52, 0.94);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 10px;
        padding: 12px 16px;
        color: rgba(255, 255, 255, 0.9);
        font-family: "Microsoft YaHei", "PingFang SC", "Segoe UI", system-ui, sans-serif;
        font-size: 13px; line-height: 1.5;
        box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
        -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px);
        animation: xf-toast-in 0.25s ease-out;
        transition: opacity 0.3s ease, transform 0.3s ease;
        -webkit-app-region: no-drag;
      }
      @keyframes xf-toast-in {
        from { opacity: 0; transform: translateX(24px); }
        to { opacity: 1; transform: none; }
      }
      .xf-toast-item.xf-toast-out { opacity: 0; transform: translateX(24px); }
      .xf-toast-item.xf-toast-success { border-left: 4px solid #34c759; }
      .xf-toast-item.xf-toast-error { border-left: 4px solid #ff453a; }
      .xf-toast-item.xf-toast-info { border-left: 4px solid #8e8e93; }
      .xf-toast-item.xf-toast-clickable { cursor: pointer; }
      .xf-toast-item.xf-toast-clickable:hover { background: rgba(38, 42, 66, 0.97); }
      .xf-toast-item .xf-toast-title {
        display: block; font-weight: 600; margin-bottom: 3px;
      }
      .xf-toast-item.xf-toast-success .xf-toast-title { color: #34c759; }
      .xf-toast-item.xf-toast-error .xf-toast-title { color: #ff453a; }
      .xf-toast-item.xf-toast-info .xf-toast-title { color: #9ea5b8; }
      .xf-toast-item .xf-toast-sub {
        display: block; font-size: 12px; line-height: 1.6;
        color: rgba(255, 255, 255, 0.72);
        white-space: pre-wrap; word-break: break-all;
      }
    `;
    document.head.appendChild(st);
  }

  function container() {
    let el = document.getElementById(CONTAINER_ID);
    if (!el) {
      el = document.createElement("div");
      el.id = CONTAINER_ID;
      document.body.appendChild(el);
    }
    return el;
  }

  function remove(item) {
    if (!item || item.__closing) return;
    item.__closing = true;
    item.classList.add("xf-toast-out");
    setTimeout(function () {
      if (item.parentNode) item.parentNode.removeChild(item);
    }, 320);
  }

  function show(opts) {
    opts = opts || {};
    ensureStyle();
    const box = container();

    const item = document.createElement("div");
    const type = opts.type === "success" || opts.type === "error" ? opts.type : "info";
    item.className = "xf-toast-item xf-toast-" + type;

    const titleEl = document.createElement("span");
    titleEl.className = "xf-toast-title";
    titleEl.textContent = opts.title || "";
    item.appendChild(titleEl);

    if (opts.message) {
      const subEl = document.createElement("span");
      subEl.className = "xf-toast-sub";
      subEl.textContent = opts.message;
      item.appendChild(subEl);
    }

    const clickable = typeof opts.onClick === "function";
    if (clickable) {
      item.classList.add("xf-toast-clickable");
      item.title = "点击执行";
      item.addEventListener("click", function () {
        try { opts.onClick(); } catch (e) {}
        remove(item);
      });
    }

    box.appendChild(item);

    // 同一时间只保留最近 3 条（与经典模板一致）
    while (box.children.length > MAX_ITEMS) remove(box.firstElementChild);

    // 有点击行为的默认常驻（等用户处理），否则 4 秒后消失
    const sticky = opts.sticky === true || (clickable && opts.sticky !== false);
    if (!sticky) {
      const life = typeof opts.duration === "number" ? opts.duration : 4000;
      setTimeout(function () { remove(item); }, life);
    }

    return item;
  }

  function clear() {
    const box = document.getElementById(CONTAINER_ID);
    if (!box) return;
    while (box.firstElementChild) remove(box.firstElementChild);
  }

  window.XFToast = { show: show, clear: clear };
})();
