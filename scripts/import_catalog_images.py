from __future__ import annotations

import csv
import io
import sys
import zipfile
from pathlib import Path

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public" / "products"
REVIEW = ROOT / "catalog-review"
IMAGE_INDEX = ROOT / "app" / "product-images.ts"

# product id, filename inside the supplied ZIP, confidence, review note
MATCHES = [
    ("amber-oud-gold", "WhatsApp Image 2026-08-15 at 17.06.29.png", "certain", ""),
    ("cordoba-rouge", "WhatsApp Image 2026-08-15 at 17.06.30 (1).png", "certain", ""),
    ("falak", "WhatsApp Image 2026-08-15 at 17.06.30.png", "certain", ""),
    ("reem", "WhatsApp Image 2026-08-15 at 17.06.31.png", "certain", ""),
    ("her-confession", "WhatsApp Image 2026-08-15 at 17.06.32 (1).png", "certain", ""),
    ("brioche-vanille", "WhatsApp Image 2026-08-15 at 17.06.32 (2).png", "certain", ""),
    ("sensuous-night", "WhatsApp Image 2026-08-15 at 17.06.32 (3).png", "certain", ""),
    ("tiramisu-coco", "WhatsApp Image 2026-08-15 at 17.06.32 (4).png", "certain", ""),
    ("manaal", "WhatsApp Image 2026-08-15 at 17.06.32 (5).png", "certain", ""),
    ("hayaati", "WhatsApp Image 2026-08-15 at 17.06.32 (8).png", "certain", "Photo is the 50ml presentation"),
    ("afeef", "WhatsApp Image 2026-08-15 at 17.06.32.png", "certain", ""),
    ("shiyaaka-snow", "WhatsApp Image 2026-08-15 at 17.06.33 (1).png", "certain", ""),
    ("safari-breeze", "WhatsApp Image 2026-08-15 at 17.06.33 (2).png", "certain", ""),
    ("barakkat-rouge-540", "WhatsApp Image 2026-08-15 at 17.06.33 (3).png", "certain", ""),
    ("layaan", "WhatsApp Image 2026-08-15 at 17.06.33 (4).png", "certain", ""),
    ("yara", "WhatsApp Image 2026-08-15 at 17.06.33 (8).png", "certain", ""),
    ("yara-elixir", "WhatsApp Image 2026-08-15 at 17.06.33 (10).png", "certain", ""),
    ("bayn-al-asrar", "WhatsApp Image 2026-08-15 at 17.06.33 (11).png", "certain", ""),
    ("yara-tous", "WhatsApp Image 2026-08-15 at 17.06.33 (12).png", "certain", ""),
    ("ana-abiyedh-passion", "WhatsApp Image 2026-08-15 at 17.06.33 (13).png", "certain", ""),
    ("ana-abiyedh-coral", "WhatsApp Image 2026-08-15 at 17.06.33 (14).png", "certain", ""),
    ("ameerat-sugar-crown", "WhatsApp Image 2026-08-15 at 17.06.33 (15).png", "certain", ""),
    ("aira", "WhatsApp Image 2026-08-15 at 17.06.33 (16).png", "certain", ""),
    ("ameerat-al-arab", "WhatsApp Image 2026-08-15 at 17.06.33 (17).png", "certain", ""),
    ("sakeena", "WhatsApp Image 2026-08-15 at 17.06.33 (18).png", "certain", ""),
    ("haya", "WhatsApp Image 2026-08-15 at 17.06.33 (19).png", "certain", ""),
    ("bint-hooran-rose", "WhatsApp Image 2026-08-15 at 17.06.33 (20).png", "certain", ""),
    ("shaghaf-woman", "WhatsApp Image 2026-08-15 at 17.06.33 (21).png", "certain", ""),
    ("angham", "WhatsApp Image 2026-08-15 at 17.06.33 (22).png", "certain", ""),
    ("angham-second-song", "WhatsApp Image 2026-08-15 at 17.06.33 (23).png", "certain", ""),
    ("yum-yum", "WhatsApp Image 2026-08-15 at 17.06.33.png", "certain", ""),
    ("fakhar-rose", "WhatsApp Image 2026-08-15 at 17.07.02.png", "certain", ""),
    ("eclaire", "WhatsApp Image 2026-08-15 at 17.07.03 (1).png", "certain", ""),
    ("reyna", "WhatsApp Image 2026-08-15 at 17.07.03 (2).png", "certain", ""),
    ("petra", "WhatsApp Image 2026-08-15 at 17.07.03 (3).png", "certain", ""),
    ("dalal", "WhatsApp Image 2026-08-15 at 17.07.03 (4).png", "certain", ""),
    ("nebras", "WhatsApp Image 2026-08-15 at 17.07.03 (5).png", "certain", ""),
    ("rave-now-women", "WhatsApp Image 2026-08-15 at 17.07.03 (6).png", "certain", ""),
    ("habik-women", "WhatsApp Image 2026-08-15 at 17.07.03 (7).png", "certain", ""),
    ("atheeri", "WhatsApp Image 2026-08-15 at 17.07.03 (8).png", "certain", ""),
    ("sabah-al-ward", "WhatsApp Image 2026-08-15 at 17.07.03 (9).png", "certain", ""),
    ("nasmaat", "WhatsApp Image 2026-08-15 at 17.07.03 (10).png", "certain", ""),
    ("december-vanille", "WhatsApp Image 2026-08-15 at 17.07.03 (11).png", "certain", ""),
    ("queen-of-arabia", "WhatsApp Image 2026-08-15 at 17.07.03 (12).png", "certain", ""),
    ("bint-hooran", "WhatsApp Image 2026-08-15 at 17.07.03 (13).png", "certain", ""),
    ("milani-warm-vanilla", "WhatsApp Image 2026-08-15 at 17.07.03 (14).png", "certain", ""),
    ("raghba-wood-intense", "WhatsApp Image 2026-08-15 at 17.07.03 (15).png", "certain", ""),
    ("club-de-nuit-sillage", "WhatsApp Image 2026-08-15 at 17.07.03 (17).png", "certain", ""),
    ("club-de-nuit-intense-man", "WhatsApp Image 2026-08-15 at 17.07.03 (18).png", "certain", ""),
    ("your-touch-amber", "WhatsApp Image 2026-08-15 at 17.07.03 (19).png", "certain", ""),
    ("fakhar-platinum", "WhatsApp Image 2026-08-15 at 17.07.03 (20).png", "certain", ""),
    ("fakhar-gold", "WhatsApp Image 2026-08-15 at 17.07.03 (21).png", "certain", ""),
    ("the-kingdom", "WhatsApp Image 2026-08-15 at 17.07.03 (22).png", "certain", ""),
    ("odyssey-mega", "WhatsApp Image 2026-08-15 at 17.07.03 (23).png", "certain", ""),
    ("odyssey-mandarin-sky", "WhatsApp Image 2026-08-15 at 17.07.03 (24).png", "certain", ""),
    ("mashrabya", "WhatsApp Image 2026-08-15 at 17.07.03 (25).png", "certain", ""),
    ("rare-reef", "WhatsApp Image 2026-08-15 at 17.07.03 (27).png", "certain", ""),
    ("turathi-electric", "WhatsApp Image 2026-08-15 at 17.07.03 (28).png", "certain", "Photo packaging says 90ml"),
    ("spectre-wraith", "WhatsApp Image 2026-08-15 at 17.07.03 (29).png", "certain", ""),
    ("irida-extrait", "WhatsApp Image 2026-08-15 at 17.07.03 (30).png", "certain", ""),
    ("chaos-extrait", "WhatsApp Image 2026-08-15 at 17.07.03 (31).png", "certain", ""),
    ("aether-extrait", "WhatsApp Image 2026-08-15 at 17.07.03 (32).png", "certain", ""),
    ("atlantis-extrait", "WhatsApp Image 2026-08-15 at 17.07.03 (33).png", "certain", ""),
    ("veneno-bianco", "WhatsApp Image 2026-08-15 at 17.07.03 (34).png", "certain", ""),
    ("vulcan-baie", "WhatsApp Image 2026-08-15 at 17.07.03 (35).png", "certain", ""),
    ("kingsman", "WhatsApp Image 2026-08-15 at 17.07.03 (36).png", "certain", ""),
    ("durrat-al-aroos", "WhatsApp Image 2026-08-15 at 17.07.03.png", "certain", ""),
    ("pacific-blue", "WhatsApp Image 2026-08-15 at 17.07.27.png", "certain", ""),
    ("art-of-arabia-i", "WhatsApp Image 2026-08-15 at 17.07.28 (1).png", "certain", ""),
    ("sehr", "WhatsApp Image 2026-08-15 at 17.07.28 (2).png", "certain", ""),
    ("amazon-rainfall", "WhatsApp Image 2026-08-15 at 17.07.28 (3).png", "certain", ""),
    ("king-of-arabia", "WhatsApp Image 2026-08-15 at 17.07.28 (4).png", "certain", ""),
    ("hawas-kobra", "WhatsApp Image 2026-08-15 at 17.07.28 (6).png", "certain", ""),
    ("winners-trophy-gold", "WhatsApp Image 2026-08-15 at 17.07.28 (7).png", "certain", ""),
    ("his-confession", "WhatsApp Image 2026-08-15 at 17.07.28 (8).png", "certain", ""),
    ("atlas", "WhatsApp Image 2026-08-15 at 17.07.28.png", "certain", ""),
    ("khamrah-qahwa", "WhatsApp Image 2026-08-15 at 17.07.29 (1).png", "certain", ""),
    ("musamam-black", "WhatsApp Image 2026-08-15 at 17.07.29 (2).png", "certain", ""),
    ("khamrah-dukhan", "WhatsApp Image 2026-08-15 at 17.07.29 (3).png", "certain", ""),
    ("vulcan-feu", "WhatsApp Image 2026-08-15 at 17.07.29 (4).png", "certain", ""),
    ("amber-empire", "WhatsApp Image 2026-08-15 at 17.07.29 (5).png", "certain", ""),
    ("firestorm", "WhatsApp Image 2026-08-15 at 17.07.29 (6).png", "certain", ""),
    ("liquid-brun", "WhatsApp Image 2026-08-15 at 17.07.29 (7).png", "certain", ""),
    ("liquid-brun-limited", "WhatsApp Image 2026-08-15 at 17.07.29 (8).png", "certain", ""),
    ("rayhaan-elixir", "WhatsApp Image 2026-08-15 at 17.07.29 (9).png", "certain", ""),
    ("dynasty", "WhatsApp Image 2026-08-15 at 17.07.29.png", "certain", ""),
    ("rayhaan-divine", "WhatsApp Image 2026-08-15 at 17.07.30 (1).png", "certain", ""),
    ("rayhaan-wolf", "WhatsApp Image 2026-08-15 at 17.07.30 (2).png", "probable", "Wolf emblem; product name is not legible in the photo"),
    ("rayhaan-terra", "WhatsApp Image 2026-08-15 at 17.07.30 (3).png", "probable", "Lion emblem; product name is not legible in the photo"),
    ("rayhaan-aquatica", "WhatsApp Image 2026-08-15 at 17.07.30 (4).png", "certain", ""),
    ("rayhaan-obsidian", "WhatsApp Image 2026-08-15 at 17.07.30 (5).png", "certain", ""),
    ("rayhaan-pacific", "WhatsApp Image 2026-08-15 at 17.07.30 (6).png", "certain", ""),
    ("rayhaan-ocean-rush", "WhatsApp Image 2026-08-15 at 17.07.30 (7).png", "certain", ""),
    ("rayhaan-azul", "WhatsApp Image 2026-08-15 at 17.07.30 (8).png", "certain", ""),
    ("rayhaan-aloha", "WhatsApp Image 2026-08-15 at 17.07.30.png", "certain", ""),
]

UNMATCHED = [
    ("WhatsApp Image 2026-08-15 at 17.06.32 (6).png", "Ameerat Al Arab 50ml", "Duplicate/smaller presentation; 100ml image is used"),
    ("WhatsApp Image 2026-08-15 at 17.06.32 (7).png", "Yara 50ml", "Duplicate/smaller presentation; another image is used"),
    ("WhatsApp Image 2026-08-15 at 17.06.32 (9).png", "Riders", "Product does not exist in the current catalog"),
    ("WhatsApp Image 2026-08-15 at 17.06.33 (5).png", "Tharwah Gold", "Product does not exist in the current catalog"),
    ("WhatsApp Image 2026-08-15 at 17.06.33 (6).png", "Qaed Al Fursan Unlimited", "Different 90ml product from the current Qaed Al Fursan entry"),
    ("WhatsApp Image 2026-08-15 at 17.06.33 (7).png", "Hayaati Women", "Product does not exist in the current catalog"),
    ("WhatsApp Image 2026-08-15 at 17.06.33 (9).png", "Yara 50ml", "Duplicate/smaller presentation; another image is used"),
    ("WhatsApp Image 2026-08-15 at 17.07.03 (16).png", "Khamrah scented candle", "Not a perfume"),
    ("WhatsApp Image 2026-08-15 at 17.07.03 (26).png", "Ameer Al Arab Imperium", "Product does not exist in the current catalog"),
    ("WhatsApp Image 2026-08-15 at 17.07.28 (5).png", "Shaghaf for Men", "Product does not exist in the current catalog"),
]


def prepare_transparent(image: Image.Image) -> Image.Image:
    image = image.convert("RGBA")
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if bbox:
        image = image.crop(bbox)

    max_subject = 800
    image.thumbnail((max_subject, max_subject), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (900, 900), (0, 0, 0, 0))
    x = (canvas.width - image.width) // 2
    y = (canvas.height - image.height) // 2
    canvas.alpha_composite(image, (x, y))
    return canvas


def prepare_white(image: Image.Image) -> Image.Image:
    image = ImageOps.exif_transpose(image).convert("RGB")
    image.thumbnail((800, 800), Image.Resampling.LANCZOS)
    return image


def main(source_path: Path) -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    REVIEW.mkdir(parents=True, exist_ok=True)

    imported_rows = []
    if source_path.is_dir():
        for product_id, filename, _confidence, _note in MATCHES:
            original_filename = str(Path(filename).with_suffix(".jpeg"))
            original_path = source_path / original_filename
            if not original_path.exists():
                raise FileNotFoundError(f"Missing original image: {original_path}")
            image = prepare_white(Image.open(original_path))
            image.save(OUTPUT / f"{product_id}.webp", "WEBP", quality=74, method=6)
            imported_rows.append((product_id, original_filename, _confidence, _note))
        import_label = "white-background"
    else:
        with zipfile.ZipFile(source_path) as archive:
            available = set(archive.namelist())
            for product_id, filename, _confidence, _note in MATCHES:
                if filename not in available:
                    raise FileNotFoundError(f"Missing from ZIP: {filename}")
                with archive.open(filename) as source:
                    image = prepare_transparent(Image.open(io.BytesIO(source.read())))
                image.save(OUTPUT / f"{product_id}.webp", "WEBP", quality=80, method=4)
                imported_rows.append((product_id, filename, _confidence, _note))
        import_label = "transparent"

    with (REVIEW / "catalog-image-matches.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["product_id", "source_filename", "confidence", "note"])
        writer.writerows(imported_rows)

    with (REVIEW / "catalog-images-unmatched.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["source_filename", "identified_as", "reason_not_used"])
        writer.writerows(UNMATCHED)

    image_ids = "\n".join(f'  "{product_id}",' for product_id, *_rest in MATCHES)
    IMAGE_INDEX.write_text(
        "// Generated by scripts/import_catalog_images.py.\n"
        "export const PRODUCT_IMAGE_IDS: ReadonlySet<string> = new Set([\n"
        f"{image_ids}\n"
        "]);\n",
        encoding="utf-8",
    )

    print(f"Imported {len(MATCHES)} {import_label} product images to {OUTPUT}")
    print(f"Left {len(UNMATCHED)} images in the review list")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: import_catalog_images.py /path/to/background-removed.zip-or-originals-directory")
    main(Path(sys.argv[1]))
