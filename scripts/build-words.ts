/**
 * Build the word-card data: public/words/<lang>/ (git-ignored, rebuilt by `npm run pack`).
 *
 *   meta.json     { lang, shards, entries, forms, levels, sources }
 *   <hex>.json    { w: headword → entry, f: form → headword, a: archaic form → modern English }
 *                 for every key starting with that 1–2 letter prefix (file name = hex code points, as search)
 *
 * Inputs are the committed compact sources in data/words/ made by scripts/import-words.ts:
 *   <lang>.json, freq-<lang>.json, cefr-en.json, archaic-en.json.
 * Normalisation and the shard rule are in scripts/lib/word-norm.ts (the browser uses the same code).
 *
 * Reading level per headword:
 *   English  CEFR-J (A1–B2) / Octanove (C1–C2) list; otherwise estimated from word frequency (est: 1).
 *   others   estimated from word frequency (est: 1) — wordfreq; Latin from the site's own Latin texts.
 *   "archaic" for words whose every sense is archaic/obsolete (forms in shard.a are archaic too).
 * Frequency → level thresholds are calibrated on the English CEFR list (midpoints between the median
 * Zipf frequency of neighbouring levels), then used for every language.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { shardFile, WORD_LANGS, type WordEntry, type WordShard, type WordsMeta } from "../src/lib/word-norm";

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "data", "words");
const OUT = path.join(ROOT, "public", "words");
const SHARD_BYTES = 320_000;
const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

type Src = { w: Record<string, WordEntry & { arch?: 1 }>; f: Record<string, string>; a: Record<string, string> };

const SOURCES: Record<string, string[]> = {
  en: [
    "Wiktionary (CC BY-SA 4.0), via kaikki.org / wiktextract",
    "Open English WordNet 2025 (CC BY 4.0) and Princeton WordNet (WordNet License)",
    "CEFR-J Wordlist 1.5, Tono Laboratory, TUFS; Octanove Vocabulary Profile C1/C2 (CC BY-SA 4.0)",
    "wordfreq (CC BY-SA 4.0)",
    "Archaic forms: Verses Across",
  ],
  la: ["Wiktionary (CC BY-SA 4.0), via kaikki.org / wiktextract", "Level estimated from word frequency in the site's Latin texts"],
};
const DEFAULT_SOURCES = ["Wiktionary (CC BY-SA 4.0), via kaikki.org / wiktextract", "wordfreq (CC BY-SA 4.0)"];

const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

function median(a: number[]) {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
}

/** Zipf thresholds: level i applies when zipf ≥ cut[i]. */
function calibrate(cefr: Record<string, string>, freq: Record<string, number>): number[] {
  const med = LEVELS.map((L) => median(Object.entries(cefr).filter(([w, l]) => l === L && has(freq, w)).map(([w]) => freq[w])));
  const cut = LEVELS.map((_, i) => (i < LEVELS.length - 1 ? (med[i] + med[i + 1]) / 2 : -Infinity));
  // keep them strictly decreasing
  for (let i = 1; i < cut.length - 1; i++) if (cut[i] >= cut[i - 1]) cut[i] = cut[i - 1] - 0.1;
  console.log(`  level medians ${med.map((m, i) => `${LEVELS[i]} ${m.toFixed(2)}`).join(", ")}`);
  return cut;
}

function estimate(z: number | undefined, cut: number[]) {
  if (z === undefined) return "C2";
  return LEVELS[cut.findIndex((c) => z >= c)];
}

function shardsOf(keys: string[], size: (k: string) => number): Map<string, string[]> {
  const first = new Map<string, string[]>();
  for (const k of keys) {
    const p = [...k][0];
    (first.get(p) ?? first.set(p, []).get(p)!).push(k);
  }
  const out = new Map<string, string[]>();
  for (const [p, list] of first) {
    if (list.reduce((n, k) => n + size(k), 0) <= SHARD_BYTES) {
      out.set(p, list);
      continue;
    }
    const two = new Map<string, string[]>();
    for (const k of list) {
      const c = [...k];
      const q = c.length > 1 ? c.slice(0, 2).join("") : p;
      (two.get(q) ?? two.set(q, []).get(q)!).push(k);
    }
    // a third letter only for the few two-letter groups that are still far too big ("co", "un")
    for (const [q, l2] of two) {
      if (l2.reduce((n, k) => n + size(k), 0) <= 1.3 * SHARD_BYTES) {
        out.set(q, l2);
        continue;
      }
      for (const k of l2) {
        const c = [...k];
        const r = c.length > 2 ? c.slice(0, 3).join("") : q;
        (out.get(r) ?? out.set(r, []).get(r)!).push(k);
      }
    }
  }
  return out;
}

async function main() {
  await rm(OUT, { recursive: true, force: true });
  const cefr: Record<string, string> = JSON.parse(await readFile(path.join(SRC, "cefr-en.json"), "utf8"));
  const enFreq: Record<string, number> = JSON.parse(await readFile(path.join(SRC, "freq-en.json"), "utf8"));
  const cut = calibrate(cefr, enFreq);
  let files = 0;
  let bytes = 0;
  for (const lang of WORD_LANGS) {
    const file = path.join(SRC, `${lang}.json`);
    if (!existsSync(file)) continue;
    const src: Src = JSON.parse(await readFile(file, "utf8"));
    const freq: Record<string, number> = JSON.parse(await readFile(path.join(SRC, `freq-${lang}.json`), "utf8"));
    for (const [k, e] of Object.entries(src.w)) {
      const nameOnly = e.pos.length > 0 && e.pos.every((p) => p === "name");
      if (e.arch) {
        e.level = "archaic";
        delete e.arch;
      } else if (lang === "en" && has(cefr, k)) e.level = cefr[k];
      else if (!nameOnly && e.defs.length) {
        e.level = estimate(has(freq, k) ? freq[k] : undefined, cut);
        e.est = 1;
      }
    }
    // one key space: headwords and forms share shards by their own first letters
    const keys = [...new Set([...Object.keys(src.w), ...Object.keys(src.f), ...Object.keys(src.a)])];
    const size = (k: string) =>
      k.length * 2 + 8 + (has(src.w, k) ? JSON.stringify(src.w[k]).length : 0) + (has(src.f, k) ? src.f[k].length + 4 : 0) + (has(src.a, k) ? src.a[k].length + 4 : 0);
    const groups = shardsOf(keys, size);
    await mkdir(path.join(OUT, lang), { recursive: true });
    for (const [prefix, list] of groups) {
      const shard: WordShard = { w: {} };
      for (const k of list.sort()) {
        if (has(src.w, k)) shard.w[k] = src.w[k];
        if (has(src.f, k)) (shard.f ??= {})[k] = src.f[k];
        if (has(src.a, k)) (shard.a ??= {})[k] = src.a[k];
      }
      const body = JSON.stringify(shard);
      await writeFile(path.join(OUT, lang, `${shardFile(prefix)}.json`), body);
      files++;
      bytes += body.length;
    }
    // Reading levels: every form → its level, only B1 and up (+ archaic), in one small file per language
    // so the reader can mark a whole chapter without loading every dictionary shard.
    const levels: Record<string, string> = {};
    for (const k of keys) {
      if (has(src.a, k)) {
        levels[k] = "archaic";
        continue;
      }
      const head = has(src.f, k) ? src.f[k] : k;
      const lvl = has(src.w, head) ? src.w[head].level : undefined;
      if (lvl && lvl !== "A1" && lvl !== "A2") levels[k] = lvl;
    }
    const lv = JSON.stringify(levels);
    await writeFile(path.join(OUT, lang, "levels.json"), lv);
    files++;
    bytes += lv.length;
    const meta: WordsMeta = {
      lang,
      shards: [...groups.keys()].sort(),
      entries: Object.keys(src.w).length,
      forms: Object.keys(src.f).length,
      levels: lang === "en" ? "CEFR-J / Octanove list; other words estimated from word frequency" : "estimated from word frequency",
      sources: SOURCES[lang] ?? DEFAULT_SOURCES,
    };
    await writeFile(path.join(OUT, lang, "meta.json"), JSON.stringify(meta));
    files++;
    console.log(`  ${lang}: ${meta.entries} headwords, ${meta.forms} forms, ${groups.size} shards`);
  }
  console.log(`build-words: ${files} files, ${(bytes / 1e6).toFixed(1)} MB → public/words`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
