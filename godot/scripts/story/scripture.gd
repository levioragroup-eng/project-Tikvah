extends Node
## Scripture — loads the verified KJV verse pool (byte-identical copy of
## track-a/public/verses.json) and serves deterministic daily verses.
##
## Daily verse: pool[floor(unix_seconds / 86400) % 46] — the same verse for
## every player in every room each UTC day (mirrors track-a).
## Storyline scripture in THE FIRST LIGHT is bound to pool entries only;
## no verse is ever invented here.

const VERSES_PATH := "res://data/verses.json"

var _pool: Array = []


func _ready() -> void:
	load_verses()


## Loads the verse pool from disk. Returns true on success.
func load_verses(path: String = VERSES_PATH) -> bool:
	_pool = []
	if not FileAccess.file_exists(path):
		push_warning("scripture: verse pool missing at %s" % path)
		return false
	var f := FileAccess.open(path, FileAccess.READ)
	if f == null:
		push_warning("scripture: could not open %s" % path)
		return false
	var parsed: Variant = JSON.parse_string(f.get_as_text())
	if parsed is Array:
		_pool = parsed
	return _pool.size() > 0


## Number of verses in the loaded pool.
func pool_size() -> int:
	return _pool.size()


## The verse for a UTC day. `unix_seconds` may be any timestamp; the pool
## index is derived from whole UTC days, so every player computes the same
## entry for the same calendar day. Deterministic — no randomness.
func daily_verse(unix_seconds: int) -> Dictionary:
	if _pool.is_empty():
		return {}
	var days: int = int(floor(float(unix_seconds) / 86400.0))
	var idx: int = posmod(days, _pool.size())
	var entry: Variant = _pool[idx]
	return entry if entry is Dictionary else {}


## Same as daily_verse(), but for the current moment.
func daily_verse_now() -> Dictionary:
	return daily_verse(int(Time.get_unix_time_from_system()))


## Look up a verse by reference, e.g. get_verse("John 8:12").
## Returns {} when the ref is not in the pool — never invents text.
## (Named get_verse because `get` is reserved by Object.)
func get_verse(ref: String) -> Dictionary:
	for entry in _pool:
		if entry is Dictionary and str(entry.get("ref", "")).strip_edges() == ref.strip_edges():
			return entry
	return {}
