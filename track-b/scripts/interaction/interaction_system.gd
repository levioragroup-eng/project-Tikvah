# STATUS: PLANNED — stub, not implemented.
## InteractionSystem — the reusable verb registry shared by every interactable.
##
## Design: any node that can be interacted with registers the verbs it supports
## (from VERBS below). The player controller asks "what can I do to this target?"
## and the game presents the verb list. Handlers live here as stubs; real
## implementations are per-system (farming, fishing, npc, ...).
extends Node


## The full reusable verb set. Verbs are registered by interactables; only
## verbs in this list may be registered (closed vocabulary, deliberate).
const VERBS: Array[String] = [
	"Talk",
	"Sit",
	"Sleep",
	"Read",
	"Eat",
	"Give",
	"Pick Up",
	"Store",
	"Open",
	"Cook",
	"Plant",
	"Water",
	"Harvest",
	"Fish",
	"Pet",
	"Feed",
	"Pray",
	"Write",
	"Dig",
	"Inspect",
	"Repair",
	"Light",
]


## target node -> Array[String] of registered verbs.
var registry: Dictionary = {}


func register_interactable(target: Node, verbs: Array) -> void:
	# PLANNED: validate each verb against VERBS; store in registry.
	for v in verbs:
		if not (v is String) or not VERBS.has(v):
			push_warning("InteractionSystem: rejected unknown verb: %s" % str(v))
			continue
		if not registry.has(target):
			registry[target] = []
		if not (registry[target] as Array).has(v):
			(registry[target] as Array).append(v)


func unregister_interactable(target: Node) -> void:
	registry.erase(target)


func get_verbs(target: Node) -> Array:
	return registry.get(target, [])


func handle_verb(verb: String, actor: Node, target: Node) -> void:
	# PLANNED: dispatch to the owning system's implementation, then — in
	# SHARED/INSTANCED worlds — send the validated action to the server.
	# Client prediction with server reconciliation is a future design decision.
	match verb:
		_:
			push_warning("InteractionSystem: no handler yet for verb '%s'" % verb)
