extends SceneTree
## TIKVAH 2.0 — headless netcode test (netcode track).
##
## Run: godot --headless --path . -s res://scripts/multiplayer/net_test.gd
## Spins up a real WebSocket server on 127.0.0.1:8081 IN-PROCESS plus five
## fake clients: A/C/D share room R1, B is alone in room R2, E tries a bogus
## code. Verifies:
##   1. room isolation (A's moves never reach B, B's never reach A/C/D)
##   2. shared-room position sync (C and D see A's moves)
##   3. story flag sync within a room only
##   4. invalid room code rejected
##   5. player_leave broadcast on graceful disconnect
## Exit code 0 = all checks passed, 1 = any failure. Zero script errors expected.

const RoomServer := preload("res://scripts/multiplayer/tikvah_room_server.gd")
const Client := preload("res://scripts/multiplayer/tikvah_client.gd")

const PORT := 8081
const URL := "ws://127.0.0.1:8081"
const PHASE_TIMEOUT := 12.0
const GLOBAL_TIMEOUT := 45.0

var _rooms = null # TikvahRoomServer (untyped: custom methods)
var _r1 := ""
var _r2 := ""
var _a = null
var _b = null
var _c = null
var _d = null
var _e = null
var _phase := 0
var _phase_t := 0.0
var _total_t := 0.0
var _results: Array = [] # [name, ok]
var _au := ""
var _bu := ""
var _cu := ""
var _du := ""
var _failed := false


func _check(name: String, ok: bool) -> void:
	_results.append([name, ok])
	print("[%s] %s" % ["PASS" if ok else "FAIL", name])
	if not ok:
		_failed = true


func _pos_of(client, uuid: String) -> Vector2:
	var e: Dictionary = client.players.get(uuid, {})
	return e.get("pos", Vector2(-9999, -9999))


func _setup() -> void:
	var peer := WebSocketMultiplayerPeer.new()
	var err := peer.create_server(PORT, "127.0.0.1")
	if err != OK:
		print("[net_test] FATAL: cannot bind 127.0.0.1:%d: %s" % [PORT, error_string(err)])
		quit(1)
		return
	_rooms = RoomServer.new()
	_rooms.attach(peer)
	root.add_child(_rooms)
	_check("public village TIKVAH exists at startup", _rooms.has_room("TIKVAH"))
	_r1 = _rooms.create_room()
	_r2 = _rooms.create_room()
	_check("create_room returns 4-letter codes", _r1.length() == 4 and _r2.length() == 4)
	_check("room codes are unique", _r1 != _r2)
	var ok_charset := true
	for ch in (_r1 + _r2):
		if not ("A" <= ch and ch <= "Z") or ch in ["I", "L", "O"]:
			ok_charset = false
	_check("codes use no-I/L/O alphabet", ok_charset)
	_a = _mk_client("Ash", 1, _r1)
	_b = _mk_client("Bo", 2, _r2)
	_c = _mk_client("Cy", 3, _r1)
	_d = _mk_client("Dee", 4, _r1)
	_e = _mk_client("Eve", 5, "ZZZZ") # bogus code
	_phase = 1
	_phase_t = 0.0
	print("[net_test] setup done: R1=%s (A,C,D) R2=%s (B) E->bad code" % [_r1, _r2])


func _mk_client(cname: String, sprite: int, room: String):
	var cl = Client.new()
	cl.name = "Client_" + cname
	root.add_child(cl)
	cl.connect_to(URL, room, cname, sprite)
	return cl


func _all_joined() -> bool:
	return _a.is_joined and _b.is_joined and _c.is_joined and _d.is_joined


func _process(delta: float) -> bool:
	_total_t += delta
	if _phase == 0:
		_setup()
		return false
	_phase_t += delta
	if _total_t >= GLOBAL_TIMEOUT:
		_check("global timeout not hit", false)
		_finish()
		return true
	match _phase:
		1:
			if _all_joined():
				_au = _a.my_uuid
				_bu = _b.my_uuid
				_cu = _c.my_uuid
				_du = _d.my_uuid
				_check("A,B,C,D all joined (welcome received)",
					_au != "" and _bu != "" and _cu != "" and _du != "")
				_check("A sees C and D in shared room R1",
					_a.players.has(_cu) and _a.players.has(_du))
				_check("A does not see B (different room)",
					not _a.players.has(_bu))
				_check("B is alone in R2", _b.players.size() == 1 and _b.players.has(_bu))
				_a.send_move(Vector2(100, 200))
				_next_phase(2)
			elif _phase_t >= PHASE_TIMEOUT:
				_check("A,B,C,D all joined within timeout", false)
				_finish()
				return true
		2:
			if _phase_t >= 1.5:
				_check("C sees A's move in shared room",
					_pos_of(_c, _au).distance_to(Vector2(100, 200)) < 0.5)
				_check("D sees A's move in shared room",
					_pos_of(_d, _au).distance_to(Vector2(100, 200)) < 0.5)
				_check("B does NOT see A's move (room isolation)",
					not _b.players.has(_au))
				_b.send_move(Vector2(500, 600))
				_next_phase(3)
		3:
			if _phase_t >= 1.5:
				_check("A does NOT see B's move (room isolation)",
					not _a.players.has(_bu))
				_check("C does NOT see B's move (room isolation)",
					not _c.players.has(_bu))
				_a.send_story("gate_discovered", true)
				_next_phase(4)
		4:
			if _phase_t >= 1.5:
				_check("C receives A's story flag",
					_c.story.get("gate_discovered", false) == true)
				_check("D receives A's story flag",
					_d.story.get("gate_discovered", false) == true)
				_check("B does NOT receive R1's story flag (room isolation)",
					not _b.story.has("gate_discovered"))
				_next_phase(5)
		5:
			# E's rejection should already have arrived; verify now.
			_check("invalid code rejected (bad_room)", _e.last_join_error == "bad_room")
			_check("E never joined", not _e.is_joined)
			_c.disconnect_gracefully()
			_next_phase(6)
		6:
			if _phase_t >= 2.0:
				_check("A sees C's leave", not _a.players.has(_cu))
				_check("D sees C's leave", not _d.players.has(_cu))
				_check("R1 player count drops to 2", _rooms.player_count(_r1) == 2)
				_finish()
				return true
	return false


func _next_phase(p: int) -> void:
	_phase = p
	_phase_t = 0.0


func _finish() -> void:
	var passed := 0
	for r in _results:
		if r[1]:
			passed += 1
	print("[net_test] ===== %d/%d checks passed =====" % [passed, _results.size()])
	if _failed:
		print("[net_test] RESULT: FAIL")
	else:
		print("[net_test] RESULT: PASS — rooms isolated, shared sync OK, bad code rejected")
	quit(1 if _failed else 0)
