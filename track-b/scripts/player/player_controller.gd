# STATUS: PLANNED — stub, not implemented.
## PlayerController — top-down pixel-art player movement and interaction sensing.
##
## Planned: 8-direction top-down movement, animation state machine, an
## interaction raycast/cone that feeds the InteractionSystem with whatever the
## player is facing. No input mapping, sprites, or collision are set up yet.
extends CharacterBody2D


## Planned walk speed in pixels/second.
var speed: float = 96.0

## Current movement input (from input map — PLANNED).
var move_input: Vector2 = Vector2.ZERO

## Last non-zero movement direction; drives facing + interaction raycast.
var facing: Vector2 = Vector2.DOWN


func _physics_process(_delta: float) -> void:
	# PLANNED:
	#  1. read input actions (ui_left/ui_right/ui_up/ui_down or custom map)
	#  2. velocity = move_input.normalized() * speed; move_and_slide()
	#  3. update facing when moving; aim interaction raycast along facing
	pass


func get_interact_target() -> Node:
	# PLANNED: query InteractionSystem for the nearest interactable in the
	# facing direction (raycast or overlap shape). Returns null until then.
	return null


func try_interact() -> void:
	# PLANNED: on interact action, resolve target via get_interact_target()
	# and call InteractionSystem.present_verbs(self, target).
	pass
