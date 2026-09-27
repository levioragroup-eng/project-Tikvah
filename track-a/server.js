// Tikvah — Track A competition build. Authoritative Node.js + WebSocket server.
// Serves the static client from ./public and hosts game rooms with short codes.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
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

// Village layout (tile coords)
export const FARM_PLOTS = [ {tx:6,ty:9}, {tx:8,ty:9}, {tx:6,ty:11}, {tx:8,ty:11} ];
export const DOCK = { tx: 33, ty: 20 };            // fishing spot
export const CHURCH_DOOR = { tx: 20, ty: 5 };      // press E near door -> enter
export const CHURCH_EXIT = { tx: 20, ty: 24 };     // interior exit spot
export const PRAY_SPOT = { tx: 20, ty: 20 };       // interior: pray
export const VERSE_STAND = { tx: 16, ty: 20 };     // interior: read one verse
export const STONE_A = { tx: 4, ty: 22 };
export const STONE_B = { tx: 35, ty: 3 };
export const SPAWN = { tx: 20, ty: 14 };

const CROP_GROW_MS = 45_000;                       // watered -> ready
const FISH_WAIT_MIN = 3_000, FISH_WAIT_MAX = 7_000;
const FISH_CATCH_WINDOW = 2_500;

const VERSES = [
  { ref: 'Jeremiah 29:11', text: 'For I know the thoughts that I think toward you, saith the LORD, thoughts of peace, and not of evil, to give you an expected end.' },
  { ref: 'Psalm 23:1', text: 'The LORD is my shepherd; I shall not want.' },
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

function createRoom() {
  const code = newCode();
  const room = {
    code, id: ++roomSeq, createdAt: Date.now(),
    players: new Map(),   // ws -> player
    sockets: new Set(),
    farm: FARM_PLOTS.map(p => ({ tx: p.tx, ty: p.ty, stage: 'empty', t: 0 })),
    ruin: { open: false },
    fox: { x: 15*TILE, y: 18*TILE, tx: 15*TILE, ty: 18*TILE, nextMove: Date.now()+2000 },
    seq: 0,
  };
  rooms.set(code, room);
  return room;
}

function dist(ax, ay, bx, by) { return Math.hypot(ax-bx, ay-by); }

// ---------- Messaging helpers ----------
function send(ws, msg) { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); }
function broadcast(room, msg, except) {
  const s = JSON.stringify(msg);
  for (const ws of room.sockets) if (ws !== except && ws.readyState === 1) ws.send(s);
}
function err(ws, code, message) { send(ws, { t: 'error', code, message }); }

// ---------- Game logic ----------
function addPlayer(room, ws, name) {
  const p = {
    id: 'p' + Math.random().toString(36).slice(2, 9),
    name: String(name || 'Traveler').slice(0, MAX_NAME_LEN) || 'Traveler',
    x: SPAWN.tx*TILE + TILE/2, y: SPAWN.ty*TILE + TILE/2,
    dir: 'down', moving: false,
    ix: 0, iy: 0,                       // current input vector
    emote: null, emoteAt: 0,
    inside: false,                       // inside church
    fishing: null,                       // {state:'cast', biteAt, windowUntil} | null
  };
  room.players.set(ws, p);
  room.sockets.add(ws);
  return p;
}

function playerPublic(p) {
  return { id: p.id, name: p.name, x: Math.round(p.x), y: Math.round(p.y),
           dir: p.dir, moving: p.moving, emote: p.emote, emoteAt: p.emoteAt,
           inside: p.inside, fishing: p.fishing ? p.fishing.state : null };
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

function near(p, tx, ty, range = INTERACT_RANGE) {
  const c = { x: tx*TILE + TILE/2, y: ty*TILE + TILE/2 };
  return dist(p.x, p.y, c.x, c.y) <= range;
}

function handleInteract(room, ws, p) {
  const now = Date.now();
  if (p.inside) {
    if (near(p, CHURCH_EXIT.tx, CHURCH_EXIT.ty)) { p.inside = false; p.x = CHURCH_DOOR.tx*TILE+TILE/2; p.y = (CHURCH_DOOR.ty+2)*TILE+TILE/2; broadcast(room, {t:'player', p: playerPublic(p)}); return {ok:true, action:'exit-church'}; }
    if (near(p, PRAY_SPOT.tx, PRAY_SPOT.ty)) { p.emote='pray'; p.emoteAt=now; broadcast(room, {t:'player', p: playerPublic(p)}); return {ok:true, action:'pray'}; }
    if (near(p, VERSE_STAND.tx, VERSE_STAND.ty)) { const v = VERSES[Math.floor(Math.random()*VERSES.length)]; send(ws, {t:'verse', ref: v.ref, text: v.text}); return {ok:true, action:'read'}; }
    return {ok:false, reason:'nothing-nearby'};
  }
  // church door -> enter
  if (near(p, CHURCH_DOOR.tx, CHURCH_DOOR.ty)) { p.inside = true; p.x = CHURCH_EXIT.tx*TILE+TILE/2; p.y = CHURCH_EXIT.ty*TILE+TILE/2; broadcast(room, {t:'player', p: playerPublic(p)}); return {ok:true, action:'enter-church'}; }
  // farm
  const plot = nearestPlot(room, p);
  if (plot) {
    if (plot.stage === 'empty') { plot.stage = 'planted'; }
    else if (plot.stage === 'planted') { plot.stage = 'growing'; plot.t = now; }
    else if (plot.stage === 'ready') { plot.stage = 'empty'; broadcast(room, {t:'harvest', by: p.name}); }
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
      p.fishing = null; broadcast(room, {t:'catch', by: p.name}); broadcast(room, {t:'player', p: playerPublic(p)});
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
  return {ok:false, reason:'nothing-nearby'};
}

function tickRoom(room) {
  const now = Date.now();
  const dt = 1/20;
  let moved = false;
  for (const [, p] of room.players) {
    if (p.ix !== 0 || p.iy !== 0) {
      const len = Math.hypot(p.ix, p.iy) || 1;
      const nx = p.x + (p.ix/len)*MAX_SPEED*dt;
      const ny = p.y + (p.iy/len)*MAX_SPEED*dt;
      p.x = Math.max(TILE/2, Math.min(WORLD_W*TILE - TILE/2, nx));
      p.y = Math.max(TILE/2, Math.min(WORLD_H*TILE - TILE/2, ny));
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
  if (moved) {
    const players = [...room.players.values()].map(playerPublic);
    broadcast(room, { t: 'tick', players });
  }
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
}

// ---------- HTTP (static client) ----------
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png' };
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
          const p = addPlayer(room, ws, name);
          ws.room = room;
          send(ws, { t: 'joined', code: room.code, you: playerPublic(p),
                     players: [...room.players.values()].map(playerPublic),
                     farm: farmPublic(room), ruin: room.ruin, fox: {x: Math.round(room.fox.x), y: Math.round(room.fox.y)} });
          broadcast(room, {t:'join', p: playerPublic(p)}, ws);
          break;
        }
        case 'join': {
          const code = String(m.code || '').toUpperCase().trim();
          const name = String(m.name || '').slice(0, MAX_NAME_LEN);
          if (!/^[A-Z]{4}$/.test(code) || !rooms.has(code)) { err(ws, 'bad-code', 'Room not found. Check the code and try again.'); return; }
          if (!name.trim()) { err(ws, 'bad-name', 'Name required'); return; }
          if (ws.room) { err(ws, 'in-room', 'Already in a room'); return; }
          const room = rooms.get(code);
          if (room.players.size >= 8) { err(ws, 'room-full', 'Room is full'); return; }
          const p = addPlayer(room, ws, name);
          ws.room = room;
          send(ws, { t: 'joined', code, you: playerPublic(p),
                     players: [...room.players.values()].map(playerPublic),
                     farm: farmPublic(room), ruin: room.ruin, fox: {x: Math.round(room.fox.x), y: Math.round(room.fox.y)} });
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
        default: err(ws, 'unknown', 'Unknown message type');
      }
    } catch (e) { err(ws, 'server-error', 'Something went wrong'); }
  });

  ws.on('close', () => {
    const room = ws.room;
    if (!room) return;
    const p = room.players.get(ws);
    room.players.delete(ws); room.sockets.delete(ws);
    if (p) broadcast(room, {t:'leave', id: p.id});
    if (room.players.size === 0) {
      // keep empty rooms briefly so a dropped player can rejoin, then reap
      setTimeout(() => { if (room.players.size === 0) rooms.delete(room.code); }, 60_000).unref();
    }
  });
});

setInterval(() => {
  wss.clients.forEach(ws => { if (!ws.isAlive) { ws.terminate(); return; } ws.isAlive = false; ws.ping(); });
}, 30_000).unref();

setInterval(() => { for (const [, room] of rooms) if (room.players.size > 0) tickRoom(room); }, 50); // 20 Hz

server.listen(PORT, () => console.log(`Tikvah Track-A server on http://localhost:${PORT}`));

// test hooks
export function _getRooms() { return rooms; }
export { createRoom as _createRoom };
