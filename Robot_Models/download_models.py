
from pathlib import Path
from huggingface_hub import snapshot_download

MODELS = {
    "green": "rush-hour/white_cube-green_marker-act",
}

for color, repo_id in MODELS.items():
    destination = Path("models") / color

    print(f"Downloading {color} model...")

    snapshot_download(
        repo_id=repo_id,
        repo_type="model",
        local_dir=str(destination),
    )

    print(f"Saved to {destination}")

print("All models downloaded!")
