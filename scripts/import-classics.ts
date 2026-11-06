/**
 * Classics from Project Gutenberg (all public domain): Greek & Roman texts, philosophy, psychology.
 * One small configuration per book: where its chapters start (a heading pattern), where the book
 * text starts and ends, and how chapters are titled. A heading followed by almost no text is a
 * table-of-contents line and is skipped. Paragraphs become verses; footnote marks and blocks are
 * left out. Large works are split into several books (e.g. Montaigne's three books).
 *
 *   npx tsx scripts/import-classics.ts            (all)
 *   npx tsx scripts/import-classics.ts iliad      (some, by work id)
 *
 * → data/texts/<work>/<version>/<book>/<n>.json and data/classics-books.json (catalog items)
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { cached, gutenbergBody, resetVersion, ROOT, roman, writeChapter, type Verse } from "./lib/world";

const GUT = (id: number) => `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`;
const unwrap = (s: string) => s.replace(/\s+/g, " ").trim();

type Book = {
  /** Book id within the work (default: the work id). */
  id?: string;
  name?: string;
  /** Where this book's text starts / ends (first match; `nth` picks a later one, e.g. after a contents list). */
  from?: RegExp;
  fromNth?: number;
  to?: RegExp;
  /** Chapter heading line. Capture 1 (optional): a numeral; capture 2 (optional): the title. */
  head: RegExp;
  /** Take the title from the next non-empty line when it looks like one (short, no full stop at the end). */
  titleNext?: boolean;
  /** Chapters with less text than this are contents lines (default 600 characters). */
  minLen?: number;
  /** A fixed title prefix ("Book", "Lecture"); default from the heading line itself. */
  label?: string;
  /** The numbering starts again at 1 for each part (Jung's two parts). */
  parts?: boolean;
  /** This book comes from another Gutenberg file than the work's (e.g. a second volume). */
  gid?: number;
  /** Added to the chapter numbers in titles (Ovid's second volume starts at Book 8). */
  offset?: number;
};
type Work = {
  work: string;
  version: string;
  gid: number;
  books: Book[];
};

const LOWER = /(?<=\S\s)(The|And|Of|A|An|In|To|On|At|By|With|From|For|As|Or|Is|Its)\b/g;
const titleCase = (s: string) =>
  s
    .toLowerCase()
    .replace(/(^|[\s("'‘“-])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase())
    .replace(LOWER, (w) => w.toLowerCase());
const isCaps = (s: string) => /[A-Z]/.test(s) && !/[a-z]/.test(s);

/** A chapter's text → verses: one per paragraph, without footnotes, page marks or italics markers. */
function verses(body: string): Verse[] {
  const cut = body.search(/^\s*(FOOTNOTES?|NOTES?|ENDNOTES?)[:.]?\s*$/m);
  const text = cut > 0 ? body.slice(0, cut) : body;
  return text
    .split(/\n\s*\n/)
    .map((p) => unwrap(p))
    .filter((t) => t && !/^\[(Footnote|Illustration|Sidenote)/i.test(t) && !/^\{?\d+\}?$/.test(t) && !/^[*\s.]+$/.test(t))
    .map((t) => t.replace(/\s?\[\d+[a-z]?\]/g, "").replace(/\{\d+\}/g, "").replace(/(^|\W)_(?=\S)|(?<=\S)_(?=\W|$)/g, "$1").trim())
    .filter(Boolean)
    .map((t, i) => ({ v: String(i + 1), t }));
}

function chapters(txt: string, b: Book) {
  let start = 0;
  if (b.from) {
    const all = [...txt.matchAll(new RegExp(b.from.source, b.from.flags.includes("g") ? b.from.flags : b.from.flags + "g"))];
    const m = all[(b.fromNth ?? 1) - 1];
    if (!m) throw new Error(`start not found: ${b.from}`);
    start = m.index!;
  }
  let end = txt.length;
  if (b.to) {
    const re = new RegExp(b.to.source, b.to.flags.replace("g", ""));
    const at = txt.slice(start + 1).search(re);
    if (at >= 0) end = start + 1 + at;
  }
  const part = txt.slice(start, end);
  const re = new RegExp(b.head.source, b.head.flags.includes("g") ? b.head.flags : b.head.flags + "g");
  const marks = [...part.matchAll(re)];
  const out: { title: string; verses: Verse[]; num: number | null }[] = [];
  marks.forEach((m, k) => {
    const bodyStart = m.index! + m[0].length;
    let body = part.slice(bodyStart, k + 1 < marks.length ? marks[k + 1].index : undefined);
    // The last chapter runs into the book's back matter (index, appendix, notes, transcriber's notes).
    if (k === marks.length - 1) {
      const end = body.search(/^\s*(INDEX|Index|APPENDIX|NOTES|NOTES ON\b.*|TRANSCRIBER[’']S NOTES?|Transcriber[’']s notes?:?|ETEXT EDITOR[’']S BOOKMARKS.*)[.:]?\s*$/m);
      if (end > 0) body = body.slice(0, end);
    }
    if (body.replace(/\s+/g, "").length < (b.minLen ?? 600)) return; // a contents line
    let title = (m[2] ?? "").trim().replace(/[.:]$/, "");
    if (b.titleNext) {
      const lines = body.split("\n");
      const i = lines.findIndex((l) => l.trim());
      const cand = lines[i]?.trim() ?? "";
      if (cand && cand.length < 90 && !/[.,;]$/.test(cand.replace(/\.$/, "")) && (isCaps(cand) || cand.length < 60)) {
        title = cand.replace(/\.$/, "");
        body = lines.slice(i + 1).join("\n");
      }
    }
    const numeral = m[1] && /^(\d+|[IVXLC]+)$/.test(m[1]) ? (/^\d+$/.test(m[1]) ? Number(m[1]) : roman(m[1])) : null;
    const num = numeral ?? out.length + 1;
    const prefix = b.label ? `${b.label} ${num + (b.offset ?? 0)}` : "";
    const nice = title ? (isCaps(title) ? titleCase(title) : title).replace(/_/g, "") : "";
    out.push({ title: [prefix, nice].filter(Boolean).join(": "), verses: verses(body), num: numeral });
  });
  // Follow the book's own numbering: start at 1, then only the next number (a restart at 1 begins a
  // new part, as in Le Bon or Jung). Headings in an introduction or a contents list fall away.
  // A small gap (a missing or very short chapter, e.g. a two-line hymn) is allowed.
  const kept: typeof out = [];
  let last = 0;
  for (const c of out) {
    if (c.num === null) kept.push(c);
    else if (last === 0 ? c.num === 1 : c.num > last && c.num - last <= 3) (kept.push(c), (last = c.num));
    else if (b.parts && c.num === 1 && kept.length) (kept.push(c), (last = 1));
  }
  return kept.filter((c) => c.verses.length);
}

const W: Work[] = [
  // ── Greek & Roman ──
  { work: "iliad", version: "butler-il", gid: 2199, books: [{ head: /^\s*BOOK ([IVXL]+)\.\s*$/m, label: "Book" }] },
  { work: "odyssey", version: "butler-od", gid: 1727, books: [{ head: /^\s*BOOK ([IVXL]+)\.?\s*$/m, label: "Book" }] },
  {
    work: "hesiod",
    version: "evelyn-white",
    gid: 348,
    books: [
      { id: "works-days", name: "Works and Days", from: /^HESIOD’S WORKS AND DAYS\s*$/m, to: /^THE THEOGONY\s*$/m, head: /^HESIOD’S WORKS AND DAYS\s*$/m },
      { id: "theogony", name: "Theogony", from: /^THE THEOGONY\s*$/m, to: /^THE CATALOGUES OF WOMEN/m, head: /^THE THEOGONY\s*$/m },
      { id: "homeric-hymns", name: "The Homeric Hymns", from: /^THE HOMERIC HYMNS\s*$/m, to: /^(HOMERICA|THE BATTLE OF FROGS)/m, head: /^([IVXL]+)\. (TO [^\n]+?)(?:\s+\d+)?\s*$/m, minLen: 80 },
    ],
  },
  { work: "aeneid", version: "dryden", gid: 228, books: [{ head: /^\s*BOOK ([IVXL]+)\s*$/m, label: "Book" }] },
  {
    work: "metamorphoses",
    version: "riley",
    gid: 21765,
    books: [
      { head: /^BOOK ([IVXL]+)\.\s*$/m, label: "Book" },
      { id: "metamorphoses-2", name: "Metamorphoses (Books VIII–XV)", gid: 26073, head: /^BOOK THE [A-Z]+\.\s*$/m, label: "Book", offset: 7 },
    ],
  },
  {
    work: "plato-dialogues",
    version: "jowett-dial",
    gid: 1656,
    books: [
      { id: "apology", name: "Apology", head: /^APOLOGY\s*$/m, minLen: 2000 },
      { id: "symposium", name: "Symposium", gid: 1600, from: /^SYMPOSIUM\s*$/m, fromNth: 2, head: /^PERSONS OF THE DIALOGUE[^\n]*$/m },
      { id: "phaedo", name: "Phaedo", gid: 1658, from: /^PHAEDO\s*$/m, fromNth: 2, head: /^PERSONS OF THE DIALOGUE[^\n]*$/m },
      { id: "phaedrus", name: "Phaedrus", gid: 1636, from: /^PHAEDRUS\s*$/m, fromNth: 2, head: /^PERSONS OF THE DIALOGUE[^\n]*$/m },
    ],
  },
  // ── Philosophy ──
  { work: "republic", version: "jowett-rep", gid: 1497, books: [{ from: /^\s*PERSONS OF THE DIALOGUE/m, head: /^\s*BOOK ([IVXL]+)\.\s*$/m, label: "Book" }] },
  { work: "nicomachean", version: "chase", gid: 8438, books: [{ head: /^\s*BOOK ([IVXL]+)\s*$/m, label: "Book" }] },
  { work: "pensees", version: "trotter", gid: 18269, books: [{ head: /^SECTION ([IVXL]+)\s*$/m, titleNext: true, label: "Section" }] },
  { work: "discourse-method", version: "veitch", gid: 59, books: [{ head: /^\s*PART ([IVX]+)\s*$/m, label: "Part" }] },
  { work: "spinoza-ethics", version: "elwes", gid: 3800, books: [{ head: /^PART ([IVX]+)[.:]([^\n]*)$/im, label: "Part" }] },
  {
    work: "emerson-essays",
    version: "emerson",
    gid: 2944,
    books: [{ head: /^(?:([IVX]+)\.\s+)?(HISTORY|SELF-RELIANCE|COMPENSATION|SPIRITUAL LAWS|LOVE|FRIENDSHIP|PRUDENCE|HEROISM|THE OVER-SOUL|CIRCLES|INTELLECT|ART)\s*$/m, minLen: 3000 }],
  },
  { work: "on-liberty", version: "mill", gid: 34901, books: [{ head: /^CHAPTER ([IVX]+)\.\s*$/m, titleNext: true, label: "Chapter" }] },
  { work: "russell-problems", version: "russell", gid: 5827, books: [{ head: /^CHAPTER ([IVX]+)\.\s*([^\n]*)$/m, label: "Chapter" }] },
  { work: "zarathustra", version: "common", gid: 1998, books: [{ head: /^\s*([IVXLC]+)\.\s+([A-Z][A-Z’' ,;!?-]+)\.?\s*$/m, minLen: 400 }] },
  { work: "beyond-good-evil", version: "zimmern", gid: 4363, books: [{ head: /^\s*CHAPTER ([IVX]+)[.:]?\s*([^\n]*)$/m, label: "Chapter" }] },
  { work: "wisdom-of-life", version: "saunders", gid: 10741, books: [{ head: /^CHAPTER ([IVX]+)\.\s*$/m, titleNext: true, label: "Chapter" }] },
  { work: "seneca-morals", version: "lestrange", gid: 56075, books: [{ head: /^CHAPTER ([IVXL]+)\.\s*$/m, titleNext: true, parts: true, minLen: 150 }] },
  {
    work: "montaigne",
    version: "cotton",
    gid: 3600,
    books: [
      { id: "montaigne-1", name: "Essays, Book I", from: /^\s*BOOK THE FIRST\s*$/m, to: /^\s*BOOK THE SECOND\s*$/m, head: /^\s*CHAPTER\s+([IVXL]+)\.?\s*$/m, titleNext: true, minLen: 150 },
      { id: "montaigne-2", name: "Essays, Book II", from: /^\s*BOOK THE SECOND\s*$/m, to: /^\s*BOOK THE THIRD\s*$/m, head: /^\s*CHAPTER\s+([IVXL]+)\.?\s*$/m, titleNext: true, minLen: 150 },
      { id: "montaigne-3", name: "Essays, Book III", from: /^\s*BOOK THE THIRD\s*$/m, head: /^\s*CHAPTER\s+([IVXL]+)\.?\s*$/m, titleNext: true, minLen: 150 },
    ],
  },
  { work: "confessions", version: "pusey", gid: 3296, books: [{ head: /^\s*BOOK ([IVXL]+)\s*$/m, label: "Book" }] },
  {
    work: "imitation",
    version: "benham",
    gid: 1653,
    books: [1, 2, 3, 4].map((n) => ({
      id: `imitation-${n}`,
      name: `The Imitation of Christ, Book ${["I", "II", "III", "IV"][n - 1]}`,
      from: new RegExp(`^THE ${["FIRST", "SECOND", "THIRD", "FOURTH"][n - 1]} BOOK\\s*$`, "m"),
      to: n < 4 ? new RegExp(`^THE ${["SECOND", "THIRD", "FOURTH"][n - 1]} BOOK\\s*$`, "m") : undefined,
      head: /^\s*CHAPTER ([IVXL]+)\.?\s+([^\n]+)$/m,
      minLen: 150,
    })),
  },
  { work: "leviathan", version: "hobbes", gid: 3207, books: [{ head: /^CHAPTER ([IVXL]+)\.\s*([^\n]*)$/m, label: "Chapter" }] },
  { work: "second-treatise", version: "locke", gid: 7370, books: [{ head: /^CHAPTER\. ([IVXL]+)\.\s*$/m, titleNext: true, label: "Chapter" }] },
  {
    work: "social-contract",
    version: "cole",
    gid: 46333,
    books: [{ from: /^THE SOCIAL CONTRACT\s*$/m, fromNth: 2, to: /^A DISCOURSE ON THE ARTS AND SCIENCES\s*$/m, head: /^\s*CHAPTER ([IVXL]+)\s*$/m, titleNext: true, parts: true, minLen: 300 }],
  },
  // ── Psychology ──
  { work: "the-crowd", version: "le-bon", gid: 445, books: [{ head: /^\s*CHAPTER ([IVX]+)\.?\s*$/m, titleNext: true, parts: true, label: "Chapter" }] },
  { work: "varieties", version: "james", gid: 621, books: [{ head: /^\s*LECTURES? ([IVXL]+)(?:,? (?:AND )?[IVXL]+)*\.\s*([^\n]*)$/m }] },
  { work: "freud-intro", version: "hall", gid: 38219, books: [{ head: /^([A-Z-]+) LECTURE\s*$/m, titleNext: true }] },
  { work: "jung-unconscious", version: "hinkle", gid: 65903, books: [{ head: /^\s*CHAPTER ([IVX]+)\s*$/m, titleNext: true, minLen: 2000, parts: true }] },
];

async function main() {
  const want = process.argv.slice(2);
  const items: { work: string; id: string; name?: string; chapters: number }[] = [];
  for (const w of W) {
    if (want.length && !want.includes(w.work)) continue;
    const main = gutenbergBody(await cached("classics", `pg${w.gid}.txt`, GUT(w.gid)));
    await resetVersion(w.work, w.version);
    for (const b of w.books) {
      const txt = b.gid ? gutenbergBody(await cached("classics", `pg${b.gid}.txt`, GUT(b.gid))) : main;
      const chs = chapters(txt, b);
      const id = b.id ?? w.work;
      for (const [k, c] of chs.entries()) await writeChapter(w.work, w.version, id, k + 1, c.verses, undefined, c.title || undefined);
      const nv = chs.reduce((n, c) => n + c.verses.length, 0);
      console.log(`${w.work.padEnd(18)} ${id.padEnd(16)} ${String(chs.length).padStart(3)} chapters ${String(nv).padStart(6)} verses   ${chs.slice(0, 2).map((c) => c.title).join(" | ")}`);
      items.push({ work: w.work, id, name: b.name, chapters: chs.length });
    }
  }
  if (!want.length) await writeFile(path.join(ROOT, "data", "classics-books.json"), JSON.stringify(items, null, 1) + "\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
