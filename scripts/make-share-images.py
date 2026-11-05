"""
Make the site's icons and link-preview card from public/icon-512.png (the app icon):
  src/app/favicon.ico        16/32/48 px from the full icon
  src/app/apple-icon.png     180 px
  src/app/opengraph-image.png + twitter-image.png   1200x630 card: icon, name, tagline, a verse in
                             three languages side by side, and the traditions in the library
Run: python scripts/make-share-images.py   (Pillow; Windows fonts Georgia / Segoe UI)
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ICON = Image.open(ROOT / "public" / "icon-512.png").convert("RGBA")
F = Path("C:/Windows/Fonts")
serif = lambda s: ImageFont.truetype(str(F / "georgia.ttf"), s)
serif_b = lambda s: ImageFont.truetype(str(F / "georgiab.ttf"), s)
serif_i = lambda s: ImageFont.truetype(str(F / "georgiai.ttf"), s)
sans = lambda s: ImageFont.truetype(str(F / "segoeui.ttf"), s)
sans_b = lambda s: ImageFont.truetype(str(F / "segoeuib.ttf"), s)

GOLD, BLUE, NAVY, INK, MUTED, PAPER, RUST = "#b8935f", "#5f8fc4", "#1f3a5f", "#1d232c", "#6b7280", "#fbfaf7", "#b45309"

# Icons
ICON.save(ROOT / "src" / "app" / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
ICON.resize((180, 180), Image.LANCZOS).save(ROOT / "src" / "app" / "apple-icon.png")

# Share card
W, H = 1200, 630
card = Image.new("RGB", (W, H), PAPER)
d = ImageDraw.Draw(card)
d.rectangle([0, H - 14, W, H], fill=NAVY)
icon = ICON.resize((150, 150), Image.LANCZOS)
card.paste(icon, (72, 64), icon)
d.text((250, 70), "Verses", font=serif_b(76), fill=GOLD)
d.text((250 + d.textlength("Verses ", font=serif_b(76)), 70), "Across", font=serif_b(76), fill=BLUE)
d.text((252, 168), "Read the world's scriptures side by side, in many languages.", font=serif(30), fill=INK)

# The same verse in three languages, as columns (like the reader).
cols = [
    ("KJV · English", "In the beginning God created the heaven and the earth.", "#2563eb"),
    ("RVR 1909 · Español", "En el principio crió Dios los cielos y la tierra.", "#c2410c"),
    ("Louis Segond · Français", "Au commencement, Dieu créa les cieux et la terre.", "#15803d"),
]
x0, y0, cw, gap = 72, 262, 330, 33
for i, (label, text, color) in enumerate(cols):
    x = x0 + i * (cw + gap)
    d.rounded_rectangle([x, y0, x + cw, y0 + 196], radius=18, fill="#ffffff", outline="#e7e2d8", width=2)
    d.text((x + 22, y0 + 18), label, font=sans_b(20), fill=color)
    # wrap
    words, lines, line = text.split(), [], ""
    for w in words:
        t = (line + " " + w).strip()
        if d.textlength(t, font=serif(27)) > cw - 44:
            lines.append(line)
            line = w
        else:
            line = t
    lines.append(line)
    for j, l in enumerate(lines):
        d.text((x + 22, y0 + 58 + j * 38), l, font=serif(27), fill=INK)
d.text((x0, y0 + 210), "Genesis 1:1", font=serif_i(22), fill=MUTED)

tr = "Bible · Tanakh & Talmud · Quran & Hadith · Gita · Vedas · Upanishads · Pali Canon · Yoga Sutras"
d.text((72, 520), tr, font=sans(21), fill=MUTED)
free = "Free"
d.text((72, 562), free, font=sans_b(24), fill=RUST)
d.text((72 + d.textlength(free + "  ", font=sans_b(24)), 562), "·  Phone & desktop  ·  Read aloud  ·  VersesAcross.com", font=sans(24), fill=INK)

for name in ("opengraph-image.png", "twitter-image.png"):
    card.save(ROOT / "src" / "app" / name, optimize=True)
print("done")
