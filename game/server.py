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
LOCATIONS = {"red", "green", "yellow", "table"}


def create_app(game: Game, public_url: dict, track: str = "preview") -> FastAPI:
    """`public_url["url"]` is filled in by the launcher once the tunnel is up.

    `track` is how phones place the buildings: "preview" (no markers needed, for testing the AR view),
    "color" (the colored rings) or "cards" (printed ArUco cards). Phones can switch in their settings.
    """
    clients: set[WebSocket] = set()

    async def game_loop():
        last = time.monotonic()
        while True:
            await asyncio.sleep(TICK_S)
            now = time.monotonic()
            game.tick(now - last)
            last = now
            if clients:
                msg = json.dumps(
                    {**game.snapshot(), "players": len(clients), "url": public_url.get("url"), "track": track}
                )
                await asyncio.gather(*(ws.send_text(msg) for ws in list(clients)), return_exceptions=True)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        game.verifier.start()
        task = asyncio.create_task(game_loop())
        yield
        task.cancel()
        game.verifier.stop()

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

    @app.get("/verify.jpg")
    async def verify_jpg():
        """What the verification camera sees, with rings, cube and the detected location drawn on."""
        jpg = await asyncio.to_thread(game.verifier.debug_jpeg)
        if jpg is None:
            return Response(status_code=204)
        return Response(jpg, media_type="image/jpeg", headers={"Cache-Control": "no-store"})

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
                elif kind == "choose":
                    game.choose(msg.get("target"))
                elif kind == "reset":
                    game.reset()
                elif kind == "override":  # operator fallback if detection fails mid-demo
                    loc = msg.get("location")
                    game.verifier.set_override(loc if loc in LOCATIONS else None)
        except (WebSocketDisconnect, json.JSONDecodeError):
            pass
        finally:
            clients.discard(ws)

    app.mount("/static", StaticFiles(directory=STATIC), name="static")
    return app
