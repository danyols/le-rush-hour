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
