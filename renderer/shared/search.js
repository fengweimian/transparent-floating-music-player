// ============================================================
// 小风音乐 · 共享搜索模块（renderer/shared/search.js）
// 渠道定义唯一收口点：两模板（经典下拉框 / 新模板渠道栏）都从这里渲染渠道，
// 搜索统一走 XFSearch.search（内部复用 XFApi.search 的主进程/浏览器双通道）。
// 渠道集合 = 网易云 / QQ音乐 / 酷狗 / 歌曲宝（v3.4.0 起移除「全民K歌」——它实为歌曲海 gequhai.com，名不副实）
// ============================================================
(function () {
  "use strict";

  // 渠道定义（唯一数据源；id 与主进程 music:search 分支一致，qq 内部映射 tencent）
  const CHANNELS = [
    { id: "netease", name: "网易云" },
    { id: "qq", name: "QQ音乐" },
    { id: "kugou", name: "酷狗" },
    { id: "gqb", name: "歌曲宝" },
  ];

  // 渠道名（兼容旧数据中的 tencent/gqh 显示）
  function channelName(server) {
    const c = CHANNELS.find((x) => x.id === server);
    if (c) return c.name;
    if (server === "tencent") return "QQ音乐";
    if (server === "gqh") return "全民K歌"; // 老歌单/队列里可能残留，仅显示用
    return server || "";
  }

  // 统一搜索入口（内部复用 XFApi.search：桌面版主进程 / 浏览器 Meting）
  async function search(keyword, server) {
    return XFApi.search(keyword, server);
  }

  // 填充经典模板下拉框：<select id="search-source"> 生成 <option>
  function populateSelect(selectEl, current) {
    if (!selectEl) return;
    selectEl.innerHTML = "";
    CHANNELS.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.name;
      if (c.id === current) opt.selected = true;
      selectEl.appendChild(opt);
    });
  }

  // 渲染新模板渠道栏：容器内生成 <button class="ch-tab" data-server="...">（样式由各模板 CSS 负责）
  function populateTabs(containerEl, current) {
    if (!containerEl) return;
    containerEl.innerHTML = "";
    CHANNELS.forEach((c) => {
      const btn = document.createElement("button");
      btn.className = "ch-tab" + (c.id === current ? " active" : "");
      btn.dataset.server = c.id;
      btn.textContent = c.name;
      containerEl.appendChild(btn);
    });
  }

  window.XFSearch = {
    CHANNELS,
    channelName,
    search,
    populateSelect,
    populateTabs,
  };
})();
