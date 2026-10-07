class_name InteriorScene
extends Node2D
## InteriorScene — shared base for TIKVAH 2.0 interiors (player track).
##
## Paints Floor/Walls TileMapLayers from the placeholder tileset
## (indices match assets/tiles/ATLAS.md) and builds perimeter wall collision
## with a door gap in the south wall. Furniture, Interactables, the exit
## DoorTransition and the Spawn_enter marker are declarative in each .tscn.

const PT := preload("res://scripts/world/placeholder_tiles.gd")

@export var room: Rect2i = Rect2i(0, 0, 14, 10)
@export var floor_tile: int = 52
@export var floor_alt: int = -1 ## optional checkerboard alternate, -1 = none
## NOTE: never use tile 48 for floors — the placeholder tileset gives tile 48
## a full-tile physics blocker (it is the invisible collision tile).
@export var wall_tile: int = 50
@export var door_gap: Rect2i = Rect2i(6, 9, 2, 1) ## open cells in the south wall


func _ready() -> void:
	var ts: TileSet = PT.make_tileset()
	var floor_l := TileMapLayer.new()
	floor_l.name = "Floor"
	floor_l.tile_set = ts
	floor_l.z_index = -10
	var wall_l := TileMapLayer.new()
	wall_l.name = "Walls"
	wall_l.tile_set = ts
	wall_l.z_index = -9
	add_child(floor_l)
	add_child(wall_l)
	move_child(floor_l, 0)
	move_child(wall_l, 1)
	for y in range(room.position.y, room.end.y):
		for x in range(room.position.x, room.end.x):
			var cell := Vector2i(x, y)
			var edge := x == room.position.x or y == room.position.y \
				or x == room.end.x - 1 or y == room.end.y - 1
			if edge and not door_gap.has_point(cell):
				wall_l.set_cell(cell, 0, _ai(wall_tile))
			else:
				var idx := floor_tile
				if floor_alt >= 0 and (x + y) % 2 == 1:
					idx = floor_alt
				floor_l.set_cell(cell, 0, _ai(idx))
	_build_wall_collision()


func _ai(idx: int) -> Vector2i:
	return Vector2i(idx % 16, idx / 16)


func _build_wall_collision() -> void:
	var body := StaticBody2D.new()
	body.name = "WallCollision"
	add_child(body)
	var rx := float(room.position.x * 16)
	var ry := float(room.position.y * 16)
	var rw := float(room.size.x * 16)
	var rh := float(room.size.y * 16)
	_wall_rect(body, Rect2(rx, ry, rw, 16.0)) # north
	_wall_rect(body, Rect2(rx, ry + 16.0, 16.0, rh - 32.0)) # west
	_wall_rect(body, Rect2(rx + rw - 16.0, ry + 16.0, 16.0, rh - 32.0)) # east
	var gx0 := float(door_gap.position.x * 16)
	var gx1 := float(door_gap.end.x * 16)
	var sy := ry + rh - 16.0
	_wall_rect(body, Rect2(rx, sy, gx0 - rx, 16.0)) # south, left of gap
	_wall_rect(body, Rect2(gx1, sy, rx + rw - gx1, 16.0)) # south, right of gap


func _wall_rect(body: StaticBody2D, r: Rect2) -> void:
	if r.size.x <= 0.0 or r.size.y <= 0.0:
		return
	var cs := CollisionShape2D.new()
	var shape := RectangleShape2D.new()
	shape.size = r.size
	cs.shape = shape
	cs.position = r.get_center()
	body.add_child(cs)
