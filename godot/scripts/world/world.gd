extends Node2D
## Village — TIKVAH 2.0 master map (world track).
##
## Node2D root with 8 TileMapLayer children:
##   Ground, GrassDetail, Water, Paths, Structures, Decorations,
##   Collision (invisible physics layer), Interactables (metadata layer).
##
## The map is painted procedurally in _ready() from a layout spec below,
## using the placeholder tileset from placeholder_tiles.gd (indices match
## ATLAS.md, so final art drop-in replaces it with no code changes).
##
## Map: 80x60 tiles of 16px = 1280x960 world. Origin top-left, +y = south.
## Layout (tile coords):
##   Forest north band y0-8, east edge x75-79 (trees, blocked)
##   Market      x34-46, y12-18   (stalls; target in front)
##   Home        x8-16,  y10-16   (cottage, door faces south)
##   Farm        x6-20,  y22-34   (crop rows, walkable)
##   Town Square x36-44, y26-34   (stone plaza + fountain, blocked 3x3)
##   Church      x58-70, y24-34   (footprint x61-66 y26-30, door south)
##   Cafe        x50-56, y36-42   (footprint x51-55 y37-39, door south)
##   River       y44-50 full width (blocked; bridges x24-27, x52-55; dock x38-40)
##   Ruins       x4-12,  y36-42   (walled, entrance gap on east)
##   Garden      ellipse cx65 cy55 rx6 ry3 (hedge ring, gap on west)
##
## Winding dirt paths (2-wide brush, no 1-tile corridors) connect:
##   Home<->Farm<->Town<->Market<->Cafe<->Church<->Bridge2<->Garden,
##   Town<->Bridge1<->south bank<->dock, Farm<->Ruins<->north bank<->Bridge1,
##   Market<->Forest, Home<->Forest. Multiple routes, graph has cycles.

const PT := preload("res://scripts/world/placeholder_tiles.gd")

const MAP_W := 80
const MAP_H := 60

@export var spawn_point: Vector2i = Vector2i(40, 36)

# Reachability targets (walkable cells) checked by test_reachability.gd.
const KEY_LOCS := {
	"church_door": Vector2i(63, 32),
	"cafe_door": Vector2i(53, 41),
	"market": Vector2i(40, 17),
	"home_door": Vector2i(12, 15),
	"farm": Vector2i(13, 28),
	"dock": Vector2i(39, 52),
	"garden_center": Vector2i(65, 55),
	"ruins_entrance": Vector2i(8, 39),
}

# Door marker cells on the Interactables layer: cell -> marker tile index.
const DOOR_CELLS := {
	Vector2i(63, 31): 63, # church_door
	Vector2i(53, 40): 64, # cafe_door
	Vector2i(12, 14): 65, # home_door
	Vector2i(40, 17): 66, # market_stall
	Vector2i(39, 52): 67, # dock
	Vector2i(65, 55): 68, # garden_heart
	Vector2i(13, 38): 69, # ruins_gate
}

var _layers: Dictionary = {}
var _rng := RandomNumberGenerator.new()
var _path_cells: Dictionary = {}
var _water_cells: Array[Vector2i] = []
var _water_frame := 0
var _water_timer := 0.0
var _day_phase := "morning"


func _ready() -> void:
	_rng.seed = 777123
	var ts := PT.make_tileset()
	for child in get_children():
		if child is TileMapLayer:
			_layers[child.name] = child
			child.tile_set = ts
	_paint_all()


func _process(delta: float) -> void:
	# Animate river water: cycle the 4 base frames (atlas row 1, cols 0-3).
	_water_timer += delta
	if _water_timer < 0.4 or _water_cells.is_empty():
		return
	_water_timer = 0.0
	_water_frame = (_water_frame + 1) % 4
	var wl: TileMapLayer = _layers["Water"]
	for cell in _water_cells:
		wl.set_cell(cell, 0, Vector2i(_water_frame, 1))


# ------------------------------------------------------------------ public API

## Day-phase ambient tint hook. No-op until the Lighting autoload lands;
## when present it receives set_phase(phase).
func apply_day_phase(phase: String) -> void:
	_day_phase = phase
	var lighting := get_node_or_null("/root/Lighting")
	if lighting != null and lighting.has_method("set_phase"):
		lighting.call("set_phase", phase)


func get_day_phase() -> String:
	return _day_phase


## Walkable = inside the map and no cell on the Collision layer.
func is_walkable(cell: Vector2i) -> bool:
	if not _in_bounds(cell):
		return false
	var col: TileMapLayer = _layers["Collision"]
	return col.get_cell_source_id(cell) == -1


## Interact id ("church_door", "dock", ...) for a cell, or "".
func get_interact_id(cell: Vector2i) -> String:
	var il: TileMapLayer = _layers["Interactables"]
	var atlas := il.get_cell_atlas_coords(cell)
	if atlas.x < 0:
		return ""
	var idx := atlas.y * 16 + atlas.x
	return str(PT.DOOR_IDS.get(idx, ""))


# ------------------------------------------------------------------ painting

func _ai(idx: int) -> Vector2i:
	return Vector2i(idx % 16, idx / 16)


func _in_bounds(c: Vector2i) -> bool:
	return c.x >= 0 and c.y >= 0 and c.x < MAP_W and c.y < MAP_H


func _put(layer_name: String, cell: Vector2i, idx: int) -> void:
	if not _in_bounds(cell):
		return
	(_layers[layer_name] as TileMapLayer).set_cell(cell, 0, _ai(idx))


func _block(cell: Vector2i) -> void:
	_put("Collision", cell, 48) # tile 48 carries the full-tile blocker polygon


func _fill_rect(layer_name: String, x0: int, y0: int, x1: int, y1: int, idx: int) -> void:
	for y in range(y0, y1 + 1):
		for x in range(x0, x1 + 1):
			_put(layer_name, Vector2i(x, y), idx)


func _block_rect(x0: int, y0: int, x1: int, y1: int) -> void:
	for y in range(y0, y1 + 1):
		for x in range(x0, x1 + 1):
			_block(Vector2i(x, y))


func _paint_all() -> void:
	_paint_ground()
	_paint_paths()
	_paint_water()
	_paint_structures()
	_paint_decorations()
	_paint_collision()
	_paint_interactables()


func _paint_ground() -> void:
	# Grass base with variation.
	for y in range(MAP_H):
		for x in range(MAP_W):
			var r := _rng.randf()
			var idx := 0
			if r < 0.15:
				idx = 1
			elif r < 0.25:
				idx = 2
			_put("Ground", Vector2i(x, y), idx)
	# Town square stone plaza.
	_fill_rect("Ground", 36, 26, 44, 34, 48)
	_fill_rect("Ground", 36, 26, 44, 26, 49)
	_fill_rect("Ground", 36, 34, 44, 34, 49)
	# Market apron.
	_fill_rect("Ground", 36, 17, 44, 19, 48)
	# Farm crop rows (walkable).
	var stages := [41, 42, 43, 41, 42]
	for r in range(5):
		var y := 24 + r * 2
		for x in range(8, 19):
			_put("Ground", Vector2i(x, y), stages[r])
		var y2 := y + 1
		if y2 <= 33:
			for x in range(8, 19):
				_put("Ground", Vector2i(x, y2), 40)


func _paint_paths() -> void:
	var P := [
		# Home -> Farm
		[Vector2(12, 15), Vector2(12, 20), Vector2(10, 24)],
		# Farm -> Town (north route)
		[Vector2(18, 28), Vector2(26, 30), Vector2(35, 30)],
		# Town -> Farm (south route, second route)
		[Vector2(35, 33), Vector2(28, 34), Vector2(20, 33)],
		# Farm -> Ruins
		[Vector2(8, 34), Vector2(11, 37), Vector2(13, 38)],
		# Ruins -> north river bank -> Bridge1
		[Vector2(13, 39), Vector2(16, 42), Vector2(24, 43)],
		# Town -> Market
		[Vector2(40, 34), Vector2(40, 27), Vector2(40, 20)],
		# Market -> Forest (north band)
		[Vector2(40, 12), Vector2(40, 8)],
		# Town -> Cafe
		[Vector2(45, 32), Vector2(50, 37), Vector2(53, 41)],
		# Cafe -> Church
		[Vector2(56, 37), Vector2(60, 33), Vector2(63, 32)],
		# Church -> Bridge2 (north end)
		[Vector2(60, 36), Vector2(55, 41), Vector2(53, 43)],
		# Town -> Bridge1 (north end)
		[Vector2(40, 34), Vector2(32, 40), Vector2(25, 43)],
		# Bridge2 south -> Garden west gap
		[Vector2(53, 51), Vector2(56, 53), Vector2(59, 55)],
		# South bank: Bridge1 -> dock -> Bridge2
		[Vector2(25, 51), Vector2(33, 52), Vector2(39, 52), Vector2(46, 52), Vector2(53, 51)],
		# Home -> Forest
		[Vector2(12, 10), Vector2(12, 7)],
		# Church door loop back to Town (second route east)
		[Vector2(63, 32), Vector2(58, 30), Vector2(50, 30), Vector2(45, 31)],
	]
	for poly in P:
		_draw_path(poly)


func _draw_path(points: Array) -> void:
	for s in range(points.size() - 1):
		var a: Vector2 = points[s]
		var b: Vector2 = points[s + 1]
		var dist := a.distance_to(b)
		var steps := int(maxi(int(dist * 2.0), 1))
		var dir := (b - a).normalized()
		var perp := Vector2(-dir.y, dir.x)
		for t in range(steps + 1):
			var p := a.lerp(b, float(t) / float(steps))
			var wob := sin(a.distance_to(p) * 0.9 + float(s) * 1.7)
			var c := Vector2i(roundi(p.x + perp.x * wob), roundi(p.y + perp.y * wob))
			_brush(c)


func _brush(c: Vector2i) -> void:
	for dy in range(2):
		for dx in range(2):
			var cell := c + Vector2i(dx, dy)
			if not _in_bounds(cell):
				continue
			var idx := 8
			if _rng.randf() < 0.18:
				idx = 9 + _rng.randi_range(0, 6)
			_put("Paths", cell, idx)
			_path_cells[cell] = true


func _paint_water() -> void:
	# River y44-50, full width. Edges foam, interior animated frames.
	for y in range(44, 51):
		for x in range(MAP_W):
			var cell := Vector2i(x, y)
			if y == 44 and x == 0:
				_put("Water", cell, 28)
			elif y == 44 and x == MAP_W - 1:
				_put("Water", cell, 29)
			elif y == 50 and x == 0:
				_put("Water", cell, 30)
			elif y == 50 and x == MAP_W - 1:
				_put("Water", cell, 31)
			elif y == 44:
				_put("Water", cell, 24)
			elif y == 50:
				_put("Water", cell, 25)
			elif x == 0:
				_put("Water", cell, 27)
			elif x == MAP_W - 1:
				_put("Water", cell, 26)
			else:
				_put("Water", cell, 16 + _rng.randi_range(0, 3))
				_water_cells.append(cell)


func _paint_structures() -> void:
	var S := "Structures"
	# Fountain 3x3 at town square center (39-41, 29-31).
	_fill_rect(S, 39, 29, 41, 31, 54)
	_put(S, Vector2i(39, 29), 54)
	_put(S, Vector2i(40, 29), 55)
	_put(S, Vector2i(41, 29), 54)
	_put(S, Vector2i(39, 30), 55)
	_put(S, Vector2i(40, 30), 56)
	_put(S, Vector2i(41, 30), 55)
	_put(S, Vector2i(39, 31), 54)
	_put(S, Vector2i(40, 31), 55)
	_put(S, Vector2i(41, 31), 54)
	_put(S, Vector2i(40, 28), 57) # top basin peeking north (visual only)
	# Home cottage footprint 10-14 x 11-13.
	_fill_rect(S, 10, 11, 14, 13, 50)
	_fill_rect(S, 10, 11, 14, 11, 51)
	# Cafe footprint 51-55 x 37-39.
	_fill_rect(S, 51, 37, 55, 39, 50)
	_fill_rect(S, 51, 37, 55, 37, 51)
	# Church footprint 61-66 x 26-30.
	_fill_rect(S, 61, 26, 66, 30, 51)
	_fill_rect(S, 61, 26, 66, 26, 50)
	# Market stalls.
	_fill_rect(S, 36, 14, 38, 16, 48)
	_fill_rect(S, 42, 14, 44, 16, 48)
	# Bridges over the river: rails outside, planks inside.
	for y in range(44, 51):
		for x in [24, 27]:
			_put(S, Vector2i(x, y), 53)
		for x in [25, 26]:
			_put(S, Vector2i(x, y), 52)
		for x in [52, 55]:
			_put(S, Vector2i(x, y), 53)
		for x in [53, 54]:
			_put(S, Vector2i(x, y), 52)
	# Dock x38-40, y49-53.
	_fill_rect(S, 38, 49, 40, 53, 62)
	# Ruins walls (entrance gap on east side x12, y38-39).
	for x in range(4, 13):
		_put(S, Vector2i(x, 36), 61)
		_put(S, Vector2i(x, 42), 61)
	for y in range(36, 43):
		_put(S, Vector2i(4, y), 61)
	for y in [36, 37, 40, 41, 42]:
		_put(S, Vector2i(12, y), 61)
	# Garden of Hope: hedge ellipse ring (cx65 cy55 rx6 ry3), gap on west.
	for y in range(51, 60):
		for x in range(58, 73):
			var dx := (x - 65) / 6.0
			var dy := (y - 55) / 3.0
			var d := dx * dx + dy * dy
			if d >= 0.72 and d <= 1.30:
				if x < 65 and abs(y - 55) <= 1:
					continue # west entrance gap
				_put(S, Vector2i(x, y), 58)


func _paint_decorations() -> void:
	var D := "Decorations"
	# Grass detail: tufts / tiny flowers / clover on plain grass.
	for y in range(MAP_H):
		for x in range(MAP_W):
			var cell := Vector2i(x, y)
			if _path_cells.has(cell):
				continue
			if (_layers["Water"] as TileMapLayer).get_cell_source_id(cell) != -1:
				continue
			if (_layers["Structures"] as TileMapLayer).get_cell_source_id(cell) != -1:
				continue
			var g := (_layers["Ground"] as TileMapLayer).get_cell_atlas_coords(cell)
			var gidx := g.y * 16 + g.x
			if gidx < 0 or gidx > 2:
				continue
			var r := _rng.randf()
			if r < 0.05:
				_put(D, cell, 3 + _rng.randi_range(0, 4)) # 3-7
	# Forest: north band y1-7 and east edge x75-78 (skip paths, water, plots).
	for y in range(1, 8):
		for x in range(1, MAP_W - 1):
			_maybe_tree(Vector2i(x, y), 0.30)
	for y in range(1, MAP_H - 1):
		for x in range(75, 79):
			if y >= 44 and y <= 50:
				continue # river
			_maybe_tree(Vector2i(x, y), 0.30)
	# Cafe awning + outdoor tables (walkable decor).
	_fill_rect(D, 51, 36, 55, 36, 33)
	_put(D, Vector2i(51, 41), 32)
	_put(D, Vector2i(55, 41), 34)
	# Market stall goods.
	_put(D, Vector2i(37, 15), 32)
	_put(D, Vector2i(43, 15), 35)
	_put(D, Vector2i(37, 14), 43)
	_put(D, Vector2i(43, 16), 41)
	# Farm scarecrow (walkable).
	_put(D, Vector2i(14, 27), 60)
	# Garden interior flowers.
	for k in range(10):
		var cell := Vector2i(_rng.randi_range(61, 69), _rng.randi_range(53, 57))
		if (_layers["Structures"] as TileMapLayer).get_cell_source_id(cell) == -1:
			_put(D, cell, 32 + _rng.randi_range(0, 3))
	# Ruin rubble (walkable decor).
	_put(D, Vector2i(6, 37), 61)
	_put(D, Vector2i(10, 41), 61)
	_put(D, Vector2i(7, 40), 61)


func _maybe_tree(cell: Vector2i, density: float) -> void:
	if not _in_bounds(cell):
		return
	if _path_cells.has(cell):
		return
	if (_layers["Structures"] as TileMapLayer).get_cell_source_id(cell) != -1:
		return
	if (_layers["Water"] as TileMapLayer).get_cell_source_id(cell) != -1:
		return
	if _rng.randf() < density:
		_put("Decorations", cell, 59) # canopy; collision added in _paint_collision


func _paint_collision() -> void:
	# River blocked except bridges and dock.
	for y in range(44, 51):
		for x in range(MAP_W):
			if (x >= 24 and x <= 27) or (x >= 52 and x <= 55):
				continue # bridges
			if x >= 38 and x <= 40 and y >= 49:
				continue # dock planks (y49-53)
			_block(Vector2i(x, y))
	# Fountain, buildings, stalls.
	_block_rect(39, 29, 41, 31)
	_block_rect(10, 11, 14, 13) # home
	_block_rect(51, 37, 55, 39) # cafe
	_block_rect(61, 26, 66, 30) # church
	_block_rect(36, 14, 38, 16) # stall A
	_block_rect(42, 14, 44, 16) # stall B
	# Ruins walls + two interior pillars.
	for x in range(4, 13):
		_block(Vector2i(x, 36))
		_block(Vector2i(x, 42))
	for y in range(36, 43):
		_block(Vector2i(4, y))
	for y in [36, 37, 40, 41, 42]:
		_block(Vector2i(12, y))
	_block(Vector2i(6, 38))
	_block(Vector2i(10, 40))
	# Garden hedge ring (same ellipse as structures).
	for y in range(51, 60):
		for x in range(58, 73):
			var dx := (x - 65) / 6.0
			var dy := (y - 55) / 3.0
			var d := dx * dx + dy * dy
			if d >= 0.72 and d <= 1.30:
				if x < 65 and abs(y - 55) <= 1:
					continue
				_block(Vector2i(x, y))
	# Forest trees (canopy tiles on Decorations).
	var dl: TileMapLayer = _layers["Decorations"]
	for y in range(MAP_H):
		for x in range(MAP_W):
			var cell := Vector2i(x, y)
			if dl.get_cell_atlas_coords(cell) == _ai(59):
				_block(cell)
	# Map border (keeps the player inside).
	for x in range(MAP_W):
		_block(Vector2i(x, 0))
		_block(Vector2i(x, MAP_H - 1))
	for y in range(MAP_H):
		_block(Vector2i(0, y))
		_block(Vector2i(MAP_W - 1, y))


func _paint_interactables() -> void:
	for cell in DOOR_CELLS.keys():
		_put("Interactables", cell, DOOR_CELLS[cell])
