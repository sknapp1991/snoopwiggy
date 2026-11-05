/**
 * Import the Dhammapada (Buddhism) from SuttaCentral's bilara-data (CC0):
 *   - pli     Pali root text (Mahāsaṅgīti edition)
 *   - sujato  English translation by Bhikkhu Sujato
 * 26 chapters (vaggas); verses keep the traditional numbering 1–423 across the whole book.
 *
 *   npx tsx scripts/import-dhammapada.ts      (downloads into data/raw/suttacentral-dhp, cached)
 */
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { chapterSchema } from "../src/lib/schema";

const ROOT = path.resolve(__dirname, "..");
const RAW = path.join(ROOT, "data", "raw", "suttacentral-dhp");
const OUT = path.join(ROOT, "data", "texts", "dhammapada");
const BASE = "https://raw.githubusercontent.com/suttacentral/bilara-data/published";
// The 26 vaggas, by their first–last verse (these are SuttaCentral's file names).
const VAGGAS = ["1-20", "21-32", "33-43", "44-59", "60-75", "76-89", "90-99", "100-115", "116-128", "129-145", "146-156", "157-166", "167-178", "179-196", "197-208", "209-220", "221-234", "235-255", "256-272", "273-289", "290-305", "306-319", "320-333", "334-359", "360-382", "383-423"];
const SOURCES = {
  pli: (r: string) => `root/pli/ms/sutta/kn/dhp/dhp${r}_root-pli-ms.json`,
  sujato: (r: string) => `translation/en/sujato/sutta/kn/dhp/dhp${r}_translation-en-sujato.json`,
};

const exists = (p: string) => access(p).then(() => true, () => false);

async function get(rel: string): Promise<Record<string, string>> {
  const file = path.join(RAW, rel.replace(/\//g, "_"));
  if (!(await exists(file))) {
    const res = await fetch(`${BASE}/${rel}`);
    if (!res.ok) throw new Error(`download ${rel}: ${res.status}`);
    await mkdir(RAW, { recursive: true });
    await writeFile(file, await res.text());
  }
  return JSON.parse(await readFile(file, "utf8"));
}

async function main() {
  for (const [version, rel] of Object.entries(SOURCES)) {
    const dir = path.join(OUT, version, "dhp");
    await rm(path.join(OUT, version), { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
    let verses = 0;
    for (const [i, range] of VAGGAS.entries()) {
      const segs = await get(rel(range));
      // "dhp12:3" = verse 12, line 3; ":0.x" segments are headings (collection, vagga, story titles).
      const byVerse = new Map<number, string[]>();
      for (const [id, text] of Object.entries(segs)) {
        const m = /^dhp(\d+):(\d+)$/.exec(id);
        if (!m || !text.trim()) continue;
        const v = Number(m[1]);
        // SuttaCentral marks verse-line breaks with <j> (and the odd <em>): plain text here.
        (byVerse.get(v) ?? byVerse.set(v, []).get(v)!).push(text.replace(/<\/?[a-z]+>/gi, " ").replace(/\s+/g, " ").trim());
      }
      const list = [...byVerse.entries()].sort((a, b) => a[0] - b[0]).map(([v, lines]) => ({ v: String(v), t: lines.join(" ") }));
      const chapter = chapterSchema.parse({ work: "dhammapada", version, book: "dhp", chapter: i + 1, verses: list });
      await writeFile(
        path.join(dir, `${i + 1}.json`),
        `{"work":"dhammapada","version":"${version}","book":"dhp","chapter":${i + 1},"verses":[\n${chapter.verses.map((x) => JSON.stringify(x)).join(",\n")}\n]}\n`,
      );
      verses += list.length;
    }
    console.log(`${version}: 26 chapters, ${verses} verses`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
