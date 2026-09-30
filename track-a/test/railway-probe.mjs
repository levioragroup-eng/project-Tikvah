// Live Railway probe: verifies the position-restore fix is deployed.
// Join production TIKVAH, walk east, drop, rejoin with same uuid.
// Fixed build -> position restored. Old build -> reset to spawn.
// Run: node test/railway-probe.mjs
import WebSocket from 'ws';
import { setTimeout as sleep } from 'timers/promises';

let agent;
if (process.env.https_proxy) {
  try {
    const { HttpsProxyAgent } = await import('https-proxy-agent');
    agent = new HttpsProxyAgent(process.env.https_proxy);
  } catch { /* direct connection */ }
}

const URL = 'wss://project-tikvah-production.up.railway.app';
const TILE = 32;
const SPAWN = { x: 13*TILE+16, y: 14*TILE+16 };
const UUID = 'railway-probe-' + Date.now().toString(36);

function connect() {
  return new Promise((res, rej) => {
    const ws = new WebSocket(URL, agent ? { agent } : undefined);
    ws.on('open', () => res(ws));
    ws.on('error', rej);
  });
}
function join(ws, name) {
  return new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('no joined')), 15000);
    ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.t === 'joined') { clearTimeout(to); resolve(m); }
    });
    ws.send(JSON.stringify({ t: 'join', name, code: 'TIKVAH', uuid: UUID }));
  });
}

const ws1 = await connect();
const j1 = await join(ws1, 'QAProbe');
console.log('joined at', Math.round(j1.you.x), Math.round(j1.you.y), '(spawn)');
ws1.send(JSON.stringify({ t: 'input', x: 1, y: 0 })); // walk east ~5 tiles
await sleep(1800);
ws1.send(JSON.stringify({ t: 'input', x: 0, y: 0 }));
await sleep(1200); // let the 20 Hz tick persist the identity record
ws1.close();
await sleep(1500); // let the server close-handler run

const ws2 = await connect();
const j2 = await join(ws2, 'QAProbe');
const dSpawn = Math.hypot(j2.you.x - SPAWN.x, j2.you.y - SPAWN.y);
console.log('rejoined at', Math.round(j2.you.x), Math.round(j2.you.y), '| dist from spawn:', Math.round(dSpawn), 'px');
console.log(dSpawn > 100 ? 'LIVE BUILD: FIXED (position restored)' : 'LIVE BUILD: OLD (reset to spawn)');
ws2.close();
process.exit(0);
