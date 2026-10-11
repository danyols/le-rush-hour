"""Robot workers: whatever physically moves the generator to a building.

Every worker exposes `async run(task)`, where `task` is the building's dataset/task name
(e.g. "white_cube-red_marker"). It returns when the worker thinks it is done (True = it believes
the delivery worked). Returning does NOT charge anything: the verifier has to see the cube at the
building. The game cancels run() as soon as the delivery is confirmed or the round ends.

    hand   - no robot: a person (or a teammate teleoperating) moves the cube. Never returns on its own.
    sim    - pretends to carry the cube for a few seconds, then tells the SimVerifier it is there.
             Only valid with --verify sim, for working on the UI without hardware.
    policy - (todo) run the trained LeRobot policy with `task`.
"""

import asyncio
import random


class RobotWorker:
    kind = "base"

    async def run(self, task: str) -> bool:
        raise NotImplementedError


class HandWorker(RobotWorker):
    kind = "hand"

    async def run(self, task: str) -> bool:
        await asyncio.Event().wait()  # wait until the game sees the delivery and cancels us
        return True


class SimWorker(RobotWorker):
    kind = "sim"

    def __init__(self, verifier, min_s: float = 4.0, max_s: float = 7.0):
        self.verifier, self.min_s, self.max_s = verifier, min_s, max_s

    async def run(self, task: str) -> bool:
        self.verifier.sim_location = None  # "picked up": not visible while carried
        await asyncio.sleep(random.uniform(self.min_s, self.max_s))
        color = task.split("-")[1].split("_")[0]  # white_cube-red_marker -> red
        self.verifier.sim_location = color
        return True
