extends SceneTree
## TIKVAH 2.0 — dedicated-server entry point (netcode track).
##
## Launch (exported server binary, see deploy/server/Dockerfile and
## scripts/multiplayer/SERVER_CONTRACT.md):
##   server.x86_64 --headless -s res://scripts/multiplayer/tikvah_server.gd
## The `-s` override is required: it swaps the game main scene for this
## server main loop. Reads $PORT (Railway injects it; default 8081) and
## $TIKVAH_BIND (default 0.0.0.0), then runs the authoritative room server.

const RoomServer := preload("res://scripts/multiplayer/tikvah_room_server.gd")

const DEFAULT_PORT := 8081
const DEFAULT_BIND := "0.0.0.0"


func _port_from_env() -> int:
	var raw := OS.get_environment("PORT").strip_edges()
	if raw == "":
		return DEFAULT_PORT
	if not raw.is_valid_int():
		print("[tikvah-server] WARN: PORT='%s' is not an integer; using %d" % [raw, DEFAULT_PORT])
		return DEFAULT_PORT
	var p := int(raw)
	if p < 1 or p > 65535:
		print("[tikvah-server] WARN: PORT=%d out of range; using %d" % [p, DEFAULT_PORT])
		return DEFAULT_PORT
	return p


func _initialize() -> void:
	var port := _port_from_env()
	var bind := OS.get_environment("TIKVAH_BIND").strip_edges()
	if bind == "":
		bind = DEFAULT_BIND
	var peer := WebSocketMultiplayerPeer.new()
	var err := peer.create_server(port, bind)
	if err != OK:
		print("[tikvah-server] FATAL: create_server(%d, '%s') failed: %s" % [port, bind, error_string(err)])
		quit(1)
		return
	var rooms := RoomServer.new()
	rooms.attach(peer)
	root.add_child(rooms)
	print("[tikvah-server] listening on %s:%d (WebSocket/TCP)" % [bind, port])


func _process(_delta: float) -> bool:
	return false
