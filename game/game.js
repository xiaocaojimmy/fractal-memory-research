'use strict';
/* =====================================================================
   水晶守卫 Crystal Ward — 单屏塔防  Canvas 2D  全程序化绘制
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
const rndG = mulberry32(20260918);
const R = (a, b) => a + rndG() * (b - a);

/* ---------------- canvas ---------------- */
const W = 1280, H = 704, CELL = 32, COLS = 40, ROWS = 22;
const cvs = document.getElementById('game');
const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
cvs.width = W * dpr; cvs.height = H * dpr;
const ctx = cvs.getContext('2d');
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
ctx.imageSmoothingEnabled = true;

/* ---------------- audio (WebAudio procedural SFX) ---------------- */
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
  shoot() { this.tone('square', 820, 240, 0.07, 0.028); this.noise(3000, 1, 0.04, 0.02); },
  thoom() { this.tone('sine', 140, 38, 0.34, 0.22); this.noise(260, 1.4, 0.32, 0.16); },
  zap() { this.tone('sawtooth', 1900, 180, 0.10, 0.045); this.noise(5200, 2, 0.06, 0.03); },
  prism() { this.tone('triangle', 520, 2200, 0.16, 0.05); this.tone('sine', 1600, 900, 0.2, 0.03, 0.03); },
  frost() { this.tone('triangle', 500, 1500, 0.22, 0.028); },
  hit() { this.noise(1800, 1, 0.03, 0.016); },
  coin() { this.tone('sine', 1250, 1250, 0.05, 0.03); this.tone('sine', 1850, 1850, 0.07, 0.026, 0.05); },
  leak() { this.tone('sawtooth', 220, 70, 0.34, 0.11); this.noise(160, 1, 0.3, 0.1); },
  horn() { this.tone('sawtooth', 110, 108, 0.5, 0.05); this.tone('sawtooth', 112, 110, 0.5, 0.05); this.tone('sawtooth', 165, 163, 0.5, 0.04, 0.02); },
  ding() { this.tone('sine', 880, 880, 0.1, 0.04); this.tone('sine', 1320, 1320, 0.16, 0.03, 0.06); },
  place() { this.noise(400, 1, 0.1, 0.08); this.tone('sine', 660, 990, 0.12, 0.04, 0.05); },
  ui() { this.tone('square', 440, 440, 0.02, 0.015); },
  sell() { this.tone('sine', 990, 500, 0.14, 0.04); },
  win() { [523, 659, 784, 1047].forEach((f, i) => this.tone('triangle', f, f, 0.4, 0.06, i * 0.14)); },
  lose() { [392, 349, 311, 233].forEach((f, i) => this.tone('sawtooth', f, f * 0.97, 0.4, 0.05, i * 0.18)); },
};

/* ---------------- map & path ---------------- */
const WP = [[-2.2, 3], [33, 3], [33, 9], [6, 9], [6, 15], [38, 15]];
const PTS = WP.map(([cx, cy]) => ({ x: cx * CELL + CELL / 2, y: cy * CELL + CELL / 2 }));
const CORE = PTS[PTS.length - 1];
const PORTAL = { x: 24, y: PTS[0].y };
const SEGS = [];
let PATH_LEN = 0;
for (let i = 0; i < PTS.length - 1; i++) {
  const a = PTS[i], b = PTS[i + 1];
  const len = hyp(b.x - a.x, b.y - a.y);
  SEGS.push({ a, b, len, acc: PATH_LEN });
  PATH_LEN += len;
}
const FLY_LEN = hyp(CORE.x - PTS[0].x, CORE.y - PTS[0].y);
function posAt(d, fly) {
  if (fly) {
    const t = clamp(d / FLY_LEN, 0, 1);
    return { x: lerp(PTS[0].x, CORE.x, t), y: lerp(PTS[0].y, CORE.y, t) };
  }
  d = clamp(d, 0, PATH_LEN);
  for (const s of SEGS) {
    if (d <= s.acc + s.len) {
      const t = (d - s.acc) / s.len;
      return { x: lerp(s.a.x, s.b.x, t), y: lerp(s.a.y, s.b.y, t) };
    }
  }
  return { x: CORE.x, y: CORE.y };
}
function distToPath(x, y) {
  let best = 1e9;
  for (const s of SEGS) {
    const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y;
    let t = ((x - s.a.x) * dx + (y - s.a.y) * dy) / (s.len * s.len);
    t = clamp(t, 0, 1);
    const px = s.a.x + dx * t, py = s.a.y + dy * t;
    const d2 = (x - px) * (x - px) + (y - py) * (y - py);
    if (d2 < best) best = d2;
  }
  return Math.sqrt(best);
}

/* decorations + blocked cells */
const blocked = new Set();
const cellKey = (c, r) => c + ',' + r;
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
  const x = c * CELL + 16, y = r * CELL + 16;
  if (distToPath(x, y) < 30) blocked.add(cellKey(c, r));
}
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
  const x = c * CELL + 16, y = r * CELL + 16;
  if (hyp(x - CORE.x, y - CORE.y) < 74) blocked.add(cellKey(c, r));
  if (hyp(x - PORTAL.x, y - PORTAL.y) < 62) blocked.add(cellKey(c, r));
}
const decor = { trees: [], rocks: [], bushes: [], flowers: [], shards: [] };
(function placeDecor() {
  const seed = mulberry32(777);
  const tryCell = (list, minGap) => {
    for (let tries = 0; tries < 60; tries++) {
      const c = 1 + Math.floor(seed() * (COLS - 2)), r = Math.floor(seed() * ROWS);
      const x = c * CELL + 16, y = r * CELL + 16;
      if (blocked.has(cellKey(c, r))) continue;
      if (hyp(x - CORE.x, y - CORE.y) < 110) continue;
      let ok = true;
      for (const t of list) if (hyp(t.x - x, t.y - y) < minGap) { ok = false; break; }
      if (!ok) continue;
      blocked.add(cellKey(c, r));
      return { x: x + R(-6, 6), y: y + R(-6, 6), rot: seed() * TAU, s: 0.85 + seed() * 0.4 };
    }
    return null;
  };
  for (let i = 0; i < 24; i++) { const p = tryCell(decor.trees, 62); if (p) decor.trees.push(p); }
  for (let i = 0; i < 12; i++) { const p = tryCell(decor.rocks, 60); if (p) decor.rocks.push(p); }
  for (let i = 0; i < 16; i++) { const p = tryCell(decor.bushes, 52); if (p) decor.bushes.push(p); }
  for (let i = 0; i < 90; i++) {
    const x = R(8, W - 8), y = R(8, H - 8);
    const d = distToPath(x, y);
    if (d > 30 && d < 40 + R(0, 200)) decor.flowers.push({ x, y, hue: R(0, 360), s: R(0.6, 1.3) });
  }
  for (let i = 0; i < 10; i++) {
    const a = R(0, TAU), rr = R(60, 130);
    decor.shards.push({ x: CORE.x + Math.cos(a) * rr, y: CORE.y + Math.sin(a) * rr * 0.8, rot: a, s: R(0.7, 1.3) });
  }
})();

/* ---------------- glow sprite cache ---------------- */
const glowCache = new Map();
function glowSprite(color, size) {
  const key = color + '|' + size;
  let cv = glowCache.get(key);
  if (cv) return cv;
  cv = document.createElement('canvas');
  cv.width = cv.height = size * 2;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(size, size, 0, size, size, size);
  grad.addColorStop(0, color);
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
  orc:    { name: '兽人', hp: 160, spd: 40, armor: 3, mr: 0, gold: 12, leak: 1, r: 13, body: '#8aa458' },
  bat:    { name: '石像蝠', hp: 52, spd: 62, armor: 0, mr: 2, gold: 9, leak: 1, r: 10, fly: true, body: '#9b6bd6' },
  wraith: { name: '怨灵', hp: 130, spd: 46, armor: 0, mr: 8, gold: 14, leak: 1, r: 11, fly: true, body: '#a8e6ff' },
  golem:  { name: '岩石魔像', hp: 560, spd: 25, armor: 9, mr: 2, gold: 34, leak: 2, r: 16, body: '#8d97a3' },
  b1:     { name: '兽人督军', hp: 1900, spd: 22, armor: 8, mr: 4, gold: 160, leak: 4, r: 22, boss: true, body: '#b06a3a' },
  b2:     { name: '冰霜巨人', hp: 3600, spd: 19, armor: 9, mr: 8, gold: 260, leak: 5, r: 24, boss: true, body: '#6fc3e8' },
  b3:     { name: '魔王巴尔', hp: 5600, spd: 18, armor: 11, mr: 12, gold: 420, leak: 5, r: 26, boss: true, body: '#d0453a' },
};

/* ---------------- tower defs ---------------- */
const TOWERS = {
  arrow: {
    name: '劲弩塔', cost: 70, kind: 'phys', color: '#e8c268', hot: '1',
    tag: '单体速射 · 物理', desc: '高射速弩箭，清理小怪利器',
    tiers: [
      { dmg: 17, cd: 0.62, range: 112 },
      { cost: 60, dmg: 32, cd: 0.52, range: 124 },
      { cost: 125, dmg: 60, cd: 0.42, range: 138 },
    ],
  },
  cannon: {
    name: '轰击塔', cost: 110, kind: 'phys', color: '#f09a5a', hot: '2',
    tag: '范围轰炸 · 仅地面', desc: '炮弹溅射，无法攻击空中',
    tiers: [
      { dmg: 44, cd: 1.65, range: 122, splash: 46 },
      { cost: 95, dmg: 86, cd: 1.55, range: 134, splash: 56 },
      { cost: 185, dmg: 156, cd: 1.42, range: 148, splash: 70 },
    ],
  },
  frost: {
    name: '霜语塔', cost: 90, kind: 'magic', color: '#7fe7ff', hot: '3',
    tag: '群体减速 · 魔法', desc: '周期性霜环，减速 45~65%',
    tiers: [
      { dmg: 9, cd: 1.1, range: 86, slow: 0.45, sdur: 1.6 },
      { cost: 75, dmg: 17, cd: 1.0, range: 96, slow: 0.55, sdur: 1.8 },
      { cost: 145, dmg: 28, cd: 0.9, range: 108, slow: 0.65, sdur: 2.0 },
    ],
  },
  arc: {
    name: '弧光塔', cost: 130, kind: 'magic', color: '#ffe066', hot: '4',
    tag: '连锁闪电 · 魔法', desc: '闪电在敌群间跳跃 2~4 次',
    tiers: [
      { dmg: 23, cd: 0.9, range: 106, chain: 2 },
      { cost: 105, dmg: 42, cd: 0.82, range: 116, chain: 3 },
      { cost: 205, dmg: 70, cd: 0.74, range: 128, chain: 4 },
    ],
  },
  prism: {
    name: '棱镜塔', cost: 160, kind: 'magic', color: '#d9a4ff', hot: '5',
    tag: '超远狙击 · 魔法', desc: '单发重击，专治重甲首领',
    tiers: [
      { dmg: 98, cd: 2.2, range: 195 },
      { cost: 135, dmg: 175, cd: 2.05, range: 215 },
      { cost: 250, dmg: 300, cd: 1.9, range: 235 },
    ],
  },
};

/* ---------------- game state ---------------- */
const game = {
  state: 'menu', gold: 275, lives: 20, wave: 0, waveActive: false,
  speed: 1, paused: false, time: 0, shake: 0, vign: 0, coreHit: 0,
  enemies: [], towers: [], projectiles: [], beams: [], pulses: [],
  particles: [], texts: [], muzzle: [], spawnQueue: [], waveT: 0,
  build: null, sel: null, hoverCell: null,
  endless: false, totalWaves: 20,
  stats: { kills: 0, gold: 0, built: 0 },
  flyies: [],
};
for (let i = 0; i < 24; i++) {
  game.flyies.push({ x: R(0, W), y: R(0, H), p: R(0, TAU), sp: R(6, 16), q: R(0, TAU), hue: rndG() > 0.5 ? 'rgba(255,232,120,' : 'rgba(150,230,255,' });
}

/* ---------------- particles / texts ---------------- */
const MAX_PARTICLES = 900;
function burst(x, y, color, n, opt = {}) {
  for (let i = 0; i < n; i++) {
    if (game.particles.length >= MAX_PARTICLES) return;
    const a = opt.dir != null ? opt.dir + R(-0.5, 0.5) : R(0, TAU);
    const sp = R(opt.sp0 ?? 30, opt.sp1 ?? 120);
    game.particles.push({
      x: x + R(-2, 2), y: y + R(-2, 2), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (opt.up || 0),
      life: R(0.25, 0.65) * (opt.lifeMul || 1), max: 0.65,
      size: R(1.5, opt.size || 3.5), color, grav: opt.grav ?? 60, glow: !!opt.glow,
    });
  }
}
function ftext(x, y, s, color, size = 13, vy = -34) {
  game.texts.push({ x, y, s, color, size, vy, life: 0.9, max: 0.9 });
}

/* ---------------- damage ---------------- */
function armorMult(e, kind) {
  const def = kind === 'phys' ? e.def.armor : e.def.mr;
  return 100 / (100 + def * 12);
}
function dealDamage(e, raw, kind) {
  if (!e.alive) return 0;
  const dmg = Math.max(1, Math.round(raw * armorMult(e, kind)));
  e.hp -= dmg;
  e.hitFlash = 0.11;
  if (dmg >= 45) ftext(e.x, e.y - e.def.r - 10, String(dmg), kind === 'phys' ? '#ffd97a' : '#c8f0ff', 14);
  if (e.hp <= 0) killEnemy(e);
  return dmg;
}
function killEnemy(e) {
  if (!e.alive) return;
  e.alive = false;
  const g = e.def.gold + Math.floor(game.wave * 0.8);
  game.gold += g; game.stats.kills++; game.stats.gold += g;
  ftext(e.x, e.y - e.def.r - 14, '+' + g, '#ffd873', e.def.boss ? 18 : 12);
  burst(e.x, e.y, e.def.body, e.def.boss ? 46 : 12, { sp1: 150, glow: true, size: e.def.boss ? 5 : 3.2 });
  burst(e.x, e.y, 'rgba(255,255,255,.9)', e.def.boss ? 20 : 5, { sp1: 90, glow: true, size: 2.4, lifeMul: 0.6 });
  if (e.def.boss) { game.shake = Math.max(game.shake, 9); SFX.thoom(); SFX.coin(); }
  else SFX.coin();
  updateHud();
}

/* ---------------- Enemy ---------------- */
let _eid = 1;
class Enemy {
  constructor(type, wave) {
    const d = ENEMY[type];
    this.id = _eid++;
    this.type = type; this.def = d;
    const sc = Math.pow(1.125, wave - 1);
    this.maxHp = Math.round(d.hp * (d.boss ? Math.pow(sc, 0.85) : sc));
    this.hp = this.maxHp;
    this.spd = d.spd;
    this.dist = -R(0, 8);
    this.fly = !!d.fly;
    this.total = this.fly ? FLY_LEN : PATH_LEN;
    this.alive = true;
    this.slowUntil = 0; this.slowFactor = 0;
    this.hitFlash = 0;
    this.ph = R(0, TAU);
    this.spawnT = 0.45;
    const p = posAt(0, this.fly);
    this.x = p.x; this.y = p.y;
  }
  update(dt) {
    this.spawnT -= dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    let sp = this.spd;
    if (this.slowUntil > game.time) sp *= (1 - this.slowFactor);
    this.dist += sp * dt;
    const p = posAt(Math.max(0, this.dist), this.fly);
    this.x = p.x; this.y = p.y;
    if (this.dist >= this.total) this.leak();
  }
  leak() {
    this.alive = false;
    game.lives -= this.def.leak;
    game.vign = 1; game.coreHit = 1;
    game.shake = Math.max(game.shake, this.def.boss ? 10 : 4);
    ftext(CORE.x, CORE.y - 56, '-' + this.def.leak + ' ♥', '#ff8d84', 16);
    burst(CORE.x, CORE.y, 'rgba(255,90,80,.95)', 16, { sp1: 160, glow: true });
    SFX.leak();
    updateHud();
    if (game.lives <= 0) endGame(false);
  }
  get speedNow() {
    let sp = this.spd;
    if (this.slowUntil > game.time) sp *= (1 - this.slowFactor);
    return sp;
  }
}

/* ---------------- Tower ---------------- */
class Tower {
  constructor(type, col, row) {
    this.type = type; this.def = TOWERS[type];
    this.col = col; this.row = row;
    this.x = col * CELL + 16; this.y = row * CELL + 16;
    this.lvl = 1; this.cd = 0.2; this.angle = -Math.PI / 2; this.aim = -Math.PI / 2;
    this.recoil = 0; this.invested = this.def.cost; this.spin = R(0, TAU);
  }
  get stat() { return this.def.tiers[this.lvl - 1]; }
  get dps() {
    const s = this.stat;
    const base = s.dmg * (1 / s.cd) * (this.type === 'arc' ? 1 + s.chain * 0.5 : this.type === 'cannon' ? 1.25 : 1);
    return Math.round(base);
  }
  findTarget() {
    const r = this.stat.range;
    let best = null;
    for (const e of game.enemies) {
      if (!e.alive || e.spawnT > 0) continue;
      if (this.type === 'cannon' && e.fly) continue;
      const dx = e.x - this.x, dy = e.y - this.y;
      if (dx * dx + dy * dy <= r * r && (!best || e.dist > best.dist)) best = e;
    }
    return best;
  }
  update(dt) {
    this.recoil = Math.max(0, this.recoil - dt);
    this.spin += dt;
    this.cd -= dt;
    const t = this.findTarget();
    if (t) this.aim = Math.atan2(t.y - this.y, t.x - this.x);
    let da = this.aim - this.angle;
    while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
    this.angle += da * Math.min(1, dt * 12);
    if (!t || this.cd > 0) return;
    const s = this.stat;
    if (this.type === 'arrow') {
      game.projectiles.push({ kind: 'arrow', x: this.x + Math.cos(this.angle) * 14, y: this.y - 10 + Math.sin(this.angle) * 14, tgt: t, dmg: s.dmg, spd: 470, ang: this.angle });
      this.kick(); SFX.shoot();
    } else if (this.type === 'cannon') {
      const ft = 0.55;
      const ahead = posAt(Math.min(t.total, t.dist + t.speedNow * ft), t.fly);
      game.projectiles.push({ kind: 'shell', x: this.x, y: this.y - 14, sx: this.x, sy: this.y - 14, ex: ahead.x, ey: ahead.y, t: 0, ft, dmg: s.dmg, splash: s.splash });
      this.kick(0.18); SFX.thoom();
      game.shake = Math.max(game.shake, 1.6);
    } else if (this.type === 'frost') {
      game.pulses.push({ x: this.x, y: this.y, r: 8, maxR: s.range, life: 0.45, max: 0.45, color: 'rgba(140,230,255,' });
      for (const e of game.enemies) {
        if (!e.alive) continue;
        const dx = e.x - this.x, dy = e.y - this.y;
        if (dx * dx + dy * dy <= s.range * s.range) {
          dealDamage(e, s.dmg, 'magic');
          if (e.alive) { e.slowUntil = game.time + s.sdur; e.slowFactor = Math.max(e.slowFactor * (e.slowUntil - dt > game.time ? 1 : 0), s.slow); if (!e.def.boss) e.slowFactor = s.slow; }
        }
      }
      SFX.frost();
    } else if (this.type === 'arc') {
      const chainPts = [{ x: this.x, y: this.y - 16 }];
      const hit = new Set(); let cur = t;
      for (let i = 0; i < s.chain; i++) {
        if (!cur || !cur.alive) break;
        hit.add(cur.id);
        chainPts.push({ x: cur.x, y: cur.y });
        dealDamage(cur, s.dmg, 'magic');
        let nx = null, nd = 1e9;
        for (const e of game.enemies) {
          if (!e.alive || hit.has(e.id)) continue;
          const d2 = (e.x - cur.x) ** 2 + (e.y - cur.y) ** 2;
          if (d2 < 95 * 95 && d2 < nd) { nd = d2; nx = e; }
        }
        cur = nx;
      }
      if (chainPts.length > 1) game.beams.push({ pts: chainPts, color: 'rgba(255,235,120,', life: 0.16, max: 0.16, width: 2.6, jag: 7 });
      this.kick(); SFX.zap();
    } else if (this.type === 'prism') {
      game.beams.push({ pts: [{ x: this.x, y: this.y - 20 }, { x: t.x, y: t.y }], color: 'rgba(217,164,255,', life: 0.22, max: 0.22, width: 3.4, jag: 0 });
      game.pulses.push({ x: t.x, y: t.y, r: 4, maxR: 26, life: 0.3, max: 0.3, color: 'rgba(217,164,255,' });
      dealDamage(t, s.dmg, 'magic');
      this.kick(0.22); SFX.prism();
    }
    this.cd = s.cd;
  }
  kick(amt = 0.1) {
    this.recoil = amt;
    game.muzzle.push({ x: this.x + Math.cos(this.angle) * 16, y: this.y - 12 + Math.sin(this.angle) * 16, life: 0.08, max: 0.08 });
  }
}

/* ---------------- projectiles ---------------- */
function updateProjectiles(dt) {
  const ps = game.projectiles;
  for (let i = ps.length - 1; i >= 0; i--) {
    const p = ps[i];
    if (p.kind === 'arrow') {
      let tx, ty;
      if (p.tgt && p.tgt.alive) { tx = p.tgt.x; ty = p.tgt.y; p.lx = tx; p.ly = ty; }
      else { tx = p.lx ?? p.x; ty = p.ly ?? p.y; }
      const dx = tx - p.x, dy = ty - p.y;
      const d = hyp(dx, dy);
      const step = p.spd * dt;
      p.ang = Math.atan2(dy, dx);
      if (d <= step + (p.tgt ? p.tgt.def.r : 4)) {
        if (p.tgt && p.tgt.alive) { dealDamage(p.tgt, p.dmg, 'phys'); SFX.hit(); burst(tx, ty, 'rgba(255,240,190,.9)', 3, { sp1: 70, glow: true, size: 2 }); }
        ps.splice(i, 1);
      } else {
        p.x += dx / d * step; p.y += dy / d * step;
        if (game.particles.length < MAX_PARTICLES - 5 && Math.random() < 0.5) game.particles.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: 0.12, max: 0.12, size: 1.4, color: 'rgba(255,230,160,.8)', grav: 0, glow: true });
      }
    } else if (p.kind === 'shell') {
      p.t += dt / p.ft;
      const t = Math.min(1, p.t);
      p.x = lerp(p.sx, p.ex, t); p.y = lerp(p.sy, p.ey, t);
      p.h = Math.sin(t * Math.PI) * 58;
      if (game.particles.length < MAX_PARTICLES - 20 && Math.random() < 0.7) game.particles.push({ x: p.x, y: p.y - p.h, vx: R(-8, 8), vy: R(-14, -4), life: 0.3, max: 0.3, size: 2.2, color: 'rgba(200,190,180,.5)', grav: -30, glow: false });
      if (p.t >= 1) {
        ps.splice(i, 1);
        burst(p.ex, p.ey, 'rgba(255,170,80,.95)', 18, { sp1: 200, glow: true, size: 4 });
        burst(p.ex, p.ey, 'rgba(90,80,70,.8)', 10, { sp1: 90, size: 4, lifeMul: 1.4 });
        game.pulses.push({ x: p.ex, y: p.ey, r: 6, maxR: p.splash, life: 0.28, max: 0.28, color: 'rgba(255,160,70,' });
        game.shake = Math.max(game.shake, 5);
        for (const e of game.enemies) {
          if (!e.alive || e.fly) continue;
          const d = hyp(e.x - p.ex, e.y - p.ey);
          if (d <= p.splash) dealDamage(e, p.dmg * (1 - 0.45 * (d / p.splash)), 'phys');
        }
      }
    }
  }
}

/* ---------------- drawing helpers: background ---------------- */
function buildBackground() {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  const gr = c.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#2b4a26'); gr.addColorStop(0.5, '#27421f'); gr.addColorStop(1, '#1f361b');
  c.fillStyle = gr; c.fillRect(0, 0, W, H);
  const rs = mulberry32(4242);
  for (let i = 0; i < 60; i++) {
    const x = rs() * W, y = rs() * H, r = 40 + rs() * 130;
    c.fillStyle = rs() > 0.5 ? 'rgba(60,100,45,.10)' : 'rgba(15,35,12,.12)';
    c.beginPath(); c.ellipse(x, y, r, r * (0.4 + rs() * 0.5), rs() * TAU, 0, TAU); c.fill();
  }
  for (let i = 0; i < 2600; i++) {
    const x = rs() * W, y = rs() * H;
    c.fillStyle = rs() > 0.5 ? 'rgba(255,255,220,.045)' : 'rgba(0,20,0,.07)';
    c.fillRect(x, y, 1.6, 1.6);
  }
  // path
  const stroke = (w, col) => {
    c.strokeStyle = col; c.lineWidth = w; c.lineJoin = 'round'; c.lineCap = 'round';
    c.beginPath(); c.moveTo(PTS[0].x, PTS[0].y);
    for (let i = 1; i < PTS.length - 1; i++) {
      const a = PTS[i], b = PTS[i + 1];
      c.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
    }
    c.lineTo(PTS[PTS.length - 1].x, PTS[PTS.length - 1].y);
    c.stroke();
  };
  stroke(56, 'rgba(10,16,8,.5)');
  stroke(48, '#463a27');
  stroke(40, '#5d4e35');
  stroke(30, '#6f5d40');
  // cobbles
  for (let d = 10; d < PATH_LEN - 20; d += 17) {
    const p = posAt(d), p2 = posAt(d + 1);
    const ang = Math.atan2(p2.y - p.y, p2.x - p.x);
    const ox = rs() - 0.5, n = rs();
    const px = p.x + Math.cos(ang + Math.PI / 2) * ox * 24;
    const py = p.y + Math.sin(ang + Math.PI / 2) * ox * 24;
    c.save(); c.translate(px, py); c.rotate(ang + rs() * 0.6);
    c.fillStyle = n > 0.7 ? 'rgba(130,112,80,.5)' : n > 0.35 ? 'rgba(30,24,14,.22)' : 'rgba(160,140,100,.25)';
    c.beginPath(); c.ellipse(0, 0, 4 + rs() * 4, 2.6 + rs() * 2.4, 0, 0, TAU); c.fill();
    c.restore();
  }
  // flowers
  for (const f of decor.flowers) {
    c.fillStyle = `hsla(${f.hue},70%,72%,.85)`;
    for (let k = 0; k < 4; k++) {
      const a = k / 4 * TAU + f.x;
      c.beginPath(); c.arc(f.x + Math.cos(a) * 2.4 * f.s, f.y + Math.sin(a) * 2.4 * f.s, 1.5 * f.s, 0, TAU); c.fill();
    }
    c.fillStyle = 'rgba(255,240,150,.9)';
    c.beginPath(); c.arc(f.x, f.y, 1.1 * f.s, 0, TAU); c.fill();
  }
  // bushes
  for (const b of decor.bushes) {
    c.fillStyle = 'rgba(0,0,0,.25)';
    c.beginPath(); c.ellipse(b.x, b.y + 7 * b.s, 11 * b.s, 4 * b.s, 0, 0, TAU); c.fill();
    for (const [dx, dy, r, col] of [[-6, 0, 8, '#2c5225'], [6, 1, 7, '#2c5225'], [0, -5, 9, '#37632c'], [1, -7, 5, '#4a7a38']]) {
      c.fillStyle = col;
      c.beginPath(); c.arc(b.x + dx * b.s, b.y + dy * b.s, r * b.s, 0, TAU); c.fill();
    }
  }
  // rocks
  for (const rk of decor.rocks) {
    c.fillStyle = 'rgba(0,0,0,.3)';
    c.beginPath(); c.ellipse(rk.x, rk.y + 8 * rk.s, 13 * rk.s, 5 * rk.s, 0, 0, TAU); c.fill();
    c.save(); c.translate(rk.x, rk.y); c.rotate(rk.rot * 0.2);
    const pts = [[-10, 4], [-7, -6], [0, -10], [8, -6], [11, 4]];
    c.fillStyle = '#6a737d';
    c.beginPath(); c.moveTo(pts[0][0] * rk.s, pts[0][1] * rk.s);
    for (const p of pts) c.lineTo(p[0] * rk.s, p[1] * rk.s);
    c.closePath(); c.fill();
    c.fillStyle = 'rgba(255,255,255,.14)';
    c.beginPath(); c.moveTo(-7 * rk.s, -6 * rk.s); c.lineTo(0, -10 * rk.s); c.lineTo(8 * rk.s, -6 * rk.s); c.lineTo(0, -4 * rk.s); c.closePath(); c.fill();
    c.restore();
  }
  // trees
  for (const tr of decor.trees) {
    c.fillStyle = 'rgba(0,0,0,.32)';
    c.beginPath(); c.ellipse(tr.x + 5, tr.y + 12 * tr.s, 16 * tr.s, 6 * tr.s, 0, 0, TAU); c.fill();
    c.fillStyle = '#4a3521';
    c.fillRect(tr.x - 2.6 * tr.s, tr.y - 4 * tr.s, 5.2 * tr.s, 16 * tr.s);
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
  // crystal shards (ambient)
  for (const sh of decor.shards) {
    c.save(); c.translate(sh.x, sh.y); c.rotate(sh.rot);
    c.fillStyle = 'rgba(127,231,255,.5)';
    c.beginPath(); c.moveTo(0, -10 * sh.s); c.lineTo(4 * sh.s, 0); c.lineTo(0, 8 * sh.s); c.lineTo(-4 * sh.s, 0); c.closePath(); c.fill();
    c.restore();
  }
  return cv;
}
let bgCanvas = null;

/* ---------------- drawing: core & portal ---------------- */
function drawPortal(c, t) {
  drawGlow(c, 'rgba(150,80,255,.55)', PORTAL.x, PORTAL.y, 46, 0.5 + Math.sin(t * 3) * 0.1);
  c.save(); c.translate(PORTAL.x, PORTAL.y);
  c.fillStyle = '#12081f';
  c.beginPath(); c.ellipse(0, 0, 16, 26, 0, 0, TAU); c.fill();
  for (let i = 0; i < 3; i++) {
    c.strokeStyle = `rgba(190,130,255,${0.5 - i * 0.13})`;
    c.lineWidth = 2 - i * 0.4;
    const rr = 9 + i * 5 + Math.sin(t * 4 + i) * 2;
    c.beginPath(); c.ellipse(0, 0, rr * 0.65, rr, 0, t * (1 + i * 0.4), t * (1 + i * 0.4) + 3.6); c.stroke();
  }
  c.restore();
  if (game.waveActive && Math.random() < 0.4 && game.particles.length < MAX_PARTICLES - 3)
    game.particles.push({ x: PORTAL.x + R(-6, 6), y: PORTAL.y + R(-16, 16), vx: R(10, 40), vy: R(-20, 20), life: 0.4, max: 0.4, size: 2.4, color: 'rgba(190,130,255,.8)', grav: 0, glow: true });
}
function drawCore(c, t) {
  const pulse = 0.75 + Math.sin(t * 2.2) * 0.25;
  drawGlow(c, 'rgba(100,220,255,.5)', CORE.x, CORE.y - 12, 70, 0.5 * pulse);
  c.fillStyle = 'rgba(0,0,0,.35)';
  c.beginPath(); c.ellipse(CORE.x, CORE.y + 16, 30, 10, 0, 0, TAU); c.fill();
  // pedestal
  c.fillStyle = '#3c4653';
  c.beginPath(); c.moveTo(CORE.x - 24, CORE.y + 14); c.lineTo(CORE.x + 24, CORE.y + 14); c.lineTo(CORE.x + 16, CORE.y - 2); c.lineTo(CORE.x - 16, CORE.y - 2); c.closePath(); c.fill();
  c.fillStyle = '#556273';
  c.beginPath(); c.moveTo(CORE.x - 16, CORE.y - 2); c.lineTo(CORE.x + 16, CORE.y - 2); c.lineTo(CORE.x + 12, CORE.y - 8); c.lineTo(CORE.x - 12, CORE.y - 8); c.closePath(); c.fill();
  // rune ring
  c.save(); c.translate(CORE.x, CORE.y - 16); c.rotate(t * 0.5);
  c.strokeStyle = `rgba(140,230,255,${0.35 + 0.2 * pulse})`;
  c.lineWidth = 1.6; c.setLineDash([3, 9]);
  c.beginPath(); c.arc(0, 0, 30, 0, TAU); c.stroke(); c.setLineDash([]);
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * TAU;
    c.fillStyle = `rgba(160,240,255,${0.5 * pulse})`;
    c.fillRect(Math.cos(a) * 30 - 1.5, Math.sin(a) * 30 - 1.5, 3, 3);
  }
  c.restore();
  // crystal
  const hit = game.coreHit;
  c.save(); c.translate(CORE.x, CORE.y - 16 + Math.sin(t * 1.6) * 2.4);
  const grad = c.createLinearGradient(-14, -30, 14, 24);
  grad.addColorStop(0, hit > 0 ? '#ffd2cc' : '#bdf3ff');
  grad.addColorStop(0.5, hit > 0 ? '#ff706a' : '#4dc3ef');
  grad.addColorStop(1, '#1d5c8f');
  c.fillStyle = grad;
  c.beginPath(); c.moveTo(0, -34); c.lineTo(15, -8); c.lineTo(9, 20); c.lineTo(-9, 20); c.lineTo(-15, -8); c.closePath(); c.fill();
  c.fillStyle = 'rgba(255,255,255,.4)';
  c.beginPath(); c.moveTo(0, -34); c.lineTo(5, -8); c.lineTo(0, 16); c.lineTo(-4, -8); c.closePath(); c.fill();
  c.strokeStyle = `rgba(200,250,255,${0.6 * pulse})`; c.lineWidth = 1.4;
  c.beginPath(); c.moveTo(0, -34); c.lineTo(15, -8); c.lineTo(9, 20); c.lineTo(-9, 20); c.lineTo(-15, -8); c.closePath(); c.stroke();
  if (Math.random() < 0.25 && game.particles.length < MAX_PARTICLES - 2)
    game.particles.push({ x: CORE.x + R(-12, 12), y: CORE.y - 20 + R(-14, 10), vx: R(-6, 6), vy: R(-26, -12), life: 0.7, max: 0.7, size: 2, color: 'rgba(150,235,255,.9)', grav: -12, glow: true });
  c.restore();
}

/* ---------------- drawing: enemies ---------------- */
function legPair(c, x, y, ph, sp, len, w, col) {
  const a = Math.sin(ph) * 0.7;
  c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round';
  c.beginPath(); c.moveTo(x - sp, y); c.lineTo(x - sp + Math.sin(a) * len * 0.5, y + Math.cos(a) * len); c.stroke();
  c.beginPath(); c.moveTo(x + sp, y); c.lineTo(x + sp - Math.sin(a) * len * 0.5, y + Math.cos(a) * len); c.stroke();
}
function drawEnemyBody(c, type, x, y, t, ph, scale = 1, flash = false, hpFrac = 1) {
  const d = ENEMY[type];
  c.save(); c.translate(x, y); c.scale(scale, scale);
  const body = flash ? '#ffffff' : d.body;
  const dk = c => c;
  if (type === 'goblin') {
    legPair(c, 0, 5, ph, 3, 6, 2.4, '#3f7a2c');
    c.fillStyle = '#6aa84a';
    c.beginPath(); c.ellipse(0, 0, 7, 6.4, 0, 0, TAU); c.fill();
    c.fillStyle = '#7fc257';
    c.beginPath(); c.arc(0, -6, 5.4, 0, TAU); c.fill();
    c.fillStyle = '#5c9440';
    c.beginPath(); c.moveTo(-5, -7); c.lineTo(-10, -10); c.lineTo(-5, -4); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(5, -7); c.lineTo(10, -10); c.lineTo(5, -4); c.closePath(); c.fill();
    c.fillStyle = '#2a1c10';
    c.beginPath(); c.arc(-2, -7, 1.2, 0, TAU); c.arc(2, -7, 1.2, 0, TAU); c.fill();
    c.save(); c.rotate(Math.sin(ph) * 0.2 - 0.5);
    c.strokeStyle = '#cfd6dd'; c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(7, -2); c.lineTo(12, -8); c.stroke(); c.restore();
  } else if (type === 'orc' || type === 'b1') {
    const boss = type === 'b1';
    legPair(c, 0, 8, ph, 4.6, 8, 3.4, '#4c6b34');
    c.fillStyle = boss ? '#96742f' : '#5d7a3f';
    c.beginPath(); c.ellipse(0, 0, 9.6, 9, 0, 0, TAU); c.fill();
    c.fillStyle = boss ? '#7a4526' : '#688a48';
    c.beginPath(); c.arc(0, -9, 6.6, 0, TAU); c.fill();
    c.fillStyle = '#3d4f28';
    c.beginPath(); c.arc(0, -12.4, 5.4, Math.PI, 0); c.fill();
    if (boss) {
      c.fillStyle = '#caa53f';
      c.beginPath(); c.moveTo(-5, -14); c.lineTo(-3, -19); c.lineTo(-1, -15); c.lineTo(1, -20); c.lineTo(3, -15); c.lineTo(5, -19); c.lineTo(5.4, -12); c.lineTo(-5.4, -12); c.closePath(); c.fill();
      c.fillStyle = 'rgba(200,60,50,.9)';
      c.beginPath(); c.arc(-2.4, -9.4, 1.4, 0, TAU); c.arc(2.4, -9.4, 1.4, 0, TAU); c.fill();
    } else {
      c.fillStyle = '#20160c';
      c.beginPath(); c.arc(-2.4, -9.6, 1.2, 0, TAU); c.arc(2.4, -9.6, 1.2, 0, TAU); c.fill();
      c.fillStyle = '#e8e2cf';
      c.beginPath(); c.moveTo(-3.4, -6); c.lineTo(-2.6, -3.4); c.lineTo(-1.8, -6); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(1.8, -6); c.lineTo(2.6, -3.4); c.lineTo(3.4, -6); c.closePath(); c.fill();
    }
    c.fillStyle = boss ? '#8a5f33' : '#54703a';
    c.beginPath(); c.arc(boss ? 11 : 10, 0, boss ? 5 : 4.4, 0, TAU); c.fill();
    if (boss) {
      c.strokeStyle = '#6b4a2f'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(-10, -2); c.lineTo(-16, -14); c.stroke();
      c.fillStyle = '#b8443a';
      c.beginPath(); c.moveTo(-16, -14); c.lineTo(-12, -10); c.lineTo(-18, -8); c.closePath(); c.fill();
    }
  } else if (type === 'bat') {
    const flap = Math.sin(t * 16 + ph) * 0.9;
    c.fillStyle = 'rgba(30,15,50,.85)';
    for (const sgn of [-1, 1]) {
      c.save(); c.scale(sgn, 1); c.rotate(-flap * 0.55);
      c.beginPath(); c.moveTo(4, -3); c.quadraticCurveTo(14, -10, 18, -2); c.quadraticCurveTo(12, 0, 9, 4); c.quadraticCurveTo(7, 0, 4, -1); c.closePath(); c.fill();
      c.restore();
    }
    c.fillStyle = flash ? '#fff' : '#8455c4';
    c.beginPath(); c.ellipse(0, -3, 5, 5.6, 0, 0, TAU); c.fill();
    c.fillStyle = flash ? '#fff' : '#9b6bd6';
    c.beginPath(); c.arc(0, -6, 3.6, 0, TAU); c.fill();
    c.fillStyle = '#ffd23e';
    c.beginPath(); c.arc(-1.4, -6.6, 1, 0, TAU); c.arc(1.4, -6.6, 1, 0, TAU); c.fill();
  } else if (type === 'wraith') {
    const bob = Math.sin(t * 3 + ph) * 2;
    c.translate(0, bob);
    const g = c.createRadialGradient(0, -6, 2, 0, -4, 14);
    g.addColorStop(0, flash ? 'rgba(255,255,255,.95)' : 'rgba(200,245,255,.85)');
    g.addColorStop(1, 'rgba(120,200,255,0)');
    c.fillStyle = g;
    c.beginPath(); c.arc(0, -4, 13, 0, TAU); c.fill();
    c.fillStyle = flash ? 'rgba(255,255,255,.9)' : 'rgba(185,235,255,.55)';
    c.beginPath(); c.arc(0, -7, 7, Math.PI, 0);
    c.quadraticCurveTo(8, 4, 4, 8 + Math.sin(t * 5 + ph) * 2);
    c.quadraticCurveTo(2, 4, 0, 9 + Math.cos(t * 4 + ph) * 2);
    c.quadraticCurveTo(-2, 4, -4, 8 + Math.sin(t * 4.6 + ph + 1) * 2);
    c.quadraticCurveTo(-8, 3, -7, -7);
    c.closePath(); c.fill();
    c.fillStyle = '#ff5d5d';
    c.beginPath(); c.arc(-2.6, -8, 1.3, 0, TAU); c.arc(2.6, -8, 1.3, 0, TAU); c.fill();
  } else if (type === 'golem') {
    legPair(c, 0, 9, ph * 0.7, 5, 8, 4.4, '#5b6570');
    c.fillStyle = flash ? '#fff' : '#77828f';
    c.beginPath(); c.roundRect ? c.roundRect(-10, -8, 20, 17, 4) : c.rect(-10, -8, 20, 17); c.fill();
    c.fillStyle = flash ? '#eee' : '#8d97a3';
    c.beginPath(); c.arc(0, -12, 6.4, 0, TAU); c.fill();
    c.fillStyle = '#5b6570';
    c.beginPath(); c.arc(-12, -4, 4.4, 0, TAU); c.arc(12, -4, 4.4, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(255,150,60,.85)'; c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(-6, -4); c.lineTo(-2, 0); c.lineTo(-4, 4); c.stroke();
    c.beginPath(); c.moveTo(5, -6); c.lineTo(3, -1); c.stroke();
    c.fillStyle = '#ffb35c';
    c.beginPath(); c.arc(-2.4, -13, 1.3, 0, TAU); c.arc(2.4, -13, 1.3, 0, TAU); c.fill();
  } else if (type === 'b2') {
    legPair(c, 0, 10, ph * 0.6, 5.4, 9, 4.6, '#3d7ba0');
    c.fillStyle = flash ? '#fff' : '#5aa9d3';
    c.beginPath(); c.roundRect ? c.roundRect(-11, -10, 22, 21, 5) : c.rect(-11, -10, 22, 21); c.fill();
    c.fillStyle = flash ? '#eee' : '#7fc3e8';
    c.beginPath(); c.arc(0, -14, 7, 0, TAU); c.fill();
    c.fillStyle = 'rgba(220,250,255,.9)';
    for (const [px, py] of [[-6, -10], [3, -2], [-3, 5], [8, -8]]) {
      c.beginPath(); c.moveTo(px, py - 3); c.lineTo(px + 2, py); c.lineTo(px, py + 3); c.lineTo(px - 2, py); c.closePath(); c.fill();
    }
    c.fillStyle = '#d9f6ff';
    c.beginPath(); c.arc(-2.6, -15, 1.5, 0, TAU); c.arc(2.6, -15, 1.5, 0, TAU); c.fill();
  } else if (type === 'b3') {
    const fl = Math.sin(t * 10 + ph);
    drawGlow(c, 'rgba(255,90,40,.5)', 0, -4, 40, 0.5 + fl * 0.12);
    legPair(c, 0, 11, ph * 0.7, 6, 10, 5, '#6b2318');
    c.fillStyle = flash ? '#fff' : '#a5352a';
    c.beginPath(); c.roundRect ? c.roundRect(-12, -11, 24, 23, 6) : c.rect(-12, -11, 24, 23); c.fill();
    c.fillStyle = flash ? '#eee' : '#c8453a';
    c.beginPath(); c.arc(0, -15, 7.6, 0, TAU); c.fill();
    c.strokeStyle = '#ffd23e'; c.lineWidth = 2.4; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-5, -20); c.quadraticCurveTo(-9, -27, -4, -29); c.stroke();
    c.beginPath(); c.moveTo(5, -20); c.quadraticCurveTo(9, -27, 4, -29); c.stroke();
    c.fillStyle = '#ffe27a';
    c.beginPath(); c.arc(-2.8, -15.6, 1.6, 0, TAU); c.arc(2.8, -15.6, 1.6, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,150,60,.8)';
    if (Math.random() < 0.5 && game.particles.length < MAX_PARTICLES - 2)
      game.particles.push({ x: x + R(-12, 12), y: y + R(-18, 2), vx: R(-8, 8), vy: R(-40, -20), life: 0.5, max: 0.5, size: 3, color: 'rgba(255,120,50,.8)', grav: -40, glow: true });
  }
  c.restore();
}
function drawEnemy(c, e, t) {
  const d = e.def;
  let yy = e.y;
  let sc = 1;
  if (e.spawnT > 0) {
    c.save(); c.globalAlpha = 1 - e.spawnT / 0.45;
  }
  if (e.fly) {
    const alt = 12 + Math.sin(t * 2.6 + e.ph) * 3;
    c.fillStyle = 'rgba(0,0,0,.22)';
    c.beginPath(); c.ellipse(e.x, e.y + 8, 8 * sc, 3.4, 0, 0, TAU); c.fill();
    yy = e.y - alt;
  } else {
    c.fillStyle = 'rgba(0,0,0,.28)';
    c.beginPath(); c.ellipse(e.x, e.y + d.r * 0.72, d.r * 0.72, d.r * 0.3, 0, 0, TAU); c.fill();
  }
  if (e.slowUntil > game.time) {
    drawGlow(c, 'rgba(120,220,255,.5)', e.x, yy - 4, 18, 0.4);
  }
  const bob = e.fly ? 0 : Math.abs(Math.sin(e.ph + e.dist * 0.06)) * 2;
  drawEnemyBody(c, e.type, e.x, yy - bob, t, e.ph + e.dist * 0.05, (d.boss ? 1.7 : 1) * sc, e.hitFlash > 0);
  // hp bar
  if ((e.hp < e.maxHp || e.def.boss) && e.alive) {
    const bw = d.boss ? 46 : 22, bh = d.boss ? 5 : 3.4;
    const bx = e.x - bw / 2, by = yy - bob - (d.boss ? 44 : d.r + 12);
    c.fillStyle = 'rgba(0,0,0,.55)';
    c.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
    const f = clamp(e.hp / e.maxHp, 0, 1);
    const hue = f > 0.5 ? 105 : f > 0.25 ? 45 : 5;
    c.fillStyle = d.boss ? '#e0503c' : `hsl(${hue},75%,55%)`;
    c.fillRect(bx, by, bw * f, bh);
    c.fillStyle = 'rgba(255,255,255,.35)';
    c.fillRect(bx, by, bw * f, 1.2);
  }
  if (e.spawnT > 0) c.restore();
}

/* ---------------- drawing: towers ---------------- */
function drawTowerBase(c, x, y, lvl) {
  c.fillStyle = 'rgba(0,0,0,.34)';
  c.beginPath(); c.ellipse(x + 3, y + 10, 16, 6.4, 0, 0, TAU); c.fill();
  c.fillStyle = '#4c5259';
  c.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * TAU + 0.3;
    const px = x + Math.cos(a) * 15, py = y + Math.sin(a) * 11 + 2;
    i ? c.lineTo(px, py) : c.moveTo(px, py);
  }
  c.closePath(); c.fill();
  c.fillStyle = '#646c75';
  c.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * TAU + 0.3;
    const px = x + Math.cos(a) * 12, py = y + Math.sin(a) * 8.4;
    i ? c.lineTo(px, py) : c.moveTo(px, py);
  }
  c.closePath(); c.fill();
  c.fillStyle = '#7a838d';
  c.beginPath(); c.ellipse(x, y - 3, 9, 6.4, 0, 0, TAU); c.fill();
}
function drawLevelPips(c, x, y, lvl, color) {
  for (let i = 0; i < lvl; i++) {
    const a = -Math.PI / 2 + (i - (lvl - 1) / 2) * 0.75;
    const px = x + Math.cos(a) * 13.4, py = y + 6 + Math.sin(a) * 4;
    c.fillStyle = color;
    c.beginPath(); c.arc(px, py, 2, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,255,255,.7)';
    c.beginPath(); c.arc(px - 0.6, py - 0.6, 0.8, 0, TAU); c.fill();
  }
}
function drawTowerBody(c, type, lvl, x, y, angle, t, ghost = false) {
  const d = TOWERS[type];
  const rec = 0;
  c.save();
  if (ghost) c.globalAlpha = 0.6;
  drawTowerBase(c, x, y, lvl);
  if (type === 'arrow') {
    c.fillStyle = '#8a5a33';
    c.beginPath(); c.ellipse(x, y - 5, 8.4, 6, 0, 0, TAU); c.fill();
    c.save(); c.translate(x, y - 9); c.rotate(angle);
    const rk = lvl >= 3 ? 2 : lvl >= 2 ? 1.4 : 1;
    c.fillStyle = '#5f4023';
    c.fillRect(-4, -1.8, 18 * rk * 0.62 + 4, 3.6);
    c.strokeStyle = '#d9cfa8'; c.lineWidth = 1.5;
    c.beginPath(); c.arc(10, 0, 7 * (0.8 + rk * 0.15), -1.3, 1.3); c.stroke();
    c.strokeStyle = '#efe6c8'; c.lineWidth = 0.9;
    c.beginPath(); c.moveTo(10 + Math.cos(-1.3) * 8, Math.sin(-1.3) * 8); c.lineTo(4, 0); c.lineTo(10 + Math.cos(1.3) * 8, Math.sin(1.3) * 8); c.stroke();
    if (lvl >= 2) { c.fillStyle = '#e8c268'; c.beginPath(); c.arc(2, 0, 2, 0, TAU); c.fill(); }
    if (lvl >= 3) {
      c.strokeStyle = 'rgba(232,194,104,.8)'; c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(14, -4); c.lineTo(20, 0); c.lineTo(14, 4); c.stroke();
    }
    c.restore();
  } else if (type === 'cannon') {
    c.fillStyle = '#59452f';
    c.beginPath(); c.arc(x, y - 6, 8.4, 0, TAU); c.fill();
    c.save(); c.translate(x, y - 9); c.rotate(angle);
    c.fillStyle = '#3c4753';
    c.beginPath(); c.roundRect ? c.roundRect(-4, -5.4, 18, 10.8, 3) : c.rect(-4, -5.4, 18, 10.8); c.fill();
    c.fillStyle = '#242c36';
    c.beginPath(); c.arc(15, 0, 4.6, 0, TAU); c.fill();
    c.fillStyle = '#0e1318';
    c.beginPath(); c.arc(15.6, 0, 2.6, 0, TAU); c.fill();
    if (lvl >= 2) { c.fillStyle = '#8b6a3f'; c.fillRect(-4, -5.8, 4, 11.6); }
    if (lvl >= 3) {
      c.fillStyle = 'rgba(240,154,90,.9)';
      c.beginPath(); c.arc(15.6, 0, 1.6 + Math.sin(t * 8) * 0.5, 0, TAU); c.fill();
    }
    c.restore();
  } else if (type === 'frost') {
    drawGlow(c, 'rgba(120,220,255,.4)', x, y - 14, 22, 0.5 + Math.sin(t * 2.4) * 0.15);
    c.strokeStyle = 'rgba(150,230,255,.35)'; c.lineWidth = 1.2;
    const rr = 12 + (t * 14 % 10);
    c.beginPath(); c.ellipse(x, y - 3, rr, rr * 0.45, 0, 0, TAU); c.stroke();
    for (let i = 0; i < Math.min(3, lvl) + 1; i++) {
      const a = i * 1.9 + 0.6, hgt = 14 + (i === 0 ? 8 : 0) + lvl * 2.4;
      const px = x + Math.cos(a) * (i ? 6 : 0), py = y - 4 + (i ? 2 : 0);
      const g = c.createLinearGradient(px, py, px, py - hgt);
      g.addColorStop(0, '#2e7fae'); g.addColorStop(1, '#c5f2ff');
      c.fillStyle = g;
      c.beginPath(); c.moveTo(px - 3.4 + Math.cos(a), py); c.lineTo(px, py - hgt); c.lineTo(px + 3.4 + Math.cos(a), py); c.closePath(); c.fill();
    }
    c.fillStyle = `rgba(200,245,255,${0.5 + Math.sin(t * 4) * 0.3})`;
    c.beginPath(); c.arc(x, y - 24 - lvl * 2, 2.2, 0, TAU); c.fill();
  } else if (type === 'arc') {
    c.fillStyle = '#37433f';
    c.beginPath(); c.arc(x, y - 6, 8, 0, TAU); c.fill();
    c.strokeStyle = '#a3762f'; c.lineWidth = 2.2;
    for (let i = 0; i < 3; i++) {
      c.beginPath(); c.ellipse(x, y - 9 - i * 3.6, 6.6 - i * 1.5, 2.4, 0, 0, TAU); c.stroke();
    }
    const p = 0.6 + Math.sin(t * 6) * 0.4;
    drawGlow(c, 'rgba(255,225,90,.55)', x, y - 21, 16, 0.4 * p + 0.2);
    const g2 = c.createRadialGradient(x - 2, y - 23, 1, x, y - 21, 6.4);
    g2.addColorStop(0, '#fff8d0'); g2.addColorStop(1, '#e0a72e');
    c.fillStyle = g2;
    c.beginPath(); c.arc(x, y - 21, 5.4 + lvl * 0.5, 0, TAU); c.fill();
    c.strokeStyle = `rgba(255,240,140,${0.55 * p})`; c.lineWidth = 1.2;
    for (let i = 0; i < Math.min(3, lvl + 1); i++) {
      const a1 = t * 5 + i * 2.1;
      c.beginPath();
      c.moveTo(x + Math.cos(a1) * 8, y - 21 + Math.sin(a1) * 3.4);
      c.lineTo(x + Math.cos(a1 + 1.2) * 9.4, y - 21 + Math.sin(a1 + 1.2) * 4);
      c.stroke();
    }
  } else if (type === 'prism') {
    c.fillStyle = '#4a3f63';
    c.beginPath(); c.arc(x, y - 6, 7.6, 0, TAU); c.fill();
    c.strokeStyle = '#8c6fc0'; c.lineWidth = 1.4;
    c.beginPath(); c.ellipse(x, y - 12, 9, 3.2, 0, 0, TAU); c.stroke();
    const fy = y - 22 + Math.sin(t * 2) * 2;
    drawGlow(c, 'rgba(217,164,255,.5)', x, fy, 20, 0.45 + Math.sin(t * 3) * 0.12);
    c.save(); c.translate(x, fy); c.rotate(Math.sin(t * 0.7) * 0.16);
    const gg = c.createLinearGradient(0, -11, 0, 11);
    gg.addColorStop(0, '#f2e2ff'); gg.addColorStop(1, '#7d4fd6');
    c.fillStyle = gg;
    c.beginPath(); c.moveTo(0, -11 - lvl); c.lineTo(6.4, 0); c.lineTo(0, 11 + lvl); c.lineTo(-6.4, 0); c.closePath(); c.fill();
    c.fillStyle = 'rgba(255,255,255,.5)';
    c.beginPath(); c.moveTo(0, -11 - lvl); c.lineTo(2.4, 0); c.lineTo(0, 9); c.lineTo(-2, 0); c.closePath(); c.fill();
    c.restore();
    c.strokeStyle = `rgba(217,164,255,.6)`; c.lineWidth = 1.1;
    c.beginPath(); c.ellipse(x, fy, 12, 4, t * 0.9, 0, TAU); c.stroke();
  }
  drawLevelPips(c, x, y, lvl, d.color);
  c.restore();
}

/* ---------------- waves ---------------- */
const WAVES = [
  [['goblin', 8, 0.9, 0]],
  [['goblin', 12, 0.8, 0]],
  [['goblin', 10, 0.7, 0], ['orc', 4, 1.4, 6]],
  [['orc', 8, 1.1, 0], ['bat', 5, 0.8, 4]],
  [['goblin', 10, 0.7, 0], ['b1', 1, 0, 8]],
  [['bat', 14, 0.55, 0]],
  [['orc', 10, 0.9, 0], ['goblin', 10, 0.5, 10]],
  [['wraith', 6, 1.2, 0], ['orc', 8, 0.9, 2]],
  [['golem', 2, 2.4, 0], ['bat', 12, 0.5, 1]],
  [['orc', 10, 0.7, 0], ['golem', 2, 2, 6], ['b2', 1, 0, 12]],
  [['wraith', 10, 0.8, 0], ['goblin', 14, 0.4, 2]],
  [['orc', 16, 0.6, 0], ['bat', 10, 0.5, 6]],
  [['golem', 4, 2, 0], ['wraith', 8, 0.9, 3]],
  [['bat', 18, 0.4, 0], ['orc', 12, 0.7, 4]],
  [['wraith', 10, 0.7, 0], ['b1', 1, 0, 5], ['b2', 1, 0, 14]],
  [['golem', 6, 1.8, 0], ['bat', 14, 0.45, 3]],
  [['wraith', 14, 0.7, 0], ['orc', 14, 0.6, 2]],
  [['golem', 6, 1.6, 0], ['wraith', 10, 0.8, 4], ['bat', 12, 0.4, 8]],
  [['orc', 20, 0.5, 0], ['golem', 4, 2, 6], ['wraith', 8, 0.8, 10]],
  [['wraith', 12, 0.6, 0], ['b1', 1, 0, 6], ['golem', 4, 2, 10], ['b3', 1, 0, 14]],
];
function waveGroups(n) {
  if (n >= 1 && n <= 20) return WAVES[n - 1];
  const g = [];
  const pool = n < 26
    ? [['goblin', 14 + n, 0.35], ['orc', 8 + n / 2, 0.5], ['bat', 8 + n / 2, 0.4], ['wraith', 6 + n / 3, 0.7]]
    : [['orc', 10 + n / 2, 0.45], ['bat', 10 + n / 2, 0.38], ['wraith', 8 + n / 3, 0.6], ['golem', 4 + n / 6, 1.6]];
  const rounds = 3;
  for (let i = 0; i < rounds; i++) {
    const [type, count, gap] = pool[Math.floor(rndG() * pool.length) % pool.length];
    g.push([type, Math.round(count), gap, i * 7]);
  }
  if (n % 5 === 0) g.push([n % 15 === 0 ? 'b3' : (n % 10 === 0 ? 'b2' : 'b1'), 1 + Math.floor(n / 40), 1.2, 3]);
  return g;
}
function buildSpawnQueue(n) {
  const q = [];
  for (const [type, count, gap, delay] of waveGroups(n)) {
    for (let i = 0; i < count; i++) q.push({ t: delay + i * gap, type });
  }
  q.sort((a, b) => a.t - b.t);
  return q;
}
function isBossWave(n) {
  return n === 5 || n === 10 || n === 15 || n === 20 || (n > 20 && n % 5 === 0);
}
function startWave() {
  if (game.state !== 'play' || game.waveActive) return;
  game.wave++;
  game.waveActive = true;
  game.waveT = 0;
  game.spawnQueue = buildSpawnQueue(game.wave);
  if (isBossWave(game.wave)) {
    game.banner = { title: '第 ' + game.wave + ' 波', sub: '⚔ 魔族先锋压境 ⚔', t: 2.8, boss: true };
  } else {
    game.banner = { title: '第 ' + game.wave + ' 波', sub: game.wave === 20 ? '最终波——决战！' : '敌军来袭', t: 2.2, boss: false };
  }
  SFX.horn();
  updateHud();
}
function checkWaveEnd() {
  if (!game.waveActive || game.spawnQueue.length) return;
  for (const e of game.enemies) if (e.alive) return;
  game.waveActive = false;
  const bonus = 35 + game.wave * 6;
  game.gold += bonus; game.stats.gold += bonus;
  if (!(game.wave >= 20 && !game.endless)) {
    game.banner = { title: '波次肃清', sub: '第 ' + game.wave + ' 波已清除   +' + bonus + ' ◈', t: 1.8, clear: true };
    SFX.ding();
  }
  if (!game.endless && game.wave >= 20) { endGame(true); return; }
  updateHud();
}

/* ---------------- placement / towers mgmt ---------------- */
function towerAt(col, row) {
  for (const t of game.towers) if (t.col === col && t.row === row) return t;
  return null;
}
function cellFree(col, row) {
  if (col < 0 || row < 0 || col >= COLS || row >= ROWS) return false;
  if (blocked.has(cellKey(col, row))) return false;
  return !towerAt(col, row);
}
function placeTowerAt(type, col, row) {
  const d = TOWERS[type];
  if (!cellFree(col, row)) return null;
  if (game.gold < d.cost) {
    ftext(col * CELL + 16, row * CELL + 16, '晶钻不足', '#ff8d84', 13);
    return null;
  }
  game.gold -= d.cost;
  const t = new Tower(type, col, row);
  game.towers.push(t);
  game.stats.built++;
  burst(col * CELL + 16, row * CELL + 16 + 6, 'rgba(220,200,160,.8)', 10, { sp1: 80, up: 30 });
  SFX.place();
  updateHud();
  if (game.gold < d.cost) selectBuild(null);
  return t;
}
function upgradeTower(t) {
  if (t.lvl >= 3) return;
  const cost = t.def.tiers[t.lvl].cost;
  if (game.gold < cost) return;
  game.gold -= cost; t.invested += cost; t.lvl++;
  burst(t.x, t.y - 8, 'rgba(255,230,140,.95)', 16, { sp1: 120, glow: true, up: 40 });
  game.pulses.push({ x: t.x, y: t.y, r: 6, maxR: 40, life: 0.4, max: 0.4, color: 'rgba(255,230,140,', front: true });
  SFX.place();
  updateHud(); refreshSel();
}
function sellTower(t) {
  const refund = Math.floor(t.invested * 0.7);
  game.gold += refund;
  game.towers.splice(game.towers.indexOf(t), 1);
  ftext(t.x, t.y - 18, '+' + refund, '#ffd873', 14);
  burst(t.x, t.y, 'rgba(160,160,170,.7)', 10, { sp1: 90 });
  SFX.sell();
  game.sel = null;
  refreshSel(); updateHud();
}

/* ---------------- game flow ---------------- */
function startGame() {
  Object.assign(game, {
    state: 'play', gold: 275, lives: 20, wave: 0, waveActive: false,
    speed: game.speed, paused: false, time: game.time, shake: 0, vign: 0, coreHit: 0,
    enemies: [], towers: [], projectiles: [], beams: [], pulses: [],
    particles: [], texts: [], muzzle: [], spawnQueue: [], waveT: 0,
    build: null, sel: null, endless: false, banner: null,
  });
  game.stats = { kills: 0, gold: 0, built: 0 };
  $('titleOv').classList.add('hidden');
  $('endOv').classList.add('hidden');
  $('pauseOv').classList.add('hidden');
  refreshSel(); renderShopState(); renderNextPreview(); updateHud();
}
function endGame(win) {
  if (game.state !== 'play') return;
  game.state = win ? 'win' : 'over';
  game.build = null; game.sel = null;
  refreshSel(); renderShopState();
  const ov = $('endOv');
  const ttl = $('endTitle');
  ttl.textContent = win ? '守 卫 成 功' : '水 晶 陷 落';
  ttl.className = 'ptitle endtitle ' + (win ? 'win' : 'lose');
  $('endSub').textContent = win
    ? (game.endless ? '无尽模式落幕 · 你是真正的守护者' : '二十波魔族尽数覆灭 · 圣光长明')
    : ('敌军踏破了水晶 · 止步第 ' + game.wave + ' 波');
  $('stWave').textContent = game.wave;
  $('stKill').textContent = game.stats.kills;
  $('stGold').textContent = game.stats.gold;
  $('stBuild').textContent = game.stats.built;
  $('btnEndless').style.display = win ? 'inline-block' : 'none';
  ov.classList.remove('hidden');
  if (win) SFX.win(); else SFX.lose();
}
function endEndless() {
  game.endless = true;
  game.state = 'play';
  $('endOv').classList.add('hidden');
  game.banner = { title: '无尽模式', sub: '坚持得越久，荣耀越闪耀', t: 2.4, clear: true };
  updateHud();
}
function togglePause() {
  if (game.state !== 'play') return;
  game.paused = !game.paused;
  $('pauseOv').classList.toggle('hidden', !game.paused);
  $('btnPause').classList.toggle('on', game.paused);
  SFX.ui();
}
function setSpeed(n) {
  game.speed = n;
  $('btnSpeed').textContent = n + '×';
  $('btnSpeed').classList.toggle('on', n > 1);
  SFX.ui();
}

/* ---------------- DOM refs & HUD ---------------- */
function $(id) { return document.getElementById(id); }
let lastGoldShown = -1;
function updateHud() {
  $('vLives').textContent = Math.max(0, game.lives);
  $('vGold').textContent = game.gold;
  $('vWave').textContent = Math.min(game.wave, game.totalWaves) + (game.endless && game.wave > game.totalWaves ? '+' : '');
  if (game.gold > lastGoldShown && lastGoldShown >= 0) {
    const chip = $('chipGold');
    chip.classList.remove('flash'); void chip.offsetWidth; chip.classList.add('flash');
  }
  lastGoldShown = game.gold;
  const btn = $('btnWave');
  if (game.state !== 'play') { btn.disabled = true; btn.classList.remove('ready'); }
  else if (game.waveActive) { btn.disabled = true; btn.classList.remove('ready'); btn.textContent = '⚔ 第 ' + game.wave + ' 波 激战中'; }
  else {
    btn.disabled = false; btn.classList.add('ready');
    btn.textContent = '▶ 开始第 ' + (game.wave + 1) + ' 波';
  }
  renderShopState();
  if (game.sel) refreshSel();
}
const ORDER = ['arrow', 'cannon', 'frost', 'arc', 'prism'];
function buildShop() {
  const shop = $('shop');
  for (const type of ORDER) {
    const d = TOWERS[type];
    const card = document.createElement('div');
    card.className = 'card'; card.dataset.type = type;
    const ic = document.createElement('canvas');
    ic.width = 112; ic.height = 112;
    const c = ic.getContext('2d');
    c.save(); c.translate(56, 68); c.scale(1.35, 1.35);
    drawTowerBody(c, type, 2, 0, -2, -2.1, 0.7);
    c.restore();
    card.appendChild(ic);
    const info = document.createElement('div');
    info.innerHTML = '<div class="nm">' + d.name + '</div><div class="cost">' + d.cost + '</div><div class="tag">' + d.tag + '</div>';
    card.appendChild(info);
    const hk = document.createElement('span');
    hk.className = 'hk'; hk.textContent = d.hot;
    card.appendChild(hk);
    card.addEventListener('click', () => { SFX.init(); selectBuild(game.build === type ? null : type); SFX.ui(); });
    shop.appendChild(card);
  }
}
function renderShopState() {
  for (const card of document.querySelectorAll('#shop .card')) {
    const type = card.dataset.type;
    card.classList.toggle('sel', game.build === type);
    card.classList.toggle('poor', game.gold < TOWERS[type].cost);
  }
}
function selectBuild(type) {
  game.build = type;
  if (type) game.sel = null;
  refreshSel(); renderShopState();
}
function renderNextPreview() {
  const el = $('nextPrev');
  el.querySelectorAll('canvas,.cnt').forEach(x => x.remove());
  const n = game.wave + 1;
  const counts = new Map();
  for (const [type, count] of waveGroups(n)) counts.set(type, (counts.get(type) || 0) + count);
  let i = 0;
  for (const [type, count] of counts) {
    if (i >= 4) { const s = document.createElement('span'); s.className = 'cnt'; s.textContent = '…'; el.appendChild(s); break; }
    const cv = document.createElement('canvas');
    cv.width = 80; cv.height = 80;
    const c = cv.getContext('2d');
    const d = ENEMY[type];
    c.save(); c.translate(40, d.boss ? 44 : 52); c.scale(d.boss ? 1.35 : (d.r > 14 ? 1.9 : 2.3), d.boss ? 1.35 : (d.r > 14 ? 1.9 : 2.3));
    drawEnemyBody(c, type, 0, 0, 0.3, 0.8);
    c.restore();
    el.appendChild(cv);
    const s = document.createElement('span');
    s.className = 'cnt'; s.textContent = '×' + count;
    el.appendChild(s);
    i++;
  }
}

/* ---------------- selection panel ---------------- */
function refreshSel() {
  const t = game.sel;
  const panel = $('selPanel'), tip = $('tipText');
  if (!t) { panel.classList.remove('show'); tip.style.display = ''; return; }
  tip.style.display = 'none';
  panel.classList.add('show');
  const ic = $('selIcon'), c = ic.getContext('2d');
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, 128, 128);
  c.save(); c.translate(64, 78); c.scale(1.5, 1.5);
  drawTowerBody(c, t.type, t.lvl, 0, -2, -2.1, 0.7);
  c.restore();
  $('selName').textContent = t.def.name;
  $('selLvl').textContent = '◆'.repeat(t.lvl) + '◇'.repeat(3 - t.lvl) + '  LV.' + t.lvl;
  const s = t.stat;
  const nxt = t.lvl < 3 ? t.def.tiers[t.lvl] : null;
  const row = (label, val, next) => '<span><span class="lbl">' + label + '</span> <b>' + val + '</b>' +
    (next != null && next !== val ? '<span class="up">→ ' + next + '</span>' : '') + '</span>';
  let html = row('DPS', t.dps, nxt ? Math.round(TOWERS[t.type].tiers[t.lvl] && tierDps(t.type, t.lvl + 1)) : null);
  html += row('伤害', s.dmg, nxt ? nxt.dmg : null);
  html += row('射程', s.range, nxt ? nxt.range : null);
  if (s.splash) html += row('溅射', s.splash, nxt ? nxt.splash : null);
  if (s.slow) html += row('减速', Math.round(s.slow * 100) + '%', nxt ? Math.round(nxt.slow * 100) + '%' : null);
  if (s.chain) html += row('跳跃', s.chain, nxt ? nxt.chain : null);
  html += '<span><span class="lbl">已投入</span> <b style="color:var(--gold-hi)">◈ ' + t.invested + '</b></span>';
  $('selStats').innerHTML = html;
  const upBtn = $('btnUp');
  if (nxt) { upBtn.disabled = game.gold < nxt.cost; upBtn.textContent = '升级 ◈' + nxt.cost; }
  else { upBtn.disabled = true; upBtn.textContent = '已满级'; }
  $('btnSell').textContent = '出售 +◈' + Math.floor(t.invested * 0.7);
}
function tierDps(type, lvl) {
  const s = TOWERS[type].tiers[lvl - 1];
  return s.dmg * (1 / s.cd) * (type === 'arc' ? 1 + s.chain * 0.5 : type === 'cannon' ? 1.25 : 1);
}

/* ---------------- input ---------------- */
function canvasPos(e) {
  const rect = cvs.getBoundingClientRect();
  return { x: (e.clientX - rect.left) * W / rect.width, y: (e.clientY - rect.top) * H / rect.height };
}
cvs.addEventListener('mousemove', e => {
  const p = canvasPos(e);
  const col = Math.floor(p.x / CELL), row = Math.floor(p.y / CELL);
  game.hoverCell = { col, row, x: p.x, y: p.y };
});
cvs.addEventListener('mouseleave', () => { game.hoverCell = null; });
cvs.addEventListener('contextmenu', e => {
  e.preventDefault();
  selectBuild(null);
  game.sel = null; refreshSel();
});
cvs.addEventListener('mousedown', e => {
  if (e.button !== 0 || game.state !== 'play') return;
  SFX.init();
  const p = canvasPos(e);
  const col = Math.floor(p.x / CELL), row = Math.floor(p.y / CELL);
  const hit = towerAt(col, row);
  if (game.build) {
    const t = placeTowerAt(game.build, col, row);
    if (t) { renderNextPreview(); }
    return;
  }
  game.sel = hit || null;
  if (hit) SFX.ui();
  refreshSel();
});
window.addEventListener('keydown', e => {
  if (e.key >= '1' && e.key <= '5') {
    SFX.init();
    const type = ORDER[+e.key - 1];
    selectBuild(game.build === type ? null : type);
  } else if (e.key === 'Escape') {
    selectBuild(null); game.sel = null; refreshSel();
  } else if (e.key === ' ') {
    e.preventDefault(); togglePause();
  } else if (e.key === 'f' || e.key === 'F') {
    setSpeed(game.speed >= 3 ? 1 : game.speed + 1);
  } else if (e.key === 'm' || e.key === 'M') {
    toggleSound();
  } else if ((e.key === 'r' || e.key === 'R') && game.state !== 'play') {
    startGame();
  }
});
function toggleSound() {
  SFX.muted = !SFX.muted;
  $('btnSound').classList.toggle('on', !SFX.muted);
  $('btnSound').textContent = SFX.muted ? '∅' : '♪';
}
$('btnStart').addEventListener('click', () => { SFX.init(); startGame(); SFX.ui(); });
$('btnRetry').addEventListener('click', () => { startGame(); });
$('btnEndless').addEventListener('click', () => { endEndless(); startWave(); });
$('btnWave').addEventListener('click', () => { SFX.init(); startWave(); });
$('btnPause').addEventListener('click', () => togglePause());
$('btnResume').addEventListener('click', () => togglePause());
$('btnSpeed').addEventListener('click', () => setSpeed(game.speed >= 3 ? 1 : game.speed + 1));
$('btnSound').addEventListener('click', () => { SFX.init(); toggleSound(); });
$('btnUp').addEventListener('click', () => { if (game.sel) upgradeTower(game.sel); });
$('btnSell').addEventListener('click', () => { if (game.sel) sellTower(game.sel); });

/* ---------------- beams / particles / texts update ---------------- */
function updateFx(dt) {
  for (let i = game.beams.length - 1; i >= 0; i--) { if ((game.beams[i].life -= dt) <= 0) game.beams.splice(i, 1); }
  for (let i = game.pulses.length - 1; i >= 0; i--) { if ((game.pulses[i].life -= dt) <= 0) game.pulses.splice(i, 1); }
  for (let i = game.muzzle.length - 1; i >= 0; i--) { if ((game.muzzle[i].life -= dt) <= 0) game.muzzle.splice(i, 1); }
  for (let i = game.particles.length - 1; i >= 0; i--) {
    const p = game.particles[i];
    p.life -= dt;
    if (p.life <= 0) { game.particles.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.grav * dt;
    p.vx *= 1 - dt * 1.4;
  }
  for (let i = game.texts.length - 1; i >= 0; i--) {
    const x = game.texts[i];
    x.life -= dt;
    if (x.life <= 0) { game.texts.splice(i, 1); continue; }
    x.y += x.vy * dt; x.vy *= 1 - dt * 2;
  }
  if (game.banner && (game.banner.t -= dt) <= 0) game.banner = null;
  game.shake = Math.max(0, game.shake - dt * 14);
  game.vign = Math.max(0, game.vign - dt * 1.6);
  game.coreHit = Math.max(0, game.coreHit - dt * 2.2);
}

/* ---------------- step ---------------- */
function step(dt) {
  game.time += dt;
  if (game.waveActive) {
    game.waveT += dt;
    while (game.spawnQueue.length && game.spawnQueue[0].t <= game.waveT) {
      const s = game.spawnQueue.shift();
      const e = new Enemy(s.type, game.wave);
      game.enemies.push(e);
      if (e.def.boss) game.shake = Math.max(game.shake, 6);
      burst(PORTAL.x, PORTAL.y, 'rgba(190,130,255,.9)', e.def.boss ? 24 : 6, { sp1: 140, glow: true, dir: 0 });
    }
  }
  for (const e of game.enemies) if (e.alive) e.update(dt);
  game.enemies = game.enemies.filter(e => e.alive);
  for (const t of game.towers) t.update(dt);
  updateProjectiles(dt);
  updateFx(dt);
  for (const f of game.flyies) {
    f.q += dt * R(0.2, 0.6);
    f.x += Math.cos(f.q) * f.sp * dt; f.y += Math.sin(f.q * 0.7) * f.sp * dt;
    if (f.x < -10) f.x = W + 10; if (f.x > W + 10) f.x = -10;
    if (f.y < -10) f.y = H + 10; if (f.y > H + 10) f.y = -10;
  }
  checkWaveEnd();
}

/* ---------------- render ---------------- */
function drawBeam(c, b) {
  const a = clamp(b.life / b.max, 0, 1);
  c.save(); c.globalCompositeOperation = 'lighter';
  c.strokeStyle = b.color + (a * 0.9) + ')';
  c.lineWidth = b.width * a + 0.6;
  c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath();
  for (let i = 0; i < b.pts.length - 1; i++) {
    const p0 = b.pts[i], p1 = b.pts[i + 1];
    const dx = p1.x - p0.x, dy = p1.y - p0.y;
    const d = hyp(dx, dy), n = b.jag ? Math.max(2, Math.floor(d / 12)) : 1;
    c.moveTo(p0.x, p0.y);
    for (let k = 1; k <= n; k++) {
      const tt = k / n;
      let ox = 0, oy = 0;
      if (b.jag && k < n) {
        const mag = (Math.random() - 0.5) * b.jag;
        ox = -dy / d * mag; oy = dx / d * mag;
      }
      c.lineTo(lerp(p0.x, p1.x, tt) + ox, lerp(p0.y, p1.y, tt) + oy);
    }
  }
  c.stroke();
  c.strokeStyle = 'rgba(255,255,255,' + (a * 0.5) + ')';
  c.lineWidth = 1;
  c.stroke();
  c.restore();
}
function render() {
  const t = game.time;
  const shx = game.shake > 0 ? R(-game.shake, game.shake) : 0;
  const shy = game.shake > 0 ? R(-game.shake, game.shake) : 0;
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.translate(shx, shy);
  ctx.drawImage(bgCanvas, 0, 0);
  // ground pulses
  for (const p of game.pulses) {
    if (p.front) continue;
    const f = 1 - p.life / p.max;
    ctx.strokeStyle = p.color + (0.7 * (1 - f)) + ')';
    ctx.lineWidth = 2.6 * (1 - f) + 0.6;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, lerp(p.r, p.maxR, f), lerp(p.r, p.maxR, f) * 0.62, 0, 0, TAU); ctx.stroke();
  }
  drawPortal(ctx, t);
  // range ring under everything
  if (game.sel) {
    const s = game.sel.stat;
    ctx.fillStyle = 'rgba(140,200,255,.07)';
    ctx.strokeStyle = 'rgba(140,200,255,.4)';
    ctx.lineWidth = 1.4; ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.arc(game.sel.x, game.sel.y, s.range, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.setLineDash([]);
  }
  drawCore(ctx, t);
  // ground enemies
  const gs = game.enemies.filter(e => !e.fly).sort((a, b) => a.y - b.y);
  const fs = game.enemies.filter(e => e.fly).sort((a, b) => a.y - b.y);
  for (const e of gs) drawEnemy(ctx, e, t);
  // shells
  for (const p of game.projectiles) {
    if (p.kind !== 'shell') continue;
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y + 6, 6 - p.h * 0.04, 3, 0, 0, TAU); ctx.fill();
  }
  for (const t2 of game.towers) drawTowerBody(ctx, t2.type, t2.lvl, t2.x, t2.y, t2.angle, t);
  // muzzle flashes
  for (const m of game.muzzle) {
    const a = m.life / m.max;
    drawGlow(ctx, 'rgba(255,220,120,.9)', m.x, m.y, 9, a * 0.8);
  }
  for (const p of game.projectiles) {
    if (p.kind === 'arrow') {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.ang);
      ctx.strokeStyle = 'rgba(255,220,140,.5)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-11, 0); ctx.lineTo(-2, 0); ctx.stroke();
      ctx.strokeStyle = '#e8e0c8'; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(5, 0); ctx.stroke();
      ctx.fillStyle = '#dfe6ee';
      ctx.beginPath(); ctx.moveTo(5, -2); ctx.lineTo(9, 0); ctx.lineTo(5, 2); ctx.closePath(); ctx.fill();
      ctx.restore();
    } else if (p.kind === 'shell') {
      ctx.save(); ctx.translate(p.x, p.y - p.h);
      drawGlow(ctx, 'rgba(255,170,80,.6)', 0, 0, 10, 0.5);
      ctx.fillStyle = '#2c333c';
      ctx.beginPath(); ctx.arc(0, 0, 4.6, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      ctx.beginPath(); ctx.arc(-1.4, -1.6, 1.5, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }
  for (const e of fs) drawEnemy(ctx, e, t);
  for (const b of game.beams) drawBeam(ctx, b);
  for (const p of game.pulses) {
    if (!p.front) continue;
    const f = 1 - p.life / p.max;
    ctx.strokeStyle = p.color + (0.8 * (1 - f)) + ')';
    ctx.lineWidth = 3 * (1 - f) + 0.5;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, lerp(p.r, p.maxR, f), lerp(p.r, p.maxR, f) * 0.62, 0, 0, TAU); ctx.stroke();
  }
  // particles
  for (const p of game.particles) {
    const a = clamp(p.life / (p.max || 0.6), 0, 1);
    if (p.glow) {
      drawGlow(ctx, p.color, p.x, p.y, p.size * 3.2, a * 0.55);
    }
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size * a, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  }
  // fireflies
  for (const f of game.flyies) {
    const a = 0.25 + Math.abs(Math.sin(t * 1.4 + f.p)) * 0.55;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = f.hue + (a * 0.7) + ')';
    ctx.beginPath(); ctx.arc(f.x, f.y, 1.4, 0, TAU); ctx.fill();
    ctx.fillStyle = f.hue + (a * 0.14) + ')';
    ctx.beginPath(); ctx.arc(f.x, f.y, 5, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
  // floating texts
  ctx.textAlign = 'center';
  for (const x of game.texts) {
    const a = clamp(x.life / x.max, 0, 1);
    ctx.font = '700 ' + x.size + 'px Consolas,"Segoe UI",sans-serif';
    ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 3;
    ctx.globalAlpha = a;
    ctx.strokeText(x.s, x.x, x.y);
    ctx.fillStyle = x.color;
    ctx.fillText(x.s, x.x, x.y);
    ctx.globalAlpha = 1;
  }
  // placement ghost
  if (game.build && game.hoverCell && game.state === 'play') {
    const { col, row } = game.hoverCell;
    const ok = cellFree(col, row) && game.gold >= TOWERS[game.build].cost;
    const x = col * CELL + 16, y = row * CELL + 16;
    const rng = TOWERS[game.build].tiers[0].range;
    ctx.fillStyle = ok ? 'rgba(140,240,140,.08)' : 'rgba(255,90,80,.10)';
    ctx.strokeStyle = ok ? 'rgba(150,255,150,.55)' : 'rgba(255,100,90,.6)';
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(x, y, rng, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = ok ? 'rgba(150,255,150,.16)' : 'rgba(255,100,90,.2)';
    ctx.fillRect(col * CELL, row * CELL, CELL, CELL);
    ctx.strokeStyle = ok ? 'rgba(180,255,180,.7)' : 'rgba(255,120,110,.8)';
    ctx.strokeRect(col * CELL + 1, row * CELL + 1, CELL - 2, CELL - 2);
    ctx.save();
    if (!ok) ctx.globalAlpha = 0.45;
    drawTowerBody(ctx, game.build, 1, x, y, -Math.PI / 2, game.time, !ok);
    ctx.restore();
  } else if (game.hoverCell && !game.build && game.state === 'play') {
    const ht = towerAt(game.hoverCell.col, game.hoverCell.row);
    if (ht) {
      ctx.strokeStyle = 'rgba(255,255,255,.25)';
      ctx.strokeRect(ht.col * CELL + 1, ht.row * CELL + 1, CELL - 2, CELL - 2);
    }
  }
  ctx.restore(); // shake
  // vignette
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, H * 0.95);
  vg.addColorStop(0, 'rgba(4,8,16,0)');
  vg.addColorStop(1, 'rgba(4,8,16,.5)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  if (game.vign > 0.01) {
    const rv = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.9);
    rv.addColorStop(0, 'rgba(255,40,30,0)');
    rv.addColorStop(1, 'rgba(255,40,30,' + (game.vign * 0.5) + ')');
    ctx.fillStyle = rv; ctx.fillRect(0, 0, W, H);
  }
  // boss-wave top warning strip
  if (game.waveActive && isBossWave(game.wave) && game.spawnQueue.length + game.enemies.length > 0) {
    ctx.fillStyle = 'rgba(200,50,40,' + (0.1 + Math.sin(game.time * 4) * 0.05) + ')';
    ctx.fillRect(0, 0, W, 4);
  }
  // banner
  if (game.banner) {
    const b = game.banner;
    const a = clamp(Math.min(b.t / 0.35, 1), 0, 1);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    const pop = 1 + Math.max(0, b.t - 2.4) * 0.6;
    ctx.translate(W / 2, b.clear ? H * 0.42 : H * 0.30);
    ctx.scale(pop, pop);
    ctx.font = '700 ' + (b.clear ? 40 : 52) + 'px Georgia,"Noto Serif SC",serif';
    ctx.shadowColor = b.clear ? 'rgba(140,230,110,.8)' : (b.boss ? 'rgba(255,90,60,.9)' : 'rgba(140,200,255,.7)');
    ctx.shadowBlur = 26;
    ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.lineWidth = 6;
    ctx.strokeText(b.title, 0, 0);
    ctx.fillStyle = b.clear ? '#c8f0a8' : (b.boss ? '#ffb0a0' : '#ffe9b8');
    ctx.fillText(b.title, 0, 0);
    ctx.font = '600 19px "Microsoft YaHei",sans-serif';
    ctx.shadowBlur = 12;
    ctx.strokeText(b.sub, 0, 34);
    ctx.fillStyle = b.boss ? '#ff8d84' : 'rgba(230,240,250,.92)';
    ctx.fillText(b.sub, 0, 34);
    ctx.restore();
  }
}

/* ---------------- main loop ---------------- */
let lastTs = performance.now();
function frame(ts) {
  let dt = (ts - lastTs) / 1000;
  lastTs = ts;
  dt = Math.min(dt, 0.05);
  if (game.state === 'play' && !game.paused) {
    step(Math.min(dt * game.speed, 0.06));
  } else {
    game.time += dt * 0.6;
    updateFx(dt);
    for (const f of game.flyies) {
      f.q += dt * 0.4;
      f.x += Math.cos(f.q) * 10 * dt; f.y += Math.sin(f.q * 0.7) * 10 * dt;
      if (f.x < -10) f.x = W + 10; if (f.x > W + 10) f.x = -10;
      if (f.y < -10) f.y = H + 10; if (f.y > H + 10) f.y = -10;
    }
  }
  render();
  requestAnimationFrame(frame);
}

/* ---------------- fit to window ---------------- */
function fitApp() {
  const s = Math.min(1, (window.innerWidth - 12) / 1284, (window.innerHeight - 12) / 890);
  document.getElementById('app').style.transform = s < 1 ? 'scale(' + s + ')' : '';
}
window.addEventListener('resize', fitApp);

/* ---------------- boot ---------------- */
bgCanvas = buildBackground();
buildShop();
renderNextPreview();
updateHud();
fitApp();
window.GAME = { game, startGame, placeTowerAt, startWave, setSpeed, SFX, towerAt, Enemy, ENEMY, TOWERS };

const PRESETS = [
  ['arrow', 12, 5], ['arrow', 24, 5], ['cannon', 31, 5],
  ['frost', 17, 7], ['arc', 11, 11], ['prism', 24, 11],
  ['arrow', 31, 13], ['cannon', 12, 13], ['frost', 35, 11], ['arc', 29, 12],
];
if (location.search.includes('demo')) {
  startGame();
  game.gold = 2900;
  for (const [ty, c, r] of PRESETS) placeTowerAt(ty, c, r);
  setSpeed(3);
  startWave();
}
const simM = location.search.match(/sim=(\d+)/);
if (simM) {
  startGame();
  game.gold = 2900;
  for (const [ty, c, r] of PRESETS) placeTowerAt(ty, c, r);
  const wm = location.search.match(/[&?]w=(\d+)/);
  game.wave = wm ? (+wm[1] - 1) : 0;
  startWave();
  const secs = +simM[1];
  for (let i = 0; i < secs * 60; i++) step(1 / 60);
  if (location.search.includes('sel')) {
    const t = game.towers.find(t2 => t2.type === 'arc') || game.towers[0];
    if (t) { t.lvl = Math.min(3, t.lvl + 1); game.sel = t; refreshSel(); }
  }
}
requestAnimationFrame(frame);
