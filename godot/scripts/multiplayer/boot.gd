extends Node
## TIKVAH 2.0 boot selector — the project's main scene.
##
##   Client (default): loads the village.
##   Server (--server flag): starts the authoritative WebSocket room server
##   in-process (no -s script override needed — exported binaries ignore -s).
##
## Dedicated-server launch:  ./tikvah_server.x86_64 --headless --server
## Reads $PORT (Railway injects it; default 8081).

const RoomServer := preload("res://scripts/multiplayer/tikvah_room_server.gd")
const DEFAULT_PORT := 8081


func _ready() -> void:
	if "--server" in OS.get_cmdline_args():
		_run_server()
	else:
		get_tree().change_scene_to_file("res://scenes/world/village.tscn")


func _run_server() -> void:
	var raw := OS.get_environment("PORT").strip_edges()
	var port := DEFAULT_PORT
	if raw != "" and raw.is_valid_int():
		var p := int(raw)
		if p >= 1 and p <= 65535:
			port = p
	var peer := WebSocketMultiplayerPeer.new()
	var err := peer.create_server(port, "0.0.0.0")
	if err != OK:
		print("[tikvah-server] FATAL: create_server(%d) failed: %s" % [port, error_string(err)])
		get_tree().quit(1)
		return
	var rooms: Node = RoomServer.new()
	rooms.attach(peer)
	add_child(rooms)
	print("[tikvah-server] public village 'TIKVAH' created")
	print("[tikvah-server] listening on 0.0.0.0:%d (WebSocket/TCP)" % port)
