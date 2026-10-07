class_name TikvahRoomServer
extends Node
## TIKVAH 2.0 — authoritative room server (netcode track).
##
## Owns ALL shared room state: players, crops, NPC states, story flags, garden.
## Drives a WebSocketMultiplayerPeer manually (no `multiplayer` singleton), so it
## can run in-process next to fake clients in net_test.gd and as the dedicated
## server entry (tikvah_server.gd, `-s` main-loop override).
##
## Message protocol (JSON, one object per packet):
##   c2s: hello{room,name,sprite,uuid?}  move{pos:[x,y]}
##        interact{target,action}        story{flag,value}
##   s2c: welcome{id,room,you}  room_state{full}  player_join{player,notice}
##        player_leave{id,name}  state_delta{...}  error{code,msg}
##
## Rooms: 4-letter codes from CODE_ALPHABET (no I/L/O); public room "TIKVAH"
## created at startup and never reaped; private rooms reaped 60 s after empty.
## Broadcast: state deltas at 10 Hz when dirty, plus immediate on join/leave.

const CODE_ALPHABET := "ABCDEFGHJKMNPQRSTUVWXYZ"
const CODE_LEN := 4
const PUBLIC_ROOM_CODE := "TIKVAH"
const MAX_PLAYERS_PER_ROOM := 4 # SPEC Godot target: 2-4 (track-a allows 10)
const BROADCAST_INTERVAL := 0.1 # 10 Hz delta flush
const REAP_EMPTY_AFTER := 60.0
const REAP_CHECK_INTERVAL := 5.0
const HELLO_TIMEOUT := 15.0

# SPEC Appendix A: map 56x40 tiles x 32px. Authoritative bounds for move msgs.
const WORLD_W := 1792.0
const WORLD_H := 1280.0
# SPEC 3.1 spawn tile (13,14).
const SPAWN := Vector2(13 * 32, 14 * 32)

var _peer: WebSocketMultiplayerPeer
var _rooms: Dictionary = {} # code -> room Dictionary
var _peer_room: Dictionary = {} # peer_id -> code (peers with a live player)
var _hello_wait: Dictionary = {} # peer_id -> connect timestamp
var _flush_t := 0.0
var _reap_t := 0.0


static func gen_uuid() -> String:
	var h := "0123456789abcdef"
	var s := ""
	for i in 32:
		s += h.substr(randi() % 16, 1)
		if i == 7 or i == 11 or i == 15 or i == 19:
			s += "-"
	return s


func attach(peer: WebSocketMultiplayerPeer) -> void:
	_peer = peer
	_peer.peer_connected.connect(_on_peer_connected)
	_peer.peer_disconnected.connect(_on_peer_disconnected)
	_rooms[PUBLIC_ROOM_CODE] = _new_room(PUBLIC_ROOM_CODE, true)
	print("[tikvah-server] public village '%s' created" % PUBLIC_ROOM_CODE)


func room_count() -> int:
	return _rooms.size()


func has_room(code: String) -> bool:
	return _rooms.has(code)


func get_room(code: String) -> Dictionary:
	return _rooms.get(code, {})


func player_count(code: String) -> int:
	var room: Dictionary = _rooms.get(code, {})
	if room.is_empty():
		return -1
	return (room["players"] as Dictionary).size()


func _new_room(code: String, is_public: bool) -> Dictionary:
	var crops: Array = []
	for i in 6: # SPEC 4: 6 farm plots
		crops.append({"stage": "empty", "t": 0.0})
	return {
		"code": code,
		"public": is_public,
		"players": {}, # peer_id -> {uuid, peer, name, sprite, pos}
		"by_uuid": {}, # uuid -> peer_id (rejoin restore)
		"known": {}, # uuid -> {name, sprite, pos} (persist across reconnects)
		"crops": crops,
		"npcs": {}, # populated by the world track; authoritative shape reserved
		"story": {},
		"garden": {"stage": "dormant", "bloomed": false},
		"empty_since": -1.0,
		"pending": {"players": {}, "story": {}, "events": [], "garden": false, "crops": false},
	}


## Create a private room with a fresh collision-checked 4-letter code.
func create_room() -> String:
	for attempt in 200:
		var code := ""
		for i in CODE_LEN:
			code += CODE_ALPHABET.substr(randi() % CODE_ALPHABET.length(), 1)
		if not _rooms.has(code):
			_rooms[code] = _new_room(code, false)
			print("[tikvah-server] room created: %s" % code)
			return code
	push_error("[tikvah-server] create_room: code space exhausted")
	return ""


func _normalize_code(raw: Variant) -> String:
	return str(raw).strip_edges().to_upper()


func _sanitize_name(raw: Variant) -> String:
	var n := str(raw).strip_edges().left(16)
	return n if n != "" else "Traveler"


func _sanitize_sprite(raw: Variant) -> int:
	return clampi(int(raw), 0, 31)


func _sanitize_pos(raw: Variant, fallback: Vector2) -> Vector2:
	if raw is Array and (raw as Array).size() == 2:
		var a: Array = raw
		if (a[0] is float or a[0] is int) and (a[1] is float or a[1] is int):
			var v := Vector2(float(a[0]), float(a[1]))
			if is_finite(v.x) and is_finite(v.y):
				return Vector2(clampf(v.x, 0.0, WORLD_W), clampf(v.y, 0.0, WORLD_H))
	return fallback


func _send_to(peer_id: int, msg: Dictionary) -> void:
	if _peer == null:
		return
	_peer.set_target_peer(peer_id)
	_peer.put_packet(JSON.stringify(msg).to_utf8_buffer())
	_peer.set_target_peer(0)


func _broadcast_room(room: Dictionary, msg: Dictionary, except_peer: int = -1) -> void:
	msg["room"] = room["code"]
	for pid in (room["players"] as Dictionary).keys():
		if int(pid) == except_peer:
			continue
		_send_to(int(pid), msg)


func _full_room_state(room: Dictionary) -> Dictionary:
	var players := {}
	for pid in (room["players"] as Dictionary).keys():
		var p: Dictionary = (room["players"] as Dictionary)[pid]
		players[p["uuid"]] = {
			"name": p["name"], "sprite": p["sprite"],
			"pos": [p["pos"].x, p["pos"].y],
		}
	return {
		"t": "room_state", "room": room["code"],
		"players": players,
		"crops": (room["crops"] as Array).duplicate(true),
		"npcs": (room["npcs"] as Dictionary).duplicate(true),
		"story": (room["story"] as Dictionary).duplicate(true),
		"garden": (room["garden"] as Dictionary).duplicate(true),
	}


func _join_room(code: String, peer_id: int, name: String, sprite: int, uuid: String) -> Dictionary:
	var room: Dictionary = _rooms.get(code, {})
	if room.is_empty():
		return {"ok": false, "code": "bad_room", "msg": "No room with that code."}
	if (room["players"] as Dictionary).size() >= MAX_PLAYERS_PER_ROOM:
		return {"ok": false, "code": "room_full", "msg": "That room is full."}
	# Drop any stale record for this peer (fast reconnect).
	_remove_player(peer_id)
	if uuid == "" or not (uuid is String):
		uuid = gen_uuid()
	var known: Dictionary = (room["known"] as Dictionary).get(uuid, {})
	var rec := {
		"uuid": uuid, "peer": peer_id,
		"name": known.get("name", name),
		"sprite": int(known.get("sprite", sprite)),
		"pos": known.get("pos", SPAWN),
	}
	(room["players"] as Dictionary)[peer_id] = rec
	(room["by_uuid"] as Dictionary)[uuid] = peer_id
	(room["known"] as Dictionary)[uuid] = {"name": rec["name"], "sprite": rec["sprite"], "pos": rec["pos"]}
	_peer_room[peer_id] = code
	(room as Dictionary)["empty_since"] = -1.0
	print("[tikvah-server] '%s' joined room %s (uuid %s)" % [rec["name"], code, uuid])
	# 1) welcome + full snapshot to the joiner.
	_send_to(peer_id, {"t": "welcome", "id": uuid, "room": code,
		"you": {"name": rec["name"], "sprite": rec["sprite"], "pos": [rec["pos"].x, rec["pos"].y]}})
	_send_to(peer_id, _full_room_state(room))
	# 2) join notice to everyone else (SPEC 1.3).
	_broadcast_room(room, {"t": "player_join",
		"player": {"id": uuid, "name": rec["name"], "sprite": rec["sprite"],
			"pos": [rec["pos"].x, rec["pos"].y]},
		"notice": "A traveler has arrived in Tikvah. %s has joined the village." % rec["name"]},
		peer_id)
	return {"ok": true, "uuid": uuid}


func _remove_player(peer_id: int) -> void:
	var code: Variant = _peer_room.get(peer_id, null)
	if code == null:
		return
	_peer_room.erase(peer_id)
	var room: Dictionary = _rooms.get(code, {})
	if room.is_empty():
		return
	var rec: Dictionary = (room["players"] as Dictionary).get(peer_id, {})
	if rec.is_empty():
		return
	(room["players"] as Dictionary).erase(peer_id)
	(room["by_uuid"] as Dictionary).erase(rec["uuid"])
	# Persist for rejoin-by-uuid (SPEC 1.2).
	(room["known"] as Dictionary)[rec["uuid"]] = {"name": rec["name"], "sprite": rec["sprite"], "pos": rec["pos"]}
	_broadcast_room(room, {"t": "player_leave", "id": rec["uuid"], "name": rec["name"]})
	print("[tikvah-server] '%s' left room %s" % [rec["name"], code])
	if (room["players"] as Dictionary).is_empty() and not bool(room["public"]):
		(room as Dictionary)["empty_since"] = Time.get_ticks_msec() / 1000.0


func _on_peer_connected(peer_id: int) -> void:
	print("[tikvah-server] peer %d connected" % peer_id)
	_hello_wait[peer_id] = Time.get_ticks_msec() / 1000.0


func _on_peer_disconnected(peer_id: int) -> void:
	print("[tikvah-server] peer %d disconnected" % peer_id)
	_hello_wait.erase(peer_id)
	_remove_player(peer_id)


func _on_message(peer_id: int, msg: Dictionary) -> void:
	var mtype := str(msg.get("t", ""))
	match mtype:
		"hello":
			_hello_wait.erase(peer_id)
			var code := _normalize_code(msg.get("room", ""))
			var res := _join_room(code, peer_id,
				_sanitize_name(msg.get("name", "")),
				_sanitize_sprite(msg.get("sprite", 0)),
				str(msg.get("uuid", "")))
			if not bool(res["ok"]):
				_send_to(peer_id, {"t": "error", "code": res["code"], "msg": res["msg"]})
		"move":
			var room := _room_of(peer_id)
			if room.is_empty():
				return
			var rec: Dictionary = (room["players"] as Dictionary)[peer_id]
			var pos := _sanitize_pos(msg.get("pos", []), rec["pos"])
			rec["pos"] = pos
			(room["known"] as Dictionary)[rec["uuid"]]["pos"] = pos
			((room["pending"] as Dictionary)["players"] as Dictionary)[rec["uuid"]] = {"pos": [pos.x, pos.y]}
		"interact":
			var room := _room_of(peer_id)
			if room.is_empty():
				return
			var target := str(msg.get("target", "")).strip_edges().left(32)
			var action := str(msg.get("action", "")).strip_edges().left(32)
			if target == "" or action == "":
				_send_to(peer_id, {"t": "error", "code": "bad_interact", "msg": "interact needs target and action."})
				return
			var rec: Dictionary = (room["players"] as Dictionary)[peer_id]
			((room["pending"] as Dictionary)["events"] as Array).append(
				{"kind": "interact", "by": rec["uuid"], "target": target, "action": action})
		"story":
			var room := _room_of(peer_id)
			if room.is_empty():
				return
			var flag := str(msg.get("flag", "")).strip_edges().left(64)
			if flag == "":
				_send_to(peer_id, {"t": "error", "code": "bad_story", "msg": "story needs a flag."})
				return
			(room["story"] as Dictionary)[flag] = msg.get("value", true)
			((room["pending"] as Dictionary)["story"] as Dictionary)[flag] = msg.get("value", true)
		_:
			_send_to(peer_id, {"t": "error", "code": "bad_type", "msg": "Unknown message type."})


func _room_of(peer_id: int) -> Dictionary:
	var code: Variant = _peer_room.get(peer_id, null)
	if code == null:
		return {}
	return _rooms.get(code, {})


func _flush() -> void:
	for code in _rooms.keys():
		var room: Dictionary = _rooms[code]
		var pending: Dictionary = room["pending"]
		var has := not (pending["players"] as Dictionary).is_empty() \
			or not (pending["story"] as Dictionary).is_empty() \
			or not (pending["events"] as Array).is_empty() \
			or bool(pending["garden"]) or bool(pending["crops"])
		if not has:
			continue
		var delta := {"t": "state_delta"}
		if not (pending["players"] as Dictionary).is_empty():
			delta["players"] = (pending["players"] as Dictionary).duplicate(true)
		if not (pending["story"] as Dictionary).is_empty():
			delta["story"] = (pending["story"] as Dictionary).duplicate(true)
		if not (pending["events"] as Array).is_empty():
			delta["events"] = (pending["events"] as Array).duplicate(true)
		if bool(pending["garden"]):
			delta["garden"] = (room["garden"] as Dictionary).duplicate(true)
		if bool(pending["crops"]):
			delta["crops"] = (room["crops"] as Array).duplicate(true)
		_broadcast_room(room, delta)
		room["pending"] = {"players": {}, "story": {}, "events": [], "garden": false, "crops": false}


func _reap() -> void:
	var now := Time.get_ticks_msec() / 1000.0
	var dead: Array = []
	for code in _rooms.keys():
		var room: Dictionary = _rooms[code]
		if bool(room["public"]):
			continue
		if (room["players"] as Dictionary).is_empty() and float(room["empty_since"]) > 0.0 \
				and now - float(room["empty_since"]) >= REAP_EMPTY_AFTER:
			dead.append(code)
	for code in dead:
		_rooms.erase(code)
		print("[tikvah-server] reaped empty room %s" % code)


func _process(delta: float) -> void:
	if _peer == null:
		return
	_peer.poll()
	while _peer.get_available_packet_count() > 0:
		var from := _peer.get_packet_peer()
		var raw := _peer.get_packet().get_string_from_utf8()
		var parsed: Variant = JSON.parse_string(raw)
		if parsed is Dictionary:
			_on_message(from, parsed)
		else:
			_send_to(from, {"t": "error", "code": "bad_json", "msg": "Message must be a JSON object."})
	# Drop peers that never said hello.
	var now := Time.get_ticks_msec() / 1000.0
	var stale: Array = []
	for pid in _hello_wait.keys():
		if now - float(_hello_wait[pid]) >= HELLO_TIMEOUT:
			stale.append(pid)
	for pid in stale:
		_hello_wait.erase(pid)
		print("[tikvah-server] peer %d never sent hello; closing" % pid)
		_peer.disconnect_peer(int(pid))
	_flush_t += delta
	if _flush_t >= BROADCAST_INTERVAL:
		_flush_t = 0.0
		_flush()
	_reap_t += delta
	if _reap_t >= REAP_CHECK_INTERVAL:
		_reap_t = 0.0
		_reap()
