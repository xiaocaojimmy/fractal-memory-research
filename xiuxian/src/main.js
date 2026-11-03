/* ============================================================
 * 《问道长生》 main.js —— 引擎 / 渲染 / 输入 / UI（依赖 core.js）
 * ============================================================ */
(function () {
'use strict';
const C = window.XCore;
const { STAGES, ITEMS, SKILLS, RECIPES, ENEMY_KINDS, MAP_DEFS, T } = C;

/* ---------------- 常量 ---------------- */
const TILE = 32;
const SAVE_KEY = 'wxcs_save_v1';
const rngWrap = { next: () => Math.random(), int: (a, b) => a + Math.floor(Math.random() * (b - a + 1)), chance: p => Math.random() < p, pick: a => a[Math.floor(Math.random() * a.length)] };

/* ---------------- DOM ---------------- */
const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
ctx.imageSmoothingEnabled = false;
const mini = document.getElementById('minimap');
const mctx = mini.getContext('2d');
const $ = id => document.getElementById(id);
const logBox = $('logbox');
const panelMask = $('mask');

let W = 0, H = 0, DPR = 1;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  cv.style.width = W + 'px'; cv.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.imageSmoothingEnabled = false;
}
window.addEventListener('resize', resize);

/* ---------------- 音效（WebAudio 合成） ---------------- */
let AC = null;
function audio() { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } return AC; }
function beep(f0, f1, dur, type, vol) {
  const ac = audio(); if (!ac) return;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type || 'sine'; o.frequency.setValueAtTime(f0, ac.currentTime);
  o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), ac.currentTime + dur);
  g.gain.setValueAtTime(vol == null ? 0.08 : vol, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
  o.connect(g); g.connect(ac.destination);
  o.start(); o.stop(ac.currentTime + dur + 0.02);
}
const SFX = {
  atk:   () => beep(680, 240, 0.10, 'triangle', 0.05),
  hit:   () => beep(200, 60, 0.12, 'square', 0.05),
  hurt:  () => beep(160, 50, 0.22, 'sawtooth', 0.09),
  pick:  () => beep(520, 980, 0.09, 'sine', 0.06),
  pill:  () => beep(420, 880, 0.25, 'sine', 0.07),
  buy:   () => beep(880, 1200, 0.10, 'triangle', 0.05),
  ok:    () => { beep(523, 523, 0.1, 'sine', 0.07); setTimeout(() => beep(784, 784, 0.22, 'sine', 0.07), 90); },
  fail:  () => beep(220, 110, 0.4, 'sawtooth', 0.07),
  boom:  () => beep(90, 30, 0.35, 'sawtooth', 0.12),
  bolt:  () => beep(1200, 80, 0.18, 'sawtooth', 0.10),
  level: () => { beep(392, 392, 0.09, 'triangle', 0.08); setTimeout(() => beep(523, 523, 0.09, 'triangle', 0.08), 100); setTimeout(() => beep(659, 784, 0.3, 'triangle', 0.08), 200); },
  learn: () => { beep(660, 990, 0.3, 'sine', 0.07); },
  dash:  () => beep(300, 600, 0.08, 'sine', 0.03),
};

/* ---------------- 程序化像素精灵 ---------------- */
function sp(w, h, fn) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); fn(g, c); return c;
}
function px(g, x, y, w, h, col) { g.fillStyle = col; g.fillRect(x, y, w, h); }

const SPR = {};
function buildSprites() {
  // 玩家（打坐 & 站立四向）
  const robe = '#e8e6f8', trim = '#6f7fd6', hair = '#2a2438';
  SPR.player = {};
  for (const dir of ['down', 'up', 'side']) {
    SPR.player[dir] = sp(16, 18, g => {
      px(g, 5, 1, 6, 4, hair);                       // 发
      if (dir !== 'up') px(g, 6, 3, 4, 2, '#f2d5b8'); // 脸
      else px(g, 5, 3, 6, 2, hair);
      px(g, 6, 0, 4, 2, hair);                        // 发髻
      px(g, 4, 6, 8, 8, robe);                        // 袍
      px(g, 4, 6, 8, 2, trim);
      px(g, 3, 8, 2, 5, robe); px(g, 11, 8, 2, 5, robe); // 袖
      px(g, 7, 8, 2, 6, trim);                        // 带
      px(g, 5, 14, 2, 3, '#4a4258'); px(g, 9, 14, 2, 3, '#4a4258');
    });
  }
  SPR.playerSit = sp(16, 16, g => {
    px(g, 5, 1, 6, 4, hair); px(g, 6, 0, 4, 2, hair);
    px(g, 6, 3, 4, 2, '#f2d5b8');
    px(g, 3, 6, 10, 6, robe); px(g, 3, 6, 10, 2, trim);
    px(g, 2, 10, 12, 3, trim);
  });
  // 怪物
  SPR.wolf = sp(20, 14, g => {
    px(g, 2, 5, 12, 6, '#7a7f8c'); px(g, 12, 3, 6, 5, '#8b90a0');
    px(g, 13, 2, 2, 2, '#8b90a0'); px(g, 16, 2, 2, 2, '#8b90a0');
    px(g, 14, 4, 1, 1, '#ff5a4a'); px(g, 16, 4, 1, 1, '#ff5a4a');
    px(g, 3, 11, 2, 3, '#5b5f6b'); px(g, 7, 11, 2, 3, '#5b5f6b'); px(g, 11, 11, 2, 3, '#5b5f6b');
    px(g, 0, 5, 3, 2, '#5b5f6b');
  });
  SPR.snake = sp(18, 10, g => {
    for (let i = 0; i < 6; i++) px(g, 1 + i * 3, 5 + Math.round(Math.sin(i) * 2), 3, 3, i % 2 ? '#4f9e4f' : '#3c7f3c');
    px(g, 14, 2, 4, 4, '#5cb85c'); px(g, 15, 3, 1, 1, '#ffd24a'); px(g, 17, 3, 1, 1, '#ffd24a');
  });
  SPR.bear = sp(26, 22, g => {
    px(g, 3, 6, 18, 12, '#7c5a38'); px(g, 1, 8, 5, 8, '#6b4c2e'); px(g, 17, 3, 7, 7, '#8a6a44');
    px(g, 18, 1, 2, 2, '#8a6a44'); px(g, 22, 1, 2, 2, '#8a6a44');
    px(g, 20, 5, 1, 1, '#ffb14a'); px(g, 22, 5, 1, 1, '#ffb14a');
    px(g, 4, 18, 3, 4, '#5c4327'); px(g, 10, 18, 3, 4, '#5c4327'); px(g, 16, 18, 3, 4, '#5c4327');
  });
  SPR.ape = sp(20, 20, g => {
    px(g, 4, 6, 12, 10, '#8f8f96'); px(g, 12, 2, 7, 7, '#a3a3ab');
    px(g, 14, 4, 1, 1, '#ffd24a'); px(g, 16, 4, 1, 1, '#ffd24a');
    px(g, 2, 8, 4, 8, '#77777e'); px(g, 6, 16, 3, 4, '#77777e'); px(g, 12, 16, 3, 4, '#77777e');
  });
  SPR.python = sp(30, 12, g => {
    for (let i = 0; i < 10; i++) px(g, 0 + i * 3, 4 + Math.round(Math.sin(i * 0.9) * 2), 4, 5, i % 2 ? '#6b3e70' : '#57325c');
    px(g, 26, 2, 4, 5, '#7d4a84'); px(g, 27, 3, 1, 1, '#ff4a4a'); px(g, 29, 3, 1, 1, '#ff4a4a');
  });
  SPR.toad = sp(20, 16, g => {
    px(g, 2, 6, 16, 9, '#5d7040'); px(g, 4, 4, 4, 4, '#75904f'); px(g, 12, 4, 4, 4, '#75904f');
    px(g, 5, 5, 2, 2, '#d84a3a'); px(g, 13, 5, 2, 2, '#d84a3a');
    px(g, 2, 13, 3, 3, '#4a5a34'); px(g, 15, 13, 3, 3, '#4a5a34');
    px(g, 6, 10, 8, 2, '#3f4f2c');
  });
  SPR.wraith = sp(18, 20, g => {
    g.fillStyle = 'rgba(180,150,255,0.75)';
    g.beginPath(); g.arc(9, 7, 6, 0, 7); g.fill();
    g.fillRect(4, 7, 10, 9);
    g.fillStyle = 'rgba(150,120,230,0.6)'; g.fillRect(4, 15, 3, 4); g.fillRect(11, 15, 3, 4);
    px(g, 7, 6, 1, 2, '#201040'); px(g, 10, 6, 1, 2, '#201040');
    px(g, 14, 2, 2, 12, '#cfd6ff'); px(g, 13, 12, 4, 2, '#9aa6e8');
  });
  SPR.wolfking = sp(34, 22, g => {
    px(g, 3, 8, 20, 10, '#4c5468'); px(g, 20, 4, 10, 8, '#5a6378');
    px(g, 22, 2, 2, 3, '#5a6378'); px(g, 27, 2, 2, 3, '#5a6378');
    px(g, 23, 7, 2, 2, '#46e0ff'); px(g, 27, 7, 2, 2, '#46e0ff');
    px(g, 4, 18, 3, 4, '#3a4152'); px(g, 11, 18, 3, 4, '#3a4152'); px(g, 18, 18, 3, 4, '#3a4152');
    px(g, 0, 8, 4, 3, '#3a4152');
  });
  SPR.pythong = sp(40, 18, g => {
    for (let i = 0; i < 12; i++) px(g, 0 + i * 3, 8 + Math.round(Math.sin(i * 0.8) * 3), 4, 7, i % 2 ? '#43305e' : '#33244a');
    px(g, 33, 3, 6, 8, '#54407a'); px(g, 35, 5, 1, 1, '#ffd24a'); px(g, 37, 5, 1, 1, '#ffd24a');
    px(g, 35, 1, 2, 2, '#ff4a4a'); px(g, 31, 2, 1, 1, '#ff4a4a');
  });
  SPR.swordsoul = sp(26, 34, g => {
    g.fillStyle = 'rgba(210,220,255,0.8)';
    g.beginPath(); g.arc(13, 8, 7, 0, 7); g.fill(); g.fillRect(7, 8, 12, 10);
    g.fillStyle = 'rgba(160,180,255,0.5)'; g.fillRect(7, 17, 4, 6); g.fillRect(15, 17, 4, 6);
    px(g, 10, 7, 2, 3, '#303a80'); px(g, 14, 7, 2, 3, '#303a80');
    px(g, 2, 2, 3, 26, '#aef'); px(g, 1, 26, 5, 3, '#89c'); px(g, 3, 1, 1, 2, '#fff');
  });
  SPR.elder = sp(16, 18, g => {
    px(g, 5, 1, 6, 3, '#cfcfcf'); px(g, 6, 3, 4, 3, '#f2d5b8'); px(g, 6, 5, 4, 3, '#e8e8e8');
    px(g, 4, 7, 8, 9, '#8aa06f'); px(g, 3, 9, 2, 5, '#8aa06f'); px(g, 11, 9, 2, 5, '#8aa06f');
    px(g, 12, 12, 2, 6, '#7a5230');
  });
  SPR.merchant = sp(16, 18, g => {
    px(g, 5, 1, 6, 3, '#3a3244'); px(g, 6, 3, 4, 3, '#f2d5b8');
    px(g, 4, 6, 8, 10, '#b0722a'); px(g, 3, 8, 2, 5, '#b0722a'); px(g, 11, 8, 2, 5, '#b0722a');
    px(g, 1, 12, 4, 4, '#caa84a'); px(g, 12, 10, 3, 6, '#7a5230');
  });
  SPR.daoist = sp(16, 18, g => {
    px(g, 5, 1, 6, 3, '#e8e6f8'); px(g, 6, 3, 4, 3, '#f2d5b8');
    px(g, 4, 6, 8, 10, '#5d76c9'); px(g, 7, 8, 2, 8, '#e8e6f8');
    px(g, 2, 8, 2, 6, '#5d76c9'); px(g, 12, 8, 2, 6, '#5d76c9');
  });
  SPR.furnace = sp(28, 26, g => {
    px(g, 4, 8, 20, 14, '#5e5a68'); px(g, 6, 6, 16, 4, '#6e6a78');
    px(g, 8, 10, 12, 6, '#3c3a44'); px(g, 10, 12, 8, 3, '#ff7b30');
    px(g, 5, 22, 4, 4, '#4a4652'); px(g, 19, 22, 4, 4, '#4a4652');
    px(g, 12, 2, 4, 4, '#6e6a78');
  });
}
buildSprites();

/* ---------------- 地图瓦片预渲染 ---------------- */
function tileNoise(x, y, s) { const n = Math.sin(x * 12.9898 + y * 78.233 + s * 0.1) * 43758.545; return n - Math.floor(n); }

function renderMapLayer(mapData) {
  const { w, h, tiles, mapId } = mapData;
  const seed = S ? S.seed : 1;
  const c = document.createElement('canvas'); c.width = w * TILE; c.height = h * TILE;
  const g = c.getContext('2d');
  const def = MAP_DEFS[mapId];
  const tint = def.kind === 'ruins' ? '#171828' : def.kind === 'marsh' ? '#182621' : '#000';
  g.fillStyle = tint; g.fillRect(0, 0, c.width, c.height);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = tiles[y * w + x];
    const X = x * TILE, Y = y * TILE;
    const n = tileNoise(x, y, seed + mapId.length);
    switch (t) {
      case T.PATH:
        px(g, X, Y, TILE, TILE, '#7a6a4c');
        if (n > 0.5) px(g, X + (n * 20 | 0), Y + (n * 18 | 0), 3, 3, '#6a5b41');
        if (n < 0.18) px(g, X + 4, Y + 20, 5, 2, '#8a7a5a');
        break;
      case T.WATER:
        px(g, X, Y, TILE, TILE, '#2c5480');
        if (n > 0.55) px(g, X + 4, Y + ((n * 20) | 0), 12, 2, '#3f6d9e');
        if (n < 0.2) px(g, X + 16, Y + 24, 8, 2, '#3f6d9e');
        break;
      case T.SWAMP:
        px(g, X, Y, TILE, TILE, '#243f33');
        if (n > 0.6) { g.fillStyle = '#33543f'; g.beginPath(); g.arc(X + 10, Y + 16, 5, 0, 7); g.fill(); }
        if (n < 0.15) px(g, X + 20, Y + 8, 3, 3, '#6f8f5a');
        break;
      case T.TREE:
        base(); 
        px(g, X + 13, Y + 20, 6, 10, '#4a3626');
        px(g, X + 4, Y + 2, 24, 8, '#2e5f38'); px(g, X + 7, Y + 9, 18, 8, '#387043'); px(g, X + 10, Y + 16, 12, 6, '#2e5f38');
        break;
      case T.BAMB:
        base();
        px(g, X + 2, Y, 3, 32, '#5a8f4a'); px(g, X + 11, Y, 3, 32, '#4d7f40'); px(g, X + 19, Y + 2, 3, 30, '#67a054'); px(g, X + 27, Y + 1, 3, 31, '#517f43');
        px(g, X + 1, Y + 10, 5, 2, '#3f6a35'); px(g, X + 10, Y + 20, 5, 2, '#3f6a35'); px(g, X + 18, Y + 8, 5, 2, '#3f6a35'); px(g, X + 26, Y + 22, 5, 2, '#3f6a35');
        px(g, X - 2, Y + 1, 9, 3, '#6fb85a'); px(g, X + 14, Y + 5, 9, 3, '#6fb85a'); px(g, X + 23, Y + 0, 9, 3, '#7cc865');
        break;
      case T.ROCK:
        base();
        g.fillStyle = '#6b6f75'; g.beginPath(); g.moveTo(X + 3, Y + 28); g.lineTo(X + 9, Y + 8); g.lineTo(X + 22, Y + 4); g.lineTo(X + 29, Y + 20); g.lineTo(X + 24, Y + 29); g.closePath(); g.fill();
        px(g, X + 10, Y + 8, 8, 3, '#878c93');
        break;
      case T.FLOWER:
        base();
        px(g, X + 8, Y + 10, 3, 3, n > 0.5 ? '#e87f9a' : '#e8d15a'); px(g, X + 20, Y + 18, 3, 3, n > 0.5 ? '#e8d15a' : '#9ab8ff');
        break;
      case T.WOOD:
        px(g, X, Y, TILE, TILE, '#8a6a44');
        px(g, X, Y + 10, TILE, 2, '#6f5436'); px(g, X, Y + 24, TILE, 2, '#6f5436');
        break;
      case T.WALL:
        px(g, X, Y, TILE, TILE, '#8e4f3a');
        for (let i = 0; i < 4; i++) px(g, X + i * 8 + 3, Y + 2, 2, 28, '#74402f');
        px(g, X, Y, TILE, 4, '#a8604a');
        px(g, X, Y + 29, TILE, 3, '#5e3426');
        if (n > 0.6) px(g, X + 4, Y + 10, 20, 2, '#a8604a');
        break;
      case T.DOOR:
        px(g, X, Y, TILE, TILE, '#8a6a44');
        px(g, X + 6, Y + 2, 20, 30, '#57422c'); px(g, X + 14, Y + 14, 4, 4, '#caa84a');
        break;
      case T.RUINF:
        px(g, X, Y, TILE, TILE, '#3a3d54');
        px(g, X, Y + 15, TILE, 1, '#31344a'); px(g, X + 15, Y, 1, 15, '#31344a'); px(g, X + 7, Y + 15, 1, 17, '#31344a'); px(g, X + 23, Y + 15, 1, 17, '#31344a');
        if (n > 0.7) px(g, X + 12, Y + 4, 2, 8, '#2c2f44');
        break;
      case T.RUINW:
        px(g, X, Y, TILE, TILE, '#22243a');
        px(g, X + 2, Y - 4, 28, 30, '#494d6b');
        px(g, X + 4, Y - 4, 24, 4, '#5b6084');
        if (n > 0.6) px(g, X + 8, Y + 8, 8, 6, '#3c3f58');
        break;
      default:
        base();
    }
    function base() {
      px(g, X, Y, TILE, TILE, def.kind === 'marsh' ? '#2f4a35' : def.kind === 'ruins' ? '#33364e' : '#33603e');
      const nn = tileNoise(x * 2, y * 3, seed);
      if (nn > 0.72) px(g, X + 6, Y + 8, 2, 4, def.kind === 'marsh' ? '#3a5a40' : '#3d6f48');
      if (nn < 0.12) px(g, X + 20, Y + 20, 3, 3, '#2c5436');
    }
  }
  // 建筑整体加屋檐阴影：找房子顶行
  return c;
}

/* ---------------- 全局运行态 ---------------- */
function makeMist(seed) {
  const c = document.createElement('canvas'); c.width = 240; c.height = 180;
  const g = c.getContext('2d');
  const rng = C.makeRng(seed >>> 0);
  for (let i = 0; i < 26; i++) {
    const x = rng.next() * 240, y = rng.next() * 180, r = 18 + rng.next() * 44;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(225,238,250,0.16)'); gr.addColorStop(1, 'rgba(225,238,250,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  return c;
}
let S = null;              // core 存档状态
let rt = null;             // 运行时
let panel = null;          // 当前面板名（暂停）
let trib = null;           // 天劫小游戏
let dead = 0;              // 死亡计时无限
let title = true;
let titleRoot = null, titleSeed = 0;
let keys = {};
let mouse = { x: 0, y: 0, down: false };
let cam = { x: 0, y: 0 };
let msgQueue = [];
let lastT = 0, acc = { save: 0, med: 0 };

function newRt(mapId) {
  const data = C.genMap(mapId, S.seed);
  const spawns = C.genSpawns(mapId, S.seed, data);
  const layer = renderMapLayer(data);
  // minimap
  const mc = document.createElement('canvas'); mc.width = data.w; mc.height = data.h;
  const mg = mc.getContext('2d'); const img = mg.createImageData(data.w, data.h);
  const colr = { 0: [51, 96, 62], 1: [122, 106, 76], 2: [44, 84, 128], 3: [24, 60, 32], 4: [107, 111, 117], 5: [51, 96, 62], 6: [138, 106, 68], 7: [111, 91, 64], 8: [138, 106, 68], 9: [58, 110, 52], 10: [36, 63, 51], 11: [58, 61, 84], 12: [73, 77, 107] };
  for (let i = 0; i < data.tiles.length; i++) { const c2 = colr[data.tiles[i]] || [0, 0, 0]; img.data[i * 4] = c2[0]; img.data[i * 4 + 1] = c2[1]; img.data[i * 4 + 2] = c2[2]; img.data[i * 4 + 3] = 255; }
  mg.putImageData(img, 0, 0);
  return {
    mapId, data, layer, mini: mc,
    mist: (MAP_DEFS[mapId].kind === 'forest' || MAP_DEFS[mapId].kind === 'marsh') ? makeMist(S.seed + mapId.length) : null,
    mobs: spawns.mobs.map(m => mkMob(m.kind, m.lvl, m.x, m.y)),
    boss: spawns.boss ? mkMob(spawns.boss.kind, spawns.boss.lvl, spawns.boss.x, spawns.boss.y) : null,
    herbs: data.herbs.map(hr => ({ ...hr, ready: true, t: 0 })),
    projs: [], parts: [], floats: [],
    realmTime: mapId === 'realm' ? MAP_DEFS.realm.timeLimit : null,
  };
}
function mkMob(kind, lvl, tx, ty) {  const st = C.enemyStats(kind, lvl, 0);
  return {
    kind, lvl, x: tx * TILE + 16, y: ty * TILE + 16, st, hp: st.hp,
    vx: 0, vy: 0, hitCd: 0, shotCd: 1 + Math.random() * 2, wander: Math.random() * 3, wx: 0, wy: 0,
    burn: 0, burnT: 0, dead: false, respawn: 0, flash: 0, boss: st.boss,
    homeX: tx, homeY: ty,
  };
}

/* ---------------- 消息 ---------------- */
function logMsg(text) {
  const box = document.createElement('div');
  box.className = 'logline'; box.textContent = text;
  logBox.appendChild(box);
  while (logBox.children.length > 6) logBox.removeChild(logBox.firstChild);
  setTimeout(() => { box.classList.add('fade'); }, 6500);
  setTimeout(() => { if (box.parentNode) box.remove(); }, 7500);
}
function floater(text, x, y, color) {
  if (rt) rt.floats.push({ text, x, y, color: color || '#fff', life: 1 });
}

/* ---------------- 世界事件 ---------------- */
function toast(msg, kind) {
  const d = document.createElement('div');
  d.className = 'toast' + (kind === 'bad' ? ' bad' : kind === 'gold' ? ' gold' : '');
  d.textContent = msg;
  $('toasts').appendChild(d);
  setTimeout(() => d.remove(), 2600);
}

function giveLoot(mob, tx, ty) {
  const loot = C.lootOf(S, mob.kind, mob.lvl, rngWrap);
  S.player.gold += loot.gold;
  let txt = '+' + loot.gold + ' 灵石';
  for (const k in loot.items) { C.addItem(S, k, loot.items[k]); txt += '　' + ITEMS[k].name + '×' + loot.items[k]; }
  floater(txt, tx, ty - 26, '#ffd76a');
}

function killMob(mob) {
  mob.dead = true;
  mob.respawn = mob.boss ? 120 : 22;
  const exp = mob.st.exp;
  C.gainExp(S, exp);
  floater('修为 +' + exp, mob.x, mob.y - 40, '#ffe28a');
  giveLoot(mob, mob.x, mob.y);
  S.player.kills++;
  burst(mob.x, mob.y, mob.boss ? '#ff6a6a' : '#c8c8c8', mob.boss ? 30 : 12);
  SFX.hit();
  if (mob.boss) { SFX.boom(); toast('讨伐【' + mob.st.name + '】成功！', 'gold'); }
}

function burst(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.283, v = 40 + Math.random() * 140;
    rt.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, life: 0.5 + Math.random() * 0.5, color, size: 2 + Math.random() * 3 });
  }
}

/* ---------------- 存档 ---------------- */
const QS = new URLSearchParams(location.search);
const IS_AUTO = QS.has('auto');
function save() {
  if (!S || IS_AUTO) return;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) {}
}
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || !s.player) return null;
    return s;
  } catch (e) { return null; }
}

/* ---------------- 进入地图 ---------------- */
function unstick() {
  // 若出生点陷入实体，螺旋寻找可通行点
  const p = S.player, d = rt.data;
  const tx = p.x / TILE | 0, ty = p.y / TILE | 0;
  if (C.walkable(d, tx, ty)) return;
  for (let r = 1; r < 8; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
      if (C.walkable(d, tx + dx, ty + dy)) {
        p.x = (tx + dx) * TILE + 16; p.y = (ty + dy) * TILE + 16;
        return;
      }
    }
  }
}
function enterMap(mapId, tx, ty) {
  if (mapId === 'realm') {
    const g = MAP_DEFS.realm.gate;
    if (S.player.stage < g.stage) { toast('境界不足：' + g.label, 'bad'); return; }
  }
  C.gotoMap(S, mapId, tx, ty);
  rt = newRt(mapId);
  unstick();
  if (mapId === 'realm') logMsg('踏入上古仙人遗迹，光阴之力蠢蠢欲动……（限时 ' + MAP_DEFS.realm.timeLimit + ' 秒）');
  else logMsg('来到 ' + MAP_DEFS[mapId].name + '。');
  save();
}

function exitTo(ex) {
  if (ex.to === '__realm') {
    const g = MAP_DEFS.realm.gate;
    if (S.player.stage < g.stage) { toast('仙人遗迹被禁制封锁：' + g.label, 'bad'); return; }
    enterMap('realm', 32, 44);
    return;
  }
  const def = MAP_DEFS[ex.to];
  if (def.gate && S.player.stage < def.gate.stage) { toast('前方禁制森然：' + def.gate.label, 'bad'); return; }
  enterMap(ex.to, ex.tx, ex.ty);
}

/* ---------------- 天劫 ---------------- */
function startTrib(cfg) {
  trib = {
    cfg, tLeft: cfg.surviveMs / 1000, bolts: [], spawnT: 0, done: false,
    px: W / 2, py: H / 2 + 40, invuln: 0, dashCd: 0,
    hp0: S.player.hp, flash: 0,
  };
  logMsg('天劫降临！以残影步（Shift）避开天雷，坚持 ' + Math.round(cfg.surviveMs / 1000) + ' 秒！');
  SFX.bolt();
}
function tribUpdate(dt) {
  const t = trib; if (!t || t.done) return;
  const p = S.player;
  t.tLeft -= dt;
  t.spawnT -= dt;
  t.invuln = Math.max(0, t.invuln - dt);
  t.dashCd = Math.max(0, t.dashCd - dt);
  t.flash = Math.max(0, t.flash - dt);
  // 移动
  let mx = 0, my = 0;
  if (!panel && dead === 0) {
    if (keys.KeyA || keys.ArrowLeft) mx--; if (keys.KeyD || keys.ArrowRight) mx++;
    if (keys.KeyW || keys.ArrowUp) my--; if (keys.KeyS || keys.ArrowDown) my++;
  }
  const spd = 190;
  if (mx || my) { const l = Math.hypot(mx, my); t.px += mx / l * spd * dt; t.py += my / l * spd * dt; }
  if ((keys.ShiftLeft || keys.ShiftRight) && t.dashCd <= 0 && (mx || my)) {
    const l = Math.hypot(mx, my) || 1;
    t.px += mx / l * 130; t.py += my / l * 130;
    t.invuln = 0.35; t.dashCd = p.body.shadow ? 1.1 : 2.0; SFX.dash();
  }
  const arenaR = Math.min(W, H) * 0.38;
  const cx = W / 2, cy = H / 2 + 40;
  t.px = Math.max(cx - arenaR, Math.min(cx + arenaR, t.px));
  t.py = Math.max(cy - arenaR, Math.min(cy + arenaR, t.py));
  // 落雷
  if (t.spawnT <= 0) {
    t.spawnT = Math.max(t.tLeft / Math.max(1, t.cfg.count), 0.28);
    for (let i = 0; i < t.cfg.volley; i++) {
      const a = Math.random() * 6.283, rr = Math.random() * arenaR;
      t.bolts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr, warn: t.cfg.warnMs / 1000, r: t.cfg.radius, hitDone: false });
    }
    if (t.bolts.length > 40) t.bolts.splice(0, t.bolts.length - 40);
  }
  for (const b of t.bolts) {
    b.warn -= dt;
    if (b.warn <= 0 && !b.hitDone) {
      b.hitDone = true; b.flash = 0.25; SFX.bolt();
      if (t.invuln <= 0 && Math.hypot(b.x - t.px, b.y - t.py) < b.r + 12) {
        const d = Math.max(1, Math.round(p.hpMax * t.cfg.dmgFrac));
        p.hp -= d; t.flash = 0.3;
        floater('-' + d, t.px, t.py - 30, '#ff7a7a');
        SFX.hurt();
        if (p.hp <= 0) { finishTrib(false); return; }
      }
    }
    if (b.hitDone) b.flash = Math.max(0, (b.flash || 0) - dt);
  }
  t.bolts = t.bolts.filter(b => !(b.hitDone && b.flash <= 0));
  if (rt) { for (const f of rt.floats) { f.y -= 36 * dt; f.life -= dt; } rt.floats = rt.floats.filter(f => f.life > 0); }
  if (t.tLeft <= 0) finishTrib(true);
}
function finishTrib(win) {
  trib.done = true;
  const p = S.player;
  setTimeout(() => {
    const r = C.tribulationResult(S, win);
    trib = null;
    if (win) { SFX.level(); toast(r.msg + '！', 'gold'); logMsg(r.msg); }
    else { SFX.fail(); toast(r.msg, 'bad'); logMsg(r.msg); }
    p.hp = Math.max(1, p.hp);
    save(); renderChar();
  }, 700);
}

/* ---------------- 输入 ---------------- */
window.addEventListener('keydown', e => {
  if (e.repeat) return;
  keys[e.code] = true;
  if (title) return;
  if (e.code === 'Escape') { if (trib) return; closePanel(); return; }
  if (panel) { handlePanelKey(e.code); return; }
  if (e.code === 'KeyC' || e.code === 'KeyI') openPanel('char');
  if (e.code === 'KeyT' && !trib) tryDoBreakthrough();
  if (e.code === 'KeyR' && !trib && dead === 0 && rt) { meditating = !meditating; if (meditating) logMsg('盘膝打坐，吐纳天地灵气……'); }
  if (e.code === 'KeyE' && !trib && dead === 0 && rt) tryInteract();
  if (e.code === 'Digit1') quickUse('huxin');
  if (e.code === 'Digit2') quickUse('juqi');
  if (e.code === 'Digit3') quickUse('muye');
  if (['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
cv.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
cv.addEventListener('mousedown', e => { if (!title) { mouse.down = true; audio(); } });
window.addEventListener('mouseup', () => mouse.down = false);
window.addEventListener('blur', () => { keys = {}; mouse.down = false; });

function quickUse(id) {
  if (panel || trib) return;
  const r = C.useItem(S, id);
  if (r.ok) { SFX.pill(); toast(r.msg); if (r.fx) burst(S.player.x, S.player.y - 10, r.fx === 'heal' ? '#7aff8a' : r.fx === 'mana' ? '#7ab8ff' : '#ffe28a', 16); }
  else if (S.player.inv[id]) toast(r.msg, 'bad');
}

/* ---------------- 交互 ---------------- */
function nearPoi() {
  const p = S.player, def = MAP_DEFS[p.map];
  // NPC / 丹炉（村）
  if (p.map === 'village') {
    const V = C.VILLAGE_POINTS;
    for (const [key, pt, fn] of [
      ['药王古翁', V.herbElder, () => { toast('古翁为你疗伤，气血尽复。'); p.hp = p.hpMax; SFX.pill(); if (!S.flags.intro2) { S.flags.intro2 = true; logMsg('古翁：“后生，采青冥草、炼丹服食，修行一途，丹药为辅，心性或才是根本。”'); toast('提示：按 C 打开角色面板，可突破境界'); } }],
      ['游方商人', V.merchant, () => openPanel('shop')],
      ['丹炉', V.furnace, () => openPanel('furnace')],
    ]) {
      if (Math.hypot(pt.x * TILE + 16 - p.x, pt.y * TILE + 16 - p.y) < 52) return { label: key, act: fn };
    }
  }
  // 灵草
  if (rt) for (const h of rt.herbs) {
    if (h.ready && Math.hypot(h.x * TILE + 16 - p.x, h.y * TILE + 16 - p.y) < 44) {
      return { label: '采集 ' + ITEMS[h.item].name, act: () => {
        h.ready = false; h.t = 40;
        C.addItem(S, h.item, 1); SFX.pick();
        floater('+' + ITEMS[h.item].name, h.x * TILE + 16, h.y * TILE, '#8aff9a');
      } };
    }
  }
  // 出口
  for (const ex of def.exits || []) {
    if (Math.abs(ex.x * TILE + 16 - p.x) < 48 && Math.abs(ex.y * TILE + 16 - p.y) < 48) {
      return { label: ex.label, act: () => exitTo(ex) };
    }
  }
  return null;
}
function tryInteract() {
  const poi = nearPoi();
  if (poi) poi.act();
}

/* ---------------- 突破 ---------------- */
function tryDoBreakthrough() {
  const p = S.player;
  const chk = C.canBreakthrough(S);
  if (!chk.ok) { toast(chk.msg, 'bad'); return; }
  const r = C.tryBreakthrough(S, performance.now());
  if (!r.ok) { toast(r.msg, 'bad'); return; }
  if (r.success) {
    if (r.needTrib) { startTrib(r.tribCfg); SFX.level(); save(); }
    else {
      p.stage++; p.exp = 0; p.breakFail = 0;
      C.recalc(S); p.hp = p.hpMax; p.mp = p.mpMax;
      SFX.level(); toast('突破成功！' + r.msg, 'gold'); logMsg(r.msg);
      burst(p.x, p.y - 16, '#ffe28a', 40); save();
    }
  } else {
    SFX.fail(); toast(r.msg, 'bad'); logMsg(r.msg); save();
  }
  renderChar();
}

/* ---------------- 面板 ---------------- */
function openPanel(name) { panel = name; panelMask.classList.remove('hidden'); $('panel-' + name).classList.remove('hidden'); if (name === 'char') renderChar(); if (name === 'shop') renderShop(); if (name === 'furnace') renderFurnace(); }
function closePanel() { if (!panel) return; $('panel-' + panel).classList.add('hidden'); panelMask.classList.add('hidden'); panel = null; }
function handlePanelKey(code) { /* 面板内只用鼠标 */ }

function invRows(filterTypes) {
  const p = S.player, out = [];
  for (const id in p.inv) {
    const it = ITEMS[id];
    if (!it || p.inv[id] <= 0) continue;
    if (filterTypes && !filterTypes.includes(it.type)) continue;
    out.push([it, p.inv[id]]);
  }
  return out;
}
function renderChar() {
  if (panel !== 'char') return;
  const p = S.player, root = C.spiritRoot(S), st = C.stageInfo(p.stage);
  const need = C.needExp(p.stage);
  const rate = Math.round(C.breakRate(S) * 100);
  const skis = p.skills.map(sk => {
    const s2 = SKILLS[sk];
    return `<button class="chip ${p.skill === sk ? 'on' : ''}" data-skill="${sk}" title="${s2.desc}">${s2.name}（${s2.mp}灵/${s2.cd.toFixed(1)}秒）</button>`;
  }).join('');
  const bodyTxt = [p.body.gold ? '金钟罩（受伤 -20%）' : null, p.body.shadow ? '缩地成寸（残影步冷却减半）' : null].filter(Boolean).join('、') || '无';
  const pills = invRows(['pill', 'scroll', 'herb', 'core']).map(([it, n]) =>
    `<div class="irow"><span class="iname">${it.name}</span><span class="icnt">×${n}</span><span class="idesc">${it.desc}</span>${
      it.type === 'pill' ? `<button data-use="${it.id}">服用</button>` :
      it.type === 'scroll' ? `<button data-learn="${it.id}">参悟</button>` : ''}</div>`).join('') || '<div class="idesc">空空如也</div>';
  const canB = p.exp >= need;
  $('panel-char-body').innerHTML = `
  <div class="cgrid">
    <div class="cbox"><h4>道基</h4>
      <div>境界：<b class="gold">${C.stageName(p.stage)}</b>　灵根：<b>${root.name}</b>（修炼 ×${root.mult}）</div>
      <div class="idesc">${root.desc}　寿元：${st.lifespan} 载</div>
      <div>气血 <b>${p.hp}</b> / ${p.hpMax}　灵力 <b>${p.mp}</b> / ${p.mpMax}</div>
      <div>攻击 <b>${C.playerAtk(S)}</b>　击杀 <b>${p.kills}</b>　灵石 <b class="gold">${p.gold}</b></div>
      <div>修炼速度：<b>${C.cultSpeed(S).toFixed(1)}</b> 修为/秒${p.permCult ? '（洗髓 +' + Math.round(p.permCult * 100) + '%）' : ''}</div>
    </div>
    <div class="cbox"><h4>修为</h4>
      <div>${p.exp} / ${need}</div>
      <div class="bar big"><div class="fill" style="width:${Math.min(100, p.exp / need * 100)}%;background:linear-gradient(90deg,#caa84a,#ffe28a)"></div></div>
      <div>${canB ? `修为圆满，突破成功率 <b class="gold">${rate}%</b>${p.breakBoost ? '（丹药 +'+Math.round(p.breakBoost*100)+'%）' : ''}${p.breakFail ? '（道行 +'+p.breakFail*15+'%）' : ''}` : '打坐（R）、服丹、杀伐皆可积攒修为'}</div>
      <div><button class="bigbtn ${canB ? 'ready' : ''}" id="brk" ${canB ? '' : 'disabled'}>⚡ 突破境界（T）</button></div>
    </div>
    <div class="cbox"><h4>功法（点击切换）</h4>${skis}<div class="idesc" style="margin-top:6px">体术：${bodyTxt}</div></div>
  </div>
  <h4>行囊</h4>
  <div class="ibox">${pills}</div>`;
  $('brk') && $('brk').addEventListener('click', tryDoBreakthrough);
  $('panel-char-body').querySelectorAll('[data-skill]').forEach(el => el.addEventListener('click', () => { S.player.skill = el.dataset.skill; renderChar(); }));
  $('panel-char-body').querySelectorAll('[data-use]').forEach(el => el.addEventListener('click', () => { const r = C.useItem(S, el.dataset.use); toast(r.msg, r.ok ? '' : 'bad'); if (r.ok) SFX.pill(); renderChar(); }));
  $('panel-char-body').querySelectorAll('[data-learn]').forEach(el => el.addEventListener('click', () => { const r = C.learnScroll(S, el.dataset.learn); toast(r.msg, r.ok ? '' : 'bad'); if (r.ok) SFX.learn(); renderChar(); }));
}
function renderShop() {
  const p = S.player;
  const goods = ['scrollAzure', 'scrollFlame', 'scrollVoid', 'bodyGold', 'stepShadow', 'huxin', 'juqi', 'zhujiP', 'muye', 'pojing']
    .filter(id => {
      const it = ITEMS[id];
      if (it.skill) return !p.skills.includes(it.skill);
      if (it.body) return !p.body[it.body];
      return true;
    });
  const buyRows = goods.map(id => {
    const it = ITEMS[id];
    return `<div class="irow"><span class="iname">${it.name}</span><span class="iprice gold">${it.price}灵石</span><span class="idesc">${it.desc}</span><button data-buy="${id}">购入</button></div>`;
  }).join('');
  const recRows = Object.keys(RECIPES).filter(rid => !S.knownRecipes.includes(rid)).map(rid => {
    const rec = RECIPES[rid];
    return `<div class="irow"><span class="iname">${ITEMS[rec.out].name}·丹方</span><span class="iprice gold">${rec.cost}灵石</span><button data-rec="${rid}">购方</button></div>`;
  }).join('');
  const sellRows = invRows(['herb', 'core']).map(([it, n]) =>
    `<div class="irow"><span class="iname">${it.name}</span><span class="icnt">×${n}</span><button data-sell="${it.id}">售出（${Math.max(1, Math.round(it.price * 0.6))}灵石）</button></div>`).join('') || '<div class="idesc">无货可售</div>';
  $('panel-shop-body').innerHTML = `<div class="two">
    <div><h4>游方货摊（灵石 ${p.gold}）</h4>${buyRows}${recRows}</div>
    <div><h4>收购</h4>${sellRows}</div></div>`;
  const q = sel => $('panel-shop-body').querySelectorAll(sel);
  q('[data-buy]').forEach(el => el.addEventListener('click', () => { const r = C.buy(S, el.dataset.buy); toast(r.msg, r.ok ? '' : 'bad'); if (r.ok) SFX.buy(); renderShop(); }));
  q('[data-rec]').forEach(el => el.addEventListener('click', () => { const r = C.learnRecipe(S, el.dataset.rec); toast(r.msg, r.ok ? '' : 'bad'); if (r.ok) SFX.buy(); renderShop(); }));
  q('[data-sell]').forEach(el => el.addEventListener('click', () => { const r = C.sell(S, el.dataset.sell); toast(r.msg, r.ok ? '' : 'bad'); if (r.ok) SFX.buy(); renderShop(); }));
}
function renderFurnace() {
  const p = S.player;
  const upCost = [0, 320, 960][S.furnaceLvl + 1];
  const rows = Object.keys(RECIPES).map(rid => {
    const rec = RECIPES[rid], known = S.knownRecipes.includes(rid);
    const needTxt = Object.keys(rec.need).map(k => `<span class="${C.countItem(S, k) >= rec.need[k] ? '' : 'lack'}">${ITEMS[k].name}×${rec.need[k]}（${C.countItem(S, k)}）</span>`).join(' ');
    const chk = C.canRefine(S, rid);
    return `<div class="irow"><span class="iname">${ITEMS[rec.out].name}</span><span class="idesc">${needTxt}</span>${
      known ? `<span class="iprice">成率${Math.round(C.refineRate(S, rid) * 100)}%</span><button data-ref="${rid}" ${chk.ok ? '' : 'disabled'}>开炉</button>` : '<span class="idesc">（丹方未习得）</span>'}</div>`;
  }).join('');
  $('panel-furnace-body').innerHTML = `
    <div class="idesc" style="margin-bottom:8px">${['凡铁丹炉', '青纹丹炉', '九转紫金炉'][S.furnaceLvl]}　成率 +${Math.round(C.furnaceBonus(S) * 100)}%　
    ${upCost ? `<button id="fup">升级丹炉（${upCost} 灵石，现有 ${p.gold}）</button>` : ''}</div>
    ${rows}`;
  $('fup') && $('fup').addEventListener('click', () => { const r = C.upgradeFurnace(S); toast(r.msg, r.ok ? '' : 'bad'); if (r.ok) { SFX.buy(); renderFurnace(); } });
  $('panel-furnace-body').querySelectorAll('[data-ref]').forEach(el => el.addEventListener('click', () => {
    const r = C.refine(S, el.dataset.ref);
    if (r.ok) {
      if (r.success) { SFX.ok(); toast(r.msg, 'gold'); } else { SFX.fail(); toast(r.msg, 'bad'); }
      logMsg(r.msg);
    } else toast(r.msg, 'bad');
    renderFurnace();
  }));
}
panelMask.addEventListener('click', closePanel);

/* ---------------- 主更新 ---------------- */
let meditating = false;
function update(dt, now) {
  if (!S || !rt || title) return;
  const p = S.player;
  S.player.playSec += dt;

  // 天劫接管
  if (trib) { tribUpdate(dt); camFollow(dt); return; }
  // 死亡计时
  if (dead > 0) { dead -= dt; if (dead <= 0) respawnPlayer(); }

  const frozen = !!panel;
  if (!frozen && dead <= 0 && p.alive) {
    // —— 移动
    let mx = 0, my = 0;
    if (keys.KeyA || keys.ArrowLeft) mx--; if (keys.KeyD || keys.ArrowRight) mx++;
    if (keys.KeyW || keys.ArrowUp) my--; if (keys.KeyS || keys.ArrowDown) my++;
    if (meditating && (mx || my)) meditating = false;
    let spd = 165;
    if (dash.t > 0) { dash.t -= dt; spd = 430; }
    if (dash.cd > 0) dash.cd -= dt;
    if ((keys.ShiftLeft || keys.ShiftRight) && dash.cd <= 0 && (mx || my) && !meditating) {
      dash.t = 0.14; dash.cd = p.body.shadow ? 1.1 : 2.2; dash.inv = 0.3; SFX.dash();
      for (let i = 0; i < 5; i++) rt.parts.push({ x: p.x, y: p.y, vx: (Math.random() - 0.5) * 40, vy: -20 - Math.random() * 30, life: 0.4, color: '#9ab8ff', size: 2 });
    }
    if (dash.inv > 0) dash.inv -= dt;
    if (mx || my) {
      const l = Math.hypot(mx, my); mx /= l; my /= l;
      moveEntity(p, mx * spd * dt, my * spd * dt, 11);
      p.dir = Math.abs(mx) > Math.abs(my) ? (mx > 0 ? 'side' : 'side') : (my > 0 ? 'down' : 'up');
      p.animT = (p.animT || 0) + dt;
    } else p.animT = 0;
    // —— 打坐
    if (meditating) {
      const gain = C.meditateGain(S, dt);
      acc.med += gain;
      if (acc.med >= 1) { const g = Math.floor(acc.med); acc.med -= g; C.gainExp(S, g); }
      p.hp = Math.min(p.hpMax, p.hp + p.hpMax * 0.012 * dt);
      p.mp = Math.min(p.mpMax, p.mp + p.mpMax * 0.05 * dt);
      if (Math.random() < dt * 14) {
        const a = Math.random() * 6.283, r2 = 60 + Math.random() * 30;
        rt.parts.push({ x: p.x + Math.cos(a) * r2, y: p.y + Math.sin(a) * r2 - 10, vx: -Math.cos(a) * 90, vy: -Math.sin(a) * 90 - 20, life: 0.6, color: '#9fe8ff', size: 2, homing: true });
      }
    } else {
      p.mp = Math.min(p.mpMax, p.mp + p.mpMax * 0.015 * dt);
    }
    // —— 施法
    p.cd = Math.max(0, (p.cd || 0) - dt);
    if ((mouse.down || keys.Space) && p.cd <= 0 && !meditating) castSkill();
    // —— 出口自动触发
    const poi = nearPoi();
    if (poi && poi.label && (poi.label.startsWith('返回') || poi.label.startsWith('下山') || poi.label.startsWith('离开'))) { /* 需要按E，防误触 */ }
  }

  // —— 敌人 AI
  const liveAll = rt.mobs.concat(rt.boss ? [rt.boss] : []);
  for (const m of liveAll) {
    if (m.dead) {
      m.respawn -= dt;
      if (m.respawn <= 0 && p.map !== 'realm') {
        const st2 = C.enemyStats(m.kind, m.lvl, 0);
        m.dead = false; m.hp = st2.hp; m.st = st2; m.x = m.homeX * TILE + 16; m.y = m.homeY * TILE + 16;
      }
      continue;
    }
    m.hitCd = Math.max(0, m.hitCd - dt); m.shotCd = Math.max(0, m.shotCd - dt);
    m.flash = Math.max(0, m.flash - dt);
    if (m.burn > 0) {
      m.burn -= dt; m.burnT -= dt;
      if (m.burnT <= 0) { m.burnT = 0.5; hurtMob(m, Math.max(1, Math.round(m.st.atk * 0.12 + playerAtkFuzzy())), 'burn'); }
    }
    const dx = p.x - m.x, dy = p.y - m.y;
    const dist = Math.hypot(dx, dy);
    const aggro = m.boss ? 420 : 240;
    if (!frozen && dead <= 0 && dist < aggro && dist > 1) {
      const ux = dx / dist, uy = dy / dist;
      const stopAt = m.st.style === 'ranged' ? 170 : (m.st.r + 13);
      if (dist > stopAt) {
        moveEntity(m, ux * m.st.spd * dt, uy * m.st.spd * dt, m.st.r - 2);
      } else if (m.st.style === 'ranged' && m.shotCd <= 0) {
        m.shotCd = m.st.shot.cd;
        rt.projs.push({ x: m.x, y: m.y, vx: ux * m.st.shot.spd, vy: uy * m.st.shot.spd, dmg: Math.round(m.st.atk * m.st.shot.dmg), r: 6, life: 2.6, from: 'e', color: '#9a5aff' });
      }
      if (dist < m.st.r + 16 && m.hitCd <= 0) {
        m.hitCd = 0.9;
        hurtPlayer(m.st.atk);
      }
    } else if (!frozen) {
      // 游走
      m.wander -= dt;
      if (m.wander <= 0) { m.wander = 1 + Math.random() * 2; const a = Math.random() * 6.283; m.wx = Math.cos(a); m.wy = Math.sin(a); if (Math.random() < 0.4) { m.wx = 0; m.wy = 0; } }
      if (m.wx || m.wy) moveEntity(m, m.wx * m.st.spd * 0.35 * dt, m.wy * m.st.spd * 0.35 * dt, m.st.r - 2);
    }
  }

  // —— 投射物
  for (const pr of rt.projs) {
    pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.life -= dt;
    if (pr.trail === undefined) pr.trail = 0;
    pr.trail -= dt;
    if (pr.trail <= 0) { pr.trail = 0.02; rt.parts.push({ x: pr.x, y: pr.y, vx: 0, vy: 0, life: 0.18, color: pr.color, size: 2 }); }
    if (pr.from === 'p') {
      for (const m of liveAll) {
        if (m.dead || m.hitBy === pr.uid) continue;
        if (Math.hypot(m.x - pr.x, m.y - pr.y) < m.st.r + pr.r) {
          hurtMob(m, pr.dmg, pr.burn ? 'burnHit' : null, pr);
          m.hitBy = pr.uid;
          if (pr.burn) { m.burn = Math.max(m.burn, pr.burnDur); }
          burst(pr.x, pr.y, pr.color, 4);
          if (pr.pierce > 0) { pr.pierce--; } else { pr.life = 0; break; }
        }
      }
    } else {
      if (Math.hypot(p.x - pr.x, p.y - pr.y) < 13 + pr.r) { pr.life = 0; hurtPlayer(pr.dmg); }
    }
  }
  rt.projs = rt.projs.filter(pr => pr.life > 0 && C.walkable(rt.data, pr.x / TILE | 0, pr.y / TILE | 0));

  // —— 粒子
  for (const pt of rt.parts) { pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.vy += (pt.homing ? 0 : 60) * dt; pt.life -= dt; }
  rt.parts = rt.parts.filter(pt => pt.life > 0);
  // —— 漂浮文字
  for (const f of rt.floats) { f.y -= 36 * dt; f.life -= dt; }
  rt.floats = rt.floats.filter(f => f.life > 0);

  // —— 灵草刷新
  for (const h of rt.herbs) if (!h.ready) { h.t -= dt; if (h.t <= 0) h.ready = true; }

  // —— 遗迹限时
  if (rt.realmTime != null) {
    rt.realmTime -= dt;
    if (rt.realmTime <= 0) {
      toast('遗迹之力将你推出了空间！', 'bad');
      exitTo({ to: 'mount', tx: 78, ty: 35 });
    }
  }

  // —— 死亡
  if (!p.alive && dead <= 0 && !trib) {
    dead = 1.6;
    SFX.boom();
    const r = C.playerDies(S);
    toast(r.msg, 'bad'); logMsg(r.msg);
    save();
  }
  // —— 胜利
  if (S.finished && $('victory').classList.contains('hidden')) showVictory();

  camFollow(dt);
  // —— 自动存档
  acc.save += dt;
  if (acc.save > 20) { acc.save = 0; save(); }
}
const dash = { t: 0, cd: 0, inv: 0 };
let _paf = 0;
function playerAtkFuzzy() { return 0; }

function castSkill() {
  const p = S.player, sk = SKILLS[p.skill];
  if (p.mp < sk.mp) { if (!p.mpWarnT || performance.now() - p.mpWarnT > 1500) { p.mpWarnT = performance.now(); floater('灵力不足', p.x, p.y - 40, '#7ab8ff'); } return; }
  p.cd = sk.cd; p.mp -= sk.mp;
  const wx = mouse.x + cam.x, wy = mouse.y + cam.y;
  let ang = Math.atan2(wy - p.y, wx - p.x);
  if (keys.Space && !mouse.down && Math.abs(ang) === 0 && p.dir === 'up') ang = -Math.PI / 2;
  const uid = (castSkill._uid = (castSkill._uid || 0) + 1);
  for (let i = 0; i < sk.proj; i++) {
    const a = ang + (i - (sk.proj - 1) / 2) * sk.spread;
    rt.projs.push({ uid: uid + '.' + i, x: p.x + Math.cos(a) * 16, y: p.y + Math.sin(a) * 16 - 6, vx: Math.cos(a) * sk.speed, vy: Math.sin(a) * sk.speed, dmg: C.playerHitDamage(S, rngWrap), r: sk.id === 'voidc' ? 5 : 7, life: sk.range / sk.speed, from: 'p', color: sk.color, pierce: sk.pierce || 0, burn: sk.burn || 0, burnDur: sk.burnDur || 0, skill: sk.id });
  }
  SFX.atk();
}

function moveEntity(e, dx, dy, r) {
  const d = rt.data;
  const tryX = e.x + dx, tryY = e.y + dy;
  const chk = (x, y) => {
    for (const [ox, oy] of [[-r, 0], [r, 0], [0, -r], [0, r], [0, 0]]) {
      if (!C.walkable(d, (x + ox) / TILE | 0, (y + oy) / TILE | 0)) return false;
    }
    return true;
  };
  if (chk(tryX, e.y)) e.x = tryX;
  if (chk(e.x, tryY)) e.y = tryY;
}

function hurtMob(m, dmg, kind, pr) {
  if (m.dead) return;
  m.hp -= dmg;
  m.flash = 0.12;
  floater('-' + dmg, m.x + (Math.random() * 12 - 6), m.y - 20, kind === 'burn' ? '#ff9d4d' : '#ffe28a');
  if (m.hp <= 0) killMob(m);
}
function hurtPlayer(atk) {
  const p = S.player;
  if (dash.inv > 0) return;
  const d = C.damagePlayer(S, atk, rngWrap);
  floater('-' + d, p.x, p.y - 34, '#ff7a7a');
  SFX.hurt();
  if (meditating) meditating = false;
  if (!p.alive) return;
}

function respawnPlayer() {
  const p = S.player;
  const V = C.VILLAGE_POINTS.spawn;
  p.map = 'village';
  rt = newRt('village');
  C.gotoMap(S, 'village', V.x, V.y);
  unstick();
  meditating = false;
}

function camFollow(dt) {
  if (!rt || !S) return;
  const d = rt.data;
  const p = trib ? { x: 0, y: 0 } : S.player;
  if (trib) return;
  const tx = Math.max(0, Math.min(d.w * TILE - W, S.player.x - W / 2));
  const ty = Math.max(0, Math.min(d.h * TILE - H, S.player.y - H / 2));
  cam.x += (tx - cam.x) * Math.min(1, dt * 8);
  cam.y += (ty - cam.y) * Math.min(1, dt * 8);
  if (d.w * TILE < W) cam.x = (d.w * TILE - W) / 2;
  if (d.h * TILE < H) cam.y = (d.h * TILE - H) / 2;
}

/* ---------------- 渲染 ---------------- */
function draw() {
  ctx.fillStyle = '#0a0c14'; ctx.fillRect(0, 0, W, H);
  if (title || !S || !rt) { drawTitle(); return; }
  const d = rt.data;
  if (trib) { drawTribScene(); drawHud(); return; }
  ctx.save();
  ctx.translate(Math.round(-cam.x), Math.round(-cam.y));
  const x0 = Math.max(0, cam.x / TILE | 0), y0 = Math.max(0, cam.y / TILE | 0);
  const x1 = Math.min(d.w, (cam.x + W) / TILE + 1 | 0), y1 = Math.min(d.h, (cam.y + H) / TILE + 1 | 0);
  ctx.drawImage(rt.layer, 0, 0);
  // 雾
  if (rt.mist) {
    const t = performance.now();
    const dx = (t / 46) % 240, dy = (t / 90) % 180;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = MAP_DEFS[S.player.map].kind === 'marsh' ? 0.4 : 0.55;
    ctx.drawImage(rt.mist, cam.x - dx, cam.y - dy, W + 480, H + 360);
    ctx.restore();
  }
  // 灵草
  for (const h of rt.herbs) if (h.ready) {
    const X = h.x * TILE + 8, Y = h.y * TILE + 12;
    ctx.fillStyle = '#2e7d4f'; ctx.fillRect(X + 4, Y + 6, 3, 8); ctx.fillRect(X + 9, Y + 4, 3, 9); ctx.fillRect(X + 14, Y + 7, 3, 7);
    ctx.fillStyle = h.item === 'blood' ? '#e05a6a' : h.item === 'seven' ? '#9ab8ff' : '#7fe08a';
    ctx.beginPath(); ctx.arc(X + 11, Y + 2, 3.5, 0, 7); ctx.fill();
  }
  // 村中设施 & NPC
  if (S.player.map === 'village') {
    const V = C.VILLAGE_POINTS;
    drawSpr(SPR.furnace, V.furnace.x * TILE - 4, V.furnace.y * TILE - 8, 1.4);
    drawSpr(SPR.elder, V.herbElder.x * TILE, V.herbElder.y * TILE, 1.6);
    drawSpr(SPR.merchant, V.merchant.x * TILE, V.merchant.y * TILE, 1.6);
    label(V.herbElder, '药王古翁'); label(V.merchant, '游方商人'); label(V.furnace, '丹炉');
  }
  // 出口标记
  const def = MAP_DEFS[S.player.map];
  for (const ex of def.exits || []) {
    const X = ex.x * TILE + 16, Y = ex.y * TILE + 16;
    const pulse = 0.7 + 0.3 * Math.sin(performance.now() / 300);
    ctx.strokeStyle = ex.to === '__realm' ? `rgba(210,160,255,${pulse})` : `rgba(140,220,255,${pulse})`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(X, Y - 6, 14, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.arc(X, Y - 6, 8, performance.now() / 400 % 7, performance.now() / 400 % 7 + 4); ctx.stroke();
  }
  // 敌人
  const liveAll = rt.mobs.concat(rt.boss ? [rt.boss] : []);
  for (const m of liveAll) {
    if (m.dead) continue;
    if (m.x < cam.x - 60 || m.x > cam.x + W + 60 || m.y < cam.y - 60 || m.y > cam.y + H + 60) continue;
    if (m.flash > 0) { ctx.save(); ctx.globalAlpha = 0.65; }
    drawSpr(SPR[m.kind] || SPR.wolf, m.x - 16, m.y - 18, m.boss ? 1.5 : 1.3);
    if (m.flash > 0) ctx.restore();
    // 血条
    const bw = m.boss ? 48 : 30;
    if (m.hp < m.st.hpMax) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(m.x - bw / 2, m.y - m.st.r - 18, bw, 4);
      ctx.fillStyle = m.boss ? '#ff5a4a' : '#7aff8a'; ctx.fillRect(m.x - bw / 2, m.y - m.st.r - 18, bw * m.hp / m.st.hpMax, 4);
    }
    if (m.boss) {
      ctx.fillStyle = '#ffb0a0'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(m.st.name, m.x, m.y - m.st.r - 24);
    }
  }
  // 玩家
  drawPlayer();
  // 投射物
  for (const pr of rt.projs) {
    ctx.save();
    ctx.shadowColor = pr.color; ctx.shadowBlur = 10;
    ctx.fillStyle = pr.color;
    if (pr.skill === 'voidc') {
      ctx.save(); ctx.translate(pr.x, pr.y); ctx.rotate(Math.atan2(pr.vy, pr.vx));
      ctx.fillRect(-16, -1.5, 32, 3); ctx.restore();
    } else { ctx.beginPath(); ctx.arc(pr.x, pr.y, pr.r, 0, 7); ctx.fill(); }
    ctx.restore();
  }
  // 粒子
  for (const pt of rt.parts) {
    ctx.globalAlpha = Math.max(0, Math.min(1, pt.life * 2));
    ctx.fillStyle = pt.color; ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
  }
  ctx.globalAlpha = 1;
  // 漂浮文字
  ctx.textAlign = 'center'; ctx.font = 'bold 13px "Microsoft YaHei", sans-serif';
  for (const f of rt.floats) {
    ctx.globalAlpha = Math.max(0, Math.min(1, f.life * 1.6));
    ctx.fillStyle = '#000'; ctx.fillText(f.text, f.x + 1, f.y + 1);
    ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // 氛围与交互提示
  drawAtmosphere();
  if (!panel && dead <= 0) {
    const poi = nearPoi();
    if (poi) {
      const p = S.player;
      const sx = p.x - cam.x, sy = p.y - cam.y - 52;
      ctx.font = '12px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center';
      const tw = ctx.measureText(poi.label).width + 16;
      ctx.fillStyle = 'rgba(10,14,26,0.85)'; roundRect(sx - tw / 2, sy - 14, tw, 20, 5); ctx.fill();
      ctx.fillStyle = '#ffe28a'; ctx.fillText('[E] ' + poi.label, sx, sy);
    }
    if (meditating) {
      ctx.fillStyle = '#9fe8ff'; ctx.font = '13px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('打坐中（修为 +' + C.cultSpeed(S).toFixed(1) + '/秒，移动取消）', W / 2, 120);
    }
  }
  if (dead > 0) {
    ctx.fillStyle = 'rgba(60,0,0,0.45)'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ffd0d0'; ctx.font = 'bold 30px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('道基受损，昏迷……', W / 2, H / 2);
  }
  if (rt.realmTime != null) {
    ctx.fillStyle = '#d8b8ff'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('遗迹崩解：' + Math.ceil(rt.realmTime) + ' 秒', W / 2, 96);
  }
  drawHud();
  drawMinimap();
}

function drawSpr(img, x, y, scale) {
  const w = img.width * scale, h = img.height * scale;
  ctx.drawImage(img, Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}
function label(pt, text) {
  const sx = pt.x * TILE + 12, sy = pt.y * TILE - 12;
  ctx.font = '11px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillText(text, sx + 1, sy + 1);
  ctx.fillStyle = '#cfe8ff'; ctx.fillText(text, sx, sy);
}
function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

function drawPlayer() {
  const p = S.player;
  if (dash.inv > 0 && Math.floor(performance.now() / 60) % 2) ctx.globalAlpha = 0.5;
  if (meditating) {
    drawSpr(SPR.playerSit, p.x - 16, p.y - 22, 2);
    const t = performance.now() / 600;
    ctx.strokeStyle = 'rgba(159,232,255,' + (0.4 + 0.3 * Math.sin(t * 2)) + ')';
    ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y - 8, 26 + Math.sin(t * 2) * 4, 0, 7); ctx.stroke();
  } else {
    const bob = p.animT ? Math.sin(p.animT * 12) * 1.5 : 0;
    drawSpr(SPR.player[p.dir || 'down'], p.x - 16, p.y - 26 + bob, 2);
  }
  ctx.globalAlpha = 1;
  // 施法朝向瞄准
  const wx = mouse.x + cam.x, wy = mouse.y + cam.y;
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, 7); ctx.stroke();
}

function drawAtmosphere() {
  const kind = MAP_DEFS[S.player.map].kind;
  const tint = { village: 'rgba(255,230,160,0.05)', forest: 'rgba(60,90,70,0.16)', mount: 'rgba(120,110,80,0.10)', marsh: 'rgba(40,90,70,0.22)', ruins: 'rgba(90,70,160,0.20)' }[kind];
  ctx.fillStyle = tint; ctx.fillRect(0, 0, W, H);
  // 暗角
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.42)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

function drawHud() {
  const p = S.player;
  const need = C.needExp(p.stage);
  const x = 16, y = 14;
  ctx.save();
  ctx.fillStyle = 'rgba(10,14,26,0.6)'; roundRect(x - 6, y - 6, 300, 108, 8); ctx.fill();
  ctx.font = 'bold 14px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'left';
  ctx.fillStyle = '#ffe28a';
  ctx.fillText(C.stageName(p.stage) + '　·　' + C.spiritRoot(S).name, x, y + 12);
  bar(x, y + 22, 280, 12, p.hp / p.hpMax, 'rgba(224,74,74,0.9)', '气血 ' + Math.ceil(p.hp) + '/' + p.hpMax);
  bar(x, y + 40, 280, 12, p.mp / p.mpMax, 'rgba(74,140,224,0.9)', '灵力 ' + Math.floor(p.mp) + '/' + p.mpMax);
  bar(x, y + 58, 280, 12, Math.min(1, p.exp / need), 'rgba(212,178,74,0.9)', '修为 ' + p.exp + '/' + need + (p.exp >= need ? '　✦ 可突破（T）' : ''));
  ctx.font = '12px "Microsoft YaHei", sans-serif';
  ctx.fillStyle = '#cfd6e8';
  ctx.fillText('灵石 ' + p.gold + '　' + MAP_DEFS[p.map].name + '　击杀 ' + p.kills, x, y + 94);
  // 快捷丹
  const quick = [['huxin', '1'], ['juqi', '2'], ['muye', '3']];
  let qx = W - 250;
  ctx.fillStyle = 'rgba(10,14,26,0.6)'; roundRect(qx - 10, H - 46, 250, 36, 8); ctx.fill();
  for (const [id, k] of quick) {
    const n = C.countItem(S, id);
    ctx.font = '12px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = n > 0 ? '#ffe28a' : '#5a6070';
    ctx.fillText('[' + k + ']' + ITEMS[id].name + '×' + n, qx, H - 22);
    qx += 82;
  }
  ctx.restore();
  // 顶部提示（首次）
  if (!S.flags.tipShown && S.player.stage < 2) {
    ctx.fillStyle = 'rgba(10,14,26,0.7)'; ctx.font = '12px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center';
    const t = 'WASD 移动 · 鼠标点击/空格 施法 · Shift 残影步 · E 交互 · R 打坐 · C 角色';
    roundRect(W / 2 - 270, 10, 540, 24, 6); ctx.fill();
    ctx.fillStyle = '#9fe8ff'; ctx.fillText(t, W / 2, 27);
  }
}
function bar(x, y, w, h, r, col, text) {
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; roundRect(x, y, w, h, 4); ctx.fill();
  ctx.fillStyle = col; roundRect(x, y, Math.max(0, Math.min(1, r)) * w, h, 4); ctx.fill();
  ctx.font = '10px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'left';
  ctx.fillStyle = '#fff'; ctx.fillText(text, x + 6, y + h - 3);
}

function drawMinimap() {
  const d = rt.data, p = S.player;
  const scale = Math.min(150 / d.w, 110 / d.h);
  const w = d.w * scale, h = d.h * scale;
  mini.style.width = (w + 8) + 'px'; mini.style.height = (h + 8) + 'px';
  mctx.clearRect(0, 0, mini.width, mini.height);
  mctx.drawImage(rt.mini, 0, 0, d.w, d.h, 4, 4, w, h);
  for (const ex of MAP_DEFS[p.map].exits || []) {
    mctx.fillStyle = ex.to === '__realm' ? '#d2a0ff' : '#8cdcff';
    mctx.fillRect(4 + ex.x * scale - 2, 4 + ex.y * scale - 2, 4, 4);
  }
  if (rt.boss && !rt.boss.dead) { mctx.fillStyle = '#ff5a4a'; mctx.fillRect(4 + rt.boss.x / TILE * scale - 2, 4 + rt.boss.y / TILE * scale - 2, 5, 5); }
  for (const m of rt.mobs) if (!m.dead) { mctx.fillStyle = 'rgba(255,180,120,0.9)'; mctx.fillRect(4 + m.x / TILE * scale - 1, 4 + m.y / TILE * scale - 1, 2, 2); }
  mctx.fillStyle = '#fff';
  mctx.fillRect(4 + p.x / TILE * scale - 2, 4 + p.y / TILE * scale - 2, 4, 4);
}

function drawTribScene() {
  const t = trib;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#150e2a'); g.addColorStop(1, '#241436');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const arenaR = Math.min(W, H) * 0.38, cx = W / 2, cy = H / 2 + 40;
  ctx.strokeStyle = 'rgba(160,120,255,0.35)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, arenaR, 0, 7); ctx.stroke();
  // 预警圈与落雷
  for (const b of t.bolts) {
    if (!b.hitDone) {
      const r2 = b.r * (0.4 + 0.6 * (1 - Math.max(0, b.warn) / (t.cfg.warnMs / 1000)));
      ctx.strokeStyle = 'rgba(255,220,120,0.8)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.stroke();
      ctx.fillStyle = 'rgba(255,220,120,0.15)';
      ctx.beginPath(); ctx.arc(b.x, b.y, r2, 0, 7); ctx.fill();
    } else if (b.flash > 0) {
      ctx.fillStyle = 'rgba(190,150,255,' + b.flash * 2.2 + ')';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 1.1, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(240,230,255,' + b.flash * 3 + ')'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(b.x, 0); ctx.lineTo(b.x + (Math.random() * 30 - 15), b.y * 0.5); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
  }
  // 玩家
  ctx.save();
  if (t.flash > 0) { ctx.shadowColor = '#ff5a5a'; ctx.shadowBlur = 30; }
  else { ctx.shadowColor = '#9ab8ff'; ctx.shadowBlur = 16; }
  drawSpr(t.invuln > 0 && Math.floor(performance.now() / 60) % 2 ? SPR.playerSit : SPR.player.down, t.px - 16, t.py - 26, 2);
  ctx.restore();
  // 文字
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e2c9ff'; ctx.font = 'bold 22px "Microsoft YaHei", sans-serif';
  ctx.fillText('「' + (C.STAGES[Math.min(S.player.stage + 1, C.STAGES.length - 1)].trib != null ? '天　劫' : '天劫') + '」', W / 2, 70);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 17px "Microsoft YaHei", sans-serif';
  ctx.fillText('坚持 ' + Math.max(0, t.tLeft).toFixed(1) + ' 秒　气血 ' + Math.ceil(S.player.hp) + '/' + S.player.hpMax, W / 2, 100);
  ctx.fillStyle = '#9ab8ff'; ctx.font = '12px "Microsoft YaHei", sans-serif';
  ctx.fillText('WASD 移动 · Shift 残影步（短暂无敌）', W / 2, H - 40);
  for (const f of (rt ? rt.floats : [])) {
    ctx.globalAlpha = Math.max(0, Math.min(1, f.life * 1.6));
    ctx.fillStyle = f.color; ctx.font = 'bold 14px sans-serif'; ctx.fillText(f.text, f.x, f.y);
    ctx.globalAlpha = 1;
  }
}

/* ---------------- 标题画面 ---------------- */
let titleStars = null;
function drawTitle() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0b1024'); g.addColorStop(0.6, '#1a1430'); g.addColorStop(1, '#2a1a34');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  if (!titleStars) {
    titleStars = [];
    for (let i = 0; i < 140; i++) titleStars.push({ x: Math.random(), y: Math.random() * 0.7, r: Math.random() * 1.6 + 0.4, p: Math.random() * 6 });
  }
  const now = performance.now() / 1000;
  for (const st of titleStars) {
    ctx.globalAlpha = 0.3 + 0.5 * Math.abs(Math.sin(st.p + now));
    ctx.fillStyle = '#dfe8ff';
    ctx.fillRect(st.x * W, st.y * H, st.r, st.r);
  }
  ctx.globalAlpha = 1;
  // 远山
  ctx.fillStyle = '#141228';
  ctx.beginPath(); ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 24) ctx.lineTo(x, H * 0.72 - Math.abs(Math.sin(x * 0.002 + 1)) * H * 0.2 - Math.sin(x * 0.007) * 24);
  ctx.lineTo(W, H); ctx.fill();
  ctx.fillStyle = '#0d0b1c';
  ctx.beginPath(); ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 24) ctx.lineTo(x, H * 0.84 - Math.abs(Math.sin(x * 0.0016 + 4)) * H * 0.14);
  ctx.lineTo(W, H); ctx.fill();
  // 月
  ctx.save(); ctx.shadowColor = '#ffe9b8'; ctx.shadowBlur = 60;
  ctx.fillStyle = '#ffedc2'; ctx.beginPath(); ctx.arc(W * 0.78, H * 0.2, 46, 0, 7); ctx.fill();
  ctx.restore();
}

function showVictory() {
  $('victory').classList.remove('hidden');
  const p = S.player;
  $('vstats').textContent = `历经 ${Math.round(p.playSec / 60)} 分钟 · 斩妖 ${p.kills} · 炼丹 ${p.pillsMade} 枚 · 渡劫 ${p.tribDone} 次 · 重伤 ${p.deaths} 回`;
}
$('restart').addEventListener('click', () => { localStorage.removeItem(SAVE_KEY); location.reload(); });

/* ---------------- 标题流程 ---------------- */
function bootTitle() {
  const hasSave = !!loadSave();
  $('btn-continue').style.display = hasSave ? '' : 'none';
  title = true;
  rollNewSeed();
  $('btn-new').addEventListener('click', () => startGame(C.newGame(titleSeed, titleRoot)));
  $('btn-continue').addEventListener('click', () => {
    const s = loadSave();
    if (s) startGame(s, true);
  });
  $('btn-reroll').addEventListener('click', () => { rollNewSeed(true); });
  audio();
  requestAnimationFrame(loop);
}
function rollNewSeed(force) {
  if (force || titleSeed === 0) {
    titleSeed = (Math.random() * 0xffffffff) >>> 0;
    // 预掷灵根（预览展示）
    const probe = C.newGame(titleSeed);
    titleRoot = probe.player.root;
  }
  const root = C.SPIRIT_ROOTS.find(r => r.id === titleRoot);
  $('root-name').textContent = root.name;
  $('root-desc').textContent = root.desc + '（修炼速度 ×' + root.mult + '）';
  $('root-name').style.color = { hetero: '#c8c8c8', double: '#8fd48f', terra: '#7ab8ff', chaos: '#e2a6ff' }[root.id];
  $('seed-tip').textContent = '仙缘 ' + titleSeed.toString(36);
}
function startGame(s, fromSave) {
  S = s; title = false;
  if (S.player) S.player.breakCdUntil = 0; // 存档里的突破冷却基于旧会话时钟，作废
  $('title').classList.add('hidden');
  const V = C.VILLAGE_POINTS.spawn;
  if (!fromSave) { C.gotoMap(S, 'village', V.x, V.y); S.flags.tipShown = false; }
  rt = newRt(S.player.map);
  C.gotoMap(S, S.player.map, S.player.x / TILE, S.player.y / TILE);
  unstick();
  resize();
  S.flags.tipShown = true;
  logMsg(fromSave ? '前缘再续，道途未歇。' : '你本是青云村一介凡人，偶得残卷，遂入仙途……');
  if (!fromSave) { logMsg('提示：向西是村中（丹炉·商铺），村外东行是迷雾竹林。'); toast('仙途已启，祝道友早证大道！', 'gold'); }
  save();
}

/* ---------------- 主循环 ---------------- */
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - lastT) / 1000 || 0.016);
  lastT = now;
  if (!title && S) { update(dt, now); }
  draw();
}

/* ---------------- 启动 ---------------- */
resize();
bootTitle();
// 自检/截图钩子：?auto=1[&seed=&root=&map=&stage=&trib=1]
if (IS_AUTO) {
  setTimeout(() => {
    const seed = parseInt(QS.get('seed') || '777', 10) >>> 0;
    const s = C.newGame(seed, QS.get('root') || 'terra');
    const stg = parseInt(QS.get('stage') || '0', 10);
    if (stg > 0) { s.player.stage = stg; s.player.breakFail = 0; C.recalc(s); s.player.hp = s.player.hpMax; s.player.mp = s.player.mpMax; }
    for (const sk of ['azure', 'flame', 'voidc']) if (stg >= 8 && s.player.skills.indexOf(sk) < 0) s.player.skills.push(sk);
    startGame(s);
    const m = QS.get('map');
    if (m && C.MAP_DEFS[m]) {
      const ex = { bamboo: [4, 28], mount: [44, 60], marsh: [8, 48], realm: [32, 42], village: [34, 26] }[m] || [10, 10];
      if (C.MAP_DEFS[m].gate) s.player.stage = Math.max(s.player.stage, C.MAP_DEFS[m].gate.stage);
      enterMap(m, ex[0], ex[1]);
    }
    if (QS.get('trib')) {
      s.player.stage = 8; s.player.exp = C.needExp(8);
      startTrib(C.tribConfig(9, 0));
    }
    if (QS.get('panel')) openPanel(QS.get('panel'));
    // 浏览器内全流程冒烟测试：?auto=1&smoke=1（console 与 document.title 出结果）
    if (QS.get('smoke')) setTimeout(() => {
      const out = [];
      try {
        const p = S.player;
        const e0 = p.exp; C.gainExp(S, 10); out.push('exp+' + (p.exp - e0));
        enterMap('bamboo', 4, 28);
        const m = rt.mobs[0]; const dmg = C.playerHitDamage(S, rngWrap); m.hp -= dmg;
        out.push('dmg=' + dmg);
        p.gold = 0; p.inv = {};
        killMob(m);
        out.push('kill:gold=' + p.gold + ',inv=' + JSON.stringify(p.inv));
        const h = rt.herbs.find(x => x.ready); h.ready = false; C.addItem(S, h.item, 1);
        C.addItem(S, 'qingming', 10);
        let okn = 0; for (let i = 0; i < 8; i++) if (C.refine(S, 'huxin').success) okn++;
        out.push('refine=' + okn + '/8,huxin=' + C.countItem(S, 'huxin'));
        S.player.gold = 1000;
        out.push('buy=' + C.buy(S, 'scrollAzure').ok);
        C.learnScroll(S, 'scrollAzure');
        out.push('skill=' + p.skill);
        p.stage = 8; p.exp = C.needExp(8); p.breakCdUntil = 0;
        let r2 = C.tryBreakthrough(S, performance.now());
        let guard = 0;
        while ((!r2.ok || !r2.success) && guard++ < 50) { p.exp = C.needExp(8); r2 = C.tryBreakthrough(S, performance.now() + ++guard * 6000); }
        if (!r2.needTrib) throw new Error('筑基未触发天劫');
        startTrib(r2.tribCfg);
        const tr = C.tribulationResult(S, true);
        out.push('trib:' + tr.msg + ',stage=' + p.stage);
        localStorage.setItem('wxcs_smoke', JSON.stringify(S));
        out.push('save=' + (JSON.parse(localStorage.getItem('wxcs_smoke')).player.stage === 9));
        rt = newRt('village'); C.gotoMap(S, 'village', 20, 29);
        const poi = nearPoi();
        out.push('poi=' + (poi ? poi.label : 'null'));
        out.push('PASS');
      } catch (e) { out.push('ERR:' + e.message + '@' + String((e.stack || '').split('\n')[1]).trim()); }
      console.log('SMOKE ' + out.join(' | '));
      document.title = 'SMOKE:' + out.join('|');
    }, 900);
  }, 400);
}
window.addEventListener('pointerdown', () => audio());
})();
