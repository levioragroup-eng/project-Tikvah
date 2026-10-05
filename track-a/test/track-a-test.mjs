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
const STONE_A = { x: 6*TILE+TILE/2, y: 5*TILE+TILE/2 };
const STONE_B = { x: 34*TILE+TILE/2, y: 5*TILE+TILE/2 };
const PLOT0 = { x: 6*TILE+TILE/2, y: 15*TILE+TILE/2 };
const DOCK = { x: 17*TILE+TILE/2, y: 20*TILE+TILE/2 };
const CHURCH_DOOR = { x: 30*TILE+TILE/2, y: 15*TILE+TILE/2 };

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
  cwd: ROOT, env: { ...process.env, PORT: String(PORT), CROP_GROW_MS: '1500', FISH_WAIT_MIN: '800', FISH_WAIT_MAX: '1200', FISH_CATCH_WINDOW: '3000', DAY_MS: '45000', REAP_MS: '500', RELIGHT_STEP_MS: '150', RUIN_HOLD_MS: '300' },
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
// ---------- Batch 5: title banner asset serving ----------
const rTitle = await fetch(`http://127.0.0.1:${PORT}/assets/title-bg.jpg`);
ok('GET /assets/title-bg.jpg returns 200', rTitle.status === 200);
const titleBytes = await rTitle.arrayBuffer();
ok('title-bg.jpg has a body', titleBytes.byteLength > 20000, String(titleBytes.byteLength));

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

// ---------- Visual pass: title + day/night + UI + animation + mobile + perf ----------
console.log('visual-pass title/day-night (static page):');
const vpChecks = [
  ['title living overlay canvas', 'id="titleFx"'],
  ['titleFx start hook', 'window.startTitleFx'],
  ['title growline brand line', 'A PLACE TO GROW, A STORY TO LIVE.'],
  ['title tagline kept', 'A World To Belong To'],
  ['title hope line', 'Hope Lives Here.'],
  ['title activity vocabulary', 'boardwords'],
  ['title pass marker', 'VISUAL-PASS-TITLE'],
  ['pink/violet sunset tint', 'g: 98,  b: 120'],
  ['night readability floor', 'a: 0.38'],
  ['dusk wash factor', 'duskF'],
  ['day lift factor', 'dayF'],
  ['moonlight wash', 'moonlight'],
  ['cached atmo gradients', 'buildAtmoGrads'],
  ['forest butterflies', 'two butterflies drifting over the forest'],
];
for (const [label, needle] of vpChecks) ok('page contains ' + label, pageHtml.includes(needle));

// ---------- Batch 1: board-palette art foundation (static page) ----------
console.log('batch1 art (static page):');
const artChecks = [
  ['board palette const', 'const BOARD_PALETTE'],
  ['grass green', '#4a8f3c'], ['grass dark', '#3a7230'], ['grass light', '#6ab04c'],
  ['water azure', '#2e9fd8'], ['water deep', '#1e7fc0'],
  ['sand tan', '#e0c088'], ['stone warm', '#b8a888'],
  ['blossom pink', '#f0a0c0'], ['blossom deep', '#e87aa0'],
  ['deep canopy', '#2f6b2f'],
  ['terracotta', '#b06030'], ['spire blue', '#5a7a9a'],
  ['ui navy', '#1a2340'], ['ui gold', '#d4a940'],
  ['grass painter', 'function grassTile(variant)'],
  ['grass variants', 'const grassA = grassTile(0), grassB = grassTile(1)'],
  ['path painter', 'const pathTile'], ['plaza painter', 'const plazaTile'],
  ['water painter', 'const waterTile'], ['sand painter', 'const sandTile'],
  ['bridge painter', 'const bridgeTile'],
  ['soil painter', 'const soilTile'], ['crop painters', 'const cropTiles'],
  ['stone painter', 'const stoneTile'], ['garden painter', 'const gardenTile'],
  ['bloom painter', 'const bloomTile'], ['fence painter', 'const fenceTile'],
  ['tree painter', 'function treeTile(v)'],
  ['tree alternates', 'const treeA = treeTile(0), treeB = treeTile(1)'],
  ['cherry blossom variant', 'treeBlossom = treeTile(2)'],
  ['tall pine variant', 'treeTallPine = treeTile(3)'],
  ['batch1 marker', 'BATCH1: board-palette terrain art'],
];
for (const [label, needle] of artChecks) ok('art contains ' + label, pageHtml.includes(needle));

// ---------- Batch 2: board-style buildings art (static page) ----------
console.log('batch2 buildings art (static page):');
const b2Checks = [
  ['church spire painter', 'const churchRoof'],
  ['spire blue-gray body', "g.fillStyle = P.spireBlue;"],
  ['cross atop spire', "g.fillRect(15,0,2,7); g.fillRect(12,2,8,2);"],
  ['church ashlar stone wall', 'const churchWall'],
  ['stained-glass blue pane', "'#4a8ad9'"],
  ['stained-glass gold pane', "'#e8b93c'"],
  ['stained-glass pink pane', "'#e87aa0'"],
  ['window arch panes', 'g.arc(16,10,6,Math.PI,0)'],  // batch4: taller lancet, repositioned
  ['terracotta house roof', 'const houseRoof'],
  ['house roof uses palette terracotta', 'g.fillStyle = P.roofTerracotta;'],
  ['timber-frame house wall', 'const houseWall'],
  ['house flower box', "const blooms=['#f0a0c0','#e05a4e','#ffffff','#e8b93c']"],
  ['night window halo', "'rgba(255,205,110,.25)'"],
  ['home plank door', 'const doorTileH'],
  ['church arched door', 'const doorMat'],
  ['cross above church door', "g.fillRect(15,0,2,6); g.fillRect(12,2,8,2);"],
  ['cafe roof painter', 'const cafeRoof'],
  ['cafe shop window', 'const cafeWall'],
  ['cafe counter painter', 'const counterTile'],
  ['cafe hanging cup sign', '// hanging sign'],
  ['cafe parasol table', 'const tableTile'],
  ['market stall painter fn', 'function stallTile(awning)'],
  ['pink stall awning', "stallTile('#e87aa0')"],
  ['blue stall awning', "stallTile('#5a8ac9')"],
  ['peaked stall canopy', '// peaked canopy'],
  ['stall bunting', '// bunting string'],
  ['tiered fountain', 'const fountainTile'],
  ['fountain upper tier', '// upper tier'],
  ['mossy carved ruin stone', 'const stoneTile'],
  ['carved golden grooves', '// carved grooves'],
  ['stoneGlow behavior kept', "g.fillStyle='rgba(255,230,120,0.55)'"],
  ['ruin pillar painter', 'const pillarTile'],
  ['waterfall painter (32x64)', 'const waterfallTile = px(32,64'],
  ['waterfall foam', '// foam bursts'],
  ['ruin arch gateway (64x64)', 'const ruinArch = px(64,64'],
  ['ruin arch dark opening', '// dark opening'],
  ['ruin arch broken crown', '// broken crown'],
  ['batch2 marker', 'BATCH2: board-style buildings art'],
  ['batch2 js marker', 'TIKVAH-BATCH2-BUILDINGS-ART'],
];
for (const [label, needle] of b2Checks) ok('art contains ' + label, pageHtml.includes(needle));

// ---------- Batch 3: board-style characters (static page) ----------
console.log('batch3 characters (static page):');
const b3Checks = [
  ['batch3 marker', 'BATCH3_CHARACTERS'],
  ['color mixer helper', 'function mixHex(a, b, t)'],
  ['lookSprite painter', 'function lookSprite(lk)'],
  ['lookSpriteF walk frames', 'function lookSpriteF(lk, fr)'],
  ['npcSprite painter', 'function npcSprite(name)'],
  ['spriteFor cache', 'function spriteFor(lk)'],
  ['spriteForF frame cache', 'function spriteForF(lk, fr)'],
  ['walk frame select', 'spriteForF(p.look, wfr)'],
  ['npc look Hannah', "Hannah: { skin:'#9a6540'"],
  ['npc look Elias', "Elias:  { skin:'#e0ac7e'"],
  ['npc look Miriam', "Miriam: { skin:'#f2c99a'"],
  ["hannah's apron", 'apron:true'],
  ['hannah dark wavy hair', "hairColor:'#241610'"],
  ['cream blouse base', 'cream blouse (board anchor)'],
  ['fabric folds', '// fabric folds (soft shading)'],
  ['outfit trim collar', 'g.fillRect(6,12,4,1); g.fillRect(4,16,8,1);'],
  ['anchor green default skirt', 'anchor green skirt'],
  ['skirt flare + hem', '// long modest A-line skirt'],
  ['brown boots', '// ===== legs + boots'],
  ['boot highlight', 'g.fillStyle = bootL;'],
  ['expressive eyes', '// expressive board eyes with shine'],
  ['eye shine', "// eye shine"],
  ['blush', '// blush'],
  ['smile', '// smile'],
  ['long hair falls', '// back hair behind the body (long wavy falls, board anchor)'],
  ['hair shine', '// shine on the falls'],
  ['curly afro volume', '// big round afro cloud'],
  ['bun ball', '// bun ball'],
  ['hair tie', '// hair tie'],
  ['straw hat', '// straw hat'],
  ['hair flower', '// hair flower with leaf'],
  ['storybook fox', 'PERFECTION-PASS fox'],
  ['fox fluffy tail', '// big fluffy tail: layered plume'],
  ['fox bright eye', '// big bright eye with shine'],
  ['fox cheek fluff', '// cheek fluff'],
  // look-shape contract locks (creator, server validLook, tests depend on these)
  ['skin enum intact', "skin: ['#f2c99a', '#e0ac7e', '#c68a5a', '#9a6540', '#6e452a']"],
  ['hair enum intact', "hair: ['long', 'short', 'curly', 'bun']"],
  ['hairColor enum intact', "hairColor: ['#2e1c10', '#4a2c14', '#8a5a2b', '#d9c08a', '#a34a2e']"],
  ['outfit enum intact', "outfit: ['#4a8ac9', '#c96a4a', '#6aa84f', '#9a6ac9', '#c9a44a']"],
  ['dress enum intact', 'dress: [false, true]'],
  ['accessory enum intact', "accessory: ['none', 'hat', 'flower']"],
  ['preview uses lookSprite', 'g.drawImage(lookSprite(look), 0, 0, 32, 48);'],
];
for (const [label, needle] of b3Checks) ok('art contains ' + label, pageHtml.includes(needle));

// ---------- Batch 4: board-style interiors (static page) ----------
console.log('batch4 interiors (static page):');
const b4Checks = [
  ['batch4 marker', 'BATCH4: board-style interiors'],
  ['church stone slab floor', 'warm stone slabs'],
  ['church floor grout', '// grout'],
  ['tall glowing lancet', 'glowing glass'],
  ['vaulted arch band', 'vaulted arch band'],
  ['lancet blue pane', '// blue pane'],
  ['lancet gold pane', '// gold pane'],
  ['lancet pink pane', '// pink pane'],
  ['pew kneeler', 'kneeler cushion'],
  ['pew backrest', '// backrest'],
  ['pew top rail', '// top rail'],
  ['altar white cloth', 'white cloth'],
  ['altar gold cross', 'gold cross'],
  ['altar lily vase', 'white lilies'],
  ['verse stand lectern', 'const lecternTile'],
  ['lectern open book', 'open book'],
  ['lectern cross', 'small gold cross'],
  ['wood plank floor', 'warm planks'],
  ['plank grain', '// grain'],
  ['plank butt joints', 'butt joint'],
  ['wainscot wall', 'wood wainscot'],
  ['chair rail', 'chair rail'],
  ['patchwork quilt', 'patchwork quilt'],
  ['quilt stitching', 'quilt stitching'],
  ['brick fireplace', 'brick surround'],
  ['firebox', '// firebox'],
  ['wooden mantel', 'wooden mantel'],
  ['wardrobe double doors', 'double doors'],
  ['wardrobe panels', 'recessed panels'],
  ['brass knobs', 'brass knobs'],
  ['table candle', '// candle'],
  ['chair cushion', '// cushion'],
  ['chair slats', '// slats'],
  ['nook gold cross', 'small gold cross on the wall'],
  ['nook books', '// books'],
  ['nook jar', '// jar'],
  ['braided rug', 'braided rug'],
  ['rug fringe', '// fringe'],
  ['rug shaded braid', 'shaded braid tone'],
  ['rug decor call site kept', 'rugTiles[homeRug % 4]'],
  ['curtained window painter', 'homeWindowTile'],
  ['window curtains', '// curtains'],
  ['window sky', 'sky through window'],
  ['window placed on wall', 'g.drawImage(homeWindowTile, x, y)'],
  ['wall shelf painter', 'homeShelfTile'],
  ['shelf books row', 'books row on lower shelf'],
  ['shelf jars', 'jars on upper shelf'],
  ['shelf placed on wall', 'g.drawImage(homeShelfTile, x, y)'],
  ['lamp light pool', 'warm light pool'],
  ['lamp warm shade', 'warm shade'],
  ['lamp glow hook kept', "drawGlow(g, x+16, y+10, 30, 'rgba(255,205,110,A)', now, 9)"],
  ['bed call site kept', 'g.drawImage(bedTile, x, y)'],
  ['nook call site kept', 'g.drawImage(nookTile, x, y)'],
  ['hearth call site kept', 'g.drawImage(hearthTile, x, y)'],
  ['wardrobe call site kept', 'g.drawImage(wardrobeTile, x, y)'],
  ['chair call site kept', 'g.drawImage(chairTile, x, y)'],
  ['table call site kept', 'g.drawImage(tableInTile, x, y)'],
  ['pew call site kept', 'g.drawImage(pewTile, x, y)'],
  ['altar call site kept', 'g.drawImage(altarTile, x, y)'],
  ['lectern call site kept', 'g.drawImage(lecternTile, x, y)'],
  ['church floor call site kept', 'g.drawImage(churchFloor, x, y)'],
  ['hearth flame anim kept', "g.fillStyle='#ff8a3c'"],
  ['hearth glow kept', "drawGlow(g, x+16, y+20, 44, 'rgba(255,150,60,A)', now, 5)"],
  ['pew rows with sit gaps', 'CH_PEW_SITS'],
  ['sermon lines ship in the page', 'SERMON_LINES'],
  ['pastor npc look defined', 'Pastor Nathan'],
  ['peace flash wash', 'peaceFlash'],
  ['day/night tint hook kept', 'tintCur'],
];
for (const [label, needle] of b4Checks) ok('art contains ' + label, pageHtml.includes(needle));

// ---------- Batch 5: board-idiom UI (static page) ----------
console.log('batch5 ui idiom (static page):');
const b5Checks = [
  ['batch5 marker', 'BATCH5: board-idiom UI'],
  ['batch5 js marker', 'TIKVAH-BATCH5-UI-IDIOM'],
  ['navy palette var', '--navy:#1a2340'],
  ['board gold palette var', '--gold-board:#d4a940'],
  ['cream board palette var', '--cream-board:#f5eeda'],
  ['title banner img element', 'id="titleBgImg"'],
  ['title banner asset ref', 'src="assets/title-bg.jpg"'],
  ['title scrim overlay', 'id="titleScrim"'],
  ['title canvas hidden by css', '#titleBg { display:none; }'],
  ['title canvas js hook kept', "getElementById('titleBg')"],
  ['startTitleBg hook kept', 'window.startTitleBg'],
  ['board footer flavor', 'LIVE. EXPLORE. CREATE. BELONG.'],
  ['jeremiah footer verse', 'Jeremiah 29:11 (KJV)'],
  ['board creator quote', 'You are more than what is behind you.'],
  ['gold Begin button', 'id="creatorOk">Begin'],
  ['panel navy card', '#panel .card { background:linear-gradient(#212c52, #1a2340)'],
  ['small-caps gold headings', 'font-variant:small-caps'],
  ['dialogue navy name tag', '#dialogue .who #dName'],
  ['dialogue heart row', '#dialogue .who .hearts'],
  ['hannah navy name tag', '#hannah .who'],
  ['toast navy/gold', '#toast { background:rgba(26,35,64,.95)'],
  ['verse parchment card', '#verse .card { background:linear-gradient(#fffdf6, #f6ecd4)'],
  ['quick-chat navy panel', '#qcPanel { background:#1a2340'],
  ['discovery navy panel', '#discover { background:linear-gradient(#212c52, #1a2340)'],
  ['prompt navy pill', '#prompt { background:rgba(26,35,64,.92)'],
  ['tutorial navy panel', '#tutorial { background:rgba(26,35,64,.9)'],
  ['creator parchment', '#f7f0dd'],
  ['hud chips navy', '#roomcode { background:rgba(26,35,64,.8)'],
  ['openPanel hook kept', 'function openPanel(title, sub, invHtml, buttons)'],
  ['showDialogue hook kept', 'function showDialogue(name, text, hearts, by)'],
  ['toast hook kept', 'function toast(msg)'],
  ['showVerse hook kept', 'function showVerse(ref, text)'],
  ['buildQcPanel hook kept', 'function buildQcPanel()'],
  ['buildCreator hook kept', 'function buildCreator()'],
  ['showPanel hook kept', 'function showPanel(id)'],
];
for (const [label, needle] of b5Checks) ok('ui contains ' + label, pageHtml.includes(needle));

// ---------- Batch 7: landmark set-pieces (static page) ----------
console.log('batch7 landmarks (static page):');
const b7Checks = [
  ['batch7 marker', 'BATCH7: landmark set-pieces'],
  ['tall steeple painter', 'const churchSteeple = px(64,96'],
  ['steeple belfry', '// belfry: arched openings glowing warm'],
  ['steeple gold cross', '// gold cross on top'],
  ['steeple drawn over church', 'drawImage(churchSteeple, 29*TILE, 6*TILE)'],
  ['church layout east', 'x0:28, y0:10, x1:32, y1:14'],
  ['waterfall layout reserved', 'const WATERFALLS = [{tx:3,ty:0},{tx:36,ty:0}]'],
  ['waterfall drawn post-loop', 'drawImage(waterfallTile, w.tx*TILE, w.ty*TILE)'],
  ['waterfall animation', '// BATCH7: animated falling streaks'],
  ['ruin arch layout', 'tx:31, ty:3'],
  ['ruin arch drawn', 'drawImage(ruinArch, RUIN_ARCH.tx*TILE, RUIN_ARCH.ty*TILE)'],
  ['ruin arch vines', '// BATCH7: hanging vines claim the arch'],
  ['blossom spots list', 'const BLOSSOM_SPOTS = [[15,17],[23,7],[12,7],[25,11],[21,7],[24,17],[14,19],[25,19],[9,6],[33,17]]'],
  ['blossom spot fn', 'function isBlossomSpot(tx,ty)'],
  ['blossom variant used', 'if (isBlossomSpot(tx,ty)) tv = treeBlossom'],
  ['blossom lush canopy', '// wide side puffs'],
  ['north forest band', 'if (ty >= 0 && ty <= 2 && tx >= 5 && tx <= 34'],
  ['forest groves', 'tx >= 8 && tx <= 11 && ty >= 2 && ty <= 4'],
  ['stone bridge painter', 'const bridgeTile'],
  ['bridge stone deck', 'VISUAL-PASS-CHURCH: stone arch bridge'],
  ['bridge parapets', '// parapets: raised stone rails'],
  ['bridge abutment ends', 'const bridgeEndN = bridgeEndTile(true)'],
  ['bridge lantern posts', '// lantern posts'],
  ['bridge ends drawn', 'ty===20 ? bridgeEndN : ty===25 ? bridgeEndS : bridgeTile'],
  ['church exterior wall', 'const churchWallEx'],
  ['church timber trim', '// timber trim band'],
  ['church flowers layout', 'const CHURCH_FLOWERS = '],
  ['church flower beds', 'const churchBedA = flowerBedTile(3'],
  ['river ripple overlays', 'const rippleTileA'],
  ['river foam edges', 'const shoreFoamN'],
  ['river bank dressing', 'const RIVER_BANK = new Map()'],
  ['dock planks', '// VISUAL-PASS-CHURCH: wooden fishing dock'],
  ['steeple night glow', '// VISUAL-PASS-CHURCH: belfry lamplight glows warm at night'],
  ['tiered fountain', 'const fountainTile'],
  ['fountain stone basin', '// wide stone basin'],
  ['fountain upper tier kept', '// upper tier'],
  ['fountain drawn', 'drawImage(fountainTile, x, y)'],
];
for (const [label, needle] of b7Checks) ok('art contains ' + label, pageHtml.includes(needle));

// ---------- Beauty pass: lighting / particles / animation / UI / staging ----------
console.log('beauty pass (static page):');
const beautyChecks = [
  ['css palette variables', '--gold:'],
  ['unified card rise animation', 'cardRise'],
  ['toast entrance', 'toastIn'],
  ['ending star twinkle', 'twinkle'],
  ['hannah card glow', 'hannahGlow'],
  ['flickering warm halo', 'warmHalo'],
  ['sermon ambient lines', 'SERMON_LINES'],
  ['warm interior wash', 'interiorGlow'],
  ['golden dawn/dusk wash', 'goldF'],
  ['denser fireflies constant', 'NIGHT_FLIES = 40'],
  ['falling leaves', 'leaves'],
  ['water shimmer', 'shimmer'],
  ['dust motes helper', 'drawDust'],
  ['shared glow helper', 'drawGlow'],
  ['stride walk cycle', 'stridePhase'],
  ['idle sway', 'idleSway'],
  ['smoothed fox motion', 'foxSm'],
  ['window glows at night', 'WINDOW_GLOWS'],
  ['garden petal drift', 'petals drift'],
  ['fountain sparkle', 'fountainSparkle'],
  ['hannah camera framing', 'hannahFocusT'],
  ['hannah spotlight', 'hannahGreetUntil'],
];
for (const [label, needle] of beautyChecks) ok('page contains ' + label, pageHtml.includes(needle));

// ---------- Visual pass: farm + home toward the design board (static page) ----------
console.log('visual-pass farm+home (static page):');
const fhChecks = [
  ['farmhome marker', 'VISUAL-PASS-FARMHOME'],
  ['farm palette soils', "soilRich:'#3a2412'"],
  ['wet soil painter', 'const wetSoilTile'],
  ['wet soil sheen', 'damp sheen'],
  ['droplet sparkles', 'droplet sparkles'],
  ['soil painter kept', 'const soilTile'],
  ['crop painters kept', 'const cropTiles'],
  ['seedling rows stage', 'seedling rows'],
  ['lush sprouts stage', 'lush sprouts'],
  ['mature wheat stage', 'mature golden wheat'],
  ['watered stages use wet soil', 'g.drawImage(wetSoilTile,0,0)'],
  ['fence painter kept', 'const fenceTile'],
  ['fence stone feet', 'stone feet'],
  ['farm border blooms layout', 'const FARM_BORDER_BLOOMS'],
  ['farm border bloom painter', 'function farmBloomTile(variant)'],
  ['watering can prop', 'const wateringCanTile'],
  ['farm grass edge map', 'const FARM_EDGE = new Map()'],
  ['home chimney overlay', 'const houseChimney'],
  ['chimney on roof', 'g.drawImage(houseChimney, x, y)'],
  ['home roof painter kept', 'const houseRoof'],
  ['home wall painter kept', 'const houseWall'],
  ['home wall shutters', 'shutters'],
  ['home wall stone foundation', 'stone foundation'],
  ['home garden beds layout', 'const HOME_GARDEN_BEDS'],
  ['home garden bed painter', 'function homeBedTile(variant)'],
  ['home garden plants', 'const HOME_GARDEN_PLANTS'],
  ['bed placed', 'g.drawImage(hb === 0 ? homeBedA : homeBedB, x, y)'],
  ['front windows glow at night', 'front windows glow warm at night'],
  ['plant pot painters', 'function plantPotTile(variant)'],
  ['kitchen counter painter', 'const kitchenCounterTile'],
  ['storage crate painter', 'const crateTile'],
  ['bookshelf painter', 'const bookcaseTile'],
  ['plant placed', 'g.drawImage(plantPotTall, x, y)'],
  ['kitchen placed', 'g.drawImage(kitchenCounterTile, x, y)'],
  ['crate placed', 'g.drawImage(crateTile, x, y)'],
  ['bookshelf placed', 'g.drawImage(bookcaseTile, x, y)'],
  ['wood floor painter kept', 'warm planks'],
  ['bed painter kept', 'patchwork quilt'],
];
for (const [label, needle] of fhChecks) ok('farmhome contains ' + label, pageHtml.includes(needle));

// ---------- Visual pass: forest + ruins toward the design board (static page) ----------
console.log('visual-pass forest+ruins (static page):');
const frChecks = [
  ['forest marker', 'VISUAL-PASS-FOREST'],
  ['ruins marker', 'VISUAL-PASS-RUINS'],
  ['ancient tree variant', 'treeAncient = treeTile(4)'],
  ['birch tree variant', 'treeBirch = treeTile(5)'],
  ['ancient canopy light shafts', 'light filtering through'],
  ['forest mix deterministic', 'const fh = hash2(tx, ty)'],
  ['forest light painter A', 'const forestLightA'],
  ['forest light painter B', 'const forestLightB'],
  ['forest litter painter', 'const forestLitter'],
  ['forest rock painter', 'const forestRock'],
  ['forest mushroom painter', 'const forestShroom'],
  ['forest light layout', 'const FOREST_LIGHT = new Map()'],
  ['forest litter layout', 'FOREST_LITTER = new Map()'],
  ['forest floor overlays drawn', 'dappled light shafts, leaf litter, rocks, mushrooms'],
  ['mushrooms by trees', 'mushrooms nestle by trees'],
  ['forest pollen motes', 'const forestPollen'],
  ['forest pollen drawn', 'drawForestPollen(g, now, night)'],
  ['fireflies at night', '// fireflies'],
  ['stone painter kept', 'const stoneTile'],
  ['stoneGlow behavior kept', "g.fillStyle='rgba(255,230,120,0.55)'"],
  ['restored stone painter', 'const stoneRestored'],
  ['state-addressable stone', 'function paintRuinStone(state)'],
  ['state-addressable pad', 'function paintRuinPad(state)'],
  ['dormant default', "// dormant = as today"],
  ['pad draws via painter', "paintRuinPad(ruinOpen ? 'lit' : 'dormant')"],
  ['pillar painter kept', 'const pillarTile'],
  ['pillar weathered', 'hanging vine'],
  ['arch painter kept', 'const ruinArch = px(64,64'],
  ['arch vines kept', '// BATCH7: hanging vines claim the arch'],
  ['arch carved detail', 'carved grooves'],
  ['arch mysterious light', 'soft mysterious'],
  ['arch glow drawn', "RUIN_ARCH.tx*TILE+32, RUIN_ARCH.ty*TILE+32"],
  ['NE waterfall mist', 'w.tx === 36'],
  ['waterfall layout kept', 'const WATERFALLS = [{tx:3,ty:0},{tx:36,ty:0}]'],
  ['ruin arch layout kept', 'tx:31, ty:3'],
];
for (const [label, needle] of frChecks) ok('forestruins contains ' + label, pageHtml.includes(needle));

// ---------- Visual pass: garden of hope toward the design board (static page) ----------
console.log('visual-pass garden (static page):');
const gChecks = [
  ['garden marker', 'VISUAL-PASS-GARDEN'],
  ['state-addressable garden bed', 'function gardenBed(state, variant, sway)'],
  ['dormant state', "'dormant' (quiet, waiting)"],
  ['waking state', "'waking' (first green"],
  ['blooming state', "'blooming' (the extraordinary full"],
  ['dormant const kept', 'const gardenTile  = gardenBed('],
  ['bloom const kept', 'const bloomTile   = gardenBed('],
  ['sway frames', 'const bloomTileS  = gardenBed('],
  ['tall spire blooms', 'lupine/delphinium spires'],
  ['layered bloom rows', 'front row: low blossoms'],
  ['bloom sway clock', 'now/650'],
  ['garden path painter', 'function gardenPathTile(state)'],
  ['garden hedge painter', 'function gardenEdgeTile(state)'],
  ['garden seat painter', 'function gardenSeatTile(state)'],
  ['garden arch painter', 'function gardenArchTile(state, side)'],
  ['north gate arch drawn', "gardenArchB[tx===18?0:1]"],
  ['mountain vista strip', 'distant mountains beyond the north gate'],
  ['fountain shimmer', "living-water shimmer"],
  ['garden pollen', "golden pollen over the blooms"],
  ['god-rays', 'soft warm god-rays'],
  ['butterflies', 'Lissajous flight over the blooms'],
  ['garden region kept', 'tx>=17 && tx<=22 && ty>=13 && ty<=17'],
  ['fountain tile excluded', '!(tx===FOUNTAIN.tx&&ty===FOUNTAIN.ty)'],
];
for (const [label, needle] of gChecks) ok('garden contains ' + label, pageHtml.includes(needle));

// ---------- RESTORE THE LIGHT M5: closing card + bigger-world vista (static page) ----------
console.log('restore-the-light M5 closing card (static page):');
const m5Checks = [
  ['closing vista canvas', 'id="vistaCv"'],
  ['vista painter', 'function drawVistaBack()'],
  ['vista painted at ending', 'drawVistaBack();   // RESTORE THE LIGHT M5'],
  ['vista dawn sky', 'dawn sky over the larger world'],
  ['vista far mountains', 'far mountains, snow still on them'],
  ['vista distant islands', 'the sea, with distant islands'],
  ['vista deeper forest', 'deeper forest (left): dark conifer ranks'],
  ['vista desert dunes', 'desert (right): amber dunes'],
  ['vista ancient city', 'the ancient city on the far shore'],
  ['vista coastal kingdom', 'the coastal kingdom: a little castle on the headland'],
  ['closing eyebrow', 'THE GARDEN OF HOPE'],
  ['closing line 1 (TIKVAH grows)', 'TIKVAH <span>— A place to grow.</span>'],
  ['closing line 2 (story)', 'A story to live.'],
  ['closing line 3 (paths/purpose)', 'Different paths. Same Purpose.'],
  ['closing line 4 (beginning)', 'This is only the beginning.'],
  ['closing line 5 (world continues)', 'THE WORLD CONTINUES…'],
  ['closing card dismiss button', 'id="btnContinue"'],
  ['closing keep playing', 'Keep Playing'],
  ['closing play again kept', 'id="btnAgain"'],
  ['north-gate islands (M5)', 'distant islands on the water beyond the north gate'],
];
for (const [label, needle] of m5Checks) ok('closing contains ' + label, pageHtml.includes(needle));

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
// walkToNear: tighter landing tolerance for tight interior geometry
// (church pray spot vs pew sit gaps).
async function walkToNear(c, tx, ty, tol, timeoutMs = 12000) {
  const t0 = Date.now();
  c.send({ t: 'input', x: 0, y: 0 });
  while (Date.now() - t0 < timeoutMs) {
    const me = c.me();
    if (!me) { await sleep(100); continue; }
    const dx = tx - me.x, dy = ty - me.y, d = Math.hypot(dx, dy);
    if (d < tol) { c.send({ t: 'input', x: 0, y: 0 }); return true; }
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
  const SPAWN_X = 13*TILE+16, SPAWN_Y = 14*TILE+16; // west lane just east of home
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
  ok('walk south down the west lane', await walkTo(a, 13*TILE+16, 18*TILE+16, 12000));
  ok('walk east on the south lane', await walkTo(a, 20*TILE+16, 18*TILE+16, 12000));
  ok('walk south to the bridge', await walkTo(a, 20*TILE+16, 20*TILE+16, 8000));
  ok('step onto the stone bridge', await walkTo(a, 20*TILE+16, 23*TILE+16, 8000));
  const waterPush = await walkTo(a, 17*TILE+16, 23*TILE+16, 3500);
  ok('river is solid (cannot leave the bridge into water)', waterPush === false && a.me().x > 19*TILE, `x=${a.me()?.x?.toFixed(0)}`);
  ok('cross to the south bank', await walkTo(a, 20*TILE+16, 26*TILE+16, 8000));
  ok('walk back north across the bridge', await walkTo(a, 20*TILE+16, 18*TILE+16, 12000));
  ok('walk west to the lone tree', await walkTo(a, 14*TILE+16, 18*TILE+16, 8000));
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
  // the blocking tree is at (14,19) (y 608..640): the player must be stopped by
  // it, i.e. never reach the sand south of it.
  ok('trees are solid', treePush === false && a.me().y < 20*TILE, `y=${a.me()?.y?.toFixed(0)}`);
  ok('walk west to the west lane', await walkTo(a, 13*TILE+16, 18*TILE+16, 8000));
  ok('walk north up the west lane', await walkTo(a, 13*TILE+16, 14*TILE+16, 8000));
  ok('walk north to the market lane', await walkTo(a, 13*TILE+16, 12*TILE+16, 8000));
  ok('walk west on the market lane', await walkTo(a, 8*TILE+16, 12*TILE+16, 8000));
  ok('walk south to the farm gate', await walkTo(a, 8*TILE+16, 14*TILE+16, 8000));
  ok('walk south into the farm', await walkTo(a, 8*TILE+16, 16*TILE+16, 8000));
  const fencePush = await walkTo(a, 13*TILE+16, 16*TILE+16, 3500);
  ok('farm fences are solid', fencePush === false && a.me().x < 11*TILE, `x=${a.me()?.x?.toFixed(0)}`);

  // ---------- 3. out-of-range interaction rejected ----------
  console.log('interaction validation:');
  await walkTo(a, 8*TILE+16, 14*TILE+16); // exit via the north gate
  await walkTo(a, 8*TILE+16, 12*TILE+16); // north to the market lane
  await walkTo(a, 13*TILE+16, 12*TILE+16); // east to the west lane
  await walkTo(a, 13*TILE+16, 18*TILE+16); // south down the lane
  await walkTo(a, 19*TILE+16, 18*TILE+16); // east on the south lane, far from the farm
  const farmBefore = JSON.stringify(a.state.farm);
  a.send({ t: 'interact' });
  await sleep(400);
  // far from the farm: no farm action may fire (fox/villager harmlessly allowed)
  ok('out-of-range interact rejected', JSON.stringify(a.state.farm) === farmBefore);

  // ---------- 4. farm cycle (plant -> water -> grow -> harvest) ----------
  console.log('farm:');
  ok('walk back to the west lane', await walkTo(a, 13*TILE+16, 18*TILE+16, 12000));
  ok('walk north to the market lane', await walkTo(a, 13*TILE+16, 12*TILE+16, 12000));
  ok('walk west on the market lane', await walkTo(a, 8*TILE+16, 12*TILE+16, 8000));
  ok('walk south to the farm gate', await walkTo(a, 8*TILE+16, 14*TILE+16, 8000));
  ok('walk south into the farm', await walkTo(a, 8*TILE+16, 16*TILE+16, 8000));
  ok('walk to plot', await walkTo(a, PLOT0.x, PLOT0.y, 8000));
  a.send({ t: 'interact' }); // plant
  ok('plant -> planted', await a.waitFor(() => a.state.farm[0]?.stage === 'planted', 2000), JSON.stringify(a.state.farm[0]));
  a.send({ t: 'interact' }); // water
  ok('water -> growing', await a.waitFor(() => a.state.farm[0]?.stage === 'growing', 2000));
  ok('grows -> ready (shared state)', await b.waitFor(() => b.state.farm[0]?.stage === 'ready', 6000), 'other client sees ready crop');
  a.send({ t: 'interact' }); // harvest
  ok('harvest -> empty + broadcast', await b.waitFor(() => b.state.farm[0]?.stage === 'empty' && b.msgs.some(m => m.t === 'harvest'), 3000));

  // ---------- 5. fishing (cast -> bite -> catch) ----------
  console.log('fishing:');
  // B starts at the new spawn (west lane); route via the south lane to the dock.
  // The dock sits on the sand bank above the river; the bridge is just east.
  ok('B walks south down the west lane', await walkTo(b, 13*TILE+16, 18*TILE+16, 12000));
  ok('B walks east on the south lane', await walkTo(b, 17*TILE+16, 18*TILE+16, 8000));
  ok('walk to dock', await walkTo(b, DOCK.x, DOCK.y, 8000));
  b.send({ t: 'interact' }); // cast
  ok('cast accepted', await b.waitFor(() => b.me()?.fishing === 'cast', 2000));
  ok('bite event fires', await b.waitFor(() => b.msgs.some(m => m.t === 'bite'), 5000));
  b.send({ t: 'interact' }); // catch within window
  ok('catch within window -> catch event', await a.waitFor(() => a.msgs.some(m => m.t === 'catch'), 3000));

  // ---------- 6. church: enter, pray, read verse, exit ----------
  console.log('church:');
  ok('A exits the farm via the north gate', await walkTo(a, 8*TILE+16, 14*TILE+16, 12000));
  ok('A walks north to the market lane', await walkTo(a, 8*TILE+16, 12*TILE+16, 8000));
  ok('walk east on the market lane', await walkTo(a, 13*TILE+16, 12*TILE+16, 8000));
  ok('walk east on the market lane to the east lane', await walkTo(a, 27*TILE+16, 12*TILE+16, 15000));
  ok('walk south down the east lane', await walkTo(a, 27*TILE+16, 15*TILE+16, 8000));
  ok('walk to church door', await walkTo(a, CHURCH_DOOR.x, CHURCH_DOOR.y + 8, 8000));
  a.send({ t: 'interact' }); // enter
  ok('enter church interior', await a.waitFor(() => a.me()?.inside === true, 2000));
  // collision inside the church: interior walls + pews
  ok('walk to the west aisle', await walkTo(a, 15*TILE+16, 24*TILE+16, 8000));
  const wallPushIn = await walkTo(a, 15*TILE+16, 10*TILE+16, 3500);
  ok('church interior walls hold', wallPushIn === false && a.me().y >= 18*TILE - 1, `y=${a.me()?.y?.toFixed(0)}`);
  ok('walk north of the pew', await walkTo(a, 17*TILE+16, 20*TILE+16, 8000));
  const pewPush = await walkTo(a, 17*TILE+16, 22*TILE+16, 3500);
  ok('pews are solid', pewPush === false && a.me().y < 21*TILE + 8, `y=${a.me()?.y?.toFixed(0)}`);
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
  // route via the plaza: a straight line from the cafe clips the cafe wall
  await walkTo(a, 21*TILE+16, 17*TILE+16, 8000);
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
  const PLOT1 = { x: 10*TILE+16, y: 15*TILE+16 };   // FARM_PLOTS[2]
  ok('B walks north to the south lane', await walkTo(b, 17*TILE+16, 18*TILE+16, 8000));
  ok('B walks west to the west lane', await walkTo(b, 13*TILE+16, 18*TILE+16, 8000));
  ok('B walks north to the market lane', await walkTo(b, 13*TILE+16, 12*TILE+16, 12000));
  ok('B walks west on the market lane', await walkTo(b, 8*TILE+16, 12*TILE+16, 8000));
  ok('B walks south to the farm gate', await walkTo(b, 8*TILE+16, 14*TILE+16, 8000));
  ok('B walks south into the farm', await walkTo(b, 8*TILE+16, 16*TILE+16, 8000));
  ok('B walks to plot 2', await walkTo(b, PLOT1.x, PLOT1.y, 8000));
  b.send({ t: 'interact' }); // plant
  ok('B plants', await b.waitFor(() => b.state.farm[2]?.stage === 'planted', 2000));
  b.send({ t: 'interact' }); // water
  ok('B waters', await b.waitFor(() => b.state.farm[2]?.stage === 'growing', 2000));
  ok('B crop grows', await b.waitFor(() => b.state.farm[2]?.stage === 'ready', 8000));
  b.send({ t: 'interact' }); // harvest -> produce
  ok('B harvests produce', await b.waitFor(() => b.me()?.inv?.produce >= 1, 3000));
  const CAFE = { x: 15*TILE+16, y: 16*TILE+16 };
  ok('B exits the farm', await walkTo(b, 8*TILE+16, 14*TILE+16, 8000));
  ok('B walks north to the market lane', await walkTo(b, 8*TILE+16, 12*TILE+16, 8000));
  ok('B walks east on the market lane', await walkTo(b, 13*TILE+16, 12*TILE+16, 8000));
  ok('B walks east to the east lane', await walkTo(b, 27*TILE+16, 12*TILE+16, 12000));
  ok('B walks south down the east lane', await walkTo(b, 27*TILE+16, 16*TILE+16, 8000));
  ok('B walks to cafe counter', await walkTo(b, CAFE.x, CAFE.y, 8000));
  b.send({ t: 'interact' }); // -> cook menu offered
  ok('cook menu offered near cafe', await b.waitFor(() => b.msgs.some(m => m.t === 'menu' && m.kind === 'cook'), 2000));
  b.send({ t: 'cook', action: 'cook' });
  const cooked = await b.waitFor(() => b.msgs.some(m => m.t === 'cooked'), 2000) ? b.lastOf('cooked') : null;
  ok('cook turns produce+fish into a meal', !!cooked && b.me()?.inv?.meals === 1, cooked?.meal);
  ok('cooking counts toward the day rhythm', await b.waitFor(() => b.lastOf('day')?.rhythm?.cook === true, 3000));
  ok('A walks southwest to the east lane', await walkTo(a, 27*TILE+16, 16*TILE+16, 8000));
  ok('A walks to cafe', await walkTo(a, CAFE.x, CAFE.y + 32, 8000));
  b.send({ t: 'cook', action: 'give' });
  const gift = await a.waitFor(() => a.msgs.some(m => m.t === 'gift'), 3000) ? a.lastOf('gift') : null;
  ok('give shares the meal with the nearby player', !!gift && gift.from === 'Friend' && gift.to === 'Ariel', JSON.stringify(gift));
  ok('A received the meal', await a.waitFor(() => a.me()?.inv?.meals === 1, 2000));

  // ---------- 6c2. meal gifts never cross walls (STORY-FIX G9) ----------
  // A carries the meal inside the home (hearth = cook spot); B waits out in
  // the world ~90px away, through the wall — inside B's old gift radius.
  // The fix: the wall holds — no gift, the meal is kept, nobody-nearby.
  console.log('give (walls):');
  ok('B walks east below the church', await walkTo(b, 33*TILE+16, 16*TILE+16, 12000));
  ok('A walks west on the market lane', await walkTo(a, 13*TILE+16, 12*TILE+16, 12000));
  ok('A walks west to the home door', await walkTo(a, 8*TILE+16, 12*TILE+16, 8000));
  a.send({ t: 'interact' }); // enter home
  ok('A enters home', await a.waitFor(() => a.me()?.inside === true && a.me()?.place === 'home', 2000));
  ok('A walks to the hearth', await walkTo(a, 35*TILE+16, 18*TILE+16, 8000));
  const mealsA = a.me()?.inv?.meals || 0, mealsB = b.me()?.inv?.meals || 0;
  const giftsToB = b.msgs.filter(m => m.t === 'gift' && m.to === 'Friend').length;
  a.send({ t: 'cook', action: 'give' });
  ok('give from inside reports nobody nearby (villagers are outside)', await a.waitFor(() => a.msgs.some(m => m.t === 'cook-fail' && m.reason === 'nobody-nearby'), 2000));
  await sleep(800);
  ok('no meal crosses the wall to the player outside', b.msgs.filter(m => m.t === 'gift' && m.to === 'Friend').length === giftsToB);
  ok('giver keeps the meal', mealsA === 1 && (a.me()?.inv?.meals || 0) === 1, 'A meals=' + a.me()?.inv?.meals);
  ok('player outside keeps their inventory', (b.me()?.inv?.meals || 0) === mealsB, 'B meals=' + b.me()?.inv?.meals);
  ok('A walks to the home exit', await walkTo(a, 32*TILE+16, 24*TILE+16, 8000));
  a.send({ t: 'interact' }); // exit home
  ok('A exits home', await a.waitFor(() => a.me()?.inside === false, 2000));
  // leave the world as 6c left it: A back near the cafe for the 6d worship walk
  ok('A walks east on the market lane', await walkTo(a, 13*TILE+16, 12*TILE+16, 12000));
  ok('A walks east to the east lane', await walkTo(a, 27*TILE+16, 12*TILE+16, 12000));
  ok('A walks south down the east lane', await walkTo(a, 27*TILE+16, 16*TILE+16, 8000));
  ok('A walks west to the cafe', await walkTo(a, CAFE.x, CAFE.y + 32, 8000));

  // ---------- 6d. church worship + pew sit -> garden blooms ----------
  // CHURCH-REDESIGN (2026-10-03): the candle stand is gone. Sincere prayer at
  // the altar is the worship moment; sitting in a pew is the new pew verb.
  console.log('worship & pews:');
  ok('A walks back to church door', await walkTo(a, CHURCH_DOOR.x, CHURCH_DOOR.y + 8, 15000));
  a.send({ t: 'interact' }); // enter
  ok('re-enter church', await a.waitFor(() => a.me()?.inside === true, 2000));
  ok('A walks down the center aisle', await walkTo(a, 20*TILE+16, 22*TILE+16));
  ok('A steps into a pew sit gap', await walkToNear(a, 21*TILE+16, 23*TILE+16, 12));
  a.send({ t: 'interact' }); // sit in the pew
  ok('sitting in the pew shows for B', await b.waitFor(() => b.state.players.get(a.state.you.id)?.emote === 'sit', 3000));
  ok('A kneels before the altar', await walkToNear(a, 20*TILE+16, 20*TILE+16+16, 10));
  a.send({ t: 'interact' }); // pray -> worship moment (no candles needed)
  ok('worship moment fires for both', await b.waitFor(() => b.msgs.some(m => m.t === 'worship'), 3000));
  ok('worship completes the day rhythm', await a.waitFor(() => a.lastOf('day')?.rhythm?.sermon === true, 3000));
  // rhythm now complete: farm (4), fish (5), cook (6c), greet (6b), worship (6d)
  ok('garden blooms when the day rhythm is complete (A)', await a.waitFor(() => a.msgs.some(m => m.t === 'garden-bloom'), 4000));
  ok('garden blooms when the day rhythm is complete (B)', await b.waitFor(() => b.msgs.some(m => m.t === 'garden-bloom'), 4000));
  const bloom = a.lastOf('garden-bloom');
  ok('bloom message is warm, not preachy', !!bloom && /bloom/i.test(bloom.message) && !/repent|sin|hell/i.test(bloom.message), bloom?.message);

  // ---------- 6e. home interior: enter, bed (furniture), decorate, wardrobe, exit ----------
  console.log('home:');
  ok('walk to church exit', await walkTo(a, 20*TILE+16, 24*TILE+16));
  a.send({ t: 'interact' });
  ok('exit church', await a.waitFor(() => a.me()?.inside === false, 2000));
  const HOME_DOOR = { x: 8*TILE+16, y: 12*TILE+16 };
  ok('walk west on the south lane', await walkTo(a, 13*TILE+16, 18*TILE+16, 12000));
  ok('walk north up the west lane to the market lane', await walkTo(a, 13*TILE+16, 12*TILE+16, 8000));
  ok('walk west to the home door', await walkTo(a, HOME_DOOR.x, HOME_DOOR.y, 8000));
  a.send({ t: 'interact' }); // enter home
  ok('enter home interior', await a.waitFor(() => a.me()?.inside === true && a.me()?.place === 'home', 2000));
  const wallPushHome = await walkTo(a, 32*TILE+16, 10*TILE+16, 3500);
  ok('home interior walls hold', wallPushHome === false && a.me().y >= 18*TILE - 1, `y=${a.me()?.y?.toFixed(0)}`);
  const BED = { x: 29*TILE+16, y: 18*TILE+16 };
  ok('walk to bed', await walkTo(a, BED.x, BED.y));
  const dayBefore = a.lastOf('day')?.n || 1;
  a.send({ t: 'interact' }); // bed is furniture now — no sleep action
  await new Promise(r => setTimeout(r, 800));
  ok('bed does nothing (no sleep action)', !a.msgs.some(m => m.t === 'slept'), 'no slept msg');
  ok('bed does not advance the day', (a.lastOf('day')?.n || 1) === dayBefore, 'day=' + a.lastOf('day')?.n);
  // Ariel (2026-10-04): days roll over on their own clock (DAY_MS=45000 in test env)
  ok('day rolls over on its own clock (A)', await a.waitFor(() => (a.lastOf('day')?.n || 0) > dayBefore, 60000));
  ok('day rolls over on its own clock (B)', await b.waitFor(() => (b.lastOf('day')?.n || 0) > dayBefore, 60000));
  ok('rollover does NOT wipe the day rhythm (A)', (a.lastOf('day')?.rhythm && Object.values(a.lastOf('day').rhythm).every(v => v === true)) === true, JSON.stringify(a.lastOf('day')?.rhythm));
  ok('rollover does NOT wipe the day rhythm (B)', (b.lastOf('day')?.rhythm && Object.values(b.lastOf('day').rhythm).every(v => v === true)) === true, JSON.stringify(b.lastOf('day')?.rhythm));
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

  // ---------- 6f. WEEKLY SERMON: pastor preaches, congregation gathers ----------
  // CHURCH-REDESIGN (2026-10-03): day 1 is a sermon day; from morning till
  // afternoon the pastor takes the pulpit and the villagers sit in the pews.
  // A traveler sitting through it is gently acknowledged — synced to everyone.
  console.log('weekly sermon:');
  const w1 = new C('Worshiper'); await w1.connect();
  w1.send({ t: 'create', name: 'Worshiper' });
  ok('sermon room created', await w1.waitFor(() => !!w1.state.code, 3000));
  ok('day 1 is a sermon day (synced flag)', await w1.waitFor(() => w1.lastOf('day')?.sermon === true, 5000),
     'sermon=' + w1.lastOf('day')?.sermon + ' phase=' + w1.lastOf('day')?.phase);
  const nearTile = (n, tx, ty) => n && Math.abs(n.x - (tx*TILE+16)) < 40 && Math.abs(n.y - (ty*TILE+16)) < 40;
  ok('pastor takes the pulpit', await w1.waitFor(() => nearTile(w1.state.npcs.get('Pastor Nathan'), 20, 19), 15000));
  ok('Hannah sits in a pew', await w1.waitFor(() => nearTile(w1.state.npcs.get('Hannah'), 19, 21), 15000));
  ok('Elias sits in a pew', await w1.waitFor(() => nearTile(w1.state.npcs.get('Elias'), 21, 21), 15000));
  ok('Miriam sits in a pew', await w1.waitFor(() => nearTile(w1.state.npcs.get('Miriam'), 19, 23), 15000));
  ok('W walks north to the market lane', await walkTo(w1, 13*TILE+16, 12*TILE+16, 8000));
  ok('W walks east to the east lane', await walkTo(w1, 27*TILE+16, 12*TILE+16, 15000));
  ok('W walks south down the east lane', await walkTo(w1, 27*TILE+16, 15*TILE+16, 8000));
  ok('W walks to the church door', await walkTo(w1, CHURCH_DOOR.x, CHURCH_DOOR.y + 8, 8000));
  w1.send({ t: 'interact' });
  ok('W enters the church', await w1.waitFor(() => w1.me()?.inside === true, 2000));
  ok('W walks down the center aisle', await walkTo(w1, 20*TILE+16, 22*TILE+16));
  ok('W sits in a free pew', await walkToNear(w1, 21*TILE+16, 23*TILE+16, 12));
  w1.send({ t: 'interact' });
  ok('sermon attendance brings peace (shared beat)', await w1.waitFor(() => w1.msgs.some(m => m.t === 'sermon-peace'), 3000));
  ok('sermon attendance counts toward the day rhythm', await w1.waitFor(() => w1.lastOf('day')?.rhythm?.sermon === true, 3000));
  ok('sermon-peace fires once per sermon', await sleep(600).then(() => w1.msgs.filter(m => m.t === 'sermon-peace').length === 1),
     'count=' + w1.msgs.filter(m => m.t === 'sermon-peace').length);
  ok('page carries the sermon lines', pageHtml.includes('SERMON_LINES') && pageHtml.includes('Pastor Nathan: '));
  w1.close();

  // ---------- 7. SIGNATURE: ruin opens when both stand on stones ----------
  console.log('ruin:');
  ok('A walks west on the market lane', await walkTo(a, 6*TILE+16, 12*TILE+16, 8000));
  ok('A walks north to the forest', await walkTo(a, 6*TILE+16, 8*TILE+16, 8000));
  ok('A walks to stone A', await walkTo(a, STONE_A.x, STONE_A.y, 8000));
  ok('B walks east to the east lane', await walkTo(b, 27*TILE+16, 17*TILE+16, 8000));
  ok('B walks north to the market lane', await walkTo(b, 27*TILE+16, 12*TILE+16, 8000));
  // the church (tx 28-32) sits on the market lane; route around its south side
  ok('B walks south down the east lane', await walkTo(b, 27*TILE+16, 16*TILE+16, 8000));
  ok('B walks east below the church', await walkTo(b, 33*TILE+16, 16*TILE+16, 8000));
  ok('B walks north up the ruins lane', await walkTo(b, 33*TILE+16, 8*TILE+16, 12000));
  ok('B walks to stone B', await walkTo(b, STONE_B.x, STONE_B.y, 8000));
  ok('ruin-open fires for A', await a.waitFor(() => a.state.ruinOpen, 4000));
  ok('ruin-open fires for B (shared world event)', await b.waitFor(() => b.state.ruinOpen, 4000));
  const ro = a.lastOf('ruin-open');
  ok('ruin message is hope/community themed', !!ro && /hope/i.test(ro.message), ro?.message);
  // RESTORE THE LIGHT M4: the ruin puzzle state itself is synced (stones/gate)
  const rs = a.lastOf('ruin');
  ok('ruin state syncs stones answered + gate open', !!rs && rs.ruin.open === true && rs.ruin.gate === true && rs.ruin.a === true && rs.ruin.b === true,
     rs ? JSON.stringify(rs.ruin) : 'none');
  // RESTORE THE LIGHT: the Discovery — B is standing in the ruins clearing
  const disc = await a.waitFor(() => a.msgs.some(m => m.t === 'discovery'), 3000) ? a.lastOf('discovery') : null;
  ok('discovery fires once the ruin stands open', !!disc);
  ok('discovery is John 8:12 KJV, verbatim', !!disc && disc.ref === 'John 8:12' &&
     disc.text === 'I am the light of the world: he that followeth me shall not walk in darkness, but shall have the light of life.',
     disc ? (disc.ref + ': ' + disc.text) : 'none');

  // ---------- 7b. ENDING: both enter the garden together -> shared ending -> play again resets ----------
  console.log('ending:');
  const GARDEN = { x: 19*TILE+16, y: 15*TILE+16 };
  const GARDEN_B = { x: 21*TILE+16, y: 15*TILE+16 };
  const SPAWN = { x: 13*TILE+16, y: 14*TILE+16 }; // west lane east of home (System 1)
  ok('A walks south to the market lane', await walkTo(a, 6*TILE+16, 12*TILE+16, 12000));
  ok('A walks east on the market lane', await walkTo(a, 13*TILE+16, 12*TILE+16, 12000));
  ok('A walks east to the north lane', await walkTo(a, 19*TILE+16, 12*TILE+16, 12000));
  ok('A walks south to the garden', await walkTo(a, GARDEN.x, GARDEN.y, 12000));
  ok('B walks south down the ruins lane', await walkTo(b, 33*TILE+16, 16*TILE+16, 15000));
  ok('B walks west below the church', await walkTo(b, 21*TILE+16, 16*TILE+16, 12000));
  ok('B walks north to the garden', await walkTo(b, GARDEN_B.x, GARDEN_B.y, 12000));
  ok('ending fires for A', await a.waitFor(() => a.msgs.some(m => m.t === 'ending'), 5000));
  ok('ending fires for B (shared ending)', await b.waitFor(() => b.msgs.some(m => m.t === 'ending'), 5000));
  // RESTORE THE LIGHT: the lanterns relit one by one before that moment
  ok('finale: lanterns all relit, central light on', await a.waitFor(() => {
    const r = a.lastOf('restore')?.restore;
    return !!r && r.stage === 'complete' && r.central === true && r.lit === r.lanterns;
  }, 4000), JSON.stringify(a.lastOf('restore')?.restore));
  const endMsg = a.lastOf('ending');
  ok('ending message is hopeful, not preachy', !!endMsg && /hope/i.test(endMsg.message) && !/repent|sin|hell/i.test(endMsg.message), endMsg?.message);
  // RESTORE THE LIGHT M5: the closing card + bigger-world vista ship in the
  // served page (the ending itself arrived over the wire just above).
  ok('closing card ships in the page (TIKVAH — A place to grow.)', pageHtml.includes('TIKVAH <span>— A place to grow.</span>'));
  ok('closing card ships in the page (story / paths / beginning)', pageHtml.includes('A story to live.') && pageHtml.includes('Different paths. Same Purpose.') && pageHtml.includes('This is only the beginning.'));
  ok('closing card ships in the page (THE WORLD CONTINUES…)', pageHtml.includes('THE WORLD CONTINUES…'));
  ok('closing vista ships in the page (canvas + painter)', pageHtml.includes('id="vistaCv"') && pageHtml.includes('function drawVistaBack()'));
  ok('closing card can be dismissed (no lockout)', pageHtml.includes('id="btnContinue"'));
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
  ok('reset carries no candle state', rd.candles === undefined, 'candles=' + rd.candles);
  ok('reset un-blooms the garden', rd.garden.bloomed === false);
  ok('reset clears inventories', rd.players.every(p => p.inv.produce === 0 && p.inv.fish === 0 && p.inv.meals === 0));
  ok('villagers still present after reset', rd.npcs.length === 4, rd.npcs.map(n=>n.name).join(','));

  // ---------- 7c. ENDING with 3 players: only 2 in the garden ----------
  // Mini-MMO: the ending needs 2+ outside players in the garden plaza,
  // not every player — a 3rd player elsewhere must not block it.
  console.log('ending (3 players, 2 in garden):');
  const k = new C('Third'); await k.connect();
  k.send({ t: 'join', name: 'Third', code });
  ok('third player joins (room cap 10)', await k.waitFor(() => k.state.players.size === 3, 3000));
  ok('A walks north up the west lane', await walkTo(a, 13*TILE+16, 8*TILE+16, 20000));
  ok('A walks west toward the forest', await walkTo(a, 6*TILE+16, 8*TILE+16, 12000));
  ok('A walks to stone A again', await walkTo(a, STONE_A.x, STONE_A.y, 12000));
  // B routes via lanes: market lane east, ruins lane north.
  ok('B walks north to the market lane', await walkTo(b, 13*TILE+16, 12*TILE+16, 15000));
  // the church (tx 28-32) sits on the market lane; route around its south side
  ok('B walks east to the east lane', await walkTo(b, 27*TILE+16, 12*TILE+16, 15000));
  ok('B walks south down the east lane', await walkTo(b, 27*TILE+16, 16*TILE+16, 8000));
  ok('B walks east below the church', await walkTo(b, 33*TILE+16, 16*TILE+16, 8000));
  ok('B walks north up the ruins lane', await walkTo(b, 33*TILE+16, 8*TILE+16, 12000));
  ok('B walks to stone B again', await walkTo(b, STONE_B.x, STONE_B.y, 12000));
  ok('ruin re-opens with 3 players', await b.waitFor(() => b.msgs.filter(m => m.t === 'ruin-open').length >= 2, 4000));
  const AWAY = { x: 24*TILE+16, y: 18*TILE+16 }; // south lane: outside the garden plaza
  ok('Third walks away from the garden', await walkTo(k, AWAY.x, AWAY.y, 20000));
  ok('A walks south to the market lane', await walkTo(a, 6*TILE+16, 12*TILE+16, 12000));
  ok('A walks east on the market lane', await walkTo(a, 13*TILE+16, 12*TILE+16, 12000));
  ok('A walks east to the north lane', await walkTo(a, 19*TILE+16, 12*TILE+16, 12000));
  ok('A walks back to garden', await walkTo(a, GARDEN.x, GARDEN.y, 12000));
  ok('B walks south down the ruins lane', await walkTo(b, 33*TILE+16, 16*TILE+16, 15000));
  ok('B walks west below the church', await walkTo(b, 21*TILE+16, 16*TILE+16, 12000));
  ok('B walks back to garden', await walkTo(b, GARDEN_B.x, GARDEN_B.y, 12000));
  ok('ending fires for A (3 players, only 2 in garden)', await a.waitFor(() => a.msgs.filter(m => m.t === 'ending').length >= 2, 5000));
  ok('ending fires for B', await b.waitFor(() => b.msgs.filter(m => m.t === 'ending').length >= 2, 5000));
  ok('ending fires for the player outside the garden', await k.waitFor(() => k.msgs.some(m => m.t === 'ending'), 5000));
  const kme = k.me();
  const kInGarden = !!kme && kme.x >= 17*TILE && kme.x < 23*TILE && kme.y >= 13*TILE && kme.y < 18*TILE;
  ok('third player was NOT in the garden plaza', !kInGarden, `k at ${kme?.x?.toFixed(0)},${kme?.y?.toFixed(0)}`);

  // ---------- 7d. RESTORE THE LIGHT: the ruins, solo — gate, latch, no dead end ----------
  // One traveler alone: the fallen stones bar the ruins clearing until the
  // forest stone is held a moment; then the way stays open, and holding the
  // inner stone (both now answered) opens the ruin. No co-op dead end.
  console.log('ruins (solo: gate + latch):');
  const solo = new C('Solo'); await solo.connect();
  solo.send({ t: 'create', name: 'Solo' });
  ok('solo traveler arrives', await solo.waitFor(() => solo.me(), 3000));
  ok('solo: east along the upper lane', await walkTo(solo, 33*TILE+16, 8*TILE+16, 15000));
  ok('solo: the fallen stones bar the ruins clearing', !(await walkTo(solo, STONE_B.x, STONE_B.y, 5000)));
  ok('solo: west along the upper lane', await walkTo(solo, 19*TILE+16, 8*TILE+16, 15000));
  ok('solo: west toward the forest', await walkTo(solo, 13*TILE+16, 8*TILE+16, 10000));
  ok('solo: to the forest stone', await walkTo(solo, STONE_A.x, STONE_A.y, 12000));
  ok('solo: forest stone answers and the way opens', await solo.waitFor(() => { const r = solo.lastOf('ruin'); return !!r && r.ruin.a && r.ruin.gate; }, 5000));
  ok('solo: back east along the upper lane', await walkTo(solo, 19*TILE+16, 8*TILE+16, 15000));
  ok('solo: east to the ruins lane', await walkTo(solo, 33*TILE+16, 8*TILE+16, 15000));
  ok('solo: through the opened way to the inner stone', await walkTo(solo, STONE_B.x, STONE_B.y, 12000));
  ok('solo: both stones answered — the ruin opens (no dead end)', await solo.waitFor(() => solo.state.ruinOpen, 6000));
  solo.close();

  // ---------- 7e. play-again is gated until the ending (STORY-FIX G4) ----------
  console.log('play-again gate:');
  const ga = new C('Gater'); await ga.connect();
  ga.send({ t: 'create', name: 'Gater' });
  ok('gate room created', await ga.waitFor(() => !!ga.state.code, 3000));
  ga.send({ t: 'play-again' });
  ok('play-again ignored before the ending', await sleep(1500).then(() => !ga.msgs.some(m => m.t === 'reset')));
  ga.close();

  // ---------- 7f. STORY-FIX G1: a lone traveler can reach the Return ----------
  // One player, the ruin opened solo, the Discovery witnessed: standing in
  // the garden ~20 s begins the same Return — no second traveler required.
  console.log('solo finale:');
  const fin = new C('Finale'); await fin.connect();
  fin.send({ t: 'create', name: 'Finale', uuid: 'storyfix-g1-uuid' });
  ok('finale room created', await fin.waitFor(() => !!fin.state.code, 3000));
  const FIN_GARDEN = { x: 19*TILE+16, y: 15*TILE+16 };
  ok('fin walks north to the market lane', await walkTo(fin, 13*TILE+16, 12*TILE+16, 12000));
  ok('fin walks east to the north lane', await walkTo(fin, 19*TILE+16, 12*TILE+16, 12000));
  ok('fin walks south to the garden', await walkTo(fin, FIN_GARDEN.x, FIN_GARDEN.y, 12000));
  await sleep(4000); // a brief rest: the instant (2-player) trigger must not fire
  ok('no Return begins with the ruin still closed', !fin.msgs.some(m => m.t === 'ending') &&
     (fin.lastOf('restore')?.restore?.stage || 'dimmed') === 'dimmed',
     fin.lastOf('restore') ? JSON.stringify(fin.lastOf('restore').restore) : 'no restore yet');
  // the solo ruin: forest stone, then the inner stone (same route as 7d)
  ok('fin: east along the upper lane', await walkTo(fin, 33*TILE+16, 8*TILE+16, 15000));
  ok('fin: west along the upper lane', await walkTo(fin, 19*TILE+16, 8*TILE+16, 15000));
  ok('fin: west toward the forest', await walkTo(fin, 13*TILE+16, 8*TILE+16, 10000));
  ok('fin: to the forest stone', await walkTo(fin, STONE_A.x, STONE_A.y, 12000));
  ok('fin: forest stone answers and the way opens', await fin.waitFor(() => { const r = fin.lastOf('ruin'); return !!r && r.ruin.a && r.ruin.gate; }, 5000));
  ok('fin: back east along the upper lane', await walkTo(fin, 19*TILE+16, 8*TILE+16, 15000));
  ok('fin: east to the ruins lane', await walkTo(fin, 33*TILE+16, 8*TILE+16, 15000));
  ok('fin: through the opened way to the inner stone', await walkTo(fin, STONE_B.x, STONE_B.y, 12000));
  ok('fin: the ruin opens', await fin.waitFor(() => fin.state.ruinOpen, 6000));
  ok('fin: the Discovery is witnessed at the inner stone', await fin.waitFor(() => fin.msgs.some(m => m.t === 'discovery'), 4000));
  // tend one plot, so the pre-reset inventory is nonzero (STORY-FIX G3 setup)
  ok('fin: west on the upper lane', await walkTo(fin, 19*TILE+16, 8*TILE+16, 15000));
  ok('fin: west toward the forest', await walkTo(fin, 13*TILE+16, 8*TILE+16, 10000));
  ok('fin: south to the market lane', await walkTo(fin, 6*TILE+16, 12*TILE+16, 12000));
  ok('fin: east on the market lane', await walkTo(fin, 8*TILE+16, 12*TILE+16, 8000));
  ok('fin: south to the farm gate', await walkTo(fin, 8*TILE+16, 14*TILE+16, 8000));
  ok('fin: south into the farm', await walkTo(fin, 8*TILE+16, 16*TILE+16, 8000));
  ok('fin: to plot 1', await walkTo(fin, PLOT0.x, PLOT0.y, 8000));
  fin.send({ t: 'interact' }); // plant
  ok('fin plants', await fin.waitFor(() => fin.state.farm[0]?.stage === 'planted', 2000));
  fin.send({ t: 'interact' }); // water
  ok('fin waters', await fin.waitFor(() => fin.state.farm[0]?.stage === 'growing', 2000));
  ok('fin crop grows', await fin.waitFor(() => fin.state.farm[0]?.stage === 'ready', 8000));
  fin.send({ t: 'interact' }); // harvest -> produce
  ok('fin harvests produce', await fin.waitFor(() => (fin.me()?.inv?.produce || 0) >= 1, 3000));
  // back to the garden for the long rest
  ok('fin: north to the farm gate', await walkTo(fin, 8*TILE+16, 14*TILE+16, 8000));
  ok('fin: north to the market lane', await walkTo(fin, 8*TILE+16, 12*TILE+16, 8000));
  ok('fin: east on the market lane', await walkTo(fin, 13*TILE+16, 12*TILE+16, 8000));
  ok('fin: east to the north lane', await walkTo(fin, 19*TILE+16, 12*TILE+16, 12000));
  ok('fin: south to the garden', await walkTo(fin, FIN_GARDEN.x, FIN_GARDEN.y, 12000));
  ok('the Return begins for one traveler', await fin.waitFor(() => fin.msgs.some(m => m.t === 'ending'), 45000));
  const fEnd = fin.lastOf('ending');
  ok('solo ending message names every traveler', !!fEnd && fEnd.message === 'Travelers together. One village. A hope discovered together.', fEnd?.message);
  ok('solo finale relights every lantern', await fin.waitFor(() => {
    const r = fin.lastOf('restore')?.restore;
    return !!r && r.stage === 'complete' && r.central === true && r.lit === r.lanterns;
  }, 4000), JSON.stringify(fin.lastOf('restore')?.restore));
  // the gate is now open: play-again resets the run (G4), and the stored
  // identity resets with it (G3) — a rejoin inside the reap window starts fresh
  fin.send({ t: 'play-again' });
  const fres = await fin.waitFor(() => fin.msgs.some(m => m.t === 'reset'), 3000) ? fin.lastOf('reset') : null;
  ok('play-again works after the ending', !!fres);
  ok('reset dims the town again', !!fres && fres.restore.stage === 'dimmed' && fres.restore.lit === 0 && fres.restore.central === false && fres.restore.garden === 'dormant' && fres.restore.discovery === false,
     JSON.stringify(fres?.restore));
  ok('reset clears inventories', !!fres && fres.players.every(p => p.inv.produce === 0 && p.inv.fish === 0 && p.inv.meals === 0));
  const finCode = fin.state.code;
  fin.close();
  await sleep(250); // inside the 500 ms reap grace
  const fin2 = new C('FinaleAgain'); await fin2.connect();
  fin2.send({ t: 'join', name: 'FinaleAgain', code: finCode, uuid: 'storyfix-g1-uuid' });
  ok('rejoin with the same uuid inside the reap window', await fin2.waitFor(() => !!fin2.me(), 3000));
  ok('rejoin after play-again gets the fresh-run inventory (no pre-reset stock)',
     (fin2.me()?.inv?.produce || 0) === 0 && (fin2.me()?.inv?.fish || 0) === 0 && (fin2.me()?.inv?.meals || 0) === 0,
     JSON.stringify(fin2.me()?.inv));
  ok('rejoin after play-again respawns at the village lane',
     Math.hypot((fin2.me()?.x || 0) - SPAWN_X, (fin2.me()?.y || 0) - SPAWN_Y) < 40,
     `(${Math.round(fin2.me()?.x)},${Math.round(fin2.me()?.y)})`);
  fin2.close();

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

  // ---------- M2: persistent public village ----------
  console.log('public village (M2):');
  ok('page offers the public village button', pageHtml.includes('Enter the Public Village'));
  ok('page keeps a create-a-private-village option', pageHtml.includes('Create a Private Village'));
  ok('title carries the persistence footnote', pageHtml.includes('The village persists while the server runs'));

  const v1 = new C('Villager1'); await v1.connect();
  v1.send({ t: 'join', name: 'Villager1', code: 'TIKVAH' });
  ok('join TIKVAH -> joined the public village', await v1.waitFor(() => v1.state.code === 'TIKVAH', 3000), 'code=' + v1.state.code);
  // v1 tends a plot, then leaves the village EMPTY — the public room must
  // keep its world state (and must not be reaped).
  ok('v1 walks south to the south lane', await walkTo(v1, 13*TILE+16, 18*TILE+16, 12000));
  ok('v1 walks north to the market lane', await walkTo(v1, 13*TILE+16, 12*TILE+16, 12000));
  ok('v1 walks west on the market lane', await walkTo(v1, 8*TILE+16, 12*TILE+16, 8000));
  ok('v1 walks south to the farm gate', await walkTo(v1, 8*TILE+16, 14*TILE+16, 8000));
  ok('v1 walks to plot 1', await walkTo(v1, PLOT0.x, PLOT0.y, 12000));
  v1.send({ t: 'interact' }); // plant (not watered: stays 'planted')
  ok('v1 plants a crop', await v1.waitFor(() => v1.state.farm[0]?.stage === 'planted', 3000));
  v1.close();
  await sleep(1500); // well past the 500ms test reap grace
  const v2 = new C('Villager2'); await v2.connect();
  v2.send({ t: 'join', name: 'Villager2', code: 'TIKVAH' });
  ok('public village still exists after being empty (never reaped)',
     await v2.waitFor(() => v2.state.code === 'TIKVAH', 3000));
  ok('world state survives an empty public village', v2.state.farm[0]?.stage === 'planted', v2.state.farm[0]?.stage);

  // private rooms keep the old behavior: reaped after the empty grace
  const pv = new C('PrivateV'); await pv.connect();
  pv.send({ t: 'create', name: 'PrivateV' });
  ok('private room created', await pv.waitFor(() => !!pv.state.code && pv.state.code !== 'TIKVAH', 3000));
  const pvCode = pv.state.code;
  ok('private room code is still 4 letters', /^[A-Z]{4}$/.test(pvCode), 'got: ' + pvCode);
  pv.close();
  await sleep(1500); // past the 500ms test reap grace
  const rc = new C('ReapCheck'); await rc.connect();
  rc.send({ t: 'join', name: 'ReapCheck', code: pvCode });
  const reapErr = await rc.waitFor(() => rc.msgs.some(m => m.t === 'error'), 3000) ? rc.lastOf('error') : null;
  ok('empty private room is reaped (unchanged behavior)', !!reapErr && reapErr.code === 'bad-code', reapErr?.code);
  rc.close();

  // play-again inside the public village = personal reset only
  const v3 = new C('Villager3'); await v3.connect();
  v3.send({ t: 'join', name: 'Villager3', code: 'TIKVAH' });
  ok('observer joins the public village', await v3.waitFor(() => v3.state.code === 'TIKVAH', 3000));
  // v2 farms plot 3 for a real inventory before the personal reset
  const PLOT2 = { x: 10*TILE+16, y: 15*TILE+16 };
  ok('v2 walks south to the south lane', await walkTo(v2, 13*TILE+16, 18*TILE+16, 12000));
  ok('v2 walks north to the market lane', await walkTo(v2, 13*TILE+16, 12*TILE+16, 12000));
  ok('v2 walks west on the market lane', await walkTo(v2, 8*TILE+16, 12*TILE+16, 8000));
  ok('v2 walks south to the farm gate', await walkTo(v2, 8*TILE+16, 14*TILE+16, 8000));
  ok('v2 walks south into the farm', await walkTo(v2, 8*TILE+16, 16*TILE+16, 8000));
  ok('v2 walks to plot 3', await walkTo(v2, PLOT2.x, PLOT2.y, 12000));
  v2.send({ t: 'interact' }); // plant
  ok('v2 plants plot 3', await v2.waitFor(() => v2.state.farm[2]?.stage === 'planted', 3000));
  v2.send({ t: 'interact' }); // water
  ok('v2 waters plot 3', await v2.waitFor(() => v2.state.farm[2]?.stage === 'growing', 3000));
  ok('v2 crop grows', await v2.waitFor(() => v2.state.farm[2]?.stage === 'ready', 8000));
  v2.send({ t: 'interact' }); // harvest -> produce
  ok('v2 harvests produce', await v2.waitFor(() => (v2.me()?.inv?.produce || 0) >= 1, 3000));
  const farmSnap = JSON.stringify(v3.state.farm);
  v2.send({ t: 'play-again' });
  const rp = await v2.waitFor(() => v2.msgs.some(m => m.t === 'reset-personal'), 3000) ? v2.lastOf('reset-personal') : null;
  ok('play-again in the public village -> reset-personal', !!rp);
  ok('no shared-world reset broadcast in the public village',
     !v2.msgs.some(m => m.t === 'reset') && !v3.msgs.some(m => m.t === 'reset'));
  ok('shared farm untouched by the personal reset', JSON.stringify(v3.state.farm) === farmSnap, JSON.stringify(v3.state.farm.map(f=>f.stage)));
  ok('personal inventory cleared', !!rp && rp.p.inv.produce === 0 && rp.p.inv.fish === 0 && rp.p.inv.meals === 0, JSON.stringify(rp?.p.inv));
  ok('player respawns at the village lane', !!rp && Math.hypot(rp.p.x - SPAWN.x, rp.p.y - SPAWN.y) < 40, `${rp?.p.x},${rp?.p.y}`);
  ok('observer sees the reset traveler back at spawn', await v3.waitFor(() => {
    const p = v3.state.players.get(v2.state.you.id);
    return !!p && Math.hypot(p.x - SPAWN.x, p.y - SPAWN.y) < 40;
  }, 3000));

  // ---------- M3: persistent identity (no logins) ----------
  console.log('persistent identity (M3):');

  // 3a. client helper in isolation: getUuid generates once, persists, survives reload
  const uuidFnMatch = pageHtml.match(/function getUuid\(\)\s*\{([\s\S]*?)\n\}/);
  ok('page ships a getUuid helper', !!uuidFnMatch);
  const stubStore = {};
  const stubLS = { getItem: k => (k in stubStore ? stubStore[k] : null), setItem: (k, v) => { stubStore[k] = String(v); } };
  const getUuid = new Function('localStorage', 'crypto', uuidFnMatch[1]);
  const u1 = getUuid(stubLS, crypto);
  ok('getUuid generates a uuid on first visit', typeof u1 === 'string' && /^[0-9a-f-]{36}$/.test(u1), u1);
  const u2 = getUuid(stubLS, crypto);
  ok('getUuid persists the uuid (second visit returns the same)', u1 === u2);
  ok('uuid stored in localStorage', stubStore['tikvah_uuid'] === u1);
  const getUuidReload = new Function('localStorage', 'crypto', uuidFnMatch[1]);
  ok('uuid survives a page reload', getUuidReload(stubLS, crypto) === u1);

  // 3b. server issues a uuid when the client sends none (old client)
  const ni = new C('NoUuid'); await ni.connect();
  ni.send({ t: 'create', name: 'NoUuid' });
  ok('create without uuid -> joined', await ni.waitFor(() => !!ni.state.code, 3000));
  const issued = ni.lastOf('joined')?.uuid;
  ok('server issues a uuid to old clients', typeof issued === 'string' && issued.length > 0, issued);
  ok('issued uuid is uuid-shaped', /^[A-Za-z0-9-]{1,64}$/.test(issued || ''), issued);
  ni.close();

  // 3c. inventory restores when the same uuid rejoins (public village)
  const ID = 'm3-uuid-inv';
  const i1 = new C('Ident1'); await i1.connect();
  i1.send({ t: 'join', name: 'Ident1', code: 'TIKVAH', uuid: ID });
  ok('join TIKVAH with a uuid -> joined', await i1.waitFor(() => i1.state.code === 'TIKVAH', 3000));
  ok('server echoes the client uuid', i1.lastOf('joined')?.uuid === ID, i1.lastOf('joined')?.uuid);
  ok('i1 walks south to the south lane', await walkTo(i1, 13*TILE+16, 18*TILE+16, 12000));
  ok('i1 walks north to the market lane', await walkTo(i1, 13*TILE+16, 12*TILE+16, 12000));
  ok('i1 walks west on the market lane', await walkTo(i1, 8*TILE+16, 12*TILE+16, 8000));
  ok('i1 walks south to the farm gate', await walkTo(i1, 8*TILE+16, 14*TILE+16, 8000));
  ok('i1 walks south into the farm', await walkTo(i1, 8*TILE+16, 16*TILE+16, 8000));
  ok('i1 walks to plot 3', await walkTo(i1, PLOT2.x, PLOT2.y, 12000));
  i1.send({ t: 'interact' }); // plant
  ok('i1 plants plot 3', await i1.waitFor(() => i1.state.farm[2]?.stage === 'planted', 3000));
  i1.send({ t: 'interact' }); // water
  ok('i1 waters plot 3', await i1.waitFor(() => i1.state.farm[2]?.stage === 'growing', 3000));
  ok('i1 crop grows', await i1.waitFor(() => i1.state.farm[2]?.stage === 'ready', 8000));
  i1.send({ t: 'interact' }); // harvest -> produce
  ok('i1 harvests produce', await i1.waitFor(() => (i1.me()?.inv?.produce || 0) >= 1, 3000));
  await sleep(300); // let the 20 Hz tick sync the identity record
  const i1pos = { x: i1.me().x, y: i1.me().y }; // far from spawn (plot 3)
  i1.close();
  await sleep(300);
  const i2 = new C('Ident2'); await i2.connect();
  i2.send({ t: 'join', name: 'Ident2', code: 'TIKVAH', uuid: ID });
  ok('rejoin with the same uuid -> joined', await i2.waitFor(() => i2.state.code === 'TIKVAH', 3000));
  ok('inventory restored on rejoin with the same uuid',
     await i2.waitFor(() => (i2.me()?.inv?.produce || 0) >= 1, 3000), JSON.stringify(i2.me()?.inv));
  ok('position restored on rejoin with the same uuid (no spawn teleport)',
     await i2.waitFor(() => !!i2.me(), 2000) && Math.hypot(i2.me().x - i1pos.x, i2.me().y - i1pos.y) < 60,
     `rejoined at (${Math.round(i2.me()?.x)},${Math.round(i2.me()?.y)}), was (${Math.round(i1pos.x)},${Math.round(i1pos.y)})`);

  // 3d. villager friendship hearts persist by uuid across reconnects
  const HID = 'm3-uuid-hearts';
  const h1 = new C('Heart1'); await h1.connect();
  h1.send({ t: 'join', name: 'Heart1', code: 'TIKVAH', uuid: HID });
  ok('hearts test: joined', await h1.waitFor(() => h1.state.code === 'TIKVAH', 3000));
  let say1 = null;
  for (let attempt = 0; attempt < 3 && !say1; attempt++) {
    const h = h1.state.npcs.get('Hannah');
    ok('Hannah is in the village (hearts test)', !!h);
    await walkTo(h1, h.x, h.y, 8000);
    h1.send({ t: 'interact' }); // talk
    say1 = await h1.waitFor(() => h1.msgs.some(m => m.t === 'say'), 2000) ? h1.lastOf('say') : null;
  }
  ok('first talk -> 1 heart', !!say1 && say1.hearts === 1, 'hearts=' + say1?.hearts);
  h1.close();
  await sleep(300);
  const h2 = new C('Heart2'); await h2.connect();
  h2.send({ t: 'join', name: 'Heart2', code: 'TIKVAH', uuid: HID });
  ok('rejoin with the same uuid -> joined', await h2.waitFor(() => h2.state.code === 'TIKVAH', 3000));
  let say2 = null;
  for (let attempt = 0; attempt < 3 && !say2; attempt++) {
    const h = h2.state.npcs.get('Hannah');
    await walkTo(h2, h.x, h.y, 8000);
    const before = h2.msgs.filter(m => m.t === 'say').length;
    h2.send({ t: 'interact' }); // talk
    say2 = await h2.waitFor(() => h2.msgs.filter(m => m.t === 'say').length > before, 2000) ? h2.lastOf('say') : null;
  }
  ok('friendship hearts persist by uuid across reconnects', !!say2 && say2.hearts === 2, 'hearts=' + say2?.hearts);

  // 3e. a different uuid gets a fresh identity (no cross-contamination)
  const f1 = new C('Fresh'); await f1.connect();
  f1.send({ t: 'join', name: 'Fresh', code: 'TIKVAH', uuid: 'm3-uuid-fresh' });
  ok('different uuid joins', await f1.waitFor(() => f1.state.code === 'TIKVAH', 3000));
  ok('different uuid starts with an empty inventory',
     await f1.waitFor(() => !!f1.me(), 2000) && f1.me().inv.produce === 0 && f1.me().inv.fish === 0 && f1.me().inv.meals === 0,
     JSON.stringify(f1.me()?.inv));
  ok('fresh uuid still starts at spawn',
     Math.hypot(f1.me().x - (13*TILE+16), f1.me().y - (14*TILE+16)) < 40,
     `(${Math.round(f1.me().x)},${Math.round(f1.me().y)})`);

  // ---------- RESTORE THE LIGHT: the quiet restoration engine ----------
  // A fresh private room: the town starts dimmed and dark-lanterned. Ordinary
  // life — farming, greeting, worship, fishing — quietly moves it. No score,
  // no checklist, no progress bar is ever synced to the client.
  console.log('restore the light (quiet engine):');
  ok('page renders the waking garden beds', pageHtml.includes("gardenBed('waking'"));
  ok('page takes restoration state from the server', pageHtml.includes("case 'restore':"));
  ok('page shows the discovery writing', pageHtml.includes("case 'discovery':"));
  ok('page paints dark lanterns for the dimmed town', pageHtml.includes('lampTileDark'));
  ok('page orders the lantern relight (LAMP_ORDER)', pageHtml.includes('LAMP_ORDER'));
  // ---------- STORY-FIXES (2026-10-03): client static checks ----------
  // G2: only co-located travelers are drawn (no cross-place name tags)
  ok('draw list filters to co-located players', pageHtml.includes('(p.inside === inside) && (p.place === (me && me.place))'));
  // G5: the Discovery panel hides on both resets, qc bubbles clear on personal
  ok('reset hides the discovery panel', (pageHtml.match(/getElementById\('discovery'\)\.style\.display = 'none'/g) || []).length >= 2);
  ok('reset-personal mirrors qc bubble clearing', pageHtml.includes("case 'reset-personal':") && pageHtml.includes("qcBubbles.clear(); document.getElementById('qcPanel').style.display = 'none';"));
  // G8: the true-friend toast fires only for the traveler who spoke
  ok('say passes the speaker to the dialogue', pageHtml.includes('showDialogue(m.name, m.text, m.hearts, m.by)'));
  ok('true-friend toast gated on the speaker', pageHtml.includes('by === myName'));
  // G10 nits
  ok('wardrobe confirm restores the title button to Begin', !pageHtml.includes('✔ Looks good'));
  ok('lamps stay dark until restoration is known', pageHtml.includes('if (!restore) return false;'));
  ok('creator subtitle is not gendered', pageHtml.includes('Your traveler will be waiting for you in the village.'));
  ok('dead global fishing state removed', !pageHtml.includes('let fishing'));
  ok('dialogue prompt says close (E dismisses)', pageHtml.includes('Press E to close'));
  ok('page gates lamp light on restoration (lampLit)', pageHtml.includes('function lampLit('));
  ok('page rests the fountain dry until the garden wakes', pageHtml.includes('fountainDryTile'));
  ok('the Discovery earns its own panel in the ruins', pageHtml.includes('id="discovery"'));
  ok('garden waking earns one soft chime (no fanfare UI)', pageHtml.includes('The Old Garden is coming back to life'));
  const s1 = new C('Restorer'); await s1.connect();
  s1.send({ t: 'create', name: 'Restorer' });
  ok('restore room created', await s1.waitFor(() => !!s1.state.code, 3000));
  const jr = s1.lastOf('joined')?.restore;
  ok('town starts dimmed, lanterns dark', !!jr && jr.stage === 'dimmed' && jr.lit === 0 && jr.central === false && jr.garden === 'dormant' && jr.discovery === false, JSON.stringify(jr));
  ok('restoration is quiet: no counts or score are synced', !!jr && !('acts' in jr) && !('warmth' in jr) && !('score' in jr), JSON.stringify(jr && Object.keys(jr)));

  async function tendPlot(c, plot, idx) {
    await walkTo(c, plot.x, plot.y, 8000);
    c.send({ t: 'interact' }); // plant
    await c.waitFor(() => c.state.farm[idx]?.stage === 'planted', 2000);
    c.send({ t: 'interact' }); // water
    await c.waitFor(() => c.state.farm[idx]?.stage === 'growing', 2000);
    await c.waitFor(() => c.state.farm[idx]?.stage === 'ready', 8000);
    c.send({ t: 'interact' }); // harvest
    return c.waitFor(() => c.state.farm[idx]?.stage === 'empty', 3000);
  }
  const PLOT_B = { x: 8*TILE+16, y: 15*TILE+16 };   // FARM_PLOTS[1]
  ok('S walks south to the south lane', await walkTo(s1, 13*TILE+16, 18*TILE+16, 12000));
  ok('S walks north to the market lane', await walkTo(s1, 13*TILE+16, 12*TILE+16, 12000));
  ok('S walks west on the market lane', await walkTo(s1, 8*TILE+16, 12*TILE+16, 8000));
  ok('S walks south to the farm gate', await walkTo(s1, 8*TILE+16, 14*TILE+16, 8000));
  ok('S walks south into the farm', await walkTo(s1, 8*TILE+16, 16*TILE+16, 8000));
  ok('S harvests plot 1', await tendPlot(s1, PLOT0, 0));
  ok('S harvests plot 2', await tendPlot(s1, PLOT_B, 1));
  ok('two harvests alone do not wake the town', (s1.lastOf('restore')?.restore?.stage || 'dimmed') === 'dimmed',
     s1.lastOf('restore')?.restore?.stage);

  async function greetHannah(c) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const h = c.state.npcs.get('Hannah');
      if (!h) continue;
      await walkTo(c, h.x, h.y, 8000);
      const before = c.msgs.filter(m => m.t === 'say').length;
      c.send({ t: 'interact' }); // talk
      if (await c.waitFor(() => c.msgs.filter(m => m.t === 'say').length > before, 2000)) return true;
    }
    return false;
  }
  ok('S exits the farm via the north gate', await walkTo(s1, 8*TILE+16, 14*TILE+16, 8000));
  ok('S walks east to the west lane', await walkTo(s1, 13*TILE+16, 12*TILE+16, 8000));
  ok('S walks to the plaza', await walkTo(s1, 21*TILE+16, 17*TILE+16, 8000));
  ok('S greets Hannah', await greetHannah(s1));
  ok('S greets Hannah again', await greetHannah(s1));
  ok('the town stirs (felt, not announced)', await s1.waitFor(() => s1.lastOf('restore')?.restore?.stage === 'stirring', 3000),
     JSON.stringify(s1.lastOf('restore')?.restore));

  ok('S walks east to the east lane', await walkTo(s1, 27*TILE+16, 12*TILE+16, 12000));
  ok('S walks south down the east lane', await walkTo(s1, 27*TILE+16, 15*TILE+16, 8000));
  ok('S walks to church door', await walkTo(s1, CHURCH_DOOR.x, CHURCH_DOOR.y + 8, 8000));
  s1.send({ t: 'interact' }); // enter
  ok('S enters the church', await s1.waitFor(() => s1.me()?.inside === true, 2000));
  // CHURCH-REDESIGN (2026-10-03): no candle stand. Sincere worship at the
  // altar is the warmth source now (same semantics: doing it twice counts fully).
  const ALTAR_S = { x: 20*TILE+16, y: 20*TILE+16+16 };   // kneel before the altar
  ok('S walks down the aisle to the altar', await walkToNear(s1, ALTAR_S.x, ALTAR_S.y, 10, 8000));
  s1.send({ t: 'interact' }); // pray -> worship moment
  ok('S worships at the altar (no candles needed)', await s1.waitFor(() => s1.msgs.some(m => m.t === 'worship'), 3000));
  ok('worship alone does not yet wake the garden', (s1.lastOf('restore')?.restore?.stage || '') === 'stirring',
     s1.lastOf('restore')?.restore?.stage);
  await sleep(21000); // worship cooldown, so the second prayer counts too
  s1.send({ t: 'interact' }); // pray again -> worship again
  ok('S worships again', await s1.waitFor(() => s1.msgs.filter(m => m.t === 'worship').length >= 2, 3000));
  ok('S walks to the church exit', await walkTo(s1, 20*TILE+16, 24*TILE+16, 8000));
  s1.send({ t: 'interact' }); // exit
  ok('S exits the church', await s1.waitFor(() => s1.me()?.inside === false, 2000));

  async function catchFish(c) {
    const bitesBefore = c.msgs.filter(m => m.t === 'bite').length;
    const catchBefore = c.msgs.filter(m => m.t === 'catch').length;
    c.send({ t: 'interact' }); // cast
    if (!await c.waitFor(() => c.me()?.fishing === 'cast', 2000)) return false;
    if (!await c.waitFor(() => c.msgs.filter(m => m.t === 'bite').length > bitesBefore, 6000)) return false;
    c.send({ t: 'interact' }); // catch
    return c.waitFor(() => c.msgs.filter(m => m.t === 'catch').length > catchBefore, 3000);
  }
  ok('S walks south to the south lane', await walkTo(s1, 27*TILE+16, 18*TILE+16, 8000));
  ok('S walks west below the church', await walkTo(s1, 21*TILE+16, 18*TILE+16, 8000));
  ok('S walks west to the dock lane', await walkTo(s1, 17*TILE+16, 18*TILE+16, 8000));
  ok('S walks to the dock', await walkTo(s1, DOCK.x, DOCK.y, 8000));
  ok('S catches a fish', await catchFish(s1));
  ok('S catches another fish', await catchFish(s1));
  ok('the Old Garden wakes — quietly, through play', await s1.waitFor(() => s1.lastOf('restore')?.restore?.stage === 'awake', 4000),
     JSON.stringify(s1.lastOf('restore')?.restore));
  ok('garden reads waking (first green, not the full bloom)', s1.lastOf('restore')?.restore?.garden === 'waking',
     s1.lastOf('restore')?.restore?.garden);
  ok('no garden-bloom fanfare yet (the rhythm was not lived)', !s1.msgs.some(m => m.t === 'garden-bloom'));

  const s2 = new C('Latecomer'); await s2.connect();
  s2.send({ t: 'join', name: 'Latecomer', code: s1.state.code });
  ok('late joiner sees the same waking town', await s2.waitFor(() => s2.lastOf('joined')?.restore?.stage === 'awake', 3000),
     JSON.stringify(s2.lastOf('joined')?.restore));
  // STORY-FIX G4: play-again is a post-ending beat — tapped mid-run it is
  // ignored, never a world wipe. (The "reset dims the town again" beat now
  // lives in 7f, after a real ending.)
  s1.send({ t: 'play-again' });
  ok('play-again ignored mid-run (no ending yet)', await sleep(1500).then(() => !s1.msgs.some(m => m.t === 'reset') && !s2.msgs.some(m => m.t === 'reset')));
  s1.close(); s2.close();

  // ---------- TOWN-LIFE (a): daily schedules + work spots ----------
  // Deterministic per-day schedules keyed off the synced day counter + phase.
  console.log('town-life schedules:');
  process.env.PORT = '18791';   // the imported module binds its own listener
  const TL = await import('../server.js');
  const DAYMS = 480000; // default DAY_MS inside the imported module
  const fakeRoomAt = (n, frac) => ({ day: { n, start: Date.now() - frac * DAYMS } });
  const slotEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  ok('schedule is deterministic (same inputs, same slot)',
     slotEq(TL.townSlot('Hannah', 2, 'day', 0.30), TL.townSlot('Hannah', 2, 'day', 0.30)));
  const wake = TL.townSlot('Hannah', 2, 'morning', 0.01);
  ok('morning wake: at home', wake.key === 'wake|2' && wake.act === 'wake' &&
     JSON.stringify(wake.waypoints) === JSON.stringify([[11,11]]), JSON.stringify(wake));
  const gowork = TL.townSlot('Elias', 2, 'morning', 0.15);
  ok('morning commute: to the work spot', gowork.key === 'gowork|2' && gowork.act === 'carry' &&
     JSON.stringify(gowork.waypoints[gowork.waypoints.length-1]) === JSON.stringify([16,11]), JSON.stringify(gowork));
  const workE = TL.townSlot('Elias', 2, 'day', 0.30), workH = TL.townSlot('Hannah', 2, 'day', 0.30),
        workM = TL.townSlot('Miriam', 2, 'day', 0.30), workN = TL.townSlot('Pastor Nathan', 2, 'day', 0.30);
  ok('day work: vendor behind the stall', workE.key === 'work|2' && workE.act === 'serve' &&
     JSON.stringify(workE.waypoints) === JSON.stringify([[16,11]]), JSON.stringify(workE));
  ok('day work: café keeper behind the counter', workM.act === 'serve' &&
     JSON.stringify(workM.waypoints) === JSON.stringify([[15,16]]), JSON.stringify(workM));
  ok('day work: gardener tends the beds', workH.act === 'tend', JSON.stringify(workH));
  ok('day work: pastor welcomes at the church door', workN.act === 'idle' &&
     JSON.stringify(workN.waypoints) === JSON.stringify([[30,16]]), JSON.stringify(workN));
  const lunch = TL.townSlot('Hannah', 2, 'day', 0.45);
  ok('midday lunch break (sit, eat)', lunch.key === 'lunch|2' && lunch.act === 'lunch' &&
     JSON.stringify(lunch.waypoints) === JSON.stringify([[19,15]]), JSON.stringify(lunch));
  const bustle = TL.townSlot('Elias', 4, 'day', 0.55);
  ok('market day (day 4): afternoon bustle at the stalls', bustle.key === 'bustle|4' && bustle.act === 'browse' &&
     JSON.stringify(bustle.waypoints) === JSON.stringify(TL.TOWN_SCHEDULE['Elias'].marketWp), JSON.stringify(bustle));
  const aft2 = TL.townSlot('Hannah', 2, 'day', 0.55), aft3 = TL.townSlot('Hannah', 3, 'day', 0.55);
  ok('ordinary afternoons alternate deterministically', aft2.key === 'afternoon|2' && aft3.key === 'afternoon|3' &&
     !slotEq(aft2, aft3), JSON.stringify(aft2.waypoints) + ' vs ' + JSON.stringify(aft3.waypoints));
  const eve = TL.townSlot('Miriam', 2, 'sunset', 0.65);
  ok('sunset: heading home', eve.key === 'evening|2' && eve.act === 'stroll' &&
     JSON.stringify(eve.waypoints[eve.waypoints.length-1]) === JSON.stringify([26,18]), JSON.stringify(eve));
  const night = TL.townSlot('Miriam', 2, 'night', 0.85);
  ok('night: home, quiet (no sleep)', night.key === 'night|2' && night.act === 'home' &&
     JSON.stringify(night.waypoints) === JSON.stringify([[26,18]]), JSON.stringify(night));
  ok('unknown villager -> null slot', TL.townSlot('Nobody', 2, 'day', 0.3) === null);
  // every full-day route: waypoints walkable, every leg (transitions included)
  // clear of solids — villagers can never get stuck
  let wpBad = [], legBad = [];
  for (const name of Object.keys(TL.TOWN_SCHEDULE)) {
    for (const dayN of [2, 3, 4]) {
      const route = TL.townDayRoute(name, dayN);
      for (const [tx, ty] of route) {
        if (tx < 0 || ty < 0 || tx >= TL.WORLD_W || ty >= TL.WORLD_H || TL.isSolid(tx, ty, null)) wpBad.push(`${name} day${dayN} [${tx},${ty}]`);
      }
      for (let i = 0; i + 1 < route.length; i++) {
        const ax = route[i][0]*32+16, ay = route[i][1]*32+16, bx = route[i+1][0]*32+16, by = route[i+1][1]*32+16;
        const len = Math.hypot(bx-ax, by-ay), steps = Math.max(1, Math.ceil(len / 6));
        for (let k = 0; k <= steps; k++) {
          const px = ax + (bx-ax)*k/steps, py = ay + (by-ay)*k/steps;
          const tx = Math.floor(px/32), ty = Math.floor(py/32);
          if (TL.isSolid(tx, ty, null)) { legBad.push(`${name} day${dayN} leg ${i} [${route[i]}]->[${route[i+1]}] hits [${tx},${ty}]`); break; }
        }
      }
    }
  }
  ok('all schedule waypoints sit on walkable tiles', wpBad.length === 0, wpBad.slice(0,3).join('; '));
  ok('no schedule leg crosses a solid tile (villagers never get stuck)', legBad.length === 0, legBad.slice(0,3).join('; '));
  ok('day routes start and end at home', Object.keys(TL.TOWN_SCHEDULE).every(name => {
    const r2 = TL.townDayRoute(name, 2), home = TL.TOWN_SCHEDULE[name].home;
    return JSON.stringify(r2[r2.length-1]) === JSON.stringify(home);
  }));
  // sermon schedule is untouched: day 1 and day 8 are sermon days, day 2/4 are not
  const nowS = Date.now();
  ok('sermon day 1 morning: service active (preserved)', TL.sermonActive(fakeRoomAt(1, 0.05), nowS) === true);
  ok('sermon day 8 morning: service active (preserved)', TL.sermonActive(fakeRoomAt(8, 0.30), nowS) === true);
  ok('day 2 is not a sermon day', TL.sermonActive(fakeRoomAt(2, 0.10), nowS) === false);
  ok('market day 4 is not a sermon day', TL.sermonActive(fakeRoomAt(4, 0.30), nowS) === false);
  // shop hours + market day flag
  ok('market day is day 4 (mod 7)', TL.marketDayActive({ day: { n: 4 } }) === true && TL.marketDayActive({ day: { n: 11 } }) === true);
  ok('day 1/2 are not market days', TL.marketDayActive({ day: { n: 1 } }) === false && TL.marketDayActive({ day: { n: 2 } }) === false);
  const sh = (n, frac) => TL.shopHours(fakeRoomAt(n, frac), Date.now());
  ok('stalls open mornings + days', sh(2, 0.10).stalls === 'open' && sh(2, 0.40).stalls === 'open');
  ok('stalls closed at sunset (ordinary day), café open', sh(2, 0.65).stalls === 'closed' && sh(2, 0.65).cafe === 'open');
  ok('both closed at night', sh(2, 0.85).stalls === 'closed' && sh(2, 0.85).cafe === 'closed');
  ok('market day: stalls stay open into sunset', sh(4, 0.65).stalls === 'open');
  // npcScheduleTick drives targets + act
  const schedRoom = { day: { n: 2, start: Date.now() }, npcMoved: false,
    npcs: [{ name: 'Hannah', x: 0, y: 0, tx: 0, ty: 0, act: 'idle', slotKey: '', wpIdx: 0 }] };
  TL.npcScheduleTick(schedRoom, Date.now());
  const hn = schedRoom.npcs[0];
  ok('schedule tick sends Hannah home to wake (morning)', hn.act === 'wake' && hn.tx === 11*32+16 && hn.ty === 11*32+16,
     `act=${hn.act} tx=${hn.tx} ty=${hn.ty}`);
  // npcChatTick: close villagers pause and share a warm line (settled slots only)
  const sent = [];
  const mockWs = { readyState: 1, send: (s) => sent.push(JSON.parse(s)) };
  const chatRoom = { day: { n: 2, start: Date.now() }, restore: { gatherUntil: 0 }, npcChatCd: {}, sockets: new Set([mockWs]),
    npcs: [
      { name: 'Hannah', x: 100, y: 100, tx: 100, ty: 100, chatUntil: 0, slotKey: 'work|2' },
      { name: 'Elias', x: 120, y: 110, tx: 120, ty: 110, chatUntil: 0, slotKey: 'work|2' },
    ] };
  TL.npcChatTick(chatRoom, Date.now());
  ok('villagers crossing paths pause to chat', chatRoom.npcs[0].chatUntil > Date.now() && chatRoom.npcs[1].chatUntil > Date.now());
  ok('chat cooldown recorded per pair', Object.keys(chatRoom.npcChatCd).length === 1);
  const ncMsg = sent.find(m => m.t === 'npc-chat');
  ok('npc-chat broadcast names both villagers + a warm line',
     !!ncMsg && ncMsg.a === 'Hannah' && ncMsg.b === 'Elias' && typeof ncMsg.line === 'string' && ncMsg.line.length > 10,
     JSON.stringify(ncMsg));
  ok('ambient chat lines are warm, never preachy',
     !!ncMsg && !/repent|sin|hell|damn/i.test(ncMsg.line) && TL.NPC_CHAT_LINES.every(l => !/repent|sin|hell|damn/i.test(l)));
  const commuteRoom = { day: { n: 2, start: Date.now() }, restore: { gatherUntil: 0 }, npcChatCd: {}, sockets: new Set(),
    npcs: [
      { name: 'Hannah', x: 100, y: 100, tx: 100, ty: 100, chatUntil: 0, slotKey: 'gowork|2' },
      { name: 'Elias', x: 120, y: 110, tx: 120, ty: 110, chatUntil: 0, slotKey: 'gowork|2' },
    ] };
  TL.npcChatTick(commuteRoom, Date.now());
  ok('no chats during the morning commute (villagers hurry to work)', commuteRoom.npcs[0].chatUntil === 0 &&
     Object.keys(commuteRoom.npcChatCd).length === 0);
  const farRoom = { day: { n: 2, start: Date.now() }, restore: { gatherUntil: 0 }, npcChatCd: {}, sockets: new Set(),
    npcs: [
      { name: 'Hannah', x: 100, y: 100, tx: 100, ty: 100, chatUntil: 0, slotKey: 'work|2' },
      { name: 'Elias', x: 900, y: 800, tx: 900, ty: 800, chatUntil: 0, slotKey: 'work|2' },
    ] };
  TL.npcChatTick(farRoom, Date.now());
  ok('distant villagers do not chat', farRoom.npcs[0].chatUntil === 0 && Object.keys(farRoom.npcChatCd).length === 0);
  const sermonRoom = { day: { n: 1, start: Date.now() }, restore: { gatherUntil: 0 }, npcChatCd: {}, sockets: new Set(),
    npcs: [
      { name: 'Hannah', x: 100, y: 100, tx: 100, ty: 100, chatUntil: 0 },
      { name: 'Elias', x: 120, y: 110, tx: 120, ty: 110, chatUntil: 0 },
    ] };
  TL.npcChatTick(sermonRoom, Date.now());
  ok('no ambient chats during the sermon (reverent quiet)', sermonRoom.npcs[0].chatUntil === 0);
  // greetings picker
  ok('morning greeting is warm and plain by tier',
     TL.townGreeting('morning', false) === TL.TOWN_GREETS.morning[0] &&
     TL.townGreeting('morning', true) === TL.TOWN_GREETS.morning[1]);
  ok('unknown phase falls back to day greeting', TL.townGreeting('eclipse', false) === TL.TOWN_GREETS.day[0]);
  ok('no greeting invents Scripture', Object.values(TL.TOWN_GREETS).flat().every(t => !/jeremiah|psalm|john \d|saith the lord/i.test(t)));

  // over the wire: on an ordinary day the vendor works the stall
  const tl = new C('Towny'); await tl.connect();
  tl.send({ t: 'create', name: 'Towny' });
  ok('town-life room created', await tl.waitFor(() => !!tl.state.code, 3000));
  // Ariel (2026-10-04): no sleep — days roll over on their own clock (45 s in tests).
  ok('day rolls over to ordinary day 2 on its own clock', await tl.waitFor(() => (tl.lastOf('day')?.n || 0) === 2, 90000));
  ok('day payload carries shop hours + market-day flag', await tl.waitFor(() => {
    const d = tl.lastOf('day');
    return !!d && d.shops && (d.shops.stalls === 'open' || d.shops.stalls === 'closed') &&
      (d.shops.cafe === 'open' || d.shops.cafe === 'closed') && typeof d.marketDay === 'boolean';
  }, 4000), JSON.stringify(tl.lastOf('day')?.shops));
  ok('day 2 is not market day', tl.lastOf('day')?.marketDay === false);
  ok('npc payload carries the idle activity', tl.state.npcs.size === 4 &&
     [...tl.state.npcs.values()].every(n => typeof n.act === 'string'), JSON.stringify([...tl.state.npcs.values()].map(n => n.act)));
  ok('vendor works the stall in the day phase', await (async () => {
    if (!await tl.waitFor(() => tl.lastOf('day')?.phase === 'day', 30000)) return false;
    return tl.waitFor(() => {
      const e = tl.state.npcs.get('Elias');
      return !!e && e.act === 'serve' && Math.hypot(e.x - (16*TILE+16), e.y - (11*TILE+16)) < 90;
    }, 25000);
  })(), JSON.stringify({ x: tl.state.npcs.get('Elias')?.x, y: tl.state.npcs.get('Elias')?.y, act: tl.state.npcs.get('Elias')?.act }));
  // greeting: first talk of the day uses the time-of-day greeting, heart mechanic untouched.
  // (no sleep inside anymore — home enter/exit still works)
  ok('home enter and exit still work', await (async () => {
    await walkTo(tl, 8*TILE+16, 12*TILE+16, 8000);
    tl.send({ t: 'interact' });
    if (!await tl.waitFor(() => tl.me()?.inside === true, 3000)) return false;
    await walkTo(tl, 32*TILE+16, 24*TILE+16, 8000);
    tl.send({ t: 'interact' });
    return tl.waitFor(() => tl.me()?.inside === false, 3000);
  })());
  ok('first talk of the day greets (time-of-day)', await (async () => {
    const phase = tl.lastOf('day')?.phase || 'day';
    let sayG = null;
    for (let attempt = 0; attempt < 3 && !sayG; attempt++) {
      const h = tl.state.npcs.get('Hannah');
      if (!h) return false;
      await walkTo(tl, h.x, h.y, 8000);
      const before = tl.msgs.filter(m => m.t === 'say').length;
      tl.send({ t: 'interact' });
      sayG = await tl.waitFor(() => tl.msgs.filter(m => m.t === 'say').length > before, 2500) ? tl.lastOf('say') : null;
    }
    if (!sayG) return false;
    const greets = Object.values(TL.TOWN_GREETS).flat();
    tl._greetSay = sayG; tl._greetPhase = phase;
    return greets.includes(sayG.text) && sayG.hearts === 1;
  })(), JSON.stringify(tl._greetSay));

  // ---------- TOWN-LIFE (d): market day wire check (rollover to day 4) ----------
  // Ariel (2026-10-04): no sleep — two more rollovers -> day 4 -> the market
  // gathers (flag syncs to the village).
  ok('day rolls over to day 4 (market day)', await (async () => {
    if (!await tl.waitFor(() => (tl.lastOf('day')?.n || 0) === 3, 90000)) return false;
    return tl.waitFor(() => (tl.lastOf('day')?.n || 0) === 4, 90000);
  })());
  ok('market day flag syncs to the village', tl.lastOf('day')?.marketDay === true,
     JSON.stringify({ n: tl.lastOf('day')?.n, marketDay: tl.lastOf('day')?.marketDay }));
  tl.close();

  // ---------- TOWN-LIFE (b): shop open/closed states (static page) ----------
  console.log('town-life shops (static page):');
  const shopChecks = [
    ['shop sign painter', 'function shopSignTile'],
    ['open sign tile', 'signOpenTile'],
    ['closed sign tile', 'signShutTile'],
    ['closed sign text', "'CLOSED'"],
    ['open sign text', "'OPEN'"],
    ['sign board idiom (navy)', '#1a2340'],
    ['sign board idiom (gold frame)', '#d4a940'],
    ['pulled shutter tile', 'stallShutterTile'],
    ['shutter slats', 'pulled timber shutter'],
    ['market-day bunting tile', 'marketBuntingTile'],
    ['bunting swag string', 'sagging string'],
    ['stall hours render gate', "day.shops.stalls !== 'closed'"],
    ['cafe hours render gate', "day.shops.cafe !== 'closed'"],
    ['market-day bunting render gate', 'day.marketDay'],
    ['no transaction changes', 'Living feel only'],
  ];
  for (const [label, needle] of shopChecks) ok('page contains ' + label, pageHtml.includes(needle));

  // ---------- TOWN-LIFE (c): greetings + ambient chats + idle life (static page) ----------
  console.log('town-life idle life (static page):');
  const idleChecks = [
    ['npc-chat message handler', "case 'npc-chat':"],
    ['npc chat state', 'let npcChat = null'],
    ['ambient chat toast', "m.a + ' & ' + m.b"],
    ['idle activity glyph', 'actEmoji'],
    ['carry basket glyph', "'🧺'"],
    ['serve bread glyph', "'🍞'"],
    ['tend sprout glyph', "'🌿'"],
    ['lunch meal glyph', "'🍲'"],
    ['resting seated render', 'seatedStill'],
    ['chat bubble for npc chats', 'chattingNpc'],
  ];
  for (const [label, needle] of idleChecks) ok('page contains ' + label, pageHtml.includes(needle));

  // ---------- TOWN-LIFE (d): market day + evening/night + morning cue (static page) ----------
  console.log('town-life market day & rhythms (static page):');
  const rhythmChecks = [
    ['morning wake cue', 'Good morning — the village wakes.'],
    ['phase transition detector', 'lastPhaseSeen'],
    ['cue is pastoral, not an alarm', 'never an alarm'],
    ['morning cue chime', 'chime();'],
  ];
  for (const [label, needle] of rhythmChecks) ok('page contains ' + label, pageHtml.includes(needle));

  // ---------- FOOD-ART (2026-10-03): visible food, storybook style (static page) ----------
  console.log('food-art (static page):');
  const foodChecks = [
    ['food-art marker', 'FOOD-ART-2026-10-03'],
    ['food painter lib', 'function paintApple'],
    ['bread painter', 'function paintBreadLoaf'],
    ['cheese wheel painter', 'function paintCheeseWheel'],
    ['fish painter', 'function paintFish'],
    ['steam painter', 'function paintSteam'],
    ['stall produce painter', 'function stallProduceTile'],
    ['stall produce variants', 'stallProduceTiles[i]'],
    ['stall produce render gate', 'day.shops.stalls'],
    ['harvest crate painter', 'function harvestCrateTile'],
    ['harvest crate spots', '[12,15,0]'],
    ['cafe table food painter', 'function cafeTableFoodTile'],
    ['cafe tables render gate', 'cafeTableFoodTiles'],
    ['home kitchen food tile', 'homeKitchenFoodTile'],
    ['home kitchen table gate', 'tx===35 && ty===24'],
    ['dish sprite painter', 'function dishSprite'],
    ['dish stew', 'Harvest Stew'],
    ['dish trout', 'Sun-Baked Trout'],
    ['dish loaf', 'Harvest Loaf'],
    ['dish tart', 'Sunberry Tart'],
    ['cook panel dish strip', 'function dishStripHtml'],
    ['cook fx hook', 'function foodCookFx'],
    ['eat fx hook', 'function foodEatFx'],
    ['gift fx hook', 'function foodGiftFx'],
    ['food fx draw', 'function drawFoodFx'],
    ['food fx in render loop', 'drawFoodFx(ctx, now)'],
    ['villager lunch visuals', 'function drawLunchFood'],
    ['lunch act gate', "idleAct === 'lunch'"],
    ['picnic blanket tile', 'picnicBlanketTile'],
    ['picnic market-day gate', 'tx===20 && ty===16 && day.marketDay'],
    ['placement rule: no food on random tiles', 'NO food scattered'],
    ['placement rule: church stays clean', 'in the church, in the Garden of Hope'],
  ];
  for (const [label, needle] of foodChecks) ok('page contains ' + label, pageHtml.includes(needle));

  [a, b, c, d, k, v2, v3, i2, h2, f1, ...fillers].forEach(x => x.close());
} finally {
  srv.kill('SIGTERM');
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
