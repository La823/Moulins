"""Make small copies of the division pictures for the places that show them
small, so those pages don't download multi-megabyte originals.

The originals are only read — every copy is a new file in a thumbs/ folder
next to them:

  public/moulins divisions/*  ->  public/moulins divisions/thumbs/*.jpg  (640 px wide)
      division tiles on the homepage and the products page
  public/pages/*              ->  public/pages/thumbs/*.jpg              (720 px wide)
      the "Explore Our Portfolio" tiles on the product page; each division's
      own page keeps the full-size banner

Widths are about twice the largest size the tiles are shown at, so they
stay sharp on high-resolution screens. Re-run after adding or changing a
division picture:

  python scripts/make_division_thumbs.py
"""

import os
import sys

from PIL import Image, ImageOps

PUBLIC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public")
SETS = [("moulins divisions", 640), ("pages", 720)]
EXTS = (".jpg", ".jpeg", ".png", ".webp")


def thumb_name(filename):
    # "Bone Voyage.jpg.jpeg" -> "Bone Voyage.jpg", "Jivvya.png" -> "Jivvya.jpg"
    base = filename
    while os.path.splitext(base)[1].lower() in EXTS:
        base = os.path.splitext(base)[0]
    return base + ".jpg"


def main():
    for folder, width in SETS:
        src_dir = os.path.join(PUBLIC, folder)
        out_dir = os.path.join(src_dir, "thumbs")
        os.makedirs(out_dir, exist_ok=True)
        before = after = 0
        for name in sorted(os.listdir(src_dir)):
            src = os.path.join(src_dir, name)
            if not os.path.isfile(src) or not name.lower().endswith(EXTS):
                continue
            img = ImageOps.exif_transpose(Image.open(src))
            if img.mode in ("RGBA", "LA", "P"):
                # JPEG has no transparency: put it on white rather than black
                img = img.convert("RGBA")
                flat = Image.new("RGB", img.size, "white")
                flat.paste(img, mask=img.split()[-1])
                img = flat
            else:
                img = img.convert("RGB")
            if img.width > width:
                img = img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)
            dst = os.path.join(out_dir, thumb_name(name))
            img.save(dst, "JPEG", quality=82, optimize=True, progressive=True)
            before += os.path.getsize(src)
            after += os.path.getsize(dst)
            print(f"  {name} -> thumbs/{thumb_name(name)}")
        print(f"{folder}: {before // 1024} KB -> {after // 1024} KB")


if __name__ == "__main__":
    sys.exit(main())
