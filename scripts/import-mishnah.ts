/**
 * Import the Mishnah (Judaism) from Sefaria's API:
 *   - kulp       English, "Mishnah Yomit" by Dr. Joshua Kulp (CC BY — credit shown in the reader)
 *   - mishnah-he Hebrew, Mishnah ed. Romm, Vilna 1913 (public domain)
 * Six orders (sedarim), 63 tractates; chapter = perek, verse = mishnah. Both versions share Sefaria's
 * numbering, so they line up exactly. Sefaria's HTML formatting is stripped.
 *
 *   npx tsx scripts/import-mishnah.ts   (downloads into data/raw/mishnah, cached)
 *                                       → data/texts/mishnah/... and data/mishnah-books.json (catalog items)
 */
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { chapterSchema } from "../src/lib/schema";

const ROOT = path.resolve(__dirname, "..");
const RAW = path.join(ROOT, "data", "raw", "mishnah");
const OUT = path.join(ROOT, "data", "texts", "mishnah");
const VERSIONS = { kulp: "english|Mishnah Yomit by Dr. Joshua Kulp", "mishnah-he": "hebrew|Mishnah, ed. Romm, Vilna 1913" } as const;
const ORDERS: [string, string, string][] = [
  ["Seder Zeraim", "zeraim", "Mishnah · Zeraim (Seeds)"],
  ["Seder Moed", "moed", "Mishnah · Moed (Appointed Times)"],
  ["Seder Nashim", "nashim", "Mishnah · Nashim (Women)"],
  ["Seder Nezikin", "nezikin", "Mishnah · Nezikin (Damages)"],
  ["Seder Kodashim", "kodashim", "Mishnah · Kodashim (Holy Things)"],
  ["Seder Tahorot", "tahorot", "Mishnah · Tahorot (Purities)"],
];
const exists = (p: string) => access(p).then(() => true, () => false);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson(url: string, cacheName: string) {
  const file = path.join(RAW, cacheName);
  if (await exists(file)) return JSON.parse(await readFile(file, "utf8"));
  const res = await fetch(url, { headers: { "user-agent": "VersesAcross-import/1.0 (https://versesacross.com)" } });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const text = await res.text();
  await mkdir(RAW, { recursive: true });
  await writeFile(file, text);
  await sleep(400); // be gentle with Sefaria
  return JSON.parse(text);
}

const clean = (s: string) =>
  s
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<sup[^>]*>[\s\S]*?<\/sup>/gi, "") // footnote markers
    .replace(/<i class="footnote">[\s\S]*?<\/i>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

const slug = (title: string) =>
  title
    .replace(/^Mishnah /, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

async function main() {
  const index = (await getJson("https://www.sefaria.org/api/index", "index.json")) as { category?: string; contents: { category?: string; title?: string; heTitle?: string; contents?: { title?: string; heTitle?: string }[] }[] }[];
  const mishnah = index.find((c) => c.category === "Mishnah")!;
  await rm(OUT, { recursive: true, force: true });
  const books: { id: string; name: string; collection: string; collectionName: string; chapters: number }[] = [];
  for (const [cat, colId, colName] of ORDERS) {
    const order = mishnah.contents.find((c) => c.category === cat)!;
    for (const t of order.contents!.filter((x) => x.title)) {
      const title = t.title!;
      const id = slug(title);
      const q = Object.values(VERSIONS)
        .map((v) => `version=${encodeURIComponent(v)}`)
        .join("&");
      const data = (await getJson(`https://www.sefaria.org/api/v3/texts/${encodeURIComponent(title.replace(/ /g, "_"))}?${q}`, `${id}.json`)) as {
        versions: { versionTitle: string; text: string[][] }[];
      };
      let chapters = 0;
      for (const [vid, spec] of Object.entries(VERSIONS)) {
        const vt = spec.split("|")[1];
        const v = data.versions.find((x) => x.versionTitle === vt);
        if (!v) {
          console.warn(`${title}: no ${vid}`);
          continue;
        }
        for (const [i, perek] of v.text.entries()) {
          const verses = (perek ?? []).flatMap((t, j) => (clean(t ?? "") ? [{ v: String(j + 1), t: clean(t) }] : []));
          const ch = i + 1;
          const parsed = chapterSchema.parse({ work: "mishnah", version: vid, book: id, chapter: ch, verses, ...(verses.length ? {} : { note: "Not in this edition." }) });
          const dir = path.join(OUT, vid, id);
          await mkdir(dir, { recursive: true });
          await writeFile(
            path.join(dir, `${ch}.json`),
            `{"work":"mishnah","version":"${vid}","book":"${id}","chapter":${ch}${parsed.note ? `,"note":${JSON.stringify(parsed.note)}` : ""},"verses":[\n${parsed.verses.map((x) => JSON.stringify(x)).join(",\n")}\n]}\n`,
          );
        }
        chapters = Math.max(chapters, v.text.length);
      }
      // A chapter one edition doesn't print (Bikkurim 4 is a later addition, absent from Vilna 1913).
      for (const vid of Object.keys(VERSIONS))
        for (let ch = 1; ch <= chapters; ch++) {
          const f = path.join(OUT, vid, id, `${ch}.json`);
          if (await exists(f)) continue;
          await mkdir(path.dirname(f), { recursive: true });
          await writeFile(f, `{"work":"mishnah","version":"${vid}","book":"${id}","chapter":${ch},"note":"Not in this edition (a later addition to the tractate).","verses":[]}\n`);
        }
      const name = title === "Pirkei Avot" ? "Pirkei Avot (Ethics of the Fathers)" : title.replace(/^Mishnah /, "");
      books.push({ id, name, collection: colId, collectionName: colName, chapters });
      console.log(`${colId.padEnd(9)} ${name.padEnd(36)} ${chapters} chapters`);
    }
  }
  await writeFile(path.join(ROOT, "data", "mishnah-books.json"), JSON.stringify(books, null, 1) + "\n");
  console.log(`${books.length} tractates → data/mishnah-books.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
