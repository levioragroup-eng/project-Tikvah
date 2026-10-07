class_name GameTiles
extends RefCounted
## Final TileSet built from the art track's ground.png.
## Indices are IDENTICAL to placeholder_tiles.gd (see ATLAS.md).
## Physics polygon lives on tile 48 only; visual layers must set
## collision_enabled=false (world.gd does this) so only the invisible
## Collision layer blocks movement.

const TILE := 16
const TEX_PATH := "res://assets/tiles/ground.png"
const PH := preload("res://scripts/world/placeholder_tiles.gd")


static func make_tileset() -> TileSet:
	# Load as an imported Texture2D (export-safe); Image.load_from_file
	# does NOT work in exported builds.
	var tex: Texture2D = null
	if ResourceLoader.exists(TEX_PATH):
		tex = load(TEX_PATH) as Texture2D
	if tex == null:
		push_warning("game_tiles: ground.png missing, falling back to placeholder")
		return PH.make_tileset()

	var ts := TileSet.new()
	ts.tile_size = Vector2i(TILE, TILE)

	ts.add_physics_layer(0)
	ts.set_physics_layer_collision_layer(0, 1)
	ts.set_physics_layer_collision_mask(0, 1)

	ts.add_custom_data_layer(0)
	ts.set_custom_data_layer_name(0, "interact_id")
	ts.set_custom_data_layer_type(0, TYPE_STRING)

	var src := TileSetAtlasSource.new()
	src.texture = tex
	src.texture_region_size = Vector2i(TILE, TILE)
	ts.add_source(src, 0)

	for i in range(256):
		src.create_tile(Vector2i(i % 16, i / 16))

	# Tile 48 doubles as the invisible collision blocker (full tile).
	var blocker: TileData = src.get_tile_data(Vector2i(0, 3), 0)
	blocker.add_collision_polygon(0)
	blocker.set_collision_polygon_points(0, 0, PackedVector2Array([
		Vector2(-8, -8), Vector2(8, -8), Vector2(8, 8), Vector2(-8, 8),
	]))

	for idx in PH.DOOR_IDS.keys():
		var td: TileData = src.get_tile_data(Vector2i(idx % 16, idx / 16), 0)
		td.set_custom_data_by_layer_id(0, PH.DOOR_IDS[idx])

	return ts
