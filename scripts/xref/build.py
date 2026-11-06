"""
Cross references: for every verse, the most similar verses in its own religion and in each other one.

Similarity = cosine of sentence embeddings (BAAI/bge-base-en-v1.5) of one English version per work,
computed here once (GPU if there is one) and shipped as static files; the site does no AI work.

  .venv-tts/Scripts/python.exe scripts/xref/build.py        (after `npm run pack`; ~10 min on a GPU)
      → .cache-xref/<work>/<book>.json   {"<chapter>:<verse>": [["work/book/chapter:verse", score], ...]}
  npx tsx scripts/xref/upload.ts   → R2 (xref/…), served by /api/xref (too big to keep in git)

Rules: the verse's own chapter is skipped; so is the "same" verse in a parallel text (Bible OT ↔
Tanakh, same book and chapter), which would otherwise top every list. Scores are 0–100.
"""
import json
import os
import sys
from collections import defaultdict

import torch
from sentence_transformers import SentenceTransformer

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
TEXTS = os.path.join(ROOT, "public", "texts")
OUT = os.path.join(ROOT, ".cache-xref")
CACHE = os.path.join(ROOT, "data", "raw", "xref-embeddings.pt")
MODEL = "BAAI/bge-base-en-v1.5"

# The English version embedded for each work (modern English where there is one: matches better).
EMBED = {
    "bible": "web", "tanakh": "jps1917", "enoch": "charles", "thomas": "mattison",
    "mishnah": "kulp", "talmud": "davidson", "quran": "pickthall",
    "dhammapada": "sujato", "tipitaka": "sc-en", "gita": "besant", "upanishads": "muller",
    "ramayana": "griffith-ry", "vedas": "griffith", "mahabharata": "ganguli",
    "hyp": "sinh", "yoga-sutras": "johnston",
    "tao-te-ching": "legge-ttc", "analects": "legge-an", "australian": "parker",
    "hidden-words": "bahai-hw", "aqdas": "bahai-aqdas",
    "ggs": "khalsa", "lucretius": "leonard", "meditations": "long", "enchiridion": "higginson",
    "hume-dialogues": "hume", "age-of-reason": "paine",
    "kojiki": "chamberlain", "jaina": "jacobi", "chinese-myths": "werner", "yoruba": "ogumefu",
    "zhuangzi": "giles", "navaho": "matthews", "sioux": "mclaughlin",
    "gathas": "mills", "popol-vuh": "spence",
}
SAME_K = 6  # results kept from the verse's own religion
OTHER_K = 3  # … and from each other religion
MIN_SCORE = 0.55
PARALLEL = {"bible", "tanakh"}


def religions():
    cat = json.load(open(os.path.join(ROOT, "data", "catalog.json"), encoding="utf8"))
    out = {}
    for r in cat["religions"]:
        for col in r["collections"]:
            for it in col["items"]:
                if "work" in it:  # "coming soon" items have no text yet
                    out.setdefault(it["work"], r["id"])
    return out


def load():
    rel = religions()
    refs, texts, rels = [], [], []
    for work, ver in EMBED.items():
        if work not in rel:
            continue
        d = os.path.join(TEXTS, work, ver)
        if not os.path.isdir(d):
            print("missing", d, file=sys.stderr)
            continue
        for f in sorted(os.listdir(d)):
            book = json.load(open(os.path.join(d, f), encoding="utf8"))
            bid = f[:-5]
            for ch, c in book["chapters"].items():
                for x in c["verses"]:
                    t = (x.get("t") or "").strip()
                    if not t or x.get("cont"):
                        continue
                    refs.append((work, bid, int(ch), x["v"]))
                    texts.append(t[:1200])
                    rels.append(rel[work])
    return refs, texts, rels


def main():
    refs, texts, rels = load()
    print(f"{len(refs)} verses")
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    if os.path.exists(CACHE) and torch.load(CACHE)["n"] == len(refs):
        emb = torch.load(CACHE)["emb"].to(dev)
    else:
        model = SentenceTransformer(MODEL, device=dev)
        if dev == "cuda":
            model.half()
        model.max_seq_length = 256
        # Embed shortest-first (less padding per batch), then put back in order.
        order = sorted(range(len(texts)), key=lambda i: len(texts[i]))
        e = model.encode([texts[i] for i in order], batch_size=256, normalize_embeddings=True, convert_to_tensor=True, show_progress_bar=True)
        emb = torch.empty_like(e)
        emb[torch.tensor(order, device=e.device)] = e
        torch.save({"n": len(refs), "emb": emb.float().cpu()}, CACHE)
        emb = emb.to(dev)
    emb = emb.half() if dev == "cuda" else emb.float()

    groups = defaultdict(list)
    for i, r in enumerate(rels):
        groups[r].append(i)
    gidx = {r: torch.tensor(ix, device=dev) for r, ix in groups.items()}

    result = [[] for _ in refs]
    chunk = 2048
    for r, ix in gidx.items():
        target = emb[ix]
        for s in range(0, len(refs), chunk):
            q = emb[s : s + chunk]
            sims = q @ target.T
            k = min(SAME_K + 40, target.shape[0])
            val, pos = sims.topk(k, dim=1)
            val, pos = val.float().cpu().tolist(), ix[pos].cpu().tolist()
            for row in range(len(val)):
                i = s + row
                w, b, c, _ = refs[i]
                want = SAME_K if rels[i] == r else OTHER_K
                got = 0
                for sc, j in zip(val[row], pos[row]):
                    if sc < MIN_SCORE or got >= want:
                        break
                    w2, b2, c2, _ = refs[j]
                    if b2 == b and c2 == c and (w2 == w or (w in PARALLEL and w2 in PARALLEL)):
                        continue  # same chapter, or its parallel in the Bible / Tanakh
                    result[i].append((j, round(sc * 100)))
                    got += 1
        print("done", r)

    files = defaultdict(dict)
    for i, lst in enumerate(result):
        if not lst:
            continue
        w, b, c, v = refs[i]
        lst.sort(key=lambda x: -x[1])
        files[(w, b)][f"{c}:{v}"] = [[f"{refs[j][0]}/{refs[j][1]}/{refs[j][2]}:{refs[j][3]}", sc] for j, sc in lst]
    import shutil

    shutil.rmtree(OUT, ignore_errors=True)
    total = 0
    for (w, b), data in files.items():
        os.makedirs(os.path.join(OUT, w), exist_ok=True)
        p = os.path.join(OUT, w, f"{b}.json")
        with open(p, "w", encoding="utf8") as fh:
            json.dump(data, fh, separators=(",", ":"), ensure_ascii=False)
        total += os.path.getsize(p)
    print(f"{len(files)} files, {total / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
