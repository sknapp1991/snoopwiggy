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
import { cached, gutenbergBody, resetVersion, roman, writeChapter, type Verse } from "./lib/world";

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

const ALL: Record<string, () => Promise<unknown>> = { ttc, analects, australian, hidden, aqdas };

async function main() {
  const want = process.argv.slice(2);
  for (const [name, fn] of Object.entries(ALL)) if (!want.length || want.includes(name)) await fn();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
