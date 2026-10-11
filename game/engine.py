"""Game rules for Rush Hour: keep three buildings powered with one robot-carried generator.

Phases:
    lobby    -> waiting for someone to press Start
    dispatch -> the robot is carrying the generator to `target`
    refuel   -> generator delivered; waiting for a player to put it back in the play area
    over     -> round finished, showing the score

Every building drains continuously during a round. When the robot reports a delivery, that
building jumps back to full. A building at 0 goes dark (blackout) until it is recharged.
The score is the city's uptime: the share of building-seconds that had power.
"""

import asyncio
import random
import time
from dataclasses import dataclass

from .workers import RobotWorker


@dataclass
class Building:
    id: str
    name: str
    color: str  # CSS color for the UI
    marker_id: int  # ArUco id printed on this building's card
    task: str  # task name the policy was trained with
    energy: float = 100.0


def make_buildings() -> list[Building]:
    return [
        Building("red", "Red Tower", "#ff4d5e", 0, "white_cube-red_marker"),
        Building("green", "Green Lab", "#3ddc84", 1, "white_cube-green_marker"),
        Building("yellow", "Yellow Market", "#ffd23f", 2, "white_cube-yellow_marker"),
    ]


START_ENERGY = {"red": 100.0, "green": 75.0, "yellow": 50.0}  # staggered so it is urgent from the start


class Game:
    def __init__(
        self,
        worker: RobotWorker,
        drain_s: float = 90.0,
        round_s: float = 180.0,
        refuel: bool = True,
        mode: str = "random",
    ):
        self.worker = worker
        self.drain_per_s = 100.0 / drain_s
        self.round_s = round_s
        self.refuel_required = refuel
        self.mode = mode  # "random": server picks the next building, "choose": players pick it
        self.buildings = make_buildings()
        self._robot_task: asyncio.Task | None = None
        self.reset()

    def building(self, building_id: str) -> Building | None:
        return next((b for b in self.buildings if b.id == building_id), None)

    # ---- player / operator actions -------------------------------------------------------

    def reset(self) -> None:
        self._cancel_robot()
        self.phase = "lobby"
        self.target: str | None = None
        self.generator_at: str | None = None  # None = in the play area, not on a building
        self.last_target: str | None = None
        self.elapsed = 0.0
        self.powered_s = 0.0  # building-seconds with energy > 0
        self.charges = 0
        self.misses = 0
        self.flash: dict[str, float] = {}  # building id -> time it was last charged
        self.event = "Press Start to begin the shift."
        for b in self.buildings:
            b.energy = START_ENERGY[b.id]

    def start(self) -> None:
        if self.phase not in ("lobby", "over"):
            return
        self.reset()
        self.event = "Shift started! Generator is in the play area."
        self._dispatch(self._pick_target())

    def refuel(self, target: str | None = None) -> None:
        """A player put the generator back in the play area."""
        if self.phase != "refuel":
            return
        self.generator_at = None
        chosen = target if self.mode == "choose" and self.building(target or "") else self._pick_target()
        self._dispatch(chosen)

    # ---- simulation ----------------------------------------------------------------------

    def tick(self, dt: float) -> None:
        if self.phase not in ("dispatch", "refuel"):
            return
        self.elapsed += dt
        for b in self.buildings:
            if b.energy > 0:
                self.powered_s += dt
            b.energy = max(0.0, b.energy - self.drain_per_s * dt)
        if self.elapsed >= self.round_s:
            self._cancel_robot()
            self.phase = "over"
            self.target = None
            self.event = f"Shift over! City uptime {self.uptime:.0%} with {self.charges} deliveries."

    @property
    def uptime(self) -> float:
        total = self.elapsed * len(self.buildings)
        return self.powered_s / total if total else 1.0

    def _pick_target(self) -> str:
        choices = [b.id for b in self.buildings if b.id != self.last_target]
        return random.choice(choices)

    def _dispatch(self, target: str) -> None:
        self.phase = "dispatch"
        self.target = target
        self.event = f"Robot is carrying the generator to {self.building(target).name}."
        self._robot_task = asyncio.get_running_loop().create_task(self._run_robot(target))

    async def _run_robot(self, target: str) -> None:
        b = self.building(target)
        try:
            ok = await self.worker.run(b.task)
        except asyncio.CancelledError:
            raise
        except Exception as e:  # a crashing worker should not kill the game
            ok = False
            self.event = f"Robot error: {e}"
        if self.phase != "dispatch" or self.target != target:
            return  # round ended or was reset while the robot was moving

        if not ok:
            self.misses += 1
            self.event = f"Delivery to {b.name} failed - retrying."
            await asyncio.sleep(1.0)
            if self.phase == "dispatch" and self.target == target:
                self._dispatch(target)
            return

        b.energy = 100.0
        self.charges += 1
        self.flash[b.id] = time.time()
        self.generator_at = b.id
        self.last_target = b.id
        self.target = None
        if self.refuel_required:
            self.phase = "refuel"
            self.event = f"{b.name} is powered! Put the generator back in the play area and tap Refuel."
        else:
            self.event = f"{b.name} is powered!"
            await asyncio.sleep(1.5)
            if self.phase == "dispatch" and self.target is None:
                self._dispatch(self._pick_target())

    def _cancel_robot(self) -> None:
        if self._robot_task and not self._robot_task.done():
            self._robot_task.cancel()
        self._robot_task = None

    # ---- serialization -------------------------------------------------------------------

    def snapshot(self) -> dict:
        now = time.time()
        return {
            "phase": self.phase,
            "mode": self.mode,
            "worker": self.worker.kind,
            "target": self.target,
            "generator_at": self.generator_at,
            "time_left": max(0.0, self.round_s - self.elapsed),
            "round_s": self.round_s,
            "uptime": self.uptime,
            "charges": self.charges,
            "misses": self.misses,
            "event": self.event,
            "buildings": [
                {
                    "id": b.id,
                    "name": b.name,
                    "color": b.color,
                    "marker_id": b.marker_id,
                    "energy": round(b.energy, 1),
                    "just_charged": now - self.flash.get(b.id, 0) < 2.0,
                }
                for b in self.buildings
            ],
        }
