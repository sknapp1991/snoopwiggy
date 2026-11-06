"""
Export wordfreq's word-frequency lists (Zipf scale) to plain TSV for scripts/import-words.ts.

  python -m venv .venv-words && .venv-words/Scripts/pip install wordfreq==3.1.1   (once)
  .venv-words/Scripts/python -I scripts/export-wordfreq.py      -> data/raw/words/wordfreq/<lang>.tsv

wordfreq (Robyn Speer) code is Apache-2.0; its data is CC BY-SA 4.0. Only the Zipf value of words that
occur in the site's texts ends up committed (data/words/freq-<lang>.json).
"""
import math
import os
import sys

from wordfreq import get_frequency_dict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "raw", "words", "wordfreq")
LANGS = ["en", "es", "fr", "de", "it", "pt", "ru", "el"]


def main():
    os.makedirs(OUT, exist_ok=True)
    for lang in sys.argv[1:] or LANGS:
        d = get_frequency_dict(lang, wordlist="best")
        with open(os.path.join(OUT, lang + ".tsv"), "w", encoding="utf-8", newline="\n") as f:
            for w, p in d.items():
                if p > 0:
                    f.write("%s\t%.2f\n" % (w, math.log10(p) + 9))
        print(lang, len(d), "words")


main()
