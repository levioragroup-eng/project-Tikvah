extends RefCounted
## PlaceholderTiles — procedural placeholder tileset for TIKVAH 2.0.
##
## Generates a 256x256 ImageTexture (16x16 grid of 16px tiles) whose tile
## INDICES match assets/tiles/ATLAS.md exactly, so final art is a drop-in
## file replacement (same path res://assets/tiles/ground.png, same indices).
##
## Index map (from ATLAS.md v1):
##   0-7   grass base + variants        32-39  flowers / mushroom / reeds / lily
##   8-15  dirt path variants           40-47  plowed soil + crop stages
##   16-23 water frames (4 x 2)         48-63  stone / bridge / fountain / hedge /
##   24-31 water edge + foam                     tree / ruin / dock / door markers
##   64-255 RESERVED (flat navy so unused tiles are obvious)
##
## NOTE: tiles 58-63 are named "stone, bridge planks, fountain pieces" in the
## contract; this file also uses them for hedge (58), tree canopy/trunk
## (59-60), ruin block (61), dock planks (62) and door markers (63-69, the
## last six spilling into the RESERVED range). The assets track may remap
## 58+ when final art lands — indices 0-57 are contract-exact.
##
## Also builds the TileSet: 16px tiles, physics layer 0 (full-tile blocker on
## tile 48, used by the Collision TileMapLayer), and a String custom-data
## layer "interact_id" on the door-marker tiles 63-69.

const TILE := 16
const SEED := 20261006

# Door marker tiles -> interact ids (custom data layer 0).
const DOOR_IDS := {
	63: "church_door",
	64: "cafe_door",
	65: "home_door",
	66: "market_stall",
	67: "dock",
	68: "garden_heart",
	69: "ruins_gate",
}


static func make_tileset() -> TileSet:
	var rng := RandomNumberGenerator.new()
	rng.seed = SEED

	var img := Image.create(256, 256, false, Image.FORMAT_RGBA8)
	img.fill(Color("1f2a44")) # reserved navy; tiles paint over their own 16x16
	for i in range(256):
		_paint_tile(img, i, rng)

	var tex := ImageTexture.create_from_image(img)

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

	# Tile 48 (stone) doubles as the invisible collision blocker: full tile.
	var blocker: TileData = src.get_tile_data(Vector2i(0, 3), 0)
	blocker.add_collision_polygon(0)
	blocker.set_collision_polygon_points(0, 0, PackedVector2Array([
		Vector2(-8, -8), Vector2(8, -8), Vector2(8, 8), Vector2(-8, 8),
	]))

	for idx in DOOR_IDS.keys():
		var td: TileData = src.get_tile_data(Vector2i(idx % 16, idx / 16), 0)
		td.set_custom_data_by_layer_id(0, DOOR_IDS[idx])

	return ts


# ---------------------------------------------------------------- paint utils

static func _fill(img: Image, i: int, c: Color) -> void:
	var o := Vector2i((i % 16) * 16, (i / 16) * 16)
	img.fill_rect(Rect2i(o, Vector2i(16, 16)), c)


static func _px(img: Image, i: int, x: int, y: int, c: Color) -> void:
	if x < 0 or y < 0 or x > 15 or y > 15:
		return
	img.set_pixel((i % 16) * 16 + x, (i / 16) * 16 + y, c)


static func _speckle(img: Image, i: int, rng: RandomNumberGenerator, c: Color, n: int) -> void:
	for k in range(n):
		_px(img, i, rng.randi_range(0, 15), rng.randi_range(0, 15), c)


static func _grass(img: Image, i: int, rng: RandomNumberGenerator) -> void:
	_fill(img, i, Color("5a8f3c"))
	_speckle(img, i, rng, Color("4a7a32"), 22)
	_speckle(img, i, rng, Color("6fa04a"), 10)


static func _water_base(img: Image, i: int, f: int, deep: Color, foam: Color) -> void:
	_fill(img, i, deep)
	# two dashed wave lines; dashes shift with the animation frame
	for x in range(16):
		if (x + f * 2) % 5 < 3:
			_px(img, i, x, 5, foam)
		if (x + f * 2 + 2) % 5 < 3:
			_px(img, i, x, 11, foam)
	_px(img, i, (2 + f * 4) % 16, 2, Color("dfe9f5"))


# ---------------------------------------------------------------- tile painters

static func _paint_tile(img: Image, i: int, rng: RandomNumberGenerator) -> void:
	match i:
		0:
			_grass(img, i, rng)
		1:
			_fill(img, i, Color("6fa04a"))
			_speckle(img, i, rng, Color("5a8f3c"), 16)
		2:
			_fill(img, i, Color("4a7a32"))
			_speckle(img, i, rng, Color("3a6128"), 16)
		3: # grass tuft
			_grass(img, i, rng)
			for t in range(5):
				var x := rng.randi_range(1, 14)
				var y := rng.randi_range(8, 11)
				_px(img, i, x, y, Color("2f6b2f"))
				_px(img, i, x, y - 1, Color("2f6b2f"))
				_px(img, i, x, y - 2, Color("3f8f3f"))
		4: # tiny white flowers
			_grass(img, i, rng)
			_speckle(img, i, rng, Color("f5f5f5"), 9)
		5: # tiny yellow flowers
			_grass(img, i, rng)
			_speckle(img, i, rng, Color("e8d44a"), 9)
		6: # pebble
			_grass(img, i, rng)
			for t in range(3):
				var x := rng.randi_range(1, 13)
				var y := rng.randi_range(1, 13)
				_px(img, i, x, y, Color("9a9a9a"))
				_px(img, i, x + 1, y, Color("9a9a9a"))
				_px(img, i, x, y + 1, Color("7a7a7a"))
				_px(img, i, x + 1, y + 1, Color("7a7a7a"))
		7: # clover
			_grass(img, i, rng)
			for t in range(4):
				var x := rng.randi_range(1, 13)
				var y := rng.randi_range(1, 13)
				_px(img, i, x, y, Color("2f6b2f"))
				_px(img, i, x + 1, y, Color("2f6b2f"))
				_px(img, i, x, y + 1, Color("2f6b2f"))
				_px(img, i, x + 1, y + 1, Color("2f6b2f"))
		8, 9, 10, 11, 12, 13, 14, 15: # dirt path variants
			var tints := ["b99a68", "b3945f", "bfa06e", "ad8f5e", "b99a68",
				"a8915f", "bfa06e", "ad8f5e"]
			_fill(img, i, Color(tints[i - 8]))
			_speckle(img, i, rng, Color("8a6f45"), 18)
			_speckle(img, i, rng, Color("d4b98a"), 8)
		16, 17, 18, 19: # water frames A
			_water_base(img, i, i - 16, Color("2b4d80"), Color("7fb2d9"))
		20, 21, 22, 23: # water frames B (lighter variant)
			_water_base(img, i, i - 20, Color("35709e"), Color("a8d0e6"))
		24: # water edge N (grass top, water bottom)
			_fill(img, i, Color("2b4d80"))
			for x in range(16):
				for y in range(7):
					_px(img, i, x, y, Color("5a8f3c"))
			for x in range(16):
				_px(img, i, x, 7, Color("e8f2fa"))
				_px(img, i, x, 8, Color("7fb2d9"))
		25: # water edge S
			_fill(img, i, Color("2b4d80"))
			for x in range(16):
				for y in range(9, 16):
					_px(img, i, x, y, Color("5a8f3c"))
			for x in range(16):
				_px(img, i, x, 8, Color("e8f2fa"))
				_px(img, i, x, 7, Color("7fb2d9"))
		26: # water edge E
			_fill(img, i, Color("2b4d80"))
			for x in range(9, 16):
				for y in range(16):
					_px(img, i, x, y, Color("5a8f3c"))
			for y in range(16):
				_px(img, i, 8, y, Color("e8f2fa"))
				_px(img, i, 7, y, Color("7fb2d9"))
		27: # water edge W
			_fill(img, i, Color("2b4d80"))
			for x in range(7):
				for y in range(16):
					_px(img, i, x, y, Color("5a8f3c"))
			for y in range(16):
				_px(img, i, 7, y, Color("e8f2fa"))
				_px(img, i, 8, y, Color("7fb2d9"))
		28, 29, 30, 31: # water corners (grass quarter)
			_fill(img, i, Color("2b4d80"))
			var gx := 0 if (i == 28 or i == 30) else 9
			var gy := 0 if (i == 28 or i == 29) else 9
			for x in range(gx, gx + 7):
				for y in range(gy, gy + 7):
					_px(img, i, x, y, Color("5a8f3c"))
			for x in range(gx, gx + 7):
				_px(img, i, x, gy + (7 if gy == 0 else -1), Color("e8f2fa"))
		32, 33, 34, 35: # flower clusters
			_grass(img, i, rng)
			var cols := ["d45a5a", "e08bb0", "9a6ac8", "f5f5f5"]
			var c := Color(cols[i - 32])
			for t in range(3):
				var x := rng.randi_range(2, 12)
				var y := rng.randi_range(3, 12)
				_px(img, i, x, y, Color("2f6b2f"))
				_px(img, i, x, y - 1, c)
				_px(img, i, x + 1, y - 1, c)
				_px(img, i, x, y - 2, c)
		36: # mushroom
			_grass(img, i, rng)
			_px(img, i, 7, 10, Color("e8dcc0"))
			_px(img, i, 8, 10, Color("e8dcc0"))
			_px(img, i, 7, 9, Color("e8dcc0"))
			_px(img, i, 8, 9, Color("e8dcc0"))
			for x in range(5, 11):
				_px(img, i, x, 8, Color("c0392b"))
			for x in range(6, 10):
				_px(img, i, x, 7, Color("c0392b"))
			_px(img, i, 7, 7, Color("f5e9c8"))
			_px(img, i, 8, 8, Color("f5e9c8"))
		37: # reeds
			_grass(img, i, rng)
			for t in range(4):
				var x := 2 + t * 4
				var h := 6 + (t % 3) * 2
				for y in range(14, 14 - h, -1):
					_px(img, i, x, y, Color("3f7a2e"))
			_px(img, i, 10, 5, Color("6b4a2f"))
			_px(img, i, 10, 4, Color("6b4a2f"))
		38: # lily pad
			_fill(img, i, Color("2b4d80"))
			for x in range(16):
				for y in range(16):
					var dx := (x - 8) / 6.0
					var dy := (y - 8) / 5.0
					if dx * dx + dy * dy <= 1.0 and not (x > 8 and y < 6):
						_px(img, i, x, y, Color("3e8f4e"))
			_px(img, i, 6, 6, Color("e08bb0"))
			_px(img, i, 7, 6, Color("e08bb0"))
		39: # tall grass
			_grass(img, i, rng)
			for t in range(8):
				var x := rng.randi_range(1, 14)
				var y := rng.randi_range(9, 12)
				for k in range(5):
					_px(img, i, x, y - k, Color("4a7a32"))
		40, 44: # plowed soil
			_fill(img, i, Color("6b4a2f"))
			for y in range(2, 16, 4):
				for x in range(16):
					_px(img, i, x, y, Color("54371f"))
			_speckle(img, i, rng, Color("7d5a3a"), 10)
		41, 45: # sprout
			_fill(img, i, Color("6b4a2f"))
			for y in range(2, 16, 4):
				for x in range(16):
					_px(img, i, x, y, Color("54371f"))
			for t in range(6):
				var x := rng.randi_range(1, 14)
				var y := rng.randi_range(2, 13)
				_px(img, i, x, y, Color("5a8f3c"))
				_px(img, i, x + 1, y, Color("5a8f3c"))
		42, 46: # growing
			_fill(img, i, Color("6b4a2f"))
			for y in range(2, 16, 4):
				for x in range(16):
					_px(img, i, x, y, Color("54371f"))
			for t in range(5):
				var x := rng.randi_range(1, 14)
				var y := rng.randi_range(4, 13)
				_px(img, i, x, y, Color("3f7a2e"))
				_px(img, i, x, y - 1, Color("3f7a2e"))
				_px(img, i, x, y - 2, Color("5a8f3c"))
				_px(img, i, x - 1, y - 1, Color("5a8f3c"))
		43, 47: # mature crop (wheat gold)
			_fill(img, i, Color("6b4a2f"))
			for y in range(2, 16, 4):
				for x in range(16):
					_px(img, i, x, y, Color("54371f"))
			for t in range(6):
				var x := rng.randi_range(1, 14)
				var y := rng.randi_range(6, 13)
				for k in range(5):
					_px(img, i, x, y - k, Color("d4a94e"))
				_px(img, i, x - 1, y - 4, Color("d4a94e"))
				_px(img, i, x + 1, y - 4, Color("b98a3a"))
		48: # stone tile (also the invisible collision blocker)
			_fill(img, i, Color("9a9a9a"))
			for x in range(16):
				_px(img, i, x, 5, Color("7a7a7a"))
				_px(img, i, x, 11, Color("7a7a7a"))
			for y in range(6):
				_px(img, i, 7, y, Color("7a7a7a"))
			for y in range(6, 12):
				_px(img, i, 3, y, Color("7a7a7a"))
				_px(img, i, 11, y, Color("7a7a7a"))
			_speckle(img, i, rng, Color("b0b0b0"), 8)
		49: # stone dark
			_fill(img, i, Color("7f7f7f"))
			_speckle(img, i, rng, Color("6a6a6a"), 14)
			_speckle(img, i, rng, Color("9a9a9a"), 8)
		50: # stone wall
			_fill(img, i, Color("8a7a68"))
			for y in range(3, 16, 4):
				for x in range(16):
					_px(img, i, x, y, Color("6b5c4c"))
			for x in range(4, 16, 8):
				for y in range(4):
					_px(img, i, x, y, Color("6b5c4c"))
		51: # stone wall dark
			_fill(img, i, Color("6f6257"))
			for y in range(3, 16, 4):
				for x in range(16):
					_px(img, i, x, y, Color("544a41"))
		52: # bridge planks
			_fill(img, i, Color("8a6238"))
			for y in range(3, 16, 4):
				for x in range(16):
					_px(img, i, x, y, Color("6b4a2f"))
			_px(img, i, 3, 1, Color("4a331f"))
			_px(img, i, 12, 9, Color("4a331f"))
		53: # bridge rail
			_fill(img, i, Color("8a6238"))
			for x in range(16):
				for y in range(6):
					_px(img, i, x, y, Color("5a3d24"))
			for x in range(2, 16, 5):
				for y in range(16):
					_px(img, i, x, y, Color("5a3d24"))
		54: # fountain base
			_fill(img, i, Color("9a9a9a"))
			for x in range(2, 14):
				for y in range(2, 14):
					_px(img, i, x, y, Color("7a7a7a"))
			for x in range(16):
				_px(img, i, x, 0, Color("bdbdbd"))
				_px(img, i, x, 1, Color("bdbdbd"))
		55: # fountain water
			_fill(img, i, Color("35709e"))
			_speckle(img, i, rng, Color("e8f2fa"), 10)
			_speckle(img, i, rng, Color("7fb2d9"), 8)
		56: # fountain center column
			_fill(img, i, Color("7a7a7a"))
			for y in range(2, 14):
				for x in range(6, 10):
					_px(img, i, x, y, Color("9a9a9a"))
			for x in range(5, 11):
				_px(img, i, x, 1, Color("d4a94e"))
				_px(img, i, x, 2, Color("d4a94e"))
		57: # fountain top basin
			_fill(img, i, Color("9a9a9a"))
			for x in range(3, 13):
				for y in range(4, 12):
					_px(img, i, x, y, Color("35709e"))
			_speckle(img, i, rng, Color("e8f2fa"), 6)
		58: # hedge (garden ring)
			_fill(img, i, Color("2f6b2f"))
			for t in range(6):
				var x := rng.randi_range(2, 13)
				var y := rng.randi_range(2, 13)
				_px(img, i, x, y, Color("245224"))
				_px(img, i, x + 1, y, Color("245224"))
				_px(img, i, x, y + 1, Color("245224"))
			_speckle(img, i, rng, Color("3f8f3f"), 12)
		59: # tree canopy
			_fill(img, i, Color("5a8f3c"))
			for x in range(16):
				for y in range(16):
					var dx := (x - 8) / 7.0
					var dy := (y - 7) / 6.0
					if dx * dx + dy * dy <= 1.0:
						_px(img, i, x, y, Color("3e7d3e"))
			_speckle(img, i, rng, Color("2f6b2f"), 14)
			_speckle(img, i, rng, Color("5aa04a"), 8)
		60: # tree trunk
			_grass(img, i, rng)
			for y in range(16):
				for x in range(6, 10):
					_px(img, i, x, y, Color("6b4a2f"))
			for y in range(16):
				_px(img, i, 6, y, Color("4a331f"))
				_px(img, i, 9, y, Color("4a331f"))
		61: # ruin block
			_fill(img, i, Color("8f8578"))
			_px(img, i, 3, 2, Color("5f574c"))
			_px(img, i, 4, 5, Color("5f574c"))
			_px(img, i, 5, 8, Color("5f574c"))
			_px(img, i, 9, 4, Color("5f574c"))
			_px(img, i, 10, 9, Color("5f574c"))
			_px(img, i, 11, 12, Color("5f574c"))
			_speckle(img, i, rng, Color("4a7a32"), 6)
			_speckle(img, i, rng, Color("a39a8b"), 8)
		62: # dock planks
			_fill(img, i, Color("7a5c38"))
			for y in range(3, 16, 4):
				for x in range(16):
					_px(img, i, x, y, Color("5f4527"))
			_px(img, i, 1, 1, Color("4a331f"))
			_px(img, i, 14, 1, Color("4a331f"))
		63, 64, 65, 66, 67, 68, 69: # door markers (gold, dark border, glyph)
			_fill(img, i, Color("d4a94e"))
			for x in range(16):
				_px(img, i, x, 0, Color("1f2a44"))
				_px(img, i, x, 15, Color("1f2a44"))
				_px(img, i, 0, x, Color("1f2a44"))
				_px(img, i, 15, x, Color("1f2a44"))
			_glyph(img, i, rng)
		_: # 70-255 reserved
			pass


static func _glyph(img: Image, i: int, rng: RandomNumberGenerator) -> void:
	var d := Color("1f2a44")
	match i:
		63: # church: pointed arch
			for y in range(4, 13):
				_px(img, i, 4, y, d)
				_px(img, i, 11, y, d)
			for x in range(4, 12):
				_px(img, i, x, 12, d)
			_px(img, i, 5, 3, d)
			_px(img, i, 10, 3, d)
			_px(img, i, 6, 2, d)
			_px(img, i, 9, 2, d)
			_px(img, i, 7, 2, d)
			_px(img, i, 8, 2, d)
		64: # cafe: cup
			for x in range(4, 10):
				_px(img, i, x, 11, d)
			for y in range(5, 11):
				_px(img, i, 4, y, d)
				_px(img, i, 9, y, d)
			_px(img, i, 10, 6, d)
			_px(img, i, 11, 7, d)
			_px(img, i, 11, 8, d)
			_px(img, i, 10, 9, d)
		65: # home: house
			for x in range(3, 13):
				_px(img, i, x, 11, d)
			for y in range(6, 11):
				_px(img, i, 4, y, d)
				_px(img, i, 11, y, d)
			_px(img, i, 5, 5, d)
			_px(img, i, 10, 5, d)
			_px(img, i, 6, 4, d)
			_px(img, i, 9, 4, d)
			_px(img, i, 7, 3, d)
			_px(img, i, 8, 3, d)
		66: # market: stall stripes
			for x in range(3, 13, 2):
				for y in range(4, 12):
					_px(img, i, x, y, d)
		67: # dock: anchor
			for y in range(3, 12):
				_px(img, i, 8, y, d)
			for x in range(5, 12):
				_px(img, i, x, 4, d)
			_px(img, i, 5, 10, d)
			_px(img, i, 6, 11, d)
			_px(img, i, 11, 10, d)
			_px(img, i, 10, 11, d)
		68: # garden: heart
			for x in range(4, 8):
				_px(img, i, x, 5, d)
			for x in range(8, 12):
				_px(img, i, x, 5, d)
			for x in range(4, 12):
				_px(img, i, x, 6, d)
			for x in range(5, 11):
				_px(img, i, x, 7, d)
			for x in range(6, 10):
				_px(img, i, x, 8, d)
			_px(img, i, 7, 9, d)
			_px(img, i, 8, 9, d)
		69: # ruins: broken column
			for y in range(3, 7):
				_px(img, i, 7, y, d)
				_px(img, i, 8, y, d)
			for y in range(9, 13):
				_px(img, i, 7, y, d)
				_px(img, i, 8, y, d)
			_px(img, i, 6, 7, Color("c0392b"))
			_px(img, i, 9, 8, Color("c0392b"))
