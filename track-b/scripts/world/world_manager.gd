# STATUS: PLANNED — stub, not implemented.
## WorldManager — loads and unloads world regions; owns day/night, weather, seasons.
##
## The first region is Tikvah. Planned: stream region scenes in/out as the player
## moves, tick the world clock (day/night), roll weather, and advance seasons —
## all server-authoritative in SHARED worlds (see GameState).
extends Node


## First explorable region. Scene path and layout are PLANNED, not built.
const FIRST_REGION_ID: String = "tikvah"


## Region id -> loaded region node. Empty until streaming is implemented.
var loaded_regions: Dictionary = {}

## In-game clock. 0.0 = midnight. PLANNED.
var time_of_day: float = 8.0

## Current weather id (e.g. "clear", "rain"). PLANNED.
var weather: String = "clear"

## Current season id (e.g. "spring"). PLANNED.
var season: String = "spring"


func load_region(region_id: String) -> void:
	# PLANNED: instantiate region scene, register interactables with
	# InteractionSystem, apply persisted state from the server.
	pass


func unload_region(region_id: String) -> void:
	# PLANNED: persist dirty state, free region node, unregister interactables.
	pass


func set_time_of_day(_t: float) -> void:
	# PLANNED: server pushes clock in SHARED worlds; clients interpolate.
	pass
