/**
 * Import Hadith collections (Islam) — the Arabic text, from fawazahmed0/hadith-api (The Unlicense; the
 * classical Arabic itself is centuries old). English: none yet — the usual translations (Muhsin Khan,
 * Siddiqui, …) are still under copyright, so each chapter carries a note saying why.
 *
 * Each collection is one book; chapter = its "book" (kitab: Revelation, Belief, …, with that title),
 * verse = the hadith's number within it, labelled with the collection's running number ("#1").
 *
 *   npx tsx scripts/import-hadith.ts   (downloads into data/raw/hadith, cached)
 *                                      → data/texts/hadith/... and data/hadith-books.json
 */
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { chapterSchema } from "../src/lib/schema";

const ROOT = path.resolve(__dirname, "..");
const RAW = path.join(ROOT, "data", "raw", "hadith");
const OUT = path.join(ROOT, "data", "texts", "hadith");
const NOTE =
  "Arabic only: the common English translations of the Hadith are still under copyright, so no English is shown yet. A free translation will be added if one becomes available.";
const COLLECTIONS: [string, string, string][] = [
  ["bukhari", "Sahih al-Bukhari", "Bukhari"],
  ["muslim", "Sahih Muslim", "Muslim"],
  ["abudawud", "Sunan Abi Dawud", "Abu Dawud"],
  ["tirmidhi", "Jami at-Tirmidhi", "Tirmidhi"],
  ["nasai", "Sunan an-Nasa'i", "Nasa'i"],
  ["ibnmajah", "Sunan Ibn Majah", "Ibn Majah"],
  ["malik", "Muwatta Malik", "Muwatta"],
  ["nawawi", "Forty Hadith of an-Nawawi", "Nawawi"],
  ["qudsi", "Forty Hadith Qudsi", "Qudsi"],
];
const exists = (p: string) => access(p).then(() => true, () => false);

type Ed = {
  metadata: { name: string; sections: Record<string, string> };
  hadiths: { hadithnumber: number; text: string; reference: { book: number; hadith: number } }[];
};

async function edition(id: string): Promise<Ed> {
  const file = path.join(RAW, `ara-${id}.json`);
  if (!(await exists(file))) {
    const res = await fetch(`https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/ara-${id}.json`);
    if (!res.ok) throw new Error(`download ${id}: ${res.status}`);
    await mkdir(RAW, { recursive: true });
    await writeFile(file, await res.text());
  }
  return JSON.parse(await readFile(file, "utf8"));
}

async function main() {
  await rm(OUT, { recursive: true, force: true });
  const books: { id: string; name: string; chapters: number; chapterName: string }[] = [];
  for (const [id, name, short] of COLLECTIONS) {
    const ed = await edition(id);
    // Group by kitab; book 0 (front matter in some editions) joins book 1.
    const byBook = new Map<number, { v: string; t: string; n: string }[]>();
    for (const h of ed.hadiths) {
      const t = (h.text ?? "").replace(/\s+/g, " ").trim();
      if (!t) continue;
      const b = Math.max(1, h.reference?.book ?? 1);
      const list = byBook.get(b) ?? byBook.set(b, []).get(b)!;
      const inBook = Number.isInteger(h.reference?.hadith) && h.reference.hadith > 0 ? h.reference.hadith : list.length + 1;
      // Keep numbers unique and increasing within the book.
      const v = list.length && inBook <= Number(list[list.length - 1].v) ? Number(list[list.length - 1].v) + 1 : inBook;
      list.push({ v: String(v), t, n: `#${String(h.hadithnumber).replace(/\.0$/, "")}` });
    }
    const last = Math.max(...byBook.keys());
    for (let b = 1; b <= last; b++) {
      const verses = byBook.get(b) ?? [];
      const title = ed.metadata.sections?.[String(b)]?.trim();
      const data = chapterSchema.parse({ work: "hadith", version: "hadith-ar", book: id, chapter: b, verses, note: verses.length ? NOTE : "No hadith in this book of the edition.", ...(title ? { title } : {}) });
      const dir = path.join(OUT, "hadith-ar", id);
      await mkdir(dir, { recursive: true });
      await writeFile(
        path.join(dir, `${b}.json`),
        `{"work":"hadith","version":"hadith-ar","book":"${id}","chapter":${b}${data.title ? `,"title":${JSON.stringify(data.title)}` : ""},"note":${JSON.stringify(data.note)},"verses":[\n${data.verses.map((x) => JSON.stringify(x)).join(",\n")}\n]}\n`,
      );
    }
    books.push({ id, name, chapters: last, chapterName: last === 1 ? name : `${short}, book` });
    console.log(`${name.padEnd(28)} ${last} books, ${ed.hadiths.length} hadith`);
  }
  await writeFile(path.join(ROOT, "data", "hadith-books.json"), JSON.stringify(books, null, 1) + "\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
