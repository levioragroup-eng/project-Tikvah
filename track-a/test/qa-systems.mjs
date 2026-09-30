// Part A supplementary regression: per-system PASS/FAIL verdicts for every
// preserved system, beyond the 683-test main suite. Run: node test/qa-systems.mjs
import { spawn } from 'child_process';
import { setTimeout as sleep } from 'timers/promises';
import WebSocket from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = 18789;
const URL = `ws://127.0.0.1:${PORT}`;
const TILE = 32;
const VERSE_TEXTS = new Set([
  'For I know the thoughts that I think toward you, saith the LORD, thoughts of peace, and not of evil, to give you an expected end.',
  'The LORD is my shepherd; I shall not want.',
]);
const VERSE_REFS = new Set(['Jeremiah 29:11', 'Psalm 23:1']);
const LOOK_A = { skin: '#c68a5a', hair: 'curly', hairColor: '#d9c08a', outfit: '#9a6ac9', dress: true, accessory: 'flower' };
const LOOK_B = { skin: '#6e452a', hair: 'bun', hairColor: '#2e1c10', outfit: '#4a8ac9', dress: false, accessory: 'hat' };
function lookEq(a, b) { return a && b && a.skin===b.skin && a.hair===b.hair && a.hairColor===b.hairColor && a.outfit===b.outfit && a.dress===b.dress && a.accessory===b.accessory; }

const results = [];
function sys(name, cond, evidence='') {
  results.push({ name, pass: !!cond, evidence });
  console.log(`${cond ? 'PASS' : 'FAIL'}  [${name}]${evidence ? ' — ' + evidence : ''}`);
}

class C {
  constructor(name) { this.name = name; this.msgs = []; this.state = { players: new Map(), farm: [], ruinOpen: false, you: null, code: null, fox: null }; }
  async connect() {
    this.ws = new WebSocket(URL);
    await new Promise((res, rej) => { this.ws.on('open', res); this.ws.on('error', rej); });
    this.ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      this.msgs.push(m);
      if (m.t === 'joined') { this.state.you = m.you; this.state.code = m.code; m.players.forEach(p => this.state.players.set(p.id, p)); this.state.farm = m.farm; this.state.ruinOpen = m.ruin.open; this.state.npcs = new Map(m.npcs.map(n => [n.name, n])); this.state.fox = m.fox; }
      if (m.t === 'join' || m.t === 'player') this.state.players.set(m.p.id, m.p);
      if (m.t === 'tick') { m.players.forEach(p => this.state.players.set(p.id, p)); if (m.npcs) m.npcs.forEach(n => this.state.npcs.set(n.name, n)); }
      if (m.t === 'leave') this.state.players.delete(m.id);
      if (m.t === 'farm') this.state.farm = m.farm;
      if (m.t === 'fox') this.state.fox = { x: m.x, y: m.y };
      if (m.t === 'ruin-open') this.state.ruinOpen = true;
      if (m.t === 'reset') { this.state.ruinOpen = false; this.state.farm = m.farm; }
    });
  }
  send(m) { this.ws.send(JSON.stringify(m)); }
  me() { return this.state.players.get(this.state.you?.id); }
  async waitFor(pred, ms) { const t0 = Date.now(); while (Date.now()-t0 < ms) { if (pred()) return true; await sleep(60); } return false; }
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
const PX = (tx, ty) => ({ x: tx*TILE+16, y: ty*TILE+16 });

console.log('starting server...');
const srv = spawn('node', ['server.js'], {
  cwd: ROOT, env: { ...process.env, PORT: String(PORT), CROP_GROW_MS: '1500', FISH_WAIT_MIN: '800', FISH_WAIT_MAX: '1200', FISH_CATCH_WINDOW: '3000', DAY_MS: '6000', REAP_MS: '500' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
srv.stderr.on('data', d => process.stderr.write('[srv] ' + d));
await new Promise((resolve, reject) => {
  const to = setTimeout(() => reject(new Error('server did not start')), 8000);
  srv.stdout.on('data', d => { if (d.toString().includes('Tikvah')) { clearTimeout(to); resolve(); } });
  srv.on('exit', (c) => reject(new Error('server exited: ' + c)));
});

try {
  // ---- S1: 10-player room cap ----
  const cap = [];
  const c0 = new C('Cap0'); await c0.connect();
  c0.send({ t: 'create', name: 'Cap0' });
  await c0.waitFor(() => !!c0.state.code, 3000);
  cap.push(c0);
  const capCode = c0.state.code;
  for (let i = 1; i < 10; i++) { const c = new C('Cap'+i); await c.connect(); c.send({ t: 'join', name: 'Cap'+i, code: capCode }); cap.push(c); }
  const tenIn = await c0.waitFor(() => c0.state.players.size === 10, 5000);
  const c11 = new C('Cap11'); await c11.connect();
  c11.send({ t: 'join', name: 'Cap11', code: capCode });
  const fullErr = await c11.waitFor(() => c11.msgs.some(m => m.t === 'error' && m.code === 'room-full'), 3000);
  sys('room-cap-10', tenIn && fullErr, `10 seated=${tenIn}, 11th rejected room-full=${fullErr}, code=${capCode}`);
  cap.forEach(c => c.close()); c11.close(); await sleep(600);

  // ---- S2: private 4-letter rooms ----
  const p1 = new C('Priv1'); await p1.connect();
  p1.send({ t: 'create', name: 'Priv1' });
  await p1.waitFor(() => !!p1.state.code, 3000);
  const codeFmt = /^[A-Z]{4}$/.test(p1.state.code);
  const p2 = new C('Priv2'); await p2.connect();
  p2.send({ t: 'join', name: 'Priv2', code: p1.state.code });
  const joinedCode = await p2.waitFor(() => p2.state.code === p1.state.code, 3000);
  const bad = new C('Bad'); await bad.connect();
  bad.send({ t: 'join', name: 'Bad', code: 'ZZZZ' });
  const badErr = await bad.waitFor(() => bad.msgs.some(m => m.t === 'error' && m.code === 'bad-code'), 3000);
  sys('private-rooms', codeFmt && joinedCode && badErr, `code=${p1.state.code} fmt4L=${codeFmt} join-by-code=${joinedCode} bad-code-rejected=${badErr}`);
  p1.close(); p2.close(); bad.close(); await sleep(600);

  // ---- S3: public persistent village ----
  const pv1 = new C('Pub1'); await pv1.connect();
  pv1.send({ t: 'join', name: 'Pub1', code: 'TIKVAH', uuid: 'qa-pub-' + Date.now() });
  await pv1.waitFor(() => pv1.state.code === 'TIKVAH', 3000);
  await walkTo(pv1, 13*TILE+16, 12*TILE+16); await walkTo(pv1, 8*TILE+16, 12*TILE+16);
  await walkTo(pv1, 8*TILE+16, 16*TILE+16); await walkTo(pv1, 6*TILE+16, 15*TILE+16);
  pv1.send({ t: 'interact' });
  const planted = await pv1.waitFor(() => pv1.state.farm[0]?.stage === 'planted', 3000);
  pv1.close(); await sleep(1200); // > REAP_MS: a private room would be gone
  const pv2 = new C('Pub2'); await pv2.connect();
  pv2.send({ t: 'join', name: 'Pub2', code: 'TIKVAH' });
  const stillThere = await pv2.waitFor(() => pv2.state.code === 'TIKVAH', 3000);
  const stateKept = pv2.state.farm[0]?.stage === 'planted';
  sys('public-persistent-village', planted && stillThere && stateKept, `TIKVAH survives empty=${stillThere}, farm state kept=${stateKept}`);
  pv2.close(); await sleep(600);

  // ---- S4: identity look round-trip (all 6 fields identical) ----
  const LID = 'qa-look-' + Date.now();
  const lx = new C('LookX'); await lx.connect();
  lx.send({ t: 'join', name: 'LookX', code: 'TIKVAH', look: LOOK_A, uuid: LID });
  await lx.waitFor(() => !!lx.state.code, 3000);
  lx.close(); await sleep(500);
  const ly = new C('LookY'); await ly.connect();
  ly.send({ t: 'join', name: 'LookY', code: 'TIKVAH', uuid: LID }); // no look resent
  await ly.waitFor(() => !!ly.me(), 3000);
  sys('identity-look-roundtrip', lookEq(ly.me()?.look, LOOK_A), JSON.stringify(ly.me()?.look));
  ly.close(); await sleep(400);

  // ---- main life-sim room ----
  const a = new C('Ariel'); await a.connect();
  a.send({ t: 'create', name: 'Ariel', look: LOOK_A });
  await a.waitFor(() => !!a.state.code, 3000);
  const b = new C('Friend'); await b.connect();
  b.send({ t: 'join', name: 'Friend', code: a.state.code, look: LOOK_B });
  await b.waitFor(() => b.state.players.size === 2, 3000);

  // ---- S5: movement + collision ----
  await walkTo(a, 13*TILE+16, 18*TILE+16);
  await walkTo(a, 20*TILE+16, 18*TILE+16);
  await walkTo(a, 20*TILE+16, 20*TILE+16);
  const onBridge = await walkTo(a, 20*TILE+16, 23*TILE+16, 8000);
  const waterPush = await walkTo(a, 17*TILE+16, 23*TILE+16, 3500);
  const riverBlocked = waterPush === false && a.me().x > 18*TILE;
  await walkTo(a, 13*TILE+16, 18*TILE+16); await walkTo(a, 13*TILE+16, 12*TILE+16);
  const wallPush = await walkTo(a, 29*TILE+16, 12*TILE+16, 3500); // into the church wall
  const churchWallBlocked = wallPush === false && a.me().x < 28*TILE;
  await walkTo(a, 8*TILE+16, 12*TILE+16);
  const gateOpen = await walkTo(a, 8*TILE+16, 16*TILE+16, 8000); // farm gate stays open
  sys('collision', onBridge && riverBlocked && churchWallBlocked && gateOpen,
    `bridge=${onBridge} river-blocked=${riverBlocked} church-wall-blocked=${churchWallBlocked} farm-gate-open=${gateOpen}`);

  // ---- S6: farming full cycle ----
  await walkTo(a, 6*TILE+16, 15*TILE+16);
  a.send({ t: 'interact' });
  const plantedA = await a.waitFor(() => a.state.farm[0]?.stage === 'planted', 3000);
  a.send({ t: 'interact' });
  const wateredA = await a.waitFor(() => a.state.farm[0]?.stage === 'growing', 3000);
  const grownA = await a.waitFor(() => a.state.farm[0]?.stage === 'ready', 8000);
  a.send({ t: 'interact' });
  const harvestedA = await a.waitFor(() => (a.me()?.inv?.produce || 0) >= 1, 3000);
  sys('farming', plantedA && wateredA && grownA && harvestedA, `plant=${plantedA} water=${wateredA} grow=${grownA} harvest=${harvestedA} produce=${a.me()?.inv?.produce}`);

  // ---- S7: fishing full cycle ----
  await walkTo(a, 8*TILE+16, 14*TILE+16); await walkTo(a, 8*TILE+16, 12*TILE+16);
  await walkTo(a, 13*TILE+16, 12*TILE+16); await walkTo(a, 13*TILE+16, 18*TILE+16);
  await walkTo(a, 17*TILE+16, 18*TILE+16); await walkTo(a, 17*TILE+16, 20*TILE+16);
  a.send({ t: 'interact' });
  const cast = await a.waitFor(() => a.me()?.fishing === 'cast' || a.msgs.some(m => m.t === 'bite'), 3000);
  const bite = await a.waitFor(() => a.msgs.some(m => m.t === 'bite'), 6000);
  a.send({ t: 'interact' });
  const caught = await a.waitFor(() => (a.me()?.inv?.fish || 0) >= 1, 3000);
  sys('fishing', cast && bite && caught, `cast=${cast} bite=${bite} catch=${caught} fish=${a.me()?.inv?.fish}`);

  // ---- S8: cooking ----
  await walkTo(a, 13*TILE+16, 18*TILE+16); await walkTo(a, 13*TILE+16, 12*TILE+16);
  await walkTo(a, 27*TILE+16, 12*TILE+16, 15000); await walkTo(a, 27*TILE+16, 16*TILE+16);
  await walkTo(a, 24*TILE+16, 16*TILE+16);
  a.send({ t: 'interact' });
  const menu = await a.waitFor(() => a.msgs.some(m => m.t === 'menu' && m.kind === 'cook'), 3000);
  a.send({ t: 'cook', action: 'cook' });
  const cooked = await a.waitFor(() => a.msgs.some(m => m.t === 'cooked'), 3000);
  sys('cooking', menu && cooked && a.me()?.inv?.meals === 1, `menu=${menu} cooked=${cooked} meals=${a.me()?.inv?.meals}`);

  // ---- S9: villager greet ----
  await walkTo(a, 21*TILE+16, 17*TILE+16);
  let say = null;
  for (let i = 0; i < 3 && !say; i++) {
    const h = a.state.npcs.get('Hannah');
    await walkTo(a, h.x, h.y, 8000);
    a.send({ t: 'interact' });
    say = await a.waitFor(() => a.msgs.some(m => m.t === 'say'), 2000) ? a.lastOf('say') : null;
  }
  sys('villager-greet', !!say && say.hearts === 1, `said="${say?.text?.slice(0, 40)}..." hearts=${say?.hearts}`);

  // ---- S10: church verbs (waypoints copied from the main suite) ----
  await walkTo(a, 27*TILE+16, 12*TILE+16, 15000); await walkTo(a, 27*TILE+16, 15*TILE+16);
  await walkTo(a, 30*TILE+16, 15*TILE+16 + 8);
  a.send({ t: 'interact' });
  const entered = await a.waitFor(() => a.me()?.inside === true && a.me()?.place === 'church', 3000);
  await walkTo(a, 20*TILE+16, 20*TILE+16); // altar / pray spot
  a.send({ t: 'interact' }); // pray (no candles yet -> no worship)
  const prayed = await b.waitFor(() => b.state.players.get(a.state.you.id)?.emote === 'pray', 3000);
  await walkTo(a, 16*TILE+16, 19*TILE+16); await walkTo(a, 16*TILE+16, 20*TILE+16); // verse stand
  const seenTexts = new Set(), seenRefs = new Set();
  for (let i = 0; i < 6; i++) { a.send({ t: 'interact' }); await sleep(300); const v = a.lastOf('verse'); if (v) { seenTexts.add(v.text); seenRefs.add(v.ref); } }
  const versesExact = seenTexts.size === 2 && [...seenTexts].every(t => VERSE_TEXTS.has(t)) && [...seenRefs].every(r => VERSE_REFS.has(r));
  await walkTo(a, 20*TILE+16, 24*TILE+16);
  a.send({ t: 'interact' }); // exit, then re-enter (proven main-suite approach to the candle stand)
  await a.waitFor(() => a.me()?.inside === false, 3000);
  a.send({ t: 'interact' }); // enter again
  await a.waitFor(() => a.me()?.inside === true, 3000);
  await walkTo(a, 24*TILE+16, 20*TILE+16); // candle stand, from the entrance
  a.send({ t: 'interact' }); // candle
  const candle = await a.waitFor(() => a.msgs.some(m => m.t === 'candle'), 3000) ? a.lastOf('candle') : null;
  await walkTo(a, 20*TILE+16, 22*TILE+16); await walkTo(a, 20*TILE+16, 20*TILE+16); // altar
  a.send({ t: 'interact' }); // pray with candle lit -> worship
  const worship = await b.waitFor(() => b.msgs.some(m => m.t === 'worship'), 3000);
  const bloom = await a.waitFor(() => a.msgs.some(m => m.t === 'garden-bloom'), 4000);
  await walkTo(a, 20*TILE+16, 24*TILE+16);
  a.send({ t: 'interact' }); // exit
  const exited = await a.waitFor(() => a.me()?.inside === false, 3000);
  sys('church-verbs', entered && prayed && versesExact && candle?.count === 1 && worship && exited,
    `enter=${entered} pray=${prayed} verses-exact-2=${versesExact} candle=${candle?.count} worship=${worship} leave=${exited}`);
  sys('garden-bloom', bloom, bloom ? a.lastOf('garden-bloom')?.message?.slice(0, 60) : 'no bloom event');

  // ---- S11: character creator save ----
  a.send({ t: 'look', look: LOOK_B });
  const lookSaved = await b.waitFor(() => lookEq(b.state.players.get(a.state.you.id)?.look, LOOK_B), 3000);
  a.send({ t: 'look', look: { ...LOOK_B, skin: '#000000' } });
  const lookRejected = await a.waitFor(() => a.msgs.some(m => m.t === 'error' && m.code === 'bad-look'), 3000);
  sys('creator-save', lookSaved && lookRejected, `saved=${lookSaved} invalid-rejected=${lookRejected}`);

  // ---- S12: quick-chat ----
  a.send({ t: 'quickchat', id: 'hello' });
  const qc = await b.waitFor(() => b.msgs.some(m => m.t === 'quickchat'), 3000) ? b.lastOf('quickchat') : null;
  a.send({ t: 'quickchat', id: 'hello' });
  const qcCool = await a.waitFor(() => a.msgs.some(m => m.t === 'error' && m.code === 'quickchat-cooldown'), 3000);
  a.send({ t: 'quickchat', id: 'bogus' });
  const qcBad = await a.waitFor(() => a.msgs.some(m => m.t === 'error' && m.code === 'bad-quickchat'), 3000);
  sys('quick-chat', !!qc && qc.text === 'Hello! 👋' && qcCool && qcBad, `preset="${qc?.text}" cooldown=${qcCool} invalid-rejected=${qcBad}`);

  // ---- S13: ruins (both pads, two-player co-op) — A routes from the church door, B from the cafe ----
  await walkTo(a, 27*TILE+16, 16*TILE+16); await walkTo(a, 27*TILE+16, 12*TILE+16, 12000);
  await walkTo(a, 13*TILE+16, 12*TILE+16, 12000); await walkTo(a, 6*TILE+16, 12*TILE+16, 12000);
  await walkTo(a, 6*TILE+16, 8*TILE+16); await walkTo(a, 6*TILE+16, 5*TILE+16);
  const aOnPad = await a.waitFor(() => Math.hypot(a.me().x - (6*TILE+16), a.me().y - (5*TILE+16)) <= 40, 4000);
  await sleep(2500); // A alone on the pad: the ruin must NOT open solo
  const noSoloOpen = !a.msgs.some(m => m.t === 'ruin-open') && a.state.ruinOpen === false;
  await walkTo(b, 27*TILE+16, 16*TILE+16);
  await walkTo(b, 33*TILE+16, 16*TILE+16); await walkTo(b, 33*TILE+16, 8*TILE+16, 12000);
  await walkTo(b, 34*TILE+16, 5*TILE+16);
  const opened = await a.waitFor(() => a.state.ruinOpen, 4000) && await b.waitFor(() => b.state.ruinOpen, 4000);
  const roMsg = a.lastOf('ruin-open');
  sys('ruins-coop', aOnPad && noSoloOpen && opened, `A-on-stone=${aOnPad} no-solo-open=${noSoloOpen} coop-open=${opened} msg="${roMsg?.message}"`);

  // ---- S14: fox presence + reaction (tight retargeting chase) ----
  let pet = null;
  for (let i = 0; i < 25 && !pet; i++) {
    const f = a.state.fox, me = a.me();
    if (!f || !me) break;
    const dx = f.x - me.x, dy = f.y - me.y, d = Math.hypot(dx, dy);
    if (d < 50) {
      a.send({ t: 'input', x: 0, y: 0 });
      a.send({ t: 'interact' });
      pet = await a.waitFor(() => a.msgs.some(m => m.t === 'pet'), 1200) ? a.lastOf('pet') : null;
      if (pet) break;
    } else {
      a.send({ t: 'input', x: dx/d, y: dy/d });
    }
    await sleep(300);
  }
  a.send({ t: 'input', x: 0, y: 0 });
  sys('fox', !!a.state.fox && !!pet, `present=${!!a.state.fox} pet-reaction=${!!pet} by=${pet?.by}`);

  // ---- S15: ending + play-again reset ----
  await walkTo(a, 6*TILE+16, 12*TILE+16); await walkTo(a, 13*TILE+16, 12*TILE+16, 12000);
  await walkTo(a, 19*TILE+16, 12*TILE+16, 12000); await walkTo(a, 19*TILE+16, 15*TILE+16, 12000);
  await walkTo(b, 33*TILE+16, 16*TILE+16, 15000); await walkTo(b, 21*TILE+16, 16*TILE+16, 12000);
  await walkTo(b, 21*TILE+16, 15*TILE+16, 12000);
  const ending = await a.waitFor(() => a.msgs.some(m => m.t === 'ending'), 5000) ? a.lastOf('ending') : null;
  a.send({ t: 'play-again' });
  const reset = await a.waitFor(() => a.msgs.some(m => m.t === 'reset'), 3000) ? a.lastOf('reset') : null;
  const resetOk = !!reset && reset.farm.every(f => f.stage === 'empty') && reset.ruin.open === false &&
    reset.candles === 0 && reset.garden.bloomed === false && reset.day.n === 1 &&
    Object.values(reset.day.rhythm).every(v => v === false);
  sys('ending-reset', !!ending && resetOk, `ending="${ending?.title}" reset-clears-world=${resetOk}`);

  // ---- S16: day/night phases advance ----
  const dn = new C('Day'); await dn.connect();
  dn.send({ t: 'join', name: 'Day', code: 'TIKVAH' });
  await dn.waitFor(() => dn.msgs.some(m => m.t === 'day'), 3000);
  const phases = new Set();
  const t0 = Date.now();
  while (Date.now() - t0 < 9000) { dn.msgs.filter(m => m.t === 'day').forEach(m => phases.add(m.phase)); await sleep(200); }
  const allPhases = ['morning', 'day', 'sunset', 'night'].every(p => phases.has(p));
  sys('day-night', allPhases, `phases seen: ${[...phases].join(', ')} (DAY_MS=6000)`);
  dn.close();

  // ---- S17: intro/onboarding hooks (static page) ----
  const r = await fetch(`${URL.replace('ws://', 'http://')}/`);
  const html = await r.text();
  const hooks = ['Welcome to Tikvah', 'tikvah_welcome_seen', 'tikvah_discover_seen', 'tikvah_hannah_seen', 'Meet your neighbor', 'id="prompt"'];
  const hooksOk = hooks.every(h => html.includes(h));
  sys('intro-hooks', r.status === 200 && hooksOk, `welcome/discover/hannah gates + contextual prompt present=${hooksOk}`);

  a.close(); b.close();
} finally {
  srv.kill();
}

const fails = results.filter(r => !r.pass);
console.log(`\n==== SYSTEM VERDICTS: ${results.length - fails.length}/${results.length} PASS ====`);
for (const f of fails) console.log(`  FAILED: ${f.name} — ${f.evidence}`);
process.exit(fails.length ? 1 : 0);
