class Slideshow {
  constructor() {
    this.slides = [];
    this.imageFolder = "";
    this.currentIdx = -1;
    this.isRunning = false;
    this.transitioning = false;
    this.interval = 8;

    this.imgBackEl = document.getElementById("slide-back");
    this.imgFrontEl = document.getElementById("slide-front");
    this.videoBackEl = document.getElementById("slide-video-back");
    this.videoFrontEl = document.getElementById("slide-video-front");

    this.usingFront = false;
    this.videoEndBound = null;
    this.videoTimeout = null;
    this.currentSlideType = null;
    this.activeVideoEl = null;

    this.preloaded = new Map();

    this.imageTransitions = [
      "fade", "fade", "fade",
      "zoomIn", "zoomIn",
      "slideLeft", "slideRight", "slideUp",
      "blurIn",
    ];
  }

  // ========== Public API ==========

  async setImageFolder(folderPath) {
    this.stop();
    this.preloaded.clear();
    this.imageFolder = folderPath;

    const images = await window.electronAPI.fs.scanFiles(folderPath, [
      ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"
    ]);
    const videos = await window.electronAPI.fs.scanFiles(folderPath, [
      ".mp4", ".webm", ".mov", ".avi", ".mkv"
    ]);

    this.slides = [];
    for (const f of images) this.slides.push({ type: "image", file: f });
    for (const f of videos) this.slides.push({ type: "video", file: f });

    this.currentIdx = -1;
    this.usingFront = false;
    this.hideAll();

    if (this.slides.length > 0) {
      this.currentIdx = 0;
      await this.showSlide(0, false);
      this.preloadNearby(0);
      return true;
    }
    return false;
  }

  start() {
    if (this.slides.length === 0) return;
    this.isRunning = true;
    if (this.currentSlideType === "video") {
      this.playCurrentVideo();
    } else {
      this.scheduleNext();
    }
  }

  stop() {
    this.isRunning = false;
    this.clearVideoWatchers();
    this.pauseAllVideos();
    this.transitioning = false;
  }

  setInterval(seconds) {
    this.interval = seconds;
    if (this.isRunning) {
      this.stop();
      this.start();
    }
  }

  // ========== Scheduling ==========

  scheduleNext() {
    if (!this.isRunning) return;
    this.clearVideoWatchers();
    this.videoTimeout = setTimeout(() => this.nextSlide(), this.interval * 1000);
  }

  clearVideoWatchers() {
    if (this.videoTimeout) { clearTimeout(this.videoTimeout); this.videoTimeout = null; }
    if (this.videoEndBound) {
      const el = this.activeVideoEl;
      if (el) el.removeEventListener("ended", this.videoEndBound);
      this.videoEndBound = null;
    }
  }

  pauseAllVideos() {
    this.videoBackEl.pause();
    this.videoFrontEl.pause();
  }

  hideAll() {
    this.imgBackEl.style.opacity = "0";
    this.imgBackEl.style.animation = "none";
    this.imgFrontEl.style.opacity = "0";
    this.imgFrontEl.style.animation = "none";
    this.videoBackEl.style.opacity = "0";
    this.videoBackEl.style.animation = "none";
    this.videoFrontEl.style.opacity = "0";
    this.videoFrontEl.style.animation = "none";
  }

  // ========== Navigation ==========

  async nextSlide() {
    if (!this.isRunning || this.slides.length === 0 || this.transitioning) {
      if (this.currentSlideType === "video") this.playCurrentVideo();
      else this.scheduleNext();
      return;
    }

    this.transitioning = true;
    this.clearVideoWatchers();

    const nextIdx = (this.currentIdx + 1) % this.slides.length;
    const curr = this.slides[this.currentIdx];
    const next = this.slides[nextIdx];
    const file = next.file;
    const nextPath = await window.electronAPI.path.join(this.imageFolder, file);

    if (curr.type === "image" && next.type === "image") {
      await this.imgToImg(nextPath);
    } else if (curr.type === "image" && next.type === "video") {
      await this.imgToVideo(nextPath);
    } else if (curr.type === "video" && next.type === "image") {
      await this.videoToImg(nextPath);
    } else if (curr.type === "video" && next.type === "video") {
      await this.videoToVideo(nextPath);
    }

    this.currentIdx = nextIdx;
    this.currentSlideType = next.type;
    this.preloadNearby(nextIdx);
  }

  // ========== Image → Image ==========

  async imgToImg(filePath) {
    const transition = this.imageTransitions[Math.floor(Math.random() * this.imageTransitions.length)];
    const targetEl = this.usingFront ? this.imgBackEl : this.imgFrontEl;
    const oldEl = this.usingFront ? this.imgFrontEl : this.imgBackEl;

    return new Promise((resolve) => {
      targetEl.src = "file:///" + filePath.replace(/\\/g, "/");
      targetEl.onload = () => {
        this.executeImageTransition(oldEl, targetEl, transition, () => {
          this.usingFront = !this.usingFront;
          this.transitioning = false;
          this.scheduleNext();
          resolve();
        });
      };
      targetEl.onerror = () => {
        this.transitioning = false;
        this.scheduleNext();
        resolve();
      };
    });
  }

  executeImageTransition(oldEl, newEl, type, onComplete) {
    oldEl.style.animation = "none";
    newEl.style.animation = "none";
    oldEl.offsetHeight;
    newEl.offsetHeight;

    const duration = 1.2;
    let completed = false;
    let fallbackTimer = null;

    const finish = () => {
      if (completed) return;
      completed = true;
      if (fallbackTimer) clearTimeout(fallbackTimer);
      oldEl.style.opacity = "0";
      oldEl.style.transition = "";
      newEl.style.opacity = "1";
      onComplete();
    };

    switch (type) {
      case "fade":
        oldEl.style.animation = `anim-fade-out ${duration}s cubic-bezier(0.4,0,0.2,1) forwards`;
        newEl.style.opacity = "1";
        newEl.style.animation = `anim-fade-in ${duration}s cubic-bezier(0.4,0,0.2,1) forwards`;
        newEl.style.transform = "scale(1)";
        break;
      case "zoomIn":
        oldEl.style.animation = `anim-fade-out ${duration * 0.6}s ease-out forwards`;
        newEl.style.opacity = "1";
        newEl.style.animation = `anim-zoom-in ${duration}s cubic-bezier(0.4,0,0.2,1) forwards`;
        break;
      case "slideLeft":
        oldEl.style.opacity = "0.3";
        oldEl.style.transition = `opacity ${duration * 0.5}s`;
        newEl.style.opacity = "1";
        newEl.style.animation = `anim-slide-left-in ${duration * 0.8}s cubic-bezier(0,0,0.2,1) forwards`;
        break;
      case "slideRight":
        oldEl.style.opacity = "0.3";
        oldEl.style.transition = `opacity ${duration * 0.5}s`;
        newEl.style.opacity = "1";
        newEl.style.animation = `anim-slide-right-in ${duration * 0.8}s cubic-bezier(0,0,0.2,1) forwards`;
        break;
      case "slideUp":
        oldEl.style.opacity = "0.3";
        oldEl.style.transition = `opacity ${duration * 0.5}s`;
        newEl.style.opacity = "1";
        newEl.style.animation = `anim-slide-up-in ${duration * 0.8}s cubic-bezier(0,0,0.2,1) forwards`;
        break;
      case "blurIn":
        oldEl.style.animation = `anim-blur-out ${duration * 0.7}s ease-in forwards`;
        newEl.style.opacity = "1";
        newEl.style.animation = `anim-blur-in ${duration}s ease-out forwards`;
        break;
      default:
        oldEl.style.opacity = "0";
        newEl.style.opacity = "1";
    }

    setTimeout(() => {
      if (!completed && parseFloat(getComputedStyle(newEl).opacity) > 0.5) {
        newEl.style.animation = "none";
        newEl.offsetHeight;
        newEl.style.animation = `ken-burns-active ${this.interval}s ease-in-out forwards`;
        newEl.style.transformOrigin = "center center";
      }
    }, duration * 1000);

    newEl.addEventListener("animationend", finish, { once: true });
    fallbackTimer = setTimeout(() => finish(), (duration + 0.5) * 1000);
  }

  // ========== Image → Video ==========

  async imgToVideo(filePath) {
    const activeImg = this.usingFront ? this.imgFrontEl : this.imgBackEl;
    const inactiveImg = this.usingFront ? this.imgBackEl : this.imgFrontEl;
    const targetVideo = this.videoFrontEl;
    const src = "file:///" + filePath.replace(/\\/g, "/");

    this.activeVideoEl = targetVideo;
    targetVideo.src = src;
    targetVideo.style.animation = "none";
    targetVideo.style.opacity = "0";
    targetVideo.offsetHeight;

    return new Promise((resolve) => {
      const onReady = () => {
        targetVideo.removeEventListener("loadeddata", onReady);
        this.crossfadeEl(activeImg, targetVideo, () => {
          inactiveImg.style.opacity = "0";
          this.transitioning = false;
          this.playCurrentVideo();
          resolve();
        });
      };
      targetVideo.addEventListener("loadeddata", onReady, { once: true });
      targetVideo.load();
    });
  }

  // ========== Video → Image ==========

  async videoToImg(filePath) {
    const oldVideo = this.activeVideoEl;
    const targetImg = this.usingFront ? this.imgFrontEl : this.imgBackEl;
    const src = "file:///" + filePath.replace(/\\/g, "/");

    return new Promise((resolve) => {
      targetImg.src = src;
      targetImg.onload = () => {
        this.crossfadeEl(oldVideo, targetImg, () => {
          oldVideo.style.opacity = "0";
          oldVideo.pause();
          oldVideo.removeAttribute("src");
          this.activeVideoEl = null;
          this.usingFront = !this.usingFront;
          this.transitioning = false;
          this.scheduleNext();
          resolve();
        });
      };
      targetImg.onerror = () => {
        this.transitioning = false;
        this.scheduleNext();
        resolve();
      };
    });
  }

  // ========== Video → Video (dual crossfade) ==========

  async videoToVideo(filePath) {
    const oldVideo = this.activeVideoEl;
    const newVideo = (oldVideo === this.videoFrontEl) ? this.videoBackEl : this.videoFrontEl;
    const src = "file:///" + filePath.replace(/\\/g, "/");

    newVideo.src = src;
    newVideo.style.animation = "none";
    newVideo.style.opacity = "0";
    newVideo.offsetHeight;

    return new Promise((resolve) => {
      const onReady = () => {
        newVideo.removeEventListener("loadeddata", onReady);
        this.crossfadeEl(oldVideo, newVideo, () => {
          oldVideo.style.opacity = "0";
          oldVideo.pause();
          oldVideo.removeAttribute("src");
          this.activeVideoEl = newVideo;
          this.transitioning = false;
          this.playCurrentVideo();
          resolve();
        });
      };
      newVideo.addEventListener("loadeddata", onReady, { once: true });
      newVideo.load();
    });
  }

  // ========== Crossfade Helper ==========

  crossfadeEl(oldEl, newEl, callback) {
    oldEl.style.animation = "none";
    oldEl.offsetHeight;
    oldEl.style.animation = "anim-fade-out 0.8s ease-out forwards";
    newEl.style.opacity = "1";
    newEl.style.animation = "anim-fade-in 0.8s ease-out forwards";

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      newEl.removeEventListener("animationend", finish);
      callback();
    };
    newEl.addEventListener("animationend", finish, { once: true });
    setTimeout(finish, 1000);
  }

  // ========== Video Playback ==========

  playCurrentVideo() {
    if (!this.isRunning) return;
    const slide = this.slides[this.currentIdx];
    if (!slide || slide.type !== "video") return;

    const el = this.activeVideoEl;
    if (!el) return;

    el.style.opacity = "1";
    el.currentTime = 0;
    el.play().catch(() => {});

    this.videoEndBound = () => { this.videoEndBound = null; this.nextSlide(); };
    el.addEventListener("ended", this.videoEndBound, { once: true });

    // 视频由 ended 事件驱动切换；兜底超时仅用于视频卡死/无法触发 ended 的异常情况（30s）
    this.videoTimeout = setTimeout(() => {
      if (this.videoEndBound) {
        el.removeEventListener("ended", this.videoEndBound);
        this.videoEndBound = null;
      }
      this.nextSlide();
    }, 30000);
  }

  // ========== Initial Load ==========

  async showSlide(index, animate) {
    const slide = this.slides[index];
    const fp = await window.electronAPI.path.join(this.imageFolder, slide.file);
    const src = "file:///" + fp.replace(/\\/g, "/");

    if (slide.type === "image") {
      this.videoBackEl.style.opacity = "0";
      this.videoFrontEl.style.opacity = "0";
      this.pauseAllVideos();
      this.imgBackEl.src = src;
      this.imgBackEl.style.opacity = "1";
      this.imgBackEl.style.animation = "none";
      this.imgFrontEl.style.opacity = "0";
      this.imgFrontEl.style.animation = "none";
      this.activeVideoEl = null;
    } else {
      this.imgBackEl.style.opacity = "0";
      this.imgFrontEl.style.opacity = "0";
      this.videoBackEl.style.opacity = "0";
      this.videoFrontEl.style.opacity = "1";
      this.videoFrontEl.src = src;
      this.videoFrontEl.currentTime = 0;
      this.activeVideoEl = this.videoFrontEl;
      if (animate) this.videoFrontEl.play();
    }
    this.currentSlideType = slide.type;
  }

  // ========== Preload Queue ==========

  async preloadNearby(index) {
    for (let i = 1; i <= 3; i++) {
      const nextIdx = (index + i) % this.slides.length;
      if (nextIdx === index) continue;
      if (this.preloaded.has(nextIdx)) continue;

      const slide = this.slides[nextIdx];
      if (slide.type !== "image") continue;

      const fp = await window.electronAPI.path.join(this.imageFolder, slide.file);
      const img = new Image();
      img.src = "file:///" + fp.replace(/\\/g, "/");
      this.preloaded.set(nextIdx, img);
    }

    if (this.preloaded.size > 8) {
      const keys = [...this.preloaded.keys()];
      for (let i = 0; i < keys.length - 5; i++) {
        this.preloaded.delete(keys[i]);
      }
    }
  }
}
