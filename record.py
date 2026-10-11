#!/usr/bin/env python
"""Enter-driven wrapper around `lerobot-record` for the SO-101 follower/leader setup.

Flow:
    ENTER -> episode starts recording
    ENTER -> episode ends, reset phase starts immediately (teleop live, nothing recorded)
    ENTER -> next episode starts recording
    ... after the last episode the dataset is saved and pushed to the Hugging Face Hub.

Other keys still work: r = discard and re-record the current episode, q / Esc = stop early.

Usage:
    python record.py                      # prompts for the dataset name
    python record.py --name my-dataset    # skip the prompt
    python record.py --episodes 10
    python record.py --name my-dataset --episodes 7 --resume   # add 7 more episodes to an existing dataset

The dataset name is also used as the task description sent to the Hub.
"""

import argparse
import math
import os
import re
import sys
import time
from pathlib import Path

from lerobot.scripts import lerobot_record
from lerobot.utils.keyboard_input import apply_recording_control, create_key_listener

ROBOT_PORT = "/dev/ttyACM0"
TELEOP_PORT = "/dev/ttyACM1"
CAMERAS = (
    '{ front: {type: opencv, index_or_path: 0, width: 640, height: 480, fps: 30, fourcc: "MJPG"}, '
    'side: {type: opencv, index_or_path: 2, width: 640, height: 480, fps: 30, fourcc: "MJPG"}}'
)

# Ignore a second ENTER this soon after the previous one, so a double-tap can't skip the reset.
ENTER_DEBOUNCE_S = 0.75


def get_hf_user() -> str:
    if os.environ.get("HF_USER"):
        return os.environ["HF_USER"]
    try:
        from huggingface_hub import whoami

        return whoami()["name"]
    except Exception:
        sys.exit("Not logged in to Hugging Face. Run `hf auth login` first (see README).")


def dataset_exists(repo_id: str) -> bool:
    from huggingface_hub import HfApi
    from lerobot.utils.constants import HF_LEROBOT_HOME

    if (Path(HF_LEROBOT_HOME) / repo_id).exists():
        return True
    try:
        return HfApi().repo_exists(repo_id, repo_type="dataset")
    except Exception:
        return False


def prompt_dataset_name(hf_user: str, name: str | None, resume: bool = False) -> str:
    while True:
        if not name:
            name = input(f"Dataset name (will be pushed to {hf_user}/<name>): ").strip()
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", name):
            print("  Use only letters, digits, '-', '_' or '.'.")
        elif name.startswith("eval_"):
            print("  Names starting with 'eval_' are reserved by LeRobot for policy evaluation.")
        elif resume and not dataset_exists(f"{hf_user}/{name}"):
            print(f"  {hf_user}/{name} doesn't exist yet, so there is nothing to resume.")
        elif not resume and dataset_exists(f"{hf_user}/{name}"):
            print(f"  {hf_user}/{name} already exists (locally or on the Hub). Pick another name, or use --resume.")
        else:
            return f"{hf_user}/{name}"
        name = None


def init_enter_keyboard_listener():
    """Same contract as lerobot's init_keyboard_listener, but ENTER ends the current phase."""
    events = {"exit_early": False, "rerecord_episode": False, "stop_recording": False}
    last_enter = 0.0

    def on_key(name: str) -> None:
        nonlocal last_enter
        key = name.lower()
        if key == "enter":
            now = time.monotonic()
            if now - last_enter >= ENTER_DEBOUNCE_S:
                last_enter = now
                events["exit_early"] = True
        elif key == "r":
            apply_recording_control("left", events)
        elif key in ("esc", "q"):
            apply_recording_control("esc", events)

    listener = create_key_listener(on_key, controls_help="ENTER=start/end, r=re-record, q=quit")
    return listener, events


_original_record_loop = lerobot_record.record_loop
_waited_for_first_start = False


def enter_record_loop(*args, **kwargs):
    """Run each phase until ENTER instead of for a fixed time.

    lerobot calls record_loop with a dataset for an episode and without one for the reset.
    Before the very first episode we add a teleop-only "ready" phase so recording also
    starts on ENTER.
    """
    global _waited_for_first_start
    events = kwargs["events"]
    kwargs["control_time_s"] = math.inf
    recording = kwargs.get("dataset") is not None

    if recording and not _waited_for_first_start:
        _waited_for_first_start = True
        episode = kwargs["dataset"].num_episodes
        banner(f"READY - arm is live but NOT recording. Press ENTER to start episode {episode}.")
        _original_record_loop(*args, **{**kwargs, "dataset": None})
        if events["stop_recording"]:
            raise KeyboardInterrupt  # quit before anything was recorded

    if recording:
        episode = kwargs["dataset"].num_episodes
        banner(f"RECORDING episode {episode} - press ENTER to end it (r = redo, q = quit).")
    else:
        banner("RESET the environment - press ENTER when ready to start the next episode.")
    return _original_record_loop(*args, **kwargs)


def banner(msg: str) -> None:
    print(f"\n{'=' * len(msg)}\n{msg}\n{'=' * len(msg)}\n", flush=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--name", help="dataset name (prompted for if omitted)")
    ap.add_argument("--episodes", type=int, default=5, help="episodes to record (with --resume: additional episodes)")
    ap.add_argument("--resume", action="store_true", help="append episodes to an existing dataset")
    args = ap.parse_args()

    hf_user = get_hf_user()
    repo_id = prompt_dataset_name(hf_user, args.name, args.resume)
    task = repo_id.split("/", 1)[1]
    print(f"\nRecording {args.episodes} episodes to {repo_id}  (task: {task!r})\n")

    lerobot_record.init_keyboard_listener = init_enter_keyboard_listener
    lerobot_record.record_loop = enter_record_loop

    sys.argv = [
        "lerobot-record",
        "--robot.type=so101_follower",
        f"--robot.port={ROBOT_PORT}",
        "--robot.id=my_awesome_follower_arm",
        f"--robot.cameras={CAMERAS}",
        "--teleop.type=so101_leader",
        f"--teleop.port={TELEOP_PORT}",
        "--teleop.id=my_awesome_leader_arm",
        "--display_data=false",
        f"--dataset.repo_id={repo_id}",
        "--dataset.no_stamp=true",
        f"--dataset.num_episodes={args.episodes}",
        f"--dataset.single_task={task}",
        "--dataset.push_to_hub=true",
        f"--resume={str(args.resume).lower()}",
    ]
    if args.resume:
        # resume() refuses root=None; use the same local folder the dataset was originally recorded to.
        from lerobot.utils.constants import HF_LEROBOT_HOME

        sys.argv.append(f"--dataset.root={Path(HF_LEROBOT_HOME) / repo_id}")
    lerobot_record.main()


if __name__ == "__main__":
    main()
