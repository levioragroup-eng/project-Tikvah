import http.server
import os
import socketserver

PORT = int(os.environ.get("PORT", "8080"))
WS_URL = os.environ.get("SERVER_WS_URL", "ws://localhost:8081")
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.join(BASE_DIR, "web")

# Godot 4 web exports need the correct wasm MIME type.
http.server.SimpleHTTPRequestHandler.extensions_map.update(
    {".wasm": "application/wasm", ".pck": "application/octet-stream"}
)


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_DIR, **kwargs)

    def end_headers(self):
        # Required for Godot 4 web (SharedArrayBuffer / threads).
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def do_GET(self):
        if self.path == "/config.js":
            body = (
                'window.TIKVAH_CONFIG = {"serverWsUrl": "%s"};\n' % WS_URL
            ).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/javascript")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path in ("/", "/index.html"):
            # Inject runtime config before </head> so the game can read
            # window.TIKVAH_CONFIG.serverWsUrl (the dedicated-server WS URL).
            index_path = os.path.join(WEB_DIR, "index.html")
            try:
                with open(index_path, "rb") as f:
                    html = f.read()
            except FileNotFoundError:
                self.send_error(404)
                return
            tag = b'<script src="/config.js"></script>'
            html = html.replace(b"</head>", tag + b"</head>", 1)
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.send_header("Content-Length", str(len(html)))
            self.end_headers()
            self.wfile.write(html)
            return
        return super().do_GET()


class QuietServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    with QuietServer(("0.0.0.0", PORT), Handler) as httpd:
        print("tikvah-web serving %s on port %d (ws=%s)" % (WEB_DIR, PORT, WS_URL))
        httpd.serve_forever()
