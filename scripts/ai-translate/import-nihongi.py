"""Import W. G. Aston's "Nihongi: Chronicles of Japan from the Earliest Times
to A.D. 697" (Transactions and Proceedings of the Japan Society, London,
Supplement I, 1896, 2 vols.) from the proofread English Wikisource
transcription (Page: namespace of "Nihongi by Aston.djvu" and
"Nihongi by Aston volume 2.djvu").

Raw page wikitext is fetched into data/raw/nihongi/pages/ (v1_NNNN.txt,
v2_NNNN.txt) with the Wikisource API (see fetch step below).

Cleaning: page headers/footers (<noinclude>), Aston's footnotes (<ref>),
the green marginal references to the Japanese text "(I. 2.)", illustrations
and their captions are dropped.  Marginal B.C./A.D. year notes are put at the
start of their paragraph as "(A.D. 540)".  Poem lines are joined with " / ".
Book headings become the chapter title; emperor headings inside a book are
kept as short verses.

Output: data/texts/nihongi/aston/nihongi/<book>.json, one paragraph per verse.

Usage:  python -I scripts/ai-translate/import-nihongi.py [--fetch] [--force]
"""
import json, os, re, sys, time, urllib.parse, urllib.request, urllib.error

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RAW = os.path.join(ROOT, "data", "raw", "nihongi", "pages")
OUT = os.path.join(ROOT, "data", "texts", "nihongi", "aston", "nihongi")

V1, V2 = "Nihongi_by_Aston.djvu", "Nihongi_by_Aston_volume_2.djvu"
# Book -> (volume tag, first page, last page) from the Wikisource Book pages.
BOOKS = [
    ("v1", 32, 94), ("v1", 95, 139), ("v1", 140, 168), ("v1", 169, 180),
    ("v1", 181, 195), ("v1", 196, 218), ("v1", 219, 247), ("v1", 248, 254),
    ("v1", 255, 284), ("v1", 285, 302), ("v1", 303, 331), ("v1", 332, 342),
    ("v1", 343, 363), ("v1", 364, 403), ("v1", 404, 429), ("v1", 430, 439),
    ("v2", 8, 32), ("v2", 33, 42), ("v2", 43, 96), ("v2", 97, 112),
    ("v2", 113, 127), ("v2", 128, 163), ("v2", 164, 177), ("v2", 178, 201),
    ("v2", 202, 254), ("v2", 255, 280), ("v2", 281, 307), ("v2", 308, 327),
    ("v2", 328, 388), ("v2", 389, 430),
]
ROMAN = "I II III IV V VI VII VIII IX X XI XII XIII XIV XV XVI XVII XVIII XIX XX XXI XXII XXIII XXIV XXV XXVI XXVII XXVIII XXIX XXX".split()

TITLES = {  # Aston's own book headings, lightly normalised
    1: "The Age of the Gods (Part I)",
    2: "The Age of the Gods (Part II)",
}

# Misprints / transcription slips in the Wikisource text, and two songs where
# Aston prints alternative words one above the other inside a brace.
FIXES = [
    ("belonking", "belonging"),
    ("endearour", "endeavour"),
    ("governthe", "govern the"),
    ("respecttul", "respectful"),
    ("separatte", "separate"),
    ("simultanously", "simultaneously"),
    ("The Empdror", "The Emperor"),
    ("ancestor of tile Yata-be", "ancestor of the Yata-be"),
    ("province of Kiĭ,", "province of Kii,"),
    ("Postemo cupiebant", "Postremo cupiebant"),
    ("(A.D. 696) l0th year", "(A.D. 696) 10th year"),
    ("In the high castle of Uda / tree /", "In the high castle (tree) of Uda /"),
    ("The far-extending moor! / bell /", "The far-extending moor! (bell) /"),
]

PARA = "\n\n"
DATE_OPEN, DATE_CLOSE = "\x01", "\x02"
HEAD_OPEN, HEAD_CLOSE = "\x03", "\x04"


def fetch():
    os.makedirs(RAW, exist_ok=True)
    ua = "VersesAcrossImporter/1.0 (personal project; python urllib)"
    jobs = [(V1, "v1", 32, 439), (V2, "v2", 8, 430)]
    for idx, tag, a, b in jobs:
        nums = [n for n in range(a, b + 1) if not os.path.exists(f"{RAW}/{tag}_{n:04d}.txt")]
        for i in range(0, len(nums), 50):
            chunk = nums[i:i + 50]
            q = urllib.parse.urlencode({"action": "query", "prop": "revisions", "rvprop": "content",
                                        "rvslots": "main", "format": "json", "formatversion": "2",
                                        "titles": "|".join(f"Page:{idx}/{n}" for n in chunk)})
            req = urllib.request.Request("https://en.wikisource.org/w/api.php?" + q, headers={"User-Agent": ua})
            for _ in range(10):
                try:
                    d = json.load(urllib.request.urlopen(req)); break
                except urllib.error.HTTPError as e:
                    if e.code != 429:
                        raise
                    time.sleep(60)
            for p in d["query"]["pages"]:
                n = int(p["title"].rsplit("/", 1)[1])
                if "revisions" in p:
                    with open(f"{RAW}/{tag}_{n:04d}.txt", "w", encoding="utf-8") as f:
                        f.write(p["revisions"][0]["slots"]["main"]["content"])
            time.sleep(8)


# ---------------------------------------------------------------- templates
def split_args(body):
    """Split template body on top-level '|' (ignoring nested {{ }} and [[ ]])."""
    args, depth, cur, i = [], 0, [], 0
    while i < len(body):
        two = body[i:i + 2]
        if two in ("{{", "[["):
            depth += 1; cur.append(two); i += 2; continue
        if two in ("}}", "]]") and depth:
            depth -= 1; cur.append(two); i += 2; continue
        if body[i] == "|" and depth == 0:
            args.append("".join(cur)); cur = []; i += 1; continue
        cur.append(body[i]); i += 1
    args.append("".join(cur))
    return args


def positional(args):
    return [a for a in args[1:] if not re.match(r"^\s*[\w-]+\s*=", a)]


def named(args, key):
    for a in args[1:]:
        m = re.match(r"^\s*([\w-]+)\s*=(.*)$", a, re.S)
        if m and m.group(1) == key:
            return m.group(2)
    return None


def poem(text):
    text = text.replace("<br />", "\n").replace("<br/>", "\n").replace("<br>", "\n").replace("</br>", "\n")
    lines = [l.strip().lstrip(":").strip() for l in text.split("\n")]
    lines = [l for l in lines if l]
    return PARA + " / ".join(lines) + PARA


def render(name, args):
    n = name.strip()
    low = n.lower()
    pos = positional(args)
    p = lambda i: expand(pos[i]) if len(pos) > i else ""
    if low == "marginnote":
        t = expand(named(args, "text") or "")
        t = t.replace("\xa0", " ").replace("&nbsp;", " ").strip()
        if re.fullmatch(r"\([IVXL]+\.\s*\d+\.?\)", t) or not t:
            return ""
        m = re.fullmatch(r"((?:B\.C\.|A\.D\.)\s*\d+)\.?\)?", t)
        if m:
            return DATE_OPEN + m.group(1) + DATE_CLOSE
        print("  ?? margin note:", repr(t))
        return ""
    if low == "color":
        return p(1)
    if low in ("sc", "asc", "larger", "smaller", "x-larger", "xx-larger", "sp", "fine", "lang", "japanese",
               "polytonic", "la", "em", "nowrap", "uc", "lc", "x-smaller", "x-smaller block", "fine block",
               "float right", "border", "center", "quote", "blockquote"):
        if low == "lang":
            return p(1)
        if low == "em":
            return " "
        return p(0)
    if low in ("c", "bc", "block center", "center block", "right"):
        raw = pos[0] if pos else ""
        if re.search(r"\[\[(File|Image):", raw):
            return "\x06"  # illustration and its caption
        inner = p(0)
        if "<poem>" in inner or low == "right":
            return PARA + inner + PARA
        if not re.search(r"[A-Za-z]", inner):
            return "\n" + inner + "\n"
        if re.fullmatch(r"\s*[IVX]+\.\s*", inner):
            return PARA + "\x05" + inner.strip() + PARA  # numbered song
        parts = [x.strip() for x in re.split(r"\n\s*\n", inner) if x.strip()]
        return PARA + PARA.join(HEAD_OPEN + x + HEAD_CLOSE for x in parts) + PARA
    if low in ("o s", "sm", "tooltip", "nowrap"):
        return p(0)
    if low == "ditto":
        return p(1) if len(pos) > 1 else p(0)
    if low == "bar":
        return "——"
    if low in ("nop", "parabr", "pbr", "dhr", "ppb", "rule", "quote/s", "quote/e", "block center/s",
               "block center/e", "center block/s", "center block/e", "fine block/s", "fine block/e",
               "div col", "div col end", "smallrefs", "blockref", "pb", "nopt"):
        return PARA
    if low == "hws":
        return p(1)
    if low == "hwe":
        return ""
    if low == "gap":
        return " "
    if low in ("*", "***"):
        return "* * *"
    if low == "fqm":
        return '"'
    if low == "sic":
        return p(1) if len(pos) > 1 else p(0)
    if low == "ppoem":
        return poem(p(0))
    if low in ("brace table parameters", "brace2", "brace3", "img float", "img_float", "wsp1", "wsp"):
        return ""
    print("  ?? template:", n, args[1:][:2])
    return p(0)


def expand(s):
    out, i = [], 0
    while True:
        j = s.find("{{", i)
        if j < 0:
            out.append(s[i:]); break
        out.append(s[i:j])
        depth, k = 0, j
        while k < len(s):
            if s.startswith("{{", k):
                depth += 1; k += 2
            elif s.startswith("}}", k):
                depth -= 1; k += 2
                if depth == 0:
                    break
            else:
                k += 1
        body = s[j + 2:k - 2]
        args = split_args(body)
        out.append(render(args[0], args))
        i = k
    return "".join(out)


def links(s):
    s = re.sub(r"\[\[(?:File|Image):(?:[^\[\]]|\[\[[^\]]*\]\])*\]\]", "", s)
    s = re.sub(r"\[\[[^\]|]*\|([^\]]*)\]\]", r"\1", s)
    s = re.sub(r"\[\[([^\]]*)\]\]", r"\1", s)
    return s


def table(s):
    """Wikitables in this book lay out songs and lists of ranks."""
    def conv(m):
        body = m.group(0)
        body = re.sub(r"^\{\|.*$", "", body, count=1, flags=re.M)
        body = re.sub(r"\n\|\}$", "", body)
        rows = []
        for row in re.split(r"\n\|-[^\n]*", body):
            cells = []
            for line in row.split("\n"):
                line = line.strip()
                if not line.startswith("|"):
                    if line and cells:
                        cells[-1] += " " + line
                    continue
                for c in line[1:].split("||"):
                    c = re.sub(r"^\s*(?:colspan|rowspan|style|align|valign|width)\s*=[^|]*\|", "", c)
                    c = c.replace("&nbsp;", " ").replace("&emsp;", " ").replace("{{wsp1}}", " ").strip()
                    if c and re.search(r"[^\s.]", c):
                        cells.append(c)
            if cells:
                rows.append(" ".join(cells))
        return "<poem>" + "\n".join(rows) + "</poem>"
    return re.sub(r"^\{\|.*?\n\|\}", conv, s, flags=re.S | re.M)


def clean_page(s):
    s = re.sub(r"<noinclude>.*?</noinclude>", "", s, flags=re.S)
    s = re.sub(r"<ref[^>]*/>", "", s)
    s = re.sub(r"<ref[^>]*>.*?</ref>", "", s, flags=re.S)
    s = re.sub(r"<!--.*?-->", "", s, flags=re.S)
    return s


def page_text(tag, n):
    with open(f"{RAW}/{tag}_{n:04d}.txt", encoding="utf-8") as f:
        return clean_page(f.read())


def book_paragraphs(tag, a, b):
    joined = ""
    for n in range(a, b + 1):
        s = page_text(tag, n)
        if not s.strip():
            continue
        if not joined:
            joined = s.strip()
            continue
        # hws/hwe pairs across pages are joined with nothing
        if re.search(r"\{\{hws\|[^{}]*\}\}\s*$", joined):
            joined = joined.rstrip() + s.lstrip()
        else:
            joined = joined.rstrip() + " " + s.lstrip()
    s = joined
    s = re.sub(r"<div[^>]*>", PARA + "{{c|", s)
    s = s.replace("</div>", "}}" + PARA)
    s = table(s)
    s = expand(s)
    s = re.sub(r"[ \t]*\n?[ \t]*\x06[ \t]*\n?[ \t]*", " ", s)
    s = links(s)
    s = re.sub(r"<poem>(.*?)</poem>", lambda m: poem(m.group(1)), s, flags=re.S)
    s = s.replace("&nbsp;", " ").replace("&lowast;", "*").replace("&#124;", "|").replace("\xa0", " ")
    s = s.replace("&mdash;", "—").replace("&ndash;", "–").replace("&amp;", "&")
    s = re.sub(r"'''?", "", s)
    s = re.sub(r"<[^>]+>", "", s)
    paras = []
    for chunk in re.split(r"\n\s*\n", s):
        t = re.sub(r"\s+", " ", chunk).strip()
        if t:
            paras.append(t)
    return paras


def titlecase(s):
    words = s.split(" ")
    out = []
    for i, w in enumerate(words):
        lw = w.lower()
        if i and lw in ("no", "of", "the", "and", "or"):
            out.append(lw)
        else:
            out.append(lw[:1].upper() + lw[1:])
    return " ".join(out)


def tidy_heading(h):
    h = h.replace(HEAD_OPEN, " ").replace(HEAD_CLOSE, " ")
    h = re.sub(r"\s+", " ", h).strip()
    return h


def heading_text(group):
    """['THE EMPEROR SHIKI-TSU-HIKO-TAMA-DEMI.', '(ANNEI TENNŌ.)'] -> 'The Emperor Shiki-tsu-hiko-tama-demi (Annei Tennō)'"""
    h = " ".join(x for x in group if not re.match(r"(BOOK [IVXL]+|N ?I ?H ?O ?N ?G ?I)\.?$", x))
    h = h.replace("EMPREROR", "EMPEROR").strip()
    if not h:
        return ""
    m = re.match(r"(.*)\s*\((.*?)\.?\)?\s*$", h)
    name, paren = (m.group(1).strip().rstrip("."), m.group(2)) if m else (h, None)
    fix = lambda x: titlecase(x.strip().rstrip(".")) if len(re.findall(r"[A-Z]", x)) > len(re.findall(r"[a-z]", x)) else x.strip().rstrip(".")
    name = fix(name).replace(".—part", " — Part").replace("Part Ii", "Part II")
    return name + (" (" + fix(paren) + ")" if paren else "")


def build(bk):
    tag, a, b = BOOKS[bk - 1]
    paras = book_paragraphs(tag, a, b)
    verses, groups, cur = [], [], None
    pending_date = None
    pending_num = None
    for t in paras + [""]:
        if HEAD_OPEN in t:
            h = tidy_heading(t)
            if h.startswith("THE END") or h.startswith("LONDON") or h.startswith("PRINTED"):
                continue
            if cur is None:
                cur = []
            cur.append(h)
            continue
        if cur is not None:
            groups.append(cur)
            ht = heading_text(cur)
            if ht and not ht.startswith("The Age of the Gods"):
                verses.append(ht)
            cur = None
        if not t:
            continue
        if t.startswith("\x05"):
            pending_num = t[1:].strip()
            continue
        # year marginal notes -> "(A.D. 540) " at the start of the paragraph
        dates = re.findall(DATE_OPEN + "(.*?)" + DATE_CLOSE, t)
        t = re.sub(DATE_OPEN + ".*?" + DATE_CLOSE, "", t)
        t = re.sub(r"\s+", " ", t).strip()
        if pending_date:
            dates = [pending_date] + dates; pending_date = None
        if not t:
            if dates:
                pending_date = dates[-1]
            continue
        if pending_num:
            t = pending_num + " " + t; pending_num = None
        if dates:
            t = "(" + " / ".join(dict.fromkeys(dates)) + ") " + t
        verses.append(t)
    fixed = []
    for t in verses:
        for a, b in FIXES:
            t = t.replace(a, b)
        fixed.append(t)
    return fixed, groups


def main():
    if "--fetch" in sys.argv:
        fetch()
    global OUT
    if "--out" in sys.argv:
        OUT = sys.argv[sys.argv.index("--out") + 1]
    force = "--force" in sys.argv
    only = [int(x) for x in sys.argv[1:] if x.isdigit()]
    os.makedirs(OUT, exist_ok=True)
    for bk in range(1, 31):
        if only and bk not in only:
            continue
        path = os.path.join(OUT, f"{bk}.json")
        if os.path.exists(path) and not force:
            continue
        verses, heads = build(bk)
        title = f"Book {ROMAN[bk - 1]} — " + TITLES.get(bk, chapter_title(bk, heads, verses))
        lines = [json.dumps({"work": "nihongi", "version": "aston", "book": "nihongi", "chapter": bk,
                             "title": title}, ensure_ascii=False, separators=(",", ":"))[:-1] + ',"verses":[']
        vs = [json.dumps({"v": str(i + 1), "t": v}, ensure_ascii=False, separators=(",", ":")) for i, v in enumerate(verses)]
        body = "\n".join(lines) + "\n" + ",\n".join(vs) + "\n]}\n"
        json.loads(body)
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            f.write(body)
        print(bk, title, len(verses))


TITLES.update({
    3: "Jimmu Tennō", 4: "Suizei to Kaikwa Tennō", 5: "Sūjin Tennō", 6: "Suinin Tennō",
    7: "Keikō and Seimu Tennō", 8: "Chiuai Tennō", 9: "Jingō Kōgu", 10: "Ōjin Tennō",
    11: "Nintoku Tennō", 12: "Richiu and Hanzei Tennō", 13: "Ingiō and Ankō Tennō",
    14: "Yūriaku Tennō", 15: "Seinei, Kenzō and Ninken Tennō", 16: "Muretsu Tennō",
    17: "Keidai Tennō", 18: "Ankan and Senkwa Tennō", 19: "Kimmei Tennō", 20: "Bidatsu Tennō",
    21: "Yōmei and Sujun Tennō", 22: "Suiko Tennō", 23: "Jomei Tennō", 24: "Kōgyoku Tennō",
    25: "Kōtoku Tennō", 26: "Saimei Tennō", 27: "Tenchi Tennō", 28: "Temmu Tennō (Part I)",
    29: "Temmu Tennō (Part II)", 30: "Jitō Tennō",
})


def chapter_title(bk, groups, verses):
    return " / ".join(heading_text(g) for g in groups)


if __name__ == "__main__":
    main()
