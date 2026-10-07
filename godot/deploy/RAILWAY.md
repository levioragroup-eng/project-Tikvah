# TIKVAH 2.0 — Railway deployment (existing project: project-tikvah-production)

Target: the EXISTING Railway project. The current live service (track-a/master)
is UNTOUCHED — it stays up as the fallback competition entry. We add TWO new
services sourced from the `godot-2.0` branch.

## One-time manual steps (dashboard — no API access from the build VM)

1. Open the **project-tikvah-production** project in the Railway dashboard.
2. **New service → GitHub Repo** → `levioragroup-eng/project-Tikvah`.
   - Name: `tikvah-godot-server`
   - Settings → **Branch**: `godot-2.0`
   - Settings → **Root Directory**: `godot`
   - Settings → **Dockerfile Path**: `deploy/server/Dockerfile`
   - Settings → Networking → **Generate Domain** (note the public URL, e.g.
     `tikvah-godot-server-production.up.railway.app`)
   - The server listens on Railway's `$PORT` (WebSocket, TCP — no UDP needed).
3. **New service → GitHub Repo** → same repo again.
   - Name: `tikvah-godot-web`
   - Settings → **Branch**: `godot-2.0`
   - Settings → **Root Directory**: `godot`
   - Settings → **Dockerfile Path**: `deploy/web/Dockerfile`
   - Variables → add **`SERVER_WS_URL`** =
     `wss://<tikvah-godot-server public domain>` (from step 2, wss scheme)
   - Settings → Networking → **Generate Domain** → this is the public game URL.
4. Push to `godot-2.0` → both services rebuild and redeploy automatically.

## How it hangs together

```
browser ──HTTPS──▶ tikvah-godot-web (static: index.html/wasm/pck + /config.js)
     │
     │  window.TIKVAH_CONFIG.serverWsUrl (from SERVER_WS_URL env)
     ▼
browser ──WSS───▶ tikvah-godot-server (Godot --headless --server, WebSocketMultiplayerPeer on $PORT)
```

- Web export is served with `Cross-Origin-Opener-Policy: same-origin` and
  `Cross-Origin-Embedder-Policy: require-corp` (Godot 4 web requirement).
- `/config.js` is generated at container start from `SERVER_WS_URL` and injected
  into `index.html` — no rebuild needed to repoint the client.
- Multiplayer uses **WebSocket (TCP)**, not ENet/UDP, because Railway's public
  networking is TCP. Contract for the netcode track: server reads `$PORT` from
  the environment and accepts WebSocket clients at `/`; room codes live in
  server memory (same model as the current Node server).
- Build outputs are committed: `godot/build/web/*` and
  `godot/build/server/tikvah_server.x86_64` (rebuilt by the deploy track).

## Rollback

Delete or pause the two new services — the original `track-a` service is
unaffected and keeps serving the fallback entry at its existing URL.
