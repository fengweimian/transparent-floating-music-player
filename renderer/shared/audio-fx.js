/* ============================================================
 * audio-fx.js —— 统一音频效果引擎（v3.8.0）
 *
 * 提供两种「双声道」效果，所有模板共用：
 *   · 8d  —— 8D 环绕：StereoPanner + 低频 LFO，声音在左右之间流动
 *   · alt —— 左右交替：ChannelSplitter → 2×Gain → ChannelMerger，
 *            每 N 秒只让一边出声（10~30ms 斜坡防爆音）
 *
 * ⚠️ 关键约束（踩过的坑，改动前务必读）：
 *  1) 一个 HTMLMediaElement 只能 createMediaElementSource() 一次，
 *     重复调用抛 InvalidStateError → 本模块是**唯一**接入点，
 *     模板已有 Web Audio 图（如新版模板的频谱）必须走 tap()，不要自己再建。
 *  2) 一旦接入，音频就永远走图，不能完全旁路回原始直通；
 *     等价做法是 dry 支路 gain=1（听感无差）。
 *  3) 单声道音源必须先 up-mix，否则 ChannelSplitter 第 2 路全静音，
 *     交替效果会退化成「只有一边响」。已在 upmix 节点强制 2 通道。
 *  4) AudioContext 若处于 suspended，接图后会**完全没声音**。
 *     故 attach 时 + 每次 play 事件都尝试 resume()。
 *  5) 所有增益切换一律带斜坡，硬切会有明显爆音。
 *  6) 默认必须是 off —— 否则用户一开就以为播放器坏了。
 *
 * 链路：
 *   source → upmix(强制 2ch) ─┬─→ dry ─────────────────────────┐
 *                             ├─→ splitter → gainL/gainR → merger → altOut ─┤→ master → destination
 *                             └─→ panner(pan←lfo) ────────────→ d8Out ──────┘
 *                     master → tap(node) 供频谱等只读节点并联（死端，不影响输出）
 * ============================================================ */
(function () {
  "use strict";

  var LS_KEY = "xf-audiofx-state";
  var MODES = ["off", "8d", "alt"];
  var MODE_NAMES = { off: "原声", "8d": "8D 环绕", alt: "左右交替" };
  var PERIODS = [1, 2, 4];
  var DEFAULT_PERIOD = 2;
  var RAMP = 0.03;             // 交叉淡入/切换斜坡时长（秒）

  var ctx = null;
  var master = null;           // 总输出（→ destination）
  var dryGain = null;          // 直通支路
  var upmix = null;            // 单声道 → 立体声
  var splitter = null, merger = null, gainL = null, gainR = null, altOut = null;
  var panner = null, lfo = null, lfoDepth = null, d8Out = null;

  var currentSource = null;
  var boundEl = null;
  var altTimer = null;
  var altOnLeft = true;
  var listeners = [];

  var state = { mode: "off", period: DEFAULT_PERIOD };

  // ---------- 持久化 ----------
  function load() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      var o = JSON.parse(raw) || {};
      if (MODES.indexOf(o.mode) >= 0) state.mode = o.mode;
      if (PERIODS.indexOf(Number(o.period)) >= 0) state.period = Number(o.period);
    } catch (e) { /* 忽略 */ }
  }
  function save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {}
  }

  // ---------- 监听 ----------
  function emit() {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](state.mode, state.period); } catch (e) {}
    }
  }

  // ---------- 斜坡 ----------
  function rampTo(param, value, now) {
    if (!param) return;
    try {
      param.cancelScheduledValues(now);
      param.setValueAtTime(param.value, now);
      param.linearRampToValueAtTime(value, now + RAMP);
    } catch (e) {
      try { param.value = value; } catch (e2) {}
    }
  }

  // ---------- 建图 ----------
  function buildGraph() {
    master = ctx.createGain();

    // 单声道 → 立体声：channelCountMode=explicit + speakers 会把 mono 复制到 L/R
    upmix = ctx.createGain();
    upmix.channelCount = 2;
    upmix.channelCountMode = "explicit";
    upmix.channelInterpretation = "speakers";

    dryGain = ctx.createGain();
    dryGain.gain.value = 1;

    // 交替支路
    splitter = ctx.createChannelSplitter(2);
    gainL = ctx.createGain();
    gainR = ctx.createGain();
    gainL.gain.value = 1;
    gainR.gain.value = 1;
    merger = ctx.createChannelMerger(2);
    altOut = ctx.createGain();
    altOut.gain.value = 0;

    upmix.connect(splitter);
    splitter.connect(gainL, 0);
    splitter.connect(gainR, 1);
    gainL.connect(merger, 0, 0);
    gainR.connect(merger, 0, 1);
    merger.connect(altOut);
    altOut.connect(master);

    // 8D 环绕支路
    panner = ctx.createStereoPanner();
    lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 1 / state.period;   // 一个完整往返回所需秒数 = period
    lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 1;                  // pan 扫满 -1 ~ +1
    lfo.connect(lfoDepth);
    lfoDepth.connect(panner.pan);
    d8Out = ctx.createGain();
    d8Out.gain.value = 0;

    upmix.connect(panner);
    panner.connect(d8Out);
    d8Out.connect(master);

    // 直通
    upmix.connect(dryGain);
    dryGain.connect(master);

    master.connect(ctx.destination);
    try { lfo.start(); } catch (e) {}
  }

  function resume() {
    if (ctx && ctx.state === "suspended") {
      try { ctx.resume(); } catch (e) {}
    }
  }

  // ---------- 交替定时器 ----------
  function applyAlt(leftOn) {
    var t = ctx ? ctx.currentTime : 0;
    rampTo(gainL.gain, leftOn ? 1 : 0, t);
    rampTo(gainR.gain, leftOn ? 0 : 1, t);
  }
  function startAltTimer() {
    stopAltTimer();
    altTimer = setInterval(function () {
      altOnLeft = !altOnLeft;
      applyAlt(altOnLeft);
    }, state.period * 1000);
  }
  function stopAltTimer() {
    if (altTimer) { clearInterval(altTimer); altTimer = null; }
  }

  // ---------- 状态 → 图 ----------
  function applyStateToGraph() {
    if (!ctx) return;
    var t = ctx.currentTime;
    var on = state.mode !== "off";
    rampTo(dryGain.gain, on ? 0 : 1, t);
    rampTo(altOut.gain, state.mode === "alt" ? 1 : 0, t);
    rampTo(d8Out.gain, state.mode === "8d" ? 1 : 0, t);
    if (lfo) {
      try { lfo.frequency.setValueAtTime(1 / state.period, t); } catch (e) {}
    }
    if (state.mode === "alt") {
      altOnLeft = true;
      applyAlt(true);
      startAltTimer();
    } else {
      stopAltTimer();
    }
  }

  // ---------- 对外 API ----------
  function attach(el) {
    if (!el) return false;
    if (boundEl === el && currentSource) { resume(); return true; }
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      if (!ctx) {
        ctx = new AC();
        buildGraph();
      }
      // 换元素：断开旧源
      if (currentSource) { try { currentSource.disconnect(); } catch (e) {} }
      boundEl = el;
      currentSource = ctx.createMediaElementSource(el);
      currentSource.connect(upmix);
      if (!el.__xfFxPlayBound) {
        el.__xfFxPlayBound = true;
        el.addEventListener("play", resume);
      }
      resume();
      applyStateToGraph();
      return true;
    } catch (e) {
      // 失败回退：不接图，音频保持直通原样
      console.warn("[XFAudioFx] attach 失败，已回退直通：", e && e.message);
      return false;
    }
  }

  function tap(node) {
    if (master && node && node.connect) {
      try { master.connect(node); } catch (e) {}
    }
    return node;
  }

  function setMode(mode) {
    if (MODES.indexOf(mode) < 0) mode = "off";
    state.mode = mode;
    save();
    applyStateToGraph();
    emit();
    return state.mode;
  }

  function cycleMode() {
    var i = MODES.indexOf(state.mode);
    return setMode(MODES[(i + 1) % MODES.length]);
  }

  function setPeriod(sec) {
    sec = Number(sec);
    if (PERIODS.indexOf(sec) < 0) sec = DEFAULT_PERIOD;
    state.period = sec;
    save();
    if (ctx) applyStateToGraph();
    else emit();
    return state.period;
  }

  function cyclePeriod() {
    var i = PERIODS.indexOf(state.period);
    return setPeriod(PERIODS[(i + 1) % PERIODS.length]);
  }

  function modeName(m) { return MODE_NAMES[m || state.mode] || MODE_NAMES.off; }

  // 调试/验收用：暴露内部节点实时值
  function debug() {
    function v(p) { try { return p ? +p.value.toFixed(3) : null; } catch (e) { return null; } }
    return {
      ready: !!ctx,
      ctxState: ctx ? ctx.state : "none",
      sampleRate: ctx ? ctx.sampleRate : 0,
      mode: state.mode,
      period: state.period,
      dry: v(dryGain && dryGain.gain),
      altOut: v(altOut && altOut.gain),
      d8Out: v(d8Out && d8Out.gain),
      gainL: v(gainL && gainL.gain),
      gainR: v(gainR && gainR.gain),
      pan: v(panner && panner.pan),
      lfoFreq: v(lfo && lfo.frequency),
      srcChannelCount: currentSource ? currentSource.channelCount : 0,
      bound: !!boundEl,
    };
  }

  /* 绑定播放器上的小按钮：
   *   单击 → 循环 off → 8D → 交替 → off
   *   右键 / 长按 → 在「交替」模式下切换间隔 1s → 2s → 4s
   * opts: { onTip: function(text) }  可选，用于各模板自身的反馈提示 */
  function bindButton(btn, opts) {
    if (!btn) return;
    opts = opts || {};
    var tip = typeof opts.onTip === "function" ? opts.onTip : function () {};
    var LONG_MS = 550;
    var pressTimer = null;
    var consumed = false;

    function refresh() {
      var m = state.mode;
      btn.title = "音效：" + modeName(m) +
        (m === "alt" ? "（间隔 " + state.period + " 秒）" : "") +
        "　单击切换 · 右键切换间隔";
      btn.classList.toggle("fx-active", m !== "off");
      var icons = { off: "fx-icon-off", "8d": "fx-icon-8d", alt: "fx-icon-alt" };
      Object.keys(icons).forEach(function (k) {
        var el = document.getElementById(icons[k]);
        if (el) el.style.display = m === k ? "" : "none";
      });
    }

    btn.addEventListener("click", function () {
      if (consumed) { consumed = false; return; }
      var m = cycleMode();
      refresh();
      tip("音效：" + modeName(m) + (m === "alt" ? "（间隔 " + state.period + " 秒）" : ""));
    });

    btn.addEventListener("contextmenu", function (e) {
      e.preventDefault();
      var p = cyclePeriod();
      refresh();
      tip("声道交替间隔：" + p + " 秒");
    });

    btn.addEventListener("pointerdown", function () {
      consumed = false;
      clearTimeout(pressTimer);
      pressTimer = setTimeout(function () {
        consumed = true;
        var p = cyclePeriod();
        refresh();
        tip("声道交替间隔：" + p + " 秒");
      }, LONG_MS);
    });
    ["pointerup", "pointerleave", "pointercancel"].forEach(function (ev) {
      btn.addEventListener(ev, function () { clearTimeout(pressTimer); });
    });

    listeners.push(refresh);
    refresh();
  }

  window.XFAudioFx = {
    MODES: MODES.slice(),
    PERIODS: PERIODS.slice(),
    attach: attach,
    tap: tap,
    setMode: setMode,
    getMode: function () { return state.mode; },
    cycleMode: cycleMode,
    setPeriod: setPeriod,
    getPeriod: function () { return state.period; },
    cyclePeriod: cyclePeriod,
    modeName: modeName,
    ctx: function () { return ctx; },
    ready: function () { return !!ctx; },
    onChange: function (fn) { if (typeof fn === "function") listeners.push(fn); },
    bindButton: bindButton,
    debug: debug,
  };

  load();
})();
