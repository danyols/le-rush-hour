#!/usr/bin/env python
"""Teach and move to the arm's start pose for each marker color.

Each color's model only grasps well if the arm (and so the camera view) starts where it did in the
demos. This saves one start pose per color and drives the arm there before a run.

Usage (from this folder, in the lerobot env):
    python start_pose.py teach green   # torque off, move the arm by hand, ENTER saves the pose
    python start_pose.py go green      # arm moves slowly to the saved green pose and holds it
    python start_pose.py list          # show every color's pose

run_model.py calls `go` automatically, so `python run_model.py red-100k` starts from the red pose.

Poses are saved in start_poses.json. A color that hasn't been taught falls back to the average
first-frame pose of its 30 recorded demos (DATASET_POSES below).
"""

import argparse
import json
import select
import sys
import time
from pathlib import Path

from lerobot.robots.so_follower import SOFollower, SOFollowerRobotConfig

ROBOT_PORT = "/dev/ttyACM0"
ROBOT_ID = "my_awesome_follower_arm"
POSES_FILE = Path(__file__).parent / "start_poses.json"
COLORS = ("green", "red", "yellow")
JOINTS = ("shoulder_pan", "shoulder_lift", "elbow_flex", "wrist_flex", "wrist_roll", "gripper")

# Average episode-start pose of embustos/white_cube-<color>_marker (degrees; gripper is 0-100).
DATASET_POSES = {
    "green": {"shoulder_pan": -4.9, "shoulder_lift": -89.5, "elbow_flex": 82.7,
              "wrist_flex": 49.3, "wrist_roll": 49.2, "gripper": 13.9},
    "red": {"shoulder_pan": 2.8, "shoulder_lift": -94.8, "elbow_flex": 80.0,
            "wrist_flex": 30.7, "wrist_roll": 25.5, "gripper": 7.2},
    "yellow": {"shoulder_pan": -5.1, "shoulder_lift": -94.5, "elbow_flex": 84.6,
               "wrist_flex": 59.0, "wrist_roll": 52.7, "gripper": 7.4},
}

SPEED = 30.0  # degrees per second for the slowest-allowed joint move
FPS = 30


def load_poses() -> dict:
    poses = {c: {"pose": p, "source": "dataset average"} for c, p in DATASET_POSES.items()}
    if POSES_FILE.exists():
        for color, pose in json.loads(POSES_FILE.read_text()).items():
            poses[color] = {"pose": pose, "source": "taught"}
    return poses


def save_pose(color: str, pose: dict) -> None:
    saved = json.loads(POSES_FILE.read_text()) if POSES_FILE.exists() else {}
    saved[color] = {j: round(pose[j], 1) for j in JOINTS}
    POSES_FILE.write_text(json.dumps(saved, indent=4) + "\n")


def connect(hold_on_exit: bool) -> SOFollower:
    """Arm only, no cameras. hold_on_exit keeps torque on after disconnect so the arm stays put."""
    robot = SOFollower(SOFollowerRobotConfig(
        port=ROBOT_PORT, id=ROBOT_ID, disable_torque_on_disconnect=not hold_on_exit,
    ))
    robot.connect(calibrate=False)
    if not robot.is_calibrated:
        robot.disconnect()
        sys.exit(f"No calibration for {ROBOT_ID!r}. Calibrate the follower arm first.")
    return robot


def read_pose(robot: SOFollower) -> dict:
    return robot.bus.sync_read("Present_Position", num_retry=2)


def fmt(pose: dict) -> str:
    return "  ".join(f"{j}={pose[j]:6.1f}" for j in JOINTS)


def teach(color: str) -> None:
    robot = connect(hold_on_exit=True)
    try:
        input(f"\nTeaching the {color} start pose.\n"
              "Hold the arm: pressing ENTER turns its motors off so you can move it by hand. ")
        robot.bus.disable_torque()
        print("\nMotors off. Move the arm to the start pose, then press ENTER to save it.\n")
        while True:
            pose = read_pose(robot)
            print("\r" + fmt(pose), end="", flush=True)
            if select.select([sys.stdin], [], [], 0.1)[0]:
                sys.stdin.readline()
                break
        pose = read_pose(robot)
        # Aim the motors at where they are now before powering them, so the arm doesn't jump.
        robot.bus.sync_write("Goal_Position", pose)
        robot.bus.enable_torque()
        save_pose(color, pose)
        print(f"\nSaved {color}: {fmt(pose)}\nto {POSES_FILE.name}. The arm is holding the pose.")
    finally:
        robot.disconnect()


def go(color: str) -> None:
    entry = load_poses()[color]
    target = entry["pose"]
    robot = connect(hold_on_exit=True)
    try:
        start = read_pose(robot)
        biggest = max(abs(target[j] - start[j]) for j in JOINTS)
        steps = max(1, int(biggest / SPEED * FPS))
        print(f"Moving to the {color} start pose ({entry['source']}), {steps / FPS:.1f} s...")
        for i in range(1, steps + 1):
            t = i / steps
            robot.send_action({f"{j}.pos": start[j] + (target[j] - start[j]) * t for j in JOINTS})
            time.sleep(1 / FPS)
        time.sleep(0.5)  # let the motors settle
        print(f"At {color} start pose: {fmt(read_pose(robot))}")
    finally:
        robot.disconnect()


def list_poses() -> None:
    for color, entry in load_poses().items():
        print(f"{color:7s} ({entry['source']}):  {fmt(entry['pose'])}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("action", choices=("teach", "go", "list"))
    ap.add_argument("color", nargs="?", choices=COLORS)
    args = ap.parse_args()
    if args.action == "list":
        list_poses()
    elif args.color is None:
        ap.error(f"{args.action} needs a color: {', '.join(COLORS)}")
    elif args.action == "teach":
        teach(args.color)
    else:
        go(args.color)


if __name__ == "__main__":
    main()
