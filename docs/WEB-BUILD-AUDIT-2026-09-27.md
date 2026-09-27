# TIKVAH — WEB BUILD AUDIT (Track A)

**Date:** 2026-09-27
**Auditor:** ini (Prompt 1 of the joint ini + ChatGPT plan)
**Scope:** Audit only. No code was changed.
**Build root:** `~/workspace/tikvah-game/track-a/`
**Commit audited:** `4ed2039` (life-sim sprint)
**Live URL:** https://project-tikvah-production.up.railway.app/ — verified live 2026-09-27, serving the audited build
**Tests:** `node test/track-a-test.mjs` → **111 passed, 0 failed** (fresh run during this audit)

---

## 1. Architecture

| Layer | Choice | Notes |
|---|---|---|
| Server | Node.js 18+ (`node:>=18`), `ws` ^8.22.0 only dependency | Single file `server.js` (701 lines) |
| Client | Single-file `public/index.html` (1151 lines), HTML5 canvas, vanilla JS | No build step, no framework, no assets |
| Art | 100% procedural pixel art drawn in code | Zero licensing risk, coherent-by-construction |
| Audio | 100% synthesized WebAudio (oscillators) | SFX only; no music loop; mute persisted in localStorage |
| Netcode | Server-authoritative; 20 Hz tick; clients send input vectors only (no client positions); speed cap 150 px/s enforced server-side | Anti-cheat by design |
| Rooms | In-memory `Map`, 4-letter codes (23-char unambiguous charset, ~280k combos), cap **2 players** (competition spec), 60 s empty-room grace for rejoin | No persistence across server restart |
| Rate limits | Per-IP 30 conns/10 s; per-socket 120 msgs/2 s; heartbeat ping/pong 30 s | Flood-tested |
| Deploy | Dockerfile (auto-detected), Railway `resilient-growth` / `project-tikvah`, production, branch `master`, root dir `track-a` | Zero cost; trial credit, no card |
| Tests | `test/track-a-test.mjs` (372 lines) — headless: spawns server, drives 2 ws clients through full flows | 111 asserts green ×3 consecutive runs |

**Verdict:** The architecture is exactly right for the competition: tiny, free, debuggable, server-authoritative. Nothing here needs replacing.

---

## 2. Feature inventory (everything that exists, verified in code + tests)

- **Landing:** name entry, Create Room / Join Room, 4-letter codes, kind error messages ("Room not found. Check the code and try again.")
- **Character creator:** skin (5) / hair style (4) / hair color (5) / outfit color (5) / tunic-or-dress / accessory (3), live pixel preview, name, persisted in `localStorage`, sent with create/join, validated server-side (`validLook`, bad looks rejected + tested), changeable in-game via home wardrobe (`t:'look'` broadcast)
- **World:** 40×28-tile village, labeled zones (Your House, Farms, Market, Café, Church, Forest, Ruins, River), plaza + fountain, bridge, dock, market stalls, lamps, trees, flowers, fences
- **Home interior:** enter via door; bed (sleep → advances shared day, resets rhythm), hearth (cooking), wardrobe (re-customize), rug (decorate color cycle), chair (sit), prayer nook, exit — interact spots on a 3-tile grid so 56 px zones never overlap
- **Day/night:** server-authoritative `dayPhase` (Morning/Day/Sunset/Night over an 8-min cycle), screen tint + lamp/window glow + stars, HUD "Day N · Phase", 1 s heartbeat broadcast
- **The point — day rhythm:** HUD tracks 5 shared acts (🌾 farm · 🎣 fish · 🍲 cook · 👋 greet · 🕯️ candle); completing all blooms the Garden of Hope (shared broadcast + particles + chime)
- **Farming:** 6 plots, plant → water → timed growth (45 s, env-overridable) → harvest; shared state; harvest gives produce + rhythm credit
- **Fishing:** dock, cast → random 3–7 s bite → 2.5 s catch window (banner "❗ BITE! Press E now!") → fish + rhythm credit; both players see casts/splashes
- **Cooking:** Harvest Stew (1 produce + 1 fish) at café counter or home hearth; Cook / Eat / **Give to nearby player or villager** (gift broadcast + chime)
- **Villagers:** Hannah (5 lines), Elias (3), Miriam (3) — wander their home radius, per-player friendship hearts (talk/give meals raise to 5), dialogue box, "true friend" toast at 3 hearts
- **Church:** enterable interior; pray (emote), verse stand (random of the 2 approved KJV verses, broadcast to **both** screens), candle stand (shared lit-candle count, cap 12, glow), **Worship moment** at altar when candles are lit (shared chord + light flash, 20 s cooldown)
- **Fox:** wanders the meadow, pettable (heart emote + toast) — cosmetic
- **Ruins:** 2 glowing stones at opposite map corners; server verifies **simultaneous occupancy** (40 px radius, 20 Hz) → garden opens for both ("Hope lives here — discovered together." + pad + particles)
- **Ending:** ruin open + both players in garden plaza → shared full-screen "The Garden of Hope" overlay on both clients + 7-note motif; **Play Again** resets farm/ruin/day/rhythm/candles/garden/rug/NPCs/inventories and respawns both at village center
- **Social:** wave/heart emotes (1/2 keys + touch buttons), synced to both screens
- **Mobile:** virtual joystick + E button + emote buttons, camera viewport (640×448 landscape / 480×600 portrait) follows player, touch-adapted tutorial/HUD
- **Safety:** input-vector only, speed cap, interact-range enforcement, per-IP + per-socket rate limits, malformed-packet survival (tested), room isolation (tested), static-file path-traversal guarded (reviewed — `normalize` collapses `..` before the strip, `join` keeps everything under `public/`)

---

## 3. Bugs found (code review, 2026-09-27)

| # | Severity | Finding |
|---|---|---|
| B1 | **Medium** | **No collision anywhere.** Players walk through trees, buildings, fences, the river, church pews/altar, and interior walls. Interiors have no boundaries — a player inside the church can walk off the drawn interior into endless floor tiles. This is the single biggest "prototype-rough" signal for the Polish judging criterion. |
| B2 | **Medium** | **Sleep griefing:** any player sleeping advances the shared day **and resets all 5 rhythm flags** — one player can wipe the other's progress toward the garden bloom with a single nap. Rhythm progress should arguably survive sleep, or sleep should require both players. |
| B3 | **Low** | Candle stand draws max **8** flame sprites but `MAX_CANDLES` is **12** — count and visual disagree past 8. |
| B4 | **Low** | Rejoin = fresh player: inventory, look (resets to `localStorage` copy, fine), and position reset to spawn. Crop/farm/room state persists, but **player inventory does not survive a disconnect**. QA A8/R4 only half-satisfied. |
| B5 | **Low** | Client has no auto-reconnect — `onclose` just toasts "Connection lost — refresh to rejoin." |
| B6 | **Low** | NPC dialogue index (`npc.line`) is shared across both players — two players talking to Hannah advance one shared line counter. Cosmetic. |
| B7 | **Low** | Bite UX: the "❗ BITE! Press E now!" banner shows, but pressing E away from the dock yields `interact-fail` and the 2.5 s window can expire silently. |
| B8 | **Info** | `maximum-scale=1, user-scalable=no` blocks pinch-zoom (accessibility). |
| B9 | **Info** | Church/home interiors: no transition fade or doorway framing when entering — the world just swaps. Fine functionally, slightly abrupt. |

No crashes, no desync paths, no security holes found. The netcode is the strongest part of this build.

---

## 4. Multiplayer weaknesses

1. **Meaningful co-op is thin outside the ruin moment.** Shared rhythm flags are per-room (good — either player can contribute), and meal-giving exists, but there is no *simultaneous* cooperation besides the stones, no shared discoveries log, no way to see what your partner is doing except proximity.
2. **No player-to-player communication** beyond wave/heart emotes. No chat (was N/A in plan; judges may expect at least emotes — present — but a 2-player co-op with zero text chat limits coordination, e.g. "stand on the other stone").
3. **Partner visibility:** no off-screen indicator of where the other player is; on a big map, finding your friend is luck. (Zone is small enough that this is minor.)
4. **Disconnect handling:** partner vanishes with only a silent `leave` (no toast — `leave` handler just deletes; the join has a toast, leave doesn't). A "X left the village" toast is missing.

---

## 5. Visual inconsistencies / polish gaps

1. **Art direction vs the design board:** the board is soft watercolor storybook; the game is crisp procedural pixel art. Cohesive *within itself*, but this is the known gap behind Ariel's "it has to look like that image" mandate. (Long-term: Track B / art pass. Not solvable for free before Oct 30 without an artist.)
2. **No background music** — only event SFX + footsteps. The ChatGPT spec calls for a "warm memorable pixel-RPG soundtrack"; currently silence between events. A gentle synthesized loop (WebAudio, zero assets) is the cheapest high-impact polish available.
3. **Zone labels** are always-on floating tags — functional but not beautiful; they read as debug labels, not storybook signage.
4. **Interiors lack framing:** no doorway transition, no "inside" lighting change beyond the day tint.
5. **NPCs/fox clip through decor** (no collision — same as B1).

---

## 6. Missing competition requirements (Handshake × OpenAI)

Judging: Execution 25 / Creativity 25 / Usefulness-Value 25 / Polish 25. Deadline Oct 30, 2026 11:59 PM PT.

| Requirement | Status |
|---|---|
| Public URL, playable now | ✅ DONE (Railway live, verified this audit) — **docs are stale:** REQUIREMENTS-MATRIX still says PLANNED |
| Room-code create/join, no logins, no installs | ✅ DONE, tested |
| 2-player co-op on separate devices | ⚠️ Code-tested only — **real two-device playtest (A7) never done** |
| First-time player experience | ⚠️ Text tutorial only — **no guided onboarding (A21/A22 untested)** |
| Mobile touch full-loop | ⚠️ Implemented — **never tested on a real phone (A18–A20)** |
| Reconnect | ⚠️ Partial (B4) |
| Screenshots + cover art + title + description | ❌ Not started |
| Submission itself | ❌ Not submitted (needs Ariel's exact approval) |

**Doc debt:** REQUIREMENTS-MATRIX.md Track A section predates the life-sim sprint (no rows for character creator, home, day/night, cooking, villagers, candles, rhythm/bloom) and still marks Public URL as PLANNED. DECISION-LOG.md stops at D8 (missing: room-cap-2 rationale already has D6; missing life-sim "point of the game" decision, ChatGPT joint-plan decision, preserve-don't-rebuild rule). QA-TEST-PLAN.md has no life-sim rows. For a judged competition, the paper trail should match the build.

---

## 7. Gap vs the design-board / ChatGPT vision (for calibration, not for Track A scope)

Present in vision, absent in web build: market/café commerce (visual only), seasons, weather, notebook/lexicon UI, Aramaic inscription (correctly omitted — placeholder-until-verified per faith constraint), creature *befriending* depth (fox is pet-only), NPC schedules/routines, festivals, dungeons, persistent profiles. **None of these are proposed for Track A** — they belong to the Godot/Xogot full-vision track per the joint plan.

---

## 8. Highest-impact improvements — ranked per the mandated priority order

**P1 — Preserve multiplayer stability (do first, do not break)**
1. Add tile/wall collision (B1) — the one change that moves "prototype" → "game" for Execution/Polish. Must be server-authoritative (position clamp in `tickRoom`) + client-side prediction match, with full 111-test regression green after.
2. Fix sleep griefing (B2) — rhythm progress survives sleep, or sleep needs both players' consent.
3. "X left the village" toast (leave handler) — 3 lines, prevents confusion mid-co-op.

**P2 — First-time player experience**
4. Guided first-60-seconds: Hannah greets on first join and walks the player through move → farm → fish → "find the ruin with a friend" (skippable, re-playable). Replaces/augments the text block.
5. Contextual interact prompts ("[E] Talk to Hannah", "[E] Plant") — the client already knows proximity; showing the verb removes all guessing.

**P3 — Visual polish**
6. Gentle synthesized background music loop (WebAudio, zero assets, mute-respecting) — day/night variation if cheap.
7. Interior enter/exit transition (fade + doorway framing).
8. Storybook zone signage to replace floating debug labels (cheap: wooden-sign sprites).
9. Candle flames 8 → 12 to match `MAX_CANDLES` (B3).

**P4 — Meaningful multiplayer interactions**
10. Off-screen partner indicator (arrow + name at screen edge).
11. Shared "discoveries" toasts already exist for bloom/ruin — extend: first-harvest/first-catch/first-candle each get a shared celebration once per day.
12. Quick-chat: 6 preset phrases (e.g. "Follow me!", "Stand on the other stone ✨", "Let's cook!") — no free text (keeps it safe/moderation-free), solves coordination without full chat.

**P5 — Emotional impact**
13. Garden bloom cinematic beat: slow particle bloom + the verse (Jeremiah 29:11, already approved) on a shared card — the emotional peak the whole rhythm builds toward currently passes in a toast.
14. Sunset "village settles" moment: lamps light, windows glow (partially exists), café warms — mostly present; tie a soft chime to phase changes.

**P6 — Competition demo readiness**
15. Real two-device playtest (A7: phone+phone, phone+desktop) + full loop on a phone (A20).
16. Doc sync: update REQUIREMENTS-MATRIX (life-sim rows, Public URL → PASSED), DECISION-LOG (D9+), QA-TEST-PLAN (life-sim rows).
17. Screenshots + cover art + title + description, then submission with Ariel's exact approval.

**Explicitly NOT proposed:** removing any system, rebuilding, paid services, third-party assets, new Scripture, Aramaic glyphs, or Track B scope in Track A.

---

## 9. Exact implementation plan (next build — for coordinator scheduling)

**Batch 1 — Stability + fairness (netcode-safe, test-guarded):**
1. Server: add `SOLID` tile set (building walls, trees, fences, water/river except bridge, interior borders); clamp movement in `tickRoom` after speed integration (slide or stop); export solids for tests. Client: same clamp for prediction (or accept server correction — simpler: client clamps identically).
2. Server: sleep no longer resets `rhythm`; instead each new day requires the *day's* rhythm anew (already the case — just stop wiping flags; bloom stays once bloomed). One-line change + test.
3. Client: `leave` → toast "X left the village 🌿".
4. Run full suite → must stay 111/111; add asserts: solid-tile block, sleep-keeps-rhythm, leave-toast is client-only (manual).

**Batch 2 — First-time experience:**
5. Hannah greeting sequence on first join (client-side `localStorage` flag `tikvah_seen_intro`): 3 dialogue beats pointing at farm → dock → ruin hint; skippable with E.
6. Contextual `[E] verb` prompt: client computes nearest interactable each 200 ms (mirrors server priority order) and shows a small prompt above the E button.

**Batch 3 — Polish:**
7. WebAudio ambient loop: soft pad arpeggio, day/night filter shift, starts on first user gesture, obeys mute.
8. Fade transition on interior enter/exit (reuse `#fade`).
9. Candle flames to 12.

**Batch 4 — Multiplayer meaning:**
10. Partner edge indicator.
11. Quick-chat preset phrases (broadcast, no free text).

**Batch 5 — Readiness:**
12. Two-device playtest with Ariel; fix what surfaces; doc sync; screenshots/cover/submission copy.

Each batch: implement → `node test/track-a-test.mjs` green → push → Railway auto-deploys → smoke-test live URL. Estimated: Batches 1–4 are each a single focused build session; Batch 5 needs Ariel.

---

*End of audit. No code changed. Tests re-verified green (111/111) during this audit.*
