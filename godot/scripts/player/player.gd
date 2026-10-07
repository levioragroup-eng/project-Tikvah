class_name Player
extends CharacterBody2D
## Traveler controller — TIKVAH 2.0 player track.
##
## 8-direction movement (WASD / arrow keys via the built-in ui_* actions, plus
## the mobile VirtualJoystick), ~90 px/s, 16px-tile-friendly collision
## (r=6 circle), placeholder walk animations with 4-way facing, and the
## single E verb: the nearest Interactable within INTERACT_RADIUS shows an
## "[E]" prompt; the E key or the touch E button triggers interact().
##
## NOTE: input uses the built-in ui_* actions + Input.is_key_pressed() so
## project.godot's [input] section stays untouched.

signal interacted(target: Node)

const SPEED := 90.0
const INTERACT_RADIUS := 24.0

## Preloaded (not via class_name) so headless runs never depend on the
## editor's global script-class cache.
const Interactable := preload("res://scripts/player/interactable.gd")

var facing := Vector2.DOWN
var move_vec := Vector2.ZERO

var _target: Interactable = null

@onready var _anim: AnimatedSprite2D = $AnimatedSprite2D
@onready var _prompt: Label = $PromptLabel
@onready var _touch_ui: CanvasLayer = $TouchUI


func _ready() -> void:
	add_to_group("player")
	_build_frames()
	_touch_ui.visible = DisplayServer.is_touchscreen_available()
	var btn := _touch_ui.get_node_or_null("InteractButton") as BaseButton
	if btn != null and not btn.pressed.is_connected(try_interact):
		btn.pressed.connect(try_interact)
	_update_target()


func _physics_process(_delta: float) -> void:
	var iv := _read_input()
	move_vec = iv
	velocity = iv * SPEED
	move_and_slide()
	if iv.length() > 0.1:
		facing = _dominant(iv)
		_anim.play("walk_" + _dir_name(facing))
	else:
		_anim.play("idle_" + _dir_name(facing))
	_update_target()


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo and event.keycode == KEY_E:
		try_interact()
		get_viewport().set_input_as_handled()


## The E verb: refresh the nearest candidate, then trigger it.
func try_interact() -> void:
	_update_target()
	if _target != null:
		interacted.emit(_target)
		_target.interact(self)


func get_target() -> Interactable:
	return _target


func _read_input() -> Vector2:
	var v := Vector2.ZERO
	if Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP) or Input.is_action_pressed("ui_up"):
		v.y -= 1.0
	if Input.is_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN) or Input.is_action_pressed("ui_down"):
		v.y += 1.0
	if Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT) or Input.is_action_pressed("ui_left"):
		v.x -= 1.0
	if Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT) or Input.is_action_pressed("ui_right"):
		v.x += 1.0
	var joy := get_tree().get_first_node_in_group("virtual_joystick")
	if joy != null and (joy as Control).visible and joy.has_method("get_vector"):
		var jv: Vector2 = joy.get_vector()
		if jv.length() > 0.15:
			return jv.limit_length(1.0)
	return v.limit_length(1.0)


func _dominant(v: Vector2) -> Vector2:
	if absf(v.x) > absf(v.y):
		return Vector2.RIGHT if v.x > 0.0 else Vector2.LEFT
	return Vector2.DOWN if v.y > 0.0 else Vector2.UP


func _dir_name(v: Vector2) -> String:
	if v == Vector2.UP:
		return "up"
	if v == Vector2.DOWN:
		return "down"
	if v == Vector2.LEFT:
		return "left"
	return "right"


func _update_target() -> void:
	var best: Interactable = null
	var best_d := INTERACT_RADIUS
	for n in get_tree().get_nodes_in_group("interactable"):
		if n is Interactable and is_instance_valid(n):
			var d := global_position.distance_to((n as Node2D).global_position)
			if d <= INTERACT_RADIUS and d < best_d:
				best_d = d
				best = n
	_target = best
	if best != null:
		_prompt.text = "[E] " + best.get_prompt()
		_prompt.visible = true
	else:
		_prompt.visible = false


# ------------------------------------------------- placeholder sprite frames

## Builds 8 procedural placeholder animations (walk/idle x down/up/left/right).
## The art track replaces these with final sprites; the animation NAMES are
## the contract other tracks should rely on.
func _build_frames() -> void:
	var sf := SpriteFrames.new()
	for dir in ["down", "up", "left", "right"]:
		for kind in ["walk", "idle"]:
			var anim_name: String = kind + "_" + dir
			if not sf.has_animation(anim_name):
				sf.add_animation(anim_name)
			sf.set_animation_speed(anim_name, 6.0)
			sf.set_animation_loop(anim_name, kind == "walk")
		sf.add_frame("walk_" + dir, _draw_traveler(dir, 0))
		sf.add_frame("walk_" + dir, _draw_traveler(dir, 1))
		sf.add_frame("idle_" + dir, _draw_traveler(dir, 0))
	_anim.sprite_frames = sf
	_anim.play("idle_down")


func _draw_traveler(dir: String, phase: int) -> ImageTexture:
	var img := Image.create(16, 20, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	var skin := Color("e0ac7e")
	var hair := Color("4a2c14")
	var shirt := Color("4a8ac9")
	var pants := Color("3a3a4a")
	var dark := Color("1a1a1a")
	var bob := 1 if phase == 1 else 0
	# legs (walk cycle)
	if phase == 0:
		_fr(img, 5, 15, 2, 4, pants)
		_fr(img, 9, 15, 2, 4, pants)
	else:
		_fr(img, 5, 16, 2, 3, pants)
		_fr(img, 9, 14, 2, 4, pants)
	# torso + arms
	_fr(img, 4, 7 + bob, 8, 8, shirt)
	_fr(img, 3, 8 + bob, 1, 6, shirt.darkened(0.15))
	_fr(img, 12, 8 + bob, 1, 6, shirt.darkened(0.15))
	# head, per facing
	var hy := 1 + bob
	match dir:
		"down":
			_fr(img, 5, hy, 6, 5, skin)
			_fr(img, 5, hy, 6, 1, hair)
			_fr(img, 4, hy, 1, 5, hair)
			_fr(img, 11, hy, 1, 5, hair)
			img.set_pixel(7, hy + 3, dark)
			img.set_pixel(9, hy + 3, dark)
		"up":
			_fr(img, 5, hy, 6, 5, hair)
			_fr(img, 4, hy, 8, 2, hair.darkened(0.1))
		"left":
			_fr(img, 5, hy, 6, 5, skin)
			_fr(img, 8, hy, 4, 5, hair)
			_fr(img, 5, hy, 6, 1, hair)
			img.set_pixel(6, hy + 3, dark)
		_: # "right"
			_fr(img, 5, hy, 6, 5, skin)
			_fr(img, 4, hy, 4, 5, hair)
			_fr(img, 5, hy, 6, 1, hair)
			img.set_pixel(10, hy + 3, dark)
	return ImageTexture.create_from_image(img)


func _fr(img: Image, x: int, y: int, w: int, h: int, c: Color) -> void:
	img.fill_rect(Rect2i(x, y, w, h), c)
