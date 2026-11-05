/**
 * Import the four Vedas (Hinduism) — Ralph T. H. Griffith's translations (public domain), from the
 * Internet Sacred Text Archive. English only: the site's Sanskrit is a machine conversion with errors.
 *   - Rig Veda (1896): 10 books (mandalas); chapter = hymn, so RV 1.1 = Rig Veda book 1, chapter 1
 *   - Sama Veda (1895): one book; chapter = each "Chapter" of the two Parts; verses labelled by decade
 *   - White Yajur Veda (1899): one book; chapter = each of its 40 books
 *   - Atharva Veda (1895–96): 20 books; chapter = hymn
 * Hymn headings become chapter titles ("Agni"). Page numbers, notes and navigation are left out.
 *
 * Pages are fetched with curl beforehand into data/raw/rigveda and data/raw/vedas (the site blocks
 * Node's fetch); see the commit that added this script.
 *   npx tsx scripts/import-vedas.ts  → data/texts/vedas/griffith/... and data/vedas-books.json
 */
import { readdir, readFile, rm, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chapterSchema } from "../src/lib/schema";
import { namedEntity, SITE_FOOTER } from "./lib/sacred-texts";

const ROOT = path.resolve(__dirname, "..");
const RV = path.join(ROOT, "data", "raw", "rigveda");
const VD = path.join(ROOT, "data", "raw", "vedas");
const OUT = path.join(ROOT, "data", "texts", "vedas");

const ENT: Record<string, string> = { nbsp: " ", amp: "&", quot: '"', lt: "<", gt: ">", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", acirc: "â", Acirc: "Â", icirc: "î", Icirc: "Î", ucirc: "û", Ucirc: "Û", ecirc: "ê", ocirc: "ô", eacute: "é", aelig: "æ", ntilde: "ñ", uuml: "ü", ouml: "ö", auml: "ä" };
const CP1252: Record<number, string> = { 133: "…", 145: "‘", 146: "’", 147: "“", 148: "”", 150: "–", 151: "—" };
const decodeOnce = (s: string) =>
  s
    .replace(/\[paragraph continues\]/gi, " ") // sacred-texts' page-break marker
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => CP1252[Number(n)] ?? String.fromCodePoint(Number(n)))
    .replace(/&(\w+);/g, (m, n: string) => ENT[n] ?? namedEntity(n) ?? m)
    .replace(SITE_FOOTER, " ");
const decode = (s: string) => decodeOnce(decodeOnce(s));
const tidy = (s: string) => s.replace(/\s+/g, " ").replace(/\s+([,.;:!?)])/g, "$1").trim();
const ROMAN: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100 };
const roman = (r: string) => [...r.toUpperCase()].reduce((acc, c, i, a) => (ROMAN[c] < (ROMAN[a[i + 1]] ?? 0) ? acc - ROMAN[c] : acc + ROMAN[c]), 0);

type V = { v: string; t: string; n?: string };
type Ch = { title?: string; verses: V[] };

/** The page's own content (between the site header and the navigation). */
function content(h: string) {
  const head = h.search(/at sacred-texts\.com<\/FONT><\/P>/i);
  if (head >= 0) h = h.slice(head).replace(/^[\s\S]*?<HR>/i, "");
  const foot = h.search(/<h3[^>]*>\s*Footnotes|<div class="filenav">|<p>\s*<HR>|<HR>\s*<CENTER>/i);
  if (foot >= 0) h = h.slice(0, foot);
  return h
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<a name="page_[^"]*">[\s\S]*?<\/a>/gi, " ")
    .replace(/<A NAME="fr_[^"]*"><\/A>/gi, "")
    .replace(/<a href="#fn_[^"]*">[\s\S]*?<\/a>/gi, "");
}
/** HTML → lines of text (one per <br> / paragraph). */
const lines = (h: string) =>
  decode(h.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, " "))
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .filter(Boolean);
const heading = (h: string, tag: string) => {
  const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i").exec(h);
  return m ? tidy(decode(m[1].replace(/<[^>]+>/g, ""))) : undefined;
};

/** Lines starting "12 " / "12. " begin verse 12 (only in counting order); other lines continue. */
function numbered(ls: string[], opts: { dot?: boolean; firstUnnumbered?: boolean } = {}): V[] {
  const out: V[] = [];
  let expect = 1;
  const re = opts.dot ? /^(\d{1,3})\.\s+(.*)$/ : /^(\d{1,3})\.?\s+(.*)$/;
  for (const l of ls) {
    const m = re.exec(l);
    const n = m ? Number(m[1]) : NaN;
    if (m && (n === expect || (n > expect && n <= expect + 2))) {
      out.push({ v: String(n), t: m[2] });
      expect = n + 1;
    } else if (out.length) out[out.length - 1].t += ` ${l}`;
    else if (opts.firstUnnumbered) {
      out.push({ v: "1", t: l });
      expect = 2;
    }
  }
  return out.map((x) => ({ ...x, t: tidy(x.t) })).filter((x) => x.t);
}

/** "… Desire the mortar. 4. Diti is …" — a verse whose number sits inside the one before (AV 11.3.3–4). */
function splitRunTogether(list: V[]): V[] {
  const out: V[] = [];
  const have = new Set(list.map((x) => x.v));
  for (const x of list) {
    const next = String(Number(x.v) + 1);
    const m = /^\d+$/.test(x.v) && !have.has(next) ? new RegExp(`(?<=[.;:!?'"’”] )${next}\\. (?=[A-Z])`).exec(x.t) : null;
    if (!m) {
      out.push(x);
      continue;
    }
    out.push({ ...x, t: x.t.slice(0, m.index).trim() }, { ...x, v: next, t: x.t.slice(m.index + m[0].length).trim() });
    have.add(next);
  }
  return out;
}

async function write(book: string, chapters: Ch[]) {
  for (const [i, c] of chapters.entries()) {
    const ch = i + 1;
    const verses = splitRunTogether(c.verses);
    const data = chapterSchema.parse({ work: "vedas", version: "griffith", book, chapter: ch, verses, ...(c.title ? { title: c.title } : {}), ...(verses.length ? {} : { note: "No text on this page of the edition." }) });
    const dir = path.join(OUT, "griffith", book);
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, `${ch}.json`),
      `{"work":"vedas","version":"griffith","book":"${book}","chapter":${ch}${data.title ? `,"title":${JSON.stringify(data.title)}` : ""}${data.note ? `,"note":${JSON.stringify(data.note)}` : ""},"verses":[\n${data.verses.map((x) => JSON.stringify(x)).join(",\n")}\n]}\n`,
    );
  }
}

/** "HYMN XII. Agni." → "Agni" */
const hymnTitle = (t?: string) => t?.replace(/^HYMN\s+[IVXLC]+\.?\s*/i, "").replace(/\.$/, "").trim() || undefined;

async function main() {
  await rm(OUT, { recursive: true, force: true });
  const books: { id: string; name: string; collection: string; chapters: number; chapterName: string }[] = [];

  // Rig Veda: rvBBHHH.htm
  const rvFiles = (await readdir(RV)).filter((f) => /^rv\d{5}\.htm$/.test(f)).sort();
  for (let b = 1; b <= 10; b++) {
    const files = rvFiles.filter((f) => f.startsWith(`rv${String(b).padStart(2, "0")}`));
    const chapters: Ch[] = [];
    for (const f of files) {
      const h = content(await readFile(path.join(RV, f), "utf8"));
      chapters.push({ title: hymnTitle(heading(h, "h3")), verses: numbered(lines(h.replace(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/gi, " "))) });
    }
    await write(`rv${b}`, chapters);
    books.push({ id: `rv${b}`, name: `Rig Veda, Book ${b}`, collection: "rigveda", chapters: chapters.length, chapterName: `Rig Veda ${b}.` });
    console.log(`Rig Veda ${b}: ${chapters.length} hymns, ${chapters.reduce((s, c) => s + c.verses.length, 0)} verses`);
  }

  // Atharva Veda: avBBHHH.htm, verse numbers in margin notes.
  const avFiles = (await readdir(VD)).filter((f) => /^av\d{5}\.htm$/.test(f)).sort();
  for (let b = 1; b <= 20; b++) {
    const files = avFiles.filter((f) => f.startsWith(`av${String(b).padStart(2, "0")}`));
    if (!files.length) continue;
    const chapters: Ch[] = [];
    for (const f of files) {
      let h = content(await readFile(path.join(VD, f), "utf8"));
      const title = heading(h, "h4") ?? hymnTitle(heading(h, "h3"));
      h = h.replace(/<span class="margnote">[\s\S]*?<A NAME="an_[^"]*">\s*(\d+)\s*<\/A>[\s\S]*?<\/span>/gi, "\n$1 ");
      chapters.push({ title, verses: numbered(lines(h.replace(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/gi, " ")), { firstUnnumbered: true }) });
    }
    await write(`av${b}`, chapters);
    books.push({ id: `av${b}`, name: `Atharva Veda, Book ${b}`, collection: "atharvaveda", chapters: chapters.length, chapterName: `Atharva Veda ${b}.` });
    console.log(`Atharva Veda ${b}: ${chapters.length} hymns`);
  }

  // White Yajur Veda: wyvbkNN.htm, one page per book; the first verse has no number.
  {
    const chapters: Ch[] = [];
    for (let b = 1; b <= 40; b++) {
      const f = path.join(VD, `wyvbk${String(b).padStart(2, "0")}.htm`);
      const h = content(await readFile(f, "utf8").catch(() => ""));
      if (!h) continue;
      chapters.push({ verses: numbered(lines(h.replace(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/gi, " ")), { firstUnnumbered: true }) });
    }
    await write("wyv", chapters);
    books.push({ id: "wyv", name: "White Yajur Veda (Vajasaneyi Samhita)", collection: "yajurveda", chapters: chapters.length, chapterName: "White Yajur Veda, Book" });
    console.log(`White Yajur Veda: ${chapters.length} books`);
  }

  // Sama Veda: one page; H1 parts, H2 books, H3 chapters, H4 decades, "1." verses (restart per decade).
  {
    let h = await readFile(path.join(VD, "sv.htm"), "utf8");
    h = h.slice(h.search(/HYMNS OF THE SAMAVEDA/i));
    const chapters: Ch[] = [];
    let part = "";
    let book = "";
    let decade = "";
    let cur: Ch | null = null;
    let expect = 1;
    const tokens = h.split(/(<H[1-4][^>]*>[\s\S]*?<\/H[1-4]>)/i);
    for (const tok of tokens) {
      const hm = /^<H([1-4])[^>]*>([\s\S]*?)<\/H[1-4]>$/i.exec(tok);
      if (hm) {
        const text = tidy(decode(hm[2].replace(/<[^>]+>/g, "")));
        if (hm[1] === "1" && /PART/i.test(text)) part = /SECOND/i.test(text) ? "Part II" : "Part I";
        else if (hm[1] === "2") book = text.replace(/^BOOK\s+/i, "Book ");
        else if (hm[1] === "3") {
          cur = { title: `${part}, ${book}, ${text.replace(/^CHAPTER\s+/i, "Chapter ")}`.replace(/^, /, ""), verses: [] };
          chapters.push(cur);
          decade = "";
          expect = 1;
        } else if (hm[1] === "4") {
          const d = /DECADE\s+([IVXLC]+)/i.exec(text);
          decade = d ? String(roman(d[1])) : "";
          expect = 1;
        }
        continue;
      }
      if (!cur) continue;
      for (const l of lines(tok)) {
        const m = /^(\d{1,3})\.\s+(.*)$/.exec(l);
        const n = m ? Number(m[1]) : NaN;
        if (m && (n === expect || (n > expect && n <= expect + 2) || n === 1)) {
          cur.verses.push({ v: String(cur.verses.length + 1), t: m[2], n: decade ? `${decade}.${n}` : String(n) });
          expect = n + 1;
        } else if (cur.verses.length) cur.verses[cur.verses.length - 1].t += ` ${l}`;
      }
    }
    const clean = chapters.map((c) => ({ ...c, verses: c.verses.map((x) => ({ ...x, t: tidy(x.t) })).filter((x) => x.t) })).filter((c) => c.verses.length);
    await write("sv", clean);
    books.push({ id: "sv", name: "Sama Veda", collection: "samaveda", chapters: clean.length, chapterName: "Sama Veda, part" });
    console.log(`Sama Veda: ${clean.length} chapters, ${clean.reduce((s, c) => s + c.verses.length, 0)} verses`);
  }
  await writeFile(path.join(ROOT, "data", "vedas-books.json"), JSON.stringify(books, null, 1) + "\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
