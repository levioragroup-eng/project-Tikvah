extends Node
## Mystery — THE FIRST LIGHT clue tracking.
##
## Four non-linear clue threads (fox, forgotten_garden, four_stones,
## old_gathering), solvable in any order. Each clue is recorded once;
## only REAL discoveries are stored (call discover() when the player
## actually finds something in the world).
##
## Flags persist in a plain Dictionary so the multiplayer track can sync
## them with room state (save_flags() / load_flags()).
##
## Signals: clue_found(clue_id), revelation_ready() (fires once, when all
## four threads are complete — the game layer then plays the revelation).

signal clue_found(clue_id: String)
signal revelation_ready()

const MYSTERY_PATH := "res://data/story/mystery.json"

var _data: Dictionary = {}
var _flags: Dictionary = {} # clue_id -> true
var _revealed: bool = false


func _ready() -> void:
	load_design()


## Loads the mystery design (threads, clues, revelation text).
func load_design(path: String = MYSTERY_PATH) -> bool:
	_data = {}
	if not FileAccess.file_exists(path):
		push_warning("mystery: design file missing at %s" % path)
		return false
	var f := FileAccess.open(path, FileAccess.READ)
	var parsed: Variant = JSON.parse_string(f.get_as_text())
	if parsed is Dictionary:
		_data = parsed
	return not _data.is_empty()


## All thread ids, in design order.
func threads() -> Array:
	var out: Array = []
	var t: Variant = _data.get("threads", {})
	if t is Dictionary:
		for thread_id in t.keys():
			out.append(str(thread_id))
	return out


## Thread metadata (title, subtitle, clue_ids).
func thread_info(thread_id: String) -> Dictionary:
	var t: Variant = _data.get("threads", {})
	if t is Dictionary and t.has(thread_id):
		return t[thread_id]
	return {}


## Clue metadata (title, journal_text, discover_line, hint).
func clue_info(clue_id: String) -> Dictionary:
	var c: Variant = _data.get("clues", {})
	if c is Dictionary and c.has(clue_id):
		return c[clue_id]
	return {}


## Record a real discovery. Returns true if this is a NEW clue.
func discover(clue_id: String) -> bool:
	if _data.is_empty():
		push_warning("mystery: design not loaded; ignoring discover(%s)" % clue_id)
		return false
	var clues: Variant = _data.get("clues", {})
	if not (clues is Dictionary and clues.has(clue_id)):
		push_warning("mystery: unknown clue id '%s'" % clue_id)
		return false
	if _flags.has(clue_id):
		return false # already recorded — never double-count
	_flags[clue_id] = true
	clue_found.emit(clue_id)
	_check_revelation()
	return true


## Is every clue of a thread found?
func is_complete(thread_id: String) -> bool:
	var info: Dictionary = thread_info(thread_id)
	if info.is_empty():
		return false
	for clue_id in info.get("clue_ids", []):
		if not _flags.has(str(clue_id)):
			return false
	return true


## Per-thread progress: {"found": n, "total": n, "clue_ids": [...], "found_ids": [...]}
func thread_progress(thread_id: String) -> Dictionary:
	var info: Dictionary = thread_info(thread_id)
	var found: Array = []
	for clue_id in info.get("clue_ids", []):
		if _flags.has(str(clue_id)):
			found.append(str(clue_id))
	return {
		"found": found.size(),
		"total": (info.get("clue_ids", []) as Array).size(),
		"clue_ids": info.get("clue_ids", []),
		"found_ids": found,
	}


## True when all four threads are complete.
func all_threads_done() -> bool:
	if threads().is_empty():
		return false
	for thread_id in threads():
		if not is_complete(thread_id):
			return false
	return true


## Discovered clue ids, in design order.
func discovered_clues() -> Array:
	var out: Array = []
	var c: Variant = _data.get("clues", {})
	if c is Dictionary:
		for clue_id in c.keys():
			if _flags.has(str(clue_id)):
				out.append(str(clue_id))
	return out


## Has the revelation already fired?
func revelation_fired() -> bool:
	return _revealed


## Revelation text block (fires once via revelation_ready when all threads complete).
func revelation() -> Dictionary:
	var r: Variant = _data.get("revelation", {})
	return r if r is Dictionary else {}


## Ending text block for the Garden of Hope moment.
func ending() -> Dictionary:
	var e: Variant = _data.get("ending", {})
	return e if e is Dictionary else {}


## Serialize flags for multiplayer sync / save.
func save_flags() -> Dictionary:
	return _flags.duplicate()


## Restore flags (e.g. from room state). Re-emits nothing; callers refresh UI after.
func load_flags(flags: Dictionary) -> void:
	_flags = flags.duplicate()
	_revealed = false
	_check_revelation(true)


func _check_revelation(silent: bool = false) -> void:
	if _revealed:
		return
	if all_threads_done():
		_revealed = true
		if not silent:
			revelation_ready.emit()
