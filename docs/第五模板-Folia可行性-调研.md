# 第五模板（Folia 风格）可行性调研

> 调研日期：2026-10-15　｜　对象：`chthollyphile/folia-major`（Folia v0.7.19）
> 本机：小风音乐 `new_music2` v3.8.2（MIT / Electron 33 / 原生 JS 无构建）
> **结论先行：不能把 Folia 直接当作第五个模板搬进来。** 存在三重硬阻断（架构断层 / 许可不兼容 / 歌词数据契约不匹配）。可行路线是「自研 Folia 风格第五模板」（路径 C），见文末。

---

## 一、本地模板机制（受体侧契约）

| 项 | 事实 | 来源 |
|---|---|---|
| 模板构成 | `renderer/templateN/{index.html, app.js}`，自包含单页 | `renderer/template2~4/` |
| 加载方式 | `overlayWindow.loadFile(templatePath())`，同一窗口换页 | `scripts/main.original.js:197-203, 257` |
| 共享层 | `<script src="../shared/*.js">`：`store/api/search/account/lyrics-parse/utils` | `template4/index.html:1160-1166` |
| **构建链** | **零构建**：无 vite/webpack/rollup，无 TS 编译，源文件即产物（`files: renderer/**/*`） | `package.json:7-9, 17-24` |
| 窗口形态 | `fullscreen:true` + `transparent:true` + `frame:false` + `alwaysOnTop`，鼠标穿透可切 | `main.original.js:235-255` |
| 安全模型 | `webSecurity:true` / `contextIsolation:true` / `nodeIntegration:false`；只能走 `preload.js` 的 `electronAPI` | `main.original.js:248-254`、`preload.js` |
| 切换流程 | `app:switch-template` → 存设置 → `loadFile` → `did-finish-load` → 通知设置页 | `main.original.js:2177-2193` |
| 音频 | 模板自持 `<audio>`；**只有 t2 建 Web Audio 图（频谱）**，t3/t4 直通 | memory / `shared/audio-fx.js` |
| 歌词模型 | `XFLyrics.buildLines(lrc, charText)` → `[{time, text, chars:[{text,start,dur}]}]`，**仅行级 + 字级**；翻译被拼进 `text` | `shared/lyrics-parse.js:177-204` |

**一句话**：本地"模板"= 一个无构建的原生 JS 单页 + IPC 桥。任何新模板必须满足这条契约。

---

## 二、Folia 侧实现（供体侧事实）

| 项 | 事实 |
|---|---|
| 许可 | **AGPL-3.0**（强 copyleft，含网络服务条款） |
| 技术栈 | React 19 + TypeScript + **Vite 8**（`import.meta.glob` 自动发现模式） + **framer-motion**（`MotionValue currentTime` 为时间轴） + **pixi.js 8** + **three/R3F** + `@paper-design/shaders` + `@chenglou/pretext` + animejs |
| 运行环境 | Electron **43**，Node ≥ 24；原生依赖 ffmpeg / onnxruntime-node |
| 歌词引擎体量 | `src/components/visualizer/` = **407 文件 / 6.8 MB**，含 **13 个模式**（still / classic / cadenza / partita / fume / cappella / tilt / claddagh / monet / diorama / pendolo / sonnet / tempera / lumiere）+ 6 类背景 |
| 歌词前置管线 | `src/utils/lyrics/` = 360 KB / 72 文件（`parserCore` / `cjkSemanticLayout` / `graphemeTiming` / `sentenceLayout` / `renderHints`） |
| 后端耦合 | `electron/` 64 文件 / 912 KB，自有 Netease/QQ/酷狗/波点 后端、`stageApi`、转码、音频分析；renderer 不能独立跑 |
| 引擎自述 | `visualizer/README.md`：**"Visualizer 消费已解析的 `LyricData`/`Line`/`Word`，不负责解析 `.lrc`/`.vtt`/`.yrc`/`.qrc`"** |
| 模式契约 | `VisualizerSharedProps` 必需 `MotionValue currentTime`、`audioPower`、`audioBands`、`Theme`、React 组件 |
| 活跃度 | 51 open issues，模式契约持续演进 |

---

## 三、阻断项分析

### 🔴 P0-1　架构断层（不可通约）
本地模板是**无构建的 vanilla 单页**；Folia 视觉层是**React + Vite 构建产物 + Pixi/three WebGL**，且靠 `import.meta.glob` 在编译期发现模式、靠 framer-motion `MotionValue` 驱动每帧时间。

要把 Folia 当第五模板，只有两条路，都不可接受：
- **引入 Vite/React 构建链** → 颠覆现有"源文件即产物 + `loadFile` 原文件"的契约，`electron-builder files` 与 `main.jsc` 编译链全要改（改 `scripts/main.original.js` 后必须重编字节码）。
- **把 6.8 MB React/WebGL 引擎用 vanilla 重写** → 等于重做，不是"移植"。

### 🔴 P0-2　许可不兼容（法律硬阻断）
本地 MIT，Folia **AGPL-3.0**。任何把 Folia 源码并入小风音乐的行为都会触发 copyleft：整个项目需改判 AGPL-3.0 并公开全部源码。这是产品决策，不是技术问题，且与仓库"仅供学习交流"的定位冲突。
→ **代码不能搬**，只能参考视觉思路自行实现。

### 🔴 P0-3　歌词数据契约不匹配
Folia 引擎明确不解析歌词，它要的是：
- `Line.fullText`（整句布局）+ `Line.words`（**word 级 timing 真源**）
- CJK semantic grouping / display units / **逐 grapheme timing**、sticky punctuation
- 独立的翻译字段（本地是拼进 `text`）

本地只有**行级 time + 字级 `chars[{text,start,dur}]`**，没有词级切分、没有 grapheme 级、没有语义分组。
叠加既有事实——**本地逐字覆盖率本就低**（网易云实测 8 首经典歌仅 2 首有 YRC；酷狗/歌曲宝零逐字）——Folia 那套高度依赖逐字/逐 grapheme 的动画落到本地音源上会**大面积降级为行级兜底**，视觉收益被吃掉大半。

### 🟠 P1-1　运行形态冲突
本地模板是"全透明无边框悬浮窗"，Folia 是常规不透明窗口 + 标题栏 + 命令面板 + wall 视图 + 模态。把 WebGL 舞台塞进 `transparent:true` 窗口，需处理 alpha 合成 / clearColor / 点击穿透，属已知易踩区（本项目已有 `mousemove` 自动隐藏的历史教训）。

### 🟠 P1-2　音频分析接口缺失
Folia 模式吃 `audioPower` + `audioBands{bass,treble}`。本地只有 t2 有 Web Audio 图，t3/t4 直通。要驱动 Folia 式音频响应，须先统一三模板音频图并导出分析值——注意 `createMediaElementSource()` 只能对同一元素调用一次、单声道需先 up-mix（v3.8.0 双声道音效已踩过）。

### 🟠 P1-3　体量与性能
视觉层 6.8 MB 源码 + Pixi8/three/R3F 依赖树；本地是 Electron **33**，Folia 面向 **43**，WebGL2/Pixi8/three 0.185 在 33 的 Chromium 上需实测。透明窗口下的 GPU 合成开销、打包体积增长都需验证。

### 🟡 P2　维护面
13 个模式各自带 tuning 面板（`settingsPanels.tsx` 61 KB、`VisPlayground.tsx` 76 KB），单模式移植也不是小活；上游活跃，契约会漂移。

---

## 四、可行路径对比

| 路径 | 做法 | 可行 | 代价 / 风险 |
|---|---|---|---|
| **A** 直接搬运当模板 | Folia renderer 塞进 `template5` | ❌ | AGPL 传染 + React/Vite 与无构建契约冲突 + 歌词契约不匹配 |
| **B** 内嵌独立 Folia | spawn 打包好的 Folia Web 版，iframe/子窗口内嵌，本地只管窗口 | ⚠️ 有条件 | 需自建 NeteaseCloudMusicApiEnhanced 等后端（其前端不自带）；两播放器争音频；本质是"再启动一个 App"而非第五模板；分发 Folia 二进制仍受 AGPL 约束 |
| **C** 自研 Folia 风格第五模板 | 保持 vanilla + 无构建，借鉴视觉语言（全屏歌词舞台 / 主题化排版 / 逐字动画），自研 Canvas2D/WebGL 实现 1~2 个模式 | ✅ **推荐** | 需先补歌词管线 + 统一音频图；工作量大但自主、无许可风险 |
| **D** 反向整合 | 把本机音源做成 Folia provider 上contributing，或做成 Folium 模组 | ✅ 但方向相反 | 不是"第五模板"，是另一条整合路线 |

---

## 五、推荐路线 C 的分阶段拆解

| 阶段 | 内容 | 前置依赖 | 风险 |
|---|---|---|---|
| **① 歌词管线升级** | 在 `shared/lyrics-parse.js` 之上补：词级/词组切分（CJK 分词）、逐 grapheme timing、翻译独立字段、CJK 排版单元 | 无 | 中：逐字覆盖率不足时须保留行级兜底 |
| **② 音频分析统一** | 三模板统一 Web Audio 图，导出 `audioPower` + `audioBands`（0..255 归一） | ①可并行 | 中：`createMediaElementSource` 单次约束、单声道 up-mix |
| **③ 单模式实现** | 建议先做**一个**模式验证视觉语言：<br>· Monet 式「歌词栏 + 扫字」— 纯 DOM/Canvas，成本最低<br>· Lumiere「光束点亮」— WebGL 光束，效果最接近 Folia 招牌<br>· Cappella「群唱气泡」— DOM + 头像素材，趣味性强 | ①② | 高：透明窗口下的合成与穿透交互 |
| **④ 接入第五模板** | `renderer/template5/` + `templatePath()` 加 `folia` 分支 + 设置页选项 | ③ | 低：契约明确，照 t2~t4 抄 |

**工作量参照**：Folia 官方该引擎（不含解析管线）是 407 文件 / 6.8 MB React 代码；本地用 vanilla 复刻 1 个模式，预估为**新增 1 个模板目录 + 歌词管线增强**，量级与"MV 台（t4，130 KB app.js + 55 KB html）"同阶偏上。

---

## 六、结论与建议

1. **"把 Folia 当第五个模板"在工程上不成立**：架构不同约（无构建 vanilla vs React/Vite/Pixi）、许可不兼容（MIT vs AGPL-3.0）、歌词契约不匹配（行/字级 vs 词/grapheme 级 + 语义分组）。
2. **不要搬运 Folia 任何代码**，AGPL 会传染整个项目；若要参考，只参考**视觉与交互设计**。
3. **若要推进，走路径 C**：先补歌词前置管线与音频分析导出，再自研 1 个模式做 MVP，验证后再决定是否扩展。
4. 若最终目标是"看 Folia 效果"，成本最低的其实是**路径 B 的非集成方案**——直接装官方 Folia 桌面版并排用，不投入自研。
