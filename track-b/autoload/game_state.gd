# STATUS: PLANNED — stub, not implemented.
## GameState — Track B global session state.
##
## Holds which kind of world the player is currently in and the session context
## needed by every system. This is scaffolding only: nothing here connects to a
## server, loads a scene, or persists data yet.
extends Node


enum WorldType {
	PRIVATE,    ## Solo world: only this player. Player's private home/farm space.
	SHARED,     ## Persistent shared world: many players, server-authoritative.
	INSTANCED,  ## Private-by-invite instance (co-op party, dungeon, event space).
}


## Which world type the current session belongs to.
var world_type: int = WorldType.PRIVATE

## Opaque session identifier. Assigned by the server in SHARED/INSTANCED worlds.
var session_id: String = ""

## Player identity. Assigned at login; echoed by the server.
var player_id: String = ""

## Current region being simulated (first region: "tikvah").
var region_id: String = ""

## True once a server connection owns the authoritative simulation.
## Until then every mutation below is local-only and provisional.
var is_server_authoritative: bool = false


func set_world_type(new_type: int) -> void:
	# PLANNED: validate against WorldType, notify server on change, emit signal.
	if new_type == WorldType.PRIVATE or new_type == WorldType.SHARED or new_type == WorldType.INSTANCED:
		world_type = new_type


func is_multiplayer() -> bool:
	return world_type == WorldType.SHARED or world_type == WorldType.INSTANCED
