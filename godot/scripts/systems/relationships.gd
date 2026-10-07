extends Node
class_name Relationships
## TIKVAH 2.0 — NPC friendship hearts (life-systems track).
##
## Each NPC holds 0-5 hearts for the player.
## Acts of service raise hearts:
##   add_heart(npc, n)      generic bump (clamped 0..5)
##   deliver_gift(npc, item)  +1 heart for a gifted item (acts of service)
##   share_meal(npc)          +1 heart for sharing a meal (acts of service)
##
## Emits hearts_changed(npc, hearts) on every change.
## NOTE: per-player-UUID persistence lives with the server/session layer
## (coordinator); this system tracks one player's hearts at runtime.

signal hearts_changed(npc: String, hearts: int)

const MAX_HEARTS := 5
const FRIEND_THRESHOLD := 3

var _hearts: Dictionary = {} # npc name (lower) -> int


func _key(npc: String) -> String:
	return npc.strip_edges().to_lower()


# ------------------------------------------------------------------ public API

## Hearts for an NPC (0..5). Unknown NPCs start at 0.
func get_hearts(npc: String) -> int:
	return int(_hearts.get(_key(npc), 0))


## True once the NPC is a friend (hearts >= 3) — warmer greetings unlock.
func is_friend(npc: String) -> bool:
	return get_hearts(npc) >= FRIEND_THRESHOLD


## Add (or remove, with negative n) hearts, clamped 0..5.
func add_heart(npc: String, n: int = 1) -> int:
	var k := _key(npc)
	var v := clampi(int(_hearts.get(k, 0)) + n, 0, MAX_HEARTS)
	_hearts[k] = v
	hearts_changed.emit(npc, v)
	return v


## Give an item to an NPC: +1 heart. Returns false for an empty item.
func deliver_gift(npc: String, item: String) -> bool:
	if item.strip_edges().is_empty():
		return false
	add_heart(npc, 1)
	return true


## Share a meal with an NPC: +1 heart (acts of service).
func share_meal(npc: String) -> bool:
	add_heart(npc, 1)
	return true


## All tracked NPCs and their hearts.
func all_hearts() -> Dictionary:
	return _hearts.duplicate()
