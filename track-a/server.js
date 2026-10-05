// Tikvah — Track A competition build. Authoritative Node.js + WebSocket server.
// Serves the static client from ./public and hosts game rooms with short codes.
//
// Life-sim layer (2026-09-27 sprint): character looks, home interior, day/night,
// cooking, church prayer + worship, a weekly sermon, villager NPCs with dialogue,
// and a gentle shared day rhythm (farm, fish, cook, greet, worship) that blooms
// the Garden of Hope.
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
export const WORLD_W = 56, WORLD_H = 40;          // 1792 x 1280 px — WORLD-EXPANSION (2026-10-05):
// was 40x28; eastern wilds (x40-55) + southern riverside (y28-39). Town core unchanged.
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
// (farm crops, garden bloom, worship, day phase, NPC hearts) persists in
// server memory while the server runs. Railway's disk is ephemeral, so a
// server restart resets the village.
export const PUBLIC_CODE = 'TIKVAH';
const REAP_MS = parseInt(process.env.REAP_MS || '60000', 10); // empty private-room grace

// Village layout (tile coords) — BATCH6b board composition
export const FARM_PLOTS = [ {tx:6,ty:15}, {tx:8,ty:15}, {tx:10,ty:15}, {tx:6,ty:17}, {tx:8,ty:17}, {tx:10,ty:17} ];
export const DOCK = { tx: 17, ty: 20 };            // fishing spot (sand bank by the river)
// WORLD-EXPANSION (2026-10-05): south-bank docks for the Riverside Meadow
export const DOCKS = [DOCK, { tx: 10, ty: 25 }, { tx: 34, ty: 25 }];
export const CHURCH_DOOR = { tx: 30, ty: 15 };    // press E near door -> enter
export const CHURCH_EXIT = { tx: 20, ty: 24 };    // interior exit spot
export const PRAY_SPOT = { tx: 20, ty: 20 };      // interior: pray / worship
export const VERSE_STAND = { tx: 16, ty: 20 };    // interior: read one verse
// CHURCH-REDESIGN (2026-10-03): the candle stand is gone. Pews run in two rows
// (ty 21 and 23) flanking a center aisle (tx 20); the aisle-adjacent tiles
// (19/21) of each bank are walkable sit gaps — press E there to sit.
export const STONE_A = { tx: 6, ty: 5 };          // forest clearing
export const STONE_B = { tx: 34, ty: 5 };         // ruins clearing
// RESTORE THE LIGHT (M4): fallen stones bar every approach to the ruins
// clearing until the forest stone answers. Gate tiles seal the clearing
// (arch mouth, west grass, lane head, clearing floor) — while shut they are
// solid to players; the moment the way opens they are walkable mossy stone.
export const GATE_TILES = [ {tx:33,ty:4}, {tx:34,ty:3}, {tx:33,ty:5}, {tx:33,ty:6}, {tx:34,ty:6} ];
const RUIN_HOLD_MS = parseInt(process.env.RUIN_HOLD_MS || '2000', 10); // stand-and-hold to wake a stone
function newRuin() {
  return { open: false, a: false, b: false, gate: false, aSince: 0, bSince: 0, sentKey: null };
}
// The way into the ruins stands open while the forest stone is held, and
// stays open once either stone has truly woken (the ruin remembers).
function ruinGateOpen(room, onA) {
  const R = room.ruin;
  return R.open || R.a || R.b || !!onA;
}
function ruinPublic(room, onA, onB) {
  const R = room.ruin;
  // a/b mean the stone has truly woken (held a moment, or answered together
  // when the ruin opened) — merely standing on a stone must not claim it
  // answered, or a lone traveler hears "the way is open" before it stays open.
  return { open: R.open, a: R.a, b: R.b, gate: ruinGateOpen(room, onA) };
}
function sendRuin(room, onA, onB) { broadcast(room, { t: 'ruin', ruin: ruinPublic(room, onA, onB) }); }
export const SPAWN = { tx: 13, ty: 14 };       // west lane just east of home: first view looks
                                                // east down the market lane toward the plaza
// Home (exterior)
export const HOME_DOOR = { tx: 8, ty: 12 };       // press E near door -> enter home
// Home interior (separate tile region, drawn instead of the world).
// Spots are on a 3-tile grid so their 56px interact zones never overlap.
// (walkTo stops within 30px of a target; 96px spacing keeps every stop unambiguous.)
export const HOME_EXIT = { tx: 32, ty: 24 };
// Ariel (2026-10-04): no sleep in the game — days roll over on their own clock.
// (SLEEP_SPOT/bed interact removed; the bed remains home furniture.)
export const HEARTH = { tx: 35, ty: 18 };          // cook spot (home)
export const WARDROBE = { tx: 32, ty: 21 };        // change clothes
export const RUG_SPOT = { tx: 29, ty: 21 };        // decorate: cycle rug color
export const SIT_SPOT = { tx: 35, ty: 21 };        // sit
export const PRAY_NOOK = { tx: 32, ty: 18 };       // pray at home
// Cafe (exterior cook spot)
export const CAFE_COUNTER = { tx: 15, ty: 16 };   // WORLD-EXPANSION/LAYOUT: cafe west of plaza

// ---------- Collision (server-authoritative) ----------
// Pew layout (CHURCH-REDESIGN 2026-10-03): rows at ty 21/23, banks tx 16..18 and
// tx 22..24 are solid; the aisle-adjacent tiles (tx 19/21) of each bank stay
// walkable as designated sit gaps so players can sit in a pew.
export const PEW_SIT_SPOTS = [ {tx:19,ty:21}, {tx:21,ty:21}, {tx:19,ty:23}, {tx:21,ty:23} ];
// The client renders server positions (no client-side prediction), so the server
// is the single decider: a player's center may never enter a solid tile.
// Tile predicates mirror the client's drawing layout (baseTile/isTree/isFence)
// so what looks solid is solid.
const FARM_RECT = { x0: 5, y0: 14, x1: 11, y1: 18 };    // matches client fence rect
const CHURCH_RECT = { x0: 28, y0: 9, x1: 32, y1: 14 };  // building incl. roof row
const HOME_RECT = { x0: 7, y0: 9, x1: 10, y1: 11 };
const CAFE_RECT = { x0: 14, y0: 13, x1: 16, y1: 15 };   // WORLD-EXPANSION/LAYOUT: cafe west of plaza
const STALL_TILES = [ {tx:14,ty:10}, {tx:16,ty:10}, {tx:18,ty:10} ];
const FOUNTAIN_TILE = { tx: 20, ty: 15 };
// BATCH7: pink-blossom clusters along the lanes and plaza (mirrors client)
const BLOSSOM_SPOTS = [[18,19],[23,7],[12,7],[25,11],[21,7],[24,17],[14,19],[25,19],[9,6],[33,17]];
// (15,17) moved to (18,19): the old spot is now the cafe entrance footpath.
function isBlossomSpot(tx, ty) { for (const s of BLOSSOM_SPOTS) if (s[0]===tx && s[1]===ty) return true;
  // WORLD-EXPANSION: Old Orchard rows (mirrors client)
  if (tx>=42 && tx<=54 && ty>=30 && ty<=38 && tx%3===0 && ty%3===1) return true;
  return false; }

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
  // WORLD-EXPANSION (2026-10-05): mirrors client baseTile — eastern wilds + southern riverside
  if (tx === 48 && ty >= 6 && ty <= 16) return 'path';  // ruins trail
  if (ty === 16 && tx >= 28 && tx <= 46) return 'path'; // church to the wilds
  if (tx >= 19 && tx <= 21 && ty >= 26 && ty <= 28) return 'path'; // bridge landing to riverside
  if (ty === 28 && tx >= 6 && tx <= 50) return 'path';  // riverside walk
  if (tx === 12 && ty >= 28 && ty <= 32) return 'path'; // to Riverside Meadow
  if (tx === 30 && ty >= 28 && ty <= 32) return 'path'; // to Sunberry Meadow
  if (tx === 44 && ty >= 28 && ty <= 32) return 'path'; // to Old Orchard
  if (ty === 32 && tx >= 10 && tx <= 46) return 'path'; // meadow lane
  if (tx >= 31 && tx <= 32 && ty >= 34 && ty <= 35) return 'water'; // meadow pond
  if (tx >= 30 && tx <= 33 && ty >= 33 && ty <= 36) return 'sand';  // pond shore
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
  if (tx >= 35 && tx <= 39 && ty >= 0 && ty <= 20) {
    if (ty === 16) return false;   // WORLD-EXPANSION: the east path runs through
    return (tx*11 + ty*5) % 5 !== 4;
  }
  // BATCH7: north forest band + groves (mirrors client — dense board forest)
  if (ty >= 0 && ty <= 2 && tx >= 5 && tx <= 34 && (tx*5 + ty*11) % 5 !== 4) return true;
  if (tx >= 8 && tx <= 11 && ty >= 2 && ty <= 4 && (tx + ty) % 3 !== 2) return true;
  if (tx >= 24 && tx <= 27 && ty >= 2 && ty <= 4 && (tx*2 + ty) % 3 !== 0) return true;
  // WORLD-EXPANSION: Whispering Forest + Deep Ruins (mirrors client)
  if (tx >= 42 && tx <= 55 && ty >= 8 && ty <= 22) {
    if (ty === 16 && tx <= 46) return false;
    if (tx === 48) return false;
    if (tx >= 44 && tx <= 46 && ty >= 15 && ty <= 17) return false;
    return (tx*13 + ty*7) % 4 !== 3;
  }
  if (tx >= 44 && tx <= 55 && ty >= 2 && ty <= 8) {
    if (tx === 48) return false;
    if (tx >= 50 && tx <= 51 && ty >= 4 && ty <= 5) return false; // decorative arch
    return (tx*7 + ty*13) % 5 === 0;
  }
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
    // CHURCH-REDESIGN (2026-10-03): pew rows (ty 21/23, banks 16-18 / 22-24)
    // are solid; the aisle-adjacent sit gaps (tx 19/21) stay walkable.
    if ((ty === 21 || ty === 23) && ((tx >= 16 && tx <= 18) || (tx >= 22 && tx <= 24))) return true;
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

function collideMove(room, p, nx, ny) {
  // Axis-separated slide: try x, then y — players glide around obstacles
  // instead of sticking to them. RESTORE THE LIGHT: the fallen stones at
  // the ruin mouth are solid until the way opens.
  const gateBlocked = (x, y) => !p.inside && room && !room.ruin.gate &&
    GATE_TILES.some(t => Math.floor(x / TILE) === t.tx && Math.floor(y / TILE) === t.ty);
  if (!solidAt(p.place, nx, p.y) && !gateBlocked(nx, p.y)) p.x = nx;
  if (!solidAt(p.place, p.x, ny) && !gateBlocked(p.x, ny)) p.y = ny;
}

const CROP_GROW_MS = parseInt(process.env.CROP_GROW_MS || '45000', 10); // watered -> ready
const FISH_WAIT_MIN = parseInt(process.env.FISH_WAIT_MIN || '3000', 10);
const FISH_WAIT_MAX = parseInt(process.env.FISH_WAIT_MAX || '7000', 10);
const FISH_CATCH_WINDOW = parseInt(process.env.FISH_CATCH_WINDOW || '2500', 10);
const DAY_MS = parseInt(process.env.DAY_MS || '480000', 10); // one full day/night cycle (8 min)
const WORSHIP_COOLDOWN_MS = 20000;

// ---------- RESTORE THE LIGHT: quiet town-restoration engine ----------
// Free life-sim play quietly restores the town. There is NO checklist and NO
// progress bar — players feel progress through the world changing. Only the
// stage and its world-effects are synced; the raw contribution counts are
// server-private and never leave this file.
// CHURCH-REDESIGN (2026-10-03): 'candle' was removed as a warmth kind and
// replaced by 'sermon' — sincere worship at the church (prayer at the altar,
// sitting through the weekly sermon). Same thresholds/semantics as before:
// each kind counts up to twice toward the town's warmth.
export const RESTORE_KINDS = ['farm','fish','cook','give','greet','sermon','fox','explore'];
export const RESTORE_STAGES = ['dimmed','stirring','awake','discovered','relight','complete'];
export const LANTERN_TOTAL = 6;   // mirrors the client's LAMPS list (count only;
// the client owns the tile positions and lights nearest-the-plaza first)
const RESTORE_STIR = parseInt(process.env.RESTORE_STIR || '3', 10);    // warmth where the town begins to stir
const RESTORE_AWAKE = parseInt(process.env.RESTORE_AWAKE || '8', 10);  // warmth where the Old Garden wakes
const RELIGHT_STEP_MS = parseInt(process.env.RELIGHT_STEP_MS || '900', 10); // one lantern per step on the Return
const RESTORE_GATHER_MS = parseInt(process.env.RESTORE_GATHER_MS || '90000', 10); // villagers gather this long
function newRestore() {
  return {
    stage: 'dimmed',          // RESTORE_STAGES ladder; only moves forward
    acts: { farm: 0, fish: 0, cook: 0, give: 0, greet: 0, sermon: 0, fox: 0, explore: 0 },
    explorers: new Set(),     // uuids that have reached the wild north (counts once each)
    discoverySeen: false,     // the ruin has been opened and its writing witnessed
    gardenWoke: false,        // the Old Garden has come back to life (beds waking)
    lit: 0,                   // town lanterns relit so far on the Return
    central: false,           // the central light is on (finale)
    gatherUntil: 0,           // villagers drift to the garden/plaza while > now
    relightAt: 0,             // last lantern-step timestamp
    soloGardenSince: 0,       // STORY-FIX G1: solo finale — when the lone traveler entered the garden
  };
}
function stageRank(s) { return RESTORE_STAGES.indexOf(s); }
function restorePublic(room) {
  const r = room.restore;
  return {
    stage: r.stage,
    garden: room.garden.bloomed ? 'blooming' : (r.gardenWoke ? 'waking' : 'dormant'),
    lit: r.lit, lanterns: LANTERN_TOTAL,
    central: r.central, discovery: r.discoverySeen,
  };
}
function sendRestore(room) { broadcast(room, { t: 'restore', restore: restorePublic(room) }); }
// Warmth is deliberately forgiving: each kind of living counts, and doing a
// couple of things twice matters as much as doing everything once. The raw
// number stays server-side; players only ever see the town change.
function restoreWarmth(room) {
  let w = 0;
  for (const k of RESTORE_KINDS) w += Math.min(room.restore.acts[k] || 0, 2);
  return w;
}
function contribute(room, kind) {
  if (!room.restore.acts.hasOwnProperty(kind)) return;
  room.restore.acts[kind]++;
  advanceRestore(room);
}
function advanceRestore(room) {
  const r = room.restore;
  const key = () => r.stage + '|' + r.gardenWoke + '|' + r.gatherUntil;
  const before = key();
  const rhythmDone = room.rhythm.farm && room.rhythm.fish && room.rhythm.cook && room.rhythm.greet && room.rhythm.sermon;
  const warmth = restoreWarmth(room);
  if (r.stage === 'dimmed' && warmth >= RESTORE_STIR) r.stage = 'stirring';
  if ((r.stage === 'dimmed' || r.stage === 'stirring') && (warmth >= RESTORE_AWAKE || rhythmDone)) r.stage = 'awake';
  // The discovery out in the ruins turns the story homeward — even if
  // travelers found the ruin before the garden woke.
  if (r.discoverySeen && stageRank(r.stage) < stageRank('discovered')) r.stage = 'discovered';
  if ((stageRank(r.stage) >= stageRank('awake') || r.discoverySeen) && !r.gardenWoke) {
    r.gardenWoke = true;
    r.gatherUntil = Date.now() + RESTORE_GATHER_MS;   // the villagers come outside
  }
  if (key() !== before) sendRestore(room);
}

const VERSES = [
  { ref: 'Jeremiah 29:11', text: 'For I know the thoughts that I think toward you, saith the LORD, thoughts of peace, and not of evil, to give you an expected end.' },
  { ref: 'Psalm 23:1', text: 'The LORD is my shepherd; I shall not want.' },
];
// RESTORE THE LIGHT — the Discovery (the one new Scripture for this build).
// Jesus is the Light; the players restore a community, never saviors.
const JOHN_812 = { ref: 'John 8:12', text: 'I am the light of the world: he that followeth me shall not walk in darkness, but shall have the light of life.' };

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
    'If you ever need a quiet moment, the church door is always open for you.',
    'I dreamt the garden bloomed again last night. Maybe today is the day.',
    'You have a kind way about you. This village is lucky to have you.',
    'The Old Garden by the fountain was our gathering place once. Nobody tends it anymore.',
  ]},
  { name: 'Elias', hx: 16, hy: 11, r: 2, lines: [
    "Fresh bread, friend! Well — the bread is imaginary, but the welcome is real.",
    'A village is just people who keep showing up for each other.',
    "Take your time browsing. Nobody's in a hurry in Tikvah.",
    'The town lamps have been dark a long while now. We used to gather by their light.',
  ]},
  { name: 'Miriam', hx: 23, hy: 17, r: 2, lines: [
    "I saved you a seat by the window. The light is lovely at this hour.",
    'Cooking for someone is my favorite way to say I care.',
    'Evening settles soft here. Stay a while.',
    'When the lamps went out, we all drifted home early. I miss the evenings together.',
  ]},
  // CHURCH-REDESIGN (2026-10-03): the village pastor. Present in the church at
  // scheduled sermon times (see sermonActive), otherwise near the church.
  // NOTE (Ariel 2026-10-04): the pastor is Pastor Nathan (male) — her chosen name.
  { name: 'Pastor Nathan', hx: 28, hy: 16, r: 2, lines: [
    'Welcome, traveler. The church is open to all — come as you are.',
    'On sermon days, from morning till afternoon, I preach the Scripture at the altar. Come sit a while.',
    '"The LORD is my shepherd; I shall not want." — Psalm 23:1. Hold that close today.',
    'The light we lost is coming back — I can feel it in the village.',
    'Peace to you. You are always welcome here.',
  ]},
];

// ---------- TOWN-LIFE (2026-10-03): a living town ----------
// Ariel: "the whole town should be like Harvest Town". Every named villager
// keeps a deterministic daily schedule keyed off the already-synced day
// counter + phase, so both travelers see the same village with no new sync
// architecture. Priority each tick: weekly sermon (shipped, untouched) >
// restoration gathering (shipped, untouched) > daily schedule (new).
// Homes are porch tiles on the lane edges and work spots sit on walkable
// tiles; every route leg is lane-routed and the suite verifies no leg
// crosses a solid tile, so villagers can never get stuck.
// NOTE (Ariel): every name, home, and line below is renameable — say the word.

// Time-of-day greetings: the first talk of each day to each traveler.
// Warmer once befriended (hearts >= 3). The heart mechanic itself is unchanged.
export const TOWN_GREETS = {
  morning: [
    'Good morning! The village is just waking up — I am glad you are here.',
    'Good morning, dear friend! It is always brighter when you are around.',
  ],
  day: [
    'Good day, traveler! Fine weather for living the village rhythm.',
    'Good day, friend! Come sit a while — the day is kind.',
  ],
  sunset: [
    'Evening settles soft here. Stay a while.',
    'Evening, friend. You made the day better just by being in it.',
  ],
  night: [
    'The lamps are lit and the village is quiet. Rest well.',
    'Night blessings, dear friend. The lamps are lit — home is near.',
  ],
};
export function townGreeting(phase, warm) {
  const g = TOWN_GREETS[phase] || TOWN_GREETS.day;
  return warm ? g[1] : g[0];
}

// Short ambient lines when two villagers cross paths and pause to chat.
export const NPC_CHAT_LINES = [
  'Mind the marigolds — they are showing off today.',
  'The café has something warm if you stop by.',
  'Have you seen the garden? It is waking up, I swear it.',
  'Pastor Nathan preaches on sermon day, morning till afternoon. Do not forget.',
  'Evening lamps, morning birds — this village takes care of us.',
  'I saved you the sunny bench by the fountain.',
  'Small faithfulness, day after day. That is the whole secret.',
];

// Per-villager schedule geography: [tx, ty] tiles. Roles: Hannah keeps the
// garden and plaza flowers; Elias vendors the market stall; Miriam keeps the
// café; Pastor Nathan welcomes at the church door.
// Every leg — including slot-transition legs — is lane-routed around the
// fountain, the café, and the trees; the suite walks every full-day route and
// fails if any leg crosses a solid tile.
export const TOWN_SCHEDULE = {
  'Hannah': { home: [11,11],
    // WORLD-EXPANSION/LAYOUT: cafe west of plaza — goWork routes via the market
    // lane around the cafe's north side (was [13,12],[17,14] which clips it).
    goWork: [[13,12],[17,12],[17,14],[19,16]],
    workWp: [[19,16],[21,16],[17,16]], workAct: 'tend',
    lunchWp: [[19,15]],
    aftA: [[19,16],[22,16],[17,16]], aftActA: 'tend',
    aftB: [[19,14],[19,12],[20,11]], aftActB: 'stroll',
    marketWp: [[19,12],[16,11],[14,11],[16,11],[18,11],[15,11],[17,11]],
    evening: [[19,14],[17,12],[13,12],[11,11]] },
  'Elias': { home: [20,11],
    goWork: [[19,11],[17,11],[16,11]],
    workWp: [[16,11]], workAct: 'serve',
    lunchWp: [[22,14],[21,15]],
    aftA: [[21,16],[18,16],[18,14],[22,14],[22,13],[18,13]], aftActA: 'stroll',
    aftB: [[22,16],[24,16],[26,16],[26,18]], aftActB: 'stroll',
    marketWp: [[18,12],[16,11],[14,11],[18,11],[15,11],[17,11]],
    evening: [[20,18],[18,18],[18,12],[20,11]] },
  'Miriam': { home: [26,18],
    // WORLD-EXPANSION/LAYOUT (2026-10-05): cafe moved west of the plaza (counter
    // 15,16) — Miriam's commute rerouted via the south lane; all legs walkable.
    goWork: [[24,18],[20,18],[16,18],[16,16],[15,16]],
    workWp: [[15,16]], workAct: 'serve',
    lunchWp: [[14,16],[14,17]],
    aftA: [[16,18],[20,18],[13,18],[13,12],[11,11]], aftActA: 'stroll',
    aftB: [[16,18],[20,18],[14,17],[12,17]], aftActB: 'tend',
    marketWp: [[13,18],[13,12],[14,11],[16,11],[18,11],[15,11],[17,11]],
    evening: [[13,12],[13,18],[16,18],[20,18],[24,18],[26,18]] },
  'Pastor Nathan': { home: [27,17],
    goWork: [[29,16],[30,16]],
    workWp: [[30,16]], workAct: 'idle',
    lunchWp: [[29,16]],
    aftA: [[31,16],[28,16],[33,16]], aftActA: 'tend',
    aftB: [[28,17],[22,16],[18,16]], aftActB: 'stroll',
    marketWp: [[28,17],[24,18],[20,18],[19,14],[16,12],[14,11],[16,11],[18,11],[15,11],[17,11]],
    marketEve: [[24,18],[28,17],[27,17]],
    evening: [[24,18],[28,17],[27,17]] },
};
// Market-day bustle: on market day every villager browses the stalls in the
// afternoon instead of their usual activity.

export function dayFrac(room, now = Date.now()) {
  return ((((now - room.day.start) % DAY_MS) + DAY_MS) % DAY_MS) / DAY_MS;
}
// TOWN-LIFE: the weekly market day. Day 1 is the sermon day (shipped); the
// market gathers mid-week on day 4 (mod 7). Ariel: rename/re-day freely.
export function marketDayActive(room) { return room.day.n % 7 === 4; }
// TOWN-LIFE: shop hours, derived from the synced clock — living feel only,
// no transaction changes. Stalls keep morning+day hours (plus sunset on
// market day); the café stays open through sunset.
export function shopHours(room, now = Date.now()) {
  const phase = dayPhase(room, now);
  const market = marketDayActive(room);
  return {
    stalls: (phase === 'morning' || phase === 'day' || (market && phase === 'sunset')) ? 'open' : 'closed',
    cafe: (phase === 'morning' || phase === 'day' || phase === 'sunset') ? 'open' : 'closed',
  };
}
// Deterministic schedule slot for one villager: pure function of the villager
// name, day number, phase, and within-day fraction. Returns null for unknown
// names (never happens for the four villagers).
export function townSlot(npcName, dayN, phase, frac) {
  const S = TOWN_SCHEDULE[npcName];
  if (!S) return null;
  const idx = NPC_DEFS.findIndex(d => d.name === npcName);
  let slot, waypoints, act;
  if (phase === 'morning') {
    if (frac < 0.055) { slot = 'wake'; waypoints = [S.home]; act = 'wake'; }
    else { slot = 'gowork'; waypoints = S.goWork; act = 'carry'; }
  } else if (phase === 'day') {
    const t = (frac - 0.22) / 0.38;
    if (t < 1 / 3) {
      slot = 'work'; waypoints = S.workWp;
      act = npcName === 'Elias' || npcName === 'Miriam' ? 'serve' : (npcName === 'Hannah' ? 'tend' : 'idle');
    } else if (t < 2 / 3) { slot = 'lunch'; waypoints = S.lunchWp; act = 'lunch'; }
    else if (dayN % 7 === 4) { slot = 'bustle'; waypoints = S.marketWp; act = 'browse'; }
    else {
      slot = 'afternoon';
      const alt = ((dayN + idx) % 2 + 2) % 2 === 0;
      waypoints = alt ? S.aftA : S.aftB;
      act = alt ? S.aftActA : S.aftActB;
    }
  } else if (phase === 'sunset') {
    slot = 'evening';
    // on market day Pastor Nathan's return routes around the café crowds
    waypoints = (dayN % 7 === 4 && S.marketEve) ? S.marketEve : S.evening;
    act = 'stroll';
  }
  else { slot = 'night'; waypoints = [S.home]; act = 'home'; }
  return { key: slot + '|' + dayN, waypoints, act };
}
// Full ordered waypoint route for one villager's day — slot transitions
// included — so the suite can verify no leg ever crosses a solid tile.
export function townDayRoute(npcName, dayN) {
  if (!TOWN_SCHEDULE[npcName]) return null;
  const route = [];
  route.push(...townSlot(npcName, dayN, 'morning', 0.01).waypoints);  // wake
  route.push(...townSlot(npcName, dayN, 'morning', 0.15).waypoints);  // gowork
  route.push(...townSlot(npcName, dayN, 'day', 0.25).waypoints);      // work
  route.push(...townSlot(npcName, dayN, 'day', 0.45).waypoints);      // lunch
  route.push(...townSlot(npcName, dayN, 'day', 0.55).waypoints);      // afternoon / bustle
  route.push(...townSlot(npcName, dayN, 'sunset', 0.65).waypoints);   // evening
  route.push(...townSlot(npcName, dayN, 'night', 0.85).waypoints);    // night
  return route;
}

function newNpc(d, now) {
  return {
    name: d.name, lines: d.lines, hx: d.hx, hy: d.hy, r: d.r,
    x: d.hx*TILE + TILE/2, y: d.hy*TILE + TILE/2,
    tx: d.hx*TILE + TILE/2, ty: d.hy*TILE + TILE/2,
    nextMove: now + 1500 + Math.random()*3000,
    line: 0, hearts: {}, greetDay: {},   // greetDay: uuid -> day n of first greeting
    act: 'idle', slotKey: '', wpIdx: 0, chatUntil: 0,
  };
}
function setNpcTarget(n, w) { n.tx = w[0]*TILE + TILE/2; n.ty = w[1]*TILE + TILE/2; }
// TOWN-LIFE: drive every villager along their deterministic daily schedule.
// Pure-ish: reads room.day + clock, writes npc targets/act. Called from
// tickRoom when neither the sermon nor the restoration gathering owns the
// villagers. Exported for the suite.
export function npcScheduleTick(room, now) {
  const phase = dayPhase(room, now), frac = dayFrac(room, now);
  for (const n of room.npcs) {
    const s = townSlot(n.name, room.day.n, phase, frac);
    if (!s) continue;
    if (s.key !== n.slotKey) {
      n.slotKey = s.key; n.wpIdx = 0;
      setNpcTarget(n, s.waypoints[0]);
      room.npcMoved = true;
    }
    if (n.act !== s.act) room.npcMoved = true;
    n.act = s.act;
    // stroll multi-waypoint slots; settle on the final waypoint.
    // (gated while chatting — the chat keeps the true target, so the
    // villager resumes the route afterwards instead of skipping ahead.)
    const wps = s.waypoints;
    if (now >= n.chatUntil && Math.hypot(n.tx - n.x, n.ty - n.y) < 14 && n.wpIdx < wps.length - 1) {
      n.wpIdx++;
      setNpcTarget(n, wps[n.wpIdx]);
      room.npcMoved = true;
    }
  }
}
// TOWN-LIFE: villagers pause to chat when they cross paths — one short warm
// line per pair per 90 s, broadcast so both travelers share the moment.
// Chats happen while villagers are settled into their day (working, lunch,
// strolling, browsing) — never during the morning commute, the evening walk
// home, or the night rest, so the post-sermon exodus never strands anyone.
// Exported for the suite.
const CHAT_SLOTS = new Set(['work', 'lunch', 'afternoon', 'bustle', 'evening']);
export function npcChatTick(room, now) {
  if (sermonActive(room, now)) return;
  if (room.restore.gatherUntil > now) return;
  const slotOf = (n) => (n.slotKey || '').split('|')[0];
  for (let i = 0; i < room.npcs.length; i++) {
    for (let j = i + 1; j < room.npcs.length; j++) {
      const A = room.npcs[i], B = room.npcs[j];
      if (!CHAT_SLOTS.has(slotOf(A)) || !CHAT_SLOTS.has(slotOf(B))) continue;
      if (now < A.chatUntil || now < B.chatUntil) continue;
      const cdKey = A.name + '|' + B.name;
      if ((room.npcChatCd[cdKey] || 0) > now - 90000) continue;
      if (Math.hypot(A.x - B.x, A.y - B.y) > 56) continue;
      room.npcChatCd[cdKey] = now;
      A.chatUntil = B.chatUntil = now + 5000;
      // pause, face each other: movement AND waypoint advance are gated on
      // chatUntil, so the true schedule target is kept — after the chat the
      // villager simply resumes walking (never stranded mid-route).
      const line = NPC_CHAT_LINES[(room.day.n + i * 2 + j) % NPC_CHAT_LINES.length];
      broadcast(room, { t: 'npc-chat', a: A.name, b: B.name, line });
    }
  }
}

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
    ruin: newRuin(),   // RESTORE THE LIGHT M4: { open, a, b, gate, hold timers }
    ending: { done: false },
    fox: { x: 15*TILE, y: 18*TILE, tx: 15*TILE, ty: 18*TILE, nextMove: now+2000 },
    npcs: NPC_DEFS.map(d => newNpc(d, now)),
    npcChatCd: {},   // TOWN-LIFE: "a|b" -> last ambient chat timestamp
    npcMoved: true,
    day: { n: 1, start: now },
    rhythm: { farm: false, fish: false, cook: false, greet: false, sermon: false },
    lastWorship: 0,
    sermonOn: false,    // weekly sermon currently gathering (derived each tick)
    sermonPeace: {},    // uuid -> 'sermon-<day n>' already acknowledged this sermon
    garden: { bloomed: false },
    restore: newRestore(),   // RESTORE THE LIGHT: hidden town-restoration state (per room)
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
const PHASE_LABEL = { morning: 'Morning', day: 'Day', sunset: 'Sunset', night: 'Night' }

// CHURCH-REDESIGN (2026-10-03): the weekly sermon. Every 7th day (day 1 is a
// sermon day so travelers meet it quickly), from morning until afternoon, the
// pastor preaches and the villagers gather in the pews. Derived purely from
// the already-synced day counter + phase — both players share the event with
// no new sync architecture; the flag also ships additively in dayPublic.
export function sermonActive(room, now = Date.now()) {
  if (room.day.n % 7 !== 1) return false;
  const phase = dayPhase(room, now);
  return phase === 'morning' || phase === 'day';
};

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
  // didn't resend them. Position is restored too — validated against the
  // collision map so a stale record can never strand anyone inside a wall
  // (falls back to spawn in that case).
  const nameS = String(name || '').slice(0, MAX_NAME_LEN);
  let px = SPAWN.tx*TILE + TILE/2, py = SPAWN.ty*TILE + TILE/2, pplace = null;
  if (rec && Number.isFinite(rec.x) && Number.isFinite(rec.y)) {
    const rtx = Math.floor(rec.x / TILE), rty = Math.floor(rec.y / TILE);
    const rplc = (rec.place === 'church' || rec.place === 'home') ? rec.place : null;
    if (rtx >= 0 && rty >= 0 && rtx < WORLD_W && rty < WORLD_H && !isSolid(rtx, rty, rplc)) {
      px = rec.x; py = rec.y; pplace = rplc;
    }
  }
  const p = {
    id: 'p' + Math.random().toString(36).slice(2, 9),
    uuid: uid,
    name: nameS || (rec && rec.name) || 'Traveler',
    look: validLook(look) ? { ...sanitizeLook(look) } : (rec && validLook(rec.look) ? { ...rec.look } : defaultLook()),
    x: px, y: py,
    dir: 'right', moving: false,              // new travelers face the village (east)
    ix: 0, iy: 0,                       // current input vector
    emote: null, emoteAt: 0,
    inside: pplace !== null,             // inside any interior
    place: pplace,                       // 'church' | 'home' | null
    fishing: null,                       // {state:'cast', biteAt, windowUntil} | null
    qcAt: 0,                           // last quick-chat time (2 s anti-spam cooldown)
    inv: rec ? { ...rec.inv } : { produce: 0, fish: 0, meals: 0 },
  };
  room.identities.set(uid, { name: p.name, look: { ...p.look }, inv: { ...p.inv }, x: p.x, y: p.y, place: p.place });
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
  return { name: n.name, x: Math.round(n.x), y: Math.round(n.y), act: n.act || 'idle' };
}

function dayPublic(room) {
  const phase = dayPhase(room);
  return { n: room.day.n, phase, label: PHASE_LABEL[phase], rhythm: { ...room.rhythm },
           sermon: sermonActive(room), shops: shopHours(room), marketDay: marketDayActive(room) };
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
  if (!room.garden.bloomed && r.farm && r.fish && r.cook && r.greet && r.sermon) {
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
    // CHURCH-REDESIGN (2026-10-03): no candle stand. Nearest-candidate
    // priority (ties keep the old order: exit, pray, verse, then pew seats).
    // Pew seats use a tight SIT_RANGE: you sit by standing in the pew gap,
    // so praying at the altar never misfires from the aisle.
    const SIT_RANGE = 20;
    const cands = [
      { kind: 'exit',  tx: CHURCH_EXIT.tx, ty: CHURCH_EXIT.ty },
      { kind: 'pray',  tx: PRAY_SPOT.tx, ty: PRAY_SPOT.ty },
      { kind: 'verse', tx: VERSE_STAND.tx, ty: VERSE_STAND.ty },
      ...PEW_SIT_SPOTS.map(s => ({ kind: 'sit', tx: s.tx, ty: s.ty, range: SIT_RANGE })),
    ];
    let best = null, bd = INTERACT_RANGE;
    for (const c of cands) {
      const range = c.range || INTERACT_RANGE;
      const d = dist(p.x, p.y, c.tx*TILE+TILE/2, c.ty*TILE+TILE/2);
      if (d <= range && d < bd) { bd = d; best = c; }
    }
    if (!best) return {ok:false, reason:'nothing-nearby'};
    if (best.kind === 'exit') { exitInterior(room, ws, p, CHURCH_DOOR.tx, CHURCH_DOOR.ty); return {ok:true, action:'exit-church'}; }
    if (best.kind === 'pray') {
      p.emote='pray'; p.emoteAt=now; broadcast(room, {t:'player', p: playerPublic(p)});
      // Worship moment: sincere prayer at the altar is a shared gentle beat.
      // (CHURCH-REDESIGN: no longer gated on lit candles — the stand is gone.)
      if (now - room.lastWorship > WORSHIP_COOLDOWN_MS) {
        room.lastWorship = now;
        setRhythm(room, 'sermon');   // worship completes the day's rhythm
        contribute(room, 'sermon');  // worship attendance feeds the light too
        broadcast(room, {t:'worship', by: p.name});
      }
      return {ok:true, action:'pray'};
    }
    if (best.kind === 'verse') { const v = VERSES[Math.floor(Math.random()*VERSES.length)]; broadcast(room, {t:'verse', ref: v.ref, text: v.text, by: p.name}); return {ok:true, action:'read'}; }
    // pew seat: sit a while; during the weekly sermon, attending is a shared
    // peaceful beat (once per sermon per traveler).
    p.emote='sit'; p.emoteAt=now; broadcast(room, {t:'player', p: playerPublic(p)});
    if (sermonActive(room, now)) {
      setRhythm(room, 'sermon');
      const skey = 'sermon-' + room.day.n;
      if (room.sermonPeace[p.uuid] !== skey) {
        room.sermonPeace[p.uuid] = skey;
        contribute(room, 'sermon');
        broadcast(room, { t: 'sermon-peace', by: p.name });
      }
    }
    return {ok:true, action:'sit'};
  }
  if (p.inside && p.place === 'home') {
    if (near(p, HOME_EXIT.tx, HOME_EXIT.ty)) { exitInterior(room, ws, p, HOME_DOOR.tx, HOME_DOOR.ty); return {ok:true, action:'exit-home'}; }
    // Ariel (2026-10-04): no sleep — the bed is furniture, not an action.
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
      contribute(room, 'farm');
      broadcast(room, {t:'harvest', by: p.name});
      broadcast(room, {t:'player', p: playerPublic(p)});
    }
    else return {ok:false, reason:'growing'};
    broadcast(room, {t:'farm', farm: farmPublic(room)});
    return {ok:true, action:'farm-' + plot.stage};
  }
  // fox -> pet
  if (dist(p.x, p.y, room.fox.x, room.fox.y) <= INTERACT_RANGE) {
    p.emote='heart'; p.emoteAt=now; broadcast(room, {t:'player', p: playerPublic(p)});
    contribute(room, 'fox');
    broadcast(room, {t:'pet', by: p.name});
    return {ok:true, action:'pet'};
  }
  // villager -> talk. Checked before the dock: during the weekly sermon the
  // congregation sits in the pews (whose tiles overlap the river bend near
  // the dock), and a nearby villager is the more sensible interact target.
  // (Villagers never wander within dock range in normal play, so fishing is
  // unaffected.)
  const npc = nearestNpc(room, p);
  if (npc) {
    // M3: friendship hearts key by the traveler's uuid, so friendships
    // persist across reconnects within the server run.
    const hearts = Math.min(5, (npc.hearts[p.uuid] || 0) + 1);
    npc.hearts[p.uuid] = hearts;
    let text;
    // TOWN-LIFE: the first talk of each day is a time-of-day greeting,
    // warmer once befriended. The heart mechanic itself is unchanged.
    if (npc.greetDay[p.uuid] !== room.day.n) {
      npc.greetDay[p.uuid] = room.day.n;
      text = townGreeting(dayPhase(room, now), hearts >= 3);
    } else {
      text = npc.lines[npc.line % npc.lines.length];
      npc.line++;
    }
    setRhythm(room, 'greet');
    contribute(room, 'greet');
    broadcast(room, {t:'say', name: npc.name, text, hearts, by: p.name});
    return {ok:true, action:'talk'};
  }
  // dock -> fishing (any of the world docks)
  if (DOCKS.some(d => near(p, d.tx, d.ty))) {
    if (!p.fishing) {
      p.fishing = { state: 'cast', biteAt: now + FISH_WAIT_MIN + Math.random()*(FISH_WAIT_MAX-FISH_WAIT_MIN), windowUntil: 0 };
      broadcast(room, {t:'player', p: playerPublic(p)});
      return {ok:true, action:'cast'};
    }
    if (p.fishing.state === 'bite' && now <= p.fishing.windowUntil) {
      p.fishing = null;
      p.inv.fish++;
      setRhythm(room, 'fish');
      contribute(room, 'fish');
      broadcast(room, {t:'catch', by: p.name});
      broadcast(room, {t:'player', p: playerPublic(p)});
      return {ok:true, action:'catch'};
    }
    return {ok:false, reason:'no-bite'};
  }
  return {ok:false, reason:'nothing-nearby'};
}

function handleCook(room, ws, p, action) {
  if (!nearCookSpot(p)) { send(ws, {t:'cook-fail', reason:'not-near-cook'}); return; }
  if (action === 'cook') {
    if (p.inv.produce < 1 || p.inv.fish < 1) { send(ws, {t:'cook-fail', reason:'need-produce-and-fish'}); return; }
    p.inv.produce--; p.inv.fish--; p.inv.meals++;
    setRhythm(room, 'cook');
    contribute(room, 'cook');
    broadcast(room, {t:'cooked', by: p.name, meal: 'Harvest Stew', meals: p.inv.meals});
    broadcast(room, {t:'player', p: playerPublic(p)});
  } else if (action === 'eat') {
    if (p.inv.meals < 1) { send(ws, {t:'cook-fail', reason:'no-meal'}); return; }
    p.inv.meals--;
    broadcast(room, {t:'ate', by: p.name});
    broadcast(room, {t:'player', p: playerPublic(p)});
  } else if (action === 'give') {
    if (p.inv.meals < 1) { send(ws, {t:'cook-fail', reason:'no-meal'}); return; }
    // nearest other player first — same room space only (STORY-FIX G9: a
    // meal cannot cross walls; inside and place must match the giver's)
    let best = null, bd = 110;
    for (const [, q] of room.players) {
      if (q === p) continue;
      if (q.inside !== p.inside || q.place !== p.place) continue;
      const d = dist(p.x, p.y, q.x, q.y);
      if (d <= bd) { bd = d; best = q; }
    }
    if (best) {
      p.inv.meals--; best.inv.meals++;
      contribute(room, 'give');
      broadcast(room, {t:'gift', from: p.name, to: best.name, meal: 'Harvest Stew'});
      broadcast(room, {t:'player', p: playerPublic(p)});
      broadcast(room, {t:'player', p: playerPublic(best)});
    } else {
      // STORY-FIX G9: villagers are only reachable out in the world — from
      // inside, a meal finds no one.
      const npc = p.inside ? null : nearestNpc(room, p, 110);
      if (!npc) { send(ws, {t:'cook-fail', reason:'nobody-nearby'}); return; }
      p.inv.meals--;
      npc.hearts[p.uuid] = Math.min(5, (npc.hearts[p.uuid] || 0) + 1);
      contribute(room, 'give');
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
      collideMove(room, p, nx, ny);   // server-authoritative: solids block, walls slide
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
  // villagers wander (slow, cozy). RESTORE THE LIGHT: while the village is
  // gathering (the garden waking, the Return), they drift out to the garden
  // and plaza instead of staying by their homes.
  const gathering = room.restore.gatherUntil > now;
  // CHURCH-REDESIGN (2026-10-03): the weekly sermon. When the service begins,
  // the pastor takes the pulpit and the villagers gather in the pews; they
  // stay seated until the service ends, then resume wandering.
  const sermon = sermonActive(room, now);
  if (sermon && !room.sermonOn) {
    room.sermonOn = true;
    const seats = { 'Pastor Nathan': [20,19], 'Hannah': [19,21], 'Elias': [21,21], 'Miriam': [19,23] };
    for (const n of room.npcs) {
      const s = seats[n.name]; if (!s) continue;
      const sx = s[0]*TILE+TILE/2, sy = s[1]*TILE+TILE/2;
      // don't snap onto a traveler already sitting in that pew gap
      let taken = false;
      for (const [, pl] of room.players) {
        if (pl.inside && pl.place === 'church' && Math.hypot(pl.x - sx, pl.y - sy) < TILE) { taken = true; break; }
      }
      if (taken) { n.tx = n.x; n.ty = n.y; }
      else { n.x = sx; n.y = sy; n.tx = sx; n.ty = sy; }
      n.nextMove = now + 5000;
    }
    room.npcMoved = true;
  }
  if (!sermon && room.sermonOn) {
    room.sermonOn = false;
    for (const n of room.npcs) { n.nextMove = now; n.slotKey = ''; }   // schedule re-syncs
  }
  for (const n of room.npcs) {
    if (sermon) { n.nextMove = now + 5000; if (n.act !== 'idle') { n.act = 'idle'; room.npcMoved = true; } }   // seated for the service
    else if (gathering && now >= n.nextMove) {
      n.tx = (20 + (Math.random()-0.5)*5)*TILE;
      n.ty = (16.5 + (Math.random()-0.5)*2)*TILE;
      if (Math.floor(n.tx/TILE) === FOUNTAIN_TILE.tx && Math.floor(n.ty/TILE) === FOUNTAIN_TILE.ty) n.tx += TILE;
      n.nextMove = now + 4000 + Math.random()*4000;
      if (n.act !== 'stroll') { n.act = 'stroll'; room.npcMoved = true; }
    }
    // TOWN-LIFE: when neither the sermon nor the gathering owns the
    // villagers, their deterministic daily schedule does (npcScheduleTick).
  }
  if (!sermon && !gathering) npcScheduleTick(room, now);
  npcChatTick(room, now);   // villagers pause to chat when they cross paths
  for (const n of room.npcs) {
    const dx = n.tx - n.x, dy = n.ty - n.y, l = Math.hypot(dx, dy);
    if (l > 4 && now >= n.chatUntil) { n.x += dx/l*28*dt; n.y += dy/l*28*dt; room.npcMoved = true; }
  }
  // M3: persist identity each tick (in-memory, per room) — inventory, look,
  // name, and last position keyed by uuid, so a returning traveler restores
  // them after a disconnect while the server runs.
  for (const [, p] of room.players) {
    const rec = room.identities.get(p.uuid);
    if (rec) { rec.inv = { ...p.inv }; rec.look = { ...p.look }; rec.name = p.name; rec.x = p.x; rec.y = p.y; rec.place = p.place; }
  }
  if (moved || room.npcMoved) {
    const msg = { t: 'tick', players: [...room.players.values()].map(playerPublic) };
    if (room.npcMoved) { msg.npcs = room.npcs.map(npcPublic); room.npcMoved = false; }
    broadcast(room, msg);
  }
  // day/night heartbeat (1s)
  room.tickCount++;
  // Ariel (2026-10-04): no sleep — days roll over on their own clock. When the
  // day fraction wraps past night, the day counter advances for everyone;
  // rhythm flags and garden bloom persist (rollover never wipes progress).
  const fracNow = dayFrac(room, now);
  if (room.day.fracPrev !== undefined && fracNow < room.day.fracPrev) {
    room.day.n++;
    broadcast(room, { t: 'day', ...dayPublic(room) });
  }
  room.day.fracPrev = fracNow;
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
  // RESTORE THE LIGHT — the ruins puzzle. One traveler stands on the forest
  // stone and the fallen stones at the ruin mouth roll aside; a second
  // crosses and wakes the inner stone; then the two stones, answered
  // together, open the ruin. A stone truly wakes by being HELD a moment —
  // so a lone traveler can still complete the way, stone by stone, and no
  // one is ever locked out of the story.
  {
    const R = room.ruin;
    const aPt = {x: STONE_A.tx*TILE+TILE/2, y: STONE_A.ty*TILE+TILE/2};
    const bPt = {x: STONE_B.tx*TILE+TILE/2, y: STONE_B.ty*TILE+TILE/2};
    let onA = false, onB = false;
    for (const [, p] of room.players) {
      if (p.inside) continue;
      if (dist(p.x, p.y, aPt.x, aPt.y) <= RUIN_STONE_RADIUS) onA = true;
      if (dist(p.x, p.y, bPt.x, bPt.y) <= RUIN_STONE_RADIUS) onB = true;
    }
    const pubKey = () => { const q = ruinPublic(room, onA, onB); return q.open + '|' + q.a + '|' + q.b + '|' + q.gate; };
    if (onA) { R.aSince = R.aSince || now; if (now - R.aSince >= RUIN_HOLD_MS) R.a = true; } else R.aSince = 0;
    if (onB) { R.bSince = R.bSince || now; if (now - R.bSince >= RUIN_HOLD_MS) R.b = true; } else R.bSince = 0;
    if (!R.open && ((onA && onB) || (R.a && R.b && (onA || onB)))) {
      R.open = true; R.a = true; R.b = true; // answered together, both stones wake
      broadcast(room, {t:'ruin-open', message: 'Hope lives here — discovered together.'});
    }
    R.gate = ruinGateOpen(room, onA);
    // Broadcast whenever the public ruin state differs from what clients were
    // last sent. (A same-tick before/after compare misses the gate: gate reads
    // live occupancy, so the tick a stone is stepped on already reads "open"
    // on both sides of the compare — that change would never be sent.)
    const key = pubKey();
    if (key !== R.sentKey) { R.sentKey = key; sendRuin(room, onA, onB); }
  }
  // RESTORE THE LIGHT — quiet tracking: a traveler's first steps into the
  // wild north (forest clearings, the ruins lane) count once, silently.
  for (const [, p] of room.players) {
    if (p.inside) continue;
    if (Math.floor(p.y / TILE) <= 7 && !room.restore.explorers.has(p.uuid)) {
      room.restore.explorers.add(p.uuid);
      contribute(room, 'explore');
    }
  }
  // RESTORE THE LIGHT — the Discovery: once the ruin stands open, the first
  // traveler to step into the ruins clearing witnesses what is written
  // there. Jesus is the Light; the players were restoring a community.
  if (room.ruin.open && !room.restore.discoverySeen) {
    const cx = STONE_B.tx*TILE+TILE/2, cy = STONE_B.ty*TILE+TILE/2;
    for (const [, p] of room.players) {
      if (p.inside) continue;
      if (dist(p.x, p.y, cx, cy) <= 3*TILE) {
        room.restore.discoverySeen = true;
        advanceRestore(room);
        broadcast(room, { t: 'discovery', ref: JOHN_812.ref, text: JOHN_812.text, by: p.name });
        break;
      }
    }
  }
  // RESTORE THE LIGHT — the Return and the Final Moment. Once the discovery
  // has been made, two or more travelers standing together in the garden
  // begin the Return: the town lanterns relight one by one, then the central
  // light, then the whole village gathers. (Same trigger shape as the old
  // instant ending — ruin open, discovery made, 2+ in the garden plaza.)
  // STORY-FIX G1: a lone traveler is not locked out of the climax — one
  // traveler resting alone in the garden for ~20 s begins the same Return.
  if (!room.ending.done) {
    const ps = [...room.players.values()].filter(p => !p.inside);
    const inGarden = (p) => p.x >= 17*TILE && p.x < 23*TILE && p.y >= 13*TILE && p.y < 18*TILE;
    const r = room.restore;
    if (room.ruin.open && r.discoverySeen && r.stage === 'discovered') {
      const gardeners = ps.filter(inGarden);
      if (gardeners.length >= 2) {
        r.soloGardenSince = 0;
        r.stage = 'relight';
        r.relightAt = now;
        r.gatherUntil = now + RESTORE_GATHER_MS;   // the village comes outside
        sendRestore(room);
      } else if (gardeners.length === 1 && room.players.size === 1) {
        // solo finale path: exactly one traveler in the room, standing in
        // the garden. ~20 s of stillness there begins the Return.
        if (!r.soloGardenSince) r.soloGardenSince = now;
        else if (now - r.soloGardenSince >= 20000) {
          r.soloGardenSince = 0;
          r.stage = 'relight';
          r.relightAt = now;
          r.gatherUntil = now + RESTORE_GATHER_MS;   // the village comes outside
          sendRestore(room);
        }
      } else {
        r.soloGardenSince = 0;   // company, or the garden stands empty — no solo wait
      }
    }
    if (r.stage === 'relight') {
      if (r.lit < LANTERN_TOTAL && now - r.relightAt >= RELIGHT_STEP_MS) {
        r.lit++;
        r.relightAt = now;
        sendRestore(room);
      }
      if (r.lit >= LANTERN_TOTAL) {
        r.central = true;
        r.stage = 'complete';
        room.ending.done = true;
        if (!room.garden.bloomed) {
          room.garden.bloomed = true;
          broadcast(room, { t: 'garden-bloom',
            message: 'The Garden of Hope blooms — tended with love, day after day. 🌸' });
        }
        broadcast(room, { t: 'ending',
          title: 'The Garden of Hope',
          message: 'Travelers together. One village. A hope discovered together.' });
        sendRestore(room);
      }
    }
  }
}

function joinedPayload(room, p, code) {
  return { t: 'joined', code, uuid: p.uuid, you: playerPublic(p),
           players: [...room.players.values()].map(playerPublic),
           farm: farmPublic(room), ruin: ruinPublic(room), ending: room.ending.done,
           fox: {x: Math.round(room.fox.x), y: Math.round(room.fox.y)},
           npcs: room.npcs.map(npcPublic),
           day: dayPublic(room),
           garden: { bloomed: room.garden.bloomed },
           restore: restorePublic(room),
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
            // shared world state (farm, ruin, day, rhythm, garden,
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
          // private rooms: reset the shared world for a fresh run.
          // STORY-FIX G4: play-again only starts a fresh run after the ending
          // has been lived — an early tap is ignored, never a mid-game wipe.
          if (!room.ending.done) return;
          const now2 = Date.now();
          room.farm = FARM_PLOTS.map(p => ({ tx: p.tx, ty: p.ty, stage: 'empty', t: 0 }));
          room.ruin = newRuin();
          room.ending.done = false;
          room.day = { n: 1, start: now2 };
          room.rhythm = { farm: false, fish: false, cook: false, greet: false, sermon: false };
          room.lastWorship = 0;
          room.sermonOn = false;
          room.sermonPeace = {};
          room.garden.bloomed = false;
          room.restore = newRestore();   // RESTORE THE LIGHT: the town dims again
          room.home.rug = 0;
          room.npcs = NPC_DEFS.map(d => newNpc(d, now2));
          room.npcChatCd = {};
          room.npcMoved = true;
          for (const [, p] of room.players) {
            p.x = SPAWN.tx*TILE + TILE/2; p.y = SPAWN.ty*TILE + TILE/2;
            p.dir = 'right'; p.moving = false; p.ix = 0; p.iy = 0;
            p.emote = null; p.emoteAt = 0; p.inside = false; p.place = null; p.fishing = null;
            p.inv = { produce: 0, fish: 0, meals: 0 };
          }
          // STORY-FIX G3: the stored identities must reset with the run —
          // a disconnected traveler rejoining within the reap window gets
          // the fresh-run inventory (and spawn), not the pre-reset one.
          for (const [, rec] of room.identities) {
            rec.inv = { produce: 0, fish: 0, meals: 0 };
            delete rec.x; delete rec.y; rec.place = null;
          }
          const r = joinedPayload(room, [...room.players.values()][0] || { id:'', name:'' }, room.code);
          broadcast(room, { t: 'reset',
            players: [...room.players.values()].map(playerPublic),
            farm: farmPublic(room), ruin: ruinPublic(room),
            fox: { x: Math.round(room.fox.x), y: Math.round(room.fox.y) },
            npcs: r.npcs, day: r.day,
            garden: r.garden, restore: r.restore, home: r.home });
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
