"""Verses Across business card: front + back, print-ready PNG + PDF.

  python scripts/make-business-card.py "~/Desktop/Verses Across business cards"

Upload <out>/vistaprint-front.png and vistaprint-back.png to Vistaprint (standard 3.5 x 2 in, matte).
Sizes: Vistaprint upload size 3.61 x 2.11 in (bleed included, safe area 3.36 x 1.86) and a generic
3.75 x 2.25 in (0.125 in bleed) copy. 600 dpi."""
import sys
from pathlib import Path

import qrcode
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(r"C:\Users\sknap\Desktop\Claude Projects\Bible Idea")
OUT = Path(sys.argv[1])
OUT.mkdir(parents=True, exist_ok=True)
ICON = Image.open(ROOT / "public" / "icon-512.png").convert("RGBA")
F = Path("C:/Windows/Fonts")
serif_b = lambda s: ImageFont.truetype(str(F / "georgiab.ttf"), s)
serif = lambda s: ImageFont.truetype(str(F / "georgia.ttf"), s)
serif_i = lambda s: ImageFont.truetype(str(F / "georgiai.ttf"), s)
sans = lambda s: ImageFont.truetype(str(F / "segoeui.ttf"), s)
sans_b = lambda s: ImageFont.truetype(str(F / "segoeuib.ttf"), s)
sans_sb = lambda s: ImageFont.truetype(str(F / "seguisb.ttf"), s)
GOLD, BLUE, NAVY, INK, MUTED, PAPER, RUST = "#b8935f", "#5f8fc4", "#1f3a5f", "#1d232c", "#5b6370", "#fbfaf7", "#b45309"
# The site's dark theme: warm charcoal greys with amber-orange (src/app/globals.css .dark)
GREY, GREY2, CREAM, SOFT, AMBER, AMBER_INK = "#24211c", "#1c1a16", "#ece7de", "#d9d2c5", "#ec8a1c", "#1a1306"
DPI = 600
import os
QR_SHARE = float(os.environ.get("QR_SHARE", "0.74"))
URL = "https://versesacross.com"


def centered(d, y, text, font, fill, W):
    w = d.textlength(text, font=font)
    d.text(((W - w) / 2, y), text, font=font, fill=fill)


def fit_w(d, text, make, size, room):
    while d.textlength(text, font=make(size)) > room:
        size -= 2
    return make(size)


def front(W, H, safe):
    """Cream card: logo, name, tagline, web address; navy band along the bottom (runs into the bleed)."""
    im = Image.new("RGB", (W, H), GREY)
    d = ImageDraw.Draw(im)
    x0, y0, x1, y1 = safe
    band = int(0.30 * DPI)
    d.rectangle([0, H - band - (H - y1) // 2, W, H], fill=AMBER)
    # Logo + wordmark, centred as a group.
    icon_s = int(0.54 * DPI)
    f_word = serif_b(int(0.27 * DPI))
    w_verses = d.textlength("Verses ", font=f_word)
    w_across = d.textlength("Across", font=f_word)
    gap = int(0.11 * DPI)
    group = icon_s + gap + w_verses + w_across
    gx = (W - group) / 2
    band_top = H - band - (H - y1) // 2
    # Logo and tagline at the top; the feature lines sit lower, just above the orange band.
    gy = y0 + int(0.03 * DPI)
    icon = ICON.resize((icon_s, icon_s), Image.LANCZOS)
    im.paste(icon, (int(gx), gy), icon)
    ty = gy + (icon_s - int(0.33 * DPI)) // 2
    d.text((gx + icon_s + gap, ty), "Verses", font=f_word, fill=AMBER)
    d.text((gx + icon_s + gap + w_verses, ty), "Across", font=f_word, fill=CREAM)
    tag = "Read, Study, and Listen to the World's Scriptures, side by side."
    y = gy + icon_s + int(0.09 * DPI)
    f_tag = fit_w(d, tag, serif_i, int(0.125 * DPI), x1 - x0)
    centered(d, y, tag, f_tag, CREAM, W)
    tag_bottom = d.textbbox((0, y), tag, font=f_tag)[3]  # the ink's real bottom (descenders included)
    feats = [
        "60+ Translations in 15+ Languages",
        "Search  ·  Cross-References  ·  Audio Read-Aloud",
        "Phone  ·  Tablet  ·  Desktop  ·  App Store",
    ]
    f_feat = fit_w(d, max(feats, key=lambda t: d.textlength(t, font=sans(100))), sans, int(0.11 * DPI), x1 - x0)
    step = int(0.15 * DPI)
    # The feature lines sit exactly midway between the tagline and the orange band (measured by the ink).
    top_off = d.textbbox((0, 0), feats[0], font=f_feat)[1]
    bot_off = d.textbbox((0, 0), feats[-1], font=f_feat)[3]
    block = step * (len(feats) - 1) + bot_off - top_off
    space = band_top - tag_bottom - block
    y = tag_bottom + space / 2 - top_off
    for ln in feats:
        centered(d, y, ln, f_feat, SOFT, W)
        y += step
    # Web address in the band
    f_url = sans_b(int(0.13 * DPI))
    by = H - band - (H - y1) // 2
    centered(d, by + (band - int(0.17 * DPI)) // 2, "VersesAcross.com", f_url, AMBER_INK, W)
    return im


def back(W, H, safe):
    """Navy card: QR code on a white tile, call to action, and the traditions in the library."""
    im = Image.new("RGB", (W, H), GREY2)
    d = ImageDraw.Draw(im)
    x0, y0, x1, y1 = safe
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, border=4, box_size=10)
    qr.add_data(URL)
    qr.make(fit=True)
    q = qr.make_image(fill_color=GREY2, back_color=CREAM).convert("RGB")
    qs = int((y1 - y0) * QR_SHARE)
    q = q.resize((qs, qs), Image.NEAREST)
    qx, qy = x0 + int(0.05 * DPI), (H - qs) // 2
    pad = int(0.03 * DPI)
    d.rounded_rectangle([qx - pad, qy - pad, qx + qs + pad, qy + qs + pad], radius=int(0.06 * DPI), fill=CREAM)
    im.paste(q, (qx, qy))
    # Text column to the right of the QR
    tx = qx + qs + int(0.13 * DPI)
    room = x1 - tx

    def fit(text, make, size):
        while d.textlength(text, font=make(size)) > room:
            size -= 2
        return make(size)

    # Everything in the column is centred on the column, and the block is centred on the QR's height.
    cx = tx + room / 2

    def line(y, text, font, fill):
        d.text((cx - d.textlength(text, font=font) / 2, y), text, font=font, fill=fill)

    def justified(y, text, font, fill):
        """Set a line flush to both edges of the column, like a book page: items separated by " · "
        share the extra space, with each dot centred in its gap (a line without dots spreads its words).
        Edges are measured on the ink, so every line starts and ends at exactly the same place."""
        dots = " · " in text
        parts = text.split(" · ") if dots else text.split(" ")
        if len(parts) == 1:
            return line(y, text, font, fill)
        boxes = [d.textbbox((0, 0), p, font=font) for p in parts]
        widths = [b[2] - b[0] for b in boxes]
        space = (room - sum(widths)) / (len(parts) - 1)
        x = tx
        for i, (p, b, w) in enumerate(zip(parts, boxes, widths)):
            d.text((x - b[0], y), p, font=font, fill=fill)
            x += w
            if dots and i < len(parts) - 1:
                dw = d.textbbox((0, 0), "·", font=font)
                d.text((x + space / 2 - (dw[0] + dw[2]) / 2, y), "·", font=font, fill=fill)
            x += space

    head = "Start your journey"
    # The heading fills the column's width exactly (by size, not by stretching its three words).
    hs = 10
    while d.textbbox((0, 0), head, font=serif_b(hs + 2))[2] - d.textbbox((0, 0), head, font=serif_b(hs + 2))[0] <= room:
        hs += 2
    f_head = serif_b(hs)
    def reflow(items, font, max_lines):
        """Book-style line breaking: choose where lines break (keeping the order) so every line is as
        close to the column's width as possible — the least total squared gap. Returns lines joined
        with " · ", ready to justify."""
        sep = d.textlength(" · ", font=font)
        w = [d.textlength(t, font=font) for t in items]
        n = len(items)
        best = [(0.0, 0, -1)] + [(float("inf"), 0, -1)] * n  # (cost, lines, previous break)
        for j in range(1, n + 1):
            for i in range(j):
                width = sum(w[i:j]) + sep * (j - i - 1)
                if width > room or best[i][0] == float("inf"):
                    continue
                cost = best[i][0] + (room - width) ** 2
                if best[i][1] + 1 <= max_lines and cost < best[j][0]:
                    best[j] = (cost, best[i][1] + 1, i)
        if best[n][0] == float("inf"):
            return None
        out, j = [], n
        while j > 0:
            i = best[j][2]
            out.append(" · ".join(items[i:j]))
            j = i
        return out[::-1]

    def slack(lines_, font):
        return sum((room - d.textlength(t, font=font)) ** 2 for t in lines_)

    def best_order(head_items, tail_items, font, max_lines, tries=4000):
        """Like a typesetter: try orders of the items (head group first, tail group last) and keep the
        one whose lines pack fullest, so the justified gaps stay small and even."""
        import random

        rnd = random.Random(7)
        best = None
        for _ in range(tries):
            h, t = head_items[:], tail_items[:]
            rnd.shuffle(h)
            rnd.shuffle(t)
            got = reflow(h + t, font, max_lines)
            if got and (best is None or slack(got, font) < slack(best, font)):
                best = got
        return best

    def largest(head_items, tail_items, make, start, max_lines):
        """The biggest size (starting at `start`) at which some order of the items fits max_lines."""
        size = start
        while size > 20:
            got = best_order(head_items, tail_items, make(size), max_lines)
            if got:
                return make(size), got
            size -= 2
        raise ValueError("does not fit")

    # One family per line, centred.
    lines = [
        "Christianity · Judaism · Islam",  # Abrahamic
        "Hinduism · Buddhism · Jainism · Yoga",  # born in India
        "Sikhism · Bahá'í · Zoroastrianism",  # monotheisms from India and Persia
        "Taoism · Confucianism · Shinto",  # East Asian
        "Indigenous & African Traditions",
        "Philosophy · Psychology · Ancient Texts",
    ]
    f_list = fit(max(lines, key=lambda t: d.textlength(t, font=sans_sb(100))), sans_sb, int(0.12 * DPI))
    promises = ["Free forever · No ads · No sign-up", "Private by design · Open source"]
    f_p = fit(max(promises, key=lambda t: d.textlength(t, font=sans_b(100))), sans_b, int(0.12 * DPI))
    # Line spacing follows the type size (about 1.3× for the list, 1.35× for the promises).
    L_LIST, L_P = int(f_list.size * 1.32), int(f_p.size * 1.35)
    groups = [([head], f_head, AMBER, 0), (lines, f_list, SOFT, L_LIST), (promises, f_p, AMBER, L_P)]

    def ink(texts, font, step):
        top = d.textbbox((0, 0), texts[0], font=font)[1]
        bottom = step * (len(texts) - 1) + d.textbbox((0, 0), texts[-1], font=font)[3]
        return top, bottom

    inks = [ink(t, f, s) for t, f, _, s in groups]
    top, bottom = qy - pad, qy + qs + pad  # text column starts and ends level with the QR tile
    gap = (bottom - top - sum(b - a for a, b in inks)) / (len(groups) - 1)
    at = top
    for (texts, font, fill, step), (a, b) in zip(groups, inks):
        y = at - a
        for t in texts:
            if len(texts) == 1:  # the heading: already sized to the column; place its ink flush left
                hb = d.textbbox((0, 0), t, font=font)
                d.text((tx - hb[0], y), t, font=font, fill=fill)
            else:
                line(y, t, font, fill)
            y += step
        at += (b - a) + gap
    return im


def safe_save(path, write):
    """Write to a temp file, then swap it in; retry while OneDrive / a viewer briefly holds the file."""
    import os
    import time

    tmp = path.with_suffix(path.suffix + ".tmp")
    write(tmp)
    for _ in range(20):
        try:
            os.replace(tmp, path)
            return
        except OSError:
            time.sleep(0.5)
    raise OSError(f"{path} is locked")


def make(name, w_in, h_in, safe_w, safe_h):
    W, H = round(w_in * DPI), round(h_in * DPI)
    sx, sy = round((W - safe_w * DPI) / 2), round((H - safe_h * DPI) / 2)
    safe = (sx, sy, W - sx, H - sy)
    f, b = front(W, H, safe), back(W, H, safe)
    for side, im in (("front", f), ("back", b)):
        safe_save(OUT / f"{name}-{side}.png", lambda p, im=im: im.save(p, format="PNG", dpi=(DPI, DPI)))
    safe_save(OUT / f"{name}.pdf", lambda p: f.save(p, format="PDF", save_all=True, append_images=[b], resolution=DPI))
    return f, b


# Vistaprint standard card upload: 3.62 x 2.12 with bleed, safe 3.36 x 1.86
f, b = make("vistaprint", 3.62, 2.12, 3.25, 1.75)
# Any printer: 3.5 x 2 trim + 0.125 bleed each side; safe 0.125 inside trim → 3.25 x 1.75
make("standard-bleed", 3.75, 2.25, 3.25, 1.75)
# Preview: both sides, trimmed, small
pv = Image.new("RGB", (f.width + 80, f.height * 2 + 120), "#e5e7eb")
pv.paste(f, (40, 40))
pv.paste(b, (40, f.height + 80))
pv.thumbnail((1400, 1400))
safe_save(OUT / "preview.png", lambda p: pv.save(p, format="PNG"))
print("ok", OUT)
