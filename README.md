# Sterile Instrument Return

Hands-free instrument hand-off with an SO-101 arm. The operator picks an instrument tray by turning
their head; the arm runs the trained LeRobot policy for that tray's marker, then returns to rest
when the operator looks down.

```text
Laptop webcam ─► browser: MediaPipe Face Landmarker → head direction (all on-device)
                    │  POST /api/robot/run {color}      POST /api/robot/stop
                    ▼
game/ server (FastAPI, on the arm PC) ─► robot_models/run_model.py <color>-100k
                                           start pose → ACT policy on the SO-101
```

| Head | Tray | Marker / model |
|---|---|---|
| Left | Clamps | yellow → `robot_models/models/yellow-100k` |
| Right | Sharps | red → `robot_models/models/red-100k` |
| Up | Blunt | green → `robot_models/models/green-100k` |
| Down (only while running) | — | stop: the arm returns to rest |

## Run it

On the arm PC, in the `lerobot` env:

```bash
cd robot_models && python download_models.py && cd ..   # once: fetch the trained policies
python -m game                                         # http://localhost:8000/head-control
```

The browser needs a secure origin for the webcam, so open the page as `localhost`. From a laptop,
tunnel the port and use the laptop's webcam:

```bash
ssh -L 8000:localhost:8000 <arm-pc> 'cd le-rush-hour && conda run -n lerobot python -m game'
# then open http://localhost:8000/head-control on the laptop
```

Options: `--port 8080`; `--robot-python /path/to/python` (a Python with LeRobot; defaults to the one
running the server). `--robot-python /bin/false` tests head tracking without moving the arm.

## Using head control

1. Start the camera and face forward for about 1.5 s to capture your neutral pose.
2. Face forward another 0.5 s, then turn **left**, **right** or **up** and hold for 2 s until the ring
   fills. The arm moves to that color's start pose and runs its policy.
3. Tracking continues during the run, but only **DOWN** is accepted. Once the instrument is
   delivered, look down and hold for 2 s: the run stops and the arm returns to rest.
4. When the page shows *At rest*, face forward and pick the next tray.

Only one run at a time; repeated or overlapping selections are rejected by the server. No camera
frames leave the browser. Thresholds, timing and the tray mapping are in
`game/static/eye/config.js`; details in [docs/eye-control.md](docs/eye-control.md).

## Robot models

From `robot_models/`, in the `lerobot` env:

```bash
python download_models.py              # fetch the policies from the Hugging Face Hub into models/
python start_pose.py teach green       # torque off, move the arm by hand, ENTER saves the start pose
python start_pose.py go green          # drive to the saved green start pose
python run_model.py green-100k         # start pose, then the policy (30 s; --duration 0 = until Ctrl+C)
```

`record.py` (repo root) records new training episodes with the leader/follower arms and pushes the
dataset to the Hub; arm, camera and calibration ids match `run_model.py`.

## Layout

| Path | What |
|---|---|
| `game/server.py` | FastAPI app: `/head-control` page and `/api/robot` run/stop/status |
| `game/robot.py` | Launches `run_model.py` for a color, one run at a time; stop = one SIGINT |
| `game/static/eye/` | Head-tracking UI: camera, MediaPipe worker, pose classifier, dwell, OR scene |
| `robot_models/` | Model download, start poses and the policy runner |
| `tests/` | `node tests/head-control.test.mjs` and `node tests/eye-camera.test.mjs` |
