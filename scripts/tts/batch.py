"""
Generate a batch of recordings, most-read books first, so the Psalms and Gospels are ready early.
Safe to stop and re-run: finished chapters are skipped.

  .venv-tts/Scripts/python scripts/tts/batch.py            # the first batch below
  .venv-tts/Scripts/python scripts/tts/batch.py --only web/af_heart
"""
import argparse
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
PY = sys.executable

# (version, voice, extra args). Agreed first batch, Nov 2026.
BATCH = [
    ("web", "af_heart", []),
    ("web", "am_michael", []),
    ("kjv", "bf_emma", []),
    ("kjv", "bm_george", []),
    ("rvr1909", "ef_dora", []),
    ("lsg1910", "ff_siwis", []),
    ("riveduta", "if_sara", []),
    ("blivre", "pf_dora", []),
    ("greek", "piper:el_GR-rapunzelina-medium", []),
    ("vulgate", "if_sara", ["--lang", "it"]),
]

PRIORITY = ["psa", "jhn", "mat", "mrk", "luk", "gen", "pro", "rom", "act", "isa", "exo", "heb", "1co", "eph", "rev"]


def run(version, voice, extra, books=""):
    cmd = [PY, str(HERE / "generate.py"), "--version", version, "--voice", voice, *extra]
    if books:
        cmd += ["--books", books]
    subprocess.run(cmd, check=False)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="", help="version/voice, e.g. web/af_heart")
    a = ap.parse_args()
    jobs = [j for j in BATCH if not a.only or f"{j[0]}/{j[1]}" == a.only]
    for version, voice, extra in jobs:  # pass 1: popular books for every voice
        run(version, voice, extra, ",".join(PRIORITY))
    for version, voice, extra in jobs:  # pass 2: everything else
        run(version, voice, extra)
    subprocess.run(["npx", "tsx", str(HERE / "catalog.ts")], check=False, shell=True)


if __name__ == "__main__":
    main()
