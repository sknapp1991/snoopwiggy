/**
 * Import the Upanishads (Hinduism) — F. Max Müller's translation, Sacred Books of the East vols 1 (1879)
 * and 15 (1884), public domain, from the Internet Sacred Text Archive (archive.sacred-texts.com/hin/sbe01,
 * sbe15). Twelve Upanishads. Chapter = one page of the edition (a khanda / valli / adhyaya, its
 * traditional label as the chapter title); verse = Müller's numbered paragraphs. Footnotes, page numbers
 * and headings are left out.
 *
 *   npx tsx scripts/import-upanishads.ts   (downloads into data/raw/upanishads, cached)
 *                                          → data/texts/upanishads/... and data/upanishads-books.json
 */
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { chapterSchema } from "../src/lib/schema";

const ROOT = path.resolve(__dirname, "..");
const RAW = path.join(ROOT, "data", "raw", "upanishads");
const OUT = path.join(ROOT, "data", "texts", "upanishads");
const exists = (p: string) => access(p).then(() => true, () => false);

/** id, name, volume, first page, last page (inclusive), pages to skip. */
const BOOKS: [string, string, string, number, number, number[]?][] = [
  ["isha", "Isha Upanishad", "sbe01", 243, 243],
  ["kena", "Kena Upanishad", "sbe01", 176, 179],
  ["katha", "Katha Upanishad", "sbe15", 10, 15],
  ["prashna", "Prashna Upanishad", "sbe15", 106, 111],
  ["mundaka", "Mundaka Upanishad", "sbe15", 16, 21],
  ["taittiriya", "Taittiriya Upanishad", "sbe15", 22, 52],
  ["aitareya", "Aitareya Aranyaka (with the Aitareya Upanishad)", "sbe01", 180, 238],
  ["chandogya", "Chandogya Upanishad", "sbe01", 22, 175],
  ["brihadaranyaka", "Brihadaranyaka Upanishad", "sbe15", 53, 99, [98]], // 98: a later translation by Hume
  ["svetasvatara", "Svetasvatara Upanishad", "sbe15", 100, 105],
  ["kaushitaki", "Kaushitaki Upanishad", "sbe01", 239, 242],
  ["maitri", "Maitrayaniya Upanishad", "sbe15", 112, 118],
];

const ENT: Record<string, string> = { nbsp: " ", amp: "&", quot: '"', lt: "<", gt: ">", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", acirc: "â", Acirc: "Â", icirc: "î", Icirc: "Î", ucirc: "û", Ucirc: "Û", ecirc: "ê", ocirc: "ô", eacute: "é", aelig: "æ", ntilde: "ñ", Ntilde: "Ñ", uuml: "ü", ouml: "ö", auml: "ä" };
const CP1252: Record<number, string> = { 133: "…", 145: "‘", 146: "’", 147: "“", 148: "”", 150: "–", 151: "—" };
const decodeOnce = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => CP1252[Number(n)] ?? String.fromCodePoint(Number(n)))
    .replace(/&(\w+);/g, (m, n: string) => ENT[n] ?? m);
const decode = (s: string) => decodeOnce(decodeOnce(s));

async function page(vol: string, n: number) {
  const name = `${vol}${String(n).padStart(3, "0")}.htm`;
  const file = path.join(RAW, name);
  if (!(await exists(file))) {
    const res = await fetch(`https://archive.sacred-texts.com/hin/${vol}/${name}`, { headers: { "user-agent": "Mozilla/5.0 VersesAcross-import" } });
    if (!res.ok) throw new Error(`download ${name}: ${res.status}`);
    await mkdir(RAW, { recursive: true });
    await writeFile(file, await res.text());
    await new Promise((r) => setTimeout(r, 150));
  }
  return readFile(file, "utf8");
}

/** The page's own text (between the site header and its navigation), as plain text. */
function body(h: string) {
  const head = h.search(/at sacred-texts\.com<\/FONT><\/P>/i);
  if (head >= 0) h = h.slice(head).replace(/^[\s\S]*?<HR>/i, "");
  const foot = h.search(/<h3[^>]*>\s*Footnotes|<div class="filenav">|<HR>/i);
  if (foot >= 0) h = h.slice(0, foot);
  h = h
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/gi, " ")
    .replace(/<a name="page_[^"]*">[\s\S]*?<\/a>/gi, " ")
    .replace(/<A NAME="fr_[^"]*"><\/A>/gi, "")
    .replace(/<a href="#fn_[^"]*">[\s\S]*?<\/a>/gi, "")
    .replace(/<\/p>/gi, "\n")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "");
  return decode(h)
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/** "1. …" paragraphs → verses; text before the first number joins verse 1. */
function verses(text: string) {
  const out: { v: string; t: string }[] = [];
  let expect = 1;
  let pre = "";
  for (const para of text.split("\n")) {
    const m = /^(\d{1,3})\.\s+([\s\S]*)$/.exec(para);
    const n = m ? Number(m[1]) : NaN;
    if (m && (n === expect || (n > expect && n <= expect + 3) || (out.length === 0 && n <= 30))) {
      out.push({ v: String(n), t: (out.length === 0 && pre ? `${pre} ` : "") + m[2] });
      expect = n + 1;
      pre = "";
    } else if (out.length) out[out.length - 1].t += ` ${para}`;
    else pre += (pre ? " " : "") + para;
  }
  if (!out.length && pre) out.push({ v: "1", t: pre });
  return out.map((x) => ({ v: x.v, t: x.t.replace(/\s+([,.;:!?)])/g, "$1").replace(/\s+/g, " ").trim() })).filter((x) => x.t);
}

async function main() {
  // Page labels ("I, 1", "Khanda II") from the two index pages, for chapter titles.
  const labels = new Map<string, string>();
  for (const vol of ["sbe01", "sbe15"]) {
    const idx = await readFile(path.join(RAW, `${vol}-index.htm`), "utf8");
    for (const m of idx.matchAll(new RegExp(`HREF="(${vol}\\d+)\\.htm">([^<]+)<`, "gi"))) labels.set(m[1], decode(m[2]).trim());
  }
  await rm(OUT, { recursive: true, force: true });
  const books: { id: string; name: string; chapters: number }[] = [];
  for (const [id, name, vol, from, to, skip = []] of BOOKS) {
    let ch = 0;
    let total = 0;
    for (let n = from; n <= to; n++) {
      if (skip.includes(n)) continue;
      const list = verses(body(await page(vol, n)));
      if (!list.length) continue;
      ch++;
      total += list.length;
      const label = labels.get(`${vol}${String(n).padStart(3, "0")}`);
      const title = label && from !== to ? label : undefined;
      const data = chapterSchema.parse({ work: "upanishads", version: "muller", book: id, chapter: ch, verses: list, ...(title ? { title } : {}) });
      const dir = path.join(OUT, "muller", id);
      await mkdir(dir, { recursive: true });
      await writeFile(
        path.join(dir, `${ch}.json`),
        `{"work":"upanishads","version":"muller","book":"${id}","chapter":${ch}${data.title ? `,"title":${JSON.stringify(data.title)}` : ""},"verses":[\n${data.verses.map((x) => JSON.stringify(x)).join(",\n")}\n]}\n`,
      );
    }
    books.push({ id, name, chapters: ch });
    console.log(`${name.padEnd(48)} ${ch} chapters, ${total} verses`);
  }
  await writeFile(path.join(ROOT, "data", "upanishads-books.json"), JSON.stringify(books, null, 1) + "\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
