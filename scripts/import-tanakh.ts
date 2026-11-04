/**
 * Import the Tanakh (Judaism → Torah / Nevi'im / Ketuvim) in Hebrew verse numbering:
 *   - mt       Masoretic Text (Westminster Leningrad Codex, eBible "hebwlc"), already in Hebrew numbering
 *   - jps1917  JPS Tanakh 1917 (eBible "engjps"). eBible stores it in English numbering but marks the
 *              Hebrew reference in each verse that differs, e.g. "NUM 16:36 (17-1) And the LORD spoke…";
 *              a verse holding two Hebrew verses has two markers (psalm titles). We split at the markers.
 *
 *   npx tsx scripts/import-tanakh.ts            (zips cached in data/raw; downloaded if missing)
 *
 * Output: data/texts/tanakh/<version>/<book>/<chapter>.json
 */
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { catalogSchema, chapterSchema, type Chapter } from "../src/lib/schema";

const ROOT = path.resolve(__dirname, "..");
const RAW = path.join(ROOT, "data", "raw");
const OUT = path.join(ROOT, "data", "texts", "tanakh");
const VPL_TO_BOOK: Record<string, string> = { SOL: "sng", EZE: "ezk", JOE: "jol", NAH: "nam" };

const exists = (p: string) => access(p).then(() => true, () => false);
const clean = (t: string) => t.replace(/[¶]/g, "").replace(/\s+/g, " ").trim();

async function lines(id: string) {
  const zip = path.join(RAW, `${id}_vpl.zip`);
  if (!(await exists(zip))) {
    const res = await fetch(`https://ebible.org/Scriptures/${id}_vpl.zip`);
    if (!res.ok) throw new Error(`download ${id}: ${res.status}`);
    await writeFile(zip, Buffer.from(await res.arrayBuffer()));
  }
  const files = unzipSync(new Uint8Array(await readFile(zip)));
  const name = Object.keys(files).find((n) => n.endsWith("_vpl.txt"))!;
  return strFromU8(files[name]).replace(/^﻿/, "").split(/\r?\n/).filter(Boolean);
}

type Out = Map<string, Map<number, Map<number, string>>>; // book → chapter → verse → text

function put(out: Out, book: string, ch: number, v: number, t: string) {
  if (!t) return;
  const b = out.get(book) ?? out.set(book, new Map()).get(book)!;
  const c = b.get(ch) ?? b.set(ch, new Map()).get(ch)!;
  c.set(v, c.has(v) ? `${c.get(v)} ${t}` : t);
}

const LINE = /^(\S+) (\d+):(\d+) (.*)$/;

function parseMt(src: string[], books: Set<string>): Out {
  const out: Out = new Map();
  for (const l of src) {
    const m = LINE.exec(l);
    if (!m) continue;
    const book = VPL_TO_BOOK[m[1]] ?? m[1].toLowerCase();
    if (books.has(book)) put(out, book, +m[2], +m[3], clean(m[4]));
  }
  return out;
}

function parseJps(src: string[], books: Set<string>): Out {
  const out: Out = new Map();
  for (const l of src) {
    const m = LINE.exec(l);
    if (!m) continue;
    const book = VPL_TO_BOOK[m[1]] ?? m[1].toLowerCase();
    if (!books.has(book)) continue;
    // Split "(17-1) text (17-2) text" into Hebrew-numbered pieces; text before any marker keeps the English ref.
    const parts = m[4].split(/\((\d+)-(\d+)\)\s*/);
    put(out, book, +m[2], +m[3], clean(parts[0]));
    for (let i = 1; i + 2 < parts.length + 1; i += 3) put(out, book, +parts[i], +parts[i + 1], clean(parts[i + 2] ?? ""));
  }
  return out;
}

async function write(version: string, data: Out, chaptersOf: Map<string, number>) {
  const dir = path.join(OUT, version);
  await rm(dir, { recursive: true, force: true });
  let n = 0;
  for (const [book, chs] of data)
    for (const [ch, vs] of chs) {
      if (ch > (chaptersOf.get(book) ?? 0)) throw new Error(`${version} ${book} ${ch}: chapter outside the Hebrew grid`);
      const verses = [...vs.entries()].sort((a, b) => a[0] - b[0]).map(([v, t]) => ({ v: String(v), t }));
      const chapter: Chapter = chapterSchema.parse({ work: "tanakh", version, book, chapter: ch, verses });
      await mkdir(path.join(dir, book), { recursive: true });
      await writeFile(path.join(dir, book, `${ch}.json`), `{"work":"tanakh","version":"${version}","book":"${book}","chapter":${ch},"verses":[\n${chapter.verses.map((x) => JSON.stringify(x)).join(",\n")}\n]}\n`);
      n++;
    }
  console.log(`${version}: ${data.size} books, ${n} chapters`);
}

async function main() {
  const catalog = catalogSchema.parse(JSON.parse(await readFile(path.join(ROOT, "data", "catalog.json"), "utf8")));
  const chaptersOf = new Map<string, number>();
  for (const r of catalog.religions) for (const c of r.collections) for (const it of c.items) if (it.work === "tanakh" && it.chapters) chaptersOf.set(it.id, it.chapters);
  const books = new Set(chaptersOf.keys());
  await write("mt", parseMt(await lines("hebwlc"), books), chaptersOf);
  await write("jps1917", parseJps(await lines("engjps"), books), chaptersOf);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
