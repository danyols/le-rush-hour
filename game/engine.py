"""Game rules for Rush Hour: keep three buildings powered with one robot-carried generator.

A building only charges while the verifier sees the generator (the white cube) next to its ring.
Everywhere else, every building drains. Nothing is ever recharged on a timer.

Phases:
    lobby    -> waiting for someone to press Start
    dispatch -> the robot is carrying the generator to `target`
    charging -> the generator is at `target`; it fills up
    refuel   -> target is full; a player moves the generator back onto the table (detected),
                then the robot is sent to the next building
    over     -> round finished, showing the score
"""

import asyncio
import random
from dataclasses import dataclass

from .verify import SimVerifier, Verifier
from .workers import RobotWorker


@dataclass
class Building:
    id: str  # ring color
    name: str
    color: str  # UI color
    marker_id: int  # ArUco id for --track cards
    task: str  # task name the policy was trained with
    energy: float = 100.0


def make_buildings() -> list[Building]:
    # names match the voice panel (public/app.js)
    return [
        Building("red", "Fire Station", "#ff5a5f", 0, "white_cube-red_marker"),
        Building("green", "Hospital", "#2fd38a", 1, "white_cube-green_marker"),
        Building("yellow", "Shelter", "#f5c84b", 2, "white_cube-yellow_marker"),
    ]


START_ENERGY = {"red": 100.0, "green": 75.0, "yellow": 50.0}  # staggered so it is urgent from the start
MISS_GRACE_S = 4.0  # after the robot says it's done, how long to wait for the camera to agree


class Game:
    def __init__(
        self,
        worker: RobotWorker,
        verifier: Verifier,
        drain_s: float = 150.0,
        charge_s: float = 8.0,
        round_s: float = 240.0,
        refuel: bool = True,
        mode: str = "random",
    ):
        self.worker, self.verifier = worker, verifier
        self.drain_per_s = 100.0 / drain_s
        self.charge_per_s = 100.0 / charge_s
        self.round_s = round_s
        self.refuel_required = refuel
        self.mode = mode  # "random": server picks the next building, "choose": players pick it
        self.buildings = make_buildings()
        self._robot_task: asyncio.Task | None = None
        self.reset()

    def building(self, building_id: str | None) -> Building | None:
        return next((b for b in self.buildings if b.id == building_id), None)

    # ---- player / operator actions -------------------------------------------------------

    def reset(self) -> None:
        self._cancel_robot()
        self.phase = "lobby"
        self.target: str | None = None
        self.last_target: str | None = None
        self.elapsed = 0.0
        self.powered_s = 0.0
        self.charges = 0
        self.misses = 0
        self.robot_done_at: float | None = None  # elapsed time when the worker returned
        self.event = "Press Start to begin the shift."
        for b in self.buildings:
            b.energy = START_ENERGY[b.id]
        if isinstance(self.verifier, SimVerifier):
            self.verifier.sim_location = "table"

    def start(self) -> None:
        if self.phase not in ("lobby", "over"):
            return
        self.reset()
        self.phase = "starting"
        self.event = "Shift started."
        self._next()

    def choose(self, target: str | None) -> None:
        """Players pick the next building (--mode choose) while the generator is back on the table."""
        if self.mode == "choose" and self.phase == "refuel" and self.building(target) and self.generator_at is None:
            self._dispatch(target)

    # ---- simulation ----------------------------------------------------------------------

    @property
    def location(self) -> str | None:
        return self.verifier.location()

    @property
    def generator_at(self) -> str | None:
        loc = self.location
        return loc if self.building(loc) else None

    def tick(self, dt: float) -> None:
        if self.phase in ("lobby", "over"):
            return
        self.elapsed += dt
        at = self.generator_at
        for b in self.buildings:
            if b.id == at:
                b.energy = min(100.0, b.energy + self.charge_per_s * dt)
            else:
                b.energy = max(0.0, b.energy - self.drain_per_s * dt)
            if b.energy > 0:
                self.powered_s += dt

        if self.phase == "dispatch":
            if at == self.target:
                self._cancel_robot()
                self.charges += 1
                self.phase = "charging"
                self.event = f"Delivered to the {self.building(at).name}. Charging."
            elif self.robot_done_at is not None and self.elapsed - self.robot_done_at > MISS_GRACE_S:
                self.misses += 1
                self.event = f"The generator didn't reach the {self.building(self.target).name}. Retrying."
                self._dispatch(self.target)
        elif self.phase == "charging":
            b = self.building(self.target)
            if at != self.target:
                self.event = f"The generator left the {b.name} before it was full."
                self._after_charge()
            elif b.energy >= 100.0:
                self.event = f"The {b.name} is fully powered."
                self._after_charge()
        elif self.phase == "refuel":
            if self.location == "table":
                self._next()

        if self.elapsed >= self.round_s:
            self._cancel_robot()
            self.phase = "over"
            self.target = None
            self.event = f"Shift over. City uptime {self.uptime:.0%} with {self.charges} deliveries."

    def _after_charge(self) -> None:
        self.last_target = self.target
        self.target = None
        if self.refuel_required:
            self.phase = "refuel"
            pick = " and pick the next building" if self.mode == "choose" else ""
            self.event += f" Move the generator back onto the table{pick}."
            if isinstance(self.verifier, SimVerifier):  # simulate the player putting it back
                asyncio.get_running_loop().call_later(2.0, setattr, self.verifier, "sim_location", "table")
        else:
            self._next()

    def _next(self) -> None:
        if self.mode == "choose" and self.phase != "starting":
            self.phase = "refuel"
            self.event = "Pick the next building to power."
            return
        skip = {self.last_target, self.generator_at}  # don't "deliver" to where the generator already is
        choices = [b.id for b in self.buildings if b.id not in skip]
        self._dispatch(random.choice(choices))

    @property
    def uptime(self) -> float:
        total = self.elapsed * len(self.buildings)
        return self.powered_s / total if total else 1.0

    def _dispatch(self, target: str) -> None:
        self._cancel_robot()
        self.phase = "dispatch"
        self.target = target
        self.robot_done_at = None
        self.event = f"Robot is carrying the generator to the {self.building(target).name}."
        self._robot_task = asyncio.get_running_loop().create_task(self._run_robot(target))

    async def _run_robot(self, target: str) -> None:
        try:
            await self.worker.run(self.building(target).task)
        except asyncio.CancelledError:
            raise
        except Exception as e:  # a crashing worker should not kill the game
            self.event = f"Robot error: {e}"
        if self.phase == "dispatch" and self.target == target:
            self.robot_done_at = self.elapsed  # now the camera has MISS_GRACE_S to confirm

    def _cancel_robot(self) -> None:
        if self._robot_task and not self._robot_task.done():
            self._robot_task.cancel()
        self._robot_task = None

    # ---- serialization -------------------------------------------------------------------

    def snapshot(self) -> dict:
        v = self.verifier
        return {
            "phase": self.phase,
            "mode": self.mode,
            "worker": self.worker.kind,
            "target": self.target,
            "generator_at": self.generator_at,
            "location": self.location,
            "time_left": max(0.0, self.round_s - self.elapsed),
            "round_s": self.round_s,
            "uptime": self.uptime,
            "charges": self.charges,
            "misses": self.misses,
            "event": self.event,
            "verify": {"kind": v.kind, "ok": v.ok, "status": v.status, "override": v.override},
            "buildings": [
                {
                    "id": b.id,
                    "name": b.name,
                    "color": b.color,
                    "marker_id": b.marker_id,
                    "energy": round(b.energy, 1),
                    "charging": b.id == self.generator_at and self.phase not in ("lobby", "over"),
                }
                for b in self.buildings
            ],
        }
