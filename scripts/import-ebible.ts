/**
 * Import a Bible from eBible.org (VPL format) into public/texts/bible/<version>/<book>/<chapter>.json
 *
 *   npx tsx scripts/import-ebible.ts <versionId> [--force]
 *
 * The version must exist in data/catalog.json with an `import` block ({ provider: "ebible", id }).
 * Downloads are cached in data/raw/ (git-ignored); --force re-downloads.
 * Verify the licence on the eBible details page BEFORE adding a version to the catalog.
 */
import { mkdir, readFile, rm, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { catalogSchema, chapterSchema, type Chapter } from "../src/lib/schema";

const ROOT = path.resolve(__dirname, "..");
const RAW_DIR = path.join(ROOT, "data", "raw");
// Source of truth (per chapter). scripts/pack-texts.ts bundles them per book into public/texts for the site.
const TEXT_DIR = path.join(ROOT, "data", "texts");

/** eBible VPL book codes that differ from our (USFM, lowercase) book ids. */
const VPL_TO_BOOK: Record<string, string> = {
  SOL: "sng",
  EZE: "ezk",
  JOE: "jol",
  NAH: "nam",
  MAR: "mrk",
  JOH: "jhn",
  PHI: "php",
  JAM: "jas",
  "1JO": "1jn",
  "2JO": "2jn",
  "3JO": "3jn",
};

async function exists(p: string) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/** Light, meaning-preserving cleanup. Never changes words. */
function cleanText(raw: string, stripBrackets: boolean) {
  let t = raw;
  // KJV / RVR mark translator-supplied words with [brackets] (italics in print).
  if (stripBrackets) t = t.replace(/\[([^\]]*)\]/g, "$1").replace(/[[\]]/g, ""); // also brackets that span verses
  t = t.replace(/[¶]/g, "");
  return t.replace(/\s+/g, " ").trim();
}

async function main() {
  const [versionId, ...flags] = process.argv.slice(2);
  if (!versionId) throw new Error("usage: tsx scripts/import-ebible.ts <versionId> [--force]");
  const force = flags.includes("--force");

  const catalog = catalogSchema.parse(JSON.parse(await readFile(path.join(ROOT, "data", "catalog.json"), "utf8")));
  const version = catalog.versions.find((v) => v.id === versionId);
  if (!version) throw new Error(`version "${versionId}" not in data/catalog.json`);
  if (version.import?.provider !== "ebible") throw new Error(`version "${versionId}" has no ebible import block`);
  const imp = version.import;
  // One eBible source for the whole Bible, or one per testament (e.g. Greek: LXX OT + TR NT).
  const parts = imp.parts ?? (imp.id ? [{ id: imp.id, collection: undefined }] : []);
  if (!parts.length) throw new Error(`version "${versionId}": import needs "id" or "parts"`);

  // Books that belong to this work, with their expected chapter counts and collection (ot/nt/...).
  const books = new Map<string, number>();
  const collectionOf = new Map<string, string>();
  for (const r of catalog.religions)
    for (const c of r.collections)
      for (const it of c.items)
        if (it.work === version.work && it.chapters) {
          books.set(it.id, it.chapters);
          collectionOf.set(it.id, c.id);
        }

  // 1–2. Download (cached), unzip, read each source's VPL lines
  await mkdir(RAW_DIR, { recursive: true });
  const lines: string[] = [];
  for (const part of parts) {
    const zipPath = path.join(RAW_DIR, `${part.id}_vpl.zip`);
    if (force || !(await exists(zipPath))) {
      const url = `https://ebible.org/Scriptures/${part.id}_vpl.zip`;
      console.log(`Downloading ${url}`);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`download failed: ${res.status} ${url}`);
      await writeFile(zipPath, Buffer.from(await res.arrayBuffer()));
    } else {
      console.log(`Using cached ${path.relative(ROOT, zipPath)}`);
    }
    const files = unzipSync(new Uint8Array(await readFile(zipPath)));
    const txtName = Object.keys(files).find((n) => n.endsWith("_vpl.txt"));
    if (!txtName) throw new Error(`no *_vpl.txt in ${part.id}`);
    for (const line of strFromU8(files[txtName]).replace(/^﻿/, "").split(/\r?\n/)) {
      if (part.collection) {
        const code = line.split(" ", 1)[0];
        const book = imp.bookAliases?.[code] ?? VPL_TO_BOOK[code] ?? code.toLowerCase();
        if (collectionOf.get(book) !== part.collection) continue; // take only this part's testament
      }
      lines.push(line);
    }
  }

  // 3. Parse "GEN 1:1 text"
  type Raw = { book: string; ch: number; v: string; t: string };
  const raws: Raw[] = [];
  const maxSlot = new Map<string, number>(); // "book ch" -> highest verse slot in the source (incl. empty)
  const skippedBooks = new Map<string, number>();
  let emptySlots = 0;
  let skippedRanges = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    const m = /^(\S+) (\d+):(\d+[a-z]?) ?(.*)$/.exec(line);
    if (!m) throw new Error(`unparseable line: ${line.slice(0, 80)}`);
    const [, code, chS, v, rawText] = m;
    let book = imp.bookAliases?.[code] ?? VPL_TO_BOOK[code] ?? code.toLowerCase();
    let ch = Number(chS);
    for (const mv of imp.chapterMoves ?? [])
      if (mv.book === book && ch >= mv.fromChapter) {
        book = mv.toBook;
        ch += mv.offset;
      }
    if (!books.has(book)) {
      skippedBooks.set(code, (skippedBooks.get(code) ?? 0) + 1);
      continue;
    }
    if ((imp.skipChapters ?? []).some((r) => r.book === book && ch >= r.from && ch <= (r.to ?? 999))) {
      skippedRanges++; // reordered relative to the reference grid; shown as a gap until a reorder table exists
      continue;
    }
    const k = `${book} ${ch}`;
    maxSlot.set(k, Math.max(maxSlot.get(k) ?? 0, parseInt(v)));
    const t = cleanText(rawText, !!version.import.stripBrackets);
    if (!t) {
      emptySlots++; // source omits this verse (or moved it) — the reader shows a gap
      continue;
    }
    raws.push({ book, ch, v, t });
  }

  // 3b. Apply the reviewed versification mapping (data/versification/<version>.json), if any.
  //     Source verse slot -> canonical "book c:v" or "book c:v-w" / "book c:v-c2:w" (one cell spanning several).
  const mapFile = path.join(ROOT, "data", "versification", `${version.id}.json`);
  let vmap: Record<string, string> = {};
  if (!flags.includes("--no-map") && (await exists(mapFile))) {
    vmap = JSON.parse(await readFile(mapFile, "utf8")).map;
    console.log(`Applying versification map (${Object.keys(vmap).length} slots) from ${path.relative(ROOT, mapFile)}`);
  }
  type Cell = { book: string; ch: number; v: string; toCh?: number; toV?: string; texts: string[]; src: { ch: number; v: string }[] };
  const cells = new Map<string, Cell>();
  const mapped = Object.keys(vmap).length > 0;
  const setAside = new Map<string, number>(); // "book ch" -> verses set aside for the Apocrypha section
  const extrasAfter = new Map<string, number>(); // anchor -> number of extra verses already placed after it
  for (const r of raws) {
    let target = vmap[`${r.book} ${r.ch}:${r.v}`] ?? `${r.book} ${r.ch}:${r.v}`;
    if (target === "(apocrypha)" || (mapped && r.ch > (books.get(r.book) ?? 0) && !vmap[`${r.book} ${r.ch}:${r.v}`])) {
      // Whole chapters with no counterpart in the canonical grid (Psalm 151, Greek additions to Esther/Daniel…):
      // kept out of the book view; they belong in the Apocrypha & Deuterocanon collection (Phase 4).
      const k = `${r.book} ${r.ch}`;
      setAside.set(k, (setAside.get(k) ?? 0) + 1);
      continue;
    }
    // "book c:v+" = a verse with no canonical counterpart, shown as an extra row after canonical c:v (v "17a", "17b"…)
    const extra = /^(\S+) (\d+):(\d+)\+$/.exec(target);
    if (extra) {
      const n = extrasAfter.get(target) ?? 0;
      extrasAfter.set(target, n + 1);
      const suffix = n < 26 ? String.fromCharCode(97 + n) : String.fromCharCode(97 + Math.floor(n / 26) - 1) + String.fromCharCode(97 + (n % 26));
      target = `${extra[1]} ${extra[2]}:${extra[3]}${suffix}`;
    }
    const m = /^(\S+) (\d+):(\d+[a-z]{0,2})(?:-(?:(\d+):)?(\d+[a-z]?))?$/.exec(target);
    if (!m) throw new Error(`bad mapping target "${target}" for ${r.book} ${r.ch}:${r.v}`);
    const [, book, ch, v, toCh, toV] = m;
    let cell = cells.get(target);
    if (!cell) {
      cell = { book, ch: Number(ch), v, texts: [], src: [] };
      if (toV) {
        cell.toV = toV;
        cell.toCh = toCh ? Number(toCh) : Number(ch);
      }
      cells.set(target, cell);
    }
    cell.texts.push(r.t);
    cell.src.push({ ch: r.ch, v: r.v });
  }

  let merged = 0;
  const chapters = new Map<string, Map<number, Chapter["verses"]>>();
  const put = (book: string, ch: number, verse: Chapter["verses"][number]) => {
    const byCh = chapters.get(book) ?? new Map();
    chapters.set(book, byCh);
    const list = byCh.get(ch) ?? [];
    byCh.set(ch, list);
    const existing = list.find((x: { v: string }) => x.v === verse.v);
    if (existing) {
      // Two source verses landed on one canonical slot (mixed shifted/identity mapping): keep both texts in one cell.
      // A real verse always wins over a continuation marker ("↑ see v. X") from an overlapping span.
      if (verse.cont) return;
      if (existing.cont) {
        Object.assign(existing, verse);
        delete existing.cont;
        return;
      }
      existing.t = `${existing.t} ${verse.t}`;
      existing.n = `${existing.n ?? existing.v}+${verse.n ?? verse.v}`;
      merged++;
      return;
    }
    list.push(verse);
  };
  let verseCount = 0;
  for (const c of cells.values()) {
    const canonLabel = c.toV ? `${c.v}–${c.toCh !== c.ch ? `${c.toCh}:` : ""}${c.toV}` : c.v;
    const s0 = c.src[0], s1 = c.src[c.src.length - 1];
    let srcLabel = s0.ch === c.ch ? s0.v : `${s0.ch}:${s0.v}`;
    if (c.src.length > 1) srcLabel += `–${s1.ch === s0.ch ? s1.v : `${s1.ch}:${s1.v}`}`;
    put(c.book, c.ch, {
      v: c.v,
      t: c.texts.join(" "),
      ...(c.toV ? { to: c.toCh !== c.ch ? `${c.toCh}:${c.toV}` : c.toV } : {}),
      ...(srcLabel !== canonLabel ? { n: srcLabel } : {}),
    });
    verseCount += c.src.length;
    // Continuation slots for the other canonical verses this cell covers.
    if (c.toV) {
      const cont = `${c.ch}:${c.v}`;
      const start = parseInt(c.v) + 1;
      if (c.toCh === c.ch) {
        for (let i = start; i <= parseInt(c.toV); i++) put(c.book, c.ch, { v: String(i), t: "", cont });
      } else {
        if (c.toCh !== c.ch + 1) throw new Error(`span ${c.book} ${cont}-${c.toCh}:${c.toV} crosses more than one chapter`);
        const last = maxSlot.get(`${c.book} ${c.ch}`) ?? start - 1;
        for (let i = start; i <= last; i++) put(c.book, c.ch, { v: String(i), t: "", cont });
        for (let i = 1; i <= parseInt(c.toV); i++) put(c.book, c.toCh!, { v: String(i), t: "", cont });
      }
    }
  }
  for (const byCh of chapters.values())
    for (const list of byCh.values()) list.sort((a, b) => parseInt(a.v) - parseInt(b.v) || a.v.localeCompare(b.v));
  if (skippedRanges) console.log(`  ${skippedRanges} verse(s) in reordered sections left out (see import.skipChapters)`);
  if (merged) console.log(`  ${merged} slot(s) shared by two source verses (combined in one cell)`);
  if (emptySlots) console.log(`  ${emptySlots} empty verse slot(s) in source (shown as gaps)`);
  if (setAside.size)
    console.log(`  set aside for the Apocrypha section: ${[...setAside].map(([k, n]) => `${k} (${n} v.)`).join(", ")}`);
  if (extrasAfter.size) console.log(`  ${[...extrasAfter.values()].reduce((a, b) => a + b, 0)} extra verse(s) with no KJV counterpart shown as extra rows`);

  // 4. Write chapter files (wipe old output first so removed chapters don't linger)
  const outDir = path.join(TEXT_DIR, version.work, version.id);
  await rm(outDir, { recursive: true, force: true });
  const index: Record<string, number[]> = {};
  let chapterCount = 0;
  for (const [book, byCh] of chapters) {
    await mkdir(path.join(outDir, book), { recursive: true });
    const nums = [...byCh.keys()].sort((a, b) => a - b);
    index[book] = [];
    for (const n of nums) {
      const chapter: Chapter = chapterSchema.parse({
        work: version.work,
        version: version.id,
        book,
        chapter: n,
        verses: byCh.get(n),
      });
      // One verse per line keeps git diffs readable.
      const body =
        `{"work":${JSON.stringify(chapter.work)},"version":${JSON.stringify(chapter.version)},` +
        `"book":${JSON.stringify(book)},"chapter":${n},"verses":[\n` +
        chapter.verses.map((x) => JSON.stringify(x)).join(",\n") +
        "\n]}\n";
      await writeFile(path.join(outDir, book, `${n}.json`), body);
      index[book].push(chapter.verses.length);
      chapterCount++;
    }
  }
  // Chapters with no verses because the source section was left out: write an explanatory placeholder.
  for (const r of imp.skipChapters ?? []) {
    const n = books.get(r.book) ?? 0;
    for (let ch = 1; ch <= n; ch++) {
      if (chapters.get(r.book)?.has(ch)) continue;
      await mkdir(path.join(outDir, r.book), { recursive: true });
      const empty = chapterSchema.parse({ work: version.work, version: version.id, book: r.book, chapter: ch, verses: [], note: r.reason });
      await writeFile(path.join(outDir, r.book, `${ch}.json`), JSON.stringify(empty) + "\n");
      chapterCount++;
    }
  }
  await writeFile(path.join(outDir, "index.json"), JSON.stringify({ version: version.id, verseCounts: index }) + "\n");

  console.log(`${version.abbr}: ${chapters.size} books, ${chapterCount} chapters, ${verseCount} verses → ${path.relative(ROOT, outDir)}`);
  if (skippedBooks.size)
    console.log(`  skipped (not in catalog yet): ${[...skippedBooks.keys()].join(" ")}`);
  const missing = [...books.keys()].filter((b) => !chapters.has(b));
  if (missing.length) console.warn(`  MISSING books: ${missing.join(" ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
