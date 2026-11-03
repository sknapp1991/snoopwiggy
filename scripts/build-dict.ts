/**
 * Build English → other-language word equivalents from the aligned Bibles themselves (no AI, no
 * outside dictionary): if "sacrifice" and "sacrificio" keep appearing in the same verses, they are
 * linked. Used by search to look up "sacrifice" in Spanish as "sacrificio, sacrificios…".
 *
 *   npx tsx scripts/build-dict.ts            → data/dict/<version>.json   (committed; re-run after imports)
 *
 * Method: per verse, the English side is the union of KJV + WEB + ASV words (so old and modern
 * spellings both map); the other side is that version's words. Very common words (the 150 most frequent
 * on each side) are skipped. Score = Dice coefficient 2·both / (verses with A + verses with B).
 * For each English word keep up to 4 equivalents scoring ≥ 0.18 and ≥ 60% of the best one.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { booksOfWork, catalog } from "../src/lib/catalog";
import { words } from "../src/lib/search-text";

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "data", "texts");
const OUT = path.join(ROOT, "data", "dict");
const ENGLISH = ["kjv", "web", "asv"];
const STOP = 150;
const MIN_BOTH = 2;
const MIN_DICE = 0.18;

type VerseWords = Map<string, Set<string>>; // "gen/1/3" → words

async function load(work: string, version: string): Promise<VerseWords> {
  const out: VerseWords = new Map();
  for (const b of booksOfWork(work))
    for (let ch = 1; ch <= b.chapters!; ch++) {
      let c: { verses: { v: string; t: string }[] };
      try {
        c = JSON.parse(await readFile(path.join(SRC, work, version, b.id, `${ch}.json`), "utf8"));
      } catch {
        continue;
      }
      for (const v of c.verses) if (v.t) out.set(`${b.id}/${ch}/${v.v}`, new Set(words(v.t)));
    }
  return out;
}

function stopwords(sides: Set<string>[]): Set<string> {
  const df = new Map<string, number>();
  for (const s of sides) for (const w of s) df.set(w, (df.get(w) ?? 0) + 1);
  return new Set([...df.entries()].sort((a, b) => b[1] - a[1]).slice(0, STOP).map(([w]) => w));
}

async function main() {
  const work = "bible";
  const english: VerseWords = new Map();
  for (const id of ENGLISH)
    for (const [k, ws] of await load(work, id)) {
      const set = english.get(k) ?? new Set<string>();
      ws.forEach((w) => set.add(w));
      english.set(k, set);
    }
  const enStop = stopwords([...english.values()]);
  await mkdir(OUT, { recursive: true });

  for (const v of catalog.versions) {
    if (v.work !== work || v.language === "en") continue;
    const target = await load(work, v.id);
    const tStop = stopwords([...target.values()]);
    const dfE = new Map<string, number>();
    const dfT = new Map<string, number>();
    const both = new Map<string, Map<string, number>>();
    for (const [k, tw] of target) {
      const ew = english.get(k);
      if (!ew) continue;
      const E = [...ew].filter((w) => !enStop.has(w) && !/^\d+$/.test(w));
      const T = [...tw].filter((w) => !tStop.has(w) && !/^\d+$/.test(w));
      E.forEach((w) => dfE.set(w, (dfE.get(w) ?? 0) + 1));
      T.forEach((w) => dfT.set(w, (dfT.get(w) ?? 0) + 1));
      for (const e of E) {
        let m = both.get(e);
        if (!m) both.set(e, (m = new Map()));
        for (const t of T) m.set(t, (m.get(t) ?? 0) + 1);
      }
    }
    const dict: Record<string, string[]> = {};
    for (const [e, m] of both) {
      const de = dfE.get(e)!;
      if (de < MIN_BOTH) continue;
      const scored: [string, number][] = [];
      for (const [t, c] of m) {
        if (c < MIN_BOTH) continue;
        const dice = (2 * c) / (de + dfT.get(t)!);
        if (dice >= MIN_DICE) scored.push([t, dice]);
      }
      if (!scored.length) continue;
      scored.sort((a, b) => b[1] - a[1]);
      const best = scored[0][1];
      dict[e] = scored.filter(([, d]) => d >= best * 0.6).slice(0, 4).map(([t]) => t);
    }
    const sorted = Object.fromEntries(Object.entries(dict).sort(([a], [b]) => a.localeCompare(b)));
    await writeFile(path.join(OUT, `${v.id}.json`), JSON.stringify(sorted));
    console.log(`  ${v.id.padEnd(11)} ${Object.keys(sorted).length} English words linked`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
