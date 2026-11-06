"""Import The Great Learning (大學) and the Doctrine of the Mean (中庸).

Chinese: zh.wikisource 四書章句集註/大學章句 and 四書章句集註/中庸章句 (Zhu Xi's arrangement;
the main text is split at Zhu Xi's commentary notes, which give the same sections Legge numbered).
English: James Legge, The Chinese Classics vol. 1 (1893), as transcribed on en.wikisource
(The_Chinese_Classics/Volume_1/The_Great_Learning and .../The_Doctrine_of_the_Mean).
The English is split by anchor phrases so each English verse lines up with a Chinese section.

Raw files (git-ignored) are expected under data/raw/great-learning/ and data/raw/mean/.
Run:  python -I scripts/ai-translate/import-great-learning-mean.py
"""
import json, os, re, sys

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
RAW = os.path.join(ROOT, "data", "raw")
TEXTS = os.path.join(ROOT, "data", "texts")

# ---------------------------------------------------------------- Chinese
def strip_templates(t):
    out = []; i = 0
    while i < len(t):
        if t.startswith("{{", i):
            depth = 0; j = i
            while j < len(t):
                if t.startswith("{{", j): depth += 1; j += 2; continue
                if t.startswith("}}", j):
                    depth -= 1; j += 2
                    if depth == 0: break
                    continue
                j += 1
            inner = t[i + 2:j - 2]
            name = inner.split("|")[0].strip().lower()
            if name == "annotate": out.append("〖A〗")
            elif name == "另": out.append(inner.split("|")[1])
            i = j
        else:
            out.append(t[i]); i += 1
    return "".join(out)

def parse_zh(path):
    t = strip_templates(open(path, encoding="utf-8").read())
    t = re.sub(r"-\{(.*?)\}-", r"\1", t)
    t = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", t)
    t = re.sub(r"<[^>]+>", "", t)
    chapters = []; cur = []
    for line in t.split("\n"):
        s = line.strip().strip("　").strip()
        colon = s.startswith(":")
        s = s.lstrip(":").strip().strip("　").strip()
        if re.match(r"右(第|經|傳)", s):
            chapters.append(cur); cur = []; continue
        if colon or not s or s.startswith("子程子曰") or s.startswith("category") \
           or s.startswith("中庸章句") or s.startswith("大學章句"):
            continue
        cur.append(s)
    res = []
    for lines in chapters:
        segs = [x.strip() for x in "".join(lines).split("〖A〗")]
        segs = [re.sub(r"[，、]$", "。", x) for x in segs if re.search(r"[一-鿿]", x)]
        res.append(segs)
    return res

# ---------------------------------------------------------------- English
def load_en(path):
    c = json.load(open(path, encoding="utf-8"))["query"]["pages"][0]["revisions"][0]["slots"]["main"]["content"]
    paras = [p.strip() for p in c.split("\n\n") if p.strip()]
    keep = [p for p in paras if not p.startswith("{{") and not p.startswith("[[") and not p.startswith("'''")]
    text = " ".join(keep).replace("''", "")
    return re.sub(r"\s+", " ", text)

FIXES = [  # obvious transcription slips in the Wikisource copy
    ("let him not bestow on the left; what he hates to receive on the left",
     "let him not therewith follow those who are before him; what he hates to receive on the right, "
     "let him not bestow on the left; what he hates to receive on the left"),
    ("Chieh and Chau", "Jie and Zhou"),
    ("an classes of artisans", "all classes of artisans"),
    ("large emolument. and", "large emolument, and"),
    ("wheels, of the-same size", "wheels of the same size"),
    ("night tonight", "night to night"),
    ("smell. 'That", "smell.' That"),
    ("rules of propriety this is", "rules of propriety—this is"),
    ("virtue-this is", "virtue—this is"),
    ("The Master said, Let a man", "The Master said, \"Let a man"),
    ("calamities will be sure to come.", "calamities will be sure to come.\""),
]

def tidy(s):
    s = re.sub(r"\s*([;:,])\s?-\s?(?=\S)", r"\1—", s)   # ":-this" -> ":—this"
    s = s.replace(" - ", " — ").replace(".-", ".—")
    return re.sub(r"\s+", " ", s).strip()

def by_ranges(text, specs):
    """specs: list of (start, end) anchors, or a literal string prefixed with '='."""
    out = []; pos = 0
    for sp in specs:
        if isinstance(sp, str) and sp.startswith("="):
            out.append(sp[1:]); continue
        a, b = sp
        i = text.find(a)
        if i < 0: raise SystemExit("start not found: " + a)
        j = text.find(b, i)
        if j < 0: raise SystemExit("end not found: " + b)
        out.append(tidy(text[i:j + len(b)]))
    return out

def by_starts(text, starts):
    idx = []; pos = 0
    for a in starts:
        i = text.find(a, pos)
        if i < 0: raise SystemExit("start not found: " + a)
        idx.append(i); pos = i + len(a)
    idx.append(len(text))
    return [tidy(text[idx[k]:idx[k + 1]]) for k in range(len(starts))]

# ---------------------------------------------------------------- Great Learning
BP = 'In the Book of Poetry, it is said, "'
GL_SPECS = [
    [("What the Great Learning teaches", "the highest excellence."),
     ("The point where to rest", "the desired end."),
     ("Things have their root", "taught in the Great Learning."),
     ("The ancients who wished", "investigation of things."),
     ("Things being investigated", "tranquil and happy."),
     ("From the Son of Heaven", "root of everything besides."),
     ("It cannot be, when the root", "greatly cared for.")],
    [('In the Announcement to Kang, it is said, "He was able', 'virtue illustrious."'),
     ("In the Tai Jia", 'decrees of Heaven."'),
     ("In the Canon of the emperor", 'lofty virtue."'),
     ("These passages all show", "made themselves illustrious.")],
    [("On the bathing tub", 'daily renovation."'),
     ('In the Announcement to Kang, it is said, "To stir up', 'new people."'),
     (BP + "Although Zhou", 'was new."'),
     ("Therefore, the superior man in everything", "utmost endeavors.")],
    [(BP + "The royal domain", 'people rest."'),
     (BP + "The twittering", 'equal to this bird?"'),
     (BP + "Profound was King Wen", "rested in good faith."),
     (BP + "Look at that winding", "people cannot forget them."),
     (BP + "Ah! the former kings", "quitted the world, are not forgotten.")],
    [('The Master said, "In hearing litigations', "knowing the root.")],
    ["=This is called knowing the root.", "=This is called the perfecting of knowledge."],
    [('What is meant by "making the thoughts sincere"', "when he is alone."),
     ("There is no evil to which", "when he is alone."),
     ("The disciple Zeng said", 'with reverence!"'),
     ("Riches adorn a house", "make his thoughts sincere.")],
    [('What is meant by, "The cultivation of the person', "sorrow and distress."),
     ("When the mind is not present", "taste of what we eat."),
     ("This is what is meant by saying that the cultivation", "rectifying of the mind.")],
    [('What is meant by "The regulation of one\'s family', "object of their hatred."),
     ("Hence it is said, in the common adage", 'growing corn."'),
     ("This is what is meant by saying that if the person", "regulate his family.")],
    [('What is meant by "In order rightly', "multitude should be treated."),
     ('In the Announcement to Kang, it is said, "Act as if', "might afterwards marry."),
     ("From the loving example", 'by its One man."'),
     ("Yao and Shun led on", "effectually to instruct them."),
     ("Thus we see how the government of the state depends", "regulation of the family."),
     (BP + "That peach tree", "state may be taught."),
     (BP + "They can discharge", "people of the state."),
     (BP + "In his deportment", "people imitate him."),
     ('This is what is meant by saying, "The government of his kingdom', 'regulation of the family."')],
    [('What is meant by "The making the whole kingdom', "regulate his conduct."),
     ("What a man dislikes in his superiors", 'to regulate one\'s conduct."'),
     (BP + "How much to be rejoiced", "parent of the people."),
     (BP + "Lofty is", "disgrace in the kingdom."),
     (BP + "Before the sovereigns", "kingdom is lost."),
     ("On this account, the ruler will first", "resources for expenditure."),
     ("Virtue is the root", "wealth is the result."),
     ("If he makes the root", "teach them rapine."),
     ("Hence, the accumulation", "collect the people."),
     ("And hence, the ruler's words", "departure by the same."),
     ('In the Announcement to Kang, it is said, "The decree', "want of goodness loses it."),
     ("In the Book of Chu", 'its good men."'),
     ("Duke Wen's uncle", 'due to his parent."'),
     ("In the Declaration of the Duke of Qin", 'dangerous to the state?"'),
     ("It is only the truly virtuous man who can send", 'hate others."'),
     ("To see men of worth", "this is weakness."),
     ("To love those whom men hate", "him who does so."),
     ("Thus we see that the sovereign has a great course", "will fail of it."),
     ("There is a great course also", "always be sufficient."),
     ("The virtuous ruler, by means", "expense of his life."),
     ("Never has there been a case of the sovereign", "sovereign's possession."),
     ("The officer Meng Xian said", 'found in righteousness."'),
     ("When he who presides", 'found in righteousness."')],
]
GL_TITLES_EN = [
    "The Classic Text",
    "Commentary 1: Making Bright Virtue Illustrious",
    "Commentary 2: Renovating the People",
    "Commentary 3: Resting in the Highest Excellence",
    "Commentary 4: The Root and the Branches",
    "Commentary 5: The Investigation of Things",
    "Commentary 6: Making the Thoughts Sincere",
    "Commentary 7: Rectifying the Mind",
    "Commentary 8: Cultivating the Person, Regulating the Family",
    "Commentary 9: Regulating the Family, Governing the State",
    "Commentary 10: Governing the State, Bringing Peace to the World",
]
GL_TITLES_ZH = ["經一章", "傳一章・釋明明德", "傳二章・釋新民", "傳三章・釋止於至善", "傳四章・釋本末",
                "傳五章・釋格物致知", "傳六章・釋誠意", "傳七章・釋正心脩身", "傳八章・釋脩身齊家",
                "傳九章・釋齊家治國", "傳十章・釋治國平天下"]
GL_NOTE_ZH = {6: "此章朱熹以為「釋格物致知之義，而今亡矣」，另作補傳；此處只錄原文。"}
GL_NOTE_EN = {6: "Zhu Xi held that most of this chapter was lost and wrote a supplement of his own; Legge, like this text, gives only the two surviving sentences."}

# ---------------------------------------------------------------- Doctrine of the Mean
M = 'The Master said, "'
PB = 'It is said in the Book of Poetry, "'
MEAN_STARTS = [
    ["What Heaven has conferred", "The path may not be left", "There is nothing more visible",
     "While there are no stirrings", "Let the states of equilibrium"],
    ["Zhong-ni said", "The superior man's embodying"],
    [M + "Perfect"],
    [M + "I know how", "There is no body but eats"],
    [M + "Alas!"],
    [M + "There was Shun"],
    ['The Master said "Men all say'],
    ['The Master said "This was the manner'],
    [M + "The kingdom, its states"],
    ["Zi-lu asked about energy", M + "Do you mean", "To show forbearance", "To lie under arms",
     "Therefore, the superior man cultivates a friendly"],
    [M + "To live in obscurity", "The good man tries to proceed", "The superior man accords with"],
    ["The way which the superior man pursues", "Common men and women, however ignorant",
     PB + "The hawk", "The way of the superior man may be found"],
    ['The Master said "The path is not far', "In the Book of Poetry, it is said, 'In hewing",
     "When one cultivates to the utmost", "In the way of the superior man there are four"],
    ["The superior man does what is proper", "In a position of wealth and honor, he does",
     "In a high situation", "Thus it is that the superior man is quiet", M + "In archery"],
    ["The way of the superior man may be compared", PB + "Happy union", M + "In such a state"],
    [M + "How abundantly", "We look for them", "They cause all the people",
     "It is said in the Book of Poetry, 'The approaches", "Such is the manifestness"],
    [M + "How greatly filial", "Therefore having such great virtue", "Thus it is that Heaven, in the production",
     "In the Book of Poetry, it is said, 'The admirable", "We may say therefore"],
    [M + "It is only King Wen", "King Wu continued the enterprise", "It was in his old age"],
    [M + "How far-extending", "Now filial piety is seen", "In spring and autumn",
     "By means of the ceremonies of the ancestral temple, they distinguished", "They occupied the places",
     "By the ceremonies of the sacrifices to Heaven"],
    ["The Duke Ai asked", M + "The government of Wen", "With the right men the growth",
     "Therefore the administration of government", "Benevolence is the characteristic",
     "When those in inferior situations do not possess", "Hence the sovereign may not neglect",
     "The duties of universal obligation are five", "Some are born with", M + "To be fond of learning",
     "He who knows these three things",
     "All who have the government of the kingdom with its states and families have nine",
     "By the ruler's cultivation", "Self-adjustment and purification",
     "All who have the government of the kingdom with its states and families have the above",
     '"In all things success', "When those in inferior situations do not obtain",
     "Sincerity is the way of Heaven.", "To this attainment there are requisite",
     "The superior man, while there is anything", "Let a man proceed in this way"],
    ["When we have intelligence resulting"],
    ["It is only he who is possessed of the most complete sincerity that can exist under heaven, who can give"],
    ["Next to the above"],
    ["It is characteristic of the most entire sincerity"],
    ["Sincerity is that whereby", "Sincerity is the end and beginning", "The possessor of sincerity"],
    ["Hence to entire sincerity", "Not ceasing, it continues long.", "Evidencing itself, it reaches far.",
     "Large and substantial;", "So large and substantial, the individual", "Such being its nature",
     "The way of Heaven and Earth may be completely", "The way of Heaven and Earth is large",
     "The Heaven now before us", PB + "The ordinances"],
    ["How great is the path proper", "Like overflowing water, it sends forth", "All-complete is its greatness",
     "It waits for the proper man", 'Hence it is said, "Only by perfect', "Therefore, the superior man honors",
     "Thus, when occupying a high"],
    ['The Master said, "Let a man who is ignorant', "To no one but the Son", "Now over the kingdom, carriages",
     "One may occupy the throne", M + "I may describe"],
    ["He who attains to the sovereignty", "However excellent may have been",
     "Therefore the institutions of the Ruler", "His presenting himself with his institutions",
     "Such being the case, the movements", "It is said in the Book of Poetry,-\"Not disliked"],
    ["Zhong-ni handed down", "He may be compared to Heaven and Earth", "All things are nourished together"],
    ["It is only he, possessed of all sagely", "All-embracing is he and vast", "All-embracing and vast, he is like",
     "Therefore his fame overspreads"],
    ["It is only the individual possessed of the most entire", "Call him man in his ideal", "Who can know him"],
    [PB + "Over her embroidered", PB + "Although the fish", PB + "Looked at", PB + "In silence",
     PB + "What needs no display", PB + "I regard with pleasure"],
]
MEAN_TITLES_EN = [
    "Heaven's Decree and the Nature", "The Superior Man and the Mean", "The Rarity of the Mean",
    "Why the Path Is Not Walked", "The Path Untrodden", "The Wisdom of Shun", "Wise in Name Only",
    "Hui Holds Fast to the Good", "The Mean Is Hard to Attain", "Zilu Asks About Strength", "The Sage Alone",
    "The Way Is Wide and Hidden", "The Way Is Not Far from Man", "Acting According to One's Station",
    "Beginning from What Is Near", "The Power of Spiritual Beings", "The Filial Piety of Shun",
    "King Wen, King Wu and the Duke of Zhou", "Far-Reaching Filial Piety", "Duke Ai Asks About Government",
    "Sincerity and Intelligence", "Complete Sincerity Fulfils the Nature", "Cultivating the Shoots of Goodness",
    "Foreknowledge", "Sincerity Completes Self and Things", "Ceaseless Sincerity; Heaven and Earth",
    "The Way of the Sage", "Ceremonies and the Son of Heaven", "Three Important Things",
    "Confucius Compared to Heaven and Earth", "The Perfect Sage", "Perfect Sincerity",
    "The Hidden Virtue of the Superior Man",
]
ZH_NUM = "一二三四五六七八九十"
def zh_num(n):
    if n <= 10: return ZH_NUM[n - 1]
    if n < 20: return "十" + ZH_NUM[n - 11]
    t, u = divmod(n, 10)
    return ZH_NUM[t - 1] + "十" + (ZH_NUM[u - 1] if u else "")

# ---------------------------------------------------------------- write
def write(work, version, book, ch, verses, title=None, note=None):
    d = os.path.join(TEXTS, work, version, book); os.makedirs(d, exist_ok=True)
    head = {"work": work, "version": version, "book": book, "chapter": ch}
    if title: head["title"] = title
    if note: head["note"] = note
    h = json.dumps(head, ensure_ascii=False, separators=(",", ":"))[:-1] + ',"verses":['
    lines = [json.dumps({"v": str(i), "t": t}, ensure_ascii=False, separators=(",", ":")) for i, t in enumerate(verses, 1)]
    with open(os.path.join(d, f"{ch}.json"), "w", encoding="utf-8", newline="\n") as f:
        f.write(h + "\n" + ",\n".join(lines) + "\n]}\n")

def build(work, zh_ver, en_ver, zh, en, zh_titles, en_titles, zh_notes={}, en_notes={}):
    assert len(zh) == len(en), (len(zh), len(en))
    for ch, (z, e) in enumerate(zip(zh, en), 1):
        if len(z) != len(e):
            raise SystemExit(f"{work} ch{ch}: zh {len(z)} vs en {len(e)}")
        write(work, zh_ver, work, ch, z, zh_titles[ch - 1], zh_notes.get(ch))
        write(work, en_ver, work, ch, e, en_titles[ch - 1], en_notes.get(ch))
    print(work, "chapters", len(zh), "verses", sum(map(len, zh)))

def main():
    gl_zh = parse_zh(os.path.join(RAW, "great-learning", "zhws", "daxue-zhangju.txt"))
    gl_text = load_en(os.path.join(RAW, "great-learning", "ws", "gl.json"))
    for a, b in FIXES: gl_text = gl_text.replace(a, b)
    gl_en = [by_ranges(gl_text, spec) for spec in GL_SPECS]
    build("great-learning", "great-learning-zh", "legge-gl", gl_zh, gl_en, GL_TITLES_ZH, GL_TITLES_EN,
          GL_NOTE_ZH, GL_NOTE_EN)

    mean_zh = parse_zh(os.path.join(RAW, "mean", "zhws", "zhongyong-zhangju.txt"))
    mean_text = load_en(os.path.join(RAW, "mean", "ws", "mean.json"))
    mean_text = mean_text[mean_text.find("What Heaven has conferred"):]
    for a, b in FIXES: mean_text = mean_text.replace(a, b)
    flat = [s for ch in MEAN_STARTS for s in ch]
    segs = by_starts(mean_text, flat)
    mean_en = []; k = 0
    for ch in MEAN_STARTS:
        mean_en.append(segs[k:k + len(ch)]); k += len(ch)
    build("mean", "mean-zh", "legge-mean", mean_zh, mean_en,
          [f"第{zh_num(i)}章" for i in range(1, 34)], MEAN_TITLES_EN)

if __name__ == "__main__":
    main()
