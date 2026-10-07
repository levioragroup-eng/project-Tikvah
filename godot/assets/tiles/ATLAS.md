# TIKVAH 2.0 Art Atlas Contract (v1 — Friday slice)

All art: ORIGINAL pixel art, 16×16 base tile, warm storybook palette
(greens #5a8f3c–#8fce62, earth #8a6238, cream #f5e9c8, navy #1f2a44, gold #d4a94e).
Nearest-neighbor, no anti-aliasing blur. Reference mood:
~/workspace/tikvah-game/docs/DESIGN-BOARD-2026-09-27.jpg (direction only — NEVER trace or copy).

## assets/tiles/ground.png — 256×256 px, 16×16 grid of 16px tiles
| Index | Use |
|---|---|
| 0–7 | Grass base + variants (tuft, light patch, dark patch, tiny flowers ×2, pebble, clover) |
| 8–15 | Dirt path cobble variants (center, edge blends) |
| 16–23 | Water frames (4 frames × 2 variants for animation) |
| 24–31 | Water edge / foam transitions (N,S,E,W + corners) |
| 32–39 | Flower clusters, mushrooms, reeds, lily pad |
| 40–47 | Plowed soil, crop stages (sprout, growing, mature) |
| 48–63 | Stone, bridge planks, fountain pieces |
| 64–255 | RESERVED |

## assets/characters/*.png — 64×96 px sheets: 4 cols (walk frames) × 4 rows (down, up, left, right), 16×24 px frames
- player_m1.png, player_f1.png (two base options for the slice; full creator later)
- hannah.png, elias.png, miriam.png, nathan.png (Pastor Nathan: male, short hair, cream pastoral shirt)
- villager1.png, villager2.png, fox.png (16×16, 4 frames)

## assets/buildings/*.png — exteriors, top-down 3/4 view, original designs
- church.png (~96×96): stone, pointed-arch door, steeple, stained-glass window
- cafe.png (~80×64): storefront, awning, outdoor tables
- market.png (~96×64): 2 stalls, striped awnings, produce crates
- home.png (~64×64): cottage, varied roof, chimney, garden
- shop.png (~64×64)

## Interiors
Built as TileMap scenes in scenes/interiors/ using ground.png + furniture drawn in assets/buildings/interior_props.png (pews, altar, tables, beds, counters — 16×16 pieces).

## Placeholder rule
Until final art lands, code MUST run with a procedural placeholder tileset
(scripts/world/placeholder_tiles.gd generates colored tiles per this contract).
Final art is a drop-in file replacement — same path, same indices. No grey boxes in Friday's build.
