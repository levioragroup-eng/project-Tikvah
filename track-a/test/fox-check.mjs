// Focused fox-pet check (iteration helper for the flaky chase).
import { spawn } from 'child_process';
import { setTimeout as sleep } from 'timers/promises';
import WebSocket from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = 18790;
const URL = `ws://127.0.0.1:${PORT}`;

class C {
  constructor(name) { this.name = name; this.msgs = []; this.state = { players: new Map(), you: null, code: null, fox: null }; }
  async connect() {
    this.ws = new WebSocket(URL);
    await new Promise((res, rej) => { this.ws.on('open', res); this.ws.on('error', rej); });
    this.ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      this.msgs.push(m);
      if (m.t === 'joined') { this.state.you = m.you; this.state.code = m.code; m.players.forEach(p => this.state.players.set(p.id, p)); this.state.fox = m.fox; }
      if (m.t === 'join' || m.t === 'player') this.state.players.set(m.p.id, m.p);
      if (m.t === 'tick') m.players.forEach(p => this.state.players.set(p.id, p));
      if (m.t === 'fox') this.state.fox = { x: m.x, y: m.y };
    });
  }
  send(m) { this.ws.send(JSON.stringify(m)); }
  me() { return this.state.players.get(this.state.you?.id); }
  async waitFor(pred, ms) { const t0 = Date.now(); while (Date.now()-t0 < ms) { if (pred()) return true; await sleep(60); } return false; }
  lastOf(t) { const f = this.msgs.filter(m => m.t === t); return f[f.length-1]; }
}

const srv = spawn('node', ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((resolve, reject) => {
  const to = setTimeout(() => reject(new Error('no start')), 8000);
  srv.stdout.on('data', d => { if (d.toString().includes('Tikvah')) { clearTimeout(to); resolve(); } });
});

async function attempt(n) {
  const a = new C('Fox' + n); await a.connect();
  a.send({ t: 'join', name: 'Fox' + n, code: 'TIKVAH' });
  await a.waitFor(() => !!a.state.fox, 3000);
  let pet = null, lastD = 1e9, stuck = 0;
  const t0 = Date.now();
  for (let i = 0; i < 60 && !pet && Date.now() - t0 < 45000; i++) {
    const f = a.state.fox, me = a.me();
    if (!f || !me) { await sleep(300); continue; }
    const dx = f.x - me.x, dy = f.y - me.y, d = Math.hypot(dx, dy);
    if (d < 50) {
      a.send({ t: 'input', x: 0, y: 0 });
      a.send({ t: 'interact' });
      pet = await a.waitFor(() => a.msgs.some(m => m.t === 'pet'), 1000) ? a.lastOf('pet') : null;
    } else if (d < lastD - 5) { stuck = 0; a.send({ t: 'input', x: dx/d, y: dy/d }); }
    else if (++stuck >= 6) { a.send({ t: 'input', x: -dy/d, y: dx/d }); if (stuck >= 12) stuck = 0; }
    else { a.send({ t: 'input', x: dx/d, y: dy/d }); }
    lastD = d;
    await sleep(300);
  }
  a.send({ t: 'input', x: 0, y: 0 });
  console.log(`attempt ${n}: ${pet ? 'PET ok by ' + pet.by : 'MISS'} (fox at ${Math.round(a.state.fox?.x)},${Math.round(a.state.fox?.y)})`);
  a.ws.close();
  return !!pet;
}

let okCount = 0;
for (let n = 1; n <= 5; n++) { if (await attempt(n)) okCount++; await sleep(500); }
console.log(`fox pet: ${okCount}/5`);
srv.kill();
process.exit(okCount === 5 ? 0 : 1);
