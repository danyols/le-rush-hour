"""Find the rings and the white cube (the generator) in a fixed table camera, and say where the cube is.

Used by the server to confirm deliveries: a building only charges while the cube sits next to its ring.
The robot leaves the cube beside the ring (not on it), so "at a building" means the cube's center is
within a short distance of that ring's center.

Ring colors match game/static/colortrack.js (tuned on the team's rings under the venue lights).
"""

from dataclasses import dataclass, field

import cv2
import numpy as np

# hue in degrees (0-360), tolerance, min saturation, min value (0-1)
RING_PROFILES = {
    "red": (353, 12, 0.55, 0.25),  # strict saturation: skin at the table edge is reddish but duller
    "green": (155, 28, 0.30, 0.18),
    "yellow": (68, 16, 0.12, 0.45),
}
WORK_WIDTH = 320  # process frames at this width


@dataclass
class Blob:
    cx: float
    cy: float
    area: float
    size: float  # side length of the blob's rotated bounding box (long side)
    fill: float
    aspect: float


@dataclass
class Scene:
    rings: dict = field(default_factory=dict)  # color -> Blob (this frame only)
    cube: Blob | None = None
    location: str | None = None  # "red" | "green" | "yellow" | "table" | None (cube not seen)


def _hsv(frame_bgr):
    hsv = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2HSV).astype(np.float32)
    return hsv[..., 0] * 2.0, hsv[..., 1] / 255.0, hsv[..., 2] / 255.0


def _blobs(mask, min_area, max_area):
    n, labels, stats, cents = cv2.connectedComponentsWithStats(mask.astype(np.uint8), connectivity=8)
    out = []
    for i in range(1, n):
        area = stats[i, cv2.CC_STAT_AREA]
        if not (min_area <= area <= max_area):
            continue
        ys, xs = np.nonzero(labels == i)
        (_, _), (w, h), _ = cv2.minAreaRect(np.column_stack([xs, ys]).astype(np.float32))
        w, h = max(w, 1.0), max(h, 1.0)
        out.append(Blob(cents[i][0], cents[i][1], float(area), max(w, h), area / (w * h), max(w, h) / min(w, h)))
    return out


def find_rings(frame_bgr) -> dict:
    h, s, v = _hsv(frame_bgr)
    total = h.size
    cands = {}
    for color, (hc, tol, smin, vmin) in RING_PROFILES.items():
        d = np.abs((h - hc + 180) % 360 - 180)
        mask = (d <= tol) & (s >= smin) & (v >= vmin)
        # rings are small from the fixed side camera (~0.2% of the frame)
        found = [b for b in _blobs(mask, total * 0.0004, total * 0.008) if b.fill > 0.45 and b.aspect < 2.2]
        if found:
            cands[color] = found
    if not cands:
        return {}
    # The three rings are the same physical size, so prefer the candidate per color whose size matches
    # the others. This drops e.g. a hand at the table edge that happens to be the biggest red patch.
    ref = float(np.median([max(f, key=lambda b: b.area).size for f in cands.values()]))
    rings = {}
    for color, found in cands.items():
        best = min(found, key=lambda b: abs(np.log(b.size / ref)))
        if abs(np.log(best.size / ref)) < np.log(2.0):
            rings[color] = best
    return rings


def find_cube(frame_bgr, ring_size: float) -> list[Blob]:
    """White, square-ish blobs about the size the cube should be next to rings of `ring_size` px."""
    _, s, v = _hsv(frame_bgr)
    # cube saturation ~0.07; the light wood table is ~0.16-0.22, so the cutoff sits between them
    mask = ((s < 0.12) & (v > 0.62)).astype(np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    lo, hi = (ring_size * 0.9) ** 2, (ring_size * 4.0) ** 2
    return [b for b in _blobs(mask, lo * 0.6, hi) if b.fill > 0.6 and b.aspect < 1.9 and lo <= b.size**2 <= hi]


class TableTracker:
    """Keeps ring positions between frames (the cube or arm can hide a ring) and locates the cube."""

    def __init__(self):
        self.rings: dict[str, Blob] = {}

    def update(self, frame_bgr) -> Scene:
        scale = WORK_WIDTH / frame_bgr.shape[1]
        small = cv2.resize(frame_bgr, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        seen = find_rings(small)
        for color, b in seen.items():
            old = self.rings.get(color)
            if old is None or np.hypot(b.cx - old.cx, b.cy - old.cy) > 4:
                self.rings[color] = b
            else:  # smooth small jitter
                self.rings[color] = Blob(old.cx * 0.7 + b.cx * 0.3, old.cy * 0.7 + b.cy * 0.3,
                                         b.area, b.size, b.fill, b.aspect)
        scene = Scene(rings=seen)
        if len(self.rings) < 2:
            return scene

        ring_size = float(np.median([b.size for b in self.rings.values()]))
        pts = np.array([[b.cx, b.cy] for b in self.rings.values()])
        spacing = min(np.hypot(*(p - q)) for i, p in enumerate(pts) for q in pts[i + 1:])
        near = min(spacing * 0.4, ring_size * 3.2)  # cube center within this of a ring center = delivered
        center = pts.mean(0)
        play_radius = max(np.hypot(*(p - center)) for p in pts) * 1.6

        best = None
        for cube in find_cube(small, ring_size):
            d_play = np.hypot(cube.cx - center[0], cube.cy - center[1])
            if d_play > play_radius:
                continue  # laptop, papers, etc. outside the play area
            if best is None or cube.area > best.area:
                best = cube
        if best is None:
            return scene
        scene.cube = best
        dists = {c: np.hypot(best.cx - b.cx, best.cy - b.cy) for c, b in self.rings.items()}
        color, d = min(dists.items(), key=lambda kv: kv[1])
        scene.location = color if d <= near else "table"
        scene._near = near  # for the debug view
        scene._scale = scale
        return scene


def draw_debug(frame_bgr, scene: Scene, tracker: TableTracker) -> np.ndarray:
    out = frame_bgr.copy()
    s = 1 / getattr(scene, "_scale", WORK_WIDTH / frame_bgr.shape[1])
    near = getattr(scene, "_near", None)
    colors = {"red": (80, 80, 255), "green": (120, 220, 80), "yellow": (60, 230, 230)}
    for color, b in tracker.rings.items():
        c = (int(b.cx * s), int(b.cy * s))
        cv2.circle(out, c, int(b.size * s * 0.7), colors[color], 2)
        if near:
            cv2.circle(out, c, int(near * s), colors[color], 1)
    if scene.cube:
        b = scene.cube
        half = int(b.size * s / 2)
        c = (int(b.cx * s), int(b.cy * s))
        cv2.rectangle(out, (c[0] - half, c[1] - half), (c[0] + half, c[1] + half), (255, 255, 255), 2)
    label = f"generator: {scene.location or 'not seen'}"
    cv2.putText(out, label, (10, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 0), 4)
    cv2.putText(out, label, (10, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
    return out
