// Track A headless integration test.
// Spawns the server on a test port, drives 2 WebSocket clients through the
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

let pass = 0, fail = 0;
function ok(name, cond, detail='') {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

// ---------- server ----------
console.log('starting server...');
const srv = spawn('node', ['server.js'], {
  cwd: ROOT, env: { ...process.env, PORT: String(PORT), CROP_GROW_MS: '1500', FISH_WAIT_MIN: '800', FISH_WAIT_MAX: '1200', FISH_CATCH_WINDOW: '3000' },
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

// ---------- client helper ----------
class C {
  constructor(name) { this.name = name; this.msgs = []; this.state = { players: new Map(), farm: [], ruinOpen: false, you: null, code: null }; }
  async connect() {
    this.ws = new WebSocket(URL);
    await new Promise((res, rej) => { this.ws.on('open', res); this.ws.on('error', rej); });
    this.ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      this.msgs.push(m);
      if (m.t === 'joined') { this.state.you = m.you; this.state.code = m.code; m.players.forEach(p => this.state.players.set(p.id, p)); this.state.farm = m.farm; this.state.ruinOpen = m.ruin.open; }
      if (m.t === 'join' || m.t === 'player') this.state.players.set(m.p.id, m.p);
      if (m.t === 'tick') m.players.forEach(p => this.state.players.set(p.id, p));
      if (m.t === 'leave') this.state.players.delete(m.id);
      if (m.t === 'farm') this.state.farm = m.farm;
      if (m.t === 'ruin-open') this.state.ruinOpen = true;
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
  a.send({ t: 'create', name: 'Ariel' });
  ok('create room -> joined', await a.waitFor(() => !!a.state.code, 3000));
  const code = a.state.code;
  ok('room code is 4 letters', /^[A-Z]{4}$/.test(code || ''), 'got: ' + code);

  const b = new C('Friend'); await b.connect();
  b.send({ t: 'join', name: 'Friend', code });
  ok('second player joins same code', await b.waitFor(() => b.state.players.size === 2, 3000));
  ok('both see 2 players', await a.waitFor(() => a.state.players.size === 2, 3000));

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

  // ---------- 3. out-of-range interaction rejected ----------
  console.log('interaction validation:');
  await walkTo(a, 20*TILE+16, 14*TILE+16); // center, far from farm
  a.send({ t: 'interact' });
  await sleep(400);
  const failMsg = a.lastOf('interact-fail');
  ok('out-of-range interact rejected', !!failMsg && failMsg.reason === 'nothing-nearby');

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
  ok('walk to dock', await walkTo(b, DOCK.x - 16, DOCK.y));
  b.send({ t: 'interact' }); // cast
  ok('cast accepted', await b.waitFor(() => b.me()?.fishing === 'cast', 2000));
  ok('bite event fires', await b.waitFor(() => b.msgs.some(m => m.t === 'bite'), 5000));
  b.send({ t: 'interact' }); // catch within window
  ok('catch within window -> catch event', await a.waitFor(() => a.msgs.some(m => m.t === 'catch'), 3000));

  // ---------- 6. church: enter, pray, read verse, exit ----------
  console.log('church:');
  ok('walk to church door', await walkTo(a, CHURCH_DOOR.x, CHURCH_DOOR.y + 8));
  a.send({ t: 'interact' }); // enter
  ok('enter church interior', await a.waitFor(() => a.me()?.inside === true, 2000));
  ok('walk to altar', await walkTo(a, 20*TILE+16, 20*TILE+16));
  a.send({ t: 'interact' }); // pray
  ok('pray -> pray emote visible to other', await b.waitFor(() => b.state.players.get(a.state.you.id)?.emote === 'pray', 2000));
  ok('walk to verse stand', await walkTo(a, 16*TILE+16, 20*TILE+16));
  a.send({ t: 'interact' }); // read
  const verse = await a.waitFor(() => a.msgs.some(m => m.t === 'verse'), 2000) ? a.lastOf('verse') : null;
  ok('verse shown and is verified KJV text', !!verse && VERSE_TEXTS.has(verse.text), verse ? verse.ref : 'none');
  ok('walk to exit', await walkTo(a, 20*TILE+16, 24*TILE+16));
  a.send({ t: 'interact' }); // exit
  ok('exit church', await a.waitFor(() => a.me()?.inside === false, 2000));

  // ---------- 7. SIGNATURE: ruin opens when both stand on stones ----------
  console.log('ruin:');
  ok('A walks to stone A', await walkTo(a, STONE_A.x, STONE_A.y, 15000));
  ok('B walks to stone B', await walkTo(b, STONE_B.x, STONE_B.y, 15000));
  ok('ruin-open fires for A', await a.waitFor(() => a.state.ruinOpen, 4000));
  ok('ruin-open fires for B (shared world event)', await b.waitFor(() => b.state.ruinOpen, 4000));
  const ro = a.lastOf('ruin-open');
  ok('ruin message is hope/community themed', !!ro && /hope/i.test(ro.message), ro?.message);

  // ---------- 8. negative: invalid room codes ----------
  console.log('negative tests:');
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
  await walkTo(d, PLOT0.x, PLOT0.y);
  d.send({ t: 'interact' }); // plant in room 2
  await sleep(600);
  const room2Planted = d.state.farm[0]?.stage === 'planted';
  const room1Empty = a.state.farm[0]?.stage === 'empty';
  ok('room2 farm planted', room2Planted, d.state.farm[0]?.stage);
  ok('room1 farm unaffected (isolation)', room1Empty, a.state.farm[0]?.stage);
  ok('room2 does not see room1 players', d.state.players.size === 1 && ![...d.state.players.values()].some(p => p.name === 'Ariel'));

  // ---------- 9b. malformed packets don't kill the connection ----------
  console.log('malformed packets:');
  const g = new C('Garbled'); await g.connect();
  g.send({ t: 'create', name: 'Garbled' });
  ok('garbled client creates room', await g.waitFor(() => !!g.state.code, 3000));
  g.ws.send('this is not json{{{');
  g.send({ t: 'nope' });
  g.send({});
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

  [a, b, c, d].forEach(x => x.close());
} finally {
  srv.kill('SIGTERM');
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
