# TIKVAH 2.0 web client — static hosting for the Godot web export.
# Railway: Root Directory = godot, Dockerfile Path = deploy/web/Dockerfile
FROM python:3.12-slim

WORKDIR /app
COPY deploy/web/serve.py /app/serve.py
COPY build/web/ /app/web/

ENV PORT=8080
EXPOSE 8080

CMD ["python3", "/app/serve.py"]
