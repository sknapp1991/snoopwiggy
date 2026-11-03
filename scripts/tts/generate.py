"""
Audio v2: pre-generate chapter recordings with Kokoro (Apache-2.0 open-weights TTS) on this PC.

For every chapter: one MP3 (mono) + a timing file with each verse's start/end in seconds, so the
reader can highlight the verse (and, approximately, the word) being read while the audio plays,
even with the phone screen locked.

  .venv-tts/Scripts/python scripts/tts/generate.py --version web --voice af_heart --books gen,jhn --chapters 1
  .venv-tts/Scripts/python scripts/tts/generate.py --version web --voice af_heart            # whole Bible

Output: .cache-audio/<version>/<voice>/<book>/<chapter>.mp3 + .json  (git-ignored; uploaded to R2 later)
Requires ffmpeg on PATH. Spanish/French/Italian/Portuguese voices also need espeak-ng installed.
"""
import argparse
import json
import re
import subprocess
import sys
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
TEXTS = ROOT / "data" / "texts"
OUT = ROOT / ".cache-audio"
RATE = 24000
GAP = 0.45  # seconds of silence between verses

# Kokoro language code by our language code
LANG = {"en": "a", "es": "e", "fr": "f", "it": "i", "pt": "p"}


def clean(text: str) -> str:
    t = re.sub(r"[\[\]{}¶*†‡]", "", text)
    return re.sub(r"\s+", " ", t).strip()


def catalog_books(work: str):
    cat = json.loads((ROOT / "data" / "catalog.json").read_text(encoding="utf8"))
    for r in cat["religions"]:
        for c in r["collections"]:
            for it in c["items"]:
                if it.get("work") == work and it.get("chapters") and it.get("status") != "coming-soon":
                    yield it["id"], it["chapters"]


def version_info(version: str):
    cat = json.loads((ROOT / "data" / "catalog.json").read_text(encoding="utf8"))
    return next(v for v in cat["versions"] if v["id"] == version)


def encode_mp3(samples: np.ndarray, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    pcm = (np.clip(samples, -1, 1) * 32767).astype("<i2").tobytes()
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "s16le", "-ar", str(RATE), "-ac", "1", "-i", "-",
         "-codec:a", "libmp3lame", "-b:a", "40k", str(path)],
        input=pcm, check=True,
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--work", default="bible")
    ap.add_argument("--version", required=True)
    ap.add_argument("--voice", required=True, help="Kokoro voice id, e.g. af_heart, am_michael, ef_dora")
    ap.add_argument("--books", default="", help="comma-separated book ids (default: all)")
    ap.add_argument("--chapters", default="", help="e.g. 1 or 1-3 (default: all)")
    ap.add_argument("--speed", type=float, default=1.0)
    ap.add_argument("--force", action="store_true", help="regenerate existing files")
    a = ap.parse_args()

    from kokoro import KPipeline  # imported late so --help works without the toolchain

    info = version_info(a.version)
    lang = LANG.get(info["language"])
    if not lang:
        sys.exit(f"No Kokoro voices for language {info['language']!r}")
    pipe = KPipeline(lang_code=lang, repo_id="hexgrad/Kokoro-82M")
    want_books = set(filter(None, a.books.split(",")))
    lo, hi = 1, 10_000
    if a.chapters:
        parts = a.chapters.split("-")
        lo, hi = int(parts[0]), int(parts[-1])

    done = 0
    seconds = 0.0
    started = time.time()
    for book, n in catalog_books(a.work):
        if want_books and book not in want_books:
            continue
        for ch in range(max(1, lo), min(n, hi) + 1):
            src = TEXTS / a.work / a.version / book / f"{ch}.json"
            mp3 = OUT / a.version / a.voice / book / f"{ch}.mp3"
            if not src.exists() or (mp3.exists() and not a.force):
                continue
            chapter = json.loads(src.read_text(encoding="utf8"))
            pieces, timing, t = [], [], 0.0
            for verse in chapter["verses"]:
                text = clean(verse.get("t", ""))
                if not text:
                    continue
                audio = [np.asarray(r.audio, dtype=np.float32) for r in pipe(text, voice=a.voice, speed=a.speed) if r.audio is not None]
                if not audio:
                    continue
                clip = np.concatenate(audio)
                dur = len(clip) / RATE
                timing.append({"v": verse["v"], "s": round(t, 3), "e": round(t + dur, 3)})
                pieces.append(clip)
                pieces.append(np.zeros(int(GAP * RATE), dtype=np.float32))
                t += dur + GAP
            if not pieces:
                continue
            encode_mp3(np.concatenate(pieces), mp3)
            meta = {"version": a.version, "voice": a.voice, "book": book, "chapter": ch, "duration": round(t, 3), "verses": timing}
            mp3.with_suffix(".json").write_text(json.dumps(meta), encoding="utf8")
            done += 1
            seconds += t
            rate = seconds / max(1e-6, time.time() - started)
            print(f"{a.version}/{a.voice} {book} {ch}: {t:.0f}s audio  ({rate:.0f}x realtime)", flush=True)
    print(f"done: {done} chapters, {seconds / 3600:.2f} h of audio")


if __name__ == "__main__":
    main()
