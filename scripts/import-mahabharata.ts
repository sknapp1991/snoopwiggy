/**
 * Import the Mahabharata (Hinduism) — Kisari Mohan Ganguli's prose translation (1883–96, public domain),
 * from the Internet Sacred Text Archive (archive.sacred-texts.com/hin/m01 … m18). 18 books (parvas);
 * chapter = section (as numbered by Ganguli); verse = paragraph. Footnotes and page numbers are left out.
 * Note the Bhagavad Gita is Bhishma Parva sections 25–42 here (also in the library on its own).
 *
 * Pages are fetched with curl into data/raw/mahabharata first (the site blocks Node's fetch).
 *   npx tsx scripts/import-mahabharata.ts  → data/texts/mahabharata/ganguli/... and data/mahabharata-books.json
 */
import { readFile, rm, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chapterSchema } from "../src/lib/schema";
import { namedEntity, SITE_FOOTER } from "./lib/sacred-texts";

const ROOT = path.resolve(__dirname, "..");
const RAW = path.join(ROOT, "data", "raw", "mahabharata");
const OUT = path.join(ROOT, "data", "texts", "mahabharata");
const PARVAS = ["Adi", "Sabha", "Vana", "Virata", "Udyoga", "Bhishma", "Drona", "Karna", "Shalya", "Sauptika", "Stri", "Shanti", "Anushasana", "Ashvamedhika", "Ashramavasika", "Mausala", "Mahaprasthanika", "Svargarohana"];

const ENT: Record<string, string> = { nbsp: " ", amp: "&", quot: '"', lt: "<", gt: ">", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", acirc: "â", icirc: "î", ucirc: "û", aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", ntilde: "ñ", aelig: "æ", uuml: "ü" };
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

function paragraphs(html: string) {
  let h = html;
  const head = h.search(/<HR>\s*<\/p>/i);
  if (head >= 0) h = h.slice(head);
  const foot = h.search(/<h3[^>]*>\s*Footnotes|<p>\s*<HR>|<HR>\s*<CENTER>/i);
  if (foot >= 0) h = h.slice(0, foot);
  h = h
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/gi, " ")
    .replace(/<A NAME="page_[^"]*">[\s\S]*?<\/A>/gi, " ")
    .replace(/<A NAME="fr_[^"]*"><\/A>/gi, "")
    .replace(/<A HREF="#fn_[^"]*">[\s\S]*?<\/A>/gi, "");
  return h
    .split(/<\/p>|<p[^>]*>/i)
    .map((p) => tidy(decode(p.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " "))))
    .filter((p) => p && !/^p\.\s*\d+$/.test(p));
}

async function main() {
  await rm(OUT, { recursive: true, force: true });
  const books: { id: string; name: string; chapters: number }[] = [];
  for (let b = 1; b <= 18; b++) {
    const bb = String(b).padStart(2, "0");
    const idx = await readFile(path.join(RAW, `m${bb}-index.htm`), "utf8").catch(() => "");
    // Section pages in index order ("Section I", "Section CCXXIV", …); skip title / preface pages.
    // Books 12 and 13 are split into parts on the site: m12a001, m12b…, m13a….
    const pages = [...idx.matchAll(new RegExp(`HREF="(m${bb}[a-c]?\\d+)\\.htm">([^<]+)<`, "gi"))].filter((m) => /^Section/i.test(decode(m[2]).trim())).map((m) => m[1]);
    const unique = [...new Set(pages)];
    let ch = 0;
    let paras = 0;
    for (const p of unique) {
      const html = await readFile(path.join(RAW, `${p}.htm`), "utf8").catch(() => "");
      if (!html) {
        console.warn(`missing ${p}`);
        continue;
      }
      const verses = paragraphs(html).map((t, i) => ({ v: String(i + 1), t }));
      if (!verses.length) continue;
      ch++;
      paras += verses.length;
      const data = chapterSchema.parse({ work: "mahabharata", version: "ganguli", book: `mbh${b}`, chapter: ch, verses });
      const dir = path.join(OUT, "ganguli", `mbh${b}`);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, `${ch}.json`), `{"work":"mahabharata","version":"ganguli","book":"mbh${b}","chapter":${ch},"verses":[\n${data.verses.map((x) => JSON.stringify(x)).join(",\n")}\n]}\n`);
    }
    books.push({ id: `mbh${b}`, name: `${b}. ${PARVAS[b - 1]} Parva`, chapters: ch });
    console.log(`${String(b).padStart(2)} ${PARVAS[b - 1].padEnd(16)} ${ch} sections, ${paras} paragraphs`);
  }
  await writeFile(path.join(ROOT, "data", "mahabharata-books.json"), JSON.stringify(books, null, 1) + "\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
