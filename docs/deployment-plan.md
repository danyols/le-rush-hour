# Deployment Plan

## What must run on the arm computer

Only the robot runner must be on the AMD Ryzen AI PC connected to the SO-101:

- LeRobot environment and trained model weights
- USB connection to the leader/follower and cameras
- Python program that starts the trained `move_block_to_green_marker` behavior
- Camera-based success verification, if it uses the arm cameras

## What can run elsewhere

The browser control panel can run either on the arm computer or on a teammate's laptop. ElevenLabs remains cloud-based for speech recognition and spoken replies.

```text
Browser control panel (arm PC or teammate laptop)
    -> local-network request
Robot runner on AMD Ryzen AI PC
    -> cameras + trained LeRobot model + SO-101
```

## Recommended rollout

1. Keep developing the UI in this repository on the current laptop.
2. Ask the teammate/organizer responsible for the Ryzen AI PC whether you should use its physical terminal or SSH. Do not guess its IP address, username, or password.
3. Clone the shared GitHub repository onto the Ryzen AI PC once the team is ready to integrate.
4. Arm team creates a small Python robot-runner service or command that accepts one named action: `move_block_to_green_marker`.
5. Test the robot runner manually first, without the browser.
6. Add a health check and then connect the browser panel to the runner using the Ryzen PC's local-network address.
7. During the demo, use a browser on the same local network; keep a manual/teleoperation fallback ready.

## Interface to agree on

The arm team and UI team only need to agree on this small request/response contract:

```json
// request
{ "policy": "move_block_to_green_marker" }

// response
{ "status": "completed", "verified": true, "message": "Block reached green marker" }
```

The UI must never receive or send raw motor coordinates. The arm runner owns physical movement and safety.
