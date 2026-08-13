# Xiaofeng Music

[中文](README.md) | [English](README_EN.md)

A **fully transparent, borderless desktop floating music player** built with Electron. Features multi-source online search, playlist import, lyrics (with translation), background slideshow, and song download.

> Similar to a "floating desktop lyrics" widget, but far more complete — use it as a full player, or dock it as a small lyrics/slideshow window.

## 🎬 Demo

<video src="https://github.com/fengweimian/transparent-floating-music-player/raw/master/docs/demo.mp4" width="100%" controls muted loop style="max-width:760px; border-radius:10px;"></video>

> If the video does not play above, [download it directly](docs/demo.mp4).

---

## ✨ Features

### 🎵 Playback Core
- **Multi-source search**: NetEase Cloud / QQ Music / 歌曲宝 (Gequbao)
- **Playlist import**: NetEase & QQ Music links (incl. QQ short-link auto-expansion)
- **Custom playlists**: create / delete / add / remove / rename songs
- **Play queue**: sequential / shuffle / single-loop, removable & "play next" (insert ahead) items
- **Local music**: folder scanning (mp3 / wav / flac / ogg, etc.)

### 🎤 Lyrics
- LRC parsing with progress highlight
- **Karaoke-style word-by-word lyrics**: auto-fetched for QQ Music / NetEase songs, a light band sweeps continuously left-to-right (no login needed)
- **Lyrics translation** (official NetEase translation, toggleable in settings)
- Customizable **font size / system font / played-char color**

### 🖥 Desktop Lyrics
- **Separate always-on-top floating window**: draggable, lockable, closable
- **Control bar** (appears on hover at top): open main UI / prev / play-pause / next / lock / settings
- **Full settings**: single/double line, alignment, font size, played/unplayed char colors, opacity, stroke, bold, over-taskbar
- **Karaoke-style word-by-word lyrics** (same as main window, smooth & continuous)

### 🔑 NetEase Login (optional)
- Login entry at top-right (official login page QR, secure)
- **My playlists**: created & collected playlists (incl. "My Favorite" ❤), click to play
- **Daily recommendation**: 30 daily songs + recommended playlists
- **Listening history**: this-week / all-time toggle
- **Scrobble**: songs played in this player (≥60s) are reported to NetEase, counted in "recently played" & daily recommendations

### 🎧 QQ Music Login (optional)
- Separate login entry at top-right (opens QQ Music official login page, QR / account, secure)
- **My playlists**: created & collected playlists merged (favorite ❤ on top), click to play
- **Daily recommendation**: new songs + hot recommended playlists
- Login state also shown in **Settings page** (view status / logout)
- ⚠️ QQ Music login lasts ~1–3 days (QQ official limit); re-login when expired

### 🎨 Visual & Background
- **Transparent borderless floating window**, draggable anywhere on the desktop
- **Background slideshow**: images / videos, adjustable interval, preloading & cross-fade
- Blurred album-art background

### ⬇ Download
- One-click download of **MP3 + lyrics + cover** to a custom folder
- Quality selectable (128 / 192 / 320 kbps)
- **Toast notification** on completion — click to reveal the file in Explorer

### 🖥 System Integration
- System tray (background dwell, **double-click tray icon shows main window**)
- Volume & playback state persistence (restored after restart)
- Launch on startup (optional)

---

## 📦 Installation

Download the latest installer from [Releases](https://github.com/fengweimian/transparent-floating-music-player/releases):

- `XiaofengMusic-Setup-3.2.25.exe` — NSIS installer (recommended)

> **Windows x64 only.** Custom install directory supported.

---

## 🚀 Quick Start

1. Open the player (transparent floating window, draggable with mouse)
2. Search songs, or paste a playlist link to import
3. Click a song to play; open **Settings** to configure:
   - **Music folder** — local music directory
   - **Image/Video folder** — slideshow assets
   - **Download folder** — song save location
4. Lyrics show by default; enable "Show translation" in settings

> See [docs/使用手册.md](docs/使用手册.md) for details (Chinese).

---

## 🔧 Development & Build

```bash
# Install dependencies
npm install

# Run in development
npm start

# Build Windows installer
npm run build
```

> ⚠️ Note: On some machines electron-builder may hang at the packaging stage on first run (likely antivirus / I/O jitter). Stop it and retry.

---

## 🛠 Tech Stack

| Component | Description |
|---|---|
| [Electron](https://www.electronjs.org/) | 33.x desktop shell |
| Vanilla JavaScript | No front-end framework, pure DOM |
| [@meting/core](https://github.com/metowolf/MetingJS) | NetEase / QQ Music API wrapper |
| [font-list](https://www.npmjs.com/package/font-list) | System font enumeration (lyrics font picker) |
| [electron-builder](https://www.electronjs.org/docs/latest/tutorial/electron-builder) | Windows packaging |

---

## 📁 Project Structure

```
├── main.js            # Main process (window/tray/music API/download)
├── preload.js         # Preload (IPC bridge)
├── renderer/          # Renderer (UI/lyrics/slideshow/player logic)
├── resources/         # App icons
├── scripts/           # Icon generation scripts
├── docs/              # User manual
└── build/             # Packaging assets (icon.ico)
```

---

## ⚠️ Disclaimer

- This project is for **learning and personal use only**. Music copyrights belong to the respective platforms. Do not use for commercial purposes.
- Online sources come from public APIs; if they break, update dependencies or wait for fixes.
- `main.js` sets `webSecurity: false` (needed for cross-origin audio playback). Do not load untrusted remote pages in it.

---

## 📄 License

[MIT](LICENSE)
