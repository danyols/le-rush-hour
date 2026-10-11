"""Run the head-control server.

    conda activate lerobot
    python -m game                      # http://localhost:8000/head-control
    python -m game --port 8080

Pick a marker with your head on /head-control; the server runs that color's model on the arm
(robot_models/run_model.py) until you press Done, then the arm returns to rest.
"""

import argparse
import sys

import uvicorn

from .robot import RobotRunner
from .server import create_app


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--robot-python", default=sys.executable,
                    help="python with LeRobot installed, used to run robot_models/run_model.py")
    args = ap.parse_args()

    print(f"\n  Head control: http://localhost:{args.port}/head-control\n", flush=True)
    # localhost only: the page drives the arm, and browsers allow the webcam on localhost.
    uvicorn.run(create_app(RobotRunner(args.robot_python)), host="127.0.0.1", port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
