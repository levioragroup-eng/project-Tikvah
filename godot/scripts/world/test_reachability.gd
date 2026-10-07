extends SceneTree
## Reachability test for the Village master map.
##
## Instantiates res://scenes/world/village.tscn, waits one main-loop tick so
## world.gd _ready() finishes painting the map, then flood-fills walkable
## tiles from the spawn point using the Collision TileMapLayer (a cell is
## walkable iff it has no collision cell). Prints PASS/FAIL per key location
## and exits 0 only if all pass.
##
## Run headless:
##   godot --headless --path ~/workspace/tikvah-game/godot \
##     --script res://scripts/world/test_reachability.gd

const MAP_W := 80
const MAP_H := 60

var _inst: Node
var _ran := false


func _init() -> void:
	var packed: PackedScene = load("res://scenes/world/village.tscn")
	if packed == null:
		print("FAIL  load village.tscn (null)")
		quit(1)
		return
	_inst = packed.instantiate()
	root.add_child(_inst)


func _process(_delta: float) -> bool:
	if _ran:
		return true
	_ran = true
	# By the first tick, world._ready() has painted every layer.
	if not is_instance_valid(_inst):
		print("FAIL  village instance invalid")
		return true
	var col: TileMapLayer = _inst.get_node("Collision")
	var spawn: Vector2i = _inst.spawn_point

	var seen := {}
	if _walkable(col, spawn):
		seen[spawn] = true
		var stack: Array = [spawn]
		var dirs := [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]
		while not stack.is_empty():
			var c: Vector2i = stack.pop_back()
			for d in dirs:
				var n: Vector2i = c + d
				if not seen.has(n) and _walkable(col, n):
					seen[n] = true
					stack.push_back(n)

	var all_ok := true
	var spawn_ok := seen.has(spawn)
	print(("PASS" if spawn_ok else "FAIL"), "  spawn ", spawn)
	all_ok = all_ok and spawn_ok

	var locs: Dictionary = _inst.KEY_LOCS
	for loc_name in locs.keys():
		var target: Vector2i = locs[loc_name]
		var ok := seen.has(target) and _walkable(col, target)
		print(("PASS" if ok else "FAIL"), "  ", loc_name, " ", target)
		all_ok = all_ok and ok

	print("walkable tiles reached: ", seen.size(), " / ", MAP_W * MAP_H)
	print("RESULT: ", "ALL PASS" if all_ok else "SOME FAILED")
	quit(0 if all_ok else 1)
	return true # quit the main loop


func _walkable(col: TileMapLayer, c: Vector2i) -> bool:
	return (
		c.x >= 0 and c.y >= 0 and c.x < MAP_W and c.y < MAP_H
		and col.get_cell_source_id(c) == -1
	)
