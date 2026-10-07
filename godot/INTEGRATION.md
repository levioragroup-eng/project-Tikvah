# TIKVAH 2.0 Integration Checklist (coordinator)

## Tracks + ownership
- [x] AUDIT (25983a10) — SPEC.md committed
- [x] WORLD (d017450c) — village.tscn + placeholder tiles, committed 13bd82b, loads clean
- [ ] ART (656f1ded) — 28 files in assets/, magenta→transparent fixed by coordinator
- [ ] PLAYER+DOORS (4d577727) — scenes/player/*, scenes/interiors/*, scripts/player/*, door_transition.gd
- [ ] LIFE (684be4f1) — time_clock, npc/*, farming/fishing/cooking/relationships
- [ ] STORY (e531656d) — mystery.gd, puzzles.gd, notebook UI, verses.json, restoration.gd
- [ ] MULTI (78bb7b8a) — tikvah_server.gd, tikvah_client.gd, net_test.gd

## Integration order (when tracks land)
1. Swap placeholder tileset → assets/tiles/ground.png in village TileSet (keep indices!)
2. Wire player.tscn instance into village (spawn point), door areas at building doors
3. Add TimeClock + NPC instances + farming/fishing/cooking nodes to village
4. Add Mystery + Notebook UI (J key), verses.json load
5. Wire Net client: title-screen room code entry → connect → spawn remote players
6. Headless integration test: full scene loads, zero errors
7. Web export → serve.py smoke test (curl index.html, check /config.js)
8. Commit build outputs (build/web, build/server) for Railway

## Standing rules
- Never touch track-a/, master, or the live service.
- All commits on godot-2.0, push after each integration step.
- Scripture: godot/data/verses.json byte-identical to track-a.
- No candle, no sleep, Nathan male, player ≠ savior.
