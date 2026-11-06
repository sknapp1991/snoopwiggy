"""Import Immanuel Kant's main works from Project Gutenberg (public-domain English translations).

  kant-groundwork / abbott-gw     Fundamental Principles of the Metaphysic of Morals, tr. T. K. Abbott  (PG #5682)
  kant-practical  / abbott-cpr    The Critique of Practical Reason, tr. T. K. Abbott                   (PG #5683)
  kant-pure       / meiklejohn    The Critique of Pure Reason, tr. J. M. D. Meiklejohn                 (PG #4280)
  perpetual-peace / campbell-smith  Perpetual Peace, tr. M. Campbell Smith (1903)                       (PG #50922)

Raw files (git-ignored) are expected at data/raw/kant/<n>/pg<n>.txt, downloaded from
https://www.gutenberg.org/cache/epub/<n>/pg<n>.txt

Chapter = the book's natural divisions; verse = paragraph. Gutenberg boilerplate, contents,
footnotes (Kant's and the translators') and footnote markers, and the translators' own
introductions are dropped. Tables are flattened into one verse per row/group.

Run:  python -I scripts/ai-translate/import-kant.py
"""
import json, os, re, sys

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
RAW = os.path.join(ROOT, "data", "raw", "kant")
TEXTS = os.path.join(ROOT, "data", "texts")

SMALL = {"of", "the", "and", "in", "to", "a", "an", "or", "as", "by", "for", "with", "on", "from", "at", "into", "its", "their", "between", "according"}
ROMAN = re.compile(r"^[IVXL]+[.,—]?$")


def titlecase_caps(p):
    """'FIRST CONFLICT OF THE TRANSCENDENTAL IDEAS. THESIS.' -> 'First Conflict of the Transcendental Ideas. Thesis.'"""
    letters = [c for c in p if c.isalpha()]
    if not letters or any(c.islower() for c in letters) or len(letters) < 3:
        return p
    out = []
    for i, w in enumerate(p.split(" ")):
        core = w.strip(".,;:—()")
        if ROMAN.match(core) and core not in ("I",) or core in ("I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"):
            out.append(w)
        elif i > 0 and core.lower() in SMALL and not out[-1].endswith("."):
            out.append(w.lower())
        else:
            out.append("—".join(x[:1].upper() + x[1:].lower() for x in w.split("—")))
    return " ".join(out)


def load(n, start_pat, end_pat):
    t = open(os.path.join(RAW, str(n), "pg%d.txt" % n), encoding="utf-8").read().replace("\r\n", "\n")
    t = t.replace("&mdash;", "—")
    i = t.index(start_pat)
    j = t.index(end_pat, i)
    return t[i:j]


def apply_tables(t, tables):
    for start, end, paras in tables:
        i = t.index(start)
        j = t.index(end, i) + len(end)
        t = t[:i] + "\n\n" + "\n\n".join(paras) + "\n\n" + t[j:]
    return t


def split_chapters(t, specs):
    """specs: list of (line_prefix, title). Each chapter starts at the first line (after the previous
    chapter's start) beginning with line_prefix."""
    lines = t.split("\n")
    starts = []
    pos = 0
    for spec in specs:
        prefix = spec[0]
        k = pos
        while k < len(lines) and not lines[k].strip().startswith(prefix):
            k += 1
        if k >= len(lines):
            raise SystemExit("chapter anchor not found: " + prefix)
        starts.append(k)
        pos = k + 1
    starts.append(len(lines))
    return ["\n".join(lines[starts[i]:starts[i + 1]]) for i in range(len(specs))]


def paragraphs(t, footnote):
    out = []
    prev_fn = False
    for p in re.split(r"\n[ \t]*\n", t):
        if not p.strip():
            continue
        if footnote(p, prev_fn):
            prev_fn = True
            continue
        prev_fn = False
        out.append(p)
    return out


def clean(p, abbott=False):
    lines = [l.strip() for l in p.split("\n")]
    lines = [l for l in lines if l and not re.match(r"^\{.*\}$", l) and not re.match(r"^[A-Z0-9_]+(\|[A-Z0-9_]+)+$", l)
             and not re.match(r"^(SEC_\d|BOOK_\d|PART_\d)", l)]
    s = " ".join(lines)
    s = re.sub(r"\[\d+\]", "", s)                    # footnote markers [12]
    if abbott:
        s = re.sub(r"\s?\*\(\d\)", "", s)              # footnote markers *(2)
        s = re.sub(r"\s\*(?=[\s.,;:)]|$)", "", s)      # footnote markers  *
        s = re.sub(r"(\w)- (?=\S)", r"\1—", s)          # 'effects- agreeableness' -> em dash
        s = re.sub(r"(\w)-$", r"\1", s)
    s = re.sub(r"_([^_]+)_", r"\1", s)                # italics
    s = s.replace("_", "")
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(r"\s+([,.;:])", r"\1", s)
    return s


def is_heading(s):
    if len(s) > 220:
        return False
    letters = [c for c in s if c.isalpha()]
    if letters and not any(c.islower() for c in letters):
        return True
    if re.match(r"^(SECTION|Section|Chapter|CHAPTER|BOOK|Book|§|Introductory|INTRODUCTION|Introduction|APPENDIX|Appendix|"
                r"PREFACE|Preface|First Part|Second Part|First Division|Second Division|Transcendental Dialectic|"
                r"Of the Idea|Critical Examination|Transcendental Doctrine|Of the Equivocal|“?Perpetual Peace)", s):
        return True
    if re.match(r"^[IVX]+\. ", s) and not re.search(r"[.?!]\s+[A-Z]", s[:-1]) and len(s) < 160:
        return True
    return False


FIXES = [
    ("Schematism at of the Pure", "Schematism of the Pure"),
    ("Prototypon Trancendentale", "Prototypon Transcendentale"),
    ("Afterwards be believed", "Afterwards he believed"),
    ("from Whatever reason", "from whatever reason"),
    ("INTRODUCTION. Of the Transcendental Faculty", "Introduction. Of the Transcendental Faculty"),
    ("has its dialetic", "has its dialectic"),
]


def write(work, version, book, chapters, raw_texts, footnote, abbott=False, bold=False):
    outdir = os.path.join(TEXTS, work, version, book)
    os.makedirs(outdir, exist_ok=True)
    report = []
    for ci, (spec, raw) in enumerate(zip(chapters, raw_texts), 1):
        title = spec[1]
        skip = spec[2] if len(spec) > 2 else None
        verses = [clean(p, abbott) for p in paragraphs(raw, footnote)]
        verses = [v for v in verses if v and v not in ("THE END", "The End") and not re.fullmatch(r"[* ]+", v)]
        if bold:  # =bold= markup in the Perpetual Peace transcription
            verses = [re.sub(r"=([^=]+)=", r"\1", v) for v in verses]
        if skip is None:  # drop the chapter's own heading lines
            while verses and (is_heading(verses[0]) or (verses[0][0].islower() and len(verses[0]) < 120)):
                verses.pop(0)
        else:
            verses = verses[skip:]
        merged = []  # rejoin headings/sentences that a blank line split in two
        for v in verses:
            if merged and v[0].islower() and not re.match(r"^[a-z]\. ", v):
                merged[-1] += " " + v
            else:
                merged.append(v)
        verses = merged
        for a, b in FIXES:
            verses = [v.replace(a, b) for v in verses]
        verses = [titlecase_caps(v) for v in verses]
        lines = ['{"work":%s,"version":%s,"book":%s,"chapter":%d,"title":%s,"verses":[' % (
            json.dumps(work), json.dumps(version), json.dumps(book), ci, json.dumps(title, ensure_ascii=False))]
        vl = ['{"v":"%d","t":%s}' % (i, json.dumps(v, ensure_ascii=False)) for i, v in enumerate(verses, 1)]
        lines.append(",\n".join(vl))
        lines.append("]}")
        with open(os.path.join(outdir, "%d.json" % ci), "w", encoding="utf-8", newline="\n") as f:
            f.write("\n".join(lines) + "\n")
        report.append((ci, title, len(verses), verses))
    return report


# ---------------------------------------------------------------- footnote rules
def fn_abbott(p, prev):
    return p.lstrip().startswith("*")


def fn_meiklejohn(p, prev):
    return bool(re.match(r"^ \[\d+\]", p.strip("\n")))


def fn_smith(p, prev):
    ls = [l for l in p.split("\n") if l.strip()]
    return all(l.startswith("  ") for l in ls) and (re.match(r"^\s*\[\d+\]", ls[0]) is not None or prev)


# ---------------------------------------------------------------- Groundwork
GW = [
    ("PREFACE", "Preface"),
    ("SEC_1", "First Section: Transition from the Common Rational Knowledge of Morality to the Philosophical"),
    ("SEC_2", "Second Section: Transition from Popular Moral Philosophy to the Metaphysic of Morals"),
    ("SEC_3", "Third Section: Transition from the Metaphysic of Morals to the Critique of Pure Practical Reason"),
]

# ---------------------------------------------------------------- Practical Reason
CPR = [
    ("PREFACE.", "Preface"),
    ("INTRODUCTION", "Introduction: Of the Idea of a Critique of Practical Reason"),
    ("BOOK_1|CHAPTER_1", "Book I, Chapter I: Of the Principles of Pure Practical Reason (§§ I–VI)", 4),
    ("VII. FUNDAMENTAL LAW", "Book I, Chapter I: Fundamental Law of the Pure Practical Reason (§§ VII–VIII)"),
    ("I. Of the Deduction of the Fundamental", "Book I, Chapter I: I. Of the Deduction of the Fundamental Principles of Pure Practical Reason", 1),
    ("II. Of the Right that Pure Reason", "Book I, Chapter I: II. Of the Right that Pure Reason in its Practical Use has to an Extension", 1),
    ("BOOK_1|CHAPTER_2", "Book I, Chapter II: Of the Concept of an Object of Pure Practical Reason"),
    ("BOOK_1|CHAPTER_3", "Book I, Chapter III: Of the Motives of Pure Practical Reason"),
    ("Critical Examination of the Analytic", "Critical Examination of the Analytic of Pure Practical Reason"),
    ("BOOK_2|CHAPTER_1", "Book II, Chapter I: Of a Dialectic of Pure Practical Reason Generally"),
    ("BOOK_2|CHAPTER_2", "Book II, Chapter II: Of the Dialectic of Pure Reason in Defining the Summum Bonum; I. The Antinomy", 2),
    ("II. Critical Solution of the Antinomy", "Book II, Chapter II: II. Critical Solution of the Antinomy of Practical Reason", 1),
    ("III. Of the Primacy of Pure Practical", "Book II, Chapter II: III. Of the Primacy of Pure Practical Reason", 2),
    ("IV. The Immortality of the Soul", "Book II, Chapter II: IV. The Immortality of the Soul as a Postulate", 2),
    ("V. The Existence of God", "Book II, Chapter II: V. The Existence of God as a Postulate", 1),
    ("VI. Of the Postulates of Pure Practical", "Book II, Chapter II: VI. Of the Postulates of Pure Practical Reason Generally", 1),
    ("VII. How is it possible to conceive", "Book II, Chapter II: VII. How an Extension of Pure Reason in a Practical Point of View Is Possible", 4),
    ("VIII. Of Belief from a Requirement", "Book II, Chapter II: VIII. Of Belief from a Requirement of Pure Reason", 1),
    ("IX. Of the Wise Adaptation", "Book II, Chapter II: IX. Of the Wise Adaptation of Man's Cognitive Faculties", 2),
    ("PART_2|METHODOLOGY", "Second Part: Methodology of Pure Practical Reason", 2),
    ("PART_2|CONCLUSION", "Conclusion"),
]
CPR_TABLES = [
    ("  Esto bonus miles", "perdere causas. *", [  # Juvenal, Sat. viii. 79-84: one verse, not six
        "Esto bonus miles, tutor bonus, arbiter idem Integer; ambiguae si quando citabere testis Incertaeque rei, "
        "Phalaris licet imperet ut sis Falsus, et admoto dictet periuria tauro, Summum crede nefas animam praeferre pudori, "
        "Et propter vitam vivendi perdere causas.",
    ]),
    ("SUBJECTIVE.", "theological Moralists)", [
        "Subjective. External: Education (Montaigne); the civil Constitution (Mandeville). Internal: Physical feeling (Epicurus); Moral feeling (Hutcheson).",
        "Objective. Internal: Perfection (Wolf and the Stoics). External: Will of God (Crusius and other theological Moralists).",
    ]),
    ("I. QUANTITY.", "Perfect and imperfect duty.", [
        "I. Quantity. Subjective, according to maxims (practical opinions of the individual); Objective, according to principles (Precepts); A priori both objective and subjective principles of freedom (laws).",
        "II. Quality. Practical rules of action (praeceptivae); Practical rules of omission (prohibitivae); Practical rules of exceptions (exceptivae).",
        "III. Relation. To personality; To the condition of the person; Reciprocal, of one person to the others of the others.",
        "IV. Modality. The Permitted and the Forbidden; Duty and the contrary to duty; Perfect and imperfect duty.",
    ]),
]

# ---------------------------------------------------------------- Pure Reason
PURE = [
    ("PREFACE TO THE FIRST EDITION", "Preface to the First Edition (1781)"),
    ("PREFACE TO THE SECOND EDITION", "Preface to the Second Edition (1787)"),
    ("Introduction", "Introduction"),
    ("I. TRANSCENDENTAL DOCTRINE OF ELEMENTS", "Transcendental Aesthetic, §§ 1–4: Introductory; Of Space"),
    ("SECTION II. Of Time", "Transcendental Aesthetic, §§ 5–8: Of Time"),
    ("§ 9. General Remarks", "Transcendental Aesthetic, §§ 9–10: General Remarks and Conclusion"),
    ("Second Part—TRANSCENDENTAL LOGIC", "Transcendental Logic, Introduction: Idea of a Transcendental Logic"),
    ("FIRST DIVISION. TRANSCENDENTAL LOGIC", "Transcendental Analytic, Book I, Chapter I: The Clue to the Discovery of all Pure Conceptions of the Understanding (the Categories)"),
    ("Chapter II. Of the Deduction", "Transcendental Analytic, Book I, Chapter II, Section I: Of the Principles of a Transcendental Deduction"),
    ("Section II Transcendental Deduction", "Transcendental Analytic, Section II: Transcendental Deduction of the Pure Conceptions of the Understanding (§§ 11–19)"),
    ("Of the Application of the Categories to Objects", "Transcendental Analytic, Section II: Of the Application of the Categories to Objects of the Senses (§§ 20–23)", 1),
    ("BOOK II. Analytic of Principles", "Transcendental Analytic, Book II: Analytic of Principles; Chapter I, Of the Schematism"),
    ("Chapter II. System of all Principles", "Analytic of Principles, Chapter II: System of all Principles, Sections I–II"),
    ("Section III. Systematic Representation", "Analytic of Principles, Section III: Axioms of Intuition and Anticipations of Perception"),
    ("3. ANALOGIES OF EXPERIENCE", "Analytic of Principles: The Analogies of Experience; First Analogy", 0),
    ("B. SECOND ANALOGY", "Analytic of Principles: Second Analogy", 0),
    ("C. THIRD ANALOGY", "Analytic of Principles: Third Analogy", 0),
    ("4. THE POSTULATES OF EMPIRICAL THOUGHT", "Analytic of Principles: The Postulates of Empirical Thought; Refutation of Idealism", 0),
    ("Chapter III Of the Ground", "Analytic of Principles, Chapter III: Of the Ground of the Division of all Objects into Phenomena and Noumena"),
    ("APPENDIX", "Transcendental Analytic, Appendix: Of the Amphiboly of the Conceptions of Reflection"),
    ("REMARK ON THE AMPHIBOLY", "Transcendental Analytic, Appendix: Remark on the Amphiboly of the Conceptions of Reflection"),
    ("SECOND DIVISION—TRANSCENDENTAL LOGIC", "Transcendental Dialectic, Introduction"),
    ("TRANSCENDENTAL DIALECTIC—BOOK I", "Transcendental Dialectic, Book I, Section I: Of Ideas in General"),
    ("Section II. Of Transcendental Ideas", "Transcendental Dialectic, Book I, Sections II–III: Of Transcendental Ideas; System of Transcendental Ideas"),
    ("TRANSCENDENTAL DIALECTIC—BOOK II", "Transcendental Dialectic, Book II, Chapter I: Of the Paralogisms of Pure Reason"),
    ("Refutation of the Argument of Mendelssohn", "Paralogisms: Refutation of Mendelssohn's Argument for the Permanence of the Soul", 1),
    ("Chapter II. The Antinomy of Pure Reason", "Transcendental Dialectic, Chapter II: The Antinomy of Pure Reason; Section I, System of Cosmological Ideas"),
    ("Section II. Antithetic of Pure Reason", "Antinomy, Section II: Antithetic of Pure Reason; the First and Second Conflicts"),
    ("THIRD CONFLICT OF THE TRANSCENDENTAL IDEAS", "Antinomy: the Third and Fourth Conflicts", 0),
    ("Section III. Of the Interest of Reason", "Antinomy, Section III: Of the Interest of Reason in these Self-contradictions"),
    ("Section IV. Of the necessity imposed", "Antinomy, Sections IV–VI: The Solution of the Transcendental Problems; Transcendental Idealism as the Key"),
    ("Section VII. Critical Solution", "Antinomy, Section VII: Critical Solution of the Cosmological Problem"),
    ("Section VIII. Regulative Principle", "Antinomy, Sections VIII–IX: The Regulative Principle of Pure Reason; Solution of the First and Second Ideas"),
    ("III. Solution of the Cosmological Idea", "Antinomy, Section IX, III: Freedom and Natural Necessity (Solution of the Third Idea)", 1),
    ("IV. Solution of the Cosmological Idea", "Antinomy, Section IX, IV: Solution of the Fourth Idea; Concluding Remarks", 1),
    ("Chapter III. The Ideal of Pure Reason", "Transcendental Dialectic, Chapter III: The Ideal of Pure Reason, Sections I–II"),
    ("Section III. Of the Arguments employed", "The Ideal of Pure Reason, Sections III–IV: Proofs of God's Existence; the Ontological Proof"),
    ("Section V. Of the Impossibility of a Cosmological", "The Ideal of Pure Reason, Section V: The Cosmological Proof"),
    ("Section VI. Of the Impossibility of a Physico", "The Ideal of Pure Reason, Sections VI–VII: The Physico-Theological Proof; Critique of all Speculative Theology"),
    ("APPENDIX. Of the Regulative Employment", "Transcendental Dialectic, Appendix: Of the Regulative Employment of the Ideas of Pure Reason"),
    ("_Of the Ultimate End of the Natural Dialectic", "Transcendental Dialectic, Appendix: Of the Ultimate End of the Natural Dialectic of Human Reason", 1),
    ("II. Transcendental Doctrine of Method", "Doctrine of Method, Chapter I: The Discipline of Pure Reason; Section I, in the Sphere of Dogmatism", 1),
    ("Section II. The Discipline of Pure Reason in Polemics", "Doctrine of Method, Discipline, Section II: In Polemics"),
    ("_Scepticism not a Permanent State", "Doctrine of Method, Discipline, Section II: Scepticism not a Permanent State for Human Reason", 1),
    ("Section III. The Discipline of Pure Reason in Hypothesis", "Doctrine of Method, Discipline, Section III: In Hypothesis"),
    ("Section IV. The Discipline of Pure Reason in Relation", "Doctrine of Method, Discipline, Section IV: In Relation to Proofs"),
    ("Chapter II. The Canon of Pure Reason", "Doctrine of Method, Chapter II: The Canon of Pure Reason, Sections I–II"),
    ("Section III. Of Opinion, Knowledge", "Doctrine of Method, Canon, Section III: Of Opinion, Knowledge, and Belief"),
    ("Chapter III. The Architectonic", "Doctrine of Method, Chapter III: The Architectonic of Pure Reason"),
    ("Chapter IV. The History", "Doctrine of Method, Chapter IV: The History of Pure Reason"),
]
PURE_TABLES = [
    ("                                    1\n                         _Quantity of judgements_", "Apodeictical", [
        "1. Quantity of judgements: Universal; Particular; Singular.",
        "2. Quality: Affirmative; Negative; Infinite.",
        "3. Relation: Categorical; Hypothetical; Disjunctive.",
        "4. Modality: Problematical; Assertorical; Apodeictical.",
    ]),
    ("                     TABLE OF THE CATEGORIES", "Necessity—Contingence", [
        "TABLE OF THE CATEGORIES",
        "1. Of Quantity: Unity; Plurality; Totality.",
        "2. Of Quality: Reality; Negation; Limitation.",
        "3. Of Relation: Of Inherence and Subsistence (substantia et accidens); Of Causality and Dependence (cause and effect); Of Community (reciprocity between the agent and patient).",
        "4. Of Modality: Possibility—Impossibility; Existence—Non-existence; Necessity—Contingence.",
    ]),
    ("                                1\n                              Axioms", "in general\n", [
        "1. Axioms of Intuition.",
        "2. Anticipations of Perception.",
        "3. Analogies of Experience.",
        "4. Postulates of Empirical Thought in general.",
    ]),
    ("                      NOTHING\n", "_nihil negativum_\n", [
        "Nothing as:",
        "1. Empty Conception without object, ens rationis.",
        "2. Empty object of a conception, nihil privativum.",
        "3. Empty intuition without object, ens imaginarium.",
        "4. Empty object without conception, nihil negativum.",
    ]),
    ("            1                          2\n  The Soul is SUBSTANCE", "objects in space[43]", [
        "1. The Soul is SUBSTANCE.",
        "2. As regards its quality it is SIMPLE.",
        "3. As regards the different times in which it exists, it is numerically identical, that is UNITY, not Plurality.",
        "4. It is in relation to possible objects in space.",
    ]),
    ("                        1\n                      I think,", "in every state of my thought.", [
        "1. I think,",
        "2. as Subject,",
        "3. as simple Subject,",
        "4. as identical Subject, in every state of my thought.",
    ]),
    ("                      1\n            The absolute Completeness", "of what is changeable in a phenomenon.", [
        "1. The absolute Completeness of the COMPOSITION of the given totality of all phenomena.",
        "2. The absolute Completeness of the DIVISION of given totality in a phenomenon.",
        "3. The absolute Completeness of the ORIGINATION of a phenomenon.",
        "4. The absolute Completeness of the DEPENDENCE of the EXISTENCE of what is changeable in a phenomenon.",
    ]),
]

# ---------------------------------------------------------------- Perpetual Peace
PP = [
    ("TRANSLATION", "First Section: The Preliminary Articles of Perpetual Peace between States"),
    ("_SECOND SECTION_", "Second Section: The Definitive Articles of Perpetual Peace; the First Definitive Article"),
    ("SECOND DEFINITIVE ARTICLE", "Second Definitive Article: The Law of Nations Shall Be Founded on a Federation of Free States"),
    ("THIRD DEFINITIVE ARTICLE", "Third Definitive Article: The Rights of Men as Citizens of the World (Universal Hospitality)"),
    ("FIRST SUPPLEMENT", "First Supplement: Concerning the Guarantee of Perpetual Peace"),
    ("SECOND SUPPLEMENT", "Second Supplement: A Secret Article for Perpetual Peace"),
    ("APPENDIX I", "Appendix I: On the Disagreement between Morals and Politics with Reference to Perpetual Peace"),
    ("APPENDIX II", "Appendix II: Concerning the Harmony of Politics with Morals according to the Transcendental Idea of Public Right"),
]


def run():
    out = {}
    t = load(5682, "\nPREFACE\n", "THE END")
    out["groundwork"] = write("kant-groundwork", "abbott-gw", "kant-groundwork", GW, split_chapters(t, GW), fn_abbott, abbott=True)

    t = load(5683, "\nPREFACE.\n", "                             THE END")
    t = apply_tables(t, CPR_TABLES)
    out["practical"] = write("kant-practical", "abbott-cpr", "kant-practical", CPR, split_chapters(t, CPR), fn_abbott, abbott=True)

    t = load(4280, "PREFACE TO THE FIRST EDITION 1781", "*** END OF THE PROJECT")
    t = apply_tables(t, PURE_TABLES)
    out["pure"] = write("kant-pure", "meiklejohn", "kant-pure", PURE, split_chapters(t, PURE), fn_meiklejohn)

    t = load(50922, "TRANSLATION[107]", "\nINDEX\n")
    out["pp"] = write("perpetual-peace", "campbell-smith", "perpetual-peace", PP, split_chapters(t, PP), fn_smith, bold=True)

    for k, rep in out.items():
        print("==", k, len(rep), "chapters,", sum(r[2] for r in rep), "verses")
        for ci, title, n, verses in rep:
            print("  %2d %4d  %s" % (ci, n, title))


if __name__ == "__main__":
    run()
