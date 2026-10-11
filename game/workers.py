"""Robot workers: whatever physically moves the generator to a building.

Every worker exposes `async run(task) -> bool`, where `task` is the dataset/task name of the
building (e.g. "white_cube-red_marker") and the return value says whether the delivery worked.
The game cancels the coroutine if the round ends mid-move.

    mock   - pretends to move for a few seconds. For building/testing the game without the arm.
    manual - waits for an operator to tap Done/Failed on the board page (?admin=1). Use it while a
             teammate teleoperates with the leader arm, or as a demo fallback.
    policy - (todo) run the trained LeRobot policy with `task` as the instruction.
"""

import asyncio
import random


class RobotWorker:
    kind = "base"

    async def run(self, task: str) -> bool:
        raise NotImplementedError

    def operator_result(self, ok: bool) -> None:
        """Called when the operator taps Done/Failed. Only the manual worker cares."""


class MockWorker(RobotWorker):
    kind = "mock"

    def __init__(self, min_s: float = 4.0, max_s: float = 7.0, fail_rate: float = 0.0):
        self.min_s, self.max_s, self.fail_rate = min_s, max_s, fail_rate

    async def run(self, task: str) -> bool:
        await asyncio.sleep(random.uniform(self.min_s, self.max_s))
        return random.random() >= self.fail_rate


class ManualWorker(RobotWorker):
    kind = "manual"

    def __init__(self):
        self._result: asyncio.Future | None = None

    async def run(self, task: str) -> bool:
        print(f"[manual] move the generator for task {task!r}, then tap Done on the admin board")
        self._result = asyncio.get_running_loop().create_future()
        try:
            return await self._result
        finally:
            self._result = None

    def operator_result(self, ok: bool) -> None:
        if self._result and not self._result.done():
            self._result.set_result(ok)


def make_worker(kind: str, mock_time: tuple[float, float] = (4.0, 7.0)) -> RobotWorker:
    if kind == "mock":
        return MockWorker(*mock_time)
    if kind == "manual":
        return ManualWorker()
    raise ValueError(f"unknown worker {kind!r} (policy worker comes once a model is trained)")
