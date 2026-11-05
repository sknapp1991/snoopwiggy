"""
Cut the LibriVox King James Bible (read by Michael Armenta, 2001, public domain) into chapters with
verse timings, in the same layout as the generated voices:
  .cache-audio/kjv/armenta/<book>/<chapter>.mp3  +  <chapter>.json  {"verses": [{"v","s","e"}], ...}

Input: .cache-audio/librivox-kjv/bible_NNN_kjv_64kb.mp3 (127 files from archive.org item
bible_kjv_complete_2001_librivox) and titles.json ("001 - Genesis Ch. 1 - 14").

How: Whisper (large-v3-turbo, GPU) transcribes each file with word timings (cached in
transcripts/), the words are matched to the KJV text of those chapters (data/texts/bible/kjv), and
each verse gets the time of its first matched word (verses with no match are interpolated). A chapter
runs from just before its first verse (so "Chapter 3" is heard) to the next chapter's start.

Safe to stop and re-run: finished files are skipped.
  .venv-tts/Scripts/python -u scripts/tts/align-librivox.py [--only 001,002] [--limit N]
"""
import argparse
import difflib
import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / ".cache-audio" / "librivox-kjv"
OUT = ROOT / ".cache-audio" / "kjv" / "armenta"
TEXTS = ROOT / "data" / "texts" / "bible" / "kjv"
CATALOG = json.loads((ROOT / "data" / "catalog.json").read_text(encoding="utf-8"))

# Book name in the LibriVox titles → our book id (Bible, Old + New Testament).
NAMES = {}
for rel in CATALOG["religions"]:
    for col in rel["collections"]:
        if col["id"] in ("ot", "nt"):
            for it in col["items"]:
                NAMES[it["name"].lower()] = it["id"]
NAMES.update({"psalm": "psa", "song of songs": "sng", "song of solomon": "sng"})

TITLE = re.compile(r"^\d+ - (.+?)\s+(?:Ch\.\s*)?(\d+)(?:\s*-\s*(\d+))?$")


def norm(w: str) -> str:
    return re.sub(r"[^a-z0-9]", "", w.lower().replace("’", "'"))


def ref_words(book: str, chapters: range):
    """KJV words of these chapters, each tagged (chapter, verse)."""
    out = []
    for ch in chapters:
        data = json.loads((TEXTS / book / f"{ch}.json").read_text(encoding="utf-8"))
        for x in data["verses"]:
            if not x.get("t"):
                continue
            for w in x["t"].split():
                n = norm(w)
                if n:
                    out.append((n, ch, x["v"]))
    return out


_model = None


def transcribe(mp3: Path):
    cache = SRC / "transcripts" / (mp3.stem + ".json")
    if cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))
    global _model
    if _model is None:
        import whisper

        _model = whisper.load_model("large-v3-turbo", device="cuda")
    r = _model.transcribe(str(mp3), language="en", word_timestamps=True, condition_on_previous_text=False, fp16=True)
    words = [(w["word"], round(w["start"], 3), round(w["end"], 3)) for s in r["segments"] for w in s.get("words", [])]
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(words), encoding="utf-8")
    return words


def duration(mp3: Path) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(mp3)], capture_output=True, text=True)
    return float(out.stdout.strip())


def align(book: str, chapters: range, words):
    """Start time of every verse: {(ch, v): seconds}."""
    ref = ref_words(book, chapters)
    hyp = [norm(w) for w, _, _ in words]
    sm = difflib.SequenceMatcher(a=[r[0] for r in ref], b=hyp, autojunk=False)
    ref_time = [None] * len(ref)
    last_end = 0.0  # end of the last word of the text heard (what follows is "End of section…")
    for blk in sm.get_matching_blocks():
        for k in range(blk.size):
            ref_time[blk.a + k] = words[blk.b + k][1]
            last_end = max(last_end, words[blk.b + k][2])
    # First matched word of each verse; keep the order (times must increase).
    starts = {}
    order = []
    for i, (_, ch, v) in enumerate(ref):
        key = (ch, v)
        if key not in starts:
            starts[key] = None
            order.append((key, i))
        if starts[key] is None and ref_time[i] is not None:
            # Only trust it near the verse's start (first 4 words), else interpolate.
            first = next(j for (k2, j) in order if k2 == key)
            if i - first <= 3:
                starts[key] = ref_time[i] - 0.15 * (i - first)
    times = [starts[k] for k, _ in order]
    # Enforce increasing times; fill gaps linearly by word position.
    last = -1.0
    for i, t in enumerate(times):
        if t is not None and t <= last:
            times[i] = None
        elif t is not None:
            last = t
    known = [i for i, t in enumerate(times) if t is not None]
    if not known:
        raise RuntimeError("nothing matched")
    pos = [j for _, j in order]
    for i in range(len(times)):
        if times[i] is None:
            prev = max((k for k in known if k < i), default=None)
            nxt = min((k for k in known if k > i), default=None)
            if prev is not None and nxt is not None:
                f = (pos[i] - pos[prev]) / max(1, pos[nxt] - pos[prev])
                times[i] = times[prev] + f * (times[nxt] - times[prev])
            elif prev is not None:
                times[i] = times[prev] + 0.4 * (pos[i] - pos[prev])
            else:
                times[i] = max(0.0, times[nxt] - 0.4 * (pos[nxt] - pos[i]))
    matched = sum(1 for t in ref_time if t is not None) / max(1, len(ref))
    return [(k, t) for (k, _), t in zip(order, times)], matched, last_end


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()
    titles = json.loads((SRC / "titles.json").read_text(encoding="utf-8"))
    done = 0
    for name in sorted(titles):
        num = name.split("_")[1]
        if args.only and num not in args.only.split(","):
            continue
        m = TITLE.match(titles[name].strip())
        if not m:
            print("?? title", name, titles[name])
            continue
        book = NAMES.get(m.group(1).strip().lower())
        if not book:
            print("?? book", name, m.group(1))
            continue
        a, b = int(m.group(2)), int(m.group(3) or m.group(2))
        chapters = range(a, b + 1)
        if all((OUT / book / f"{c}.json").exists() for c in chapters):
            continue
        mp3 = SRC / name
        if not mp3.exists():
            print("missing", name)
            continue
        words = transcribe(mp3)
        verses, matched, last_end = align(book, chapters, words)
        total = min(duration(mp3), last_end + 1.2)
        # Chapter spans: from 2.5 s before verse 1 (the "Chapter N" announcement) to the next chapter.
        ch_start = {}
        for (ch, v), t in verses:
            ch_start.setdefault(ch, max(0.0, t - 2.5))
        (OUT / book).mkdir(parents=True, exist_ok=True)
        for c in chapters:
            s = ch_start[c]
            e = ch_start.get(c + 1, total)
            vs = [(v, t) for (ch, v), t in verses if ch == c]
            timing = []
            for i, (v, t) in enumerate(vs):
                end = vs[i + 1][1] if i + 1 < len(vs) else e
                timing.append({"v": v, "s": round(max(0.0, t - s), 3), "e": round(max(0.0, end - s - 0.1), 3)})
            subprocess.run(
                ["ffmpeg", "-loglevel", "error", "-y", "-ss", f"{s:.3f}", "-to", f"{e:.3f}", "-i", str(mp3), "-c:a", "libmp3lame", "-b:a", "64k", "-ac", "1", str(OUT / book / f"{c}.mp3")],
                check=True,
            )
            (OUT / book / f"{c}.json").write_text(
                json.dumps({"version": "kjv", "voice": "armenta", "book": book, "chapter": c, "duration": round(e - s, 3), "verses": timing}),
                encoding="utf-8",
            )
        print(f"{name}: {book} {a}-{b}, {matched:.0%} of words matched", flush=True)
        done += 1
        if args.limit and done >= args.limit:
            break


if __name__ == "__main__":
    sys.exit(main())
