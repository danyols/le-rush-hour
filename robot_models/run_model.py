#!/usr/bin/env python
"""Run a trained marker policy on the SO-101 arm.

Usage (from this folder, in the lerobot env):
    python run_model.py green                 # runs 30 s, then the arm returns to its start pose
    python run_model.py green --duration 60
    python run_model.py green --duration 0    # run until Ctrl+C
    python run_model.py red-100k              # any "<color>-..." folder runs that color's task

Before running, the arm moves to that color's start pose (start_pose.py; --no-start-pose skips it).

Models live in models/<color>/ (see download_models.py). Arm, cameras and calibration ids match
record.py, so the policy sees the same setup it was trained on.
"""

import argparse
import json
import shutil
import sys
from pathlib import Path

from lerobot.scripts import lerobot_rollout

import start_pose

ROBOT_PORT = "/dev/ttyACM0"
CAMERAS = (
    '{ front: {type: opencv, index_or_path: 0, width: 640, height: 480, fps: 30, fourcc: "MJPG"}, '
    'side: {type: opencv, index_or_path: 2, width: 640, height: 480, fps: 30, fourcc: "MJPG"}}'
)
MODELS_DIR = Path(__file__).parent / "models"


def strip_null_dtype(model_dir: Path) -> None:
    """Models trained on the cloud's newer LeRobot save `"dtype": null`, which our LeRobot rejects.

    null just means "default", so dropping it is safe. The original file is kept as <name>.orig.
    """
    for name in ("config.json", "train_config.json"):
        path = model_dir / name
        if not path.exists():
            continue
        data = json.loads(path.read_text())

        def strip(obj) -> bool:
            changed = False
            if isinstance(obj, dict):
                if "dtype" in obj and obj["dtype"] is None:
                    del obj["dtype"]
                    changed = True
                for v in obj.values():
                    changed |= strip(v)
            elif isinstance(obj, list):
                for v in obj:
                    changed |= strip(v)
            return changed

        if strip(data):
            backup = path.with_name(name + ".orig")
            if not backup.exists():
                shutil.copy(path, backup)
            path.write_text(json.dumps(data, indent=4))
            print(f"Removed 'dtype: null' from {path} (original kept as {backup.name})")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("color", help="model folder under models/, e.g. green")
    ap.add_argument("--duration", type=float, default=30, help="seconds to run; 0 = until Ctrl+C")
    ap.add_argument("--device", default="cpu", help="cpu (this PC's GPU isn't usable by PyTorch)")
    ap.add_argument("--no-start-pose", action="store_true",
                    help="don't move to the color's start pose first (see start_pose.py)")
    args = ap.parse_args()

    model_dir = MODELS_DIR / args.color
    if not (model_dir / "config.json").exists():
        sys.exit(f"No model in {model_dir}. Run download_models.py first.")
    strip_null_dtype(model_dir)

    color = args.color.split("-")[0]  # "green-100k" is another green model, same task
    task = f"white_cube-{color}_marker"  # the task name the dataset was recorded with
    if not args.no_start_pose and color in start_pose.COLORS:
        start_pose.go(color)

    print(f"\nRunning {model_dir} on the arm for {args.duration or 'unlimited'} s (task: {task!r})\n")

    sys.argv = [
        "lerobot-rollout",
        "--strategy.type=base",
        f"--policy.path={model_dir}",
        f"--policy.device={args.device}",
        f"--device={args.device}",
        "--robot.type=so101_follower",
        f"--robot.port={ROBOT_PORT}",
        "--robot.id=my_awesome_follower_arm",
        f"--robot.cameras={CAMERAS}",
        f"--task={task}",
        f"--duration={args.duration}",
        "--display_data=false",
    ]
    lerobot_rollout.main()


if __name__ == "__main__":
    main()
