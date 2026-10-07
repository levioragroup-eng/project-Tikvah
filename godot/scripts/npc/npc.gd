extends CharacterBody2D
class_name TikvahNPC
## TIKVAH 2.0 — schedule-driven villager (life-systems track).
##
## Each NPC carries a `schedule: Dictionary` mapping phase name
## ("morning"/"afternoon"/"dusk"/"night") to a target tile (Vector2).
## On phase change the NPC walks toward the new target (WALK_SPEED px/s);
## on arrival it idles and does small wander steps nearby.
##
## Default schedules are keyed by npc_name (see DEFAULT_SCHEDULES); they can
## be overridden at runtime by assigning `schedule` directly.
##
## Public API:
##   npc_name: String
##   schedule: Dictionary          {phase: Vector2 tile}
##   current_phase: String
##   set_clock(clock)              wire to a TimeClock node
##   notify_phase(phase)           called by the clock's phase_changed signal
##   get_greeting() -> String      warm, original, Christian greeting (no Scripture)
##   tile_to_world(tile) -> Vector2
##   is_at_target() -> bool
##
## Pastor Nathan: schedule keyed "nathan" — church door all phases; on sermon
## days (day % 7 == 1) he moves to the town square instead.
##
## Placeholder sprites live in assets/characters/ (art track owns finals).

const TILE := 16.0
const WALK_SPEED := 50.0
const ARRIVE_RADIUS := 6.0
const WANDER_RADIUS_TILES := 2.0

# Walkable targets on the 80x60 village map (16px tiles). "approx" per brief;
# each cell below is verified walkable against scripts/world/world.gd.
const LOCS := {
	"farm": Vector2(12, 28),
	"market": Vector2(40, 15),
	"cafe_door": Vector2(53, 41),
	"town_square": Vector2(37, 31),
	"garden": Vector2(65, 55),
	"church_door": Vector2(63, 32),
	"home_door": Vector2(12, 15),
	"elias_home": Vector2(14, 16),
	"miriam_home": Vector2(10, 15),
	"hannah_home": Vector2(12, 16),
	"miriam_morning": Vector2(15, 15),
}

const DEFAULT_SCHEDULES := {
	"hannah": {
		"morning": Vector2(12, 28), "afternoon": Vector2(40, 15),
		"dusk": Vector2(53, 41), "night": Vector2(12, 16),
	},
	"elias": {
		"morning": Vector2(40, 15), "afternoon": Vector2(12, 28),
		"dusk": Vector2(37, 31), "night": Vector2(14, 16),
	},
	"miriam": {
		"morning": Vector2(15, 15), "afternoon": Vector2(65, 55),
		"dusk": Vector2(63, 32), "night": Vector2(10, 15),
	},
	"nathan": {
		"morning": Vector2(63, 32), "afternoon": Vector2(63, 32),
		"dusk": Vector2(63, 32), "night": Vector2(63, 32),
	},
	"villager1": {
		"morning": Vector2(37, 31), "afternoon": Vector2(40, 15),
		"dusk": Vector2(37, 31), "night": Vector2(12, 15),
	},
	"villager2": {
		"morning": Vector2(40, 17), "afternoon": Vector2(37, 31),
		"dusk": Vector2(53, 41), "night": Vector2(14, 16),
	},
}

# Original warm greetings — 2 per phase for the four named villagers,
# one shared pool per phase for the generic villagers.
# Christian in spirit, written for this game; never Scripture quotations.
const GREETINGS := {
	"hannah": {
		"morning": [
			"Good morning, traveler! The farm beds are waking up — want to help me water?",
			"Morning! I saved you the sunny row. Everything grows a little braver with company.",
		],
		"afternoon": [
			"The market smells like fresh bread and rain. Come browse with me?",
			"Afternoon! I traded seedlings for honey. The village always provides.",
		],
		"dusk": [
			"Café time — the tea is warm and the company is warmer. Sit with me?",
			"Dusk is my favorite hour. Everything glows like it remembers the sun.",
		],
		"night": [
			"Heading home, traveler. Rest well — tomorrow the fields will be waiting.",
			"Goodnight! I left a lantern lit on the porch, just in case you wander by.",
		],
	},
	"elias": {
		"morning": [
			"Morning! Early to the market, early to the good apples. Walk with me?",
			"Up with the sun! A new day is a kind of mercy, don't you think?",
		],
		"afternoon": [
			"The farm rows need strong hands this afternoon. I'll show you the rhythm.",
			"Ha! You caught me mid-harvest. Work songs make the baskets fill faster.",
		],
		"dusk": [
			"Town square at dusk — best seat in the village. The fountain sounds like laughter.",
			"Evening, friend. Tell me something good that happened to you today.",
		],
		"night": [
			"Night, traveler. The village sleeps easy because folks like you look after it.",
			"Off home. Keep your lamp trimmed — and your heart, too.",
		],
	},
	"miriam": {
		"morning": [
			"Good morning. I was just airing out the house — mornings smell like beginnings.",
			"Morning, dear. Slow down a little; the day is long and grace is longer.",
		],
		"afternoon": [
			"The garden is blooming something fierce. Come see — beauty is meant to be shared.",
			"Afternoon! I'm tending the flower beds. Every petal is a small hallelujah.",
		],
		"dusk": [
			"Church at dusk is so peaceful. Come sit with me a while — no hurry at all.",
			"The bells will ring soon. There's always room on the pew beside me.",
		],
		"night": [
			"Goodnight, traveler. May your dreams be gentle and your morning bright.",
			"Home at last. The day is done, and it was a good one — partly thanks to you.",
		],
	},
	"nathan": {
		"morning": [
			"Good morning, traveler. The church doors are open — all are welcome here.",
			"Morning! Come in, sit a while. There's always room for one more.",
		],
		"afternoon": [
			"Peace to you. On sermon days I preach morning till afternoon — come sit a while.",
			"Afternoon, friend. If your heart is heavy, the pews here are soft and the welcome warm.",
		],
		"dusk": [
			"Evening blessings on you. The light lingers a little longer when we gather.",
			"Dusk, traveler — my favorite time to give thanks for this village.",
		],
		"night": [
			"Goodnight. Rest in the knowledge that you are loved more than you know.",
			"The church keeps a lamp burning all night — a small promise that the dark doesn't win.",
		],
	},
	"villager": {
		"morning": ["Morning, traveler! Lovely day in Tikvah, isn't it?"],
		"afternoon": ["Afternoon! The village is bustling today."],
		"dusk": ["Evening! Off to enjoy this golden light."],
		"night": ["Goodnight, traveler. Sleep well."],
	},
}

@export var npc_name: String = "villager1"

var schedule: Dictionary = {}
var current_phase: String = "morning"
var is_sermon_day := false

var _clock: Node = null
var _target_world := Vector2.ZERO
var _has_target := false
var _wander_t := 0.0
var _rng := RandomNumberGenerator.new()
var _greet_idx := 0


func _ready() -> void:
	_rng.randomize()
	var key := npc_name.to_lower()
	if schedule.is_empty() and DEFAULT_SCHEDULES.has(key):
		schedule = (DEFAULT_SCHEDULES[key] as Dictionary).duplicate()
	current_phase = "morning"
	_retarget()
	# Start at the schedule target so scenes open with villagers in place.
	if _has_target:
		position = _target_world


func _physics_process(delta: float) -> void:
	if not _has_target:
		velocity = Vector2.ZERO
		return
	var to := _target_world - position
	if to.length() > ARRIVE_RADIUS:
		velocity = to.normalized() * WALK_SPEED
		_wander_t = 0.0
	else:
		velocity = Vector2.ZERO
		_wander(delta)
	move_and_slide()


func _wander(delta: float) -> void:
	_wander_t += delta
	if _wander_t < 2.5:
		return
	_wander_t = 0.0
	# Small idle step within a couple of tiles of the schedule target.
	var base := _schedule_tile(current_phase)
	if base == Vector2(-1, -1):
		return
	var pick := base + Vector2(
		_rng.randf_range(-WANDER_RADIUS_TILES, WANDER_RADIUS_TILES),
		_rng.randf_range(-WANDER_RADIUS_TILES, WANDER_RADIUS_TILES))
	_target_world = tile_to_world(pick)
	_has_target = true


func _schedule_tile(phase_name: String) -> Vector2:
	if schedule.has(phase_name):
		return schedule[phase_name]
	return Vector2(-1, -1)


func _retarget() -> void:
	var tile := _schedule_tile(current_phase)
	# Pastor Nathan: on sermon days (day % 7 == 1) he preaches at the town
	# square instead of staying at the church.
	if npc_name.to_lower() == "nathan" and is_sermon_day:
		tile = LOCS["town_square"]
	if tile == Vector2(-1, -1):
		_has_target = false
		return
	_target_world = tile_to_world(tile)
	_has_target = true


# ------------------------------------------------------------------ public API

## Wire this NPC to a TimeClock node (auto-subscribes to phase_changed).
## Also syncs the NPC's current phase / sermon-day flag from the clock,
## so NPCs added mid-day start on the right schedule leg.
func set_clock(clock: Node) -> void:
	_clock = clock
	if _clock != null:
		if _clock.has_signal("phase_changed"):
			_clock.connect("phase_changed", Callable(self, "notify_phase"))
		if _clock.has_method("get_phase"):
			current_phase = str(_clock.call("get_phase"))
		if _clock.has_method("is_sermon_day"):
			is_sermon_day = bool(_clock.call("is_sermon_day"))
	_retarget()


## Called by the clock's phase_changed signal (or directly in tests).
func notify_phase(phase_name: String) -> void:
	current_phase = phase_name
	_retarget()


## Refresh sermon-day flag (e.g. on new_day) so Nathan moves correctly.
func notify_new_day(_day: int) -> void:
	if _clock != null and _clock.has_method("is_sermon_day"):
		is_sermon_day = bool(_clock.call("is_sermon_day"))
	_retarget()


## A warm, original, Christian greeting for the current phase.
## No Scripture quotations — story/sermon text stays bound to the verse pool.
func get_greeting() -> String:
	var key := npc_name.to_lower()
	if not GREETINGS.has(key):
		key = "villager"
	var pool: Array = (GREETINGS[key] as Dictionary).get(current_phase, [])
	if pool.is_empty():
		return "Hello, traveler!"
	var line: String = pool[_greet_idx % pool.size()]
	_greet_idx += 1
	return line


## Tile (Vector2 of ints) -> world pixels (tile center).
static func tile_to_world(tile: Vector2) -> Vector2:
	return (tile + Vector2(0.5, 0.5)) * TILE


func is_at_target() -> bool:
	return _has_target and (position - _target_world).length() <= ARRIVE_RADIUS
