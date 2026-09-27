// Tikvah — Track A competition build. Authoritative Node.js + WebSocket server.
// Serves the static client from ./public and hosts game rooms with short codes.
//
// Life-sim layer (2026-09-27 sprint): character looks, home interior, day/night,
// cooking, church candles + worship, villager NPCs with dialogue, and a gentle
// shared day rhythm (farm, fish, cook, greet, candle) that blooms the Garden of Hope.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { WebSocketServer } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, 'public');
const PORT = parseInt(process.env.PORT || '8787', 10);

// ---------- World constants ----------
export const TILE = 32;
export const WORLD_W = 40, WORLD_H = 28;          // 1280 x 896 px
export const MAX_SPEED = 150;                      // px/sec, enforced server-side
export const INTERACT_RANGE = 56;                  // px
export const RUIN_STONE_RADIUS = 40;               // px
export const MAX_NAME_LEN = 16;
// ---------- Mini-MMO (M1): rooms hold up to 10 players ----------
// Private 4-letter room codes and the create/join flow are unchanged —
// no logins, no accounts. (D9 supersedes D6's room cap of 2.)
export const ROOM_CAP = 10;

// Quick chat: preset phrases only — no free text, no moderation burden.
export const QUICK_CHAT = [
  { id: 'hello',  text: 'Hello! 👋' },
  { id: 'follow', text: 'Follow me!' },
  { id: 'stone',  text: 'Stand on the other stone ✨' },
  { id: 'cook',   text: "Let's cook together! 🍲" },
  { id: 'thanks', text: 'Thank you! 🙏' },
  { id: 'bloom',  text: 'The garden blooms! 🌸' },
];
export const QUICK_CHAT_COOLDOWN_MS = 2000;

// ---------- Mini-MMO (M2): persistent public village ----------
// The public room lives at a fixed code, is created once at server startup,
// and is NEVER reaped (exempt from the empty-room cleanup). Its world state
// (farm crops, garden bloom, candles, day phase, NPC hearts) persists in
// server memory while the server runs. Railway's disk is ephemeral, so a
// server restart resets the village.
export const PUBLIC_CODE = 'TIKVAH';
const REAP_MS = parseInt(process.env.REAP_MS || '60000', 10); // empty private-room grace

// Village layout (tile coords) — BATCH6b board composition
export const FARM_PLOTS = [ {tx:6,ty:15}, {tx:8,ty:15}, {tx:10,ty:15}, {tx:6,ty:17}, {tx:8,ty:17}, {tx:10,ty:17} ];
export const DOCK = { tx: 17, ty: 20 };            // fishing spot (sand bank by the river)
export const CHURCH_DOOR = { tx: 30, ty: 15 };    // press E near door -> enter
export const CHURCH_EXIT = { tx: 20, ty: 24 };    // interior exit spot
export const PRAY_SPOT = { tx: 20, ty: 20 };      // interior: pray / worship
export const VERSE_STAND = { tx: 16, ty: 20 };    // interior: read one verse
export const CANDLE_STAND = { tx: 24, ty: 20 };   // interior: light a candle
export const STONE_A = { tx: 6, ty: 5 };          // forest clearing
export const STONE_B = { tx: 34, ty: 5 };         // ruins clearing
export const SPAWN = { tx: 13, ty: 14 };       // west lane just east of home: first view looks
                                                // east down the market lane toward the plaza
// Home (exterior)
export const HOME_DOOR = { tx: 8, ty: 12 };       // press E near door -> enter home
// Home interior (separate tile region, drawn instead of the world).
// Spots are on a 3-tile grid so their 56px interact zones never overlap.
// (walkTo stops within 30px of a target; 96px spacing keeps every stop unambiguous.)
export const HOME_EXIT = { tx: 32, ty: 24 };
export const SLEEP_SPOT = { tx: 29, ty: 18 };      // bed
export const HEARTH = { tx: 35, ty: 18 };          // cook spot (home)
export const WARDROBE = { tx: 32, ty: 21 };        // change clothes
export const RUG_SPOT = { tx: 29, ty: 21 };        // decorate: cycle rug color
export const SIT_SPOT = { tx: 35, ty: 21 };        // sit
export const PRAY_NOOK = { tx: 32, ty: 18 };       // pray at home
// Cafe (exterior cook spot)
export const CAFE_COUNTER = { tx: 24, ty: 16 };

// ---------- Collision (server-authoritative) ----------
// The client renders server positions (no client-side prediction), so the server
// is the single decider: a player's center may never enter a solid tile.
// Tile predicates mirror the client's drawing layout (baseTile/isTree/isFence)
// so what looks solid is solid.
const FARM_RECT = { x0: 5, y0: 14, x1: 11, y1: 18 };    // matches client fence rect
const CHURCH_RECT = { x0: 28, y0: 9, x1: 32, y1: 14 };  // building incl. roof row
const HOME_RECT = { x0: 7, y0: 9, x1: 10, y1: 11 };
const CAFE_RECT = { x0: 23, y0: 13, x1: 25, y1: 15 };
const STALL_TILES = [ {tx:14,ty:10}, {tx:16,ty:10}, {tx:18,ty:10} ];
const FOUNTAIN_TILE = { tx: 20, ty: 15 };
// BATCH7: pink-blossom clusters along the lanes and plaza (mirrors client)
const BLOSSOM_SPOTS = [[15,17],[23,7],[12,7],[25,11],[21,7],[24,17],[14,19],[25,19],[9,6],[33,17]];
function isBlossomSpot(tx, ty) { for (const s of BLOSSOM_SPOTS) if (s[0]===tx && s[1]===ty) return true; return false; }

function inRect(tx, ty, r) { return tx >= r.x0 && tx <= r.x1 && ty >= r.y0 && ty <= r.y1; }

function baseKind(tx, ty) {   // mirrors client baseTile()
  // BATCH6a: river along the bottom rows (board composition), stone bridge crossing
  if (ty >= 21 && ty <= 24) return (tx >= 19 && tx <= 21) ? 'bridge' : 'water';
  if (ty === 20 || ty === 25) return (tx >= 19 && tx <= 21) ? 'bridge' : 'sand';
  if (tx >= 17 && tx <= 22 && ty >= 13 && ty <= 17) return 'plaza';
  if (ty === 12 && tx >= 6 && tx <= 33) return 'path';
  if (tx === 13 && ty >= 8 && ty <= 18) return 'path';
  if (tx === 19 && ty >= 6 && ty <= 12) return 'path';
  if (tx === 20 && ty >= 18 && ty <= 19) return 'path';
  if (ty === 18 && tx >= 13 && tx <= 28) return 'path';
  if (tx === 27 && ty >= 12 && ty <= 18) return 'path';
  if (tx === 33 && ty >= 6 && ty <= 12) return 'path';
  if (ty === 8 && tx >= 19 && tx <= 33) return 'path';
  return 'grass';
}

function nearStoneClearing(tx, ty) {
  // Small clearings around the ruin stones so the co-op moment stays reachable
  // even though both stones sit in the forest bands.
  return (Math.abs(tx - STONE_A.tx) <= 1 && Math.abs(ty - STONE_A.ty) <= 1) ||
         (Math.abs(tx - STONE_B.tx) <= 1 && Math.abs(ty - STONE_B.ty) <= 1);
}

function isTreeTile(tx, ty) {   // mirrors client isTree(), minus the ruin clearings
  if (nearStoneClearing(tx, ty)) return false;
  if (tx === 8 && ty === 14) return false;  // the farm gate stays open (north side)
  if ((tx === 3 && (ty === 0 || ty === 1)) || (tx === 36 && (ty === 0 || ty === 1))) return false; // waterfalls
  if (tx >= 31 && tx <= 32 && ty >= 3 && ty <= 4) return false; // ruin arch
  if (isBlossomSpot(tx, ty)) return true;   // BATCH7: pink-blossom lane clusters
  if (tx >= 0 && tx <= 4 && ty >= 0 && ty <= 24) return (tx*13 + ty*7) % 4 !== 3;
  if (tx >= 35 && tx <= 39 && ty >= 0 && ty <= 20) return (tx*11 + ty*5) % 5 !== 4;
  // BATCH7: north forest band + groves (mirrors client — dense board forest)
  if (ty >= 0 && ty <= 2 && tx >= 5 && tx <= 34 && (tx*5 + ty*11) % 5 !== 4) return true;
  if (tx >= 8 && tx <= 11 && ty >= 2 && ty <= 4 && (tx + ty) % 3 !== 2) return true;
  if (tx >= 24 && tx <= 27 && ty >= 2 && ty <= 4 && (tx*2 + ty) % 3 !== 0) return true;
  return false;
}

function isFenceTile(tx, ty) {   // mirrors client isFence()
  const onH = (ty === FARM_RECT.y0 || ty === FARM_RECT.y1) && tx >= FARM_RECT.x0 && tx <= FARM_RECT.x1;
  const onV = (tx === FARM_RECT.x0 || tx === FARM_RECT.x1) && ty >= FARM_RECT.y0 && ty <= FARM_RECT.y1;
  if (!onH && !onV) return false;
  if (ty === FARM_RECT.y0 && tx === 8) return false;  // north gate stays open
  return true;
}

export function isSolid(tx, ty, place) {
  // place: null = outside, 'church' | 'home' = interiors
  if (tx < 0 || ty < 0 || tx >= WORLD_W || ty >= WORLD_H) return true;
  if (place === 'church') {
    if (!(tx >= 15 && tx <= 25 && ty >= 18 && ty <= 25)) return true; // walls: stay in the room
    if ((tx === 17 || tx === 23) && (ty === 20 || ty === 22)) return true; // pews
    if (tx === 20 && ty === 20) return true; // altar
    return false;
  }
  if (place === 'home') {
    if (!(tx >= 29 && tx <= 37 && ty >= 18 && ty <= 25)) return true; // walls: stay in the room
    return false;
  }
  if (baseKind(tx, ty) === 'water') return true;      // the river (the bridge stays walkable)
  if (isTreeTile(tx, ty)) return true;
  if (isFenceTile(tx, ty)) return true;
  if (inRect(tx, ty, CHURCH_RECT) || inRect(tx, ty, HOME_RECT) || inRect(tx, ty, CAFE_RECT)) return true;
  for (const s of STALL_TILES) if (tx === s.tx && ty === s.ty) return true;
  if (tx === FOUNTAIN_TILE.tx && ty === FOUNTAIN_TILE.ty) return true;
  return false;
}

function solidAt(place, x, y) {
  return isSolid(Math.floor(x / TILE), Math.floor(y / TILE), place);
}

function collideMove(p, nx, ny) {
  // Axis-separated slide: try x, then y — players glide around obstacles
  // instead of sticking to them.
  if (!solidAt(p.place, nx, p.y)) p.x = nx;
  if (!solidAt(p.place, p.x, ny)) p.y = ny;
}

const CROP_GROW_MS = parseInt(process.env.CROP_GROW_MS || '45000', 10); // watered -> ready
const FISH_WAIT_MIN = parseInt(process.env.FISH_WAIT_MIN || '3000', 10);
const FISH_WAIT_MAX = parseInt(process.env.FISH_WAIT_MAX || '7000', 10);
const FISH_CATCH_WINDOW = parseInt(process.env.FISH_CATCH_WINDOW || '2500', 10);
const DAY_MS = parseInt(process.env.DAY_MS || '480000', 10); // one full day/night cycle (8 min)
const WORSHIP_COOLDOWN_MS = 20000;
const MAX_CANDLES = 12;

const VERSES = [
  { ref: 'Jeremiah 29:11', text: 'For I know the thoughts that I think toward you, saith the LORD, thoughts of peace, and not of evil, to give you an expected end.' },
  { ref: 'Psalm 23:1', text: 'The LORD is my shepherd; I shall not want.' },
];

// ---------- Character looks ----------
const LOOK_ENUMS = {
  skin: ['#f2c99a', '#e0ac7e', '#c68a5a', '#9a6540', '#6e452a'],
  hair: ['long', 'short', 'curly', 'bun'],
  hairColor: ['#2e1c10', '#4a2c14', '#8a5a2b', '#d9c08a', '#a34a2e'],
  outfit: ['#4a8ac9', '#c96a4a', '#6aa84f', '#9a6ac9', '#c9a44a'],
  accessory: ['none', 'hat', 'flower'],
};
export function defaultLook() {
  return { skin: LOOK_ENUMS.skin[0], hair: 'long', hairColor: LOOK_ENUMS.hairColor[1],
           outfit: LOOK_ENUMS.outfit[0], dress: false, accessory: 'none' };
}
export function validLook(l) {
  if (!l || typeof l !== 'object') return false;
  for (const k of Object.keys(LOOK_ENUMS)) {
    if (!LOOK_ENUMS[k].includes(l[k])) return false;
  }
  return typeof l.dress === 'boolean';
}
function sanitizeLook(l) { return validLook(l) ? { skin: l.skin, hair: l.hair, hairColor: l.hairColor, outfit: l.outfit, dress: l.dress, accessory: l.accessory } : defaultLook(); }

// ---------- Villagers ----------
export const NPC_DEFS = [
  { name: 'Hannah', hx: 21, hy: 12, r: 2.5, lines: [
    "It's always good to see you around. The town feels brighter when you're here.",
    'I planted marigolds by the plaza this morning. Small things grow, you know.',
    'If you ever need a quiet moment, the church candles are always lit for you.',
    'I dreamt the garden bloomed again last night. Maybe today is the day.',
    'You have a kind way about you. This village is lucky to have you.',
  ]},
  { name: 'Elias', hx: 16, hy: 11, r: 2, lines: [
    "Fresh bread, friend! Well — the bread is imaginary, but the welcome is real.",
    'A village is just people who keep showing up for each other.',
    "Take your time browsing. Nobody's in a hurry in Tikvah.",
  ]},
  { name: 'Miriam', hx: 23, hy: 17, r: 2, lines: [
    "I saved you a seat by the window. The light is lovely at this hour.",
    'Cooking for someone is my favorite way to say I care.',
    'Evening settles soft here. Stay a while.',
  ]},
];

// ---------- Room state ----------
let roomSeq = 0;
const rooms = new Map();   // code -> room
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ'; // no I, L, O (confusable)

function newCode() {
  let c;
  do { c = Array.from({length:4}, () => CODE_CHARS[Math.floor(Math.random()*CODE_CHARS.length)]).join(''); }
  while (rooms.has(c));
  return c;
}

function buildRoom(code, isPublic = false) {
  const now = Date.now();
  const room = {
    code, id: ++roomSeq, createdAt: now, isPublic,
    players: new Map(),   // ws -> player
    sockets: new Set(),
    farm: FARM_PLOTS.map(p => ({ tx: p.tx, ty: p.ty, stage: 'empty', t: 0 })),
    ruin: { open: false },
    ending: { done: false },
    fox: { x: 15*TILE, y: 18*TILE, tx: 15*TILE, ty: 18*TILE, nextMove: now+2000 },
    npcs: NPC_DEFS.map(d => ({
      name: d.name, lines: d.lines, hx: d.hx, hy: d.hy, r: d.r,
      x: d.hx*TILE + TILE/2, y: d.hy*TILE + TILE/2,
      tx: d.hx*TILE + TILE/2, ty: d.hy*TILE + TILE/2,
      nextMove: now + 1500 + Math.random()*3000,
      line: 0, hearts: {},   // hearts: playerId -> 0..5
    })),
    npcMoved: true,
    day: { n: 1, start: now },
    rhythm: { farm: false, fish: false, cook: false, greet: false, candle: false },
    candles: 0,
    lastWorship: 0,
    garden: { bloomed: false },
    home: { rug: 0 },
    // M3: persistent identity (no logins — the competition forbids accounts).
    // uuid -> { name, look, inv }. Keyed per room; the client generates the
    // uuid once, stores it in localStorage, and sends it on create/join.
    // Same uuid rejoins -> inventory/look/name restored. Server restarts
    // reset identities (Railway's disk is ephemeral).
    identities: new Map(),
    tickCount: 0,
    seq: 0,
  };
  rooms.set(code, room);
  return room;
}

function createRoom() {
  return buildRoom(newCode());   // private rooms: random 4-letter code, reaped when empty
}

function dist(ax, ay, bx, by) { return Math.hypot(ax-bx, ay-by); }

export function dayPhase(room, now = Date.now()) {
  const frac = (((now - room.day.start) % DAY_MS) + DAY_MS) % DAY_MS / DAY_MS;
  if (frac < 0.22) return 'morning';
  if (frac < 0.60) return 'day';
  if (frac < 0.78) return 'sunset';
  return 'night';
}
const PHASE_LABEL = { morning: 'Morning', day: 'Day', sunset: 'Sunset', night: 'Night' };

// ---------- Messaging helpers ----------
function send(ws, msg) { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); }
function broadcast(room, msg, except) {
  const s = JSON.stringify(msg);
  for (const ws of room.sockets) if (ws !== except && ws.readyState === 1) ws.send(s);
}
function err(ws, code, message) { send(ws, { t: 'error', code, message }); }

// ---------- Game logic ----------
// M3: traveler tokens. An old client sends no uuid — the server issues one
// and returns it in 'joined' so the client can store it.
const UUID_RE = /^[A-Za-z0-9-]{1,64}$/;
function sanitizeUuid(u) {
  const s = String(u || '').trim();
  return UUID_RE.test(s) ? s : randomUUID();
}
export { sanitizeUuid };

function addPlayer(room, ws, name, look, uuid) {
  const uid = sanitizeUuid(uuid);
  const rec = room.identities.get(uid);
  // A returning traveler picks up where they left off: inventory is always
  // restored; name/look fall back to the stored identity when the client
  // didn't resend them.
  const nameS = String(name || '').slice(0, MAX_NAME_LEN);
  const p = {
    id: 'p' + Math.random().toString(36).slice(2, 9),
    uuid: uid,
    name: nameS || (rec && rec.name) || 'Traveler',
    look: validLook(look) ? { ...sanitizeLook(look) } : (rec && validLook(rec.look) ? { ...rec.look } : defaultLook()),
    x: SPAWN.tx*TILE + TILE/2, y: SPAWN.ty*TILE + TILE/2,
    dir: 'right', moving: false,              // new travelers face the village (east)
    ix: 0, iy: 0,                       // current input vector
    emote: null, emoteAt: 0,
    inside: false,                       // inside any interior
    place: null,                         // 'church' | 'home' | null
    fishing: null,                       // {state:'cast', biteAt, windowUntil} | null
    qcAt: 0,                           // last quick-chat time (2 s anti-spam cooldown)
    inv: rec ? { ...rec.inv } : { produce: 0, fish: 0, meals: 0 },
  };
  room.identities.set(uid, { name: p.name, look: { ...p.look }, inv: { ...p.inv } });
  room.players.set(ws, p);
  room.sockets.add(ws);
  return p;
}

function playerPublic(p) {
  return { id: p.id, name: p.name, look: p.look,
           x: Math.round(p.x), y: Math.round(p.y),
           dir: p.dir, moving: p.moving, emote: p.emote, emoteAt: p.emoteAt,
           inside: p.inside, place: p.place,
           fishing: p.fishing ? p.fishing.state : null,
           inv: { ...p.inv } };
}

function npcPublic(n) {
  return { name: n.name, x: Math.round(n.x), y: Math.round(n.y) };
}

function dayPublic(room) {
  const phase = dayPhase(room);
  return { n: room.day.n, phase, label: PHASE_LABEL[phase], rhythm: { ...room.rhythm } };
}

function farmPublic(room) {
  return room.farm.map(f => ({ tx: f.tx, ty: f.ty, stage: f.stage }));
}

function px(f) { return { x: f.tx*TILE + TILE/2, y: f.ty*TILE + TILE/2 }; }

function nearestPlot(room, p) {
  let best = null, bd = INTERACT_RANGE;
  for (const f of room.farm) {
    const c = px(f), d = dist(p.x, p.y, c.x, c.y);
    if (d <= bd) { bd = d; best = f; }
  }
  return best;
}

function nearestNpc(room, p, range = INTERACT_RANGE) {
  let best = null, bd = range;
  for (const n of room.npcs) {
    const d = dist(p.x, p.y, n.x, n.y);
    if (d <= bd) { bd = d; best = n; }
  }
  return best;
}

function near(p, tx, ty, range = INTERACT_RANGE) {
  const c = { x: tx*TILE + TILE/2, y: ty*TILE + TILE/2 };
  return dist(p.x, p.y, c.x, c.y) <= range;
}

function nearCookSpot(p) {
  if (!p.inside && near(p, CAFE_COUNTER.tx, CAFE_COUNTER.ty)) return true;
  if (p.inside && p.place === 'home' && near(p, HEARTH.tx, HEARTH.ty)) return true;
  return false;
}

function setRhythm(room, key) {
  if (room.rhythm[key]) return;
  room.rhythm[key] = true;
  broadcast(room, { t: 'day', ...dayPublic(room) });
  checkBloom(room);
}

function checkBloom(room) {
  const r = room.rhythm;
  if (!room.garden.bloomed && r.farm && r.fish && r.cook && r.greet && r.candle) {
    room.garden.bloomed = true;
    broadcast(room, { t: 'garden-bloom',
      message: 'The Garden of Hope blooms — tended with love, day after day. 🌸' });
  }
}

function enterChurch(room, ws, p) {
  p.inside = true; p.place = 'church';
  p.x = CHURCH_EXIT.tx*TILE+TILE/2; p.y = CHURCH_EXIT.ty*TILE+TILE/2;
  broadcast(room, {t:'player', p: playerPublic(p)});
  return {ok:true, action:'enter-church'};
}
function enterHome(room, ws, p) {
  p.inside = true; p.place = 'home';
  p.x = HOME_EXIT.tx*TILE+TILE/2; p.y = HOME_EXIT.ty*TILE+TILE/2;
  broadcast(room, {t:'player', p: playerPublic(p)});
  return {ok:true, action:'enter-home'};
}
function exitInterior(room, ws, p, doorTx, doorTy) {
  p.inside = false; p.place = null;
  p.x = doorTx*TILE+TILE/2; p.y = (doorTy+1)*TILE+TILE/2;
  broadcast(room, {t:'player', p: playerPublic(p)});
}

function handleInteract(room, ws, p) {
  const now = Date.now();
  // ---- interiors ----
  if (p.inside && p.place === 'church') {
    if (near(p, CHURCH_EXIT.tx, CHURCH_EXIT.ty)) { exitInterior(room, ws, p, CHURCH_DOOR.tx, CHURCH_DOOR.ty); return {ok:true, action:'exit-church'}; }
    if (near(p, PRAY_SPOT.tx, PRAY_SPOT.ty)) {
      p.emote='pray'; p.emoteAt=now; broadcast(room, {t:'player', p: playerPublic(p)});
      // Worship moment: candles are lit -> a shared gentle beat
      if (room.candles > 0 && now - room.lastWorship > WORSHIP_COOLDOWN_MS) {
        room.lastWorship = now;
        broadcast(room, {t:'worship', by: p.name});
      }
      return {ok:true, action:'pray'};
    }
    if (near(p, VERSE_STAND.tx, VERSE_STAND.ty)) { const v = VERSES[Math.floor(Math.random()*VERSES.length)]; broadcast(room, {t:'verse', ref: v.ref, text: v.text, by: p.name}); return {ok:true, action:'read'}; }
    if (near(p, CANDLE_STAND.tx, CANDLE_STAND.ty)) {
      if (room.candles >= MAX_CANDLES) return {ok:false, reason:'candles-full'};
      room.candles++;
      setRhythm(room, 'candle');
      broadcast(room, {t:'candle', count: room.candles, by: p.name});
      return {ok:true, action:'candle'};
    }
    return {ok:false, reason:'nothing-nearby'};
  }
  if (p.inside && p.place === 'home') {
    if (near(p, HOME_EXIT.tx, HOME_EXIT.ty)) { exitInterior(room, ws, p, HOME_DOOR.tx, HOME_DOOR.ty); return {ok:true, action:'exit-home'}; }
    if (near(p, SLEEP_SPOT.tx, SLEEP_SPOT.ty)) {
      room.day.n++; room.day.start = now;
      // Sleep is personal rest: the day counter advances, but the room's
      // rhythm flags and garden bloom persist (sleep never wipes progress).
      broadcast(room, { t: 'day', ...dayPublic(room) });   // authoritative day: everyone
      send(ws, { t: 'slept', by: p.name, n: room.day.n }); // personal rest effect: sleeper only
      return {ok:true, action:'sleep'};
    }
    if (near(p, HEARTH.tx, HEARTH.ty)) { send(ws, {t:'menu', kind:'cook'}); return {ok:true, action:'cook-menu'}; }
    if (near(p, WARDROBE.tx, WARDROBE.ty)) { send(ws, {t:'menu', kind:'creator'}); return {ok:true, action:'creator-menu'}; }
    if (near(p, RUG_SPOT.tx, RUG_SPOT.ty)) {
      room.home.rug = (room.home.rug + 1) % 4;
      broadcast(room, {t:'decor', rug: room.home.rug, by: p.name});
      return {ok:true, action:'decorate'};
    }
    if (near(p, SIT_SPOT.tx, SIT_SPOT.ty)) { p.emote='sit'; p.emoteAt=now; broadcast(room, {t:'player', p: playerPublic(p)}); return {ok:true, action:'sit'}; }
    if (near(p, PRAY_NOOK.tx, PRAY_NOOK.ty)) { p.emote='pray'; p.emoteAt=now; broadcast(room, {t:'player', p: playerPublic(p)}); return {ok:true, action:'pray'}; }
    return {ok:false, reason:'nothing-nearby'};
  }
  // ---- outside ----
  // church door -> enter
  if (near(p, CHURCH_DOOR.tx, CHURCH_DOOR.ty)) return enterChurch(room, ws, p);
  // home door -> enter home
  if (near(p, HOME_DOOR.tx, HOME_DOOR.ty)) return enterHome(room, ws, p);
  // cafe counter -> cooking menu
  if (near(p, CAFE_COUNTER.tx, CAFE_COUNTER.ty)) { send(ws, {t:'menu', kind:'cook'}); return {ok:true, action:'cook-menu'}; }
  // farm
  const plot = nearestPlot(room, p);
  if (plot) {
    if (plot.stage === 'empty') { plot.stage = 'planted'; }
    else if (plot.stage === 'planted') { plot.stage = 'growing'; plot.t = now; }
    else if (plot.stage === 'ready') {
      plot.stage = 'empty';
      p.inv.produce++;
      setRhythm(room, 'farm');
      broadcast(room, {t:'harvest', by: p.name});
      broadcast(room, {t:'player', p: playerPublic(p)});
    }
    else return {ok:false, reason:'growing'};
    broadcast(room, {t:'farm', farm: farmPublic(room)});
    return {ok:true, action:'farm-' + plot.stage};
  }
  // dock -> fishing
  if (near(p, DOCK.tx, DOCK.ty)) {
    if (!p.fishing) {
      p.fishing = { state: 'cast', biteAt: now + FISH_WAIT_MIN + Math.random()*(FISH_WAIT_MAX-FISH_WAIT_MIN), windowUntil: 0 };
      broadcast(room, {t:'player', p: playerPublic(p)});
      return {ok:true, action:'cast'};
    }
    if (p.fishing.state === 'bite' && now <= p.fishing.windowUntil) {
      p.fishing = null;
      p.inv.fish++;
      setRhythm(room, 'fish');
      broadcast(room, {t:'catch', by: p.name});
      broadcast(room, {t:'player', p: playerPublic(p)});
      return {ok:true, action:'catch'};
    }
    return {ok:false, reason:'no-bite'};
  }
  // fox -> pet
  if (dist(p.x, p.y, room.fox.x, room.fox.y) <= INTERACT_RANGE) {
    p.emote='heart'; p.emoteAt=now; broadcast(room, {t:'player', p: playerPublic(p)});
    broadcast(room, {t:'pet', by: p.name});
    return {ok:true, action:'pet'};
  }
  // villager -> talk
  const npc = nearestNpc(room, p);
  if (npc) {
    const text = npc.lines[npc.line % npc.lines.length];
    npc.line++;
    // M3: friendship hearts key by the traveler's uuid, so friendships
    // persist across reconnects within the server run.
    const hearts = Math.min(5, (npc.hearts[p.uuid] || 0) + 1);
    npc.hearts[p.uuid] = hearts;
    setRhythm(room, 'greet');
    broadcast(room, {t:'say', name: npc.name, text, hearts, by: p.name});
    return {ok:true, action:'talk'};
  }
  return {ok:false, reason:'nothing-nearby'};
}

function handleCook(room, ws, p, action) {
  if (!nearCookSpot(p)) { send(ws, {t:'cook-fail', reason:'not-near-cook'}); return; }
  if (action === 'cook') {
    if (p.inv.produce < 1 || p.inv.fish < 1) { send(ws, {t:'cook-fail', reason:'need-produce-and-fish'}); return; }
    p.inv.produce--; p.inv.fish--; p.inv.meals++;
    setRhythm(room, 'cook');
    broadcast(room, {t:'cooked', by: p.name, meal: 'Harvest Stew', meals: p.inv.meals});
    broadcast(room, {t:'player', p: playerPublic(p)});
  } else if (action === 'eat') {
    if (p.inv.meals < 1) { send(ws, {t:'cook-fail', reason:'no-meal'}); return; }
    p.inv.meals--;
    broadcast(room, {t:'ate', by: p.name});
    broadcast(room, {t:'player', p: playerPublic(p)});
  } else if (action === 'give') {
    if (p.inv.meals < 1) { send(ws, {t:'cook-fail', reason:'no-meal'}); return; }
    // nearest other player first
    let best = null, bd = 110;
    for (const [, q] of room.players) {
      if (q === p) continue;
      const d = dist(p.x, p.y, q.x, q.y);
      if (d <= bd) { bd = d; best = q; }
    }
    if (best) {
      p.inv.meals--; best.inv.meals++;
      broadcast(room, {t:'gift', from: p.name, to: best.name, meal: 'Harvest Stew'});
      broadcast(room, {t:'player', p: playerPublic(p)});
      broadcast(room, {t:'player', p: playerPublic(best)});
    } else {
      const npc = nearestNpc(room, p, 110);
      if (!npc) { send(ws, {t:'cook-fail', reason:'nobody-nearby'}); return; }
      p.inv.meals--;
      npc.hearts[p.uuid] = Math.min(5, (npc.hearts[p.uuid] || 0) + 1);
      broadcast(room, {t:'gift', from: p.name, to: npc.name, meal: 'Harvest Stew'});
      broadcast(room, {t:'player', p: playerPublic(p)});
    }
  } else {
    err(ws, 'bad-cook', 'Unknown cooking action');
  }
}

function tickRoom(room) {
  const now = Date.now();
  const dt = 1/20;
  let moved = false;
  for (const [, p] of room.players) {
    if (p.ix !== 0 || p.iy !== 0) {
      const len = Math.hypot(p.ix, p.iy) || 1;
      const nx = Math.max(TILE/2, Math.min(WORLD_W*TILE - TILE/2, p.x + (p.ix/len)*MAX_SPEED*dt));
      const ny = Math.max(TILE/2, Math.min(WORLD_H*TILE - TILE/2, p.y + (p.iy/len)*MAX_SPEED*dt));
      collideMove(p, nx, ny);   // server-authoritative: solids block, walls slide
      if (!p.moving) { p.moving = true; moved = true; }
      else moved = true;
      if (p.ix < 0) p.dir='left'; else if (p.ix > 0) p.dir='right';
      else if (p.iy < 0) p.dir='up'; else if (p.iy > 0) p.dir='down';
    } else if (p.moving) { p.moving = false; moved = true; }
    if (p.emote && now - p.emoteAt > 3000) { p.emote = null; moved = true; }
    // fishing bite timing
    if (p.fishing && p.fishing.state === 'cast' && now >= p.fishing.biteAt) {
      p.fishing.state = 'bite'; p.fishing.windowUntil = now + FISH_CATCH_WINDOW;
      broadcast(room, {t:'bite', player: p.id});
    }
    if (p.fishing && p.fishing.state === 'bite' && now > p.fishing.windowUntil) {
      p.fishing = null; broadcast(room, {t:'player', p: playerPublic(p)});
    }
  }
  // villagers wander (slow, cozy)
  for (const n of room.npcs) {
    if (now >= n.nextMove) {
      const hx = n.hx*TILE+TILE/2, hy = n.hy*TILE+TILE/2;
      n.tx = Math.max((n.hx-n.r)*TILE, Math.min((n.hx+n.r)*TILE, n.x + (Math.random()-0.5)*4*TILE));
      n.ty = Math.max((n.hy-n.r)*TILE, Math.min((n.hy+n.r)*TILE, n.y + (Math.random()-0.5)*4*TILE));
      n.tx = Math.max(hx - n.r*TILE, Math.min(hx + n.r*TILE, n.tx));
      n.ty = Math.max(hy - n.r*TILE, Math.min(hy + n.r*TILE, n.ty));
      n.nextMove = now + 4000 + Math.random()*6000;
    }
    const dx = n.tx - n.x, dy = n.ty - n.y, l = Math.hypot(dx, dy);
    if (l > 4) { n.x += dx/l*28*dt; n.y += dy/l*28*dt; room.npcMoved = true; }
  }
  // M3: persist identity each tick (in-memory, per room) — inventory, look,
  // and name keyed by uuid, so a returning traveler restores them after a
  // disconnect while the server runs.
  for (const [, p] of room.players) {
    const rec = room.identities.get(p.uuid);
    if (rec) { rec.inv = { ...p.inv }; rec.look = { ...p.look }; rec.name = p.name; }
  }
  if (moved || room.npcMoved) {
    const msg = { t: 'tick', players: [...room.players.values()].map(playerPublic) };
    if (room.npcMoved) { msg.npcs = room.npcs.map(npcPublic); room.npcMoved = false; }
    broadcast(room, msg);
  }
  // day/night heartbeat (1s)
  room.tickCount++;
  if (room.tickCount % 20 === 0) broadcast(room, { t: 'day', ...dayPublic(room) });
  // crops
  let farmChanged = false;
  for (const f of room.farm) {
    if (f.stage === 'growing' && now - f.t >= CROP_GROW_MS) { f.stage = 'ready'; farmChanged = true; }
  }
  if (farmChanged) broadcast(room, {t:'farm', farm: farmPublic(room)});
  // fox wander
  const fox = room.fox;
  if (now >= fox.nextMove) {
    fox.tx = Math.max(2*TILE, Math.min(37*TILE, fox.x + (Math.random()-0.5)*6*TILE));
    fox.ty = Math.max(2*TILE, Math.min(25*TILE, fox.y + (Math.random()-0.5)*6*TILE));
    fox.nextMove = now + 2500 + Math.random()*4000;
  }
  const fdx = fox.tx - fox.x, fdy = fox.ty - fox.y, fl = Math.hypot(fdx, fdy);
  if (fl > 4) { fox.x += fdx/fl*40*dt; fox.y += fdy/fl*40*dt; broadcast(room, {t:'fox', x: Math.round(fox.x), y: Math.round(fox.y)}); }
  // ruin: both stones occupied simultaneously?
  if (!room.ruin.open) {
    const a = {x: STONE_A.tx*TILE+TILE/2, y: STONE_A.ty*TILE+TILE/2};
    const b = {x: STONE_B.tx*TILE+TILE/2, y: STONE_B.ty*TILE+TILE/2};
    let onA = false, onB = false;
    for (const [, p] of room.players) {
      if (p.inside) continue;
      if (dist(p.x, p.y, a.x, a.y) <= RUIN_STONE_RADIUS) onA = true;
      if (dist(p.x, p.y, b.x, b.y) <= RUIN_STONE_RADIUS) onB = true;
    }
    if (onA && onB) {
      room.ruin.open = true;
      broadcast(room, {t:'ruin-open', message: 'Hope lives here — discovered together.'});
    }
  }
  // ending: once the ruin is open, 2 or more travelers step into the garden
  // together — the rest of the village may be anywhere (mini-MMO: up to 10).
  if (room.ruin.open && !room.ending.done) {
    const ps = [...room.players.values()].filter(p => !p.inside);
    const inGarden = (p) => p.x >= 17*TILE && p.x < 23*TILE && p.y >= 13*TILE && p.y < 18*TILE;
    if (ps.filter(inGarden).length >= 2) {
      room.ending.done = true;
      broadcast(room, {t:'ending',
        title: 'The Garden of Hope',
        message: 'Two travelers. One village. A hope discovered together.'});
    }
  }
}

function joinedPayload(room, p, code) {
  return { t: 'joined', code, uuid: p.uuid, you: playerPublic(p),
           players: [...room.players.values()].map(playerPublic),
           farm: farmPublic(room), ruin: room.ruin, ending: room.ending.done,
           fox: {x: Math.round(room.fox.x), y: Math.round(room.fox.y)},
           npcs: room.npcs.map(npcPublic),
           day: dayPublic(room),
           candles: room.candles,
           garden: { bloomed: room.garden.bloomed },
           home: { rug: room.home.rug } };
}

// ---------- HTTP (static client) ----------
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.mp4':'video/mp4' };
const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const file = path.join(PUBLIC, path.normalize(urlPath).replace(/^(\.\.[\/\\])+/, ''));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (e, data) => {
    if (e) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, {'Content-Type': MIME[path.extname(file)] || 'application/octet-stream'});
    res.end(data);
  });
});

// ---------- WebSocket ----------
const wss = new WebSocketServer({ server });

// Simple per-IP connection rate limit: max 30 new connections / 10s per IP
const connLog = new Map();
setInterval(() => { const now = Date.now(); for (const [ip, arr] of connLog) { const f = arr.filter(t => now-t < 10_000); f.length ? connLog.set(ip, f) : connLog.delete(ip); } }, 5_000).unref();

wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress || 'unknown';
  const arr = connLog.get(ip) || [];
  if (arr.length >= 30) { ws.close(1013, 'rate limited'); return; }
  arr.push(Date.now()); connLog.set(ip, arr);

  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.room = null;
  ws.msgCount = 0; ws.msgWindow = Date.now();

  ws.on('message', (raw) => {
    // per-socket message rate limit: 120 msg / 2s
    const now = Date.now();
    if (now - ws.msgWindow > 2000) { ws.msgWindow = now; ws.msgCount = 0; }
    if (++ws.msgCount > 120) { ws.close(1013, 'rate limited'); return; }

    let m;
    try { m = JSON.parse(raw.toString()); } catch { err(ws, 'bad-json', 'Invalid message'); return; }
    if (!m || typeof m.t !== 'string') { err(ws, 'bad-msg', 'Invalid message'); return; }

    try {
      switch (m.t) {
        case 'create': {
          const name = String(m.name || '').slice(0, MAX_NAME_LEN);
          if (!name.trim()) { err(ws, 'bad-name', 'Name required'); return; }
          if (ws.room) { err(ws, 'in-room', 'Already in a room'); return; }
          const room = createRoom();
          const p = addPlayer(room, ws, name, m.look, m.uuid);
          ws.room = room;
          send(ws, joinedPayload(room, p, room.code));
          broadcast(room, {t:'join', p: playerPublic(p)}, ws);
          break;
        }
        case 'join': {
          const code = String(m.code || '').toUpperCase().trim();
          const name = String(m.name || '').slice(0, MAX_NAME_LEN);
          // 4-letter codes are private rooms; the fixed PUBLIC_CODE is the
          // persistent public village. Anything else is rejected.
          if ((code !== PUBLIC_CODE && !/^[A-Z]{4}$/.test(code)) || !rooms.has(code)) { err(ws, 'bad-code', 'Room not found. Check the code and try again.'); return; }
          if (!name.trim()) { err(ws, 'bad-name', 'Name required'); return; }
          if (ws.room) { err(ws, 'in-room', 'Already in a room'); return; }
          const room = rooms.get(code);
          if (room.players.size >= ROOM_CAP) { err(ws, 'room-full', 'Room is full'); return; }
          const p = addPlayer(room, ws, name, m.look, m.uuid);
          ws.room = room;
          send(ws, joinedPayload(room, p, code));
          broadcast(room, {t:'join', p: playerPublic(p)}, ws);
          break;
        }
        case 'input': {
          if (!ws.room) return;
          const p = ws.room.players.get(ws);
          if (!p) return;
          // validate: numbers, clamped to unit-ish vector; speed enforced server-side in tick
          let ix = Number(m.x), iy = Number(m.y);
          if (!Number.isFinite(ix) || !Number.isFinite(iy)) return;
          ix = Math.max(-1, Math.min(1, ix)); iy = Math.max(-1, Math.min(1, iy));
          p.ix = ix; p.iy = iy;
          break;
        }
        case 'interact': {
          if (!ws.room) return;
          const p = ws.room.players.get(ws);
          if (!p) return;
          const r = handleInteract(ws.room, ws, p);
          if (!r.ok) send(ws, { t: 'interact-fail', reason: r.reason });
          break;
        }
        case 'cook': {
          if (!ws.room) return;
          const p = ws.room.players.get(ws);
          if (!p) return;
          handleCook(ws.room, ws, p, String(m.action || ''));
          break;
        }
        case 'look': {
          if (!ws.room) return;
          const p = ws.room.players.get(ws);
          if (!p) return;
          if (!validLook(m.look)) { err(ws, 'bad-look', 'Invalid appearance'); return; }
          p.look = sanitizeLook(m.look);
          broadcast(ws.room, {t:'player', p: playerPublic(p)});
          break;
        }
        case 'emote': {
          if (!ws.room) return;
          const p = ws.room.players.get(ws);
          if (!p) return;
          const id = String(m.id || '');
          if (id !== 'wave' && id !== 'heart') { err(ws, 'bad-emote', 'Unknown emote'); return; }
          p.emote = id; p.emoteAt = Date.now();
          broadcast(ws.room, {t:'player', p: playerPublic(p)});
          break;
        }
        case 'quickchat': {
          if (!ws.room) return;
          const p = ws.room.players.get(ws);
          if (!p) return;
          // validate id against the preset list first: anything else is rejected,
          // and the client-supplied text (if any) is never used — the server
          // always broadcasts the exact preset text (no injection possible).
          const preset = QUICK_CHAT.find(q => q.id === String(m.id || ''));
          if (!preset) { err(ws, 'bad-quickchat', 'Unknown quick-chat phrase'); return; }
          if (now - p.qcAt < QUICK_CHAT_COOLDOWN_MS) { err(ws, 'quickchat-cooldown', 'Slow down a little'); return; }
          p.qcAt = now;
          broadcast(ws.room, { t: 'quickchat', by: p.name, byId: p.id, id: preset.id, text: preset.text });
          break;
        }
        case 'play-again': {
          if (!ws.room) return;
          const room = ws.room;
          if (room.isPublic) {
            // PUBLIC VILLAGE: play-again is a personal fresh start only. The
            // shared world state (farm, ruin, day, rhythm, candles, garden,
            // NPC hearts) is NEVER wiped here — the village carries on.
            const self = room.players.get(ws);
            if (!self) return;
            self.x = SPAWN.tx*TILE + TILE/2; self.y = SPAWN.ty*TILE + TILE/2;
            self.dir = 'right'; self.moving = false; self.ix = 0; self.iy = 0;
            self.emote = null; self.emoteAt = 0;
            self.inside = false; self.place = null; self.fishing = null;
            self.inv = { produce: 0, fish: 0, meals: 0 };
            const pub = playerPublic(self);
            broadcast(room, { t: 'player', p: pub }, ws);
            send(ws, { t: 'reset-personal', p: pub });
            break;
          }
          // private rooms: reset the shared world for a fresh run
          const now2 = Date.now();
          room.farm = FARM_PLOTS.map(p => ({ tx: p.tx, ty: p.ty, stage: 'empty', t: 0 }));
          room.ruin.open = false;
          room.ending.done = false;
          room.day = { n: 1, start: now2 };
          room.rhythm = { farm: false, fish: false, cook: false, greet: false, candle: false };
          room.candles = 0;
          room.lastWorship = 0;
          room.garden.bloomed = false;
          room.home.rug = 0;
          room.npcs = NPC_DEFS.map(d => ({
            name: d.name, lines: d.lines, hx: d.hx, hy: d.hy, r: d.r,
            x: d.hx*TILE + TILE/2, y: d.hy*TILE + TILE/2,
            tx: d.hx*TILE + TILE/2, ty: d.hy*TILE + TILE/2,
            nextMove: now2 + 1500 + Math.random()*3000,
            line: 0, hearts: {},
          }));
          room.npcMoved = true;
          for (const [, p] of room.players) {
            p.x = SPAWN.tx*TILE + TILE/2; p.y = SPAWN.ty*TILE + TILE/2;
            p.dir = 'right'; p.moving = false; p.ix = 0; p.iy = 0;
            p.emote = null; p.emoteAt = 0; p.inside = false; p.place = null; p.fishing = null;
            p.inv = { produce: 0, fish: 0, meals: 0 };
          }
          const r = joinedPayload(room, [...room.players.values()][0] || { id:'', name:'' }, room.code);
          broadcast(room, { t: 'reset',
            players: [...room.players.values()].map(playerPublic),
            farm: farmPublic(room), ruin: room.ruin,
            fox: { x: Math.round(room.fox.x), y: Math.round(room.fox.y) },
            npcs: r.npcs, day: r.day, candles: room.candles,
            garden: r.garden, home: r.home });
          break;
        }
        default: err(ws, 'unknown', 'Unknown message type');
      }
    } catch (e) { err(ws, 'server-error', 'Something went wrong'); }
  });

  ws.on('close', () => {
    const room = ws.room;
    if (!room) return;
    const p = room.players.get(ws);
    room.players.delete(ws); room.sockets.delete(ws);
    if (p) broadcast(room, {t:'leave', id: p.id, name: p.name});
    // Keep empty PRIVATE rooms briefly so a dropped player can rejoin, then
    // reap. The public village is exempt: it is never reaped, so its world
    // state persists while the server runs even when everyone leaves.
    if (!room.isPublic && room.players.size === 0) {
      setTimeout(() => { if (room.players.size === 0) rooms.delete(room.code); }, REAP_MS).unref();
    }
  });
});

setInterval(() => {
  wss.clients.forEach(ws => { if (!ws.isAlive) { ws.terminate(); return; } ws.isAlive = false; ws.ping(); });
}, 30_000).unref();

setInterval(() => { for (const [, room] of rooms) if (room.players.size > 0) tickRoom(room); }, 50); // 20 Hz

// M2: create the permanent public village at startup. It is never reaped,
// so the shared world persists in memory while the server runs.
buildRoom(PUBLIC_CODE, true);

server.listen(PORT, () => console.log(`Tikvah Track-A server on http://localhost:${PORT}`));

// test hooks
export function _getRooms() { return rooms; }
export { createRoom as _createRoom };
