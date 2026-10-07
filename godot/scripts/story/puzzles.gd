extends Node
## Puzzles — the four light puzzles of THE FIRST LIGHT.
##
##   hidden_stones   — find the two half-buried stones (collect both ids)
##   match_symbols   — match each stone's symbol to the arch carving it belongs to
##   garden_offering — bring an offering of three crops
##   gathering_riddle— answer Pastor Nathan's riddle (the answer is in John 8:12)
##
## attempt(puzzle_id, solution) -> bool. Wrong answers are rejected (false)
## and never mark the puzzle solved. get_hint(puzzle_id) gives a gentle nudge.
## On success, puzzle_solved(puzzle_id) fires — the game layer records the
## puzzle's clue reward in the Mystery journal.

signal puzzle_solved(puzzle_id: String)

const DEFINITIONS := {
	"hidden_stones": {
		"title": "The Hidden Stones",
		"kind": "collect",
		"clue_reward": ["stone_first", "stone_second"],
		"hint": "One stone sleeps where the river bends; one sleeps where the forest path ends.",
		"expected": ["ember_stone", "moss_stone"],
	},
	"match_symbols": {
		"title": "The Stones' Symbols",
		"kind": "match",
		"clue_reward": ["stone_matched"],
		"hint": "Four symbols, four carvings on the arch: the sun belongs to the dawn, wheat to the harvest, the wave to the river, the star to the night.",
		"expected": {"sun": "dawn", "wheat": "harvest", "wave": "river", "star": "night"},
	},
	"garden_offering": {
		"title": "An Offering of Harvest",
		"kind": "count",
		"clue_reward": ["garden_offering"],
		"hint": "The old stone trough remembers harvests. Lay three crops in it — no more is needed, no less will do.",
		"expected": 3,
	},
	"gathering_riddle": {
		"title": "Pastor Nathan's Riddle",
		"kind": "text",
		"clue_reward": ["nathan_riddle"],
		"hint": "Pastor Nathan smiles: 'Read the verse stand in the church. The answer is written in John 8:12.'",
		"expected": "light",
	},
}

var _solved: Dictionary = {} # puzzle_id -> true


## All puzzle ids.
func puzzles() -> Array:
	return DEFINITIONS.keys()


## Puzzle metadata (title, kind, hint).
func info(puzzle_id: String) -> Dictionary:
	if DEFINITIONS.has(puzzle_id):
		return DEFINITIONS[puzzle_id]
	return {}


## A gentle nudge. Never the answer itself (except where the design asks
## the player to read the verse, which is the point).
func get_hint(puzzle_id: String) -> String:
	var d: Dictionary = info(puzzle_id)
	return str(d.get("hint", "Look closer, traveler."))


## Has this puzzle been solved?
func is_solved(puzzle_id: String) -> bool:
	return _solved.has(puzzle_id)


## Clue ids this puzzle's solution unlocks in the journal.
func clue_reward(puzzle_id: String) -> Array:
	var d: Dictionary = info(puzzle_id)
	var r: Variant = d.get("clue_reward", [])
	return r if r is Array else []


## Try a solution. Returns true only on a correct answer; wrong answers
## are rejected and leave the puzzle unsolved.
func attempt(puzzle_id: String, solution: Variant) -> bool:
	var d: Dictionary = info(puzzle_id)
	if d.is_empty():
		push_warning("puzzles: unknown puzzle id '%s'" % puzzle_id)
		return false
	if _solved.has(puzzle_id):
		return true # already solved — idempotent
	var ok: bool = _check(str(d.get("kind", "")), d.get("expected"), solution)
	if ok:
		_solved[puzzle_id] = true
		puzzle_solved.emit(puzzle_id)
	return ok


## Reset solved state (e.g. a fresh mystery run).
func reset() -> void:
	_solved.clear()


func _check(kind: String, expected: Variant, solution: Variant) -> bool:
	match kind:
		"collect":
			# solution: Array of found stone ids; must contain every expected id.
			if not (solution is Array and expected is Array):
				return false
			for want in expected:
				if not (solution as Array).has(want):
					return false
			return true
		"match":
			# solution: Dictionary symbol -> carving; must equal the expected mapping.
			if not (solution is Dictionary and expected is Dictionary):
				return false
			var s: Dictionary = solution
			var e: Dictionary = expected
			if s.size() != e.size():
				return false
			for k in e.keys():
				if not s.has(k) or str(s[k]) != str(e[k]):
					return false
			return true
		"count":
			# solution: int (crops offered); at least the expected number.
			if solution is int or solution is float:
				return int(solution) >= int(expected)
			return false
		"text":
			# solution: String answer; case-insensitive, trimmed.
			if not (solution is String):
				return false
			return (solution as String).strip_edges().to_lower() == str(expected).to_lower()
	return false
