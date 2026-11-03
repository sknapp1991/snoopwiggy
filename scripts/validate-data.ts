/**
 * Validate data/catalog.json and every imported chapter file.
 *   npx tsx scripts/validate-data.ts
 * Fails (exit 1) on schema errors, missing/extra chapters or empty verses.
 * Reports (does not fail on) verse-count differences between versions of the same work.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { catalogSchema, chapterSchema } from "../src/lib/schema";

const ROOT = path.resolve(__dirname, "..");

async function main() {
  const errors: string[] = [];
  const catalog = catalogSchema.parse(JSON.parse(await readFile(path.join(ROOT, "data", "catalog.json"), "utf8")));

  // Catalog integrity
  const ids = new Set<string>();
  for (const v of catalog.versions) {
    if (ids.has(v.id)) errors.push(`duplicate version id ${v.id}`);
    ids.add(v.id);
    if (!catalog.works.some((w) => w.id === v.work)) errors.push(`version ${v.id}: unknown work ${v.work}`);
    if (v.licensed) errors.push(`version ${v.id}: licensed versions are not allowed yet`);
  }

  const books = new Map<string, Map<string, number>>(); // work -> book -> chapters
  for (const r of catalog.religions)
    for (const c of r.collections)
      for (const it of c.items) {
        if (it.status === "coming-soon") continue;
        if (!it.work || !it.chapters) {
          errors.push(`item ${r.id}/${c.id}/${it.id}: available items need work + chapters`);
          continue;
        }
        const m = books.get(it.work) ?? new Map();
        if (m.has(it.id)) errors.push(`duplicate book id ${it.work}/${it.id}`);
        m.set(it.id, it.chapters);
        books.set(it.work, m);
      }

  // verse counts: work -> "book.ch" -> version -> count
  const counts = new Map<string, Map<string, Map<string, number>>>();

  for (const v of catalog.versions) {
    const dir = path.join(ROOT, "data", "texts", v.work, v.id);
    const expected = books.get(v.work) ?? new Map();
    let chapters = 0;
    let verses = 0;
    for (const [book, n] of expected) {
      let files: string[] = [];
      try {
        files = (await readdir(path.join(dir, book))).filter((f) => f.endsWith(".json"));
      } catch {
        errors.push(`${v.id}: missing book ${book} (run the import script)`);
        continue;
      }
      if (files.length !== n) errors.push(`${v.id}/${book}: ${files.length} chapter files, catalog says ${n}`);
      for (let ch = 1; ch <= n; ch++) {
        let parsed;
        try {
          parsed = chapterSchema.parse(JSON.parse(await readFile(path.join(dir, book, `${ch}.json`), "utf8")));
        } catch (e) {
          errors.push(`${v.id}/${book}/${ch}: ${(e as Error).message.split("\n")[0]}`);
          continue;
        }
        if (parsed.version !== v.id || parsed.book !== book || parsed.chapter !== ch)
          errors.push(`${v.id}/${book}/${ch}: header mismatch`);
        const seen = new Set<string>();
        for (const x of parsed.verses) {
          if (seen.has(x.v)) errors.push(`${v.id}/${book}/${ch}: duplicate verse ${x.v}`);
          seen.add(x.v);
        }
        chapters++;
        verses += parsed.verses.length;
        const w = counts.get(v.work) ?? new Map();
        counts.set(v.work, w);
        const k = `${book} ${ch}`;
        const byV = w.get(k) ?? new Map();
        w.set(k, byV);
        byV.set(v.id, parsed.verses.length);
      }
    }
    console.log(`${v.abbr.padEnd(10)} ${String(chapters).padStart(5)} chapters ${String(verses).padStart(6)} verses`);
  }

  // Cross-version report
  for (const [work, w] of counts) {
    const diffs: string[] = [];
    for (const [k, byV] of w) {
      const vals = [...byV.values()];
      if (new Set(vals).size > 1) diffs.push(`  ${k}: ${[...byV].map(([id, n]) => `${id}=${n}`).join(" ")}`);
    }
    console.log(`\n${work}: ${diffs.length} chapter(s) where verse counts differ between versions (shown as gaps in the reader):`);
    if (diffs.length) console.log(diffs.join("\n"));
  }

  if (errors.length) {
    console.error(`\n${errors.length} error(s):\n` + errors.slice(0, 50).join("\n"));
    process.exit(1);
  }
  console.log("\nOK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
