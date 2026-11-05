/* =====================================================================
 * 弹珠祭典 · KORO MATSURI —— 竖屏日式街机弹珠
 * 零依赖 / Canvas 2D 程序化美术 / WebAudio 合成 / 双击 index.html 即玩
 * 设计见 DESIGN.md：彩玉保留 · リーチ法則 · 祭道右打ち · 提灯Rush · 御神籤构筑
 * ===================================================================== */
(() => {
'use strict';

/* ------------------------------------------------------------------ *
 * 0. 常量与工具
 * ------------------------------------------------------------------ */

/** 逻辑分辨率（竖屏街机框体），实际按窗口等比缩放 */
const LW = 450, LH = 800;

/** 玩法数值表：调平衡只改这里 */
const CFG = {
  // 发射
  railX: 411, railTop: 168, railBottom: 742,
  exitX: 378, exitY: 178,          // 出轨点必须在右墙（398）内侧足够远，否则会被墙弹回轨道
  powerMin: 0.30, powerMax: 1.00, powerRate: 0.62,
  launchJitter: 0.022,
  ballR: 6.0,
  gravity: 980,
  maxBallsNormal: 3, maxBallsFever: 8,
  startBalls: 30, launchCd: 0.34,
  // 奖励
  scorePeg: 5, scorePocket: 100, scoreStart: 200, scoreTorii: 500, scoreSay: 120,
  scoreFirework: 800, scoreJackpot: 1000, scoreSuper: 5000, scoreLantern: 100,
  ballPocket: 2, ballStart: 3, ballTorii: 4, ballSay: 2,
  // 连击
  comboWindow: 4.0, comboSteps: [1, 1.5, 2, 3], comboAt: [0, 2, 4, 6],
  // 彩玉保留
  reserveMax: 3, reserveRoll: 1.2,
  // 抽签
  spinStop1: 0.75, spinStop2: 1.35, spinStop3: 2.05,
  reachTime: 2.4, jackpotFxTime: 2.5, jackpotFxMin: 0.9,
  // 祭道 / Rush
  feverTime: 15, superFeverTime: 20,
  chuckerOpen: 0.9, chuckerShut: 0.5, bpm: 124,
  rushTime: 30, matsuriTime: 45,
  rushRate: 0.66, matsuriRate: 0.81, rushRateCap: 0.80,
  rushToriiNeed: 6, matsuriChain: 3, feverExtend: 8,
  // 任务
  missionScore: 6000, missionTorii: 12,
  roundTime: 300,                     // 一夜限りの祭典：5 分钟后夜明け（结算）
};

/** 彩玉期待度阶梯（真台 白<青<緑<赤<金<虹；加权后综合中奖率 ≈ 1/8） */
const SAITAMA = [
  { id: 'white', name: '白', color: '#e9edf7', expect: 0.06, weight: 0.700, shape: 'circle' },
  { id: 'blue', name: '青', color: '#54c8ff', expect: 0.16, weight: 0.180, shape: 'diamond' },
  { id: 'green', name: '緑', color: '#63e08a', expect: 0.35, weight: 0.070, shape: 'triangle' },
  { id: 'red', name: '赤', color: '#ff5a6e', expect: 0.60, weight: 0.035, shape: 'square' },
  { id: 'gold', name: '金', color: '#ffd24a', expect: 0.85, weight: 0.012, shape: 'star' },
  { id: 'rain', name: '虹', color: '#ff8ae0', expect: 1.00, weight: 0.003, shape: 'ring' },
];
const SAITAMA_W_TOTAL = SAITAMA.reduce((a, s) => a + s.weight, 0);

/** リーチ四种：明示信頼度 + 固有法則（法則崩し＝大当り確定） */
const REACH_TYPES = [
  { id: 'lantern', name: '提灯リーチ', trust: 0.35, rule: '总是从左到右点亮', breakText: '灯は右から順に灯った！' },
  { id: 'taiko', name: '太鼓リーチ', trust: 0.55, rule: '鼓槌左右交替', breakText: '両の枹が同時に堕ちた！' },
  { id: 'mikoshi', name: '神輿渡御リーチ', trust: 0.75, rule: '神輿は一度寄る', breakText: '神輿は寄らずに渡った！' },
  { id: 'hanabi', name: '花火リーチ', trust: 0.92, rule: '三発目は菊', breakText: '三発目は牡丹だった！' },
];

/** 御神籤构筑（大当り后三选一，本局最多叠 3 张） */
const OMIFUDA = [
  { id: 'split', name: '分きの球', rar: 0, text: '发射 25% 概率射出双球' },
  { id: 'magnet', name: '磁寄の守', rar: 0, text: '球经过启动口时被轻微吸附' },
  { id: 'saisen', name: '賽銭の壺', rar: 0, text: '撞钉分数 ×3' },
  { id: 'haya', name: '早打ち', rar: 0, text: '发射间隔 −30%' },
  { id: 'hozone', name: '保留↑', rar: 1, text: '彩玉槽 3 → 4' },
  { id: 'niji', name: '虹出やすい', rar: 1, text: '金/虹 の確率 +20%' },
  { id: 'toriiw', name: '鳥居Wide', rar: 1, text: '電チュー鳥居开口 +0.25s' },
  { id: 'ren', name: '連祭', rar: 2, text: 'Rush 継続率 +8%（上限 80%）' },
];

/** 6 件固定条件外观 */
const SKINS = [
  { id: 'glass', name: '玻璃弹珠', condText: '默认持有' },
  { id: 'kingyo', name: '金鱼弹珠', condText: '夏日祭首次通关' },
  { id: 'hanabi', name: '烟花弹珠', condText: '单次祭道进鸟居 12 次' },
  { id: 'akacho', name: '红色提灯组', condText: '累计获得 6 颗星' },
  { id: 'kanorii', name: '金色鸟居框体', condText: '夏日祭三星' },
  { id: 'song', name: '主题曲完整版', condText: '首次触发超级大当たり' },
];

/** 撞钉音阶（越乐调 D・F・G・A・C，连续碰撞自然成旋律） */
const PEG_SCALE = [293.66, 349.23, 392.00, 440.00, 523.25, 587.33, 698.46];

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const pick = (arr) => arr[randi(arr.length)];
const fmt = (n) => Math.floor(n).toLocaleString('en-US');

/** 确定性随机（自测复现同一局） */
let rngSeed = 1;
let useSeeded = false;
function seededRandom() {
  rngSeed = (rngSeed * 1664525 + 1013904223) >>> 0;
  return rngSeed / 4294967296;
}
const R = () => (useSeeded ? seededRandom() : Math.random());
/** 全站唯一随机入口：自测里走种子流，保证同一局可复现 */
const rand = (a = 1, b = 0) => b + R() * (a - b);
const randi = (n) => Math.floor(R() * n);

function hexA(hex, a) {
  const h = String(hex).replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  if (Number.isNaN(n)) return `rgba(255,255,255,${a})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/* ------------------------------------------------------------------ *
 * 1. 画布
 * ------------------------------------------------------------------ */

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
const hintEl = document.getElementById('hint');
let viewScale = 1;

function resize() {
  const pad = window.innerWidth < 560 ? 4 : 24;
  const availW = Math.max(240, window.innerWidth - pad * 2);
  const availH = Math.max(320, window.innerHeight - pad * 2);
  const scale = Math.min(availW / LW, availH / LH);
  viewScale = scale;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(LW * scale * dpr);
  canvas.height = Math.round(LH * scale * dpr);
  canvas.style.width = `${Math.round(LW * scale)}px`;
  canvas.style.height = `${Math.round(LH * scale)}px`;
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  if (hintEl) {
    hintEl.style.opacity = window.innerWidth < 700 ? '0' : '1';
    hintEl.textContent = '蓄力：按住 空格 / 鼠标 / 触屏 松开发射 · Q 提前开封彩玉 · Esc 设置 · Enter 跳过演出';
  }
}
window.addEventListener('resize', resize);

/* ------------------------------------------------------------------ *
 * 2. 音频：太鼓 / 三味线 / 电子鼓 分层动态音乐 + 全合成音效
 * ------------------------------------------------------------------ */

class AudioEngine {
  constructor() {
    this.ac = null; this.ready = false;
    this.musicVol = 0.55; this.sfxVol = 0.8;
    this.scene = 'title'; this.step = 0; this.nextTime = 0; this.timer = 0;
    this.muteUntil = 0; this.voices = 0; this.lastPeg = 0; this.pegIdx = 0;
  }

  ensure() {
    if (this.ac) { if (this.ac.state === 'suspended') this.ac.resume(); return true; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try { this.ac = new AC(); } catch (e) { return false; }
    const ac = this.ac;
    this.master = ac.createGain(); this.master.gain.value = 0.9; this.master.connect(ac.destination);
    this.musicG = ac.createGain(); this.musicG.gain.value = this.musicVol; this.musicG.connect(this.master);
    this.sfxG = ac.createGain(); this.sfxG.gain.value = this.sfxVol; this.sfxG.connect(this.master);
    const len = Math.floor(ac.sampleRate * 1.2);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    this.ready = true;
    this.nextTime = ac.currentTime + 0.08;
    this.timer = setInterval(() => this.schedule(), 25);
    return true;
  }

  setVolumes(music, sfx) {
    this.musicVol = music; this.sfxVol = sfx;
    if (!this.ready) return;
    this.musicG.gain.value = music * music * 1.25;
    this.sfxG.gain.value = sfx * 0.9;
  }

  setScene(name) { if (this.scene !== name) { this.scene = name; this.step = 0; } }

  /** 中奖瞬间的约 0.2 秒静音，随后爆发 */
  duckThenBurst(sec = 0.2) {
    if (!this.ready) return;
    const ac = this.ac, t = ac.currentTime;
    this.muteUntil = t + sec;
    const gp = this.master.gain;
    gp.cancelScheduledValues(t);
    gp.setValueAtTime(gp.value, t);
    gp.linearRampToValueAtTime(0.001, t + 0.02);
    gp.linearRampToValueAtTime(0.9, t + sec + 0.05);
  }

  schedule() {
    if (!this.ready) return;
    const ac = this.ac;
    const spb = 60 / CFG.bpm / 4;
    let guard = 0;
    while (this.nextTime < ac.currentTime + 0.12 && guard++ < 32) {
      this.tick(this.step, this.nextTime);
      this.step = (this.step + 1) % 32;
      this.nextTime += spb;
    }
    if (guard >= 32) this.nextTime = ac.currentTime + 0.05;
  }

  layers() {
    const s = this.scene;
    return {
      title: s === 'title',
      beat: s === 'normal' || s === 'combo' || s === 'fever' || s === 'rush' || s === 'matsuri',
      melody: s !== 'draw' && s !== 'reach' && s !== 'mute',
      combo: s === 'combo' || s === 'fever' || s === 'rush' || s === 'matsuri',
      full: s === 'fever' || s === 'rush' || s === 'matsuri',
      matsuri: s === 'matsuri',
      heart: s === 'draw',
      taiko: s === 'reach',
    };
  }

  tick(step, t) {
    if (t < this.muteUntil) return;
    const L = this.layers();
    const s16 = step % 16;
    const bar = step < 16 ? 0 : 1;

    if (L.title) {
      if (s16 % 4 === 0) this.koto([392, 523.25, 659.25, 523.25][(s16 / 4) | 0], t, 0.5, 0.07);
      if (s16 === 0) this.taiko(t, 0.25, 0.45);
      return;
    }
    if (L.beat) {
      const four = L.full;
      if (s16 % (four ? 4 : 8) === 0) this.kick(t, four ? 0.5 : 0.34);
      if (four && s16 % 4 === 2) this.hat(t, 0.1);
      if (s16 % 8 === 4) this.hat(t, 0.09);
      if (s16 % 2 === 1) this.hat(t, 0.035);
      if (L.combo && (s16 === 4 || s16 === 12)) this.clap(t, 0.16);
      if (L.full && s16 % 8 === 6) this.taiko(t, 0.16, 0.5);
    }
    if (L.melody) {
      const motif = L.full
        ? [587.33, 698.46, 587.33, 523.25, 440, 523.25, 587.33, 698.46]
        : [587.33, 0, 523.25, 0, 440, 0, 392, 0];
      const i = s16 % 8;
      const f = motif[i];
      const gate = L.full ? (s16 % 2 === 0) : (i === 0 || i === 4 || (bar === 1 && i === 2));
      if (f && gate) this.koto(f, t, 0.28, L.full ? 0.1 : 0.055, this.musicG);
      if (L.full && s16 % 16 === 0) this.bass(146.83, t, 0.28, 0.12);
      if (L.full && s16 % 16 === 8) this.bass(110, t, 0.28, 0.12);
      if (L.matsuri && s16 % 4 === 2) this.bell(1046.5 * (s16 === 6 ? 1.5 : 1), t, 0.05);
    }
    if (L.heart) {
      if (s16 === 0 || s16 === 8) this.heartbeat(t);
      if (s16 % 2 === 0) this.rolling(t);
    }
    if (L.taiko) {
      const dense = step >= 16;
      if (s16 % (dense ? 1 : 2) === 0) this.taiko(t, dense ? 0.27 : 0.22, 0.7);
      if (s16 === 0 && bar === 1) this.bell(880, t, 0.03);
    }
  }

  env(node, t, a, d, peak) {
    const g = node.gain;
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  tone(freq, t, dur, type, peak, bus, detune) {
    if (!this.ready || this.voices > 16) return;
    const ac = this.ac;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = freq;
    if (detune) o.detune.value = detune;
    o.connect(g); g.connect(bus || this.sfxG);
    this.env(g, t, 0.005, dur, peak);
    this.voices++; o.onended = () => { this.voices--; };
    o.start(t); o.stop(t + dur + 0.06);
  }

  koto(freq, t, dur, peak, bus) {
    if (!this.ready) return;
    const ac = this.ac;
    const o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.value = freq;
    f.type = 'bandpass'; f.frequency.value = freq * 2.1; f.Q.value = 3.2;
    o.connect(f); f.connect(g); g.connect(bus || this.sfxG);
    this.env(g, t, 0.004, dur, peak);
    this.voices++; o.onended = () => { this.voices--; };
    o.start(t); o.stop(t + dur + 0.05);
  }

  bass(freq, t, dur, peak) {
    if (!this.ready) return;
    const ac = this.ac;
    const o = ac.createOscillator(), g = ac.createGain(), lp = ac.createBiquadFilter();
    o.type = 'triangle'; o.frequency.value = freq;
    lp.type = 'lowpass'; lp.frequency.value = 420;
    o.connect(lp); lp.connect(g); g.connect(this.musicG);
    this.env(g, t, 0.01, dur, peak);
    this.voices++; o.onended = () => { this.voices--; };
    o.start(t); o.stop(t + dur + 0.05);
  }

  noise(t, dur, peak, type, freq, q, bus) {
    if (!this.ready) return;
    const ac = this.ac;
    const src = ac.createBufferSource(); src.buffer = this.noiseBuf;
    const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; if (q) f.Q.value = q;
    const g = ac.createGain();
    src.connect(f); f.connect(g); g.connect(bus || this.sfxG);
    this.env(g, t, 0.004, dur, peak);
    this.voices++; src.onended = () => { this.voices--; };
    src.start(t); src.stop(t + dur + 0.06);
  }

  kick(t, peak = 0.5) {
    if (!this.ready) return;
    const ac = this.ac, o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(46, t + 0.11);
    o.connect(g); g.connect(this.musicG);
    this.env(g, t, 0.004, 0.16, peak);
    this.voices++; o.onended = () => { this.voices--; };
    o.start(t); o.stop(t + 0.22);
  }

  hat(t, peak) { this.noise(t, 0.03, peak, 'highpass', 7200, 0.7, this.musicG); }
  clap(t, peak) { this.noise(t, 0.11, peak, 'bandpass', 1750, 1.1, this.musicG); }

  /** 太鼓：低频体 + 槌面噪声 */
  taiko(t, dur = 0.3, peak = 0.6) {
    if (!this.ready) return;
    const ac = this.ac, o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(112, t); o.frequency.exponentialRampToValueAtTime(58, t + dur);
    o.connect(g);
    g.connect(this.scene === 'reach' ? this.musicG : this.sfxG);
    this.env(g, t, 0.005, dur, peak);
    this.voices++; o.onended = () => { this.voices--; };
    o.start(t); o.stop(t + dur + 0.05);
    this.noise(t, 0.05, peak * 0.28, 'bandpass', 420, 0.8);
  }

  bell(freq, t, peak = 0.1) {
    this.tone(freq, t, 0.5, 'sine', peak);
    this.tone(freq * 2.02, t, 0.32, 'sine', peak * 0.5);
  }

  heartbeat(t) { this.tone(64, t, 0.12, 'sine', 0.5, this.musicG); this.tone(58, t + 0.19, 0.1, 'sine', 0.34, this.musicG); }
  rolling(t) { this.noise(t + rand(0.02), 0.04, 0.05, 'bandpass', 2600 + rand(1400), 1.4, this.musicG); }

  pegSound(idx) {
    if (!this.ready) return;
    const now = this.ac.currentTime;
    if (now - this.lastPeg < 0.022) return;
    this.lastPeg = now;
    this.pegIdx = (idx == null ? this.pegIdx + 1 : idx) % PEG_SCALE.length;
    const f = PEG_SCALE[this.pegIdx];
    this.koto(f, now, 0.13, 0.08);
    this.tone(f * 4, now, 0.05, 'sine', 0.02);
  }

  bumperSound(kind) {
    if (!this.ready) return;
    const t = this.ac.currentTime;
    if (kind === 'drum') { this.taiko(t, 0.26, 0.5); this.tone(196, t, 0.12, 'triangle', 0.09); }
    else { this.noise(t, 0.16, 0.2, 'highpass', 900, 0.6); this.tone(660, t, 0.1, 'square', 0.045); }
  }

  pocketSound(kind) {
    if (!this.ready) return;
    const t = this.ac.currentTime;
    if (kind === 'start') {
      this.bell(1318.5, t, 0.15); this.bell(1760, t + 0.02, 0.07); this.taiko(t + 0.05, 0.2, 0.28);
    } else if (kind === 'torii') {
      this.bell(1046.5, t, 0.2); this.taiko(t, 0.3, 0.55); this.noise(t, 0.25, 0.15, 'highpass', 3200, 0.8);
    } else if (kind === 'say') {
      this.tone(1760, t, 0.16, 'triangle', 0.1); this.tone(2340, t + 0.03, 0.2, 'sine', 0.07);
    } else {
      this.tone(880, t, 0.1, 'triangle', 0.09); this.tone(1320, t + 0.04, 0.12, 'triangle', 0.06);
    }
  }

  lanternSound() { if (this.ready) this.bell(1567.98, this.ac.currentTime, 0.07); }
  reelTick() { if (this.ready) this.tone(1200 + rand(400), this.ac.currentTime, 0.03, 'square', 0.026); }
  reelLock(i) {
    if (!this.ready) return;
    const t = this.ac.currentTime;
    this.tone([392, 523.25, 659.25][i] || 659.25, t, 0.12, 'triangle', 0.1);
    this.noise(t, 0.04, 0.05, 'highpass', 5000, 0.7);
  }
  jackpotSound(sup) {
    if (!this.ready) return;
    const t = this.ac.currentTime + 0.2;
    this.taiko(t, 0.6, 0.8);
    this.bell(1046.5, t, 0.2); this.bell(1318.5, t + 0.08, 0.15); this.bell(1567.98, t + 0.16, 0.13);
    if (sup) { this.bell(2093, t + 0.24, 0.13); this.noise(t, 0.9, 0.13, 'highpass', 2600, 0.6); }
    for (let i = 0; i < 4; i++) this.kick(t + i * 0.13);
  }
  fireworkSound(big) {
    if (!this.ready) return;
    const t = this.ac.currentTime;
    this.noise(t, big ? 0.5 : 0.22, big ? 0.28 : 0.13, 'lowpass', big ? 900 : 1600, 0.6);
    this.tone(big ? 70 : 120, t, big ? 0.4 : 0.18, 'sine', big ? 0.28 : 0.11);
    if (big) this.noise(t + 0.06, 0.7, 0.09, 'highpass', 4200, 0.7);
  }
  launchSound(p) {
    if (!this.ready) return;
    const t = this.ac.currentTime;
    this.noise(t, 0.14, 0.05 + p * 0.08, 'bandpass', 900 + p * 1600, 1.4);
    this.tone(180 + p * 160, t, 0.1, 'triangle', 0.05);
  }
  gateSound() { if (this.ready) this.taiko(this.ac.currentTime, 0.16, 0.32); }
  ui() { if (this.ready) this.tone(1320, this.ac.currentTime, 0.05, 'square', 0.05); }
  ruleBreak() {
    if (!this.ready) return;
    const t = this.ac.currentTime;
    this.tone(1567.98, t, 0.09, 'square', 0.08);
    this.tone(1174.66, t + 0.07, 0.09, 'square', 0.08);
    this.taiko(t + 0.14, 0.2, 0.45);
  }
  failBuzz() {
    if (!this.ready) return;
    const t = this.ac.currentTime;
    this.tone(146, t, 0.2, 'sawtooth', 0.055);
    this.tone(138, t + 0.1, 0.22, 'sawtooth', 0.045);
  }
  settleSound(stars) {
    if (!this.ready) return;
    const t = this.ac.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5].slice(0, Math.max(2, stars + 1));
    notes.forEach((f, i) => { this.bell(f, t + i * 0.13, 0.1); this.koto(f, t + i * 0.13, 0.4, 0.07, this.musicG); });
  }
}

const audio = new AudioEngine();

/* ------------------------------------------------------------------ *
 * 3. 存档与设置
 * ------------------------------------------------------------------ */

const SAVE_KEY = 'koro-****-v1';
const DEF_SETTINGS = { music: 0.55, sfx: 0.8, flash: false, shake: true, particle: true, skip: false };

function defaultSave() {
  return {
    stars: 0, stars3: 0, coins: 0, best: 0, plays: 0, jackpots: 0,
    super777: false, clear: false, toriiBest: 0,
    unlocked: { glass: true }, skin: 'glass',
    settings: Object.assign({}, DEF_SETTINGS),
  };
}

let save = defaultSave();

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const o = JSON.parse(raw);
      save = Object.assign(defaultSave(), o);
      save.settings = Object.assign({}, DEF_SETTINGS, o.settings || {});
      save.unlocked = Object.assign({ glass: true }, o.unlocked || {});
    }
  } catch (e) { /* 存档损坏则用默认值，不阻塞启动 */ }
  if (!save.unlocked[save.skin]) save.skin = 'glass';
}

function writeSave() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* 隐私模式忽略 */ }
}

/** 固定条件解锁，返回本次新增 */
function checkUnlocks() {
  const got = [];
  const on = (id, cond) => { if (cond && !save.unlocked[id]) { save.unlocked[id] = true; got.push(id); } };
  on('kingyo', save.clear);
  on('hanabi', save.toriiBest >= CFG.missionTorii);
  on('akacho', save.stars >= 6);
  on('kanorii', save.stars3 >= 1);
  on('song', save.super777);
  return got;
}

/* ------------------------------------------------------------------ *
 * 4. 盘面几何（夏日祭一台）
 * ------------------------------------------------------------------ */

const FL = 26, FR = 398, FT = 150;   // 盘面左 / 右 / 上边界
const DRAIN_Y = 752;                  // 其下为底部信息条

function buildWorld() {
  const segs = [];
  const seg = (x1, y1, x2, y2, rest, kind) => {
    segs.push({ x1, y1, x2, y2, rest: rest == null ? 0.42 : rest, kind: kind || 'wall' });
  };

  // 框体
  seg(FL, FT, FR, FT, 0.34, 'wall');          // 顶墙
  seg(FL, FT, FL, 690, 0.4, 'wall');          // 左墙
  seg(FR, FT, FR, 690, 0.4, 'wall');          // 右墙（轨道在墙外侧）
  seg(FL, 700, 132, 748, 0.3, 'wall');        // 左下回收斜板
  seg(FR, 700, 300, 748, 0.3, 'wall');        // 右下回收斜板

  // 中央大 V：所有球最终汇向鸟居（技巧目标）
  seg(FL, 596, 186, 660, 0.36, 'floor');
  seg(264, 668, FR, 600, 0.36, 'floor');
  seg(186, 660, 182, 700, 0.3, 'wall');       // 鳥居左槽壁
  seg(264, 668, 268, 700, 0.3, 'wall');       // 鳥居右槽壁

  // 普通入口 P1（左，宽 44：稳定力度可复现命中）
  seg(FL, 506, 52, 520, 0.34, 'guide');
  seg(96, 520, 140, 506, 0.34, 'guide');
  seg(52, 520, 52, 566, 0.2, 'wall');
  seg(96, 520, 96, 566, 0.2, 'wall');
  // 普通入口 P2（右，宽 44）
  seg(284, 506, 328, 520, 0.34, 'guide');
  seg(372, 520, FR, 506, 0.34, 'guide');
  seg(328, 520, 328, 566, 0.2, 'wall');
  seg(372, 520, 372, 566, 0.2, 'wall');
  // 启动口 S1（中，宽 24：上方太鼓压顶，难度最高 → 控制大当たり节奏）
  seg(200, 436, 240, 452, 0.34, 'guide');
  seg(264, 452, 302, 434, 0.34, 'guide');
  seg(240, 452, 240, 494, 0.2, 'wall');
  seg(264, 452, 264, 494, 0.2, 'wall');

  const pegs = [];
  const peg = (x, y, r, kind, idx) => pegs.push({ x, y, r: r == null ? 5 : r, kind: kind || 'peg', idx: idx || 0, lit: 0 });

  // 提灯机关 5 盏（点亮有分，五盏全亮送一次花火）
  [74, 148, 222, 296, 356].forEach((x, i) => peg(x, 205, 7, 'lantern', i));

  const row = (y, xs) => xs.forEach((x, i) => peg(x, y, 5, 'peg', i));
  row(250, [44, 80, 116, 152, 188, 224, 260, 296, 332, 368]);
  row(292, [62, 98, 134, 170, 206, 242, 278, 314, 350, 386]);
  row(340, [44, 80, 160, 200, 240, 280, 360, 392]);
  row(392, [62, 98, 134, 178, 320, 356, 386]);
  row(470, [44, 80, 350, 386]);
  row(568, [110, 150, 190, 230, 270, 310]);

  const bumpers = [
    { x: 251, y: 404, r: 15, e: 1.24, kind: 'drum', hit: 0 },   // 压住启动口
    { x: 320, y: 300, r: 15, e: 1.24, kind: 'drum', hit: 0 },
  ];
  const boosters = [{ x: 120, y: 340, r: 13, e: 1.0, kind: 'spark', hit: 0 }];
  const windmill = { x: 330, y: 470, r: 22, arms: 3, ang: 0, speed: 1.7, hit: 0 };

  const pockets = [
    { x1: 52, x2: 96, y: 534, kind: 'pocket' },
    { x1: 328, x2: 372, y: 534, kind: 'pocket' },
    { x1: 240, x2: 264, y: 466, kind: 'start' },
    { x1: 186, x2: 264, y: 686, kind: 'torii' },
  ];

  const toriiBar = { x1: 186, y1: 656, x2: 248, y2: 664, rest: 0.5, kind: 'bar' };
  const say = { y: 724, w: 60, x: 212, dir: 1, speed: 96, glow: 0 };

  return { segs, segsWithBar: segs.concat([toriiBar]), pegs, bumpers, boosters, windmill, pockets, toriiBar, say };
}

const W = buildWorld();

/** 鸟居关闭时把電チュー横木并入碰撞集 */
function segsFor(g) { return g && g.toriiOpen ? W.segs : W.segsWithBar; }

/* ------------------------------------------------------------------ *
 * 5. 物理
 * ------------------------------------------------------------------ */

const PHYS = {
  seg(b, s) {
    const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
    const L2 = dx * dx + dy * dy || 1;
    let t = ((b.x - s.x1) * dx + (b.y - s.y1) * dy) / L2;
    t = clamp(t, 0, 1);
    const px = s.x1 + dx * t, py = s.y1 + dy * t;
    let nx = b.x - px, ny = b.y - py;
    const d = Math.hypot(nx, ny);
    if (d > CFG.ballR || d === 0) return 0;
    nx /= d; ny /= d;
    b.x = px + nx * CFG.ballR; b.y = py + ny * CFG.ballR;
    const vn = b.vx * nx + b.vy * ny;
    if (vn >= 0) return 0;
    const e = s.rest == null ? 0.42 : s.rest;
    b.vx -= (1 + e) * vn * nx; b.vy -= (1 + e) * vn * ny;
    const tx = -ny, ty = nx, vt = b.vx * tx + b.vy * ty;
    b.vx -= vt * 0.05 * tx; b.vy -= vt * 0.05 * ty;
    return -vn;
  },

  circle(b, c, e) {
    const dx = b.x - c.x, dy = b.y - c.y;
    const rr = CFG.ballR + c.r;
    const d2 = dx * dx + dy * dy;
    if (d2 > rr * rr || d2 === 0) return 0;
    const d = Math.sqrt(d2);
    const nx = dx / d, ny = dy / d;
    b.x = c.x + nx * rr; b.y = c.y + ny * rr;
    const vn = b.vx * nx + b.vy * ny;
    if (vn >= 0) return 0;
    b.vx -= (1 + e) * vn * nx; b.vy -= (1 + e) * vn * ny;
    return -vn;
  },

  /** 风车：旋臂按线速度击打球（规律固定，可预判） */
  windmill(b, g) {
    const wm = W.windmill;
    for (let a = 0; a < wm.arms; a++) {
      const ang = wm.ang + (TAU / wm.arms) * a;
      const cx = Math.cos(ang), sy = Math.sin(ang);
      const imp = PHYS.seg(b, { x1: wm.x, y1: wm.y, x2: wm.x + cx * wm.r, y2: wm.y + sy * wm.r, rest: 0.45 });
      if (imp > 0) {
        const k = clamp(Math.hypot(b.x - wm.x, b.y - wm.y) / wm.r, 0.2, 1);
        b.vx += -sy * wm.speed * 34 * k;
        b.vy += cx * wm.speed * 34 * k;
        wm.hit = 1;
        return imp;
      }
    }
    return 0;
  },

  step(b, g, dt) {
    if (b.state === 'rail') {
      b.y -= Math.max(210, 260 + b.power * 260) * dt;
      b.trailTick = (b.trailTick || 0) + dt;
      if (b.trailTick > 0.02) {
        b.trailTick = 0;
        b.trail.push(b.x, b.y);
        if (b.trail.length > 24) b.trail.splice(0, 2);
      }
      if (b.y <= CFG.railTop) {
        b.state = 'air';
        b.x = CFG.exitX; b.y = CFG.exitY;
        b.vx = launchVx(b.power);
        b.vy = 20;
      }
      return;
    }
    b.vy += CFG.gravity * dt;
    if (g.omifuda.has('magnet') && b.y > 400 && b.y < 470 && b.x > 200 && b.x < 300) {
      b.vx += (251 - b.x) * 1.1 * dt; b.vy += 30 * dt;
    }
    const spd = Math.hypot(b.vx, b.vy);
    if (spd > 900) { b.vx *= 900 / spd; b.vy *= 900 / spd; }
    b.x += b.vx * dt; b.y += b.vy * dt;

    let hit = 0;
    const segs = segsFor(g);
    for (let i = 0; i < segs.length; i++) hit = Math.max(hit, PHYS.seg(b, segs[i]));
    for (let i = 0; i < W.pegs.length; i++) {
      const p = W.pegs[i];
      const v = PHYS.circle(b, p, 0.5);
      if (v > 0) { hit = Math.max(hit, v); b.hitPeg = p; }
    }
    for (let i = 0; i < W.bumpers.length; i++) {
      const c = W.bumpers[i];
      if (PHYS.circle(b, c, c.e) > 0) {
        const m = Math.hypot(b.vx, b.vy) || 1;
        const k = Math.max(m, 430) / m;
        b.vx *= k; b.vy *= k; c.hit = 1; hit = Math.max(hit, m);
        b.hitPeg = null; b.hitKind = 'drum';
      }
    }
    for (let i = 0; i < W.boosters.length; i++) {
      const c = W.boosters[i];
      if (PHYS.circle(b, c, c.e) > 0) {
        const m = Math.hypot(b.vx, b.vy) || 1;
        const k = Math.max(m, 520) / m;
        b.vx *= k; b.vy *= k; c.hit = 1; hit = Math.max(hit, m);
        b.hitPeg = null; b.hitKind = 'spark';
      }
    }
    if (PHYS.windmill(b, g) > 0) { hit = Math.max(hit, 120); b.hitPeg = null; b.hitKind = 'wind'; }

    if (g.useSay !== false) {
      const s = W.say;
      const vSay = PHYS.seg(b, { x1: s.x - s.w / 2, y1: s.y, x2: s.x + s.w / 2, y2: s.y, rest: 0.22 });
      if (vSay > 0 && b.vy > 0 && Math.abs(b.x - s.x) < s.w / 2 - 4) b.sayCatch = true;
    }

    b.hitImpulse = Math.max(b.hitImpulse || 0, hit);
    b.trailTick = (b.trailTick || 0) + dt;
    if (b.trailTick > 0.018) {
      b.trailTick = 0;
      b.trail.push(b.x, b.y);
      if (b.trail.length > 26) b.trail.splice(0, 2);
    }

    const sp = Math.hypot(b.vx, b.vy);
    if (sp < 22) {
      b.slow = (b.slow || 0) + dt;
      if (b.slow > 1.0 && b.slow < 1.06) { b.vx += (b.x < 212 ? -1 : 1) * 60; b.vy -= 70; }
    } else b.slow = 0;

    // 累计位移看"是否真的卡住"：反复微弹会重置 slow，只有位移能说明问题
    b.moved = (b.moved || 0) + sp * dt;
    b.slowT = (b.slowT || 0) + dt;
    if (b.moved > 70) { b.moved = 0; b.slowT = 0; }
  },
};

/** 力度 → 出轨水平速度（单调，玩家可用它把力度练成"区间"） */
function launchVx(power) {
  return -(190 + 800 * (power - CFG.powerMin) / (CFG.powerMax - CFG.powerMin));
}

function makeBall(power) {
  return {
    x: CFG.railX, y: CFG.railBottom, vx: 0, vy: 0, power,
    state: 'rail', trail: [], born: 0, slow: 0, moved: 0, slowT: 0, dead: false, dieWhy: '',
    sayCatch: false, hitImpulse: 0, hitPeg: null, hitKind: 'peg',
  };
}

/* ------------------------------------------------------------------ *
 * 6. 力度区间预演：力度 → 首个入口 / 落底（画力度刻度用）
 * ------------------------------------------------------------------ */

const simProbe = { toriiOpen: false, omifuda: new Set(), useSay: false };

function probePocket(b) {
  for (const p of W.pockets) {
    if (p.kind === 'torii') continue;
    if (b.x > p.x1 + 3 && b.x < p.x2 - 3 && b.y > p.y && b.y < p.y + 16 && b.vy > 0) {
      return p.kind + ':' + Math.round((p.x1 + p.x2) / 2);
    }
  }
  return null;
}

/**
 * 纯物理预演一次发射（无随机、无副作用）。
 * @param {number} power 0..1
 * @return {{outcome:string, power:number, path:number[]}}
 */
function simulateShot(power, maxT = 12) {
  const dt = 1 / 240;
  const b = makeBall(power);
  b.state = 'air'; b.x = CFG.exitX; b.y = CFG.exitY; b.vx = launchVx(power); b.vy = 20;
  const path = [];
  let t = 0, k = 0, outcome = 'drain';
  while (t < maxT) {
    PHYS.step(b, simProbe, dt);
    t += dt;
    if (++k % 8 === 0) path.push(Math.round(b.x), Math.round(b.y));
    const pk = probePocket(b);
    if (pk) { outcome = pk; break; }
    if (b.y > DRAIN_Y + 30 || b.slowT > 3.5) { outcome = 'drain'; break; }
  }
  return { outcome, power, path };
}

/** @type {{outcome:string,power:number}[]} */
let powerCurve = [];
function computePowerCurve() {
  powerCurve = [];
  for (let p = CFG.powerMin; p <= CFG.powerMax + 1e-6; p += 0.02) powerCurve.push(simulateShot(p));
}

/** 当前力度落在哪个可辨认区间：'start' | 'pocket' | 'drain' */
function bandAtPower(power) {
  let best = null, bd = 9;
  for (const c of powerCurve) {
    const d = Math.abs(c.power - power);
    if (d < bd) { bd = d; best = c; }
  }
  if (!best) return 'drain';
  if (best.outcome.startsWith('start')) return 'start';
  if (best.outcome.startsWith('pocket')) return 'pocket';
  return 'drain';
}

/* ------------------------------------------------------------------ *
 * 7. 游戏状态
 * ------------------------------------------------------------------ */

/** @type {any} */
let g = null;
let HEADLESS = false;

/** 演出用的延迟回调；自测同步跑时不排真实定时器 */
function later(fn, ms) { if (!HEADLESS) setTimeout(fn, ms); }

function newGame() {
  return {
    phase: 'play', t: 0, fxT: 0,
    balls: [], launchCd: 0,
    charging: false, power: CFG.powerMin, powerDir: 1,
    inventory: CFG.startBalls, score: 0, multIdx: 0, comboCount: 0, comboT: 0,
    sayCount: 0,
    reserve: [], reserveMax: CFG.reserveMax, pity: 0,
    draw: null,
    jackpots: 0, chain: 0,
    fever: false, feverT: 0, feverSuper: false, feverHits: 0, feverPay: 0, feverSummary: null,
    chucker: 0, toriiOpen: false,
    rush: false, rushT: 0, rushRate: CFG.rushRate, matsuri: false,
    omifuda: new Set(), omiOffer: null, omiT: 0,
    missions: { score: false, jackpot: false, torii: false },
    stats: { launches: 0, pegs: 0, pockets: 0, starts: 0, toriiMax: 0, super: false, ballsMax: 0 },
    fx: [], texts: [], banner: null, shake: 0, flash: 0, slowmo: 0,
    settle: null, unlockToast: [], canSettle: false,
  };
}

const maxBalls = () => (g.fever ? CFG.maxBallsFever : CFG.maxBallsNormal);
const mult = () => CFG.comboSteps[g.multIdx] * (g.fever && g.feverSuper ? 2 : 1);

/* ---- 特效 ---- */
function burst(x, y, n, color, kind = 'spark', spd = 200) {
  if (!save.settings.particle) n = Math.min(n, 3);
  for (let i = 0; i < n; i++) {
    const a = rand(TAU), s = rand(spd, spd * 0.25);
    g.fx.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - (kind === 'firework' ? 40 : 0),
      life: rand(0.7, 0.25), max: 0.7, color, kind, r: rand(kind === 'dama' ? 3.4 : 2.2, 1),
    });
  }
}
function firework(x, y, big, color) {
  burst(x, y, big ? 46 : 22, color || '#ffd24a', 'firework', big ? 300 : 190);
  g.flash = Math.max(g.flash, big ? 0.5 : 0.25);
  audio.fireworkSound(!!big);
}
function floater(x, y, text, color, size) {
  g.texts.push({ x, y, text, color: color || '#ffe9a8', size: size || 13, life: 1.05, vy: -34 });
}
function banner(text, sub, color, dur) {
  g.banner = { text, sub: sub || '', color: color || '#ffd24a', t: 0, dur: dur || 1.6 };
}
function shakeIt(v) { if (save.settings.shake) g.shake = Math.min(14, g.shake + v); }

/* ------------------------------------------------------------------ *
 * 8. 发射 · 入口 · 连击
 * ------------------------------------------------------------------ */

function tryLaunch() {
  if (g.phase === 'title' || g.phase === 'settle' || g.phase === 'omifuda') return;
  if (g.launchCd > 0 || g.balls.length >= maxBalls()) return;
  if (g.inventory <= 0) { audio.failBuzz(); return; }
  const p = g.power;
  g.inventory--;
  const jit = 1 + (R() * 2 - 1) * CFG.launchJitter;
  const b = makeBall(clamp(p * jit, CFG.powerMin, CFG.powerMax));
  b.born = g.t;
  g.balls.push(b);
  g.stats.launches++;
  audio.launchSound(p);
  g.launchCd = g.omifuda.has('haya') ? CFG.launchCd * 0.7 : CFG.launchCd;
  if (g.omifuda.has('split') && R() < 0.25) {
    const b2 = makeBall(clamp(p * jit * 0.97, CFG.powerMin, CFG.powerMax));
    b2.y += 16;
    g.balls.push(b2);
    floater(CFG.exitX, CFG.exitY + 40, '分きの球', '#8ef0b8', 11);
  }
  g.power = CFG.powerMin; g.powerDir = 1; g.charging = false;
}

function updateCombo(onHit) {
  if (!onHit) { g.comboCount = 0; g.multIdx = 0; g.comboT = 0; return; }
  g.comboCount++; g.comboT = CFG.comboWindow;
  let idx = 0;
  for (let i = 0; i < CFG.comboAt.length; i++) if (g.comboCount >= CFG.comboAt[i]) idx = i;
  if (idx > g.multIdx) {
    floater(224, 470, `COMBO ${g.comboCount}  ${CFG.comboSteps[idx]}倍`, '#ffd24a', 15);
    audio.lanternSound();
  }
  g.multIdx = idx;
}

function addScore(base, x, y, showText) {
  const v = Math.round(base * mult());
  g.score += v;
  if (showText) floater(x, y, '+' + fmt(v), '#fff3c4', 12);
  if (!g.missions.score && g.score >= CFG.missionScore) {
    g.missions.score = true;
    floater(224, 300, '任务①达成', '#8ef0b8', 14);
  }
  return v;
}

function handlePocket(b, p) {
  const cx = (p.x1 + p.x2) / 2;
  if (p.kind === 'pocket') {
    g.stats.pockets++;
    addScore(CFG.scorePocket, cx, p.y - 12, true);
    if (!g.fever) g.inventory += CFG.ballPocket;
    updateCombo(true);
    floater(cx, p.y - 32, `+${CFG.ballPocket}球`, '#8ef0b8', 12);
    burst(cx, p.y, 10, '#7fe3ff', 'spark', 150);
    audio.pocketSound('pocket');
  } else if (p.kind === 'start') {
    g.stats.starts++;
    addScore(CFG.scoreStart, cx, p.y - 12, true);
    if (!g.fever) g.inventory += CFG.ballStart;
    updateCombo(true);
    audio.pocketSound('start');
    burst(cx, p.y, 14, '#ffd24a', 'spark', 170);
    if (g.reserve.length < g.reserveMax) pushReserve(cx, p.y - 16);
    else {
      if (!g.fever) g.inventory++;
      floater(cx, p.y - 34, '保留已满 +1球', '#9aa3c7', 11);
    }
    g.slowmo = 0.15;
  } else if (p.kind === 'torii') {
    if (!g.toriiOpen) return;
    g.feverHits++; g.feverPay += CFG.ballTorii;
    addScore(CFG.scoreTorii, cx, p.y - 20, false);
    floater(cx, p.y - 34, '出玉 +4', '#ffd24a', 14);
    burst(cx, p.y, 22, '#ffd24a', 'dama', 220);
    audio.pocketSound('torii');
    shakeIt(3);
    g.stats.toriiMax = Math.max(g.stats.toriiMax, g.feverHits);
    if (!g.missions.torii && g.feverHits >= CFG.missionTorii) {
      g.missions.torii = true;
      banner('任务③达成', `单次祭道 ${CFG.missionTorii} 鳥居`, '#8ef0b8', 1.4);
    }
  } else return;
  b.dieWhy = 'pocket:' + p.kind;
  b.dead = true;
}

function updateBalls(dt) {
  const sub = 4, h = dt / sub;
  for (let s = 0; s < sub; s++) {
    for (const b of g.balls) {
      if (b.dead) continue;
      b.hitImpulse = 0; b.hitPeg = null; b.hitKind = 'peg';
      PHYS.step(b, g, h);
      if (b.hitImpulse > 60) onBallHit(b);
    }
  }
  for (const b of g.balls) {
    if (b.dead) continue;
    for (const p of W.pockets) {
      if (b.x > p.x1 + 2 && b.x < p.x2 - 2 && b.y > p.y && b.y < p.y + 18 && b.vy > -20) { handlePocket(b, p); break; }
    }
    if (b.dead) continue;
    if (b.sayCatch) {
      b.dieWhy = 'say'; b.dead = true;
      const s = W.say;
      s.glow = 1;
      g.sayCount++;
      addScore(CFG.scoreSay, s.x, s.y - 22, true);
      if (!g.fever) g.inventory += CFG.ballSay;
      updateCombo(true);
      audio.pocketSound('say');
      floater(s.x, s.y - 36, `+${CFG.ballSay}球`, '#8ef0b8', 12);
      if (g.sayCount % 3 === 0) {
        firework(rand(320, 120), rand(300, 200), true, '#ff8ae0');
        addScore(CFG.scoreFirework, 224, 260, false);
        banner('花火升空', `賽銭 ${g.sayCount} 回 · +${fmt(CFG.scoreFirework)}`, '#ff8ae0', 1.2);
      }
      continue;
    }
    if (b.y > DRAIN_Y + 12 || b.slowT > 3.5 || b.x < -30 || b.x > LW + 30) {
      b.dieWhy = b.slowT > 3.5 ? 'stall' : 'drain';
      b.dead = true;
      if (!g.fever) updateCombo(false);
      burst(b.x, DRAIN_Y, 5, '#5a6390', 'spark', 90);
    }
  }
  g.balls = g.balls.filter((b) => !b.dead);
  g.stats.ballsMax = Math.max(g.stats.ballsMax, g.balls.length);
}

function onBallHit(b) {
  const p = b.hitPeg;
  if (p && p.kind === 'lantern') {
    if (p.lit <= 0) {
      p.lit = 6;
      addScore(CFG.scoreLantern, p.x, p.y - 14, false);
      audio.lanternSound();
      burst(p.x, p.y, 8, '#ffca55', 'spark', 120);
      const all = W.pegs.filter((q) => q.kind === 'lantern');
      if (all.every((q) => q.lit > 0)) {
        all.forEach((q) => { q.lit = 0; });
        addScore(CFG.scoreFirework, 224, 240, false);
        banner('五提灯全灯', `+${fmt(CFG.scoreFirework)}`, '#ffca55', 1.3);
        for (let i = 0; i < 3; i++) firework(rand(340, 110), rand(300, 180), i === 2, '#ffca55');
      }
    }
    audio.pegSound(p.idx);
  } else if (b.hitKind === 'drum' || b.hitKind === 'spark') {
    addScore(CFG.scorePeg * 2, b.x, b.y - 12, false);
    audio.bumperSound(b.hitKind);
    burst(b.x, b.y, 6, b.hitKind === 'drum' ? '#ff9a6a' : '#ffe9a8', 'spark', 150);
    shakeIt(1.5);
  } else if (b.hitKind === 'wind') {
    addScore(CFG.scorePeg, b.x, b.y - 12, false);
    if (b.hitImpulse > 100) audio.pegSound(null);
  } else {
    g.stats.pegs++;
    addScore(g.omifuda.has('saisen') ? CFG.scorePeg * 3 : CFG.scorePeg, b.x, b.y - 12, false);
    audio.pegSound(null);
    if (b.hitImpulse > 220) burst(b.x, b.y, 2, '#9fd8ff', 'spark', 70);
  }
}

/* ------------------------------------------------------------------ *
 * 9. 彩玉保留 · 抽签 · リーチ
 * ------------------------------------------------------------------ */

function rollSaitama() {
  if (g.pity >= 5) {
    const hi = SAITAMA.slice(3);
    const tot = hi.reduce((a, s) => a + s.weight, 0);
    let r = R() * tot, acc = 0;
    for (let i = 0; i < hi.length; i++) { acc += hi[i].weight; if (r <= acc) return { s: hi[i], forced: true }; }
    return { s: hi[0], forced: true };
  }
  const boost = g.omifuda.has('niji') ? 1.2 : 1;
  const weights = SAITAMA.map((s, i) => {
    let w = s.weight;
    if (i >= 4) w *= boost;
    if (g.rush) w *= i === 0 ? 0.45 : (i <= 4 ? 1.6 : 1.3);   // Rush：期待度整体上移一档
    return w;
  });
  const tot = weights.reduce((a, v) => a + v, 0);
  let r = R() * tot, acc = 0, idx = 0;
  for (let i = 0; i < weights.length; i++) { acc += weights[i]; if (r <= acc) { idx = i; break; } }
  return { s: SAITAMA[idx], forced: false };
}

function fillTriple(sup) {
  if (sup) return ['7', '7', '7'];
  const v = pick(['1', '2', '3', '4', '5', '6', 'mask']);
  return [v, v, v];
}

function fillLose() {
  const pool = ['1', '2', '3', '4', '5', '6', 'mask'];
  const a = pick(pool);
  if (R() < 0.5) {                                    // リーチ煽り：前二致、第三で外す
    let c = pick(pool);
    if (c === a) c = pool[(pool.indexOf(a) + 3) % pool.length];
    return [a, a, c];
  }
  let b = pick(pool); while (b === a) b = pick(pool);
  let c = pick(pool); while (c === b) c = pick(pool);
  return [a, b, c];
}

function pushReserve(x, y) {
  const { s, forced } = rollSaitama();
  const win = forced || R() < s.expect;
  const sup = win && R() < 0.08;
  const symbols = win ? fillTriple(sup) : fillLose();
  const reachWant = win ? true : symbols[0] === symbols[1];
  g.reserve.push({ s, win, sup, symbols, reachWant, t: 0, glow: 1 });
  audio.bell(700 + SAITAMA.indexOf(s) * 110, audio.ac ? audio.ac.currentTime : 0, 0.05);
  floater(x, y - 10, '彩玉 ' + s.name, s.color, 12);
}

function chooseReach(trust) {
  if (trust >= 0.8) return R() < 0.6 ? REACH_TYPES[3] : REACH_TYPES[2];
  if (trust >= 0.5) return R() < 0.55 ? REACH_TYPES[2] : REACH_TYPES[1];
  if (trust >= 0.3) return R() < 0.5 ? REACH_TYPES[1] : REACH_TYPES[0];
  return R() < 0.25 ? REACH_TYPES[1] : REACH_TYPES[0];
}

/** 打开一颗彩玉 → 抽签（manual=true 时提前开封） */
function openReserve(manual) {
  if (g.draw || !g.reserve.length) return false;
  if (manual && g.reserve[0].t < 0.25) return false;
  const item = g.reserve.shift();
  const isReach = item.reachWant && item.symbols[0] === item.symbols[1];
  g.draw = {
    item, syms: item.symbols, t: 0, ticks: 0,
    lockAt: [CFG.spinStop1, CFG.spinStop2, isReach ? CFG.spinStop2 + CFG.reachTime : CFG.spinStop3],
    stop: [false, false, false],
    reach: isReach ? chooseReach(item.s.expect) : null,
    reachT: 0, ruleBreak: item.win && R() < 0.3, broken: false, resolved: false,
  };
  burst(46 + SAITAMA.indexOf(item.s) * 8, 132, 5, item.s.color, 'spark', 80);
  return true;
}

function updateDraw(dt) {
  if (!g.draw && g.reserve.length) {
    g.reserve[0].t += dt;
    if (g.reserve[0].t >= CFG.reserveRoll) openReserve(false);
  }
  for (const r of g.reserve) r.glow = Math.max(0, r.glow - dt);

  const d = g.draw;
  if (!d) return;
  d.t += dt;
  d.ticks += dt;
  if (d.ticks > 0.075 && (!d.stop[0] || !d.stop[1] || !d.stop[2])) { d.ticks = 0; audio.reelTick(); }

  for (let i = 0; i < 3; i++) {
    if (!d.stop[i] && d.t >= d.lockAt[i]) { d.stop[i] = true; audio.reelLock(i); shakeIt(i === 2 ? 5 : 2); }
  }
  if (d.reach && !d.stop[2]) {
    d.reachT += dt;
    if (d.ruleBreak && !d.broken && d.item.win && d.reachT / CFG.reachTime > 0.62) {
      d.broken = true;
      audio.ruleBreak();
      banner('法則、崩る', d.reach.breakText, '#ff6b7a', 1.4);
      g.flash = 0.6; shakeIt(9);
      d.lockAt[2] = d.t; d.stop[2] = true; d.reachT = CFG.reachTime;
      for (let i = 0; i < 4; i++) later(() => firework(rand(340, 110), rand(320, 170), true, ['#ffd24a', '#ff6b7a', '#8ef0b8'][i % 3]), i * 90);
    }
  }
  if (!d.resolved && d.stop[0] && d.stop[1] && d.stop[2] && d.t >= d.lockAt[2] + 0.25) {
    d.resolved = true;
    resolveDraw(d);
  }
}

function resolveDraw(d) {
  g.draw = null;
  if (!d.item.win) {
    g.pity++;
    audio.failBuzz();
    if (g.pity >= 6) floater(224, 150, '次は赤以上', '#ff9aa8', 12);
    return;
  }
  g.pity = 0;
  g.jackpots++;
  save.jackpots++;
  g.missions.jackpot = true;
  if (d.item.sup) { g.stats.super = true; save.super777 = true; }
  startJackpot(d.item.sup);
}

/* ------------------------------------------------------------------ *
 * 10. 大当たり · 祭道（右打ち）· 提灯 Rush
 * ------------------------------------------------------------------ */

function startJackpot(sup) {
  if (g.fever || g.phase === 'jackpotFx') {           // 連チャン：延长当前祭道，不重启动画
    g.feverT += CFG.feverExtend;
    banner('連チャン', `祭道 +${CFG.feverExtend}秒`, '#ff8ae0', 1.3);
    addScore(CFG.scoreJackpot, 224, 300, false);
    audio.jackpotSound(true);
    return;
  }
  g.phase = 'jackpotFx';
  g.fxT = 0;
  g.feverSuper = !!sup;
  g.toriiOpen = false;
  addScore(sup ? CFG.scoreSuper : CFG.scoreJackpot, 224, 300, false);
  audio.duckThenBurst(0.2);
  later(() => audio.jackpotSound(!!sup), 210);
  banner(sup ? '超・祭典 777' : '大当たり', sup ? 'SUPER JACKPOT · 分数×2 · 20秒' : 'JACKPOT · 祭道 OPEN',
    sup ? '#ff8ae0' : '#ffd24a', CFG.jackpotFxTime);
  g.flash = 0.9; shakeIt(12);
  for (let i = 0; i < 6; i++) {
    const big = i % 3 === 0;
    later(() => firework(rand(340, 110), rand(330, 170), big, ['#ffd24a', '#ff6b7a', '#ffffff'][i % 3]), i * 180);
  }
}

function startFever() {
  g.phase = 'fever';
  g.fever = true;
  g.feverT = g.feverSuper ? CFG.superFeverTime : CFG.feverTime;
  g.feverHits = 0; g.feverPay = 0;
  g.chucker = 0; g.toriiOpen = true;
  g.chain = g.rush ? g.chain + 1 : 1;
  if (g.rush && g.chain >= CFG.matsuriChain && !g.matsuri) {
    g.matsuri = true;
    g.rushRate = CFG.matsuriRate;
    g.rushT = Math.max(g.rushT, CFG.matsuriTime);
    banner('神輿渡御', 'LT · 継続率 81% · 45秒', '#ffd24a', 2.2);
    for (let i = 0; i < 5; i++) later(() => firework(rand(340, 110), rand(330, 180), true, '#ffd24a'), i * 160);
  }
  banner(g.matsuri ? '神輿渡御 継続' : '祭道 OPEN', `電チュー鳥居 ${chuckerOpenT().toFixed(1)}s / ${CFG.chuckerShut}s`,
    g.matsuri ? '#ffd24a' : '#ff9f6b', 1.6);
}

const chuckerOpenT = () => CFG.chuckerOpen + (g.omifuda.has('toriiw') ? 0.25 : 0);
const rushLen = () => (g.matsuri ? CFG.matsuriTime : CFG.rushTime);
const rushRateNow = () => Math.min(CFG.rushRateCap, g.rushRate + (g.omifuda.has('ren') ? 0.08 : 0));

function updateFever(dt) {
  const openT = chuckerOpenT();
  g.chucker += dt;
  const ph = g.chucker % (openT + CFG.chuckerShut);
  const was = g.toriiOpen;
  g.toriiOpen = ph < openT;
  if (g.toriiOpen !== was) { audio.gateSound(); if (g.toriiOpen) burst(225, 664, 6, '#ffd24a', 'spark', 110); }
  g.feverT -= dt;
  if (g.feverT <= 0) endFever();
}

function endFever() {
  const hits = g.feverHits, pay = g.feverPay;
  g.fever = false; g.toriiOpen = false; g.phase = 'play';
  g.inventory += pay;
  g.feverSummary = { hits, balls: pay, t: 0, sup: g.feverSuper };
  banner('祭道 終了', `鳥居 ${hits} 回 · 出玉 ${pay} 球`, '#8ef0b8', 1.6);
  for (let i = 0; i < Math.min(10, hits); i++) later(() => burst(rand(300, 140), rand(700, 640), 4, '#ffd24a', 'dama', 120), i * 60);

  if (hits >= CFG.rushToriiNeed) {
    const rate = rushRateNow();
    if (R() < rate) {
      g.rush = true;
      g.rushT = rushLen();
      banner(g.matsuri ? '神輿渡御 継続!' : '提灯Rush 突入!', `継続率 ${Math.round(rate * 100)}% · ${Math.round(g.rushT)}秒`, '#ffd24a', 2.0);
    } else {
      endRush('提灯、消える', 'Rush 継続失败');
    }
  } else {
    if (g.rush) endRush('Rush 終了', '鳥居が足りず継続なし');
    else banner('鳥居 ' + hits + ' 回', `点灯には ${CFG.rushToriiNeed} 回必要`, '#9aa3c7', 1.4);
  }
  offerOmifuda();
  writeSave();
}

function endRush(title, sub) {
  g.rush = false; g.matsuri = false; g.chain = 0; g.rushRate = CFG.rushRate;
  banner(title, sub, '#9aa3c7', 1.4);
}

/* ---- 御神籤三选一 ---- */
function offerOmifuda() {
  if (g.omifuda.size >= 3) return;
  const pool = OMIFUDA.filter((o) => !g.omifuda.has(o.id));
  const offer = [];
  const weight = { 0: 6, 1: 3, 2: 1 };
  while (offer.length < 3 && pool.length) {
    const tot = pool.reduce((a, o) => a + weight[o.rar], 0);
    let r = R() * tot, acc = 0, idx = 0;
    for (let i = 0; i < pool.length; i++) { acc += weight[pool[i].rar]; if (r <= acc) { idx = i; break; } }
    offer.push(pool.splice(idx, 1)[0]);
  }
  if (!offer.length) return;
  g.omiOffer = offer;
  g.omiT = 0;
  g.phase = 'omifuda';
}

function takeOmifuda(i) {
  const o = g.omiOffer && g.omiOffer[i];
  if (!o) return;
  g.omifuda.add(o.id);
  if (o.id === 'hozone') g.reserveMax = CFG.reserveMax + 1;
  g.omiOffer = null;
  g.phase = 'play';
  audio.ui();
  banner('御神籤', `${o.name} · ${o.text}`, '#8ef0b8', 1.6);
}

/* ------------------------------------------------------------------ *
 * 11. Rush 计时 · 结算
 * ------------------------------------------------------------------ */

function updateRush(dt) {
  if (!g.rush || g.fever) return;
  g.rushT -= dt;
  if (g.rushT <= 0) endRush('Rush 終了', '提灯が燃え尽きた');
}

function settleNow(reason) {
  if (g.phase === 'settle') return;
  g.phase = 'settle';
  g.charging = false;
  const stars = (g.missions.score ? 1 : 0) + (g.missions.jackpot ? 1 : 0) + (g.missions.torii ? 1 : 0);
  const coins = stars * 3 + Math.floor(g.score / 8000) + (g.missions.torii ? 2 : 0);
  save.stars += stars;
  if (stars === 3) save.stars3++;
  save.best = Math.max(save.best, Math.round(g.score));
  save.coins += coins;
  save.plays++;
  if (stars >= 1) save.clear = true;
  save.toriiBest = Math.max(save.toriiBest, g.stats.toriiMax);
  g.unlockToast = checkUnlocks();
  g.settle = { stars, coins, reason, t: 0 };
  writeSave();
  audio.settleSound(stars);
  for (let i = 0; i < stars * 3 + 2; i++) later(() => firework(rand(340, 110), rand(320, 170), i % 4 === 0, '#ffd24a'), i * 130);
}

/* ------------------------------------------------------------------ *
 * 12. 主更新
 * ------------------------------------------------------------------ */

function updateMechanisms(dt) {
  W.windmill.ang = (W.windmill.ang + W.windmill.speed * dt) % TAU;
  const s = W.say;
  s.x += s.dir * s.speed * dt * (1 + Math.min(0.5, g.comboCount * 0.06));
  if (s.x > 316) { s.x = 316; s.dir = -1; }
  if (s.x < 134) { s.x = 134; s.dir = 1; }
  s.glow = Math.max(0, s.glow - dt * 2);
  for (const p of W.pegs) if (p.lit > 0) p.lit = Math.max(0, p.lit - dt);
  for (const c of W.bumpers) c.hit = Math.max(0, c.hit - dt * 3);
  for (const c of W.boosters) c.hit = Math.max(0, c.hit - dt * 3);
  W.windmill.hit = Math.max(0, W.windmill.hit - dt * 3);
}

function updateFx(dt) {
  for (const f of g.fx) {
    f.life -= dt;
    f.x += f.vx * dt; f.y += f.vy * dt;
    f.vy += (f.kind === 'dama' ? 900 : f.kind === 'firework' ? 230 : 380) * dt;
    f.vx *= 0.99;
  }
  if (g.fx.length > 420) g.fx.splice(0, g.fx.length - 420);
  g.fx = g.fx.filter((f) => f.life > 0 && f.y < LH + 20);
  for (const t of g.texts) { t.life -= dt; t.y += t.vy * dt; t.vy *= 0.94; }
  g.texts = g.texts.filter((t) => t.life > 0);
  if (g.banner) { g.banner.t += dt; if (g.banner.t >= g.banner.dur) g.banner = null; }
  g.shake = Math.max(0, g.shake - dt * 26);
  g.flash = Math.max(0, g.flash - dt * 2.2);
  g.slowmo = Math.max(0, g.slowmo - dt);
}

function update(dt) {
  g.t += dt;
  updateMechanisms(dt);
  updateFx(dt);
  if (g.launchCd > 0) g.launchCd -= dt;
  if (g.comboT > 0) { g.comboT -= dt; if (g.comboT <= 0) updateCombo(false); }

  if (g.charging && g.phase !== 'omifuda' && g.phase !== 'settle') {
    g.power += g.powerDir * dt * CFG.powerRate;
    if (g.power >= CFG.powerMax) { g.power = CFG.powerMax; g.powerDir = -1; }
    if (g.power <= CFG.powerMin) { g.power = CFG.powerMin; g.powerDir = 1; }
  }

  if (g.phase === 'omifuda') { g.omiT += dt; return; }
  if (g.phase === 'settle') { if (g.settle) g.settle.t += dt; return; }

  const pdt = dt * (g.slowmo > 0 ? 0.4 : 1);
  updateBalls(pdt);
  updateDraw(pdt);

  if (g.phase === 'jackpotFx') {
    g.fxT += dt;
    if (g.fxT >= CFG.jackpotFxTime) startFever();
  } else if (g.phase === 'fever') {
    updateFever(dt);
  } else {
    updateRush(dt);
    g.canSettle = g.missions.score && g.missions.jackpot && g.missions.torii;
    if (!g.fever && g.inventory <= 0 && g.balls.length === 0 && !g.draw && !g.reserve.length) settleNow('玉切れ');
    if (!g.fever && g.t >= CFG.roundTime) settleNow('夜明け');
  }
  if (g.feverSummary) { g.feverSummary.t += dt; if (g.feverSummary.t > 2.6) g.feverSummary = null; }
}

/* ------------------------------------------------------------------ *
 * 13. 绘制工具与调色
 * ------------------------------------------------------------------ */

const PAL = {
  title: { bg1: '#0d1236', bg2: '#04060f', acc: '#ffca55', wash: 'rgba(255,180,80,.06)' },
  normal: { bg1: '#0b1440', bg2: '#04081c', acc: '#ffca55', wash: 'rgba(80,120,255,.05)' },
  combo: { bg1: '#131a52', bg2: '#070a24', acc: '#ffe08a', wash: 'rgba(255,190,90,.10)' },
  draw: { bg1: '#080c26', bg2: '#02040c', acc: '#9fb2e8', wash: 'rgba(10,14,40,.35)' },
  reach: { bg1: '#05070f', bg2: '#000206', acc: '#ffd24a', wash: 'rgba(0,0,0,.55)' },
  fever: { bg1: '#33102a', bg2: '#0d0316', acc: '#ff6b7a', wash: 'rgba(255,60,90,.16)' },
  rush: { bg1: '#1b1444', bg2: '#080619', acc: '#ffd24a', wash: 'rgba(255,190,60,.14)' },
  matsuri: { bg1: '#43220a', bg2: '#150801', acc: '#ffe9a8', wash: 'rgba(255,210,90,.20)' },
  settle: { bg1: '#0d1030', bg2: '#03050e', acc: '#ffca55', wash: 'rgba(255,180,80,.06)' },
};

function currentScene() {
  if (g.phase === 'title') return 'title';
  if (g.phase === 'settle') return 'settle';
  if (g.fever || g.phase === 'jackpotFx') return g.matsuri ? 'matsuri' : 'fever';
  if (g.rush) return 'rush';
  if (g.draw && g.draw.reach && !g.draw.stop[2]) return 'reach';
  if (g.draw) return 'draw';
  if (g.multIdx > 0) return 'combo';
  return 'normal';
}

function rr(x, y, w, h, r) {
  const k = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

function txt(s, x, y, size, color, align, weight, alpha, shadow) {
  ctx.save();
  ctx.globalAlpha = alpha == null ? 1 : alpha;
  ctx.font = `${weight || 700} ${size}px 'Hiragino Kaku Gothic ProN','Yu Gothic','Meiryo','Noto Sans JP',sans-serif`;
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'middle';
  if (shadow) { ctx.shadowColor = shadow; ctx.shadowBlur = size * 0.8; }
  ctx.fillStyle = color || '#fff';
  ctx.fillText(String(s), x, y);
  ctx.restore();
}

function neon(x1, y1, x2, y2, color, w, glow) {
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round';
  if (glow && !save.settings.flash) { ctx.shadowColor = color; ctx.shadowBlur = glow; }
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.restore();
}

function radial(x, y, r, c1, c2) {
  if (r <= 0) return;
  const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, c1); gr.addColorStop(1, c2);
  ctx.save(); ctx.fillStyle = gr;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.restore();
}

/** 场景节拍相位（灯带随 124BPM 呼吸） */
function beat(t) {
  const spb = 60 / CFG.bpm;
  return Math.pow(1 - ((t % spb) / spb), 2.2);
}

/* ------------------------------------------------------------------ *
 * 14. 背景与框体
 * ------------------------------------------------------------------ */

function drawBackground(sc) {
  const pal = PAL[sc];
  const gr = ctx.createLinearGradient(0, 0, 0, LH);
  gr.addColorStop(0, pal.bg1); gr.addColorStop(0.55, pal.bg2); gr.addColorStop(1, '#02030a');
  ctx.fillStyle = gr; ctx.fillRect(0, 0, LW, LH);

  ctx.save();
  ctx.globalAlpha = sc === 'reach' ? 0.05 : 0.1;
  ctx.strokeStyle = pal.acc; ctx.lineWidth = 0.6;
  const s = 46;
  ctx.beginPath();
  for (let y = -s; y < LH + s; y += s) {
    for (let x = -s; x < LW + s * 2; x += s) {
      ctx.moveTo(x, y); ctx.lineTo(x + s / 2, y + s * 0.86);
      ctx.moveTo(x + s, y); ctx.lineTo(x + s / 2, y + s * 0.86);
    }
  }
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = pal.wash; ctx.fillRect(0, 0, LW, LH);

  const b = beat(g.t);
  for (let i = 0; i < 7; i++) radial(30 + i * 62, 6, 46, `rgba(255,170,60,${0.18 + b * 0.1})`, 'rgba(255,170,60,0)');
}

function drawFrameDeco(sc) {
  const pal = PAL[sc];
  const b = beat(g.t);
  ctx.save();
  ctx.lineWidth = 2.2;
  const grd = ctx.createLinearGradient(0, 0, LW, LH);
  grd.addColorStop(0, '#c8324a'); grd.addColorStop(0.5, pal.acc); grd.addColorStop(1, '#c8324a');
  ctx.strokeStyle = grd;
  if (!save.settings.flash) { ctx.shadowColor = pal.acc; ctx.shadowBlur = 10 + b * 14; }
  rr(6, 6, LW - 12, LH - 12, 14); ctx.stroke();
  ctx.restore();

  const lit = Math.min(12, g.comboCount * 2);
  const feverish = sc === 'fever' || sc === 'matsuri';
  for (let i = 0; i < 12; i++) {
    const y = 176 + i * 44;
    ctx.fillStyle = i < lit || feverish ? pal.acc : 'rgba(120,140,220,.16)';
    rr(9, y, 8, 26, 4); ctx.fill();
    rr(LW - 17, y, 8, 26, 4); ctx.fill();
  }

  ctx.save();
  const nb = ctx.createLinearGradient(0, 0, 0, 20);
  nb.addColorStop(0, 'rgba(200,50,74,.9)'); nb.addColorStop(1, 'rgba(80,16,32,.6)');
  ctx.fillStyle = nb; rr(158, 12, 134, 20, 6); ctx.fill();
  ctx.restore();
  txt('夏 日 祭', 225, 22, 13, '#ffeec2', 'center', 800);
}

/* ------------------------------------------------------------------ *
 * 15. 盘面
 * ------------------------------------------------------------------ */

function drawField(sc) {
  const feverish = sc === 'fever' || sc === 'matsuri';

  // 右侧发射轨道
  ctx.save();
  ctx.fillStyle = 'rgba(10,14,36,.85)';
  rr(399, 150, 24, DRAIN_Y - 150, 8); ctx.fill();
  ctx.strokeStyle = 'rgba(150,175,255,.28)'; ctx.lineWidth = 1;
  rr(399, 150, 24, DRAIN_Y - 150, 8); ctx.stroke();
  ctx.restore();
  for (let i = 0; i <= 7; i++) neon(402, lerp(DRAIN_Y - 16, 168, i / 7), 408, lerp(DRAIN_Y - 16, 168, i / 7), 'rgba(160,190,255,.25)', 1, 0);

  for (const s of W.segs) {
    const heavy = s.kind === 'floor';
    const col = heavy ? (feverish ? '#ffd7a0' : '#e0793f')
      : s.kind === 'guide' ? 'rgba(120,150,230,.55)' : 'rgba(110,140,225,.34)';
    neon(s.x1, s.y1, s.x2, s.y2, col, heavy ? 3.4 : 2, heavy ? 8 : 0);
  }

  drawTorii(sc);
  for (const p of W.pockets) if (p.kind !== 'torii') drawPocket(p);

  for (const p of W.pegs) {
    if (p.kind === 'lantern') { drawLantern(p); continue; }
    const hot = p.lit > 0;
    radial(p.x, p.y, 11, hot ? 'rgba(255,220,140,.5)' : 'rgba(150,190,255,.18)', 'rgba(0,0,0,0)');
    ctx.fillStyle = hot ? '#ffe9a8' : '#9fb6e8';
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    ctx.beginPath(); ctx.arc(p.x - 1.6, p.y - 1.8, 1.5, 0, TAU); ctx.fill();
  }

  for (const c of W.bumpers) drawDrum(c);
  for (const c of W.boosters) drawBoostDrum(c);
  drawWindmill();
  drawSayBox();
  if (g.charging) drawPowerGhost();
}

function drawPocket(p) {
  const cx = (p.x1 + p.x2) / 2;
  const isStart = p.kind === 'start';
  const pulse = 0.5 + 0.5 * Math.sin(g.t * 4);
  const col = isStart ? `rgba(255,${Math.round(140 + pulse * 60)},80,${(0.75 + pulse * 0.25).toFixed(2)})` : 'rgba(110,230,190,.8)';
  ctx.save();
  ctx.fillStyle = 'rgba(2,4,12,.92)';
  ctx.fillRect(p.x1, p.y - 14, p.x2 - p.x1, 26);
  ctx.strokeStyle = col; ctx.lineWidth = 2;
  if (!save.settings.flash) { ctx.shadowColor = col; ctx.shadowBlur = 10; }
  ctx.strokeRect(p.x1, p.y - 14, p.x2 - p.x1, 26);
  ctx.restore();
  txt(isStart ? '始' : '入', cx, p.y - 1, 13, isStart ? '#ffd08a' : '#9fe8c8', 'center', 800);
  if (isStart) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,190,120,.5)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(p.x1 - 6, p.y - 20); ctx.quadraticCurveTo(cx, p.y - 30, p.x2 + 6, p.y - 20); ctx.stroke();
    ctx.restore();
    txt('START', p.x1 - 9, p.y - 26, 8, 'rgba(255,190,120,.85)', 'right', 700);
  }
}

function drawTorii(sc) {
  const feverish = sc === 'fever' || sc === 'matsuri';
  const x1 = 178, x2 = 272, y = 656;
  ctx.save();
  ctx.fillStyle = feverish ? '#ff5a5a' : '#b93a4a';
  ctx.fillRect(x1 - 2, y - 26, 7, 66);
  ctx.fillRect(x2 - 5, y - 26, 7, 66);
  ctx.fillStyle = feverish ? '#ff7a6a' : '#c8404f';
  rr(x1 - 14, y - 34, x2 - x1 + 28, 9, 3); ctx.fill();
  ctx.fillRect(x1 - 6, y - 22, x2 - x1 + 12, 5);
  ctx.restore();

  if (!g.toriiOpen) {
    neon(W.toriiBar.x1, W.toriiBar.y1, W.toriiBar.x2, W.toriiBar.y2,
      feverish ? '#ffe9a8' : 'rgba(210,180,255,.65)', 4, feverish ? 12 : 4);
    if (feverish) txt('閉', 225, y - 8, 10, 'rgba(255,230,180,.8)', 'center', 800);
  } else {
    const a = 0.5 + 0.5 * Math.sin(g.t * 9);
    ctx.save();
    ctx.globalAlpha = 0.55 + a * 0.4;
    ctx.strokeStyle = '#ffe9a8'; ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const yy = y - 6 + i * 10;
      ctx.beginPath();
      ctx.moveTo(196 + i * 4, yy); ctx.lineTo(225, yy + 10); ctx.lineTo(254 - i * 4, yy);
      ctx.stroke();
    }
    ctx.restore();
    radial(225, 680, 52, 'rgba(255,200,90,.35)', 'rgba(255,200,90,0)');
    txt('OPEN', 225, y - 8, 10, '#fff0c0', 'center', 800, 0.9);
  }
  if (feverish) txt('出 玉', 225, y + 34, 11, 'rgba(255,240,200,.8)', 'center', 800);
}

function drawLantern(p) {
  const lit = p.lit > 0;
  ctx.save();
  ctx.translate(p.x, p.y + Math.sin(g.t * 2 + p.idx) * 0.6);
  if (lit) radial(0, 0, 26, 'rgba(255,170,60,.45)', 'rgba(255,170,60,0)');
  const g1 = ctx.createLinearGradient(0, -10, 0, 10);
  if (lit) { g1.addColorStop(0, '#ffd98a'); g1.addColorStop(0.5, '#ff9b3d'); g1.addColorStop(1, '#d9662a'); }
  else { g1.addColorStop(0, '#4a3a52'); g1.addColorStop(1, '#2a2036'); }
  ctx.fillStyle = g1;
  ctx.beginPath(); ctx.ellipse(0, 0, 9, 11, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = lit ? 'rgba(120,40,10,.55)' : 'rgba(255,255,255,.1)'; ctx.lineWidth = 0.8;
  for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.ellipse(0, i * 4.5, 9 - Math.abs(i) * 2.4, 2.2, 0, 0, TAU); ctx.stroke(); }
  ctx.fillStyle = lit ? '#5a1c14' : '#1b1524';
  ctx.fillRect(-5, -13, 10, 3); ctx.fillRect(-5, 10, 10, 3);
  txt('祭', 0, 0, 8, lit ? '#6b1f14' : 'rgba(255,255,255,.25)', 'center', 800);
  ctx.restore();
}

function drawDrum(c) {
  ctx.save();
  ctx.translate(c.x, c.y);
  const r = c.r + c.hit * 3;
  radial(0, 0, r * 2.2, `rgba(255,110,90,${(0.18 + c.hit * 0.3).toFixed(2)})`, 'rgba(255,110,90,0)');
  ctx.fillStyle = '#f3e3c8';
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#c8324a'; ctx.lineWidth = 3 + c.hit * 2;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
  ctx.strokeStyle = 'rgba(180,60,50,.45)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(0, 0, r * 0.6, 0, TAU); ctx.stroke();
  ctx.restore();
}

function drawBoostDrum(c) {
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(Math.sin(g.t * 3) * 0.1);
  radial(0, 0, c.r * 2.4, `rgba(255,210,90,${(0.16 + c.hit * 0.3).toFixed(2)})`, 'rgba(255,210,90,0)');
  ctx.fillStyle = '#2b2450';
  ctx.beginPath(); ctx.arc(0, 0, c.r, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, c.r, 0, TAU); ctx.stroke();
  for (let i = 0; i < 6; i++) {
    const a = (TAU / 6) * i + g.t * 1.2;
    neon(Math.cos(a) * (c.r - 3), Math.sin(a) * (c.r - 3),
      Math.cos(a) * (c.r + 5 + c.hit * 6), Math.sin(a) * (c.r + 5 + c.hit * 6), '#ffe9a8', 1.6, 6);
  }
  ctx.restore();
}

function drawWindmill() {
  const wm = W.windmill;
  ctx.save();
  ctx.translate(wm.x, wm.y);
  radial(0, 0, wm.r * 1.9, `rgba(140,220,255,${(0.1 + wm.hit * 0.2).toFixed(2)})`, 'rgba(140,220,255,0)');
  ctx.rotate(wm.ang);
  for (let a = 0; a < wm.arms; a++) {
    ctx.save();
    ctx.rotate((TAU / wm.arms) * a);
    const gr = ctx.createLinearGradient(0, 0, wm.r, 0);
    gr.addColorStop(0, '#8fb7ff'); gr.addColorStop(1, '#e6f2ff');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.moveTo(0, -3.5); ctx.lineTo(wm.r, -1.5); ctx.lineTo(wm.r, 1.5); ctx.lineTo(0, 3.5);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#ffd24a';
  ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.fill();
  ctx.restore();
}

function drawSayBox() {
  const s = W.say, hot = s.glow;
  ctx.save();
  ctx.translate(s.x, s.y);
  radial(0, 0, 46, `rgba(255,200,90,${(0.12 + hot * 0.35).toFixed(2)})`, 'rgba(255,200,90,0)');
  ctx.strokeStyle = '#c8a05a'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-s.w / 2 - 6, -10); ctx.quadraticCurveTo(0, -3, s.w / 2 + 6, -10); ctx.stroke();
  ctx.fillStyle = '#3a2a18';
  rr(-s.w / 2, -6, s.w, 18, 3); ctx.fill();
  ctx.strokeStyle = hot > 0 ? '#ffe9a8' : '#8a6a3a'; ctx.lineWidth = 1.6;
  rr(-s.w / 2, -6, s.w, 18, 3); ctx.stroke();
  txt('賽銭', 0, 4, 11, hot > 0 ? '#ffe9a8' : '#c9a76a', 'center', 800);
  ctx.restore();
}

/** 蓄力中的入点预告：力度就是准星 */
function drawPowerGhost() {
  const band = bandAtPower(g.power);
  const c = band === 'start' ? '#ff8a5c' : band === 'pocket' ? '#7fe3b0' : '#7b86b8';
  let x = CFG.exitX, y = CFG.exitY, vx = launchVx(g.power), vy = 20, t = 0;
  ctx.save();
  ctx.setLineDash([3, 6]);
  ctx.strokeStyle = c; ctx.lineWidth = 1.4; ctx.globalAlpha = 0.8;
  ctx.beginPath(); ctx.moveTo(x, y);
  while (t < 0.9) {
    x += vx * 0.02; vy += CFG.gravity * 0.02; y += vy * 0.02;
    ctx.lineTo(x, y); t += 0.02;
    if (y > 560 || x < 20) break;
  }
  ctx.stroke();
  ctx.restore();
  radial(x, y, 14, hexA(c.slice(0, 7), 0.4), 'rgba(0,0,0,0)');
}

function drawBalls() {
  for (const b of g.balls) {
    const tr = b.trail;
    if (tr.length > 4) {
      ctx.save();
      ctx.lineCap = 'round';
      for (let i = 2; i < tr.length; i += 2) {
        ctx.strokeStyle = `rgba(160,220,255,${((i / tr.length) * 0.5).toFixed(3)})`;
        ctx.lineWidth = 2 + (i / tr.length) * 3;
        ctx.beginPath(); ctx.moveTo(tr[i - 2], tr[i - 1]); ctx.lineTo(tr[i], tr[i + 1]); ctx.stroke();
      }
      ctx.restore();
    }
    drawBallSkin(b.x, b.y, CFG.ballR, save.skin, g.t);
  }
}

function drawBallSkin(x, y, r, skin, t) {
  ctx.save();
  if (skin === 'kingyo') {
    radial(x, y, r * 2.6, 'rgba(255,140,90,.35)', 'rgba(255,140,90,0)');
    const gr = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
    gr.addColorStop(0, '#fff0f0'); gr.addColorStop(0.5, '#ff8a5c'); gr.addColorStop(1, '#e04a2a');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.22, 0, TAU); ctx.fill();
  } else if (skin === 'hanabi') {
    const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, '#fff'); gr.addColorStop(0.45, `hsl(${Math.round((t * 140) % 360)},95%,65%)`); gr.addColorStop(1, '#2a1a50');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    for (let i = 0; i < 6; i++) {
      const a = (TAU / 6) * i + t * 4;
      neon(x + Math.cos(a) * r, y + Math.sin(a) * r, x + Math.cos(a) * (r + 3), y + Math.sin(a) * (r + 3), '#fff3c4', 1, 4);
    }
  } else {
    radial(x, y, r * 2.4, 'rgba(150,210,255,.22)', 'rgba(150,210,255,0)');
    const gr = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.5, '#bcd8ff'); gr.addColorStop(1, '#4a6ba8');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function drawFx() {
  ctx.save();
  for (const f of g.fx) {
    const a = clamp(f.life / f.max, 0, 1);
    ctx.globalAlpha = a;
    if (f.kind === 'dama') {
      ctx.fillStyle = f.color;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.6)';
      ctx.beginPath(); ctx.arc(f.x - 1, f.y - 1, f.r * 0.35, 0, TAU); ctx.fill();
    } else {
      ctx.strokeStyle = f.color; ctx.lineWidth = f.r * 0.9;
      ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x - f.vx * 0.02, f.y - f.vy * 0.02); ctx.stroke();
    }
  }
  ctx.restore();
  for (const t of g.texts) txt(t.text, t.x, t.y, t.size, t.color, 'center', 800, clamp(t.life, 0, 1));
}

/* ------------------------------------------------------------------ *
 * 16. 顶部 HUD：抽签屏 / 彩玉 / 六提灯 / 分数
 * ------------------------------------------------------------------ */

const REEL_X = 88, REEL_Y = 40, REEL_W = 86, REEL_H = 62, REEL_GAP = 8;
const REEL_TOTAL = (REEL_W + REEL_GAP) * 3 + 16;
const SYMBOLS = ['1', '2', '3', '4', '5', '6', '7', 'mask'];

function drawSymbol(sym, x, y, size, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha == null ? 1 : alpha;
  if (sym === 'mask') {
    const gr = ctx.createLinearGradient(x, y - size * 0.6, x, y + size * 0.6);
    gr.addColorStop(0, '#ffe9c4'); gr.addColorStop(1, '#e0a05a');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.moveTo(x - size * 0.5, y - size * 0.42);
    ctx.quadraticCurveTo(x, y - size * 0.66, x + size * 0.5, y - size * 0.42);
    ctx.quadraticCurveTo(x + size * 0.42, y + size * 0.5, x, y + size * 0.62);
    ctx.quadraticCurveTo(x - size * 0.42, y + size * 0.5, x - size * 0.5, y - size * 0.42);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#5a1f14';
    ctx.beginPath(); ctx.ellipse(x - size * 0.2, y - size * 0.1, size * 0.1, size * 0.06, 0.2, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + size * 0.2, y - size * 0.1, size * 0.1, size * 0.06, -0.2, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#5a1f14'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(x - size * 0.14, y + size * 0.24);
    ctx.quadraticCurveTo(x, y + size * 0.34, x + size * 0.14, y + size * 0.24); ctx.stroke();
  } else {
    const seven = sym === '7';
    const g2 = ctx.createLinearGradient(x, y - size * 0.6, x, y + size * 0.6);
    if (seven) { g2.addColorStop(0, '#fff2c4'); g2.addColorStop(0.5, '#ffcc33'); g2.addColorStop(1, '#e0621f'); }
    else { g2.addColorStop(0, '#ffffff'); g2.addColorStop(1, '#9fc6ff'); }
    ctx.fillStyle = g2;
    ctx.font = `900 ${size}px 'Hiragino Kaku Gothic ProN','Yu Gothic',sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (seven && !save.settings.flash) { ctx.shadowColor = '#ffcc33'; ctx.shadowBlur = size * 0.5; }
    ctx.fillText(sym, x, y);
  }
  ctx.restore();
}

function drawReels(sc) {
  const d = g.draw;
  ctx.save();
  const bez = ctx.createLinearGradient(REEL_X - 10, REEL_Y - 8, REEL_X + 282, REEL_Y + REEL_H + 8);
  bez.addColorStop(0, '#1a2350'); bez.addColorStop(1, '#0a0e26');
  ctx.fillStyle = bez;
  rr(REEL_X - 12, REEL_Y - 8, REEL_TOTAL, REEL_H + 16, 10); ctx.fill();
  ctx.strokeStyle = sc === 'reach' ? '#ffd24a' : 'rgba(150,180,255,.35)'; ctx.lineWidth = 1.6;
  rr(REEL_X - 12, REEL_Y - 8, REEL_TOTAL, REEL_H + 16, 10); ctx.stroke();
  ctx.restore();

  for (let i = 0; i < 3; i++) {
    const x = REEL_X + i * (REEL_W + REEL_GAP), y = REEL_Y;
    ctx.save();
    rr(x, y, REEL_W, REEL_H, 6); ctx.clip();
    const bg = ctx.createLinearGradient(x, y, x, y + REEL_H);
    bg.addColorStop(0, '#060a18'); bg.addColorStop(0.5, '#111a3c'); bg.addColorStop(1, '#060a18');
    ctx.fillStyle = bg; ctx.fillRect(x, y, REEL_W, REEL_H);
    ctx.fillStyle = 'rgba(255,255,255,.05)';
    ctx.fillRect(x, y + REEL_H / 2 - 16, REEL_W, 32);
    if (d && !d.stop[i]) {
      const spd = i === 2 && d.reach ? 4.2 : 16;
      const ph = (g.t * spd) % 1;
      const base = Math.floor(g.t * spd * 3 + i * 5);
      for (let k = -1; k <= 1; k++) {
        const sym = SYMBOLS[(((base + k) % SYMBOLS.length) + SYMBOLS.length) % SYMBOLS.length];
        const yy = y + REEL_H / 2 + (k + ph) * REEL_H * 0.62 - REEL_H * 0.31;
        drawSymbol(sym, x + REEL_W / 2, yy, 34, Math.max(0.15, 1 - Math.min(0.85, Math.abs((k + ph) * 0.55))));
      }
    } else {
      const sym = d ? d.syms[i] : ['7', 'mask', '7'][i];
      drawSymbol(sym, x + REEL_W / 2, y + REEL_H / 2, 38, d ? 1 : 0.35);
      if (d && d.stop[i]) radial(x + REEL_W / 2, y + REEL_H / 2, 40, 'rgba(255,210,90,.22)', 'rgba(255,210,90,0)');
    }
    const gl = ctx.createLinearGradient(x, y, x, y + 22);
    gl.addColorStop(0, 'rgba(255,255,255,.16)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gl; ctx.fillRect(x, y, REEL_W, 22);
    ctx.restore();
    ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1;
    rr(x, y, REEL_W, REEL_H, 6); ctx.stroke();
  }

  if (d && d.reach && !d.stop[2]) {
    const p = clamp(d.reachT / CFG.reachTime, 0, 1);
    const y = REEL_Y + REEL_H + 2;
    ctx.save();
    ctx.fillStyle = 'rgba(255,210,90,.14)'; rr(REEL_X - 12, y, REEL_TOTAL, 14, 5); ctx.fill();
    ctx.fillStyle = 'rgba(255,210,90,.45)'; rr(REEL_X - 12, y, REEL_TOTAL * p, 14, 5); ctx.fill();
    ctx.restore();
    txt(`${d.reach.name}  信頼度 ${Math.round(d.reach.trust * 100)}%`, REEL_X - 6, y + 7, 10, d.broken ? '#ff6b7a' : '#fff3c4', 'left', 800);
    txt(d.broken ? d.reach.breakText : `法則：${d.reach.rule}`, REEL_X + REEL_TOTAL - 18, y + 7, 9,
      d.broken ? '#ffd24a' : 'rgba(200,215,255,.8)', 'right', 700);
  }
}

function drawShapeMark(shape, x, y, s) {
  ctx.beginPath();
  if (shape === 'circle') ctx.arc(x, y, s * 0.7, 0, TAU);
  else if (shape === 'diamond') { ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.7, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.7, y); ctx.closePath(); }
  else if (shape === 'triangle') { ctx.moveTo(x, y - s); ctx.lineTo(x + s, y + s * 0.7); ctx.lineTo(x - s, y + s * 0.7); ctx.closePath(); }
  else if (shape === 'square') ctx.rect(x - s * 0.7, y - s * 0.7, s * 1.4, s * 1.4);
  else if (shape === 'star') {
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (TAU / 5) * i, a2 = a + TAU / 10;
      if (i === 0) ctx.moveTo(x + Math.cos(a) * s, y + Math.sin(a) * s);
      else ctx.lineTo(x + Math.cos(a) * s, y + Math.sin(a) * s);
      ctx.lineTo(x + Math.cos(a2) * s * 0.45, y + Math.sin(a2) * s * 0.45);
    }
    ctx.closePath();
  } else { ctx.arc(x, y, s * 0.8, 0, TAU); ctx.moveTo(x + s * 0.3, y); ctx.arc(x, y, s * 0.3, 0, TAU); }
  ctx.stroke();
}

function drawSaitamaTrack() {
  const y = 132;
  txt('彩玉', 14, y, 10, 'rgba(255,220,150,.8)', 'left', 800);
  for (let i = 0; i < g.reserveMax; i++) {
    const x = 46 + i * 34;
    const r = g.reserve[i];
    ctx.save();
    ctx.strokeStyle = 'rgba(150,175,255,.22)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, 14, 0, TAU); ctx.stroke();
    if (r) {
      const first = i === 0 && !g.draw;
      const pr = first ? clamp(r.t / CFG.reserveRoll, 0, 1) : 0;
      radial(x, y, 22, hexA(r.s.color, 0.42 + (first ? 0.18 * Math.sin(g.t * 6) : 0)), 'rgba(0,0,0,0)');
      const gr = ctx.createRadialGradient(x - 4, y - 5, 1, x, y, 12);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.45, r.s.color); gr.addColorStop(1, hexA(r.s.color, 0.35));
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(x, y, 11, 0, TAU); ctx.fill();
      if (first) {
        // 正在滚的这颗：数字代替形状，直接读期待度
        txt(Math.round(r.s.expect * 100), x, y + 1, 10, 'rgba(20,14,4,.9)', 'center', 900);
      } else {
        ctx.strokeStyle = 'rgba(10,12,26,.75)'; ctx.lineWidth = 1.6;
        drawShapeMark(r.s.shape, x, y, 5);
      }
      if (first) {
        ctx.strokeStyle = '#fff3c4'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, 15, -Math.PI / 2, -Math.PI / 2 + TAU * pr); ctx.stroke();
      }
    }
    ctx.restore();
  }
}

function drawLamps() {
  const rushMode = g.rush || g.fever;
  const n = rushMode ? Math.ceil((g.rushT / rushLen()) * 6) : g.pity;
  const x0 = 208, y = 132;
  txt(rushMode ? 'RUSH' : '保', x0 - 10, y, 9, rushMode ? '#ffd24a' : 'rgba(170,190,240,.7)', 'right', 800);
  for (let i = 0; i < 6; i++) {
    const x = x0 + i * 30, on = i < n;
    ctx.save();
    if (on) radial(x, y, 18, 'rgba(255,160,60,.45)', 'rgba(255,160,60,0)');
    ctx.fillStyle = on ? '#ff9b3d' : 'rgba(70,60,90,.55)';
    ctx.beginPath(); ctx.ellipse(x, y, 8, 10, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = on ? '#ffe08a' : 'rgba(160,150,190,.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(x, y, 8, 10, 0, 0, TAU); ctx.stroke();
    ctx.fillStyle = on ? 'rgba(120,40,10,.6)' : 'rgba(255,255,255,.07)';
    ctx.fillRect(x - 4, y - 12, 8, 2.4); ctx.fillRect(x - 4, y + 9.6, 8, 2.4);
    ctx.restore();
  }
  txt(rushMode ? `継続 ${Math.round(rushRateNow() * 100)}%` : `未中奖 ${g.pity}/6 → 赤以上`,
    x0 + 6 * 30 + 4, y, 8.5, rushMode ? '#ffe9a8' : 'rgba(190,205,250,.7)', 'right', 700);
}

function drawStateBar(sc) {
  if (g.draw && g.draw.reach && !g.draw.stop[2]) return;   // リーチ条が同じ席を使う
  const y = 110, x = REEL_X - 12;
  ctx.save();
  ctx.fillStyle = 'rgba(6,10,24,.7)'; rr(x, y, REEL_TOTAL, 13, 4); ctx.fill();
  let label = '普通阶段', prog = 0, col = '#8fb7ff';
  if (g.fever) {
    label = (g.matsuri ? '神輿渡御 FEVER' : '祭道 FEVER') + ` 鳥居 ${g.feverHits}`;
    prog = g.feverT / (g.feverSuper ? CFG.superFeverTime : CFG.feverTime);
    col = '#ff6b7a';
  } else if (g.rush) {
    label = `提灯RUSH${g.matsuri ? '（神輿）' : ''}`;
    prog = g.rushT / rushLen(); col = '#ffd24a';
  } else if (g.phase === 'jackpotFx') {
    label = '大当たり演出'; prog = g.fxT / CFG.jackpotFxTime; col = '#ffd24a';
  } else if (g.omifuda.size) {
    label = `御神籤 ${g.omifuda.size}/3`; prog = g.omifuda.size / 3; col = '#8ef0b8';
  }
  ctx.fillStyle = hexA(col, 0.28);
  rr(x, y, REEL_TOTAL * clamp(prog, 0, 1), 13, 4); ctx.fill();
  ctx.restore();
  txt(label, x + 6, y + 7, 9.5, '#eef2ff', 'left', 700);
  txt(`×${mult().toFixed(1)}`, x + REEL_TOTAL - 6, y + 7, 10, g.multIdx > 0 ? '#ffd24a' : 'rgba(200,215,255,.7)', 'right', 800);
}

function drawTopHud(sc) {
  txt('SCORE', 14, 22, 8.5, 'rgba(170,190,240,.65)', 'left', 700);
  txt(fmt(g.score), 14, 36, 19, '#fff3c4', 'left', 900, 1, 'rgba(255,210,90,.5)');
  const left = Math.max(0, CFG.roundTime - g.t);
  const clock = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
  txt('夜まで', 14, 55, 8, 'rgba(170,190,240,.6)', 'left', 700);
  txt(clock, 46, 55, 12.5, left < 60 ? (Math.sin(g.t * 7) > 0 ? '#ff9a9a' : '#ffd24a') : '#cfd8ff', 'left', 900);
  txt(`祭典币 ${save.coins}`, 225, 44, 9, 'rgba(255,220,150,.75)', 'center', 700);
  txt('MULT', 436, 22, 8.5, 'rgba(170,190,240,.65)', 'right', 700);
  txt(`×${mult().toFixed(1)}`, 436, 36, 17, g.multIdx > 0 ? '#ffd24a' : '#cfd8ff', 'right', 900);
  if (g.comboCount > 1) txt(`${g.comboCount} 连续`, 436, 52, 9, 'rgba(255,220,150,.8)', 'right', 700);
  if (g.comboT > 0) {
    ctx.fillStyle = 'rgba(255,210,90,.7)';
    ctx.fillRect(436 - 60 * (g.comboT / CFG.comboWindow), 58, 60 * (g.comboT / CFG.comboWindow), 2.5);
  }
  drawReels(sc);
  drawStateBar(sc);
  drawSaitamaTrack();
  drawLamps();
}

/* ------------------------------------------------------------------ *
 * 17. 底部信息条 + 力度规
 * ------------------------------------------------------------------ */

function wrapText(s, n) {
  const out = [];
  for (let i = 0; i < s.length; i += n) out.push(s.slice(i, i + n));
  return out;
}

/** 按空格断行（短于 n 的行不拆），超长片段再硬切 */
function wrapWords(s, n) {
  const words = String(s).split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (!cur) { cur = w; continue; }
    if ((cur + ' ' + w).length <= n) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  const out = [];
  for (const l of lines) for (const seg of (l.length > n ? wrapText(l, n) : [l])) out.push(seg);
  return out;
}

function button(x, y, w, h, id, label, col, active) {
  hit(x, y, w, h, id, label);
  ctx.save();
  const g1 = ctx.createLinearGradient(x, y, x, y + h);
  if (active) { g1.addColorStop(0, '#ffe9a8'); g1.addColorStop(1, '#e09a2a'); }
  else { g1.addColorStop(0, hexA(col, 0.28)); g1.addColorStop(1, 'rgba(6,10,24,.85)'); }
  ctx.fillStyle = g1;
  rr(x, y, w, h, h / 2.6); ctx.fill();
  ctx.strokeStyle = active ? '#fff6d8' : col; ctx.lineWidth = active ? 2 : 1.3;
  rr(x, y, w, h, h / 2.6); ctx.stroke();
  ctx.restore();
  txt(label, x + w / 2, y + h / 2 + 0.5, Math.min(14, h * 0.52), active ? '#2a1a06' : '#eaf0ff', 'center', 800);
}

function drawMissionChips() {
  const items = [
    { k: 'score', t: `① ${fmt(CFG.missionScore)}分`, v: g.score, m: CFG.missionScore },
    { k: 'jackpot', t: '② 大当たり ×1', v: g.jackpots, m: 1 },
    { k: 'torii', t: `③ 鳥居 ${CFG.missionTorii}回`, v: g.feverHits, m: CFG.missionTorii },
  ];
  items.forEach((it, i) => {
    const x = 78 + i * 116, y = 760, w = 112, h = 16;
    const done = g.missions[it.k];
    ctx.save();
    ctx.fillStyle = done ? 'rgba(255,210,90,.22)' : 'rgba(10,16,40,.7)';
    rr(x, y, w, h, 5); ctx.fill();
    ctx.strokeStyle = done ? '#ffd24a' : 'rgba(140,165,240,.3)'; ctx.lineWidth = 1;
    rr(x, y, w, h, 5); ctx.stroke();
    if (!done) {
      ctx.fillStyle = 'rgba(120,170,255,.18)';
      rr(x + 1, y + 1, (w - 2) * clamp(it.v / it.m, 0, 1), h - 2, 4); ctx.fill();
    }
    ctx.restore();
    txt((done ? '✓ ' : '') + it.t, x + 6, y + 8.5, 9.5, done ? '#ffe9a8' : '#c8d4ff', 'left', 700);
  });
}

function drawBottomBar() {
  ctx.save();
  ctx.fillStyle = 'rgba(4,7,18,.88)';
  ctx.fillRect(0, DRAIN_Y + 4, LW, LH - DRAIN_Y - 4);
  ctx.restore();
  neon(0, DRAIN_Y + 4, LW, DRAIN_Y + 4, 'rgba(255,210,90,.35)', 1.2, 0);

  button(10, 782, 26, 22, 'settings', '⚙', '#8fb7ff');
  hit(10, 760, 26, 18, 'skinR', '球种');
  txt(SKINS.find((s) => s.id === save.skin).name.slice(0, 2), 23, 769, 9.5, '#ffd24a', 'center', 800);

  drawMissionChips();

  txt('残玉', 418, 762, 8.5, 'rgba(170,190,240,.7)', 'right', 700);
  txt(String(g.inventory), 418, 776, 17, g.inventory <= 3 ? '#ff8a8a' : '#eaf0ff', 'right', 900);
  if (g.fever) txt(`鳥居 ${g.feverHits}/${CFG.missionTorii} ★`, 418, 792, 9, g.feverHits >= CFG.missionTorii ? '#ffd24a' : '#cfe0ff', 'right', 800);
  else if (g.canSettle) { hit(320, 784, 98, 16, 'settle', '提前结算'); txt('▶ 提前结算', 418, 792, 9.5, '#8ef0b8', 'right', 700); }
  txt(`場 ${g.balls.length}/${maxBalls()}`, 78, 792, 9, 'rgba(170,190,240,.6)', 'left', 700);
  drawPowerGauge();
}

function drawPowerGauge() {
  const x = 430, w = 16, y0 = 744, y1 = 168;
  ctx.save();
  ctx.fillStyle = 'rgba(6,10,24,.75)';
  rr(x, y1, w, y0 - y1, 6); ctx.fill();
  ctx.strokeStyle = 'rgba(140,165,240,.3)'; ctx.lineWidth = 1;
  rr(x, y1, w, y0 - y1, 6); ctx.stroke();
  for (const c of powerCurve) {
    const yy = lerp(y0, y1, (c.power - CFG.powerMin) / (CFG.powerMax - CFG.powerMin));
    ctx.fillStyle = c.outcome.startsWith('start') ? '#ff8a5c' : c.outcome.startsWith('pocket') ? '#7fe3b0' : 'rgba(120,140,200,.35)';
    ctx.fillRect(x + 2, yy - 0.9, w - 4, 1.8);
  }
  const hy = lerp(y0, y1, (g.power - CFG.powerMin) / (CFG.powerMax - CFG.powerMin));
  if (g.charging) {
    const gr = ctx.createLinearGradient(0, y0, 0, hy);
    gr.addColorStop(0, 'rgba(120,220,180,.35)'); gr.addColorStop(1, 'rgba(255,210,90,.85)');
    ctx.fillStyle = gr;
    ctx.fillRect(x + 2, hy, w - 4, y0 - hy);
  }
  ctx.fillStyle = '#fff3c4';
  ctx.beginPath();
  ctx.moveTo(x - 7, hy); ctx.lineTo(x - 1, hy - 4.5); ctx.lineTo(x - 1, hy + 4.5); ctx.closePath(); ctx.fill();
  ctx.restore();
  txt(`${Math.round(g.power * 100)}`, x + w / 2, y0 + 14, 11, g.charging ? '#ffd24a' : 'rgba(200,215,255,.75)', 'center', 900);
  ctx.save();
  [['#ff8a5c', '始'], ['#7fe3b0', '入']].forEach((l, i) => {
    ctx.fillStyle = l[0];
    ctx.fillRect(x + 2, y1 - 14 + i * 8, 5, 5);
    txt(l[1], x + 11, y1 - 11 + i * 8, 7.5, 'rgba(220,230,255,.8)', 'left', 700);
  });
  ctx.restore();
}

/* ------------------------------------------------------------------ *
 * 18. 横幅 · リーチ演出 · 覆盖层
 * ------------------------------------------------------------------ */

function drawBanner() {
  const b = g.banner;
  if (!b) return;
  const inA = clamp(b.t * 6, 0, 1), outA = clamp((1 - b.t / b.dur) * 4, 0, 1);
  const a = Math.min(inA, outA);
  const h = b.sub ? 74 : 54;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(225, 360);
  ctx.scale(1 + (1 - inA) * 0.35, 1 + (1 - inA) * 0.35);
  const gr = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  gr.addColorStop(0, 'rgba(8,12,30,.2)'); gr.addColorStop(0.5, 'rgba(8,12,30,.86)'); gr.addColorStop(1, 'rgba(8,12,30,.2)');
  ctx.fillStyle = gr; ctx.fillRect(-170, -h / 2, 340, h);
  neon(-170, -h / 2, 170, -h / 2, b.color, 1.4, 8);
  neon(-170, h / 2, 170, h / 2, b.color, 1.4, 8);
  txt(b.text, 0, b.sub ? -12 : 0, b.text.length > 6 ? 30 : 36, b.color, 'center', 900, 1, hexA(b.color, 0.8));
  if (b.sub) txt(b.sub, 0, 18, 12, 'rgba(240,245,255,.9)', 'center', 700);
  ctx.restore();
}

function drawReachOverlay() {
  const d = g.draw;
  if (!d || !d.reach || d.stop[2]) return;
  ctx.save();
  ctx.fillStyle = 'rgba(2,3,10,.5)';
  ctx.fillRect(FL, FT, FR - FL, 150);
  const x = REEL_X + 2 * (REEL_W + REEL_GAP) + REEL_W / 2, y = REEL_Y + REEL_H / 2;
  radial(x, y, 120, 'rgba(255,220,120,.38)', 'rgba(255,220,120,0)');
  ctx.restore();

  const cy = 300, p = clamp(d.reachT / CFG.reachTime, 0, 1), bw = 300, bh = 66, bx = 225 - bw / 2;
  ctx.save();
  ctx.globalAlpha = 0.92;
  const gr2 = ctx.createLinearGradient(bx, cy - bh / 2, bx + bw, cy + bh / 2);
  gr2.addColorStop(0, 'rgba(12,8,24,.2)'); gr2.addColorStop(0.5, 'rgba(24,14,40,.9)'); gr2.addColorStop(1, 'rgba(12,8,24,.2)');
  ctx.fillStyle = gr2; ctx.fillRect(bx, cy - bh / 2, bw, bh);
  neon(bx, cy - bh / 2, bx + bw, cy - bh / 2, '#ffd24a', 1.2, 8);
  neon(bx, cy + bh / 2, bx + bw, cy + bh / 2, '#ffd24a', 1.2, 8);
  drawReachStage(d.reach, 225, cy, p, d.broken);
  ctx.restore();
}

/** 四种リーチ的小演出（各自带固有规律，规律被打破即大当り） */
function drawReachStage(r, cx, cy, p, broken) {
  const col = broken ? '#ff6b7a' : '#ffe9a8';
  if (r.id === 'lantern') {
    const order = broken ? [2, 1, 0] : [0, 1, 2];
    for (let i = 0; i < 3; i++) {
      const on = p > (i + 0.5) / 3;
      const x = cx - 90 + order[i] * 90;
      ctx.save();
      if (on) radial(x, cy, 26, 'rgba(255,160,60,.5)', 'rgba(255,160,60,0)');
      ctx.fillStyle = on ? '#ff9b3d' : 'rgba(80,70,100,.6)';
      ctx.beginPath(); ctx.ellipse(x, cy, 15, 20, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
    txt(broken ? '← 逆向!' : '提灯が灯る…', cx, cy + 40, 11, col, 'center', 800);
  } else if (r.id === 'taiko') {
    const side = Math.floor(p * 8) % 2;
    ctx.fillStyle = '#f3e3c8';
    ctx.beginPath(); ctx.arc(cx, cy + 4, 30, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#c8324a'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(cx, cy + 4, 30, 0, TAU); ctx.stroke();
    [-1, 1].forEach((s, i) => {
      const down = broken ? true : (i === 0 ? side === 0 : side === 1);
      ctx.save();
      ctx.translate(cx + s * 34, cy - 26 + (down ? 22 : 0));
      ctx.rotate(s * 0.5);
      ctx.fillStyle = '#e8d8b8'; ctx.fillRect(-3, 0, 6, 26);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(0, 0, 7, 0, TAU); ctx.fill();
      ctx.restore();
    });
    txt(broken ? '両の枹が同時に!' : 'ドンドン、ドンドン…', cx, cy + 48, 11, col, 'center', 800);
  } else if (r.id === 'mikoshi') {
    const x = cx - 110 + p * 220;
    const pause = !broken && Math.abs(p - 0.5) < 0.07;
    ctx.save();
    ctx.translate(x, cy + (pause ? 6 : 0));
    ctx.fillStyle = '#c8324a'; ctx.fillRect(-26, -8, 52, 16); ctx.fillRect(-30, -20, 60, 6);
    ctx.fillStyle = '#ffd24a';
    ctx.beginPath(); ctx.moveTo(-30, -20); ctx.lineTo(0, -34); ctx.lineTo(30, -20); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#8a5a2a'; ctx.fillRect(-34, 8, 6, 14); ctx.fillRect(28, 8, 6, 14);
    ctx.restore();
    txt(broken ? '神輿は寄らなかった!' : '桥の真ん中で…', cx, cy + 48, 11, col, 'center', 800);
  } else {
    for (let i = 0; i < 3; i++) {
      if (p <= (i + 0.6) / 3) continue;
      const x = cx - 90 + i * 90;
      const botan = broken && i === 2;
      const n = botan ? 12 : 8;
      ctx.save();
      ctx.lineWidth = 2;
      for (let k = 0; k < n; k++) {
        const a = (TAU / n) * k + (botan ? 0.3 : 0);
        const rad = 18 + Math.sin(g.t * 6 + k) * 2;
        ctx.strokeStyle = i === 2 ? (botan ? '#ff6b7a' : '#ffd24a') : '#8ec5ff';
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * 4, cy + Math.sin(a) * 4);
        ctx.lineTo(x + Math.cos(a) * rad, cy + Math.sin(a) * rad);
        ctx.stroke();
      }
      ctx.restore();
    }
    txt(broken ? '三発目は牡丹だった!' : '三発目、火蓋を切る…', cx, cy + 48, 11, col, 'center', 800);
  }
}

function drawFeverSummary() {
  const s = g.feverSummary;
  const p = clamp(s.t / 0.9, 0, 1), y = 560;
  ctx.save();
  ctx.globalAlpha = clamp(2.6 - s.t, 0, 1);
  const gr = ctx.createLinearGradient(0, y - 30, 0, y + 30);
  gr.addColorStop(0, 'rgba(10,6,20,.1)'); gr.addColorStop(0.5, 'rgba(10,6,20,.88)'); gr.addColorStop(1, 'rgba(10,6,20,.1)');
  ctx.fillStyle = gr; ctx.fillRect(60, y - 28, 330, 56);
  txt('出  玉', 130, y - 8, 13, '#ffd24a', 'center', 800);
  txt(`${Math.round(s.balls * p)} 球`, 240, y, 26, '#fff3c4', 'center', 900, 1, 'rgba(255,160,60,.8)');
  txt(`鳥居 ${s.hits} 回${s.sup ? ' · 2倍' : ''}`, 330, y + 12, 10.5, '#cfe0ff', 'center', 700);
  ctx.restore();
}

function panel(x, y, w, h, title) {
  ctx.save();
  ctx.fillStyle = 'rgba(3,5,14,.72)'; ctx.fillRect(0, 0, LW, LH);
  const gr = ctx.createLinearGradient(x, y, x, y + h);
  gr.addColorStop(0, 'rgba(24,32,74,.96)'); gr.addColorStop(1, 'rgba(8,12,30,.97)');
  ctx.fillStyle = gr; rr(x, y, w, h, 16); ctx.fill();
  ctx.strokeStyle = 'rgba(255,210,90,.5)'; ctx.lineWidth = 1.6;
  rr(x, y, w, h, 16); ctx.stroke();
  ctx.fillStyle = 'rgba(200,50,74,.9)';
  rr(x + 20, y - 2, w - 40, 26, 6); ctx.fill();
  txt(title, x + w / 2, y + 11, 14, '#fff3c4', 'center', 800);
  ctx.restore();
}

function drawTitle() {
  ctx.save();
  ctx.fillStyle = 'rgba(2,4,12,.6)'; ctx.fillRect(0, 0, LW, LH);
  ctx.restore();
  ctx.save();
  ctx.translate(225, 208);
  ctx.scale(1 + Math.sin(g.t * 1.6) * 0.012, 1 + Math.sin(g.t * 1.6) * 0.012);
  txt('弹 珠 祭 典', 0, 0, 46, '#ffd24a', 'center', 900, 1, 'rgba(255,140,40,.9)');
  txt('K O R O   M A T S U R I', 0, 34, 12, 'rgba(220,232,255,.85)', 'center', 700);
  ctx.restore();
  txt('竖屏柏青哥 · 彩玉期待 · 祭道出玉 · 提灯Rush', 225, 262, 11.5, '#cfe0ff', 'center', 700);
  txt('按住蓄力 → 松开发射 · 彩玉滚 1.2 秒开封 · 三图案一致＝大当たり', 225, 282, 10, 'rgba(190,205,245,.75)', 'center', 600);

  button(115, 316, 220, 42, 'start', '祭 開 き  !', '#ffd24a', true);
  button(115, 368, 104, 28, 'settings', '设置 / 无障碍', '#8fb7ff');
  button(231, 368, 104, 28, 'skinR', '球种 ◀ ▶', '#8fb7ff');

  [['最高分', fmt(save.best)], ['星', String(save.stars)], ['祭典币', String(save.coins)], ['大当たり', String(save.jackpots)]]
    .forEach((s, i) => {
      const x = 70 + i * 110, y = 432;
      ctx.save();
      ctx.fillStyle = 'rgba(10,16,40,.6)'; rr(x - 40, y - 18, 100, 36, 8); ctx.fill();
      ctx.restore();
      txt(s[0], x + 10, y - 8, 8.5, 'rgba(170,190,240,.7)', 'center', 700);
      txt(s[1], x + 10, y + 8, 14, '#ffe9a8', 'center', 900);
    });

  txt('球种：' + SKINS.find((s) => s.id === save.skin).name, 225, 488, 10.5, '#ffd24a', 'center', 700);
  txt('一夜 5 分钟：夜明けまたは玉切れで结算 · 右侧力度规上的彩色刻度＝可复现的力度区间', 225, 520, 10, 'rgba(190,205,245,.65)', 'center', 600);
  txt('R 重开 · Q 提前开封彩玉 · Enter 跳过演出 · Esc 设置', 225, 540, 10, 'rgba(190,205,245,.5)', 'center', 600);
  if (save.plays) txt(`累计 ${save.plays} 局 · 已解锁外观 ${Object.keys(save.unlocked).length}/6`, 225, 566, 9.5, 'rgba(160,180,230,.6)', 'center', 600);
}

function drawOmifuda() {
  ctx.save();
  ctx.fillStyle = 'rgba(2,4,12,.78)'; ctx.fillRect(0, 0, LW, LH);
  ctx.restore();
  txt('御 神 籤', 225, 190, 32, '#ffd24a', 'center', 900, 1, 'rgba(255,160,60,.8)');
  txt('大当たり结算 · 三选一（本局有效，最多叠三张）', 225, 222, 11, '#cfe0ff', 'center', 700);
  const rarCol = ['#8fb7ff', '#c48fff', '#ffd24a'];
  g.omiOffer.forEach((o, i) => {
    const w = 126, h = 226, x = 24 + i * 138, y = 250;
    ctx.save();
    ctx.globalAlpha = clamp((g.omiT - i * 0.08) * 4, 0, 1);
    const gr = ctx.createLinearGradient(x, y, x, y + h);
    gr.addColorStop(0, 'rgba(30,22,54,.98)'); gr.addColorStop(1, 'rgba(10,8,24,.98)');
    ctx.fillStyle = gr; rr(x, y, w, h, 12); ctx.fill();
    ctx.strokeStyle = rarCol[o.rar]; ctx.lineWidth = 1.8;
    rr(x, y, w, h, 12); ctx.stroke();
    ctx.fillStyle = hexA(rarCol[o.rar], 0.18);
    rr(x + 6, y + 6, w - 12, 40, 8); ctx.fill();
    txt('[' + (i + 1) + ']', x + w / 2, y + 26, 15, '#fff3c4', 'center', 900);
    wrapText(o.name, 5).forEach((line, k) => txt(line, x + w / 2, y + 74 + k * 22, 18, rarCol[o.rar], 'center', 900));
    wrapWords(o.text, 7).forEach((line, k) => txt(line, x + w / 2, y + 148 + k * 15, 11.5, '#e8eeff', 'center', 700));
    txt('★'.repeat(o.rar + 1), x + w / 2, y + h - 14, 11, rarCol[o.rar], 'center', 800);
    ctx.restore();
    hit(x, y, w, h, 'mi' + i, o.name);
  });
  txt('点卡片或按 1 / 2 / 3', 225, 500, 11, 'rgba(200,215,255,.75)', 'center', 700);
  const owned = [...g.omifuda].map((id) => OMIFUDA.find((o) => o.id === id).name);
  if (owned.length) txt('已持：' + owned.join(' · '), 225, 524, 10.5, '#8ef0b8', 'center', 700);
}

function drawSettle() {
  const s = g.settle;
  if (!s) return;
  panel(36, 150, 378, 500, '祭 典 终 了  ·  ' + s.reason);
  txt('SCORE', 225, 206, 11, 'rgba(190,205,245,.8)', 'center', 700);
  txt(fmt(g.score), 225, 240, 40, '#ffd24a', 'center', 900, 1, 'rgba(255,160,60,.7)');
  [
    ['① 达到 6,000 分', g.missions.score, `${fmt(g.score)} / ${fmt(CFG.missionScore)}`],
    ['② 触发大当たり', g.missions.jackpot, `×${g.jackpots}`],
    [`③ 单次祭道鳥居 ${CFG.missionTorii} 回`, g.missions.torii, `最多 ${g.stats.toriiMax} 回`],
  ].forEach((m, i) => {
    const y = 288 + i * 34;
    ctx.save();
    ctx.fillStyle = m[1] ? 'rgba(255,210,90,.16)' : 'rgba(10,16,40,.5)';
    rr(60, y - 13, 330, 26, 8); ctx.fill();
    ctx.restore();
    txt((m[1] ? '★ ' : '☆ ') + m[0], 72, y, 12, m[1] ? '#ffe9a8' : '#9aa8d8', 'left', 700);
    txt(m[2], 378, y, 11, m[1] ? '#ffd24a' : 'rgba(150,170,220,.8)', 'right', 700);
  });
  for (let i = 0; i < 3; i++) {
    const lit = i < s.stars, x = 165 + i * 60, y = 400;
    ctx.save();
    if (lit) radial(x, y, 34, 'rgba(255,160,60,.5)', 'rgba(255,160,60,0)');
    ctx.fillStyle = lit ? '#ff9b3d' : 'rgba(70,60,90,.5)';
    ctx.beginPath(); ctx.ellipse(x, y, 18, 23, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = lit ? '#ffe08a' : 'rgba(160,150,190,.4)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.ellipse(x, y, 18, 23, 0, 0, TAU); ctx.stroke();
    txt('祭', x, y, 14, lit ? '#6b1f14' : 'rgba(255,255,255,.18)', 'center', 800);
    ctx.restore();
  }
  [
    ['祭典币获得', `+${s.coins}`],
    ['发射 / 撞钉 / 入口', `${g.stats.launches} / ${g.stats.pegs} / ${g.stats.pockets}`],
    ['启动口 / 大当たり', `${g.stats.starts} / ${g.jackpots}`],
    ['新解锁外观', g.unlockToast.length ? g.unlockToast.map((id) => SKINS.find((x2) => x2.id === id).name).join('、') : '—'],
  ].forEach((r, i) => {
    const y = 452 + i * 22;
    txt(r[0], 70, y, 11, 'rgba(190,205,245,.8)', 'left', 700);
    txt(r[1], 380, y, 11.5, i === 3 && g.unlockToast.length ? '#8ef0b8' : '#eaf0ff', 'right', 700);
  });
  if (g.unlockToast.length) txt('★ 新外观解锁！', 225, 540, 12, '#8ef0b8', 'center', 800, clamp(s.t * 2, 0, 1));
  button(115, 560, 220, 38, 'again', '再 开 一 局', '#ffd24a', true);
  button(115, 606, 104, 26, 'title', '回到标题', '#8fb7ff');
  button(231, 606, 104, 26, 'settings', '设置', '#8fb7ff');
}

function drawSettings() {
  panel(36, 138, 378, 508, '设 置  ·  无 障 碍');
  [['音乐', 'sl-music', save.settings.music], ['音效', 'sl-sfx', save.settings.sfx]].forEach((r, i) => {
    const y = 186 + i * 44;
    txt(r[0], 66, y, 12.5, '#eaf0ff', 'left', 700);
    button(126, y - 14, 28, 28, r[1] + '-down', '−', '#8fb7ff');
    ctx.save();
    ctx.fillStyle = 'rgba(10,16,40,.7)'; rr(162, y - 8, 150, 16, 6); ctx.fill();
    ctx.fillStyle = 'rgba(255,210,90,.75)'; rr(162, y - 8, 150 * r[2], 16, 6); ctx.fill();
    ctx.strokeStyle = 'rgba(140,165,240,.4)'; ctx.lineWidth = 1; rr(162, y - 8, 150, 16, 6); ctx.stroke();
    ctx.restore();
    button(320, y - 14, 28, 28, r[1] + '-up', '+', '#8fb7ff');
    txt(Math.round(r[2] * 100) + '%', 372, y, 11, 'rgba(200,215,255,.85)', 'left', 700);
  });
  [
    ['降低闪烁', save.settings.flash, 'tog-flash'],
    ['减少震动', !save.settings.shake, 'tog-shake'],
    ['减少粒子', !save.settings.particle, 'tog-particle'],
    ['跳过长演出', save.settings.skip, 'tog-skip'],
  ].forEach((t, i) => {
    const y = 292 + i * 38;
    txt(t[0], 66, y, 12.5, '#eaf0ff', 'left', 700);
    hit(300, y - 13, 78, 26, t[2], t[1] ? 'ON' : 'OFF');
    ctx.save();
    ctx.fillStyle = t[1] ? 'rgba(140,240,180,.25)' : 'rgba(10,16,40,.7)';
    rr(300, y - 13, 78, 26, 13); ctx.fill();
    ctx.strokeStyle = t[1] ? '#8ef0b8' : 'rgba(140,165,240,.4)'; ctx.lineWidth = 1.2;
    rr(300, y - 13, 78, 26, 13); ctx.stroke();
    ctx.fillStyle = t[1] ? '#8ef0b8' : 'rgba(150,170,220,.6)';
    ctx.beginPath(); ctx.arc(t[1] ? 365 : 313, y, 9, 0, TAU); ctx.fill();
    ctx.restore();
    txt(t[1] ? 'ON' : 'OFF', 340, y, 10, t[1] ? '#0d2a1c' : 'rgba(200,215,255,.6)', 'center', 800);
  });
  txt('关键信息不只靠颜色：彩玉同时用形状区分（圆 菱 三角 方 星 环）', 225, 456, 9.5, 'rgba(190,205,245,.7)', 'center', 600);
  txt('球种', 66, 486, 12.5, '#eaf0ff', 'left', 700);
  button(126, 472, 28, 28, 'skinL', '◀', '#8fb7ff');
  txt(SKINS.find((s) => s.id === save.skin).name, 225, 486, 12, '#ffd24a', 'center', 800);
  button(296, 472, 28, 28, 'skinR', '▶', '#8fb7ff');
  txt(`已解锁 ${Object.keys(save.unlocked).length}/6 · 累计 ${save.stars} 星 · 祭典币 ${save.coins}`, 225, 522, 10.5, 'rgba(190,205,245,.75)', 'center', 600);
  txt('未解锁：' + SKINS.filter((s) => !save.unlocked[s.id]).map((s) => s.condText).join(' / '), 225, 544, 9, 'rgba(170,190,240,.6)', 'center', 600);
  button(115, 574, 220, 34, 'close', '关 闭', '#ffd24a', true);
}

function drawFlash(sc) {
  if (g.flash <= 0.001) return;
  ctx.save();
  ctx.globalAlpha = Math.min(0.75, g.flash * (save.settings.flash ? 0.22 : 0.5));
  ctx.fillStyle = sc === 'fever' || sc === 'matsuri' ? '#ffd9a0' : '#fff';
  ctx.fillRect(0, 0, LW, LH);
  ctx.restore();
}

/* ------------------------------------------------------------------ *
 * 19. 输入
 * ------------------------------------------------------------------ */

/** 本帧绘制时登记的可点区域 */
let uiList = [];
function hit(x, y, w, h, id) { uiList.push({ x, y, w, h, id }); }

function uiHit(px, py) {
  for (let i = uiList.length - 1; i >= 0; i--) {
    const r = uiList[i];
    if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return r.id;
  }
  return null;
}

let showSettings = false;
let mouse = { x: 225, y: 400, down: false };

function toLogical(ev) {
  const b = canvas.getBoundingClientRect();
  return { x: (ev.clientX - b.left) / viewScale, y: (ev.clientY - b.top) / viewScale };
}

function startCharge() {
  if (g.phase === 'title' || g.phase === 'settle' || g.phase === 'omifuda') return;
  g.charging = true;
  if (g.power <= CFG.powerMin) { g.power = CFG.powerMin; g.powerDir = 1; }
}

function releaseCharge() {
  if (!g.charging) return;
  if (g.phase === 'play' || g.phase === 'fever') tryLaunch();
  else { g.charging = false; g.power = CFG.powerMin; g.powerDir = 1; }
}

function onAction(id) {
  audio.ensure();
  if (!id) return false;
  if (id === 'settings' || id === 'close') { showSettings = !showSettings; audio.ui(); return true; }
  if (id === 'skinL' || id === 'skinR') { cycleSkin(id === 'skinR' ? 1 : -1); audio.ui(); return true; }
  if (id.startsWith('sl-')) { nudgeSlider(id.slice(3), id.endsWith('-up') ? 1 : -1); audio.ui(); return true; }
  if (id.startsWith('tog-')) { toggleSetting(id.slice(4)); audio.ui(); return true; }
  if (showSettings) return true;
  if (id === 'start') { startGame(); audio.setScene('normal'); return true; }
  if (id === 'again') { startGame(); audio.setScene('normal'); return true; }
  if (id === 'title') { g = newGame(); g.phase = 'title'; audio.setScene('title'); return true; }
  if (id === 'settle') { settleNow('任务达成·提前结算'); return true; }
  if (id.startsWith('mi')) { takeOmifuda(parseInt(id.slice(2), 10)); return true; }
  return false;
}

function cycleSkin(dir) {
  const i = SKINS.findIndex((s) => s.id === save.skin);
  for (let k = 1; k <= SKINS.length; k++) {
    const s = SKINS[(i + dir * k + SKINS.length * 8) % SKINS.length];
    if (save.unlocked[s.id]) { save.skin = s.id; writeSave(); return; }
  }
}

function nudgeSlider(which, dir) {
  const key = which.split('-')[0];
  const s = save.settings;
  s[key] = clamp(Math.round((s[key] + dir * 0.1) * 10) / 10, 0, 1);
  audio.setVolumes(s.music, s.sfx);
  writeSave();
}

function toggleSetting(key) {
  const s = save.settings;
  if (key === 'shake') s.shake = !s.shake;
  else if (key === 'particle') s.particle = !s.particle;
  else s[key] = !s[key];
  writeSave();
}

canvas.addEventListener('pointerdown', (ev) => {
  audio.ensure();
  const p = toLogical(ev);
  mouse.x = p.x; mouse.y = p.y; mouse.down = true;
  const id = uiHit(p.x, p.y);
  if (id) { onAction(id); return; }
  if (showSettings) return;
  startCharge();
});
canvas.addEventListener('pointermove', (ev) => { const p = toLogical(ev); mouse.x = p.x; mouse.y = p.y; });
window.addEventListener('pointerup', () => { mouse.down = false; releaseCharge(); });
canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());

window.addEventListener('keydown', (ev) => {
  const k = ev.key;
  if (k === ' ' || k === 'Spacebar') {
    ev.preventDefault();
    audio.ensure();
    if (g.phase === 'title') { onAction('start'); return; }
    if (g.phase === 'settle') { onAction('again'); return; }
    if (showSettings) return;
    if (!ev.repeat) startCharge();
    return;
  }
  if (k === 'Escape') { showSettings = !showSettings; audio.ui(); return; }
  if (k === 'Enter') {
    if (g.phase === 'title') onAction('start');
    else if (g.phase === 'settle') onAction('again');
    else if (g.draw) { const d = g.draw; d.lockAt = [d.t, d.t, d.t]; }
    else if (g.omifuda.size) onAction('again');
    return;
  }
  if (k === 'q' || k === 'Q') { audio.ensure(); openReserve(true); return; }
  if (k === 'r' || k === 'R') { if (g.phase !== 'title') { startGame(); audio.setScene('normal'); } return; }
  if (k === '1' || k === '2' || k === '3') {
    if (g.phase === 'omifuda') takeOmifuda(parseInt(k, 10) - 1);
    return;
  }
});
window.addEventListener('keyup', (ev) => { if (ev.key === ' ' || ev.key === 'Spacebar') releaseCharge(); });

/* ------------------------------------------------------------------ *
 * 20. 主绘制与循环
 * ------------------------------------------------------------------ */

function render() {
  const sc = currentScene();
  uiList = [];
  ctx.save();
  if (g.shake > 0.3 && save.settings.shake) ctx.translate(rand(g.shake * 0.7, -g.shake * 0.7), rand(g.shake * 0.7, -g.shake * 0.7));
  drawBackground(sc);
  drawFrameDeco(sc);
  drawField(sc);
  drawBalls();
  drawFx();
  drawTopHud(sc);
  if (g.phase !== 'title') drawBottomBar();
  drawReachOverlay();
  if (g.feverSummary) drawFeverSummary();
  drawBanner();
  if (g.phase === 'title') drawTitle();
  else if (g.phase === 'omifuda') drawOmifuda();
  else if (g.phase === 'settle') drawSettle();
  if (showSettings) drawSettings();
  drawFlash(sc);
  ctx.restore();
}

let lastTime = 0;
let FROZEN = false;
function frame(now) {
  const dt = Math.min(0.05, lastTime ? (now - lastTime) / 1000 : 1 / 60);
  lastTime = now;
  if (!FROZEN) {
    update(dt);
    if (g.phase === 'play' || g.phase === 'fever' || g.phase === 'jackpotFx') audio.setScene(currentScene());
  }
  render();
  requestAnimationFrame(frame);
}

function startGame() {
  g = newGame();
  W.say.x = 212;
  W.pegs.forEach((p) => { p.lit = 0; });
  computePowerCurve();
  audio.setScene('normal');
}

/* ------------------------------------------------------------------ *
 * 21. 自测：同步跑完整局 + 关键不变式
 * ------------------------------------------------------------------ */

const checks = [];
function ok(name, cond, info) { checks.push({ name, pass: !!cond, info: info == null ? '' : String(info) }); }

function applyShot(power) {
  g.balls.push(makeBall(power));
}

/** 机器人用的好力度：取最接近 0.74 的启动口区间，其次普通入口 */
function pickBestPower() {
  const near = (kind) => {
    let best = null, bd = 9;
    for (const c of powerCurve) {
      if (!c.outcome.startsWith(kind)) continue;
      const d = Math.abs(c.power - 0.74);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  };
  return (near('start') || near('pocket') || { power: 0.62 }).power;
}

/** 现场发射追踪：与预演同力度对比轨迹，找物理/几何分叉 */
function traceLive(power) {
  startGame();
  g.inventory = 999999;
  const b = makeBall(power);
  g.balls.push(b);
  const path = [];
  let k = 0;
  for (let i = 0; i < 1500; i++) {
    update(1 / 60);
    const bb = g.balls[0];
    if (!bb) break;
    if (++k % 4 === 0) path.push(Math.round(bb.x), Math.round(bb.y));
    if (bb.dead) break;
  }
  const outcome = g.stats.pockets ? 'pocket' : g.stats.starts ? 'start' : 'drain';
  return { outcome, score: Math.round(g.score), pegs: g.stats.pegs, path: path.slice(0, 40) };
}

/**
 * 同步自测：不依赖 requestAnimationFrame，直接按帧推进。
 * @param {number} sec 模拟秒数
 * @param {number} games 允许的局数（0 = 不限）
 */
function runSelfTest(sec, games) {
  HEADLESS = true;
  checks.length = 0;
  useSeeded = true;
  rngSeed = Number(new URLSearchParams(location.search).get('seed')) || 20261105;
  const dt = 1 / 60;
  const maxFrames = Math.round(sec * 60);
  const res = { games: 0, games3: 0, jackpots: 0, fevers: 0, omi: {}, best: 0, live: null, t: 0, samples: [], missionT: 0, firstJackpot: 0, toriiMax: 0 };
  let best = 0.62;

  startGame();
  g.inventory = 45;
  best = pickBestPower();
  // 落底带力度：普通阶段算失误，祭道里正好把球喂给鳥居漏斗
  const funnel = (powerCurve.filter((c) => c.outcome === 'drain')
    .sort((a, b) => Math.abs(a.power - 0.62) - Math.abs(b.power - 0.62))[0] || { power: 0.62 }).power;

  let feverPrev = false;
  for (let f = 0; f < maxFrames; f++) {
    res.t = (f / 60).toFixed(1);
    if (g.phase === 'title') startGame();
    if (g.phase === 'omifuda') { res.omi[g.omiOffer[0].id] = (res.omi[g.omiOffer[0].id] || 0) + 1; takeOmifuda(0); }
    if (g.phase === 'settle') {
      res.games++;
      res.best = Math.max(res.best, Math.round(g.score));
      res.games3 += g.missions.torii ? 1 : 0;
      startGame();
      g.inventory = 45;
      continue;
    }
    if (!g.draw && g.reserve.length) openReserve(true);
    if (g.canSettle && g.phase === 'play' && !g.fever) { settleNow('任务达成·提前结算'); continue; }
    if (!g.charging && g.launchCd <= 0 && g.balls.length < maxBalls() && g.inventory > 0) {
      g.charging = true;
      const target = g.fever ? funnel : ((f % 100) < 70 ? funnel : best);
      g.power = clamp(target - 0.004, CFG.powerMin, CFG.powerMax);
      tryLaunch();
    }
    update(dt);
    if (g.fever && !feverPrev) res.fevers++;
    feverPrev = g.fever;
    res.jackpots = Math.max(res.jackpots, g.jackpots);
    if (g.jackpots >= 1 && !res.firstJackpot) res.firstJackpot = +res.t;
    res.toriiMax = Math.max(res.toriiMax, g.stats.toriiMax);
    if (g.stats.super) res.super777 = true;
    if (f % 600 === 0) res.samples.push({ t: res.t, inv: g.inventory, sc: Math.round(g.score), j: g.jackpots });
    if (g.missions.score && g.missions.jackpot && g.missions.torii && !res.missionT) res.missionT = +res.t;
  }
  res.reserveAvg = 0;
  res.live = {
    t: res.t, phase: g.phase, score: Math.round(g.score), inventory: g.inventory,
    launches: g.stats.launches, pegs: g.stats.pegs, pockets: g.stats.pockets, starts: g.stats.starts,
    balls: g.balls.length, reserve: g.reserve.length, drawing: !!g.draw, pity: g.pity,
    fever: g.fever, jackpots: g.jackpots, omifuda: [...g.omifuda],
  };

  /* --- 不变式 --- */
  const expect = SAITAMA.reduce((a, s) => a + s.weight * s.expect, 0) / SAITAMA_W_TOTAL;
  ok('彩玉综合中奖率≈1/8', expect > 0.1 && expect < 0.16, expect.toFixed(4));
  ok('力度曲线含启动口区间', powerCurve.some((c) => c.outcome.startsWith('start')),
    powerCurve.filter((c) => c.outcome.startsWith('start')).map((c) => c.power.toFixed(2)).join(','));
  ok('力度曲线含普通入口区间', powerCurve.filter((c) => c.outcome.startsWith('pocket')).length >= 2,
    powerCurve.filter((c) => c.outcome.startsWith('pocket')).map((c) => c.power.toFixed(2)).join(','));
  ok('机器人在限时内跑完整局', res.games >= 1, `${res.games} 局 / ${sec} 秒模拟`);
  ok('能打出大当たり', res.jackpots >= 1, `${res.jackpots} 次`);
  ok('能进入祭道 Fever', res.fevers >= 1, `${res.fevers} 次`);
  ok('御神籤被正确发放', Object.keys(res.omi).length >= 1, JSON.stringify(res.omi));
  ok('首次大当たり ≤ 90 秒', res.firstJackpot > 0 && res.firstJackpot <= 90, res.firstJackpot + 's');
  ok('祭道出玉吞吐充足（単発 ≥8 鳥居，★は 12）', res.toriiMax >= 8, `最多 ${res.toriiMax} 回 · 三星局 ${res.games3}/${res.games}`);
  ok('球数经济不发散（残玉有界）', res.live.inventory < 400, `${res.live.inventory} 球 · ${JSON.stringify(res.samples.slice(0, 6))}`);
  ok('场上球数不超上限', (res.live.balls || 0) <= CFG.maxBallsFever, res.live.balls);
  ok('彩玉不超槽位', (res.live.reserve || 0) <= g.reserveMax, `${res.live.reserve}/${g.reserveMax}`);
  ok('球不越界', !g.balls.some((b) => b.x < 0 || b.x > LW || b.y < 0 || b.y > LH + 30), JSON.stringify(g.balls.map((b) => [Math.round(b.x), Math.round(b.y), b.dieWhy])));
  ok('分数不为负', g.score >= 0, g.score);
  ok('撞钉有回报', g.stats.pegs > 10, `${g.stats.pegs} 次`);

  const simPath = simulateShot(best);
  const liveTrace = traceLive(best);
  ok('现场轨迹与预演同结果', (liveTrace.outcome === 'drain') === (simPath.outcome === 'drain'),
    JSON.stringify({ at: +best.toFixed(2), sim: simPath.outcome, live: liveTrace.outcome, livePath: liveTrace.path.slice(0, 24) }));

  const fail = checks.filter((c) => !c.pass);
  const out = {
    pass: fail.length === 0, fail: fail.length, checks,
    stats: { games: res.games, games3: res.games3, jackpots: res.jackpots, fevers: res.fevers, omi: res.omi, super777: !!res.super777, bestScore: res.best, missionT: res.missionT },
    live: res.live, expectRate: +expect.toFixed(4), powerCurve: powerCurve.filter((c) => c.outcome !== 'drain').map((c) => `${c.power.toFixed(2)}:${c.outcome}`),
  };
  HEADLESS = false;
  useSeeded = false;
  return out;
}

function reportSelfTest(res) {
  const el = document.getElementById('testout');
  const boot = document.getElementById('boot');
  if (boot) boot.classList.add('gone');
  const lines = [res.pass ? 'PASS' : `FAIL x${res.fail}`];
  for (const c of res.checks) lines.push(`  ${c.pass ? 'ok  ' : 'FAIL'} ${c.name}${c.info ? '  →  ' + c.info : ''}`);
  lines.push('模拟 ' + res.live.t + 's · 局数 ' + res.stats.games + ' · 彩玉期望 ' + res.expectRate);
  lines.push('实时 ' + JSON.stringify(res.live));
  lines.push('力度区间 ' + JSON.stringify(res.powerCurve));
  if (el) { el.textContent = lines.join('\n'); el.style.display = 'block'; }
  document.title = (res.pass ? 'PASS' : 'FAIL') + ' koro-matsuri';
  window.__TEST = res;
  render();
}

/* ------------------------------------------------------------------ *
 * 22. 启动
 * ------------------------------------------------------------------ */

const SHOTS = ['title', 'play', 'draw', 'reach', 'jackpot', 'fever', 'matsuri', 'rush', 'omifuda', 'settle', 'settings'];

/** 截图模式：把状态机推到指定阶段，方便目检美术 */
function setupShot(name) {
  startGame();
  g.inventory = 40; g.score = 2400; g.multIdx = 1; g.comboCount = 3; g.comboT = 3;
  if (name === 'title') { g = newGame(); g.phase = 'title'; return; }
  pushReserve(225, 460); pushReserve(250, 460);
  g.reserve.forEach((r) => { r.t = 1.25; });
  if (name === 'draw') { openReserve(true); if (g.draw) g.draw.t = 0.4; }
  else if (name === 'reach') {
    g.reserve[0] = { s: SAITAMA[3], win: true, sup: false, symbols: ['7', '7', '7'], reachWant: true, t: 1.2, glow: 0 };
    openReserve(true); g.draw.reachT = 1.2; g.draw.t = 1.3;
  } else if (name === 'jackpot') { g.draw = null; startJackpot(true); g.fxT = 0.6; }
  else if (name === 'fever') { g.draw = null; g.feverSuper = true; startFever(); g.feverT = 9; g.feverHits = 4; g.feverPay = 16; }
  else if (name === 'matsuri') { g.draw = null; g.rush = true; g.chain = 3; g.matsuri = true; g.feverSuper = true; startFever(); g.feverT = 22; g.feverHits = 9; g.feverPay = 36; }
  else if (name === 'rush') { g.draw = null; g.rush = true; g.rushT = 18; g.inventory = 26; }
  else if (name === 'omifuda') { g.draw = null; offerOmifuda(); g.omiT = 2; }
  else if (name === 'settle') {
    g.draw = null; g.missions.score = true; g.missions.jackpot = true; g.jackpots = 2; g.score = 8600;
    g.feverHits = 12; g.stats.toriiMax = 12; g.stats.launches = 120; g.stats.pegs = 980; g.stats.pockets = 26; g.stats.starts = 14;
    settleNow('玉切れ');
  } else if (name === 'settings') { showSettings = true; }
  if (name === 'fever' || name === 'matsuri' || name === 'rush') applyShot(0.78);
  if (name === 'play' || name === 'draw' || name === 'reach') { applyShot(0.7); applyShot(0.55); }
  g.t += 2.4;
  for (const b of g.balls) { b.trail.push(b.x - 5, b.y + 7, b.x - 10, b.y + 15, b.x - 15, b.y + 23); }
  if (name !== 'title' && name !== 'settings') {
    burst(150, 300, 16, '#ffd24a', 'spark', 170);
    burst(300, 262, 10, '#8ef0b8', 'spark', 140);
    floater(225, 430, '+2球', '#8ef0b8', 13);
  }
}

function boot() {
  if (new URLSearchParams(location.search).has('fresh')) {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* 隐私模式忽略 */ }
  }
  loadSave();
  audio.setVolumes(save.settings.music, save.settings.sfx);
  resize();
  const bootEl = document.getElementById('boot');
  if (bootEl) bootEl.classList.add('gone');
  computePowerCurve();
  g = newGame();
  g.phase = 'title';

  const params = new URLSearchParams(location.search);
  const shot = params.get('shot');
  if (params.has('selftest')) {
    HEADLESS = true;
    const res = runSelfTest(parseInt(params.get('selftest') || '60', 10), parseInt(params.get('games') || '3', 10));
    reportSelfTest(res);
    return;
  }
  if (shot && SHOTS.includes(shot)) {
    setupShot(shot);
    FROZEN = true;             // 定格：只出帧不推进状态，方便无头截图目检
    requestAnimationFrame(frame);
    return;
  }
  if (params.has('autostart')) { startGame(); }

  requestAnimationFrame(frame);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

/* @@APPEND@@ */
})();
