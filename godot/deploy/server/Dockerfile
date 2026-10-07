# TIKVAH 2.0 dedicated server — Godot headless server export.
# Railway: Root Directory = godot, Dockerfile Path = deploy/server/Dockerfile
# The server binary MUST listen for WebSocket clients on $PORT (Railway injects it).
FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY build/server/tikvah_server.x86_64 /app/server.x86_64
RUN chmod +x /app/server.x86_64

ENV PORT=8080
EXPOSE 8080

# The -s script override selects the server main loop (extends SceneTree);
# --headless --server alone would boot the game scene instead.
CMD ["/app/server.x86_64", "--headless", "--server", "-s", "res://scripts/multiplayer/tikvah_server.gd"]
