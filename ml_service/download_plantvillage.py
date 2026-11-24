import json
import shutil
import urllib.request
import zipfile
from pathlib import Path, PurePosixPath


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data" / "plantvillage"
REVISION = "9e97599868962bd0079b8db4b7f1efa9185fa1e7"
BASE_URL = f"https://huggingface.co/datasets/mohanty/PlantVillage/resolve/{REVISION}"
FILES = {
    "data.zip": f"{BASE_URL}/data.zip?download=true",
    "color_train.txt": f"{BASE_URL}/splits/color_train.txt?download=true",
    "color_test.txt": f"{BASE_URL}/splits/color_test.txt?download=true",
    "leaf-map.json": f"{BASE_URL}/leaf_grouping/leaf-map.json?download=true",
}


def download_file(name: str, url: str) -> Path:
    destination = DATA_DIR / name
    if destination.exists() and destination.stat().st_size > 0:
        return destination

    temporary = destination.with_suffix(destination.suffix + ".part")
    request = urllib.request.Request(url, headers={"User-Agent": "AgriTech-ML/1.0"})
    with urllib.request.urlopen(request, timeout=60) as response, temporary.open("wb") as output:
        shutil.copyfileobj(response, output)
    temporary.replace(destination)
    return destination


def extract_archive(archive: Path) -> None:
    image_root = DATA_DIR / "images"
    if image_root.exists() and any(image_root.rglob("*.JPG")):
        return

    image_root.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive) as source:
        for info in source.infolist():
            relative = PurePosixPath(info.filename)
            if relative.is_absolute() or ".." in relative.parts:
                raise ValueError(f"Unsafe archive path: {info.filename}")
            if info.is_dir():
                continue
            target = image_root.joinpath(*relative.parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            with source.open(info) as src, target.open("wb") as dst:
                shutil.copyfileobj(src, dst)


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    downloaded = {name: download_file(name, url) for name, url in FILES.items()}
    with (DATA_DIR / "source.json").open("w", encoding="utf-8") as output:
        json.dump(
            {
                "dataset": "mohanty/PlantVillage",
                "revision": REVISION,
                "license_declared_by_dataset_card": "CC BY-SA 3.0",
                "source_url": "https://huggingface.co/datasets/mohanty/PlantVillage",
                "files": {name: path.name for name, path in downloaded.items()},
            },
            output,
            indent=2,
        )
    extract_archive(downloaded["data.zip"])
    print(f"Dataset files ready under {DATA_DIR}")


if __name__ == "__main__":
    main()
