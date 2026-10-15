# 波点音乐 API 接入可行性调研

> 调研日期：2026-10-15　｜　目标：为小风音乐增加第 5 个音源「波点音乐」
> 结论先行：**完全可行，且合法**。协议已完全掌握（实现量级 ~600 行、签名 5 行 md5、无加密无原生依赖）。
> 但**不能**用 Folia 那个 npm 包（AGPL-3.0），应移植 **MIT 许可的 PyBodian** 自研。

---

## 一、三条路线

| 路线 | 做法 | 可行 | 关键问题 |
|---|---|---|---|
| **A** 直接用 `bodian-music-api`（npm） | `npm i bodian-music-api@0.1.2` | ⚠️ 技术上可用，**法律上不行** | ① **AGPL-3.0**（与本项目 MIT 冲突，传染全项目）② `engines: node>=24`，本地 Electron 33.4.11 = **Node 20.18.3**，不满足 |
| **B** 移植 `MoeclubM/PyBodian` 自研 | Python→Node 重写核心协议 | ✅ **推荐** | **MIT 许可**，可合法移植（保留版权声明即可）；无 Node 版本约束 |
| **C** 复用官方 PC 客户端凭据 | 提取本机波点客户端的 uid/token | ✅ 可作登录补充 | 只能解决"登录"，不解决接口调用；需用户本地装官方客户端 |

> **关键交叉验证**：`bodian-music-api`（AGPL）与 `PyBodian`（MIT）的**签名算法与请求头逐字节一致**（下面第三节）。因此以 MIT 的 PyBodian 为实现参考，功能等价且无许可风险。

---

## 二、依赖/来源清单

| 来源 | 许可 | 用途 | 可否用于本项目 |
|---|---|---|---|
| `chthollyphile/folia-major` | AGPL-3.0 | 视觉参考 | ❌ 仅可参考设计 |
| `Mintcolour/bodian-music-api`（npm `bodian-music-api@0.1.2`） | **AGPL-3.0** | 协议文档 `docs/protocol.md` 极有价值 | ❌ 不可抄代码 |
| **`MoeclubM/PyBodian`** | **MIT** | **可移植的实现参考** | ✅ 移植需保留 MIT 声明 |
| 波点官方 PC 客户端 | 专有 | 凭据提取（`%LOCALAPPDATA%\cn.wenyu.bodian\bodian_pc`） | ⚠️ 仅本地读，勿分发 |

---

## 三、协议事实（已完整掌握）

### 3.1 域名与请求头

| 项 | 值 |
|---|---|
| 主站 | `https://bd-api.kuwo.cn` |
| 歌词站 | `https://mlyric.kuwo.cn` |
| 设备号 | `devid` = `qimei36` = **32 位小写 hex**（必须稳定持久化） |

```
User-Agent: Dart/3.3 (dart:io)
plat: win      channel: W1     ver: 1.1.7      svrver: 13
api-ver: application/json      brand: Windows  net: wifi
devid / qimei36: <32位hex>     Content-Type: application/json
Accept-Encoding: gzip
```
> ⚠️ `ver` 是协议版本号，会随官方客户端更新（PyBodian 仍写 1.1.5，商业包已用 1.1.7）→ **必须做成常量便于跟改**。

### 3.2 请求签名（仅部分接口需要）

```js
// query 必须先带上 timestamp=Date.now()
const query = new URLSearchParams(params).toString();
let seed = "kuwotest" + [...query].filter(c => /[a-z0-9]/i.test(c)).sort().join("");
if (body) seed += md5(body + "kuwotest");
const sign = md5(seed + path);
```

特点：**纯 md5、无加密密钥、无原生依赖**——5 行实现。这是"可行性极高"的核心原因。
⚠️ 播放两个接口（`checkRight` / `audioUrl`）是 **GET + 精确 JSON body + 签名**，不能用普通 `fetch` GET 丢掉 body。Electron 主进程用 `net.request` 可满足。

### 3.3 端点表

| 能力 | 方法 & 路径 | 参数 |
|---|---|---|
| 搜索 | `/api/search/music/list` | `keyword/pn/rn`（pn 从 **0**） |
| 单曲详情 | `/api/service/music/info` | `musicId` |
| 二维码 key | `/api/ucenter/login/qrCode` | 匿名 + 签名 |
| 二维码状态 | `/api/ucenter/login/qrCodeStatus` | `qrCode` |
| 交换会话 | **POST** `/api/ucenter/users/login` | `{authType:10, qrCode}` |
| 播放权限 | `/api/play/music/v2/checkRight` | `musicId/freeSign`（签名+body） |
| 音频地址 | `/api/play/music/v2/audioUrl` | `devId/musicId/format/br/freeSign` |
| 歌词 | `GET mlyric.kuwo.cn/mobi.s` | `f=bodian&q=base64(...)` |
| 歌单详情 | `/api/service/playlist/info/{id}` | `source` |
| 歌单歌曲 | `/api/service/playlist/{id}/musicList` | `source/pn/rn`（pn 从 **1**） |
| 系统红心 | `/api/service/playlist/fond` | `userId`（来源 5） |
| 自建歌单 | `/api/service/playlist/userCreate` | `userId` |
| 收藏（混合） | `/api/service/collect/4/list` | `sourceType=6` 为专辑 |
| 专辑 | `/api/service/album/{id}`、`/api/service/album/music/{id}` | — |
| 歌手 | `/api/service/artist/{id}`、`.../music/{id}`、`.../album/{id}` | — |
| 推荐 | `/api/service/finds/playlist`、`/api/service/music/recommendList` | — |
| Discover | `/api/service/home/module?moduleId=1`、`/api/service/home/aiPlaylistDetail?index=N` | — |
| 歌曲增删 | **POST** `/api/service/playlist/music` 或 `.../music/delete` | `{playListId, musicIdList}` |

### 3.4 音质与播放权限

| 档位 | format / br |
|---|---|
| standard | `mp3` / `128kmp3` |
| high | `mp3` / `320kmp3` |
| lossless | `flac` / `2000kflac` |
| hires | 当前回退 lossless |

`checkRight.status`：**3 = 试听**（返回 `audition.start/end`）、**7 = 缺额外权限**、其他 → 走 `audioUrl`。
响应业务码：**407 = 地区限制**（仅中国大陆，不清会话）、**11012 = auth-required**、**20018 = not-playable**。
→ 试听**不得**当作完整歌曲入库；407 时应停止播放并提示，**不要自动跳歌**。

### 3.5 歌词解码（AWLRC）

```
GET mlyric.kuwo.cn/mobi.s?f=bodian&q=base64(
   type=lyric&req=2&lrcx=1&rid={musicId}&songname=&artist=&corp=kuwo&fromchannel=bodian)
```
- `q` 与响应 `data.content` 均为 **Base64**
- 逐字系数藏在 `[kuwo:NN]`（**八进制**）：`factors=parseInt(NN,8)`，`startFactor=⌊factors/10⌋`，`durationFactor=factors%10`
- 字级标记 `<a,b>` → `start=⌊|a+b|/(2*startFactor)⌋`、`duration=⌊|a-b|/(2*durationFactor)⌋`，输出 **`<start,duration>` 毫秒**（即增强 LRC / AWLRC）
- 行级歌词 = 去掉 `<>` 与 `[kuwo:]` 标签后的文本

> ✅ **重大利好**：AWLRC 的 `<start,dur>` 可**直接映射**到本地既有模型 `chars:[{text, start, dur}]`（`renderer/shared/lyrics-parse.js`）。也就是说波点歌词接入后，**四个模板的逐字扫光可立即复用**，只需在 `lyrics-parse.js` 加一个 AWLRC 分支。

### 3.6 `freeSign` —— 唯一的隐式依赖

`freeSign` **不是登录态字段**，而是**逐曲字段**，来自搜索/详情响应的 `freeSign` 或 `fsig`。
`checkRight` 与 `audioUrl` 都要求带它 → **搜索/详情解析时必须把 `freeSign` 一起存进歌曲对象**（PyBodian 还做了 `get_cached_free_sign` 缓存兜底）。这是最容易漏的一环。

### 3.7 分页陷阱

- 必须用返回的 `nextOffset` / `hasMore` 续页，**不能**用 `list.length` 推算偏移（稀疏首页返回 99 条时仍应从 100 继续）
- `limit` 范围 1–100；服务端 `total` 不可信、歌曲可能缺失或重复
- 收藏歌单/专辑共用一个分页接口，过滤后可能出现空页但 `hasMore=true` → **必须继续读**

---

## 四、接入小风音乐的具体改造点

本地音源路由现状：`server` 取值 `netease` / `qq`(tencent) / `kugou`，另有 `gqb`/`gqh` 独立 IPC（`main.original.js:25-28`、`2354-2520`）。

| # | 改造项 | 位置 | 说明 |
|---|---|---|---|
| 1 | 新增 `lib/bodian/` 客户端模块 | 新目录 | `http.js`（头+签名+请求）、`auth.js`（二维码）、`catalog.js`（搜索/详情）、`playback.js`（权限+取址）、`lyrics.js`（AWLRC 解码） |
| 2 | `server` 增加 `bodian` 分支 | `scripts/main.original.js` 各 `music:*` handler | `music:search` / `songDetail` / `url` / `lyric` / `pic` / `playlist` |
| 3 | AWLRC 解析分支 | `renderer/shared/lyrics-parse.js` | 与 YRC/QRC 并列；映射成 `chars:[{text,start,dur}]` |
| 4 | 会话持久化 | 主进程 | 复用现有 `netease-cookie` / `kugou-cookie` 同款做法（`userData` 下 json）；token 不进 renderer |
| 5 | 设备号持久化 | 主进程 | `devid` 需 32 位 hex 且稳定（换号会掉播放权限） |
| 6 | 播放链路 CORS | 主进程 | 音频/封面走 kuwo CDN（`img*.kuwo.cn` 等）；**已有 `installMediaCors` 只对 `resourceType==='media'` 注入 ACAO**，需确认覆盖 |
| 7 | 界面音源选择器 | 四个模板 + 设置页 | 加「波点」选项 |
| 8 | 重编字节码 | `scripts/build-protected.js` | ⚠️ 改完 `main.original.js` **必须重编 `main.jsc`**（`ELECTRON_RUN_AS_NODE=1`） |

---

## 五、风险与断言

| 风险 | 等级 | 应对 |
|---|---|---|
| 许可污染 | 🔴 | **只用 PyBodian（MIT）作参考**，禁止从 AGPL 包/Folia 抄代码；文件中保留 MIT 版权声明 |
| 仅限中国大陆网络 | 🟠 | 用户在国内可用；需处理 407 → 提示 + 停止播放，不自动跳歌 |
| `ver` 协议版本随官方更新失效 | 🟠 | 抽成常量 + 集中改一处；接口失败时给出明确错误码 |
| `freeSign` 漏存导致无法播放 | 🟠 | 搜索/详情解析一并入库 + 缓存兜底 |
| 需登录（VIP/付费） | 🟡 | 免费歌免登可播；VIP 仅试听（status 3）；提供扫码登录入口 |
| 无官方 SDK，协议随时变 | 🟡 | 错误码分级（407/11012/20018），失败可回落其它音源 |

**验收断言（≥3 首，含 1 首免费 + 1 首 VIP）**：
1. 搜索返回非空且 `freeSign` 已落到歌曲对象
2. 免费歌 `checkRight` → `audioUrl` 可播，`<audio>` 能出声
3. VIP 歌返回 status 3，拿到 `audition.start/end` 且被标记为试听（不进缓存/不下发"完整歌曲"）
4. 歌词返回 AWLRC，`[kuwo:]` 解码后 `<start,dur>` 单调递增、与音频时间轴自洽
5. 逐字扫光在四个模板均生效（验证 `chars` 映射）
6. 断网/407 时给出可读错误，不静默失败、不误跳歌

---

## 六、与「第五模板（Folia 风格）」的关系

这是**两条独立线**，可并行也可分开做：

| | 第五模板（视觉） | 波点音源（数据） |
|---|---|---|
| 收益 | 全屏歌词舞台视觉 | 多一个可用音源 |
| 依赖 | 歌词管线升级 + 音频分析统一 | `lib/bodian/` + AWLRC 解析 |
| 交叉点 | ⭐ **波点的 AWLRC 比网易云 YRC 覆盖率更高**，能直接喂给舞台式逐字动画 → 两者**互补**：先做音源，再做的第五模板就有更好的逐字数据可用 | |

**建议顺序**：先做波点音源（收益确定、实现量小 ~600 行、无视觉风险），再推进第五模板（工作量大、需设计验证）。

---

## 七、实施记录（v3.9.0 已落地）

### 7.1 新增/改动文件

| 文件 | 类型 | 说明 |
|---|---|---|
| `lib/bodian/http.js` | 新增 | 请求头 + md5 签名 + GET-with-body 请求 + 业务码映射（407/11012/20018） |
| `lib/bodian/lyrics.js` | 新增 | Base64 判定 → `[kuwo:NN]` 八进制系数还原 → AWLRC |
| `lib/bodian/client.js` | 新增 | search / songDetail / checkRight / audioUrl / audio / lyrics / 歌单 / 专辑 / 歌手 / 推荐 |
| `lib/bodian/index.js` | 新增 | devid 持久化 + 会话持久化 + 工厂 |
| `scripts/bodian-probe.cjs` | 新增 | 独立连通性验证脚本（不打包） |
| `scripts/main.original.js` | 改 | 新增 `server==='bodian'` 分支：search / songDetail / url / lyric / pic / playlist / download；⚠️ 已重编 `main.jsc` |
| `renderer/shared/lyrics-parse.js` | 改 | 新增 `parseAwlrc` / `isAwlrcFormat`，`buildLines` 增加 AWLRC 分支（在原 YRC/QRC 之前） |
| `renderer/shared/search.js` | 改 | `CHANNELS` 增加 `{id:"bodian", name:"波点"}` → 四模板渠道栏自动生效 |
| `package.json` / `README*.md` | 改 | 版本 3.8.2 → **3.9.0**，音源列表加波点 |

> 四模板**零改动**：只靠"主进程把 AWLRC 塞进 `qrc` 字段 + `buildLines` 认识 AWLRC"，逐字扫光即全模板生效。

### 7.2 实测断言（全部通过）

| # | 断言 | 方式 | 结果 |
|---|---|---|---|
| 1 | 签名链路可用 | 独立脚本 3 关键词 × 3 首 = 9 首 | ✅ 9/9 |
| 2 | 音频真能下载 | Range 取字节验魔数 | ✅ 9/9 `HTTP 206 audio/mpeg MP3(ID3)` |
| 3 | 逐字覆盖率 | AWLRC 有字行占比 | ✅ **8/9 首有逐字**（对比网易云实测 2/8） |
| 4 | AWLRC 系数真实参与运算 | 抓原始字节核对 | ✅ `[kuwo:127]`→factors=87→sf=8,df=7；`<1120,-1120>`→`<0,160>` 与实测输出完全一致 |
| 5 | content 编码 | 原始响应 | ✅ Base64（`W2t1d286MTI3XQ...` → `[kuwo:127]`） |
| 6 | 时间基准正确 | 字级最大 start vs 时长 | ✅ 晴天 265.69s / 269s |
| 7 | 端到端（渲染层→IPC→接口） | CDP 驱动真实应用 | ✅ 搜索 30 首 / 取址 ok / 歌词 63 行 63 有字 / 封面 ok |
| 8 | 渠道注入生效 | 读 `XFSearch.CHANNELS` | ✅ `bodian:波点` 已在列表 |
| 9 | **无回归** | 五渠道各测搜索+歌词+取址 | ✅ 均返回 30 首；QQ QRC 63/63 有字、网易云/酷狗 LRC 解析正常 |

### 7.3 实测发现的差异（与调研预判不同）

| 项 | 调研预判 | 实测 |
|---|---|---|
| `freeSign` | 播放必需 | ⚠️ **搜索结果里根本不存在此字段**，传空串即可；免费歌与试听均正常 → 暂不阻塞 |
| VIP 处理 | 未知 | 匿名未登录：免费歌 `status=1` **完整可播**；VIP 歌 `status=3` → 平台只给 **30 秒试听** |
| 逐字覆盖 | 未知 | 远高于网易云，接近全覆盖 |

### 7.4 遗留项（未实施）

1. **登录**：波点扫码登录（`authType:10`）未接入 → 目前无法播放 VIP 完整音频、无法用「我的歌单」。协议已掌握，工作量约 1 个 IPC + 1 个面板。
2. **试听标识 UI**：试听曲目前只把 30 秒地址返回给播放器（`urlInfo` 会拿到 `url`），界面未显示"试听中"提示。
3. **MV**：波点有 `vid`/`mv` 字段，未接入 MV 台（t4）。
4. **歌单导入**：`music:playlist` 已通，但 `music:importPlaylist` 未识别波点链接格式。
5. **`ver` 头版本**：写死 `1.1.7`（`lib/bodian/http.js` 的 `PROTOCOL_VER`），官方更新后需改这一处。

---

## 8. 全链路回归验收（2026-10-15，v3.9.0 交付后复检）

**结论：系统运行正常。** 七层共 71 项断言，唯一失败项为第三方站点侧既有问题，与本次改动无关。

| # | 层次 | 验证内容 | 结果 |
|---|---|---|---|
| 1 | 静态 | 8 个改动文件语法；`main.jsc` 与源码同步；字节码含新特征串；`lib/bodian` 从根 require 与导出面 | ✅ 全通过 |
| 2 | 协议 | 搜索→详情→取址→音频字节魔数→AWLRC 解码 | ✅ 9/9（HTTP 206 MP3 ID3，8/9 有逐字） |
| 3 | 歌词 | AWLRC 时间轴自洽 + YRC/QRC/LRC 分支回归 + 格式互斥边界 | ✅ 21/21 |
| 4 | 端到端 IPC | 五渠道经 渲染层→preload→ipcMain 全链路 | ✅ 4/5 通，gqb 见下 |
| 5 | UI 真实流程 | 输入→回车→渠道栏→点「波点」→结果刷新→点播放 | ✅ 9/10（1 项为检查方法错误，见下） |
| 6 | 音频加载 | hook 媒体原型捕获真实 src 与 play | ✅ 5/5（kuwo CDN，无媒体错误） |
| 7 | 逐字扫光 | seek 采样 `--scan-p` 精度判定 | ✅ 6/6 全为逐字精度 |

### 8.1 唯一真实失败项（非本次回归）

| 项 | 现象 | 根因 | 判定 |
|---|---|---|---|
| 🟠 **歌曲宝(gqb) 取址** | 搜索 30 首正常，取址返回 `gqb_fail`、歌词 null | 主进程日志：`gequbaoSong failed: 详情页解析失败` → **第三方站点页面结构变更/风控** | 既有状态。`gqb_fail` 为旧代码；bodian 分支是独立 `if` 且位于其之前 `return`，未触碰 gqb 逻辑 |

### 8.2 两条"检查方法"教训（非产品缺陷）

1. ⚠️ **模板没有 `<audio>` 标签**：t2 用 `new Audio()`（`app.js:183`，位于 IIFE 内、不在 DOM）→ `document.querySelector("audio")` 永远返回 null。正解 = hook `HTMLMediaElement.prototype` 的 `src` setter 与 `play()`，捕获实例后读 `currentSrc`。
2. ⚠️ **渠道选择器不是 `<select>`**：是 `#search-channels` 内由 `XFSearch.populateTabs` 渲染的 `.ch-tab` 按钮（点击后自动用当前关键词重搜并写入 `localStorage`）。

### 8.3 打包安全复核

| 项 | 结论 |
|---|---|
| 新增目录是否会被打包 | ✅ `package.json` → `build.files` 含 `"lib/**/*"` |
| 是否需要补 `extraResources` | ✅ 不需要：`lib/bodian` **零外部依赖**（仅 `node:crypto/https/zlib/fs/path/os`） |
| 是否被 gitignore 误伤 | ✅ `lib/bodian/` 未被忽略 |
| 产物状态 | dist/ 最新为 `3.8.2` 包，**v3.9.0 尚未打包** |
