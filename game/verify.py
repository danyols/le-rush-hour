"""Where is the generator? Verifiers answer that so buildings only charge when the cube is really there.

    camera - watches a fixed table camera (default: the robot's side camera) with game/vision.py.
    sim    - no hardware: the simulated robot "places" the generator. For UI work only.

Every verifier reports a debounced location: a building id, "table", or None (not seen / unknown).
An operator override (from /board?admin=1) wins over detection until it is set back to auto.
"""

import threading
import time
from collections import deque

import cv2

from .vision import TableTracker, draw_debug


class LocationFilter:
    """Accept a location only once it has held for most of the last `window_s` seconds.

    The arm carrying the cube past a ring, or covering it, makes single frames flicker.
    """

    def __init__(self, window_s: float = 1.5, share: float = 0.7):
        self.window_s, self.share = window_s, share
        self.samples: deque = deque()
        self.value: str | None = None

    def push(self, location: str | None, now: float | None = None) -> None:
        now = time.monotonic() if now is None else now
        self.samples.append((now, location))
        while self.samples and now - self.samples[0][0] > self.window_s:
            self.samples.popleft()
        if len(self.samples) < 3:
            return
        counts: dict = {}
        for _, loc in self.samples:
            counts[loc] = counts.get(loc, 0) + 1
        loc, n = max(counts.items(), key=lambda kv: kv[1])
        if n / len(self.samples) >= self.share:
            self.value = loc


class Verifier:
    kind = "base"

    def __init__(self):
        self.override: str | None = None  # operator-forced location; None = use detection
        self.status = "starting"
        self.ok = False

    def detected(self) -> str | None:
        raise NotImplementedError

    def location(self) -> str | None:
        return self.override if self.override is not None else self.detected()

    def set_override(self, location: str | None) -> None:
        self.override = location

    def debug_jpeg(self) -> bytes | None:
        return None

    def start(self) -> None:
        pass

    def stop(self) -> None:
        pass


class SimVerifier(Verifier):
    kind = "sim"

    def __init__(self):
        super().__init__()
        self.sim_location: str | None = "table"
        self.status = "Simulation - no camera"
        self.ok = True

    def detected(self) -> str | None:
        return self.sim_location


class CameraVerifier(Verifier):
    """Reads a camera in a background thread. Later, a policy worker that already owns the robot
    cameras can call feed() with its frames instead (pass index=None)."""

    kind = "camera"

    def __init__(self, index: int | None = 2, fps: float = 10.0):
        super().__init__()
        self.index, self.period = index, 1.0 / fps
        self.tracker = TableTracker()
        self.filter = LocationFilter()
        self.raw: str | None = None
        self._last = None  # (frame, scene) for the debug view
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def detected(self) -> str | None:
        return self.filter.value

    def feed(self, frame_bgr) -> None:
        scene = self.tracker.update(frame_bgr)
        self.raw = scene.location
        self.filter.push(scene.location)
        with self._lock:
            self._last = (frame_bgr, scene)
        rings = len(self.tracker.rings)
        self.ok = rings == 3
        self.status = "Watching the table" if rings == 3 else f"Only {rings}/3 rings visible to the camera"

    def debug_jpeg(self) -> bytes | None:
        with self._lock:
            if self._last is None:
                return None
            frame, scene = self._last
        ok, buf = cv2.imencode(".jpg", draw_debug(frame, scene, self.tracker), [cv2.IMWRITE_JPEG_QUALITY, 70])
        return buf.tobytes() if ok else None

    def start(self) -> None:
        if self.index is None:
            self.status = "Waiting for frames"
            return
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()

    def _open(self):
        cap = cv2.VideoCapture(self.index, cv2.CAP_V4L2)
        if not cap.isOpened():
            return None
        cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        return cap

    def _run(self) -> None:
        cap = None
        while not self._stop.is_set():
            if cap is None:
                cap = self._open()
                if cap is None:
                    self.ok = False
                    self.status = f"Camera {self.index} unavailable (in use by the robot, or unplugged) - retrying"
                    self._stop.wait(2.0)
                    continue
            t = time.monotonic()
            ok, frame = cap.read()
            if not ok:
                cap.release()
                cap = None
                self.ok = False
                self.status = f"Lost camera {self.index} - reconnecting"
                continue
            self.feed(frame)
            self._stop.wait(max(0.0, self.period - (time.monotonic() - t)))
        if cap is not None:
            cap.release()
