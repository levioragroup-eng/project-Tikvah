# TIKVAH 2.0 — Functional Spec (Godot rebuild)

**Source:** audited from `track-a/` (the live HTML5 Canvas2D + Node prototype), which is
the functional prototype for this rebuild. `track-a/` is READ-ONLY — do not modify it;
carry its behavior forward into Godot 4.x / GDScript.

**Build context:** branch `godot-2.0`, folder `godot/`. Godot 4.x, GDScript, 640×360
Compatibility renderer, all art 100% original (procedurally generated pixel sprites —
nothing copied from elsewhere). 2–4 player server-authoritative co-op via room codes.
`track-a/public/verses.json` is reused **byte-identical** in the Godot build.

**Competition target:** "THE FIRST LIGHT" — a ~30-minute non-linear mystery (non-linear:
acts can be lived in any order); the Handshake × OpenAI challenge entry is a 2-player
co-op via room codes (deadline Oct 30, 2026). `track-a`/`master` remains the fallback entry.

---

## 0. STANDING DIRECTIVES (never violate)

1. **Jesus Christ is the Light — the player is NOT the savior.** The Discovery moment at
   the ruins witnesses this: players restore a *community*, never save the world.
2. **Pastor Nathan is male.** His appearance spec (§2) is fixed.
3. **NO candle-lighting** — the church candle stand was removed; no candle verbs anywhere.
4. **NO sleep mechanic** — days roll over on their own clock; the home bed is furniture only.
5. **Scripture ONLY from the verified KJV pool** (`verses.json`, 46 verses) plus the 3 core
   verses byte-identical. No invented Scripture anywhere. Storyline/sermon/blessing texts
   are bound to the 3 core verses (§8).
6. **All art 100% original.**
7. **$0 spend** — no paid assets, services, or dependencies.

---

## 1. Multiplayer

### 1.1 Transport & authority
- WebSocket (track-a: Node `ws`; Godot: WebSocketClient/WebSocketServer or equivalent).
- **Server-authoritative:** movement, collision, farm/fish/cook/church/NPC/story/restore
  state all live on the server; clients render and send intents (`input`, `interact`,
  `cook`, `emote`, `quickchat`, `set-look`, `play-again`, `epilogue-done`).
- Tick rates: **20 Hz movement** (position integrate + collide at 1/20 s steps), **1 Hz
  day/night heartbeat** (day phase, day rollover, crop growth, fox wander, ruin stones,
  restore progression, NPC scheduling).
- Max speed enforced server-side: **150 px/s**. Movement: axis-separated collision slide
  (try x, then y — players glide around obstacles, never stick).

### 1.2 Identity
- No logins/accounts (competition forbids accounts). Client generates a **UUID** once,
  stores it in `localStorage` (`tikvah_uuid`), sends it on every create/join.
- Server issues a UUID to clients that send none, and returns it in the `joined` payload
  so the client can store it.
- Server player record keyed by UUID: `{ name, look, inventory }`. **Rejoin with the
  same UUID restores name, appearance, and inventory** (inventory: produce/fish/meals).
- NPC friendship hearts are keyed by UUID, so friendships persist across reconnects
  (within a server run; Railway's disk is ephemeral — a server restart resets identities).

### 1.3 Rooms & room codes
- Codes are **4 letters** from `ABCDEFGHJKMNPQRSTUVWXYZ` (no I, L, O — confusable), e.g.
  `QZKD`. Random per private room, collision-checked.
- **Public village:** fixed code **`TIKVAH`**, created at server startup, **never reaped**;
  farm, ruin, day, rhythm, garden, NPC hearts persist in server memory while the server
  runs. Client offers an "Enter the Village" button.
- **Private rooms:** random 4-letter code; reaped when empty (60 s reap on empty).
- Room cap: track-a allows **10**; the Godot 2.0 target is **2–4 players** (tune the cap;
  protocol identical).
- Join flow: title screen → character creator → room choice (**create** / **join with
  code**, no accounts) → server `joined` payload → game shows.
- `joined` snapshot carries everything: `code`, `uuid`, `you`, `players[]`, `farm`,
  `ruin`, `ending`, `fox`, `npcs`, `day`, `garden`, `restore`, `story`, `home.rug`.
- New player → broadcast `join` with a join notice: *"A traveler has arrived in Tikvah.
  {name} has joined the village."*
- Rejoin position restore: verified in track-a (railway-probe) — restore the saved
  position on rejoin.
- `play-again`: in the public village it is a **personal reset only** (spawn, clear
  inventory/emotes; shared world state — farm, ruin, day, rhythm, garden, NPC hearts —
  is NEVER wiped). In private rooms it resets the shared world, but **only after the
  ending has been lived** (early tap is ignored — never a mid-game wipe).

### 1.4 State-sync messages (server → clients)
`player`, `tick` (players + NPCs), `day`, `farm`, `fox`, `ruin`, `ruin-open`, `restore`,
`story`, `story-toast`, `verse`, `say` (NPC speech + hearts), `npc-chat` (ambient),
`quickchat`, `harvest`, `catch`, `cooked`, `ate`, `gift`, `worship`, `sermon-peace`,
`pet`, `bite`, `decor` (home rug), `garden-bloom`, `gate-restored`, `discovery`,
`ending`, `epilogue-done`, `menu` (cook/creator panels), `cook-fail`, `dispute`
(choice dialogue), `error`, `leave`, `reset-personal`.

**Multiplayer implication:** every state change that matters (farm stage, fox position,
ruin stones, restore stage, story progress, lanterns, hearts, inventory) is
server-owned and broadcast; clients never predict these. Multiple players contribute
to shared counters (warmth acts, gate repairs); cooldowns and once-per keys are
server-side (e.g. `sermonPeace` per uuid per sermon, quick-chat 2 s cooldown).

---

## 2. Character creator

Players are called **travelers** in-game.

### 2.1 Categories (from `LOOK_ENUMS` / `LOOK_OPTS`)
| Category | Options |
|---|---|
| skin | 5 swatches: `#f2c99a`, `#e0ac7e`, `#c68a5a`, `#9a6540`, `#6e452a` |
| hair | `long`, `short`, `curly`, `bun` (mini visual head thumbnails) |
| hairColor | 5 swatches: `#2e1c10`, `#4a2c14`, `#8a5a2b`, `#d9c08a`, `#a34a2e` |
| outfit | 5 colors: `#4a8ac9`, `#c96a4a`, `#6aa84f`, `#9a6ac9`, `#c9a44a` (torso thumbnail) |
| dress | `Tunic` / `Dress` (body thumbnail) |
| accessory | `none`, `hat`, `flower` (head thumbnail) |
| name | max **16 chars** (sanitized; mirrors the room-panel name field — same value, same save) |

- Category tabs; **one category open at a time**; choices are visual swatches/thumbnails,
  not text radios. Live full-sprite preview.
- Saved to `localStorage` (`tikvah_look`); invalid saved values are rejected, defaults used.
- In-game **wardrobe** at home interior tile (32,21) reopens the creator as an overlay
  (no rename tab in-game). Client sends `set-look`; **server validates** the look and
  rejects invalid (`bad-look` error).

### 2.2 Pastor Nathan (fixed spec)
- Male. skin `#6e452a`, **short** hair, hairColor `#3a2a18`, outfit **cream `#f5efdd`**,
  tunic (dress=false), accessory `none`.
- **Deep-gold pastoral stole `#c9a44a`** drawn over the cream robe.
- During the sermon a soft **gold preaching glow** renders behind his nameplate.
- Lines (5, Scripture-bound — Psalm 23:1 quoted byte-identical): welcomes travelers,
  announces sermon days ("morning till afternoon… come sit a while"), speaks of the
  returning light, gives peace blessings.

---

## 3. World

### 3.1 Map
- **56 × 40 tiles, 32 px tiles** (world 1792 × 1280 px).
- Tile kinds (server `baseKind` ↔ client `baseTile`, **must mirror exactly** on all 2240
  tiles — Phase-A test asserted client baseTile == server baseKind everywhere):
  `grass`, `water`, `sand`, `bridge`, `plaza`, `path`.
- Key regions (tiles):
  - **River** along bottom: ty 21–24 water (tx 19–21 = stone bridge); ty 20/25 sand
    banks (bridge column stays walkable).
  - **Town square / plaza:** tx 17–22, ty 13–17, with the **fountain** at (20,15) — the
    fountain tile is a solid anchor; prayer-circle stones/flowers render around it
    after the gate is restored.
  - **Home:** house rect x 7–10, y 9–11 (solid from outside); door at (8,12). Interior
    room: tx 29–37, ty 18–25 (walls); exit at (32,24); **hearth** (35,18, cook spot);
    **wardrobe** (32,21, opens creator); **rug** (29,21, E cycles 4 rug styles, synced);
    **sit spot** (35,21); **pray nook** (32,18); bed is **furniture only** (no sleep).
  - **Farm:** rect x 5–11, y 14–18 (southwest fields); fence on the rect border with a
    north gate gap at (8,14); **6 plots** at (6,15), (8,15), (10,15), (6,17), (8,17),
    (10,17).
  - **Market:** stalls at (14,10), (16,10), (18,10) — solid; market-day bustle
    (day≡4 mod 7, see §9/§10).
  - **Café:** rect x 14–16, y 13–15 (west of the plaza); **counter** at (15,16) — cook
    spot; red-and-white striped patio parasols + tables.
  - **Church:** rect x 28–32, y 9–14 (solid from outside); door at (30,15). Interior
    room: tx 15–25, ty 18–25 (walls); exit (20,24); **altar** (20,20, solid; pray spot);
    **verse stand** (16,20, Read Scripture); **pray nook** (32,18); **pew rows**
    (ty 21/23, banks tx 16–18 and 22–24 are solid; the aisle sit gaps (19,21), (21,21),
    (19,23), (21,23) stay walkable — use tight sit range 20 px so sitting never
    misfires into praying).
  - **Forest:** west band (tx 0–4, ty 0–24), north bands, **Whispering Forest** east
    (tx 42–55, ty 8–22); waterfalls at (3,0–1) and (36,0–1).
  - **Ruins (NE):** stone A (6,5) in a forest clearing; stone B (34,5) in a ruins
    clearing; ruin arch (31,3); **fallen stones** at (33,4),(34,3),(33,5),(33,6),(34,6)
    block the ruin mouth until the co-op opens the way (decorative second arch at
    (50,4) in the Deep Ruins — no logic).
  - **Garden of Hope:** the plaza's north edge; the **Garden Gate arch** at (19,12)
    (walkable path tile); garden beds ring the fountain.
  - **Broken bridge planks** at (20,22) — the Mend trial spot (walkable while broken).
  - **Meadows & orchard (south):** Riverside Meadow (connector tx 12), Sunberry Meadow
    (connector tx 30; berry bushes at the listed spots), Old Orchard (connector tx 44;
    cherry trees in planted rows), meadow pond water at (31–32, 34–35) with a sand shore.
  - **Town lamps:** 6 at (17,12),(22,12),(19,17),(27,14),(13,16),(20,19) — relight order
    walks from the town's edges toward the plaza (sorted by distance from (20.5,15.5),
    farthest first).
- Spawn: (13,14).

### 3.2 Collision
- `isSolid(tx, ty, place)` with `place` ∈ {null(outside), 'church', 'home'}.
- Outside: out of bounds, water, tree tiles, fence tiles, church/home/café rects, stall
  tiles, fountain tile, fallen ruin stones (until the ruin gate opens).
- Server-authoritative, axis-separated slide (see §1.1).

### 3.3 Visual layer (from the Phase-A/B programs — render-only, keep behavior)
- **Y-depth sorting** of all tall objects (trees, church/home/café masses, stalls,
  fountain, lamps, pillars, ruin arches, garden gate, café tables) interleaved with
  players/NPCs/fox by base-y — travelers walk *behind* tree crowns and roofs.
- 4-phase lighting tints: morning warm peach, day faint afternoon gold, sunset
  pink/violet, night indigo.
- Animated water (vertical sun-reflection streaks), stone embankments along the river,
  terrain density (flowered meadow patches ~20% of grass, clover clusters, cherry-petal
  drifts under blossom trees — deterministic from tile coords).
- Winding lanes: market lane + south lane run in gentle S-curves.
- Landmark art: Gothic pointed-arch church portal (stone surround, wooden double doors,
  tracery, steps) at the church door tile; café parasols red/white striped.
- Environmental dressing: barrels, baskets, hay bales, signposts, fallen logs, moss
  patches, potted plants — render-only, walkable, no new collision.

**Multiplayer implication:** depth sort is client-side (position-driven); collision must
match the server's `isSolid` exactly, including interior walls.

---

## 4. Farming
- **6 plots** (§3.1). Cycle per plot, advanced by pressing E on the plot:
  1. `empty` → **plant** → `planted`
  2. `planted` → **water** → `growing` (timestamp recorded)
  3. `growing` → (time passes) → `ready`
  4. `ready` → **harvest** → `empty`, **+1 produce** to inventory
- Grow time: **45 s × season modifier** — Spring 0.8, Summer 1.0, Autumn 1.1,
  Winter 1.25. Server tick flips `growing`→`ready` and broadcasts farm state.
- Harvest: `setRhythm('farm')` (see §10), `contribute('farm')` (warmth, §13), broadcast
  `harvest`. Counts toward the **Nurture trial** (§12: 3 harvests after gate discovery,
  progress toasts at each).
- Nearest plot within interact range (56 px) wins.

**Multiplayer implication:** farm array is room-shared state; all players see the same
plot stages; harvests are atomic on the server.

---

## 5. Fishing
- **3 docks:** (17,20) river dock (south), (10,25), (34,25). Fishable from any dock.
- Flow: E at a dock → **cast** (rod state `cast`, server sets `biteAt = now + 3–7 s`
  random). While waiting, E returns `no-bite`. When the bite window opens (state
  `bite`, window **2.5 s**), E → **catch**: `fishing` cleared, **+1 fish** to inventory,
  `setRhythm('fish')`, `contribute('fish')`, broadcast `catch`.
- Client renders the cast state, bobber, and **fishing ripples** on the water.
- No bait item system in track-a (the task brief mentions bait/inspect — the audited
  code has **no bait or inspect mechanics**; treat bait/inspect as NEEDS CONTEXT or cut).

**Multiplayer implication:** per-player fishing state on the server; catches broadcast.

---

## 6. Cooking
- Cook spots: **home hearth** (35,18, inside home) and **café counter** (15,16). E opens
  the **Cooking panel**.
- Panel actions:
  - **Cook Harvest Stew** — costs 1 produce + 1 fish → +1 meal. Only this dish is
    cookable ("Cookable today: Harvest Stew").
  - **Eat a meal** — −1 meal, broadcast `ate`.
  - **Give a meal** — −1 meal; nearest other player within 110 px in the same
    space/place gets +1 meal (a meal cannot cross walls); else nearest NPC within
    110 px gets +1 heart and `contribute('give')` — **acts of service**. Broadcast
    `gift`.
- Cooking sets `setRhythm('cook')` and `contribute('cook')`; broadcast `cooked`.
- Dish gallery (procedural 16×16 sprites, display-only except Stew):
  `stew` — Harvest Stew (cookable); `trout` — Sun-Baked Trout; `loaf` — Harvest Loaf;
  `tart` — Sunberry Tart. **Dish names are Ariel-renameable** — Sun-Baked Trout /
  Harvest Loaf / Sunberry Tart are pending her approval (NEEDS CONTEXT: confirm names
  before finalizing copy).

---

## 7. Church
Church door (30,15) enters; interior is a separate room (see §3.1). Verbs (nearest
candidate within interact range; priority **exit → pray → verse → pew seats**):
1. **Leave** — exit to the church door tile.
2. **Pray** (altar) — pray emote; triggers the **worship moment** (shared gentle beat,
   max once per 20 s per room): sets rhythm `sermon`, contributes warmth `sermon`,
   broadcast `worship`. With the **Restoration Key** (§12), prayer at the altar grants
   a **5-minute blessing** (John 8:12 shown): everything that traveler tends carries
   **double warmth** while blessed; render a visible halo.
3. **Read Scripture** (verse stand) — broadcasts the **shared daily verse** (§8) as a
   card ("📖 Daily Verse"), with `daily: true`.
4. **Sit in pew** (4 sit gaps) — sit emote. During the weekly sermon, sitting through
   it counts once per sermon per traveler (`sermonPeace` key `sermon-<day n>`):
   contributes warmth `sermon` + broadcast `sermon-peace`.
- **NO candle-lighting** — the candle stand was removed in the church redesign; prayer
  is no longer gated on anything.

### Weekly sermon
- **Every 7th day: `day.n % 7 === 1`** (day 1 is a sermon day so travelers meet it
  quickly), **morning through afternoon phases** (`morning` or `day` phase only).
- Derived from the synced day counter + phase — **no extra sync needed**; every client
  agrees. A `sermon` flag ships in the day payload.
- Pastor Nathan takes the pulpit (interior 20,19); **the congregation gathers in the
  pews** (Hannah (19,21), Elias (21,21), Miriam (19,23); seats skip tiles where a
  traveler already sits) and stays seated until the service ends, then resumes the
  town-life schedule.
- Sermon lines are reverent, light/restoration themed, and quote **only the 3 core
  verses** (byte-identical); no new Scripture.
- Client shows a sermon banner ("🕊️ Pastor Nathan preaches").

---

## 8. Scripture
- **`track-a/public/verses.json` — 46 verses, reused byte-identical in Godot.**
  Format per entry: `{ "ref": "Jeremiah 29:11", "book": 24, "chapter": 29,
  "verse": 11, "category": "promise", "text": "..." }`.
- 10 categories: promise×8, wisdom×9, guidance×4, comfort×6, courage×4, love×4,
  peace×4, light×3, gratitude×2, instruction×2.
- Every verse verified live against the bolls.life KJV API (Strong's tags stripped,
  whitespace normalized); verification log `track-a/docs/verse-verification-2026-10-06.md`.
- **Daily verse:** `pool[floor(now / 86400000) % 46]` — **the same verse for every
  player in every room each UTC day.** Served by the church "Read Scripture" stand and
  shown at the top of the TIKVAH JOURNAL Scripture tab (client fetches `verses.json`
  and uses the same UTC-day index; falls back to the core 3 if the fetch fails).
- **3 core verses** (retained as the game's core; storyline + sermon + blessing are
  bound to these, byte-identical):
  - Jeremiah 29:11 — *"For I know the thoughts that I think toward you, saith the
    LORD, thoughts of peace, and not of evil, to give you an expected end."*
  - Psalm 23:1 — *"The LORD is my shepherd; I shall not want."*
  - John 8:12 — *"I am the light of the world: he that followeth me shall not walk in
    darkness, but shall have the light of life."*

---

## 9. NPCs
Four named villagers, each with home tile, ambient lines, and a **daily schedule**
(TOWN_SCHEDULE) driven by `townSlot(name, dayN, phase, frac)` — pure function of name,
day number, phase, and within-day fraction; plus `townDayRoute()` for a full-day route
(verified: no leg crosses a solid tile).

Schedule slots per phase:
- **morning:** wake (at home) → goWork (waypoint route, `carry` act).
- **day:** work (waypoints + act — Elias/Miriam `serve`, Hannah `tend`) → lunch
  (waypoints, lunch food rendered) → afternoon **or** on market day (day≡4 mod 7) the
  **market bustle** slot (browse the market lane) → alternate aftA/aftB routes
  (stroll/tend by day parity).
- **sunset:** evening stroll home (on market day Pastor Nathan's route avoids the café
  crowds).
- **night:** home.

### Behaviors
- **Greetings:** the first talk with each NPC each day (per player UUID) is a
  **time-of-day greeting** (2 lines per phase: morning/day/sunset/night), **warmer
  once befriended** (hearts ≥ 3). Subsequent talks rotate that NPC's ambient lines.
- **Friendship hearts:** +1 per talk (max 5), +1 per meal gift, +2 each for reconciling
  Elias/Miriam (§12). Hearts are per player UUID. Shown in dialogue UI (dual portraits
  + 5-heart meters). NEEDS CONTEXT: 16 additional greeting lines are awaiting Ariel's
  approval and are not yet in the game — keep the 8 shipped lines as the spec.
- **Ambient chats:** when two NPCs are near each other, a shared chat line broadcasts
  (`npc-chat`), one per pair per 90 s cooldown.
- **Acts of service:** giving a meal to an NPC (see §6) grants +1 heart and warmth.
- **Sitting/congregation:** during the sermon the congregation sits in the pews (§7);
  at night villagers stay home; during the garden waking/Return they drift out to the
  garden and plaza (see §13).
- NPC rendering: gentle idle sway, happy hop while chatting; depth-queued with players.

---

## 10. Day / time / seasons
- **Day clock: 8 minutes** (`DAY_MS = 480000`). Days roll over automatically on the
  clock — **no sleep mechanic**. Rollover increments the shared day counter for
  everyone; rhythm flags and garden bloom persist (rollover never wipes progress).
- **4 phases** by day fraction: morning < 0.22, day < 0.60, sunset < 0.78, night
  otherwise. Tints: morning warm peach, day faint afternoon gold, sunset pink/violet,
  night indigo.
- **4 seasons × 7 days**, derived from the synced day counter (`seasonOf(dayN)`):
  Spring days 1–7, Summer 8–14, Autumn 15–21, Winter 22–28, then cycles. No extra state.
- Season effects: farming grow-time modifier (Spring 0.8 / Summer 1.0 / Autumn 1.1 /
  Winter 1.25); seasonal lighting/rendering (track-a renders seasonal visuals;
  keep at minimum the growth modifier + lighting mood).
- **Shop hours:** market stalls open in morning/day (+ sunset on market day); café
  open morning/day/sunset. **Market day:** `day.n % 7 === 4` — NPCs do the market
  bustle slot; the day payload carries `marketDay`.
- **Village rhythm** (the day's five acts, tracked per room, reset on day rollover…
  — NEEDS CONTEXT: track-a resets rhythm in the private-room play-again path; the
  day-rollover behavior of rhythm flags should be preserved as in track-a):
  farm → tend the farm · fish → catch a fish · cook → cook a meal ·
  greet → greet a neighbor · sermon → say a prayer at the church.
  When all five are done in a day, the **Garden of Hope blooms** (`garden-bloom`
  broadcast: *"The Garden of Hope blooms — tended with love, day after day. 🌸"*).
- Ambient life: **fireflies at night**, birds, butterflies, fishing ripples, forest
  pollen, dust motes, glow effects; harvest sparkles; cooking steam + ding; gifting
  hearts burst; fox-petting hearts burst; blessing halo; bloom chime.

---

## 11. Wildlife
- **The fox:** a room-shared wanderer (spawn 15,18; roams tx 2–37, ty 2–25). Picks a
  random target every 2.5–6.5 s, moves at 40 px/s, position broadcast on moves.
  Pressing E within interact range → **pet** (`pet` broadcast, warmth `fox`,
  hearts-burst FX). *"A quick red fox roams the wilds. It likes being petted, and it
  remembers kindness."* The track-a **fox-check** suite verifies petting works across
  **5 attempts** (a chase-and-pet regression) — keep an equivalent Godot check.
- Butterflies, birds, fishing ripples: client-side ambient particles.
- Sunberry bushes and cherry orchard rows (§3.1) are the fox-free foraging scenery.

---

## 12. Garden Gate storyline (3 acts + epilogue)
Per-room state; all progress synced to every client in the room (`story` payload +
`story-toast` broadcasts). Scripture bound to the 3 core verses only.

- **ACT 1 — Discovery:** the decaying Garden Gate arch renders at the plaza's north
  edge (19,12). The first traveler within **2.5 tiles** discovers it: toast names the
  three trials (nurture crops / mend bridge / make peace); the TIKVAH JOURNAL unlocks
  "The Garden Gate". Woven into the tutorial flow — no intro sequence.
- **ACT 2 — Three Scripture trials** (through existing systems; progress toasts):
  - **Nurture** → Psalm 23:1: **3 harvests** after discovery.
  - **Mend** → John 8:12: **3 mends** at the broken bridge planks (20,22).
  - **Reconcile** → Jeremiah 29:11: Elias and Miriam are quarreling (market-day
    noise dispute). Talking to either opens a gentle **choice dialogue**
    ("🕊️ Help them make peace" / "Leave it for now"); reconciling **both** ends the
    quarrel visibly (+2 hearts each, softening toasts).
  - Each completion: "✨ Trial complete — …" toast + the trial's verse broadcast.
- **The Restoration Key:** granted when all three trials complete (HUD 🗝️). Prayer at
  the church altar with the key grants the **5-minute blessing** (§7).
- **ACT 3 — Cooperative Restoration:** with the key, E at the gate contributes a
  repair — **3 contributions, 5 s cooldown each, synced via room state**; solo
  travelers converge on the same ending stone by stone. Repairing wakes the garden
  fully (`garden.bloomed`) and renders **prayer-circle stones/flowers around the
  fountain**. Ends with the **Song of Hope** overlay (Jeremiah 29:11), after which the
  client sends `epilogue-done` → toast: *"🎶 The Song of Hope settles over Tikvah."*
- **EPILOGUE — Afterglow:** a church program plaque renders by the church door
  (Jeremiah 29:11).

### TIKVAH JOURNAL (📓 button / J key)
Tabs: **People, Places, Creatures, Scripture, Discoveries** (no Ancient Writings tab —
cut: fake-Aramaic risk; the Scripture binding forbids it).
- People: Hannah, Elias, Miriam, Pastor Nathan (fixed descriptions, §9).
- Places: Town Square, The Church, The Market, The Garden of Hope (text changes after
  the gate is restored), The Ruins.
- Creatures: The Fox.
- Scripture: daily verse on top, then the 3 core verses (byte-identical).
- Discoveries: Arrival; The Garden Gate; Psalm 23:1 — Nurture; John 8:12 — Mend;
  Jeremiah 29:11 — Peace; The Restoration Key; The Gate Restored; The Song of Hope —
  each **locked ("Not yet discovered…") until its story beat completes**.

---

## 13. RESTORE THE LIGHT arc
The underlying restoration layer; the Garden Gate story (§12) feeds the same garden
bloom. Warmth is deliberately forgiving: each kind of living counts, doing a couple
of things twice matters as much as doing everything once. Raw counts stay
server-side; players only ever see the town change.

- **Warmth kinds (8):** farm, fish, cook, give, greet, sermon, fox, explore — each
  capped at **2** toward warmth (max 16). Thresholds: **3** → `stirring`,
  **8** → `awake`. (The old `candle` kind was replaced by `sermon`.)
- **Stage ladder** (forward only): `dimmed` → `stirring` → `awake` → `discovered` →
  `relight` → `complete`. Synced via the `restore` payload (`stage`, garden
  state `blooming`/`waking`/`dormant`, lanterns lit/total, `central`, `discovery`).
- **Garden wakes** at `awake` (or on discovery): villagers drift out to the garden and
  plaza for 90 s (`gatherUntil`).
- **Explore:** a traveler's first steps into the wild north (ty ≤ 7) counts once per
  UUID (silent).
- **Co-op ruins:** stand within 40 px of **stone A** (6,5) and **hold 2 s** → stone A
  wakes; the fallen stones at the ruin mouth roll aside (gate). A second traveler
  crosses and holds stone B (34,5); when **both stones are awake and occupied
  together**, the ruin opens (`ruin-open`: *"Hope lives here — discovered together."*).
  A lone traveler can complete it stone by stone — no one is ever locked out.
- **The Discovery:** the first traveler to step into the ruins clearing (within 3
  tiles of stone B) after the ruin opens witnesses what is written there → John 8:12
  broadcast, stage → `discovered`. **Jesus is the Light; the players restore a
  community, never saviors.**
- **The Return and the Final Moment:** with the ruin open, discovery made, and stage
  `discovered`: **2+ travelers standing together in the garden plaza** (tx 17–23,
  ty 13–17) begin the Return — the 6 town lanterns relight **one by one (0.9 s apart),
  edges first**, then the **central light**, then the whole village gathers (90 s).
  Finale: stage → `complete`, garden blooms if not already, `ending` broadcast:
  *"The Garden of Hope — Travelers together. One village. A hope discovered
  together."* **Solo fallback:** exactly one traveler in the room, standing still in
  the garden for ~20 s, begins the same Return.
- Lamp rendering rule: if `central` → all lit; else lamps relit in edge-first order
  by `lit` count; if the garden is waking, the 3 plaza lamps burn; otherwise the town
  starts **dark** — the first wrongness the player notices.

**Multiplayer implication:** all of this is room-shared; two players standing on the
two stones (or one player doing both) is the core co-op verb of the game.

---

## 14. Mobile controls
- `isTouch` detection (`ontouchstart` / `maxTouchPoints`).
- **Virtual joystick** (bottom of screen): touch drag → directional input vector
  (same `input` intent as WASD/arrows).
- **Tap E button** to interact (same `interact` intent as the E key); an emotes panel
  for wave/heart; quick-chat panel button.
- Tutorial copy swaps for mobile: *"Walk with the joystick · Tap E to interact"*.
- HUD and ribbon layouts are mobile-safe (compact parchment buttons).

---

## 15. UI
- **Parchment theme** throughout (`.warmcard` panels, gold accents, serif-warm type).
- **Action ribbon** (bottom): 8 circular parchment buttons —
  🌾 **Farm**, 🎣 **Fish**, 🍲 **Cook**, 👋 **Befriend**, 🗺️ **Explore**,
  📖 **Learn**, 🙏 **Worship**, ✨ **Discover**. Each shows a guiding toast
  (e.g. *"🌾 Farm — tend your plots in the southwest fields"*); **Learn** opens the
  TIKVAH JOURNAL; **Befriend** sends the wave emote. Toasts only — no logic changes.
- **HUD portrait** (bottom-right): the player's own sprite in a gold-ringed circle +
  **pulsing [E] prompt** mirrored from the interaction system.
- **Top-left banner:** `Day N · Season · Phase · Location` (e.g. *"Day 1 · Spring ·
  Morning · Café"*), refreshed every 200 ms; location names: Church, Home, Café,
  Market, Town Square, Farms, Garden of Hope, Forest, Ruins, River Dock, River, Bridge.
- **Room code HUD:** `ROOM XXXX`.
- **Dialogue:** dual portraits (player + NPC) + 5-heart meters; choice dialogues for
  the dispute; nameplates with a gold glow for Pastor Nathan during the sermon.
- **Title screen:** "TIKVAH — A World To Belong To" with ENTER TIKVAH / CREATE
  CHARACTER / JOIN FRIEND / HOW TO PLAY (+ living background: clouds, fireflies,
  water animation). **Intro video slot** `/assets/intro.mp4`, tap-to-skip, plays before
  the title; graceful fallback if absent.
- **Onboarding (first 60 s):** skippable 3–5 s "Welcome to Tikvah…" fade (once per
  session) → discovery panel (once ever: *"Walk around / Meet your neighbor / Plant
  something / Explore the river. There is no single path."* — NOT quest markers) →
  Hannah's guided greeting (once per session, skippable, 3 short dialogue choices —
  warmth, not a lore dump). Contextual **[E] interaction prompts**; interior
  **fade transitions** (enterable buildings via a reusable DoorTransition in Godot).
- Toasts + chimes for every beat; ending motif and bloom chime audio moments.
- **Quick chat:** 6 server-validated preset phrases (2 s cooldown; server broadcasts
  the exact preset text — no injection): "Hello! 👋", "Follow me!",
  "Stand on the other stone ✨", "Let's cook together! 🍲", "Thank you! 🙏",
  "The garden blooms! 🌸".
- **Emotes:** `wave`, `heart` (player verbs) plus server emotes `pray`, `sit`, `heart`.
- Audio (from the competition polish pass; Godot: synthesize or commission original
  assets — $0): one looping Tikvah theme + ambient birds/wind/river/town beds,
  mute-respecting. (track-a used WebAudio synthesis; keep zero-cost.)

---

## 16. Interact-priority order (the single E verb)
Nearest candidate within 56 px wins; order on ties:
- **Outside:** church door (enter) → home door (enter) → café counter (cook menu) →
  Garden Gate repair → farm plot → fox (pet) → bridge mend spot → villager (talk;
  dispute choice if Elias/Miriam during the quarrel) → dock (cast/catch).
- **Church interior:** exit → pray → verse stand → pew seats.
- **Home interior:** exit → hearth (cook menu) → wardrobe (creator) → rug (decorate) →
  sit spot → pray nook.

---

## Appendix A — constants cheat sheet
| Key | Value |
|---|---|
| Map | 56×40, TILE 32 |
| Day | 480000 ms (8 min); phases morning<0.22, day<0.60, sunset<0.78, night |
| Seasons | 7 days each, `seasonOf(dayN)` |
| Interact range | 56 px |
| Max speed | 150 px/s |
| Room codes | 4 letters, no I/L/O; public room `TIKVAH`; cap 10 (Godot target 2–4) |
| Name length | 16 |
| Crop grow | 45000 ms × season modifier |
| Fish | bite in 3–7 s, catch window 2.5 s |
| Worship cooldown | 20 s |
| Quick-chat cooldown | 2 s |
| Blessing | 5 min (double warmth) |
| Gate repairs | 3 × 5 s cooldown |
| Trials | 3 harvests, 3 mends, reconcile both NPCs |
| Ruin stones | hold 2 s each, radius 40 px |
| Lanterns | 6, relight 0.9 s apart |
| Villagers gather | 90 s |
| Solo garden wait | 20 s |
| Hearts | max 5 per NPC per player |

## Appendix B — NEEDS CONTEXT (open questions for Ariel / coordinator)
1. **16 additional greeting lines + 3 dish names** (Sun-Baked Trout, Harvest Loaf,
   Sunberry Tart) are awaiting Ariel's approval — the 8 shipped greetings and the
   display-only dish names are the current spec; confirm before finalizing copy.
2. **Bait/inspect for fishing:** the task brief mentions them; track-a has no bait or
   inspect mechanics — cut unless Ariel asks.
3. **Rhythm reset semantics on day rollover:** preserved exactly as track-a behaves;
   verify against track-a if porting day-rollover logic.
4. **Godot server stack:** track-a uses Node + `ws`; the Godot build needs its own
   server-authoritative host (Godot dedicated server, or a GDScript port of
   `server.js` semantics). The coordinator owns this decision.
5. **Audio:** track-a synthesized WebAudio; Godot needs original loops/beds at $0
   (synthesize in-engine or use original assets). Muted by default until user gesture.
6. **Cut line for the Friday (Oct 9) sprint target** lives with the coordinator; this
   spec describes the full carry-forward set, not the sprint slice.

## Appendix C — test parity
The Godot build should carry equivalents of the track-a suites:
- `test/track-a-test.mjs` (1000+ checks: full playthrough incl. storyline) —
  Godot integration tests per system.
- `test/qa-systems.mjs` (19 systems: room-cap, private-rooms, public-persistent-village,
  identity-look-roundtrip, collision, farming, fishing, cooking, villager-greet,
  church-verbs, garden-bloom, creator-save, quick-chat, ruins-coop, fox, ending-reset,
  day-night, intro-hooks, storyline-gate).
- `test/fox-check.mjs` (5 pet attempts).
- `test/verses-test.mjs` (155 checks: every pool verse == verified text, daily index
  deterministic). The Godot build must read `verses.json` byte-identical and expose
  the same daily-index function.
