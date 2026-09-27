# PROJECT TIKVAH — Game Design Reference

> **Premise:** *"A place to grow, a story to live."*
>
> The player **LIVES** in the world. The story is discovered through living — not told in cutscenes, not forced on rails. Farming, fishing, worship, friendship, exploration, and rest are the story. Every system exists to make the world feel like somewhere you could dwell.

**Tracks:** Track A = Handshake × OpenAI Multiplayer Game Challenge web entry (due Oct 30/31, 2026). Track B = the complete Tikvah MMO (long-term, progressive — NEVER claimed complete). Both tracks share this design document. Track A is a playable slice of it; Track B is the whole of it.

---

## 1. Central Gameplay Law

**The Central Law:** *Every moment in Tikvah must be livable — doable alongside real life, meaningful with or without progress, and richer when shared.*

Derived principles:

1. **Life, not grind.** Systems reward presence and rhythm (tending, visiting, gathering) over optimization. There is no "win state"; there is a fuller life.
2. **Two are better than one (Ecclesiastes 4:9).** The world is designed for shared living. Key moments — especially the signature ruin stones — require a second person. Nothing essential is locked behind solo skill checks.
3. **Rest is a mechanic.** Day/night cycles, Sabbaths, and seasons are not timers to beat — they are invitations. The game never punishes a player for logging off.
4. **Discovery over instruction.** The notebook, lexicon, and world react to what the player does. Tutorials are a gentle neighbor showing you around, not a quest checklist.
5. **Beauty is load-bearing.** The pixel art, music, and light are not decoration on top of systems — they are part of how the world teaches and comforts.

---

## 2. Jesus Christ at the Center

Jesus Christ is at the center of Tikvah — **personally and directly, never through allegorical substitutes.**

- He appears as Himself: Jesus, the Son of God, the Good Shepherd. No stand-in character, no "mysterious shepherd figure who is totally-not-Jesus," no veiled metaphor.
- Encounters with Him are the deepest moments in the game: walking beside Him, hearing Scripture from His voice, prayer, the Lord's Supper.
- His presence is woven into church gatherings, festivals, and quiet moments (a bench by the water, a hillside at dawn), not gated behind endgame content.
- The cross and the empty tomb are honored with reverence, never trivialized as game mechanics. Salvation is never a "power-up" or a stat.
- All portrayals are reviewed for theological soundness against Scripture before release.

---

## 3. Scripture Rules

1. **KJV only.** Every quoted Scripture verse in-game uses the King James Version.
2. **Verified only.** A verse appears in the game only if its exact KJV text has been verified against a trusted source (BibleGateway KJV, a physical KJV, or equivalent) and logged with its reference.
3. **Approved so far:** Jeremiah 29:11, Psalm 23:1. (Full approved-verse list lives in the notebook/lexicon design doc as it grows.)
4. **No paraphrase presented as quotation.** Devotional wording inspired by Scripture is labeled as reflection, never as verse text.
5. **No out-of-context weaponization.** Verses are placed where their true meaning fits the moment — comfort at the graveside, courage at the dungeon gate, joy at the festival.

---

## 4. Aramaic Rules

Tikvah uses real Aramaic words (the language of Jesus) as discoverable treasures — words like *Abba*, *Talitha cumi*, *Maranatha* — taught gently through the in-world lexicon.

1. **Verified only.** An Aramaic word enters the game only after its spelling, transliteration, and meaning are verified from a scholarly source.
2. **Otherwise PLACEHOLDER / INTERNAL ONLY.** Any unverified Aramaic is marked `PLACEHOLDER` in design docs and `INTERNAL ONLY` in builds — it never ships to players unverified.
3. **No invented Aramaic.** The game never presents a made-up word as Aramaic. When in doubt, cut it.
4. **Taught, not tested.** The lexicon records words the player discovers; quizzes are gentle and optional.

---

## 5. Art Direction

**Style:** Rich top-down pixel art with GBA-era warmth — soft light, readable silhouettes, hand-placed detail. The world should feel like golden-hour forever: hopeful, safe, and alive.

### Standards

- **Tiles:** 16×16 base grid. Terrain, paths, water, and structures tile seamlessly; transition tiles soften every biome edge.
- **Sprites:** Characters ~16×24 (head + body readable at 2–3× zoom). Creatures and NPCs share the same proportions so the world reads as one place.
- **Palette:** Warm, limited, coherent. Each region has a signature palette shift (Tikvah = honey-gold greens; desert = amber; coast = teal-gold), but all regions share the same core ramps so nothing clashes.
- **Light:** Day/night and weather tint the whole scene. Lanterns, windows, the church, and the ruin stones glow. Light is emotional language: dawn = hope, dusk = peace, night = safe mystery.
- **Animation:** Idle breathing, walk cycles, water shimmer, crop sway, creature behaviors. Small loops, everywhere — the world never feels frozen.
- **Track A:** Art is generated procedurally in code (per Decision D2) following these standards — coherent style, zero licensing risk.
- **Track B:** Same standards, expanded — hand-authored tilesets and sprite sheets in the Godot 4 pipeline, all derived from this document.

### Approved visual boards
Reference boards approved by Ariel are the source of truth for look-and-feel. Any visual that contradicts an approved board is reworked, not shipped.

---

## 6. Character Creation Scope

- **Appearance:** Skin tone, hair style/color, simple faithful-modest clothing options, name. Cozy, expressive, readable at sprite scale.
- **Track A:** Streamlined creator — pick from curated presets (keeps the demo tight); name entry; done in under a minute.
- **Track B:** Full creator — expanded options, saved outfits, home-instance linkage.
- **Identity:** The character is the player's dwelling-self in Tikvah. No classes, no combat stats at creation. Who you are is how you live, not a build.

---

## 7. World Regions

Released progressively. Order of arrival:

1. **Tikvah (the home village)** — FIRST. The heart: homes, the church, the market square, the well, gardens, the ancient ruins at its edge. Every player starts here; every road leads back here.
2. **Farmland** — fields, orchards, barns, the mill. Farming's home.
3. **Forests** — deep woods, foraging, hidden clearings, woodland creatures.
4. **Desert** — dunes, oases, nomad camp, stars like you've never seen.
5. **Coast** — beaches, docks, fishing village, boats, islands offshore.
6. **Mountains** — high trails, snowline, the overlook, caves.
7. **Ancient City** — ruins made streets: libraries, the old forum, deeper mysteries, the lexicon's heart.
8. **Islands** — scattered sanctuaries, each with its own secret.

Each region: distinct palette, creatures, resources, NPCs, music, weather behavior, and at least one mystery that feeds the world's deeper story.

**Track A scope:** Tikvah village core only — farm plot, fishing pond, church, creature meadow, and the ruins with the two stones and the hidden garden.

---

## 8. Three World Types

1. **Private** — the player's own home and farm instance. Only invited guests enter. This is sanctuary: decorate, farm, rest.
2. **Shared** — the persistent village and regions. Everyone lives here together. The church, market, festivals, and ruins live in shared space.
3. **Instanced** — dungeons, the hidden garden, story moments. A private copy spun up for a player or party; what happens there doesn't disturb the shared world.

Track A uses shared (the village demo) + instanced (the hidden garden behind the ruin stones).

---

## 9. Full System List

### Homes
Player-owned houses in/near Tikvah. Decorate, expand, invite friends, rest (rest advances the day gently). Track A: viewable home exteriors; interiors in Track B.

### Farming
Till, plant, water, harvest. Real seasonal crops, crop rotation rewarded, orchards and greenhouses later. Farming is unhurried — crops wait for you.

### Fishing
Ponds, rivers, coast, deep water. Bait, patience, weather/season effects. Rare catches tied to mysteries, never to reflex difficulty.

### Cooking
Combine farm/fished/foraged goods at hearths and the festival kitchen. Recipes discovered by experimenting and from NPCs. Shared meals buff fellowship, not stats.

### Crafting
Woodwork, weaving, pottery, smithing (tools, not weapons-first). Make furniture, clothes, gifts, and quest-relevant items. Gifting is a first-class verb.

### Economy
A gentle market: sell surplus, buy what you need. Prices stable and fair — no auction-house speculation gameplay. Businesses (below) plug in here.

### Businesses
Player-run shops and stalls: bakery, flower stall, woodshop, inn. Hire NPC help later. Track B depth; Track A shows the market stalls as set dressing with one working stall.

### NPC Schedules
Every named NPC has a daily/weekly rhythm: home, work, church, market, rest. They remember you. They notice absence kindly ("Haven't seen you at the well lately — all well?"). No NPC is a vending machine.

### Relationships
Friendship with NPCs and players deepens through time together: shared meals, help given, festivals attended. Marriage/family systems in Track B's later phases — designed with care and faithfulness.

### Creatures
Gentle wild creatures to befriend, not capture-then-forget: feed them, earn trust, they visit your home, follow on walks. Some are tied to mysteries. No creature combat.

### Exploration
The regions (above) reward wandering: hidden clearings, vista points, old inscriptions, the lexicon's scattered pages. Exploration feeds the notebook.

### Notebook / Lexicon
Two in-one journal: the **Notebook** records the player's own journey (discoveries, thoughts, sketches); the **Lexicon** collects verified Aramaic words and Scripture verses found in the world. Both persist forever.

### Puzzles
Environmental and cooperative: the ruin stones (signature), water-channel puzzles, light-mirror puzzles, inscription riddles. Designed so two players naturally solve together; solo players can ask for a friend or wait — never pay, never grind.

### Dungeons
"Deep places": caves, old cisterns, the under-city. Instanced, cooperative, atmospheric — about courage and discovery, not loot treadmills.

### Combat
Gentle and defensive: driving off shadow-creatures that trouble the land, protecting villagers/creatures. No gore, no player-vs-player harm. Courage, not conquest.

### Church
The living center of Tikvah: Sunday gatherings, prayer, hymns, the Lord's Supper, weddings, quiet midweek prayer. Jesus is present here. This is not set dressing — it is the heartbeat.

### Festivals / Seasons / Weather / Day-Night
Four seasons, real weather (rain, wind, snow, clear), full day/night with dawn/dusk liturgy moments. Festivals mark the year: harvest, planting, lights, remembrance. The world breathes on a calendar.

### Interaction Verbs
Talk • Give • Help • Share meal • Pray with • Walk with • Sit with • Work alongside • Trade • Invite • Bless. Every verb works on NPCs and players. "Attack" is never a default verb.

### Persistence
The world remembers: crops grow, NPCs age kindly, letters wait, the garden stays opened once opened. Track A persists per room session; Track B persists everything, always.

### Server Architecture
- **Track A:** Node.js + `ws` WebSocket server, authoritative game state, canvas client, zero build step. One server, many rooms.
- **Track B:** Godot 4 (GDScript) client + dedicated server architecture (design in Track B skeleton). Server-authoritative from day one (Decision D4).

### Security
Server-authoritative movement and interactions; speed-hack rejection; out-of-range interaction rejection; room isolation (no cross-room state leaks). See QA-TEST-PLAN.md §(c).

### Moderation
Shared spaces stay safe: reporting, quiet muting, guardian (moderator) roles from trusted community, profanity/behavior filters, private-instance sanctuary rules. Designed before launch, not after an incident.

### Accessibility
Remappable keys, full mobile touch controls, colorblind-safe palettes, text-size options, reduced-flash mode, subtitles for all audio cues, no reflex-gated content. Everyone dwells here.

### Audio
Warm adaptive score (region- and time-aware), ambient beds (water, wind, market murmur, birdsong), gentle interaction chimes. Hymns in the church. Track A: procedural/WebAudio tones; Track B: composed score.

---

## 10. Onboarding

A gentle neighbor (NPC) walks the new player through Tikvah: move, talk, pick up, plant one seed, cast one line, light one lantern. Under five minutes, skippable, re-playable. Track A includes a condensed version; the ruin stones are introduced as "something the village has wondered about for years… best seen with a friend."

---

## 11. How the Two Tracks Share Design and Assets

| Concern | Track A (Challenge entry) | Track B (MMO) | Shared |
|---|---|---|---|
| Design source | This document (slice) | This document (whole) | GAME-ECOSYSTEM.md, REQUIREMENTS-MATRIX.md, QA-TEST-PLAN.md, DECISION-LOG.md |
| Art | Procedural pixel art in code | Godot tilesets/sprites to same standards | §5 art direction, palette ramps |
| Multiplayer | Node `ws` rooms, room codes | Godot dedicated server, persistent world | Server-authoritative principle (D4) |
| Signature moment | Two ruin stones → hidden garden (instanced) | Same moment, persistent garden | Puzzle design, garden map |
| Content | Jeremiah 29:11, Psalm 23:1 (verified) | Growing verified verse/Aramaic library | §3 Scripture rules, §4 Aramaic rules |
| QA | QA-TEST-PLAN suite (a) | Full plan incl. (b)(c)(d) | QA-TEST-PLAN.md |

Track A proves the heart (shared living + the cooperative miracle). Track B grows the body around it. Nothing in Track A contradicts Track B's future — every slice is a foundation, not a throwaway.

---

*Document owner: Docs + QA Planner. Last updated: 2026-09-26.*
