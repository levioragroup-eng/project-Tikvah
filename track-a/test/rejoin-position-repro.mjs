// Part B reproduction: return-to-spawn investigation.
// Scenario: connect, walk far NE (stone B, like the Sep-27 exploration),
// hold the connection with periodic input pings across heartbeat cycles,
// then abruptly drop the socket and reconnect with the SAME traveler uuid.
// Records exactly what position the server hands back on rejoin.
import { spawn } from 'child_process';
import { setTimeout as sleep } from 'timers/promises';
import WebSocket from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = 18788;
const URL = `ws://127.0.0.1:${PORT}`;
const TILE = 32;
const SPAWN = { x: 13*TILE+16, y: 14*TILE+16 };

let pass = 0, fail = 0;
function ok(name, cond, detail='') {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
const dist = (a, b) => Math.hypot(a.x-b.x, a.y-b.y);

class C {
  constructor(name) { this.name = name; this.msgs = []; this.state = { players: new Map(), you: null, code: null }; }
  async connect() {
    this.ws = new WebSocket(URL);
    await new Promise((res, rej) => { this.ws.on('open', res); this.ws.on('error', rej); });
    this.ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      this.msgs.push(m);
      if (m.t === 'joined') { this.state.you = m.you; this.state.code = m.code; m.players.forEach(p => this.state.players.set(p.id, p)); }
      if (m.t === 'join' || m.t === 'player') this.state.players.set(m.p.id, m.p);
      if (m.t === 'tick') m.players.forEach(p => this.state.players.set(p.id, p));
      if (m.t === 'leave') this.state.players.delete(m.id);
    });
  }
  send(m) { this.ws.send(JSON.stringify(m)); }
  me() { return this.state.players.get(this.state.you?.id); }
  async waitFor(pred, ms) { const t0 = Date.now(); while (Date.now()-t0 < ms) { if (pred()) return true; await sleep(60); } return false; }
}
async function walkTo(c, tx, ty, timeoutMs = 15000) {
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

console.log('starting server...');
const srv = spawn('node', ['server.js'], {
  cwd: ROOT, env: { ...process.env, PORT: String(PORT), CROP_GROW_MS: '1500', DAY_MS: '45000', REAP_MS: '500' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
srv.stderr.on('data', d => process.stderr.write('[srv] ' + d));
await new Promise((resolve, reject) => {
  const to = setTimeout(() => reject(new Error('server did not start')), 8000);
  srv.stdout.on('data', d => { if (d.toString().includes('Tikvah')) { clearTimeout(to); resolve(); } });
  srv.on('exit', (c) => reject(new Error('server exited: ' + c)));
});
ok('server starts', true);

try {
  const UUID = 'repro-uuid-' + Date.now().toString(36);
  const a = new C('Explorer'); await a.connect();
  a.send({ t: 'join', name: 'Explorer', code: 'TIKVAH', uuid: UUID });
  ok('join TIKVAH', await a.waitFor(() => !!a.state.code, 3000));
  const startPos = { ...a.me() };
  ok('starts at spawn', dist(startPos, SPAWN) < 40, JSON.stringify({x: Math.round(startPos.x), y: Math.round(startPos.y)}));

  // Phase 1: walk far NE (market lane -> east lane -> north -> stone B clearing)
  ok('route: market lane', await walkTo(a, 13*TILE+16, 12*TILE+16));
  ok('route: east on market lane', await walkTo(a, 27*TILE+16, 12*TILE+16, 20000));
  ok('route: north up east lane', await walkTo(a, 33*TILE+16, 8*TILE+16, 15000));
  ok('route: stone B clearing', await walkTo(a, 34*TILE+16, 5*TILE+16, 15000));
  const far = { ...a.me() };
  const farDist = dist(far, SPAWN);
  ok('far from spawn after NE trek', farDist > 400, `dist=${Math.round(farDist)}px at (${Math.round(far.x)},${Math.round(far.y)})`);

  // Phase 2: hold 65s (covers two 30s server heartbeat cycles) with periodic
  // input pings, sampling position every 5s. Any snap back to spawn = the bug.
  console.log('holding connection 65s with periodic pings (2 heartbeat cycles)...');
  let snapped = false, snapAt = null;
  for (let i = 0; i < 13; i++) {
    // small nudge so input flows, then stop
    a.send({ t: 'input', x: 0.2, y: 0 });
    await sleep(2500);
    a.send({ t: 'input', x: 0, y: 0 });
    await sleep(2500);
    const me = a.me();
    const d = dist(me, SPAWN);
    if (d < 100) { snapped = true; snapAt = i; break; }
    if (i % 4 === 0) console.log(`    t+${(i+1)*5}s pos=(${Math.round(me.x)},${Math.round(me.y)}) dist-from-spawn=${Math.round(d)}px`);
  }
  ok('no position snap during 65s hold', !snapped, snapped ? `snapped at sample ${snapAt}` : '');
  const preDrop = { ...a.me() };

  // Phase 3: abrupt drop (no close handshake — simulates a network flap),
  // then reconnect with the SAME traveler uuid.
  console.log('dropping socket abruptly...');
  a.ws.terminate();
  await sleep(1500); // let the server close-handler run
  const b = new C('Explorer'); await b.connect();
  b.send({ t: 'join', name: 'Explorer', code: 'TIKVAH', uuid: UUID });
  ok('rejoin with same uuid', await b.waitFor(() => !!b.state.code, 3000));
  const re = { ...b.state.you };
  const dReSpawn = dist(re, SPAWN), dReFar = dist(re, preDrop);
  console.log(`  rejoined at (${Math.round(re.x)},${Math.round(re.y)}); dist-from-spawn=${Math.round(dReSpawn)}px dist-from-pre-drop=${Math.round(dReFar)}px`);
  console.log(`  RESULT: ${dReFar < 60 ? 'POSITION RESTORED' : 'RESET TO SPAWN'} (code path: server.js addPlayer always places at SPAWN; identity restores name/look/inv only)`);
  ok('rejoin restores pre-drop position', dReFar < 60, `landed ${Math.round(dReSpawn)}px from spawn, ${Math.round(dReFar)}px from pre-drop pos`);

  // Phase 4: second rejoin sanity — a THIRD join with the same uuid must not
  // drift either (identity record must now hold the restored position).
  b.ws.close(); await sleep(800);
  const c = new C('Explorer'); await c.connect();
  c.send({ t: 'join', name: 'Explorer', code: 'TIKVAH', uuid: UUID });
  ok('third join with same uuid', await c.waitFor(() => !!c.state.code, 3000));
  const re3 = { ...c.state.you };
  ok('third join keeps position (no drift)', dist(re3, re) < 60, `(${Math.round(re3.x)},${Math.round(re3.y)})`);
  c.ws.close();
} finally {
  srv.kill();
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
