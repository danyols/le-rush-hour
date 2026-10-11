"""Run the Rush Hour game server.

    python -m game                      # camera-verified game, a person moves the cube; https link + QR code
    python -m game --verify sim         # no hardware: simulated robot and camera, for UI work
    python -m game --track color        # phones place buildings on the colored rings (default: preview)
    python -m game --no-tunnel          # local only (phones can't use the camera over plain http)

Buildings only charge while the verification camera sees the cube next to their ring.

Pages:
    /               phone AR view (what the QR code opens)
    /board          2D board with the QR code - put it on the laptop screen
    /board?admin=1  same, plus the verification camera view, overrides and reset
    /markers        printable building marker cards (for --track cards)
"""

import argparse
import ctypes
import os
import re
import shutil
import signal
import socket
import subprocess
import threading
from pathlib import Path

import qrcode
import uvicorn

from .engine import Game
from .server import create_app
from .verify import CameraVerifier, SimVerifier
from .workers import HandWorker, SimWorker

TUNNEL_URL_RE = re.compile(r"https://[a-z0-9-]+\.trycloudflare\.com")


def lan_ip() -> str:
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        try:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
        except OSError:
            return "127.0.0.1"


def find_cloudflared() -> str | None:
    return shutil.which("cloudflared") or next(
        (p for p in [str(Path.home() / ".local/bin/cloudflared")] if os.access(p, os.X_OK)), None
    )


def die_with_parent() -> None:
    """Linux: SIGTERM the tunnel if this server exits, even on Ctrl+C or a crash."""
    try:
        ctypes.CDLL("libc.so.6").prctl(1, signal.SIGTERM)  # PR_SET_PDEATHSIG
    except OSError:
        pass


def start_tunnel(port: int, public_url: dict) -> subprocess.Popen | None:
    """Start a free Cloudflare quick tunnel and put its https URL in public_url once it is known."""
    exe = find_cloudflared()
    if not exe:
        print("cloudflared not found - running without a public HTTPS link.")
        return None
    proc = subprocess.Popen(
        [exe, "tunnel", "--no-autoupdate", "--url", f"http://localhost:{port}"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
        preexec_fn=die_with_parent,
    )

    def watch():
        for line in proc.stderr:
            m = TUNNEL_URL_RE.search(line)
            if m and not public_url.get("url"):
                public_url["url"] = m.group(0)
                announce(public_url["url"], port)

    threading.Thread(target=watch, daemon=True).start()
    return proc


def announce(url: str, port: int) -> None:
    qr = qrcode.QRCode(border=1)
    qr.add_data(url)
    print("\nScan to play:\n")
    qr.print_ascii(invert=True)
    print(f"\n  Phone link : {url}")
    print(f"  Board (show this on the laptop): http://localhost:{port}/board")
    print(f"  Admin board: http://localhost:{port}/board?admin=1")
    print(f"  Marker cards (--track cards): http://localhost:{port}/markers\n", flush=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--verify", choices=["camera", "sim"], default="camera",
                    help="camera: watch the table to see where the cube is; sim: simulate robot + camera (UI work)")
    ap.add_argument("--verify-camera", type=int, default=2, help="camera index that sees the whole table")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--drain", type=float, default=150.0, help="seconds for a full building to drain to 0")
    ap.add_argument("--charge", type=float, default=8.0, help="seconds to charge an empty building while the cube is there")
    ap.add_argument("--round", type=float, default=240.0, help="round length in seconds")
    ap.add_argument("--mode", choices=["random", "choose"], default="random",
                    help="random: server picks the next building; choose: players pick it when refueling")
    ap.add_argument("--no-refuel", action="store_true",
                    help="send the robot straight to the next building instead of waiting for the cube on the table")
    ap.add_argument("--sim-time", type=float, nargs=2, default=(4.0, 7.0), metavar=("MIN", "MAX"),
                    help="simulated robot delivery time range in seconds (--verify sim)")
    ap.add_argument("--track", choices=["preview", "color", "cards"], default="preview",
                    help="how phones place buildings: preview (no markers, for testing), the colored rings, "
                         "or printed marker cards (/markers)")
    ap.add_argument("--no-tunnel", action="store_true")
    args = ap.parse_args()

    if args.verify == "sim":
        verifier = SimVerifier()
        worker = SimWorker(verifier, *args.sim_time)
    else:
        verifier = CameraVerifier(args.verify_camera)
        worker = HandWorker()  # the policy worker plugs in here once the models are trained
    game = Game(
        worker,
        verifier,
        drain_s=args.drain,
        charge_s=args.charge,
        round_s=args.round,
        refuel=not args.no_refuel,
        mode=args.mode,
    )
    public_url: dict = {}
    tunnel = None if args.no_tunnel else start_tunnel(args.port, public_url)
    if tunnel is None:
        public_url["url"] = f"http://{lan_ip()}:{args.port}"
        announce(public_url["url"], args.port)
    else:
        print("Starting Cloudflare tunnel (the QR code appears in a few seconds)...", flush=True)

    try:
        uvicorn.run(create_app(game, public_url, args.track), host="0.0.0.0", port=args.port, log_level="warning")
    finally:
        if tunnel:
            tunnel.terminate()


if __name__ == "__main__":
    main()
