/**
 * Bundle per-chapter source files (data/texts/<work>/<version>/<book>/<chapter>.json) into one file per
 * book for the website: public/texts/<work>/<version>/<book>.json  →  { work, version, book, chapters: { "1": {...} } }
 *
 * Why: the per-chapter layout is easy to diff and validate, but ~20k files exceeds the Cloudflare Workers
 * free-plan limit of 20,000 static assets. One file per book is ~1.1k files, and a reader gets every
 * chapter of the book in one request (cached by the browser and the CDN).
 *
 * Runs automatically before `next dev` / `next build` (predev / prebuild). Output is git-ignored.
 */
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "data", "texts");
const OUT = path.join(ROOT, "public", "texts");

async function dirs(p: string) {
  return (await readdir(p, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
}

async function main() {
  await rm(OUT, { recursive: true, force: true });
  let files = 0;
  let bytes = 0;
  for (const work of await dirs(SRC))
    for (const version of await dirs(path.join(SRC, work)))
      for (const book of await dirs(path.join(SRC, work, version))) {
        const dir = path.join(SRC, work, version, book);
        const chapters: Record<string, unknown> = {};
        const names = (await readdir(dir)).filter((f) => /^\d+\.json$/.test(f)).sort((a, b) => parseInt(a) - parseInt(b));
        for (const f of names) {
          const c = JSON.parse(await readFile(path.join(dir, f), "utf8"));
          chapters[String(c.chapter)] = { verses: c.verses, ...(c.note ? { note: c.note } : {}), ...(c.title ? { title: c.title } : {}) };
        }
        const body = JSON.stringify({ work, version, book, chapters });
        await mkdir(path.join(OUT, work, version), { recursive: true });
        await writeFile(path.join(OUT, work, version, `${book}.json`), body);
        files++;
        bytes += body.length;
      }
  console.log(`pack-texts: ${files} book files, ${(bytes / 1e6).toFixed(1)} MB → public/texts`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
