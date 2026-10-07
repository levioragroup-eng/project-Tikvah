class_name Interactable
extends Area2D
## Base class for anything the player can trigger with the E verb.
##
## Instances register themselves in the "interactable" group; the Player
## scans that group each physics frame and offers the nearest one within
## INTERACT_RADIUS. Override get_prompt() and interact() in subclasses.

signal interacted(player: Node)

@export var prompt_text: String = "Interact"


func _ready() -> void:
	add_to_group("interactable")
	monitoring = false


func get_prompt() -> String:
	return prompt_text


func interact(player: Node) -> void:
	interacted.emit(player)
