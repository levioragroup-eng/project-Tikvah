class_name StubInteractable
extends "res://scripts/player/interactable.gd"
## Placeholder interactable for life-track verbs (cook/eat/gift/buy/sell,
## pray/worship/read-scripture, wardrobe, rug...). Emits action_triggered
## with an action_id; the life track replaces these with real systems.

signal action_triggered(action_id: String, player: Node)

@export var action_id: String = ""


func interact(player: Node) -> void:
	action_triggered.emit(action_id, player)
	print("[StubInteractable] '%s' triggered (%s)" % [action_id, get_prompt()])
