extends Node
class_name TimeClock
## TIKVAH 2.0 — village time clock (life-systems track).
##
## Owns the day counter, the four day phases, and the four seasons.
## Phases: morning -> afternoon -> dusk -> night, each 2 real minutes.
## Seasons: spring -> summer -> autumn -> winter, 7 days each (day 1 = spring).
## Days roll over on their own clock. NO sleep / advance-day mechanic.
##
## Public API:
##   day:int, phase:String, season:String
##   signals: phase_changed(phase), new_day(day), season_changed(season)
##   is_sermon_day() -> bool      (day % 7 == 1)
##   is_market_day() -> bool      (day % 7 == 4)
##   phase_index() -> int
##   skip_to_phase(name)          (test/debug helper: jump to a phase start)
##   set_phase_duration(sec)      (test/debug helper)
##   pause() / resume()
##
## NOTE: phase names here (morning/afternoon/dusk/night) follow the life-systems
## task brief; the audited track-a spec names them morning/day/sunset/night.
## The mapping is 1:1 (day==afternoon, sunset==dusk). Coordinator owns wiring.

signal phase_changed(phase: String)
signal new_day(day: int)
signal season_changed(season: String)

const PHASES: Array[String] = ["morning", "afternoon", "dusk", "night"]
const SEASONS: Array[String] = ["spring", "summer", "autumn", "winter"]
const DAYS_PER_SEASON := 7

var day: int = 1
var phase: String = "morning"
var season: String = "spring"

var _phase_len := 120.0   # seconds per phase (2 real minutes)
var _phase_t := 0.0       # elapsed seconds in the current phase
var _running := true


func _ready() -> void:
	add_to_group("time_clock")
	_recalc_season(true)


func _process(delta: float) -> void:
	if not _running:
		return
	_phase_t += delta
	while _phase_t >= _phase_len:
		_phase_t -= _phase_len
		_advance_phase()


func _advance_phase() -> void:
	var idx := PHASES.find(phase)
	var next_idx := (idx + 1) % PHASES.size()
	if next_idx == 0:
		day += 1
		new_day.emit(day)
		_recalc_season(false)
	phase = PHASES[next_idx]
	phase_changed.emit(phase)


func _recalc_season(silent: bool) -> void:
	var idx := ((day - 1) / DAYS_PER_SEASON) % SEASONS.size()
	var s: String = SEASONS[idx]
	if s != season:
		season = s
		if not silent:
			season_changed.emit(season)


# ------------------------------------------------------------------ public API

## Accessors (duck-type friendly for systems that bind to the clock).
func get_day() -> int:
	return day


func get_phase() -> String:
	return phase


func get_season() -> String:
	return season


## True on sermon days (day % 7 == 1) — Pastor Nathan preaches at the church.
func is_sermon_day() -> bool:
	return day % 7 == 1


## True on market days (day % 7 == 4) — market bustle in the afternoon.
func is_market_day() -> bool:
	return day % 7 == 4


## Index of the current phase (0=morning .. 3=night).
func phase_index() -> int:
	return PHASES.find(phase)


## Fraction 0..1 through the current phase.
func phase_fraction() -> float:
	return clampf(_phase_t / _phase_len, 0.0, 1.0)


## Fraction 0..1 through the whole day (4 phases).
func day_fraction() -> float:
	return (float(phase_index()) + phase_fraction()) / float(PHASES.size())


## Test/debug: jump to the start of a named phase.
func skip_to_phase(phase_name: String) -> void:
	if phase_name in PHASES:
		phase = phase_name
		_phase_t = 0.0
		phase_changed.emit(phase)


## Test/debug: override the phase length (seconds).
func set_phase_duration(sec: float) -> void:
	_phase_len = maxf(sec, 0.01)


## Test/debug: simulate a day rollover (emits new_day, recomputes season).
func debug_new_day() -> void:
	day += 1
	new_day.emit(day)
	_recalc_season(false)


func pause() -> void:
	_running = false


func resume() -> void:
	_running = true
