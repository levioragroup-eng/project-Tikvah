extends Node
## Restoration — the co-op restoration moment at the Garden of Hope.
##
## After the revelation, travelers gather at the Garden of Hope and each
## contributes (a lantern lit, a stone set right, a bed replanted — the
## world layer decides the gesture). When 2+ distinct players have
## contributed, the garden is restored and `restored` fires once.
##
## Solo fallback: a lone traveler who keeps tending (3 contributions)
## converges on the SAME ending beat — nobody is ever locked out.
## The travelers restore a community; Jesus Christ is the Light —
## the player is never the savior.

signal restored()
signal contribution(player_id: String, contributions: int, contributors: int)

const COOP_CONTRIBUTORS := 2
const SOLO_CONTRIBUTIONS := 3

var _counts: Dictionary = {} # player_id -> contributions
var _done: bool = false


## Record one traveler's contribution. Idempotent after restoration.
func contribute(player_id: String) -> void:
	if _done or player_id.is_empty():
		return
	_counts[player_id] = int(_counts.get(player_id, 0)) + 1
	contribution.emit(player_id, int(_counts[player_id]), _counts.size())
	if _counts.size() >= COOP_CONTRIBUTORS:
		_finish() # co-op: two (or more) travelers, together
	elif _counts.size() == 1 and int(_counts[player_id]) >= SOLO_CONTRIBUTIONS:
		_finish() # solo fallback: one traveler, tending faithfully


## Has the garden been restored?
func is_restored() -> bool:
	return _done


## Distinct contributors so far.
func contributor_count() -> int:
	return _counts.size()


## Contributions by one traveler.
func contributions_of(player_id: String) -> int:
	return int(_counts.get(player_id, 0))


## Serialize for multiplayer sync.
func save_state() -> Dictionary:
	return {"counts": _counts.duplicate(), "done": _done}


## Restore from room state.
func load_state(state: Dictionary) -> void:
	_counts = (state.get("counts", {}) as Dictionary).duplicate()
	_done = bool(state.get("done", false))


## Reset for a fresh run.
func reset() -> void:
	_counts.clear()
	_done = false


func _finish() -> void:
	if _done:
		return
	_done = true
	restored.emit()
