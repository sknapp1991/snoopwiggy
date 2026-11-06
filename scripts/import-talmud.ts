/**
 * Import the Babylonian Talmud (Talmud Bavli) from Sefaria's API — the 37 tractates of the six orders:
 *   - talmud-he  Hebrew/Aramaic text, "Wikisource Talmud Bavli" (CC BY-SA: credit + same licence)
 *   - cohen      English for Berakhot only: A. Cohen, Cambridge University Press 1921 (public domain)
 * The complete modern English (William Davidson / Koren) is licensed for non-commercial use only, so
 * it isn't included; chapters carry a note saying so.
 *
 * Layout: chapter = daf (folio, 2, 3, …; the Talmud starts at 2a), verses = the segments of side a then
 * side b, numbered in order; each shows its traditional label ("2a:3") beside the text.
 *
 *   npx tsx scripts/import-talmud.ts   (downloads into data/raw/talmud, cached)
 *                                      → data/texts/talmud/... and data/talmud-books.json (catalog items)
 */
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { chapterSchema } from "../src/lib/schema";

const ROOT = path.resolve(__dirname, "..");
const RAW = path.join(ROOT, "data", "raw", "talmud");
const OUT = path.join(ROOT, "data", "texts", "talmud");
const HE = "hebrew|Wikisource Talmud Bavli";
const EN = "english|Tractate Berakot by A. Cohen, Cambridge University Press, 1921";
const NO_EN =
  "No English for this tractate: the complete modern English translation is licensed for non-commercial use only. (Berakhot has A. Cohen's 1921 translation — add “Cohen” under Versions.)";
const ORDERS: [string, string, string][] = [
  ["Seder Zeraim", "zeraim", "Talmud · Zeraim (Seeds)"],
  ["Seder Moed", "moed", "Talmud · Moed (Appointed Times)"],
  ["Seder Nashim", "nashim", "Talmud · Nashim (Women)"],
  ["Seder Nezikin", "nezikin", "Talmud · Nezikin (Damages)"],
  ["Seder Kodashim", "kodashim", "Talmud · Kodashim (Holy Things)"],
  ["Seder Tahorot", "tahorot", "Talmud · Tahorot (Purities)"],
];
const exists = (p: string) => access(p).then(() => true, () => false);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson(url: string, cacheName: string, cacheDir = RAW) {
  const file = path.join(cacheDir, cacheName);
  if (await exists(file)) return JSON.parse(await readFile(file, "utf8"));
  const res = await fetch(url, { headers: { "user-agent": "VersesAcross-import/1.0 (https://versesacross.com)" } });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const text = await res.text();
  await mkdir(cacheDir, { recursive: true });
  await writeFile(file, text);
  await sleep(400);
  return JSON.parse(text);
}

const clean = (s: string) =>
  s
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<sup[^>]*>[\s\S]*?<\/sup>/gi, "")
    .replace(/<i class="footnote">[\s\S]*?<\/i>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/(?<=\S)\[\d{1,2}\]/g, "") // Cohen's footnote numbers ("Levite[4] said")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
const slug = (t: string) => t.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function writeChapter(version: string, book: string, ch: number, verses: { v: string; t: string; n?: string }[], note?: string) {
  const data = chapterSchema.parse({ work: "talmud", version, book, chapter: ch, verses, ...(note ? { note } : {}) });
  const dir = path.join(OUT, version, book);
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, `${ch}.json`),
    `{"work":"talmud","version":"${version}","book":"${book}","chapter":${ch}${data.note ? `,"note":${JSON.stringify(data.note)}` : ""},"verses":[\n${data.verses.map((x) => JSON.stringify(x)).join(",\n")}\n]}\n`,
  );
}

/** Sefaria's sides (index 0 = 1a, 1 = 1b, 2 = 2a, …) → { daf → verses with "2a:3" labels }. */
function byDaf(sides: (string[] | null)[]) {
  const out = new Map<number, { v: string; t: string; n: string }[]>();
  sides.forEach((segs, i) => {
    const daf = Math.floor(i / 2) + 1;
    const side = i % 2 ? "b" : "a";
    (segs ?? []).forEach((s, k) => {
      const t = clean(s ?? "");
      if (!t) return;
      const list = out.get(daf) ?? out.set(daf, []).get(daf)!;
      list.push({ v: String(list.length + 1), t, n: `${daf}${side}:${k + 1}` });
    });
  });
  return out;
}

async function main() {
  const index = (await getJson("https://www.sefaria.org/api/index", "index.json", path.join(ROOT, "data", "raw", "mishnah"))) as {
    category?: string;
    contents: { category?: string; contents: { category?: string; contents?: { title?: string }[] }[] }[];
  }[];
  const bavli = index.find((c) => c.category === "Talmud")!.contents.find((c) => c.category === "Bavli")!;
  await rm(OUT, { recursive: true, force: true });
  const books: { id: string; name: string; collection: string; collectionName: string; chapters: number }[] = [];
  for (const [cat, colId, colName] of ORDERS) {
    const order = bavli.contents.find((c) => c.category === cat)!;
    for (const t of order.contents!.filter((x) => x.title)) {
      const title = t.title!;
      const id = slug(title);
      const withEn = title === "Berakhot";
      const q = [HE, ...(withEn ? [EN] : [])].map((v) => `version=${encodeURIComponent(v)}`).join("&");
      const data = (await getJson(`https://www.sefaria.org/api/v3/texts/${encodeURIComponent(title.replace(/ /g, "_"))}?${q}`, `${id}.json`)) as {
        versions: { versionTitle: string; text: (string[] | null)[] }[];
      };
      const he = byDaf(data.versions.find((v) => v.versionTitle === HE.split("|")[1])!.text);
      const en = withEn ? byDaf(data.versions.find((v) => v.versionTitle === EN.split("|")[1])!.text) : null;
      const last = Math.max(...he.keys());
      for (let daf = 1; daf <= last; daf++) {
        const hv = he.get(daf) ?? [];
        const note = daf === 1 ? "The Talmud's pages begin at 2a." : !withEn && daf === 2 ? NO_EN : hv.length ? undefined : "No text on this page.";
        await writeChapter("talmud-he", id, daf, hv, note);
        if (en) await writeChapter("cohen", id, daf, en.get(daf) ?? [], daf === 1 ? "The Talmud's pages begin at 2a." : en.get(daf)?.length ? undefined : "Not translated here.");
      }
      books.push({ id, name: title, collection: colId, collectionName: colName, chapters: last });
      console.log(`${colId.padEnd(9)} ${title.padEnd(16)} ${last - 1} folios (2–${last})`);
    }
  }
  await writeFile(path.join(ROOT, "data", "talmud-books.json"), JSON.stringify(books, null, 1) + "\n");
  console.log(`${books.length} tractates → data/talmud-books.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
