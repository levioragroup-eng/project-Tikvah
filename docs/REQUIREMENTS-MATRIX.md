# PROJECT TIKVAH — Requirements Matrix

## STATUS Words Glossary

| Status | Meaning |
|---|---|
| PLANNED | Requirement captured; design agreed; not yet built. |
| IMPLEMENTED | Code/assets exist in the repo for this requirement. |
| TESTING | Implementation under active test (see QA-TEST-PLAN.md). |
| PASSED | Tests passed; requirement accepted. |
| FAILED | Tests failed; rework required before it can pass. |
| BLOCKED | Cannot proceed until the named dependency/blocker is resolved. |

**Rule: "complete" = implemented + integrated + successfully tested.** A requirement is only DONE when it is implemented, integrated with the rest of the game, and its tests pass. `IMPLEMENTED` alone is not complete. `PASSED` is the only status that means done.

All requirements below start at **PLANNED**. The game-dev worker updates STATUS as work progresses. TEST STATUS starts empty (`—`) until tests run.

---

## Track A — Handshake × OpenAI Multiplayer Game Challenge Requirements

Due Oct 30/31, 2026. Judging: Execution / Creativity / Usefulness / Polish (25% each).

| REQUIREMENT | STATUS | IMPLEMENTATION | TEST STATUS | DEPENDENCIES |
|---|---|---|---|---|
| Public URL — game playable at a public link | PLANNED | Static hosting + Node `ws` server; URL published after Ariel approves hosting (D5) | — (local-only per milestone scope) | D5 hosting approval |
| Create room — player can create a new multiplayer room | PASSED | Server `create` → 4-letter code; client Create Room button | headless create→joined PASS (test/track-a-test.mjs, 2026-09-26) | Server skeleton |
| Join room — player can join via room code | PASSED | Client join screen: enter code → connect to room | headless 2-client same-code join PASS (2026-09-26) | Create room |
| Room code — short, shareable, human-friendly code | PASSED | 4-letter codes, unambiguous charset (no I/L/O) | format + join-by-code PASS (2026-09-26) | Create room |
| 2-player multiplayer — exactly the demo's core: two players together | PASSED | Room cap 8; 2+ avatars live in shared authoritative state | headless 2-client shared room PASS (2026-09-26) | Server authoritative state |
| Separate devices — two players on two different devices in the same room | PLANNED | Device-independent client; tested phone+phone, phone+desktop, desktop+desktop | — (headless clients only; real device pairing pending) | Public URL |
| Shared movement — both players see each other move in real time | PASSED | Server-authoritative positions, 20 Hz tick broadcast, input-vector (no client positions) | movement sync + speed-cap PASS (2026-09-26) | 2-player multiplayer |
| Meaningful multiplayer activity — something worth doing together (not just co-presence) | PASSED | Farm (plant/water/harvest), fishing (cast/bite/catch), church (pray/verse), fox pet — all shared state | headless farm/fish/church/fox PASS (2026-09-26) | Interaction verbs |
| Mobile controls — full playability on touch devices | IMPLEMENTED | Virtual joystick + E button + emote buttons; responsive canvas | implemented — manual touch-device test pending | Client input layer |
| Desktop controls — full playability with keyboard/mouse | IMPLEMENTED | WASD/arrows + E interact; 1/2 emotes | implemented — manual browser test pending | Client input layer |
| Clear rules — player understands what to do without a manual | IMPLEMENTED | 3-line tutorial overlay (WASD • E • ruin hint); contextual toasts | implemented — first-tester read pending | Onboarding design |
| Replayability — reasons to play again | PLANNED | Daily/seasonal variation, creature visits, garden keepsakes, friend invites | — (out of milestone scope) | Persistence (session) |
| Signature ruin moment — TWO players activate TWO ruin stones SIMULTANEOUSLY to open the hidden garden | PASSED | Server verifies both players on stones simultaneously (40px radius, 20 Hz); garden blooms at plaza + "Hope lives here — discovered together." | ruin-open fired on both clients, message verified PASS (2026-09-26) | Instancing, 2-player sync |
| Judging polish — the entry feels finished, not prototype-rough | PLANNED | Art/audio/UX pass per GAME-ECOSYSTEM.md §5 before submission | — (post-milestone pass) | All above |

---

## Track B — Complete Tikvah MMO Category Checklist

Long-term, progressive — NEVER claimed complete. Every item starts PLANNED.

### Multiplayer & World

| REQUIREMENT | STATUS | IMPLEMENTATION | TEST STATUS | DEPENDENCIES |
|---|---|---|---|---|
| Real-time multiplayer (many players, shared world) | PLANNED | Godot 4 + dedicated server (D3, D4) | — | Track A netcode lessons |
| Private worlds (player home/farm instances) | PLANNED | Per-player instanced home zone; invite-only | — | Instancing |
| Shared world (persistent village + regions) | PLANNED | Persistent server-side world state | — | Server architecture |
| Instanced content (dungeons, story moments, garden) | PLANNED | On-demand instances per party | — | Server architecture |
| Parties / groups | PLANNED | Party formation, shared instancing | — | Multiplayer |
| Social systems (friends, whispers, gatherings) | PLANNED | Friends list, DMs, group invites | — | Multiplayer, moderation |

### Life Systems

| REQUIREMENT | STATUS | IMPLEMENTATION | TEST STATUS | DEPENDENCIES |
|---|---|---|---|---|
| Character customization | PLANNED | Full creator per GAME-ECOSYSTEM.md §6 | — | Art pipeline |
| Homes (own, decorate, expand, invite) | PLANNED | Housing system + furniture crafting | — | Private worlds, crafting |
| Farming | PLANNED | Crop/season/rotation systems | — | Seasons, persistence |
| Fishing | PLANNED | Bait/patience/weather/rarity systems | — | Regions (water), weather |
| Cooking | PLANNED | Recipe discovery, shared meals | — | Farming, fishing |
| Crafting | PLANNED | Woodwork/weaving/pottery/smithing | — | Economy, regions (resources) |
| Economy (fair market) | PLANNED | Stable pricing, stalls, trade | — | Businesses |
| Player businesses (bakery, stalls, inn…) | PLANNED | Shop ownership + NPC help | — | Economy, NPCs |
| NPC schedules (daily/weekly rhythms) | PLANNED | Schedule AI + memory of player | — | NPCs |
| NPCs (named villagers with depth) | PLANNED | Dialogue, routines, relationships | — | Writing, art |
| Relationships (friendship, fellowship) | PLANNED | Time-together progression | — | NPCs, social |
| Creatures (befriend, not capture) | PLANNED | Trust/feed/visit behaviors | — | Regions, art |

### World & Story

| REQUIREMENT | STATUS | IMPLEMENTATION | TEST STATUS | DEPENDENCIES |
|---|---|---|---|---|
| Exploration (regions 1–8) | PLANNED | Region rollout per GAME-ECOSYSTEM.md §7 | — | Art, server |
| Region: Tikvah village (first) | PLANNED | Full village: church, market, well, ruins | — | — |
| Region: Farmland | PLANNED | Fields, orchards, mill | — | Farming |
| Region: Forests | PLANNED | Woods, foraging, clearings | — | Exploration |
| Region: Desert | PLANNED | Dunes, oasis, nomad camp | — | Exploration |
| Region: Coast | PLANNED | Beaches, docks, fishing village | — | Fishing |
| Region: Mountains | PLANNED | Trails, snowline, caves | — | Exploration |
| Region: Ancient City | PLANNED | Libraries, forum, lexicon heart | — | Mysteries |
| Region: Islands | PLANNED | Scattered sanctuaries | — | Boats/coast |
| Mysteries (world-deepening secrets) | PLANNED | Mystery chain design | — | Exploration, puzzles |
| Puzzles (environmental + cooperative) | PLANNED | Puzzle toolkit + content | — | Instancing |
| Aramaic lexicon (verified only) | PLANNED | Lexicon UI + verified word pipeline | — | GAME-ECOSYSTEM.md §4 |
| Scripture (KJV, verified only) | PLANNED | Verse placement + verification log | — | GAME-ECOSYSTEM.md §3 |
| Church (gatherings, prayer, Jesus present) | PLANNED | Church systems + events | — | NPCs, audio |
| Dungeons ("deep places," cooperative) | PLANNED | Instanced dungeon content | — | Instancing, combat |
| Combat (gentle, defensive) | PLANNED | Shadow-creature encounters | — | Dungeons |

### Living Calendar

| REQUIREMENT | STATUS | IMPLEMENTATION | TEST STATUS | DEPENDENCIES |
|---|---|---|---|---|
| Seasons (4) | PLANNED | Season cycle + crop/creature effects | — | Persistence |
| Weather (rain, wind, snow, clear) | PLANNED | Weather system + visual/audio | — | Day/night |
| Day/night cycle | PLANNED | Lighting tint, NPC/lighting response | — | Art direction |
| Festivals (harvest, planting, lights, remembrance) | PLANNED | Festival events + content | — | Church, seasons |

### Player Tools & Meta

| REQUIREMENT | STATUS | IMPLEMENTATION | TEST STATUS | DEPENDENCIES |
|---|---|---|---|---|
| Notebook (personal journey journal) | PLANNED | Journal UI, auto + manual entries | — | Persistence |
| Interaction verbs (talk/give/help/pray/walk/sit/work/trade/invite/bless) | PLANNED | Verb system for NPCs + players | — | NPCs, multiplayer |
| Save (everything persists) | PLANNED | Server-side persistent profiles | — | Server architecture |
| Persistence (world remembers) | PLANNED | World-state deltas stored | — | Save |

### Trust & Safety

| REQUIREMENT | STATUS | IMPLEMENTATION | TEST STATUS | DEPENDENCIES |
|---|---|---|---|---|
| Security (server-authoritative, anti-cheat) | PLANNED | D4 implementation; see QA §(c) | — | Server architecture |
| Moderation (report, mute, guardians) | PLANNED | Tools designed before launch | — | Social systems |

### Craft & Launch

| REQUIREMENT | STATUS | IMPLEMENTATION | TEST STATUS | DEPENDENCIES |
|---|---|---|---|---|
| Accessibility (remap, touch, colorblind, text size, reduced flash, subtitles, no reflex gates) | PLANNED | Accessibility pass per system | — | Client |
| Audio (adaptive score, ambience, hymns) | PLANNED | Track A: WebAudio; Track B: composed | — | Regions, church |
| Pixel-art identity (GBA-warm, coherent) | PLANNED | §5 standards enforced in review | — | Art pipeline |
| Onboarding (neighbor walkthrough, <5 min) | PLANNED | Condensed (A) / full (B) | — | Tikvah region |
| QA (suites defined, regression green) | PLANNED | QA-TEST-PLAN.md executed per release | — | All systems |
| Deployment (hosting approved by Ariel) | PLANNED | D5: no public deploy without approval | — | Security, QA |

---

*Document owner: Docs + QA Planner. Maintained by the game-dev worker (STATUS/TEST STATUS columns). Last updated: 2026-09-26.*
