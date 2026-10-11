# le-rush-hour

## Voice-control prototype

A local, text-first control panel for a voice-directed LeRobot demo. It does **not** move the arm yet: it validates a supported command, shows the proposed action, requires confirmation, records a persistent memory entry, and simulates visual verification.

See [`docs/voice-plan.md`](docs/voice-plan.md) for the agreed demo architecture, memory design, and robot-integration sequence.

## Run it

Use Node 18 or newer:

```powershell
node server.mjs
```

Then open `http://localhost:3000`.

## Supported commands

- `Move the block to the green marker`
- `Put the cube by the green target`
- `Move the blue block to Zone One`
- `Place the blue item in the center`

The parser accepts block/cube/item/tool references; destinations are the green marker/target/square or Zone One/Two/Three and left/center/right.

## ElevenLabs voice input and output

The panel has a **Speak command** button. It records while active, sends the audio to ElevenLabs Speech-to-Text, puts the transcript into the command field, and then interprets it locally. The browser asks for microphone permission only after the user presses the button.

The panel always has browser speech synthesis as a no-setup fallback for replies. To use ElevenLabs transcription and text-to-speech, set `ELEVENLABS_API_KEY` before starting the server. The key stays server-side and is never sent to the browser or committed to Git.

```powershell
$env:ELEVENLABS_API_KEY = "your-key"
$env:ELEVENLABS_VOICE_ID = "optional-voice-id"
node server.mjs
```

If the key is not present, the interface still works and uses the browser voice.

To avoid pasting the key after every terminal restart, copy `.env.example` to `.env`, add the key only to that ignored local file, and start Node with:

```powershell
& "C:\Users\Dan Pham\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --env-file=.env server.mjs
```

The server must stay running while the voice page is open. Stop it with `Ctrl+C` when finished and start it again next time.

Voice commands are intentionally constrained to actions the current robot policies support. Natural language is normalized locally; an LLM is not needed for the initial demo and never controls motor coordinates directly.

## Robot integration contract

Replace the mock action in `public/app.js` with a request to the policy router. The UI emits this command object:

```json
{
  "intent": "move",
  "object": "block",
  "destination": "green_marker",
  "policy": "move_block_to_green_marker"
}
```

The eventual robot service should return `success`, `message`, and ideally camera-verification metadata.

## Laptop head-control console

```bash
python3 -m game --verify sim --no-tunnel
```

Open **http://localhost:8000/head-control** on your laptop. Allow the webcam and
face forward for about two seconds to capture your neutral position. Turn your
head **left for yellow**, **right for red**, or **up for green** and hold for two
seconds to confirm. Face forward briefly before choosing again. Looking down is
unassigned. All selections remain demo-only; nothing is sent to the robot.
The previous `/eye-control` link opens the same head-control interface.

[Head-control setup, sensitivity and robot adapter](docs/eye-control.md)

## Rush Hour game (phone AR + game server)

```bash
conda activate lerobot
python -m game                     # real game: the side camera confirms where the cube is; prints a QR code
python -m game --verify sim        # no hardware: simulated robot and camera, for UI work
python -m game --track color       # phones place buildings on the colored rings (default: preview)
python -m game --help              # round length, drain/charge speed, choose/random mode, ...
```

**Buildings only charge while the cube is next to their ring.** The server watches the table through the
robot's side camera (`--verify-camera 2`) and finds the rings and the white cube (`game/vision.py`). A delivery
counts once the cube has stayed beside the target ring for about 1.5 s, so the arm carrying it past a ring
doesn't count. After a building is full, a player puts the cube back on the table (also detected) and the robot
is sent to the next building. Nothing ever recharges on a timer.

- `/` - phone AR view (what the QR opens). 3D buildings whose floors light up with their energy and go dark as it
  drains. Settings (top right) switch placement between **Preview** (buildings appear without markers, for
  testing), **Rings** (on the colored rings, with ring color calibration) and **Cards** (printed markers). On a
  phone, the motion sensor keeps buildings upright.
- `/board` - 2D board with the QR code; show it on the laptop.
- `/board?admin=1` - adds the verification camera view (what the server sees), a manual generator-location
  override for demo emergencies, and reset.
- `/markers` - printable marker cards for the Cards mode.

The public link comes from a free Cloudflare quick tunnel (`cloudflared`, installed in `~/.local/bin`). Phones need
https for the camera and motion sensor, so use that link rather than the local IP. The link changes every time
the server restarts.

The side camera can only be opened by one program at a time. While a trained policy runs in a separate terminal,
the game can't use that camera; the policy worker will share its frames once it is added.
