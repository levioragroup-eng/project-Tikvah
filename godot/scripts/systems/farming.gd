extends Node
class_name Farming
## TIKVAH 2.0 — farm plot manager (life-systems track).
##
## 6 plots on the village farm. State machine per plot:
##   "untilled" -> till() -> "tilled" -> plant() -> "seed"
##   -> water() -> "growing" -> (new_day ticks, seasonal) -> "ready"
##   -> harvest() -> "untilled" (+1 produce)
##
## Growth advances on new_day: each new day adds progress scaled by the
## season modifier (spring 0.8 / summer 1.0 / autumn 1.1 / winter 1.25);
## a plot needs GROW_DAYS_BASE * modifier days of growth.
##
## Public API:
##   till(x, y) -> bool, plant(x, y) -> bool, water(x, y) -> bool
##   harvest(x, y) -> String   ("produce" on success, "" otherwise)
##   get_state(x, y) -> String
##   plot_cells() -> Array[Vector2i]
##   bind_clock(clock)          subscribes to the TimeClock new_day signal
##   on_new_day(day, season)    callable directly (tests / server tick)
##
## Out-of-order verbs are no-ops (return false / "").

signal plot_changed(cell: Vector2i, state: String)
signal harvested(cell: Vector2i)

const PLOTS: Array[Vector2i] = [
	Vector2i(8, 25), Vector2i(12, 25), Vector2i(16, 25),
	Vector2i(8, 29), Vector2i(12, 29), Vector2i(16, 29),
]
const GROW_DAYS_BASE := 5.0
const SEASON_MOD := {"spring": 0.8, "summer": 1.0, "autumn": 1.1, "winter": 1.25}

var _plots: Dictionary = {} # Vector2i -> {"state": String, "growth": float}


func _ready() -> void:
	for cell in PLOTS:
		_plots[cell] = {"state": "untilled", "days": 0}


func _is_plot(x: int, y: int) -> bool:
	return _plots.has(Vector2i(x, y))


func _set_state(cell: Vector2i, state: String) -> void:
	(_plots[cell] as Dictionary)["state"] = state
	plot_changed.emit(cell, state)


# ------------------------------------------------------------------ public API

## All 6 registered plot cells.
func plot_cells() -> Array[Vector2i]:
	return PLOTS.duplicate()


## Current state of a plot ("untilled"|"tilled"|"seed"|"growing"|"ready"|"").
func get_state(x: int, y: int) -> String:
	var cell := Vector2i(x, y)
	if not _plots.has(cell):
		return ""
	return str((_plots[cell] as Dictionary)["state"])


func till(x: int, y: int) -> bool:
	var cell := Vector2i(x, y)
	if not _is_plot(x, y):
		return false
	if str((_plots[cell] as Dictionary)["state"]) != "untilled":
		return false
	_set_state(cell, "tilled")
	return true


func plant(x: int, y: int) -> bool:
	var cell := Vector2i(x, y)
	if not _is_plot(x, y):
		return false
	if str((_plots[cell] as Dictionary)["state"]) != "tilled":
		return false
	_set_state(cell, "seed")
	return true


func water(x: int, y: int) -> bool:
	var cell := Vector2i(x, y)
	if not _is_plot(x, y):
		return false
	if str((_plots[cell] as Dictionary)["state"]) != "seed":
		return false
	(_plots[cell] as Dictionary)["days"] = 0
	_set_state(cell, "growing")
	return true


## Harvest a ready plot. Returns "produce" and resets the plot, else "".
func harvest(x: int, y: int) -> String:
	var cell := Vector2i(x, y)
	if not _is_plot(x, y):
		return ""
	if str((_plots[cell] as Dictionary)["state"]) != "ready":
		return ""
	(_plots[cell] as Dictionary)["days"] = 0
	_set_state(cell, "untilled")
	harvested.emit(cell)
	return "produce"


## Whole days of growth a "growing" plot needs in the given season
## (5 x modifier, rounded up: spring 4 / summer 5 / autumn 6 / winter 7).
func days_to_ready(season: String) -> int:
	return int(ceil(GROW_DAYS_BASE * float(SEASON_MOD.get(season, 1.0))))


## Advance growth for every growing plot. Called on each new_day.
func on_new_day(_day: int, season: String) -> void:
	for cell in _plots.keys():
		var d: Dictionary = _plots[cell]
		if str(d["state"]) != "growing":
			continue
		d["days"] = int(d["days"]) + 1
		if int(d["days"]) >= days_to_ready(season):
			_set_state(cell, "ready")


## Subscribe to a TimeClock's new_day signal.
func bind_clock(clock: Node) -> void:
	if clock != null and clock.has_signal("new_day"):
		clock.connect("new_day", Callable(self, "_on_clock_new_day").bind(clock))


func _on_clock_new_day(_day: int, clock: Node) -> void:
	var season := "spring"
	if clock != null and clock.has_method("get_season"):
		season = str(clock.call("get_season"))
	on_new_day(_day, season)
