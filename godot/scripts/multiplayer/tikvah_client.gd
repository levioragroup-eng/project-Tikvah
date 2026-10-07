class_name TikvahClient
extends Node
## TIKVAH 2.0 — multiplayer client (netcode track).
##
## Drives its own WebSocketMultiplayerPeer (no `multiplayer` singleton), so
## several clients can live in one process (net_test.gd) and the game can own
## exactly one. Speaks the JSON protocol from tikvah_room_server.gd.
##
##   connect_to(url, room_code, player_name, sprite_id, uuid := "")
## Signals: connected (socket up, hello sent), disconnected,
##          state_updated(delta), joined(info), join_failed(code, msg).
## Auto-reconnects ONCE if the socket drops unexpectedly.

signal connected
signal disconnected
signal state_updated(delta: Dictionary)
signal joined(info: Dictionary)
signal join_failed(code: String, msg: String)

const RECONNECT_DELAY := 1.5

var url := ""
var room_code := ""
var player_name := ""
var sprite_id := 0
var my_uuid := ""

var players: Dictionary = {} # uuid -> {name, sprite, pos: Vector2}
var crops: Array = []
var npcs: Dictionary = {}
var story: Dictionary = {}
var garden: Dictionary = {}

var is_joined := false
var last_join_error := ""

var _peer: WebSocketMultiplayerPeer = null
var _manual_close := false
var _reconnects_left := 1
var _reconnect_in := -1.0


func connect_to(p_url: String, p_room_code: String, p_name: String, p_sprite: int, p_uuid: String = "") -> void:
	url = p_url
	room_code = p_room_code.strip_edges().to_upper()
	player_name = p_name.strip_edges().left(16)
	if player_name == "":
		player_name = "Traveler"
	sprite_id = clampi(p_sprite, 0, 31)
	my_uuid = p_uuid if p_uuid != "" else _gen_uuid()
	is_joined = false
	last_join_error = ""
	_manual_close = false
	_reconnects_left = 1
	_reconnect_in = -1.0
	_open()


func disconnect_gracefully() -> void:
	_manual_close = true
	_reconnect_in = -1.0
	if _peer != null:
		_peer.close()


func get_player_ids() -> Array:
	return players.keys()


# Local UUID generator (kept in-client so this file never depends on the
# global class cache; mirrors TikvahRoomServer.gen_uuid).
static func _gen_uuid() -> String:
	var h := "0123456789abcdef"
	var s := ""
	for i in 32:
		s += h.substr(randi() % 16, 1)
		if i == 7 or i == 11 or i == 15 or i == 19:
			s += "-"
	return s


func _open() -> void:
	_peer = WebSocketMultiplayerPeer.new()
	_peer.peer_connected.connect(_on_peer_connected)
	_peer.peer_disconnected.connect(_on_peer_disconnected)
	var err := _peer.create_client(url)
	if err != OK:
		last_join_error = "connect_failed"
		join_failed.emit("connect_failed", "Could not open WebSocket: %s" % error_string(err))


func _send(msg: Dictionary) -> void:
	if _peer == null:
		return
	_peer.set_target_peer(1) # server id
	_peer.put_packet(JSON.stringify(msg).to_utf8_buffer())
	_peer.set_target_peer(0)


func send_move(pos: Vector2) -> void:
	_send({"t": "move", "pos": [pos.x, pos.y]})


func send_interact(target: String, action: String) -> void:
	_send({"t": "interact", "target": target, "action": action})


func send_story(flag: String, value: Variant = true) -> void:
	_send({"t": "story", "flag": flag, "value": value})


func _on_peer_connected(peer_id: int) -> void:
	# Server is id 1; send hello and wait for welcome.
	_send({"t": "hello", "room": room_code, "name": player_name,
		"sprite": sprite_id, "uuid": my_uuid})
	connected.emit()


func _on_peer_disconnected(_peer_id: int) -> void:
	disconnected.emit()
	if _manual_close:
		return
	if _reconnects_left > 0:
		_reconnects_left -= 1
		_reconnect_in = RECONNECT_DELAY
		is_joined = false


func _pos_of(raw: Variant) -> Vector2:
	if raw is Array and (raw as Array).size() == 2:
		return Vector2(float(raw[0]), float(raw[1]))
	return Vector2.ZERO


func _apply_players_table(table: Dictionary, full_replace: bool) -> void:
	if full_replace:
		players.clear()
	for uuid in table.keys():
		var e: Dictionary = table[uuid]
		var cur: Dictionary = players.get(uuid, {})
		cur["name"] = e.get("name", cur.get("name", "?"))
		cur["sprite"] = int(e.get("sprite", cur.get("sprite", 0)))
		if e.has("pos"):
			cur["pos"] = _pos_of(e["pos"])
		players[uuid] = cur


func _on_message(msg: Dictionary) -> void:
	var mtype := str(msg.get("t", ""))
	match mtype:
		"welcome":
			my_uuid = str(msg.get("id", my_uuid))
			is_joined = true
			last_join_error = ""
			var you: Dictionary = msg.get("you", {})
			joined.emit({"id": my_uuid, "room": str(msg.get("room", "")), "you": you})
		"room_state":
			_apply_players_table(msg.get("players", {}), true)
			crops = (msg.get("crops", []) as Array).duplicate(true)
			npcs = (msg.get("npcs", {}) as Dictionary).duplicate(true)
			story = (msg.get("story", {}) as Dictionary).duplicate(true)
			garden = (msg.get("garden", {}) as Dictionary).duplicate(true)
			state_updated.emit({"full": true, "room": str(msg.get("room", ""))})
		"player_join":
			var p: Dictionary = msg.get("player", {})
			var pid := str(p.get("id", ""))
			if pid != "":
				_apply_players_table({pid: p}, false)
			state_updated.emit({"join": pid, "notice": str(msg.get("notice", ""))})
		"player_leave":
			var lid := str(msg.get("id", ""))
			players.erase(lid)
			state_updated.emit({"leave": lid})
		"state_delta":
			var d := {"delta": true}
			if msg.has("players"):
				_apply_players_table(msg["players"], false)
				d["players"] = msg["players"]
			if msg.has("story"):
				for k in (msg["story"] as Dictionary).keys():
					story[k] = (msg["story"] as Dictionary)[k]
				d["story"] = msg["story"]
			if msg.has("garden"):
				garden = (msg["garden"] as Dictionary).duplicate(true)
				d["garden"] = garden
			if msg.has("crops"):
				crops = (msg["crops"] as Array).duplicate(true)
				d["crops"] = crops
			if msg.has("events"):
				d["events"] = msg["events"]
			state_updated.emit(d)
		"error":
			var code := str(msg.get("code", "unknown"))
			last_join_error = code
			join_failed.emit(code, str(msg.get("msg", "")))


func _process(delta: float) -> void:
	if _peer == null:
		return
	_peer.poll()
	while _peer.get_available_packet_count() > 0:
		var raw := _peer.get_packet().get_string_from_utf8()
		var parsed: Variant = JSON.parse_string(raw)
		if parsed is Dictionary:
			_on_message(parsed)
	if _reconnect_in > 0.0:
		_reconnect_in -= delta
		if _reconnect_in <= 0.0 and not _manual_close:
			_open()
