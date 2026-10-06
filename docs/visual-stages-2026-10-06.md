# TIKVAH MERGED VISUAL PROGRAM — approved by Ariel 2026-10-06

Mix of the 8-stage plan and the Perplexity in-depth plan, prioritizing the latter's depth.
Reference North Star: docs/DESIGN-BOARD-2026-09-27.jpg.

## Hard carve-outs (Ariel's standing directives override the pasted plan)
- NO Light Candle (her 2026-10-04 directive stands).
- NO Sleep / advance-day in the house modal (sleeping removed by her directive).
- ONLY the 3 approved KJV verses, byte-identical — NO randomized daily verse cards.
- NO new engine/framework (no Phaser/Pixi), NO new dependencies, $0 spend.
  → Implement y-depth sorting, ambient light overlay, animated water INSIDE the existing Canvas2D renderer.
- Map: harmonize toward the reference arrangement; do NOT remove existing locations or break interactions/collision.

## What we take from the in-depth plan (prioritized)
1. **Y-depth sorting** on all entities (depth = y): walk behind trees/roofs, in front of walls.
2. **Denser tilesets:** multi-layered ground, flowered grass patches, cobblestone paths, winding water edges with foam, animated water with reflections, stone embankments.
3. **Full-sprite landmarks:** cottage house, café with patio + parasols, market with striped stalls, Gothic church with arches + stained glass + steeple.
4. **Ambient light overlay:** Morning (warm peach) / Afternoon (golden) / Dusk (violet-orange) / Night (indigo + glowing lamps/windows) — readable, not a full-screen filter.
5. **Parchment UI system:** 9-slice parchment frames with floral corners; bottom action ribbon (Farm/Fish/Cook/Befriend/Explore/Learn/Worship/Discover); HUD portrait + energy + [E] prompt; top-left location/time banner; dual-portrait dialogue with 5-heart meters.
6. **Christian life-sim loops:** acts-of-service relationship mechanics (deliver harvest baskets, share meals); church altar [Pray]/[Read Scripture]/[Worship]/[Leave]; house modal without sleep.
7. **Layout:** town square + tiered fountain center; landmarks in a readable ring; winding paths; multiple routes; river with bridges + dock; Garden of Hope hedge circle; forest/mountain backdrop.

## Kept from the 8-stage plan
- Stage 0 freeze: no rebuild, preserve server/multiplayer/collision/room codes/persistence/NPC schedules/Scripture/church logic/farming/fishing/cooking/character creation.
- One stage at a time, tests green per stage, commit per stage, push → Railway auto-deploys → same URL.
- Ariel checks between phases.

## Execution phases
- PHASE A (foundation): y-sort + lighting overlay + animated water → terrain density → walkable layout harmonization → environmental storytelling density.
- PHASE B (immediately after A, no screenshot checkpoint — Ariel waived it 2026-10-06): landmark art → UI pass → verify characters/seasons → full playtest → deploy.

Baseline: storyline program committed + pushed (96afa16). World is 56×40.
