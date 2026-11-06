/**
 * World religions beyond the first six: public-domain (or freely licensed) texts, each with its own
 * small parser. Sources are cached in data/raw/<dir>. Project Gutenberg files are used where they
 * exist (sacred-texts.com now turns automated downloads away).
 *
 *   npx tsx scripts/import-world.ts            (all)
 *   npx tsx scripts/import-world.ts ttc aqdas  (some)
 *
 *   ttc         Tao Te Ching — James Legge (1891), Gutenberg #216; Chinese text, Gutenberg #24039
 *   analects    Analects of Confucius — James Legge (1893) with the Chinese, Gutenberg #4094
 *   australian  Australian Legendary Tales — K. Langloh Parker (1896), Gutenberg #3833
 *   hidden      The Hidden Words — Bahá'u'lláh (Bahá'í Reference Library text), Gutenberg #16941
 *   aqdas       The Kitáb-i-Aqdas — Bahá'u'lláh (Bahá'í Reference Library text), Gutenberg #16523
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { cached, decodeEntities, gutenbergBody, numbered, resetVersion, ROOT, roman, sacredTextsGz, writeChapter, type Verse } from "./lib/world";

const GUT = (id: number) => `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`;
const report = (name: string, chapters: number, verses: number) => console.log(`${name.padEnd(12)} ${chapters} chapters, ${verses} verses`);
/** Hard-wrapped lines → one line. */
const unwrap = (s: string) => s.replace(/\s+/g, " ").trim();
/** Blank-line separated paragraphs. */
const paras = (s: string) => s.split(/\n\s*\n/).map(unwrap).filter(Boolean);
const NUM = "一二三四五六七八九";
/** Chinese numerals 一 … 九十九, also 廿 (20), 卅 (30) and positional 四七 (47). */
const cn = (raw: string) => {
  const s = raw.replace("廿", "二十").replace("卅", "三十");
  const d = (c: string) => NUM.indexOf(c) + 1;
  const t = s.indexOf("十");
  if (t < 0) return s.length === 2 ? d(s[0]) * 10 + d(s[1]) : d(s);
  return (t === 0 ? 1 : d(s[0])) * 10 + (t < s.length - 1 ? d(s[t + 1]) : 0);
};

/**
 * The sources' few misprinted chapter numbers (two "XVII"s, "XXXII" for XXIII): a number that breaks
 * the run, where the next one carries it on, is the one in between.
 */
function sequential(list: Verse[]) {
  const out: Verse[] = [];
  list.forEach((x, i) => {
    const prev = out.length ? Number(out[out.length - 1].v) : 0;
    const next = i + 1 < list.length ? Number(list[i + 1].v) : NaN;
    const n = Number(x.v);
    out.push((n !== prev + 1 && next === prev + 2) || n <= prev ? { ...x, v: String(prev + 1) } : x);
  });
  return out;
}

/** Tao Te Ching: 81 chapters with Legge's verse numbers; the Chinese chapter spans them all. */
async function ttc() {
  const txt = gutenbergBody(await cached("ttc", "pg216.txt", GUT(216)));
  const body = txt.slice(txt.indexOf("PART 1."));
  const chunks = body.split(/\n{3,}/).map((c) => c.trim()).filter((c) => /^(Ch\. )?\d+\./.test(c));
  await resetVersion("tao-te-ching", "legge-ttc");
  const counts = new Map<number, number>();
  let total = 0;
  for (const c of chunks) {
    const ch = Number(/^(?:Ch\. )?(\d+)\./.exec(c)![1]);
    const rest = c.replace(/^(?:Ch\. )?\d+\.\s*/, "");
    const verses: Verse[] = [];
    // "1. text" paragraphs; a bare "3." is followed by its verse (a rhyme) in the next paragraph.
    let pending: string | null = null;
    for (const p of rest.split(/\n\s*\n/)) {
      const m = /^(\d+)\.\s*([\s\S]*)$/.exec(p.trim());
      if (m) {
        const t = unwrap(m[2]);
        if (t) verses.push({ v: m[1], t });
        else pending = m[1];
      } else if (pending) {
        verses.push({ v: pending, t: unwrap(p) });
        pending = null;
      } else if (verses.length) verses[verses.length - 1].t += ` ${unwrap(p)}`;
      else verses.push({ v: "1", t: unwrap(p) }); // a chapter in one piece
    }
    counts.set(ch, verses.length);
    total += verses.length;
    await writeChapter("tao-te-ching", "legge-ttc", "ttc", ch, verses);
  }
  report("ttc legge", chunks.length, total);

  const zh = gutenbergBody(await cached("ttc", "pg24039.txt", GUT(24039)));
  await resetVersion("tao-te-ching", "ttc-zh");
  let z = 0;
  for (const m of zh.matchAll(/第([一二三四五六七八九十]+)章\n([\s\S]*?)(?=\n第[一二三四五六七八九十]+章|$)/g)) {
    const ch = cn(m[1]);
    const t = m[2].replace(/\s+/g, "").trim();
    if (!t) continue;
    const n = counts.get(ch) ?? 1;
    await writeChapter("tao-te-ching", "ttc-zh", "ttc", ch, [{ v: "1", t, ...(n > 1 ? { to: String(n) } : {}) }]);
    z++;
  }
  report("ttc zh", z, z);
}

/** Analects: 20 books (chapters here), Legge's numbered chapters as verses; Chinese alongside. */
async function analects() {
  const txt = gutenbergBody(await cached("analects", "pg4094.txt", GUT(4094)));
  const start = txt.search(/^BOOK I\.\s/m);
  const books = txt.slice(start).split(/^BOOK ([IVXL]+)\.[^\n]*\n/m);
  const cjk = /[㐀-鿿　-〿＀-￯【】]/;
  await resetVersion("analects", "legge-an");
  await resetVersion("analects", "analects-zh");
  let ve = 0;
  let vz = 0;
  for (let i = 1; i < books.length; i += 2) {
    const book = roman(books[i]);
    const lines = books[i + 1].split("\n");
    const en = lines.filter((l) => !cjk.test(l)).join("\n");
    const zh = lines.filter((l) => cjk.test(l)).join("");
    const verses: Verse[] = [];
    for (const m of en.matchAll(/CHAP(?:TER|\.)\s+([IVXL]+)\.\s*([\s\S]*?)(?=CHAP(?:TER|\.)\s+[IVXL]+\.|$)/g)) {
      const t = unwrap(m[2]);
      if (t) verses.push({ v: String(roman(m[1])), t });
    }
    await writeChapter("analects", "legge-an", "analects", book, sequential(verses));
    ve += verses.length;
    // Chinese: 【第二章】 starts chapter 2; text before the first marker is chapter 1; 【一節】 marks dropped.
    const zv: Verse[] = [];
    const segs = zh.split(/【第?([一二三四五六七八九十廿卅]+)章】/); // 【第二章】, 【十四章】, 【廿三章】
    const clean = (s: string) => s.replace(/【[^】]*】/g, "").replace(/\s+/g, "").trim();
    if (clean(segs[0])) zv.push({ v: "1", t: clean(segs[0]) });
    for (let k = 1; k < segs.length; k += 2) {
      const t = clean(segs[k + 1]);
      if (t) zv.push({ v: String(cn(segs[k])), t });
    }
    await writeChapter("analects", "analects-zh", "analects", book, sequential(zv));
    vz += zv.length;
  }
  report("analects", (books.length - 1) / 2, ve);
  report("analects zh", (books.length - 1) / 2, vz);
}

/** Australian Legendary Tales: the 31 tales as chapters, paragraphs as verses. */
async function australian() {
  const txt = gutenbergBody(await cached("australian", "pg3833.txt", GUT(3833)));
  const contents = txt.slice(txt.indexOf("CONTENTS"), txt.indexOf("GLOSSARY", txt.indexOf("CONTENTS")));
  const titles = [...contents.matchAll(/^\s*(\d+)\s+(.+)$/gm)].map((m) => m[2].trim());
  await resetVersion("australian", "parker");
  let at = txt.indexOf("GLOSSARY", txt.indexOf("CONTENTS"));
  let total = 0;
  for (let i = 0; i < titles.length; i++) {
    // In the body each tale starts "12.  THE MAYAMAH".
    const s = txt.slice(at).search(new RegExp(`^${i + 1}\\.\\s+[A-Z]`, "m"));
    if (s < 0) throw new Error(`tale not found: ${titles[i]}`);
    const begin = at + s + txt.slice(at + s).indexOf("\n");
    const nextHead = i + 1 < titles.length ? new RegExp(`^${i + 2}\\.\\s+[A-Z]`, "m") : /^APPENDIX\s*$/m;
    const end = begin + txt.slice(begin).search(nextHead);
    const list = paras(txt.slice(begin, end)).map((t, k) => ({ v: String(k + 1), t }));
    // "THE GALAH, AND OOLAH THE LIZARD" → "The Galah, and Oolah the Lizard"
    const title = titles[i]
      .toLowerCase()
      .replace(/(^|[\s,(-])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase())
      .replace(/(?<=\S\s)(The|And|Of|A|In)\b/g, (w) => w.toLowerCase());
    await writeChapter("australian", "parker", "alt", i + 1, list, undefined, title);
    total += list.length;
    at = end;
  }
  report("australian", titles.length, total);
  return titles;
}

/** The Hidden Words: Part I (from the Arabic, 71) and Part II (from the Persian, 82). */
async function hidden() {
  const txt = gutenbergBody(await cached("bahai", "pg16941.txt", GUT(16941)));
  const p1 = txt.indexOf("PART I.--FROM THE ARABIC");
  const p2 = txt.indexOf("PART II--FROM THE PERSIAN");
  if (p1 < 0 || p2 < 0) throw new Error("Hidden Words: parts not found");
  await resetVersion("hidden-words", "bahai-hw");
  let total = 0;
  for (const [ch, part] of [
    [1, txt.slice(p1, p2)],
    [2, txt.slice(p2)],
  ] as const) {
    const items = part.split(/^"(\d+): [\s\S]*?"\s*$/m);
    const preamble = paras(items[0].replace(/^PART[^\n]*\n/, "").replace(/^\s*Preamble\s*$/m, ""))
      .map((t) => t.replace(/^_|_$/g, ""))
      .join(" ");
    const verses: Verse[] = [];
    for (let k = 1; k < items.length; k += 2) {
      const t = paras(items[k + 1])
        .filter((x) => !/^(Footnotes?|Notes?)$/i.test(x))
        .join(" ")
        .replace(/_/g, "");
      if (t) verses.push({ v: items[k], t });
    }
    // The last verse runs on into the closing words of the book; that's part of the text.
    await writeChapter("hidden-words", "bahai-hw", "hw", ch, verses, preamble || undefined);
    total += verses.length;
  }
  report("hidden", 2, total);
}

/** The Kitáb-i-Aqdas: its 190 numbered paragraphs (one chapter). */
async function aqdas() {
  const txt = gutenbergBody(await cached("bahai", "pg16523.txt", GUT(16523)));
  const a = txt.search(/^THE KITAB-I-AQDAS\s*$/m);
  const b = txt.search(/^SOME TEXTS REVEALED BY BAHA'U'LLAH/m);
  const body = txt.slice(a, b);
  const verses: Verse[] = [];
  for (const m of body.matchAll(/^(\d+) ([\s\S]*?)(?=^\d+ |$(?![\s\S]))/gm)) {
    const t = unwrap(m[2]).replace(/\s?#\d+/g, ""); // note numbers ("garment #4")
    verses.push({ v: m[1], t });
  }
  const nums = verses.map((v) => Number(v.v));
  if (nums.some((n, i) => n !== i + 1)) throw new Error(`Aqdas numbering off near ${nums.find((n, i) => n !== i + 1)}`);
  await resetVersion("aqdas", "bahai-aqdas");
  await writeChapter("aqdas", "bahai-aqdas", "aqdas", 1, verses);
  report("aqdas", 1, verses.length);
}

/** Raag sections → books; the short opening prayers, the Svaiyay and the closing saloks are grouped. */
const GGS_GROUP: Record<string, string> = {
  Jap: "Opening Banis (Japji, So Dar, Sohila)",
  "So Dar": "Opening Banis (Japji, So Dar, Sohila)",
  "So Purakh": "Opening Banis (Japji, So Dar, Sohila)",
  Sohila: "Opening Banis (Japji, So Dar, Sohila)",
  "Salok Sehshkritee": "Salok Sehshkritee, Gaathaa, Phunhay",
  "Gaathaa Fifth Mehl": "Salok Sehshkritee, Gaathaa, Phunhay",
  "Phunhay Fifth Mehl": "Salok Sehshkritee, Gaathaa, Phunhay",
  "Salok Vaaran Thay Vadheek": "Closing Saloks and Raagmala",
  "Salok Ninth Mehl": "Closing Saloks and Raagmala",
  Raagmala: "Closing Saloks and Raagmala",
};
const ggsBook = (raag: string) => GGS_GROUP[raag] ?? (raag.startsWith("Svaiyay") ? "Svaiyay (of the Bhatts)" : raag);
const slug = (t: string) => t.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * Sri Guru Granth Sahib in Gurmukhi and Dr. Sant Singh Khalsa's English, from Open Granth's corpus
 * (github.com/opengranth/open-granth, itself from the Shabad OS database). Book = raag section;
 * chapter = one ang (page), titled "Ang 359"; verse = line (pankti). → data/ggs-books.json
 */
async function ggs() {
  await resetVersion("ggs", "ggs-gurmukhi");
  await resetVersion("ggs", "khalsa");
  let total = 0;
  const books: { id: string; name: string; chapters: number; first: number }[] = [];
  const strip = (s: string) => s.replace(/^\*\*|\*\*$/g, "").trim();
  for (let ang = 1; ang <= 1430; ang++) {
    const name = `ang-${String(ang).padStart(4, "0")}.md`;
    const md = await cached("ggs", name, `https://raw.githubusercontent.com/opengranth/open-granth/main/corpus/${name}`);
    const raag = /^raag:\s*(.+)$/m.exec(md)?.[1].trim() ?? "";
    const bookName = ggsBook(raag);
    if (books[books.length - 1]?.name !== bookName) books.push({ id: slug(bookName), name: bookName, chapters: 0, first: ang });
    const book = books[books.length - 1];
    book.chapters++;
    const body = md.replace(/^---[\s\S]*?\n---\n/, "");
    const pa: Verse[] = [];
    const en: Verse[] = [];
    for (const block of body.split(/\n---\n/)) {
      const lines = block
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("<!--"));
      const g = lines.find((l) => l.startsWith("**"));
      if (!g) continue;
      const rest = lines.filter((l) => !l.startsWith("**") && !(l.startsWith("*") && l.endsWith("*")));
      const v = String(pa.length + 1);
      pa.push({ v, t: strip(g) });
      en.push({ v, t: rest.join(" ") || "—" });
    }
    await writeChapter("ggs", "ggs-gurmukhi", book.id, book.chapters, pa, undefined, `Ang ${ang}`);
    await writeChapter("ggs", "khalsa", book.id, book.chapters, en, undefined, `Ang ${ang}`);
    total += pa.length;
  }
  await writeFile(path.join(ROOT, "data", "ggs-books.json"), JSON.stringify(books, null, 1) + "\n");
  report("ggs", 1430, total);
  console.log(`  ${books.length} books → data/ggs-books.json`);
}

// ── Philosophy & secular thought ─────────────────────────────────────────────────────────────────

/** Split a text at heading lines; returns each heading's capture and the text up to the next one. */
function sections(text: string, head: RegExp) {
  const re = new RegExp(head.source, head.flags.includes("g") ? head.flags : head.flags + "g");
  const marks = [...text.matchAll(re)];
  return marks.map((m, i) => ({ head: m[1] ?? m[0], body: text.slice(m.index! + m[0].length, i + 1 < marks.length ? marks[i + 1].index : undefined) }));
}
/** Footnote lines ("    [A] Xenophon…") and markers ("father,[B]") out. */
const noNotes = (s: string) => s.replace(/^[ \t]+\[[A-Z0-9]+\][^\n]*(\n[ \t]+[^\n]+)*/gm, "").replace(/\[[A-Z]\]/g, "");

/** Lucretius, On the Nature of Things — William Ellery Leonard (1916), Gutenberg #785. Books I–VI. */
async function lucretius() {
  const txt = gutenbergBody(await cached("secular", "pg785.txt", GUT(785)));
  const books = sections(txt, /^BOOK ([IVX]+)\s*$/m);
  await resetVersion("lucretius", "leonard");
  let total = 0;
  for (const b of books) {
    // Paragraphs of verse; the section headings ("PROEM", "SUBSTANCE IS ETERNAL") are left out.
    const list = paras(b.body)
      .filter((p) => !/^[A-Z][A-Z\s,'’.-]+$/.test(p))
      .map((t, i) => ({ v: String(i + 1), t }));
    await writeChapter("lucretius", "leonard", "dnr", roman(b.head), list);
    total += list.length;
  }
  report("lucretius", books.length, total);
}

/** Marcus Aurelius, Meditations — George Long (1862), Gutenberg #15877. 12 books, numbered sections. */
async function meditations() {
  const txt = gutenbergBody(await cached("secular", "pg15877.txt", GUT(15877)));
  const start = txt.indexOf("THE THOUGHTS", txt.indexOf("THE THOUGHTS", txt.indexOf("INDEX OF TERMS")) + 1);
  const at = start > 0 ? start : txt.lastIndexOf("THE THOUGHTS\n");
  const end = txt.search(/^INDEXES\.\s*$/m);
  const books = sections(txt.slice(at, end > at ? end : undefined), /^([IVX]+)\.\s*$/m);
  await resetVersion("meditations", "long");
  let total = 0;
  for (const b of books) {
    const verses: Verse[] = [];
    for (const p of noNotes(b.body).split(/\n\s*\n/)) {
      const t = unwrap(p);
      if (!t) continue;
      const m = /^(\d+)\.\s+([\s\S]*)$/.exec(t);
      if (m) verses.push({ v: m[1], t: m[2] });
      else if (!verses.length) verses.push({ v: "1", t });
      else verses[verses.length - 1].t += ` ${t}`;
    }
    await writeChapter("meditations", "long", "med", roman(b.head), sequential(verses));
    total += verses.length;
  }
  report("meditations", books.length, total);
}

/** Epictetus, The Enchiridion — Thomas W. Higginson (1865), Gutenberg #45109. 53 sections, one chapter. */
async function enchiridion() {
  const txt = gutenbergBody(await cached("secular", "pg45109.txt", GUT(45109)));
  let body = txt.slice(txt.search(/^\s+THE ENCHIRIDION\s*$/m));
  body = body.slice(0, body.search(/^\s+Footnotes\s*$/m));
  // This edition's 51 sections ("XXIX[2]" carries a note mark).
  const secs = sections(body, /^\s+([IVXL]+)(?:\[\d+\])?\s*$/m);
  const verses = secs
    .map((s) => ({ v: String(roman(s.head)), t: paras(noNotes(s.body)).join(" ").replace(/\[\d+\]/g, "").replace(/_/g, "") }))
    .filter((v) => v.t);
  await resetVersion("enchiridion", "higginson");
  await writeChapter("enchiridion", "higginson", "ench", 1, sequential(verses));
  report("enchiridion", 1, verses.length);
}

/** David Hume, Dialogues Concerning Natural Religion (1779), Gutenberg #4583. 12 parts. */
async function hume() {
  const txt = gutenbergBody(await cached("secular", "pg4583.txt", GUT(4583)));
  const parts = sections(txt, /^PART (\d+)\s*$/m);
  await resetVersion("hume-dialogues", "hume");
  let total = 0;
  for (const p of parts) {
    const list = paras(p.body).map((t, i) => ({ v: String(i + 1), t }));
    await writeChapter("hume-dialogues", "hume", "dnr-hume", Number(p.head), list);
    total += list.length;
  }
  report("hume", parts.length, total);
}

/** Thomas Paine, The Age of Reason (1794–95), Gutenberg #3743. Part I and Part II as two books. */
async function paine() {
  const txt = gutenbergBody(await cached("secular", "pg3743.txt", GUT(3743)));
  const heads = [...txt.matchAll(/^CHAPTER I\.\s*$/gm)].map((m) => m.index!);
  if (heads.length < 2) throw new Error("Age of Reason: parts not found");
  const partText = [txt.slice(heads[0], heads[1]), txt.slice(heads[1])];
  await resetVersion("age-of-reason", "paine");
  let total = 0;
  for (const [k, t] of partText.entries()) {
    const chs = sections(t, /^CHAPTER ([IVXL]+)\.\s*$/m);
    for (const c of chs) {
      // The chapter's title is its first line; then paragraphs.
      const ps = paras(c.body.replace(/^[^\n]*\S[^\n]*\n/, ""));
      const title = unwrap(c.body.trim().split("\n")[0]);
      const list = ps
        .filter((x, i) => !(i === 0 && x === title) && !/^(The End|END OF)/i.test(x))
        .map((x, i) => ({ v: String(i + 1), t: x.replace(/_/g, "") }));
      if (!list.length) continue;
      await writeChapter("age-of-reason", "paine", k === 0 ? "aor1" : "aor2", roman(c.head), list, undefined, title);
      total += list.length;
    }
  }
  report("paine", 2, total);
}

// ── From sacred-texts zipped texts (downloaded by hand into data/raw) ────────────────────────────────

/** Title-case an ALL-CAPS heading ("THE ISLAND OF ONOGORO" → "The Island of Onogoro"). */
const titleCase = (s: string) =>
  s
    .toLowerCase()
    .replace(/(^|[\s(-])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase())
    .replace(/(?<=\S\s)(The|And|Of|A|An|In|To|On|At|By|With|From)\b/g, (w) => w.toLowerCase());

/** Kojiki — Basil Hall Chamberlain (1882; 1919 reprint), sacred-texts kj.txt.gz. 180 sections. */
async function kojiki() {
  const p = await sacredTextsGz("kojiki", "kj.txt.gz");
  const end = p.findIndex((x) => /^APPENDIX I\.?$/.test(x));
  const body = p.slice(0, end > 0 ? end : undefined);
  // Headings vary: "[SECT. XIII.--…]", "[SECT XV.--…]", "SECT. XXVII.--…", "[SECT. CXX: …", one with no number.
  const HEAD = /^\[?SECT\.?\s*([IVXLC]*)\s*[.:]?\s*[-—]*\s*([A-Z][^a-z]*?)\.?\]?$/;
  const heads = body.map((x, i) => [i, x] as const).filter(([, x]) => HEAD.test(x));
  await resetVersion("kojiki", "chamberlain");
  let total = 0;
  let prev = 0;
  for (const [k, [at, head]] of heads.entries()) {
    const m = HEAD.exec(head)!;
    // Misprinted numbers in the source ("XLI" for LXI, a second "CXXXV"): a number that goes backwards is the next one.
    const printed = m[1] ? roman(m[1]) : 0;
    const ch = printed > prev ? printed : prev + 1;
    // A section whose heading the source lost (XVIII): its text stays with the one before.
    for (let gap = prev + 1; gap < ch; gap++)
      await writeChapter("kojiki", "chamberlain", "kojiki", gap, [], `Section ${gap} has no heading in the source text; it is included in Section ${gap - 1}.`);
    const title = titleCase(m[2]);
    const paras = body.slice(at + 1, k + 1 < heads.length ? heads[k + 1][0] : undefined).filter((x) => !/^\[?VOL(UME)?\.? [IVX]+/i.test(x));
    await writeChapter("kojiki", "chamberlain", "kojiki", ch, numbered(paras), undefined, title);
    total += paras.length;
    prev = ch;
  }
  report("kojiki", prev, total);
}

const ORD = ["FIRST", "SECOND", "THIRD", "FOURTH", "FIFTH", "SIXTH", "SEVENTH", "EIGHTH", "NINTH", "TENTH", "ELEVENTH", "TWELFTH", "THIRTEENTH", "FOURTEENTH", "FIFTEENTH", "SIXTEENTH", "SEVENTEENTH", "EIGHTEENTH", "NINETEENTH"];
const TENS: Record<string, number> = { TWENTY: 20, THIRTY: 30, TWENTIETH: 20, THIRTIETH: 30 };
/** "TWENTY-FIRST" → 21, "SIXTH" → 6 */
function ordinal(w: string) {
  const [a, b] = w.split("-");
  if (b) return (TENS[a] ?? 0) + ORD.indexOf(b) + 1;
  return TENS[a] ?? ORD.indexOf(a) + 1;
}
/** Lines that only structure the Jaina books ("FIRST LESSON.", "CALLED", "SECOND BOOK", "PAGE"). */
const jainaStructure = (x: string) =>
  /^(\(?CALLED\)?|PAGE|([A-Z-]+ )?(LESSON|CHAPTER|PART|BOOK)\.?|[A-Z-]+ (LESSON|CHAPTER|PART|BOOK)[.,]?)$/.test(x);

/**
 * The lectures of a Jaina book as chapters: from paragraph `from` to `to`, a new chapter at each
 * "FIRST LECTURE," line; its title is the next heading line ("KNOWLEDGE OF THE WEAPON.").
 */
async function jainaBook(p: string[], from: number, to: number, work: string, book: string, prefix = (n: number) => `Lecture ${n}`) {
  const LECT = /^([A-Z]+(?:-[A-Z]+)?) LECTURE[,.]?$/;
  let ch = 0;
  let total = 0;
  let verses: string[] = [];
  let title = "";
  const flush = async () => {
    if (!ch) return;
    await writeChapter(work, "jacobi", book, ch, numbered(verses), undefined, title);
    total += verses.length;
  };
  for (let i = from; i < to; i++) {
    const x = p[i];
    if (LECT.test(x)) {
      await flush();
      ch++;
      verses = [];
      let j = i + 1;
      while (j < to && /^\(?CALLED\)?$/.test(p[j])) j++;
      // Some lectures have a name line ("KNOWLEDGE OF THE WEAPON."), others go straight into the text.
      const named = j < to && p[j].length < 90 && !/[a-z]/.test(p[j]);
      title = named ? `${prefix(ch)}: ${titleCase(p[j].replace(/\.$/, ""))}` : prefix(ch);
      i = named ? j : j - 1;
      continue;
    }
    if (!ch || jainaStructure(x) || (x.length < 70 && !/[a-z]/.test(x))) continue; // headings
    verses.push(x);
  }
  await flush();
  report(`${work}/${book}`, ch, total);
}

/** Jaina Sutras — Hermann Jacobi (SBE 22, 1884 and SBE 45, 1895), sacred-texts sbe22/sbe45.txt.gz. */
async function jaina() {
  await resetVersion("jaina", "jacobi");
  const a = await sacredTextsGz("jaina", "sbe22.txt.gz");
  // Body starts at the second "AKARANGA SUTRA." (the first is in the contents).
  const akStart = a.indexOf("AKARANGA SUTRA.", a.indexOf("AKARANGA SUTRA.") + 1);
  const kalpa = a.indexOf("KALPA SUTRA.", akStart);
  // Book I has 8 lectures (the 7th is lost; Jacobi numbers on), Book II 16.
  await jainaBook(a, akStart, kalpa, "jaina", "akaranga", (n) => (n <= 8 ? `Book I, Lecture ${n}` : `Book II, Lecture ${n - 8}`));
  // Kalpa Sutra: its three parts.
  const parts = ["LIVES OF THE GINAS", "LIST OF THE STHAVIRAS", "RULES FOR YATIS"].map((h) => a.findIndex((x, i) => i > kalpa && x.startsWith(h)));
  const end = a.findIndex((x, i) => i > parts[2] && /^INDEX/.test(x));
  let total = 0;
  for (const [k, at] of parts.entries()) {
    const list = a.slice(at + 1, parts[k + 1] ?? (end > 0 ? end : undefined)).filter((x) => !jainaStructure(x) && !/^[A-Z .,'-]+$/.test(x));
    await writeChapter("jaina", "jacobi", "kalpa", k + 1, numbered(list), undefined, titleCase(a[at].replace(/\.$/, "")));
    total += list.length;
  }
  report("jaina/kalpa", 3, total);

  const b = await sacredTextsGz("jaina", "sbe45.txt.gz");
  const utStart = b.indexOf("UTTARADHYAYANA.", b.indexOf("UTTARADHYAYANA.") + 1);
  const suStart = b.indexOf("SUTRAKRITANGA.", b.indexOf("SUTRAKRITANGA.") + 1);
  const suEnd = b.findIndex((x, i) => i > suStart && /^INDEX OF NAMES/.test(x));
  await jainaBook(b, utStart, suStart, "jaina", "uttaradhyayana");
  // Sutrakritanga: Book I has 16 lectures, Book II 7 — numbered straight through, labelled by book.
  await jainaBook(b, suStart, suEnd > 0 ? suEnd : b.length, "jaina", "sutrakritanga", (n) => (n <= 16 ? `Book I, Lecture ${n}` : `Book II, Lecture ${n - 16}`));
  void ordinal;
}

/** Myths and Legends of China — E. T. C. Werner (1922), sacred-texts mlc.txt.gz. 16 chapters. */
async function chineseMyths() {
  const p = await sacredTextsGz("chinese-myths", "mlc.txt.gz");
  const end = p.findIndex((x) => /^Glossary & Index$/.test(x));
  const heads = p.map((x, i) => [i, x] as const).filter(([i, x]) => /^Chapter [IVXL]+$/.test(x) && (end < 0 || i < end));
  await resetVersion("chinese-myths", "werner");
  let total = 0;
  for (const [k, [at, head]] of heads.entries()) {
    const title = p[at + 1];
    const stop = k + 1 < heads.length ? heads[k + 1][0] : end > 0 ? end : p.length;
    // Sub-headings ("Racial Origin") and picture captions are short lines without a full stop.
    const list = p.slice(at + 2, stop).filter((x) => !(x.length < 70 && !/[.!?:;"')]$/.test(x)));
    await writeChapter("chinese-myths", "werner", "mlc", roman(head.slice(8)), numbered(list), undefined, title);
    total += list.length;
  }
  report("chinese-myths", heads.length, total);
}

/** Yoruba Legends — M. I. Ogumefu (1929, public domain), Global Grey's EPUB edition. 40 tales. */
async function yoruba() {
  const { inflateRawSync } = await import("node:zlib");
  const { readFile } = await import("node:fs/promises");
  const buf = await readFile(path.join(ROOT, "data", "raw", "yoruba", "yoruba-legends.epub"));
  // A tiny ZIP reader: walk the local file headers and inflate each HTML file.
  const files = new Map<string, string>();
  for (let at = 0; buf.readUInt32LE(at) === 0x04034b50; ) {
    const method = buf.readUInt16LE(at + 8);
    const size = buf.readUInt32LE(at + 18);
    const nameLen = buf.readUInt16LE(at + 26);
    const extra = buf.readUInt16LE(at + 28);
    const name = buf.toString("utf8", at + 30, at + 30 + nameLen);
    const data = buf.subarray(at + 30 + nameLen + extra, at + 30 + nameLen + extra + size);
    if (name.endsWith(".html")) files.set(name, (method === 8 ? inflateRawSync(data) : data).toString("utf8"));
    at += 30 + nameLen + extra + size;
  }
  await resetVersion("yoruba", "ogumefu");
  let ch = 0;
  let total = 0;
  for (const [name, html] of [...files].sort((a, b) => a[0].localeCompare(b[0]))) {
    // Headings carry markup for the underdotted letters ("Ol<span>o</span>fin"): tags out, letters kept.
    const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    const h = h1 ? /^(\d+)\.\s*(.*)$/.exec(h1) : null;
    if (!h) continue; // title page, contents, preface
    const paras = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
      .map((m) => decodeEntities(m[1].replace(/<\/?span[^>]*>/gi, "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim())
      .filter(Boolean)
      // The book opens each tale with a word in capitals ("THE ancient King…").
      .map((t, i) => (i === 0 ? t.replace(/^([A-Z])([A-Z]+)\b/, (_, a: string, b: string) => a + b.toLowerCase()) : t));
    ch = Number(h[1]);
    await writeChapter("yoruba", "ogumefu", "yl", ch, numbered(paras), undefined, decodeEntities(h[2]).trim());
    total += paras.length;
    void name;
  }
  report("yoruba", ch, total);
}

/**
 * Zhuangzi — Herbert A. Giles, "Chuang Tzŭ: Mystic, Moralist, and Social Reformer" (1889), Gutenberg
 * #59709. 33 chapters; Giles' indented commentary and chapter "Argument" summaries are left out.
 */
async function zhuangzi() {
  const all = gutenbergBody(await cached("zhuangzi", "pg59709.txt", GUT(59709)));
  const txt = all.slice(0, all.search(/^_INDEX_\s*$/m)); // the index, errata and transcriber's notes follow
  const chs = sections(txt, /^CHAPTER ([IVXL]+)\.\s*$/m);
  await resetVersion("zhuangzi", "giles");
  let total = 0;
  for (const c of chs) {
    const blocks = c.body.split(/\n\s*\n/);
    const title = unwrap(blocks.find((b) => b.trim()) ?? "").replace(/\.$/, "");
    const verses = blocks
      .slice(blocks.findIndex((b) => b.trim()) + 1)
      .filter((b) => b.trim() && !/^[ \t]/.test(b) && !/^\s*_Argument_/.test(b)) // Giles' notes are indented
      .map((b) => unwrap(b).replace(/_/g, "").replace(/\[\d+\]/g, ""))
      .filter((t) => t && !/^(FOOTNOTES?|INDEX)\b/.test(t))
      // A paragraph cut by an indented note ("He who goes to Mang-ts'ang," … "taking three meals…") is one.
      .reduce<string[]>((acc, t) => {
        const prev = acc[acc.length - 1];
        if (prev && (!/[.!?"'’”:)]$/.test(prev) || /^[a-z]/.test(t))) acc[acc.length - 1] = `${prev} ${t}`;
        else acc.push(t);
        return acc;
      }, []);
    if (!verses.length) continue;
    await writeChapter("zhuangzi", "giles", "zhuangzi", roman(c.head), numbered(verses), undefined, titleCase(title));
    total += verses.length;
  }
  report("zhuangzi", chs.length, total);
}

/** Navaho Legends — Washington Matthews (1897), Gutenberg #60165: the Origin Legend's four parts and two more legends. */
async function navaho() {
  const txt = gutenbergBody(await cached("navaho", "pg60165.txt", GUT(60165)));
  const start = txt.search(/^LEGENDS\.\s*$/m);
  const body = txt.slice(start, txt.indexOf("\nNOTES.", start));
  const heads = [
    [/^I\. THE STORY OF THE EMERGENCE\.\s*$/m, "The Origin Legend: The Story of the Emergence"],
    [/^II\. EARLY EVENTS IN THE FIFTH WORLD\.\s*$/m, "The Origin Legend: Early Events in the Fifth World"],
    [/^III\. THE WAR GODS\.\s*$/m, "The Origin Legend: The War Gods"],
    [/^IV\. GROWTH OF THE NAVAHO NATION\.\s*$/m, "The Origin Legend: Growth of the Navaho Nation"],
    [/^NATI'NESTHANI\.\s*$/m, "Nati'nesthani"],
    [/^THE GREAT SHELL OF KINTYÉL\.\s*$/m, "The Great Shell of Kintyél"],
  ] as const;
  const at = heads.map(([re]) => body.search(re));
  if (at.some((x) => x < 0)) throw new Error(`Navaho: heading missing (${at})`);
  await resetVersion("navaho", "matthews");
  let total = 0;
  for (const [k, [, title]] of heads.entries()) {
    const chunk = body.slice(body.indexOf("\n", at[k]), at[k + 1] ?? undefined);
    // Matthews numbers his paragraphs straight through the book ("136."): kept as the verse label.
    const verses: Verse[] = [];
    for (const p of paras(chunk)) {
      const t = p.replace(/\[\d+\]/g, "").replace(/\s+/g, " ").trim();
      if (!t || /^[A-Z .'`-]+$/.test(t)) continue; // stray headings
      const m = /^(\d+)\.\s+(.*)$/.exec(t);
      if (m) verses.push({ v: String(verses.length + 1), t: m[2], n: `§${m[1]}` });
      else if (verses.length) verses[verses.length - 1].t += ` ${t}`;
      else verses.push({ v: "1", t });
    }
    await writeChapter("navaho", "matthews", "navaho", k + 1, verses, undefined, title);
    total += verses.length;
  }
  report("navaho", heads.length, total);
}

/** Myths and Legends of the Sioux — Marie L. McLaughlin (1916), Gutenberg #341. One story per chapter. */
async function sioux() {
  const raw = gutenbergBody(await cached("sioux", "pg341.txt", GUT(341)));
  // The transcriber's list of corrections at the end is not part of the book.
  const cut = raw.search(/^\s*Note: I have made the following changes/m);
  const txt = cut >= 0 ? raw.slice(0, cut) : raw;
  // Story titles are lines in capitals after the introduction ("THE PET RABBIT"); a title may wrap.
  const first = txt.search(/^THE PET RABBIT\s*$/m);
  const lines = txt.slice(first).split("\n");
  const stories: { title: string; body: string[] }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    const isTitle = /^[A-Z][A-Z ,.'-]{5,}$/.test(l) && (i === 0 || !lines[i - 1].trim());
    if (isTitle) {
      // A wrapped title ("…THE NAME OF THE LONE" / "WARRIOR").
      let title = l;
      while (/^[A-Z][A-Z ,.'-]+$/.test(lines[i + 1]?.trim() ?? "") && lines[i + 1].trim()) title += ` ${lines[++i].trim()}`;
      stories.push({ title, body: [] });
    } else if (stories.length) stories[stories.length - 1].body.push(lines[i]);
  }
  await resetVersion("sioux", "mclaughlin");
  let total = 0;
  for (const [k, s] of stories.entries()) {
    const verses = paras(s.body.join("\n")).map((t, i) => ({ v: String(i + 1), t }));
    await writeChapter("sioux", "mclaughlin", "sioux", k + 1, verses, undefined, titleCase(s.title));
    total += verses.length;
  }
  report("sioux", stories.length, total);
}

const ALL: Record<string, () => Promise<unknown>> = {
  zhuangzi,
  navaho,
  sioux,
  kojiki,
  yoruba,
  chineseMyths,
  jaina,
  ttc,
  analects,
  australian,
  hidden,
  aqdas,
  ggs,
  lucretius,
  meditations,
  enchiridion,
  hume,
  paine,
};

async function main() {
  const want = process.argv.slice(2);
  for (const [name, fn] of Object.entries(ALL)) if (!want.length || want.includes(name)) await fn();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
