/**
 * Build the full-text search index: one inverted index per version, sharded by word prefix,
 * written as static files to public/search/<version>/ (git-ignored, rebuilt on predev / prebuild).
 *
 *   meta.json       books + verse counts per chapter (to decode verse ordinals) and the shard list
 *   <hex>.json      { word: [delta-encoded verse ordinals] } for every word starting with that prefix
 *
 * Shards start as one per first letter and split by the next letter until each is under SHARD_BYTES,
 * so a lookup downloads one small file. Words are normalised with src/lib/search-text.ts (same code
 * as the browser). A verse ordinal is the verse's position when walking books (catalog order) →
 * chapters → verses exactly as stored in the packed book files.
 */
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { booksOfWork, catalog } from "../src/lib/catalog";
import { shardFile, words, type SearchMeta, type SearchShard } from "../src/lib/search-text";

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "data", "texts");
const OUT = path.join(ROOT, "public", "search");
const SHARD_BYTES = 150_000;

type Chapter = { verses: { v: string; t: string }[] };

async function exists(p: string) {
  try {
    await readdir(p);
    return true;
  } catch {
    return false;
  }
}

function encode(list: number[]) {
  const out: number[] = [];
  let prev = 0;
  for (const n of list) {
    out.push(n - prev);
    prev = n;
  }
  return out;
}

const sizes = new Map<string, number>();
/** Bytes this word adds to a shard file: "word":[deltas], */
function sizeOf(words: string[], postings: Map<string, number[]>) {
  let n = 2;
  for (const w of words) {
    let s = sizes.get(w);
    if (s === undefined) sizes.set(w, (s = Buffer.byteLength(JSON.stringify(w)) + 2 + JSON.stringify(encode(postings.get(w)!)).length));
    n += s;
  }
  return n;
}

/** Split words into prefix shards, each small enough. */
function shard(all: string[], postings: Map<string, number[]>): Map<string, string[]> {
  const result = new Map<string, string[]>();
  const split = (prefix: string, list: string[]) => {
    if (sizeOf(list, postings) <= SHARD_BYTES || list.every((w) => w === prefix)) {
      result.set(prefix, list);
      return;
    }
    const groups = new Map<string, string[]>();
    const exact: string[] = [];
    for (const w of list) {
      const chars = [...w];
      if (chars.length <= [...prefix].length) exact.push(w);
      else {
        const p = chars.slice(0, [...prefix].length + 1).join("");
        (groups.get(p) ?? groups.set(p, []).get(p)!).push(w);
      }
    }
    if (exact.length) result.set(prefix, exact);
    for (const [p, l] of groups) split(p, l);
  };
  const first = new Map<string, string[]>();
  for (const w of all) {
    const p = [...w][0];
    (first.get(p) ?? first.set(p, []).get(p)!).push(w);
  }
  for (const [p, l] of first) split(p, l);
  return result;
}

async function buildVersion(work: string, version: string) {
  const postings = new Map<string, number[]>();
  sizes.clear();
  const books: SearchMeta["books"] = [];
  let ordinal = 0;
  for (const b of booksOfWork(work)) {
    const dir = path.join(SRC, work, version, b.id);
    if (!(await exists(dir))) continue;
    const counts: (number | string[])[] = [];
    for (let ch = 1; ch <= b.chapters!; ch++) {
      let c: Chapter;
      try {
        c = JSON.parse(await readFile(path.join(dir, `${ch}.json`), "utf8"));
      } catch {
        counts.push(0);
        continue;
      }
      const regular = c.verses.every((x, i) => x.v === String(i + 1));
      counts.push(regular ? c.verses.length : c.verses.map((x) => x.v));
      for (const v of c.verses) {
        for (const w of new Set(words(v.t))) {
          const list = postings.get(w) ?? postings.set(w, []).get(w)!;
          list.push(ordinal);
        }
        ordinal++;
      }
    }
    books.push([b.id, counts]);
  }

  const all = [...postings.keys()].sort();
  const shards = shard(all, postings);
  const dir = path.join(OUT, version);
  await mkdir(dir, { recursive: true });
  let bytes = 0;
  for (const [prefix, list] of shards) {
    const data: SearchShard = {};
    for (const w of list) data[w] = encode(postings.get(w)!);
    const body = JSON.stringify(data);
    bytes += body.length;
    await writeFile(path.join(dir, `${shardFile(prefix)}.json`), body);
  }
  const meta: SearchMeta = { version, books, shards: [...shards.keys()].sort(), words: all.length };
  await writeFile(path.join(dir, "meta.json"), JSON.stringify(meta));
  return { files: shards.size + 1, bytes, words: all.length, verses: ordinal };
}

async function main() {
  await rm(OUT, { recursive: true, force: true });
  let files = 0;
  let bytes = 0;
  for (const v of catalog.versions) {
    if (!(await exists(path.join(SRC, v.work, v.id)))) continue;
    const r = await buildVersion(v.work, v.id);
    files += r.files;
    bytes += r.bytes;
    console.log(`  ${v.id.padEnd(11)} ${String(r.words).padStart(7)} words  ${String(r.verses).padStart(6)} verses  ${r.files} files`);
  }
  console.log(`build-search: ${files} files, ${(bytes / 1e6).toFixed(1)} MB → public/search`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
