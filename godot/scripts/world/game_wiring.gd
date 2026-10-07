extends RefCounted
class_name GameWiring
## TIKVAH 2.0 master wiring — integrates all tracks into the village scene.
## Called from world.gd._ready() AFTER _paint_all(). Owns: player spawn,
## doors, camera, lighting, clock, NPCs, systems, story, netcode, title UI.

const TILE := 16

const PLAYER_SCENE := preload("res://scenes/player/player.tscn")
const DOOR_SCENE := preload("res://scenes/systems/door_transition.tscn")
const CLOCK_SCRIPT := preload("res://scripts/systems/time_clock.gd")
const FARMING_SCRIPT := preload("res://scripts/systems/farming.gd")
const FISHING_SCRIPT := preload("res://scripts/systems/fishing.gd")
const COOKING_SCRIPT := preload("res://scripts/systems/cooking.gd")
const REL_SCRIPT := preload("res://scripts/systems/relationships.gd")
const SCRIPTURE_SCRIPT := preload("res://scripts/story/scripture.gd")
const MYSTERY_SCRIPT := preload("res://scripts/story/mystery.gd")
const PUZZLES_SCRIPT := preload("res://scripts/story/puzzles.gd")
const RESTORATION_SCRIPT := preload("res://scripts/story/restoration.gd")
const NOTEBOOK_SCENE := preload("res://scenes/ui/notebook.tscn")
const CLIENT_SCRIPT := preload("res://scripts/multiplayer/tikvah_client.gd")

# Life-track phases -> SPEC lighting names.
const PHASE_LIGHT := {"morning": "morning", "afternoon": "day", "dusk": "sunset", "night": "night"}
const LIGHT_TINT := {
	"morning": Color(1.0, 0.96, 0.88),
	"day": Color(1.0, 1.0, 1.0),
	"sunset": Color(1.0, 0.78, 0.66),
	"night": Color(0.5, 0.58, 0.88),
}

const DOORS := [
	{"tile": Vector2i(63, 32), "target": "res://scenes/interiors/church_interior.tscn", "id": "church"},
	{"tile": Vector2i(12, 15), "target": "res://scenes/interiors/home_interior.tscn", "id": "home"},
	{"tile": Vector2i(53, 41), "target": "res://scenes/interiors/cafe_interior.tscn", "id": "cafe"},
	{"tile": Vector2i(40, 20), "target": "res://scenes/interiors/market_interior.tscn", "id": "market"},
]

const NPC_DEFS := [
	{"scene": "hannah", "art": "hannah.png", "schedule": {
		"morning": Vector2i(12, 28), "afternoon": Vector2i(40, 17),
		"dusk": Vector2i(53, 39), "night": Vector2i(12, 15)}},
	{"scene": "elias", "art": "elias.png", "schedule": {
		"morning": Vector2i(40, 17), "afternoon": Vector2i(13, 28),
		"dusk": Vector2i(37, 31), "night": Vector2i(20, 30)}},
	{"scene": "miriam", "art": "miriam.png", "schedule": {
		"morning": Vector2i(14, 14), "afternoon": Vector2i(65, 55),
		"dusk": Vector2i(63, 32), "night": Vector2i(14, 14)}},
	{"scene": "nathan", "art": "nathan.png", "schedule": {
		"morning": Vector2i(63, 32), "afternoon": Vector2i(63, 32),
		"dusk": Vector2i(63, 32), "night": Vector2i(63, 32)}},
	{"scene": "villager1", "art": "villager1.png", "schedule": {
		"morning": Vector2i(37, 31), "afternoon": Vector2i(42, 30),
		"dusk": Vector2i(38, 33), "night": Vector2i(37, 31)}},
	{"scene": "villager2", "art": "villager2.png", "schedule": {
		"morning": Vector2i(42, 30), "afternoon": Vector2i(37, 33),
		"dusk": Vector2i(40, 31), "night": Vector2i(42, 30)}},
]


static func tile_to_world(t: Vector2i) -> Vector2:
	return Vector2(t.x * TILE + TILE * 0.5, t.y * TILE + TILE * 0.5)


## Build walk/idle SpriteFrames from a 64x96 character sheet
## (4 cols x 4 rows of 16x24; rows = down/up/left/right).
static func apply_character_art(animated: AnimatedSprite2D, png_path: String) -> void:
	var tex: Texture2D = load(png_path) as Texture2D
	if tex == null:
		return
	var frames := SpriteFrames.new()
	var dirs := ["down", "up", "left", "right"]
	for r in range(4):
		for key in ["walk_", "idle_"]:
			var anim: String = key + dirs[r]
			frames.add_animation(anim)
			frames.set_animation_speed(anim, 8.0 if key == "walk_" else 2.0)
			frames.set_animation_loop(anim, true)
		for c in range(4):
			var at := AtlasTexture.new()
			at.atlas = tex
			at.region = Rect2(c * 16, r * 24, 16, 24)
			frames.add_frame("walk_" + dirs[r], at)
		var idle := AtlasTexture.new()
		idle.atlas = tex
		idle.region = Rect2(0, r * 24, 16, 24)
		frames.add_frame("idle_" + dirs[r], idle)
	# Godot 4.7: AnimatedSprite2D.frames -> sprite_frames.
	animated.sprite_frames = frames
	animated.play("idle_down")


# Session persists across scene reloads (static on the script class).
static var session := {"started": false, "player_name": "Traveler", "sprite_id": 0}


static func wire(village: Node2D) -> void:
	var state := {
		"village": village,
		"player": null,
		"clock": null,
		"client": null,
		"remote_players": {},
		"started": bool(session["started"]),
		"player_name": str(session["player_name"]),
		"sprite_id": int(session["sprite_id"]),
		"room_code": "",
		"last_sent_pos": Vector2.INF,
		"send_timer": 0.0,
	}

	_wire_doors(village)
	_wire_lighting_clock(village, state)
	_wire_npcs(village, state)
	_wire_systems(village, state)
	_wire_story(village, state)
	_wire_title_screen(village, state)

	# Defer player spawn ~0.25s: the DoorTransition driver delivers the
	# carried player ~2 frames after the scene loads. Adopt it if present
	# instead of spawning a duplicate.
	village.get_tree().create_timer(0.25).timeout.connect(
		func() -> void: _wire_player_deferred(village, state))

	village.set_meta("tikvah_state", state)


static func _wire_player_deferred(village: Node2D, state: Dictionary) -> void:
	if not is_instance_valid(village):
		return
	var player: Node2D = null
	var carried := village.get_tree().get_first_node_in_group("local_player")
	if carried is Node2D and is_instance_valid(carried):
		player = carried
		if player.get_parent() != village:
			player.get_parent().remove_child(player)
			village.add_child(player)
	else:
		player = PLAYER_SCENE.instantiate()
		player.add_to_group("local_player")
		var spawn_tile: Vector2i = village.get("spawn_point")
		if spawn_tile == null:
			spawn_tile = Vector2i(40, 36)
		player.position = GameWiring.tile_to_world(spawn_tile)
		village.add_child(player)
	var art := "res://assets/characters/player_m1.png" if int(state["sprite_id"]) == 0 else "res://assets/characters/player_f1.png"
	GameWiring.apply_character_art(
		player.get_node("AnimatedSprite2D") as AnimatedSprite2D, art)
	state["player"] = player
	if player.get_node_or_null("FollowCam") == null:
		var cam := Camera2D.new()
		cam.name = "FollowCam"
		cam.position_smoothing_enabled = true
		cam.position_smoothing_speed = 6.0
		cam.limit_left = 0
		cam.limit_top = 0
		cam.limit_right = 80 * TILE
		cam.limit_bottom = 60 * TILE
		player.add_child(cam)
		cam.make_current()
	# Returning from an interior: the session already started, go live.
	# Fresh session: hide until the title screen is dismissed.
	if bool(state["started"]):
		player.visible = true
		player.set_physics_process(true)
	else:
		player.visible = false
		player.set_physics_process(false)


static func _wire_player(village: Node2D, state: Dictionary) -> void:
	# Superseded by _wire_player_deferred; kept for the test hook contract.
	_wire_player_deferred(village, state)


static func _wire_doors(village: Node2D) -> void:
	for d in DOORS:
		var door: Area2D = DOOR_SCENE.instantiate()
		door.position = GameWiring.tile_to_world(d["tile"])
		door.set("target_scene", d["target"])
		door.set("spawn_id", "enter")
		village.add_child(door)
		var marker := Marker2D.new()
		marker.name = "Spawn_" + d["id"]
		marker.position = GameWiring.tile_to_world(d["tile"])
		village.add_child(marker)


static func _wire_lighting_clock(village: Node2D, state: Dictionary) -> void:
	var mod := CanvasModulate.new()
	mod.name = "DayTint"
	mod.color = LIGHT_TINT["morning"]
	village.add_child(mod)

	var clock: Node = CLOCK_SCRIPT.new()
	clock.name = "TimeClock"
	village.add_child(clock)
	state["clock"] = clock
	clock.connect("phase_changed", func(phase: String) -> void:
		var key: String = PHASE_LIGHT.get(phase, "day")
		mod.color = LIGHT_TINT[key]
		village.set("day_phase", key))


static func _wire_npcs(village: Node2D, state: Dictionary) -> void:
	var clock: Node = state["clock"]
	for def in NPC_DEFS:
		var scn: PackedScene = load("res://scenes/npcs/%s.tscn" % def["scene"])
		if scn == null:
			continue
		var npc: CharacterBody2D = scn.instantiate()
		# Fix sprite: show only the first 16x24 frame, not the whole sheet.
		var spr := npc.get_node_or_null("Sprite2D") as Sprite2D
		if spr != null:
			spr.region_enabled = true
			spr.region_rect = Rect2(0, 0, 16, 24)
			spr.offset = Vector2(0, -12)
		var sched: Dictionary = def["schedule"]
		npc.set("schedule", sched)
		var first: Vector2i = sched["morning"]
		npc.position = GameWiring.tile_to_world(first)
		village.add_child(npc)
		npc.call("set_clock", clock)
		_add_talk_interactable(village, npc, state)


static func _add_talk_interactable(village: Node2D, npc: Node2D, state: Dictionary) -> void:
	var talk := _TalkInteract.new()
	talk.npc = npc
	talk.state = state
	var col := CollisionShape2D.new()
	var circle := CircleShape2D.new()
	circle.radius = 26.0
	col.shape = circle
	talk.add_child(col)
	npc.add_child(talk)


class _TalkInteract extends Interactable:
	var npc: Node2D
	var state: Dictionary
	func get_prompt() -> String:
		return "Talk"
	func interact(_player: Node) -> void:
		var greeting: String = str(npc.call("get_greeting"))
		var nm: String = str(npc.get("npc_name")) if npc.get("npc_name") != null else "villager"
		GameWiring._say(state["village"], nm.capitalize(), greeting)
		var m: Node = state.get("mystery")
		if m == null:
			return
		if nm == "hannah":
			m.call("discover", "hannah_memory")
		elif nm == "nathan":
			GameWiring._say(state["village"], "Pastor Nathan",
				"A riddle for you, traveler: 'I was in the beginning with God, and darkness never overcame me. Read the verse stand by the church door — John 8:12 — and tell me what I am.'")


static func _wire_systems(village: Node2D, state: Dictionary) -> void:
	var farming: Node = FARMING_SCRIPT.new()
	farming.name = "Farming"
	village.add_child(farming)
	var fishing: Node = FISHING_SCRIPT.new()
	fishing.name = "Fishing"
	village.add_child(fishing)
	var cooking: Node = COOKING_SCRIPT.new()
	cooking.name = "Cooking"
	village.add_child(cooking)
	var rel: Node = REL_SCRIPT.new()
	rel.name = "Relationships"
	village.add_child(rel)
	state["farming"] = farming
	state["fishing"] = fishing
	state["cooking"] = cooking
	state["relationships"] = rel
	if state["clock"] != null:
		farming.call("bind_clock", state["clock"])

	# Farm plot interactables (from farming.gd plot_cells()).
	var plots: Array = farming.call("plot_cells")
	for cell in plots:
		_add_farm_interactable(village, state, cell)

	# Dock fishing interactable.
	_add_fish_interactable(village, state, Vector2i(39, 52))

	# Simple dialogue UI (bottom panel).
	var ui := CanvasLayer.new()
	ui.name = "DialogueUI"
	ui.layer = 10
	village.add_child(ui)
	var panel := PanelContainer.new()
	panel.name = "Panel"
	panel.visible = false
	panel.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	panel.offset_top = -110
	panel.offset_left = 40
	panel.offset_right = -40
	panel.offset_bottom = -16
	ui.add_child(panel)
	var vb := VBoxContainer.new()
	panel.add_child(vb)
	var name_l := Label.new()
	name_l.name = "Name"
	vb.add_child(name_l)
	var line := Label.new()
	line.name = "Line"
	line.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	vb.add_child(line)


static func _add_farm_interactable(village: Node2D, state: Dictionary, cell: Vector2i) -> void:
	var farm := _FarmInteract.new()
	farm.cell = cell
	farm.state = state
	farm.position = GameWiring.tile_to_world(cell)
	village.add_child(farm)


class _FarmInteract extends Interactable:
	var cell: Vector2i
	var state: Dictionary
	func get_prompt() -> String:
		var f: Node = state["farming"]
		return "Farm (%s)" % str(f.call("get_state", cell.x, cell.y))
	func interact(_player: Node) -> void:
		var f: Node = state["farming"]
		var st: String = str(f.call("get_state", cell.x, cell.y))
		var dlg: Node2D = state["village"]
		if st == "untilled" or st == "":
			f.call("till", cell.x, cell.y)
			GameWiring._say(dlg, "Soil", "You till the soil.")
		elif st == "tilled":
			f.call("plant", cell.x, cell.y)
			GameWiring._say(dlg, "Seed", "You plant a seed.")
		elif st == "seed":
			f.call("water", cell.x, cell.y)
			GameWiring._say(dlg, "Water", "You water the seedling.")
		elif st == "ready":
			var crop: String = str(f.call("harvest", cell.x, cell.y))
			state["harvest_count"] = int(state["harvest_count"]) + 1
			GameWiring._say(dlg, "Harvest", "You harvest %s! (%d/3 for the trough)" % [crop, int(state["harvest_count"])])
		else:
			GameWiring._say(dlg, "Growing", "Still growing… come back tomorrow.")


static func _add_fish_interactable(village: Node2D, state: Dictionary, cell: Vector2i) -> void:
	var fish := _FishInteract.new()
	fish.cell = cell
	fish.state = state
	fish.position = GameWiring.tile_to_world(cell)
	village.add_child(fish)


class _FishInteract extends Interactable:
	var cell: Vector2i
	var state: Dictionary
	func get_prompt() -> String:
		return "Fish"
	func interact(_player: Node) -> void:
		var f: Node = state["fishing"]
		var res: String = str(f.call("cast", cell))
		if res == "cast":
			GameWiring._say(state["village"], "Fishing", "Cast! Waiting for a bite…")
			var caught: String = str(f.call("reel", 0.6))
			if caught != "":
				GameWiring._say(state["village"], "Catch", "You caught %s!" % caught)
			else:
				GameWiring._say(state["village"], "Fishing", "Nothing this time…")
		else:
			GameWiring._say(state["village"], "Fishing", res)


static func _say(village: Node2D, who: String, text: String) -> void:
	var panel: Control = village.get_node_or_null("DialogueUI/Panel") as Control
	var label: Label = village.get_node_or_null("DialogueUI/Panel/Line") as Label
	var name_l: Label = village.get_node_or_null("DialogueUI/Panel/Name") as Label
	if panel == null or label == null:
		return
	if name_l != null:
		name_l.text = who
	label.text = text
	panel.visible = true
	village.get_tree().create_timer(3.0).timeout.connect(
		func() -> void: panel.visible = false)


# ------------------------------------------------------------------ story

const CLUE_SPOTS := [
	{"id": "fox_trail", "tile": Vector2i(40, 4), "needs": ""},
	{"id": "fox_gift", "tile": Vector2i(46, 6), "needs": "fox_trail"},
	{"id": "garden_overgrown", "tile": Vector2i(58, 44), "needs": ""},
	{"id": "garden_marker", "tile": Vector2i(65, 55), "needs": ""},
	{"id": "hannah_memory", "tile": Vector2i(-1, -1), "needs": ""}, # via Hannah talk
	{"id": "nathan_riddle", "tile": Vector2i(-1, -1), "needs": ""}, # via riddle puzzle
]

const STONE_SPOTS := [
	{"stone": "ember_stone", "tile": Vector2i(20, 47), "label": "Ember Stone"},
	{"stone": "moss_stone", "tile": Vector2i(40, 8), "label": "Moss Stone"},
]


static func _wire_story(village: Node2D, state: Dictionary) -> void:
	var scripture: Node = SCRIPTURE_SCRIPT.new()
	scripture.name = "Scripture"
	village.add_child(scripture)
	var mystery: Node = MYSTERY_SCRIPT.new()
	mystery.name = "Mystery"
	village.add_child(mystery)
	mystery.call("load_design", "res://data/story/mystery.json")
	var puzzles: Node = PUZZLES_SCRIPT.new()
	puzzles.name = "Puzzles"
	village.add_child(puzzles)
	var restoration: Node = RESTORATION_SCRIPT.new()
	restoration.name = "Restoration"
	village.add_child(restoration)
	state["scripture"] = scripture
	state["mystery"] = mystery
	state["puzzles"] = puzzles
	state["restoration"] = restoration
	state["stones_found"] = []
	state["harvest_count"] = 0

	puzzles.connect("puzzle_solved", func(pid: String) -> void:
		for cid in puzzles.call("clue_reward", pid):
			mystery.call("discover", cid)
		GameWiring._sync_story_flag(state, pid, true))
	mystery.connect("clue_found", func(cid: String) -> void:
		var info: Dictionary = mystery.call("clue_info", cid)
		GameWiring._say(village, str(info.get("title", "Discovery")),
			str(info.get("discover_line", "You found something.")))
		GameWiring._sync_story_flag(state, "clue:" + cid, true))
	mystery.connect("revelation_ready", func() -> void:
		_show_revelation(village, state))
	restoration.connect("restored", func() -> void:
		_show_ending(village, state))

	# Notebook UI.
	var nb: Control = NOTEBOOK_SCENE.instantiate()
	nb.name = "Notebook"
	var nblayer := CanvasLayer.new()
	nblayer.name = "NotebookUI"
	nblayer.layer = 15
	nblayer.add_child(nb)
	village.add_child(nblayer)
	nb.call("bind", mystery)
	state["notebook"] = nb

	# Clue spot interactables.
	for spot in CLUE_SPOTS:
		if int(spot["tile"].x) < 0:
			continue
		var cl := _ClueInteract.new()
		cl.clue_id = spot["id"]
		cl.needs = spot["needs"]
		cl.state = state
		cl.position = GameWiring.tile_to_world(spot["tile"])
		village.add_child(cl)

	# Hidden stone spots.
	for s in STONE_SPOTS:
		var st := _StoneInteract.new()
		st.stone_id = s["stone"]
		st.label_text = s["label"]
		st.state = state
		st.position = GameWiring.tile_to_world(s["tile"])
		village.add_child(st)

	# Ruins arch (match-symbols puzzle).
	var arch := _ArchInteract.new()
	arch.state = state
	arch.position = GameWiring.tile_to_world(Vector2i(8, 39))
	village.add_child(arch)

	# Garden trough (offering puzzle) + restoration spot.
	var trough := _TroughInteract.new()
	trough.state = state
	trough.position = GameWiring.tile_to_world(Vector2i(65, 55))
	village.add_child(trough)

	var restore := _RestoreInteract.new()
	restore.state = state
	restore.position = GameWiring.tile_to_world(Vector2i(66, 55))
	village.add_child(restore)

	# Church Bible stand (riddle answer).
	# Placed in church interior at runtime via interior wiring note;
	# also add a verse stand in the village church doorway for the slice.
	var stand := _VerseStandInteract.new()
	stand.state = state
	stand.position = GameWiring.tile_to_world(Vector2i(64, 32))
	village.add_child(stand)


class _ClueInteract extends Interactable:
	var clue_id: String
	var needs: String
	var state: Dictionary
	func get_prompt() -> String:
		return "Investigate"
	func interact(_player: Node) -> void:
		var m: Node = state["mystery"]
		if needs != "" and not bool(m.call("is_clue_found", needs)):
			GameWiring._say(state["village"], "Quiet", "Nothing here yet… keep looking.")
			return
		m.call("discover", clue_id)


class _StoneInteract extends Interactable:
	var stone_id: String
	var label_text: String
	var state: Dictionary
	func get_prompt() -> String:
		return "Take %s" % label_text
	func interact(_player: Node) -> void:
		var found: Array = state["stones_found"]
		if not found.has(stone_id):
			found.append(stone_id)
			GameWiring._say(state["village"], label_text,
				"You lift the half-buried stone. It is warm, carved with an old symbol.")
		var p: Node = state["puzzles"]
		if p.call("attempt", "hidden_stones", found):
			GameWiring._say(state["village"], "The Hidden Stones",
				"Both stones found! One sleeps where the river bends; one where the forest path ends.")


class _ArchInteract extends Interactable:
	var state: Dictionary
	func get_prompt() -> String:
		return "Study the arch"
	func interact(_player: Node) -> void:
		var p: Node = state["puzzles"]
		if not bool(p.call("is_solved", "hidden_stones")):
			GameWiring._say(state["village"], "Old Arch",
				"Four carvings: dawn, harvest, river, night. Something is missing — two stones.")
			return
		if bool(p.call("is_solved", "match_symbols")):
			GameWiring._say(state["village"], "Old Arch", "The carvings rest, matched and quiet.")
			return
		GameWiring._say(state["village"], "Old Arch",
			"You set the ember stone to the dawn carving, the moss stone to the river… the sun to dawn, wheat to harvest, wave to river, star to night. They fit.")
		p.call("attempt", "match_symbols",
			{"sun": "dawn", "wheat": "harvest", "wave": "river", "star": "night"})


class _TroughInteract extends Interactable:
	var state: Dictionary
	func get_prompt() -> String:
		return "Old stone trough"
	func interact(_player: Node) -> void:
		var p: Node = state["puzzles"]
		if bool(p.call("is_solved", "garden_offering")):
			GameWiring._say(state["village"], "Trough", "The trough rests, the offering received.")
			return
		var n: int = int(state["harvest_count"])
		if p.call("attempt", "garden_offering", n):
			GameWiring._say(state["village"], "An offering of harvest",
				"You lay three crops in the old stone trough. The garden seems to breathe again.")
		else:
			GameWiring._say(state["village"], "Old stone trough",
				"The trough remembers harvests. Bring an offering of three crops (%d/3)." % n)


class _RestoreInteract extends Interactable:
	var state: Dictionary
	func get_prompt() -> String:
		return "Restore the Garden"
	func interact(_player: Node) -> void:
		var m: Node = state["mystery"]
		if not bool(m.call("all_threads_done")):
			GameWiring._say(state["village"], "Garden of Hope",
				"The garden waits. Finish what the clues began — all four threads of the mystery.")
			return
		var r: Node = state["restoration"]
		r.call("contribute", str(state.get("player_name", "Traveler")))
		GameWiring._sync_story_flag(state, "restore:" + str(state.get("player_name", "Traveler")), true)
		GameWiring._say(state["village"], "Garden of Hope", "You lend your hands to the restoration.")


class _VerseStandInteract extends Interactable:
	var state: Dictionary
	func get_prompt() -> String:
		return "Read the verse stand"
	func interact(_player: Node) -> void:
		var s: Node = state["scripture"]
		var v: Dictionary = s.call("get_verse", "John 8:12")
		var text: String = str(v.get("text", ""))
		var p: Node = state["puzzles"]
		if not bool(p.call("is_solved", "gathering_riddle")):
			GameWiring._say(state["village"], "John 8:12", text)
			GameWiring._say(state["village"], "Riddle",
				"Pastor Nathan's riddle answers itself from the verse. You whisper: “light”.")
			p.call("attempt", "gathering_riddle", "light")
		else:
			GameWiring._say(state["village"], "John 8:12", text)


static func _show_revelation(village: Node2D, state: Dictionary) -> void:
	GameWiring._say(village, "The First Light",
		"Every clue points to one truth: Jesus Christ is the Light of the world. Not you — Him. And His light is what the Garden has been waiting for.")
	village.get_tree().create_timer(6.0).timeout.connect(
		func() -> void:
			GameWiring._say(village, "Garden of Hope",
				"Go to the Garden. Restore it — together, if you can."))


static func _show_ending(village: Node2D, state: Dictionary) -> void:
	GameWiring._say(village, "Restored",
		"The Garden of Hope blooms. Lantern-light, laughter, bread shared. This is only the first chapter — but what a beginning.")
	village.get_tree().create_timer(8.0).timeout.connect(
		func() -> void:
			GameWiring._say(village, "THE FIRST LIGHT",
				"Thank you for playing Tikvah. The village will remember this day."))


static func _sync_story_flag(state: Dictionary, flag: String, value: Variant) -> void:
	var client: Node = state.get("client")
	if client != null and bool(client.get("is_joined")):
		client.call("send_story", flag, value)


# ------------------------------------------------------------------ netcode + title

static func _get_server_url() -> String:
	if OS.has_feature("web"):
		var js = Engine.get_singleton("JavaScriptBridge")
		if js != null:
			var url = js.eval(
				"window.TIKVAH_CONFIG ? window.TIKVAH_CONFIG.serverWsUrl : ''", true)
			if url != null:
				return str(url)
	return ""


static func _wire_title_screen(village: Node2D, state: Dictionary) -> void:
	# Returning from an interior mid-session: skip the title entirely.
	if bool(state["started"]):
		return
	# NOTE: the player spawns deferred (~0.25s); visibility is handled in
	# _wire_player_deferred (hidden until the title is dismissed).

	var layer := CanvasLayer.new()
	layer.name = "TitleUI"
	layer.layer = 20
	village.add_child(layer)

	var bg := ColorRect.new()
	bg.color = Color(0.08, 0.10, 0.16, 1.0)
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	layer.add_child(bg)

	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	layer.add_child(center)
	var vb := VBoxContainer.new()
	vb.add_theme_constant_override("separation", 10)
	center.add_child(vb)

	var title := Label.new()
	title.text = "TIKVAH 2.0"
	title.add_theme_font_size_override("font_size", 48)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	vb.add_child(title)
	var sub := Label.new()
	sub.text = "A place to grow. A story to live."
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	vb.add_child(sub)

	var name_edit := LineEdit.new()
	name_edit.placeholder_text = "Your name"
	name_edit.text = "Traveler"
	name_edit.custom_minimum_size = Vector2(260, 0)
	vb.add_child(name_edit)

	var char_row := HBoxContainer.new()
	char_row.alignment = BoxContainer.ALIGNMENT_CENTER
	vb.add_child(char_row)
	var b_m := Button.new()
	b_m.text = "Brother"
	b_m.toggle_mode = true
	b_m.button_pressed = true
	var b_f := Button.new()
	b_f.text = "Sister"
	b_f.toggle_mode = true
	char_row.add_child(b_m)
	char_row.add_child(b_f)
	var group := ButtonGroup.new()
	b_m.button_group = group
	b_f.button_group = group

	var code_edit := LineEdit.new()
	code_edit.placeholder_text = "Room code (for Join with Code)"
	code_edit.custom_minimum_size = Vector2(260, 0)
	vb.add_child(code_edit)

	var status := Label.new()
	status.text = ""
	status.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	vb.add_child(status)

	var btn_row := HBoxContainer.new()
	btn_row.alignment = BoxContainer.ALIGNMENT_CENTER
	vb.add_child(btn_row)
	var b_pub := Button.new()
	b_pub.text = "Enter Public Village"
	var b_create := Button.new()
	b_create.text = "Create Private Room"
	var b_join := Button.new()
	b_join.text = "Join with Code"
	var b_off := Button.new()
	b_off.text = "Play Offline"
	btn_row.add_child(b_pub)
	btn_row.add_child(b_create)
	btn_row.add_child(b_join)
	btn_row.add_child(b_off)

	var begin := func(mode: String) -> void:
		state["player_name"] = name_edit.text.strip_edges()
		if state["player_name"] == "":
			state["player_name"] = "Traveler"
		state["sprite_id"] = 0 if b_m.button_pressed else 1
		# NOTE: character art is applied in _start_game once the
		# deferred player exists.
		if mode == "offline":
			_start_game(village, state, layer, "")
			return
		var url := _get_server_url()
		if url == "":
			status.text = "No server configured — playing offline."
			_start_game(village, state, layer, "")
			return
		var client: Node = CLIENT_SCRIPT.new()
		client.name = "NetClient"
		village.add_child(client)
		state["client"] = client
		client.connect("joined", func(info: Dictionary) -> void:
			state["room_code"] = str(info.get("room", ""))
			_show_room_hud(village, state)
			_start_game(village, state, layer, "online"))
		client.connect("join_failed", func(code: String, _msg: String) -> void:
			status.text = "Could not join (%s). Try again or play offline." % code)
		client.connect("state_updated", func(delta: Dictionary) -> void:
			_apply_net_delta(village, state, delta))
		status.text = "Connecting…"
		if mode == "public":
			client.call("connect_to", url, "TIKVAH",
				state["player_name"], state["sprite_id"])
		elif mode == "create":
			client.call("create_room", url, state["player_name"], state["sprite_id"])
		elif mode == "join":
			var c := code_edit.text.strip_edges().to_upper()
			if c == "":
				status.text = "Enter a room code first."
				client.queue_free()
				state["client"] = null
				return
			client.call("connect_to", url, c, state["player_name"], state["sprite_id"])

	b_pub.pressed.connect(func() -> void: begin.call("public"))
	b_create.pressed.connect(func() -> void: begin.call("create"))
	b_join.pressed.connect(func() -> void: begin.call("join"))
	b_off.pressed.connect(func() -> void: begin.call("offline"))
	# Test hook: lets headless integration tests start the game directly.
	state["begin"] = begin


static func _start_game(village: Node2D, state: Dictionary, layer: CanvasLayer, _mode: String) -> void:
	layer.visible = false
	session["started"] = true
	session["player_name"] = str(state["player_name"])
	session["sprite_id"] = int(state["sprite_id"])
	state["started"] = true
	var player: Node2D = state["player"]
	if player == null:
		# Player spawns deferred; retry shortly.
		village.get_tree().create_timer(0.5).timeout.connect(
			func() -> void: _start_game(village, state, layer, _mode))
		return
	var art := "res://assets/characters/player_m1.png" if int(state["sprite_id"]) == 0 else "res://assets/characters/player_f1.png"
	GameWiring.apply_character_art(
		player.get_node("AnimatedSprite2D") as AnimatedSprite2D, art)
	player.visible = true
	player.set_physics_process(true)
	state["started"] = true
	# Net movement sync driver.
	var sync := _NetSync.new()
	sync.state = state
	village.add_child(sync)
	GameWiring._say(village, "Tikvah",
		"Welcome, %s. Live the village rhythm — and watch for what stirs in the old places. (J: journal)" % str(state["player_name"]))


static func _show_room_hud(village: Node2D, state: Dictionary) -> void:
	var layer := CanvasLayer.new()
	layer.name = "RoomHUD"
	layer.layer = 12
	village.add_child(layer)
	var label := Label.new()
	label.text = "Room: %s" % str(state["room_code"])
	label.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	label.offset_left = -140
	label.offset_right = -12
	label.offset_top = 8
	layer.add_child(label)


class _NetSync extends Node:
	var state: Dictionary
	func _process(delta: float) -> void:
		var client: Node = state.get("client")
		if client == null or not bool(client.get("is_joined")):
			return
		state["send_timer"] = float(state["send_timer"]) - delta
		var player: Node2D = state["player"]
		if player == null:
			return
		if float(state["send_timer"]) <= 0.0 and player.position != state["last_sent_pos"]:
			state["last_sent_pos"] = player.position
			state["send_timer"] = 0.1
			client.call("send_move", player.position)


static func _apply_net_delta(village: Node2D, state: Dictionary, delta: Dictionary) -> void:
	var remote: Dictionary = state["remote_players"]
	var players: Dictionary = delta.get("players", {})
	# Spawn / update.
	for uuid in players.keys():
		var info: Dictionary = players[uuid]
		if not remote.has(uuid):
			var rp: CharacterBody2D = PLAYER_SCENE.instantiate()
			var spr: int = int(info.get("sprite", 0))
			var art := "res://assets/characters/player_m1.png" if spr == 0 else "res://assets/characters/player_f1.png"
			apply_character_art(rp.get_node("AnimatedSprite2D") as AnimatedSprite2D, art)
			rp.set_physics_process(false)
			var tag := Label.new()
			tag.text = str(info.get("name", "?"))
			tag.position = Vector2(-24, -44)
			rp.add_child(tag)
			var pos: Array = info.get("pos", [640.0, 576.0])
			rp.position = Vector2(float(pos[0]), float(pos[1]))
			village.add_child(rp)
			remote[uuid] = rp
		else:
			var pos2: Array = info.get("pos", [640.0, 576.0])
			(remote[uuid] as Node2D).position = Vector2(float(pos2[0]), float(pos2[1]))
	# Remove leavers.
	for uuid in remote.keys():
		if not players.has(uuid):
			(remote[uuid] as Node).queue_free()
			remote.erase(uuid)
	# Story flags from other players.
	var story: Dictionary = delta.get("story", {})
	var mystery: Node = state.get("mystery")
	if mystery != null:
		for flag in story.keys():
			if str(flag).begins_with("clue:"):
				mystery.call("discover", str(flag).trim_prefix("clue:"))
	# Garden state.
	var garden: Dictionary = delta.get("garden", {})
	if bool(garden.get("restored", false)):
		var r: Node = state.get("restoration")
		if r != null and r.has_method("force_restored"):
			r.call("force_restored")
