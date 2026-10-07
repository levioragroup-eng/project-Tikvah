extends Control
## TIKVAH JOURNAL — THE FIRST LIGHT edition (placeholder parchment art).
##
## Tabs: Mysteries (4 threads with progress), Clues (real discoveries only),
## Scripture (the shared daily verse, then nothing invented — the pool is it).
##
## Toggle with the J key or the 📓 button. Only records REAL discoveries:
## everything shown is read from the bound Mystery node.

const Scripture = preload("res://scripts/story/scripture.gd")

const INK := Color(0.32, 0.24, 0.13)
const INK_SOFT := Color(0.45, 0.35, 0.20)
const GOLD := Color(0.79, 0.64, 0.29)

var _mystery: Node = null
var _scripture: Node = null
var _open: bool = false

@onready var _panel: PanelContainer = %Panel
@onready var _tabs: TabContainer = %Tabs
@onready var _mysteries_box: VBoxContainer = %MysteriesBox
@onready var _clues_box: VBoxContainer = %CluesBox
@onready var _verse_ref: Label = %VerseRef
@onready var _verse_text: Label = %VerseText
@onready var _toggle_button: Button = %ToggleButton
@onready var _close_button: Button = %CloseButton


func _ready() -> void:
	_panel.visible = false
	_toggle_button.pressed.connect(toggle)
	_close_button.pressed.connect(close)
	_scripture = Scripture.new()
	add_child(_scripture)
	_build_placeholder_tabs()


## Bind the journal to the live Mystery node. Refreshes immediately.
func bind(mystery_node: Node) -> void:
	if _mystery != null and _mystery.is_connected("clue_found", _on_clue_found):
		_mystery.disconnect("clue_found", _on_clue_found)
	_mystery = mystery_node
	if _mystery != null:
		_mystery.connect("clue_found", _on_clue_found)
	refresh()


func toggle() -> void:
	if _open:
		close()
	else:
		open()


func open() -> void:
	_open = true
	refresh()
	_panel.visible = true


func close() -> void:
	_open = false
	_panel.visible = false


func is_open() -> bool:
	return _open


## Rebuild every tab from live state. Call after any discovery.
func refresh() -> void:
	_refresh_mysteries()
	_refresh_clues()
	_refresh_scripture()


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey:
		var k: InputEventKey = event
		if k.pressed and not k.echo and k.keycode == KEY_J:
			toggle()
			get_viewport().set_input_as_handled()


func _on_clue_found(_clue_id: String) -> void:
	refresh()


func _build_placeholder_tabs() -> void:
	# Static skeletons so the tabs read sensibly even before binding.
	_refresh_mysteries()
	_refresh_clues()
	_refresh_scripture()


func _clear(box: Control) -> void:
	for child in box.get_children():
		child.queue_free()


func _label(text: String, size: int, color: Color = INK) -> Label:
	var l := Label.new()
	l.text = text
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	return l


func _refresh_mysteries() -> void:
	_clear(_mysteries_box)
	_mysteries_box.add_child(_label("THE FIRST LIGHT — four threads, any order.", 14, INK_SOFT))
	if _mystery == null:
		_mysteries_box.add_child(_label("Walk the village. Discoveries will appear here.", 14, INK_SOFT))
		return
	for thread_id in _mystery.threads():
		var info: Dictionary = _mystery.thread_info(thread_id)
		var prog: Dictionary = _mystery.thread_progress(thread_id)
		var found: int = int(prog.get("found", 0))
		var total: int = int(prog.get("total", 0))
		var row := VBoxContainer.new()
		row.add_theme_constant_override("separation", 2)
		var done_mark := "✓ " if found == total and total > 0 else ""
		row.add_child(_label("%s%s — %d/%d" % [done_mark, str(info.get("title", thread_id)), found, total], 16))
		row.add_child(_label(str(info.get("subtitle", "")), 13, INK_SOFT))
		for clue_id in prog.get("clue_ids", []):
			var cinfo: Dictionary = _mystery.clue_info(str(clue_id))
			if _mystery.discovered_clues().has(str(clue_id)):
				row.add_child(_label("  • " + str(cinfo.get("title", clue_id)), 14))
			else:
				row.add_child(_label("  • ···", 14, INK_SOFT))
		_mysteries_box.add_child(row)


func _refresh_clues() -> void:
	_clear(_clues_box)
	if _mystery == null:
		_clues_box.add_child(_label("No discoveries yet.", 14, INK_SOFT))
		return
	var found: Array = _mystery.discovered_clues()
	if found.is_empty():
		_clues_box.add_child(_label("Not yet discovered…", 14, INK_SOFT))
		return
	for clue_id in found:
		var cinfo: Dictionary = _mystery.clue_info(str(clue_id))
		_clues_box.add_child(_label(str(cinfo.get("title", clue_id)), 16))
		_clues_box.add_child(_label(str(cinfo.get("journal_text", "")), 14, INK_SOFT))


func _refresh_scripture() -> void:
	if _scripture == null:
		return
	var verse: Dictionary = _scripture.daily_verse(int(Time.get_unix_time_from_system()))
	if verse.is_empty():
		_verse_ref.text = "…"
		_verse_text.text = "The verse stand is quiet."
		return
	_verse_ref.text = str(verse.get("ref", ""))
	_verse_text.text = str(verse.get("text", ""))
