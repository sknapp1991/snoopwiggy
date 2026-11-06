/**
 * Red-letter words of Jesus. eBible's USFM marks them with \wj … \wj* for some versions; we turn those
 * into character ranges inside our own verse text (data/texts), so the reader can colour them.
 *
 *   npx tsx scripts/build-redletter.ts --extract   → data/redletter/<version>.json (committed; needs the
 *                                                     USFM zips in data/raw/strongs/probe, git-ignored)
 *   npx tsx scripts/build-redletter.ts             → public/redletter/<version>/<book>.json + index.json
 *                                                     (run by `npm run pack`)
 *
 * Matching ignores spaces, punctuation and brackets (our text comes from eBible's VPL files, which
 * can differ slightly from the USFM), comparing letters only.
 */
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { strFromU8, unzipSync } from "fflate";

const ROOT = path.resolve(__dirname, "..");
const DATA = path.join(ROOT, "data", "redletter");
const OUT = path.join(ROOT, "public", "redletter");
const TEXTS = path.join(ROOT, "data", "texts", "bible");

/** Site version ← eBible USFM zip that marks the words of Jesus. */
const SOURCES: Record<string, string> = { kjv: "eng-kjv", web: "engwebp", lsg1910: "fraLSG" };
const NT = new Set("mat mrk luk jhn act rom 1co 2co gal eph php col 1th 2th 1ti 2ti tit phm heb jas 1pe 2pe 1jn 2jn 3jn jud rev".split(" "));

type Ranges = Record<string, Record<string, [number, number][]>>; // book → "ch:v" → [start, end)

const START = "\u0001";
const END = "\u0002";

/** One USFM verse → plain text with START/END around the words of Jesus. */
function plain(raw: string) {
  return raw
    .replace(/\\f\s.*?\\f\*/g, "")
    .replace(/\\x\s.*?\\x\*/g, "")
    .replace(/\\wj\*/g, END)
    .replace(/\\wj\s/g, START)
    .replace(/\|[^\\]*/g, "") // word attributes (strong="…")
    .replace(/\\\+?[a-z]+[0-9]*\*?\s?/g, "") // every other marker
    .replace(/\s+/g, " ")
    .trim();
}

const isLetter = (ch: string) => /[\p{L}\p{N}]/u.test(ch);

/** Letters of `t` (lowercased) and, for each, its offset in `t`. */
function letters(t: string) {
  let s = "";
  const at: number[] = [];
  for (let i = 0; i < t.length; i++)
    if (isLetter(t[i])) {
      s += t[i].toLowerCase();
      at.push(i);
    }
  return { s, at };
}

async function extract() {
  await mkdir(DATA, { recursive: true });
  for (const [version, src] of Object.entries(SOURCES)) {
    const files = unzipSync(new Uint8Array(await readFile(path.join(ROOT, "data", "raw", "strongs", "probe", `${src}.zip`))));
    const out: Ranges = {};
    let found = 0;
    let missed = 0;
    for (const [name, bytes] of Object.entries(files)) {
      if (!name.endsWith(".usfm")) continue;
      const usfm = strFromU8(bytes);
      const code = /\\id\s+(\w+)/.exec(usfm)?.[1];
      if (!code) continue;
      const book = code.toLowerCase();
      if (!NT.has(book) || !usfm.includes("\\wj")) continue;
      let chapter = 0;
      // Split into chapters and verses; a verse runs until the next \v or \c.
      for (const part of usfm.split(/(?=\\c\s|\\v\s)/)) {
        const c = /^\\c\s+(\d+)/.exec(part);
        if (c) {
          chapter = Number(c[1]);
          continue;
        }
        const m = /^\\v\s+(\d+)\S*\s([\s\S]*)$/.exec(part);
        if (!m || !chapter || !part.includes("\\wj")) continue;
        const v = m[1];
        // Red spans can run on from the previous verse: a verse without \wj but inside a span is rare and skipped.
        const p = plain(m[2]);
        const segs: string[] = [];
        let inside = false;
        let cur = "";
        for (const ch of p) {
          if (ch === START) {
            inside = true;
            cur = "";
          } else if (ch === END) {
            if (cur.trim()) segs.push(cur);
            inside = false;
          } else if (inside) cur += ch;
        }
        if (inside && cur.trim()) segs.push(cur); // span continues into the next verse
        if (!segs.length) continue;
        let verse: { v: string; t: string } | undefined;
        try {
          const j = JSON.parse(await readFile(path.join(TEXTS, version, book, `${chapter}.json`), "utf8")) as { verses: { v: string; t: string }[] };
          verse = j.verses.find((x) => x.v === v);
        } catch {
          /* chapter not in our text */
        }
        if (!verse) {
          missed += segs.length;
          continue;
        }
        const L = letters(verse.t);
        const ranges: [number, number][] = [];
        let from = 0;
        for (const seg of segs) {
          const want = letters(seg).s;
          if (!want) continue;
          const i = L.s.indexOf(want, from);
          if (i < 0) {
            missed++;
            continue;
          }
          from = i + want.length;
          let end = L.at[i + want.length - 1] + 1;
          // Take closing punctuation that belongs to the words (e.g. "heaven." / "me?").
          while (end < verse.t.length && /[.,;:!?'’"”)\]]/.test(verse.t[end])) end++;
          ranges.push([L.at[i], end]);
          found++;
        }
        if (ranges.length) ((out[book] ??= {})[`${chapter}:${v}`] = ranges);
      }
    }
    await writeFile(path.join(DATA, `${version}.json`), JSON.stringify(out));
    console.log(`${version}: ${found} red passages${missed ? `, ${missed} not matched` : ""}`);
  }
}

async function pack() {
  await rm(OUT, { recursive: true, force: true });
  const index: Record<string, string[]> = {};
  for (const f of await readdir(DATA)) {
    if (!f.endsWith(".json")) continue;
    const version = f.slice(0, -5);
    const data = JSON.parse(await readFile(path.join(DATA, f), "utf8")) as Ranges;
    await mkdir(path.join(OUT, version), { recursive: true });
    for (const [book, ranges] of Object.entries(data)) await writeFile(path.join(OUT, version, `${book}.json`), JSON.stringify(ranges));
    index[version] = Object.keys(data);
  }
  await writeFile(path.join(OUT, "index.json"), JSON.stringify(index));
  console.log(`build-redletter: ${Object.keys(index).length} versions → public/redletter`);
}

(process.argv.includes("--extract") ? extract() : pack()).catch((e) => {
  console.error(e);
  process.exit(1);
});
