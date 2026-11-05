/* 王座防线 · AIGIS 落子阻挡 × BTD6 容量 × KR 点位技能 —— MVP */
'use strict';
window.addEventListener('error', (e) => {
  const msg = (e && e.message) || '';
  if (e && e.target && e.target !== window && e.target.tagName) { document.title = 'LOADFAIL ' + e.target.tagName + ' ' + (e.target.src || e.target.href || ''); return; }
  if (msg === 'Script error.' || msg === 'Script error' || !msg) {
    window.__errN = (window.__errN || 0) + 1;
    setTimeout(() => { document.title = 'ASYNCERR op=' + (window.__lastop || 'none') + ' n' + (window.__errN || 0) + ' fin:' + (typeof window.__simFin !== 'undefined'); }, 0);
    return;
  }
  document.title = 'FATAL ' + msg + ' @' + ((e && e.filename) || '').split('/').pop() + ':' + (e && e.lineno) + ' stack:' + String((e && e.error && e.error.stack) || '').split('\n')[1];
}, true);
/* ============ 基础设施 ============ */
const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
const W = 1280, HT = 520, TILE = 42, COLS = 30, ROWS = 10;
const cvs = $('game'), ctx = cvs.getContext('2d');
const now = () => performance.now() / 1000;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const hyp = (a, b) => Math.sqrt(a * a + b * b);
let _rs = 1;
const RT = () => { _rs = (_rs * 1103515245 + 12345) & 0x7fffffff; return _rs / 0x7fffffff; };
const RR = (a, b) => a + RT() * (b - a);
const RI = (a, b) => Math.floor(RR(a, b + 1));
function pick(arr) { return arr[Math.floor(RT() * arr.length)]; }
/* seed 与 crystal-ward 同法，可复现 */
{ const s = parseInt(Q.get('seed') || '0', 10); if (s) { _rs = s; } }
const SIM_N = parseInt(Q.get('sim') || '0', 10);
const SIM_DIFF = Q.get('d') || 'normal';
const DUMB = Q.get('dumb') === '1';
const UI_TEST = Q.get('ui') === '1';

const store = {
  get(k, d) { try { const v = localStorage.getItem('throne.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  put(k, v) { try { localStorage.setItem('throne.' + k, JSON.stringify(v)); } catch (e) {} },
};

/* ============ 音效 ============ */
let AC = null, muted = store.get('mute', false);
function ac() { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } return AC; }
function beep(f, d, type, g) {
  if (muted || SIM_N > 0 || !ac()) return;
  const o = AC.createOscillator(), gn = AC.createGain();
  o.type = type || 'square'; o.frequency.value = f;
  gn.gain.setValueAtTime((g || 0.04), AC.currentTime);
  gn.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + d);
  o.connect(gn); gn.connect(AC.destination); o.start(); o.stop(AC.currentTime + d);
}
const SFX = {
  place: () => beep(320, 0.08, 'square'), up: () => beep(520, 0.1, 'triangle'),
  sell: () => beep(220, 0.1, 'sawtooth'), die: () => beep(150, 0.12, 'sawtooth', 0.03),
  hit: () => beep(600, 0.03, 'square', 0.02), ding: () => { beep(880, 0.12, 'triangle', 0.05); beep(1320, 0.16, 'triangle', 0.03); },
  leak: () => beep(120, 0.25, 'sawtooth', 0.06), spell: () => beep(440, 0.2, 'triangle', 0.05),
};

/* ============ 数据表 ============ */
const DIFFS = {
  normal: { name: '普通', hp: 1, gold: 1, lives: 15, cap: 10, cost: 1 },
  hard:   { name: '困难', hp: 1.35, gold: 0.95, lives: 10, cap: 9, cost: 1.1 },
  night:  { name: '噩梦', hp: 1.8, gold: 0.88, lives: 6, cap: 8, cost: 1.2 },
};
/* 单位：pop 人口；block 阻挡半径（格，0=不阻挡）；fort 只能放要塞基座；melee 近战反击 */
const UNITS = {
  sword: { name: '剑卫', cost: 45, pop: 1, hp: 210, dps: 24, range: 1.4, block: 0.75, speed: 0, color: '#7d8aa0', key: '1', desc: '阻挡 · 格挡减伤25%' },
  pike:  { name: '枪兵', cost: 55, pop: 1, hp: 105, dps: 26, range: 1.4, block: 0.75, speed: 0, color: '#8a7d5a', key: '2', desc: '阻挡 · 对冲锋 ×1.5' },
  arch:  { name: '弓手', cost: 70, pop: 1, hp: 45, dps: 28, range: 6.0, block: 0, fort: false, speed: 0, color: '#5a9b6a', key: '3', desc: '远程单体重装' },
  mage:  { name: '法师', cost: 130, pop: 2, hp: 40, dps: 26, range: 3.4, block: 0, splash: 1.1, magic: 1, color: '#7a6ab8', key: '4', desc: '群体溅射 · 魔法（怨魂克物理）' },
  holy:  { name: '牧师', cost: 100, pop: 1, hp: 40, dps: 0, heal: 16, range: 2.6, block: 0, color: '#c9b45a', key: '5', desc: '治疗残血友军' },
  cannon:{ name: '炮台', cost: 190, pop: 3, hp: 70, dps: 70, range: 5.5, block: 0, reload: 3.2, fort: true, magic: 1, color: '#5a6a7a', key: '6', desc: '要塞基座 · 重炮慢填' },
  xbow:  { name: '弩手', cost: 90, pop: 1, hp: 50, dps: 24, range: 6.5, block: 0, pierce: 3, color: '#4a8a5a', key: '7', desc: '穿透：一箭贯穿一排（最多3）', ch2: 1 },
  drum:  { name: '战鼓手', cost: 95, pop: 1, hp: 85, dps: 0, range: 2.4, block: 0, auraU: 0.15, color: '#c9a44a', key: '8', desc: '鼓声：2.4 格内友军伤害 +15%', ch2: 1 },
};
const UPG = { hp: [1, 1.55, 2.4], dps: [1, 1.6, 2.5], cost: [0, 0.75, 1.15] };
const MASTERY_NAMES = {
  sword: ['处刑铁壁', '荆棘守望'], pike: ['拒马枪阵', '穿云突刺'], arch: ['鹰眼连珠', '猎杀箭雨'],
  mage: ['陨石咏唱', '奥能洪流'], holy: ['生命泉涌', '圣裁灼烧'], cannon: ['湮灭重炮', '疾速弹幕'],
};
/* 敌人：charge 冲锋（枪兵克制）；fly 飞行不被阻挡；big 大体型阻挡时优先对其 */
const ENEMIES = {
  goblin: { name: '哥布林', hp: 30, spd: 1.9, dps: 10, gold: 6, r: 9, color: '#6aa84f', atk: 0.9 },
  wolf:   { name: '座狼', hp: 46, spd: 3.1, dps: 14, gold: 9, r: 10, color: '#8a8a9a', charge: 1, atk: 0.8 },
  orc:    { name: '兽人', hp: 110, spd: 1.35, dps: 20, gold: 12, r: 12, color: '#4f8a4f', atk: 1.1 },
  shaman: { name: '兽巫', hp: 70, spd: 1.5, dps: 10, gold: 14, r: 10, color: '#9a4f9a', ranged: 2.2, atk: 1.2 },
  bat:    { name: '骨蝠', hp: 40, spd: 2.6, dps: 10, gold: 10, r: 8, color: '#6a5a8a', fly: 1, atk: 0.9 },
  golem:  { name: '石魔', hp: 420, spd: 0.85, dps: 42, gold: 45, r: 16, color: '#7a7a8a', big: 1, atk: 1.5 },
  warlord: { name: '深渊督军', hp: 850, spd: 0.8, dps: 40, gold: 140, r: 19, color: '#7a4a8a', big: 1, boss: 1, atk: 1.5 },
  sapper: { name: '爆破兵', hp: 65, spd: 2.1, dps: 8, gold: 15, r: 9, color: '#c06a3a', atk: 1.2, boom: 95 },
  drumer: { name: '兽鼓手', hp: 95, spd: 1.4, dps: 6, gold: 16, r: 11, color: '#8a6a3a', atk: 1.4, aura: 0.25 },
  wraith: { name: '怨魂', hp: 160, spd: 1.75, dps: 15, gold: 18, r: 10, color: '#8ab8c8', atk: 1.0, physRes: 0.5 },
};
/* ============ 战役地图（2.0：3 章） ============ */
const MAPS = [
  { name: '北境原野', brief: '蛮族大军自东侧原野涌出，直取王城',
    thr: { c: 1.2, r: 4.5 },
    spawns: [{ side: 'e', x0: 29.2, r0: 1.2, r1: 8.6 }],
    forts: [[9, 2], [9, 7], [15, 2], [15, 7], [21, 3], [21, 6]],
    rocks: [] },
  { name: '断壁谷', brief: '南谷敌军会绕路奇袭，岩壁限制布阵',
    thr: { c: 1.6, r: 2.2 },
    spawns: [{ side: 'e', x0: 29.2, r0: 0.4, r1: 5.4 }, { side: 's', c0: 13, c1: 25 }],
    forts: [[8, 0], [8, 5], [15, 0], [15, 5], [22, 1], [22, 4]],
    rocks: [[10, 7], [11, 7], [12, 7], [13, 7], [14, 7]],
    sLine: 5 },
  { name: '深渊前线', brief: '督军大军自东西两路合围，王城居中',
    thr: { c: 15.2, r: 4.5 },
    spawns: [{ side: 'e', x0: 29.4, r0: 1.2, r1: 8.6 }, { side: 'w', x0: -0.6, r0: 1.2, r1: 8.6 }],
    forts: [[9, 2], [9, 7], [21, 2], [21, 7], [15, 0], [15, 9]],
    rocks: [[6, 4], [6, 5], [24, 4], [24, 5]],
    mixLine: 0.42, fromWave: 4 },
];

/* ============ 全局状态 ============ */
const game = {
  state: 'title', diff: 'normal', t: 0, speed: 1, paused: false,
  lives: 12, gold: 0, wave: 0, waveActive: false, spawnQueue: [], spawnT: 0,
  units: [], enemies: [], shots: [], texts: [], fx: [],
  pop: 0, popBonus: 0, unlocked: new Set(), sel: null, build: null,
  boons: 0, boonMode: null, stats: { kills: 0, leaks: 0, spent: 0 },
  keptMastery: {}, fundDmg: 0, fundPop: 0, combo: 0, comboBest: 0, bonusDmg: 0,
  waveMod: null, bloodMoon: false, lastBMwave: -3, masteryPending: null,
  spell: { meteor: 0, blizzard: 0, holy: 0 }, aimSpell: null,
  banner: null, over: false, endless: false, chapterLeaks: 0, shake: 0, redT: 0,
  map: MAPS[0], ch: 0, line: 0, daily: false,
};
const THR = () => game.map.thr;
const FORTL = () => game.map.forts;
function isRock(c, r) { return game.map.rocks.some(rc => rc[0] === c && rc[1] === r); }
function spawnPoint(line) {
  const sp = game.map.spawns[line || 0];
  if (sp.side === 's') return { x: gx(RR(sp.c0, sp.c1)), y: gy(ROWS + 0.35) };
  return { x: sp.x0 * TILE + TILE / 2, y: gy(RR(sp.r0, sp.r1)) };
}
const TOTAL_WAVES = 15;
function capTotal() { return (DIFFS[game.diff].cap || 10) + game.popBonus + game.fundPop + (game.endless ? Math.floor(Math.max(0, game.wave - TOTAL_WAVES) / 5) : 0); }
function usedPop() { let s = 0; for (const u of game.units) s += uPopCost(u); return s; }
function uPopCost(u) { return UNITS[u.type].pop + (u.level - 1) * 0.5 + (u.mastery ? 0.5 : 0); }

/* ============ 工具：文本/特效 ============ */
function addText(x, y, s, color, size, vy) { game.texts.push({ x, y, s, color: color || '#fff', size: size || 12, vy: vy || -30, t: 0, life: 1.1 }); }
function fxRing(x, y, color, r0, life, w) { game.fx.push({ x, y, color, r0, w: w || 3, t: 0, life }); }
function fxBurst(x, y, color, n, spd) {
  for (let i = 0; i < n; i++) { const a = RT() * 6.28, s = (0.4 + RT() * 0.6) * (spd || 120); game.fx.push({ p: 1, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, t: 0, life: 0.35 + RT() * 0.3, color, sz: 1.5 + RT() * 2.5 }); }
}
function fxCoin(x, y, n) {
  for (let i = 0; i < n; i++) game.fx.push({ p: 1, coin: 1, x, y, vx: RR(-55, 55), vy: -RR(70, 150), t: 0, life: 0.55 + RT() * 0.25, color: '#ffd873', sz: 2.2 });
}
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * k)), g2 = Math.min(255, Math.round(((n >> 8) & 255) * k)), b2 = Math.min(255, Math.round((n & 255) * k));
  return 'rgb(' + r + ',' + g2 + ',' + b2 + ')';
}
let toastMsg = null, toastT = 0;
function toast(s) { toastMsg = s; toastT = 2.6; }

/* ============ 2.0 存档：勋章 + 军械库 + 章节进度（localStorage） ============ */
const ARMORY = {
  g: { name: '皇家金库', desc: '起始金币 +150', base: 120, step: 140, max: 3 },
  p: { name: '开拓编制', desc: '人口上限 +1', base: 260, step: 280, max: 2 },
  c: { name: '军制改革', desc: '技能冷却 -15%', base: 200, step: 240, max: 2 },
  a: { name: '神匠工坊', desc: '全体单位伤害 +4%', base: 180, step: 220, max: 3 },
};
const SAVE = {
  raw: store.get('save', { medals: 0, arm: {}, chOk: [1, 0, 0], bestCh: {} }),
  get medals() { return this.raw.medals; },
  get arm() { return this.raw.arm; },
  flush() { store.put('save', this.raw); },
  armCost(k) { const a = ARMORY[k]; const n = this.raw.arm[k] || 0; return n >= a.max ? 0 : a.base + a.step * n; },
  buyArm(k) {
    const c = this.armCost(k);
    if (!c || this.medals < c) return false;
    this.raw.medals -= c; this.raw.arm[k] = (this.raw.arm[k] || 0) + 1; this.flush(); return true;
  },
  award(n) { this.raw.medals += n; this.flush(); },
};

/* ============ 坐标 ============ */
const gx = (c) => c * TILE + TILE / 2, gy = (r) => r * TILE + TILE / 2 + 82;
const cellOf = (x, y) => [Math.floor((x - 0) / TILE), Math.floor((y - 82) / TILE)];

/* ============ 波次（ch: 0 北境原野 / 1 断壁谷 / 2 深渊前线） ============ */
const CH_CURVE = [1.19, 1.20, 1.20];
function wavePlan(n, ch) {
  ch = ch || 0;
  const hpMul = Math.pow(CH_CURVE[ch], n - 1);
  const q = []; let at = 0;
  const add = (type, k, gap, line) => { for (let i = 0; i < k; i++) { q.push({ type, at, line: line || 0 }); at += gap; } };
  if (n === 1) add('goblin', 5, 1.1);
  else if (n === 2) add('goblin', 6, 0.9);
  else if (n === 3) { add('wolf', 3, 1.2); add('goblin', 5, 0.8); }
  else if (n === 4) { add('orc', 2, 1.6); add('goblin', 5, 0.7); }
  else if (n === 5) { add('bat', 3, 0.9); add('wolf', 4, 0.8); }
  else if (n === 6) { add('orc', 4, 1.3); add('shaman', 3, 1.4); add('goblin', 5, 0.6); }
  else if (n === 7) { add('wolf', 7, 0.6); add('bat', 4, 0.8); }
  else if (n === 8) { add('orc', 5, 1.2); add('shaman', 4, 1.2); add('goblin', 7, 0.5); }
  else if (n === 9) { add('golem', 1, 0); add('bat', 6, 0.7); add('wolf', 5, 0.6); }
  else if (n === 10) { add('orc', 6, 1); add('shaman', 5, 1); add('goblin', 8, 0.5); }
  else if (n === 11) { add('golem', 1, 0); add('orc', 6, 0.9); add('wolf', 6, 0.5); }
  else if (n === 12) { add('bat', 9, 0.55); add('shaman', 6, 0.9); add('orc', 5, 0.9); }
  else if (n === 13) { add('golem', 2, 3); add('wolf', 8, 0.5); add('goblin', 8, 0.5); }
  else if (n === 14) { add('orc', 9, 0.8); add('shaman', 7, 0.8); add('bat', 7, 0.6); add('golem', 1, 0); }
  else if (n === 15) { add('warlord', 1, 0); add('golem', 2, 2.6); add('orc', 6, 0.7); add('shaman', 4, 0.8); add('wolf', 6, 0.45); add('bat', 5, 0.5); }
  else { add('golem', 3, 2.6); add('orc', 7, 0.7); add('shaman', 5, 0.8); add('wolf', 7, 0.45); add('bat', 6, 0.5); }
  /* 章节增援 */
  if (ch >= 1) {
    if (n >= 3) add('sapper', Math.min(4, 1 + ((n - 3) / 2 | 0)), 0.9);
    if (n >= 6) add('drumer', n >= 10 ? 2 : 1, 2.4);
  }
  if (ch === 2) {
    if (n >= 4) add('wraith', Math.min(6, 2 + ((n - 4) / 2 | 0)), 0.8);
    if (n === 15) add('warlord', 1, 1.5);
  }
  for (const e of q) e.hpMul = hpMul;
  return q;
}
function rollMod(n) {
  if (n < 8) return null;
  if (n - game.lastBMwave <= 2) return null;
  if (RT() < 0.28) { game.lastBMwave = n; return 'bloodmoon'; }
  if (RT() < 0.6) return pick(['swift', 'iron', 'tough']);
  return null;
}
function nextWave() {
  if (game.waveActive || game.state !== 'play') return;
  if (game.wave >= TOTAL_WAVES && !game.endless) { winRun(); return; }
  game.wave++;
  const mod = rollMod(game.wave);
  game.waveMod = mod === 'bloodmoon' ? null : mod;
  game.bloodMoon = mod === 'bloodmoon';
  if (game.bloodMoon) { game.banner = { txt: '血 月 袭 击', sub: '全员狂化 · 清场缴获巨金', t: 0, life: 3, color: '#ff6a5a' }; }
  else if (game.waveMod) { game.banner = { txt: '词缀 · ' + ({ swift: '疾行', iron: '玄铁', tough: '坚韧' })[game.waveMod], t: 0, life: 2.4, color: '#9fdcff' }; }
  else if (game.wave === 1) game.banner = { txt: '王座防线', sub: '布好你的墙 · 第一波来了', t: 0, life: 2.8, color: '#ffd873' };
  let q = wavePlan(Math.min(game.wave, 15 + (game.endless ? game.wave - TOTAL_WAVES : 0)), game.ch);
  /* 多路出怪分配 */
  const mp = game.map;
  if (mp.spawns.length > 1) {
    const from = mp.fromWave || mp.sLine || 4;
    const mix = mp.mixLine || 0.3;
    if (game.wave >= from) for (const e of q) { if (RT() < mix) e.line = 1; }
  } else for (const e of q) e.line = 0;
  if (game.endless) { const m = 1 + (game.wave - TOTAL_WAVES) * 0.14; for (const e of q) e.hpMul *= m; }
  /* 精英：w6 起每 3 波 */
  if (game.wave >= 6 && game.wave % 2 === 0 && q.length) {
    const idx = RI(0, q.length - 1);
    q.push({ type: q[idx].type, at: q[idx].at + 1, elite: 1, hpMul: q[idx].hpMul });
    addText(W / 2, 240, '精英来袭！', '#c9a4ff', 18, -18);
  }
  game.spawnQueue = q.sort((a, b) => a.at - b.at);
  game.spawnT = 0; game.waveActive = true;
  syncHud();
}

/* ============ 敌人 ============ */
class Enemy {
  constructor(type, hpMul, elite, line) {
    const d = ENEMIES[type];
    this.type = type; this.def = d; this.elite = !!elite;
    const sp = spawnPoint(line || 0);
    const D = DIFFS[game.diff];
    this.maxHp = d.hp * hpMul * D.hp * (this.elite ? 2.6 : 1);
    this.hp = this.maxHp;
    this.spd = d.spd * (game.waveMod === 'swift' ? 1.3 : 1) * (this.elite ? 1.05 : 1);
    this.armor = (game.waveMod === 'iron' ? 6 : 0) + (this.elite ? 8 : 0);
    this.dmgMul = (game.bloodMoon ? 1.5 : 1) * (game.waveMod === 'tough' ? 1 : 1) * (this.elite ? 1.6 : 1);
    this.gold = Math.round(d.gold * (this.elite ? 6 : 1) * (1 + game.combo * 0.012));
    this.x = sp.x; this.y = sp.y;
    this.r = d.r * (this.elite ? 1.25 : 1);
    this.blocker = null; this.atkCd = 0; this.dead = false; this.slowT = 0;
    this.boomT = 0; this.boomDmg = (d.boom || 0) * hpMul * D.hp;
    this.hpFlash = 0;
  }
  speedNow() { return this.spd * (this.slowT > 0 ? 0.45 : 1) * TILE; }
  update(dt) {
    if (this.dead) return;
    this.slowT -= dt; this.atkCd -= dt; this.hpFlash -= dt;
    /* 阻挡判定：地面单位找最近的阻挡单位 */
    if (!this.blocker || this.blocker.dead) {
      this.blocker = null;
      if (!this.def.fly) {
        let best = null, bd = 1e9;
        for (const u of game.units) {
          const b = UNITS[u.type].block * (u.mastery === 2 ? 1.15 : 1);
          if (!b) continue;
          const dd = hyp(u.x - this.x, u.y - this.y);
          if (dd < (b + this.r / TILE) * TILE + 8 && dd < bd) { bd = dd; best = u; }
        }
        this.blocker = best;
      }
    }
    if (this.blocker && !this.blocker.dead) {
      /* 攻击阻挡单位 */
      if (this.atkCd <= 0) {
        this.atkCd = this.def.atk;
        let dmg = Math.max(3, this.dpsNow() - (this.def.ranged ? 0 : 0));
        if (UNITS[this.blocker.type].block) dmg *= 1;
        this.blocker.damage(dmg, this);
        if (this.def.ranged) fxLine(this.x, this.y, this.blocker.x, this.blocker.y, '#c07ad8');
      }
      /* 爆破兵：贴身 1 秒起爆，波及周围守军 */
      if (this.def.boom) { this.boomT += dt; if (this.boomT > 1.0) { boomExplode(this); return; } }
      /* 冲锋怪遇枪兵减速 */
      return;
    }
    /* 远程非阻挡：边走边射塔（射程内） */
    if (this.def.ranged) {
      let u = null, bd = this.def.ranged * TILE;
      for (const uu of game.units) { const dd = hyp(uu.x - this.x, uu.y - this.y); if (dd < bd) { bd = dd; u = uu; } }
      if (u && this.atkCd <= 0) { this.atkCd = this.def.atk; u.damage(this.dpsNow() * 0.7, this); fxLine(this.x, this.y, u.x, u.y, '#c07ad8'); return; }
    }
    /* 飞向王座；2.6 格内有阻挡单位则偏置接敌（AIGIS 式索敌） */
    let tx = gx(THR().c), ty = gy(THR().r);
    let nb = null, nd = 4.2 * TILE;
    for (const u of game.units) {
      if (this.def.fly) break;
      if (!UNITS[u.type].block) continue;
      const dd = hyp(u.x - this.x, u.y - this.y) + (u.__held || 0) * 26;
      if (dd < nd) { nd = dd; nb = u; }
    }
    if (nb) {
      tx = nb.x; ty = nb.y;
      /* 已贴脸：停下肉搏（阻挡环边缘外 4px） */
      const bR = (UNITS[nb.type].block + this.r / TILE) * TILE + 4;
      if (hyp(nb.x - this.x, nb.y - this.y) < bR) return;
    }
    const dx = tx - this.x, dy = ty - this.y, dd = hyp(dx, dy) || 1;
    const sp = this.speedNow() * dt;
    this.x += dx / dd * sp; this.y += dy / dd * sp;
    if (!nb && dd < TILE * 1.2) { this.dead = true; this.hp = 0; leak(this); }
  }
  dpsNow() { let m = 1; for (const a of game.enemies) { if (!a.dead && a !== this && a.def.aura && hyp(a.x - this.x, a.y - this.y) < 2.4 * TILE) m += a.def.aura; } return this.def.dps * (DIFFS[game.diff].hp * 0.4 + 0.6) * this.dmgMul * m; }
  damage(raw, magic) {
    if (this.def.physRes && !magic) raw *= (1 - this.def.physRes);
    const d = Math.max(raw * 0.15, raw - this.armor);
    this.hp -= d; this.hpFlash = 0.08;
    if (this.hp <= 0) die(this);
  }
}
function boomExplode(e) {
  e.dead = true; e.hp = 0;
  fxRing(e.x, e.y, 'rgba(255,150,60,', 1.9 * TILE, 0.42, 6);
  fxRing(e.x, e.y, 'rgba(255,230,150,', TILE, 0.28, 4);
  fxBurst(e.x, e.y, '#ff9a3a', 14, 200);
  for (const u of game.units) { if (!u.dead && hyp(u.x - e.x, u.y - e.y) < 1.9 * TILE) u.damage(e.boomDmg, null); }
  addText(e.x, e.y - 18, '轰！', '#ffb060', 15, -36);
  SFX.die();
}
function die(e) {
  if (e.dead) return;
  e.dead = true;
  const D = DIFFS[game.diff];
  const g = Math.round(e.gold * D.gold * 1.3);
  game.gold += g;
  game.stats.kills++;
  game.combo++; if (game.combo > game.comboBest) game.comboBest = game.combo;
  game.bonusDmg = Math.min(0.6, game.bonusDmg);
  addText(e.x, e.y - 14, '+' + g, '#ffd873', 11, -34);
  fxBurst(e.x, e.y, e.def.color, e.def.boss ? 26 : e.def.big ? 14 : 7, e.def.big ? 170 : 110);
  fxCoin(e.x, e.y, g >= 100 ? 12 : g >= 25 ? 6 : g >= 10 ? 4 : 2);
  if (e.def.boss) { game.shake = 0.9; addText(e.x, e.y - 40, '督 军 陨 落', '#ffd873', 22, -28); }
  SFX.die();
  if (e.elite) addText(e.x, e.y - 30, '精英击毙！', '#c9a4ff', 13, -26);
}
function leak(e) {
  game.lives--; game.stats.leaks++; game.chapterLeaks++;
  game.leaksBy = game.leaksBy || {};
  if (e) {
    game.leaksBy[e.type + (e.elite ? 'E' : '')] = (game.leaksBy[e.type + (e.elite ? 'E' : '')] || 0) + 1;
  }
  game.combo = 0;
  game.shake = Math.min(0.7, game.shake + 0.4); game.redT = 0.6;
  SFX.leak();
  addText(gx(THR().c), gy(THR().r) - 30, '-1 王座', '#ff6a5a', 15, -34);
  fxRing(gx(THR().c), gy(THR().r), 'rgba(255,90,70,', 60, 0.5, 4);
  if (game.lives <= 0) loseRun();
  game.enemies = game.enemies.filter(e => e.hp > 0 && !(e.dead));
  /* 触发漏怪的敌人已到达：标记 */
  const t = game.spawnQueue; void t;
}
function endWave() {
  game.waveActive = false;
  const D = DIFFS[game.diff];
  let bonus = Math.round(30 + game.wave * 5);
  if (game.bloodMoon) { bonus += 60 + game.wave * 6; game.bonusDmg += 0.02; game.banner = { txt: '血月缴获', sub: '+' + bonus + ' ◈ · 全体伤害永久 +2%', t: 0, life: 2.6, color: '#ff8a5e' }; }
  game.gold += Math.round(bonus * D.gold);
  game.boons++;
  if (game.wave % 3 === 0) game.popBonus++;
  if (game.wave === 5 || game.wave === 10) {
    game.popBonus++;
    game.banner = { txt: '援 军 到 访', sub: '编制扩大 · 人口上限 +1', t: 0, life: 2.6, color: '#8fd0ff' };
  }
  if (game.wave >= TOTAL_WAVES && !game.endless) { winRun(); return; }
  openBoons();
}

/* ============ 单位 ============ */
class Unit {
  constructor(type, c, r) {
    const d = UNITS[type];
    this.type = type; this.c = c; this.r = r;
    this.x = gx(c); this.y = gy(r);
    this.level = 1; this.mastery = 0; this.cd = 0; this.healCd = 0;
    const D = DIFFS[game.diff];
    this.maxHp = d.hp * (D.cost > 1 ? 0.9 : 1); this.hp = this.maxHp;
    this.invested = Math.round(d.cost * (D.cost || 1));
    this.reengage = 0; this.dead = false; this.kills = 0;
  }
  tier() { const d = UNITS[this.type]; const i = this.level - 1; return { hp: d.hp * UPG.hp[i], dps: d.dps * UPG.dps[i], up: i < 2 ? Math.round(d.cost * UPG.cost[i + 1]) : 0 }; }
  dps() { let v = this.tier().dps * (1 + game.bonusDmg + 0.05 * game.fundDmg + 0.04 * (SAVE.arm.a || 0)) * boonMul(this.type); for (const d2 of game.units) { if (!d2.dead && d2 !== this && UNITS[d2.type].auraU && hyp(d2.x - this.x, d2.y - this.y) < UNITS[d2.type].range * TILE) v *= 1 + UNITS[d2.type].auraU; } if (this.mastery === 1) v *= 1.35; if (this.mastery === 2) v *= 0.85; return v; }
  healPow() { return (UNITS[this.type].heal || 0) * UPG.hp[this.level - 1] * 1; }
  maxHpNow() { let v = UNITS[this.type].hp * UPG.hp[this.level - 1] * boonHp() * (DIFFS[game.diff].cost > 1 ? 0.9 : 1); if (this.mastery === 1) v *= 1.3; return v; }
  damage(raw, from) {
    let d = raw;
    if (this.type === 'sword') d *= 0.75;
    if (from && from.def.charge && this.type === 'pike') d *= 1.25;
    this.hp -= d; this.reengage = 0;
    SFX.hit();
    if (this.hp <= 0) this.die();
  }
  die() {
    this.dead = true;
    game.units = game.units.filter(u => u !== this);
    if (this.mastery) game.keptMastery[this.type] = this.mastery;
    addText(this.x, this.y - 20, UNITS[this.type].name + ' 阵亡', '#ff8a7a', 11, -26);
    fxRing(this.x, this.y, 'rgba(200,80,60,', 34, 0.4, 3);
    SFX.sell();
    if (this === game.sel) { game.sel = null; hideSel(); }
    syncHud();
  }
  update(dt) {
    const d = UNITS[this.type];
    this.cd -= dt; this.healCd -= dt;
    if (this.atkT > 0) this.atkT = Math.max(0, this.atkT - dt);
    if (this.lunge) { this.lunge.t += dt; if (this.lunge.t > 0.2) this.lunge = null; }
    /* 脱战回血 */
    this.reengage += dt;
    if (this.hp < this.maxHpNow() && this.reengage > 2) this.hp = Math.min(this.maxHpNow(), this.hp + this.maxHpNow() * 0.15 * dt);
    if (this.type === 'holy') {
      if (this.healCd <= 0) {
        let t = null, minr = 1;
        for (const u of game.units) { if (u === this || u.hp >= u.maxHpNow()) continue; const ratio = u.hp / u.maxHpNow(); const dd = hyp(u.x - this.x, u.y - this.y); if (ratio < minr && dd < d.range * TILE) { minr = ratio; t = u; } }
        if (t) { this.healCd = 1.6; const h = this.healPow() * (this.mastery === 2 ? 1.4 : 1); t.hp = Math.min(t.maxHpNow(), t.hp + h); fxLine(this.x, this.y, t.x, t.y, '#ffd873'); addText(t.x, t.y - 20, '+' + Math.round(h), '#8fdc7a', 10, -30); }
      }
      return;
    }
    if (this.cd > 0) return;
    /* 找目标 */
    let range = d.range * TILE * (this.mastery === 2 ? 1.15 : 1);
    let best = null, bd = range;
    for (const e of game.enemies) {
      if (e.dead || e.hp <= 0) continue;
      if (e.def.fly && this.type !== 'arch' && this.type !== 'cannon' && this.type !== 'mage') continue;
      const dd = hyp(e.x - this.x, e.y - this.y) - (e.def.fly ? 90 : 0);
      if (dd < bd) { bd = dd; best = e; }
    }
    if (!best) return;
    const spd = this.mastery === 1 ? 1 : this.mastery === 2 ? 1.4 : 1;
    this.cd = (d.reload || 1.0) / spd / (d.atkRate || 1);
    this.atkT = 0.14;
    let dmg = this.dps() * (d.reload || 1) / 1;
    if (this.type === 'pike') { for (const e of [best]) if (e.def.charge) dmg *= 1.5; }
    if (this.mastery === 1) dmg /= 1; /* 已在 dps() 乘过 */
    /* —— 出手动作 —— */
    const ddx = best.x - this.x, ddy = best.y - this.y, dist = Math.max(1, hyp(ddx, ddy));
    const ux = ddx / dist, uy = ddy / dist;
    if (d.block) {
      this.lunge = { dx: ux, dy: uy, t: 0 };
      game.fx.push({ slash: 1, x: best.x, y: best.y, ang: Math.atan2(ddy, ddx), t: 0, life: 0.18 });
    } else if (this.type === 'cannon') {
      this.lunge = { dx: -ux, dy: -uy, t: 0 };
      fxRing(this.x + ux * 13, this.y - 8 + uy * 13, 'rgba(255,220,120,', 22, 0.5, 3);
      game.fx.push({ puff: 1, x: this.x + ux * 15, y: this.y - 10, t: 0, life: 0.5, vx: ux * 30, vy: -20 });
    } else if (this.type === 'mage') {
      fxRing(this.x + 9.5, this.y - 17.5, 'rgba(205,175,255,', 15, 0.55, 2);
    } else if (this.type !== 'drum') {
      fxLine(this.x + ux * 10, this.y - 5 + uy * 10, this.x + ux * 20, this.y - 5 + uy * 20, 'rgba(255,255,240,0.65)');
    }
    if (!d.block) {
      const fly = this.type === 'cannon' ? 470 : this.type === 'mage' ? 620 : this.type === 'xbow' ? 1000 : 880;
      game.shots.push({ x: this.x + ux * 8, y: this.y - 6 + uy * 6, tx: best.x, ty: best.y, t: 0, life: Math.max(0.08, dist / fly), arc: this.type === 'cannon' ? Math.min(44, dist * 0.2) : 0, kind: this.type, color: this.type === 'mage' ? '#b08aff' : this.type === 'cannon' ? '#ffb060' : '#ffe8a0', big: this.type === 'cannon' });
    }
    SFX.hit();
    hitUnit(this, best, dmg);
    if (d.pierce) {
      const dirx = (best.x - this.x), diry = (best.y - this.y);
      const L = hyp(dirx, diry) || 1; const px = -diry / L, py = dirx / L;
      let extra = d.pierce - 1;
      const cand = [];
      for (const e of game.enemies) {
        if (e === best || e.dead || e.hp <= 0) continue;
        const rx = e.x - this.x, ry = e.y - this.y;
        const along = (rx * dirx + ry * diry) / L;
        if (along < 8 || along > d.range * TILE * 1.15) continue;
        if (Math.abs(rx * px + ry * py) > 15) continue;
        cand.push({ e, along });
      }
      cand.sort((a, b2) => a.along - b2.along);
      for (let i2 = 0; i2 < Math.min(extra, cand.length); i2++) {
        hitUnit(this, cand[i2].e, dmg * 0.65);
        const e2 = cand[i2].e;
        const d2 = Math.max(1, hyp(e2.x - this.x, e2.y - this.y));
        game.shots.push({ x: this.x, y: this.y - 5, tx: e2.x, ty: e2.y, t: 0, life: Math.max(0.07, d2 / 1000), kind: 'xbow', thin: 1, color: '#cfe8a0' });
      }
    }
    if (d.splash) {
      const sr = d.splash * TILE * (this.mastery === 1 ? 1.3 : 1);
      for (const e of game.enemies) { if (e !== best && !e.dead && e.hp > 0 && hyp(e.x - best.x, e.y - best.y) < sr) hitUnit(this, e, dmg * 0.55); }
      fxRing(best.x, best.y, 'rgba(170,130,255,', sr, 0.25, 2);
    }
  }
}
function hitUnit(u, e, dmg) {
  const before = e.hp;
  e.damage(dmg, !!UNITS[u.type].magic);
  if (e.hp <= 0 && before > 0) u.kills++;
}
function boonMul(type) {
  const b = game.boonPicks || {};
  let m = 1;
  if (b.dmg) m *= 1 + 0.08 * b.dmg;
  if (b.sp) m *= 1 + 0.10 * b.sp;
  if ((type === 'arch' || type === 'mage' || type === 'cannon') && b.air) m *= 1 + 0.15 * b.air;
  return m;
}
function boonHp() { return 1 + 0.12 * ((game.boonPicks && game.boonPicks.arm) || 0); }

/* ============ 技能 ============ */
const SPELLS = {
  meteor: { name: '流星', cd: 26, cost: 0, key: 'q' },
  blizzard: { name: '暴雪', cd: 34, cost: 0, key: 'w' },
  holy: { name: '圣光', cd: 40, cost: 0, key: 'e' },
};
function spellReady(k) { return game.state === 'play' && game.spell[k] <= 0; }
function castSpell(k, x, y) {
  if (!spellReady(k)) return false;
  game.spell[k] = SPELLS[k].cd * spellCdMul();
  SFX.spell();
  if (k === 'meteor') {
    const R = 2.4 * TILE;
    for (const e of game.enemies) { if (e.dead) continue; const dd = hyp(e.x - x, e.y - y); if (dd < R) e.damage((420 + game.wave * 55) * (1 - dd / R / 1.6) * (1 + game.bonusDmg), true); }
    fxRing(x, y, 'rgba(255,140,60,', R, 0.5, 5); fxRing(x, y, 'rgba(255,220,120,', R * 0.5, 0.35, 8);
  } else if (k === 'blizzard') {
    for (const e of game.enemies) if (!e.dead && !e.def.boss) e.slowT = 4;
    fxRing(gx(15), gy(7), 'rgba(120,200,255,', 900, 0.6, 3);
  } else if (k === 'holy') {
    for (const u of game.units) { u.hp = Math.min(u.maxHpNow(), u.hp + u.maxHpNow() * 0.5); }
    fxRing(gx(THR().c), gy(THR().r), 'rgba(255,230,130,', 800, 0.6, 4);
  }
  game.aimSpell = null;
  return true;
}
function fxLine(x1, y1, x2, y2, color) { game.fx.push({ line: true, x1, y1, x2, y2, color, t: 0, life: 0.12 }); }
function shotImpact(s) {
  const x = s.tx, y = s.ty;
  if (s.kind === 'cannon') { fxRing(x, y, 'rgba(255,150,60,', 30, 0.6, 3); fxBurst(x, y, '#ffb060', 6, 110); game.fx.push({ puff: 1, x, y: y - 4, t: 0, life: 0.55, vx: 0, vy: -16 }); }
  else if (s.kind === 'mage') { fxRing(x, y, 'rgba(190,150,255,', 18, 0.5, 2); fxBurst(x, y, '#b08aff', 4, 60); }
  else if (s.kind === 'xbow') { fxBurst(x, y, '#cfe8a0', 3, 90); }
  else { fxBurst(x, y, '#ffe8a0', 3, 70); }
}

/* ============ 祝福（简化版波后奖励） ============ */
const BOONS = [
  { id: 'dmg', name: '军师', desc: '全体伤害 +8%' },
  { id: 'gold', name: '税制', desc: '立即 +90◈，击杀赏金 +6%' },
  { id: 'life', name: '民兵', desc: '王座生命 +1' },
  { id: 'air', name: '对空', desc: '远程系伤害 +15%' },
  { id: 'pop', name: '征募', desc: '人口上限 +1' },
  { id: 'cd', name: '参谋', desc: '技能冷却 -12%' },
  { id: 'arm', name: '城防工兵', desc: '全体单位生命上限 +12%' },
  { id: 'sp', name: '皇家军械', desc: '全体单位伤害 +10%' },
];
game.boonPicks = {};
function openBoons() {
  if (SIM_N > 0) { applyBoon(pick(BOONS).id); if (game.wave >= 3 && game.lives > 90) {} return; }
  game.boonMode = [];
  const pool = BOONS.slice().sort(() => RT() - 0.5).slice(0, 3);
  game.boonMode = pool;
  const box = $('boonCards'); box.innerHTML = '';
  for (const b of pool) {
    const d = document.createElement('div');
    d.className = 'boonCard'; d.innerHTML = '<b>' + b.name + '</b><div>' + b.desc + '</div>';
    d.addEventListener('click', () => { applyBoon(b.id); hideOv('ovBoon'); game.boonMode = null; syncHud(); $('btnWave').textContent = '下一波 ▶'; });
    box.appendChild(d);
  }
  showOv('ovBoon');
  $('btnWave').textContent = '选择祝福…';
}
function applyBoon(id) {
  game.boonPicks[id] = (game.boonPicks[id] || 0) + 1;
  if (id === 'gold') { game.gold += 90; if (!game.goldK) game.goldK = 0; game.goldK += 0.06; }
  if (id === 'life') game.lives++;
  if (id === 'pop') game.popBonus++;
  if (id === 'arm' || id === 'sp') for (const u of game.units) u.hp = Math.min(u.maxHpNow(), u.hp + u.maxHpNow() * 0.12);
  SFX.ding();
}

/* ============ 军费 ============ */
const FUNDS = {
  dmg: { name: '军械强化', desc: '全体伤害 +5%', base: 700, step: 220, get n() { return game.fundDmg; } },
  pop: { name: '开拓编制', desc: '人口上限 +1', base: 1500, step: 900, get n() { return game.fundPop; } },
};
function fundCost(k) { return Math.round(FUNDS[k].base + FUNDS[k].step * FUNDS[k].n); }
function fundTry(k, slack) {
  const c = fundCost(k);
  if (game.gold < c + (slack || 0) || game.wave < 8) return false;
  game.gold -= c;
  if (k === 'dmg') game.fundDmg++; else game.fundPop++;
  SFX.ding(); addText(W / 2, 130, FUNDS[k].name + ' · ' + FUNDS[k].desc, '#ffd873', 14, -28);
  return true;
}

/* ============ 放置/升级/出售 ============ */
function unitAt(c, r) { return game.units.find(u => u.c === c && u.r === r); }
function isFort(c, r) { return FORTL().some(f => f[0] === c && f[1] === r); }
function canPlace(c, r, type) {
  if (c < 4 || c >= COLS || r < 0 || r >= ROWS) return false;
  if (isRock(c, r)) return false;
  if (unitAt(c, r)) return false;
  if (UNITS[type].fort && !isFort(c, r)) return false;
  if (isFort(c, r) && UNITS[type].block) return false;
  const dc = Math.abs(c - THR().c), dr = Math.abs(r - THR().r);
  if (dc < 2 && dr < 1.8) return false;
  return true;
}
function placeTower(c, r, type) {
  const d = UNITS[type];
  if (!game.unlocked.has(type)) return false;
  const D = DIFFS[game.diff];
  const cost = Math.round(d.cost * (D.cost || 1));
  if (usedPop() + d.pop > capTotal()) { toast('人口不足（' + usedPop().toFixed(1) + '/' + capTotal() + '）· 升级单位也吃人口'); return false; }
  if (game.gold < cost) { toast('金币不足'); return false; }
  if (!canPlace(c, r, type)) return false;
  game.gold -= cost;
  game.stats.spent += cost;
  const u = new Unit(type, c, r);
  game.units.push(u);
  SFX.place(); fxRing(u.x, u.y, 'rgba(160,220,255,', 40, 0.3, 3);
  syncHud(); refreshCards();
  return true;
}
function upgradeUnit(u) {
  if (!u || u.level >= 3) return false;
  const cost = u.tier().up;
  if (game.gold < cost) return false;
  const popNew = UNITS[u.type].pop + u.level * 0.5 + (u.mastery ? 0.5 : 0);
  if (usedPop() - uPopCost(u) + popNew > capTotal()) { toast('人口不足：升级 +' + 0.5 + ' 人口 · 先遣散或开拓编制'); return false; }
  game.gold -= cost; game.stats.spent += cost; u.invested += cost;
  u.level++;
  u.hp = u.maxHpNow();
  if (u.level === 3 && !u.mastery) {
    if (SIM_N > 0) { u.mastery = DUMB ? 0 : (game.keptMastery[u.type] || ((game.units.indexOf(u) % 2) ? 1 : 2)); }
    else { game.masteryPending = u; game.paused = true; openMasteryUI(u); }
  }
  SFX.up(); fxRing(u.x, u.y, 'rgba(255,230,140,', 46, 0.4, 3);
  syncHud(); refreshSel();
  return true;
}
function sellUnit(u) {
  if (!u) return;
  if (game.waveActive && !SIM_N) {
    const refund = Math.round(u.invested * 0.5);
    game.gold += refund;
    addText(u.x, u.y - 16, '遣散 +' + refund + '（战斗中仅 5 成）', '#ffb073', 11, -30);
  } else {
    const refund = Math.round(u.invested * 0.85);
    game.gold += refund;
    addText(u.x, u.y - 16, '+' + refund, '#ffd873', 11, -30);
  }
  if (u.mastery) game.keptMastery[u.type] = u.mastery;
  u.dead = true;
  game.units = game.units.filter(x => x !== u);
  game.sel = null; hideSel();
  SFX.sell(); syncHud(); refreshCards();
}

/* ============ 觉醒 ============ */
function openMasteryUI(u) {
  game.masteryPending = u;
  const names = MASTERY_NAMES[u.type] || ['毁灭', '疾风'];
  $('mstTitle').textContent = UNITS[u.type].name + ' 满级觉醒 · 专精永久';
  const cards = document.querySelectorAll('.mstCard');
  cards[0].innerHTML = '<div class="mstName">' + names[0] + '</div><div class="mstFx">毁灭 · 伤害 +35% · HP +30%</div><div class="mstKey">按 1</div>';
  cards[1].innerHTML = '<div class="mstName">' + names[1] + '</div><div class="mstFx">疾风 · 攻速 +40% · 射程 +15%</div><div class="mstKey">按 2</div>';
  const kp = game.keptMastery[u.type];
  const inh = $('mstInh');
  for (const cd of cards) cd.classList.remove('mstKept');
  if (kp) { cards[kp - 1].classList.add('mstKept'); inh.textContent = '3 · 继承已铭刻专精「' + names[kp - 1] + '」'; inh.classList.remove('hidden'); }
  else inh.classList.add('hidden');
  showOv('ovMastery');
}
function pickMastery(m) {
  const u = game.masteryPending;
  if (!u) return;
  u.mastery = m;
  game.masteryPending = null;
  if (game.paused) togglePause(true);
  hideOv('ovMastery');
  addText(u.x, u.y - 26, '觉醒：' + (MASTERY_NAMES[u.type] || ['', ''])[m - 1], '#c9a4ff', 13, -24);
  fxRing(u.x, u.y, 'rgba(201,164,255,', 70, 0.7, 4);
  SFX.ding(); syncHud(); refreshSel();
}

/* ============ 结束 ============ */
function medalGain(win) {
  const base = game.wave * 3 + (win ? 80 : 0) + game.stats.kills * 0.4;
  const mul = (game.diff === 'hard' ? 1.5 : game.diff === 'night' ? 2.2 : 1) * (1 + game.ch * 0.5) * (game.daily ? 2 : 1);
  return Math.max(2, Math.round(base * mul));
}
function winRun() {
  game.state = 'win'; game.over = true;
  if (game.ch < 2) SAVE.raw.chOk[game.ch + 1] = 1;
  const gain = medalGain(true); SAVE.award(gain);
  store.put('best.' + game.diff, Math.max(store.get('best.' + game.diff, 0), game.wave));
  showEnd(true, gain);
}
function loseRun() {
  if (game.state !== 'play') return;
  game.state = 'over'; game.over = true; game.lives = 0;
  const gain = medalGain(false); SAVE.award(gain);
  store.put('best.' + game.diff, Math.max(store.get('best.' + game.diff, 0), game.wave - 1));
  showEnd(false, gain);
}
function showEnd(win, gain) {
  $('endTitle').textContent = win ? '王座守住了' : '王座陷落';
  $('endTitle').style.color = win ? '#9fd08a' : '#d0796a';
  $('endSub').textContent = '第 ' + game.wave + ' 波 · 击杀 ' + game.stats.kills + ' · 漏怪 ' + game.stats.leaks + ' · 最佳连杀 ' + game.comboBest + ' · 🏅 勋章 +' + gain;
  const nb = $('btnNextCh');
  if (nb) { nb.style.display = win && game.ch < 2 ? '' : 'none'; nb.textContent = '进入下一章 · ' + MAPS[game.ch + 1].name + ' ▶'; }
  showOv('ovEnd');
}

/* ============ 主循环 ============ */
function step(dt) {
  game.t += dt;
  for (const k of Object.keys(game.spell)) {
    const cdMul = spellCdMul();
    game.spell[k] = Math.max(0, game.spell[k] - dt * cdMul);
  }
  if (game.banner) { game.banner.t += dt; if (game.banner.t > game.banner.life) game.banner = null; }
  /* 出怪 */
  if (game.waveActive) {
    for (const u of game.units) u.__held = 0;
    for (const e of game.enemies) if (e.blocker && !e.blocker.dead) e.blocker.__held = (e.blocker.__held || 0) + 1;
    game.spawnT += dt;
    while (game.spawnQueue.length && game.spawnQueue[0].at <= game.spawnT) {
      const q = game.spawnQueue.shift();
      if (ENEMIES[q.type].boss) { game.banner = { txt: '深渊督军降临', sub: '重创王座的元凶，就在阵中', t: 0, life: 3, color: '#c9a4ff' }; game.shake = 0.8; SFX.ding(); }
      game.enemies.push(new Enemy(q.type, q.hpMul, q.elite, q.line));
    }
  }
  for (const u of game.units) u.update(dt);
  for (const e of game.enemies) e.update(dt);
  game.enemies = game.enemies.filter(e => !e.dead && e.hp > 0);
  /* 波次结束 */
  if (game.waveActive && !game.spawnQueue.length && !game.enemies.length) endWave();
  /* 特效 */
  for (const s of game.shots) {
    s.t += dt;
    const p = Math.min(1, s.t / s.life);
    s.px = s.x + (s.tx - s.x) * p;
    s.py = s.y + (s.ty - s.y) * p - (s.arc ? Math.sin(p * Math.PI) * s.arc : 0);
    if (p >= 1 && !s.boomed) { s.boomed = 1; shotImpact(s); }
  }
  game.shots = game.shots.filter(s => s.t < s.life);
  for (const f of game.fx) { f.t += dt; if (f.p) { f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 520 * dt; } }
  game.fx = game.fx.filter(f => f.t < f.life);
  if (game.shake > 0) game.shake = Math.max(0, game.shake - dt * 1.6);
  if (game.redT > 0) game.redT = Math.max(0, game.redT - dt * 1.4);
  for (const tx of game.texts) { tx.t += dt; tx.y += tx.vy * dt; }
  game.texts = game.texts.filter(tx => tx.t < tx.life);
  if (toastT > 0) toastT -= dt;
  for (const k of Object.keys(game.spell)) if (game.spell[k] <= 0.001) game.spell[k] = 0;
  const sp = 1 - Math.min(0.5, (game.boonPicks.cd || 0) * 0.12);
  for (const k of Object.keys(game.spell)) game.spell[k] = Math.max(0, game.spell[k] - 0);
  void sp;
}

/* ============ 渲染 ============ */
const bg = document.createElement('canvas');
function renderBg() {
  bg.width = W; bg.height = HT;
  const b = bg.getContext('2d');
  /* 大地：上深下暖的纵向渐变（唯一光源：左上月光） */
  const g = b.createLinearGradient(0, 70, 0, HT);
  g.addColorStop(0, '#232d26'); g.addColorStop(0.55, '#2b3527'); g.addColorStop(1, '#333a28');
  b.fillStyle = g; b.fillRect(0, 0, W, HT);
  /* 左上月光大范围柔光 */
  const mg = b.createRadialGradient(150, 60, 40, 150, 60, 760);
  mg.addColorStop(0, 'rgba(150,180,220,0.13)'); mg.addColorStop(1, 'rgba(150,180,220,0)');
  b.fillStyle = mg; b.fillRect(0, 0, W, HT);
  /* 草丛/碎石：成组笔触带受光面，不再是白噪点 */
  for (let i = 0; i < 95; i++) {
    const x = (i * 271.7 + 90) % (W - 60) + 30, y = (i * 439.3) % (HT - 150) + 106;
    if (i % 4 === 0) {
      b.fillStyle = 'rgba(150,160,170,0.10)'; b.beginPath(); b.ellipse(x, y, 2.6, 1.8, 0, 0, 7); b.fill();
      b.fillStyle = 'rgba(220,230,240,0.07)'; b.beginPath(); b.ellipse(x - 0.8, y - 0.7, 1.4, 0.8, 0, 0, 7); b.fill();
      continue;
    }
    b.strokeStyle = 'rgba(160,190,140,0.14)'; b.lineWidth = 1;
    b.beginPath();
    b.moveTo(x - 3, y + 3); b.quadraticCurveTo(x - 3.5, y - 2, x - 2, y - 4.5);
    b.moveTo(x, y + 3); b.quadraticCurveTo(x + 0.5, y - 3, x + 2, y - 5.5);
    b.moveTo(x + 3, y + 3); b.quadraticCurveTo(x + 4, y - 1, x + 5, y - 3.5);
    b.stroke();
  }
  /* 王座前石板广场 */
  b.fillStyle = 'rgba(90,105,125,0.10)';
  b.beginPath(); b.ellipse(gx(THR().c), gy(THR().r) + 10, 150, 120, 0, 0, 7); b.fill();
  for (let i = 0; i < 3; i++) { b.strokeStyle = 'rgba(120,140,165,0.08)'; b.beginPath(); b.ellipse(gx(THR().c), gy(THR().r) + 10, 70 + i * 42, 54 + i * 34, 0, 0, 7); b.stroke(); }
  /* 可建区网格 */
  for (let r = 0; r < ROWS; r++) for (let c = 4; c < COLS; c++) {
    if (isRock(c, r)) continue;
    b.strokeStyle = 'rgba(170,210,170,0.055)';
    b.strokeRect(c * TILE + 2, gy(r) - TILE / 2 + 2, TILE - 4, TILE - 4);
  }
  /* 岩壁：不可布阵巨石（左上受光） */
  for (const [c, r] of game.map.rocks) {
    const rx = gx(c), ry = gy(r);
    b.fillStyle = 'rgba(0,0,0,0.30)'; b.beginPath(); b.ellipse(rx + 5, ry + 14, 20, 7, 0, 0, 7); b.fill();
    const rg = b.createLinearGradient(rx - 18, ry - 18, rx + 18, ry + 16);
    rg.addColorStop(0, '#5a626e'); rg.addColorStop(0.5, '#454c58'); rg.addColorStop(1, '#2c313c');
    b.fillStyle = rg;
    b.beginPath(); b.moveTo(rx - 19, ry + 12); b.lineTo(rx - 14, ry - 10); b.lineTo(rx - 3, ry - 17); b.lineTo(rx + 12, ry - 12); b.lineTo(rx + 19, ry + 4); b.lineTo(rx + 13, ry + 14); b.closePath(); b.fill();
    b.fillStyle = 'rgba(220,235,255,0.10)'; b.beginPath(); b.ellipse(rx - 6, ry - 8, 7, 3.6, -0.5, 0, 7); b.fill();
    b.strokeStyle = 'rgba(20,24,30,0.5)'; b.lineWidth = 1;
    b.beginPath(); b.moveTo(rx - 8, ry - 6); b.lineTo(rx - 2, ry + 6); b.lineTo(rx + 6, ry + 2); b.stroke();
  }
  /* 敌区：按出怪方向铺焦土带 */
  for (const sp of game.map.spawns) {
    if (sp.side === 'e') {
      const wg = b.createLinearGradient(24 * TILE, 0, W, 0);
      wg.addColorStop(0, 'rgba(120,50,40,0)'); wg.addColorStop(1, 'rgba(130,50,38,0.20)');
      b.fillStyle = wg; b.fillRect(24 * TILE, 82, W - 24 * TILE, HT - 82);
    } else if (sp.side === 'w') {
      const wg = b.createLinearGradient(4 * TILE, 0, 0, 0);
      wg.addColorStop(0, 'rgba(120,50,40,0)'); wg.addColorStop(1, 'rgba(130,50,38,0.20)');
      b.fillStyle = wg; b.fillRect(0, 82, 4 * TILE, HT - 82);
    } else if (sp.side === 's') {
      const wg = b.createLinearGradient(0, HT - 3 * TILE, 0, HT);
      wg.addColorStop(0, 'rgba(120,50,40,0)'); wg.addColorStop(1, 'rgba(130,50,38,0.20)');
      b.fillStyle = wg; b.fillRect(10 * TILE, HT - 3 * TILE, 18 * TILE, 3 * TILE);
    }
  }
  b.strokeStyle = 'rgba(70,30,24,0.25)'; b.lineWidth = 1;
  for (let i = 0; i < 7; i++) {
    const x0 = 27 * TILE + (i * 53) % 120, y0 = 100 + (i * 127) % (HT - 160);
    b.beginPath(); b.moveTo(x0, y0);
    b.lineTo(x0 + 18 - (i % 3) * 14, y0 + 26); b.lineTo(x0 + 8, y0 + 58); b.stroke();
  }
  /* 四角暗角 */
  const vg = b.createRadialGradient(W / 2, HT / 2, HT * 0.55, W / 2, HT / 2, W * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(4,8,12,0.42)');
  b.fillStyle = vg; b.fillRect(0, 0, W, HT);
}
function draw() {
  ctx.clearRect(0, 0, cvs.width, cvs.height);
  ctx.save();
  if (game.shake > 0) ctx.translate((RT() - 0.5) * game.shake * 15, (RT() - 0.5) * game.shake * 11);
  ctx.drawImage(bg, 0, 0);
  /* 王座城堡：石砌三层 + 角楼尖顶 + 旗 + 灯窗（呼吸辉光保留） */
  const tx = gx(THR().c), ty = gy(THR().r);
  ctx.save();
  const t2 = game.t;
  const tg = ctx.createRadialGradient(tx, ty, 10, tx, ty, 86 + Math.sin(t2 * 2) * 5);
  tg.addColorStop(0, 'rgba(130,190,255,0.22)'); tg.addColorStop(1, 'rgba(130,190,255,0)');
  ctx.fillStyle = tg; ctx.beginPath(); ctx.arc(tx, ty, 86 + Math.sin(t2 * 2) * 5, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(tx + 8, ty + 34, 40, 9, 0, 0, 7); ctx.fill();
  const EOC = () => { ctx.strokeStyle = 'rgba(10,16,24,0.8)'; ctx.lineWidth = 1.2; ctx.stroke(); };
  const stoneG = (x0, x1) => { const g = ctx.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, '#54708e'); g.addColorStop(0.45, '#3d5570'); g.addColorStop(1, '#25344a'); return g; };
  const crenel = (x0, x1, yy, w) => { /* 城齿 */
    for (let cx2 = x0; cx2 + w <= x1 + 0.1; cx2 += w * 2) { ctx.fillStyle = '#46617e'; ctx.fillRect(cx2, yy, w, 5); ctx.strokeRect(cx2, yy, w, 5); }
  };
  /* 外墙（前） */
  ctx.fillStyle = stoneG(tx - 36, tx + 36);
  ctx.beginPath(); ctx.rect(tx - 34, ty + 2, 68, 30); ctx.fill(); EOC();
  crenel(tx - 32, tx + 32, ty - 3, 4.6);
  /* 石砖缝 */
  ctx.strokeStyle = 'rgba(14,22,32,0.35)'; ctx.lineWidth = 0.8;
  for (let row = 0; row < 3; row++) { ctx.beginPath(); ctx.moveTo(tx - 33, ty + 9 + row * 8); ctx.lineTo(tx + 33, ty + 9 + row * 8); ctx.stroke(); }
  for (let col = 0; col < 7; col++) { const bx = tx - 30 + col * 10; for (let row = 0; row < 3; row++) { ctx.beginPath(); ctx.moveTo(bx + (row % 2) * 5, ty + 3 + row * 8); ctx.lineTo(bx + (row % 2) * 5, ty + 9 + row * 8); ctx.stroke(); } }
  /* 主堡（后） */
  ctx.fillStyle = stoneG(tx - 16, tx + 16);
  ctx.beginPath(); ctx.rect(tx - 15, ty - 26, 30, 32); ctx.fill(); EOC();
  crenel(tx - 14, tx + 14, ty - 31, 4);
  /* 左右角楼 */
  for (const s of [-1, 1]) {
    ctx.fillStyle = stoneG(tx + s * 30 - 7, tx + s * 30 + 7);
    ctx.beginPath(); ctx.rect(tx + s * 30 - 6.5, ty - 22, 13, 54); ctx.fill(); EOC();
    const cg2 = ctx.createLinearGradient(tx + s * 30 - 8, 0, tx + s * 30 + 8, 0);
    cg2.addColorStop(0, '#5a7898'); cg2.addColorStop(1, '#2c3f58');
    ctx.fillStyle = cg2;
    ctx.beginPath(); ctx.moveTo(tx + s * 30, ty - 44); ctx.lineTo(tx + s * 30 + 8.5, ty - 22); ctx.lineTo(tx + s * 30 - 8.5, ty - 22); ctx.closePath(); ctx.fill(); EOC();
    ctx.fillStyle = '#8fb8e0'; /* 角楼灯窗 */
    ctx.fillRect(tx + s * 30 - 1.7, ty - 14, 3.4, 5);
    ctx.fillStyle = 'rgba(255,220,120,' + (0.55 + 0.3 * Math.sin(t2 * 2.2 + s)) + ')';
    ctx.fillRect(tx + s * 30 - 1.2, ty - 13.4, 2.4, 3.8);
  }
  /* 中央尖顶 + 宝珠 */
  const spg = ctx.createLinearGradient(tx - 10, 0, tx + 10, 0);
  spg.addColorStop(0, '#6488ac'); spg.addColorStop(1, '#31465e');
  ctx.fillStyle = spg;
  ctx.beginPath(); ctx.moveTo(tx, ty - 56); ctx.lineTo(tx + 11, ty - 30); ctx.lineTo(tx - 11, ty - 30); ctx.closePath(); ctx.fill(); EOC();
  const cg = ctx.createRadialGradient(tx, ty - 58, 1, tx, ty - 58, 10);
  cg.addColorStop(0, '#e8f6ff'); cg.addColorStop(0.4, '#8fd0ff'); cg.addColorStop(1, 'rgba(143,208,255,0)');
  ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(tx, ty - 58, 10 + Math.sin(t2 * 3) * 1.5, 0, 7); ctx.fill();
  /* 大王旗（主堡顶飘动） */
  ctx.strokeStyle = '#1c2838'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(tx + 15, ty - 31); ctx.lineTo(tx + 15, ty - 47); ctx.stroke();
  const wav = Math.sin(t2 * 4) * 1.6;
  ctx.fillStyle = '#c9a45a';
  ctx.beginPath(); ctx.moveTo(tx + 15, ty - 47); ctx.quadraticCurveTo(tx + 22, ty - 45 + wav, tx + 29, ty - 44);
  ctx.lineTo(tx + 25, ty - 40 + wav * 0.5); ctx.lineTo(tx + 21, ty - 41.5); ctx.quadraticCurveTo(tx + 17, ty - 40, tx + 15, ty - 39.5); ctx.closePath(); ctx.fill(); EOC();
  /* 正门：拱 + 灯 + 吊闸纹 */
  ctx.fillStyle = '#141f2e';
  ctx.beginPath(); ctx.rect(tx - 7, ty + 12, 14, 20); ctx.arc(tx, ty + 12, 7, Math.PI, 0); ctx.fill();
  ctx.strokeStyle = 'rgba(90,120,150,0.5)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(tx, ty + 12, 8.6, Math.PI, 0); ctx.stroke();
  ctx.strokeStyle = 'rgba(60,80,105,0.6)';
  for (let i2 = -1; i2 <= 1; i2++) { ctx.beginPath(); ctx.moveTo(tx + i2 * 4, ty + 12); ctx.lineTo(tx + i2 * 4, ty + 30); ctx.stroke(); }
  ctx.fillStyle = 'rgba(255,215,120,' + (0.5 + 0.25 * Math.sin(t2 * 3)) + ')'; /* 门灯 */
  ctx.beginPath(); ctx.arc(tx - 11, ty + 10, 2.4, 0, 7); ctx.arc(tx + 11, ty + 10, 2.4, 0, 7); ctx.fill();
  /* 主堡灯窗 */
  ctx.fillStyle = 'rgba(255,220,130,0.75)';
  ctx.fillRect(tx - 6.5, ty - 18, 3.4, 5.5); ctx.fillRect(tx + 3.1, ty - 18, 3.4, 5.5);
  ctx.restore();
  /* 要塞基座 */
  for (const [c, r] of FORTL()) {
    const placed = isFortPlaced(c, r);
    const fx0 = c * TILE + 5, fy0 = gy(r) - TILE / 2 + 5, fsz = TILE - 10;
    ctx.fillStyle = placed ? 'rgba(90,110,140,0.18)' : 'rgba(255,215,115,0.07)';
    ctx.fillRect(fx0, fy0, fsz, fsz);
    ctx.strokeStyle = placed ? 'rgba(120,160,200,0.35)' : 'rgba(255,215,115,0.55)';
    ctx.lineWidth = 1.5; ctx.strokeRect(fx0, fy0, fsz, fsz);
    ctx.strokeStyle = placed ? 'rgba(150,190,230,0.5)' : 'rgba(255,215,115,0.7)'; ctx.lineWidth = 2;
    for (const [cx2, cy2, sx3, sy3] of [[fx0, fy0, 1, 1], [fx0 + fsz, fy0, -1, 1], [fx0, fy0 + fsz, 1, -1], [fx0 + fsz, fy0 + fsz, -1, -1]]) {
      ctx.beginPath(); ctx.moveTo(cx2 + sx3 * 7, cy2); ctx.lineTo(cx2, cy2); ctx.lineTo(cx2, cy2 + sy3 * 7); ctx.stroke();
    }
    if (!placed) { ctx.fillStyle = 'rgba(255,215,115,0.4)'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('要塞', c * TILE + TILE / 2, gy(r) + 3); }
  }
  /* 单位 */
  for (const u of game.units) drawUnit(u);
  /* 敌人 */
  for (const e of game.enemies) drawEnemy(e);
  /* 弹道/特效 */
  ctx.lineCap = 'round';
  for (const s of game.shots) {
    const p = Math.min(1, s.t / s.life);
    const px2 = s.px !== undefined ? s.px : s.x + (s.tx - s.x) * p;
    const py2 = s.py !== undefined ? s.py : s.y + (s.ty - s.y) * p;
    const ang = Math.atan2(s.ty - py2 + (s.arc ? Math.cos(p * Math.PI) * s.arc * 0.9 : 0), s.tx - px2);
    if (s.kind === 'cannon') {
      for (let i2 = 1; i2 <= 3; i2++) {
        const q = Math.max(0, p - i2 * 0.1);
        ctx.fillStyle = 'rgba(185,192,202,' + (0.22 - i2 * 0.05) + ')';
        ctx.beginPath(); ctx.arc(s.x + (s.tx - s.x) * q, s.y + (s.ty - s.y) * q - Math.sin(q * Math.PI) * s.arc, 1.6 + i2 * 1.1, 0, 7); ctx.fill();
      }
      ctx.fillStyle = '#20262e'; ctx.beginPath(); ctx.arc(px2, py2, 3.4, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(px2 - 1, py2 - 1.1, 1.2, 0, 7); ctx.stroke();
    } else if (s.kind === 'mage') {
      for (let i2 = 1; i2 <= 3; i2++) {
        const q = Math.max(0, p - i2 * 0.11);
        ctx.fillStyle = 'rgba(176,138,255,' + (0.34 - i2 * 0.09) + ')';
        ctx.beginPath(); ctx.arc(s.x + (s.tx - s.x) * q, s.y + (s.ty - s.y) * q, 3.4 - i2 * 0.7, 0, 7); ctx.fill();
      }
      const mg = ctx.createRadialGradient(px2, py2, 0.5, px2, py2, 5.5);
      mg.addColorStop(0, '#fff'); mg.addColorStop(0.5, '#b08aff'); mg.addColorStop(1, 'rgba(176,138,255,0)');
      ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(px2, py2, 5.5, 0, 7); ctx.fill();
    } else {
      const bx2 = Math.cos(ang), by2 = Math.sin(ang);
      const shx = s.kind === 'xbow' ? 7 : 9, col2 = s.kind === 'xbow' ? '#cfe8a0' : '#e8d8a8';
      ctx.strokeStyle = s.kind === 'xbow' ? 'rgba(207,232,160,0.25)' : 'rgba(255,240,190,0.28)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(px2, py2); ctx.lineTo(px2 - bx2 * 15, py2 - by2 * 15); ctx.stroke();
      ctx.strokeStyle = col2; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(px2, py2); ctx.lineTo(px2 - bx2 * shx, py2 - by2 * shx); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px2, py2, 1.3, 0, 7); ctx.fill();
      ctx.strokeStyle = '#d8d8d0'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px2 - bx2 * shx, py2 - by2 * shx); ctx.lineTo(px2 - bx2 * (shx + 3) - by2 * 1.8, py2 - by2 * (shx + 3) + bx2 * 1.8);
      ctx.moveTo(px2 - bx2 * shx, py2 - by2 * shx); ctx.lineTo(px2 - bx2 * (shx + 3) + by2 * 1.8, py2 - by2 * (shx + 3) - bx2 * 1.8);
      ctx.stroke();
    }
  }
  ctx.lineCap = 'butt';
  for (const f of game.fx) {
    const p = f.t / f.life;
    if (f.slash) {
      ctx.strokeStyle = 'rgba(255,250,230,' + (1 - p) + ')'; ctx.lineWidth = 2.6 - p * 1.6;
      ctx.beginPath(); ctx.arc(f.x, f.y, 9 + p * 8, f.ang - 1.15 + p * 0.9, f.ang + 1.15 + p * 0.9); ctx.stroke();
      continue;
    }
    if (f.puff) {
      ctx.fillStyle = 'rgba(195,200,210,' + (0.38 * (1 - p)) + ')';
      ctx.beginPath(); ctx.arc(f.x + f.vx * f.t, f.y + f.vy * f.t, 2.5 + p * 7, 0, 7); ctx.fill();
      continue;
    }
    if (f.p) {
      ctx.globalAlpha = 1 - p * p;
      if (f.coin) { ctx.fillStyle = f.color; ctx.beginPath(); ctx.ellipse(f.x, f.y, f.sz, f.sz * Math.abs(Math.cos(f.t * 9)), 0, 0, 7); ctx.fill(); }
      else { ctx.fillStyle = f.color; ctx.fillRect(f.x - f.sz / 2, f.y - f.sz / 2, f.sz, f.sz); }
      ctx.globalAlpha = 1; continue;
    }
    if (f.line) { ctx.strokeStyle = f.color; ctx.globalAlpha = 1 - p; ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke(); ctx.globalAlpha = 1; continue; }
    ctx.strokeStyle = f.color + (1 - p) + ')'; ctx.lineWidth = f.w || 3;
    ctx.beginPath(); ctx.arc(f.x, f.y, (f.r0 || 40) * (0.3 + p), 0, 7); ctx.stroke();
  }
  /* 建造预览 */
  if (game.build && mouse.on) {
    const [c, r] = cellOf(mouse.x, mouse.y);
    const ok = canPlace(c, r, game.build) && game.gold >= Math.round(UNITS[game.build].cost * (DIFFS[game.diff].cost || 1)) && usedPop() + UNITS[game.build].pop <= capTotal();
    ctx.fillStyle = ok ? 'rgba(120,220,120,0.25)' : 'rgba(255,90,90,0.25)';
    ctx.fillRect(c * TILE, gy(r) - TILE / 2, TILE, TILE);
    ctx.strokeStyle = 'rgba(160,220,255,0.7)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(gx(c), gy(r), UNITS[game.build].range * TILE, 0, 7); ctx.stroke();
  }
  if (game.aimSpell && mouse.on) {
    ctx.strokeStyle = 'rgba(255,160,80,0.8)'; ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.arc(mouse.x, mouse.y, 2.4 * TILE, 0, 7); ctx.stroke(); ctx.setLineDash([]);
  }
  /* 选中环 */
  if (game.sel) {
    const u = game.sel;
    ctx.strokeStyle = 'rgba(160,220,255,0.9)'; ctx.lineWidth = 2;
    ctx.strokeRect(u.c * TILE + 2, gy(u.r) - TILE / 2 + 2, TILE - 4, TILE - 4);
    ctx.strokeStyle = 'rgba(160,220,255,0.25)';
    ctx.beginPath(); ctx.arc(u.x, u.y, UNITS[u.type].range * TILE * (u.mastery === 2 ? 1.15 : 1), 0, 7); ctx.stroke();
  }
  /* 文本 */
  for (const t of game.texts) {
    ctx.globalAlpha = 1 - t.t / t.life;
    ctx.fillStyle = t.color; ctx.font = 'bold ' + t.size + 'px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(t.s, t.x, t.y); ctx.globalAlpha = 1;
  }
  /* banner */
  if (game.banner) {
    const b = game.banner, p = b.t / b.life;
    ctx.globalAlpha = p < 0.15 ? p / 0.15 : p > 0.8 ? (1 - p) / 0.2 : 1;
    ctx.fillStyle = b.color || '#ffd873'; ctx.font = 'bold 40px serif'; ctx.textAlign = 'center';
    ctx.fillText(b.txt, W / 2, 250);
    if (b.sub) { ctx.font = '15px sans-serif'; ctx.fillStyle = '#cfe3ff'; ctx.fillText(b.sub, W / 2, 285); }
    ctx.globalAlpha = 1;
  }
  if (toastT > 0 && toastMsg) {
    ctx.globalAlpha = Math.min(1, toastT);
    ctx.fillStyle = 'rgba(10,16,24,0.85)';
    const w = ctx.measureText(toastMsg).width + 40;
    ctx.fillRect(W / 2 - w / 2, HT - 90, w, 34);
    ctx.fillStyle = '#ffe8b0'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(toastMsg, W / 2, HT - 68);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  drawOverlays();
}
function isFortPlaced(c, r) { return unitAt(c, r) !== undefined; }
function drawUnit(u) {
  const d = UNITS[u.type];
  const x = u.x, y = u.y;
  ctx.fillStyle = 'rgba(0,0,0,0.30)'; ctx.beginPath(); ctx.ellipse(x + 3, y + 13, 13, 4.5, 0, 0, 7); ctx.fill();
  const lb = u.atkT > 0 ? u.atkT / 0.14 : 0;
  const hasLunge = u.lunge && u.lunge.t < 0.2;
  if (hasLunge) { ctx.save(); const q = Math.sin(Math.PI * u.lunge.t / 0.2); ctx.translate(u.lunge.dx * q * 7, u.lunge.dy * q * 5); }
  if (lb > 0) { ctx.save(); ctx.translate(x, y); ctx.scale(1 + lb * 0.14, 1 - lb * 0.05); ctx.translate(-x, -y); }
  /* —— Q 版盔甲战士：描边+分层+受光，逐职业手绘 —— */
  const C = d.color, OUT = 'rgba(14,20,28,0.9)';
  const gM = () => { const gg = ctx.createLinearGradient(x - 9, y - 20, x + 9, y + 13); gg.addColorStop(0, shade(C, 1.34)); gg.addColorStop(0.55, C); gg.addColorStop(1, shade(C, 0.62)); return gg; };
  const gDark = () => { const gg = ctx.createLinearGradient(x - 9, y - 8, x + 9, y + 13); gg.addColorStop(0, shade(C, 1.05)); gg.addColorStop(1, shade(C, 0.55)); return gg; };
  const stroke = (lw) => { ctx.strokeStyle = OUT; ctx.lineWidth = lw || 1.3; ctx.stroke(); };
  const GOLD = '#c9a45a', GOLD_D = '#8a6a33', SKIN = '#d8a878', LEATHER = '#7a5a3e', WOOD = '#a8825a';
  const t = game.t;
  const legPair = () => { /* 腿甲 */
    ctx.fillStyle = gDark();
    ctx.beginPath(); ctx.roundRect(x - 7, y + 4, 5.6, 9, 2); ctx.fill(); stroke(1);
    ctx.beginPath(); ctx.roundRect(x + 1.4, y + 4, 5.6, 9, 2); ctx.fill(); stroke(1);
  };
  const torso = (w1, w2, h, g) => { /* 胸甲（上宽下窄） */
    ctx.fillStyle = g || gM();
    ctx.beginPath();
    ctx.moveTo(x - w1, y - h * 0.45); ctx.lineTo(x + w1, y - h * 0.45);
    ctx.lineTo(x + w2, y + h * 0.55); ctx.lineTo(x - w2, y + h * 0.55);
    ctx.closePath(); ctx.fill(); stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x - w1 + 1.5, y - h * 0.45 + 1.5); ctx.lineTo(x + w1 - 1.5, y - h * 0.45 + 1.5); ctx.stroke();
  };
  const pauldrons = (r) => { /* 肩甲 */
    for (const s of [-1, 1]) {
      const gg = ctx.createRadialGradient(x + s * 9 - 1.5, y - 8 - 1.5, 0.5, x + s * 9, y - 8, r + 1);
      gg.addColorStop(0, shade(C, 1.5)); gg.addColorStop(1, shade(C, 0.72));
      ctx.fillStyle = gg;
      ctx.beginPath(); ctx.arc(x + s * 9.5, y - 8, r, Math.PI, 0); ctx.closePath(); ctx.fill(); stroke(1.2);
    }
  };
  const helm = (vr) => { /* 圆顶盔+面甲缝 */
    const hg = ctx.createRadialGradient(x - 2, y - 15, 1, x, y - 12, 7.5);
    hg.addColorStop(0, shade(C, 1.55)); hg.addColorStop(1, shade(C, 0.8));
    ctx.fillStyle = hg;
    ctx.beginPath(); ctx.arc(x, y - 12, 6.2, Math.PI, 0); ctx.lineTo(x + 6.2, y - 10); ctx.lineTo(x - 6.2, y - 10); ctx.closePath(); ctx.fill(); stroke(1.2);
    ctx.fillStyle = 'rgba(10,14,20,0.8)';
    if (vr === 'v') ctx.fillRect(x - 1.1, y - 13.5, 2.2, 4.6); else { ctx.fillRect(x - 4.6, y - 12.4, 9.2, 1.9); }
  };
  if (u.type === 'sword') {
    legPair(); torso(7.5, 5.8, 13); pauldrons(4);
    ctx.fillStyle = SKIN; ctx.fillRect(x - 3.4, y - 10.5, 6.8, 3); /* 颈 */
    helm('v');
    /* 顶天剑：以肩为轴，出手时从后上抡到前下 */
    let swing = -0.32;
    if (u.lunge) { const q = Math.min(1, u.lunge.t / 0.2); swing = -1.8 + q * q * 2.5; }
    ctx.save(); ctx.translate(x + 7, y - 8); ctx.rotate(swing);
    const bg = ctx.createLinearGradient(-1.6, -20, 1.6, 0); bg.addColorStop(0, '#eef4fa'); bg.addColorStop(1, '#8fa2b8');
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(2, -18); ctx.lineTo(2, -2); ctx.lineTo(-2, -2); ctx.lineTo(-2, -18); ctx.closePath(); ctx.fill(); stroke(1);
    if (u.lunge && u.lunge.t < 0.12) {
      const q = u.lunge.t / 0.12;
      ctx.strokeStyle = 'rgba(255,250,235,' + (0.55 * (1 - q)) + ')'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(0, -12, 12, -2.2, -2.2 + q * 2.2); ctx.stroke();
    }
    ctx.fillStyle = GOLD; ctx.fillRect(-4.5, -2.6, 9, 2.4); ctx.fillRect(-1.3, -0.2, 2.6, 4); stroke(0.9);
    ctx.restore();
    /* 鸢盾：左手侧 */
    const sx = x - 10.5;
    const sg = ctx.createLinearGradient(sx - 6, y - 12, sx + 6, y + 10);
    sg.addColorStop(0, shade(C, 1.3)); sg.addColorStop(1, shade(C, 0.7));
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.moveTo(sx - 6.4, y - 11); ctx.lineTo(sx + 6.4, y - 11); ctx.lineTo(sx + 6.4, y + 2); ctx.quadraticCurveTo(sx, y + 12, sx - 6.4, y + 2); ctx.closePath(); ctx.fill(); stroke(1.3);
    ctx.strokeStyle = GOLD; ctx.lineWidth = 1.1; ctx.stroke();
    ctx.fillStyle = GOLD;
    ctx.beginPath(); ctx.moveTo(sx, y - 6.5); ctx.lineTo(sx + 3.4, y - 1.5); ctx.lineTo(sx, y + 3.5); ctx.lineTo(sx - 3.4, y - 1.5); ctx.closePath(); ctx.fill();
  } else if (u.type === 'pike') {
    legPair(); torso(6.8, 5.6, 13);
    ctx.fillStyle = SKIN; ctx.fillRect(x - 3.2, y - 10.5, 6.4, 3);
    /* 尖顶盔 */
    const hg = ctx.createLinearGradient(x - 5, y - 19, x + 5, y - 9); hg.addColorStop(0, shade(C, 1.45)); hg.addColorStop(1, shade(C, 0.75));
    ctx.fillStyle = hg;
    ctx.beginPath(); ctx.moveTo(x - 5.6, y - 10); ctx.lineTo(x - 4.6, y - 15); ctx.lineTo(x, y - 19.5); ctx.lineTo(x + 4.6, y - 15); ctx.lineTo(x + 5.6, y - 10); ctx.closePath(); ctx.fill(); stroke(1.2);
    ctx.fillStyle = 'rgba(10,14,20,0.8)'; ctx.fillRect(x - 4, y - 13, 8, 1.8);
    /* 斜持长枪：出手沿枪身前送突刺 */
    const ext = u.lunge ? Math.sin(Math.PI * Math.min(1, u.lunge.t / 0.2)) * 6 : 0;
    ctx.save(); ctx.translate(x + 8, y - 2); ctx.rotate(0.42); ctx.translate(0, -ext);
    ctx.strokeStyle = WOOD; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(0, 12); ctx.lineTo(0, -22); ctx.stroke();
    ctx.fillStyle = '#c8d4e0';
    ctx.beginPath(); ctx.moveTo(0, -29); ctx.lineTo(2.6, -20.5); ctx.lineTo(0, -18.5); ctx.lineTo(-2.6, -20.5); ctx.closePath(); ctx.fill(); stroke(1);
    ctx.strokeStyle = '#c04a3a'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-2.4, -17.5); ctx.lineTo(-4.5, -13.5); ctx.moveTo(2.4, -17.5); ctx.lineTo(4.5, -13.5); ctx.stroke();
    ctx.restore();
    /* 腰带 */
    ctx.fillStyle = LEATHER; ctx.fillRect(x - 6.4, y + 2.5, 12.8, 2.4);
  } else if (u.type === 'arch') {
    /* 兜帽绿装游侠 */
    ctx.fillStyle = gDark();
    ctx.beginPath(); ctx.moveTo(x - 6.5, y + 13); ctx.quadraticCurveTo(x - 8, y - 4, x - 4, y - 8); ctx.lineTo(x + 4, y - 8); ctx.quadraticCurveTo(x + 8, y - 4, x + 6.5, y + 13); ctx.closePath(); ctx.fill(); stroke();
    const hg = ctx.createLinearGradient(x - 6, y - 21, x + 6, y - 8); hg.addColorStop(0, shade(C, 1.38)); hg.addColorStop(1, shade(C, 0.72));
    ctx.fillStyle = hg;
    ctx.beginPath(); ctx.moveTo(x - 6.6, y - 7.5); ctx.quadraticCurveTo(x - 7, y - 17, x, y - 20.5); ctx.quadraticCurveTo(x + 7, y - 17, x + 6.6, y - 7.5); ctx.closePath(); ctx.fill(); stroke(1.2);
    ctx.fillStyle = 'rgba(12,18,14,0.75)';
    ctx.beginPath(); ctx.ellipse(x + 0.5, y - 11, 3.6, 3, 0, 0, 7); ctx.fill();
    ctx.fillStyle = SKIN; ctx.beginPath(); ctx.arc(x + 1.2, y - 11.8, 1.5, 0, 7); ctx.fill();
    /* 背箭囊 */
    ctx.save(); ctx.translate(x - 7.5, y - 6); ctx.rotate(-0.35);
    ctx.fillStyle = LEATHER; ctx.fillRect(-2.2, -8, 4.4, 11); stroke(1);
    for (const ax of [-1.3, 0, 1.3]) { ctx.strokeStyle = '#e8e0c8'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(ax, -8); ctx.lineTo(ax, -12.5); ctx.stroke(); ctx.fillStyle = '#c04a3a'; ctx.fillRect(ax - 0.8, -13.6, 1.6, 1.6); }
    ctx.restore();
    /* 长弓 */
    ctx.strokeStyle = WOOD; ctx.lineWidth = 1.9;
    ctx.beginPath(); ctx.arc(x + 9.5, y - 1, 8.6, -1.35, 1.35); ctx.stroke();
    ctx.strokeStyle = 'rgba(240,240,225,0.85)'; ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.moveTo(x + 9.5 + 8.6 * Math.cos(-1.35), y - 1 + 8.6 * Math.sin(-1.35)); ctx.lineTo(x + 9.5 + 8.6 * Math.cos(1.35), y - 1 + 8.6 * Math.sin(1.35)); ctx.stroke();
  } else if (u.type === 'mage') {
    /* 法袍：下摆波浪 */
    const rg = ctx.createLinearGradient(x - 8, y - 12, x + 8, y + 13); rg.addColorStop(0, shade(C, 1.3)); rg.addColorStop(1, shade(C, 0.6));
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.moveTo(x - 4.5, y - 9); ctx.lineTo(x + 4.5, y - 9);
    ctx.quadraticCurveTo(x + 9.5, y + 6, x + 8.5, y + 13);
    for (let i2 = 0; i2 < 4; i2++) { const wx2 = x + 8.5 - i2 * 4.25; ctx.quadraticCurveTo(wx2 - 2.1, y + 9.5, wx2 - 4.25, y + 13); }
    ctx.quadraticCurveTo(x - 9.5, y + 6, x - 4.5, y - 9); ctx.closePath(); ctx.fill(); stroke();
    /* 大袖 */
    ctx.fillStyle = shade(C, 0.85);
    ctx.beginPath(); ctx.ellipse(x - 8.5, y - 2, 3.4, 5.2, 0.4, 0, 7); ctx.fill(); stroke(1);
    /* 尖帽 */
    const hg = ctx.createLinearGradient(x - 6, y - 24, x + 6, y - 9); hg.addColorStop(0, shade(C, 1.42)); hg.addColorStop(1, shade(C, 0.7));
    ctx.fillStyle = hg;
    ctx.beginPath(); ctx.moveTo(x - 7, y - 9.5); ctx.quadraticCurveTo(x - 5, y - 16, x + 2.5, y - 21.5); ctx.quadraticCurveTo(x + 3.5, y - 15, x + 7, y - 9.5); ctx.closePath(); ctx.fill(); stroke(1.2);
    ctx.fillStyle = '#ffe89a';
    ctx.beginPath(); ctx.arc(x - 1.6, y - 14.5, 1.2, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(12,10,20,0.8)'; ctx.beginPath(); ctx.ellipse(x + 0.5, y - 10.6, 3.4, 2.2, 0, 0, 7); ctx.fill();
    /* 法杖+悬浮奥球 */
    ctx.strokeStyle = WOOD; ctx.lineWidth = 1.9; ctx.beginPath(); ctx.moveTo(x + 9, y + 12); ctx.quadraticCurveTo(x + 7.5, y - 6, x + 9.5, y - 15); ctx.stroke();
    const og = ctx.createRadialGradient(x + 9.5, y - 17.5, 0.5, x + 9.5, y - 17.5, 5.5);
    og.addColorStop(0, '#fff'); og.addColorStop(0.45, '#b08aff'); og.addColorStop(1, 'rgba(176,138,255,0)');
    ctx.fillStyle = og; ctx.beginPath(); ctx.arc(x + 9.5, y - 17.5, 5.5 + Math.sin(t * 4) * 0.6, 0, 7); ctx.fill();
  } else if (u.type === 'holy') {
    /* 白金色袍 + 光环 */
    const rg = ctx.createLinearGradient(x - 8, y - 12, x + 8, y + 13); rg.addColorStop(0, '#f2ecd8'); rg.addColorStop(1, '#b8ab8a');
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.moveTo(x - 4.5, y - 9); ctx.lineTo(x + 4.5, y - 9);
    ctx.quadraticCurveTo(x + 9, y + 6, x + 8, y + 13); ctx.lineTo(x - 8, y + 13);
    ctx.quadraticCurveTo(x - 9, y + 6, x - 4.5, y - 9); ctx.closePath(); ctx.fill(); stroke();
    ctx.fillStyle = GOLD; ctx.fillRect(x - 1.6, y - 8, 3.2, 12); /* 金绶带 */
    ctx.fillStyle = 'rgba(16,22,30,0.9)';
    ctx.beginPath(); ctx.arc(x, y - 13, 4.6, 0, 7); ctx.fill();  /* 头部暗兜 */
    ctx.fillStyle = SKIN; ctx.beginPath(); ctx.arc(x, y - 12.4, 3.2, 0, 7); ctx.fill();
    const ag = ctx.createRadialGradient(x, y - 21, 0.5, x, y - 21, 7);
    ag.addColorStop(0, 'rgba(255,240,170,0.95)'); ag.addColorStop(1, 'rgba(255,240,170,0)');
    ctx.strokeStyle = '#ffe89a'; ctx.lineWidth = 1.6;
    ctx.save(); ctx.translate(x, y - 21); ctx.scale(1, 0.36); ctx.beginPath(); ctx.arc(0, 0, 6.5, 0, 7); ctx.stroke(); ctx.restore();
    /* 十字杖 */
    ctx.strokeStyle = GOLD; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(x + 9, y + 12); ctx.lineTo(x + 9, y - 13); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 5.8, y - 10); ctx.lineTo(x + 12.2, y - 10); ctx.stroke();
    const og2 = ctx.createRadialGradient(x + 9, y - 14, 0.3, x + 9, y - 14, 4);
    og2.addColorStop(0, '#fff'); og2.addColorStop(1, 'rgba(255,230,140,0)');
    ctx.fillStyle = og2; ctx.beginPath(); ctx.arc(x + 9, y - 14, 4 + Math.sin(t * 3) * 0.5, 0, 7); ctx.fill();
  } else if (u.type === 'cannon') {
    /* 石台 + 黑铁炮 */
    const sg2 = ctx.createLinearGradient(x - 12, y - 2, x + 12, y + 13); sg2.addColorStop(0, '#6a7482'); sg2.addColorStop(1, '#3a4450');
    ctx.fillStyle = sg2;
    ctx.beginPath(); ctx.moveTo(x - 13, y + 13); ctx.lineTo(x - 10, y); ctx.lineTo(x + 10, y); ctx.lineTo(x + 13, y + 13); ctx.closePath(); ctx.fill(); stroke();
    ctx.strokeStyle = 'rgba(10,14,20,0.5)'; ctx.lineWidth = 0.8;
    for (const yy of [4.5, 9]) { ctx.beginPath(); ctx.moveTo(x - 12 + (yy - 4.5) * 0.4, y + yy); ctx.lineTo(x + 12 - (yy - 4.5) * 0.4, y + yy); ctx.stroke(); }
    const wg = ctx.createLinearGradient(x - 9, y - 12, x + 6, y); wg.addColorStop(0, '#5a6674'); wg.addColorStop(0.5, '#333d49'); wg.addColorStop(1, '#1c242e');
    ctx.fillStyle = wg;
    ctx.beginPath(); ctx.roundRect(x - 9.5, y - 11, 15, 10, 3); ctx.fill(); stroke(1.3);
    ctx.save(); ctx.translate(x + 2, y - 6.5); ctx.rotate(-0.42);
    const bgd = ctx.createLinearGradient(0, -3, 16, 3); bgd.addColorStop(0, '#39434f'); bgd.addColorStop(1, '#161d26');
    ctx.fillStyle = bgd; ctx.beginPath(); ctx.roundRect(0, -3.4, 15, 6.8, 2.4); ctx.fill(); stroke(1.2);
    ctx.fillStyle = '#0c1116'; ctx.beginPath(); ctx.arc(15, 0, 3.4, 0, 7); ctx.fill();
    ctx.strokeStyle = GOLD_D; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(15, 0, 3.4, -1.1, 1.1); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = GOLD; ctx.beginPath(); ctx.arc(x - 6.5, y - 6.5, 1.1, 0, 7); ctx.fill();
  } else if (u.type === 'xbow') {
    legPair(); torso(6.8, 5.6, 13); pauldrons(3.4);
    ctx.fillStyle = SKIN; ctx.fillRect(x - 3.2, y - 10.5, 6.4, 3);
    /* 钢盔护颊 */
    const hg = ctx.createLinearGradient(x - 6, y - 18, x + 6, y - 9); hg.addColorStop(0, shade(C, 1.45)); hg.addColorStop(1, shade(C, 0.75));
    ctx.fillStyle = hg;
    ctx.beginPath(); ctx.arc(x, y - 11.5, 5.8, Math.PI, 0); ctx.lineTo(x + 5.8, y - 8); ctx.lineTo(x + 3.4, y - 8); ctx.lineTo(x + 3.4, y - 11); ctx.lineTo(x - 3.4, y - 11); ctx.lineTo(x - 3.4, y - 8); ctx.lineTo(x - 5.8, y - 8); ctx.closePath(); ctx.fill(); stroke(1.2);
    ctx.fillStyle = 'rgba(10,14,20,0.75)'; ctx.fillRect(x - 3, y - 12.5, 6, 1.8);
    /* 腰挂短矢 */
    ctx.fillStyle = LEATHER; ctx.fillRect(x - 7.5, y + 1, 4.6, 5.5); stroke(0.9);
    ctx.strokeStyle = '#d8d0b0'; ctx.lineWidth = 0.9;
    for (const ax of [-6.7, -5.2, -3.7]) { ctx.beginPath(); ctx.moveTo(ax, y + 1); ctx.lineTo(ax, y - 2.6); ctx.stroke(); }
    /* 平射钢弩 */
    ctx.save(); ctx.translate(x + 8, y - 4);
    ctx.fillStyle = WOOD; ctx.beginPath(); ctx.roundRect(-3, -1.6, 11, 3.2, 1.2); ctx.fill(); stroke(1);
    ctx.strokeStyle = '#9aa8b8'; ctx.lineWidth = 1.7;
    ctx.beginPath(); ctx.moveTo(6.5, -7); ctx.quadraticCurveTo(9.5, 0, 6.5, 7); ctx.stroke();
    ctx.strokeStyle = 'rgba(240,240,225,0.9)'; ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.moveTo(6.5, -7); ctx.lineTo(1, 0); ctx.lineTo(6.5, 7); ctx.stroke();
    ctx.strokeStyle = '#3a2f22'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(1, 0); ctx.lineTo(9.5, 0); ctx.stroke();
    ctx.restore();
  } else if (u.type === 'drum') {
    /* 赤膊鼓手 */
    ctx.fillStyle = SKIN;
    ctx.beginPath(); ctx.moveTo(x - 6.5, y - 8); ctx.lineTo(x + 6.5, y - 8); ctx.lineTo(x + 5.5, y + 3); ctx.lineTo(x - 5.5, y + 3); ctx.closePath(); ctx.fill(); stroke();
    ctx.strokeStyle = 'rgba(120,80,50,0.5)'; ctx.beginPath(); ctx.moveTo(x, y - 7); ctx.lineTo(x, y + 2); ctx.stroke();
    ctx.fillStyle = gDark(); ctx.fillRect(x - 6, y + 2, 12, 5); /* 腰裙 */
    legPair();
    ctx.fillStyle = SKIN; ctx.beginPath(); ctx.arc(x, y - 12, 4.8, 0, 7); ctx.fill(); stroke(1.2); /* 光头 */
    ctx.fillStyle = GOLD; ctx.fillRect(x - 4.8, y - 14.6, 9.6, 2.2);
    ctx.fillStyle = 'rgba(10,14,20,0.85)'; ctx.fillRect(x - 3, y - 11.4, 6, 1.4);
    /* 战鼓（腰前） */
    const bt = Math.sin(t * 8);
    const dg = ctx.createLinearGradient(x - 8, y + 1, x + 8, y + 10); dg.addColorStop(0, '#a87850'); dg.addColorStop(1, '#6a4a30');
    ctx.fillStyle = dg; ctx.beginPath(); ctx.ellipse(x, y + 6, 8, 5.5, 0, 0, 7); ctx.fill(); stroke(1.3);
    ctx.fillStyle = '#e8d8b0'; ctx.beginPath(); ctx.ellipse(x, y + 4.6, 8, 4.2, 0, 0, 7); ctx.fill(); stroke(1);
    ctx.strokeStyle = '#c04a3a'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x - 7.4, y + 3); ctx.lineTo(x - 3, y + 8.6); ctx.moveTo(x + 7.4, y + 3); ctx.lineTo(x + 3, y + 8.6); ctx.stroke();
    /* 鼓棒 */
    ctx.strokeStyle = '#d8c090'; ctx.lineWidth = 1.7;
    ctx.beginPath(); ctx.moveTo(x - 7.5, y - 5); ctx.lineTo(x - 3.5, y + 1.5 + bt * 2.4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 7.5, y - 5); ctx.lineTo(x + 3.5, y + 1.5 - bt * 2.4); ctx.stroke();
    /* 背后金小旗 */
    ctx.strokeStyle = '#5a4630'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(x + 7, y - 2); ctx.lineTo(x + 9.5, y - 20); ctx.stroke();
    ctx.fillStyle = GOLD;
    ctx.beginPath(); ctx.moveTo(x + 9.5, y - 20); ctx.quadraticCurveTo(x + 16, y - 18 + Math.sin(t * 5) * 1.2, x + 21, y - 17.5); ctx.lineTo(x + 16, y - 14) ; ctx.quadraticCurveTo(x + 12.5, y - 13.5, x + 9.8, y - 14.5); ctx.closePath(); ctx.fill(); stroke(0.9);
    /* 光环范围微光 */
    ctx.strokeStyle = 'rgba(220,190,110,' + (0.16 + 0.1 * bt) + ')';
    ctx.beginPath(); ctx.arc(x, y, d.range * TILE * (0.5 + 0.1 * bt), 0, 7); ctx.stroke();
  }
  if (u.mastery) {
    ctx.strokeStyle = '#c9a4ff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y - 2, 15, game.t * 1.5, game.t * 1.5 + 4.2); ctx.stroke();
  }
  /* 血条（受伤时） */
  if (u.hp < u.maxHpNow() - 0.5) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x - 12, y - 22, 24, 4);
    ctx.fillStyle = u.hp / u.maxHpNow() > 0.35 ? '#8fdc7a' : '#ff8a5a';
    ctx.fillRect(x - 12, y - 22, 24 * clamp(u.hp / u.maxHpNow(), 0, 1), 4);
  }
  /* 等级点 */
  ctx.fillStyle = '#ffd873';
  for (let i = 0; i < u.level; i++) ctx.fillRect(x - 9 + i * 7, y + 15, 4, 3);
  if (lb > 0) ctx.restore();
  if (hasLunge) ctx.restore();
}
function drawEnemy(e) {
  const d = e.def;
  const y = e.y + (d.fly ? Math.sin(game.t * 6 + e.x * 0.05) * 4 - 14 : 0);
  const col = e.hpFlash > 0 ? '#ffffff' : (game.bloodMoon ? shiftRed(d.color) : d.color);
  /* 落影随光源偏右下；飞怪影更小更远 */
  if (d.fly) { ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(e.x + 5, e.y + e.r * 0.95, e.r * 0.55, e.r * 0.2, 0, 0, 7); ctx.fill(); }
  else { ctx.fillStyle = 'rgba(0,0,0,0.30)'; ctx.beginPath(); ctx.ellipse(e.x + 3, y + e.r * 0.9, e.r * 0.85, e.r * 0.32, 0, 0, 7); ctx.fill(); }
  /* —— 插画式怪物：描边 + 体积渐变 + 特征剪影（朝向=行进方向左） —— */
  const r = e.r, ex = e.x;
  const EOUT = (lw) => { ctx.strokeStyle = 'rgba(12,16,12,0.85)'; ctx.lineWidth = lw || 1.3; ctx.stroke(); };
  const egG = (mult) => {
    const g = ctx.createRadialGradient(ex - r * 0.4, y - r * 0.5, r * 0.22, ex, y, r * 1.25);
    const base = col === '#ffffff' ? '#ffffff' : col;
    g.addColorStop(0, shade(base, 1.42 * (mult || 1))); g.addColorStop(0.55, base); g.addColorStop(1, shade(base, 0.52 * (mult || 1)));
    return g;
  };
  const t = game.t;
  if (e.type === 'goblin') {
    /* 绿皮突袭者：前倾小跑 + 短刀 + 大耳 */
    ctx.fillStyle = '#5a4630';
    ctx.beginPath(); ctx.roundRect(ex - r * 0.55, y - r * 0.15, r * 1.1, r * 0.9, 2.5); ctx.fill(); EOUT(1.1); /* 皮甲身 */
    ctx.strokeStyle = 'rgba(12,16,12,0.8)'; ctx.lineWidth = 1.6; /* 跑动腿 */
    const lp = Math.sin(t * 11 + ex * 0.2) * r * 0.3;
    ctx.beginPath(); ctx.moveTo(ex - 2.5, y + r * 0.7); ctx.lineTo(ex - 4 - lp, y + r * 1.25); ctx.moveTo(ex + 2.5, y + r * 0.7); ctx.lineTo(ex + 4 + lp, y + r * 1.25); ctx.stroke();
    ctx.fillStyle = egG(); /* 头 */
    ctx.beginPath(); ctx.arc(ex - r * 0.18, y - r * 0.55, r * 0.62, 0, 7); ctx.fill(); EOUT(1.2);
    ctx.fillStyle = shade(col === '#fff' ? col : col, 0.82); /* 大耳 */
    ctx.beginPath(); ctx.moveTo(ex - r * 0.6, y - r * 0.75); ctx.lineTo(ex - r * 1.35, y - r * 1.15); ctx.lineTo(ex - r * 0.62, y - r * 0.35); ctx.closePath(); ctx.fill(); EOUT(1);
    ctx.beginPath(); ctx.moveTo(ex + r * 0.28, y - r * 0.8); ctx.lineTo(ex + r * 0.95, y - r * 1.2); ctx.lineTo(ex + r * 0.4, y - r * 0.4); ctx.closePath(); ctx.fill(); EOUT(1);
    ctx.fillStyle = '#ffe27a'; /* 凶眼 */
    ctx.beginPath(); ctx.arc(ex - r * 0.42, y - r * 0.6, 1.3, 0, 7); ctx.arc(ex - r * 0.02, y - r * 0.6, 1.3, 0, 7); ctx.fill();
    ctx.save(); ctx.translate(ex + r * 0.75, y - r * 0.3); ctx.rotate(0.5); /* 右手短刀 */
    ctx.fillStyle = '#c8d4e0'; ctx.beginPath(); ctx.moveTo(0, -r * 1.15); ctx.lineTo(1.6, -r * 0.85); ctx.lineTo(1.6, 0); ctx.lineTo(-1.6, 0); ctx.lineTo(-1.6, -r * 0.85); ctx.closePath(); ctx.fill(); EOUT(0.9);
    ctx.fillStyle = '#7a5a3e'; ctx.fillRect(-1.8, 0, 3.6, r * 0.4); ctx.restore();
  } else if (e.type === 'wolf') {
    /* 奔狼：简洁剪影（椭身+梯形头+短腿） */
    const lp = Math.sin(t * 13 + ex * 0.2) * 2.2;
    ctx.fillStyle = egG(0.92);
    ctx.beginPath(); ctx.ellipse(ex + r * 0.15, y - r * 0.1, r * 1.05, r * 0.62, -0.06, 0, 7); ctx.fill(); EOUT(1.4); /* 躯干 */
    ctx.beginPath(); ctx.ellipse(ex - r * 0.95, y - r * 0.45, r * 0.5, r * 0.42, 0, 0, 7); ctx.fill(); EOUT(1.3);    /* 头 */
    ctx.beginPath(); ctx.moveTo(ex - r * 1.35, y - r * 0.35); ctx.lineTo(ex - r * 1.75, y - r * 0.15); ctx.lineTo(ex - r * 1.3, y - r * 0.02); ctx.closePath(); ctx.fill(); EOUT(1); /* 吻 */
    ctx.beginPath(); ctx.moveTo(ex + r * 1.05, y - r * 0.5); ctx.quadraticCurveTo(ex + r * 1.75, y - r * 0.95 - Math.sin(t * 8) * 2, ex + r * 1.6, y - r * 1.45); ctx.quadraticCurveTo(ex + r * 1.2, y - r * 0.9, ex + r * 0.95, y - r * 0.75); ctx.closePath(); ctx.fill(); EOUT(1); /* 尾 */
    ctx.fillStyle = shade(col === '#fff' ? col : col, 0.78); /* 耳 */
    ctx.beginPath(); ctx.moveTo(ex - r * 0.85, y - r * 0.78); ctx.lineTo(ex - r * 0.75, y - r * 1.35); ctx.lineTo(ex - r * 0.42, y - r * 0.82); ctx.closePath(); ctx.fill(); EOUT(0.9);
    ctx.beginPath(); ctx.moveTo(ex - r * 0.48, y - r * 0.82); ctx.lineTo(ex - r * 0.28, y - r * 1.35); ctx.lineTo(ex - r * 0.1, y - r * 0.78); ctx.closePath(); ctx.fill(); EOUT(0.9);
    ctx.strokeStyle = 'rgba(24,30,28,0.95)'; ctx.lineWidth = 2; /* 腿 */
    ctx.beginPath(); ctx.moveTo(ex - r * 0.5, y + r * 0.4); ctx.lineTo(ex - r * 0.62 - lp, y + r * 1.1); ctx.moveTo(ex + r * 0.6, y + r * 0.4); ctx.lineTo(ex + r * 0.72 + lp, y + r * 1.1); ctx.stroke();
    ctx.fillStyle = '#ff8a5a'; ctx.beginPath(); ctx.arc(ex - r * 1.02, y - r * 0.52, 1.4, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(245,245,235,0.9)'; /* 獠牙（小） */
    ctx.beginPath(); ctx.moveTo(ex - r * 1.42, y - r * 0.12); ctx.lineTo(ex - r * 1.36, y + r * 0.12); ctx.lineTo(ex - r * 1.28, y - r * 0.12); ctx.closePath(); ctx.fill();
  } else if (e.type === 'orc') {
    /* 重甲兽人： Mohawk + 骨棒 + 獠牙 */
    ctx.fillStyle = egG(); /* 巨躯 */
    ctx.beginPath();
    ctx.moveTo(ex - r * 0.85, y + r); ctx.lineTo(ex - r * 1.02, y - r * 0.15); ctx.quadraticCurveTo(ex - r * 1.1, y - r * 0.7, ex - r * 0.55, y - r * 0.78);
    ctx.lineTo(ex + r * 0.55, y - r * 0.78); ctx.quadraticCurveTo(ex + r * 1.1, y - r * 0.7, ex + r * 1.02, y - r * 0.15); ctx.lineTo(ex + r * 0.85, y + r);
    ctx.closePath(); ctx.fill(); EOUT();
    ctx.fillStyle = '#6a5a44'; /* 肩骨甲 */
    ctx.beginPath(); ctx.ellipse(ex - r * 0.72, y - r * 0.55, r * 0.42, r * 0.28, -0.5, 0, 7); ctx.fill(); EOUT(1);
    ctx.fillStyle = '#7a4a3a'; /* 皮腰带 */
    ctx.fillRect(ex - r * 0.8, y + r * 0.3, r * 1.6, r * 0.28);
    ctx.fillStyle = shade(col === '#fff' ? col : col, 1.28); /* 头冠莫霍克 */
    ctx.beginPath();
    ctx.moveTo(ex - r * 0.3, y - r * 0.78);
    for (let i2 = 0; i2 < 4; i2++) { ctx.lineTo(ex - r * 0.2 + i2 * r * 0.16, y - r * (1.35 - i2 * 0.06)); ctx.lineTo(ex - r * 0.12 + i2 * r * 0.16, y - r * 0.8); }
    ctx.closePath(); ctx.fill(); EOUT(0.9);
    ctx.fillStyle = '#ff5a4a'; ctx.beginPath(); ctx.arc(ex - r * 0.34, y - r * 0.34, 1.5, 0, 7); ctx.arc(ex + r * 0.12, y - r * 0.34, 1.5, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(242,240,225,0.95)'; /* 獠牙（小） */
    ctx.beginPath(); ctx.moveTo(ex - r * 0.36, y + r * 0.08); ctx.lineTo(ex - r * 0.31, y - r * 0.08); ctx.lineTo(ex - r * 0.25, y + r * 0.08); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(ex + r * 0.08, y + r * 0.08); ctx.lineTo(ex + r * 0.14, y - r * 0.08); ctx.lineTo(ex + r * 0.2, y + r * 0.08); ctx.closePath(); ctx.fill();
    ctx.save(); ctx.translate(ex + r * 0.95, y - r * 0.35); ctx.rotate(-0.45); /* 骨棒 */
    ctx.fillStyle = '#cfc4a8'; ctx.beginPath(); ctx.roundRect(-1.6, -r * 1.25, 3.2, r * 1.5, 1.6); ctx.fill(); EOUT(1);
    ctx.beginPath(); ctx.ellipse(0, -r * 1.22, 2.6, 2, 0, 0, 7); ctx.fill(); EOUT(1); ctx.restore();
  } else if (d.fly) {
    /* 蝙蝠：渐变膜翼 + 骨指 + 红眼 */
    const flap = Math.sin(t * 14 + ex * 0.1);
    for (const sgn of [-1, 1]) {
      const wg = ctx.createLinearGradient(ex, y, ex + sgn * r * 2.2, y - 6);
      wg.addColorStop(0, shade(col === '#fff' ? '#d8c8e8' : col, 0.95)); wg.addColorStop(1, shade(col === '#fff' ? '#d8c8e8' : col, 0.55));
      ctx.fillStyle = wg;
      ctx.beginPath(); ctx.moveTo(ex + sgn * r * 0.45, y - r * 0.2);
      ctx.quadraticCurveTo(ex + sgn * r * 2.3, y - 7 - flap * 7, ex + sgn * r * 1.75, y + 4 - flap * 3);
      ctx.quadraticCurveTo(ex + sgn * r * 1.3, y + 2.5, ex + sgn * r * 1.15, y + 5.5 - flap * 2);
      ctx.quadraticCurveTo(ex + sgn * r * 0.95, y + 2, ex + sgn * r * 0.7, y + 4.5 - flap * 1.5);
      ctx.quadraticCurveTo(ex + sgn * r * 0.6, y + 1.5, ex + sgn * r * 0.45, y + 2);
      ctx.closePath(); ctx.fill(); EOUT(1);
    }
    ctx.fillStyle = egG();
    ctx.beginPath(); ctx.arc(ex, y, r * 0.72, 0, 7); ctx.fill(); EOUT(1.2);
    ctx.fillStyle = shade(col === '#fff' ? col : col, 0.75); /* 尖耳 */
    ctx.beginPath(); ctx.moveTo(ex - r * 0.5, y - r * 0.45); ctx.lineTo(ex - r * 0.32, y - r * 1.15); ctx.lineTo(ex - r * 0.05, y - r * 0.55); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(ex + r * 0.5, y - r * 0.45); ctx.lineTo(ex + r * 0.32, y - r * 1.15); ctx.lineTo(ex + r * 0.05, y - r * 0.55); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ff4a3a'; ctx.beginPath(); ctx.arc(ex - r * 0.22, y - r * 0.12, 1.15, 0, 7); ctx.arc(ex + r * 0.22, y - r * 0.12, 1.15, 0, 7); ctx.fill();
  } else if (e.type === 'shaman') {
    /* 灰袍术士：兜帽 + 弯杖死灵珠 */
    const rg = ctx.createLinearGradient(ex - r, y - r * 1.3, ex + r, y + r);
    rg.addColorStop(0, shade(col === '#fff' ? col : col, 1.32)); rg.addColorStop(1, shade(col === '#fff' ? col : col, 0.58));
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.moveTo(ex - r * 0.4, y - r * 0.55); ctx.lineTo(ex + r * 0.4, y - r * 0.55);
    ctx.quadraticCurveTo(ex + r * 0.95, y + r * 0.4, ex + r * 0.82, y + r * 1.05);
    ctx.quadraticCurveTo(ex + r * 0.4, y + r * 0.82, ex, y + r * 1.05);
    ctx.quadraticCurveTo(ex - r * 0.4, y + r * 0.82, ex - r * 0.82, y + r * 1.05);
    ctx.quadraticCurveTo(ex - r * 0.95, y + r * 0.4, ex - r * 0.4, y - r * 0.55); ctx.closePath(); ctx.fill(); EOUT(1.2);
    ctx.fillStyle = shade(col === '#fff' ? col : col, 1.18); /* 兜帽 */
    ctx.beginPath(); ctx.moveTo(ex - r * 0.62, y - r * 0.5); ctx.quadraticCurveTo(ex - r * 0.68, y - r * 1.35, ex + r * 0.1, y - r * 1.42); ctx.quadraticCurveTo(ex + r * 0.68, y - r * 1.25, ex + r * 0.62, y - r * 0.5);
    ctx.quadraticCurveTo(ex, y - r * 0.28, ex - r * 0.62, y - r * 0.5); ctx.closePath(); ctx.fill(); EOUT(1.1);
    ctx.fillStyle = 'rgba(8,10,16,0.9)';
    ctx.beginPath(); ctx.ellipse(ex, y - r * 0.62, r * 0.4, r * 0.3, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#c89aff';
    ctx.beginPath(); ctx.arc(ex - r * 0.15, y - r * 0.66, 1.2, 0, 7); ctx.arc(ex + r * 0.16, y - r * 0.66, 1.2, 0, 7); ctx.fill();
    ctx.strokeStyle = '#8a6a4a'; ctx.lineWidth = 1.7; /* 弯杖 */
    ctx.beginPath(); ctx.moveTo(ex + r * 0.85, y + r * 1.05); ctx.quadraticCurveTo(ex + r * 0.6, y - r * 0.4, ex + r * 0.95, y - r * 1.3); ctx.stroke();
    const og = ctx.createRadialGradient(ex + r, y - r * 1.5, 0.4, ex + r, y - r * 1.5, r * 0.55);
    og.addColorStop(0, '#fff'); og.addColorStop(0.4, '#c89aff'); og.addColorStop(1, 'rgba(200,130,255,0)');
    ctx.fillStyle = og; ctx.beginPath(); ctx.arc(ex + r, y - r * 1.5, r * 0.55 + Math.sin(t * 4 + ex) * 1, 0, 7); ctx.fill();
  } else if (e.type === 'golem') {
    /* 岩巨：叠石 + 熔芯 + 苔痕 */
    const rc = col === '#fff' ? '#fff' : col;
    ctx.fillStyle = shade(rc, 0.8); /* 腿 */
    ctx.beginPath(); ctx.roundRect(ex - r * 0.7, y + r * 0.3, r * 0.52, r * 0.75, 3); ctx.fill(); EOUT(1.2);
    ctx.beginPath(); ctx.roundRect(ex + r * 0.18, y + r * 0.3, r * 0.52, r * 0.75, 3); ctx.fill(); EOUT(1.2);
    ctx.fillStyle = egG(); /* 躯干巨岩 */
    ctx.beginPath();
    ctx.moveTo(ex - r * 0.82, y + r * 0.45); ctx.lineTo(ex - r * 0.95, y - r * 0.3); ctx.lineTo(ex - r * 0.5, y - r * 0.72);
    ctx.lineTo(ex + r * 0.55, y - r * 0.7); ctx.lineTo(ex + r * 0.98, y - r * 0.18); ctx.lineTo(ex + r * 0.8, y + r * 0.5);
    ctx.closePath(); ctx.fill(); EOUT(1.5);
    ctx.fillStyle = shade(rc, 1.18); /* 拳臂 */
    ctx.beginPath(); ctx.roundRect(ex - r * 1.28, y - r * 0.35, r * 0.5, r * 0.85, 5); ctx.fill(); EOUT(1.2);
    ctx.beginPath(); ctx.roundRect(ex + r * 0.78, y - r * 0.42, r * 0.5, r * 0.85, 5); ctx.fill(); EOUT(1.2);
    ctx.fillStyle = shade(rc, 1.05); /* 方头 */
    ctx.beginPath(); ctx.roundRect(ex - r * 0.42, y - r * 1.22, r * 0.84, r * 0.56, 4); ctx.fill(); EOUT(1.3);
    const pulse = 0.65 + 0.3 * Math.sin(t * 3 + ex);
    ctx.strokeStyle = 'rgba(255,140,55,' + pulse + ')'; ctx.lineWidth = 1.6; /* 熔芯裂纹 */
    ctx.beginPath(); ctx.moveTo(ex - r * 0.5, y - r * 0.5); ctx.lineTo(ex - r * 0.15, y - r * 0.05); ctx.lineTo(ex - r * 0.3, y + r * 0.32);
    ctx.moveTo(ex + r * 0.2, y - r * 0.55); ctx.lineTo(ex + r * 0.38, y + r * 0.05); ctx.stroke();
    ctx.fillStyle = 'rgba(255,170,80,' + (0.75 + 0.2 * Math.sin(t * 3 + ex)) + ')'; /* 核心+眼 */
    ctx.beginPath(); ctx.arc(ex - r * 0.08, y - r * 0.08, 2.6, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(ex - r * 0.2, y - r * 0.95, 1.6, 0, 7); ctx.arc(ex + r * 0.14, y - r * 0.95, 1.6, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(90,140,70,0.5)'; /* 苔痕 */
    ctx.beginPath(); ctx.ellipse(ex - r * 0.45, y - r * 0.6, 3.4, 1.6, 0.4, 0, 7); ctx.ellipse(ex + r * 0.5, y + r * 0.25, 2.8, 1.4, -0.3, 0, 7); ctx.fill();
  } else if (e.type === 'sapper') {
    /* 爆破工程兵：护目镜 + 炸弹背包 + 点燃引信 */
    ctx.fillStyle = egG();
    ctx.beginPath(); ctx.roundRect(ex - r * 0.62, y - r * 0.5, r * 1.24, r * 1.35, 3.5); ctx.fill(); EOUT(1.2); /* 工装 */
    ctx.fillStyle = 'rgba(30,24,16,0.55)'; ctx.fillRect(ex - r * 0.62, y + r * 0.05, r * 1.24, r * 0.22); /* 背带 */
    ctx.fillStyle = shade(col === '#fff' ? col : col, 1.3); /* 头盔 */
    ctx.beginPath(); ctx.arc(ex, y - r * 0.72, r * 0.52, Math.PI, 0); ctx.lineTo(ex + r * 0.52, y - r * 0.62); ctx.lineTo(ex - r * 0.52, y - r * 0.62); ctx.closePath(); ctx.fill(); EOUT(1.1);
    ctx.fillStyle = '#7ad0c8'; /* 护目镜片 */
    ctx.beginPath(); ctx.arc(ex - r * 0.22, y - r * 0.62, r * 0.2, 0, 7); ctx.arc(ex + r * 0.22, y - r * 0.62, r * 0.2, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(12,16,12,0.85)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#2c241e'; /* 炸弹背包 */
    ctx.beginPath(); ctx.arc(ex + r * 0.78, y - r * 0.25, r * 0.42, 0, 7); ctx.fill(); EOUT(1.1);
    const blip = 0.55 + 0.45 * Math.sin(t * 18 + ex);
    ctx.strokeStyle = 'rgba(70,50,30,0.95)'; ctx.lineWidth = 1.5; /* 引信 */
    ctx.beginPath(); ctx.moveTo(ex + r * 0.85, y - r * 0.65); ctx.quadraticCurveTo(ex + r * 1.25, y - r * 1.1, ex + r * 0.95, y - r * 1.35); ctx.stroke();
    ctx.fillStyle = 'rgba(255,215,90,' + blip + ')';
    ctx.beginPath(); ctx.arc(ex + r * 0.95, y - r * 1.4, 2.2 + blip, 0, 7); ctx.fill();
    if (e.boomT > 0) { const bl = e.boomT; ctx.strokeStyle = 'rgba(255,120,50,' + (0.4 + bl * 0.6) + ')'; ctx.lineWidth = 1 + bl * 2; ctx.beginPath(); ctx.arc(ex, y, r + 3 + bl * 4, 0, 7); ctx.stroke(); }
  } else if (e.type === 'drumer') {
    /* 兽鼓手：战纹 + 横挎大鼓 */
    const beat = Math.sin(t * 7 + ex * 0.2);
    ctx.fillStyle = egG();
    ctx.beginPath(); ctx.arc(ex, y - r * 0.35, r * 0.72, 0, 7); ctx.fill(); EOUT(1.2); /* 身 */
    ctx.fillStyle = shade(col === '#fff' ? col : col, 1.15); /* 兽耳 */
    ctx.beginPath(); ctx.moveTo(ex - r * 0.6, y - r * 0.72); ctx.lineTo(ex - r * 0.78, y - r * 1.32); ctx.lineTo(ex - r * 0.18, y - r * 0.95); ctx.closePath(); ctx.fill(); EOUT(1);
    ctx.beginPath(); ctx.moveTo(ex + r * 0.6, y - r * 0.72); ctx.lineTo(ex + r * 0.78, y - r * 1.32); ctx.lineTo(ex + r * 0.18, y - r * 0.95); ctx.closePath(); ctx.fill(); EOUT(1);
    ctx.strokeStyle = '#b0453a'; ctx.lineWidth = 1.6; /* 战纹 */
    ctx.beginPath(); ctx.moveTo(ex - r * 0.45, y - r * 0.5); ctx.lineTo(ex - r * 0.2, y - r * 0.32); ctx.moveTo(ex + r * 0.45, y - r * 0.5); ctx.lineTo(ex + r * 0.2, y - r * 0.32); ctx.stroke();
    ctx.fillStyle = '#ffe27a'; ctx.beginPath(); ctx.arc(ex - r * 0.24, y - r * 0.45, 1.2, 0, 7); ctx.arc(ex + r * 0.24, y - r * 0.45, 1.2, 0, 7); ctx.fill();
    const dg = ctx.createLinearGradient(ex - r * 0.9, y + r * 0.2, ex + r * 0.9, y + r);
    dg.addColorStop(0, '#a87850'); dg.addColorStop(1, '#5f4228');
    ctx.fillStyle = dg; /* 大鼓 */
    ctx.beginPath(); ctx.ellipse(ex, y + r * 0.55, r * 0.88, r * 0.55, 0, 0, 7); ctx.fill(); EOUT(1.3);
    ctx.fillStyle = '#e2d2a8'; ctx.beginPath(); ctx.ellipse(ex, y + r * 0.4, r * 0.88, r * 0.42, 0, 0, 7); ctx.fill(); EOUT(1);
    ctx.strokeStyle = 'rgba(30,22,14,0.6)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(ex - r * 0.8, y + r * 0.32); ctx.lineTo(ex + r * 0.8, y + r * 0.6); ctx.moveTo(ex + r * 0.8, y + r * 0.32); ctx.lineTo(ex - r * 0.8, y + r * 0.6); ctx.stroke();
    ctx.strokeStyle = '#d8c090'; ctx.lineWidth = 1.7; /* 鼓棒 */
    ctx.beginPath(); ctx.moveTo(ex - r * 0.75, y - r * 0.4); ctx.lineTo(ex - r * 0.3, y + r * 0.05 + beat * 2.4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ex + r * 0.75, y - r * 0.4); ctx.lineTo(ex + r * 0.3, y + r * 0.05 - beat * 2.4); ctx.stroke();
    ctx.strokeStyle = 'rgba(220,180,110,' + (0.3 + 0.14 * beat) + ')'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(ex, y, r + 7 + beat * 3, 0, 7); ctx.stroke();
  } else if (e.type === 'wraith') {
    /* 怨魂：多层雾袍 + 空洞眼 + 游丝 */
    const wave = Math.sin(t * 2.4 + ex * 0.1);
    for (let L = 2; L >= 1; L--) {
      ctx.globalAlpha = L === 2 ? 0.24 : 0.72;
      const off = L === 2 ? 2.5 : 0;
      ctx.fillStyle = col === '#fff' ? '#fff' : shade(col, L === 2 ? 1.3 : 1);
      ctx.beginPath(); ctx.arc(ex + off, y - r * 0.3 - off, r * (0.88 - L * 0.1), Math.PI, 0);
      ctx.moveTo(ex - r * 0.88 + off, y - r * 0.3 - off);
      ctx.quadraticCurveTo(ex - r * 0.9 + off, y + r * 0.5, ex - r * 0.6 + off + wave * 2, y + r * 1.1);
      ctx.quadraticCurveTo(ex - r * 0.2 + off, y + r * 0.7, ex + off, y + r * 1.18);
      ctx.quadraticCurveTo(ex + r * 0.3 + off, y + r * 0.72, ex + r * 0.55 + off - wave * 2, y + r * 1.05);
      ctx.quadraticCurveTo(ex + r * 0.85 + off, y + r * 0.45, ex + r * 0.88 + off, y - r * 0.3 - off);
      ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(6,14,20,0.9)';
    ctx.beginPath(); ctx.ellipse(ex, y - r * 0.38, r * 0.52, r * 0.42, 0, 0, 7); ctx.fill(); /* 兜帽阴影 */
    ctx.fillStyle = '#8fe8ff';
    ctx.beginPath(); ctx.arc(ex - r * 0.2, y - r * 0.42, 1.7, 0, 7); ctx.arc(ex + r * 0.22, y - r * 0.42, 1.7, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(160,220,240,0.35)'; ctx.lineWidth = 1; /* 游丝 */
    ctx.beginPath(); ctx.moveTo(ex - r * 0.7, y + r * 0.2); ctx.quadraticCurveTo(ex - r * 1.3, y + wave * 3, ex - r * 1.15, y + r * 0.9);
    ctx.moveTo(ex + r * 0.7, y + r * 0.15); ctx.quadraticCurveTo(ex + r * 1.3, y - wave * 3, ex + r * 1.15, y + r * 0.8); ctx.stroke();
  } else if (e.def.boss) {
    /* 深渊督军：角盔巨甲 + 巨剑 + 披风 */
    const rc = col === '#fff' ? '#fff' : col;
    ctx.fillStyle = shade(rc, 0.62); /* 披风 */
    ctx.beginPath(); ctx.moveTo(ex - r * 0.6, y - r * 0.7);
    ctx.quadraticCurveTo(ex - r * 1.6, y + Math.sin(t * 2) * 2, ex - r * 1.35, y + r * 1.15);
    ctx.lineTo(ex + r * 1.35, y + r * 1.15);
    ctx.quadraticCurveTo(ex + r * 1.6, y - Math.sin(t * 2) * 2, ex + r * 0.6, y - r * 0.7);
    ctx.closePath(); ctx.fill(); EOUT(1.4);
    ctx.fillStyle = egG(); /* 躯甲 */
    ctx.beginPath();
    ctx.moveTo(ex - r * 0.72, y + r); ctx.lineTo(ex - r * 0.9, y - r * 0.2); ctx.quadraticCurveTo(ex - r * 0.95, y - r * 0.75, ex - r * 0.4, y - r * 0.82);
    ctx.lineTo(ex + r * 0.4, y - r * 0.82); ctx.quadraticCurveTo(ex + r * 0.95, y - r * 0.75, ex + r * 0.9, y - r * 0.2); ctx.lineTo(ex + r * 0.72, y + r);
    ctx.closePath(); ctx.fill(); EOUT(1.6);
    ctx.fillStyle = shade(rc, 1.35); /* 大肩甲 */
    for (const s of [-1, 1]) {
      const pg = ctx.createRadialGradient(ex + s * r * 0.72 - 2, y - r * 0.62 - 2, 1, ex + s * r * 0.72, y - r * 0.6, r * 0.42);
      pg.addColorStop(0, shade(rc, 1.55)); pg.addColorStop(1, shade(rc, 0.85));
      ctx.fillStyle = pg;
      ctx.beginPath(); ctx.arc(ex + s * r * 0.72, y - r * 0.58, r * 0.38, Math.PI, 0); ctx.closePath(); ctx.fill(); EOUT(1.3);
    }
    ctx.fillStyle = shade(rc, 0.9); /* 头 + 角盔 */
    ctx.beginPath(); ctx.arc(ex, y - r * 0.95, r * 0.4, 0, 7); ctx.fill(); EOUT(1.3);
    ctx.strokeStyle = '#e0d8c8'; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(ex - r * 0.3, y - r * 1.15); ctx.quadraticCurveTo(ex - r * 0.62, y - r * 1.55, ex - r * 0.38, y - r * 1.75); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ex + r * 0.3, y - r * 1.15); ctx.quadraticCurveTo(ex + r * 0.62, y - r * 1.55, ex + r * 0.38, y - r * 1.75); ctx.stroke();
    ctx.fillStyle = '#ff5a3a'; ctx.beginPath(); ctx.arc(ex - r * 0.14, y - r * 0.95, 1.8, 0, 7); ctx.arc(ex + r * 0.14, y - r * 0.95, 1.8, 0, 7); ctx.fill();
    ctx.fillStyle = GOLD; /* 胸徽 */
    ctx.beginPath(); ctx.moveTo(ex, y - r * 0.5); ctx.lineTo(ex + r * 0.2, y - r * 0.22); ctx.lineTo(ex, y + r * 0.06); ctx.lineTo(ex - r * 0.2, y - r * 0.22); ctx.closePath(); ctx.fill();
    ctx.save(); ctx.translate(ex + r * 0.95, y - r * 0.1); ctx.rotate(0.16); /* 巨剑 */
    const bgd = ctx.createLinearGradient(-2.6, 0, 2.6, 0); bgd.addColorStop(0, '#3a3040'); bgd.addColorStop(0.5, '#8a7a95'); bgd.addColorStop(1, '#2c2430');
    ctx.fillStyle = bgd;
    ctx.beginPath(); ctx.moveTo(0, -r * 2.05); ctx.lineTo(3.4, -r * 1.7); ctx.lineTo(3.4, r * 0.6); ctx.lineTo(-3.4, r * 0.6); ctx.lineTo(-3.4, -r * 1.7); ctx.closePath(); ctx.fill(); EOUT(1.4);
    ctx.fillStyle = GOLD; ctx.fillRect(-6, r * 0.6, 12, 3); ctx.fillRect(-1.7, r * 0.9, 3.4, r * 0.5); ctx.restore();
  } else {
    ctx.fillStyle = egG();
    ctx.beginPath(); ctx.arc(ex, y, r, 0, 7); ctx.fill(); EOUT(1.2);
  }
  if (e.def.boss) {
    const bg3 = ctx.createRadialGradient(e.x, y, e.r * 0.6, e.x, y, e.r * 2.3);
    bg3.addColorStop(0, 'rgba(170,95,230,0.38)'); bg3.addColorStop(1, 'rgba(170,95,230,0)');
    ctx.fillStyle = bg3; ctx.beginPath(); ctx.arc(e.x, y, e.r * 2.3, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffd873';
    for (let i2 = -1; i2 <= 1; i2++) { ctx.beginPath(); ctx.moveTo(e.x + i2 * 7 - 3, y - e.r - 5); ctx.lineTo(e.x + i2 * 7, y - e.r - 12 + Math.abs(i2) * 4); ctx.lineTo(e.x + i2 * 7 + 3, y - e.r - 5); ctx.closePath(); ctx.fill(); }
    ctx.fillRect(e.x - 11, y - e.r - 7, 22, 3);
    ctx.strokeStyle = 'rgba(255,215,115,0.7)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(e.x, y, e.r + 4, game.t * 1.2, game.t * 1.2 + 5); ctx.stroke();
  }
  if (e.def.big || e.elite) { ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(e.x, y, e.r, 0, 7); ctx.stroke(); }
  if (e.elite) {
    ctx.strokeStyle = '#c9a4ff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(e.x, y, e.r + 5, 0, 7); ctx.stroke();
    ctx.strokeStyle = '#ffd873'; ctx.beginPath(); ctx.arc(e.x, y, e.r + 8, game.t * 2, game.t * 2 + 2); ctx.stroke();
    ctx.save(); ctx.translate(e.x, y - e.r - 12); ctx.rotate(Math.PI / 4);
    const xg = ctx.createLinearGradient(-4, -4, 4, 4); xg.addColorStop(0, '#e8d8ff'); xg.addColorStop(1, '#9a6ad8');
    ctx.fillStyle = xg; ctx.fillRect(-3.5, -3.5, 7, 7); ctx.restore();
  }
  if (e.slowT > 0) { ctx.strokeStyle = 'rgba(130,210,255,0.8)'; ctx.beginPath(); ctx.arc(e.x, y, e.r + 3, 0, 7); ctx.stroke(); }
  /* 血条 */
  const w = Math.max(14, e.r * 2.2);
  if (e.hp < e.maxHp) {
    ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(e.x - w / 2 - 1, y - e.r - (e.elite ? 21 : 9), w + 2, 5);
    const hgbg = ctx.createLinearGradient(0, y - e.r - 9, 0, y - e.r - 4);
    hgbg.addColorStop(0, d.big || e.elite ? '#ffc880' : '#ff9a80'); hgbg.addColorStop(1, d.big || e.elite ? '#e08030' : '#e05540');
    ctx.fillStyle = hgbg;
    ctx.fillRect(e.x - w / 2, y - e.r - (e.elite ? 20 : 8), w * clamp(e.hp / e.maxHp, 0, 1), 3);
  }
}
/* 悬停详情 + Boss 血条 + 受击红屏（震屏坐标系外） */
function drawOverlays() {
  if (game.redT > 0) {
    const rg = ctx.createRadialGradient(W / 2, HT / 2, HT * 0.42, W / 2, HT / 2, W * 0.62);
    rg.addColorStop(0, 'rgba(255,40,30,0)'); rg.addColorStop(1, 'rgba(255,40,30,' + (game.redT * 0.4).toFixed(3) + ')');
    ctx.fillStyle = rg; ctx.fillRect(0, 0, W, HT);
  }
  const boss = game.enemies.find(e => !e.dead && e.def.boss);
  if (boss) {
    const bw = 300, bx = (W - bw) / 2;
    ctx.fillStyle = 'rgba(8,12,18,0.82)'; ctx.fillRect(bx - 10, 86, bw + 20, 34);
    ctx.strokeStyle = 'rgba(200,150,255,0.5)'; ctx.strokeRect(bx - 10, 86, bw + 20, 34);
    ctx.fillStyle = '#c9a4ff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('深渊督军', bx, 100);
    ctx.textAlign = 'right'; ctx.fillText(Math.max(0, Math.round(boss.hp)) + ' / ' + Math.round(boss.maxHp), bx + bw, 100);
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx, 106, bw, 7);
    const bg2 = ctx.createLinearGradient(0, 106, 0, 113);
    bg2.addColorStop(0, '#e0a0ff'); bg2.addColorStop(1, '#8a4ac0');
    ctx.fillStyle = bg2; ctx.fillRect(bx, 106, bw * clamp(boss.hp / boss.maxHp, 0, 1), 7);
  }
  if (mouse.on && !game.build && game.state === 'play') {
    const tip = hoverTarget();
    if (tip) {
      const tw = 178, th = tip.lines.length * 16 + 12;
      let tx2 = mouse.x + 18, ty2 = mouse.y + 14;
      if (tx2 + tw > W - 8) tx2 = mouse.x - tw - 14;
      if (ty2 + th > HT - 8) ty2 = HT - th - 8;
      ctx.fillStyle = 'rgba(8,13,20,0.92)'; ctx.fillRect(tx2, ty2, tw, th);
      ctx.strokeStyle = 'rgba(120,160,200,0.4)'; ctx.strokeRect(tx2, ty2, tw, th);
      tip.lines.forEach((ln, i) => {
        ctx.font = i === 0 ? 'bold 13px sans-serif' : '11px sans-serif';
        ctx.fillStyle = i === 0 ? ln.c || '#ffe8b0' : '#cfe3ff'; ctx.textAlign = 'left';
        ctx.fillText(ln.t, tx2 + 10, ty2 + 20 + i * 16);
      });
    }
  }
}
function hoverTarget() {
  for (const u of game.units) {
    if (Math.abs(u.x - mouse.x) < 22 && Math.abs(u.y - mouse.y) < 24) {
      const d = UNITS[u.type], t = u.tier();
      const lines = [{ t: d.name + ' · Lv' + u.level + (u.mastery ? ' ★觉醒' : ''), c: '#ffe8b0' },
        { t: '生命 ' + Math.round(u.hp) + ' / ' + Math.round(u.maxHpNow()) },
        { t: d.heal ? '治疗 ' + Math.round(u.healPow()) + ' / 次' : (u.dps() ? '伤害 ' + Math.round(u.dps()) + (d.splash ? '（溅射）' : '') : '') },
        { t: d.block ? '阻挡 ' + d.block + ' · 射程 ' + d.range : '射程 ' + d.range + ' 格' },
        u.level < 3 ? { t: '升级 ' + t.up + '◈ → ' + (u.level === 2 ? '满级后觉醒' : '下一级伤害 ' + Math.round(d.dps * UPG.dps[u.level])) } : { t: '点击觉醒专精' }];
      return { lines: lines.filter(l => l.t) };
    }
  }
  for (const e of game.enemies) {
    const rr = e.r + 8;
    if (Math.abs(e.x - mouse.x) < rr && Math.abs(e.y - mouse.y) < rr) {
      return { lines: [{ t: e.def.name + (e.elite ? ' · 精英' : '') + (e.def.boss ? ' · BOSS' : ''), c: e.elite || e.def.boss ? '#c9a4ff' : '#ffe8b0' },
        { t: '生命 ' + Math.max(0, Math.round(e.hp)) + ' / ' + Math.round(e.maxHp) },
        { t: '速度 ' + e.def.spd.toFixed(2) + ' · 赏金 ' + e.gold + '◈' },
        { t: '伤害 ' + Math.round(e.dpsNow()) + (e.def.ranged ? '（远程）' : '') + (e.def.fly ? '（飞行）' : '') }] };
    }
  }
  return null;
}
function shiftRed(hex) { return '#a85a4a'; }

/* ============ HUD/DOM ============ */
function syncHud() {
  $('hLives').textContent = game.lives;
  $('hGold').textContent = game.gold;
  $('hWave').textContent = '第 ' + game.wave + ' / ' + (game.endless ? '∞' : TOTAL_WAVES) + ' 波';
  $('hPop').textContent = '⚔ 人口 ' + usedPop().toFixed(1) + '/' + capTotal();
  const bw = $('btnWave');
  if (game.state === 'play' && !game.waveActive && !game.boonMode) { bw.disabled = false; bw.textContent = game.wave === 0 ? '开始防守 ▶' : '下一波 ▶'; }
  else if (game.boonMode) { bw.disabled = true; bw.textContent = '选择祝福…'; }
  else { bw.disabled = true; bw.textContent = game.state === 'play' ? '战斗中…' : '开始防守 ▶'; }
  const u = game.sel;
  const panel = $('selPanel');
  if (u && game.units.includes(u)) {
    panel.classList.remove('hidden');
    $('selName').textContent = UNITS[u.type].name + ' L' + u.level + (u.mastery ? ' ★' + (MASTERY_NAMES[u.type] || ['', ''])[u.mastery - 1] : '');
    $('selHp').textContent = Math.ceil(u.hp) + '/' + Math.round(u.maxHpNow());
    $('selInfo').textContent = UNITS[u.type].desc + (UNITS[u.type].dps ? ' · DPS ' + Math.round(u.dps()) : '');
    const up = $('selUp');
    if (u.level >= 3) {
      up.textContent = u.mastery ? '已觉醒 ★' : '待觉醒 · 点我选择';
      up.disabled = !!u.mastery;
    } else {
      up.textContent = '升级 ' + u.tier().up + ' ◈';
      up.disabled = game.gold < u.tier().up;
    }
    $('selSell').textContent = '遣散 +' + Math.round(u.invested * (game.waveActive ? 0.5 : 0.85));
  } else panel.classList.add('hidden');
  for (const k of Object.keys(SPELLS)) {
    const el = $('sp_' + k);
    if (!el) continue;
    const cd = game.spell[k];
    el.classList.toggle('ready', cd <= 0);
    el.classList.toggle('aiming', game.aimSpell === k);
    el.querySelector('.spCd').textContent = cd > 0 ? Math.ceil(cd) : SPELLS[k].key.toUpperCase();
  }
  refreshCards();
}
function isFortCell(c, r) { return isFort(c, r); }
function refreshCards() {
  const row = $('unitBar');
  for (const k of Object.keys(UNITS)) {
    let card = $('card_' + k);
    if (!card) continue;
    const d = UNITS[k];
    card.classList.toggle('locked', !game.unlocked.has(k));
    card.classList.toggle('sel', game.build === k);
    card.classList.toggle('off', game.gold < Math.round(d.cost * (DIFFS[game.diff].cost || 1)) || usedPop() + d.pop > capTotal());
  }
  void row;
}
function showOv(id) { $(id).classList.remove('hidden'); }
function hideOv(id) { $(id).classList.add('hidden'); }
function hideSel() { $('selPanel').classList.add('hidden'); }
function togglePause(force) {
  if (force === true) game.paused = true;
  else game.paused = !game.paused;
  $('btnPause').textContent = game.paused ? '▶' : '⏸';
}

/* ============ 选择面板事件 ============ */
function select(u) {
  game.sel = u; game.build = null;
  refreshSel(); syncHud();
}
function refreshSel() { syncHud(); }

/* ============ 输入 ============ */
const mouse = { x: 0, y: 0, on: false };
function evPos(ev) {
  const rect = cvs.getBoundingClientRect();
  return [(ev.clientX - rect.left) * (W / rect.width), (ev.clientY - rect.top) * (HT / rect.height)];
}
cvs.addEventListener('mousemove', (ev) => { const [x, y] = evPos(ev); mouse.x = x; mouse.y = y; mouse.on = true; });
cvs.addEventListener('mouseleave', () => { mouse.on = false; });
cvs.addEventListener('click', (ev) => {
  const [x, y] = evPos(ev);
  if (game.aimSpell) { castSpell(game.aimSpell, x, y); syncHud(); return; }
  const [c, r] = cellOf(x, y);
  if (game.build) {
    if (placeTower(c, r, game.build)) { if (!(ev.shiftKey)) game.build = null; }
    syncHud();
    return;
  }
  const u = unitAt(c, r);
  if (u) select(u); else { game.sel = null; hideSel(); }
});
document.addEventListener('keydown', (ev) => {
  const k = ev.key.toLowerCase();
  if (k === 'escape') { game.build = null; game.aimSpell = null; game.sel = null; hideSel(); syncHud(); return; }
  if (game.state !== 'play') return;
  const keys = Object.keys(UNITS);
  const idx = keys.findIndex(t => UNITS[t].key === k);
  if (idx >= 0 && game.unlocked.has(keys[idx])) { game.build = game.build === keys[idx] ? null : keys[idx]; syncHud(); return; }
  if (k === 'q') { game.aimSpell = spellReady('meteor') ? 'meteor' : game.aimSpell; if (game.aimSpell === 'meteor') game.build = null; syncHud(); }
  if (k === 'w') { if (spellReady('blizzard')) castSpell('blizzard'); syncHud(); }
  if (k === 'e') { if (spellReady('holy')) castSpell('holy'); syncHud(); }
  if (k === 'p') togglePause();
  if (k === 'f') cycleSpeed();
  if (game.masteryPending && (k === '1' || k === '2')) { pickMastery(parseInt(k, 10)); return; }
  if (game.masteryPending && k === '3') { const kp = game.keptMastery[game.masteryPending.type]; if (kp) pickMastery(kp); return; }
});
$('selUp').addEventListener('click', () => {
  const s = game.sel; if (!s) return;
  if (s.level >= 3) { if (!s.mastery) { game.paused = true; openMasteryUI(s); } return; }
  upgradeUnit(s);
});
$('selSell').addEventListener('click', () => sellUnit(game.sel));
for (const card of document.querySelectorAll('.unitCard')) {
  card.addEventListener('click', () => {
    const t = card.dataset.unit;
    if (!game.unlocked.has(t)) { toast('波后祝福解锁新单位'); return; }
    game.build = game.build === t ? null : t;
    game.aimSpell = null;
    syncHud();
  });
}
for (const k of Object.keys(SPELLS)) {
  const el = $('sp_' + k);
  if (el) el.addEventListener('click', () => {
    if (!spellReady(k)) return;
    if (k === 'meteor') { game.aimSpell = game.aimSpell === 'meteor' ? null : 'meteor'; game.build = null; }
    else castSpell(k);
    syncHud();
  });
}
$('btnPause').addEventListener('click', () => togglePause());
function cycleSpeed() {
  game.speed = game.speed >= 3 ? 1 : game.speed + 1;
  $('btnSpeed').textContent = game.speed + '×▶';
  toast(game.speed === 1 ? '正常速度' : game.speed + ' 倍速推进中');
}
$('btnSpeed').addEventListener('click', cycleSpeed);
$('btnWave').addEventListener('click', () => { if (!game.waveActive) nextWave(); });

/* ============ 开局/流程 ============ */
function spellCdMul() { return 1 - Math.min(0.5, (game.boonPicks && game.boonPicks.cd || 0) * 0.12 + 0.15 * (SAVE.arm.c || 0)); }
function startRun(diff, ch, daily) {
  game.diff = diff;
  game.speed = 1;
  game.ch = ch || 0;
  if (Q.get('armmax')) { SAVE.raw.arm = { g: 3, p: 2, c: 2, a: 3 }; }
  game.map = MAPS[game.ch];
  game.daily = !!daily;
  if (daily) { const ds = new Date(); _rs = ds.getFullYear() * 10000 + (ds.getMonth() + 1) * 100 + ds.getDate(); }
  renderBg();
  const D = DIFFS[diff];
  game.state = 'play'; game.t = 0; game.paused = false;
  game.lives = D.lives; game.gold = 210 + 150 * (SAVE.arm.g || 0) + 60 * game.ch; game.wave = 0; game.waveActive = false;
  game.spawnQueue = []; game.units = []; game.enemies = []; game.shots = []; game.texts = []; game.fx = [];
  game.pop = 0; game.popBonus = SAVE.arm.p || 0; game.fundDmg = 0; game.fundPop = 0;
  game.unlocked = new Set(game.ch > 0 ? ['sword', 'pike', 'arch', 'xbow', 'drum'] : ['sword', 'pike', 'arch']);
  game.sel = null; game.build = null; game.aimSpell = null;
  game.stats = { kills: 0, leaks: 0, spent: 0 };
  game.keptMastery = {}; game.combo = 0; game.comboBest = 0; game.bonusDmg = 0;
  game.masteryPending = null; game.spell = { meteor: 0, blizzard: 0, holy: 0 };
  game.boonMode = null; game.boonPicks = {}; game.boons = 0;
  game.waveMod = null; game.bloodMoon = false; game.lastBMwave = -3;
  game.over = false; game.endless = false; game.banner = null;
  hideOv('ovTitle'); hideOv('ovEnd');
  buildUnitBar();
  syncHud();
}
function buildUnitBar() {
  const row = $('unitBar'); row.innerHTML = '';
  for (const k of Object.keys(UNITS)) {
    const d = UNITS[k];
    const div = document.createElement('div');
    div.className = 'unitCard'; div.id = 'card_' + k; div.dataset.unit = k;
    div.innerHTML = '<div class="ucIcon" style="background:' + d.color + '"></div><b>' + d.name + '</b><span class="ucCost">' + Math.round(d.cost * (DIFFS[game.diff].cost || 1)) + ' ◈ · 口' + d.pop + '</span><span class="ucKey">' + d.key + '</span>';
    div.title = d.desc;
    div.addEventListener('click', () => {
      if (!game.unlocked.has(k)) { toast('波后祝福解锁'); return; }
      game.build = game.build === k ? null : k; game.aimSpell = null; syncHud();
    });
    row.appendChild(div);
  }
}

/* ============ 解锁表：随波解锁 ============ */
function checkUnlock() {
  const want = { 2: 'mage', 4: 'holy', 7: 'cannon' };
  const t = want[game.wave];
  if (t && !game.unlocked.has(t) && !game.waveActive && game.state === 'play') {
    game.unlocked.add(t);
    toast('新单位解锁：' + UNITS[t].name + '（' + UNITS[t].desc + '）');
    SFX.ding();
  }
}

/* ============ 主 tick ============ */
let lastT = 0, hudT = 0;
function loop(ts) {
  if (SIM_N > 0) return;
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (ts - lastT) / 1000); lastT = ts;
  if (game.state === 'play' && !game.paused && !game.boonMode) {
    for (let i = 0; i < game.speed; i++) step(dt);
    hudT -= dt;
    if (hudT <= 0) { hudT = 0.25; checkUnlock(); syncHud(); }
  }
  draw();
}

/* ============ SIM ============ */
let DBG_snap0 = null, DBG_u0 = null, DBG_t = 0;
const _step0 = step;
step = function (dt) {
  _step0(dt);
  DBG_t += dt;
  if (Q.get('dbg') === '1' && DBG_snap0 === null && game.enemies.length && game.units.length && DBG_t > 13) {
    const e = game.enemies[0];
    let nb = null, nd = 1e9;
    for (const u of game.units) { const dd = hyp(u.x - e.x, u.y - e.y); if (dd < nd) { nd = dd; nb = u; } }
    DBG_snap0 = { e: { x: Math.round(e.x), y: Math.round(e.y), hp: Math.round(e.hp), blk: !!e.blocker, fly: !!e.def.fly }, nb: nb && { t: nb.type, d: Math.round(nd), hp: Math.round(nb.hp), cd: +(nb.cd || 0).toFixed(2), r: UNITS[nb.type].range }, units: game.units.map(u => u.type + '@' + u.c + ',' + u.r + ':' + Math.round(u.hp)) };
    DBG_u0 = { shots: game.shots.length, t: Math.round(DBG_t) };
  }
};
/* 截图模式：同步快进到第 ws 波混战中交还 rAF 渲染 */
function shotRun(ws) {
  const SL = [[11, 4], [11, 6], [11, 3], [11, 7], [11, 2], [10, 5], [11, 5], [10, 3]];
  const RS = [[8, 5], [8, 4], [8, 6], [7, 5], [6, 4], [8, 3]];
  startRun('normal', +Q.get('ch') || 0);
  game.gold = 600;
  let guard = 0;
  while (guard++ < 60 * 60 * 4) {
    step(1 / 60);
    checkUnlock();
    if (game.masteryPending) { pickMastery(1); game.paused = false; hideOv('ovMastery'); game.masteryPending = null; }
    if (spellReady('meteor') && game.enemies.length) { const t2 = game.enemies.slice().sort((a, b) => b.hp - a.hp)[0]; castSpell('meteor', t2.x, t2.y); }
    if (spellReady('blizzard') && game.enemies.length > 6) castSpell('blizzard');
    if (game.boonMode) { if (game.boonMode.length) { applyBoon(pickRank()); game.boonMode = null; hideOv('ovBoon'); } continue; }
    if (game.state !== 'play') break;
    const walls = game.units.filter(u => UNITS[u.type].block && !u.dead).length;
    if (SL.length && walls < 8 && game.gold >= 46) { const s = SL[0]; if (canPlace(s[0], s[1], 'sword')) { SL.shift(); placeTower(s[0], s[1], 'sword'); } else SL.shift(); }
    else if (RS.length && game.wave >= 2 && game.gold >= 70) { const s = RS[0]; const tt = game.wave >= 4 ? 'mage' : 'arch'; if (usedPop() + UNITS[tt].pop > capTotal()) { RS.shift(); } else if (canPlace(s[0], s[1], tt)) { RS.shift(); placeTower(s[0], s[1], tt); } else RS.shift(); }
    else if (game.gold > 120) { const pool = game.units.filter(u => u.level < 3).sort((a, b) => a.level - b.level); if (pool.length && game.gold >= pool[0].tier().up) upgradeUnit(pool[0]); }
    if (!game.waveActive) { game.waitT = (game.waitT || 0) + 1 / 60; if (game.waitT > 2) { game.waitT = 0; nextWave(); } }
    if (game.wave >= ws && game.waveActive && game.enemies.length > 5) break;
    if (Q.get('spawn') && !game.__spDone && game.waveActive && game.enemies.length > 2) {
      game.__spDone = 1;
      const m = Math.pow(1.19, game.wave - 1);
      game.enemies.push(new Enemy(Q.get('spawn'), m, false));
    }
  }
}
function runSim(n) {
  /* 王座环绕式布阵（对 3 张图通用）：阻挡环 dist 2.6~4.6 格、其余为远程池 */
  const BLOCK_SLOTS = [], RANGED_SLOTS = [];
  { const thr = THR(), cs = [];
    for (let r = 0; r < ROWS; r++) for (let c = 4; c < COLS; c++) {
      if (isRock(c, r)) continue;
      const dd = Math.hypot(c - thr.c, r - thr.r);
      if (dd >= 2.4 && dd <= 3.9) BLOCK_SLOTS.push([c, r]);
      else if (dd < 8.5) cs.push([c, r]);
    }
    BLOCK_SLOTS.sort((a, b) => Math.abs(Math.hypot(a[0] - thr.c, a[1] - thr.r) - 2.9) - Math.abs(Math.hypot(b[0] - thr.c, b[1] - thr.r) - 2.9) || a[1] - b[1]);
    cs.sort((a, b) => Math.hypot(a[0] - thr.c, a[1] - thr.r) - Math.hypot(b[0] - thr.c, b[1] - thr.r));
    for (const x of cs) RANGED_SLOTS.push(x); }
  const FORT_ORDER = FORTL().slice().sort((a, b) => Math.abs(b[1] - THR().r) - Math.abs(a[1] - THR().r));
  let bi = 0, ri = 0, fbi = 0, placeCd = 0;
  const rankPool = DUMB ? ['sword'] : ['sword', 'sword', 'arch', 'xbow', 'mage', 'mage', 'pike', 'holy', 'cannon', 'drum'];
  const QUOTA = { sword: 5, pike: 2, arch: 3, xbow: 2, mage: 1, holy: 2, cannon: 1, drum: 1 };
  for (let i = 0; i < n; i++) {
    step(1 / 60);
    placeCd -= 1 / 60;
    checkUnlock();
    if (game.state === 'play' && !game.boonMode) {
      if (placeCd <= 0) {
        let placed = false;
        const cnt = {}; for (const u of game.units) if (!u.dead) cnt[u.type] = (cnt[u.type] || 0) + 1;
        const avail = rankPool.filter(t => game.unlocked.has(t) && (cnt[t] || 0) < (DUMB ? 99 : (QUOTA[t] || 2)));
        const costOf = t => Math.round(UNITS[t].cost * (DIFFS[game.diff].cost || 1));
        const pool2 = avail.filter(t => costOf(t) <= game.gold);
        let order = [];
        if (pool2.length) {
          pool2.sort((a, b) => costOf(a) - costOf(b));
          const cheapest = costOf(pool2[0]);
          const big = pool2.filter(t => costOf(t) >= cheapest * 1.8);
          const cheap = pool2.filter(t => costOf(t) < cheapest * 1.8);
          const hasRanged = game.units.filter(u => !UNITS[u.type].block && u.type !== 'holy' && u.type !== 'drum').length;
          order = (game.gold > 160 || hasRanged < 2) ? cheap.concat(big) : cheap;
          order.sort((a, b) => ((QUOTA[b] || 2) - (cnt[b] || 0)) - ((QUOTA[a] || 2) - (cnt[a] || 0)) || costOf(a) - costOf(b));
          if (game.enemies.some(e2 => e2.def.physRes) && (cnt.mage || 0) < 2 && order.includes('mage')) order = ['mage'].concat(order.filter(t => t !== 'mage'));
          if (game.enemies.filter(e2 => e2.def.aura).length && (cnt.mage || 0) < 1 && order.includes('mage')) order = ['mage'].concat(order.filter(t => t !== 'mage'));
        } else order = avail.slice();
        for (const t of order) {
          const d = UNITS[t];
          const cost = costOf(t);
          if (!game.unlocked.has(t) || game.gold < cost) continue;
          if (usedPop() + d.pop > capTotal()) continue;
          if (d.fort) {
            let okf = false;
            while (fbi < FORT_ORDER.length && !okf) { const [c, r] = FORT_ORDER[fbi]; fbi++; if (canPlace(c, r, t)) { okf = placed = placeTower(c, r, t); } }
            if (placed) break;
          } else {
            const list = d.block ? BLOCK_SLOTS : RANGED_SLOTS;
            let idx = d.block ? bi : ri;
            while (idx < list.length) {
              const [c, r] = list[idx]; idx++;
              if (isFort(c, r)) continue;
              if (!canPlace(c, r, t)) continue;
              if (placeTower(c, r, t)) { placed = true; if (d.block) bi = idx; else ri = idx; }
              break;
            }
            if (placed) break;
          }
        }
        placeCd = 0.5;
      }
      if (!game.waveActive) {
        let upg = true;
        while (upg) {
          upg = false;
          const pool = game.units.filter(u => u.level < 3).sort((a, b) => a.level - b.level);
          const nr = game.units.filter(u => !UNITS[u.type].block && u.type !== 'holy' && u.type !== 'drum' && !u.dead).length;
          for (const u of pool) {
            if (nr < 2 && usedPop() + 1.0 > capTotal() - 1) break;
            if (game.gold >= u.tier().up && upgradeUnit(u)) { upg = true; break; }
          }
        }
        if (game.wave >= 8 && game.gold > 2600) fundTry(game.gold > 6000 ? 'pop' : 'dmg', 2500);
        game.waitT = (game.waitT || 0) + 1 / 60;
        const swordCost = Math.round(UNITS.sword.cost * (DIFFS[game.diff].cost || 1));
        const wallHave = game.units.filter(u => UNITS[u.type].block && !u.dead).length;
        const wallWant = Math.min(8, 3 + game.wave);
        const needWall = wallHave < wallWant && game.gold >= swordCost && usedPop() < capTotal();
        const wantBuild = game.gold >= swordCost && usedPop() < capTotal();
        const wantUpg = game.units.some(u => u.level < 3 && game.gold >= u.tier().up);
        const upgUrgent = game.wave < 12 && wantUpg && game.gold < 900;
        if ((!needWall && !wantBuild && !upgUrgent) || game.waitT > (needWall ? 10 : 6)) { game.waitT = 0; placeCd = 0; nextWave(); }
      }
      /* 技能 */
      if (spellReady('meteor') && game.enemies.length > 3) {
        const fly = game.enemies.filter(x => x.def.fly);
        const e = fly.length ? fly[0] : game.enemies[Math.floor(game.enemies.length / 2)];
        if (e) castSpell('meteor', e.x, e.y);
      }
      if (spellReady('blizzard') && game.enemies.length > 9) castSpell('blizzard');
      if (spellReady('holy') && game.units.some(u => u.hp < u.maxHpNow() * 0.5)) castSpell('holy');
    }
    if (game.boonMode) { applyBoon(pickRank()); }
    if (game.state !== 'play') break;
    window.__lastop = 'simframe ' + i + ' w' + game.wave;
    if (DBG_hook && DBG_t > 13) { DBG_hook(); DBG_hook = null; }
    if (Q.get('dbg') === '4' && game.units.length >= 4 && !DBG_trace) {
      const wall = game.units.filter(u => UNITS[u.type].block && !u.dead).sort((a, b) => a.r - b.r);
      const near = [];
      for (const e of game.enemies) { let d = 999; for (const u of game.units) d = Math.min(d, hyp(u.x - e.x, u.y - e.y)); near.push(e.type + ':' + e.c.toFixed(1) + ',' + e.r.toFixed(1) + (e.blocker ? '(H)' : '') + ' d' + Math.round(d / 42 * 10) / 10); }
      DBG_trace = { wv: game.wave, wall: wall.map(u => u.type[0] + u.r + ':' + Math.round(u.hp) + '/' + Math.round(u.maxHpNow()) + 'H' + (u.__held || 0)), en: near.join(' '), dead: game.units.filter(u => u.dead).length, lives: game.lives, t: Math.round(DBG_t) };
    }
  }
  return game.state;
}
let DBG_hook = null, DBG_trace = null;
function pickRank() {
  const rank = { dmg: 0, pop: 1, gold: 2, life: 3, air: 4, cd: 5 };
  const b = game.boonMode.slice().sort((x, y) => (rank[x.id] ?? 9) - (rank[y.id] ?? 9))[0];
  return b.id;
}

function renderArmory() {
  const box = $('armCards'); if (!box) return;
  $('armMedals').textContent = '🏅 ' + SAVE.medals;
  box.innerHTML = '';
  for (const k of Object.keys(ARMORY)) {
    const a = ARMORY[k];
    const n = SAVE.arm[k] || 0;
    const cost = SAVE.armCost(k);
    const card = document.createElement('div');
    card.className = 'boonCard armCard' + (cost && SAVE.medals >= cost ? '' : ' off');
    card.innerHTML = '<b>' + a.name + '<span style="float:right;color:var(--ok);font-size:13px">Lv' + n + ' / ' + a.max + '</span></b><div>' + a.desc + '</div>' +
      (cost ? '<div class="amCost' + (SAVE.medals >= cost ? '' : ' poor') + '">🏅 ' + cost + '</div>' : '<div class="amMax">已 满 级</div>');
    if (cost && SAVE.medals >= cost) {
      card.addEventListener('click', () => { if (SAVE.buyArm(k)) { SFX.ding(); renderArmory(); } });
    }
    box.appendChild(card);
  }
}

/* ============ 启动 ============ */
function boot() {
  renderBg();
  requestAnimationFrame(loop);
  $('btnStart').addEventListener('click', () => startRun(curDiff, curCh));
  let curDiff = 'normal', curCh = 0;
  const chBtns = $('chBtns');
  if (chBtns) {
    chBtns.innerHTML = '';
    MAPS.forEach((m, i) => {
      const b = document.createElement('button');
      const ok = SAVE.raw.chOk[i];
      b.className = 'diffBtn' + (i === 0 ? ' on' : '');
      b.style.maxWidth = '200px';
      b.innerHTML = ok ? ('第' + '一二三'[i] + '章 · ' + m.name) : ('🔒 ' + m.name);
      if (!ok) b.style.opacity = 0.45;
      b.addEventListener('click', () => {
        if (!SAVE.raw.chOk[i]) { toast('通关上一章解锁'); return; }
        curCh = i;
        for (const x of chBtns.children) x.classList.remove('on');
        b.classList.add('on');
      });
      chBtns.appendChild(b);
    });
  }
  const openArm = () => {
    renderArmory();
    showOv('ovArm');
  };
  $('btnArmory') && $('btnArmory').addEventListener('click', openArm);
  $('btnArmBack') && $('btnArmBack').addEventListener('click', () => hideOv('ovArm'));
  $('btnDaily') && $('btnDaily').addEventListener('click', () => { hideOv('ovArm'); startRun('hard', 0, true); toast('每日突袭 · 勋章 ×2'); });
  $('btnNextCh') && $('btnNextCh').addEventListener('click', () => { hideOv('ovEnd'); startRun(game.diff, Math.min(2, game.ch + 1)); });
  renderArmory();
  if (Q.get('arm')) setTimeout(() => { try { $('btnArmory').click(); } catch (e) {} }, 0);
  const btns = $('diffBtns');
  for (const d of ['normal', 'hard', 'night']) {
    const b = document.createElement('button');
    b.className = 'diffBtn' + (d === 'normal' ? ' on' : '');
    const D = DIFFS[d];
    b.textContent = D.name + ' · ' + D.lives + ' 命 · 人口 ' + D.cap + (d !== 'normal' ? '（敌血 ×' + D.hp + '）' : '');
    b.addEventListener('click', () => {
      curDiff = d;
      for (const x of btns.children) x.classList.remove('on');
      b.classList.add('on');
    });
    btns.appendChild(b);
  }
  $('btnEndAgain').addEventListener('click', () => { hideOv('ovEnd'); startRun(game.diff, game.ch); });
  $('btnEndTitle').addEventListener('click', () => { hideOv('ovEnd'); showOv('ovTitle'); game.state = 'title'; });
  $('mstCardRow') && void 0;
  document.querySelectorAll('.mstCard').forEach((cd) => cd.addEventListener('click', () => pickMastery(parseInt(cd.dataset.m, 10))));
  $('btnMute').addEventListener('click', () => { muted = !muted; store.put('mute', muted); $('btnMute').textContent = muted ? '🔇' : '🔊'; });
  $('btnMute').textContent = muted ? '🔇' : '🔊';
}
if (SIM_N > 0) {
  boot();
  window.__lastop = 'booted';
  startRun(SIM_DIFF, +Q.get('ch') || 0);
  window.__lastop = 'runStarted';
  if (Q.get('dbg') === '2') {
    DBG_hook = () => {
      const u = game.units.find(x => x.type === 'arch') || game.units[0]; const e = game.enemies[0];
      if (!u || !e) { DBG_trace = { no: 1, u: !!u, e: !!e, wave: game.wave }; return; }
      const d = Math.round(hyp(u.x - e.x, u.y - e.y));
      const before = e.hp;
      u.update(0.05);
      DBG_trace = { d, uCd: +(u.cd).toFixed(2), uType: u.type, rangePx: Math.round(UNITS[u.type].range * 40), ehp: Math.round(e.hp) + '/' + Math.round(before), alive: e.hp > 0 && !e.dead, etype: e.type, fly: !!e.def.fly, held: u.__held, units: game.units.map(x => x.type + ':' + Math.round(x.hp)).join(','), wave: game.wave, t: Math.round(DBG_t) };
    };
  }
  let st = null;
  try { st = runSim(SIM_N); } catch (e) { document.title = 'CRASH@' + (window.__lastop || '?') + ' ' + e.message + ' | ' + String(e.stack || '').split('\n')[1]; }
  window.__simFin = 1;
  try {
  if (Q.get('dbg') === '2' || Q.get('dbg') === '4') {
    document.title = 'DBG2 ' + JSON.stringify(DBG_trace || 'none');
  } else if (Q.get('dbg') === '1') {
    const e0 = DBG_snap0;
    document.title = 'DBG ' + JSON.stringify({ e0, u0: DBG_u0, kills: game.stats.kills });
  } else document.title = 'SIM ' + JSON.stringify({ wave: game.wave, lives: game.lives, state: game.state === 'win' ? 'win' : (game.over ? 'over' : 'play'), kills: game.stats.kills, units: game.units.length, gold: game.gold, pop: +usedPop().toFixed(1), cap: capTotal(), lb: game.leaksBy }) + ' BM:' + game.lastBMwave;
  } catch (e2) { document.title = 'TITLEERR ' + e2.message; }
} else if (UI_TEST) {
  try {
  boot();
  const R = [];
  const key = (k) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k }));
  const clk = (x, y) => cvs.dispatchEvent(new MouseEvent('click', { clientX: x * cvs.getBoundingClientRect().width / W + cvs.getBoundingClientRect().left, clientY: y * cvs.getBoundingClientRect().height / HT + cvs.getBoundingClientRect().top, bubbles: true }));
  startRun('normal');
  R.push(['play', game.state === 'play']);
  game.gold = 500; key('1');
  clk(gx(10), gy(6));
  R.push(['place', game.units.length === 1, 'pop', Math.abs(usedPop() - 1) < 0.01]);
  game.gold = 999;
  const u0 = game.units[0]; select(u0);
  $('selUp').click();
  R.push(['upg', u0.level === 2]);
  R.push(['upgPop', Math.abs(usedPop() - 1.5) < 0.01]);
  game.wave = 7; key('q');
  R.push(['aim', game.aimSpell === 'meteor']);
  clk(gx(20), gy(7));
  R.push(['meteor', game.spell.meteor > 0]);
  game.enemies.push(new Enemy('goblin', 1, 0));
  const e0 = game.enemies[game.enemies.length - 1];
  e0.x = u0.x + 20; e0.y = u0.y;
  const hpBefore = u0.hp;
  e0.blocker = u0; e0.atkCd = 0; e0.update(0.05);
  R.push(['block_dmg', u0.hp < hpBefore]);
  select(u0);
  $('selSell').click();
  R.push(['sell', game.units.length === 0]);
  /* ---- 2.0 新系统 ---- */
  startRun('normal', 1);
  R.push(['ch2map', game.map === MAPS[1] && game.unlocked.has('xbow')]);
  { const sp0 = new Enemy('sapper', 1, 0); game.enemies.push(sp0);
    placeTower(8, 4, 'sword'); const su = game.units[game.units.length - 1];
    sp0.x = su.x + 30; sp0.y = su.y;
    const uhp = su.hp;
    for (let i = 0; i < 90; i++) sp0.update(0.02);
    R.push(['boom', su.hp < uhp || su.dead]); }
  startRun('normal', 0); game.gold = 999; game.unlocked.add('xbow');
  placeTower(8, 4, 'xbow'); const xu = game.units[game.units.length - 1];
  { const es = []; for (let i = 0; i < 3; i++) { const e2 = new Enemy('goblin', 0.1, 0); e2.x = xu.x + 60 + i * 20; e2.y = xu.y; game.enemies.push(e2); es.push(e2); }
    xu.cd = 0; xu.update(0.05);
    R.push(['pierce', es[1].hp < es[1].maxHp && es[2].hp < es[2].maxHp]); }
  { const wr = new Enemy('wraith', 1, 0); const whp = wr.hp; wr.damage(100, false);
    R.push(['physres', whp - wr.hp < 60]); }
  { SAVE.raw.medals = 999; const okr = SAVE.buyArm('g'); const lv = SAVE.arm.g; SAVE.raw.arm = {}; SAVE.raw.medals = 0; SAVE.flush();
    R.push(['armory', okr === true && lv === 1]); }
  startRun('normal');
  const bad = R.filter(x => x[1] === false).map(x => x[0]);
  document.title = (bad.length ? 'UI FAIL: ' + bad.join(',') : 'UI PASS ' + R.length) + ' ' + JSON.stringify(R.map(x => [x[0], x[1]]));
  } catch (e) { document.title = 'UITEST ERR ' + e.message + ' | ' + String(e.stack || '').split('\n')[1]; }
} else {
  boot();
  if (Q.get('shot')) {
    shotRun(Math.max(1, Math.min(15, +Q.get('shot') || 3)));
    document.title = 'SHOT ok w' + game.wave + ' en' + game.enemies.length + ' q' + game.spawnQueue.length + ' act' + (game.waveActive ? 1 : 0) + ' st' + game.state + ' pa' + (game.paused ? 1 : 0) + ' wT' + Math.round(game.waitT || 0) + ' bo' + !!game.boonMode;
  } else if (Q.get('auto') === '1') {
    startRun('normal');
    placeTower(11, 5, 'sword'); placeTower(11, 4, 'sword'); placeTower(11, 6, 'sword'); placeTower(11, 3, 'pike');
    placeTower(9, 5, 'arch'); placeTower(9, 4, 'arch');
    nextWave();
    let bt = 0; const bi = setInterval(() => { bt += 1; if (bt % 90 === 0 && game.gold >= 70) { if (canPlace(8, 6, 'arch')) placeTower(8, 6, 'arch'); else if (canPlace(8, 3, 'mage')) placeTower(8, 3, 'mage'); } if (!game.waveActive && game.state === 'play' && bt % 60 === 0) nextWave(); if (bt > 900) clearInterval(bi); }, 1000 / 60);
  }
}
