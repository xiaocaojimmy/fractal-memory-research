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
  mage:  { name: '法师', cost: 130, pop: 2, hp: 40, dps: 26, range: 3.4, block: 0, splash: 1.1, color: '#7a6ab8', key: '4', desc: '群体溅射' },
  holy:  { name: '牧师', cost: 100, pop: 1, hp: 40, dps: 0, heal: 16, range: 2.6, block: 0, color: '#c9b45a', key: '5', desc: '治疗残血友军' },
  cannon:{ name: '炮台', cost: 190, pop: 3, hp: 70, dps: 70, range: 5.5, block: 0, reload: 3.2, fort: true, color: '#5a6a7a', key: '6', desc: '要塞基座 · 重炮慢填' },
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
};
const FORTS = [[9, 2], [9, 7], [15, 2], [15, 7], [21, 3], [21, 6]];
const THRONE = { c: 1.2, r: 4.5 };
const SPAWN_X = 29.2;

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
  banner: null, over: false, endless: false, chapterLeaks: 0,
};
const TOTAL_WAVES = 15;
function capTotal() { return (DIFFS[game.diff].cap || 10) + game.popBonus + game.fundPop + (game.endless ? Math.floor(Math.max(0, game.wave - TOTAL_WAVES) / 5) : 0); }
function usedPop() { let s = 0; for (const u of game.units) s += uPopCost(u); return s; }
function uPopCost(u) { return UNITS[u.type].pop + (u.level - 1) * 0.5 + (u.mastery ? 0.5 : 0); }

/* ============ 工具：文本/特效 ============ */
function addText(x, y, s, color, size, vy) { game.texts.push({ x, y, s, color: color || '#fff', size: size || 12, vy: vy || -30, t: 0, life: 1.1 }); }
function fxRing(x, y, color, r0, life, w) { game.fx.push({ x, y, color, r0, w: w || 3, t: 0, life }); }
let toastMsg = null, toastT = 0;
function toast(s) { toastMsg = s; toastT = 2.6; }

/* ============ 坐标 ============ */
const gx = (c) => c * TILE + TILE / 2, gy = (r) => r * TILE + TILE / 2 + 82;
const cellOf = (x, y) => [Math.floor((x - 0) / TILE), Math.floor((y - 82) / TILE)];

/* ============ 波次 ============ */
function wavePlan(n) {
  const hpMul = Math.pow(1.11, n - 1);
  const q = []; let at = 0;
  const add = (type, k, gap) => { for (let i = 0; i < k; i++) { q.push({ type, at }); at += gap; } };
  if (n === 1) add('goblin', 5, 1.1);
  else if (n === 2) add('goblin', 6, 0.9);
  else if (n === 3) { add('wolf', 3, 1.2); add('goblin', 5, 0.8); }
  else if (n === 4) { add('orc', 2, 1.6); add('goblin', 5, 0.7); }
  else if (n === 5) { add('bat', 3, 0.9); add('wolf', 4, 0.8); }
  else if (n === 6) { add('orc', 4, 1.3); add('shaman', 3, 1.4); add('goblin', 5, 0.6); }
  else if (n === 7) { add('wolf', 7, 0.6); add('bat', 4, 0.8); }
  else if (n === 8) { add('orc', 4, 1.2); add('shaman', 3, 1.2); add('goblin', 7, 0.5); }
  else if (n === 9) { add('golem', 1, 0); add('bat', 6, 0.7); add('wolf', 5, 0.6); }
  else if (n === 10) { add('orc', 6, 1); add('shaman', 5, 1); add('goblin', 8, 0.5); }
  else if (n === 11) { add('golem', 1, 0); add('orc', 5, 0.9); add('wolf', 5, 0.5); }
  else if (n === 12) { add('bat', 7, 0.55); add('shaman', 5, 0.9); add('orc', 4, 0.9); }
  else if (n === 13) { add('golem', 2, 3); add('wolf', 7, 0.5); add('goblin', 7, 0.5); }
  else if (n === 14) { add('orc', 7, 0.8); add('shaman', 6, 0.8); add('bat', 6, 0.6); add('golem', 1, 0); }
  else { add('golem', 2, 2.6); add('orc', 7, 0.7); add('shaman', 5, 0.8); add('wolf', 7, 0.45); add('bat', 6, 0.5); }
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
  let q = wavePlan(Math.min(game.wave, 15 + (game.endless ? game.wave - TOTAL_WAVES : 0)));
  if (game.endless) { const m = 1 + (game.wave - TOTAL_WAVES) * 0.14; for (const e of q) e.hpMul *= m; }
  /* 精英：w6 起每 3 波 */
  if (game.wave >= 6 && game.wave % 3 === 0 && q.length) {
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
  constructor(type, hpMul, elite) {
    const d = ENEMIES[type];
    this.type = type; this.def = d; this.elite = !!elite;
    const D = DIFFS[game.diff];
    this.maxHp = d.hp * hpMul * D.hp * (this.elite ? 2.6 : 1);
    this.hp = this.maxHp;
    this.spd = d.spd * (game.waveMod === 'swift' ? 1.3 : 1) * (this.elite ? 1.05 : 1);
    this.armor = (game.waveMod === 'iron' ? 6 : 0) + (this.elite ? 8 : 0);
    this.dmgMul = (game.bloodMoon ? 1.5 : 1) * (game.waveMod === 'tough' ? 1 : 1) * (this.elite ? 1.6 : 1);
    this.gold = Math.round(d.gold * (this.elite ? 6 : 1) * (1 + game.combo * 0.012));
    this.x = SPAWN_X * TILE + TILE / 2;
    this.y = gy(this.elite ? 4.5 + RR(-0.8, 0.8) : RR(1.2, 8.6));
    this.r = d.r * (this.elite ? 1.25 : 1);
    this.blocker = null; this.atkCd = 0; this.dead = false; this.slowT = 0;
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
          const dd = hyp(u.x - this.x, u.y - this.y) + (u.__held || 0) * 26;
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
    let tx = gx(THRONE.c), ty = gy(THRONE.r);
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
    if (dd < TILE * 1.2) { this.dead = true; this.hp = 0; leak(this); }
  }
  dpsNow() { return this.def.dps * (DIFFS[game.diff].hp * 0.4 + 0.6) * this.dmgMul; }
  damage(raw) {
    const d = Math.max(raw * 0.15, raw - this.armor);
    this.hp -= d; this.hpFlash = 0.08;
    if (this.hp <= 0) die(this);
  }
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
  SFX.leak();
  addText(gx(THRONE.c), gy(THRONE.r) - 30, '-1 王座', '#ff6a5a', 15, -34);
  fxRing(gx(THRONE.c), gy(THRONE.r), 'rgba(255,90,70,', 60, 0.5, 4);
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
  dps() { let v = this.tier().dps * (1 + game.bonusDmg + 0.05 * game.fundDmg) * boonMul(this.type); if (this.mastery === 1) v *= 1.35; if (this.mastery === 2) v *= 0.85; return v; }
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
    let dmg = this.dps() * (d.reload || 1) / 1;
    if (this.type === 'pike') { for (const e of [best]) if (e.def.charge) dmg *= 1.5; }
    if (this.mastery === 1) dmg /= 1; /* 已在 dps() 乘过 */
    game.shots.push({ x: this.x, y: this.y, tx: best.x, ty: best.y, t: 0, life: 0.12, color: this.type === 'mage' ? '#b08aff' : this.type === 'cannon' ? '#ffb060' : '#ffe8a0', big: this.type === 'cannon' });
    SFX.hit();
    hitUnit(this, best, dmg);
    if (d.splash) {
      const sr = d.splash * TILE * (this.mastery === 1 ? 1.3 : 1);
      for (const e of game.enemies) { if (e !== best && !e.dead && e.hp > 0 && hyp(e.x - best.x, e.y - best.y) < sr) hitUnit(this, e, dmg * 0.55); }
      fxRing(best.x, best.y, 'rgba(170,130,255,', sr, 0.25, 2);
    }
  }
}
function hitUnit(u, e, dmg) {
  const before = e.hp;
  e.damage(dmg);
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
  game.spell[k] = SPELLS[k].cd;
  SFX.spell();
  if (k === 'meteor') {
    const R = 2.4 * TILE;
    for (const e of game.enemies) { if (e.dead) continue; const dd = hyp(e.x - x, e.y - y); if (dd < R) e.damage((420 + game.wave * 55) * (1 - dd / R / 1.6) * (1 + game.bonusDmg)); }
    fxRing(x, y, 'rgba(255,140,60,', R, 0.5, 5); fxRing(x, y, 'rgba(255,220,120,', R * 0.5, 0.35, 8);
  } else if (k === 'blizzard') {
    for (const e of game.enemies) if (!e.dead) e.slowT = 4;
    fxRing(gx(15), gy(7), 'rgba(120,200,255,', 900, 0.6, 3);
  } else if (k === 'holy') {
    for (const u of game.units) { u.hp = Math.min(u.maxHpNow(), u.hp + u.maxHpNow() * 0.5); }
    fxRing(gx(THRONE.c), gy(THRONE.r), 'rgba(255,230,130,', 800, 0.6, 4);
  }
  game.aimSpell = null;
  return true;
}
function fxLine(x1, y1, x2, y2, color) { game.fx.push({ line: true, x1, y1, x2, y2, color, t: 0, life: 0.12 }); }

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
function isFort(c, r) { return FORTS.some(f => f[0] === c && f[1] === r); }
function canPlace(c, r, type) {
  if (c < 4 || c >= COLS || r < 1 || r >= ROWS - 1) return false;
  if (unitAt(c, r)) return false;
  if (UNITS[type].fort && !isFort(c, r)) return false;
  if (isFort(c, r) && UNITS[type].block) return false;
  const d = Math.min(Math.abs(c - THRONE.c), Math.abs(c - (THRONE.c + 28))); void d;
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
function winRun() {
  game.state = 'win'; game.over = true;
  store.put('best.' + game.diff, Math.max(store.get('best.' + game.diff, 0), game.wave));
  showEnd(true);
}
function loseRun() {
  if (game.state !== 'play') return;
  game.state = 'over'; game.over = true; game.lives = 0;
  store.put('best.' + game.diff, Math.max(store.get('best.' + game.diff, 0), game.wave - 1));
  showEnd(false);
}
function showEnd(win) {
  $('endTitle').textContent = win ? '王 座 守 住 了' : '王 座 陷 落';
  $('endTitle').style.color = win ? '#8fdc7a' : '#ff7a6a';
  $('endSub').textContent = '第 ' + game.wave + ' 波 · 击杀 ' + game.stats.kills + ' · 漏怪 ' + game.stats.leaks + ' · 最佳连杀 ' + game.comboBest;
  showOv('ovEnd');
}

/* ============ 主循环 ============ */
function step(dt) {
  game.t += dt;
  for (const k of Object.keys(game.spell)) {
    const cdMul = 1 - Math.min(0.5, (game.boonPicks.cd || 0) * 0.12);
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
      game.enemies.push(new Enemy(q.type, q.hpMul, q.elite));
    }
  }
  for (const u of game.units) u.update(dt);
  for (const e of game.enemies) e.update(dt);
  game.enemies = game.enemies.filter(e => !e.dead && e.hp > 0);
  /* 波次结束 */
  if (game.waveActive && !game.spawnQueue.length && !game.enemies.length) endWave();
  /* 特效 */
  for (const s of game.shots) s.t += dt;
  game.shots = game.shots.filter(s => s.t < s.life);
  for (const f of game.fx) f.t += dt;
  game.fx = game.fx.filter(f => f.t < f.life);
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
  b.fillStyle = '#2a3428'; b.fillRect(0, 0, W, HT);
  for (let i = 0; i < 900; i++) {
    const x = (i * 137.3) % W, y = (i * 311.7) % HT;
    b.fillStyle = 'rgba(255,255,255,0.02)'; b.fillRect(x, y, 2, 2);
  }
  /* 空地网格（可建区） */
  for (let r = 1; r < ROWS - 1; r++) for (let c = 4; c < COLS; c++) {
    b.strokeStyle = 'rgba(160,200,160,0.05)';
    b.strokeRect(c * TILE + 2, gy(r) - TILE / 2 + 2, TILE - 4, TILE - 4);
  }
  /* 右侧敌区染色 */
  b.fillStyle = 'rgba(120,60,60,0.08)'; b.fillRect(27 * TILE, 82, W - 27 * TILE, HT - 82);
}
function draw() {
  ctx.clearRect(0, 0, cvs.width, cvs.height);
  ctx.drawImage(bg, 0, 0);
  /* 王座 */
  const tx = gx(THRONE.c), ty = gy(THRONE.r);
  ctx.save();
  ctx.fillStyle = 'rgba(120,160,255,0.12)';
  ctx.beginPath(); ctx.arc(tx, ty, 70 + Math.sin(game.t * 2) * 4, 0, 7); ctx.fill();
  ctx.fillStyle = '#3d5570'; ctx.fillRect(tx - 26, ty - 34, 52, 60);
  ctx.fillStyle = '#8fd0ff'; ctx.beginPath();
  ctx.moveTo(tx, ty - 52); ctx.lineTo(tx + 18, ty - 20); ctx.lineTo(tx - 18, ty - 20); ctx.closePath(); ctx.fill();
  ctx.restore();
  /* 要塞基座 */
  for (const [c, r] of FORTS) {
    ctx.strokeStyle = isFortPlaced(c, r) ? 'rgba(120,160,200,0.25)' : 'rgba(255,215,115,0.5)';
    ctx.setLineDash([5, 5]); ctx.lineWidth = 1.5;
    ctx.strokeRect(c * TILE + 4, gy(r) - TILE / 2 + 4, TILE - 8, TILE - 8);
    ctx.setLineDash([]);
    if (!isFortPlaced(c, r)) { ctx.fillStyle = 'rgba(255,215,115,0.35)'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('要塞', c * TILE + TILE / 2, gy(r) + 3); }
  }
  /* 单位 */
  for (const u of game.units) drawUnit(u);
  /* 敌人 */
  for (const e of game.enemies) drawEnemy(e);
  /* 弹道/特效 */
  for (const s of game.shots) {
    ctx.strokeStyle = s.color; ctx.lineWidth = s.big ? 3 : 1.5;
    ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.tx, s.ty); ctx.stroke();
  }
  for (const f of game.fx) {
    const p = f.t / f.life;
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
}
function isFortPlaced(c, r) { return unitAt(c, r) !== undefined; }
function drawUnit(u) {
  const d = UNITS[u.type];
  const x = u.x, y = u.y;
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(x, y + 12, 12, 4, 0, 0, 7); ctx.fill();
  if (d.block) {
    /* 阻挡单位画成方盾，视觉连成墙 */
    ctx.fillStyle = d.color;
    ctx.beginPath();
    ctx.moveTo(x - 17, y - 18); ctx.lineTo(x + 17, y - 18); ctx.lineTo(x + 17, y + 8);
    ctx.lineTo(x, y + 19); ctx.lineTo(x - 17, y + 8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillRect(x - 17, y - 18, 34, 6);
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(x - 2, y - 12, 4, 22);
  } else {
    ctx.fillStyle = d.color;
    ctx.fillRect(x - 10, y - 14, 20, 26);
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(x - 10, y - 14, 20, 6);
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
}
function drawEnemy(e) {
  const d = e.def;
  const y = e.y + (d.fly ? Math.sin(game.t * 6 + e.x * 0.05) * 4 - 14 : 0);
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; if (!d.fly) { ctx.beginPath(); ctx.ellipse(e.x, y + e.r * 0.9, e.r * 0.8, e.r * 0.3, 0, 0, 7); ctx.fill(); }
  ctx.fillStyle = e.hpFlash > 0 ? '#ffffff' : (game.bloodMoon ? shiftRed(d.color) : d.color);
  ctx.beginPath(); ctx.arc(e.x, y, e.r, 0, 7); ctx.fill();
  if (e.elite) {
    ctx.strokeStyle = '#c9a4ff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(e.x, y, e.r + 5, 0, 7); ctx.stroke();
    ctx.strokeStyle = '#ffd873'; ctx.beginPath(); ctx.arc(e.x, y, e.r + 8, game.t * 2, game.t * 2 + 2); ctx.stroke();
    ctx.save(); ctx.translate(e.x, y - e.r - 12); ctx.rotate(Math.PI / 4); ctx.fillStyle = '#c9a4ff'; ctx.fillRect(-3.5, -3.5, 7, 7); ctx.restore();
  }
  if (e.slowT > 0) { ctx.strokeStyle = 'rgba(130,210,255,0.8)'; ctx.beginPath(); ctx.arc(e.x, y, e.r + 3, 0, 7); ctx.stroke(); }
  /* 血条 */
  const w = Math.max(14, e.r * 2.2);
  if (e.hp < e.maxHp) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(e.x - w / 2, y - e.r - (e.elite ? 20 : 8), w, 3);
    ctx.fillStyle = d.big || e.elite ? '#ffb060' : '#ff7a6a';
    ctx.fillRect(e.x - w / 2, y - e.r - (e.elite ? 20 : 8), w * clamp(e.hp / e.maxHp, 0, 1), 3);
  }
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
$('btnWave').addEventListener('click', () => { if (!game.waveActive) nextWave(); });

/* ============ 开局/流程 ============ */
function startRun(diff) {
  game.diff = diff;
  game.speed = 1;
  const D = DIFFS[diff];
  game.state = 'play'; game.t = 0; game.paused = false;
  game.lives = D.lives; game.gold = 210; game.wave = 0; game.waveActive = false;
  game.spawnQueue = []; game.units = []; game.enemies = []; game.shots = []; game.texts = []; game.fx = [];
  game.pop = 0; game.popBonus = 0; game.fundDmg = 0; game.fundPop = 0;
  game.unlocked = new Set(['sword', 'pike', 'arch']);
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
function runSim(n) {
  /* 阻挡双列：中路优先向外展开；远程：要塞+后排散布 */
  const BLOCK_SLOTS = [];
  { const spread = [4, 6, 3, 7, 2, 8, 5, 1, 9, 0];
    for (const r of spread) BLOCK_SLOTS.push([11, r]);
    for (const r of spread) BLOCK_SLOTS.push([10, r]); }
  const RANGED_SLOTS = [];
  for (const c of [8, 7, 6]) for (const r of [5, 4, 6, 3, 7, 2, 8, 1]) RANGED_SLOTS.push([c, r]);
  const FORT_ORDER = FORTS.slice().sort((a, b) => Math.abs(a[1] - 5) - Math.abs(b[1] - 5));
  let bi = 0, ri = 0, fbi = 0, placeCd = 0;
  const rankPool = DUMB ? ['sword'] : ['sword', 'sword', 'arch', 'mage', 'mage', 'pike', 'holy', 'cannon'];
  const QUOTA = { sword: 5, pike: 2, arch: 3, mage: 1, holy: 2, cannon: 1 };
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
          const hasRanged = game.units.filter(u => !UNITS[u.type].block && u.type !== 'holy').length;
          order = (game.gold > 160 || hasRanged < 2) ? cheap.concat(big) : cheap;
          order.sort((a, b) => ((QUOTA[b] || 2) - (cnt[b] || 0)) - ((QUOTA[a] || 2) - (cnt[a] || 0)) || costOf(a) - costOf(b));
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
          const nr = game.units.filter(u => !UNITS[u.type].block && u.type !== 'holy' && !u.dead).length;
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

/* ============ 启动 ============ */
function boot() {
  renderBg();
  requestAnimationFrame(loop);
  $('btnStart').addEventListener('click', () => startRun(curDiff));
  let curDiff = 'normal';
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
  $('btnEndAgain').addEventListener('click', () => { hideOv('ovEnd'); startRun(game.diff); });
  $('btnEndTitle').addEventListener('click', () => { hideOv('ovEnd'); showOv('ovTitle'); game.state = 'title'; });
  $('mstCardRow') && void 0;
  document.querySelectorAll('.mstCard').forEach((cd) => cd.addEventListener('click', () => pickMastery(parseInt(cd.dataset.m, 10))));
  $('btnMute').addEventListener('click', () => { muted = !muted; store.put('mute', muted); $('btnMute').textContent = muted ? '🔇' : '🔊'; });
  $('btnMute').textContent = muted ? '🔇' : '🔊';
}
if (SIM_N > 0) {
  boot();
  window.__lastop = 'booted';
  startRun(SIM_DIFF);
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
  const bad = R.filter(x => x[1] === false).map(x => x[0]);
  document.title = (bad.length ? 'UI FAIL: ' + bad.join(',') : 'UI PASS ' + R.length) + ' ' + JSON.stringify(R.map(x => [x[0], x[1]]));
  } catch (e) { document.title = 'UITEST ERR ' + e.message + ' | ' + String(e.stack || '').split('\n')[1]; }
} else {
  boot();
  if (Q.get('auto') === '1') {
    startRun('normal');
    placeTower(11, 5, 'sword'); placeTower(11, 4, 'sword'); placeTower(11, 6, 'sword'); placeTower(11, 3, 'pike');
    placeTower(9, 5, 'arch'); placeTower(9, 4, 'arch');
    nextWave();
    let bt = 0; const bi = setInterval(() => { bt += 1; if (bt % 90 === 0 && game.gold >= 70) { if (canPlace(8, 6, 'arch')) placeTower(8, 6, 'arch'); else if (canPlace(8, 3, 'mage')) placeTower(8, 3, 'mage'); } if (!game.waveActive && game.state === 'play' && bt % 60 === 0) nextWave(); if (bt > 900) clearInterval(bi); }, 1000 / 60);
  }
}
