// TIKVAH Scripture pool verification test.
// Asserts every pool verse matches its bolls.life-verified source text
// (test/fixtures/verse-api-responses.json), byte-identical after tag strip.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const strip = (t) => t.replace(/<S>\d+<\/S>/g, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

const pool = JSON.parse(readFileSync(path.join(__dirname, '../public/verses.json'), 'utf8'));
const raw = JSON.parse(readFileSync(path.join(__dirname, 'fixtures/verse-api-responses.json'), 'utf8'));

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name, detail); } };

ok('pool has verses', pool.length >= 40, `n=${pool.length}`);

// every pool verse matches its verified API response text
const byRef = new Map(raw.map(r => [r.ref, r.response.text]));
for (const v of pool) {
  const srcText = byRef.get(v.ref);
  ok(`verified: ${v.ref}`, typeof srcText === 'string' && strip(srcText) === v.text, `pool=${JSON.stringify(v.text.slice(0,40))}`);
  ok(`no markup: ${v.ref}`, !/<[^>]+>/.test(v.text) && !/&[a-z]+;/.test(v.text));
  ok(`shape: ${v.ref}`, typeof v.book === 'number' && typeof v.chapter === 'number' && typeof v.verse === 'number' && typeof v.category === 'string' && v.text.length > 10);
}

// unique refs
const refs = pool.map(v => v.ref);
ok('refs unique', new Set(refs).size === refs.length);

// the 3 core verses are in the pool
for (const core of ['Jeremiah 29:11', 'Psalms 23:1', 'John 8:12']) {
  ok(`core in pool: ${core}`, refs.includes(core));
}

// categories cover the approved spread
const cats = new Set(pool.map(v => v.category));
for (const c of ['promise','wisdom','guidance','comfort','courage','love','peace','light','gratitude','instruction']) {
  ok(`category: ${c}`, cats.has(c));
}

// daily index is deterministic and in-range
const dailyIdx = (now) => Math.floor(now / 86400000) % pool.length;
const i1 = dailyIdx(Date.now()), i2 = dailyIdx(Date.now());
ok('daily index deterministic', i1 === i2 && i1 >= 0 && i1 < pool.length);
// different days can yield different verses (pool larger than 1)
ok('daily index varies by day', new Set([0,1,2,3,4].map(d => dailyIdx(d * 86400000))).size > 1);

console.log(`verses-test: ${pass} passed, ${fail} failed (pool=${pool.length})`);
process.exit(fail ? 1 : 0);
