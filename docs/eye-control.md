# Look: laptop head-control console

Head tracking replaces eye tracking. Open **http://localhost:8000/head-control**.
The old `/eye-control` URL remains an alias; both serve the replacement interface.
The internal `game/static/eye/` folder name is retained for asset-path compatibility.

```bash
conda activate lerobot
python -m game
```

## Use

1. Start the camera and allow access. Sit comfortably facing the laptop.
2. Hold your head still in your natural forward-facing position for approximately
   1.5 seconds (500 ms settling and 1,000 ms sampling). Movement or lost tracking
   restarts this short capture. No four-point eye setup or gaze check is required.
3. Face forward for another half second to enable selection.
4. Turn your head **left → yellow**, **right → red**, or **tilt up → green**.
   Hold for two seconds. The progress ring fills and a popup confirms your choice.
5. Face forward for 500 ms before the next choice. Continuing to hold a turn never
   repeats a selection. Looking down has no command until the robot is running (see Robot connection).

Use modest turns; you should still see the screen. The directions are your own
left and right, matching the mirrored preview. Eye movements are not used. Normal
blinks do not interrupt tracking when the face pose remains available.

Pause releases the camera and worker. Resume captures a fresh neutral position.
Recalibrate also captures a new forward position, without restarting the camera.
Changing cameras, resizing, or backgrounding clears the pending selection.
Scrolling no longer invalidates setup: directions are relative to your head's
neutral pose rather than target screen coordinates.

## Tracking and sensitivity

`game/static/eye/config.js` exports `HEAD_CONFIG`. It contains color/task mappings,
timing and thresholds. No new library download is required: the existing pinned
MediaPipe Face Landmarker 0.10.21 supplies its facial transformation matrix.

The head tracker reads the column-major 4×4 matrix, removes scale, checks rotation
validity and computes pose relative to the captured neutral rotation. The
canonical face points along +Z in MediaPipe metric coordinates; +Y is up. With
unmirrored camera input, positive yaw is the person's left. Only preview pixels
are mirrored. Iris and eyelid landmarks are not used by the direction classifier.

Defaults, in degrees:

| Behavior | Threshold |
|---|---:|
| Forward neutral zone (yaw/pitch/roll) | ±5 |
| Start left/right selection | 12 |
| Keep an existing left/right selection | 9 |
| Start upward selection | 10 |
| Keep an existing upward selection | 8 |
| Allowed pitch during left/right selection | ±7 |
| Allowed yaw during upward selection | ±8 |
| Maximum yaw / pitch / roll | 40 / 30 / 20 |
| Movement allowed during neutral capture | 4 |

Lower `yawEnter` and `pitchEnter` slightly if turning is difficult; keep exit
thresholds lower than entry thresholds and above `neutralDegrees`. Exit thresholds
provide hysteresis to reduce boundary jitter. Lowering thresholds too much can
make ordinary movements select colors. Diagonal, downward, extreme and ambiguous
poses are unassigned. Significant translation or distance changes ask you to
return to your starting position or recalibrate.

The worker processes at most one 640px-wide frame at a time, requested every
60 ms. Results older than 250 ms and frozen camera frames cannot accumulate dwell.
Missing faces, multiple faces, or invalid poses reset pending progress. The UI's
processing-time number is worker duration, not end-to-end latency. No frames,
calibration data, or selection history are uploaded or persisted.

## OR theme

The page is themed as a sterile instrument return in an operating room. The three marker colors are
instrument trays around a clipart SO-101 arm (`game/static/eye/or-scene.js`); categories and the
instruments drawn in each tray live in `config.js`:

| Head direction | Tray | Instruments |
|---|---|---|
| Right | Sharps (red) | Scalpel, suture needle, scissors |
| Left | Clamps & forceps (yellow) | Forceps, hemostat, needle holder |
| Up | Blunt & retractors (green) | Retractor, probe, elevator |

The scene mirrors the real arm: while the robot runs, a gloved hand holds the instrument at the
surgeon hand-off point and a dashed route points to the chosen tray. Once DOWN has been given and
the arm is back at rest, the scene plays the return: the arm picks the instrument out of the hand,
carries it to the tray and drops it in; the tray pulses and its "returned" count goes up. The
animation is visual only - it never moves the robot.

## Robot connection

| Head direction | Color | Model run |
|---|---|---|
| Left | Yellow | `robot_models/models/yellow-100k` (else `yellow`) |
| Right | Red | `robot_models/models/red-100k` (else `red`) |
| Up | Green | `robot_models/models/green-100k` (else `green`) |

Run the server from the `lerobot` env (`conda activate lerobot; python -m game`) or pass
`--robot-python` pointing at a Python that has LeRobot. A confirmed selection:

1. `POST /api/robot/run {id, color}` - `game/robot.py` launches
   `robot_models/run_model.py <model> --duration 0`; the arm moves to that color's
   start pose (`start_pose.py`) and the policy runs until stopped,
2. The camera stays on, but while the robot runs the only command is **DOWN**: look down and hold
   until the Rest ring fills (two seconds). That sends `POST /api/robot/stop`: one SIGINT, which
   LeRobot handles like Ctrl+C - it stops the policy, moves the arm back to where the run started
   and disconnects. Left, right and up are locked out mid-run, so no other marker can be picked.
3. Once the arm is back at rest, left/right/up work again and DOWN does nothing.

Every mode change needs a fresh forward hold (0.5 s) before a selection counts. The page's
camera must not be one of the robot's cameras (`/dev/video0`, `/dev/video2` on the arm PC): it now
stays open during the run.

Only one run at a time (a second selection gets 409) and selection ids are deduplicated. `GET /api/robot` returns the run state.

## Checks

```bash
node tests/head-control.test.mjs
node tests/eye-camera.test.mjs
```

Tests cover matrix layout and scale, left/right/up signs, neutral rotation removal,
setup stability, lack of dependence on eye/iris data, neutral zones, hysteresis,
downward and diagonal rejection, dwell, rearming, stale frames and camera cleanup.
Browser checks use a simulated camera and synthetic head observations; they do
not establish actual-person tracking accuracy.

On your laptop, confirm each direction several times. Verify that holding a
confirmed turn never repeats, looking down never selects, and a forward hold
rearms. Moving only your eyes should not choose a color. Covering the camera or
introducing another face must clear pending progress. Validate these behaviors
before enabling robot commands.

Matrix conventions: [MediaPipe matrix format](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/framework/formats/matrix_data.proto)
and [face geometry pipeline](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/modules/face_geometry/libs/geometry_pipeline.cc).
