# PROJECT TIKVAH — QA Test Plan

How to use this document: each test has numbered steps, an expected result, and a Pass/Fail column. The tester runs the steps, observes, and marks **PASS** or **FAIL** (with a note). A FAIL sends the requirement back per the REQUIREMENTS-MATRIX.md status rules (`complete = implemented + integrated + successfully tested`).

Test environments: (D) desktop browser, (M) mobile browser. Mark which were used.

---

## (a) Track A Functional Suite

Run against the challenge entry build before submission, and after every Track A milestone.

### Rooms & Joining

| # | Test | Steps | Expected result | Pass/Fail |
|---|---|---|---|---|
| A1 | Create room | 1. Open public URL (D). 2. Enter name, tap "Create Room". | A room code appears (short, readable, e.g. 4 letters); player spawns in Tikvah. | PASS (headless 2026-09-26) |
| A2 | Join room via code | 1. On a second device (M), open URL. 2. Enter name + the code from A1, tap "Join". | Second player spawns in the same village; both see each other. | PASS (headless 2026-09-26) |
| A3 | Bad code rejected | 1. Enter a nonexistent code, tap "Join". | Clear, kind error message ("That code didn't open a door — check it and try again"); no crash, no partial join. | PASS (headless 2026-09-26) |
| A4 | Room capacity | 1. With 2 players in a room, a third device tries the same code. | Third player gets a gentle "this room is full" message; existing room unaffected. | |

### 2-Player Sync

| # | Test | Steps | Expected result | Pass/Fail |
|---|---|---|---|---|
| A5 | Shared movement | 1. Player 1 walks in a circle (D). 2. Player 2 watches (M). | Player 2 sees Player 1 moving smoothly, no teleporting, position matches within tolerance. | PASS (headless 2026-09-26) |
| A6 | Movement both directions | 1. Both players walk simultaneously toward each other. | Each sees the other approaching; no rubber-banding or desync after 30s. | |
| A7 | Separate devices, same room | 1. Phone + phone, 2. phone + desktop, 3. desktop + desktop — repeat A5. | All three pairings show smooth shared movement. | |
| A8 | Reconnect | 1. Player 2 closes the tab mid-session. 2. Rejoins with the same code within the session window. | Player 2 returns to the room near where they left; Player 1 sees them return; no duplicate avatars. | |

### Interactions (farm / fish / church / creature)

| # | Test | Steps | Expected result | Pass/Fail |
|---|---|---|---|---|
| A9 | Farming together | 1. Both players go to the farm plot. 2. P1 tills + plants, P2 waters. | Both see tilled soil, seed, watered state update live; crop growth visible to both. | PASS (headless 2026-09-26) |
| A10 | Fishing side-by-side | 1. Both players cast lines at the pond. | Both see each other's casts and catches; catch results appear for the catcher, splash visible to both. | PASS (headless: cast/bite/catch 2026-09-26) |
| A11 | Church moment | 1. Both players enter the church and sit. | Shared ambience (light/hymn tone) plays for both; a Scripture verse displays identically on both screens. | |
| A12 | Creature befriending | 1. P1 feeds a meadow creature twice. 2. P2 feeds it once. | Creature's trust state is shared (it approaches both); no duplicated/conflicting creature state. | |
| A13 | Out-of-range interaction rejected | 1. P1 stands far from the pond and attempts to fish. | Server rejects; nothing happens (no phantom catch); client shows a gentle "move closer" hint. | PASS (headless 2026-09-26) |

### Signature Ruin Moment

| # | Test | Steps | Expected result | Pass/Fail |
|---|---|---|---|---|
| A14 | Stones need two players | 1. P1 activates stone 1 alone. | Stone 1 glows briefly, then fades; garden does NOT open; hint suggests "this feels like a two-person moment." | PASS (headless: single occupancy did not open; 2026-09-26) |
| A15 | Simultaneous activation opens the garden | 1. P1 stands at stone 1, P2 at stone 2. 2. Both activate within the timing window. | Both stones blaze; the garden gate opens for BOTH players; both enter the same instanced garden. | PASS (headless 2026-09-26) |
| A16 | Near-miss timing | 1. P1 activates, P2 activates just after the window closes. | Garden does NOT open; both see a soft "almost — try together" cue; stones reset cleanly. | |
| A17 | Garden is instanced per pair | 1. Pair A opens the garden. 2. A different pair opens theirs in another room. | Each pair sees only their own garden; no cross-room leaks; garden persists for the session. | PASS (headless room isolation 2026-09-26) |

### Mobile Controls

| # | Test | Steps | Expected result | Pass/Fail |
|---|---|---|---|---|
| A18 | Touch movement | 1. On mobile, use the virtual joystick for 60s across the village. | Movement is smooth and proportional; no stuck directions; joystick doesn't drift when released. | |
| A19 | Touch interaction | 1. Tap the interact button near the pond, farm, stone, NPC. | Correct contextual prompt appears; tap performs the right action every time. | |
| A20 | Mobile viewport | 1. Play the full loop (join → farm → ruins → garden) on a phone. | No UI overlap, no off-screen buttons, text readable; canvas scales correctly on rotate. | |

### Onboarding

| # | Test | Steps | Expected result | Pass/Fail |
|---|---|---|---|---|
| A21 | First-time flow | 1. Fresh player (cleared storage) opens URL, creates room. | Neighbor NPC greets, teaches move/talk/plant/cast in under 5 minutes; skippable; re-playable from menu. | |
| A22 | Rules are clear | 1. Ask a first-time tester (no briefing): "what do you do here?" after onboarding. | Tester can describe the loop (live, farm, fish, explore, open the garden with a friend) without help. | |

---

## (b) Regression Suite

**Rerun after every major change** (netcode, state schema, input, world layout, deploy config). A change is not merged until this suite is green.

| # | Test | Steps | Expected result | Pass/Fail |
|---|---|---|---|---|
| R1 | Rooms still work | Repeat A1–A4. | Same expected results as (a). | PASS (headless: rooms/join/isolation 2026-09-26) |
| R2 | Movement sync intact | Repeat A5–A7 (one pairing minimum). | Same expected results as (a). | |
| R3 | Inventory consistency | 1. P1 harvests 3 crops, catches 1 fish. 2. P2 watches, then both check inventories. | P1's inventory shows +3 crops, +1 fish; P2's is unchanged; no duplication after rejoin. | |
| R4 | Persistence across rejoin | 1. P1 plants and waters a crop. 2. P1 closes tab, rejoins with same code. | Crop state (planted/watered/growth) is as left; nothing reset or doubled. | |
| R5 | World transitions | 1. Walk village → farm → pond → church → ruins → garden and back. | No soft-locks, no invisible walls in wrong places, ambience/music shifts per area, both players transition together. | |
| R6 | Mobile controls intact | Repeat A18–A20 (short pass). | Same expected results as (a). | |
| R7 | No console errors | 1. Play the full loop with dev console open. | Zero errors/warnings that affect gameplay; any warning is logged and triaged. | |

---

## (c) Security Spot-Checks

Run before any public URL goes live, and after netcode changes. These are adversarial: the tester tries to break the server's trust.

| # | Test | Steps | Expected result | Pass/Fail |
|---|---|---|---|---|
| S1 | Speed-hack rejected | 1. Send movement packets claiming 10× normal speed (via console/script). | Server clamps or rejects; avatar does not teleport across the map; offender's position stays sane. | PASS (headless: server-side speed cap; input-vector only 2026-09-26) |
| S2 | Out-of-range interaction rejected | 1. Send "activate stone" / "harvest" packets from across the map. | Server rejects (distance check); no state change; no error leaked to other player. | PASS (headless 2026-09-26) |
| S3 | Room isolation | 1. In room X, attempt to address packets/state to room Y (second client in room Y observing). | Room Y sees nothing from room X; no cross-room state leak, chat, or position data. | PASS (headless 2026-09-26) |
| S4 | Malformed packets | 1. Send garbage/missing-field packets to the server. | Server drops them gracefully; connection stays alive; no crash, no state corruption. | PASS (headless 2026-09-26) |
| S5 | Name/content abuse | 1. Try profane or over-long player names and chat. | Filtered or rejected with a kind message; length caps enforced; other players never see raw abuse. | |

---

## (d) Content Checks

Run on every content addition (verses, Aramaic, art, writing) before it ships.

### Scripture Accuracy

| # | Test | Steps | Expected result | Pass/Fail |
|---|---|---|---|---|
| C1 | Verse text = KJV | 1. For each verse in the build, compare character-by-character against KJV (BibleGateway KJV or physical KJV). | Exact match, including punctuation and capitalization. Log the reference + verification source. | PASS (headless: exact-match vs 2 approved verses 2026-09-26) |
| C2 | Only approved verses ship | 1. List all verses present in the build. 2. Compare against the approved list (currently: Jeremiah 29:11, Psalm 23:1). | Every verse in the build is on the approved list; no unapproved verse appears anywhere (UI, garden inscriptions, church). | PASS (headless: only Jer 29:11 + Ps 23:1 present 2026-09-26) |
| C3 | No paraphrase-as-quotation | 1. Read all devotional/reflection text. | Any non-verbatim wording is labeled as reflection, never formatted as a verse quotation. | PASS (ruin message is reflection text, not verse 2026-09-26) |

### Aramaic

| # | Test | Steps | Expected result | Pass/Fail |
|---|---|---|---|---|
| C4 | No invented Aramaic | 1. List every Aramaic word in the build. 2. Check each against its scholarly verification source. | Every word verified (spelling, transliteration, meaning); any unverified word is marked PLACEHOLDER / INTERNAL ONLY and does not ship. | |
| C5 | Lexicon honesty | 1. Open the lexicon in-game. | Only verified words appear; nothing is presented as Aramaic that isn't. | |

### Visual Consistency

| # | Test | Steps | Expected result | Pass/Fail |
|---|---|---|---|---|
| C6 | Matches approved boards | 1. Screenshot each area; compare against Ariel's approved visual boards. | Palette, warmth, silhouette readability, and light behavior match the boards; deviations flagged for rework. | |
| C7 | Tile/sprite standards | 1. Inspect tiles (16×16 grid, seamless transitions) and sprites (~16×24, consistent proportions). | No stretched sprites, no clashing palettes between adjacent regions, no placeholder boxes in shipped areas. | |
| C8 | Jesus portrayed directly | 1. Review any scene or text involving Jesus. | He appears as Himself — no allegorical substitutes, no trivializing mechanics; portrayal reviewed for reverence. | |

---

*Document owner: Docs + QA Planner. Testers record results in the Pass/Fail column; failures go to the game-dev worker with reproduction steps. Last updated: 2026-09-26.*
