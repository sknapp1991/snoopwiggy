"""Import the SBE Zend-Avesta (Darmesteter / Mills) from the sacred-texts-derived EPUB
on archive.org (item complete-SBE-avesta-three-volumes-in-one, unzipped to
data/raw/vendidad/sbe-epub/x). Keeps the translators' wording; drops introductions,
commentary (small type), footnotes, footnote markers and page markers.

Usage: python -I scripts/ai-translate/import-avesta-sbe.py <epub-dir> <repo-root> [dump]
"""
import sys, os, re, json, html
from html.parser import HTMLParser

class P(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.items = []  # (kind, text, small)
        self.cur = None; self.small = 0; self.skip = 0; self.stack = []
        self.hd = None; self.intd = False
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'font':
            sz = a.get('size', '')
            if (a.get('color') or '').lower() == 'green' and sz == '-1': sz = ''
            s = sz in ('-1', '-2') or (sz == '1')
            self.stack.append(s)
            if s: self.small += 1
            if sz in ('1', '-2'): self.skip += 1
            self.stack[-1] = (s, sz in ('1', '-2'))
        elif tag == 'span' and a.get('class') == 'contnote':
            self.skip += 1; self.stack.append(('span',))
        elif tag == 'p' or tag == 'td':
            if self.cur is not None: self.flush()
            self.cur = ['', 0]
            if tag == 'td': self.intd = True
        elif tag in ('h1', 'h2', 'h3', 'h4'):
            if self.cur is not None: self.flush()
            self.hd = ''
        elif tag == 'br':
            if self.cur is not None: self.cur[0] += ' '
    def handle_endtag(self, tag):
        if tag == 'font' and self.stack:
            s = self.stack.pop()
            if s and s[0] is not None and len(s) == 2:
                if s[0]: self.small -= 1
                if s[1]: self.skip -= 1
        elif tag == 'span' and self.stack and self.stack[-1] == ('span',):
            self.stack.pop(); self.skip -= 1
        elif tag in ('p', 'td'):
            if self.cur is not None: self.flush()
            if tag == 'td': self.intd = False
        elif tag in ('h1', 'h2', 'h3', 'h4') and self.hd is not None:
            self.items.append(('h', norm(self.hd), False)); self.hd = None
    def handle_data(self, d):
        if self.hd is not None: self.hd += d; return
        if self.skip: return
        if self.cur is None: self.cur = ['', 0]
        if self.small and re.fullmatch(r'[A-Z]', d): d = d.lower()   # small-capital transliteration letter
        if self.small: self.cur[1] += len(d.strip())
        self.cur[0] += d
    def flush(self):
        t = norm(self.cur[0])
        if t: self.items.append(('t' if self.intd else 'p', t, self.cur[1] > 0.5 * len(t.replace(' ', ''))))
        self.cur = None

def norm(s):
    s = s.replace(' ', ' ')
    s = re.sub(r'\s+', ' ', s).strip()
    return s

def parse(path):
    t = open(path, encoding='utf8').read()
    t = re.split(r'<h3[^>]*>\s*Footnotes', t, flags=re.I)[0]
    t = re.sub(r'<a href="#fn_[^"]*">.*?</a>', '', t, flags=re.S)   # footnote markers
    t = re.sub(r'<a name="page_[^"]*">.*?</a>', '', t, flags=re.S)   # page markers
    t = re.sub(r'<head>.*?</head>', '', t, flags=re.S)
    p = P(); p.feed(t); p.close()
    if p.cur is not None: p.flush()
    return p.items

TD = []
NUM = re.compile(r'^(\[\s*)?(\d+)((?:\s*[,\-–]\s*\d+)?)\s*(\([\d\s,\-–a-z]*\))?\s*([.,])?\s+(.+)$')
FIXES = {   # file -> [(old paragraph prefix, new prefix)]: paragraph-number slips in the source
    'sbe04/sbe0409.htm': [('6 (55).', '16 (55).')],
    'sbe04/sbe0410.htm': [('57 (99).', '37 (99).'), ('53 052).', '53 (152).')],
    'sbe04/sbe0411.htm': [('43 030.', '43 (130).'), ('40 (139).', '46 (139).')],
    'sbe04/sbe0412.htm': [('40 (85).', '43 (85).')],
    'sbe04/sbe0413.htm': [('70 O 72).', '70 (172).')],
    'sbe04/sbe0414.htm': [('22.(63).', '22 (63).')],
    'sbe04/sbe0418.htm': [('(9). If one', '3 (9). If one')],
    'sbe04/sbe0421.htm': [('413 (117).', '43 (117).')],
    'sbe04/sbe0424.htm': [('6 3 (12 5).', '63 (125).')],
    'sbe31/sbe31032.htm': [('11. Let the Demon-gods', '1. Let the Demon-gods')],
    'sbe31/sbe31039.htm': [('1-10 , 11.', '11.')],
    'sbe23/sbe2307.htm': [('6 We sacrifice', '6. We sacrifice')],
    'sbe23/sbe2320.htm': [('496. Invoke', '49. Invoke')],
}
PRELUDE = []

def verses(items, start_pred=None, stop_pred=None, fixes=()):
    out = []; pre = []; started = start_pred is None
    for kind, t, small in items:
        if not started:
            if start_pred(kind, t): started = True
            continue
        if stop_pred and stop_pred(kind, t): break
        if kind != 'p' or small:
            if kind == 't' and out and not small: TD.append(t)
            continue
        for a, b in fixes:
            if t.startswith(a): t = b + t[len(a):]
        m = NUM.match(t)
        if m and (m.group(4) or m.group(5)):
            v = m.group(2) + ('a' if m.group(4) and 'bis' in m.group(4) else '')
            out.append([v, (m.group(1) or '').strip() + m.group(6)])
            if m.group(3): COMBINED.append(m.group(2) + m.group(3))
        elif out:
            out[-1][1] = out[-1][1] + ' ' + t
        elif not re.fullmatch(r'[_\s]+', t):
            pre.append(t)
    if pre and out:
        PRELUDE.append(' '.join(pre))
        out[0][1] = ' '.join(pre) + ' ' + out[0][1]
    return out

COMBINED = []

def clean(t):
    t = re.sub(r'\s+', ' ', t).strip()
    t = re.sub(r'^\(\d+\)\.\s*', '', t)   # stray older (Spiegel) paragraph number
    t = re.sub(r'\s+([,.;:!?\)])', r'\1', t)
    t = re.sub(r'\(\s+', '(', t)
    return t

def write(root, work, ver, book, ch, title, vs, note=None):
    d = os.path.join(root, 'data', 'texts', work, ver, book); os.makedirs(d, exist_ok=True)
    head = {"work": work, "version": ver, "book": book, "chapter": ch, "title": title}
    if note: head["note"] = note
    h = json.dumps(head, ensure_ascii=False, separators=(",", ":"))[:-1] + ',"verses":['
    lines = [json.dumps({"v": str(v), "t": clean(t)}, ensure_ascii=False, separators=(",", ":")) for v, t in vs]
    with open(os.path.join(d, f'{ch}.json'), 'w', encoding='utf8', newline='\n') as f:
        f.write(h + '\n' + ',\n'.join(lines) + '\n]}\n')

VENDIDAD_TITLES = [
    "An Enumeration of Sixteen Lands Created by Ahura Mazda, and of as Many Plagues Created in Opposition by Angra Mainyu",
    "Myths of Yima",
    "The Earth",
    "Contracts and Outrages",
    "Defilement by the Dead; the Dakhmas; the Still-born Child",
    "How Long the Earth Remains Unclean; Purification of Waters and of the Haoma",
    "The Nasu; Cleansing of Clothes, Wood and Vessels; Physicians",
    "Funerals and Purification; the Bahrâm Fire",
    "The Nine Nights' Barashnûm",
    "Spells Recited during the Process of the Cleansing",
    "Special Spells for the Cleansing of the Several Objects",
    "The Upaman: How Long It Lasts for Different Relatives",
    "The Dog",
    "The Atonement for the Murder of a Water Dog",
    "Sins that Make a Peshôtanu; Unlawful Unions; the Care of Dogs",
    "The Uncleanness of Women",
    "Hair and Nails",
    "The Unworthy Priest; the Holiness of the Cock; the Four Paramours of the Drug",
    "Angra Mainyu Tempts Zarathustra; Ahura Mazda Reveals the Law",
    "Thrita and the Origin of Medicine",
    "Waters and Light",
    "Angra Mainyu Creates 99,999 Diseases: Ahura Mazda Applies for Healing to the Holy Word and to Airyaman",
]
ROMAN = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV','XV','XVI','XVII','XVIII','XIX','XX','XXI','XXII','XXIII','XXIV']

def do_vendidad(src, root):
    for i in range(22):
        f = f'sbe04/sbe04{i + 7:02d}.htm'
        vs = verses(parse(os.path.join(src, f)), fixes=FIXES.get(f, ()))
        write(root, 'vendidad', 'darmesteter', 'vendidad', i + 1, f'Fargard {ROMAN[i]} — {VENDIDAD_TITLES[i]}', vs)
        print(f, i + 1, len(vs))

MARK = re.compile(r'(?:^|(?<=\s))(\d+)(?:\s*[-,]\s*(\d+))?\s*\.(?=\s)|\((\d+)\.?\)|(?:^|(?<=\s))(\d+)\s*-\s*(\d+)(?=\s*\()')

def verses_inline(items, fixes=()):
    """Mills prints several numbered sections in one paragraph: '... 10. May a herd ...' or '... (25) for ...'."""
    body = []
    for kind, t, small in items:
        if kind != 'p' or small or re.fullmatch(r'[_\s]+', t): continue
        for a, b in fixes:
            if t.startswith(a): t = b + t[len(a):]
        body.append(t)
    text = ' '.join(body)
    out = []; last = 0; pos = 0; pre = ''
    for m in MARK.finditer(text):
        n = int(m.group(1) or m.group(3) or m.group(4)); hi = int(m.group(2) or m.group(5) or n)
        if not (last < n <= last + 25): continue
        if re.search(r'[IVXL]+,\s*$', text[max(0, m.start() - 12):m.start()]): continue   # 'Y. XV, 2.' reference
        seg = text[pos:m.start()]
        if out: out[-1][1] += seg
        else: pre = seg
        out.append([str(n), '']); last = hi; pos = m.end()
    if out: out[-1][1] += text[pos:]
    out = [[v, t.strip()] for v, t in out]
    out = [x for x in out if re.search(r'\w', x[1])]
    if pre.strip() and out and re.search(r'[a-z]', pre):
        PRELUDE.append(pre.strip()); out[0][1] = pre.strip() + ' ' + out[0][1]
    return out

YASHT_TITLES = [
    "Ormazd Yast", "Haptân Yast", "Ardibehist Yast", "Khordâd Yast", "Âbân Yast",
    "Khôrshêd Yast (Yast to the Sun)", "Mâh Yast (Yast to the Moon)", "Tîr Yast", "Gôs Yast", "Mihir Yast",
    "Srôsh Yast Hâdhôkht", "Rashn Yast", "Farvardîn Yast", "Bahrâm Yast", "Râm Yast",
    "Dîn Yast", "Ashi Yast", "Âstâd Yast", "Zamyâd Yast", "Vanant Yast",
    "Yast Fragment", "Yast XXII (The Fate of the Soul after Death)", "Âfrîn Paighambar Zartûst", "Vîstâsp Yast",
]

def do_yashts(src, root):
    for i in range(24):
        f = f'sbe23/sbe23{i + 6:02d}.htm'
        vs = verses(parse(os.path.join(src, f)), fixes=FIXES.get(f, ()))
        write(root, 'yashts', 'darmesteter', 'yashts', i + 1, f'Yasht {ROMAN[i]} — {YASHT_TITLES[i]}', vs)
        print(f, i + 1, len(vs))

def title_case(h):
    small = {'and', 'or', 'of', 'the', 'to', 'for', 'in', 'on', 'with', 'by', 'as', 'a', 'an', 'its', 'their', 'at', 'from', 'upon', 'is', 'his'}
    words = h.lower().split(' ')
    out = []
    for i, w in enumerate(words):
        out.append(w if (i and w in small) else w[:1].upper() + w[1:])
    t = ' '.join(out)
    t = re.sub(r'(Ahura|Y)', lambda m: m.group(1), t)
    t = t.rstrip('. ')
    return t + '.' if t.endswith('&c') else t

YASNA_FILES = list(range(1, 28)) + list(range(35, 43)) + [52] + list(range(54, 73))
YASNA_NOTES = {
    5: 'This chapter is identical with Yasna XXXVII.',
    63: 'This chapter repeats other passages: see Yasna XV, 2; Yasna LXVI, 2; Yasna XXXVIII, 3.',
    64: 'This chapter repeats other passages: see Yasna XLVI, 3; Yasna L, 6-11.',
    69: 'This chapter is composed of fragments: see Yasna XV, 2; and Yasna LI, 1 and 22.',
    72: 'This chapter repeats Yasna LXI.',
}

def do_yasna(src, root):
    for k, ch in enumerate(YASNA_FILES):
        f = f'sbe31/sbe31{k + 23:03d}.htm'
        items = parse(os.path.join(src, f))
        heads = [t for kind, t, _ in items if kind == 'h']
        heads = heads[[i for i, h in enumerate(heads) if h.startswith('YASNA ')][0]:]
        assert heads[0].startswith('YASNA ' + ROMAN_N(ch)), (f, heads[0], ch)
        sub = [h for h in heads[1:] if not re.match(r'^(I|II|III|IV|V)\.?$|^\(See', h) and len(h) > 2]
        title = f'Yasna {ROMAN_N(ch)}' + (' — ' + title_case(sub[0]) if sub else '')
        vs = verses_inline(items, fixes=FIXES.get(f, ()))
        note = YASNA_NOTES.get(ch) if not vs else None
        write(root, 'yasna', 'mills-yasna', 'yasna', ch, title, vs, note)
        print(f, ch, len(vs), title)

def ROMAN_N(n):
    vals = [(50, 'L'), (40, 'XL'), (10, 'X'), (9, 'IX'), (5, 'V'), (4, 'IV'), (1, 'I')]
    r = ''
    for v, sym in vals:
        while n >= v: r += sym; n -= v
    return r

if __name__ == '__main__':
    src, root = sys.argv[1], sys.argv[2]
    sys.stdout.reconfigure(encoding='utf8')
    what = sys.argv[3]
    if what == 'vendidad': do_vendidad(src, root)
    if what == 'yashts': do_yashts(src, root)
    if what == 'yasna': do_yasna(src, root)
    if what in ('vendidad', 'yashts', 'yasna'):
        for x in PRELUDE: print('PRELUDE:', x[:200])
        for x in COMBINED: print('COMBINED:', x)
    elif what == 'dump':
        for k, t, s in parse(os.path.join(src, sys.argv[4])):
            print(k, 'S' if s else '-', t[:160])
