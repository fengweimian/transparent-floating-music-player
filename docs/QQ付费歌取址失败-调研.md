# QQ 音乐付费歌「取不到播放地址」调研

> 调研时间：2026-11-07 · 调研版本 v3.10.5 · **已于 v3.10.6 按方案 A 修复（见第 9 节）**

## 一句话结论

不是网络问题、不是版权问题、也不是登录失败 —— 是**播放取址通道从头到尾没带登录 Cookie**。

QQ 的 vkey 接口对 `pay_play=1` 的歌在匿名请求下返回 `result=104003`（需登录），`purl` 为空串，
播放器拿不到任何地址 → `<audio>` 无元数据 → 界面显示 0:00。

用户是 VIP 会员也没用，因为登录态只被歌单 / 每日推荐 / MV 用到，**播放取址那一条路径从来没读过 `qqmusicAuth`**。

---

## 1. 现象与用户体感对照

| 现象 | 是否属实 | 原因 |
|---|---|---|
| 一部分歌能播、一部分不能 | ✅ | 分界线 = 该曲 `pay_play` 是否为 1 |
| 播不了的歌封面 / 歌词 / 歌手都正常 | ✅ | 搜索、详情、歌词接口匿名可用，与取址是两条路 |
| 播不了的歌时长显示 0 分 0 秒 | ✅ | 派生现象，见第 5 节 |
| 日志 `resolvePlayUrl 失败: qq … \| tried: meting:qq` | ✅ | 唯一一级取址失败，兜底代理也已死 |

失败歌曲样本（用户实际点的）：Cure For Me / Ticking / 谢谢 / Smile / We Don't Talk Anymore /
据说真的有神 / Call your name / 幻听 / TiK ToK —— **全部 `pay_play=1`**。

---

## 2. 代码级链路

```
resolvePlayUrl()                     scripts/main.original.js:2975   ← 第 1 级
  └─ metingPlayUrl(id, "qq")         scripts/main.original.js:2741
       └─ getMeting("qq")            scripts/main.original.js:40     ← new Meting("tencent")
       └─ meting.url(id, 320)        ← ⚠️ 全程没有调 .cookie(...)
            └─ @meting/core tencent provider
                 ├─ ① GET c.y.qq.com/v8/fcg-bin/fcg_play_single_song.fcg   （拿 media_mid、各档大小）
                 └─ ② GET u.y.qq.com/cgi-bin/musicu.fcg (CgiGetVkey)
                        uin 取值 = header.Cookie.match(/uin=(\d+)/) || "0"
                        ↑ header.Cookie 是包内置的匿名串，无 uin= → uin = "0"
```

关键三行（meting 包内 `urlDecode`）：

```js
let a = "0";
const o = this.meting.header.Cookie && this.meting.header.Cookie.match(/uin=(\d+)/);
o && (a = o[1]);                        // 没有 cookie 就是 "0"
param: { uin: a, loginflag: 1, ... }    // loginflag=1 但 uin=0 → 等价匿名
```

匿名 → QQ 返回：

```json
{"midurlinfo":[{"filename":"M80000093zrb1f8t8K.mp3","purl":"","vkey":"","result":104003}, ...]}
```

meting 的拼装条件 `if (file[size] && br<=temp.br && midurlinfo[i].vkey)` 不成立 → 返回空：

```json
{"url":"","size":0,"br":-1}
```

→ `resolvePlayUrl` 拿空串 → 第 5 级公开代理（实测 mikus **521**、injahow 返回 **0 字节空体**，全死）→ 失败。

---

## 3. 实测证据

### 3.1 付费歌 24 首（许嵩 / 周杰伦 热门曲）

| 指标 | 结果 |
|---|---|
| `pay_play` | 24/24 = 1 |
| 匿名 vkey | **0/24 通过**，全部 `104003` |
| 带登录 Cookie 的 vkey | **24/24 通过**（320k + 128k 全档有 vkey） |

### 3.2 免费歌 10 首（陈鸿宇 / 余佳运 / 纯音乐等）

| 指标 | 结果 |
|---|---|
| `pay_play` | 10/10 = 0 |
| 匿名 vkey | **10/10 通过** |
| 实际 Range 拉流 | **10/10 `206 audio/mpeg`** |

### 3.3 直接验证「注入 Cookie」这个方案（meting 实例级）

| 歌 | 当前代码（匿名） | 注入 cookie 后 |
|---|---|---|
| 幻听 - 许嵩 | `{"url":"","size":0,"br":-1}` | 真实地址，实播 **206 audio/mpeg** |
| Cure For Me - AURORA | `{"url":"","size":0,"br":-1}` | 真实地址，实播 **206 audio/mpeg** |
| 据说真的有神 - 木秦 | `{"url":"","size":0,"br":-1}` | 真实地址，实播 **206 audio/mpeg** |

附带验证：给同一个 meting 实例注入 cookie 后，`search()` 依然正常（返回 5 条、字段完整），无风控副作用。

### 3.4 403 排查（排除 CDN 限制）

第一轮探测里 vkey 地址出现 403，追查后确认是**我脚本把 purl 截断到 60 字符**导致的，
不是 CDN 问题。补齐后逐项隔离测试：

| 变量 | flac | 320k mp3 | 192k m4a | 128k mp3 |
|---|---|---|---|---|
| 无 Referer / 无 UA | 206 | 206 | 206 | 206 |
| 浏览器 UA / 无 Referer | 206 | 206 | 206 | 206 |
| 带 Referer: y.qq.com | 206 | 206 | 206 | 206 |
| HEAD 请求 | 206 | 206 | 206 | 206 |

→ **CDN 不校验 UA / Referer**，现有 `probeMediaUrl`（UA=Mozilla/5.0 + Range 0-2047）不会误杀。
播放也不需要带 cookie（第三、六轮均验证）。

---

## 4. 为什么「登录了但没用」

1. `isQqmusicLoggedIn()` 与 `qqmusicAuth` 只服务于：我的歌单、红心歌单、每日推荐、MV 查找、听歌打卡。
2. `metingPlayUrl()` 里没有 `.cookie(...)`，`getMeting()` 建实例时也没设过。
3. 失败文案（main.original.js:3047 附近）写的是
   「QQ 音乐未返回可播放地址（VIP/独家版权，**或未登录**）。可在设置里登录 QQ 音乐后重试」——
   用户照做登录后依然是匿名请求，**文案与实现不一致**，于是表现为「我明明登录了 vip 为什么还不行」。

---

## 5. 「时长 0:00」的解释（非独立 bug）

- 播放条时长来自 `audio.duration`（template2/app.js:290、624 等）。
- 取址失败时 `failPlay()` 清空 `song.url` 并 `stopAudioQuietly()`，`<audio>` 从未拿到源 →
  `readyState=0`、`duration=NaN` → 显示 `0:00`。
- 另外 QQ 搜索结果的 map（main.original.js:2466-2481）**不返回 `interval` 字段**，
  所以列表里也没有可用的预置时长，只能等音频元数据。→ 同根因，不需要单独修。

---

## 6. 修复方案（供决策，尚未实施）

### 方案 A：给 meting 注入登录 Cookie（最小改动）

在 `metingPlayUrl()` 里，QQ 分支补一行（约 4 行含判空）：

```js
async function metingPlayUrl(id, server) {
  const meting = await getMeting(server);
  if (!meting) return "";
  // 新增：QQ 已登录 → 带上登录态，否则付费歌 vkey 一律 104003
  if ((server === "qq" || server === "tencent") && qqmusicAuth && qqmusicAuth.cookie) {
    meting.cookie(qqmusicAuth.cookie);
  } else {
    meting.cookie("");   // 退出登录后必须清掉，否则残留上一个账号的 uin
  }
  ...
}
```

- ✅ 改动最小、实测直接生效（第 3.3 节）
- ⚠️ `metingInstances` 是**全局缓存**的，所以 cookie 必须每次调用都设（不能只在建实例时设）
- ⚠️ 退出登录要显式清空，否则 vkey 仍用旧 uin 签（QQ 侧一般仍可播，但属于脏状态）

### 方案 B：自建 vkey 请求（可控性最好）

在主进程用已有的 `qqmusicPost` 风格手写取址（项目里歌单 / MV 都是这么做的）：

```
① fcg_play_single_song → data[0].file / media_mid / pay / type
② musicu.fcg CgiGetVkey（uin=登录 uin，loginflag=1，guid 随机）
③ midurlinfo 里按 320 → 192 → 128 挑第一个有 vkey 的档
④ sip[0] + purl
```

- ✅ 能精确区分失败类型：`104003`=未登录/登录过期、`purl` 空=无版权、`pay_album`=数字专辑需单独买
- ✅ 能顺手支持 FLAC（vkey 实测 6 档全给，含 `size_flac`）
- ⚠️ 代码量约 60~80 行，需要重编译 `main.jsc`

**建议**：先上 A（十几分钟能验证真机），把 B 作为后续「音质档位选择 + 精确错误提示」的升级项。

---

## 7. 风险与注意点

| 项 | 说明 |
|---|---|
| 登录态有效期 | QQ 侧约 **1~3 天**（README 已注明）。过期后 vkey 又回 `104003`，界面上会表现为「昨天能播今天不能」，需要提示「登录已过期，请重新登录」而不是「VIP 受限」 |
| 数字专辑 | `price_album > 0` 的曲目即使绿钻也可能拿不到 vkey（本次样本未遇到，未验证） |
| 搜索副作用 | 注入 cookie 后搜索也带登录态，实测 5/5 正常；若后续发现搜不到，可只对 `url()` 临时设、用完还原 |
| 音质档位 | 现在固定请求 320；登录后 FLAC 档也能签出来，可考虑加「音质偏好」设置 |
| 其他渠道 | 网易云 VIP 歌同理受匿名限制（v3.10.1 已处理 45 秒试听）；酷狗匿名只给 60 秒。**QQ 这条是唯一「登录了却没生效」的** |

---

## 8. 复现脚本（.workbuddy/tmp/，均未提交）

| 脚本 | 用途 |
|---|---|
| `qq-play-probe.cjs` | 9 首失败歌：详情字段 + 匿名/登录 vkey 对照 |
| `qq-403-isolate.cjs` | 隔离 UA / Referer / 档位 / HEAD，证伪 CDN 限制 |
| `qq-boundary.cjs` | 24 首热门歌批量，验证 `pay_play` 与匿名可播的相关性 |
| `qq-free-probe.cjs` | 10 首免费歌，验证匿名确实可播（对照组） |
| `qq-meting-cookie.cjs` | 决定性验证：meting 注入 cookie 前后对比 + 实播 |

跑法：`node .workbuddy/tmp/qq-meting-cookie.cjs`（读取 `%APPDATA%/transparent-music-player/qqmusic-cookie.json`，需先登录）

---

## 9. 修复落地（v3.10.6，2026-11-07）

按**方案 A** 实施，全部改动集中在 `scripts/main.original.js`（改完已重编译 `main.jsc`）。

### 改动点（4 处）

| # | 位置 | 内容 |
|---|---|---|
| 1 | 新增 `syncQqCookie(meting, server)` | 仅对 `qq`/`tencent` 生效：已登录注入 `qqmusicAuth.cookie`，未登录注入空串 |
| 2 | `metingPlayUrl()` | 取址前调用 `syncQqCookie`（播放与下载共用此函数，两条路径同时修好） |
| 3 | QQ 搜索 `music:search` | 搜索前也同步一次，避免实例缓存里的旧 cookie 造成状态不一致 |
| 4 | `resolvePlayUrl()` 失败分支 | 文案按「已登录 / 未登录」分流，不再一律喊「或未登录」 |

关键实现：

```js
function syncQqCookie(meting, server) {
  if (!meting) return;
  if (server !== "qq" && server !== "tencent") return;
  meting.cookie(isQqmusicLoggedIn() ? qqmusicAuth.cookie : "");
}
```

必须每次调用都设（不能只在建实例时设）—— 因为 `metingInstances` 是全局缓存，
退出登录后不显式同步成空串，就会继续用上一个账号的 `uin` 签 vkey。

### 真机验证（v3.10.6 编译后，CDP 驱动实测）

| 用例 | 结果 |
|---|---|
| 《幻听》许嵩（付费） | ✅ 取址成功，`via=native`，679ms，`tried=[]` |
| 《Cure For Me》AURORA（付费） | ✅ 323ms |
| 《据说真的有神》木秦（付费） | ✅ 535ms |
| 《TiK ToK》Kesha（付费） | ✅ 449ms |
| 《阿拉斯加海湾》蓝心羽（免费，回归） | ✅ 仍正常 |
| 网易云《起风了》（回归） | ✅ 仍正常（320k） |
| 酷狗《起风了》 | ⚠️ `kugou_vip` 失败 —— **既有行为**（匿名只给 60 秒试听），与本次改动无关 |

真实播放（非仅取址）：

| 项 | 实测值 |
|---|---|
| `readyState` | 4（HAVE_ENOUGH_DATA） |
| `duration` | 273.2s（《幻听》= 4:33，正确）／198.9s（Cure For Me = 3:19，正确） |
| `currentTime` | 2.0s → 5.0s 持续推进 |
| `audio.error` | 0 |
| `crossOrigin="anonymous"` 下 | 可播；`AnalyserNode` 频谱峰值 **245**（不 taint，模板二可视化不受影响） |

→ 「时长 0:00」随之消失（`duration` 已能正常读出）。

### 遗留 / 后续

- 登录态过期（约 1~3 天）后 vkey 会重新回 `104003`，此时文案落到「已登录但没给地址 → 可能已过期，请重新登录」，不再误导。
- 未做**主动过期探测**（失败时再查一次用户信息会多一次请求）；如后续觉得提示不够准，可升级到方案 B。
- 音质仍固定 320k；登录后 FLAC 档其实也能签出来，可作为「音质偏好」设置的后续需求。

