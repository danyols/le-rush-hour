# Look: laptop head-control console

Head tracking replaces eye tracking. Open **http://localhost:8000/head-control**.
The old `/eye-control` URL remains an alias; both serve the replacement interface.
The internal `game/static/eye/` folder name is retained for asset-path compatibility.

```bash
python3 -m game --verify sim --no-tunnel
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
   repeats a selection. Looking down has no command and does not rearm selection.

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

## Future robot connection

| Head direction | Color | Task |
|---|---|---|
| Left | Yellow | white_cube-yellow_marker |
| Right | Red | white_cube-red_marker |
| Up | Green | white_cube-green_marker |

The unchanged adapter contract is:

```js
await adapter.submitSelection({
  id: crypto.randomUUID(),
  color: 'green',
  task: 'white_cube-green_marker',
  confirmedAt: new Date().toISOString(),
});
```

`DemoAdapter` deduplicates IDs, keeps five recent choices and returns
`{id, status: 'not sent'}`. There is no robot endpoint, game websocket, model
execution or worker invocation in this page. Inject a replacement adapter into
`mountHeadControl` when a backend is ready. Keep actual model paths server-side.

The future backend should validate the color/task mapping, deduplicate IDs, resolve
model paths through workstation configuration and invoke a server-side policy worker (`PolicyWorker` when integrated)
with a LeRobot runner. Permit only one hardware job at a time and report busy or
error status without automatically repeating a physical motion. Real acknowledgement
and job status should replace the demo UI's fixed “not sent” status.

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
