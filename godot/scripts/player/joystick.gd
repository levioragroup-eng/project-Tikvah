class_name TikvahJoystick
extends Control
## Mobile virtual joystick — TIKVAH 2.0 player track.
##
## Custom-drawn (no art assets): drag within the base circle yields a
## -1..1 directional vector, the same intent as WASD/arrows. The Player
## picks it up via the "virtual_joystick" group. Hidden unless the device
## reports a touchscreen.

signal changed(vec: Vector2)

const RADIUS := 52.0

var value := Vector2.ZERO

var _active_pointer := -1


func _ready() -> void:
	add_to_group("virtual_joystick")
	visible = DisplayServer.is_touchscreen_available()
	mouse_filter = Control.MOUSE_FILTER_STOP


func get_vector() -> Vector2:
	return value


func _draw() -> void:
	var c := size * 0.5
	draw_circle(c, RADIUS, Color(1, 1, 1, 0.16))
	draw_arc(c, RADIUS, 0.0, TAU, 40, Color(1, 1, 1, 0.5), 2.0)
	draw_circle(c + value * (RADIUS - 14.0), 20.0, Color(1, 1, 1, 0.45))
	draw_arc(c + value * (RADIUS - 14.0), 20.0, 0.0, TAU, 32, Color(1, 1, 1, 0.7), 2.0)


func _gui_input(event: InputEvent) -> void:
	if event is InputEventScreenTouch:
		if event.pressed:
			_active_pointer = event.index
			_update_knob(event.position)
		elif event.index == _active_pointer:
			_release()
	elif event is InputEventScreenDrag:
		if event.index == _active_pointer:
			_update_knob(event.position)
	elif event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		if event.pressed:
			_active_pointer = -2
			_update_knob(event.position)
		elif _active_pointer == -2:
			_release()
	elif event is InputEventMouseMotion and _active_pointer == -2:
		_update_knob(event.position)


func _update_knob(local: Vector2) -> void:
	var d := local - size * 0.5
	if d.length() > RADIUS:
		d = d.normalized() * RADIUS
	value = d / RADIUS
	changed.emit(value)
	queue_redraw()


func _release() -> void:
	_active_pointer = -1
	value = Vector2.ZERO
	changed.emit(value)
	queue_redraw()
