class_name DoorTransition
extends "res://scripts/player/interactable.gd"
## Reusable door — TIKVAH 2.0 player track.
##
## On interact: fade to black (0.25s) -> change scene -> the player appears
## at the Node2D named "Spawn_<spawn_id>" -> fade in (0.25s).
##
## Wiring convention:
##   village door:  target_scene = "res://scenes/interiors/<x>_interior.tscn",
##                  spawn_id = "enter"        (each interior has Spawn_enter)
##   interior exit: target_scene = "res://scenes/world/village.tscn",
##                  spawn_id = "church"|"home"|"cafe"|"market"
##                  (the village needs matching Spawn_<id> markers — the
##                  coordinator wires those; see scenes/interiors/DOOR_WIRING.md)
##
## The async handoff runs in TransitionDriver, a child of the SceneTree root
## so it survives the scene change (the DoorTransition itself is freed with
## the old scene). DoorTransition.transitioned fires only if the door is
## still alive afterwards; TransitionDriver.finished ALWAYS fires — listen
## to that (or DoorTransition.last_driver) for test/coordination hooks.

signal transitioned

@export var target_scene: String = ""
@export var spawn_id: String = "enter"

static var last_driver: TransitionDriver = null


func get_prompt() -> String:
	return prompt_text if prompt_text != "" else "Enter"


func interact(player: Node) -> void:
	if target_scene == "":
		push_warning("DoorTransition: target_scene is empty; ignoring.")
		return
	if TransitionDriver.active:
		return
	var driver := TransitionDriver.new()
	driver.target_scene = target_scene
	driver.spawn_id = spawn_id
	driver.player = player
	var weak: WeakRef = weakref(self)
	driver.finished.connect(func() -> void:
		var d: Object = weak.get_ref()
		if d != null:
			d.emit_signal("transitioned")
	)
	get_tree().root.add_child(driver)
	last_driver = driver
	driver.begin()


class TransitionDriver extends Node:
	## Carries one player across a scene change with a fade. Survives the
	## change because it lives under the SceneTree root, not the old scene.
	signal finished

	static var active := false

	var target_scene: String = ""
	var spawn_id: String = "enter"
	var player: Node = null
	var done := false

	func begin() -> void:
		active = true
		_run()

	func _run() -> void:
		var tree := get_tree()
		# Full-screen fade overlay on the root viewport: survives change_scene.
		var layer := CanvasLayer.new()
		layer.name = "TransitionFade"
		layer.layer = 100
		var rect := ColorRect.new()
		rect.name = "Fade"
		rect.color = Color(0, 0, 0, 1)
		rect.modulate = Color(1, 1, 1, 0)
		rect.set_anchors_preset(Control.PRESET_FULL_RECT)
		rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
		layer.add_child(rect)
		tree.root.add_child(layer)

		var tw := tree.create_tween()
		tw.tween_property(rect, "modulate:a", 1.0, 0.25)
		await tw.finished

		if not is_instance_valid(player) or not (player is Node2D):
			push_warning("DoorTransition: player invalid mid-transition.")
			layer.queue_free()
			_finish()
			return

		# Park the player on the overlay so change_scene_to_file can't free it.
		var old_parent := player.get_parent()
		player.set_physics_process(false)
		(player as CanvasItem).visible = false
		old_parent.remove_child(player)
		layer.add_child(player)

		var err := tree.change_scene_to_file(target_scene)
		if err != OK:
			push_error("DoorTransition: cannot load '%s' (err %d)." % [target_scene, err])
			old_parent.add_child(player)
			(player as CanvasItem).visible = true
			player.set_physics_process(true)
			layer.queue_free()
			_finish()
			return

		await tree.process_frame
		await tree.process_frame

		var new_scene := tree.current_scene
		var spawn: Node2D = null
		if new_scene != null:
			spawn = new_scene.find_child("Spawn_" + spawn_id, true, false) as Node2D
		layer.remove_child(player)
		if new_scene != null:
			new_scene.add_child(player)
		else:
			tree.root.add_child(player)
		if spawn != null:
			(player as Node2D).global_position = spawn.global_position
		else:
			push_warning("DoorTransition: no 'Spawn_%s' in '%s'." % [spawn_id, target_scene])
		(player as CanvasItem).visible = true
		player.set_physics_process(true)

		var tw2 := tree.create_tween()
		tw2.tween_property(rect, "modulate:a", 0.0, 0.25)
		await tw2.finished
		layer.queue_free()
		_finish()

	func _finish() -> void:
		active = false
		done = true
		finished.emit()
		queue_free()
