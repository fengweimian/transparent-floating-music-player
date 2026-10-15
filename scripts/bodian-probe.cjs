// ============================================================
// 小风音乐 · 波点协议连通性验证脚本（scripts/bodian-probe.cjs）
// 目的：用真实请求证明「搜索 → 取址 → 音频可下载 → 歌词逐字可用」链路在
//       本机网络环境下成立，并打印真实字段名供 normalizeSong 校正。
//
// 运行： node scripts/bodian-probe.cjs
// ⚠️ 不写入项目数据；设备号/会话落在 .workbuddy/tmp/bodian-probe/
// ============================================================
"use strict";

const https = require("node:https");
const path = require("node:path");
const { createBodian } = require("../lib/bodian");
const { parseAwlrc } = require("../lib/bodian");

const STATE_DIR = path.join(__dirname, "..", ".workbuddy", "tmp", "bodian-probe");
const QUERIES = ["周杰伦 晴天", "Taylor Swift Love Story", "海阔天空"];

function log(...args) { console.log(...args); }
function head(title) { log(`\n${"=".repeat(64)}\n${title}\n${"=".repeat(64)}`); }

// 取音频前若干字节，验证真的是音频流
function fetchAudioHead(url, bytes = 16) {
  return new Promise((resolve) => {
    let req;
    try {
      req = https.get(url, { headers: { Range: `bytes=0-${bytes - 1}` }, timeout: 20000 }, (res) => {
        const chunks = [];
        res.on("data", (c) => { chunks.push(Buffer.from(c)); if (Buffer.concat(chunks).length >= bytes) res.destroy(); });
        res.on("close", () => {
          const buf = Buffer.concat(chunks).slice(0, bytes);
          resolve({
            status: res.statusCode,
            contentType: res.headers["content-type"] || "",
            contentLength: res.headers["content-range"] || res.headers["content-length"] || "",
            bytes: buf,
            magic: detectMagic(buf),
          });
        });
      });
      req.on("error", (e) => resolve({ error: e.message }));
      req.on("timeout", () => { req.destroy(); resolve({ error: "timeout" }); });
    } catch (e) {
      resolve({ error: e.message });
    }
  });
}

function detectMagic(buf) {
  if (!buf || buf.length < 4) return "too-short";
  const hex = buf.toString("hex", 0, 4);
  if (buf.toString("ascii", 0, 3) === "ID3") return "MP3(ID3)";
  if (buf.toString("ascii", 0, 4) === "fLaC") return "FLAC";
  if (buf.toString("ascii", 4, 8) === "ftyp") return "MP4/M4A";
  if ((buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) return "MP3(frame-sync)";
  if (hex === "4f676753") return "OGG";
  return `unknown(${hex})`;
}

async function main() {
  const { api, deviceId, stateDir } = createBodian({ stateDir: STATE_DIR });
  log(`设备号 devid = ${deviceId}`);
  log(`状态目录      = ${stateDir}`);

  const results = [];

  for (const q of QUERIES) {
    head(`搜索：${q}`);
    let search;
    try {
      search = await api.search(q, { limit: 5 });
    } catch (e) {
      log(`❌ 搜索失败：[${e.code || "?"}] ${e.message}`);
      results.push({ q, ok: false, why: `search: ${e.message}` });
      continue;
    }

    log(`✅ 返回 ${search.songs.length} 首，分页 ${JSON.stringify(search.pagination)}`);
    if (!search.songs.length) { results.push({ q, ok: false, why: "空结果" }); continue; }

    // 打印首条真实字段，供字段映射校正
    const first = search.songs[0];
    log(`\n[真实字段] 首条原始响应键值：`);
    log(JSON.stringify(first.raw, null, 2).split("\n").slice(0, 40).join("\n"));
    log(`\n[归一化] id=${first.id} | name=${first.name} | artist=${first.artist} | album=${first.album}`);
    log(`         pic=${first.pic ? first.pic.slice(0, 80) : "(空)"}`);
    log(`         duration=${first.duration} | freeSign=${first.freeSign ? first.freeSign.slice(0, 40) + "..." : "(空)"}`);
    log(`\n[列表]`);
    search.songs.forEach((s, i) => log(`  ${i + 1}. ${s.name} — ${s.artist} ${s.freeSign ? "[有freeSign]" : "[无freeSign]"}`));

    // 逐首验证：权限 → 取址 → 音频字节 → 歌词
    for (const song of search.songs.slice(0, 3)) {
      head(`验证：${song.name} — ${song.artist} (id=${song.id})`);
      const rec = { q, song: `${song.name}/${song.artist}`, id: song.id, steps: {} };

      // 1) 播放权限
      let right;
      try {
        right = await api.checkRight(song.id, song.freeSign);
        log(`① checkRight  status=${right.status}  preview=${right.preview ? `${right.preview.start}~${right.preview.end}` : "无"}`);
        rec.steps.checkRight = `status=${right.status}`;
      } catch (e) {
        log(`① checkRight  ❌ [${e.code || "?"}] ${e.message}`);
        rec.steps.checkRight = `ERR ${e.code}: ${e.message}`;
        results.push(rec);
        continue;
      }

      // 2) 音频地址（走统一入口，自动处理试听）
      let audio;
      try {
        audio = await api.audio(song.id, { quality: "high", freeSign: song.freeSign });
        log(`② audio       ✅ quality=${audio.quality}${audio.preview ? ` 试听 ${JSON.stringify(audio.preview)}` : ""}`);
        log(`   url = ${audio.url.slice(0, 120)}`);
        rec.steps.audio = `ok quality=${audio.quality}${audio.preview ? " preview" : ""}`;
      } catch (e) {
        log(`② audio       ❌ [${e.code || "?"}] ${e.message}`);
        rec.steps.audio = `ERR ${e.code}: ${e.message}`;
        results.push(rec);
        continue;
      }

      // 3) 音频字节验证（真的能下到音频流）
      const head3 = await fetchAudioHead(audio.url);
      if (head3.error) {
        log(`③ 音频字节     ❌ ${head3.error}`);
        rec.steps.bytes = `ERR ${head3.error}`;
      } else {
        const okMagic = /MP3|FLAC|MP4|OGG/.test(head3.magic);
        log(`③ 音频字节     ${okMagic ? "✅" : "⚠️"} HTTP ${head3.status} ${head3.contentType} ${head3.contentLength} magic=${head3.magic}`);
        rec.steps.bytes = `${head3.status} ${head3.magic}`;
      }

      // 4) 歌词 + AWLRC 解码
      try {
        const ly = await api.lyrics(song.id);
        const lines = ly.wordByWordText ? parseAwlrc(ly.wordByWordText) : [];
        const withChars = lines.filter((l) => l.chars && l.chars.length).length;
        let monotonic = true;
        for (const l of lines) {
          for (let i = 1; i < l.chars.length; i++) {
            if (l.chars[i].start < l.chars[i - 1].start) { monotonic = false; break; }
          }
          if (!monotonic) break;
        }
        log(`④ lyrics      ✅ 行级 ${ly.mainText.split("\n").filter(Boolean).length} 行 | 逐字 ${ly.wordByWordText ? "有" : "无"}`);
        log(`   AWLRC 解析：${lines.length} 行（其中 ${withChars} 行有 chars）| 字级时间轴单调=${monotonic ? "✅" : "❌"}`);
        log(`   AWLRC 原始片段：${ly.wordByWordText ? ly.wordByWordText.split("\n").slice(0, 2).join(" | ").slice(0, 160) : "(无)"}`);
        log(`   行级片段：${ly.mainText.split("\n").filter(Boolean).slice(0, 2).join(" | ").slice(0, 120)}`);
        rec.steps.lyrics = `${lines.length}行/${withChars}行有字 单调=${monotonic}`;
      } catch (e) {
        log(`④ lyrics      ❌ [${e.code || "?"}] ${e.message}`);
        rec.steps.lyrics = `ERR ${e.code}: ${e.message}`;
      }

      results.push(rec);
    }
  }

  head("汇总");
  for (const r of results) {
    if (r.steps) {
      log(`• ${r.song.padEnd(38)} ${JSON.stringify(r.steps)}`);
    } else {
      log(`• [${r.q}] ❌ ${r.why}`);
    }
  }
}

main().catch((e) => {
  console.error("\n❌ 脚本异常：", e && e.stack ? e.stack : e);
  process.exit(1);
});
