'use strict';
/* =====================================================================
   水晶守卫 Crystal Ward v2 — Canvas 2D 塔防  全程序化绘制
   60 波 · 6 章节 · 3 地图 · 9 塔 · 指挥官技能 · 祝福 · 成就 · 三难度
   ===================================================================== */

/* ---------------- utils ---------------- */
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const hyp = (x, y) => Math.sqrt(x * x + y * y);
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rndG = mulberry32(20260918);           // 装饰等确定性随机
const R = (a, b) => a + rndG() * (b - a);
const RT = Math.random;                       // 运行期随机（战斗等）
const RR = (a, b) => a + RT() * (b - a);
const fmt = n => n >= 10000 ? (n / 1000).toFixed(1) + 'k' : String(Math.round(n));

/* ---------------- canvas ---------------- */
const W = 1280, H = 704, CELL = 32, COLS = 40, ROWS = 22;
const cvs = document.getElementById('game');
const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
cvs.width = W * dpr; cvs.height = H * dpr;
const ctx = cvs.getContext('2d');
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
ctx.imageSmoothingEnabled = true;

/* ---------------- audio ---------------- */
const SFX = {
  ac: null, master: null, muted: false, _noise: null,
  init() {
    if (this.ac) return;
    try {
      this.ac = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ac.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ac.destination);
      const len = this.ac.sampleRate * 0.6;
      const buf = this.ac.createBuffer(1, len, this.ac.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this._noise = buf;
    } catch (e) { this.ac = null; }
  },
  _t0() { return this.ac.currentTime; },
  _env(g, t0, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + dec);
  },
  tone(type, f0, f1, dur, peak, delay = 0) {
    if (!this.ac || this.muted) return;
    const t0 = this._t0() + delay;
    const o = this.ac.createOscillator(), g = this.ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    this._env(g, t0, 0.008, peak, dur);
    o.connect(g).connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.1);
  },
  noise(f, q, dur, peak, delay = 0) {
    if (!this.ac || this.muted) return;
    const t0 = this._t0() + delay;
    const s = this.ac.createBufferSource(); s.buffer = this._noise;
    const fl = this.ac.createBiquadFilter();
    fl.type = 'lowpass'; fl.frequency.setValueAtTime(f, t0); fl.Q.value = q;
    const g = this.ac.createGain();
    this._env(g, t0, 0.005, peak, dur);
    s.connect(fl).connect(g).connect(this.master);
    s.start(t0); s.stop(t0 + dur + 0.1);
  },
  shoot() { this.tone('square', 820, 240, 0.07, 0.026); this.noise(3000, 1, 0.04, 0.018); },
  thoom() { this.tone('sine', 140, 38, 0.34, 0.2); this.noise(260, 1.4, 0.32, 0.15); },
  zap() { this.tone('sawtooth', 1900, 180, 0.10, 0.04); this.noise(5200, 2, 0.06, 0.028); },
  prism() { this.tone('triangle', 520, 2200, 0.16, 0.045); this.tone('sine', 1600, 900, 0.2, 0.028, 0.03); },
  frost() { this.tone('triangle', 500, 1500, 0.22, 0.026); },
  freeze() { this.tone('sine', 1400, 600, 0.25, 0.05); this.noise(600, 1, 0.2, 0.03); },
  flame() { this.noise(900, 0.8, 0.12, 0.02); },
  spit() { this.tone('sine', 320, 180, 0.1, 0.03); this.noise(700, 1, 0.06, 0.02); },
  siege() { this.tone('square', 180, 90, 0.16, 0.07); this.noise(400, 1, 0.1, 0.05); },
  hit() { this.noise(1800, 1, 0.03, 0.014); },
  coin() { this.tone('sine', 1250, 1250, 0.05, 0.028); this.tone('sine', 1850, 1850, 0.07, 0.024, 0.05); },
  heal() { this.tone('sine', 660, 990, 0.16, 0.03); this.tone('sine', 880, 1180, 0.2, 0.024, 0.08); },
  leak() { this.tone('sawtooth', 220, 70, 0.34, 0.1); this.noise(160, 1, 0.3, 0.09); },
  horn() { this.tone('sawtooth', 110, 108, 0.5, 0.045); this.tone('sawtooth', 112, 110, 0.5, 0.045); this.tone('sawtooth', 165, 163, 0.5, 0.036, 0.02); },
  bossHorn() { [82, 82, 110, 98].forEach((f, i) => this.tone('sawtooth', f, f * 0.98, 0.42, 0.06, i * 0.16)); },
  ding() { this.tone('sine', 880, 880, 0.1, 0.04); this.tone('sine', 1320, 1320, 0.16, 0.03, 0.06); },
  place() { this.noise(400, 1, 0.1, 0.07); this.tone('sine', 660, 990, 0.12, 0.038, 0.05); },
  ui() { this.tone('square', 440, 440, 0.02, 0.013); },
  sell() { this.tone('sine', 990, 500, 0.14, 0.038); },
  boon() { this.tone('sine', 523, 523, 0.14, 0.04); this.tone('sine', 784, 784, 0.18, 0.035, 0.09); this.tone('sine', 1047, 1047, 0.22, 0.03, 0.18); },
  ach() { this.tone('triangle', 1047, 1047, 0.1, 0.04); this.tone('triangle', 1568, 1568, 0.16, 0.03, 0.08); },
  meteor() { this.tone('sawtooth', 700, 60, 0.5, 0.09); this.noise(220, 1.5, 0.45, 0.12, 0.1); },
  blizzard() { this.noise(2400, 0.7, 0.7, 0.08); this.tone('sine', 2000, 900, 0.6, 0.03); },
  mend() { [523, 659, 784].forEach((f, i) => this.tone('sine', f, f, 0.3, 0.04, i * 0.1)); },
  win() { [523, 659, 784, 1047].forEach((f, i) => this.tone('triangle', f, f, 0.4, 0.055, i * 0.14)); },
  lose() { [392, 349, 311, 233].forEach((f, i) => this.tone('sawtooth', f, f * 0.97, 0.4, 0.045, i * 0.18)); },
};

/* ---------------- maps ---------------- */
const MAPS = [
  {
    name: '翠绿秘径', kind: 'forest',
    wp: [[-2, 3], [33, 3], [33, 9], [6, 9], [6, 15], [38, 15]],
    sky: ['#2e4f28', '#27421f', '#1f361b'],
    blob: ['rgba(70,110,50,.10)', 'rgba(15,35,12,.13)'],
    road: ['rgba(10,16,8,.5)', '#463a27', '#5d4e35', '#6f5d40'],
    cobble: ['rgba(130,112,80,.5)', 'rgba(30,24,14,.22)', 'rgba(160,140,100,.25)'],
    firefly: ['rgba(255,232,120,', 'rgba(150,230,255,'],
  },
  {
    name: '黄沙遗迹', kind: 'desert',
    wp: [[20, -2], [20, 7], [6, 7], [6, 18], [33, 18], [33, 11], [37, 11]],
    sky: ['#b08d55', '#a37f4b', '#8a6a42'],
    blob: ['rgba(230,200,140,.10)', 'rgba(90,60,25,.12)'],
    road: ['rgba(60,40,15,.4)', '#7a6035', '#8d7448', '#a08654'],
    cobble: ['rgba(255,240,200,.35)', 'rgba(60,40,20,.2)', 'rgba(120,100,70,.3)'],
    firefly: ['rgba(255,210,120,', 'rgba(255,170,90,'],
  },
  {
    name: '极寒回廊', kind: 'snow',
    wp: [[-2, 4], [10, 4], [10, 17], [20, 17], [20, 4], [30, 4], [30, 17], [38, 17]],
    sky: ['#aebfd4', '#98abc4', '#8196b2'],
    blob: ['rgba(255,255,255,.13)', 'rgba(80,110,150,.10)'],
    road: ['rgba(40,60,90,.4)', '#61728c', '#73859f', '#8496b0'],
    cobble: ['rgba(230,245,255,.5)', 'rgba(40,60,90,.2)', 'rgba(160,190,220,.35)'],
    firefly: ['rgba(210,240,255,', 'rgba(180,255,230,'],
  },
];

/* 折点 → 圆角平滑折线：走线与道路绘制共用唯一数据源（修"怪不压线"） */
function smoothWaypoints(wp, radius) {
  const pts = [{ x: wp[0][0] * CELL + 16, y: wp[0][1] * CELL + 16 }];
  for (let i = 1; i < wp.length - 1; i++) {
    const b = { x: wp[i - 1][0] * CELL + 16, y: wp[i - 1][1] * CELL + 16 };
    const a = { x: wp[i][0] * CELL + 16, y: wp[i][1] * CELL + 16 };
    const c = { x: wp[i + 1][0] * CELL + 16, y: wp[i + 1][1] * CELL + 16 };
    const d1 = hyp(a.x - b.x, a.y - b.y), d2 = hyp(c.x - a.x, c.y - a.y);
    const r = Math.min(radius, d1 / 2, d2 / 2);
    const s = { x: a.x + (b.x - a.x) / d1 * r, y: a.y + (b.y - a.y) / d1 * r };
    const e = { x: a.x + (c.x - a.x) / d2 * r, y: a.y + (c.y - a.y) / d2 * r };
    pts.push(s);
    for (let k = 1; k < 8; k++) {
      const t = k / 8;
      pts.push({
        x: lerp(lerp(s.x, a.x, t), lerp(a.x, e.x, t), t),
        y: lerp(lerp(s.y, a.y, t), lerp(a.y, e.y, t), t),
      });
    }
    pts.push(e);
  }
  pts.push({ x: wp[wp.length - 1][0] * CELL + 16, y: wp[wp.length - 1][1] * CELL + 16 });
  return pts;
}
function distToPts(x, y, segs) {
  let best = 1e9;
  for (const s of segs) {
    const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y;
    let t = ((x - s.a.x) * dx + (y - s.a.y) * dy) / (s.len * s.len);
    t = clamp(t, 0, 1);
    const px = s.a.x + dx * t, py = s.a.y + dy * t;
    const d2 = (x - px) * (x - px) + (y - py) * (y - py);
    if (d2 < best) best = d2;
  }
  return Math.sqrt(best);
}

let MAP = null;
let blocked = new Set();
const cellKey = (c, r) => c + ',' + r;

function loadMap(idx) {
  const def = MAPS[idx];
  const pts = smoothWaypoints(def.wp, 30);
  const segs = [];
  let len = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const l = hyp(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    segs.push({ a: pts[i], b: pts[i + 1], len: l, acc: len });
    len += l;
  }
  blocked = new Set();
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const x = c * CELL + 16, y = r * CELL + 16;
    if (distToPts(x, y, segs) < 31) blocked.add(cellKey(c, r));
  }
  const CORE = pts[pts.length - 1];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const x = c * CELL + 16, y = r * CELL + 16;
    if (hyp(x - CORE.x, y - CORE.y) < 74) blocked.add(cellKey(c, r));
    if (hyp(x - pts[0].x, y - pts[0].y) < 62) blocked.add(cellKey(c, r));
  }
  const flen = hyp(CORE.x - pts[0].x, CORE.y - pts[0].y);
  const fsegs = [{ a: pts[0], b: CORE, len: flen || 1, acc: 0 }];
  MAP = { idx, def, pts, segs, len, CORE, FLY: { segs: fsegs, len: flen || 1 }, decor: null, bg: null };
  MAP.decor = genDecor(idx, def.kind);
  MAP.bg = buildBackground(MAP);
  return MAP;
}
function posAt(d) {
  d = clamp(d, 0, MAP.len);
  for (const s of MAP.segs) {
    if (d <= s.acc + s.len) {
      const t = (d - s.acc) / s.len;
      return { x: lerp(s.a.x, s.b.x, t), y: lerp(s.a.y, s.b.y, t) };
    }
  }
  return { x: MAP.CORE.x, y: MAP.CORE.y };
}

/* ---------------- decorations ---------------- */
function genDecor(idx, kind) {
  const d = { trees: [], rocks: [], bushes: [], flowers: [], shards: [], pillars: [], bones: [] };
  const seed = mulberry32(777 + idx * 101);
  const all = () => [...d.trees, ...d.rocks, ...d.bushes, ...d.pillars];
  const pick = (list, gap) => {
    for (let tries = 0; tries < 60; tries++) {
      const c = 1 + Math.floor(seed() * (COLS - 2)), r = Math.floor(seed() * ROWS);
      const x = c * CELL + 16, y = r * CELL + 16;
      if (blocked.has(cellKey(c, r))) continue;
      if (hyp(x - MAP.CORE.x, y - MAP.CORE.y) < 110) continue;
      let ok = true;
      for (const g of all()) if (hyp(g.x - x, g.y - y) < gap) { ok = false; break; }
      if (!ok) continue;
      for (let rr2 = r - 1; rr2 <= r + 1; rr2++) blocked.add(cellKey(c, rr2));
      list.push({ x: x + R(-6, 6), y: y + R(-6, 6), rot: seed() * TAU, s: 0.85 + seed() * 0.4 });
      return;
    }
  };
  const nTrees = kind === 'snow' ? 18 : kind === 'desert' ? 10 : 24;
  for (let i = 0; i < nTrees; i++) pick(d.trees, 64);
  for (let i = 0; i < 12; i++) pick(d.rocks, 60);
  for (let i = 0; i < (kind === 'desert' ? 8 : 16); i++) pick(d.bushes, 54);
  if (kind === 'desert') {
    for (let i = 0; i < 6; i++) pick(d.pillars, 74);
    for (let i = 0; i < 70; i++) {
      const x = R(8, W - 8), y = R(8, H - 8);
      if (distToPts(x, y, MAP.segs) > 34) d.bones.push({ x, y, rot: R(0, TAU), s: R(0.6, 1.1) });
    }
  }
  if (kind === 'forest') {
    for (let i = 0; i < 90; i++) {
      const x = R(8, W - 8), y = R(8, H - 8);
      const dd = distToPts(x, y, MAP.segs);
      if (dd > 32 && dd < 40 + R(0, 200)) d.flowers.push({ x, y, hue: R(0, 360), s: R(0.6, 1.3) });
    }
  }
  if (kind === 'snow') {
    for (let i = 0; i < 40; i++) {
      const x = R(8, W - 8), y = R(8, H - 8);
      if (distToPts(x, y, MAP.segs) > 34) d.flowers.push({ x, y, hue: 190 + R(-14, 14), s: R(0.5, 1) });
    }
  }
  for (let i = 0; i < 10; i++) {
    const a = R(0, TAU), rr = R(60, 130);
    d.shards.push({ x: MAP.CORE.x + Math.cos(a) * rr, y: MAP.CORE.y + Math.sin(a) * rr * 0.8, rot: a, s: R(0.7, 1.3) });
  }
  return d;
}

/* ---------------- background prerender ---------------- */
function buildBackground(m) {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  const P = m.def;
  const gr = c.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, P.sky[0]); gr.addColorStop(0.5, P.sky[1]); gr.addColorStop(1, P.sky[2]);
  c.fillStyle = gr; c.fillRect(0, 0, W, H);
  const rs = mulberry32(4242 + m.idx * 77);
  for (let i = 0; i < 60; i++) {
    const x = rs() * W, y = rs() * H, r = 40 + rs() * 130;
    c.fillStyle = rs() > 0.5 ? P.blob[0] : P.blob[1];
    c.beginPath(); c.ellipse(x, y, r, r * (0.4 + rs() * 0.5), rs() * TAU, 0, TAU); c.fill();
  }
  for (let i = 0; i < 2600; i++) {
    const x = rs() * W, y = rs() * H;
    c.fillStyle = P.kind === 'snow' ? (rs() > 0.5 ? 'rgba(255,255,255,.10)' : 'rgba(90,120,160,.08)')
      : P.kind === 'desert' ? (rs() > 0.5 ? 'rgba(255,240,190,.08)' : 'rgba(80,50,20,.08)')
      : (rs() > 0.5 ? 'rgba(255,255,220,.045)' : 'rgba(0,20,0,.07)');
    c.fillRect(x, y, 1.6, 1.6);
  }
  const stroke = (w, col) => {
    c.strokeStyle = col; c.lineWidth = w; c.lineJoin = 'round'; c.lineCap = 'round';
    c.beginPath(); c.moveTo(m.pts[0].x, m.pts[0].y);
    for (let i = 1; i < m.pts.length; i++) c.lineTo(m.pts[i].x, m.pts[i].y);
    c.stroke();
  };
  stroke(56, P.road[0]); stroke(48, P.road[1]); stroke(40, P.road[2]); stroke(30, P.road[3]);
  for (let dd = 10; dd < m.len - 20; dd += 17) {
    const p = posAtCached(m, dd), p2 = posAtCached(m, dd + 1);
    const ang = Math.atan2(p2.y - p.y, p2.x - p.x);
    const ox = rs() - 0.5;
    const px = p.x + Math.cos(ang + Math.PI / 2) * ox * 24;
    const py = p.y + Math.sin(ang + Math.PI / 2) * ox * 24;
    c.save(); c.translate(px, py); c.rotate(ang + rs() * 0.6);
    const n = rs();
    c.fillStyle = n > 0.7 ? P.cobble[0] : n > 0.35 ? P.cobble[1] : P.cobble[2];
    c.beginPath(); c.ellipse(0, 0, 4 + rs() * 4, 2.6 + rs() * 2.4, 0, 0, TAU); c.fill();
    c.restore();
  }
  // 花朵 / 冰晶 / 骨骸
  for (const f of m.decor.flowers) {
    if (P.kind === 'forest') {
      c.fillStyle = `hsla(${f.hue},70%,72%,.85)`;
      for (let k = 0; k < 4; k++) {
        const a = k / 4 * TAU + f.x;
        c.beginPath(); c.arc(f.x + Math.cos(a) * 2.4 * f.s, f.y + Math.sin(a) * 2.4 * f.s, 1.5 * f.s, 0, TAU); c.fill();
      }
      c.fillStyle = 'rgba(255,240,150,.9)';
      c.beginPath(); c.arc(f.x, f.y, 1.1 * f.s, 0, TAU); c.fill();
    } else {
      c.fillStyle = `hsla(${f.hue},60%,90%,.6)`;
      c.save(); c.translate(f.x, f.y); c.rotate(f.hue);
      c.fillRect(-3 * f.s, -0.6, 6 * f.s, 1.2); c.fillRect(-0.6, -3 * f.s, 1.2, 6 * f.s);
      c.restore();
    }
  }
  for (const b of m.decor.bones) {
    c.save(); c.translate(b.x, b.y); c.rotate(b.rot); c.globalAlpha = 0.55;
    c.fillStyle = '#e8e0c8';
    c.fillRect(-4 * b.s, -1, 8 * b.s, 2);
    c.beginPath(); c.arc(-4 * b.s, 0, 1.6, 0, TAU); c.arc(4 * b.s, 0, 1.6, 0, TAU); c.fill();
    c.restore();
  }
  // 灌木
  for (const b of m.decor.bushes) {
    c.fillStyle = 'rgba(0,0,0,.25)';
    c.beginPath(); c.ellipse(b.x, b.y + 7 * b.s, 11 * b.s, 4 * b.s, 0, 0, TAU); c.fill();
    const cols = P.kind === 'snow' ? ['#b9cfe0', '#c9dde9', '#ddeaf2'] : P.kind === 'desert' ? ['#8a8a4a', '#98975a', '#a8a86a'] : ['#2c5225', '#37632c', '#4a7a38'];
    for (const [dx, dy, r, col] of [[-6, 0, 8, cols[0]], [6, 1, 7, cols[0]], [0, -5, 9, cols[1]], [1, -7, 5, cols[2]]]) {
      c.fillStyle = col;
      c.beginPath(); c.arc(b.x + dx * b.s, b.y + dy * b.s, r * b.s, 0, TAU); c.fill();
    }
  }
  // 岩石
  for (const rk of m.decor.rocks) {
    c.fillStyle = 'rgba(0,0,0,.3)';
    c.beginPath(); c.ellipse(rk.x, rk.y + 8 * rk.s, 13 * rk.s, 5 * rk.s, 0, 0, TAU); c.fill();
    c.save(); c.translate(rk.x, rk.y); c.rotate(rk.rot * 0.2);
    const rockCol = P.kind === 'snow' ? '#9fb2c8' : P.kind === 'desert' ? '#a58a5e' : '#6a737d';
    const pts = [[-10, 4], [-7, -6], [0, -10], [8, -6], [11, 4]];
    c.fillStyle = rockCol;
    c.beginPath(); c.moveTo(pts[0][0] * rk.s, pts[0][1] * rk.s);
    for (const p of pts) c.lineTo(p[0] * rk.s, p[1] * rk.s);
    c.closePath(); c.fill();
    c.fillStyle = 'rgba(255,255,255,.14)';
    c.beginPath(); c.moveTo(-7 * rk.s, -6 * rk.s); c.lineTo(0, -10 * rk.s); c.lineTo(8 * rk.s, -6 * rk.s); c.lineTo(0, -4 * rk.s); c.closePath(); c.fill();
    c.restore();
  }
  // 树（森林阔叶+针叶 / 沙漠仙人掌 / 雪原雪松）
  for (const tr of m.decor.trees) {
    c.fillStyle = 'rgba(0,0,0,.32)';
    c.beginPath(); c.ellipse(tr.x + 5, tr.y + 12 * tr.s, 16 * tr.s, 6 * tr.s, 0, 0, TAU); c.fill();
    if (P.kind === 'desert') {
      c.fillStyle = '#4c7a3d';
      c.fillRect(tr.x - 3 * tr.s, tr.y - 26 * tr.s, 6 * tr.s, 34 * tr.s);
      c.fillRect(tr.x - 12 * tr.s, tr.y - 16 * tr.s, 5 * tr.s, 12 * tr.s);
      c.fillRect(tr.x - 12 * tr.s, tr.y - 16 * tr.s, 10 * tr.s, 4.4 * tr.s);
      c.fillRect(tr.x + 7 * tr.s, tr.y - 22 * tr.s, 5 * tr.s, 12 * tr.s);
      c.fillRect(tr.x + 2 * tr.s, tr.y - 22 * tr.s, 10 * tr.s, 4.4 * tr.s);
      c.fillStyle = 'rgba(255,255,255,.16)';
      c.fillRect(tr.x - 3 * tr.s, tr.y - 26 * tr.s, 2 * tr.s, 34 * tr.s);
      continue;
    }
    c.fillStyle = P.kind === 'snow' ? '#4a3a2c' : '#4a3521';
    c.fillRect(tr.x - 2.6 * tr.s, tr.y - 4 * tr.s, 5.2 * tr.s, 16 * tr.s);
    if (P.kind === 'snow') {
      for (const [dy, w, col] of [[-14, 15, '#2c4f5e'], [-24, 12, '#35606e'], [-33, 8.5, '#40717d']]) {
        c.fillStyle = col;
        c.beginPath();
        c.moveTo(tr.x, tr.y + (dy - 13) * tr.s);
        c.lineTo(tr.x - w * tr.s, tr.y + dy * tr.s);
        c.lineTo(tr.x + w * tr.s, tr.y + dy * tr.s);
        c.closePath(); c.fill();
      }
      c.fillStyle = 'rgba(255,255,255,.75)';
      for (const [dy, w] of [[-15, 13], [-24.5, 10], [-33, 7]]) {
        c.beginPath();
        c.moveTo(tr.x, tr.y + (dy - 11) * tr.s);
        c.lineTo(tr.x - w * tr.s, tr.y + dy * tr.s);
        c.lineTo(tr.x + w * tr.s, tr.y + dy * tr.s);
        c.closePath(); c.fill();
      }
    } else {
      const pine = tr.s > 1.06;
      if (pine) {
        for (const [dy, w, col] of [[-14, 15, '#27501f'], [-24, 12, '#2f5f26'], [-33, 8.5, '#3a7230']]) {
          c.fillStyle = col;
          c.beginPath();
          c.moveTo(tr.x, tr.y + (dy - 13) * tr.s);
          c.lineTo(tr.x - w * tr.s, tr.y + dy * tr.s);
          c.lineTo(tr.x + w * tr.s, tr.y + dy * tr.s);
          c.closePath(); c.fill();
        }
        c.fillStyle = 'rgba(160,220,140,.16)';
        c.beginPath(); c.moveTo(tr.x, tr.y - 46 * tr.s); c.lineTo(tr.x - 6 * tr.s, tr.y - 30 * tr.s); c.lineTo(tr.x + 2 * tr.s, tr.y - 30 * tr.s); c.closePath(); c.fill();
      } else {
        for (const [dx, dy, r, col] of [[-8, -8, 10, '#294d21'], [8, -7, 9, '#294d21'], [0, -14, 11, '#326028'], [-4, -18, 7, '#3e7432'], [6, -16, 6, '#3e7432']]) {
          c.fillStyle = col;
          c.beginPath(); c.arc(tr.x + dx * tr.s, tr.y + dy * tr.s, r * tr.s, 0, TAU); c.fill();
        }
        c.fillStyle = 'rgba(170,230,150,.2)';
        c.beginPath(); c.arc(tr.x - 4 * tr.s, tr.y - 20 * tr.s, 4.5 * tr.s, 0, TAU); c.fill();
      }
    }
  }
  // 遗迹石柱（沙漠）
  for (const pl of m.decor.pillars) {
    c.fillStyle = 'rgba(0,0,0,.3)';
    c.beginPath(); c.ellipse(pl.x + 4, pl.y + 16 * pl.s, 12 * pl.s, 5 * pl.s, 0, 0, TAU); c.fill();
    c.fillStyle = '#b7a98c';
    c.fillRect(pl.x - 6 * pl.s, pl.y - 34 * pl.s, 12 * pl.s, 50 * pl.s);
    c.fillStyle = '#a08f70';
    for (let i = 0; i < 4; i++) c.fillRect(pl.x - 6 * pl.s, pl.y + (-30 + i * 12) * pl.s, 12 * pl.s, 1.6 * pl.s);
    c.fillStyle = '#cfc0a2';
    c.fillRect(pl.x - 8 * pl.s, pl.y - 40 * pl.s, 16 * pl.s, 6 * pl.s);
    c.fillStyle = 'rgba(60,40,20,.35)';
    c.beginPath(); c.moveTo(pl.x + 2, pl.y - 34 * pl.s); c.lineTo(pl.x + 6 * pl.s, pl.y - 20 * pl.s); c.lineTo(pl.x + 6 * pl.s, pl.y - 34 * pl.s); c.fill();
  }
  for (const sh of m.decor.shards) {
    c.save(); c.translate(sh.x, sh.y); c.rotate(sh.rot);
    c.fillStyle = 'rgba(127,231,255,.5)';
    c.beginPath(); c.moveTo(0, -10 * sh.s); c.lineTo(4 * sh.s, 0); c.lineTo(0, 8 * sh.s); c.lineTo(-4 * sh.s, 0); c.closePath(); c.fill();
    c.restore();
  }
  return cv;
}
function posAtCached(m, d) {
  d = clamp(d, 0, m.len);
  for (const s of m.segs) {
    if (d <= s.acc + s.len) {
      const t = (d - s.acc) / s.len;
      return { x: lerp(s.a.x, s.b.x, t), y: lerp(s.a.y, s.b.y, t) };
    }
  }
  return { x: m.CORE.x, y: m.CORE.y };
}

/* ---------------- glow sprites ---------------- */
const glowCache = new Map();
function glowSprite(color, size) {
  const full = color.endsWith(',') ? color + '1)' : color;
  const key = full + '|' + size;
  let cv = glowCache.get(key);
  if (cv) return cv;
  cv = document.createElement('canvas');
  cv.width = cv.height = size * 2;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(size, size, 0, size, size, size);
  grad.addColorStop(0, full);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size * 2, size * 2);
  glowCache.set(key, cv);
  return cv;
}
function drawGlow(c, color, x, y, size, alpha) {
  const sp = glowSprite(color, size);
  c.save(); c.globalAlpha = alpha; c.globalCompositeOperation = 'lighter';
  c.drawImage(sp, x - size, y - size); c.restore();
}

/* ---------------- enemy defs ---------------- */
const ENEMY = {
  goblin: { name: '哥布林', hp: 62, spd: 56, armor: 0, mr: 0, gold: 7, leak: 1, r: 10, body: '#79c04f' },
  wolf: { name: '森林狼', hp: 52, spd: 88, armor: 0, mr: 0, gold: 8, leak: 1, r: 10, body: '#8f8a86' },
  runner: { name: '疾足奔行者', hp: 78, spd: 120, armor: 0, mr: 0, gold: 9, leak: 1, r: 9, body: '#d9e355', fast: 1 },
  orc: { name: '兽人', hp: 170, spd: 40, armor: 3, mr: 0, gold: 12, leak: 1, r: 13, body: '#8aa458' },
  beast: { name: '岩背戈伦', hp: 1350, spd: 20, armor: 6, mr: 2, gold: 46, leak: 2, r: 17, body: '#9c5a33', beef: 1, freezeRes: 0.6 },
  bat: { name: '石像蝠', hp: 55, spd: 82, armor: 0, mr: 2, gold: 9, leak: 1, r: 10, fly: true, body: '#9b6bd6' },
  sprite: { name: '疾风精灵', hp: 88, spd: 102, armor: 0, mr: 4, gold: 10, leak: 1, r: 8, fly: true, body: '#9fe3ff', fast: 1 },
  wraith: { name: '怨灵', hp: 140, spd: 54, armor: 0, mr: 8, gold: 14, leak: 1, r: 11, fly: true, body: '#a8e6ff' },
  shaman: { name: '兽血祭司', hp: 110, spd: 44, armor: 0, mr: 6, gold: 18, leak: 1, r: 11, body: '#c76fb0', healer: true },
  shield: { name: '持盾武士', hp: 330, spd: 36, armor: 4, mr: 0, gold: 22, leak: 1, r: 13, body: '#9d8f77', physRes: 0.5 },
  knight: { name: '黑铠骑士', hp: 500, spd: 33, armor: 22, mr: 0, gold: 40, leak: 2, r: 13, body: '#5f6875', magicVuln: 1.4 },
  warder: { name: '缚魂破法者', hp: 470, spd: 36, armor: 7, mr: 12, gold: 42, leak: 2, r: 12, body: '#7a4fae', magicRes: 0.8 },
  bomber: { name: '自爆甲虫', hp: 110, spd: 74, armor: 0, mr: 0, gold: 11, leak: 1, r: 9, body: '#e2703a', boom: { r: 96, t: 1.5 } },
  drummer: { name: '战鼓督军', hp: 600, spd: 29, armor: 8, mr: 6, gold: 44, leak: 2, r: 13, body: '#b0483a', aura: { r: 120, spd: 1.22 } },
  splitter: { name: '腐泥怪', hp: 300, spd: 40, armor: 2, mr: 2, gold: 20, leak: 1, r: 14, body: '#6f8f4a', split: { type: 'slime', n: 3 } },
  slime: { name: '泥块', hp: 70, spd: 62, armor: 0, mr: 0, gold: 3, leak: 1, r: 8, body: '#84a95c', fromSplit: true },
  zealot: { name: '狂信徒', hp: 320, spd: 42, armor: 3, mr: 4, gold: 20, leak: 1, r: 12, body: '#c2564a', zealot: true },
  shade: { name: '潜影行者', hp: 290, spd: 55, armor: 4, mr: 6, gold: 26, leak: 1, r: 10, body: '#465a7e', phase: { on: 1.6, off: 3.2 } },
  golem: { name: '岩石魔像', hp: 540, spd: 25, armor: 9, mr: 2, gold: 34, leak: 2, r: 16, body: '#8d97a3' },
  siege: { name: '撼地攻城兽', hp: 1050, spd: 23, armor: 14, mr: 6, gold: 60, leak: 3, r: 16, body: '#8a6f4a', siege: { cd: 5.5, range: 190, t: 2.2 } },
  assassin: { name: '暗影刺客', hp: 460, spd: 76, armor: 4, mr: 6, gold: 30, leak: 2, r: 11, body: '#4a4560' },
  golemShard: { name: '巨像碎片', hp: 260, spd: 30, armor: 8, mr: 2, gold: 18, leak: 1, r: 12, body: '#9fb0be', fromSplit: true },
  shadowLing: { name: '魔王残影', hp: 380, spd: 52, armor: 6, mr: 8, gold: 26, leak: 1, r: 11, body: '#8a3a5e', fromSplit: true },
};
const BOSSES = [
  { name: '兽人督军', hp: 1900, spd: 22, armor: 8, mr: 4, gold: 170, leak: 4, r: 22, body: '#b06a3a', gimmick: 'rage' },
  { name: '双头巨魔', hp: 3400, spd: 18, armor: 9, mr: 4, gold: 230, leak: 5, r: 24, body: '#7fa063', gimmick: 'regen' },
  { name: '冰霜巨人', hp: 4400, spd: 17, armor: 10, mr: 8, gold: 300, leak: 5, r: 24, body: '#6fc3e8', gimmick: 'nova' },
  { name: '影刃魔王', hp: 3300, hpMul: 0.35, spd: 15, armor: 5, mr: 10, gold: 360, leak: 5, r: 22, body: '#7a5fb0', fly: true, gimmick: 'blink' },
  { name: '岩石巨像', hp: 6800, spd: 16, armor: 14, mr: 2, gold: 440, leak: 6, r: 27, body: '#93a0ad', gimmick: 'split50', split: { type: 'golemShard', n: 4 } },
  { name: '魔王巴尔·完全体', hp: 9200, spd: 17, armor: 13, mr: 12, gold: 640, leak: 8, r: 27, body: '#d0453a', gimmick: 'final' },
];
const AFFIXES = {
  berserk: { name: '狂暴', spd: 1.28, armor: 0, hpMul: 1, ring: 'rgba(255,90,70,' },
  hard: { name: '硬化', spd: 1, armor: 10, hpMul: 1, ring: 'rgba(190,200,210,' },
  gale: { name: '疾风', spd: 1.35, armor: 0, hpMul: 0.7, ring: 'rgba(130,230,255,' },
};

/* ---------------- tower defs（4 级） ---------------- */
const TOWERS = {
  arrow: {
    name: '劲弩塔', cost: 70, kind: 'phys', color: '#e8c268', hot: '1', ch: 1,
    tag: '单体速射 · 物理', desc: '四级解锁连发，清杂之王',
    tiers: [
      { dmg: 17, cd: 0.62, range: 112, up: 55 },
      { dmg: 31, cd: 0.54, range: 124, up: 110 },
      { dmg: 53, cd: 0.46, range: 138, up: 200 },
      { dmg: 82, cd: 0.40, range: 150, twin: 1 },
    ],
  },
  frost: {
    name: '霜语塔', cost: 90, kind: 'magic', color: '#7fe7ff', hot: '2', ch: 1,
    tag: '群体减速 · 魔法', desc: '霜环减速全体，生存之本；四级冻结',
    tiers: [
      { dmg: 9, cd: 1.1, range: 86, slow: 0.45, sdur: 1.6, up: 70 },
      { dmg: 17, cd: 1.0, range: 96, slow: 0.53, sdur: 1.8, up: 140 },
      { dmg: 28, cd: 0.9, range: 106, slow: 0.60, sdur: 2.0, up: 250 },
      { dmg: 42, cd: 0.8, range: 116, slow: 0.68, sdur: 2.2, freeze: 0.18 },
    ],
  },
  cannon: {
    name: '轰击塔', cost: 110, kind: 'phys', color: '#f09a5a', hot: '3', ch: 1,
    tag: '范围轰炸 · 仅地面', desc: '炮弹溅射；四级震荡眩晕',
    tiers: [
      { dmg: 44, cd: 1.65, range: 122, splash: 46, up: 90 },
      { dmg: 84, cd: 1.55, range: 134, splash: 56, up: 170 },
      { dmg: 148, cd: 1.42, range: 146, splash: 68, up: 300 },
      { dmg: 235, cd: 1.32, range: 158, splash: 84, stun: 0.35 },
    ],
  },
  arc: {
    name: '弧光塔', cost: 130, kind: 'magic', color: '#ffe066', hot: '4', ch: 2,
    tag: '连锁闪电 · 魔法', desc: '闪电跳跃敌群，越多越强',
    tiers: [
      { dmg: 24, cd: 0.9, range: 106, chain: 2, up: 100 },
      { dmg: 44, cd: 0.82, range: 116, chain: 3, up: 190 },
      { dmg: 74, cd: 0.74, range: 126, chain: 4, up: 330 },
      { dmg: 112, cd: 0.68, range: 136, chain: 6 },
    ],
  },
  poison: {
    name: '腐毒塔', cost: 120, kind: 'magic', color: '#9be06f', hot: '5', ch: 2,
    tag: '叠毒 DoT · 魔法', desc: '毒液最多叠 8 层；对首领仅 35%',
    tiers: [
      { dmg: 15, cd: 1.15, range: 96, up: 95 },
      { dmg: 27, cd: 1.08, range: 104, up: 180 },
      { dmg: 46, cd: 1.0, range: 112, up: 310 },
      { dmg: 72, cd: 0.92, range: 122, cap: 10 },
    ],
  },
  prism: {
    name: '棱镜塔', cost: 160, kind: 'magic', color: '#d9a4ff', hot: '6', ch: 3,
    tag: '超远狙击 · 魔法', desc: '重击专杀重甲；四级折射分裂',
    tiers: [
      { dmg: 100, cd: 2.2, range: 195, up: 130 },
      { dmg: 178, cd: 2.05, range: 215, up: 240 },
      { dmg: 305, cd: 1.9, range: 235, up: 420 },
      { dmg: 465, cd: 1.75, range: 260, fork: 1 },
    ],
  },
  flame: {
    name: '燃烬塔', cost: 140, kind: 'magic', color: '#ff8a50', hot: '7', ch: 3,
    tag: '扇形灼烧 · 魔法', desc: '持续喷吐克制密集群；四级留灼烧',
    tiers: [
      { dmg: 27, cd: 0.12, range: 92, cone: 1, up: 110 },
      { dmg: 46, cd: 0.12, range: 100, cone: 1, up: 200 },
      { dmg: 72, cd: 0.12, range: 108, cone: 1, up: 350 },
      { dmg: 108, cd: 0.12, range: 118, cone: 1, burn: 0.6 },
    ],
  },
  siege: {
    name: '破城塔', cost: 180, kind: 'phys', color: '#c9b8a0', hot: '8', ch: 4,
    tag: '穿甲重炮 · 仅地面', desc: '无视 60% 护甲，对首领 +50%',
    tiers: [
      { dmg: 145, cd: 2.8, range: 230, pierce: 0.6, bossMul: 1.5, up: 150, ground: 1 },
      { dmg: 250, cd: 2.7, range: 255, pierce: 0.6, bossMul: 1.5, up: 260, ground: 1 },
      { dmg: 390, cd: 2.6, range: 280, pierce: 0.6, bossMul: 1.5, up: 450, ground: 1 },
      { dmg: 610, cd: 2.5, range: 310, pierce: 0.7, bossMul: 1.6, ground: 1 },
    ],
  },
  banner: {
    name: '军旗祭坛', cost: 150, kind: 'none', color: '#ffd76e', hot: '9', ch: 5,
    tag: '光环增益 · 支援', desc: '塔伤 +12~32%；四级再 +12% 攻速',
    tiers: [
      { dmg: 0, cd: 1, range: 96, aura: 0.12, up: 120 },
      { dmg: 0, cd: 1, range: 104, aura: 0.18, up: 220 },
      { dmg: 0, cd: 1, range: 112, aura: 0.24, up: 380 },
      { dmg: 0, cd: 1, range: 120, aura: 0.32, haste: 0.12 },
    ],
  },
};
const TOWER_ORDER = ['arrow', 'frost', 'cannon', 'arc', 'poison', 'prism', 'flame', 'siege', 'banner'];

/* ---------------- spells / boons / chapters / diffs ---------------- */
const SPELLS = {
  meteor: { name: '陨石术', key: 'Q', cd: 40, rgb: '255,140,60', icon: '☄', desc: '轰击指定区域' },
  blizzard: { name: '暴雪', key: 'W', cd: 60, rgb: '150,220,255', icon: '❄', desc: '冻结全屏敌人 1.8s' },
  mend: { name: '圣所急救', key: 'E', cd: 100, rgb: '160,255,170', icon: '✚', desc: '恢复 2 点生命' },
};
const SPELL_ORDER = ['meteor', 'blizzard', 'mend'];
const BOONS = [
  { id: 'dmg8', name: '战争动员', desc: '全体塔伤害 +8%', color: '#ff9a76' },
  { id: 'gold12', name: '战场税收', desc: '击杀赏金 +12%', color: '#ffd873' },
  { id: 'range7', name: '视野强化', desc: '全体塔射程 +7%', color: '#8fd2ff' },
  { id: 'slow6', name: '大地凝滞', desc: '敌人移速 -6%', color: '#a8e6ff' },
  { id: 'crit', name: '致命精准', desc: '8% 概率暴击 ×2', color: '#ff7a6b' },
  { id: 'boss15', name: '屠魔宣言', desc: '对首领伤害 +15%', color: '#d9a4ff' },
  { id: 'air20', name: '对空火力', desc: '对空中伤害 +20%', color: '#b7d3ff' },
  { id: 'ground12', name: '碾压大地', desc: '对地面伤害 +12%', color: '#e0c891' },
  { id: 'cd12', name: '秘法加速', desc: '技能冷却 -12%', color: '#9be06f' },
  { id: 'life1', name: '水晶共鸣', desc: '生命 +1', color: '#8fdc7a' },
  { id: 'wavegold', name: '战争债券', desc: '每波开始 +25 ◈', color: '#ffcf5e' },
  { id: 'splash8', name: '装药强化', desc: '溅射范围 +8%', color: '#ffab76' },
];
const CHAPTERS = [
  { name: '第一章 · 边境哨线', map: 0, unlock: ['arrow', 'frost', 'cannon'], msg: '魔族前锋试探边境——留意第 5 波起掠空的石像蝠，它们不沿路走，直飞水晶。' },
  { name: '第二章 · 幽暗林道', map: 0, unlock: ['arc', 'poison'], msg: '狼群与疾足奔行者出没林间，小心自爆甲虫炸瘫塔位——弧光与腐毒解禁。' },
  { name: '第三章 · 黄沙遗迹', map: 1, unlock: ['prism', 'flame'], msg: '黑铠骑士重甲惧法，正好交给棱镜与燃烬；岩背戈伦皮糙厚，减速集火。' },
  { name: '第四章 · 风暴回廊', map: 1, unlock: ['siege'], msg: '缚魂破法者反弹魔法——物理塔回归；疾风精灵空袭，战鼓督军务必优先击杀。' },
  { name: '第五章 · 冰封王座', map: 2, unlock: ['banner'], msg: '潜影行者周期隐身穿塔而过，攻城兽远程瘫痪塔位——塔别摆太密，军旗竖起。' },
  { name: '第六章 · 终局 · 巴尔降临', map: 2, unlock: [], msg: '六十年一遇的月蚀。全体动员，迎接完全体魔王。' },
];
const TOTAL_WAVES = 60;
const DIFFS = {
  normal: { name: '普通', hp: 1, gold: 1, lives: 12, boss: 1, cap: 24 },
  hard: { name: '困难', hp: 1.35, gold: 0.95, lives: 10, boss: 1.15, cap: 20 },
  night: { name: '噩梦', hp: 1.8, gold: 0.88, lives: 6, boss: 1.3, cap: 17 },
};

/* ---------------- wave table ---------------- */
function waveGroups(n) {
  if (n > TOTAL_WAVES) {
    const g = [];
    const pools = [['orc', 0.55], ['wolf', 0.4], ['runner', 0.34], ['bat', 0.42], ['sprite', 0.4], ['wraith', 0.7], ['shield', 0.9], ['knight', 0.85], ['warder', 0.85], ['bomber', 0.4], ['drummer', 1.5], ['golem', 1.6], ['beast', 1.9], ['zealot', 0.8], ['assassin', 0.9], ['shade', 0.75], ['siege', 1.5], ['splitter', 1.0], ['shaman', 1.1]];
    const extra = Math.floor((n - TOTAL_WAVES) / 8);
    for (let i = 0; i < 4; i++) {
      const pk = pools[Math.floor(rndG() * pools.length) % pools.length];
      g.push([pk[0], 12 + extra + Math.floor(rndG() * 8), pk[1], i * 6]);
    }
    if (n % 5 === 0) g.push(['B' + ((Math.floor(n / 5) - 1) % 6 + 1), 1 + Math.floor((n - TOTAL_WAVES) / 30), 1.2, 2]);
    return g;
  }
  const ch = Math.floor((n - 1) / 10);
  const ph = ((n - 1) % 10) + 1;
  const g = [];
  const push = (type, cnt, gap, delay) => g.push([type, Math.max(1, Math.round(cnt)), gap, delay]);
  if (ph === 10) {
    push('B' + (ch + 1), 1, 0, ch >= 3 ? 10 : 6);
    push('orc', 5 + ch * 2, 0.7, 0);
    if (ch >= 1) push('bat', 4 + ch * 0.6, 0.5, 2);
    if (ch >= 2) push('wraith', 3 + ch * 0.5, 0.8, 4);
    if (ch >= 2) push('knight', 2 + ch - 1, 1.4, 5);
    if (ch >= 3) push('warder', 2 + Math.floor(ch / 2), 1.5, 6);
    if (ch >= 4) push('golem', 2 + Math.floor(ch / 2), 1.8, 1);
    if (ch >= 4) push('drummer', 1 + Math.floor(ch / 3), 2.2, 3);
    if (ch >= 3) push('bomber', 3 + ch, 0.4, 7);
    return g;
  }
  if (ch === 0) {
    push('goblin', 6 + ph, 0.85 - ph * 0.02, 0);
    if (ph >= 3) push('orc', ph * 0.6, 1.3, 5);
    if (ph >= 5) push('bat', ph * 0.5, 0.7, 8);
    if (ph >= 8) push('wolf', 3, 0.5, 11);
  } else if (ch === 1) {
    push('goblin', 8 + ph, 0.6, 0);
    push('wolf', 4 + ph, 0.35, 4);
    if (ph >= 2) push('runner', 2 + ph * 0.6, 0.4, 6);
    if (ph >= 3) push('wraith', ph * 0.28, 1.1, 9);
    if (ph >= 4) push('bat', 3 + ph * 0.4, 0.6, 7);
    if (ph >= 5) push('bomber', 2 + ph * 0.4, 0.5, 2);
    if (ph >= 7) push('shaman', 1, 1.2, 10);
  } else if (ch === 2) {
    push('orc', 6 + ph, 0.6, 0);
    push('bat', 4 + ph * 0.6, 0.5, 3);
    if (ph >= 2) push('knight', 1 + ph * 0.35, 1.5, 5);
    if (ph >= 4) push('shield', ph * 0.3, 1.5, 8);
    if (ph >= 4) push('runner', 6, 0.35, 10);
    if (ph >= 5) push('bomber', 4, 0.45, 1);
    if (ph >= 6) push('beast', 1 + Math.floor((ph - 5) / 2), 2.4, 7);
    if (ph >= 3) push('shaman', ph * 0.3, 1.4, 6);
  } else if (ch === 3) {
    push('wolf', 8 + ph, 0.32, 0);
    push('sprite', 2 + ph * 0.45, 0.6, 2);
    push('warder', 1 + ph * 0.3, 1.5, 5);
    if (ph >= 2) push('knight', 3, 1.2, 6);
    if (ph >= 3) push('splitter', ph * 0.35, 1.3, 8);
    if (ph >= 4) push('zealot', ph * 0.35, 1.2, 9);
    if (ph >= 5) push('drummer', 1, 2.0, 4);
    if (ph >= 7) push('runner', 8, 0.3, 11);
  } else if (ch === 4) {
    push('zealot', 6 + ph * 0.5, 0.8, 0);
    push('golem', 2 + ph * 0.2, 1.9, 4);
    push('assassin', 2 + ph * 0.3, 1.1, 7);
    if (ph >= 2) push('shade', 2 + ph * 0.3, 1.0, 2);
    if (ph >= 3) push('siege', 1, 2.4, 5);
    if (ph >= 3) push('bat', 4 + ph * 0.25, 0.5, 1);
    if (ph >= 4) push('warder', 4, 0.9, 9);
    if (ph >= 5) push('sprite', 5, 0.55, 10);
    if (ph >= 5) push('splitter', 4, 1.1, 11);
    if (ph >= 6) push('beast', 1, 2.6, 3);
    if (ph >= 7) push('siege', 1, 2.4, 8);
  } else {
    push('goblin', 6 + ph * 0.7, 0.32, 0);
    push('orc', 5 + ph * 0.35, 0.55, 1);
    push('zealot', 3 + ph * 0.3, 0.8, 3);
    push('wraith', 3, 0.8, 8);
    if (ph >= 2) push('sprite', 4 + ph * 0.3, 0.55, 6);
    if (ph >= 3) push('golem', 2 + ph * 0.2, 1.6, 5);
    if (ph >= 3) push('shade', 4, 0.8, 9);
    if (ph >= 4) push('shaman', 2, 1.0, 10);
    if (ph >= 4) push('knight', 4, 1.0, 12);
    if (ph >= 4) push('siege', 1, 2.2, 4);
    if (ph >= 7) push('siege', 1, 2.2, 14);
    if (ph >= 5) push('beast', 2, 2.4, 2);
    if (ph >= 6) push('drummer', 2, 2.2, 7);
    if (ph >= 6) push('bomber', 6, 0.35, 13);
  }
  return g;
}
function waveBossIdx(n) {
  if (n > TOTAL_WAVES) return n % 5 === 0 ? (Math.floor(n / 5) - 1) % 6 : -1;
  return n % 10 === 0 ? (n / 10 - 1) : -1;
}
/* 波次词缀：w15 起每波随机一条，逼玩家按波配塔 */
const WMODS = [
  { id: 'swift', name: '疾行军潮', desc: '敌军移速 +15%', spd: 1.15, color: '#ffd873' },
  { id: 'iron', name: '玄铁军列', desc: '敌护甲 +18%', armor: 1.18, color: '#b8c4d8' },
  { id: 'hex', name: '抗魔结界', desc: '敌法抗 +6', mr: 6, color: '#a98fe8' },
  { id: 'hulk', name: '坚韧军团', desc: '敌生命 +20%', hp: 1.2, color: '#8fdc7a' },
];

/* ---------------- achievements ---------------- */
const ACH = [
  { id: 'first_blood', name: '首杀', desc: '击杀第一个敌人' },
  { id: 'kill500', name: '一将功成', desc: '单局击杀 500 敌' },
  { id: 'kill2000', name: '尸山血海', desc: '生涯击杀 2000 敌' },
  { id: 'build50', name: '基建狂魔', desc: '生涯建造 50 座塔' },
  { id: 'noleak_wave', name: '无懈可击', desc: '任意波次零漏怪通关' },
  { id: 'noleak_chapter', name: '铁壁将军', desc: '整章 10 波零漏怪' },
  { id: 'boss_c1', name: '督军陨落', desc: '击杀第一章首领' },
  { id: 'boss_c2', name: '双头之殇', desc: '击杀第二章首领' },
  { id: 'boss_c3', name: '寒冰消融', desc: '击杀第三章首领' },
  { id: 'boss_c4', name: '影刃折断', desc: '击杀第四章首领' },
  { id: 'boss_c5', name: '巨像崩碎', desc: '击杀第五章首领' },
  { id: 'boss_c6', name: '月蚀终结', desc: '击杀最终首领' },
  { id: 'win_normal', name: '守卫成功', desc: '普通难度通关' },
  { id: 'win_hard', name: '铁血守卫', desc: '困难难度通关' },
  { id: 'win_night', name: '梦魇克星', desc: '噩梦难度通关' },
  { id: 'endless70', name: '永夜行者', desc: '无尽模式抵达第 70 波' },
  { id: 'all_towers', name: '九鼎俱全', desc: '场上同时拥有全部 9 种塔' },
  { id: 'spells30', name: '法神转世', desc: '单局释放 30 次技能' },
  { id: 'boons12', name: '天选之人', desc: '单局选取 12 个祝福' },
  { id: 'rich', name: '富可敌国', desc: '金库存量达到 3000 ◈' },
];

/* ---------------- persistent ---------------- */
const LS = window.localStorage;
const store = {
  ach() { try { return JSON.parse(LS.getItem('cw_ach') || '{}'); } catch (e) { return {}; } },
  saveAch(a) { try { LS.setItem('cw_ach', JSON.stringify(a)); } catch (e) { } },
  meta() { try { return JSON.parse(LS.getItem('cw_meta') || '{}'); } catch (e) { return {}; } },
  saveMeta(m) { try { LS.setItem('cw_meta', JSON.stringify(m)); } catch (e) { } },
  save() { try { return JSON.parse(LS.getItem('cw_save') || 'null'); } catch (e) { return null; } },
  putSave(s) { try { if (s) LS.setItem('cw_save', JSON.stringify(s)); else LS.removeItem('cw_save'); } catch (e) { } },
};

/* ---------------- game state ---------------- */
const game = {
  state: 'menu', diff: 'normal',
  mapIdx: 0, gold: 300, lives: 20, wave: 0,
  waveActive: false, speed: 1, paused: false, time: 0,
  shake: 0, vign: 0, coreHit: 0,
  enemies: [], towers: [], projectiles: [], beams: [], pulses: [],
  particles: [], texts: [], muzzle: [], spawnQueue: [], waveT: 0,
  build: null, sel: null, hoverCell: null, aimSpell: null,
  endless: false, banner: null, flyies: [],
  spellCd: { meteor: 0, blizzard: 0, mend: 0 },
  boons: {}, boonPicks: 0, boonMode: null,
  unlocked: new Set(['arrow', 'frost', 'cannon']),
  ach: store.ach(), achQueue: [], achToast: null,
  chapterLeaks: 0, waveLeaks: 0, savedMeta: store.meta(),
  stats: { kills: 0, gold: 0, spent: 0, built: 0, bossKills: 0, spells: 0, noleakWaves: 0 },
  totalKills: 0,
  waveMod: null, bloodMoon: false, lastBMwave: -3, combo: 0, comboBest: 0, bonusDmg: 0, masteryPending: null, slowT: 0,
  keptMastery: {},
  fundDmg: 0, fundHaste: 0, fundLife: 0,
};
for (let i = 0; i < 24; i++) {
  game.flyies.push({ x: RR(0, W), y: RR(0, H), p: RR(0, TAU), sp: RR(6, 16), q: RR(0, TAU) });
}

/* boon helpers */
function boonN(id) { return game.boons[id] || 0; }
function boonSum() {
  const b = game.boons;
  return {
    dmg: (1 + 0.08 * (b.dmg8 || 0)) * (1 + (game.bonusDmg || 0)) * (1 + 0.05 * (game.fundDmg || 0)),
    gold: 1 + 0.12 * (b.gold12 || 0),
    range: 1 + 0.07 * (b.range7 || 0),
    espd: Math.pow(0.94, b.slow6 || 0),
    boss: 1 + 0.15 * (b.boss15 || 0),
    air: 1 + 0.2 * (b.air20 || 0),
    ground: 1 + 0.12 * (b.ground12 || 0),
    spl: 1 + 0.08 * (b.splash8 || 0),
    crit: Math.min(0.4, 0.08 * (b.crit || 0)),
    spellcd: Math.pow(0.88, b.cd12 || 0),
  };
}

/* =====================================================================
   PART B — FX / Enemy / Tower / Projectile / Spells
   ===================================================================== */

/* ---------------- fx ---------------- */
function fxParticle(x, y, vx, vy, life, size, color, grav = 0, fade = true) {
  if (game.particles.length > 460) game.particles.shift();
  game.particles.push({ x, y, vx, vy, t: 0, life, size, color, grav, fade });
}
function fxBurst(x, y, color, n, spd, size, life) {
  for (let i = 0; i < n; i++) {
    const a = RR(0, TAU), s = RR(spd * 0.3, spd);
    fxParticle(x, y, Math.cos(a) * s, Math.sin(a) * s - spd * 0.2, RR(life * 0.5, life), RR(size * 0.5, size), color, 130);
  }
}
function fxRing(x, y, color, maxr, life, width = 3, flat = true) {
  game.pulses.push({ x, y, t: 0, life, maxr, color, width, flat });
}
function addText(x, y, txt, color, size = 12, vy = -34) {
  if (game.texts.length > 40) game.texts.shift();
  game.texts.push({ x, y, txt, color, size, t: 0, life: 0.9, vy });
}
function addBeam(pts, color, life = 0.14, width = 2.4) {
  game.beams.push({ pts, color, t: 0, life, width });
}

/* ---------------- achievements ---------------- */
function ach(id) {
  if (game.ach[id]) return;
  game.ach[id] = 1;
  store.saveAch(game.ach);
  const def = ACH.find(a => a.id === id);
  if (def) { game.achQueue.push(def); SFX.ach(); }
}

/* ---------------- Enemy ---------------- */
class Enemy {
  constructor(type, o = {}) {
    const bossIdx = o.bossIdx;
    const def = bossIdx != null ? BOSSES[bossIdx] : ENEMY[type];
    this.type = type; this.def = def;
    this.boss = bossIdx != null; this.bossIdx = bossIdx;
    const B = boonSum();
    const D = DIFFS[game.diff];
    const n = game.wave;
    let hp = def.hp * Math.pow(1.094, n - 1);
    if (this.boss) {
      const s = Math.pow(1.105, Math.min(n, 28) - 1) * Math.pow(1.015, Math.max(0, n - 28));
      hp = def.hp * s * D.boss * (def.hpMul || 1);
    }
    let armor = def.armor + Math.floor(n / 6);
    let mr = (def.mr || 0) + Math.floor(n / 8);
    let spdMul = 1;
    if (!o.fromSplit && !this.boss && n >= 12 && RT() < 0.07) {
      const keys = Object.keys(AFFIXES);
      this.affix = keys[Math.floor(RT() * keys.length)];
      const af = AFFIXES[this.affix];
      spdMul *= af.spd; armor += af.armor; hp *= (af.hpMul || 1);
    }
    if (def.fly) hp *= 0.85;
    if (!this.boss) {
      const wm = game.waveMod;
      if (wm) { if (wm.hp) hp *= wm.hp; if (wm.spd) spdMul *= wm.spd; if (wm.armor) armor = Math.round(armor * wm.armor); if (wm.mr) mr += wm.mr; }
      if (game.bloodMoon) { hp *= 1.2; spdMul *= 1.15; }
    }
    this.elite = false;
    if (o.elite && !this.boss) {
      this.elite = true;
      hp *= 2.6; spdMul *= 1.05; armor += 8; mr += 8;
    }
    this.hp = this.maxHp = Math.round(hp * (o.hpMul || 1) * D.hp);
    this.armor = armor; this.mr = mr;
    this.fly = !!def.fly;
    this.flyAmp = this.fly ? (this.boss ? 22 : RR(46, 86)) : 0;
    this.flyCyc = RR(2.2, 3.4); this.flyPh = RR(0, TAU);
    this.pLen = this.fly ? MAP.FLY.len : MAP.len;
    this.leak = def.leak || 1;
    if (this.elite) this.leak += 1;
    this.r = this.elite ? Math.round(def.r * 1.22) : def.r;
    this.gold = Math.round((def.gold || 5) * Math.min(3, 1 + n * 0.012) * (game.bloodMoon && !this.boss ? 1.5 : 1) * (this.elite ? 6 : 1));
    this.spdBase = def.spd * spdMul;
    this.dist = -(o.distOff || RR(0, 10));
    const p = this.pos(Math.max(0, this.dist));
    this.x = p.x; this.y = p.y;
    this.px = p.x; this.py = p.y;
    this.wob = RR(0, TAU); this.facing = 1;
    this.slowUntil = 0; this.slowF = 0;
    this.freezeUntil = 0; this.stunUntil = 0;
    this.shockUntil = 0; this.reactCd = 0;
    this.hitFlash = 0;
    this.poison = null; this.burnUntil = 0; this.burnDps = 0; this.poisonAcc = 0;
    this.healCd = RR(1.2, 2.6); this.regenAcc = 0;
    this.novaCd = 5.5; this.blinkCd = 6.5; this.shieldCd = 9; this.shieldUntil = 0;
    this.phaseT = RR(0, 3); this.phased = false;
    this.siegeCd = RR(2.4, 4.2);
    this.splitDone = false; this.raged = false;
    this.gimmick = def.gimmick || null;
    this.dead = false;
  }
  flyPos(d) {
    const F = MAP.FLY;
    d = clamp(d, 0, F.len);
    let s = F.segs[F.segs.length - 1];
    for (const sg of F.segs) { if (d <= sg.acc + sg.len) { s = sg; break; } }
    const t = (d - s.acc) / s.len;
    const bx = lerp(s.a.x, s.b.x, t), by = lerp(s.a.y, s.b.y, t);
    const nx = -(s.b.y - s.a.y) / s.len, ny = (s.b.x - s.a.x) / s.len;
    const gt = d / F.len;
    const env = Math.sin(Math.PI * clamp(gt, 0.03, 0.97));
    const off = Math.sin(gt * TAU * this.flyCyc + this.flyPh) * this.flyAmp * env;
    return { x: bx + nx * off, y: by + ny * off };
  }
  pos(d) { return this.fly ? this.flyPos(d) : posAt(d); }
  speedNow() {
    if (this.freezeUntil > game.time || this.stunUntil > game.time) return 0;
    const B = boonSum();
    let s = this.spdBase * B.espd;
    if (this.slowUntil > game.time) s *= (1 - this.slowF);
    if (this.gimmick === 'final') {
      for (const e of game.enemies) if (e !== this && e.boss && !e.dead) {
        if (hyp(e.x - this.x, e.y - this.y) < 130) { s *= 1.15; break; }
      }
    }
    if (this.gimmick === 'rage' && this.raged) s *= 1.4;
    if (this.def.zealot && this.hp < this.maxHp * 0.35) s *= 1.45;
    if (!this.def.aura && this.dist > 0) {
      for (const d of game.enemies) {
        if (d === this || d.dead || !d.def.aura) continue;
        if (hyp(d.x - this.x, d.y - this.y) <= d.def.aura.r) { s *= d.def.aura.spd; break; }
      }
    }
    return s;
  }
  update(dt) {
    this.wob += dt * (this.fly ? 14 : 7);
    const sp = this.speedNow();
    this.px = this.x; this.py = this.y;
    this.dist += sp * dt;
    if (this.dist >= 0) {
      const p = this.pos(this.dist);
      const dx = p.x - this.x;
      this.facing = Math.abs(dx) > 0.02 ? Math.sign(dx) : this.facing;
      this.x = p.x; this.y = p.y;
    }
    if (this.dist >= this.pLen - 4) { this.leakOut(); return; }
    // DoT
    if (this.poison && this.poison.until > game.time) {
      this.poisonAcc += dt;
      while (this.poisonAcc >= 0.5) {
        this.poisonAcc -= 0.5;
        let d = this.poison.stacks * this.poison.perTick * 0.5;
        if (this.boss) d *= 0.35;
        this.hit(d, 'magic', { silent: true });
        if (RT() < 0.5) fxParticle(this.x + RR(-6, 6), this.y - RR(4, 12), RR(-8, 8), -26, 0.5, 2.6, 'rgba(150,220,80,.8)');
      }
    } else this.poison = null;
    if (this.burnUntil > game.time) this.hit(this.burnDps * dt, 'magic', { silent: true });
    // regen
    if (this.gimmick === 'regen') {
      this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.0055 * dt);
      if (RT() < dt * 3) fxParticle(this.x + RR(-8, 8), this.y - RR(6, 14), RR(-6, 6), -18, 0.6, 2.4, 'rgba(140,255,120,.7)');
    }
    // healer
    if (this.def.healer && this.dist > 0) {
      this.healCd -= dt;
      if (this.healCd <= 0) {
        this.healCd = 2.6;
        let healed = false;
        for (const e of game.enemies) {
          if (e === this || e.dead || e.hp >= e.maxHp) continue;
          if (hyp(e.x - this.x, e.y - this.y) < 76) {
            e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.07);
            healed = true;
            if (RT() < 0.6) addText(e.x, e.y - e.r - 6, '+', '#8fdc7a', 11, -26);
          }
        }
        if (healed) { fxRing(this.x, this.y, 'rgba(140,240,120,', 80, 0.5, 2); SFX.heal(); }
      }
    }
    // 潜影：周期性不可锁定（技能仍可命中）
    if (this.def.phase) {
      this.phaseT += dt;
      const ph = this.def.phase;
      this.phased = (this.phaseT % (ph.on + ph.off)) < ph.on;
    }
    // 攻城兽：远程吐光束瘫痪防御塔
    if (this.def.siege && this.dist > 0) {
      this.siegeCd -= dt;
      if (this.siegeCd <= 0) {
        const sg = this.def.siege;
        let best = null, bd = 1e9;
        for (const t of game.towers) {
          if (t.taseUntil > game.time + 0.6) continue;
          const d = hyp(t.x - this.x, t.y - this.y);
          if (d <= sg.range && d < bd) { bd = d; best = t; }
        }
        if (best) {
          this.siegeCd = sg.cd;
          best.taseUntil = game.time + sg.t;
          for (let i = 0; i < 7; i++) {
            const q = i / 6;
            fxParticle(this.x + (best.x - this.x) * q, this.y - 10 + (best.y - 14 - this.y + 10) * q, RR(-14, 14), RR(-14, 14), 0.22, 3.4, 'rgba(255,170,80,.95)');
          }
          fxRing(best.x, best.y - 10, 'rgba(255,170,80,', 26, 0.4, 2.4);
          addText(best.x, best.y - 30, '瘫痪！', '#ffb054', 11, -30);
          SFX.siege();
        } else this.siegeCd = 0.7;
      }
    }
    // 战鼓光环脉动视觉
    if (this.def.aura && this.dist > 0 && RT() < dt * 1.6) {
      game.pulses.push({ x: this.x, y: this.y, t: 0, life: 0.8, maxr: this.def.aura.r, color: 'rgba(230,90,60,', width: 1.6, flat: true });
    }
    // boss 妖术
    if (this.boss) {
      if (window.__PROBE && Math.abs(game.wave - window.__PROBE) <= 1) {
        this.__pacc = (this.__pacc || 0) + dt;
        if (this.__pacc > 3) { this.__pacc = 0; window.__BS = (window.__BS || '') + 'd' + Math.round(this.dist) + '/h' + Math.round(this.hp / 100) + 't' + game.towers.length + ';'; }
      }
      if (window.__PROBE2 && game.wave >= 44 && game.wave <= 46) {
        this.__qacc = (this.__qacc || 0) + dt;
        if (this.__qacc > 3 && this.dist > 0) { this.__qacc = 0; window.__BS = (window.__BS || '') + 'W' + game.wave + ':' + this.type + 'd' + Math.round(this.dist / this.pLen * 100) + 'h' + Math.round(this.hp / 100) + ';'; }
      }
      if (this.gimmick === 'rage' && !this.raged && this.hp < this.maxHp * 0.3) {
        this.raged = true;
        fxRing(this.x, this.y, 'rgba(255,90,60,', 110, 0.6, 4); addText(this.x, this.y - 34, '狂暴！', '#ff8a6a', 15);
      }
      if (this.gimmick === 'nova') {
        this.novaCd -= dt;
        if (this.novaCd <= 0 && this.dist > 10) {
          this.novaCd = 8;
          let hitN = 0;
          for (const t of game.towers) if (hyp(t.x - this.x, t.y - this.y) < 145) { t.taseUntil = game.time + 1.9; hitN++; }
          fxRing(this.x, this.y, 'rgba(150,220,255,', 145, 0.7, 5);
          if (hitN) addText(this.x, this.y - 36, '霜冻麻痹！', '#a8e6ff', 14);
          SFX.freeze();
        }
      }
      if (this.gimmick === 'blink') {
        this.blinkCd -= dt;
        if (this.blinkCd <= 0 && this.dist > 10) {
          this.blinkCd = 8.5;
          for (let i = 0; i < 4; i++) {
            const q = this.pos(this.dist - i * 26);
            game.pulses.push({ x: q.x, y: q.y - 16, t: 0, life: 0.4, maxr: 26, color: 'rgba(160,120,230,', width: 2, flat: false });
          }
          this.dist += this.pLen * 0.05;
          fxBurst(this.x, this.y - 16, 'rgba(160,120,230,.85)', 12, 90, 4, 0.5);
          SFX.zap();
        }
      }
      if (this.gimmick === 'split50' && !this.splitDone && this.hp <= this.maxHp * 0.5) {
        this.splitDone = true;
        const sp2 = this.def.split;
        for (let i = 0; i < sp2.n; i++) spawnEnemy(sp2.type, { distOff: -(i * 16 + 6), atDist: this.dist - 6 - i * 18, fromSplit: 1 });
        fxRing(this.x, this.y, 'rgba(200,215,230,', 120, 0.6, 5);
        addText(this.x, this.y - 40, '巨像碎裂！', '#cfd9e4', 15);
        SFX.thoom();
      }
      if (this.gimmick === 'final') {
        this.shieldCd -= dt;
        if (this.shieldCd <= 0 && this.dist > 10) {
          this.shieldCd = 12;
          this.shieldUntil = game.time + 1.7;
          fxRing(this.x, this.y, 'rgba(210,120,255,', 70, 0.5, 4);
          addText(this.x, this.y - 42, '暗影护盾', '#d9a4ff', 13);
        }
        if (!this.splitDone && this.hp <= this.maxHp * 0.33) {
          this.splitDone = true;
          for (let i = 0; i < 3; i++) spawnEnemy('shadowLing', { atDist: this.dist - 4 - i * 14, fromSplit: 1 });
          fxRing(this.x, this.y, 'rgba(210,80,120,', 130, 0.7, 5);
          addText(this.x, this.y - 44, '残影剥离！', '#ff8ab0', 15);
        }
      }
    }
  }
  hit(amount, kind, o = {}) {
    if (this.dead || amount <= 0) return;
    if (this.shieldUntil > game.time && !o.ignoreShield) amount *= 0.3;
    if (kind === 'phys') {
      const ar = this.armor * (1 - (o.pierce || 0));
      amount *= 1 - Math.min(0.75, ar / (ar + 45));
      if (this.def.physRes) amount *= (1 - this.def.physRes);
    } else {
      amount *= 1 - Math.min(0.7, this.mr * 0.05);
      if (this.def.magicRes) amount *= (1 - this.def.magicRes);
      if (this.def.magicVuln) amount *= this.def.magicVuln;
    }
    this.hp -= amount;
    this.hitFlash = game.time + 0.12;
    if (!o.silent) SFX.hit();
    if (o.big && amount > 120) addText(this.x, this.y - this.r - 10, fmt(amount), '#ffd873', 13, -40);
    if (this.hp <= 0) this.die(o);
  }
  applySlow(f, dur) {
    if (this.freezeUntil > game.time) return;
    if (this.slowUntil <= game.time || f > this.slowF) { this.slowF = Math.max(this.slowF, f); }
    else this.slowF = Math.max(this.slowF * 0.98, f * 0.7);
    this.slowUntil = Math.max(this.slowUntil, game.time + dur);
  }
  applyPoison(dmg, cap) {
    if (!this.poison || this.poison.until <= game.time) this.poison = { stacks: 0, perTick: dmg, until: game.time + 3 };
    this.poison.perTick = Math.max(this.poison.perTick, dmg);
    this.poison.stacks = Math.min(cap, this.poison.stacks + 1);
    this.poison.until = game.time + 3;
  }
  leakOut() {
    this.dead = true;
    if (game.combo >= 10) addText(MAP.CORE.x, MAP.CORE.y - 54, '连击中断', '#ff7a6b', 13, -30);
    game.combo = 0;
    window.__LEAKS = window.__LEAKS || {};
    window.__LEAKS[this.type] = (window.__LEAKS[this.type] || 0) + this.leak;
    game.lives -= this.leak;
    game.waveLeaks += this.leak;
    game.chapterLeaks += this.leak;
    game.coreHit = game.time;
    game.vign = 1; game.shake = Math.min(10, game.shake + 5 + this.leak);
    SFX.leak();
    const p = this.pos(this.pLen - 8);
    fxBurst(MAP.CORE.x, MAP.CORE.y, 'rgba(255,80,70,.9)', 16, 130, 4, 0.6);
    addText(p.x, p.y - 24, '-' + this.leak + ' 生命', '#ff7a6b', 15, -44);
    if (game.lives <= 0) { game.lives = 0; endGame(false); }
  }
  die(o = {}) {
    if (this.dead) return;
    this.dead = true;
    const B = boonSum();
    game.combo++;
    if (game.combo > game.comboBest) game.comboBest = game.combo;
    const g = Math.round(this.gold * B.gold * 0.76 * (1 + Math.min(0.5, game.combo * 0.012)));
    if (game.combo >= 10 && game.combo % 10 === 0) addText(this.x, this.y - this.r - 20, game.combo + ' 连杀！', '#ffcf5e', 15, -38);
    game.gold += g;
    game.stats.gold += g; game.stats.kills++;
    game.totalKills++; game.savedMeta.kills = (game.savedMeta.kills || 0) + 1;
    ach('first_blood');
    if (game.stats.kills >= 500) ach('kill500');
    if (game.savedMeta.kills >= 2000) ach('kill2000');
    const col = this.def.body;
    fxBurst(this.x, this.y - (this.fly ? 16 : 0), col, this.boss ? 40 : 9, this.boss ? 180 : 90, this.boss ? 6 : 3.4, this.boss ? 1 : 0.55);
    fxRing(this.x, this.y, 'rgba(255,255,255,', this.boss ? 90 : 22, this.boss ? 0.6 : 0.25, this.boss ? 4 : 1.6);
    if (this.boss) {
      window.__BOSS = (window.__BOSS || '') + ' w' + game.wave + ':KILLED-' + this.def.name.slice(0, 3);
      game.stats.bossKills++;
      ach('boss_c' + (this.bossIdx + 1));
      game.banner = { txt: this.def.name + ' 已陨落', sub: '+ ' + g + ' ◈', t: 0, life: 3, big: true, color: '#ffd873' };
      game.shake = Math.min(12, game.shake + 7);
      game.slowT = 0.5;
      SFX.ding();
      store.putSave(null);
    } else {
      if (!this.def.fromSplit && RT() < 0.5) addText(this.x, this.y - this.r - 6, '+' + g, '#ffd873', 11, -30);
      if (this.def.split && !this.splitDone) {
        this.splitDone = true;
        for (let i = 0; i < this.def.split.n; i++) spawnEnemy(this.def.split.type, { atDist: this.dist - i * 13, fromSplit: 1 });
      }
      if (!this.def.fromSplit) SFX.coin();
      if (this.def.boom) {
        const bm = this.def.boom;
        let stunned = 0;
        for (const t of game.towers) {
          if (hyp(t.x - this.x, t.y - this.y) <= bm.r) { t.taseUntil = Math.max(t.taseUntil, game.time + bm.t); stunned++; }
        }
        fxBurst(this.x, this.y, 'rgba(255,150,60,.95)', 14, 130, 5, 0.5);
        game.pulses.push({ x: this.x, y: this.y, t: 0, life: 0.45, maxr: bm.r, color: 'rgba(255,140,60,', width: 3, flat: true });
        game.shake = Math.min(8, game.shake + 2.4);
        if (stunned) addText(this.x, this.y - 22, '自爆！', '#ffab5e', 13, -34);
        SFX.thoom();
      }
    }
    if (game.gold >= 3000) ach('rich');
    void o;
  }
}
function spawnEnemy(type, o = {}) {
  const bossIdx = type.startsWith('B') ? parseInt(type.slice(1), 10) - 1 : null;
  if (bossIdx != null && !BOSSES[bossIdx]) return null;
  if (bossIdx == null && !ENEMY[type]) return null;
  const e = new Enemy(type, { ...o, bossIdx });
  if (o.atDist != null) {
    e.dist = o.atDist;
    const p = e.pos(Math.max(0, e.dist));
    e.x = p.x; e.y = p.y;
  }
  game.enemies.push(e);
  if (e.boss) {
    window.__BOSS = (window.__BOSS || '') + ' w' + game.wave + ':' + e.def.name.slice(0, 4) + ' hp' + Math.round(e.hp) + (e.dead ? 'DIE' : '') + ';';
    SFX.bossHorn();
    game.banner = { txt: e.def.name, sub: '首领逼近水晶', t: 0, life: 2.6, big: true, color: '#ff8a6a' };
    game.shake = 6;
  }
  return e;
}

/* ---------------- Projectile ---------------- */
class Projectile {
  constructor(t, target, o) {
    this.x = t.x; this.y = t.y - 14;
    this.target = target;
    Object.assign(this, o);
    this.t = 0; this.dead = false;
    this.arcH = o.arcH || 0;
    this.sx = this.x; this.sy = this.y;
    this.alt = target.fly ? -16 : 0;
  }
  update(dt) {
    this.t += dt;
    const tg = this.target;
    const tx = tg.dead && this.homing === false ? this.lx || this.x + 30 : (tg.x + (tg.vxTrail || 0));
    const ty = (tg.dead && this.homing === false ? (tg.ly || this.y) : tg.y) + this.alt;
    this.lx = tx; this.ly = ty;
    const dx = tx - this.x, dy = ty - this.y;
    const d = hyp(dx, dy);
    const step = this.spd * dt;
    if (d <= step + (tg.r || 8)) { this.impact(tx, ty); return; }
    const lead = Math.min(1, d / this.spd);
    this.x += (dx + 0) / d * step;
    this.y += (dy - lead * 0 + 0) / d * step;
    if (this.trail) fxParticle(this.x, this.y, RR(-6, 6), RR(-6, 6), this.trail, 2.2, this.trailColor, 0);
  }
  impact(x, y) {
    this.dead = true;
    const tg = this.target;
    const o = this;
    if (this.splash) {
      const sr = this.splash * boonSum().spl;
      const isL = this.splashBig;
      fxRing(x, y - this.alt, isL ? 'rgba(255,160,80,' : 'rgba(255,200,120,', sr, 0.3, isL ? 4 : 2.4);
      fxBurst(x, y, 'rgba(255,170,90,.9)', isL ? 16 : 8, isL ? 150 : 90, isL ? 5 : 3, 0.5);
      if (isL) { SFX.thoom(); game.shake = Math.min(9, game.shake + 3); }
      for (const e of game.enemies) {
        if (e.dead) continue;
        if (e.phased && e !== tg) continue;
        if (this.ground && e.fly) continue;
        const dd = hyp(e.x - x, e.y - (y - this.alt));
        if (dd <= sr + e.r) {
          const fall = 1 - Math.min(0.55, dd / (sr * 1.9));
          let mul = (e === tg ? 1 : fall);
          damageEnemy(e, o.dmg * mul, o.kind, o);
          if (this.stun && !e.fly && !e.dead) { e.stunUntil = game.time + this.stun; if (RT() < 0.5) addText(e.x, e.y - e.r - 8, '晕', '#ffe066', 10, -24); }
        }
      }
    } else if (!tg.dead) {
      damageEnemy(tg, this.dmg, this.kind, this);
      if (this.poison) tg.applyPoison(this.poison, this.poisonCap || 8);
      if (!this.silentHit) fxParticle(x, y, RR(-20, 20), RR(-40, -8), 0.3, 2.4, this.color, 60);
    }
    void this.source;
  }
}
/* 塔→敌伤害结算（祝福/暴击/目标类型加成统一入口） */
function damageEnemy(e, dmg, kind, o = {}) {
  const B = boonSum();
  let d = dmg;
  if (e.fly) d *= B.air; else d *= B.ground;
  if (e.boss) d *= B.boss;
  if (o.bossMul && e.boss) d *= o.bossMul;
  if (B.crit > 0 && RT() < B.crit) { d *= 2; addText(e.x + RR(-6, 6), e.y - e.r - 14, '暴击', '#ff7a6b', 11, -36); }
  e.hit(d, kind, { pierce: o.pierce, big: o.big, ignoreShield: o.ignoreShield });
  if (o.poison && !e.dead) e.applyPoison(o.poison, o.poisonCap || 8);
  const src = o.src || (o.source && o.source.type);
  if (src === 'arc' && !e.dead) e.shockUntil = game.time + 2;
  if (!o.noReact) reactCheck(e, src, kind, d);
}
/* 元素反应：碎裂(冰+物理)/爆燃(毒+火)/蒸发(冰+火)/毒力传导(电+毒) */
function reactCheck(e, src, kind, d) {
  if (e.dead || game.time < e.reactCd) return;
  const t = game.time;
  const frozen = e.freezeUntil > t;
  const poisoned = e.poison && e.poison.until > t;
  if (kind === 'phys' && frozen) {
    e.reactCd = t + 0.4;
    const bonus = Math.min(2000, 40 + (e.maxHp - e.hp) * 0.16);
    e.freezeUntil = 0;
    e.hp -= bonus; e.hitFlash = t + 0.12;
    fxRing(e.x, e.y - (e.fly ? 8 : 0), 'rgba(189,239,255,', e.r + 30, 0.4, 3);
    fxBurst(e.x, e.y, 'rgba(200,240,255,.9)', 10, 130, 4, 0.45);
    addText(e.x, e.y - e.r - 18, '碎裂 ' + fmt(bonus), '#bdefff', 14, -44);
    SFX.zap();
    if (e.hp <= 0) e.die({});
  } else if (src === 'flame' && poisoned) {
    e.reactCd = t + 0.4;
    const p = e.poison;
    const bonus = p.perTick * Math.min(6, p.stacks) * 1.6;
    e.poison = null;
    e.hp -= bonus; e.hitFlash = t + 0.12;
    fxBurst(e.x, e.y - 6, 'rgba(255,150,60,.95)', 14, 150, 4.5, 0.5);
    game.shake = Math.min(6, game.shake + 1.2);
    addText(e.x, e.y - e.r - 18, '爆燃 ' + fmt(bonus), '#ffab5e', 14, -44);
    SFX.thoom();
    if (e.hp <= 0) e.die({});
  } else if (src === 'flame' && frozen) {
    e.reactCd = t + 0.6;
    e.freezeUntil = 0;
    for (const o2 of game.enemies) if (!o2.dead && o2 !== e && hyp(o2.x - e.x, o2.y - e.y) <= 120) o2.applySlow(0.3, 2);
    fxRing(e.x, e.y, 'rgba(235,246,255,', 120, 0.5, 2.2);
    addText(e.x, e.y - e.r - 18, '蒸发', '#eaf6ff', 13, -40);
  } else if (src === 'arc' && poisoned) {
    e.reactCd = t + 0.5;
    let hops = 0;
    for (const o2 of game.enemies) {
      if (hops >= 3 || o2 === e || o2.dead || o2.phased || o2.dist < -4) continue;
      if (hyp(o2.x - e.x, o2.y - e.y) <= 124) {
        damageEnemy(o2, Math.max(12, d * 0.45), 'magic', { noReact: 1 });
        addBeam([[e.x, e.y - 10], [o2.x, o2.y - 10]], 'rgba(176,232,110,', 0.16, 2.2);
        hops++;
      }
    }
    if (hops) addText(e.x, e.y - e.r - 18, '毒力传导', '#b8f088', 13, -40);
  }
}

/* ---------------- Tower ---------------- */
class Tower {
  constructor(type, c, r) {
    this.type = type; this.c = c; this.r = r;
    this.x = c * CELL + 16; this.y = r * CELL + 16;
    this.level = 0;
    this.mastery = 0;
    this.invested = TOWERS[type].cost;
    this.cd = RR(0, 0.3);
    this.angle = -Math.PI / 2;
    this.taseUntil = 0;
    this.kills = 0; this.dmgDealt = 0;
    this.shots = 0;
    this.pulseT = RR(0, 2);
    this.flameOn = 0;
    this.recoil = 0;
  }
  tier() { return TOWERS[this.type].tiers[this.level]; }
  mastered() { return this.mastery > 0 && this.level >= 3; }
  range() { return this.tier().range * boonSum().range * (this.mastered() && this.mastery === 1 ? 0.94 : this.mastered() && this.mastery === 2 ? 1.12 : 1); }
  canFire() { return game.time >= this.taseUntil; }
  dmgMul() {
    let m = boonSum().dmg;
    if (this.mastered() && this.mastery === 1) m *= 1.3;
    for (const t of game.towers) {
      if (t.type !== 'banner' || t === this) continue;
      const bt = t.tier();
      if (hyp(t.x - this.x, t.y - this.y) <= bt.range * boonSum().range) m *= (1 + bt.aura);
    }
    return m;
  }
  hasteMul() {
    const fh = 1 + 0.05 * (game.fundHaste || 0);
    for (const t of game.towers) {
      if (t.type !== 'banner' || t === this) continue;
      const bt = t.tier();
      if (bt.haste && hyp(t.x - this.x, t.y - this.y) <= bt.range * boonSum().range) return (1 + bt.haste) * fh;
    }
    return fh;
  }
  findTarget(groundOnly) {
    let best = null, bestD = -1, bboss = null, bbD = -1;
    const rg = this.range();
    for (const e of game.enemies) {
      if (e.dead || e.dist < -4 || e.phased) continue;
      if (groundOnly && e.fly) continue;
      if (hyp(e.x - this.x, e.y - this.y) <= rg + e.r) {
        const prog = e.dist / e.pLen;
        if (e.boss) { if (prog > bbD) { bbD = prog; bboss = e; } }
        if (prog > bestD) { bestD = prog; best = e; }
      }
    }
    return bboss || best;
  }
  update(dt) {
    this.pulseT += dt;
    this.recoil = Math.max(0, this.recoil - dt * 6);
    if (!this.canFire()) return;
    const def = TOWERS[this.type];
    const tier = this.tier();
    this.cd -= dt * this.hasteMul();
    if (def.kind === 'none') {
      if (this.pulseT > 2.4) { this.pulseT = 0; fxRing(this.x, this.y, 'rgba(255,215,110,', tier.range, 0.7, 1.6); }
      return;
    }
    if (this.type === 'flame') {
      const rg = this.range();
      let tgt = null, td = 1e9, tb = null, tbD = 1e9;
      for (const e of game.enemies) {
        if (e.dead || e.dist < -4 || e.phased) continue;
        const d = hyp(e.x - this.x, e.y - this.y);
        if (d >= rg + e.r) continue;
        if (e.boss) { if (d < tbD) { tbD = d; tb = e; } }
        if (d < td) { td = d; tgt = e; }
      }
      tgt = tb || tgt;
      if (!tgt) return;
      this.angle = Math.atan2(tgt.y - this.y, tgt.x - this.x);
      this.flameOn = game.time + 0.15;
      if (this.cd > 0) return;
      this.cd = tier.cd * (this.mastered() && this.mastery === 2 ? 0.78 : 1);
      const mul = this.dmgMul();
      const half = 0.54;
      let any = false;
      for (const e of game.enemies) {
        if (e.dead || e.dist < -4) continue;
        const dx = e.x - this.x, dy = e.y - this.y;
        const d = hyp(dx, dy);
        if (d > rg + e.r) continue;
        let da = Math.atan2(dy, dx) - this.angle;
        while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
        if (Math.abs(da) <= half) {
          damageEnemy(e, tier.dmg * mul, 'magic', { src: 'flame' });
          if (tier.burn && !e.dead) { e.burnDps = Math.max(e.burnDps * 0.9, tier.dmg * mul * tier.burn * 0.5); e.burnUntil = game.time + 2.2; }
          any = true;
        }
      }
      if (any && RT() < 0.4) SFX.flame();
      const fx = this.x + Math.cos(this.angle) * 16, fy = this.y - 12 + Math.sin(this.angle) * 16;
      for (let i = 0; i < 4; i++) {
        const a = this.angle + RR(-half, half);
        const s = RR(90, 220);
        fxParticle(fx, fy, Math.cos(a) * s, Math.sin(a) * s, RR(0.18, 0.32), RR(2.4, 4.6), RT() < 0.6 ? 'rgba(255,150,60,.9)' : 'rgba(255,230,120,.9)', -20);
      }
      return;
    }
    if (this.type === 'frost') {
      const tgts = [];
      const rg = this.range();
      for (const e of game.enemies) {
        if (e.dead || e.dist < -4 || e.phased) continue;
        if (hyp(e.x - this.x, e.y - this.y) <= rg + e.r) tgts.push(e);
      }
      if (!tgts.length || this.cd > 0) return;
      this.cd = tier.cd * (this.mastered() && this.mastery === 2 ? 0.78 : 1);
      const mul = this.dmgMul();
      fxRing(this.x, this.y, 'rgba(150,230,255,', rg, 0.4, 2.4);
      SFX.frost();
      for (const e of tgts) {
        damageEnemy(e, tier.dmg * mul, 'magic', {});
        if (!e.dead) {
          if (tier.freeze && RT() < tier.freeze) { e.freezeUntil = game.time + 0.9 * (1 - (e.def.freezeRes || 0)); if (RT() < 0.5) addText(e.x, e.y - e.r - 8, '冻结', '#a8e6ff', 10, -26); }
          else e.applySlow(tier.slow, tier.sdur);
        }
      }
      return;
    }
    const ground = !!tier.ground || this.type === 'cannon';
    const tgt = this.findTarget(ground);
    if (!tgt || this.cd > 0) return;
    this.cd = tier.cd;
    const mul = this.dmgMul();
    this.angle = Math.atan2(tgt.y - this.y, tgt.x - this.x);
    this.recoil = 1;
    const mx = this.x + Math.cos(this.angle) * 15, my = this.y - 14 + Math.sin(this.angle) * 15;
    if (this.type === 'arrow') {
      SFX.shoot();
      game.projectiles.push(new Projectile(this, tgt, { spd: 520, dmg: tier.dmg * mul, kind: 'phys', color: '#f4d889', trailColor: 'rgba(244,216,137,.5)', trail: 0.12 }));
      if (tier.twin) {
        let t2 = null, dd = 1e9;
        for (const e of game.enemies) {
          if (e.dead || e === tgt || e.dist < -4) continue;
          const d2 = hyp(e.x - this.x, e.y - this.y);
          if (d2 <= this.range() + e.r && d2 < dd) { dd = d2; t2 = e; }
        }
        if (t2) game.projectiles.push(new Projectile(this, t2, { spd: 520, dmg: tier.dmg * mul * 0.6, kind: 'phys', color: '#f4d889', trailColor: 'rgba(244,216,137,.35)', trail: 0.1 }));
      }
    } else if (this.type === 'cannon') {
      game.projectiles.push(new Projectile(this, tgt, { spd: 300, dmg: tier.dmg * mul, kind: 'phys', splash: tier.splash, splashBig: this.level >= 2, stun: tier.stun, ground: true, arcH: 1, color: '#ffcf8a', trailColor: 'rgba(120,100,90,.4)', trail: 0.2 }));
      SFX.siege();
    } else if (this.type === 'siege') {
      game.projectiles.push(new Projectile(this, tgt, { spd: 250, dmg: tier.dmg * mul, kind: 'phys', pierce: tier.pierce, bossMul: tier.bossMul, ground: true, arcH: 1.6, big: 1, splash: 26, splashBig: true, color: '#e8dcc4', trailColor: 'rgba(200,190,170,.4)', trail: 0.22 }));
      SFX.siege();
    } else if (this.type === 'poison') {
      SFX.spit();
      game.projectiles.push(new Projectile(this, tgt, { spd: 380, dmg: tier.dmg * mul * 0.5, kind: 'magic', poison: tier.dmg * 0.42 * mul, poisonCap: tier.cap || 8, arcH: 0.8, color: '#b0e889', trailColor: 'rgba(150,220,90,.5)', trail: 0.16 }));
    } else if (this.type === 'prism') {
      SFX.prism();
      const ey = tgt.y + (tgt.fly ? -16 : 0);
      addBeam([[mx, my], [tgt.x, ey]], 'rgba(217,164,255,', 0.16, 2.6 + this.level * 0.8);
      drawBeamHit = { x: tgt.x, y: ey };
      damageEnemy(tgt, tier.dmg * mul, 'magic', { big: 1 });
      if (tier.fork) {
        let t2 = null, dd = 1e9;
        for (const e of game.enemies) {
          if (e.dead || e === tgt) continue;
          const d2 = hyp(e.x - tgt.x, e.y - tgt.y);
          if (d2 < 110 && d2 < dd) { dd = d2; t2 = e; }
        }
        if (t2) {
          addBeam([[tgt.x, ey], [t2.x, t2.y + (t2.fly ? -16 : 0)]], 'rgba(217,164,255,', 0.14, 2);
          damageEnemy(t2, tier.dmg * mul * 0.5, 'magic', {});
        }
      }
    } else if (this.type === 'arc') {
      SFX.zap();
      const chain = [tgt];
      const hit = new Set([tgt]);
      let last = tgt;
      for (let i = 1; i < (tier.chain || 2); i++) {
        let nx = null, dd = 1e9;
        for (const e of game.enemies) {
          if (e.dead || hit.has(e)) continue;
          const d2 = hyp(e.x - last.x, e.y - last.y);
          if (d2 < 86 && d2 < dd) { dd = d2; nx = e; }
        }
        if (!nx) break;
        chain.push(nx); hit.add(nx); last = nx;
      }
      const pts = [[mx, my]];
      let muld = 1;
      for (const e of chain) {
        pts.push([e.x, e.y + (e.fly ? -16 : 0)]);
        damageEnemy(e, tier.dmg * mul * muld, 'magic', { src: 'arc' });
        muld *= 0.85;
      }
      addBeam(pts, 'rgba(255,230,110,', 0.13, 2.2);
    }
    game.muzzle.push({ x: mx, y: my, t: 0, ang: this.angle });
  }
}
let drawBeamHit = null;

/* ---------------- spells ---------------- */
function spellReady(id) { return game.spellCd[id] <= 0 && game.state === 'play' && !game.boonMode; }
function castSpell(id, x, y) {
  if (!spellReady(id)) return false;
  const B = boonSum();
  game.spellCd[id] = SPELLS[id].cd * B.spellcd;
  game.stats.spells++;
  if (game.stats.spells >= 30) ach('spells30');
  if (id === 'meteor') {
    const dmg = 420 + game.wave * 55;
    SFX.meteor();
    game.shake = Math.min(12, game.shake + 8);
    fxRing(x, y, 'rgba(255,140,60,', 130, 0.65, 6);
    fxBurst(x, y, 'rgba(255,160,70,.95)', 30, 240, 6, 0.8);
    fxBurst(x, y, 'rgba(90,80,75,.8)', 14, 120, 8, 1.1);
    for (const e of game.enemies) {
      if (e.dead || e.dist < -4) continue;
      if (hyp(e.x - x, e.y - y) <= 96) damageEnemy(e, dmg, 'magic', { big: 1, ignoreShield: 1 });
    }
    game.aimSpell = null;
  } else if (id === 'blizzard') {
    SFX.blizzard();
    game.vignSnow = game.time + 1.2;
    let n = 0;
    for (const e of game.enemies) {
      if (e.dead || e.dist < -4) continue;
      e.freezeUntil = Math.max(e.freezeUntil, game.time + 1.8 * (1 - (e.def.freezeRes || 0)));
      e.applySlow(0.4, 4.4);
      n++;
      if (RT() < 0.3) fxParticle(e.x + RR(-8, 8), e.y - RR(4, 16), RR(-10, 10), RR(-30, -10), 0.8, 3, 'rgba(200,240,255,.9)', 30);
    }
    fxRing(game.enemies[0] ? game.enemies[0].x : W / 2, H / 2, 'rgba(160,225,255,', W, 0.5, 3, false);
    addText(W / 2, 90, '暴雪冻结 ' + n + ' 敌', '#c8f0ff', 16, -20);
  } else if (id === 'mend') {
    SFX.mend();
    game.lives += 2;
    fxRing(MAP.CORE.x, MAP.CORE.y, 'rgba(150,255,170,', 120, 0.8, 5);
    addText(MAP.CORE.x, MAP.CORE.y - 60, '+2 生命', '#8fdc7a', 16, -30);
  }
  return true;
}

/* =====================================================================
   PART C — 流程：开局 / 波次 / 章节 / 祝福 / 存档 / 结算
   ===================================================================== */

function resetRun(diff) {
  game.diff = diff;
  game.state = 'play';
  game.mapIdx = 0;
  game.gold = 260;
  game.lives = DIFFS[diff].lives;
  game.wave = 0;
  game.waveActive = false;
  game.waveMod = null; game.bloodMoon = false; game.lastBMwave = -3;
  game.combo = 0; game.comboBest = 0; game.bonusDmg = 0; game.masteryPending = null;
  game.keptMastery = {}; game.slowT = 0;
  game.fundDmg = 0; game.fundHaste = 0; game.fundLife = 0;
  game.speed = 1; game.paused = false; game.time = 0;
  game.shake = 0; game.vign = 0; game.vignSnow = 0; game.coreHit = -9;
  game.enemies = []; game.towers = []; game.projectiles = []; game.beams = [];
  game.pulses = []; game.particles = []; game.texts = []; game.muzzle = [];
  game.spawnQueue = []; game.waveT = 0;
  game.build = null; game.sel = null; game.aimSpell = null;
  game.endless = false; game.banner = null;
  game.spellCd = { meteor: 0, blizzard: 0, mend: 0 };
  game.boons = {}; game.boonPicks = 0; game.boonMode = null;
  game.unlocked = new Set(CHAPTERS[0].unlock);
  game.chapterLeaks = 0; game.waveLeaks = 0;
  game.stats = { kills: 0, gold: 0, spent: 0, built: 0, bossKills: 0, spells: 0, noleakWaves: 0 };
  game.achQueue = []; game.achToast = null;
  loadMap(0);
}

function startRun(diff, resumeFrom) {
  resetRun(diff);
  if (resumeFrom) {
    const s = resumeFrom;
    game.wave = s.wave;
    game.gold = s.gold;
    game.lives = s.lives;
    game.boons = s.boons || {};
    game.boonPicks = s.boonPicks || 0;
    game.keptMastery = s.keptMastery || {};
    game.bonusDmg = s.bonusDmg || 0;
    game.fundDmg = s.fundDmg || 0; game.fundHaste = s.fundHaste || 0; game.fundLife = s.fundLife || 0;
    game.mapIdx = s.map || 0;
    game.stats = s.stats || game.stats;
    loadMap(game.mapIdx);
    game.unlocked = new Set();
    for (let c = 0; c <= Math.floor((game.wave - 1) / 10) && c < CHAPTERS.length; c++)
      for (const u of CHAPTERS[c].unlock) game.unlocked.add(u);
    for (const t of (s.towers || [])) {
      if (!TOWERS[t.type]) continue;
      const tw = new Tower(t.type, t.c, t.r);
      tw.level = t.lvl; tw.invested = t.inv; tw.mastery = t.m || 0;
      game.towers.push(tw);
    }
    game.banner = { txt: '继续作战 · 第 ' + game.wave + ' 波', sub: DIFFS[diff].name + '难度', t: 0, life: 2.4, color: '#9fdcff' };
  } else {
    game.banner = { txt: CHAPTERS[0].name, sub: CHAPTERS[0].msg, t: 0, life: 3.6, color: '#9fdcff' };
  }
  refreshCards(); syncHud();
}

function nextWave() {
  if (game.waveActive || game.state !== 'play' || game.boonMode) return;
  game.wave++;
  if (game.wave > game.savedMeta.maxWave) { game.savedMeta.maxWave = game.wave; store.saveMeta(game.savedMeta); }
  game.waveActive = true;
  game.waveT = 0;
  game.waveLeaks = 0;
  game.waveMod = null; game.bloodMoon = false;
  if (game.wave >= 10 && waveBossIdx(game.wave) < 0) {
    game.waveMod = WMODS[Math.floor(RT() * WMODS.length)];
  }
  if (game.wave >= 8 && waveBossIdx(game.wave) < 0 && game.wave > game.lastBMwave + 2 && RT() < 0.24) {
    game.bloodMoon = true; game.lastBMwave = game.wave;
    window.__BM = (window.__BM || '') + game.wave + ' ';
    game.banner = { txt: '血月降临', sub: '魔族狂化 生命/移速/赏金强化 · 清场缴获 + 全局塔伤累积', t: 0, life: 2.8, big: true, color: '#ff8a5e' };
    game.shake = Math.min(9, game.shake + 4);
    SFX.horn();
  } else if (game.waveMod) {
    addText(W / 2, 150, '波次词缀 · ' + game.waveMod.name + '：' + game.waveMod.desc, game.waveMod.color, 14, -30);
  }
  if (boonN('wavegold')) { game.gold += 25; addText(W / 2, 130, '战争债券 +25 ◈', '#ffcf5e', 13, -20); }
  const groups = waveGroups(game.wave);
  game.spawnQueue = [];
  for (const [type, cnt, gap, delay] of groups) {
    for (let i = 0; i < cnt; i++) game.spawnQueue.push({ type, at: delay + i * gap });
  }
  game.spawnQueue.sort((a, b) => a.at - b.at);
  if (waveBossIdx(game.wave) < 0 && game.wave >= 12 && game.wave % 2 === 0 && RT() < 0.8) {
    const pool = game.spawnQueue.filter(q => !ENEMY[q.type] || !ENEMY[q.type].boss);
    if (pool.length) {
      const pick = pool[Math.floor(RT() * pool.length) % pool.length];
      game.spawnQueue.push({ type: pick.type, at: pick.at + 1.2, elite: true });
      addText(W / 2, 174, '精英来袭！高赏金优先集火', '#c9a4ff', 14, -28);
    }
  }
  const bi = waveBossIdx(game.wave);
  if (bi >= 0) SFX.horn();
  else if (game.wave % 10 === 1) {
    const ch = CHAPTERS[Math.floor((game.wave - 1) / 10)];
    if (ch) game.banner = { txt: ch.name, sub: ch.msg, t: 0, life: 3, color: '#9fdcff' };
  }
  syncHud();
}

function updateWave(dt) {
  if (!game.waveActive) return;
  game.waveT += dt;
  while (game.spawnQueue.length && game.spawnQueue[0].at <= game.waveT) {
    const q = game.spawnQueue.shift();
    spawnEnemy(q.type, q.elite ? { elite: 1 } : {});
  }
  if (!game.spawnQueue.length && !game.enemies.some(e => !e.dead)) endWave();
}

function endWave() {
  game.waveActive = false;
  if (window.__PROBE) window.__WLOG = (window.__WLOG || '') + game.wave + ':t' + game.towers.length + '/g' + Math.round(game.gold / 100) + ';';
  const bonus = Math.round(16 + game.wave * 2);
  game.gold += bonus; game.stats.gold += bonus;
  addText(W / 2, 110, '波次奖励 +' + bonus + ' ◈', '#ffd873', 15, -24);
  if (game.waveLeaks === 0) {
    game.stats.noleakWaves++;
    ach('noleak_wave');
    const extra = 10 + game.wave;
    game.gold += extra;
    addText(W / 2, 134, '完美防守 +' + extra + ' ◈', '#8fdc7a', 13, -22);
  }
  if (game.bloodMoon) {
    const bg = 120 + game.wave * 6;
    game.gold += bg; game.stats.gold += bg;
    game.bonusDmg += 0.015;
    addText(W / 2, 158, '血月缴获 +' + bg + ' ◈ · 塔伤永久 +1.5%', '#ff9a6b', 14, -26);
    SFX.ding();
  }
  if (game.wave % 10 === 0 && game.chapterLeaks === 0) ach('noleak_chapter');
  if (game.wave >= TOTAL_WAVES && !game.endless) { winCampaign(); return; }
  // 章节推进（每 10 波；最后一波之后是胜利不算换章）
  if (game.wave % 10 === 0 && game.wave < TOTAL_WAVES) {
    const ch = CHAPTERS[game.wave / 10];
    if (ch && ch.map !== game.mapIdx) {
      let refund = 0;
      for (const t of game.towers) {
        refund += t.invested;
        if (t.mastered()) game.keptMastery[t.type] = t.mastery;
      }
      refund = Math.round(refund * 0.8);
      game.towers = [];
      game.gold += refund;
      game.mapIdx = ch.map;
      loadMap(ch.map);
      game.sel = null; game.build = null;
      game.banner = { txt: ch.name, sub: '防务回收 +' + refund + ' ◈（8 成）· 觉醒专精已继承 · 新战场布防', t: 0, life: 3.4, color: '#ffd873' };
      for (const u of ch.unlock) { game.unlocked.add(u); SFX.ding(); }
      refreshCards();
    } else if (ch) {
      game.banner = { txt: ch.name, sub: ch.msg, t: 0, life: 2.8, color: '#9fdcff' };
      for (const u of ch.unlock) game.unlocked.add(u);
      refreshCards();
    }
    game.chapterLeaks = 0;
  }
  saveCheckpoint();
  if (game.wave % 5 === 0) openBoons();
  syncHud();
}

function winCampaign() {
  const d = game.diff;
  ach('win_' + d);
  game.savedMeta.winsAny = 1;
  if (d === 'normal') game.savedMeta.winNormal = 1;
  if (d === 'hard') game.savedMeta.winHard = 1;
  store.saveMeta(game.savedMeta);
  store.putSave(null);
  game.state = 'win';
  game.paused = false;
  SFX.win();
  showEnd(true);
}
function endGame(win) {
  if (game.state !== 'play') return;
  game.state = win ? 'win' : 'over';
  if (!win) {
    game.aimSpell = null; game.build = null; game.sel = null;
    SFX.lose();
    saveCheckpoint();
  }
  showEnd(win);
}

/* checkpoint：每波结束落盘，标题页可续战 */
function saveCheckpoint() {
  store.putSave({
    v: 2, diff: game.diff, wave: game.wave, gold: game.gold, lives: game.lives,
    boons: game.boons, boonPicks: game.boonPicks, map: game.mapIdx,
    keptMastery: game.keptMastery, bonusDmg: game.bonusDmg,
    fundDmg: game.fundDmg, fundHaste: game.fundHaste, fundLife: game.fundLife,
    stats: game.stats,
    towers: game.towers.map(t => ({ type: t.type, c: t.c, r: t.r, lvl: t.level, inv: t.invested, m: t.mastery })),
  });
}

/* ---------------- boons ---------------- */
function openBoons() {
  const pool = BOONS.filter(b => b.id !== 'life1' || (game.boons.life1 || 0) < 3);
  const picks = [];
  const src = [...pool];
  while (picks.length < 3 && src.length) picks.push(src.splice(Math.floor(RT() * src.length), 1)[0]);
  game.boonMode = picks;
  game.paused = true;
  renderBoons();
  showOv('ovBoon');
}
function pickBoon(id) {
  if (!game.boonMode) return;
  game.boons[id] = (game.boons[id] || 0) + 1;
  game.boonPicks++;
  if (id === 'life1') { game.lives++; addText(MAP.CORE.x, MAP.CORE.y - 60, '生命 +1', '#8fdc7a', 15, -30); }
  if (game.boonPicks >= 12) ach('boons12');
  SFX.boon();
  game.boonMode = null;
  game.paused = false;
  hideOv('ovBoon');
  syncHud();
  saveCheckpoint();
}

/* ---------------- towers：建造/升级/出售 ---------------- */
function towerAt(c, r) { return game.towers.find(t => t.c === c && t.r === r) || null; }
function canPlace(c, r) {
  if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return false;
  if (blocked.has(cellKey(c, r))) return false;
  return !towerAt(c, r);
}
function towerCap() {
  let cap = DIFFS[game.diff].cap || 22;
  if (game.endless) cap += 2 * Math.floor(Math.max(0, game.wave - TOTAL_WAVES) / 10);
  return cap;
}
/* 军费：后期金币出口——直接购买全局战力 */
const FUNDS = {
  dmg: { name: '军火补给', desc: '全塔伤害 +5%', base: 900, step: 250, get n() { return game.fundDmg; } },
  haste: { name: '战鼓动员', desc: '全塔攻速 +5%', base: 900, step: 250, get n() { return game.fundHaste; } },
  life: { name: '要塞增援', desc: '生命 +1', base: 1500, step: 750, get n() { return game.fundLife; } },
};
function fundCost(k) { const f = FUNDS[k]; return Math.round(f.base + f.step * f.n); }
function fundTry(k, slack) {
  const cost = fundCost(k);
  if (game.gold < cost + (slack || 0)) return false;
  game.gold -= cost;
  if (k === 'dmg') game.fundDmg++;
  else if (k === 'haste') game.fundHaste++;
  else { game.fundLife++; game.lives += 1; }
  SFX.ding();
  addText(W / 2, 122, FUNDS[k].name + ' · ' + FUNDS[k].desc, '#ffd873', 14, -30);
  return true;
}
function refreshFund() {
  for (const k of ['dmg', 'haste', 'life']) {
    const row = document.querySelector('.fundRow[data-f="' + k + '"]');
    if (!row) continue;
    const cost = fundCost(k);
    row.querySelector('.fundCost').textContent = cost + ' ◈';
    row.classList.toggle('off', game.gold < cost);
    row.querySelector('.fundN').textContent = '×' + FUNDS[k].n;
  }
}
function toggleFund() {
  const ov = $('ovFund');
  if (!ov) return;
  if (ov.classList.contains('hidden')) { refreshFund(); showOv('ovFund'); }
  else hideOv('ovFund');
}
setInterval(() => { const ov = document.getElementById('ovFund'); if (ov && !ov.classList.contains('hidden') && typeof refreshFund === 'function') refreshFund(); }, 500);
function placeTower(c, r, type) {
  const def = TOWERS[type];
  if (!def || !game.unlocked.has(type)) return false;
  if (game.towers.length >= towerCap()) { toast('塔位已满（上限 ' + towerCap() + '）· 出售或换防再建'); return false; }
  if (game.gold < def.cost || !canPlace(c, r)) return false;
  game.gold -= def.cost;
  game.stats.spent += def.cost; game.stats.built++;
  game.savedMeta.built = (game.savedMeta.built || 0) + 1;
  game.towers.push(new Tower(type, c, r));
  SFX.place();
  if (game.savedMeta.built >= 50) ach('build50');
  const kinds = new Set(game.towers.map(t => t.type));
  if (kinds.size >= 9) ach('all_towers');
  syncHud(); refreshCards();
  return true;
}
/* 专精分支：满级塔觉醒二选一 */
const MASTERY_NAMES = {
  arrow: ['穿甲雨矢', '连弩疾风'], frost: ['极寒符印', '疾风冰阵'], cannon: ['轰爆核心', '疾速炮阵'],
  arc: ['雷狱超载', '疾流导引'], poison: ['瘟疫之核', '疾瘴喷涌'], prism: ['光核聚焦', '疾光阵列'],
  flame: ['焚世炎心', '疾焰风炉'], siege: ['灭国一击', '连发石械'], banner: ['战魂增幅', '疾令旌旗'],
};
function openMasteryUI(t) {
  game.masteryPending = t;
  const ov = el.ovMastery;
  const names = MASTERY_NAMES[t.type] || ['毁灭', '疾风'];
  const kp = game.keptMastery[t.type];
  ov.querySelector('.mstTitle').textContent = TOWERS[t.type].name + ' 满级觉醒 · 选择专精（永久）';
  const cards = ov.querySelectorAll('.mstCard');
  cards[0].innerHTML = '<div class="mstName">' + names[0] + '</div><div class="mstFx">毁灭 · 伤害 +30% · 射程 −6%</div><div class="mstKey">按 1 选择</div>';
  cards[1].innerHTML = '<div class="mstName">' + names[1] + '</div><div class="mstFx">疾风 · 攻速 +28% · 射程 +12%</div><div class="mstKey">按 2 选择</div>';
  if (kp) {
    const inh = ov.querySelector('.mstInh');
    inh.textContent = '3 · 继承已铭刻专精「' + names[kp - 1] + '」';
    inh.classList.remove('hidden');
  } else {
    ov.querySelector('.mstInh').classList.add('hidden');
  }
  for (const cd of cards) cd.classList.remove('mstKept');
  if (kp) cards[kp - 1].classList.add('mstKept');
  ov.dataset.tower = game.towers.indexOf(t);
  showOv('ovMastery');
}
function pickMastery(i) {
  const t = game.masteryPending;
  if (!t) return;
  t.mastery = i;
  game.masteryPending = null;
  game.paused = false;
  hideOv('ovMastery');
  SFX.ding();
  fxRing(t.x, t.y, 'rgba(255,220,120,', 60, 0.6, 4);
  addText(t.x, t.y - 26, (MASTERY_NAMES[t.type] || ['', ''])[i - 1] + '！', '#ffd873', 14, -30);
  refreshSel(); syncHud();
}

function upgradeTower(t) {
  if (!t || t.level >= 3) return false;
  const cost = t.tier().up;
  if (game.gold < cost) return false;
  game.gold -= cost;
  game.stats.spent += cost;
  t.invested += cost;
  t.level++;
  if (t.level === 3 && !t.mastery) {
    if (typeof SIM_N !== 'undefined' && SIM_N > 0) t.mastery = DUMB ? 0 : (game.keptMastery[t.type] || ((game.towers.indexOf(t) % 2) ? 1 : 2));
    else { game.masteryPending = t; game.paused = true; openMasteryUI(t); }
  }
  SFX.place();
  fxRing(t.x, t.y, 'rgba(255,230,140,', 46, 0.4, 3);
  const kinds = new Set(game.towers.map(tt => tt.type));
  if (kinds.size >= 9) ach('all_towers');
  syncHud(); refreshSel(); refreshCards();
  return true;
}
function sellTower(t) {
  if (!t) return;
  const refund = Math.round(t.invested * 0.72);
  game.gold += refund;
  if (t.mastered()) {
    game.keptMastery[t.type] = t.mastery;
    addText(t.x, t.y - 34, '专精已铭刻：' + (MASTERY_NAMES[t.type] || ['', ''])[t.mastery - 1], '#c9a4ff', 11, -30);
  }
  game.towers = game.towers.filter(x => x !== t);
  game.sel = null;
  SFX.sell();
  addText(t.x, t.y - 20, '+' + refund + ' ◈', '#ffd873', 12, -34);
  hideSel();
  syncHud(); refreshCards();
}

/* ---------------- 速度/暂停/通用 ---------------- */
function togglePause(force) {
  if (game.state !== 'play' || game.boonMode) return;
  game.paused = force != null ? force : !game.paused;
  syncHud();
}
function cycleSpeed() {
  game.speed = game.speed === 1 ? 2 : game.speed === 2 ? 4 : 1;
  syncHud();
  SFX.ui();
}

/* =====================================================================
   PART D — DOM / HUD / 输入 / 渲染 / 主循环
   ===================================================================== */

const $ = id => document.getElementById(id);
const el = {
  gold: $('gold'), lives: $('lives'), wave: $('wave'), chapter: $('chapter'),
  cards: $('cards'), boonChips: $('boonChips'),
  ovTitle: $('ovTitle'), ovBoon: $('ovBoon'), ovEnd: $('ovEnd'), ovAch: $('ovAch'), ovHelp: $('ovHelp'), ovCodex: $('ovCodex'), ovMastery: $('ovMastery'), ovFund: $('ovFund'),
  boonCards: $('boonCards'), endTitle: $('endTitle'), endStats: $('endStats'),
  endBtns: $('endBtns'), achList: $('achList'), achCount: $('achCount'),
  btnWave: $('btnWave'), btnPause: $('btnPause'), btnSpeed: $('btnSpeed'),
  spellbar: $('spellbar'), resumeRow: $('resumeRow'), diffRow: $('diffRow'),
  toast: $('toast'),
};
function showOv(id) { el[id] && el[id].classList.remove('hidden'); }
function hideOv(id) { el[id] && el[id].classList.add('hidden'); }

/* ---------------- HUD ---------------- */
let hudT = 0;
function syncHud() {
  el.gold.textContent = fmt(game.gold);
  el.lives.textContent = game.lives;
  const tot = game.endless ? '∞' : TOTAL_WAVES;
  const ch = game.endless ? '无尽模式' : CHAPTERS[Math.min(5, Math.floor(game.wave / 10))].name.split('·')[1] || '';
  el.wave.textContent = '第 ' + game.wave + ' / ' + tot + ' 波' + (game.bloodMoon ? ' 🌑血月' : game.waveMod ? ' ·' + game.waveMod.name : '');
  el.wave.style.color = game.bloodMoon ? '#ff9a6b' : game.waveMod ? game.waveMod.color : '';
  el.chapter.textContent = ch + ' · 🗼' + game.towers.length + '/' + towerCap() + (game.combo >= 5 && game.waveActive ? ' · ⚡' + game.combo + '连杀' : '');
  el.chapter.style.color = game.combo >= 15 ? '#ffcf5e' : '';
  el.btnSpeed.textContent = game.speed + '×';
  el.btnPause.textContent = game.paused ? '▶' : '⏸';
  el.btnWave.disabled = game.waveActive || !!game.boonMode;
  el.btnWave.textContent = game.wave === 0 ? '开始防守 ▶' : game.waveActive ? '战斗中…' : '召唤下一波 ▶';
  // 技能
  for (const id of SPELL_ORDER) {
    const b = $('sp_' + id);
    if (!b) continue;
    const cd = game.spellCd[id];
    b.classList.toggle('cool', cd > 0);
    b.classList.toggle('aiming', game.aimSpell === id);
    b.title = SPELLS[id].name + '（' + SPELLS[id].key + '）：' + SPELLS[id].desc + (cd > 0 ? '\n冷却 ' + Math.ceil(cd) + 's' : '\n就绪');
    const m = b.querySelector('.cdmask');
    if (m) m.style.height = cd > 0 ? Math.round(cd / (SPELLS[id].cd * boonSum().spellcd) * 100) + '%' : '0%';
    const k = b.querySelector('.cdn');
    if (k) k.textContent = cd > 0 ? Math.ceil(cd) + 's' : SPELLS[id].key;
  }
  // 祝福 chips
  const chips = [];
  for (const [id, n] of Object.entries(game.boons)) {
    const b = BOONS.find(x => x.id === id);
    if (b && n > 0) chips.push('<span class="bchip" style="border-color:' + b.color + '55" title="' + b.name + '：' + b.desc + ' ×' + n + '">' + b.name + (n > 1 ? ' ×' + n : '') + '</span>');
  }
  el.boonChips.innerHTML = chips.join('');
  // 商店可用性
  for (const t of TOWER_ORDER) {
    const card = $('card_' + t);
    if (!card) continue;
    const ok = game.unlocked.has(t) && game.gold >= TOWERS[t].cost;
    card.classList.toggle('off', !ok);
    card.classList.toggle('sel', game.build === t);
    card.classList.toggle('lock', !game.unlocked.has(t));
  }
}
function refreshCards() {
  let html = '';
  for (const t of TOWER_ORDER) {
    const d = TOWERS[t];
    const lk = !game.unlocked.has(t);
    const chName = CHAPTERS[d.ch - 1] ? CHAPTERS[d.ch - 1].name.split('·')[1] || '' : '';
    html += '<div class="card" id="card_' + t + '" data-t="' + t + '">' +
      '<div class="ic"><canvas width="44" height="44" data-icon="' + t + '"></canvas></div>' +
      '<div class="nm">' + d.name + '</div>' +
      '<div class="cost">◈ ' + d.cost + '</div>' +
      (lk ? '<div class="lkTag">第' + d.ch + '章解锁' + '</div>' : '<div class="key">' + d.hot + '</div>') +
      '</div>';
  }
  el.cards.innerHTML = html;
  el.cards.querySelectorAll('canvas[data-icon]').forEach(cv => drawTowerIcon(cv, cv.dataset.icon));
  el.cards.querySelectorAll('.card').forEach(cd => {
    cd.addEventListener('click', () => {
      const t = cd.dataset.t;
      if (!game.unlocked.has(t)) { toast('该塔将在 ' + (CHAPTERS[TOWERS[t].ch - 1] || {}).name + ' 解锁'); SFX.ui(); return; }
      SFX.ui();
      game.build = game.build === t ? null : t;
      game.aimSpell = null;
      game.sel = null; hideSel();
      syncHud();
    });
    cd.addEventListener('mouseenter', () => {
      const d = TOWERS[cd.dataset.t];
      $('tip').innerHTML = '<b>' + d.name + '</b> ◈' + d.cost + '<br>' + d.tag + '<br><span class="mut">' + d.desc + '</span>';
      $('tip').classList.remove('hidden');
    });
    cd.addEventListener('mouseleave', () => $('tip').classList.add('hidden'));
  });
  syncHud();
}
function toast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.toast.classList.add('hidden'), 1800);
}

/* ---------------- 选中面板 ---------------- */
const sel = $('sel');
function refreshSel() {
  const t = game.sel;
  if (!t) { hideSel(); return; }
  const d = TOWERS[t.type], tier = t.tier();
  $('selName').textContent = d.name + ' Lv.' + (t.level + 1);
  const dps = d.kind === 'none' ? '光环 +' + Math.round(tier.aura * 100) + '% 伤害'
    : '单发 ~' + Math.round(tier.dmg * t.dmgMul() * (tier.cone ? 8 : 1) / tier.cd) + (tier.splash ? '（溅射）' : '') + ' dps';
  $('selDps').textContent = dps;
  const info = [];
  if (d.kind !== 'none') info.push('伤害 ' + Math.round(tier.dmg * t.dmgMul()) + ' · 射程 ' + Math.round(t.range()));
  if (tier.slow) info.push('减速 ' + Math.round(tier.slow * 100) + '%');
  if (tier.chain) info.push('连锁 ' + tier.chain + ' 目标');
  if (tier.splash) info.push('溅射 ' + Math.round(tier.splash * boonSum().spl));
  if (tier.pierce) info.push('穿甲 ' + Math.round(tier.pierce * 100) + '%');
  $('selInfo').textContent = info.join(' · ');
  const ub = $('selUp'), sb = $('selSell');
  if (t.level >= 3) {
    if (t.mastery) { ub.textContent = '已觉醒 ★' + (MASTERY_NAMES[t.type] || ['', ''])[t.mastery - 1]; ub.disabled = true; }
    else { ub.textContent = '待觉醒 · 点击选择专精'; ub.disabled = false; }
  } else {
    const nx = d.tiers[t.level + 1];
    ub.innerHTML = '升级 ◈' + tier.up + '<br><span class="mut">' + (d.kind === 'none' ? '光环→+' + Math.round(nx.aura * 100) + '%' : '伤害→' + nx.dmg) + (nx.twin ? ' 连发' : '') + (nx.stun ? ' 眩晕' : '') + (nx.freeze ? ' 冻结' : '') + (nx.fork ? ' 折射' : '') + (nx.burn ? ' 灼烧' : '') + (nx.haste ? ' 攻速' : '') + '</span>';
    ub.disabled = game.gold < tier.up;
  }
  sb.textContent = '出售 +' + Math.round(t.invested * 0.72) + ' ◈';
  const x = clamp(t.x + 26, 10, W - 240), y = clamp(t.y - 60, 60, H - 190);
  sel.style.left = (x / W * 100) + '%';
  sel.style.top = ((y - 40) / 704 * 100) + '%';
  sel.classList.remove('hidden');
}
function hideSel() { sel.classList.add('hidden'); }

/* ---------------- 祝福 UI ---------------- */
function renderBoons() {
  if (!game.boonMode) return;
  el.boonCards.innerHTML = game.boonMode.map(b =>
    '<div class="boonC" data-id="' + b.id + '" style="--bc:' + b.color + '"><div class="bico"></div><div class="bn">' + b.name + '</div><div class="bd">' + b.desc + '</div></div>').join('');
  el.boonCards.querySelectorAll('.boonC').forEach(c => c.addEventListener('click', () => pickBoon(c.dataset.id)));
  const w = $('boonWave');
  if (w) w.textContent = game.wave >= TOTAL_WAVES ? '无尽强化 · 第 ' + game.wave + ' 波' : '第 ' + game.wave + ' 波达成 · 战意凝聚';
}

/* ---------------- 成就 UI ---------------- */
function renderAch() {
  const n = Object.keys(game.ach).length;
  el.achCount.textContent = n + ' / ' + ACH.length;
  el.achList.innerHTML = ACH.map(a => {
    const ok = game.ach[a.id];
    return '<div class="achRow' + (ok ? ' ok' : '') + '"><span class="ai">' + (ok ? '★' : '☆') + '</span><b>' + a.name + '</b><span class="ad">' + a.desc + '</span></div>';
  }).join('');
}

/* ---------------- 怪物图鉴 ---------------- */
const CODEX = [
  ['常规部队', [
    ['goblin', '成群杂兵，任何塔都能清'], ['wolf', '快速地面——霜语塔减速'], ['runner', '极速流——溅射+减速伺候'],
    ['orc', '前期肉盾——便宜塔处理'], ['zealot', '残血狂暴提速——一套爆发带走'], ['assassin', '漏怪扣 2 血——别留防空级盲区'],
  ]],
  ['重甲与法印', [
    ['shield', '物理减伤 50%——燃烬/腐毒是答案'], ['knight', '重甲 −37% 物理、魔法 +40% 受伤——法塔盛宴'],
    ['warder', '魔法减伤 80%——劲弩/轰击/破城打它'], ['golem', '重甲血厚——魔法与破城更疼'],
    ['beast', '血牛·六成冰抗——集火或陨石'], ['siege', '远程光束瘫痪塔——塔散开摆，Q 点杀'],
  ]],
  ['异术与空袭（飞行怪直飞水晶）', [
    ['bat', '轻飞行——S 形直飞，无视道路'], ['wraith', '抗魔飞行——物理塔更疼'], ['sprite', '极速空袭群——对空 dps 要足'],
    ['shade', '周期性不可被塔锁定——陨石/暴雪照样命中'], ['bomber', '死亡爆炸瘫痪周围塔——塔位别挤'],
    ['drummer', '光环令全体敌军 +22% 移速——优先爆发'], ['shaman', '祭司群疗——先杀治疗'],
    ['splitter', '死后分裂三份——溅射处理'],
  ]],
  ['魔族首领', [
    [null, '狂怒', 'B1'], [null, '再生', 'B2'], [null, '塔麻痹', 'B3'], [null, '瞬移飞行', 'B4'], [null, '分裂碎片', 'B5'], [null, '完全体', 'B6'],
  ]],
];
const BOSS_TIPS = { B1: '半血狂怒提速——留减速', B2: '持续回血——爆发终结别拖', B3: '周期性全场塔麻痹——攒技能', B4: '瞬移飞行——纯对空火力决战', B5: '死后分裂碎片——溅射收尾', B6: '硬化+分裂+护航——全力一战' };
function codexProxy(k, bk) {
  const def = bk ? BOSSES[parseInt(bk.slice(1), 10) - 1] : ENEMY[k];
  return {
    type: bk || k, def, boss: !!bk, gimmick: def.gimmick || null,
    x: 20, y: 23, r: Math.min(def.r, bk ? 10.5 : 10), fly: !!def.fly, facing: 1,
    wob: 1.3, phased: false, affix: null, hitFlash: 0, freezeUntil: 0, stunUntil: 0, slowUntil: 0, slowF: 0,
    poison: null, burnUntil: 0, hp: def.hp, maxHp: def.hp, dist: 6, bossIdx: bk ? parseInt(bk.slice(1), 10) - 1 : null,
    raged: false, shieldUntil: 0,
  };
}
function renderCodex() {
  const list = $('codexList');
  list.innerHTML = '';
  const time = Date.now() / 1000;
  for (const [sec, entries] of CODEX) {
    const h = document.createElement('div');
    h.className = 'cdxSec'; h.textContent = sec;
    list.appendChild(h);
    for (const en of entries) {
      const isBoss = en.length === 3;
      const key = isBoss ? en[2] : en[0];
      const e = codexProxy(isBoss ? null : key, isBoss ? key : null);
      const tip = isBoss ? BOSS_TIPS[key] : en[1];
      const row = document.createElement('div');
      row.className = 'cdxRow' + (isBoss ? ' boss' : '');
      const cv = document.createElement('canvas');
      cv.width = 40; cv.height = 30;
      const cx = cv.getContext('2d');
      cx.save();
      try { drawEnemy(cx, e, time); } catch (err) { void err; }
      cx.restore();
      const nm = document.createElement('b'); nm.textContent = e.def.name;
      const tx = document.createElement('span'); tx.className = 'ct'; tx.textContent = tip;
      row.appendChild(cv); row.appendChild(nm); row.appendChild(tx);
      list.appendChild(row);
    }
  }
  const fr = document.createElement('div');
  fr.className = 'achRow';
  fr.innerHTML = '<span class="ai">✦</span><b>精英词缀</b><span class="ad">狂暴 +28% 速 · 硬化 +10 甲 · 疾风 +35% 速 −30% 血（12 波后 7% 概率）</span>';
  list.appendChild(fr);
}

/* ---------------- 结算 UI ---------------- */
function showEnd(win) {
  const s = game.stats;
  el.endTitle.textContent = win ? (game.endless ? '无尽 · 战至最后' : '魔潮已退，水晶无恙！') : '水晶破碎…';
  el.endTitle.className = win ? 'win' : 'lose';
  el.endStats.innerHTML =
    row('抵达波次', game.wave + (game.endless ? '（无尽）' : ' / ' + TOTAL_WAVES)) +
    row('击杀', s.kills) + row('击杀首领', s.bossKills) +
    row('释放技能', s.spells) + row('获取金币', fmt(s.gold)) +
    row('塔建造/阵亡余', s.built + ' / ' + game.towers.length) +
    row('完美防守波', s.noleakWaves) + row('难度', DIFFS[game.diff].name);
  el.endBtns.innerHTML =
    (win && !game.endless ? '<button class="mbtn big" id="btnEndless">进入无尽 ▶</button>' : '') +
    '<button class="mbtn" id="btnRetry">再战一局</button>' +
    '<button class="mbtn" id="btnMenu">回标题</button>';
  const be = $('btnEndless'); if (be) be.onclick = () => { hideOv('ovEnd'); startEndless(); };
  const br = $('btnRetry'); if (br) br.onclick = () => { hideOv('ovEnd'); startRun(game.diff, null); nextWave(); };
  const bm = $('btnMenu'); if (bm) bm.onclick = () => { hideOv('ovEnd'); toMenu(); };
  showOv('ovEnd');
  syncHud();
  store.saveMeta(game.savedMeta);
  function row(k, v) { return '<div class="erow"><span>' + k + '</span><b>' + v + '</b></div>'; }
}
function startEndless() {
  game.state = 'play';
  game.endless = true;
  game.banner = { txt: '无尽模式', sub: '魔潮不会停歇——坚持到你能坚持的极限', t: 0, life: 3, color: '#d9a4ff' };
  saveCheckpoint();
  nextWave();
}
function toMenu() {
  game.state = 'menu';
  game.paused = true;
  hideSel();
  renderTitle();
  showOv('ovTitle');
}

/* ---------------- 标题 ---------------- */
function renderTitle() {
  const m = game.savedMeta;
  const save = store.save();
  el.resumeRow.style.display = save && save.wave > 0 ? 'flex' : 'none';
  if (save && save.wave > 0) {
    $('btnResume').innerHTML = '继续作战 · ' + DIFFS[save.diff].name + ' 第 ' + save.wave + ' 波';
    $('btnResume').dataset.key = save.diff;
  }
  const btns = $('diffBtns');
  btns.innerHTML = '';
  const defs = [
    ['normal', '普通 · 12 生命 · 24 塔位'],
    ['hard', '困难 · 10 生命 · 20 塔位（敌血 ×1.4）' + (canDiff('hard') ? '' : ' 🔒')],
    ['night', '噩梦 · 6 生命 · 17 塔位（敌血 ×1.85）' + (canDiff('night') ? '' : ' 🔒')],
  ];
  for (const [k, label] of defs) {
    const b = document.createElement('button');
    b.className = 'diffB ' + k + (game.diff === k ? ' on' : '');
    b.textContent = label;
    if (!canDiff(k)) { b.classList.add('lockd'); b.title = '锁定：困难=抵达 20 波或任一通关；噩梦=困难通关'; }
    b.onclick = () => { if (canDiff(k)) { game.diff = k; SFX.ui(); renderTitle(); } };
    btns.appendChild(b);
  }
  const best = m.maxWave ? '<div class="tBest">最佳战绩：第 ' + m.maxWave + ' 波 · 生涯击杀 ' + (m.kills || 0) + ' · 成就 ' + Object.keys(game.ach).length + '/' + ACH.length + '</div>' : '';
  const tb = $('titleBest'); if (tb) tb.innerHTML = best;
}
function canDiff(k) {
  const m = game.savedMeta;
  if (k === 'normal') return true;
  if (k === 'hard') return (m.maxWave || 0) >= 20 || m.winsAny;
  if (k === 'night') return m.winHard;
  return false;
}

/* ---------------- 输入 ---------------- */
function canvasPos(ev) {
  const rect = cvs.getBoundingClientRect();
  return { x: (ev.clientX - rect.left) / rect.width * W, y: (ev.clientY - rect.top) / rect.height * H };
}
cvs.addEventListener('mousemove', ev => {
  const p = canvasPos(ev);
  game.mouseX = p.x; game.mouseY = p.y;
  const c = Math.floor(p.x / CELL), r = Math.floor(p.y / CELL);
  game.hoverCell = (c >= 0 && r >= 0 && c < COLS && r < ROWS) ? [c, r] : null;
  cvs.style.cursor = (game.build || game.aimSpell) ? 'crosshair' : (game.hoverCell && !blocked.has(cellKey(c, r)) && towerAt(c, r)) ? 'pointer' : 'default';
});
cvs.addEventListener('mouseleave', () => { game.hoverCell = null; });
cvs.addEventListener('mousedown', ev => {
  if (ev.button === 2) return;
  SFX.init();
  if (game.state !== 'play') return;
  const p = canvasPos(ev);
  const c = Math.floor(p.x / CELL), r = Math.floor(p.y / CELL);
  if (game.aimSpell === 'meteor') { castSpell('meteor', p.x, p.y); syncHud(); return; }
  if (game.aimSpell === 'blizzard') { castSpell('blizzard'); syncHud(); return; }
  if (game.build) {
    if (placeTower(c, r, game.build)) {
      if (!(ev.shiftKey) && game.gold < TOWERS[game.build].cost) game.build = null;
    } else { SFX.leak(); toast(blocked.has(cellKey(c, r)) ? '此处无法建造' : game.gold < TOWERS[game.build].cost ? '金币不足' : '已有防御塔'); }
    return;
  }
  const t = towerAt(c, r);
  if (t) { game.sel = t; refreshSel(); SFX.ui(); }
  else { game.sel = null; hideSel(); }
});
cvs.addEventListener('contextmenu', ev => {
  ev.preventDefault();
  if (game.build || game.aimSpell) { game.build = null; game.aimSpell = null; syncHud(); SFX.ui(); }
  else { game.sel = null; hideSel(); }
});
window.addEventListener('keydown', ev => {
  if (ev.repeat) return;
  const k = ev.key.toLowerCase();
  if (k === ' ' && game.state === 'play' && !game.boonMode) { ev.preventDefault(); if (!game.waveActive) nextWave(); return; }
  if (k === 'escape') { game.build = null; game.aimSpell = null; game.sel = null; hideSel(); if (el.ovFund && !el.ovFund.classList.contains('hidden')) hideOv('ovFund'); syncHud(); return; }
  if (k === 'g' && game.state === 'play' && !game.boonMode) { toggleFund(); return; }
  if (game.state !== 'play' || game.boonMode) return;
  if (game.masteryPending && (k === '1' || k === '2')) { pickMastery(parseInt(k, 10)); return; }
  if (game.masteryPending && k === '3') { const kp = game.keptMastery[game.masteryPending.type]; if (kp) pickMastery(kp); return; }
  if (k >= '1' && k <= '9') {
    const idx = parseInt(k, 10) - 1;
    const t = TOWER_ORDER[idx];
    if (t && game.unlocked.has(t)) { game.build = game.build === t ? null : t; game.aimSpell = null; syncHud(); }
    else if (t) toast('该塔将在 ' + (CHAPTERS[TOWERS[t].ch - 1] || {}).name + ' 解锁');
  }
  else if (k === 'q') { game.aimSpell = game.aimSpell === 'meteor' ? null : 'meteor'; syncHud(); }
  else if (k === 'w') { castSpell('blizzard'); game.aimSpell = null; syncHud(); }
  else if (k === 'e') { castSpell('mend'); syncHud(); }
  else if (k === 'p') togglePause();
  else if (k === 'f') cycleSpeed();
  else if (k === 'u' && game.sel) upgradeTower(game.sel);
  else if (k === 's' && game.sel) sellTower(game.sel);
  else if (k === 'a') { renderAch(); showOv('ovAch'); }
  else if (k === 'b') { renderCodex(); showOv('ovCodex'); }
});
el.btnWave.addEventListener('click', () => { SFX.init(); nextWave(); });
el.btnPause.addEventListener('click', () => togglePause());
el.btnSpeed.addEventListener('click', cycleSpeed);
$('btnMute').addEventListener('click', () => { SFX.init(); SFX.muted = !SFX.muted; $('btnMute').textContent = SFX.muted ? '🔇' : '🔊'; });
$('btnAch').addEventListener('click', () => { renderAch(); showOv('ovAch'); });
$('btnCloseAch').addEventListener('click', () => hideOv('ovAch'));
$('btnCodex').addEventListener('click', () => { renderCodex(); showOv('ovCodex'); });
$('btnCloseCodex').addEventListener('click', () => hideOv('ovCodex'));
const bf = $('btnFund');
if (bf) bf.addEventListener('click', toggleFund);
const bcf = $('btnCloseFund');
if (bcf) bcf.addEventListener('click', () => hideOv('ovFund'));
for (const row of document.querySelectorAll('.fundRow')) {
  row.addEventListener('click', () => {
    if (fundTry(row.dataset.f, 0)) {
      refreshFund(); syncHud();
    }
  });
}
for (const card of document.querySelectorAll('.mstCard')) {
  card.addEventListener('click', () => pickMastery(parseInt(card.dataset.m, 10)));
}
for (const id of SPELL_ORDER) {
  const b = $('sp_' + id);
  if (!b) continue;
  b.addEventListener('click', () => {
    if (!spellReady(id)) { SFX.ui(); return; }
    if (id === 'meteor') { game.aimSpell = game.aimSpell === 'meteor' ? null : 'meteor'; syncHud(); }
    else if (id === 'blizzard') { castSpell('blizzard'); }
    else if (id === 'mend') castSpell('mend');
    syncHud();
  });
}
$('btnStart').addEventListener('click', () => {
  SFX.init(); SFX.ui();
  hideOv('ovTitle');
  startRun(game.diff, null);
});
$('btnResume').addEventListener('click', () => {
  SFX.init();
  const save = store.save();
  if (!save) return;
  hideOv('ovTitle');
  startRun(save.diff, save);
});
$('btnHelp').addEventListener('click', () => { SFX.ui(); showOv('ovHelp'); });
$('btnCloseHelp').addEventListener('click', () => { SFX.ui(); hideOv('ovHelp'); });
$('selUp').addEventListener('click', () => {
  const s = game.sel;
  if (!s) return;
  if (s.level >= 3) { if (!s.mastery) { game.paused = true; openMasteryUI(s); } return; }
  upgradeTower(s);
});
$('selSell').addEventListener('click', () => { if (game.sel) sellTower(game.sel); });

/* ---------------- 渲染 ---------------- */
function drawTowerIcon(cv, type) {
  const c = cv.getContext('2d');
  c.clearRect(0, 0, 44, 44);
  c.save(); c.translate(22, 24);
  drawTowerArt(c, type, 0, 0, 3, 0, 0, 0, true);
  c.restore();
}
function drawTowerArt(c, type, x, y, level, angle, time, tase, icon) {
  const s = icon ? 1.15 : 1;
  c.save(); c.translate(x, y); c.scale(s, s);
  if (!icon) {
    c.fillStyle = 'rgba(0,0,0,.35)';
    c.beginPath(); c.ellipse(0, 13, 15, 6, 0, 0, TAU); c.fill();
  }
  // 底座
  c.fillStyle = '#3a4450';
  c.fillRect(-13, 4, 26, 9);
  c.fillStyle = '#2c333c';
  c.fillRect(-11, 10, 22, 5);
  const col = TOWERS[type].color;
  const glow = 0.55 + 0.2 * Math.sin(time * 3 + x);
  if (type === 'banner') {
    c.fillStyle = '#4a3a26';
    c.fillRect(-2, -30, 4, 34);
    const wave = Math.sin(time * 5 + x * 0.1) * 2;
    c.fillStyle = col;
    c.beginPath(); c.moveTo(2, -30); c.lineTo(18 + level * 2, -26 + wave); c.lineTo(2, -18); c.closePath(); c.fill();
    c.fillStyle = 'rgba(255,255,255,.35)';
    c.beginPath(); c.arc(0, -32, 3, 0, TAU); c.fill();
    for (let i = 0; i <= level; i++) { c.fillStyle = '#ffd76e'; c.fillRect(-8 + i * 5, 2, 3, 3); }
  } else {
    // 塔身
    c.fillStyle = '#586574';
    c.beginPath(); c.moveTo(-10, 6); c.lineTo(-7, -12); c.lineTo(7, -12); c.lineTo(10, 6); c.closePath(); c.fill();
    c.fillStyle = '#46525f';
    c.fillRect(-8, -14, 16, 4);
    // 等级齿
    for (let i = 0; i <= level; i++) { c.fillStyle = col; c.fillRect(-9 + i * 5, -1, 3, 3); }
    c.save(); c.rotate(type === 'frost' || type === 'poison' ? 0 : angle + Math.PI / 2);
    if (type === 'arrow') {
      c.fillStyle = '#6b543a';
      c.fillRect(-2.5, -22 - level * 1.5, 5, 20 + level * 1.5);
      c.strokeStyle = col; c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(-6, -20 - level * 1.5); c.lineTo(0, -26 - level * 1.5); c.lineTo(6, -20 - level * 1.5); c.stroke();
      if (level >= 3) { c.strokeStyle = '#fff2b8'; c.beginPath(); c.moveTo(-6, -18 - 2); c.lineTo(0, -24 - 2); c.lineTo(6, -18 - 2); c.stroke(); }
    } else if (type === 'cannon' || type === 'siege') {
      const big = type === 'siege' ? 1.3 : 1;
      c.fillStyle = '#39424c';
      c.fillRect(-4.6 * big, -24 * big - level * 1.6, 9.2 * big, 22 * big);
      c.fillStyle = col;
      c.fillRect(-4.6 * big, -24 * big - level * 1.6, 9.2 * big, 3.4);
    } else if (type === 'arc') {
      c.strokeStyle = '#7c8894'; c.lineWidth = 2.4;
      c.beginPath(); c.moveTo(0, -12); c.lineTo(0, -22); c.stroke();
      c.fillStyle = col;
      c.save(); c.rotate(time * 2);
      for (let i = 0; i < 3; i++) { c.rotate(TAU / 3); c.fillRect(4, -1.4, 7, 2.8); }
      c.restore();
      drawGlow(c, 'rgba(255,224,102,', 0, -24, 14, glow * 0.5);
    } else if (type === 'prism') {
      c.fillStyle = 'rgba(217,164,255,.9)';
      c.save(); c.translate(0, -24); c.rotate(time * 1.4);
      c.beginPath(); c.moveTo(0, -9 - level); c.lineTo(7, 0); c.lineTo(0, 9 + level); c.lineTo(-7, 0); c.closePath(); c.fill();
      c.restore();
      drawGlow(c, 'rgba(217,164,255,', 0, -24, 16, glow * 0.6);
    } else if (type === 'flame') {
      c.fillStyle = '#4f4038';
      c.beginPath(); c.arc(0, -18, 8, 0, TAU); c.fill();
      c.fillStyle = col;
      c.beginPath(); c.arc(0, -18, 4, 0, TAU); c.fill();
      c.fillStyle = '#38302b';
      c.fillRect(-2, -26, 4, 8);
    }
    c.restore();
    if (type === 'frost') {
      c.fillStyle = 'rgba(127,231,255,.85)';
      c.save(); c.rotate(-time * 1.2);
      c.beginPath(); c.moveTo(0, -26); c.lineTo(6, -18); c.lineTo(0, -12); c.lineTo(-6, -18); c.closePath(); c.fill();
      c.restore();
      drawGlow(c, 'rgba(127,231,255,', 0, -19, 15, glow * 0.55);
    }
    if (type === 'poison') {
      c.fillStyle = 'rgba(155,224,111,.9)';
      c.beginPath(); c.arc(0, -20, 6 + Math.sin(time * 4 + x) * 1.2, 0, TAU); c.fill();
      c.fillStyle = 'rgba(220,255,190,.7)';
      c.beginPath(); c.arc(-2, -22, 2, 0, TAU); c.fill();
    }
  }
  if (tase) {
    c.fillStyle = 'rgba(160,225,255,.5)';
    c.beginPath(); c.arc(0, -14, 15, 0, TAU); c.fill();
    c.strokeStyle = '#cfeeff'; c.lineWidth = 1.4;
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * TAU + time;
      c.beginPath(); c.moveTo(Math.cos(a) * 10, -14 + Math.sin(a) * 10); c.lineTo(Math.cos(a) * 14, -14 + Math.sin(a) * 14); c.stroke();
    }
  }
  c.restore();
}

function drawEnemy(c, e, time) {
  const flyLift = e.fly ? -16 : 0;
  const x = e.x, y = e.y + flyLift;
  const wob = Math.sin(e.wob) * (e.fly ? 1 : 0.6);
  // 影子
  c.fillStyle = 'rgba(0,0,0,' + (e.fly ? 0.2 : 0.32) + ')';
  c.beginPath(); c.ellipse(e.x, e.y + e.r * 0.7, e.r * (e.fly ? 0.62 : 0.9), e.r * 0.32, 0, 0, TAU); c.fill();
  // 词缀光环
  if (e.affix) {
    const af = AFFIXES[e.affix];
    const pg = 0.5 + 0.25 * Math.sin(time * 5);
    c.strokeStyle = af.ring + pg + ')';
    c.lineWidth = 2;
    c.beginPath(); c.ellipse(e.x, e.y + e.r * 0.6, e.r + 5, (e.r + 5) * 0.4, 0, 0, TAU); c.stroke();
  }
  // 精英金色脉动光环 + 头顶菱形标
  if (e.elite) {
    const pg = 0.55 + 0.3 * Math.sin(time * 4 + e.wob);
    c.strokeStyle = 'rgba(201,164,255,' + pg + ')';
    c.lineWidth = 2.4;
    c.beginPath(); c.arc(x, y, e.r + 6, 0, TAU); c.stroke();
    c.strokeStyle = 'rgba(255,216,115,' + (pg * 0.8) + ')';
    c.lineWidth = 1.4;
    c.beginPath(); c.arc(x, y, e.r + 9.5, time % TAU, (time % TAU) + 2.1); c.stroke();
    c.fillStyle = '#c9a4ff';
    c.save(); c.translate(x, y - e.r - 13); c.rotate(Math.PI / 4);
    c.fillRect(-3.2, -3.2, 6.4, 6.4); c.restore();
  }
  c.save(); c.translate(x, y + wob);
  if (e.hitFlash > game.time) { c.globalAlpha = 1; }
  const flash = e.hitFlash > game.time;
  const body = flash ? '#ffffff' : e.def.body;
  const dark = flash ? '#dddddd' : shade(e.def.body, -22);
  const r = e.r;
  c.scale(e.facing, 1);
  // 翅膀（飞行）
  if (e.fly) {
    const wa = Math.sin(e.wob * 1.6) * 0.9;
    c.fillStyle = e.gimmick === 'blink' ? 'rgba(120,90,190,.75)' : e.type === 'wraith' ? 'rgba(160,225,255,.32)' : e.type === 'sprite' ? 'rgba(170,245,255,.55)' : 'rgba(150,110,210,.6)';
    for (const sgn of [-1, 1]) {
      c.save(); c.rotate(sgn * (0.5 + wa * 0.5));
      c.beginPath(); c.moveTo(0, -2); c.quadraticCurveTo(-r * 1.7 * sgn, -r * 1.1, -r * 2.1 * sgn, r * 0.2); c.quadraticCurveTo(-r * sgn, r * 0.1, 0, r * 0.3); c.closePath(); c.fill();
      c.restore();
    }
  }
  // 主体形状分类
  const type = e.type;
  if (e.phased) c.globalAlpha = 0.34;
  c.fillStyle = body;
  if (['goblin', 'orc', 'zealot', 'shaman', 'assassin', 'shield', 'knight', 'warder', 'drummer', 'runner', 'shade'].includes(type)) {
    c.beginPath(); c.ellipse(0, 0, r * 0.86, r, 0, 0, TAU); c.fill();
    c.fillStyle = dark;
    c.beginPath(); c.arc(r * 0.15, -r * 0.55, r * 0.6, 0, TAU); c.fill();
    c.fillStyle = flash ? '#fff' : '#1c160f';
    c.beginPath(); c.arc(r * 0.34, -r * 0.6, r * 0.13, 0, TAU); c.arc(r * 0.05, -r * 0.62, r * 0.13, 0, TAU); c.fill();
    const step = Math.sin(e.wob * 2);
    c.strokeStyle = dark; c.lineWidth = r * 0.24;
    c.beginPath(); c.moveTo(-r * 0.3, r * 0.75); c.lineTo(-r * 0.3 + step * 3, r * 1.25); c.stroke();
    c.beginPath(); c.moveTo(r * 0.3, r * 0.75); c.lineTo(r * 0.3 - step * 3, r * 1.25); c.stroke();
    if (type === 'zealot') { c.fillStyle = '#e8d8b8'; c.fillRect(-r * 0.2, -r * 1.5, r * 0.16, r * 1.1); c.beginPath(); c.arc(0, -r * 1.5, r * 0.32, 0, TAU); c.fillStyle = '#ffe89a'; c.fill(); }
    if (type === 'shaman') {
      c.strokeStyle = '#7a5a3a'; c.lineWidth = 2.4;
      c.beginPath(); c.moveTo(r * 0.6, r * 0.9); c.lineTo(r * 0.8, -r * 1.3); c.stroke();
      drawGlow(c, 'rgba(140,240,120,', r * 0.8, -r * 1.4, 9, 0.7 + 0.3 * Math.sin(time * 6));
    }
    if (type === 'shield') {
      c.fillStyle = flash ? '#fff' : '#c9bda3';
      c.fillRect(r * 0.62, -r * 1.1, r * 0.5, r * 2);
      c.fillStyle = 'rgba(90,75,55,.8)';
      c.fillRect(r * 0.62, -r * 0.15, r * 0.5, r * 0.3);
    }
    if (type === 'assassin' && e.dist > 0) {
      c.fillStyle = 'rgba(120,90,200,.16)';
      c.beginPath(); c.ellipse(-r * 1.4, 0, r * 0.9, r * 0.6, 0, 0, TAU); c.fill();
    }
    if (type === 'runner' && e.dist > 0) {
      c.strokeStyle = 'rgba(230,240,120,.5)'; c.lineWidth = 1.6;
      for (const off of [-0.4, 0.1, 0.55]) {
        c.beginPath(); c.moveTo(-r * 1.1, r * off * 2); c.lineTo(-r * (1.9 + Math.sin(e.wob * 3 + off * 9) * 0.3), r * off * 2); c.stroke();
      }
    }
    if (type === 'knight') {
      c.fillStyle = flash ? '#fff' : '#78828f';
      c.fillRect(-r * 0.5, -r * 0.35, r * 1.05, r * 1.1);
      c.strokeStyle = 'rgba(210,225,255,.75)'; c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(-r * 0.5, -r * 0.05); c.lineTo(r * 0.55, -r * 0.05); c.stroke();
      c.fillStyle = 'rgba(120,190,255,' + (0.5 + 0.3 * Math.sin(time * 5)) + ')';
      c.fillRect(r * 0.02, -r * 0.66, r * 0.42, r * 0.12);
      drawGlow(c, 'rgba(120,190,255,', r * 0.2, -r * 0.6, 8, 0.3 + 0.12 * Math.sin(time * 5));
    }
    if (type === 'warder') {
      c.strokeStyle = 'rgba(190,130,255,.7)'; c.lineWidth = 1.8;
      const wa2 = time * 2.4;
      c.beginPath(); c.ellipse(0, -r * 0.1, r * 1.25, r * 0.5, 0, 0, TAU); c.stroke();
      c.fillStyle = '#e3c6ff';
      for (const s2 of [0, TAU / 3, TAU * 2 / 3]) {
        c.beginPath(); c.arc(Math.cos(wa2 + s2) * r * 1.25, -r * 0.1 + Math.sin(wa2 + s2) * r * 0.5, 2.2, 0, TAU); c.fill();
      }
    }
    if (type === 'drummer') {
      c.fillStyle = '#e6d3ae';
      c.beginPath(); c.ellipse(r * 0.85, r * 0.1, r * 0.42, r * 0.55, 0, 0, TAU); c.fill();
      c.fillStyle = '#8a3026';
      c.beginPath(); c.ellipse(r * 0.85, r * 0.1, r * 0.42, r * 0.16, 0, 0, TAU); c.fill();
      const beat = Math.abs(Math.sin(time * 6));
      c.strokeStyle = '#5a4030'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(r * 0.3, -r * 0.6); c.lineTo(r * 0.75, -r * 0.2 - beat * r * 0.35); c.stroke();
    }
    if (type === 'shade') {
      c.fillStyle = 'rgba(120,160,220,.5)';
      c.beginPath(); c.moveTo(-r * 0.7, r * 0.3);
      c.quadraticCurveTo(-r * 0.9, r * 1.4, -r * 0.3, r * 1.1 + Math.sin(e.wob) * 2);
      c.quadraticCurveTo(0, r * 0.7, r * 0.4, r * 1.2 - Math.sin(e.wob) * 2);
      c.quadraticCurveTo(r * 0.8, r * 0.4, r * 0.7, r * 0.1); c.fill();
      if (!e.phased) {
        c.fillStyle = '#8fd0ff';
        c.beginPath(); c.arc(r * 0.32, -r * 0.6, r * 0.09, 0, TAU); c.arc(r * 0.05, -r * 0.62, r * 0.09, 0, TAU); c.fill();
      }
    }
  } else if (['bat', 'wraith'].includes(type)) {
    if (type === 'wraith') {
      c.beginPath(); c.arc(0, -r * 0.1, r * 0.8, Math.PI, 0);
      c.quadraticCurveTo(r * 0.8, r * 0.8, 0, r * 0.95);
      c.quadraticCurveTo(-r * 0.8, r * 0.8, -r * 0.8, -r * 0.1); c.fill();
      c.fillStyle = flash ? '#fff' : '#0e2430';
      c.beginPath(); c.arc(-r * 0.24, -r * 0.2, r * 0.14, 0, TAU); c.arc(r * 0.24, -r * 0.2, r * 0.14, 0, TAU); c.fill();
    } else {
      c.beginPath(); c.ellipse(0, 0, r * 0.66, r * 0.78, 0, 0, TAU); c.fill();
      c.fillStyle = '#ffdf6e';
      c.beginPath(); c.arc(-r * 0.2, -r * 0.18, r * 0.11, 0, TAU); c.arc(r * 0.2, -r * 0.18, r * 0.11, 0, TAU); c.fill();
      c.fillStyle = dark;
      c.beginPath(); c.moveTo(-r * 0.4, -r * 0.6); c.lineTo(-r * 0.2, -r * 1.05); c.lineTo(0, -r * 0.6); c.fill();
      c.beginPath(); c.moveTo(r * 0.4, -r * 0.6); c.lineTo(r * 0.2, -r * 1.05); c.lineTo(0, -r * 0.6); c.fill();
    }
  } else if (type === 'wolf') {
    c.beginPath(); c.ellipse(0, 0, r * 1.15, r * 0.66, 0, 0, TAU); c.fill();
    c.beginPath(); c.arc(r * 0.95, -r * 0.25, r * 0.5, 0, TAU); c.fill();
    c.fillStyle = dark;
    c.beginPath(); c.moveTo(r * 0.65, -r * 0.6); c.lineTo(r * 0.8, -r * 1.05); c.lineTo(r * 0.98, -r * 0.6); c.fill();
    const step = Math.sin(e.wob * 2.6);
    c.strokeStyle = dark; c.lineWidth = r * 0.2;
    c.beginPath(); c.moveTo(-r * 0.5, r * 0.4); c.lineTo(-r * 0.5 + step * 4, r * 0.95); c.stroke();
    c.beginPath(); c.moveTo(r * 0.5, r * 0.4); c.lineTo(r * 0.5 - step * 4, r * 0.95); c.stroke();
    c.fillStyle = '#ff8a6a';
    c.beginPath(); c.arc(r * 1.05, -r * 0.3, r * 0.09, 0, TAU); c.fill();
  } else if (['splitter', 'slime'].includes(type)) {
    c.beginPath(); c.ellipse(0, r * 0.15, r * (1 + Math.sin(e.wob) * 0.07), r * (0.8 - Math.sin(e.wob) * 0.06), 0, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,255,255,.28)';
    c.beginPath(); c.ellipse(-r * 0.3, -r * 0.2, r * 0.22, r * 0.14, -0.5, 0, TAU); c.fill();
    c.fillStyle = flash ? '#fff' : '#1e2a12';
    c.beginPath(); c.arc(-r * 0.24, 0, r * 0.11, 0, TAU); c.arc(r * 0.22, -r * 0.02, r * 0.11, 0, TAU); c.fill();
  } else if (type === 'sprite') {
    c.beginPath(); c.arc(0, 0, r * 0.72, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,255,255,.85)';
    c.beginPath(); c.arc(-r * 0.18, -r * 0.16, r * 0.13, 0, TAU); c.arc(r * 0.2, -r * 0.14, r * 0.13, 0, TAU); c.fill();
    drawGlow(c, 'rgba(150,235,255,', 0, 0, r * 2, 0.4 + 0.2 * Math.sin(time * 8));
    c.strokeStyle = 'rgba(200,250,255,.6)'; c.lineWidth = 1.4;
    c.beginPath(); c.arc(0, 0, r * 1.15, e.wob % TAU, (e.wob % TAU) + 1.8); c.stroke();
  } else if (['beast', 'siege'].includes(type)) {
    c.beginPath(); c.ellipse(0, 0, r * 1.15, r * 0.85, 0, 0, TAU); c.fill();
    c.fillStyle = dark;
    c.beginPath(); c.arc(r * 1.0, -r * 0.3, r * 0.52, 0, TAU); c.fill();
    const step = Math.sin(e.wob * 1.7);
    c.strokeStyle = dark; c.lineWidth = r * 0.24;
    for (const bx of [-0.72, -0.3, 0.35, 0.72]) {
      c.beginPath(); c.moveTo(r * bx, r * 0.6); c.lineTo(r * bx + (bx < 0 ? step : -step) * 3, r * 1.25); c.stroke();
    }
    if (type === 'beast') {
      c.fillStyle = flash ? '#fff' : '#6d5f4e';
      for (const sx2 of [-0.55, -0.1, 0.4]) {
        c.beginPath(); c.moveTo(r * sx2 - r * 0.22, -r * 0.62); c.lineTo(r * sx2, -r * 1.25); c.lineTo(r * sx2 + r * 0.22, -r * 0.62); c.fill();
      }
      c.fillStyle = flash ? '#fff' : '#ffdf6e';
      c.beginPath(); c.arc(r * 1.18, -r * 0.4, r * 0.1, 0, TAU); c.fill();
      c.fillStyle = '#e8d8b0';
      c.beginPath(); c.moveTo(r * 1.2, -r * 0.62); c.lineTo(r * 1.55, -r * 1.05); c.lineTo(r * 1.3, -r * 0.45); c.fill();
    } else {
      c.fillStyle = flash ? '#fff' : '#4d4234';
      c.fillRect(r * 1.05, -r * 0.55, r * 0.9, r * 0.36);
      c.fillStyle = '#ffb054';
      c.beginPath(); c.arc(r * 1.28, -r * 0.72, r * 0.11, 0, TAU); c.arc(r * 1.78, -r * 0.38, r * 0.09, 0, TAU); c.fill();
      c.fillStyle = flash ? '#fff' : '#c9bda3';
      c.beginPath(); c.arc(r * 0.1, -r * 0.55, r * 0.5, Math.PI, 0); c.fill();
      c.strokeStyle = 'rgba(90,75,55,.8)'; c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(-r * 0.3, -r * 0.4); c.lineTo(r * 0.5, -r * 0.4); c.stroke();
    }
  } else if (type === 'bomber') {
    c.beginPath(); c.ellipse(0, 0, r, r * 0.85, 0, 0, TAU); c.fill();
    c.fillStyle = flash ? '#fff' : shade(e.def.body, -38);
    c.beginPath(); c.ellipse(r * 0.35, -r * 0.1, r * 0.5, r * 0.55, 0, 0, TAU); c.fill();
    c.strokeStyle = flash ? '#fff' : '#1e1208'; c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(-r * 0.2, -r * 0.5); c.lineTo(-r * 0.2, r * 0.4); c.stroke();
    c.fillStyle = 'rgba(30,18,8,.85)';
    c.beginPath(); c.ellipse(-r * 0.15, 0, r * 0.16, r * 0.7, 0, 0, TAU); c.fill();
    if (e.dist > 0) drawGlow(c, 'rgba(255,180,70,', r * 0.9, -r * 0.6, 9, 0.5 + 0.4 * Math.sin(time * 14 + e.wob));
  } else if (type === 'golem' || type === 'golemShard') {
    c.fillStyle = body;
    c.fillRect(-r * 0.85, -r * 0.85, r * 1.7, r * 1.7);
    c.fillStyle = dark;
    c.fillRect(-r * 0.85, -r * 0.2, r * 1.7, r * 0.22);
    c.fillStyle = flash ? '#fff' : '#ffd873';
    c.beginPath(); c.arc(-r * 0.3, -r * 0.45, r * 0.12, 0, TAU); c.arc(r * 0.3, -r * 0.45, r * 0.12, 0, TAU); c.fill();
    drawGlow(c, 'rgba(255,216,115,', 0, -r * 0.45, 10, 0.35 + 0.15 * Math.sin(time * 4));
  } else if (e.boss) {
    // boss 通用：巨躯 + 犄角/王冠 + gimmick 视觉
    c.beginPath(); c.ellipse(0, 0, r * 0.95, r, 0, 0, TAU); c.fill();
    c.fillStyle = dark;
    c.beginPath(); c.arc(r * 0.1, -r * 0.5, r * 0.62, 0, TAU); c.fill();
    c.fillStyle = flash ? '#fff' : '#16100c';
    c.beginPath(); c.arc(r * 0.34, -r * 0.55, r * 0.12, 0, TAU); c.arc(r * 0.02, -r * 0.58, r * 0.12, 0, TAU); c.fill();
    c.fillStyle = '#e8d8b0';
    c.beginPath(); c.moveTo(-r * 0.55, -r * 0.85); c.lineTo(-r * 0.85, -r * 1.4); c.lineTo(-r * 0.3, -r * 1.05); c.fill();
    c.beginPath(); c.moveTo(r * 0.55, -r * 0.85); c.lineTo(r * 0.85, -r * 1.4); c.lineTo(r * 0.3, -r * 1.05); c.fill();
    if (e.gimmick === 'rage' && e.raged) drawGlow(c, 'rgba(255,80,50,', 0, -r * 0.2, r * 2.2, 0.4 + 0.2 * Math.sin(time * 7));
    if (e.gimmick === 'final' && e.shieldUntil > game.time) {
      c.strokeStyle = 'rgba(217,140,255,.8)'; c.lineWidth = 2.6;
      c.beginPath(); c.arc(0, -r * 0.1, r * 1.5 + Math.sin(time * 8) * 2, 0, TAU); c.stroke();
    }
    if (e.gimmick === 'blink') drawGlow(c, 'rgba(150,110,230,', 0, -r * 0.2, r * 2, 0.35 + 0.15 * Math.sin(time * 5));
    if (e.gimmick === 'regen' && RT() < 0.06) fxParticle(x + RR(-r, r), y - r, RR(-5, 5), -22, 0.7, 2.6, 'rgba(140,255,120,.8)');
    if (e.gimmick === 'nova' || e.gimmick === 'split50') {
      c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(-r * 0.4, -r * 1.5); c.lineTo(0, -r * 1.9); c.lineTo(r * 0.4, -r * 1.5); c.stroke();
    }
  } else {
    c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill();
  }
  // 状态色叠加
  if (e.freezeUntil > game.time) { c.fillStyle = 'rgba(170,230,255,.5)'; c.beginPath(); c.arc(0, 0, r * 1.1, 0, TAU); c.fill(); }
  else if (e.stunUntil > game.time) { c.fillStyle = 'rgba(255,230,110,.3)'; c.beginPath(); c.arc(0, 0, r * 1.05, 0, TAU); c.fill(); }
  else if (e.slowUntil > game.time) { c.fillStyle = 'rgba(120,200,255,.26)'; c.beginPath(); c.arc(0, 0, r * 1.02, 0, TAU); c.fill(); }
  if (e.poison && e.poison.until > game.time) { c.fillStyle = 'rgba(140,220,90,.22)'; c.beginPath(); c.arc(0, 0, r * 1.08, 0, TAU); c.fill(); }
  if (e.burnUntil > game.time && RT() < 0.3) fxParticle(x + RR(-r * 0.6, r * 0.6), y - RR(0, r), RR(-6, 6), -34, 0.35, 2.4, 'rgba(255,150,60,.9)');
  c.restore();
  // 血条
  if (e.hp < e.maxHp || e.boss) {
    const bw = e.boss ? 46 : Math.max(16, r * 2);
    const by = y - r - (e.boss ? 12 : 7);
    c.fillStyle = 'rgba(0,0,0,.55)';
    c.fillRect(x - bw / 2 - 1, by - 1, bw + 2, e.boss ? 6 : 4);
    const frac = Math.max(0, e.hp / e.maxHp);
    c.fillStyle = e.boss ? '#ff5f56' : frac > 0.5 ? '#7ee081' : frac > 0.25 ? '#ffd873' : '#ff7a6b';
    c.fillRect(x - bw / 2, by, bw * frac, e.boss ? 4 : 2);
  }
  if (e.fly) {
    c.strokeStyle = 'rgba(200,220,255,.16)';
    c.beginPath(); c.moveTo(x, y + r * 0.9); c.lineTo(x, e.y); c.stroke();
  }
}
function shade(hex, pct) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) + pct, g = ((n >> 8) & 255) + pct, b = (n & 255) + pct;
  r = clamp(r, 0, 255); g = clamp(g, 0, 255); b = clamp(b, 0, 255);
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}

let arrowDash = 0;
function render(time) {
  const c = ctx;
  const sx = game.shake > 0.2 ? RR(-game.shake, game.shake) * 0.5 : 0;
  const sy = game.shake > 0.2 ? RR(-game.shake, game.shake) * 0.5 : 0;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, W, H);
  c.save();
  c.translate(sx, sy);
  if (MAP) c.drawImage(MAP.bg, 0, 0);
  // 路面流动箭头
  arrowDash = (arrowDash + game.speed * 0.5) % 46;
  if (MAP) {
    c.save();
    c.strokeStyle = 'rgba(255,255,255,.13)';
    c.lineWidth = 2.4; c.lineCap = 'round';
    for (let d = arrowDash; d < MAP.len - 30; d += 46) {
      const p = posAt(d), p2 = posAt(d + 7);
      const a = Math.atan2(p2.y - p.y, p2.x - p.x);
      c.beginPath();
      c.moveTo(p.x - Math.cos(a - 0.5) * 6, p.y - Math.sin(a - 0.5) * 6);
      c.lineTo(p.x, p.y);
      c.lineTo(p.x - Math.cos(a + 0.5) * 6, p.y - Math.sin(a + 0.5) * 6);
      c.stroke();
    }
    // 传送门
    const pt = MAP.pts[0];
    const pp = posAt(0);
    void pt;
    c.save(); c.translate(pp.x + 6, pp.y);
    c.fillStyle = 'rgba(10,6,18,.85)';
    c.beginPath(); c.ellipse(0, -8, 15, 26, 0, 0, TAU); c.fill();
    for (let i = 0; i < 3; i++) {
      c.strokeStyle = 'rgba(160,110,230,' + (0.55 - i * 0.15) + ')';
      c.lineWidth = 3 - i * 0.7;
      c.beginPath(); c.ellipse(0, -8, (13 - i * 3) * (1 + Math.sin(time * 2 + i) * 0.06), 24 - i * 5, 0, 0, TAU); c.stroke();
    }
    c.restore();
    // 水晶核心
    const core = MAP.CORE;
    const hitA = Math.max(0, 1 - (game.time - game.coreHit) * 1.6);
    drawCore(c, core.x, core.y, time, hitA);
    for (const sh of MAP.decor.shards) {
      const fl = 0.6 + 0.4 * Math.sin(time * 2 + sh.rot * 5);
      drawGlow(c, 'rgba(127,231,255,', sh.x, sh.y + Math.sin(time * 1.6 + sh.rot * 7) * 3, 8 * sh.s, 0.28 * fl);
    }
    c.restore();
  }
  // 塔（按行排序获得层次）
  const towers = [...game.towers].sort((a, b) => a.y - b.y);
  for (const t of towers) {
    if (game.sel === t || (game.build && game.hoverCell && game.hoverCell[0] === t.c && game.hoverCell[1] === t.r)) {
      c.strokeStyle = 'rgba(255,255,255,.16)';
      c.setLineDash([6, 6]);
      c.beginPath(); c.arc(t.x, t.y, t.range(), 0, TAU); c.stroke();
      c.setLineDash([]);
    }
    if (t.type === 'banner') {
      const tg = t.tier();
      c.strokeStyle = 'rgba(255,215,110,.10)';
      c.beginPath(); c.arc(t.x, t.y, tg.range * boonSum().range, 0, TAU); c.stroke();
    }
    if (t.flameOn > game.time) {
      const tg = t.tier();
      c.save(); c.translate(t.x, t.y - 12); c.rotate(t.angle);
      const g2 = c.createLinearGradient(0, 0, tg.range, 0);
      g2.addColorStop(0, 'rgba(255,150,60,.5)'); g2.addColorStop(1, 'rgba(255,80,40,0)');
      c.fillStyle = g2;
      c.beginPath(); c.moveTo(8, 0); c.arc(0, 0, tg.range, -0.54, 0.54); c.closePath(); c.fill();
      c.restore();
    }
    drawTowerArt(c, t.type, t.x, t.y, t.level, t.angle, time, t.taseUntil > game.time, false);
  }
  // 敌人（地面→空中分层，血条在上）
  const es = [...game.enemies].filter(e => !e.dead).sort((a, b) => (a.fly - b.fly) || (a.y - b.y));
  for (const e of es) drawEnemy(c, e, time);
  // 弹道
  for (const p of game.projectiles) {
    if (p.dead) continue;
    const arcY = p.arcH ? -Math.sin(Math.min(1, p.t * 2.2) * Math.PI) * 10 * p.arcH : 0;
    c.fillStyle = p.color;
    c.beginPath(); c.arc(p.x, p.y + arcY, p.arcH ? 4.4 : 3, 0, TAU); c.fill();
    drawGlow(c, 'rgba(255,220,150,', p.x, p.y + arcY, 7, 0.35);
  }
  // 光束
  for (const b of game.beams) {
    const a = 1 - b.t / b.life;
    c.save(); c.globalAlpha = a;
    c.shadowColor = b.color + '1)'; c.shadowBlur = 8;
    c.strokeStyle = b.color + '0.95)';
    c.lineWidth = b.width * a + 0.6;
    c.beginPath();
    c.moveTo(b.pts[0][0], b.pts[0][1]);
    for (let i = 1; i < b.pts.length; i++) {
      const prev = b.pts[i - 1], cur = b.pts[i];
      const mx2 = (prev[0] + cur[0]) / 2 + RR(-9, 9), my2 = (prev[1] + cur[1]) / 2 + RR(-9, 9);
      c.quadraticCurveTo(mx2, my2, cur[0], cur[1]);
    }
    c.stroke();
    c.restore();
  }
  // 光环脉冲
  for (const p of game.pulses) {
    const t01 = p.t / p.life;
    c.strokeStyle = p.color + (1 - t01) * 0.8 + ')';
    c.lineWidth = p.width * (1 - t01 * 0.6);
    c.beginPath();
    if (p.flat) c.ellipse(p.x, p.y, p.maxr * t01, p.maxr * t01 * 0.62, 0, 0, TAU);
    else c.arc(p.x, p.y, p.maxr * t01, 0, TAU);
    c.stroke();
  }
  // 粒子
  for (const p of game.particles) {
    const a = p.fade ? 1 - p.t / p.life : 1;
    c.globalAlpha = Math.max(0, a);
    c.fillStyle = p.color;
    c.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  c.globalAlpha = 1;
  for (const m of game.muzzle) {
    const a = 1 - m.t / 0.09;
    if (a <= 0) continue;
    c.save(); c.translate(m.x, m.y); c.rotate(m.ang);
    c.fillStyle = 'rgba(255,230,140,' + a + ')';
    c.beginPath(); c.moveTo(2, 0); c.lineTo(9 * a + 4, -3 * a); c.lineTo(9 * a + 4, 3 * a); c.closePath(); c.fill();
    c.restore();
  }
  // 飘字
  for (const t of game.texts) {
    const a = 1 - t.t / t.life;
    c.globalAlpha = Math.max(0, a);
    c.font = 'bold ' + t.size + 'px "Segoe UI", "Microsoft YaHei", sans-serif';
    c.textAlign = 'center';
    c.strokeStyle = 'rgba(0,0,0,.6)'; c.lineWidth = 3;
    c.strokeText(t.txt, t.x, t.y + t.vy * t.t);
    c.fillStyle = t.color;
    c.fillText(t.txt, t.x, t.y + t.vy * t.t);
  }
  c.globalAlpha = 1;
  // 萤火虫 / 雪花
  const kind = MAP ? MAP.def.kind : 'forest';
  for (const f of game.flyies) {
    if (kind === 'snow') {
      c.fillStyle = 'rgba(255,255,255,.5)';
      c.beginPath(); c.arc(f.x, f.y, 1.6 + Math.sin(f.q) * 0.8, 0, TAU); c.fill();
    } else {
      const fl = 0.5 + 0.5 * Math.sin(f.p);
      drawGlow(c, MAPS[game.mapIdx].firefly[0], f.x, f.y, 6, 0.16 + 0.14 * fl);
    }
  }
  // 建造预览
  if (game.build && game.hoverCell && game.state === 'play') {
    const [c2, r2] = game.hoverCell;
    const ok = canPlace(c2, r2) && game.gold >= TOWERS[game.build].cost;
    const cx = c2 * CELL + 16, cy = r2 * CELL + 16;
    c.globalAlpha = 0.5;
    drawTowerArt(c, game.build, cx, cy, 0, -Math.PI / 2, time, false, false);
    c.globalAlpha = 1;
    c.fillStyle = ok ? 'rgba(120,255,140,.15)' : 'rgba(255,90,80,.18)';
    c.fillRect(c2 * CELL, r2 * CELL, CELL, CELL);
    c.strokeStyle = ok ? 'rgba(120,255,140,.7)' : 'rgba(255,90,80,.7)';
    c.strokeRect(c2 * CELL + 1, r2 * CELL + 1, CELL - 2, CELL - 2);
    if (ok) {
      c.strokeStyle = 'rgba(255,255,255,.2)';
      c.setLineDash([5, 5]);
      c.beginPath(); c.arc(cx, cy, TOWERS[game.build].tiers[0].range * boonSum().range, 0, TAU); c.stroke();
      c.setLineDash([]);
    }
  }
  // 陨石瞄准
  if (game.aimSpell === 'meteor' && game.mouseX != null) {
    c.strokeStyle = 'rgba(255,140,60,.8)'; c.lineWidth = 2.4;
    c.setLineDash([8, 6]);
    c.beginPath(); c.arc(game.mouseX, game.mouseY, 92, 0, TAU); c.stroke();
    c.setLineDash([]);
    c.fillStyle = 'rgba(255,140,60,.12)';
    c.beginPath(); c.arc(game.mouseX, game.mouseY, 92, 0, TAU); c.fill();
    c.font = '12px "Microsoft YaHei"'; c.fillStyle = '#ffd8b8'; c.textAlign = 'center';
    c.fillText('点击轰击（右键取消）', game.mouseX, game.mouseY + 112);
  }
  c.restore(); // shake
  // 血月氛围：全屏红雾 + 边缘加深
  if (game.bloodMoon && game.waveActive) {
    c.fillStyle = 'rgba(140,26,20,.10)';
    c.fillRect(0, 0, W, H);
    const gb = c.createRadialGradient(W / 2, H / 2, H * 0.30, W / 2, H / 2, H * 0.80);
    gb.addColorStop(0, 'rgba(120,10,6,0)');
    gb.addColorStop(1, 'rgba(120,10,6,.30)');
    c.fillStyle = gb;
    c.fillRect(0, 0, W, H);
  }
  // 濒死搏动（命≤5）
  if (game.state === 'play' && game.lives <= 5 && game.lives > 0) {
    const pv = 0.10 + 0.07 * Math.sin(game.time * 3.2);
    const gp = c.createRadialGradient(W / 2, H / 2, H * 0.40, W / 2, H / 2, H * 0.80);
    gp.addColorStop(0, 'rgba(255,30,20,0)');
    gp.addColorStop(1, 'rgba(255,30,20,' + pv + ')');
    c.fillStyle = gp;
    c.fillRect(0, 0, W, H);
  }
  // 受击红晕
  if (game.vign > 0.01) {
    const g2 = c.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, H * 0.78);
    g2.addColorStop(0, 'rgba(255,0,0,0)');
    g2.addColorStop(1, 'rgba(180,20,10,' + game.vign * 0.42 + ')');
    c.fillStyle = g2;
    c.fillRect(0, 0, W, H);
  }
  if (game.vignSnow > game.time) {
    c.fillStyle = 'rgba(200,240,255,' + (game.vignSnow - game.time) * 0.2 + ')';
    c.fillRect(0, 0, W, H);
  }
  // 大横幅
  if (game.banner) {
    const b = game.banner;
    const a = b.t < 0.4 ? b.t / 0.4 : b.t > b.life - 0.6 ? (b.life - b.t) / 0.6 : 1;
    c.save();
    c.globalAlpha = clamp(a, 0, 1);
    const by = b.big ? 210 : 160;
    const g3 = c.createLinearGradient(0, by - 44, 0, by + 44);
    g3.addColorStop(0, 'rgba(8,12,20,0)'); g3.addColorStop(0.5, 'rgba(8,12,20,.82)'); g3.addColorStop(1, 'rgba(8,12,20,0)');
    c.fillStyle = g3;
    c.fillRect(0, by - 44, W, 88);
    c.textAlign = 'center';
    c.font = 'bold ' + (b.big ? 40 : 30) + 'px "STKaiti", "KaiTi", "Microsoft YaHei", serif';
    c.shadowColor = 'rgba(0,0,0,.8)'; c.shadowBlur = 10;
    c.fillStyle = b.color || '#ffe9c8';
    c.fillText(b.txt, W / 2, by + 4);
    if (b.sub) {
      c.font = '15px "Microsoft YaHei"'; c.shadowBlur = 6;
      c.fillStyle = 'rgba(230,235,245,.9)';
      c.fillText(b.sub, W / 2, by + 32);
    }
    c.restore();
  }
  // 成就 toast
  if (!game.achToast && game.achQueue.length) {
    game.achToast = { a: game.achQueue.shift(), t: 0 };
  }
  if (game.achToast) {
    const at = game.achToast;
    const a = at.t < 0.3 ? at.t / 0.3 : at.t > 3 ? (3.4 - at.t) / 0.4 : 1;
    c.save(); c.globalAlpha = clamp(a, 0, 1);
    const tx2 = W - 268, ty2 = 84;
    c.fillStyle = 'rgba(14,18,28,.92)';
    roundRect(c, tx2, ty2, 252, 54, 10); c.fill();
    c.strokeStyle = 'rgba(255,215,110,.6)'; c.lineWidth = 1.4;
    roundRect(c, tx2, ty2, 252, 54, 10); c.stroke();
    c.fillStyle = '#ffd873';
    c.font = 'bold 14px "Microsoft YaHei"'; c.textAlign = 'left';
    c.fillText('★ 成就解锁 · ' + at.a.name, tx2 + 14, ty2 + 22);
    c.fillStyle = 'rgba(210,220,235,.85)';
    c.font = '12px "Microsoft YaHei"';
    c.fillText(at.a.desc, tx2 + 14, ty2 + 42);
    c.restore();
  }
}
function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
function drawCore(c, x, y, time, hitA) {
  const pulse = 1 + Math.sin(time * 2.2) * 0.05;
  drawGlow(c, hitA > 0 ? 'rgba(255,90,70,' : 'rgba(127,231,255,', x, y, 70 * pulse, 0.5 + hitA * 0.4);
  c.fillStyle = '#0d1622';
  c.beginPath(); c.ellipse(x, y + 26, 44, 14, 0, 0, TAU); c.fill();
  c.fillStyle = 'rgba(120,180,255,.10)';
  c.beginPath(); c.arc(x, y, 40, 0, TAU); c.fill();
  const rot = time * 0.5;
  c.strokeStyle = 'rgba(180,230,255,.55)'; c.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    const a = rot + i * TAU / 3;
    c.beginPath();
    c.moveTo(x + Math.cos(a) * 10, y + Math.sin(a) * 4 - 4);
    c.lineTo(x + Math.cos(a) * 34, y + Math.sin(a) * 12 - 8);
    c.lineTo(x + Math.cos(a + 0.4) * 34, y + Math.sin(a + 0.4) * 12 - 2);
    c.stroke();
  }
  const crystalH = 52;
  c.fillStyle = 'rgba(150,225,255,.28)';
  c.beginPath();
  c.moveTo(x, y - crystalH - 8);
  c.lineTo(x + 20, y - 18);
  c.lineTo(x + 12, y + 14);
  c.lineTo(x - 12, y + 14);
  c.lineTo(x - 20, y - 18);
  c.closePath(); c.fill();
  c.fillStyle = 'rgba(210,245,255,.5)';
  c.beginPath();
  c.moveTo(x, y - crystalH - 8); c.lineTo(x + 8, y - 20); c.lineTo(x, y + 8); c.lineTo(x - 8, y - 20);
  c.closePath(); c.fill();
  if (hitA > 0) {
    c.strokeStyle = 'rgba(255,255,255,' + hitA * 0.9 + ')'; c.lineWidth = 2.6;
    c.beginPath(); c.moveTo(x - 6, y - 40); c.lineTo(x + 2, y - 24); c.lineTo(x - 4, y - 12); c.stroke();
  }
  if (RT() < 0.3) fxParticle(x + RR(-30, 30), y + RR(-30, 10), RR(-6, 6), RR(-30, -14), RR(0.6, 1.2), 2.2, 'rgba(150,230,255,.7)');
}

/* ---------------- 主循环 ---------------- */
let lastT = performance.now();
let rafId = null;
let booted = false;
function tick(now) {
  rafId = requestAnimationFrame(tick);
  let dt = Math.min(0.06, (now - lastT) / 1000);
  lastT = now;
  if (game.slowT > 0) { game.slowT = Math.max(0, game.slowT - dt); dt *= 0.28; }
  if (game.state === 'play' && !game.paused && !game.boonMode) {
    const steps = game.speed > 1 ? game.speed : 1;
    const sdt = game.speed > 1 ? dt : dt;
    for (let i = 0; i < steps; i++) step(sdt);
  } else if (game.banner) {
    game.banner.t += dt;
    if (game.banner.t > game.banner.life) game.banner = null;
  }
  if (game.achToast) { game.achToast.t += dt; if (game.achToast.t > 3.4) game.achToast = null; }
  render(game.time);
  hudT += dt;
  if (hudT > 0.25) { hudT = 0; syncHud(); if (game.sel && !sel.classList.contains('hidden')) refreshSel(); }
}
function step(dt) {
  game.time += dt;
  game.shake = Math.max(0, game.shake - dt * 14);
  game.vign = Math.max(0, game.vign - dt * 1.1);
  for (const id of SPELL_ORDER) game.spellCd[id] = Math.max(0, game.spellCd[id] - dt);
  updateWave(dt);
  for (const e of game.enemies) if (!e.dead) e.update(dt);
  game.enemies = game.enemies.filter(e => !e.dead);
  for (const t of game.towers) t.update(dt);
  for (const p of game.projectiles) if (!p.dead) p.update(dt);
  game.projectiles = game.projectiles.filter(p => !p.dead && p.t < 6);
  for (const b of game.beams) b.t += dt;
  game.beams = game.beams.filter(b => b.t < b.life);
  for (const p of game.pulses) p.t += dt;
  game.pulses = game.pulses.filter(p => p.t < p.life);
  for (const p of game.particles) {
    p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.grav * dt;
  }
  game.particles = game.particles.filter(p => p.t < p.life);
  for (const m of game.muzzle) m.t += dt;
  game.muzzle = game.muzzle.filter(m => m.t < 0.09);
  for (const t of game.texts) t.t += dt;
  game.texts = game.texts.filter(t => t.t < t.life);
  if (game.banner) { game.banner.t += dt; if (game.banner.t > game.banner.life) game.banner = null; }
  const kind = MAP ? MAP.def.kind : 'forest';
  for (const f of game.flyies) {
    f.p += dt * 2; f.q += dt;
    if (kind === 'snow') {
      f.y += (8 + f.sp * 0.5) * dt; f.x += Math.sin(f.q * 2) * 14 * dt;
      if (f.y > H + 4) { f.y = -4; f.x = RR(0, W); }
    } else {
      f.x += Math.cos(f.q) * f.sp * dt; f.y += Math.sin(f.q * 1.3) * f.sp * dt;
      if (f.x < -8) f.x = W + 8; if (f.x > W + 8) f.x = -8;
      if (f.y < -8) f.y = H + 8; if (f.y > H + 8) f.y = -8;
    }
  }
}

/* ---------------- boot ---------------- */
function boot() {
  booted = true;
  resetRun(game.diff);
  game.state = 'menu';
  game.paused = true;
  refreshCards();
  renderTitle();
  renderBoons();
  syncHud();
  showOv('ovTitle');
  lastT = performance.now();
  if (rafId == null) rafId = requestAnimationFrame(tick);
}
window.addEventListener('error', ev => {
  if (!window.__cwErr) {
    window.__cwErr = ev.message;
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;left:8px;bottom:8px;background:#611;color:#fff;font:12px monospace;padding:6px 10px;z-index:99;border-radius:6px;max-width:80vw';
    d.textContent = 'ERR ' + ev.message;
    document.body.appendChild(d);
  }
});
/* ---------------- demo / sim hooks ---------------- */
const Q = new URLSearchParams(location.search);
const SIM_N = parseInt(Q.get('sim') || '0', 10);
const DUMB = Q.get('dumb') === '1';
const SIM_W = parseInt(Q.get('w') || '0', 10);
const SIM_SEL = Q.get('sel') || '';
const SIM_DIFF = Q.get('d') || 'normal';
function demoLoop() {
  const t = performance.now() / 1000;
  if (game.state === 'menu' && t > 2) {
    startRun('normal', null);
    placeTower(16, 6, 'arrow'); placeTower(26, 6, 'arrow'); placeTower(20, 11, 'cannon');
    game.gold += 2000;
    nextWave();
    game.speed = 4;
  }
  if (game.state === 'win' || game.state === 'over') {
    setTimeout(() => location.reload(), 6000);
  }
}
function runSim(n) {
  if (Q.get('probe')) { window.__PROBE = parseInt(Q.get('probe'), 10) || 20; }
  if (Q.get('probe2') === '1') window.__PROBE2 = 1;
  startRun(SIM_DIFF, null);
  hideOv('ovTitle');
  const TYPE_CYCLE = ['arrow', 'frost', 'arrow', 'cannon', 'poison', 'arrow', 'flame', 'arc', 'frost', 'prism', 'siege', 'arrow', 'cannon', 'banner', 'poison', 'arc', 'flame', 'prism', 'siege', 'arrow', 'frost', 'cannon', 'arc', 'prism', 'flame', 'siege', 'banner', 'arrow', 'arc', 'flame', 'arrow', 'poison', 'frost', 'cannon', 'arc', 'prism', 'arrow', 'flame', 'siege', 'poison'];
  function distToSeg(x, y, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const L2 = dx * dx + dy * dy || 1;
    let t = ((x - a.x) * dx + (y - a.y) * dy) / L2;
    t = Math.max(0.12, Math.min(0.88, t));
    return hyp(x - (a.x + t * dx), y - (a.y + t * dy));
  }
  function planSlots() {
    const road = [];
    const air = [];
    const F = MAP.FLY;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (blocked.has(cellKey(c, r))) continue;
      const x = c * CELL + 16, y = r * CELL + 16;
      const d = distToPts(x, y, MAP.segs);
      if (d >= 33 && d <= 88) road.push({ c, r, d: d + hyp(x - MAP.CORE.x, y - MAP.CORE.y) * 0.002 });
      const da = distToSeg(x, y, F.segs[0].a, F.segs[0].b);
      if (da < 66 && (d < 33 || d > 88)) air.push({ c, r, d: da });
    }
    if (DUMB) {
      const out2 = [];
      for (const cd of road) { if (out2.length >= 50) break; if (out2.every(o => Math.abs(o.c - cd.c) + Math.abs(o.r - cd.r) >= 2)) out2.push(cd); }
      return out2.slice(0, (DIFFS[SIM_DIFF] || DIFFS.normal).cap || 22).map(cd => ['arrow', cd.c, cd.r]);
    }
    road.sort((a, b) => a.d - b.d);
    air.sort((a, b) => a.d - b.d);
    const out = [];
    const pushUniq = cd => { if (out.length < 70 && out.every(o => Math.abs(o.c - cd.c) + Math.abs(o.r - cd.r) >= 3)) out.push(cd); };
    let ri = 0, ai2 = 0, airTaken = 0, guard = 0;
    while (out.length < 70 && guard++ < 500) {
      const nearAir = airTaken < 26 && ai2 < air.length;
      if (nearAir && (out.length % 3 === 2)) {
        const cd = air[ai2++];
        if (cd && out.every(o => Math.abs(o.c - cd.c) + Math.abs(o.r - cd.r) >= 3)) { out.push({ ...cd, air: true }); airTaken++; }
        continue;
      }
      if (ri < road.length) pushUniq(road[ri++]);
      else if (nearAir) { const cd = air[ai2++]; if (cd) { out.push({ ...cd, air: true }); airTaken++; } }
      else break;
    }
    return out.slice(0, (DIFFS[SIM_DIFF] || DIFFS.normal).cap || 22).map((cd, i) => [cd.air ? 'arrow' : TYPE_CYCLE[i % TYPE_CYCLE.length], cd.c, cd.r]);
  }
  let BUY = planSlots();
  let bi = 0, placeCd = 0, lastMap = game.mapIdx;
  for (let i = 0; i < n; i++) {
    step(1 / 60);
    placeCd -= 1 / 60;
    if (game.mapIdx !== lastMap) { lastMap = game.mapIdx; bi = 0; BUY = planSlots(); }
    if (game.state === 'play' && !game.boonMode) {
      if (placeCd <= 0 && bi < BUY.length) {
        for (let k = bi; k < Math.min(bi + 6, BUY.length); k++) {
          const [t, c, r] = BUY[k];
          if (!canPlace(c, r)) { if (k === bi) bi++; continue; }
          game.unlocked.add(t);
          if (game.gold >= TOWERS[t].cost) { placeTower(c, r, t); bi = k + 1; placeCd = 0.35; break; }
        }
      }
      if (!game.waveActive) {
        if (game.gold > 4200) {
          if (game.wave > 28 && game.gold > 10000) fundTry('life', 5000);
          if (!fundTry('dmg', 1500)) fundTry('haste', 1500);
        }
        let upg = true;
        while (upg) {
          upg = false;
          const pool = game.towers.filter(t => t.level < 3).sort((a, b) => a.level - b.level);
          for (const tw of pool) {
            const cost = tw.tier().up;
            if (game.gold > cost + 30) { upgradeTower(tw); upg = true; break; }
          }
        }
        const nextCost = bi < BUY.length ? TOWERS[BUY[bi][0]].cost : 1e9;
        if (bi >= BUY.length || game.gold < nextCost) nextWave();
      }
    }
    if (game.boonMode) {
      const rank = { dmg8: 0, boss15: 1, crit: 2, air20: 3, ground12: 4, slow6: 5, range7: 6, wavegold: 7, gold12: 8, splash8: 9, cd12: 10, life1: 11 };
      const b = game.boonMode.slice().sort((x, y) => (rank[x.id] ?? 9) - (rank[y.id] ?? 9))[0];
      pickBoon(b.id);
    }
    if (game.state === 'play') {
      if (spellReady('meteor')) {
        const b = game.enemies.find(en => en.boss && !en.dead && en.dist > 0)
          || game.enemies.find(en => !en.dead && en.dist > 0 && (en.def.siege || en.def.aura || en.def.beef));
        const e = b || (game.enemies.length > 12 ? game.enemies.find(en => !en.dead && en.dist > 0) : null);
        if (e) castSpell('meteor', e.x, e.y);
      }
      if (spellReady('blizzard') && (game.enemies.length > 13 || game.enemies.filter(en => !en.dead && en.fly && en.dist > 0).length > 5)) castSpell('blizzard');
      if (spellReady('mend') && game.lives <= 5) castSpell('mend');
    }
  }
  window.__SIM = {
    wave: game.wave, lives: game.lives, state: game.state, kills: game.stats.kills,
    towers: game.towers.length, gold: game.gold, boons: game.boonPicks, map: game.mapIdx,
    slots: BUY.length,
    endless: game.endless,
  };
  document.title = ('SIM ' + JSON.stringify(window.__SIM) + ' BM:' + (window.__BM || '-')).slice(0, 900) + (Q.get('probe') ? (window.__WLOG ? ' W:' + String(window.__WLOG).slice(-430) + ' BS:' + (window.__BS || '') : ' BS:' + (window.__BS || '')) : ' LEAKS:' + JSON.stringify(window.__LEAKS || {}) + ' BOSS:' + (window.__BOSS || '')) + (Q.get('dbg') === '1' ? ' DBG:bi=' + bi + ' towers:' + game.towers.map(t => t.type[0] + (t.level + 1)).join('') : '');
  document.title = document.title.slice(0, 900);
}
if (Q.get('demo') === '1') {
  boot();
  demoLoop();
  (function dl() { rafId = requestAnimationFrame(dl); const now = performance.now(); let dt = Math.min(0.06, (now - lastT) / 1000); lastT = now; if (!game.paused) { const st = game.speed; for (let i = 0; i < st; i++) step(1 / 60); } render(game.time); demoLoop(); })();
} else if (SIM_N > 0) {
  try {
    boot();
    game.paused = true;
    if (SIM_W > 0) {
      runSim(SIM_W * 60 * 14);
      const extra = SIM_N;
      for (let i = 0; i < extra; i++) if (game.state === 'play') step(1 / 60);
    } else {
      runSim(SIM_N);
      if (Q.get('cont') === '1' && game.state === 'win') {
        startEndless();
        for (let i = 0; i < 36000 && game.state === 'play'; i++) {
          step(1 / 60);
          if (game.boonMode) pickBoon(game.boonMode[0].id);
        }
        Object.assign(window.__SIM, { wave: game.wave, lives: game.lives, state: game.state, endless: game.endless, towers: game.towers.length });
        document.title = 'SIM ' + JSON.stringify(window.__SIM) + ' ENDLESS-RAN';
      }
    }
    if (SIM_SEL === '1' && game.towers[0]) { game.sel = game.towers[0]; game.paused = false; refreshSel(); }
    if (Q.get('boon') === '1') { game.boonMode = BOONS.slice(0, 3); game.paused = true; renderBoons(); showOv('ovBoon'); }
    if (Q.get('ach') === '1') { game.ach.win_normal = 1; renderAch(); showOv('ovAch'); game.paused = true; }
    if (Q.get('menu') === '1') { game.state = 'menu'; renderTitle(); showOv('ovTitle'); }
    if (Q.get('end') === '1') { game.state = 'over'; showEnd(false); }
    game.paused = Q.get('pause') !== '0' ? game.paused : false;
    render(game.time);
  } catch (e) {
    window.__cwErr = (e && e.stack) ? String(e.stack).split('\n').slice(0, 4).join(' | ') : String(e);
    document.title = 'FATAL ' + window.__cwErr.slice(0, 220);
  }
  if (!document.title.startsWith('FATAL') && window.__cwErr) document.title = 'ERR ' + window.__cwErr;
} else if (Q.get('codex') === '1') {
  boot();
  renderCodex();
  showOv('ovCodex');
} else if (Q.get('mastery') === '1') {
  boot();
  startRun('normal', null);
  game.gold = 9999;
  let mc = -1, mr2 = -1;
  outer3: for (let r3 = 0; r3 < ROWS; r3++) for (let c3 = 0; c3 < COLS; c3++) if (canPlace(c3, r3)) { mc = c3; mr2 = r3; break outer3; }
  placeTower(mc, mr2, 'arrow');
  const mt = game.towers[0];
  mt.level = 3; mt.mastery = 0;
  openMasteryUI(mt);
} else if (Q.get('eliteshot') === '1') {
  boot();
  startRun('normal', null);
  hideOv('ovTitle');
  game.gold = 9999; game.wave = 14; game.waveActive = true;
  for (let i = 0; i < 6; i++) spawnEnemy('orc', { elite: i === 2 ? 1 : 0, distOff: -(200 - i * 55) });
} else if (Q.get('fundshot') === '1') {
  boot();
  startRun('normal', null);
  hideOv('ovTitle');
  game.gold = 5200;
  fundTry('dmg'); fundTry('dmg'); fundTry('haste');
  toggleFund();
} else if (Q.get('ui') === '1') {
  try {
    boot();
    startRun('normal', null);
    hideOv('ovTitle');
    const R = [];
    const key = (k) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k }));
    const clk = (x, y, btn) => { const rc = cvs.getBoundingClientRect(); cvs.dispatchEvent(new MouseEvent('mousedown', { clientX: rc.left + x * rc.width / W, clientY: rc.top + y * rc.height / H, button: btn || 0, bubbles: true })); };
    R.push(['start', game.state === 'play']);
    el.btnWave.click();
    R.push(['wave', game.wave === 1 && game.waveActive]);
    key('1');
    let cc = -1, rr = -1;
    outer: for (let r2 = 0; r2 < ROWS; r2++) for (let c2 = 0; c2 < COLS; c2++) if (canPlace(c2, r2)) { cc = c2; rr = r2; break outer; }
    clk((cc + .5) * CELL, (rr + .5) * CELL);
    R.push(['place', game.towers.length === 1]);
    key('escape');
    game.gold = 99999;
    clk((cc + .5) * CELL, (rr + .5) * CELL);
    R.push(['sel', game.sel === game.towers[0] && !$('sel').classList.contains('hidden')]);
    $('selUp').click();
    R.push(['upgrade', game.towers[0].level === 1]);
    game.towers[0].level = 3; game.towers[0].mastery = 0;
    openMasteryUI(game.towers[0]);
    R.push(['mstOv', !$('ovMastery').classList.contains('hidden') && game.masteryPending === game.towers[0]]);
    pickMastery(2);
    R.push(['mstPick', game.towers[0].mastery === 2 && $('ovMastery').classList.contains('hidden') && !game.paused]);
    $('selSell').click();
    R.push(['sell', game.towers.length === 0]);
    R.push(['kept', game.keptMastery.arrow === 2]);
    game.gold = 99999;
    placeTower(cc, rr, 'arrow');
    const t2 = game.towers[game.towers.length - 1];
    t2.level = 3;
    openMasteryUI(t2);
    R.push(['mstInh', !$('ovMastery').classList.contains('hidden') && !$('ovMastery').querySelector('.mstInh').classList.contains('hidden')]);
    key('3');
    R.push(['mstInhPick', t2.mastery === 2 && $('ovMastery').classList.contains('hidden')]);
    key('q');
    R.push(['aim', game.aimSpell === 'meteor']);
    clk(400, 300);
    R.push(['meteorCast', game.aimSpell === null && game.spellCd.meteor > 0]);
    key('w');
    R.push(['blizzardCd', game.spellCd.blizzard > 0]);
    el.btnPause.click();
    const pz = game.paused;
    el.btnPause.click();
    el.btnSpeed.click();
    const sp = game.speed;
    el.btnSpeed.click();
    R.push(['pause', pz && !game.paused, 'speed', sp === 2]);
    if (el.btnFund) {
      el.btnFund.click();
      R.push(['fundOv', !$('ovFund').classList.contains('hidden')]);
      game.gold = 5000;
      fundTry('dmg');
      R.push(['fundBuy', game.fundDmg === 1 && boonSum().dmg > 1.05]);
      $('btnCloseFund').click();
    }
    openBoons();
    R.push(['boonOv', !!game.boonMode && !$('ovBoon').classList.contains('hidden')]);
    $('boonCards').querySelector('.boonC').click();
    R.push(['boonPick', game.boonPicks === 1 && $('ovBoon').classList.contains('hidden')]);
    $('btnAch').click();
    const achOn = !$('ovAch').classList.contains('hidden');
    $('btnCloseAch').click();
    R.push(['achOv', achOn && $('ovAch').classList.contains('hidden')]);
    $('btnCodex').click();
    const codexOn = !$('ovCodex').classList.contains('hidden') && $('codexList').children.length > 20;
    $('btnCloseCodex').click();
    R.push(['codexOv', codexOn && $('ovCodex').classList.contains('hidden')]);
    for (let i = 0; i < 900; i++) step(1 / 60);
    R.push(['combatOk', game.state === 'play' || game.state === 'over']);
    if (game.state === 'play') {
      game.gold = 99999;
      let c3 = -1, r3 = -1;
      outer2: for (let r2 = 0; r2 < ROWS; r2++) for (let c2 = 0; c2 < COLS; c2++) if (canPlace(c2, r2)) { c3 = c2; r3 = r2; break outer2; }
      key('1');
      clk((c3 + .5) * CELL, (r3 + .5) * CELL);
      key('escape');
      const wSnap = game.wave, tSnap = game.towers.length, gSnap = game.gold;
      saveCheckpoint();
      toMenu();
      const rowShown = $('resumeRow').style.display === 'flex';
      $('btnResume').click();
      R.push(['saveResume', rowShown && game.state === 'play' && game.wave === wSnap && game.towers.length === tSnap && game.gold === gSnap]);
    }
    document.title = 'UI ' + JSON.stringify(R);
  } catch (e) {
    document.title = 'UIFATAL ' + (e && e.stack ? String(e.stack).split('\n').slice(0, 3).join(' | ') : e).slice(0, 300);
  }
} else {
  boot();
}


