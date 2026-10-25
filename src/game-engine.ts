import { z } from "zod";

/**
 * RVAI's own tested 2D block-building game engine, written from scratch for RVAI. When someone rebuilds a
 * game, a model designs the game (names, colors, world, which systems are on) as a small config, and this
 * engine turns it into one HTML file that always loads and plays: terrain, caves and ores, mining and
 * building, a hotbar, crafting, day and night, night creatures, two-player co-op on one keyboard,
 * a low-spec mode, autosave and export/import.
 */

const HEX = /^#[0-9a-f]{6}$/i;
const color = (fallback: string) => z.string().catch(fallback).transform((c) => (HEX.test(c) ? c : fallback));
const BLOCK_KEYS = ["grass", "dirt", "stone", "wood", "leaves", "sand", "coal", "iron", "planks", "brick", "glass"] as const;
const DEFAULT_BLOCKS: Record<(typeof BLOCK_KEYS)[number], [string, string]> = {
  grass: ["Grass", "#4caf50"], dirt: ["Dirt", "#8d5a3b"], stone: ["Stone", "#8a8f98"], wood: ["Log", "#7a5230"],
  leaves: ["Leaves", "#2e7d32"], sand: ["Sand", "#e2c98f"], coal: ["Coal ore", "#3b3b3b"], iron: ["Iron ore", "#c9a27e"],
  planks: ["Planks", "#c08a4e"], brick: ["Brick", "#a94438"], glass: ["Glass", "#b8e4f0"],
};

const Block = z.object({ name: z.string(), color: z.string() });

/** What the Game Designer agent fills in. Every field has a safe default, so a partial answer still plays. */
export const GameDesign = z.object({
  tagline: z.string().describe("one short line shown under the title"),
  sky: z.string().describe("daytime sky color as #rrggbb; follow the person's color wishes"),
  skyNight: z.string().describe("night sky color as #rrggbb"),
  accent: z.string().describe("UI accent color as #rrggbb"),
  worldStyle: z.enum(["hills", "mountains", "flat", "islands"]),
  blocks: z
    .array(z.object({ key: z.enum(BLOCK_KEYS), name: z.string(), color: z.string() }))
    .describe("an original name and #rrggbb color for each block key"),
  survival: z.boolean().describe("health, fall damage and limited blocks"),
  creative: z.boolean().describe("allow switching to creative: unlimited blocks and flying"),
  crafting: z.boolean(),
  dayNight: z.boolean(),
  nightCreatures: z.boolean().describe("hopping creatures at night in survival"),
  coop: z.boolean().describe("second player on the same keyboard"),
  lowSpec: z.boolean().describe("lighter graphics for old laptops"),
  dayLengthSec: z.number().describe("seconds for a full day, 60 to 600"),
});
export type GameDesign = z.infer<typeof GameDesign>;

const Config = z.object({
  title: z.string(),
  tagline: z.string().catch(""),
  storageKey: z.string(),
  mods: z.array(z.string()).catch([]),
  sky: color("#8ec5ff"),
  skyNight: color("#0b1530"),
  accent: color("#ffcf4a"),
  worldStyle: z.enum(["hills", "mountains", "flat", "islands"]).catch("hills"),
  blocks: z.record(z.string(), Block),
  survival: z.boolean().catch(true),
  creative: z.boolean().catch(true),
  crafting: z.boolean().catch(true),
  dayNight: z.boolean().catch(true),
  nightCreatures: z.boolean().catch(true),
  coop: z.boolean().catch(false),
  lowSpec: z.boolean().catch(false),
  dayLengthSec: z.number().catch(240).transform((n) => Math.min(600, Math.max(60, Math.round(n)))),
});
type Config = z.infer<typeof Config>;

/** True when the thing being rebuilt is a game the engine fits (block building, sandbox, survival, crafting). */
export function isBlockGame(text: string): boolean {
  // Only block-building sandboxes: "game-like lessons" (Duolingo) or a "matching game" (Quizlet) are apps, not this engine.
  return /\b(sandbox|voxel|block[- ]?(building|game|world)s?|crafting|survival game|terraria|minecraft|roblox)\b/i.test(text);
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const scriptJson = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c").replace(/\u2028|\u2029/g, " ");

/** Merges a (possibly partial) design with safe defaults. */
export function gameConfig(input: { title: string; storageKey: string; mods?: string[]; design?: Partial<GameDesign> }): Config {
  const d: Partial<GameDesign> = input.design ?? {};
  const blocks: Record<string, { name: string; color: string }> = {};
  for (const key of BLOCK_KEYS) {
    const mine = d.blocks?.find((b) => b.key === key);
    const [name, fallback] = DEFAULT_BLOCKS[key];
    blocks[key] = {
      name: (mine?.name || name).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 24) || name,
      color: mine && HEX.test(mine.color) ? mine.color : fallback,
    };
  }
  return Config.parse({ ...d, title: input.title, storageKey: input.storageKey, mods: input.mods ?? [], blocks });
}

/** One self-contained, playable HTML game. */
export function gameHtml(cfg: Config): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(cfg.title)}</title>
<style>
*{box-sizing:border-box}html,body{margin:0;height:100%;overflow:hidden;background:#000;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#fff;user-select:none}
canvas{display:block;width:100vw;height:100vh;cursor:crosshair}
.bar{position:fixed;left:10px;top:10px;right:10px;display:flex;flex-wrap:wrap;gap:6px;align-items:center;pointer-events:none}
.bar>*{pointer-events:auto}
.pill{background:rgba(10,14,22,.72);border:1px solid rgba(255,255,255,.18);border-radius:10px;padding:6px 10px;font-size:13px}
.pill b{color:var(--accent)}
button.pill{color:#fff;cursor:pointer}button.pill:hover{border-color:var(--accent)}
#hotbar{position:fixed;left:50%;bottom:12px;transform:translateX(-50%);display:flex;gap:4px;background:rgba(10,14,22,.72);padding:6px;border-radius:12px;border:1px solid rgba(255,255,255,.18)}
.slot{width:46px;height:46px;border-radius:8px;border:2px solid transparent;position:relative;display:grid;place-items:center;font-size:10px}
.slot.on{border-color:var(--accent)}.slot i{display:block;width:26px;height:26px;border-radius:4px;box-shadow:inset 0 -4px 0 rgba(0,0,0,.25)}
.slot span{position:absolute;right:3px;bottom:1px;font-size:11px;font-weight:700}.slot em{position:absolute;left:3px;top:1px;font-style:normal;opacity:.6;font-size:10px}
.panel{position:fixed;right:10px;top:56px;width:260px;max-height:70vh;overflow:auto;background:rgba(10,14,22,.9);border:1px solid rgba(255,255,255,.2);border-radius:12px;padding:12px;font-size:13px;display:none}
.panel.open{display:block}.panel h3{margin:0 0 8px;font-size:15px}.panel button{width:100%;margin:4px 0;text-align:left}
#toast{position:fixed;left:50%;top:60px;transform:translateX(-50%);background:rgba(10,14,22,.85);padding:8px 14px;border-radius:10px;font-size:14px;opacity:0;transition:opacity .3s;pointer-events:none}
#hearts{letter-spacing:1px}
</style>
</head>
<body>
<canvas id="game" aria-label="Game world"></canvas>
<div class="bar">
<span class="pill"><b id="title"></b> <span id="tagline" style="opacity:.7"></span></span>
<span class="pill" id="hearts"></span>
<span class="pill" id="clock"></span>
<button class="pill" id="modeBtn" type="button"></button>
<button class="pill" id="craftBtn" type="button">Craft (E)</button>
<button class="pill" id="helpBtn" type="button">Help (H)</button>
<button class="pill" id="newBtn" type="button">New world</button>
<button class="pill" id="saveBtn" type="button">Save</button>
<button class="pill" id="exportBtn" type="button">Export</button>
<label class="pill" style="cursor:pointer">Import<input type="file" id="importFile" accept="application/json" hidden></label>
</div>
<div id="hotbar" aria-label="Hotbar"></div>
<div class="panel" id="craft"><h3>Crafting</h3><div id="recipes"></div></div>
<div class="panel" id="help"><h3>How to play</h3><div id="helpText"></div></div>
<div id="toast" role="status"></div>
<script>
(function () {
  "use strict";
  var C = ${scriptJson(cfg)};
  document.documentElement.style.setProperty("--accent", C.accent);
  var TS = C.lowSpec ? 26 : 20, W = 360, H = 120;
  var KEYS = ["air", "grass", "dirt", "stone", "wood", "leaves", "sand", "coal", "iron", "planks", "brick", "glass", "bedrock"];
  var B = {}; KEYS.forEach(function (k, i) { B[k] = i; });
  var HARD = [0, 0.35, 0.3, 0.9, 0.6, 0.12, 0.3, 1.1, 1.4, 0.5, 0.8, 0.2, 1e9];
  var DROP = { 1: 2 };
  var INFO = KEYS.map(function (k) { return C.blocks[k] || { name: k === "bedrock" ? "Bedrock" : k, color: k === "bedrock" ? "#222222" : "#000000" }; });
  var HOTBAR = [1, 2, 3, 4, 9, 6, 10, 11, 5];
  var RECIPES = [
    { out: 9, n: 4, cost: [[4, 1]] },
    { out: 10, n: 2, cost: [[3, 2], [7, 1]] },
    { out: 11, n: 2, cost: [[6, 2], [7, 1]] },
    { out: 3, n: 1, cost: [[8, 1]], label: "Smelt iron into polished stone" }
  ];
  var cv = document.getElementById("game"), ctx = cv.getContext("2d");
  var world, seed, players, mobs, inv, sel = 0, mode, time = 0.3, keys = {}, mouse = { x: 0, y: 0, l: false, r: false, in: false };
  var mining = { x: -1, y: -1, t: 0 }, cam = { x: 0, y: 0 }, last = 0, acc = 0, saveTimer = 0, alive = true;
  var $ = function (id) { return document.getElementById(id); };

  function rng(s) { return function () { s = (s + 0x6D2B79F5) | 0; var t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function smooth(r, n, step) { var pts = [], out = []; for (var i = 0; i <= Math.ceil(n / step) + 1; i++) pts.push(r()); for (var x = 0; x < n; x++) { var i0 = Math.floor(x / step), f = (x % step) / step, s = f * f * (3 - 2 * f); out.push(pts[i0] * (1 - s) + pts[i0 + 1] * s); } return out; }
  function get(x, y) { if (x < 0 || x >= W || y >= H) return B.bedrock; if (y < 0) return 0; return world[y * W + x]; }
  function set(x, y, t) { if (x >= 0 && x < W && y >= 0 && y < H) world[y * W + x] = t; }
  function solid(t) { return t !== 0; }
  function surface(x) { for (var y = 0; y < H; y++) if (solid(get(x, y))) return y; return H - 1; }
  function ground(x) { for (var y = 0; y < H; y++) { var t = get(x, y); if (t && t !== B.wood && t !== B.leaves) return y; } return H - 1; }

  function generate(sd) {
    seed = sd; var r = rng(sd); world = new Uint8Array(W * H);
    var big = smooth(r, W, 48), mid = smooth(r, W, 16), small = smooth(r, W, 5);
    var amp = C.worldStyle === "mountains" ? 46 : C.worldStyle === "flat" ? 0 : 24;
    var heights = [];
    for (var x = 0; x < W; x++) {
      var h = Math.round(52 + (big[x] - 0.5) * amp + (mid[x] - 0.5) * amp * 0.4 + (small[x] - 0.5) * (C.worldStyle === "flat" ? 0 : 4));
      if (C.worldStyle === "islands" && Math.sin(x / 23) + (mid[x] - 0.5) < -0.35) h = H;
      heights.push(h);
      for (var y = 0; y < H; y++) {
        var t = 0;
        if (y === H - 1) t = B.bedrock;
        else if (y > h + 4) t = B.stone;
        else if (y > h) t = B.dirt;
        else if (y === h) t = (h >= 63 && C.worldStyle !== "flat") ? B.sand : B.grass;
        set(x, y, t);
      }
    }
    for (var c = 0; c < 26; c++) {
      var cx = Math.floor(r() * W), cy = 62 + Math.floor(r() * 50), len = 40 + Math.floor(r() * 80);
      for (var s = 0; s < len; s++) {
        var rad = 1 + Math.floor(r() * 2);
        for (var dx = -rad; dx <= rad; dx++) for (var dy = -rad; dy <= rad; dy++) if (get(cx + dx, cy + dy) !== B.bedrock && cy + dy > heights[Math.max(0, Math.min(W - 1, cx + dx))] + 3) set(cx + dx, cy + dy, 0);
        cx += Math.round(r() * 2 - 1); cy += Math.round(r() * 2 - 1);
        cx = Math.max(1, Math.min(W - 2, cx)); cy = Math.max(30, Math.min(H - 3, cy));
      }
    }
    for (var ox = 0; ox < W; ox++) for (var oy = 0; oy < H - 1; oy++) if (get(ox, oy) === B.stone) {
      var v = r(); if (v < 0.03) set(ox, oy, B.coal); else if (v < 0.042 && oy > heights[ox] + 18) set(ox, oy, B.iron);
    }
    for (var tx = 3; tx < W - 3; tx++) {
      if (get(tx, heights[tx]) === B.grass && r() < 0.09) {
        var th = 4 + Math.floor(r() * 3), top = heights[tx] - th;
        for (var k = 1; k <= th; k++) set(tx, heights[tx] - k, B.wood);
        for (var lx = -2; lx <= 2; lx++) for (var ly = -2; ly <= 1; ly++) if (Math.abs(lx) + Math.abs(ly) < 4 && get(tx + lx, top + ly) === 0) set(tx + lx, top + ly, B.leaves);
        tx += 3;
      }
    }
  }

  function openSpot(x) { for (var d = 0; d < 40; d++) { var xs = [x + d, x - d]; for (var i = 0; i < 2; i++) { var c = xs[i]; if (c > 1 && c < W - 2 && surface(c) === ground(c) && surface(c) < H - 2) return c; } } return x; }
  function newPlayer(x, colorBody) { x = openSpot(x); return { x: x + 0.15, y: surface(x) - 2, vx: 0, vy: 0, w: 0.7, h: 1.8, ground: false, hp: 20, face: 1, fly: false, body: colorBody, hurt: 0 }; }
  function freshInventory() { var i = {}; HOTBAR.forEach(function (b) { i[b] = 0; }); i[7] = 0; i[8] = 0; return i; }

  function newWorld(sd) {
    generate(sd >>> 0);
    var mid = Math.floor(W / 2);
    players = [newPlayer(mid, "#3d7bd9")];
    if (C.coop) players.push(newPlayer(Math.floor(players[0].x) + 2, "#d9663d"));
    mobs = []; inv = freshInventory(); time = 0.08;
    mode = C.survival ? "survival" : "creative";
    cam.x = players[0].x * TS - cv.width / 2; cam.y = players[0].y * TS - cv.height / 2;
    toast("New world, seed " + seed);
  }

  function boxHits(x, y, w, h) {
    for (var tx = Math.floor(x); tx <= Math.floor(x + w - 0.001); tx++) for (var ty = Math.floor(y); ty <= Math.floor(y + h - 0.001); ty++) if (solid(get(tx, ty))) return true;
    return false;
  }
  function move(e, dt) {
    var g = e.fly ? 0 : 42;
    e.vy = Math.min(e.vy + g * dt, 32);
    var nx = e.x + e.vx * dt;
    if (!boxHits(nx, e.y, e.w, e.h)) e.x = nx;
    else if (e.ground && !boxHits(nx, e.y - 1, e.w, e.h)) { e.x = nx; e.y -= 1; }
    else e.vx = 0;
    var ny = e.y + e.vy * dt, landed = false;
    if (!boxHits(e.x, ny, e.w, e.h)) { e.y = ny; e.ground = false; }
    else { if (e.vy > 0) { landed = true; e.y = Math.floor(ny + e.h) - e.h; } else e.y = Math.ceil(ny); var impact = e.vy; e.vy = 0; e.ground = landed; return landed ? impact : 0; }
    if (e.y > H + 10) { e.y = surface(Math.floor(e.x)) - 2; e.vy = 0; }
    return 0;
  }
  function control(p, left, right, up, down, dt) {
    var speed = p.fly ? 11 : 6.5;
    p.vx = (right ? speed : 0) - (left ? speed : 0);
    if (p.vx) p.face = p.vx > 0 ? 1 : -1;
    if (p.fly) p.vy = (down ? speed : 0) - (up ? speed : 0);
    else if (up && p.ground) { p.vy = -14; p.ground = false; }
    var impact = move(p, dt);
    if (mode === "survival" && impact > 21) damage(p, Math.round((impact - 21) * 0.9), "a fall");
  }
  function damage(p, n, why) {
    if (mode !== "survival" || p.hurt > 0) return;
    p.hp -= n; p.hurt = 0.6;
    if (p.hp <= 0) { toast("You were knocked out by " + why + ". Respawning…"); p.hp = 20; p.x = openSpot(Math.floor(W / 2)); p.y = surface(p.x) - 2; p.vy = 0; }
  }

  function reach(p, tx, ty) { var cx = p.x + p.w / 2, cy = p.y + p.h / 2; return Math.hypot(tx + 0.5 - cx, ty + 0.5 - cy) <= 5.5; }
  function overlapsPlayer(tx, ty) { return players.some(function (p) { return tx + 1 > p.x && tx < p.x + p.w && ty + 1 > p.y && ty < p.y + p.h; }); }
  function mine(p, tx, ty, dt) {
    var t = get(tx, ty);
    if (!t || t === B.bedrock || !reach(p, tx, ty)) { mining.t = 0; return; }
    if (mining.x !== tx || mining.y !== ty) { mining.x = tx; mining.y = ty; mining.t = 0; }
    mining.t += dt;
    if (mode === "creative" || mining.t >= HARD[t]) {
      set(tx, ty, 0); mining.t = 0;
      if (mode === "survival") { var d = DROP[t] || t; inv[d] = (inv[d] || 0) + 1; }
      renderHotbar();
    }
  }
  function place(p, tx, ty) {
    var b = HOTBAR[sel];
    if (get(tx, ty) !== 0 || !reach(p, tx, ty) || overlapsPlayer(tx, ty)) return false;
    var touches = solid(get(tx + 1, ty)) || solid(get(tx - 1, ty)) || solid(get(tx, ty + 1)) || solid(get(tx, ty - 1));
    if (!touches) return false;
    if (mode === "survival") { if (!inv[b]) { toast("No " + INFO[b].name + " left. Mine or craft some."); return false; } inv[b]--; }
    set(tx, ty, b); renderHotbar(); return true;
  }

  function daylight() { if (!C.dayNight) return 1; return Math.max(0, Math.min(1, 0.5 + Math.sin(time * Math.PI * 2) * 0.9)); }
  function mix(a, b, t) {
    var pa = [1, 3, 5].map(function (i) { return parseInt(a.substr(i, 2), 16); }), pb = [1, 3, 5].map(function (i) { return parseInt(b.substr(i, 2), 16); });
    return "rgb(" + pa.map(function (v, i) { return Math.round(v + (pb[i] - v) * t); }).join(",") + ")";
  }

  function updateMobs(dt) {
    var night = daylight() < 0.35;
    if (C.nightCreatures && mode === "survival" && night && mobs.length < (C.lowSpec ? 2 : 5) && Math.random() < dt * 0.4) {
      var p = players[0], side = Math.random() < 0.5 ? -1 : 1, mx = Math.floor(p.x + side * (14 + Math.random() * 8));
      if (mx > 1 && mx < W - 2) mobs.push({ x: mx, y: surface(mx) - 1.2, vx: 0, vy: 0, w: 0.9, h: 0.9, ground: false, hp: 3, cd: 0 });
    }
    if (!night) mobs = mobs.filter(function () { return Math.random() > dt * 0.5; });
    mobs.forEach(function (m) {
      var target = players.reduce(function (a, b) { return Math.abs(b.x - m.x) < Math.abs(a.x - m.x) ? b : a; });
      m.cd -= dt;
      if (m.ground && m.cd <= 0) { m.vy = -9; m.cd = 0.8 + Math.random(); m.dir = target.x > m.x ? 1 : -1; }
      m.vx = m.ground ? 0 : (m.dir || 0) * 3.5;
      move(m, dt);
      if (Math.abs(target.x - m.x) < 0.8 && Math.abs(target.y + target.h - m.y - m.h) < 1.2) damage(target, 2, "a night creature");
    });
    mobs = mobs.filter(function (m) { return m.hp > 0 && Math.abs(m.x - players[0].x) < 60; });
  }
  function hitMob(wx, wy) {
    for (var i = 0; i < mobs.length; i++) { var m = mobs[i]; if (wx >= m.x && wx <= m.x + m.w && wy >= m.y && wy <= m.y + m.h) { m.hp--; m.vx = 0; m.vy = -6; if (m.hp <= 0) toast("Creature defeated"); return true; } }
    return false;
  }

  function step(dt) {
    if (C.dayNight) time = (time + dt / C.dayLengthSec) % 1;
    var p1 = players[0], solo = !players[1];
    control(p1, keys.KeyA || (solo && keys.ArrowLeft), keys.KeyD || (solo && keys.ArrowRight), keys.KeyW || keys.Space || (solo && keys.ArrowUp), keys.KeyS || keys.ShiftLeft || (solo && keys.ArrowDown), dt);
    if (players[1]) {
      var p2 = players[1];
      control(p2, keys.ArrowLeft, keys.ArrowRight, keys.ArrowUp, keys.ArrowDown, dt);
      var fx = Math.floor(p2.x + p2.w / 2 + p2.face * 1.1), fy = Math.floor(p2.y + p2.h - 0.6);
      if (keys.Period) mine(p2, fx, solid(get(fx, fy)) ? fy : fy - 1, dt);
      if (keys.Comma) { place(p2, fx, fy); keys.Comma = false; }
    }
    var wx = (mouse.x + cam.x) / TS, wy = (mouse.y + cam.y) / TS, tx = Math.floor(wx), ty = Math.floor(wy);
    if (mouse.l && mouse.in) { if (!hitMob(wx, wy)) mine(p1, tx, ty, dt); else mouse.l = false; } else if (!keys.Period) mining.t = 0;
    if (mouse.r && mouse.in) { place(p1, tx, ty); mouse.r = false; }
    players.forEach(function (p) { if (p.hurt > 0) p.hurt -= dt; if (mode === "survival" && p.hp < 20 && Math.random() < dt * 0.15) p.hp++; });
    updateMobs(dt);
    var fxs = players.reduce(function (a, p) { return a + p.x; }, 0) / players.length, fys = players.reduce(function (a, p) { return a + p.y; }, 0) / players.length;
    cam.x += ((fxs * TS - cv.width / 2) - cam.x) * Math.min(1, dt * 8);
    cam.y += ((fys * TS - cv.height / 2) - cam.y) * Math.min(1, dt * 8);
    cam.x = Math.max(0, Math.min(W * TS - cv.width, cam.x)); cam.y = Math.max(-TS * 20, Math.min(H * TS - cv.height, cam.y));
    saveTimer += dt; if (saveTimer > 20) { saveTimer = 0; save(true); }
  }

  function draw() {
    var light = daylight();
    var sky = ctx.createLinearGradient(0, 0, 0, cv.height);
    sky.addColorStop(0, mix(C.skyNight, C.sky, light)); sky.addColorStop(1, mix(C.skyNight, "#ffffff", light * 0.55));
    ctx.fillStyle = sky; ctx.fillRect(0, 0, cv.width, cv.height);
    if (C.dayNight) { ctx.fillStyle = light > 0.4 ? "#fff6b0" : "#e8ecff"; ctx.beginPath(); ctx.arc(cv.width * 0.8, Math.max(40, Math.min(cv.height - 40, cv.height * 0.15 + (1 - light) * 30)), light > 0.4 ? 26 : 18, 0, Math.PI * 2); ctx.fill(); }
    var x0 = Math.max(0, Math.floor(cam.x / TS)), x1 = Math.min(W - 1, Math.ceil((cam.x + cv.width) / TS));
    var y0 = Math.max(0, Math.floor(cam.y / TS)), y1 = Math.min(H - 1, Math.ceil((cam.y + cv.height) / TS));
    for (var x = x0; x <= x1; x++) for (var y = y0; y <= y1; y++) {
      var t = get(x, y), px = Math.round(x * TS - cam.x), py = Math.round(y * TS - cam.y);
      if (!t) { if (y > ground(x)) { ctx.fillStyle = "#2a2119"; ctx.fillRect(px, py, TS, TS); } continue; }
      ctx.fillStyle = INFO[t].color; ctx.fillRect(px, py, TS, TS);
      if (!C.lowSpec) {
        ctx.fillStyle = "rgba(0,0,0,.14)"; ctx.fillRect(px, py + TS - 3, TS, 3);
        if (!solid(get(x, y - 1))) { ctx.fillStyle = "rgba(255,255,255,.16)"; ctx.fillRect(px, py, TS, 3); }
        if (t === B.coal || t === B.iron) { ctx.fillStyle = t === B.coal ? "#111111" : "#f0c49a"; ctx.fillRect(px + 4, py + 5, 4, 4); ctx.fillRect(px + 12, py + 11, 4, 4); }
        if (t === B.glass) { ctx.strokeStyle = "rgba(255,255,255,.6)"; ctx.strokeRect(px + 2.5, py + 2.5, TS - 5, TS - 5); }
      }
      if (y > ground(x) + 2 && !C.lowSpec) { ctx.fillStyle = "rgba(0,0,0," + Math.min(0.45, (y - ground(x)) * 0.012) + ")"; ctx.fillRect(px, py, TS, TS); }
    }
    if (mining.t > 0 && mining.x >= 0) { var mt = get(mining.x, mining.y); var f = mode === "creative" ? 1 : Math.min(1, mining.t / HARD[mt]); ctx.fillStyle = "rgba(0,0,0," + (0.15 + f * 0.5) + ")"; ctx.fillRect(mining.x * TS - cam.x, mining.y * TS - cam.y + TS * (1 - f), TS, TS * f); }
    if (mouse.in) { var hx = Math.floor((mouse.x + cam.x) / TS), hy = Math.floor((mouse.y + cam.y) / TS); ctx.strokeStyle = reach(players[0], hx, hy) ? C.accent : "rgba(255,255,255,.3)"; ctx.lineWidth = 2; ctx.strokeRect(hx * TS - cam.x + 1, hy * TS - cam.y + 1, TS - 2, TS - 2); }
    mobs.forEach(function (m) { var mx = m.x * TS - cam.x, my = m.y * TS - cam.y; ctx.fillStyle = "#5fd35f"; ctx.fillRect(mx, my, m.w * TS, m.h * TS); ctx.fillStyle = "#000"; ctx.fillRect(mx + 4, my + 5, 3, 3); ctx.fillRect(mx + m.w * TS - 7, my + 5, 3, 3); });
    players.forEach(function (p, i) {
      var px = p.x * TS - cam.x, py = p.y * TS - cam.y;
      ctx.fillStyle = p.hurt > 0 ? "#ff6b6b" : p.body; ctx.fillRect(px, py + TS * 0.55, p.w * TS, p.h * TS - TS * 0.55);
      ctx.fillStyle = "#f1c9a5"; ctx.fillRect(px, py, p.w * TS, TS * 0.6);
      ctx.fillStyle = "#222"; ctx.fillRect(px + (p.face > 0 ? p.w * TS - 5 : 2), py + 4, 3, 3);
      if (players.length > 1) { ctx.fillStyle = "#fff"; ctx.font = "11px system-ui"; ctx.fillText("P" + (i + 1), px, py - 4); }
    });
    if (C.dayNight && light < 0.8) {
      var dark = (1 - light) * 0.62;
      if (C.lowSpec) { ctx.fillStyle = "rgba(0,0,10," + dark + ")"; ctx.fillRect(0, 0, cv.width, cv.height); }
      else {
        var p = players[0], gx = (p.x + p.w / 2) * TS - cam.x, gy = (p.y + p.h / 2) * TS - cam.y;
        var g = ctx.createRadialGradient(gx, gy, TS * 2, gx, gy, TS * 9);
        g.addColorStop(0, "rgba(0,0,10,0)"); g.addColorStop(1, "rgba(0,0,10," + dark + ")");
        ctx.fillStyle = g; ctx.fillRect(0, 0, cv.width, cv.height);
      }
    }
  }

  function hud() {
    var p = players[0];
    $("hearts").textContent = mode === "survival" ? "♥ " + p.hp + "/20" + (players[1] ? "  P2 ♥ " + players[1].hp : "") : "Creative · F to fly";
    var clock = (time * 24 + 6) % 24, hrs = Math.floor(clock), mins = Math.floor((clock % 1) * 60);
    $("clock").textContent = C.dayNight ? (daylight() > 0.4 ? "☀ " : "☾ ") + (hrs < 10 ? "0" : "") + hrs + ":" + (mins < 10 ? "0" : "") + mins : "Always day";
    $("modeBtn").textContent = "Mode: " + (mode === "survival" ? "Survival" : "Creative");
  }
  function renderHotbar() {
    var bar = $("hotbar"); bar.textContent = "";
    HOTBAR.forEach(function (b, i) {
      var s = document.createElement("div"); s.className = "slot" + (i === sel ? " on" : ""); s.title = INFO[b].name;
      var sw = document.createElement("i"); sw.style.background = INFO[b].color; s.appendChild(sw);
      var n = document.createElement("em"); n.textContent = String(i + 1); s.appendChild(n);
      var c = document.createElement("span"); c.textContent = mode === "survival" ? String(inv[b] || 0) : "∞"; s.appendChild(c);
      s.onclick = function () { sel = i; renderHotbar(); };
      bar.appendChild(s);
    });
    renderRecipes();
  }
  function renderRecipes() {
    var box = $("recipes"); box.textContent = "";
    RECIPES.forEach(function (r) {
      var b = document.createElement("button"); b.className = "pill"; b.type = "button";
      var can = r.cost.every(function (c) { return (inv[c[0]] || 0) >= c[1]; });
      b.textContent = (r.label || ("Make " + r.n + " " + INFO[r.out].name)) + " ← " + r.cost.map(function (c) { return c[1] + " " + INFO[c[0]].name + " (" + (inv[c[0]] || 0) + ")"; }).join(" + ");
      b.disabled = !can && mode === "survival"; b.style.opacity = b.disabled ? 0.5 : 1;
      b.onclick = function () { if (mode === "survival") { if (!can) return; r.cost.forEach(function (c) { inv[c[0]] -= c[1]; }); } inv[r.out] = (inv[r.out] || 0) + r.n; toast("Crafted " + r.n + " " + INFO[r.out].name); renderHotbar(); };
      box.appendChild(b);
    });
  }
  var toastTimer = 0;
  function toast(msg) { var t = $("toast"); t.textContent = msg; t.style.opacity = 1; clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.style.opacity = 0; }, 2200); }

  function encode() { var s = ""; for (var i = 0; i < world.length; i += 4096) s += String.fromCharCode.apply(null, world.subarray(i, i + 4096)); return btoa(s); }
  function decode(b64) { var s = atob(b64), a = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }
  function snapshot() { return { v: 1, seed: seed, time: time, mode: mode, inv: inv, world: encode(), players: players.map(function (p) { return { x: p.x, y: p.y, hp: p.hp }; }) }; }
  function restore(d) {
    if (!d || d.v !== 1) throw new Error("not a save");
    var w = decode(d.world); if (w.length !== W * H) throw new Error("wrong size");
    world = w; seed = d.seed; time = d.time || 0.3; mode = d.mode === "creative" && C.creative ? "creative" : (C.survival ? "survival" : "creative"); inv = d.inv || freshInventory();
    players.forEach(function (p, i) { var s = (d.players || [])[i]; if (s) { p.x = s.x; p.y = s.y; p.hp = s.hp || 20; } });
    mobs = []; renderHotbar();
  }
  function save(quiet) { try { localStorage.setItem(C.storageKey, JSON.stringify(snapshot())); if (!quiet) toast("Saved"); } catch (e) { if (!quiet) toast("Could not save in this browser"); } }
  function load() { try { var raw = localStorage.getItem(C.storageKey); if (raw) { restore(JSON.parse(raw)); toast("Welcome back"); return true; } } catch (e) {} return false; }

  function resize() { cv.width = window.innerWidth; cv.height = window.innerHeight; ctx.imageSmoothingEnabled = false; }
  window.addEventListener("resize", resize);
  window.addEventListener("keydown", function (e) {
    if (e.target && e.target.tagName === "INPUT") return;
    keys[e.code] = true;
    var mod = e.metaKey || e.ctrlKey;
    if (mod && e.code === "KeyS") { e.preventDefault(); save(false); return; }
    if (/^Digit[1-9]$/.test(e.code)) { sel = Number(e.code.slice(5)) - 1; renderHotbar(); }
    if (e.code === "KeyE" && C.crafting) $("craft").classList.toggle("open");
    if (e.code === "KeyH") $("help").classList.toggle("open");
    if (e.code === "KeyF" && mode === "creative") players.forEach(function (p) { p.fly = !p.fly; p.vy = 0; });
    if (e.code === "KeyM") toggleMode();
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].indexOf(e.code) >= 0) e.preventDefault();
  });
  window.addEventListener("keyup", function (e) { keys[e.code] = false; });
  window.addEventListener("blur", function () { keys = {}; mouse.l = mouse.r = false; });
  cv.addEventListener("mousemove", function (e) { mouse.x = e.clientX; mouse.y = e.clientY; mouse.in = true; });
  cv.addEventListener("mouseleave", function () { mouse.in = false; mouse.l = false; });
  cv.addEventListener("mousedown", function (e) { mouse.x = e.clientX; mouse.y = e.clientY; mouse.in = true; if (e.button === 0) mouse.l = true; if (e.button === 2) mouse.r = true; });
  window.addEventListener("mouseup", function (e) { if (e.button === 0) mouse.l = false; });
  cv.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  cv.addEventListener("wheel", function (e) { sel = (sel + (e.deltaY > 0 ? 1 : HOTBAR.length - 1)) % HOTBAR.length; renderHotbar(); }, { passive: true });

  function toggleMode() {
    if (!C.creative || !C.survival) { toast(C.creative ? "This world is creative only" : "This world is survival only"); return; }
    mode = mode === "survival" ? "creative" : "survival"; players.forEach(function (p) { p.fly = false; }); renderHotbar(); toast(mode === "creative" ? "Creative: unlimited blocks, F to fly" : "Survival: mine to collect blocks");
  }
  $("modeBtn").onclick = toggleMode;
  $("craftBtn").onclick = function () { $("craft").classList.toggle("open"); };
  if (!C.crafting) $("craftBtn").style.display = "none";
  $("helpBtn").onclick = function () { $("help").classList.toggle("open"); };
  $("newBtn").onclick = function () { if (confirm("Start a new world? Your current world is replaced unless you export it first.")) { newWorld(Math.floor(Math.random() * 1e9)); renderHotbar(); save(true); } };
  $("saveBtn").onclick = function () { save(false); };
  $("exportBtn").onclick = function () { var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(snapshot())], { type: "application/json" })); a.download = C.storageKey.replace(/[^a-z0-9]+/gi, "-") + "-world.json"; a.click(); };
  $("importFile").onchange = function (e) { var f = e.target.files[0]; if (!f) return; f.text().then(function (t) { try { restore(JSON.parse(t)); toast("World imported"); } catch (err) { toast("That file is not a world save"); } }); };

  $("title").textContent = C.title.split(" (")[0];
  $("tagline").textContent = C.tagline;
  var help = [
    "A / D move, W or Space jump, S down.",
    "Left-click a block (hold) to mine it, right-click to place the selected block.",
    "1 to 9 or the mouse wheel pick a block. M switches Survival and Creative" + (C.creative ? ", F flies in Creative." : "."),
    C.crafting ? "E opens crafting: turn logs into planks, sand and coal into glass." : "",
    C.dayNight ? "Day turns to night. " + (C.nightCreatures ? "Creatures come out at night in Survival; click them to fight back." : "") : "",
    C.coop ? "Player 2: arrow keys to move, . (period) to mine and , (comma) to place in front of you." : "",
    "Cmd/Ctrl+S saves. The world also saves itself every 20 seconds in this browser. Export to keep a copy.",
    C.mods.length ? "Mods in this build: " + C.mods.join(", ") + "." : ""
  ].filter(Boolean);
  help.forEach(function (line) { var p = document.createElement("p"); p.textContent = line; $("helpText").appendChild(p); });

  resize();
  players = [];
  newWorld(Math.floor(Math.random() * 1e9));
  load();
  renderHotbar();
  setTimeout(function () { toast("Press H for help. Hold left-click to mine."); }, 1200);
  window.__rvaiGame = { ready: true, step: step, players: function () { return players; }, get: get, cam: cam, tile: TS, inv: function () { return inv; } };

  function frame(ts) {
    if (!alive) return;
    var dt = Math.min(0.05, (ts - last) / 1000 || 0.016); last = ts;
    acc += dt;
    if (C.lowSpec && acc < 1 / 30) { requestAnimationFrame(frame); return; }
    var d = C.lowSpec ? acc : dt; acc = 0;
    step(Math.min(0.05, d)); draw(); hud();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
</script>
</body>
</html>
`;
}
