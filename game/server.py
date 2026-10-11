"""FastAPI app: serves the head-control page and runs the chosen marker policy on the arm."""

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Body, FastAPI
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from .robot import RobotRunner

STATIC = Path(__file__).parent / "static"


def create_app(robot: RobotRunner) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        yield
        await robot.shutdown()

    app = FastAPI(lifespan=lifespan)

    @app.get("/")
    async def index():
        return RedirectResponse("/head-control")

    @app.get("/head-control")
    @app.get("/eye-control")
    async def head_control():
        return FileResponse(STATIC / "eye-control.html")

    @app.get("/api/robot")
    async def robot_status():
        return robot.status()

    @app.post("/api/robot/run")
    async def robot_run(body: dict = Body(...)):
        """Head control picked a marker: run that color's model. 409 if the robot is busy."""
        accepted, status = await robot.start(str(body.get("id", "")), str(body.get("color", "")))
        return JSONResponse(status, status_code=200 if accepted else 409)

    @app.post("/api/robot/stop")
    async def robot_stop():
        """The robot finished its job: end the run and send the arm back to rest."""
        return await robot.stop()

    app.mount("/static", StaticFiles(directory=STATIC), name="static")
    return app
