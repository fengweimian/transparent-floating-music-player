// ============================================================
// 小风音乐 · 共享工具层（renderer/shared/utils.js）
// 两模板通用的小工具函数：HTML 转义、时间格式化
// 经典模板与新模板共用，避免各写一份
// ============================================================
(function () {
  "use strict";

  // HTML 转义：null/undefined 视为空串（渲染安全）
  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = String(str == null ? "" : str);
    return div.innerHTML;
  }

  // 秒 → mm:ss（负值/非有限数返回 "0:00"）
  function fmtTime(sec) {
    if (!isFinite(sec) || sec < 0) return "0:00";
    sec = Math.floor(sec);
    return Math.floor(sec / 60) + ":" + (sec % 60 < 10 ? "0" : "") + (sec % 60);
  }

  window.XFUtils = { escapeHtml, fmtTime };
})();
