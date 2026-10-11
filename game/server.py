"""FastAPI app: serves the phone pages and streams game state over a WebSocket."""

import asyncio
import io
import json
import time
from contextlib import asynccontextmanager
from pathlib import Path

import qrcode
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

from .engine import Game

STATIC = Path(__file__).parent / "static"
TICK_S = 0.1


def create_app(game: Game, public_url: dict) -> FastAPI:
    """`public_url["url"]` is filled in by the launcher once the tunnel is up."""
    clients: set[WebSocket] = set()

    async def game_loop():
        last = time.monotonic()
        while True:
            await asyncio.sleep(TICK_S)
            now = time.monotonic()
            game.tick(now - last)
            last = now
            if clients:
                msg = json.dumps({**game.snapshot(), "players": len(clients), "url": public_url.get("url")})
                await asyncio.gather(*(ws.send_text(msg) for ws in list(clients)), return_exceptions=True)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        task = asyncio.create_task(game_loop())
        yield
        task.cancel()

    app = FastAPI(lifespan=lifespan)

    @app.get("/")
    async def index():
        return FileResponse(STATIC / "index.html")

    @app.get("/board")
    async def board():
        return FileResponse(STATIC / "board.html")

    @app.get("/markers")
    async def markers():
        return FileResponse(STATIC / "markers.html")

    @app.get("/qr.png")
    async def qr_png():
        img = qrcode.make(public_url.get("url") or "http://localhost", border=2)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return Response(buf.getvalue(), media_type="image/png", headers={"Cache-Control": "no-store"})

    @app.websocket("/ws")
    async def ws_endpoint(ws: WebSocket):
        await ws.accept()
        clients.add(ws)
        try:
            while True:
                msg = json.loads(await ws.receive_text())
                kind = msg.get("type")
                if kind == "start":
                    game.start()
                elif kind == "refuel":
                    game.refuel(msg.get("target"))
                elif kind == "reset":
                    game.reset()
                elif kind in ("done", "fail"):
                    game.worker.operator_result(kind == "done")
        except (WebSocketDisconnect, json.JSONDecodeError):
            pass
        finally:
            clients.discard(ws)

    app.mount("/static", StaticFiles(directory=STATIC), name="static")
    return app
