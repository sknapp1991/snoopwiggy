/**
 * Every distinct word (normalised with word-norm.ts) in the site's texts, per language, with counts.
 * Reads data/texts/<work>/<version>/<book>/<chapter>.json; a version's language comes from data/catalog.json.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { normWord, WORD_LANGS, WORD_RE } from "../../src/lib/word-norm";

const ROOT = path.resolve(__dirname, "..", "..");
const SRC = path.join(ROOT, "data", "texts");

type Cat = { versions: { id: string; work: string; language: string }[] };

async function dirs(p: string) {
  try {
    return (await readdir(p, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return [];
  }
}

/** lang → (key → count). Raw tokens keep their apostrophes; keys are lookup keys of each token. */
export async function scanCorpus(langs: readonly string[] = WORD_LANGS): Promise<Map<string, Map<string, number>>> {
  const cat: Cat = JSON.parse(await readFile(path.join(ROOT, "data", "catalog.json"), "utf8"));
  const out = new Map<string, Map<string, number>>();
  for (const v of cat.versions) {
    if (!langs.includes(v.language)) continue;
    const counts = out.get(v.language) ?? out.set(v.language, new Map()).get(v.language)!;
    const base = path.join(SRC, v.work, v.id);
    for (const book of await dirs(base)) {
      const files = (await readdir(path.join(base, book))).filter((f) => f.endsWith(".json"));
      await Promise.all(
        files.map(async (f) => {
          const c = JSON.parse(await readFile(path.join(base, book, f), "utf8")) as { verses?: { t?: string }[]; title?: string };
          for (const verse of c.verses ?? [])
            for (const m of (verse.t ?? "").matchAll(WORD_RE)) {
              const k = normWord(m[0], v.language);
              if (k && !/^\d+$/.test(k)) counts.set(k, (counts.get(k) ?? 0) + 1);
            }
        }),
      );
    }
  }
  return out;
}
