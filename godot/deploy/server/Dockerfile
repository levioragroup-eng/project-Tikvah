# TIKVAH 2.0 dedicated server — Godot headless server export.
# Railway: Root Directory = godot, Dockerfile Path = deploy/server/Dockerfile
# The server binary MUST listen for WebSocket clients on $PORT (Railway injects it).
FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
# The .pck holds all game data — the binary exits immediately without it.
# Keep the original basename: the binary looks for <basename>.pck beside itself.
COPY build/server/tikvah_server.x86_64 /app/tikvah_server.x86_64
COPY build/server/tikvah_server.pck /app/tikvah_server.pck
RUN chmod +x /app/tikvah_server.x86_64

ENV PORT=8080
EXPOSE 8080

# --server selects the dedicated room-server main loop (see scripts/multiplayer/boot.gd).
# (Exported binaries ignore the -s script override; do not use it.)
CMD ["/app/tikvah_server.x86_64", "--headless", "--server"]
