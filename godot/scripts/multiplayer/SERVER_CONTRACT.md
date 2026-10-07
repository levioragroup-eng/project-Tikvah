# TIKVAH 2.0 — Multiplayer server contract (netcode track)

For the deploy track (`deploy/server/Dockerfile`, `deploy/web/serve.py`,
`deploy/RAILWAY.md`). This is the entire contract the netcode track guarantees.

## Server binary

- **Launch command:** `server.x86_64 --headless -s res://scripts/multiplayer/tikvah_server.gd`
  - The `-s` override is REQUIRED: it swaps the game main scene for the server
    main loop. Without it the binary boots the village scene, not the server.
  - `--headless` is required (no display on Railway). The extra `--server` flag
    in the current Dockerfile is a harmless no-op (Godot ignores unknown flags).
- **Port:** reads `$PORT` from the environment (Railway injects it). Default
  `8081` when unset/invalid. Bind address `0.0.0.0` (override via `$TIKVAH_BIND`).
- **Transport:** WebSocket over TCP — NOT ENet/UDP (Railway public networking
  is TCP-only). Implemented with `WebSocketMultiplayerPeer` on both ends.
- **Protocol:** JSON, one object per WebSocket packet.
  - c2s: `hello{room,name,sprite,uuid?}`, `move{pos:[x,y]}`,
    `interact{target,action}`, `story{flag,value}`
  - s2c: `welcome{id,room,you}`, `room_state{full}`, `player_join{player,notice}`,
    `player_leave{id,name}`, `state_delta{...}`, `error{code,msg}`
- **Rooms:** 4-letter codes from `ABCDEFGHJKMNPQRSTUVWXYZ` (no I/L/O);
  public village fixed code `TIKVAH` (created at startup, never reaped,
  state persists in server memory); private rooms reaped 60 s after empty;
  cap 4 players/room.
- **Identity:** client sends a UUID in `hello` (generated once, stored in
  `localStorage` per SPEC 1.2); server issues one when absent and returns it
  in `welcome`. Rejoin with the same UUID restores name/sprite/position.
- **Sync:** server-authoritative; state deltas broadcast at 10 Hz when dirty
  (plus immediate welcome/room_state/player_join/player_leave).
- Health/log lines are prefixed `[tikvah-server]` on stdout.

## Client (web export)

- The game client reads `window.TIKVAH_CONFIG.serverWsUrl`, injected by
  `deploy/web/serve.py` (`/config.js` ← `SERVER_WS_URL` env). The client
  (`scripts/multiplayer/tikvah_client.gd`) connects with
  `connect_to(serverWsUrl, room_code, player_name, sprite_id)`.
- Auto-reconnects ONCE on an unexpected drop, then gives up (surfaces
  `disconnected` so the UI can offer a manual retry).

## Test gate

`godot --headless --path godot -s res://scripts/multiplayer/net_test.gd`
must exit 0 with zero script errors: in-process server on 127.0.0.1:8081,
4 clients across 2 rooms (shared-room sync, cross-room isolation, story-flag
isolation), 1 bogus-code client rejected, leave broadcast verified.

## Out of scope for this track (later slices)

Full movement authority (150 px/s speed enforcement, collision slide),
farming/fishing/cooking/church/NPC/story/garden game logic, day clock —
the server currently owns positions (bounds-clamped), room/story/garden/crop
state shapes, and the sync protocol. Game systems plug into the room state
dicts owned by `tikvah_room_server.gd`.
