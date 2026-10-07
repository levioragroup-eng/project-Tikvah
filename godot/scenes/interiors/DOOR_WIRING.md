# Door wiring — village side (for the coordinator)

The player track owns the interiors and the reusable `DoorTransition`
(`res://scenes/systems/door_transition.tscn`, script
`res://scripts/systems/door_transition.gd`), but may NOT edit
`scenes/world/village.tscn`. This file documents exactly what to place
there. Village map: 80×60 tiles, 16 px tiles, origin top-left.

## Convention

- **Village → interior door:** instance `door_transition.tscn` at the door-front
  position below, with `target_scene = "res://scenes/interiors/<x>_interior.tscn"`
  and `spawn_id = "enter"`. Each interior scene already contains a
  `Spawn_enter` marker where the player appears.
- **Interior → village exit:** already placed inside each interior scene —
  `ExitDoor` with `target_scene = "res://scenes/world/village.tscn"` and
  `spawn_id` = the place id. The village needs a matching marker named
  `Spawn_<id>` (Marker2D) at the door-front position so the player lands
  back at the door they left from.

## Village-side placements (all four)

| Building | Door-front tile | px center (place door + `Spawn_<id>`) | target_scene | spawn_id |
|---|---|---|---|---|
| Church | (63, 32) | (1016, 520) | `res://scenes/interiors/church_interior.tscn` | `enter` / village marker `Spawn_church` |
| Home | (12, 15) | (200, 248) | `res://scenes/interiors/home_interior.tscn` | `enter` / village marker `Spawn_home` |
| Café | (53, 41) | (856, 664) | `res://scenes/interiors/cafe_interior.tscn` | `enter` / village marker `Spawn_cafe` |
| Market | (40, 20) | (648, 328) | `res://scenes/interiors/market_interior.tscn` | `enter` / village marker `Spawn_market` |

All four door-front tiles are walkable (verified against `world.gd` collision:
church door front is the `KEY_LOCS` `church_door` cell, etc.). NOTE: the market
door is at (40,20), NOT (40,18): the market apron (tiles x36–44, y17–19) is
painted with tile 48 on the Ground layer, and tile 48 carries the tileset's
full-tile physics blocker — so the whole apron is physically solid (see
"Tile-48 warning" below). (40,20) is grass+path, just south of the apron.

## Interior-side (already done, for reference)

| Interior | Room | Exit door px | `Spawn_enter` px | Exit spawn_id |
|---|---|---|---|---|
| home_interior.tscn | 14×10 tiles | (104, 136) | (104, 104) | `home` |
| church_interior.tscn | 20×12 tiles | (152, 168) | (152, 136) | `church` |
| cafe_interior.tscn | 16×10 tiles | (120, 136) | (120, 104) | `cafe` |
| market_interior.tscn | 18×10 tiles | (136, 136) | (136, 104) | `market` |

## Notes

- `DoorTransition` extends `Interactable`: prompt defaults to "Enter"
  (interior exits override to "Leave"); interaction radius is 24 px, E key or tap.
- The transition fades to black (0.25 s), changes scene, drops the player at
  `Spawn_<spawn_id>`, fades in, and the driver emits `finished`
  (`DoorTransition.last_driver`). If `Spawn_<id>` is missing it warns and the
  player lands at the scene origin — wire the markers to avoid that.
- Re-entrancy is guarded (`TransitionDriver.active`); a second
  interact mid-transition is ignored.

## Tile-48 warning (for the coordinator / world track)

`placeholder_tiles.gd` gives tile 48 a full-tile physics-blocker polygon, and
TileSet physics applies on EVERY TileMapLayer that paints tile 48 — not just
the invisible Collision layer. Consequences found while testing:

- `world.gd` paints tile 48 as VISIBLE ground: the town-square plaza
  (x36–44, y26–34) and the market apron (x36–44, y17–19) on the Ground layer.
  Both are therefore physically solid — the player cannot walk the plaza,
  despite `is_walkable()` (which only reads the Collision layer) saying it is
  walkable. The world track's reachability test does not catch this because it
  uses the same Collision-layer-only check. Recommend the world track switch
  those ground fills to a non-collider stone tile (e.g. 49).
- The church interior originally used tile 48 as floor; fixed in this track
  (now 49/50).
