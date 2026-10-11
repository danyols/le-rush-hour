"""Runs one trained marker policy on the arm at a time, for the head-control page.

start(color) launches robot_models/run_model.py for that color: the arm moves to the color's start
pose (start_pose.py), then the policy runs until stop(). stop() sends one SIGINT, which LeRobot
treats like Ctrl+C: it stops the policy, moves the arm back to where the run started and
disconnects. Only one signal is ever sent - a second one makes LeRobot exit without going home.
"""

import asyncio
import signal
import sys
import time
from collections import deque
from pathlib import Path

ROBOT_DIR = Path(__file__).resolve().parent.parent / "robot_models"
COLORS = ("green", "red", "yellow")
STOP_TIMEOUT_S = 45.0  # time allowed for the arm to return home before the run is killed


class RobotRunner:
    def __init__(self, python: str = sys.executable):
        self.python = python
        self.state = "idle"  # idle | running | returning | error
        self.color: str | None = None
        self.model: str | None = None
        self.selection_id: str | None = None
        self.message = "Robot is at rest"
        self.started_at: float | None = None
        self.log: deque[str] = deque(maxlen=12)
        self._proc: asyncio.subprocess.Process | None = None
        self._stopping = False
        self._seen: set[str] = set()

    @staticmethod
    def model_for(color: str) -> str | None:
        """The newest model folder for this color: <color>-100k if downloaded, else <color>."""
        for name in (f"{color}-100k", color):
            if (ROBOT_DIR / "models" / name / "config.json").exists():
                return name
        return None

    def status(self) -> dict:
        return {
            "state": self.state,
            "color": self.color,
            "model": self.model,
            "id": self.selection_id,
            "message": self.message,
            "elapsed": round(time.monotonic() - self.started_at, 1) if self.started_at else None,
            "log": list(self.log)[-4:],
        }

    async def start(self, selection_id: str, color: str) -> tuple[bool, dict]:
        """Returns (accepted, status). A repeated id is acknowledged without moving the robot again."""
        if selection_id in self._seen:
            return True, self.status()
        if color not in COLORS:
            return False, {**self.status(), "message": f"Unknown color {color!r}"}
        if self.state in ("running", "returning"):
            return False, {**self.status(), "message": "The robot is busy - finish the current run first"}
        model = self.model_for(color)
        if model is None:
            return False, {**self.status(), "message": f"No {color} model in robot_models/models"}

        self._seen.add(selection_id)
        self.log.clear()
        self._proc = await asyncio.create_subprocess_exec(
            self.python, "-u", str(ROBOT_DIR / "run_model.py"), model,
            "--duration", "0",
            cwd=ROBOT_DIR, stdin=asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
        )
        self.state, self.color, self.model, self.selection_id = "running", color, model, selection_id
        self.started_at, self._stopping = time.monotonic(), False
        self.message = f"Running the {color} model ({model})"
        asyncio.create_task(self._watch(self._proc))
        return True, self.status()

    async def stop(self) -> dict:
        """Ends the run once it has done its job: the arm returns home, then the process exits."""
        if self._proc is None or self.state != "running":
            return self.status()
        self._stopping = True
        self.state, self.message = "returning", "Returning to rest position"
        self._proc.send_signal(signal.SIGINT)
        asyncio.create_task(self._kill_if_stuck(self._proc))
        return self.status()

    async def shutdown(self) -> None:
        """Server exit. Ctrl+C in the terminal already reached the run (same process group), so only
        wait for the arm to get home; never signal it a second time."""
        if self._proc is not None and self._proc.returncode is None:
            try:
                await asyncio.wait_for(self._proc.wait(), STOP_TIMEOUT_S)
            except asyncio.TimeoutError:
                self._proc.kill()

    async def _kill_if_stuck(self, proc) -> None:
        try:
            await asyncio.wait_for(proc.wait(), STOP_TIMEOUT_S)
        except asyncio.TimeoutError:
            self.log.append(f"Did not return home within {STOP_TIMEOUT_S:.0f} s - killed")
            proc.kill()

    async def _watch(self, proc) -> None:
        async for raw in proc.stdout:
            line = raw.decode(errors="replace").rstrip()
            if line:
                self.log.append(line[-200:])
        code = await proc.wait()
        if proc is not self._proc:
            return
        self._proc, self.started_at = None, None
        if self._stopping and code == 0:
            self.state, self.message = "idle", "Robot is at rest"
        elif self._stopping:
            self.state, self.message = "error", f"The run stopped with an error (exit {code}) - check the arm is at rest"
        else:
            last = next((l for l in reversed(self.log) if "Error" in l), self.log[-1] if self.log else "")
            self.state, self.message = "error", f"The run ended on its own (exit {code}). {last}".strip()
