"""Popol Vuh, Spanish of Francisco Ximenez (ed. C. Scherzer, Vienna 1857).

Stage 1 (default): clean the archive.org OCR of three scans of the 1857 book,
correct words by majority vote across the scans, and write one paragraph per
line to data/raw/popol-vuh/ximenez-paras.txt for checking.

Stage 2 (`write`): split the paragraphs into chapters (Brasseur's 1861
division into four books) and write data/texts/popol-vuh/ximenez/popol-vuh/N.json.

Run:  python -I scripts/ai-translate/popol-vuh-ximenez.py [write]
"""
import difflib
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw" / "popol-vuh"
PARAS = RAW / "ximenez-paras.txt"
FIXES = RAW / "ximenez-fixes.txt"  # optional manual "wrong => right" lines
OUT = ROOT / "data" / "texts" / "popol-vuh" / "ximenez" / "popol-vuh"

COPIES = ["lashistoriasdelo00sche", "lashistoriasdelo00xim", "lashistoriasdelo00ximguat"]
START = "Este  es  el  principio  de  las  antiguas  historias  aquí"
END = "ahora  se  llama  Santa  Cruz."

PAGE_RE = re.compile(r"^\s*\d{1,3}\s*$")
SIG_RE = re.compile(r"^\s*(\d{1,2}\s*\*|[a-z]\*|\*)\s*$")  # printer's signature marks
FOOT_RE = re.compile(r"^\s*\S{0,4}\)\s+\S")
JUNK_RE = re.compile(r"^\s*[^A-Za-zÁÉÍÓÚáéíóúñÑ]{1,4}\s*$")


def region(copy):
    text = (RAW / copy / "djvu.txt").read_text(encoding="utf-8")
    a = text.index(START)
    b = text.index(END, a) + len(END)
    return text[a:b].split("\n")


def blocks(lines):
    """Return list of (text_lines, after_page_break) blocks, footnotes removed."""
    out, cur, in_foot, page_break = [], [], False, False
    for ln in lines:
        if PAGE_RE.match(ln):
            in_foot = False
            if cur:
                out.append((cur, page_break)); cur = []
            page_break = True
            continue
        if in_foot:
            continue
        if FOOT_RE.match(ln) and not ln.strip().startswith("("):
            in_foot = True
            if cur:
                out.append((cur, page_break)); cur = []
            continue
        if SIG_RE.match(ln) or (ln.strip() and JUNK_RE.match(ln)):
            continue
        if not ln.strip():
            if cur:
                out.append((cur, page_break)); cur = []; page_break = False
            continue
        cur.append(ln.strip())
    if cur:
        out.append((cur, page_break))
    return out


def join_lines(ls, vocab):
    s = ""
    for ln in ls:
        ln = re.sub(r"\s+", " ", ln)
        if s.endswith("-") and re.search(r"\S-$", s) and re.match(r"\S", ln):
            head = re.search(r"(\S+)-$", s).group(1)
            tail = re.match(r"(\S+)", ln).group(1)
            h2 = re.sub(r"\W", "", head.split("-")[-1]).lower()
            t2 = re.sub(r"\W", "", tail).lower()
            if (h2 + t2) in vocab or not tail[:1].isupper():
                if (h2 + "-" + t2) in vocab and (h2 + t2) not in vocab:
                    s = s + ln
                else:
                    s = s[:-1] + ln
            else:
                s = s + ln
        else:
            s = (s + " " + ln) if s else ln
    return s


def paragraphs(copy, vocab):
    paras = []
    for ls, pb in blocks(region(copy)):
        t = join_lines(ls, vocab)
        if len(t.strip()) <= 3:
            continue  # stray signature marks such as "r", "6s"
        if paras and (pb or t[:1].islower()):
            prev = paras[-1]
            if t[:1].islower() or not (re.search(r"[.:!?\"”]\s*$", prev) and t[:1].isupper()):
                paras[-1] = join_lines([prev, t], vocab) if prev.endswith("-") else prev + " " + t
                continue
        paras.append(t)
    return paras


def tidy(t):
    t = re.sub(r"\s+([,;:.!?)])", r"\1", t)
    t = re.sub(r"([(¿¡])\s+", r"\1", t)
    t = t.replace("„", "\"").replace("“", "\"").replace("”", "\"")
    t = re.sub(r"\s+", " ", t).strip()
    t = re.sub(r"(\b[A-Z]\w*)\s*-\s+(\w)", r"\1-\2", t)
    t = re.sub(r"(\b[A-Z]\w*)\s+-\s*(\w)", r"\1-\2", t)
    t = re.sub(r"-carne\b", "-came", t)
    return t


def tokens(paras):
    toks = []
    for p in paras:
        toks.extend(p.split(" "))
        toks.append("¶")
    return toks


def bare(t):
    import unicodedata
    t = re.sub(r"[^\w-]", "", t.lower())
    return "".join(c for c in unicodedata.normalize("NFD", t) if unicodedata.category(c) != "Mn")


def vote(base, others, vocab):
    """Majority vote: replace a base token when both other scans agree on another."""
    alts = []
    for o in others:
        m = {}
        sm = difflib.SequenceMatcher(None, base, o, autojunk=False)
        for tag, i1, i2, j1, j2 in sm.get_opcodes():
            if tag == "equal":
                for k in range(i2 - i1):
                    m[i1 + k] = o[j1 + k]
            elif tag == "replace" and (i2 - i1) == (j2 - j1):
                for k in range(i2 - i1):
                    m[i1 + k] = o[j1 + k]
        alts.append(m)
    out, changed = [], []
    for i, t in enumerate(base):
        a, b = alts[0].get(i), alts[1].get(i)
        ok = (t != "¶" and a and a == b and a != t and a != "¶"
              and bare(a) != bare(t)
              and vocab[re.sub(r"[^\w-]", "", a.lower())] > vocab[re.sub(r"[^\w-]", "", t.lower())])
        if ok:
            changed.append((t, a)); out.append(a)
        else:
            out.append(t)
    return out, changed


def stage1():
    vocab = Counter()
    for c in COPIES:
        for w in re.findall(r"[\wáéíóúñü-]+", "\n".join(region(c)).lower()):
            vocab[w] += 1
    allp = [paragraphs(c, vocab) for c in COPIES]
    toks = [tokens(p) for p in allp]
    base, changed = vote(toks[0], toks[1:], vocab)
    text = " ".join(base)
    paras = [tidy(p) for p in text.split("¶") if p.strip()]
    # one entry per line in the closing genealogies
    out = []
    for p in paras:
        if len(p) < 500 and re.search(r"generación|casa grande", p) and not p.startswith("Y "):
            out.extend(x.strip() for x in re.split(r"(?<=\.)\s+(?=[A-Z])|(?<=generación,)\s+(?=[A-Z])", p) if x.strip())
        else:
            out.append(p)
    paras = out
    fixes = []
    if FIXES.exists():
        for ln in FIXES.read_text(encoding="utf-8").splitlines():
            if "=>" in ln:
                a, b = ln.split("=>", 1)
                fixes.append((a.strip(), b.strip()))
    for a, b in fixes:
        n = sum(p.count(a) for p in paras)
        if n == 0:
            print("fix not found:", a)
        paras = [p.replace(a, b) for p in paras]
    PARAS.write_text("\n".join(paras) + "\n", encoding="utf-8")
    print(len(paras), "paragraphs;", len(changed), "voted corrections")
    for a, b in changed[:400]:
        print(f"  {a} -> {b}")


# Chapter openings live in data/raw/popol-vuh/ximenez-chapters.json as
# [{"title": ..., "start": "opening words"}]. The 1857 print has no chapters;
# the openings follow Brasseur de Bourbourg's 1861 division (preamble + four
# books of 9, 14, 10 and 12 chapters). An opening that falls inside a printed
# paragraph splits that paragraph there.
JOIN_NEXT = ["Y ahora diremos la detención y tardanza sobre el cerro"]  # page-break artefact


def stage2():
    paras = PARAS.read_text(encoding="utf-8").splitlines()
    for key in JOIN_NEXT:
        i = next(i for i, p in enumerate(paras) if key in p)
        paras[i:i + 2] = [paras[i] + " " + paras[i + 1]]
    chap = json.loads((RAW / "ximenez-chapters.json").read_text(encoding="utf-8"))
    starts = []
    for c in chap:
        hits = [(i, p.find(c["start"])) for i, p in enumerate(paras) if c["start"] in p]
        if len(hits) != 1 or paras[hits[0][0]].count(c["start"]) != 1:
            raise SystemExit(f"chapter start not unique/found: {c['start']!r} -> {hits}")
        i, pos = hits[0]
        if pos > 0:
            head, tail = paras[i][:pos].rstrip(" ,;"), paras[i][pos:]
            if not head.endswith((".", ":", "!", "?")):
                head += "."
            paras[i:i + 1] = [head, tail[0].upper() + tail[1:]]
            i += 1
        starts.append(i)
    # recompute indexes after all splits
    starts = []
    for c in chap:
        key = c["start"][0].upper() + c["start"][1:]
        starts.append(next(i for i, p in enumerate(paras) if p.startswith(key)))
    assert starts == sorted(starts) and starts[0] == 0, starts
    OUT.mkdir(parents=True, exist_ok=True)
    for n, c in enumerate(chap, 1):
        a = starts[n - 1]
        b = starts[n] if n < len(chap) else len(paras)
        head = {"work": "popol-vuh", "version": "ximenez", "book": "popol-vuh", "chapter": n, "title": c["title"]}
        lines = [json.dumps(head, ensure_ascii=False, separators=(",", ":"))[:-1] + ',"verses":[']
        vs = [json.dumps({"v": str(k), "t": p}, ensure_ascii=False, separators=(",", ":")) for k, p in enumerate(paras[a:b], 1)]
        lines.append(",\n".join(vs))
        lines.append("]}")
        (OUT / f"{n}.json").write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
        print(n, c["title"], b - a)


def write_en(n):
    """English (version ai-popol): data/raw/popol-vuh/ai-en/N.txt, one verse per
    non-empty line, must match the Spanish chapter's verse count."""
    chap = json.loads((RAW / "ximenez-chapters.json").read_text(encoding="utf-8"))
    es = (OUT / f"{n}.json").read_text(encoding="utf-8").splitlines()
    n_es = sum(1 for ln in es if ln.startswith('{"v":'))
    src = RAW / "ai-en" / f"{n}.txt"
    verses = [ln.strip() for ln in src.read_text(encoding="utf-8").splitlines() if ln.strip()]
    if len(verses) != n_es:
        raise SystemExit(f"chapter {n}: {len(verses)} English verses, {n_es} Spanish")
    dest = ROOT / "data" / "texts" / "popol-vuh" / "ai-popol" / "popol-vuh"
    dest.mkdir(parents=True, exist_ok=True)
    head = {"work": "popol-vuh", "version": "ai-popol", "book": "popol-vuh", "chapter": n, "title": chap[n - 1]["en"]}
    lines = [json.dumps(head, ensure_ascii=False, separators=(",", ":"))[:-1] + ',"verses":[']
    lines.append(",\n".join(json.dumps({"v": str(k), "t": t}, ensure_ascii=False, separators=(",", ":")) for k, t in enumerate(verses, 1)))
    lines.append("]}")
    (dest / f"{n}.json").write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
    print("wrote English chapter", n, len(verses), "verses")


if __name__ == "__main__":
    if sys.argv[1:2] == ["en"]:
        for a in sys.argv[2:]:
            write_en(int(a))
    elif sys.argv[1:] == ["write"]:
        stage2()
    else:
        stage1()
