from pathlib import Path
import re

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public" / "catalog-source"
OUTPUT = ROOT / "catalog-review"
OUTPUT.mkdir(exist_ok=True)


def natural_key(path: Path):
    return [int(part) if part.isdigit() else part.lower() for part in re.split(r"(\d+)", path.name)]


files = sorted(SOURCE.glob("*.jpeg"), key=natural_key)
font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 22)
small = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 17)
tile_width, tile_height = 560, 640
image_height = 565
columns, rows = 4, 4

manifest = []
for index, source in enumerate(files, start=1):
    manifest.append(f"{index:03d}\t{source.name}")

for sheet_number, start in enumerate(range(0, len(files), columns * rows), start=1):
    sheet_files = files[start : start + columns * rows]
    sheet = Image.new("RGB", (columns * tile_width, rows * tile_height), "#181818")
    draw = ImageDraw.Draw(sheet)

    for offset, source in enumerate(sheet_files):
        number = start + offset + 1
        image = Image.open(source).convert("RGB")
        image = ImageOps.contain(image, (tile_width - 24, image_height - 16))
        x = (offset % columns) * tile_width
        y = (offset // columns) * tile_height
        paste_x = x + (tile_width - image.width) // 2
        paste_y = y + 8 + (image_height - image.height) // 2
        sheet.paste(image, (paste_x, paste_y))
        draw.rectangle((x, y, x + tile_width - 1, y + tile_height - 1), outline="#6d5315", width=2)
        draw.text((x + 12, y + image_height + 5), f"{number:03d}", fill="#f3c64d", font=font)
        label = source.stem.replace("WhatsApp Image 2026-08-15 at ", "")
        draw.text((x + 72, y + image_height + 9), label, fill="white", font=small)

    sheet.save(OUTPUT / f"contact-sheet-{sheet_number:02d}.jpg", quality=92)

(OUTPUT / "manifest.tsv").write_text("\n".join(manifest) + "\n", encoding="utf-8")
print(f"Created {sheet_number} contact sheets for {len(files)} images in {OUTPUT}")
