# Voice-Control Plan

## Current state

- The text-first control panel runs locally at `http://localhost:3000`.
- ElevenLabs speech-to-text has been verified with a spoken command.
- The panel parses a supported command, asks for confirmation, simulates a verified result, speaks a response, and stores a local memory entry.
- The physical arm action is intentionally mocked until the LeRobot team exposes trained skills.

## Demo goal

Build a voice-directed physical assistant for a controlled tabletop task:

> A user says where a known object should go. The system converts that instruction to a tested policy, moves the robot, checks the result with the camera, speaks the outcome, and remembers what happened.

## Judging priorities

The team understands judging as a balanced assessment rather than a weighted single metric:

- **Usefulness / impact:** a person can give an accessible spoken instruction and see a physical task completed and verified.
- **Creativity:** voice, visual grounding, persistent memory, and an embodied agent form one coherent experience rather than disconnected features.
- **Technology use:** make clear how LeRobot training, camera input, AMD edge inference/cloud training, and ElevenLabs speech each contribute to the end-to-end result.

The project should prove each claim live instead of merely listing technologies in a slide.

## Differentiation strategy

The project is not “a robot puts a block in a cup.” Its claim is:

> A person can use natural spoken intent to choose a physical goal; the system grounds that request in what the camera sees, carries out a trained action, verifies the real-world result, and remembers the interaction.

The strongest three visible proof points are:

1. **Language grounding:** “Move the block to the green marker” selects the correct physical goal, with a clear on-screen interpretation and confirmation.
2. **Embodied verification:** the camera reports whether the block reached the requested marker; do not present an unverified arm motion as success.
3. **Memory/improvement:** record task outcomes and a user correction or preference, then show the next request use that saved information.

Use a small live metrics panel during judging: command received, selected marker, action duration, camera verification, and per-marker success rate. Reliability and an intelligible end-to-end story beat a long list of disconnected features.

## Command contract

Current canonical command:

> Move the block to the green marker.

The parser normalizes supported phrases into a safe action object:

```json
{
  "intent": "move",
  "object": "block",
  "destination": "green_marker",
  "policy": "move_block_to_green_marker"
}
```

Supported destination aliases:

| Spoken phrase | Canonical destination |
| --- | --- |
| green marker / green target / green square | `green_marker` |
| Zone One / left bin / left | `zone_1` |
| Zone Two / center bin / center | `zone_2` |
| Zone Three / right bin / right | `zone_3` |

The system must not send free-form language or LLM-generated motor coordinates to the arm. It may only select from policies that the team has tested.

## Architecture

```text
Microphone
  -> ElevenLabs speech-to-text
  -> local command parser
  -> explicit user confirmation
  -> tested LeRobot policy router
  -> camera verification
  -> persistent event memory
  -> ElevenLabs or browser spoken confirmation
```

The web panel and eventual robot-policy router run on the computer connected to the arm. ElevenLabs is used only for speech input/output; the arm policy runs locally.

## Memory layer

Memory is not live retraining. It persistently records command events and will later include verified outcome data:

```json
{
  "intent": "move",
  "object": "blue_block",
  "destination": "zone_1",
  "policy": "pick_blue_block_to_zone_1",
  "outcome": "verified",
  "timestamp": "ISO-8601 timestamp"
}
```

Future extensions:

- User correction: “Blue block belongs in Zone Three.”
- Per-policy success rate and retry count.
- Preference lookup for a request such as “Put the blue block where it belongs.”

## Next steps

1. Keep the current command vocabulary small until an arm skill has been verified. The first command maps to the arm team's green-marker pick-and-place behavior.
2. Arm team: record five pilot episodes for one safe object and the green-marker target; inspect the dataset, then collect the final training episodes.
3. Vision team: provide a simple result signal for each bin, for example `zone_1_verified`.
4. Control-panel owner: replace the mock delay in `public/app.js` with a call to a local policy-router endpoint once the arm team supplies it.
5. Expand to Zone Two and Zone Three only after the first physical skill works.
6. Add flexible LLM interpretation only as a final polish layer; it must output the same restricted command JSON.

## Definition of a successful demo

1. User speaks a supported command.
2. UI displays the interpreted action and requires confirmation.
3. The real arm performs the corresponding trained skill.
4. Camera verifies the object is in the requested zone.
5. UI logs the result and the robot confirms it aloud.

## Safety and scope

- Use only safe props and wide, stable bins.
- Keep the table layout, cameras, and lighting fixed while collecting training data.
- Voice selects a tested skill; it never directly drives the arm.
- Retain teleoperation as a judging fallback.
