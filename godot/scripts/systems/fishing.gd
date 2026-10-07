extends Node
class_name Fishing
## TIKVAH 2.0 — dock fishing with a timing minigame (life-systems track).
##
## Flow:
##   cast(cell)            at a dock tile -> state "cast", bite timer starts
##                         (bite in 3-7 s, random)
##   (waiting)             reel() too early -> "no-bite", state stays "cast"
##   state "bite"          2.5 s window opens (signal bite_started)
##   reel(power)           during "bite" with power in the sweet spot
##                         (0.4..0.8) -> catch! returns a fish name, emits
##                         fish_caught; otherwise the fish escapes ("")
##   after a catch/miss   state returns to "idle"
##
## Public API:
##   cast(cell: Vector2i) -> String   "cast" | "no-dock" | "busy"
##   reel(power: float = 0.6) -> String   fish name on success, "" otherwise
##   state: String  ("idle"|"cast"|"bite")
##   fish_caught(fish_name: String)
##   bite_started()
##   debug_force_bite()   (test helper: open the bite window immediately)
##
## Fish names are original flavor text, no Scripture involved.

signal fish_caught(fish_name: String)
signal bite_started()

const DOCK_CELLS: Array[Vector2i] = [
	Vector2i(39, 52), # river dock (planks x38-40 y49-53)
	Vector2i(38, 52),
	Vector2i(40, 52),
]
const BITE_MIN := 3.0
const BITE_MAX := 7.0
const BITE_WINDOW := 2.5
const SWEET_LO := 0.4
const SWEET_HI := 0.8
const FISH_POOL: Array[String] = [
	"Sunscale Perch",
	"Brook Trout",
	"Willowfin",
	"Silverbelly",
]

var state: String = "idle"

var _t := 0.0            # counts up while casting / during the bite window
var _bite_at := 0.0
var _rng := RandomNumberGenerator.new()


func _ready() -> void:
	_rng.randomize()


func _process(delta: float) -> void:
	if state == "cast":
		_t += delta
		if _t >= _bite_at:
			state = "bite"
			_t = 0.0
			bite_started.emit()
	elif state == "bite":
		_t += delta
		if _t >= BITE_WINDOW:
			# The fish got away.
			state = "idle"
			_t = 0.0


# ------------------------------------------------------------------ public API

## Cast from a dock tile. Returns "cast", "no-dock", or "busy".
func cast(cell: Vector2i) -> String:
	if state != "idle":
		return "busy"
	if not cell in DOCK_CELLS:
		return "no-dock"
	state = "cast"
	_t = 0.0
	_bite_at = _rng.randf_range(BITE_MIN, BITE_MAX)
	return "cast"


## Reel in. During the bite window with a good power (0.4-0.8) this
## returns a fish name and emits fish_caught; otherwise "".
func reel(power: float = 0.6) -> String:
	if state == "cast":
		return "" # too early — still waiting ("no-bite")
	if state != "bite":
		return ""
	state = "idle"
	_t = 0.0
	if power >= SWEET_LO and power <= SWEET_HI:
		var fish: String = FISH_POOL[_rng.randi_range(0, FISH_POOL.size() - 1)]
		fish_caught.emit(fish)
		return fish
	return "" # mistimed — the fish escapes


## Test helper: skip the wait and open the bite window now.
func debug_force_bite() -> bool:
	if state != "cast":
		return false
	state = "bite"
	_t = 0.0
	bite_started.emit()
	return true
