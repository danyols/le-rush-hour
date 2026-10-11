"""Run the Rush Hour game server.

    python -m game                      # mock robot + public HTTPS link and QR code
    python -m game --worker manual      # operator taps Done on /board?admin=1 (teleop / fallback)
    python -m game --no-tunnel          # local only (phones can't use the camera over plain http)

Pages:
    /               phone AR view (what the QR code opens)
    /board          2D board with the QR code - put it on the laptop screen
    /board?admin=1  same, plus Reset and Done/Failed buttons for the manual worker
    /markers        printable building marker cards
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
from .workers import make_worker

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
    print(f"  Print marker cards: http://localhost:{port}/markers\n", flush=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--worker", choices=["mock", "manual"], default="mock")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--drain", type=float, default=90.0, help="seconds for a full building to drain to 0")
    ap.add_argument("--round", type=float, default=180.0, help="round length in seconds")
    ap.add_argument("--mode", choices=["random", "choose"], default="random",
                    help="random: server picks the next building; choose: players pick it when refueling")
    ap.add_argument("--no-refuel", action="store_true",
                    help="don't wait for a player to put the generator back before the next delivery")
    ap.add_argument("--mock-time", type=float, nargs=2, default=(4.0, 7.0), metavar=("MIN", "MAX"),
                    help="mock robot delivery time range in seconds")
    ap.add_argument("--no-tunnel", action="store_true")
    args = ap.parse_args()

    game = Game(
        make_worker(args.worker, tuple(args.mock_time)),
        drain_s=args.drain,
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
        uvicorn.run(create_app(game, public_url), host="0.0.0.0", port=args.port, log_level="warning")
    finally:
        if tunnel:
            tunnel.terminate()


if __name__ == "__main__":
    main()
