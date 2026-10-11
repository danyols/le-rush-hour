from pathlib import Path
from huggingface_hub import snapshot_download
from huggingface_hub.errors import RepositoryNotFoundError

MODELS = {
    "green": "rush-hour/white_cube-green_marker-act",
    "green-100k": "rush-hour/white_cube-green-100k",
    "red": "rush-hour/white_cube-red_marker-act",
    "red-100k": "rush-hour/white_cube-red_marker-act-100k",
    "yellow": "rush-hour/white_cube-yellow_marker-act",
    "yellow-100k": "rush-hour/white_cube-yellow_marker-act-100k",
}

for color, repo_id in MODELS.items():
    destination = Path("models") / color

    print(f"Downloading {color} model...")

    try:
        snapshot_download(
            repo_id=repo_id,
            repo_type="model",
            local_dir=str(destination),
        )
    except RepositoryNotFoundError:
        print(f"  {repo_id} is not on the Hub yet - skipping")
        continue

    print(f"Saved to {destination}")

print("All models downloaded!")
