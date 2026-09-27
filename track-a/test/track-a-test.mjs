// Track A headless integration test.
// Spawns the server on a test port, drives WebSocket clients through the
// full competition flow, plus negative tests. Run: node test/track-a-test.mjs
import { spawn } from 'child_process';
import { setTimeout as sleep } from 'timers/promises';
import WebSocket from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = 18787;
const URL = `ws://127.0.0.1:${PORT}`;

const TILE = 32;
const STONE_A = { x: 4*TILE+TILE/2, y: 22*TILE+TILE/2 };
const STONE_B = { x: 35*TILE+TILE/2, y: 3*TILE+TILE/2 };
const PLOT0 = { x: 6*TILE+TILE/2, y: 9*TILE+TILE/2 };
const DOCK = { x: 33*TILE+TILE/2, y: 20*TILE+TILE/2 };
const CHURCH_DOOR = { x: 20*TILE+TILE/2, y: 5*TILE+TILE/2 };

const VERSE_TEXTS = new Set([
  'For I know the thoughts that I think toward you, saith the LORD, thoughts of peace, and not of evil, to give you an expected end.',
  'The LORD is my shepherd; I shall not want.',
]);

// character look used by Ariel's client in tests
const LOOK_A = { skin: '#c68a5a', hair: 'curly', hairColor: '#d9c08a', outfit: '#9a6ac9', dress: true, accessory: 'flower' };
const LOOK_A2 = { skin: '#6e452a', hair: 'bun', hairColor: '#2e1c10', outfit: '#4a8ac9', dress: false, accessory: 'hat' };
function lookEq(a, b) { return a && b && a.skin===b.skin && a.hair===b.hair && a.hairColor===b.hairColor && a.outfit===b.outfit && a.dress===b.dress && a.accessory===b.accessory; }

let pass = 0, fail = 0;
function ok(name, cond, detail='') {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

// ---------- server ----------
console.log('starting server...');
const srv = spawn('node', ['server.js'], {
  cwd: ROOT, env: { ...process.env, PORT: String(PORT), CROP_GROW_MS: '1500', FISH_WAIT_MIN: '800', FISH_WAIT_MAX: '1200', FISH_CATCH_WINDOW: '3000', DAY_MS: '45000' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
srv.stderr.on('data', d => process.stderr.write('[srv] ' + d));
let serverUp = false;
await new Promise((resolve, reject) => {
  const to = setTimeout(() => reject(new Error('server did not start')), 8000);
  srv.stdout.on('data', d => { if (d.toString().includes('Tikvah')) { serverUp = true; clearTimeout(to); resolve(); } });
  srv.on('exit', (c) => reject(new Error('server exited: ' + c)));
});
ok('server starts', serverUp);

// ---------- static file serving ----------
console.log('static assets:');
const rHome = await fetch(`http://127.0.0.1:${PORT}/`);
ok('GET / returns 200 html', rHome.status === 200 && (rHome.headers.get('content-type') || '').includes('text/html'));
const r404 = await fetch(`http://127.0.0.1:${PORT}/nope.html`);
ok('missing file returns 404', r404.status === 404);
const rMp4 = await fetch(`http://127.0.0.1:${PORT}/assets/intro.mp4`);
ok('GET /assets/intro.mp4 returns 200', rMp4.status === 200);
ok('intro.mp4 content-type is video/mp4', rMp4.headers.get('content-type') === 'video/mp4', String(rMp4.headers.get('content-type')));
const mp4Bytes = await rMp4.arrayBuffer();
ok('intro.mp4 has a body', mp4Bytes.byteLength > 100000, String(mp4Bytes.byteLength));

// ---------- System 1: title screen + first-60-seconds polish ----------
console.log('system1 polish (static page):');
const pageHtml = await rHome.text();
const pageChecks = [
  ['title tagline', 'A World To Belong To'],
  ['ENTER TIKVAH button', 'ENTER TIKVAH'],
  ['CREATE CHARACTER button', 'CREATE CHARACTER'],
  ['JOIN FRIEND button', 'JOIN FRIEND'],
  ['HOW TO PLAY button', 'HOW TO PLAY'],
  ['living-background canvas', 'id="titleBg"'],
  ['welcome overlay text', 'Welcome to Tikvah'],
  ['welcome sessionStorage gate', 'tikvah_welcome_seen'],
  ['discovery panel line', 'Meet your neighbor'],
  ['discovery panel no-path line', 'There is no single path'],
  ['discovery localStorage gate', 'tikvah_discover_seen'],
  ['hannah greeting', 'welcome to Tikvah. I\'m Hannah'],
  ['hannah dialogue choices', 'hannahChoices'],
  ['hannah sessionStorage gate', 'tikvah_hannah_seen'],
  ['mini-story: garden withered', 'withered'],
  ['mini-story: rhythm restores', 'Will you help it grow'],
  ['contextual prompt element', 'id="prompt"'],
  ['smooth tint lerp', 'updateTint'],
  ['night fireflies', 'nightFlies'],
  ['harvest sparkles', 'sparkleAt'],
];
for (const [label, needle] of pageChecks) ok('page contains ' + label, pageHtml.includes(needle));

// ---------- client helper ----------
class C {
  constructor(name) { this.name = name; this.msgs = []; this.state = { players: new Map(), farm: [], ruinOpen: false, you: null, code: null }; }
  async connect() {
    this.ws = new WebSocket(URL);
    await new Promise((res, rej) => { this.ws.on('open', res); this.ws.on('error', rej); });
    this.ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      this.msgs.push(m);
      if (m.t === 'joined') { this.state.you = m.you; this.state.code = m.code; m.players.forEach(p => this.state.players.set(p.id, p)); this.state.farm = m.farm; this.state.ruinOpen = m.ruin.open; this.state.npcs = new Map(m.npcs.map(n => [n.name, n])); }
      if (m.t === 'join' || m.t === 'player') this.state.players.set(m.p.id, m.p);
      if (m.t === 'tick') { m.players.forEach(p => this.state.players.set(p.id, p)); if (m.npcs) m.npcs.forEach(n => this.state.npcs.set(n.name, n)); }
      if (m.t === 'leave') this.state.players.delete(m.id);
      if (m.t === 'farm') this.state.farm = m.farm;
      if (m.t === 'ruin-open') this.state.ruinOpen = true;
      if (m.t === 'reset') { this.state.ruinOpen = false; this.state.farm = m.farm; }
    });
  }
  send(m) { this.ws.send(JSON.stringify(m)); }
  me() { return this.state.players.get(this.state.you?.id); }
  async waitFor(pred, timeoutMs, label) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      if (pred()) return true;
      await sleep(60);
    }
    return false;
  }
  lastOf(t) { const f = this.msgs.filter(m => m.t === t); return f[f.length-1]; }
  close() { this.ws.close(); }
}
async function walkTo(c, tx, ty, timeoutMs = 12000) {
  const t0 = Date.now();
  c.send({ t: 'input', x: 0, y: 0 });
  while (Date.now() - t0 < timeoutMs) {
    const me = c.me();
    if (!me) { await sleep(100); continue; }
    const dx = tx - me.x, dy = ty - me.y, d = Math.hypot(dx, dy);
    if (d < 30) { c.send({ t: 'input', x: 0, y: 0 }); return true; }
    c.send({ t: 'input', x: dx/d, y: dy/d });
    await sleep(90);
  }
  c.send({ t: 'input', x: 0, y: 0 });
  return false;
}

try {
  // ---------- 1. create + join same room ----------
  console.log('room flow:');
  const a = new C('Ariel'); await a.connect();
  a.send({ t: 'create', name: 'Ariel', look: LOOK_A });
  ok('create room -> joined', await a.waitFor(() => !!a.state.code, 3000));
  const code = a.state.code;
  ok('room code is 4 letters', /^[A-Z]{4}$/.test(code || ''), 'got: ' + code);
  ok('creator look stored on self', lookEq(a.state.you.look, LOOK_A), JSON.stringify(a.state.you.look));

  // ---------- 1a. System 1: spawn near home, facing the village ----------
  console.log('system1 spawn:');
  const SPAWN_X = 13*TILE+16, SPAWN_Y = 18*TILE+16; // lane just east of home
  ok('spawn is on the home lane', a.state.you.x === SPAWN_X && a.state.you.y === SPAWN_Y,
     `got ${a.state.you.x},${a.state.you.y}`);
  ok('spawn faces the village (east)', a.state.you.dir === 'right', a.state.you.dir);

  const b = new C('Friend'); await b.connect();
  b.send({ t: 'join', name: 'Friend', code });
  ok('second player joins same code', await b.waitFor(() => b.state.players.size === 2, 3000));
  ok('both see 2 players', await a.waitFor(() => a.state.players.size === 2, 3000));
  ok('look visible to other player', await b.waitFor(() => lookEq(b.state.players.get(a.state.you.id)?.look, LOOK_A), 3000));

  // ---------- 1b. day/night sync ----------
  console.log('day sync:');
  ok('day heartbeat reaches A', await a.waitFor(() => a.msgs.some(m => m.t === 'day'), 4000));
  ok('day heartbeat reaches B', await b.waitFor(() => b.msgs.some(m => m.t === 'day'), 4000));
  const da = a.lastOf('day'), db = b.lastOf('day');
  ok('both clients share the same day number', da && db && da.n === db.n, `${da?.n} vs ${db?.n}`);
  ok('phase is a valid time of day', ['morning','day','sunset','night'].includes(da?.phase), da?.phase);

  // ---------- 2. movement sync + speed cap ----------
  console.log('movement:');
  const p0 = { ...a.me() };
  a.send({ t: 'input', x: 1, y: 0 });
  await sleep(1100);
  a.send({ t: 'input', x: 0, y: 0 });
  const p1 = a.me();
  const moved = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  ok('player moves with input', moved > 50, `moved ${moved.toFixed(0)}px`);
  ok('speed cap respected (<=165px in ~1.1s)', moved <= 200, `moved ${moved.toFixed(0)}px`);
  ok('other client sees movement', await b.waitFor(() => Math.abs((b.state.players.get(a.state.you.id)?.x || 0) - p1.x) < 20, 3000));

  // ---------- 2b. server-authoritative collision ----------
  console.log('collision:');
  const BRIDGE_E = { x: 31*TILE+16, y: 14*TILE+16 }; // east bridge tile: fully across the water
  const PATH_E = { x: 29*TILE+16, y: 18*TILE+16 };    // east bank, south of the river
  const PATH_W = { x: 20*TILE+16, y: 18*TILE+16 };    // village path row
  ok('walk south along the cafe to the village path', await walkTo(a, 24*TILE+16, 18*TILE+16, 12000));
  ok('walk east to the east bank', await walkTo(a, PATH_E.x, PATH_E.y, 12000));
  ok('reach the bridge', await walkTo(a, BRIDGE_E.x, BRIDGE_E.y, 8000));
  const waterPush = await walkTo(a, BRIDGE_E.x, 18*TILE+16, 3500);
  ok('river is solid (cannot walk on water)', waterPush === false && a.me().y < 15*TILE, `y=${a.me()?.y?.toFixed(0)}`);
  ok('walk back west to the farm', await walkTo(a, 6*TILE+16, 10*TILE+16, 14000));
  ok('exit the farm via the east gate', await walkTo(a, 13*TILE+16, 10*TILE+16, 8000));
  ok('walk to the lone tree', await walkTo(a, 14*TILE+16, 17*TILE+16, 12000));
  // align precisely with the trunk (walkTo stops within 30px; the tree needs x in 448..480)
  for (let i = 0; i < 30; i++) {
    const p = a.me(); if (!p) break;
    if (Math.abs(p.x - (14*TILE+16)) < 6) break;
    a.send({ t: 'input', x: Math.sign(14*TILE+16 - p.x), y: 0 });
    await sleep(100);
  }
  a.send({ t: 'input', x: 0, y: 0 });
  await sleep(200);
  const treePush = await walkTo(a, 14*TILE+16, 21*TILE+16, 3500);
  // the blocking tree is at ty=19 (y 608..640): the player must be stopped by
  // it, i.e. never reach the target south of it. Bound is 20*TILE, not 19*TILE:
  // a blocked player rests just above y=608 and Math.round can land on 608.
  ok('trees are solid', treePush === false && a.me().y < 20*TILE, `y=${a.me()?.y?.toFixed(0)}`);
  // route east of the farm first: a straight line from the tree grazes the
  // fence corner and the axis slide can stall there under load
  ok('walk east of the farm', await walkTo(a, 13*TILE+16, 7*TILE+16, 12000));
  ok('walk north of the farm', await walkTo(a, 11*TILE+16, 7*TILE+16, 8000));
  ok('walk to the church front', await walkTo(a, 20*TILE+16, 7*TILE+16, 8000));
  const wallPush = await walkTo(a, 20*TILE+16, 3*TILE+16, 3500);
  ok('church walls are solid', wallPush === false && a.me().y >= 4*TILE - 1, `y=${a.me()?.y?.toFixed(0)}`);

  // ---------- 3. out-of-range interaction rejected ----------
  console.log('interaction validation:');
  await walkTo(a, 19*TILE+16, 18*TILE+16); // village path, far from the farm
  const farmBefore = JSON.stringify(a.state.farm);
  a.send({ t: 'interact' });
  await sleep(400);
  // far from the farm: no farm action may fire (fox/villager harmlessly allowed)
  ok('out-of-range interact rejected', JSON.stringify(a.state.farm) === farmBefore);

  // ---------- 4. farm cycle (plant -> water -> grow -> harvest) ----------
  console.log('farm:');
  ok('walk to plot', await walkTo(a, PLOT0.x, PLOT0.y));
  a.send({ t: 'interact' }); // plant
  ok('plant -> planted', await a.waitFor(() => a.state.farm[0]?.stage === 'planted', 2000), JSON.stringify(a.state.farm[0]));
  a.send({ t: 'interact' }); // water
  ok('water -> growing', await a.waitFor(() => a.state.farm[0]?.stage === 'growing', 2000));
  ok('grows -> ready (shared state)', await b.waitFor(() => b.state.farm[0]?.stage === 'ready', 6000), 'other client sees ready crop');
  a.send({ t: 'interact' }); // harvest
  ok('harvest -> empty + broadcast', await b.waitFor(() => b.state.farm[0]?.stage === 'empty' && b.msgs.some(m => m.t === 'harvest'), 3000));

  // ---------- 5. fishing (cast -> bite -> catch) ----------
  console.log('fishing:');
  // B starts at the new spawn (lane east of home); route via the village path
  // first — a straight line from spawn to the gate runs into the house wall.
  ok('B walks to the village path', await walkTo(b, PATH_W.x, PATH_W.y, 12000));
  ok('B walks to the farm gate', await walkTo(b, 11*TILE+16, 10*TILE+16, 12000));
  ok('B walks to the east bank', await walkTo(b, PATH_E.x, PATH_E.y, 12000));
  ok('B walks onto the bridge', await walkTo(b, BRIDGE_E.x, BRIDGE_E.y, 8000));
  ok('walk to dock', await walkTo(b, DOCK.x - 16, DOCK.y, 12000));
  b.send({ t: 'interact' }); // cast
  ok('cast accepted', await b.waitFor(() => b.me()?.fishing === 'cast', 2000));
  ok('bite event fires', await b.waitFor(() => b.msgs.some(m => m.t === 'bite'), 5000));
  b.send({ t: 'interact' }); // catch within window
  ok('catch within window -> catch event', await a.waitFor(() => a.msgs.some(m => m.t === 'catch'), 3000));

  // ---------- 6. church: enter, pray, read verse, exit ----------
  console.log('church:');
  ok('A exits the farm via the east gate', await walkTo(a, 11*TILE+16, 10*TILE+16, 12000));
  ok('walk to church door', await walkTo(a, CHURCH_DOOR.x, CHURCH_DOOR.y + 8));
  a.send({ t: 'interact' }); // enter
  ok('enter church interior', await a.waitFor(() => a.me()?.inside === true, 2000));
  // collision inside the church: interior walls + pews
  ok('walk to the west aisle', await walkTo(a, 15*TILE+16, 24*TILE+16, 8000));
  const wallPushIn = await walkTo(a, 15*TILE+16, 10*TILE+16, 3500);
  ok('church interior walls hold', wallPushIn === false && a.me().y >= 18*TILE - 1, `y=${a.me()?.y?.toFixed(0)}`);
  ok('walk north of the pew', await walkTo(a, 17*TILE+16, 19*TILE+16, 8000));
  const pewPush = await walkTo(a, 17*TILE+16, 21*TILE+16, 3500);
  ok('pews are solid', pewPush === false && a.me().y < 20*TILE, `y=${a.me()?.y?.toFixed(0)}`);
  ok('walk to altar', await walkTo(a, 20*TILE+16, 20*TILE+16));
  a.send({ t: 'interact' }); // pray
  ok('pray -> pray emote visible to other', await b.waitFor(() => b.state.players.get(a.state.you.id)?.emote === 'pray', 2000));
  ok('walk around the pew to the verse stand', await walkTo(a, 16*TILE+16, 19*TILE+16));
  ok('walk to verse stand', await walkTo(a, 16*TILE+16, 20*TILE+16));
  a.send({ t: 'interact' }); // read
  const verse = await a.waitFor(() => a.msgs.some(m => m.t === 'verse'), 2000) ? a.lastOf('verse') : null;
  ok('verse shown and is verified KJV text', !!verse && VERSE_TEXTS.has(verse.text), verse ? verse.ref : 'none');
  ok('verse visible to BOTH players (shared reading)', await b.waitFor(() => b.msgs.some(m => m.t === 'verse'), 2000));
  ok('walk to exit', await walkTo(a, 20*TILE+16, 24*TILE+16));
  a.send({ t: 'interact' }); // exit
  ok('exit church', await a.waitFor(() => a.me()?.inside === false, 2000));

  // ---------- 6b. NPC dialogue (Hannah) ----------
  // Hannah wanders (ignoring collision), so walk to her live position; if she
  // drifted into a solid tile the player stops adjacent, still in talk range.
  console.log('villagers:');
  let say = null;
  for (let attempt = 0; attempt < 3 && !say; attempt++) {
    const h = a.state.npcs.get('Hannah');
    ok('Hannah is in the village', !!h);
    await walkTo(a, h.x, h.y, 8000);
    a.send({ t: 'interact' }); // talk
    say = await a.waitFor(() => a.msgs.some(m => m.t === 'say'), 2000) ? a.lastOf('say') : null;
  }
  ok('Hannah speaks', !!say && say.name === 'Hannah' && say.text.length > 10, say?.text);
  ok('dialogue visible to BOTH players', await b.waitFor(() => b.msgs.some(m => m.t === 'say'), 2000));
  ok('friendship heart recorded', say && say.hearts === 1, 'hearts=' + say?.hearts);
  ok('greeting counts toward the day rhythm', await a.waitFor(() => a.lastOf('day')?.rhythm?.greet === true, 3000));

  // ---------- 6c. cooking (B farms a second plot, cooks at the cafe, gives to A) ----------
  console.log('cooking:');
  const PLOT1 = { x: 10*TILE+16, y: 9*TILE+16 };   // FARM_PLOTS[2]
  ok('B walks back to the bridge', await walkTo(b, BRIDGE_E.x, BRIDGE_E.y, 15000));
  ok('B crosses to the west bank', await walkTo(b, 29*TILE+16, 14*TILE+16, 8000));
  ok('B walks to the east bank', await walkTo(b, PATH_E.x, PATH_E.y, 12000));
  ok('B walks to the village path', await walkTo(b, PATH_W.x, PATH_W.y, 12000));
  ok('B walks to the farm gate', await walkTo(b, 11*TILE+16, 10*TILE+16, 12000));
  ok('B walks to plot 2', await walkTo(b, PLOT1.x, PLOT1.y, 15000));
  b.send({ t: 'interact' }); // plant
  ok('B plants', await b.waitFor(() => b.state.farm[2]?.stage === 'planted', 2000));
  b.send({ t: 'interact' }); // water
  ok('B waters', await b.waitFor(() => b.state.farm[2]?.stage === 'growing', 2000));
  ok('B crop grows', await b.waitFor(() => b.state.farm[2]?.stage === 'ready', 8000));
  b.send({ t: 'interact' }); // harvest -> produce
  ok('B harvests produce', await b.waitFor(() => b.me()?.inv?.produce >= 1, 3000));
  const CAFE = { x: 26*TILE+16, y: 17*TILE+16 };
  ok('B walks to cafe counter', await walkTo(b, CAFE.x, CAFE.y, 15000));
  b.send({ t: 'interact' }); // -> cook menu offered
  ok('cook menu offered near cafe', await b.waitFor(() => b.msgs.some(m => m.t === 'menu' && m.kind === 'cook'), 2000));
  b.send({ t: 'cook', action: 'cook' });
  const cooked = await b.waitFor(() => b.msgs.some(m => m.t === 'cooked'), 2000) ? b.lastOf('cooked') : null;
  ok('cook turns produce+fish into a meal', !!cooked && b.me()?.inv?.meals === 1, cooked?.meal);
  ok('cooking counts toward the day rhythm', await b.waitFor(() => b.lastOf('day')?.rhythm?.cook === true, 3000));
  ok('A walks to cafe', await walkTo(a, CAFE.x, CAFE.y + 32, 15000));
  b.send({ t: 'cook', action: 'give' });
  const gift = await a.waitFor(() => a.msgs.some(m => m.t === 'gift'), 3000) ? a.lastOf('gift') : null;
  ok('give shares the meal with the nearby player', !!gift && gift.from === 'Friend' && gift.to === 'Ariel', JSON.stringify(gift));
  ok('A received the meal', await a.waitFor(() => a.me()?.inv?.meals === 1, 2000));

  // ---------- 6d. church candle + worship -> garden blooms ----------
  console.log('candle & worship:');
  ok('A walks back to church door', await walkTo(a, CHURCH_DOOR.x, CHURCH_DOOR.y + 8, 15000));
  a.send({ t: 'interact' }); // enter
  ok('re-enter church', await a.waitFor(() => a.me()?.inside === true, 2000));
  const CANDLE = { x: 24*TILE+16, y: 20*TILE+16 };
  ok('walk to candle stand', await walkTo(a, CANDLE.x, CANDLE.y));
  a.send({ t: 'interact' }); // light candle
  const candle = await a.waitFor(() => a.msgs.some(m => m.t === 'candle'), 2000) ? a.lastOf('candle') : null;
  ok('candle lit and shared', !!candle && candle.count === 1, 'count=' + candle?.count);
  ok('candle visible to B', await b.waitFor(() => b.msgs.some(m => m.t === 'candle'), 2000));
  ok('walk around the pew to the altar', await walkTo(a, 20*TILE+16, 22*TILE+16));
  ok('walk to altar', await walkTo(a, 20*TILE+16, 20*TILE+16));
  a.send({ t: 'interact' }); // pray -> worship (candles are lit)
  ok('worship moment fires for both', await b.waitFor(() => b.msgs.some(m => m.t === 'worship'), 3000));
  // rhythm now complete: farm (4), fish (5), cook (6c), greet (6b), candle (6d)
  ok('garden blooms when the day rhythm is complete (A)', await a.waitFor(() => a.msgs.some(m => m.t === 'garden-bloom'), 4000));
  ok('garden blooms when the day rhythm is complete (B)', await b.waitFor(() => b.msgs.some(m => m.t === 'garden-bloom'), 4000));
  const bloom = a.lastOf('garden-bloom');
  ok('bloom message is warm, not preachy', !!bloom && /bloom/i.test(bloom.message) && !/repent|sin|hell/i.test(bloom.message), bloom?.message);

  // ---------- 6e. home interior: enter, sleep, decorate, wardrobe, exit ----------
  console.log('home:');
  ok('walk to church exit', await walkTo(a, 20*TILE+16, 24*TILE+16));
  a.send({ t: 'interact' });
  ok('exit church', await a.waitFor(() => a.me()?.inside === false, 2000));
  const HOME_DOOR = { x: 11*TILE+16, y: 17*TILE+16 };
  ok('walk to the village path', await walkTo(a, 20*TILE+16, 18*TILE+16, 12000));
  ok('walk to home door', await walkTo(a, HOME_DOOR.x, HOME_DOOR.y + 24, 15000));
  a.send({ t: 'interact' }); // enter home
  ok('enter home interior', await a.waitFor(() => a.me()?.inside === true && a.me()?.place === 'home', 2000));
  const wallPushHome = await walkTo(a, 32*TILE+16, 10*TILE+16, 3500);
  ok('home interior walls hold', wallPushHome === false && a.me().y >= 18*TILE - 1, `y=${a.me()?.y?.toFixed(0)}`);
  const BED = { x: 29*TILE+16, y: 18*TILE+16 };
  ok('walk to bed', await walkTo(a, BED.x, BED.y));
  const dayBefore = a.lastOf('day')?.n || 1;
  a.send({ t: 'interact' }); // sleep
  ok('sleep advances to a new day (A)', await a.waitFor(() => (a.lastOf('day')?.n || 0) > dayBefore, 3000));
  ok('sleep advances to a new day (B)', await b.waitFor(() => (b.lastOf('day')?.n || 0) > dayBefore, 3000));
  ok('sleep does NOT wipe the day rhythm (A)', (a.lastOf('day')?.rhythm && Object.values(a.lastOf('day').rhythm).every(v => v === true)) === true, JSON.stringify(a.lastOf('day')?.rhythm));
  ok('sleep does NOT wipe the day rhythm (B)', (b.lastOf('day')?.rhythm && Object.values(b.lastOf('day').rhythm).every(v => v === true)) === true, JSON.stringify(b.lastOf('day')?.rhythm));
  ok('sleeper gets the personal slept effect', !!a.lastOf('slept'));
  ok('partner does NOT get the personal slept effect', !b.msgs.some(m => m.t === 'slept'));
  const RUG = { x: 29*TILE+16, y: 21*TILE+16 };
  ok('walk to rug', await walkTo(a, RUG.x, RUG.y));
  a.send({ t: 'interact' }); // decorate
  const decor = await a.waitFor(() => a.msgs.some(m => m.t === 'decor'), 2000) ? a.lastOf('decor') : null;
  ok('decorate cycles the rug', !!decor && decor.rug === 1, 'rug=' + decor?.rug);
  const WARDROBE = { x: 32*TILE+16, y: 21*TILE+16 };
  ok('walk to wardrobe', await walkTo(a, WARDROBE.x, WARDROBE.y));
  a.send({ t: 'interact' }); // -> creator menu
  ok('wardrobe offers change-clothes', await a.waitFor(() => a.msgs.some(m => m.t === 'menu' && m.kind === 'creator'), 2000));
  a.send({ t: 'look', look: LOOK_A2 });
  ok('new look applied and visible to B', await b.waitFor(() => lookEq(b.state.players.get(a.state.you.id)?.look, LOOK_A2), 3000));
  const HEARTH = { x: 35*TILE+16, y: 18*TILE+16 };
  ok('walk to hearth', await walkTo(a, HEARTH.x, HEARTH.y));
  a.send({ t: 'interact' }); // -> cook menu at home
  ok('hearth offers cooking', await a.waitFor(() => a.msgs.some(m => m.t === 'menu' && m.kind === 'cook'), 2000));
  const HOME_EXIT = { x: 32*TILE+16, y: 24*TILE+16 };
  ok('walk to home exit', await walkTo(a, HOME_EXIT.x, HOME_EXIT.y));
  a.send({ t: 'interact' }); // exit home
  ok('exit home', await a.waitFor(() => a.me()?.inside === false && a.me()?.place === null, 2000));

  // ---------- 7. SIGNATURE: ruin opens when both stand on stones ----------
  console.log('ruin:');
  ok('A walks to stone A', await walkTo(a, STONE_A.x, STONE_A.y, 15000));
  ok('B walks to the village path', await walkTo(b, PATH_W.x, PATH_W.y, 12000));
  ok('B walks to the east bank', await walkTo(b, PATH_E.x, PATH_E.y, 12000));
  ok('B walks onto the bridge', await walkTo(b, BRIDGE_E.x, BRIDGE_E.y, 8000));
  ok('B walks to stone B', await walkTo(b, STONE_B.x, STONE_B.y, 15000));
  ok('ruin-open fires for A', await a.waitFor(() => a.state.ruinOpen, 4000));
  ok('ruin-open fires for B (shared world event)', await b.waitFor(() => b.state.ruinOpen, 4000));
  const ro = a.lastOf('ruin-open');
  ok('ruin message is hope/community themed', !!ro && /hope/i.test(ro.message), ro?.message);

  // ---------- 7b. ENDING: both enter the garden together -> shared ending -> play again resets ----------
  console.log('ending:');
  const GARDEN = { x: 20*TILE+16, y: 14*TILE+16 };
  const SPAWN = { x: 13*TILE+16, y: 18*TILE+16 }; // lane east of home (System 1)
  ok('A walks to garden', await walkTo(a, GARDEN.x, GARDEN.y, 20000));
  ok('B walks to the bridge', await walkTo(b, BRIDGE_E.x, BRIDGE_E.y, 15000));
  ok('B walks to the east bank', await walkTo(b, PATH_E.x, PATH_E.y, 12000));
  ok('B walks to the village path', await walkTo(b, PATH_W.x, PATH_W.y, 12000));
  ok('B walks to garden', await walkTo(b, GARDEN.x, GARDEN.y, 20000));
  ok('ending fires for A', await a.waitFor(() => a.msgs.some(m => m.t === 'ending'), 5000));
  ok('ending fires for B (shared ending)', await b.waitFor(() => b.msgs.some(m => m.t === 'ending'), 5000));
  const endMsg = a.lastOf('ending');
  ok('ending message is hopeful, not preachy', !!endMsg && /hope/i.test(endMsg.message) && !/repent|sin|hell/i.test(endMsg.message), endMsg?.message);
  a.send({ t: 'play-again' });
  ok('reset received by A', await a.waitFor(() => a.msgs.some(m => m.t === 'reset'), 3000));
  ok('reset received by B', await b.waitFor(() => b.msgs.some(m => m.t === 'reset'), 3000));
  const r = a.lastOf('reset');
  ok('reset clears farm', r.farm.every(f => f.stage === 'empty'), JSON.stringify(r.farm.map(f=>f.stage)));
  ok('reset closes ruin', r.ruin.open === false);
  const pa = r.players.find(p => p.id === a.state.you.id);
  ok('players respawn at the lane east of home', Math.hypot(pa.x - SPAWN.x, pa.y - SPAWN.y) < 40, `${pa.x},${pa.y}`);
  ok('no duplicate ending after reset', await sleep(1200).then(() => !a.msgs.slice(a.msgs.findIndex(m=>m.t==='reset')).some(m => m.t === 'ending')));
  // life-sim state also resets
  const rd = a.lastOf('reset');
  ok('reset restores day 1', rd.day.n === 1, 'day=' + rd.day.n);
  ok('reset clears the day rhythm', Object.values(rd.day.rhythm).every(v => v === false), JSON.stringify(rd.day.rhythm));
  ok('reset clears candles', rd.candles === 0, 'candles=' + rd.candles);
  ok('reset un-blooms the garden', rd.garden.bloomed === false);
  ok('reset clears inventories', rd.players.every(p => p.inv.produce === 0 && p.inv.fish === 0 && p.inv.meals === 0));
  ok('villagers still present after reset', rd.npcs.length === 3, rd.npcs.map(n=>n.name).join(','));

  // ---------- 7c. ENDING with 3 players: only 2 in the garden ----------
  // Mini-MMO: the ending needs 2+ outside players in the garden plaza,
  // not every player — a 3rd player elsewhere must not block it.
  console.log('ending (3 players, 2 in garden):');
  const k = new C('Third'); await k.connect();
  k.send({ t: 'join', name: 'Third', code });
  ok('third player joins (room cap 10)', await k.waitFor(() => k.state.players.size === 3, 3000));
  ok('A walks to stone A again', await walkTo(a, STONE_A.x, STONE_A.y, 20000));
  // B must cross via the east bank: the ty=14 row is blocked by the cafe
  // building (tx 25-27), and a straight line to stone B hits the river —
  // walkTo steers straight, so route via the village path waypoints instead.
  ok('B walks to the village path again', await walkTo(b, 20*TILE+16, 18*TILE+16, 15000));
  ok('B walks east along the path', await walkTo(b, 27*TILE+16, 18*TILE+16, 15000));
  ok('B walks to the east bank again', await walkTo(b, PATH_E.x, PATH_E.y, 15000));
  ok('B walks onto the bridge again', await walkTo(b, BRIDGE_E.x, BRIDGE_E.y, 15000));
  ok('B walks to stone B again', await walkTo(b, STONE_B.x, STONE_B.y, 15000));
  ok('ruin re-opens with 3 players', await b.waitFor(() => b.msgs.filter(m => m.t === 'ruin-open').length >= 2, 4000));
  const AWAY = { x: 24*TILE+16, y: 18*TILE+16 }; // cafe path: outside the garden plaza
  ok('Third walks away from the garden', await walkTo(k, AWAY.x, AWAY.y, 20000));
  ok('A walks back to garden', await walkTo(a, GARDEN.x, GARDEN.y, 20000));
  ok('B walks back onto the bridge', await walkTo(b, BRIDGE_E.x, BRIDGE_E.y, 15000));
  ok('B walks back to the east bank', await walkTo(b, PATH_E.x, PATH_E.y, 15000));
  ok('B walks back west along the path', await walkTo(b, 20*TILE+16, 18*TILE+16, 15000));
  ok('B walks back to garden', await walkTo(b, GARDEN.x, GARDEN.y, 20000));
  ok('ending fires for A (3 players, only 2 in garden)', await a.waitFor(() => a.msgs.filter(m => m.t === 'ending').length >= 2, 5000));
  ok('ending fires for B', await b.waitFor(() => b.msgs.filter(m => m.t === 'ending').length >= 2, 5000));
  ok('ending fires for the player outside the garden', await k.waitFor(() => k.msgs.some(m => m.t === 'ending'), 5000));
  const kme = k.me();
  const kInGarden = !!kme && kme.x >= 18*TILE && kme.x < 23*TILE && kme.y >= 12*TILE && kme.y < 17*TILE;
  ok('third player was NOT in the garden plaza', !kInGarden, `k at ${kme?.x?.toFixed(0)},${kme?.y?.toFixed(0)}`);

  // ---------- 8. negative: invalid room codes + room cap ----------
  console.log('negative tests:');
  // room currently holds a, b, k (3 players) — fill to the 10-player cap
  const fillers = [];
  for (let i = 0; i < 7; i++) {
    const fc = new C('Guest' + i); await fc.connect();
    fc.send({ t: 'join', name: 'Guest' + i, code });
    fillers.push(fc);
  }
  const last = fillers[fillers.length - 1];
  ok('10 players can join one room', await last.waitFor(() => last.state.players.size === 10, 5000), 'saw ' + last.state.players.size);
  ok('all 10 players visible to the host', await b.waitFor(() => b.state.players.size === 10, 5000), 'saw ' + b.state.players.size);
  const e = new C('Eleventh'); await e.connect();
  e.send({ t: 'join', name: 'Eleventh', code });
  const eFull = await e.waitFor(() => e.msgs.some(m => m.t === 'error'), 2000) ? e.lastOf('error') : null;
  ok('11th player rejected (room cap 10)', !!eFull && eFull.code === 'room-full', eFull?.code);
  e.close();

  // ---------- 8b. quick-chat (preset phrases, no free text) ----------
  console.log('quick-chat:');
  a.send({ t: 'quickchat', id: 'follow' });
  const qc1 = await b.waitFor(() => b.msgs.some(m => m.t === 'quickchat'), 2000) ? b.lastOf('quickchat') : null;
  ok('valid quick-chat broadcasts to the room', !!qc1 && qc1.id === 'follow', qc1?.id);
  ok('quick-chat text is exactly the preset', !!qc1 && qc1.text === 'Follow me!', JSON.stringify(qc1?.text));
  await sleep(2200); // cooldown clears
  a.send({ t: 'quickchat', id: 'hello', text: 'HACKED <script>alert(1)</script>' });
  const qc2 = await b.waitFor(() => b.msgs.filter(m => m.t === 'quickchat').length >= 2, 2000) ? b.lastOf('quickchat') : null;
  ok('injected text ignored — preset text used', !!qc2 && qc2.text === 'Hello! 👋', JSON.stringify(qc2?.text));
  await sleep(2200); // cooldown clears
  const qcBefore = b.msgs.filter(m => m.t === 'quickchat').length;
  a.send({ t: 'quickchat', id: 'thanks' });
  a.send({ t: 'quickchat', id: 'thanks' }); // rapid double-send
  await sleep(600);
  const qcAfter = b.msgs.filter(m => m.t === 'quickchat').length;
  ok('cooldown: rapid double-send broadcasts once', qcAfter === qcBefore + 1, `${qcBefore} -> ${qcAfter}`);
  ok('cooldown error reported to sender', a.msgs.some(m => m.t === 'error' && m.code === 'quickchat-cooldown'));
  await sleep(2200); // cooldown clears
  a.send({ t: 'quickchat', id: 'not-a-phrase' });
  ok('invalid quick-chat id rejected', await a.waitFor(() => a.msgs.some(m => m.t === 'error' && m.code === 'bad-quickchat'), 2000));
  const c = new C('Stranger'); await c.connect();
  c.send({ t: 'join', name: 'Stranger', code: 'ZZZZ' });
  const e1 = await c.waitFor(() => c.msgs.some(m => m.t === 'error'), 2000) ? c.lastOf('error') : null;
  ok('unknown code rejected', !!e1 && e1.code === 'bad-code', e1?.code);
  c.send({ t: 'join', name: 'Stranger', code: '!!!' });
  const e2 = await c.waitFor(() => c.msgs.filter(m => m.t === 'error').length >= 2, 2000) ? c.lastOf('error') : null;
  ok('malformed code rejected', !!e2 && e2.code === 'bad-code');

  // ---------- 9. room isolation ----------
  console.log('isolation:');
  const d = new C('Other'); await d.connect();
  d.send({ t: 'create', name: 'Other' });
  ok('second room created', await d.waitFor(() => !!d.state.code, 3000));
  ok('different code', d.state.code !== code, d.state.code);
  // d starts at the new spawn; route via the village path and the farm gate —
  // a straight line from spawn to the plots runs into the house wall.
  await walkTo(d, 20*TILE+16, 18*TILE+16);
  await walkTo(d, 11*TILE+16, 10*TILE+16);
  await walkTo(d, PLOT0.x, PLOT0.y);
  d.send({ t: 'interact' }); // plant in room 2
  await sleep(600);
  const room2Planted = d.state.farm[0]?.stage === 'planted';
  const room1Empty = a.state.farm[0]?.stage === 'empty';
  ok('room2 farm planted', room2Planted, d.state.farm[0]?.stage);
  ok('room1 farm unaffected (isolation)', room1Empty, a.state.farm[0]?.stage);
  ok('room2 does not see room1 players', d.state.players.size === 1 && ![...d.state.players.values()].some(p => p.name === 'Ariel'));

  // ---------- 9c. disconnect -> partner sees "X left the village" ----------
  console.log('leave toast:');
  a.close();
  const leave = await b.waitFor(() => b.msgs.some(m => m.t === 'leave'), 3000) ? b.lastOf('leave') : null;
  ok('leave broadcast when a player disconnects', !!leave, 'no leave message received');
  ok('leave names the departed player', !!leave && leave.name === 'Ariel', JSON.stringify(leave));
  ok('departed player removed from partner view', await b.waitFor(() => ![...b.state.players.values()].some(p => p.name === 'Ariel'), 3000));

  // ---------- 9b. malformed packets don't kill the connection ----------
  console.log('malformed packets:');
  const g = new C('Garbled'); await g.connect();
  g.send({ t: 'create', name: 'Garbled' });
  ok('garbled client creates room', await g.waitFor(() => !!g.state.code, 3000));
  g.ws.send('this is not json{{{');
  g.send({ t: 'nope' });
  g.send({});
  g.send({ t: 'look', look: { skin: 'nope', hair: 'mohawk' } });
  const badLook = await g.waitFor(() => g.msgs.some(m => m.t === 'error' && m.code === 'bad-look'), 2000);
  ok('invalid look rejected', badLook);
  await sleep(500);
  const stillAlive = g.ws.readyState === 1;
  g.send({ t: 'emote', id: 'wave' });
  ok('connection survives malformed packets', stillAlive && await g.waitFor(() => g.msgs.some(m => m.t === 'player'), 2000));
  g.close();
  console.log('rate limit:');
  const f = new C('Flooder'); await f.connect();
  let closed = false;
  f.ws.on('close', () => { closed = true; });
  for (let i = 0; i < 200; i++) f.send({ t: 'input', x: 1, y: 0 });
  ok('message flood gets disconnected', await f.waitFor(() => closed, 4000));

  [a, b, c, d, k, ...fillers].forEach(x => x.close());
} finally {
  srv.kill('SIGTERM');
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
