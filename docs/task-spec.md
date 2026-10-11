# First Physical Task: Block to Green Marker

## Purpose

This is the team's first reliable robot behavior. It is deliberately constrained so the LeRobot data, model, voice command, and camera check all refer to the same physical task.

## Intended behavior

The arm sees a safe training block and a distinctive green marker in the fixed camera view. It picks up the block and places it at the green-marker target.

Voice request:

> Move the block to the green marker.

Structured action:

```json
{
  "intent": "move",
  "object": "block",
  "destination": "green_marker",
  "policy": "move_block_to_green_marker"
}
```

## Record before collecting the final dataset

- Does the green marker indicate the destination? Confirm this with the arm team. If it marks the pickup position instead, change the command and policy label before collecting final data.
- Keep camera placement, lighting, table height, object type, marker type, and bin/target geometry fixed.
- Photograph the final setup and save the photo in the repository.
- Write down the reset procedure: where the block begins, where the marker can be moved, and where hands must leave the frame before each episode.
- Define success: block is fully inside/on the green-marked target without human correction.

## Training flow

1. Demonstrate the task repeatedly by teleoperation with the marker in the intended positions.
2. Record 5 pilot episodes and inspect the videos and robot state data.
3. Run a small training smoke test.
4. If the pipeline works, collect the final clean demonstrations.
5. Test using marker/block locations that were not copied exactly from the recordings.

## Scaling to colored markers

After the green-marker baseline is reliable, add one marker color at a time. A robust color-target behavior requires examples of the marker in different legal positions; otherwise the model can memorize one table coordinate instead of reacting to the marker.

For each new marker behavior, record a balanced set of demonstrations with:

- the marker in several positions within the reachable area;
- small, safe variations in the block's starting location and rotation;
- all markers visible when that matches the final demo scene;
- the same camera mount and lighting as the final demo.

Do not expand to several colors until the first green-marker behavior has passed the pilot-training test.

## Integration flow

The voice panel does not drive motors. It sends the policy label `move_block_to_green_marker` to a future local robot-runner program on the arm computer. That program loads the trained LeRobot model, reads the cameras, and controls the arm. After the run, vision reports success or failure back to the panel.
