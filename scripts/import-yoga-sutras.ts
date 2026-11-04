/**
 * Import the Yoga Sutras of Patanjali (Yoga): Charles Johnston's translation, "The Yoga Sutras of
 * Patanjali: The Book of the Spiritual Man" (1912), public domain, Project Gutenberg #2526.
 * 4 books (padas: Samadhi, Sadhana, Vibhuti, Kaivalya) = chapters; each sutra = a verse.
 * Johnston follows each sutra with his commentary; only the sutra itself (its first paragraph) is used.
 *
 *   npx tsx scripts/import-yoga-sutras.ts      (cached in data/raw/gutenberg/2526.txt)
 */
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { chapterSchema } from "../src/lib/schema";

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "data", "raw", "gutenberg", "2526.txt");
const OUT = path.join(ROOT, "data", "texts", "yoga-sutras", "johnston", "ys");

async function main() {
  if (!(await access(SRC).then(() => true, () => false))) {
    const res = await fetch("https://www.gutenberg.org/cache/epub/2526/pg2526.txt", { headers: { "User-Agent": "VersesAcross-importer/1.0" } });
    if (!res.ok) throw new Error(`download: ${res.status}`);
    await mkdir(path.dirname(SRC), { recursive: true });
    await writeFile(SRC, await res.text());
  }
  const text = (await readFile(SRC, "utf8")).replace(/\r/g, "");
  const body = text.slice(0, text.indexOf("*** END OF THE PROJECT GUTENBERG"));
  const lines = body.split("\n");
  // Sutra sections start at a line that is exactly "BOOK I".."BOOK IV" (after the contents list).
  const starts = lines.map((l, i) => (/^BOOK (I|II|III|IV)$/.test(l.trim()) ? i : -1)).filter((i) => i > 100);
  if (starts.length !== 4) throw new Error(`expected 4 books, found ${starts.length}`);
  await rm(path.dirname(path.dirname(OUT)), { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  for (let b = 0; b < 4; b++) {
    const end = b < 3 ? lines.findIndex((l, i) => i > starts[b] && /^INTRODUCTION TO BOOK/.test(l.trim())) : lines.length;
    const verses: { v: string; t: string }[] = [];
    let expect = 1;
    for (let i = starts[b] + 1; i < end; i++) {
      const m = /^(\d{1,2})\.?\s+([A-Z(].*)$/.exec(lines[i].trim());
      if (!m || +m[1] !== expect) continue;
      // The sutra is its first paragraph (until a blank line); the commentary follows.
      const para = [m[2]];
      for (let k = i + 1; k < end && lines[k].trim(); k++) para.push(lines[k].trim());
      verses.push({ v: String(expect), t: para.join(" ").replace(/\s+/g, " ").trim() });
      expect++;
    }
    const chapter = chapterSchema.parse({ work: "yoga-sutras", version: "johnston", book: "ys", chapter: b + 1, verses });
    await writeFile(
      path.join(OUT, `${b + 1}.json`),
      `{"work":"yoga-sutras","version":"johnston","book":"ys","chapter":${b + 1},"verses":[\n${chapter.verses.map((x) => JSON.stringify(x)).join(",\n")}\n]}\n`,
    );
    console.log(`book ${b + 1}: ${verses.length} sutras`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
