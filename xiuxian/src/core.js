/* ============================================================
 * 《问道长生》 core.js —— 纯逻辑层（无 DOM，可在 Node 中测试）
 * 浏览器以经典 <script> 加载，挂到 globalThis.XCore；
 * Node 下通过 module.exports 导出。
 * ============================================================ */
(function (global) {
'use strict';

/* ---------------- RNG（可序列化） ---------------- */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeRng(seed) {
  const r = mulberry32(seed);
  return {
    f: r,
    next() { return r(); },
    int(a, b) { return a + Math.floor(r() * (b - a + 1)); },
    chance(p) { return r() < p; },
    pick(arr) { return arr[Math.floor(r() * arr.length)]; },
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      return a;
    }
  };
}

/* ---------------- 静态数据 ---------------- */

// 境界表（展平为 stage 序列）
const REALMS = [
  { name: '炼气', stages: 9, suffix: ['一层','二层','三层','四层','五层','六层','七层','八层','九层'] },
  { name: '筑基', stages: 3, suffix: ['初期','中期','后期'] },
  { name: '金丹', stages: 3, suffix: ['初期','中期','后期'] },
  { name: '元婴', stages: 3, suffix: ['初期','中期','后期'] },
  { name: '化神', stages: 3, suffix: ['初期','中期','后期'] },
  { name: '炼虚', stages: 3, suffix: ['初期','中期','后期'] },
  { name: '合体', stages: 3, suffix: ['初期','中期','后期'] },
  { name: '大乘', stages: 3, suffix: ['初期','中期','后期'] },
  { name: '渡劫', stages: 3, suffix: ['初期','中期','后期'] },
];
const STAGES = [];
(function buildStages() {
  let idx = 0;
  REALMS.forEach((r, ri) => {
    for (let s = 0; s < r.stages; s++) {
      STAGES.push({
        idx,
        realmIdx: ri,
        realm: r.name,
        suffix: r.suffix[s],
        full: r.name + (ri === 0 ? r.suffix[s] : r.suffix[s]),
        need: Math.round(80 * Math.pow(1.32, idx) * (1 + idx * 0.12)),
        lifespan: [120, 300, 800, 2000, 5000, 12000, 30000, 80000, 200000][ri],
        // 渡劫边界：进入筑基起每个大境界的第一层（以及最终飞升）
        trib: null,
      });
      idx++;
    }
  });
  const tribSet = new Set([9, 12, 15, 18, 21, 24, 27, 30, 33]); // 33 = 渡劫后期→飞升
  tribSet.forEach(t => { if (STAGES[t]) STAGES[t].trib = t; });
})();
const FINAL_STAGE = STAGES.length; // 34 = 飞升（超出即成仙）

const SPIRIT_ROOTS = [
  { id: 'hetero', name: '杂灵根', desc: '五行驳杂，修行迟缓', mult: 0.8, weight: 50, luck: 0 },
  { id: 'double', name: '双灵根', desc: '金木兼修，中规中矩', mult: 1.15, weight: 28, luck: 1 },
  { id: 'terra',  name: '天灵根', desc: '厚土独厚，一日千里', mult: 1.6, weight: 15, luck: 2 },
  { id: 'chaos',  name: '混沌灵根', desc: '万古罕见，直证大道', mult: 2.3, weight: 7, luck: 3 },
];

// 物品
const ITEMS = {
  // 灵草
  qingming: { id: 'qingming', name: '青冥草', type: 'herb', tier: 1, price: 8, desc: '一阶灵草，聚气炼丹常用' },
  seven:    { id: 'seven',    name: '七叶一星花', type: 'herb', tier: 2, price: 22, desc: '二阶灵草，筑基要药' },
  blood:    { id: 'blood',    name: '血灵芝', type: 'herb', tier: 3, price: 55, desc: '三阶灵草，药力雄浑' },
  // 妖丹
  core1: { id: 'core1', name: '一阶妖丹', type: 'core', tier: 1, price: 15, desc: '低阶妖兽内丹' },
  core2: { id: 'core2', name: '二阶妖丹', type: 'core', tier: 2, price: 40, desc: '中阶妖兽内丹' },
  core3: { id: 'core3', name: '三阶妖丹', type: 'core', tier: 3, price: 95, desc: '高阶妖兽内丹' },
  core4: { id: 'core4', name: '四阶妖丹', type: 'core', tier: 4, price: 220, desc: '通灵妖丹，蕴含剑意' },
  // 丹药
  huxin:  { id: 'huxin',  name: '护心散', type: 'pill', price: 30, desc: '恢复六成气血', use: 'heal', power: 0.6 },
  juqi:   { id: 'juqi',   name: '聚气丹', type: 'pill', price: 60, desc: '立得修为（当前境界四成）', use: 'exp', power: 0.4 },
  zhujiP: { id: 'zhujiP', name: '筑基丹', type: 'pill', price: 150, desc: '下次突破成功率 +15%', use: 'breakBoost', power: 0.15 },
  muye:   { id: 'muye',   name: '沐液丹', type: 'pill', price: 90, desc: '恢复八成灵力', use: 'mana', power: 0.8 },
  pojing: { id: 'pojing', name: '破境丹', type: 'pill', price: 320, desc: '下次突破成功率 +35%', use: 'breakBoost', power: 0.35 },
  xisui:  { id: 'xisui',  name: '洗髓丹', type: 'pill', price: 0,  desc: '永久提升 3% 修炼速度（限 10 枚）', use: 'permaCult', power: 0.03 },
  // 功法卷
  scrollAzure: { id: 'scrollAzure', name: '功法·青龙剑气', type: 'scroll', skill: 'azure', price: 260, desc: '三段扇形剑气' },
  scrollFlame: { id: 'scrollFlame', name: '功法·烈焰焚天掌', type: 'scroll', skill: 'flame', price: 680, desc: '爆裂火掌，附带灼烧' },
  scrollVoid:  { id: 'scrollVoid',  name: '功法·裂空剑意', type: 'scroll', skill: 'voidc', price: 1800, desc: '贯穿万物的剑光' },
  bodyGold:    { id: 'bodyGold',    name: '体术·金钟罩', type: 'scroll', body: 'gold', price: 520, desc: '受击伤害减免 20%' },
  stepShadow:  { id: 'stepShadow',  name: '身法·缩地成寸', type: 'scroll', body: 'shadow', price: 460, desc: '残影步冷却减半' },
};

// 功法（攻击术）
const SKILLS = {
  basic: { id: 'basic', name: '基础剑术', mult: 1.0, mp: 4, cd: 0.42, speed: 460, proj: 1, spread: 0, range: 520, color: '#cfe8ff', desc: '御使飞剑，修士入门' },
  azure: { id: 'azure', name: '青龙剑气', mult: 0.72, mp: 9, cd: 0.62, speed: 480, proj: 3, spread: 0.24, range: 500, color: '#7fd4ff', desc: '剑气三分，如青龙出海' },
  flame: { id: 'flame', name: '烈焰焚天掌', mult: 1.35, mp: 16, cd: 0.85, speed: 380, proj: 1, spread: 0, range: 420, color: '#ff9d4d', burn: 0.35, burnDur: 2.5, desc: '火掌爆裂，灼烧敌手' },
  voidc: { id: 'voidc', name: '裂空剑意', mult: 2.1, mp: 26, cd: 1.05, speed: 760, proj: 1, spread: 0, range: 720, pierce: 4, color: '#e2c9ff', desc: '剑光如线，穿透一切' },
};

// 丹方
const RECIPES = {
  huxin:  { out: 'huxin',  need: { qingming: 2 }, cost: 0, known0: true },
  juqi:   { out: 'juqi',   need: { qingming: 3, core1: 1 }, cost: 0, known0: true },
  zhujiP: { out: 'zhujiP', need: { seven: 2, core2: 1 }, cost: 120 },
  muye:   { out: 'muye',   need: { blood: 2, core3: 1 }, cost: 200 },
  pojing: { out: 'pojing', need: { blood: 3, core3: 2 }, cost: 420 },
  xisui:  { out: 'xisui',  need: { seven: 2, blood: 2, core4: 1 }, cost: 650 },
};

// 敌人
const ENEMY_KINDS = {
  wolf:   { name: '妖狼',     hp: 60,  atk: 9,  spd: 96,  r: 12, exp: 26, style: 'chase' },
  snake:  { name: '竹叶青',   hp: 46,  atk: 11, spd: 74,  r: 10, exp: 30, style: 'ranged', shot: { spd: 260, dmg: 1.0, cd: 2.2 } },
  bear:   { name: '搬山熊',   hp: 150, atk: 18, spd: 84,  r: 16, exp: 90, style: 'chase' },
  ape:    { name: '岩猿',     hp: 118, atk: 15, spd: 104, r: 13, exp: 76, style: 'chase' },
  python: { name: '魔蟒',     hp: 240, atk: 27, spd: 88,  r: 15, exp: 190, style: 'chase' },
  toad:   { name: '腐血妖蟾', hp: 190, atk: 22, spd: 62,  r: 14, exp: 165, style: 'ranged', shot: { spd: 220, dmg: 1.1, cd: 2.6 } },
  wraith: { name: '剑冢怨灵', hp: 260, atk: 40, spd: 110, r: 12, exp: 380, style: 'chase' },
  // Boss
  wolfking: { name: '青目狼王', hp: 420, atk: 20, spd: 108, r: 20, exp: 320, style: 'boss', boss: true },
  pythong:  { name: '三眼魔蟒', hp: 1200, atk: 44, spd: 92, r: 22, exp: 950, style: 'boss', boss: true },
  swordsoul:{ name: '残剑剑灵', hp: 1400, atk: 78, spd: 118, r: 20, exp: 2600, style: 'boss', boss: true },
};

// 地图
const MAP_DEFS = {
  village: {
    name: '青云村', w: 72, h: 52, kind: 'village', safe: true, gate: null, bg: '#274b2c',
    herb: 'qingming', herbCount: 6, mobs: [], boss: null,
    exits: [ { x: 69, y: 26, to: 'bamboo', tx: 4, ty: 30, label: '竹林小径 · 往迷雾竹林' },
             { x: 69, y: 27, to: 'bamboo', tx: 4, ty: 30, label: '竹林小径 · 往迷雾竹林' } ],
  },
  bamboo: {
    name: '迷雾竹林', w: 88, h: 64, kind: 'forest', gate: null, bg: '#1d3a26',
    herb: 'qingming', herbCount: 12,
    mobs: [ ['wolf', 8], ['snake', 5] ], boss: 'wolfking',
    mobLvl: [1, 3], core: 'core1',
    exits: [ { x: 2, y: 30, to: 'village', tx: 67, ty: 26, label: '返回青云村' },
             { x: 3, y: 30, to: 'village', tx: 67, ty: 27, label: '返回青云村' },
             { x: 44, y: 2, to: 'mount', tx: 44, ty: 55, label: '山道 · 往万兽山脉' },
             { x: 45, y: 2, to: 'mount', tx: 44, ty: 55, label: '山道 · 往万兽山脉' } ],
  },
  mount: {
    name: '万兽山脉', w: 92, h: 68, kind: 'mount', gate: { stage: 9, label: '需筑基境界' }, bg: '#2c3323',
    herb: 'seven', herbCount: 12,
    mobs: [ ['bear', 6], ['ape', 6] ], boss: 'pythong',
    mobLvl: [4, 6], core: 'core2',
    exits: [ { x: 44, y: 65, to: 'bamboo', tx: 44, ty: 4, label: '下山 · 返回迷雾竹林' },
             { x: 45, y: 65, to: 'bamboo', tx: 45, ty: 4, label: '下山 · 返回迷雾竹林' },
             { x: 46, y: 2, to: 'marsh', tx: 8, ty: 50, label: '瘴气谷 · 往幽冥沼泽' },
             { x: 47, y: 2, to: 'marsh', tx: 8, ty: 50, label: '瘴气谷 · 往幽冥沼泽' },
             { x: 78, y: 34, to: '__realm', label: '上古仙人遗迹（需金丹）' } ],
  },
  marsh: {
    name: '幽冥沼泽', w: 88, h: 64, kind: 'marsh', gate: { stage: 12, label: '需金丹境界' }, bg: '#20302e',
    herb: 'blood', herbCount: 10,
    mobs: [ ['python', 6], ['toad', 5] ], boss: null,
    mobLvl: [7, 9], core: 'core3',
    exits: [ { x: 8, y: 52, to: 'mount', tx: 46, ty: 4, label: '返回万兽山脉' },
             { x: 8, y: 53, to: 'mount', tx: 46, ty: 4, label: '返回万兽山脉' } ],
  },
  realm: {
    name: '上古仙人遗迹', w: 64, h: 48, kind: 'ruins', safe: false, gate: { stage: 12, label: '需金丹境界' }, bg: '#232438',
    herb: null, herbCount: 0,
    mobs: [ ['wraith', 9] ], boss: 'swordsoul',
    mobLvl: [8, 10], core: 'core4',
    timeLimit: 150,
    exits: [ { x: 32, y: 45, to: 'mount', tx: 78, ty: 35, label: '离开遗迹' },
             { x: 33, y: 45, to: 'mount', tx: 78, ty: 35, label: '离开遗迹' } ],
  },
};

// 天劫阶段配置（按渡劫序号）
function tribConfig(tribIdx, k) {
  // tribIdx: 9..33; k: 0..8 第几次天劫
  return {
    count: 6 + k * 2,                    // 落雷次数
    volley: 1 + Math.floor(k / 3),       // 每波道数
    dmgFrac: 0.13 + k * 0.02,            // 每雷伤害占气血上限比
    warnMs: Math.max(900 - k * 60, 520), // 预警时间
    radius: 52 + k * 3,
    surviveMs: 14000 + k * 1500,         // 需坚持时长
  };
}

/* ---------------- 状态构造 ---------------- */

function rollSpiritRoot(rng) {
  const total = SPIRIT_ROOTS.reduce((s, r) => s + r.weight, 0);
  let x = rng.next() * total;
  for (const r of SPIRIT_ROOTS) { x -= r.weight; if (x <= 0) return r.id; }
  return 'hetero';
}

function newGame(seed, rootId) {
  seed = seed >>> 0;
  const rng = makeRng(seed ^ 0x9e3779b9);
  if (!rootId) rootId = rollSpiritRoot(rng);
  const root = SPIRIT_ROOTS.find(r => r.id === rootId) || SPIRIT_ROOTS[0];
  const s = {
    v: 1,
    seed,
    rngS: (seed ^ 0x51ce) >>> 0,
    createdAt: Date.now(),
    player: {
      name: '无名散修',
      root: root.id,
      stage: 0,           // 境界 stage idx
      exp: 0,
      hp: 100, hpMax: 100,
      mp: 50, mpMax: 50,
      x: 0, y: 0, map: 'village',
      permCult: 0,        // 洗髓丹层数
      permCultUsed: 0,
      gold: 30,
      skills: ['basic'], skill: 'basic',
      body: {},           // gold/shadow 已学体术
      pills: {},          // 物品栏（丹药/材料统一 inventory）
      inv: {},
      breakBoost: 0,      // 丹药增益（下次突破）
      breakFail: 0,       // 突破失败积累的道行加成
      kills: 0, pillsMade: 0, deaths: 0, playSec: 0,
      tribDone: 0,        // 已渡天劫次数
      alive: true,
    },
    furnaceLvl: 0,
    knownRecipes: Object.keys(RECIPES).filter(k => RECIPES[k].known0),
    flags: { intro: false },
    log: [],
    finished: false,
  };
  recalc(s);
  s.player.hp = s.player.hpMax;
  s.player.mp = s.player.mpMax;
  addItem(s, 'qingming', 2);
  return s;
}

/* ---------------- 派生数值 ---------------- */

function stageInfo(stage) { return stage < STAGES.length ? STAGES[stage] : STAGES[STAGES.length - 1]; }
function stageName(stage) { return stage >= STAGES.length ? '真仙' : STAGES[stage].full; }
function needExp(stage) { return stage < STAGES.length ? STAGES[stage].need : Infinity; }

function recalc(s) {
  const p = s.player;
  const t = p.stage;
  const hpMax = Math.round(100 * Math.pow(1.34, t) * (p.body.gold ? 1.25 : 1));
  const mpMax = Math.round(50 * Math.pow(1.30, t) * 1.25);
  const ratio = p.hpMax > 0 ? p.hp / p.hpMax : 1;
  const mratio = p.mpMax > 0 ? p.mp / p.mpMax : 1;
  p.hpMax = hpMax; p.mpMax = mpMax;
  p.hp = Math.max(1, Math.round(hpMax * Math.min(ratio, 1)));
  p.mp = Math.round(mpMax * Math.min(mratio, 1));
}
function playerAtk(s) {
  const p = s.player;
  return Math.round(13 * Math.pow(1.42, p.stage));
}
function spiritRoot(s) { return SPIRIT_ROOTS.find(r => r.id === s.player.root); }
function cultSpeed(s) {
  const p = s.player; const t = p.stage;
  const base = 2.2 * Math.pow(1.32, t) * (1 + t * 0.03);
  return base * spiritRoot(s).mult * (1 + p.permCult);
}

/* ---------------- 物品 / 背包 ---------------- */

function addItem(s, id, n) {
  if (n <= 0) return;
  const p = s.player;
  p.inv[id] = (p.inv[id] || 0) + n;
}
function removeItem(s, id, n) {
  const p = s.player;
  if ((p.inv[id] || 0) < n) return false;
  p.inv[id] -= n;
  if (p.inv[id] <= 0) delete p.inv[id];
  return true;
}
function countItem(s, id) { return s.player.inv[id] || 0; }

function useItem(s, id, ev) {
  const item = ITEMS[id];
  const p = s.player;
  if (!item || countItem(s, id) <= 0) return { ok: false, msg: '没有此物' };
  if (item.use === 'heal') {
    if (p.hp >= p.hpMax) return { ok: false, msg: '气血完好，无须服用' };
    removeItem(s, id, 1);
    p.hp = Math.min(p.hpMax, Math.round(p.hp + p.hpMax * item.power));
    pushLog(s, '服下' + item.name + '，气血恢复。');
    return { ok: true, msg: item.name + '：气血 +' + Math.round(p.hpMax * item.power), fx: 'heal' };
  }
  if (item.use === 'mana') {
    if (p.mp >= p.mpMax) return { ok: false, msg: '灵力充盈' };
    removeItem(s, id, 1);
    p.mp = Math.min(p.mpMax, Math.round(p.mp + p.mpMax * item.power));
    pushLog(s, '服下' + item.name + '，灵力沛然。');
    return { ok: true, msg: item.name + '：灵力 +' + Math.round(p.mpMax * item.power), fx: 'mana' };
  }
  if (item.use === 'exp') {
    const gain = Math.round(needExp(p.stage) * item.power);
    if (p.exp >= needExp(p.stage)) return { ok: false, msg: '修为圆满，宜先行突破' };
    removeItem(s, id, 1);
    gainExp(s, gain, '丹力');
    pushLog(s, '服下' + item.name + '，' + item.desc + '。');
    return { ok: true, msg: item.name + '：修为 +' + gain, fx: 'exp' };
  }
  if (item.use === 'breakBoost') {
    removeItem(s, id, 1);
    p.breakBoost = Math.max(p.breakBoost, item.power);
    pushLog(s, '服下' + item.name + '，静待突破时机。');
    return { ok: true, msg: item.name + '：下次突破成功率 +' + Math.round(item.power * 100) + '%', fx: 'aura' };
  }
  if (item.use === 'permaCult') {
    if (p.permCultUsed >= 10) return { ok: false, msg: '药力已竭，洗髓丹无法再吸收' };
    removeItem(s, id, 1);
    p.permCultUsed++;
    p.permCult += item.power;
    pushLog(s, '服下洗髓丹，伐毛洗髓，修炼速度提升！');
    return { ok: true, msg: '洗髓丹：修炼速度 +3%（已用 ' + p.permCultUsed + '/10）', fx: 'aura' };
  }
  return { ok: false, msg: '此物不能服用' };
}

/* ---------------- 修为 / 突破 ---------------- */

function gainExp(s, n, src) {
  const p = s.player;
  if (p.stage >= STAGES.length) return;
  p.exp = Math.min(needExp(p.stage), p.exp + n);
}

function canBreakthrough(s) {
  const p = s.player;
  if (p.stage >= STAGES.length) return { ok: false, msg: '已证真仙' };
  if (p.exp < needExp(p.stage)) return { ok: false, msg: '修为未圆满' };
  return { ok: true };
}

function breakRate(s) {
  const p = s.player;
  let r = 0.96 - p.stage * 0.02 + p.breakFail * 0.15 + p.breakBoost;
  return Math.max(0.35, Math.min(0.98, r));
}

// 尝试突破。若需渡劫，返回 needTrib=true（境界尚未提升，等待天劫结果）
function tryBreakthrough(s, nowMs) {
  const p = s.player;
  const chk = canBreakthrough(s);
  if (!chk.ok) return { ok: false, msg: chk.msg };
  if (p.breakCdUntil && (nowMs || 0) < p.breakCdUntil) return { ok: false, msg: '突破失败，经脉受损，稍作调息' };
  const rng = stateRng(s);
  const next = p.stage + 1;
  const rate = breakRate(s);
  const roll = rng.next();
  p.breakBoost = 0;
  const needTrib = next < STAGES.length && STAGES[next].trib != null || next >= STAGES.length;
  if (roll <= rate) {
    // 成功（渡劫边界先不落地境界，等天劫裁决）
    const cfg = needTrib ? tribConfig(STAGES[Math.min(next, STAGES.length - 1)].trib, p.tribDone) : null;
    return {
      ok: true, success: true, needTrib, rate,
      msg: needTrib ? '天机牵引，乌云蔽日——天劫将至！' : '突破成功！晋入' + (next >= STAGES.length ? '真仙之境' : stageName(next)) + '！',
      tribCfg: cfg,
    };
  }
  p.breakFail++;
  p.exp = Math.round(p.exp * 0.8);
  p.breakCdUntil = (nowMs || 0) + 5000;
  return { ok: true, success: false, rate, msg: '突破失败（成功率 ' + Math.round(rate * 100) + '%），修为散了两成。道行积累，下次突破更易。' };
}

// 天劫结算：survived=true 境界落地
function tribulationResult(s, survived) {
  const p = s.player;
  const next = p.stage + 1;
  if (survived) {
    p.stage = Math.min(next, STAGES.length);
    p.exp = 0;
    p.tribDone++;
    p.breakFail = 0;
    recalc(s);
    p.hp = p.hpMax; p.mp = p.mpMax;
    if (p.stage >= STAGES.length) { s.finished = true; pushLog(s, '九天雷散，仙门大开——飞升成仙！'); }
    else pushLog(s, '雷云散尽，晋入' + stageName(p.stage) + '！寿元大增。');
    return { ok: true, msg: p.stage >= STAGES.length ? '飞升！' : '晋入' + stageName(p.stage), stage: p.stage };
  }
  p.breakFail++;
  p.hp = Math.max(1, Math.round(p.hpMax * 0.1));
  pushLog(s, '天劫之下未能挺住，境界未动，然道行愈坚（下次渡劫更有把握）。');
  return { ok: true, msg: '渡劫失败，道行 +' + (p.breakFail * 15) + '%（累计）', stage: p.stage };
}

/* ---------------- 打坐 ---------------- */

// 每次 tick 由 main 调用，返回本 tick 增加的修为（浮点）
function meditateGain(s, dtSec) {
  return cultSpeed(s) * dtSec;
}

/* ---------------- 炼丹 ---------------- */

function furnaceBonus(s) { return s.furnaceLvl * 0.15; }
function refineRate(s, rid) {
  const r = 0.5 + s.player.stage * 0.025 + furnaceBonus(s);
  return Math.max(0.2, Math.min(0.95, r));
}
function canRefine(s, rid) {
  const rec = RECIPES[rid];
  if (!rec) return { ok: false, msg: '不知此丹方' };
  if (s.knownRecipes.indexOf(rid) < 0) return { ok: false, msg: '尚未习得丹方' };
  for (const k in rec.need) if (countItem(s, k) < rec.need[k]) return { ok: false, msg: '灵草妖丹不足' };
  return { ok: true };
}
function refine(s, rid) {
  const chk = canRefine(s, rid);
  if (!chk.ok) return chk;
  const rec = RECIPES[rid];
  for (const k in rec.need) removeItem(s, k, rec.need[k]);
  const rate = refineRate(s, rid);
  const rng = stateRng(s);
  if (rng.next() <= rate) {
    addItem(s, rec.out, 1);
    s.player.pillsMade++;
    pushLog(s, '丹成！炼得【' + ITEMS[rec.out].name + '】一枚。');
    return { ok: true, success: true, msg: '丹成！获得 ' + ITEMS[rec.out].name, out: rec.out };
  }
  pushLog(s, '火候差之毫厘，一炉丹药化作青烟。');
  return { ok: true, success: false, msg: '炼丹失败，灵草尽化作青烟' };
}

/* ---------------- 商店 ---------------- */

function buy(s, itemId) {
  const it = ITEMS[itemId];
  if (!it) return { ok: false, msg: '无此物' };
  if (s.player.gold < it.price) return { ok: false, msg: '灵石不足' };
  // 功法卷：已学则不可再买
  if (it.type === 'scroll') {
    const p = s.player;
    if (it.skill && p.skills.indexOf(it.skill) >= 0) return { ok: false, msg: '已习得此功法' };
    if (it.body && p.body[it.body]) return { ok: false, msg: '已习得此术' };
  }
  s.player.gold -= it.price;
  addItem(s, itemId, 1);
  pushLog(s, '购入' + it.name + '（-' + it.price + ' 灵石）');
  return { ok: true, msg: '购入 ' + it.name };
}

// 使用卷册类物品：学习
function learnScroll(s, itemId) {
  const it = ITEMS[itemId];
  if (!it || it.type !== 'scroll') return { ok: false, msg: '非卷册' };
  if (countItem(s, itemId) <= 0) return { ok: false, msg: '没有此卷' };
  const p = s.player;
  if (it.skill) {
    if (p.skills.indexOf(it.skill) >= 0) return { ok: false, msg: '已习得' };
    removeItem(s, itemId, 1);
    p.skills.push(it.skill);
    p.skill = it.skill;
    pushLog(s, '参悟' + it.name + '，习得【' + SKILLS[it.skill].name + '】！');
    return { ok: true, msg: '习得 ' + SKILLS[it.skill].name, fx: 'learn' };
  }
  if (it.body) {
    if (p.body[it.body]) return { ok: false, msg: '已习得' };
    removeItem(s, itemId, 1);
    p.body[it.body] = true;
    recalc(s);
    p.hp = p.hpMax;
    pushLog(s, '参悟' + it.name + '，体魄大成！');
    return { ok: true, msg: '习得 ' + it.name.replace('体术·', '').replace('身法·', ''), fx: 'learn' };
  }
  return { ok: false, msg: '此物无法参悟' };
}

function sell(s, itemId) {
  const it = ITEMS[itemId];
  if (!it || !it.price) return { ok: false, msg: '此物有价无市' };
  if (countItem(s, itemId) <= 0) return { ok: false, msg: '没有此物' };
  removeItem(s, itemId, 1);
  const gain = Math.max(1, Math.round(it.price * 0.6));
  s.player.gold += gain;
  return { ok: true, msg: '售出 ' + it.name + '（+' + gain + ' 灵石）' };
}

function upgradeFurnace(s) {
  const cost = [0, 320, 960][s.furnaceLvl + 1];
  if (!cost) return { ok: false, msg: '丹炉已是九转紫金炉' };
  if (s.player.gold < cost) return { ok: false, msg: '灵石不足（需 ' + cost + '）' };
  s.player.gold -= cost;
  s.furnaceLvl++;
  pushLog(s, s.furnaceLvl === 1 ? '丹炉升级为青纹丹炉，成丹率提升。' : '丹炉晋升九转紫金炉！');
  return { ok: true, msg: '丹炉升级成功' };
}

function learnRecipe(s, rid) {
  const rec = RECIPES[rid];
  if (!rec) return { ok: false, msg: '无此丹方' };
  if (s.knownRecipes.indexOf(rid) >= 0) return { ok: false, msg: '已知此丹方' };
  if (s.player.gold < rec.cost) return { ok: false, msg: '灵石不足（需 ' + rec.cost + '）' };
  s.player.gold -= rec.cost;
  s.knownRecipes.push(rid);
  pushLog(s, '购得丹方，习得【' + ITEMS[rec.out].name + '】炼制之法。');
  return { ok: true, msg: '习得丹方：' + ITEMS[rec.out].name };
}

/* ---------------- 战斗数值（供 main 调用；纯计算） ---------------- */

function enemyStats(kindId, lvl, seedN) {
  const k = ENEMY_KINDS[kindId];
  const hp = Math.round(k.hp * Math.pow(1.42, lvl - 1));
  const atk = Math.round(k.atk * Math.pow(1.30, lvl - 1));
  const exp = Math.round(k.exp * Math.pow(1.45, lvl - 1));
  return { name: k.name, hp, hpMax: hp, atk, exp, spd: k.spd, r: k.r, style: k.style, shot: k.shot || null, boss: !!k.boss };
}

function playerHitDamage(s, rng) {
  const sk = SKILLS[s.player.skill];
  const dmg = playerAtk(s) * sk.mult * (0.9 + rng.next() * 0.2);
  return Math.max(1, Math.round(dmg));
}

function damagePlayer(s, raw, rng) {
  const p = s.player;
  let d = raw * (0.92 + rng.next() * 0.16);
  if (p.body.gold) d *= 0.8;
  d = Math.max(1, Math.round(d));
  p.hp -= d;
  if (p.hp <= 0) { p.hp = 0; p.alive = false; }
  return d;
}

function playerDies(s) {
  const p = s.player;
  p.deaths++;
  const lost = Math.round(p.exp * 0.1);
  p.exp -= lost;
  p.alive = true;
  recalc(s);
  p.hp = Math.round(p.hpMax * 0.5);
  p.mp = Math.round(p.mpMax * 0.5);
  p.map = 'village';
  pushLog(s, '你身受重伤，被村人救回。修为散落一成。');
  return { msg: '重伤倒地，被救回青云村（修为 -' + lost + '）' };
}

// 击杀掉落（rng 用调用方的，保持可测）
function lootOf(s, kindId, lvl, rng) {
  const k = ENEMY_KINDS[kindId];
  const mapDef = MAP_DEFS[s.player.map] || {};
  const loot = { gold: lvl * 3 + rng.int(0, lvl * 3), items: {} };
  const coreId = mapDef.core;
  if (coreId && rng.chance(k.boss ? 1 : 0.45)) loot.items[coreId] = 1;
  const herb = mapDef.herb;
  if (herb && rng.chance(k.boss ? 1 : 0.25)) loot.items[herb] = k.boss ? rng.int(2, 4) : 1;
  if (k.boss) {
    loot.items.blood = (loot.items.blood || 0) + rng.int(1, 3);
    // Boss 额外灵饰
    loot.gold += lvl * 20;
  }
  return loot;
}

/* ---------------- 日志 ---------------- */

function pushLog(s, text) {
  s.log.push({ t: Date.now(), text });
  if (s.log.length > 60) s.log = s.log.slice(-60);
}

/* ---------------- 存档状态 RNG（每次调用推进并存回） ---------------- */

function stateRng(s) {
  const fn = mulberry32(s.rngS);
  fn(); // 推进一次得到值
  const wrap = makeRng(0);
  // 用一个基于当前种子的短序列，并保存下一状态
  let cur = s.rngS;
  return {
    next() {
      cur = (cur + 0x6D2B79F5) | 0;
      let t = Math.imul(cur ^ (cur >>> 15), 1 | cur);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      const v = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      s.rngS = cur >>> 0;
      return v;
    },
    int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); },
    chance(p) { return this.next() < p; },
    pick(arr) { return arr[Math.floor(this.next() * arr.length)]; },
  };
}

/* ---------------- 地图生成（确定性，纯数据） ---------------- */

const T = { GRASS: 0, PATH: 1, WATER: 2, TREE: 3, ROCK: 4, FLOWER: 5, WOOD: 6, WALL: 7, DOOR: 8, BAMB: 9, SWAMP: 10, RUINF: 11, RUINW: 12 };
const SOLID = new Set([T.WATER, T.TREE, T.ROCK, T.WALL, T.SWAMP, T.RUINW]);

function genMap(mapId, seed) {
  const def = MAP_DEFS[mapId];
  if (!def) throw new Error('未知地图 ' + mapId);
  const w = def.w, h = def.h;
  const rng = makeRng((seed ^ (hash32(mapId) * 0x27d4eb2f)) >>> 0);
  const tiles = new Uint8Array(w * h);
  const at = (x, y) => tiles[y * w + x];
  const set = (x, y, v) => { if (x >= 0 && y >= 0 && x < w && y < h) tiles[y * w + x] = v; };

  // 基底
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) tiles[y * w + x] = T.GRASS;

  if (def.kind === 'village') {
    // 道路
    for (let x = 8; x < 68; x++) { set(x, 26, T.PATH); set(x, 27, T.PATH); }
    for (let y = 10; y < 42; y++) { set(36, y, T.PATH); }
    // 房屋
    house(at, set, 16, 12, 10, 8);
    house(at, set, 46, 10, 12, 8);   // 商行
    house(at, set, 14, 32, 12, 8);   // 药翁
    // 丹炉（药翁旁）
    set(28, 36, T.WOOD);
    // 水井
    set(36, 20, T.WATER); set(37, 20, T.WATER); set(36, 21, T.WATER); set(37, 21, T.WATER);
    // 花草点缀
    for (let i = 0; i < 70; i++) { const x = rng.int(2, w - 3), y = rng.int(2, h - 3); if (at(x, y) === T.GRASS) set(x, y, rng.chance(0.4) ? T.FLOWER : T.GRASS); }
    for (let i = 0; i < 95; i++) { const x = rng.int(2, w - 3), y = rng.int(2, h - 3); if (at(x, y) === T.GRASS) set(x, y, T.TREE); }
    // 边界树
    border(at, set, w, h, T.TREE);
  } else if (def.kind === 'forest') {
    scatterBlob(at, set, rng, w, h, T.WATER, 4, 30);
    // 竹林：噪声
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      if (noise2(x * 0.12, y * 0.12, seed) > 0.02) set(x, y, T.BAMB);
    }
    road(at, set, w, h, 2, 30, 44, 2);
    road(at, set, w, h, 44, 2, 84, 40);
    clearAround(at, set, w, h, 3, 30, 4);
    clearAround(at, set, w, h, 44, 3, 4);
    border(at, set, w, h, T.BAMB);
  } else if (def.kind === 'mount') {
    scatterBlob(at, set, rng, w, h, T.ROCK, 10, 60);
    scatterBlob(at, set, rng, w, h, T.TREE, 6, 40);
    road(at, set, w, h, 44, 65, 44, 2);
    road(at, set, w, h, 44, 34, 78, 34);
    clearAround(at, set, w, h, 44, 63, 4);
    clearAround(at, set, w, h, 78, 34, 3);
    border(at, set, w, h, T.ROCK);
  } else if (def.kind === 'marsh') {
    scatterBlob(at, set, rng, w, h, T.SWAMP, 14, 90);
    for (let i = 0; i < 50; i++) { const x = rng.int(1, w - 2), y = rng.int(1, h - 2); if (at(x, y) === T.GRASS) set(x, y, T.TREE); }
    road(at, set, w, h, 8, 52, 60, 12);
    clearAround(at, set, w, h, 8, 51, 4);
    border(at, set, w, h, T.TREE);
  } else if (def.kind === 'ruins') {
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) if (rng.chance(0.4)) set(x, y, T.RUINF);
    // 断墙回廊
    for (let i = 0; i < 14; i++) {
      const x = rng.int(6, w - 8), y = rng.int(6, h - 8);
      const len = rng.int(4, 12); const horiz = rng.chance(0.5);
      for (let j = 0; j < len; j++) { if (rng.chance(0.85)) set(x + (horiz ? j : 0), y + (horiz ? 0 : j), T.RUINW); }
    }
    clearAround(at, set, w, h, 32, 45, 4);
    clearAround(at, set, w, h, 32, 14, 8); // 祭坛
    set(32, 12, T.RUINF);
    border(at, set, w, h, T.RUINW);
  }

  // 出口打通
  for (const ex of def.exits || []) {
    set(ex.x, ex.y, def.kind === 'ruins' ? T.RUINF : (def.kind === 'village' ? T.PATH : T.GRASS));
    set(ex.x, ex.y + 1 >= h ? ex.y : ex.y + 1, at(ex.x, ex.y) === T.PATH ? T.PATH : at(ex.x, ex.y));
  }
  // 草药点位
  const herbs = [];
  if (def.herb) {
    let tries = 0;
    while (herbs.length < def.herbCount && tries++ < 600) {
      const x = rng.int(2, w - 3), y = rng.int(2, h - 3);
      if (at(x, y) === T.GRASS || at(x, y) === T.FLOWER) {
        herbs.push({ x, y, item: def.herb });
        set(x, y, T.GRASS);
      }
    }
  }
  return { mapId, w, h, tiles, herbs };
}

function hash32(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function noise2(x, y, seed) {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 0.001) * 43758.5453;
  const m = Math.sin(x * 74.7 + y * 189.3 - seed * 0.013) * 28451.2193;
  return (n - Math.floor(n)) * 0.6 + (m - Math.floor(m)) * 0.4 - 0.5;
}
function house(at, set, x0, y0, w, h) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, T.WALL);
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    if (x === x0 || y === y0 || x === x0 + w - 1 || y === y0 + h - 1) set(x, y, T.WALL);
    else set(x, y, T.WOOD);
  }
  const dx = x0 + Math.floor(w / 2);
  set(dx, y0 + h - 1, T.DOOR);
  set(dx, y0 + h, T.PATH);
}
function border(at, set, w, h, t) {
  for (let x = 0; x < w; x++) { set(x, 0, t); set(x, 1, t); set(x, h - 1, t); set(x, h - 2, t); }
  for (let y = 0; y < h; y++) { set(0, y, t); set(1, y, t); set(w - 1, y, t); set(w - 2, y, t); }
}
function scatterBlob(at, set, rng, w, h, t, n, size) {
  for (let i = 0; i < n; i++) {
    let x = rng.int(3, w - 4), y = rng.int(3, h - 4);
    let s = rng.int(size >> 1, size);
    while (s-- > 0) {
      if (t !== T.SWAMP || rng.chance(0.9)) set(x, y, t);
      x += rng.int(-1, 1); y += rng.int(-1, 1);
      x = Math.max(2, Math.min(w - 3, x)); y = Math.max(2, Math.min(h - 3, y));
    }
  }
}
function road(at, set, w, h, x0, y0, x1, y1) {
  let x = x0, y = y0;
  while (x !== x1 || y !== y1) {
    set(x, y, T.PATH);
    set(x, y + 1, T.PATH);
    if (x !== x1 && (y === y1 || Math.abs(x1 - x) > Math.abs(y1 - y))) x += x1 > x ? 1 : -1;
    else if (y !== y1) y += y1 > y ? 1 : -1;
  }
  set(x1, y1, T.PATH); set(x1, y1 + 1 < h ? y1 + 1 : y1, T.PATH);
}
function clearAround(at, set, w, h, cx, cy, r) {
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
    if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
    const t = at(x, y);
    if (SOLID.has(t)) set(x, y, T.GRASS);
  }
}

function walkable(mapData, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= mapData.w || ty >= mapData.h) return false;
  return !SOLID.has(mapData.tiles[ty * mapData.w + tx]);
}

/* ---------------- 地图内实体生成（确定性布点） ---------------- */

function genSpawns(mapId, seed, mapData) {
  const def = MAP_DEFS[mapId];
  const rng = makeRng((seed ^ hash32(mapId + '_sp')) >>> 0);
  const mobs = [];
  for (const [kind, n] of def.mobs || []) {
    for (let i = 0; i < n; i++) {
      let x, y, tries = 0;
      do { x = rng.int(3, def.w - 4); y = rng.int(3, def.h - 4); tries++; }
      while (tries < 200 && (!walkable(mapData, x, y) || tooCloseExit(def, x, y, 6)));
      const lvl = rng.int(def.mobLvl[0], def.mobLvl[1]);
      mobs.push({ kind, lvl, x, y });
    }
  }
  let boss = null;
  if (def.boss) {
    let x, y, tries = 0;
    do { x = rng.int(def.w >> 2, def.w - 6); y = rng.int(3, def.h >> 1); tries++; }
    while (tries < 300 && !walkable(mapData, x, y));
    boss = { kind: def.boss, lvl: (def.mobLvl[1] || 3) + 2, x, y };
  }
  return { mobs, boss };
}
function tooCloseExit(def, x, y, r) {
  for (const ex of def.exits || []) if (Math.abs(ex.x - x) <= r && Math.abs(ex.y - y) <= r) return true;
  if (def.kind === 'village') return false;
  return false;
}

// 青云村出生点 & NPC 固定位
const VILLAGE_POINTS = {
  spawn: { x: 34, y: 27 },
  herbElder: { x: 20, y: 29 },   // 药王老人（房屋南）
  merchant: { x: 51, y: 19 },    // 游方商（商行门前）
  furnace: { x: 28, y: 36 },     // 丹炉
  teacher: { x: 40, y: 26 },     // 云游道人（路中，初见送功法引导）
};

/* ---------------- 地图切换 ---------------- */

function gotoMap(s, mapId, tx, ty) {
  s.player.map = mapId;
  s.player.x = tx * 32 + 16;
  s.player.y = ty * 32 + 16;
}

/* ---------------- 工具导出 ---------------- */

const XCore = {
  mulberry32, makeRng, stateRng,
  REALMS, STAGES, FINAL_STAGE, SPIRIT_ROOTS, ITEMS, SKILLS, RECIPES, ENEMY_KINDS, MAP_DEFS, T, SOLID,
  tribConfig,
  newGame, recalc, stageInfo, stageName, needExp, spiritRoot, cultSpeed,
  addItem, removeItem, countItem, useItem,
  gainExp, canBreakthrough, breakRate, tryBreakthrough, tribulationResult,
  meditateGain,
  refineRate, canRefine, refine,
  buy, sell, learnScroll, upgradeFurnace, learnRecipe,
  playerAtk, playerHitDamage, damagePlayer, playerDies, lootOf, enemyStats,
  pushLog,
  genMap, genSpawns, walkable, gotoMap, VILLAGE_POINTS,
};

global.XCore = XCore;
if (typeof module !== 'undefined' && module.exports) module.exports = XCore;
})(typeof globalThis !== 'undefined' ? globalThis : this);
