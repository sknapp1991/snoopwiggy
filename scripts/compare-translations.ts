/**
 * Translation bake-off: run sample passages through several AI providers so they can be judged
 * side by side at /compare before choosing one for bulk AI translations.
 *
 *   npx tsx scripts/compare-translations.ts [providerId ...]     # default: all available
 *
 * Providers: qwen3-8b, qwen3-14b (Ollama, local), gemini (needs GEMINI_API_KEY in .env.local),
 * claude (translations written by Claude in data/ai-compare/claude/<lang>.json — no API call).
 * Results are merged into public/compare/results.json (re-running a provider replaces only its entries).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GeminiProvider, OllamaProvider, type AIProvider, type TranslatedVerse } from "../src/lib/ai";
import { chapterSchema } from "../src/lib/schema";

const ROOT = path.resolve(__dirname, "..");
try {
  process.loadEnvFile(path.join(ROOT, ".env.local"));
} catch {
  /* no .env.local */
}

export const SAMPLES = [
  { id: "psa23", book: "psa", chapter: 23, from: 1, to: 6, reference: "Psalm 23", genre: "poetry" },
  { id: "jhn3", book: "jhn", chapter: 3, from: 1, to: 17, reference: "John 3:1–17", genre: "dialogue / theology" },
];
export const LANGS = [
  { code: "es", name: "Spanish", native: "rvr1909" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "la", name: "Latin" },
  { code: "el", name: "Greek", note: "Modern Greek" },
  { code: "he", name: "Hebrew", note: "Modern Hebrew" },
];
const SOURCE = { id: "web", name: "World English Bible" };

type Results = {
  source: string;
  samples: typeof SAMPLES;
  langs: typeof LANGS;
  providers: Record<string, { label: string; kind: "local" | "api" | "claude" }>;
  english: Record<string, TranslatedVerse[]>;
  native: Record<string, Record<string, { version: string; verses: TranslatedVerse[] }>>;
  translations: Record<string, Record<string, Record<string, { verses: TranslatedVerse[]; ms?: number } | { error: string }>>>;
};

async function loadVerses(version: string, s: (typeof SAMPLES)[number]) {
  const file = path.join(ROOT, "data", "texts", "bible", version, s.book, `${s.chapter}.json`);
  const ch = chapterSchema.parse(JSON.parse(await readFile(file, "utf8")));
  return ch.verses.filter((x) => +x.v >= s.from && +x.v <= s.to && !x.cont).map(({ v, t }) => ({ v, t }));
}

async function main() {
  const out = path.join(ROOT, "public", "compare", "results.json");
  let results: Results;
  try {
    results = JSON.parse(await readFile(out, "utf8"));
  } catch {
    results = { source: SOURCE.name, samples: SAMPLES, langs: LANGS, providers: {}, english: {}, native: {}, translations: {} };
  }
  results.samples = SAMPLES;
  results.langs = LANGS;
  for (const s of SAMPLES) {
    results.english[s.id] = await loadVerses(SOURCE.id, s);
    for (const l of LANGS)
      if (l.native) {
        results.native[l.code] ??= {};
        results.native[l.code][s.id] = { version: "Reina-Valera 1909", verses: await loadVerses(l.native, s) };
      }
  }

  const available: Record<string, () => AIProvider | "claude"> = {
    "qwen3-8b": () => new OllamaProvider("qwen3:8b"),
    "qwen3-14b": () => new OllamaProvider("qwen3:14b"),
    gemini: () => new GeminiProvider(),
    claude: () => "claude",
  };
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const named = args.filter((a) => !a.startsWith("--"));
  const wanted = named.length ? named : Object.keys(available);

  const save = async () => {
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, JSON.stringify(results, null, 1) + "\n");
  };

  for (const id of wanted) {
    const make = available[id];
    if (!make) throw new Error(`unknown provider ${id}`);
    if (id === "gemini" && !process.env.GEMINI_API_KEY) {
      console.log("gemini: skipped (GEMINI_API_KEY not set in .env.local)");
      continue;
    }
    const p = make();
    const prev = results.translations[id];
    results.translations[id] = {};
    if (p === "claude") {
      results.providers[id] = { label: "Claude (Opus 5.5)", kind: "claude" };
      for (const l of LANGS) {
        try {
          const data = JSON.parse(await readFile(path.join(ROOT, "data", "ai-compare", "claude", `${l.code}.json`), "utf8"));
          results.translations[id][l.code] = {};
          for (const s of SAMPLES) results.translations[id][l.code][s.id] = { verses: data[s.id] };
        } catch {
          console.log(`claude/${l.code}: no file yet`);
        }
      }
      await save();
      continue;
    }
    results.providers[id] = { label: p.label, kind: id === "gemini" ? "api" : "local" };
    for (const l of LANGS) {
      results.translations[id][l.code] = prev?.[l.code] ?? {};
      for (const s of SAMPLES) {
        const done = results.translations[id][l.code][s.id];
        if (done && "verses" in done && !force) continue; // keep good results; retry errors/missing
        const t0 = Date.now();
        try {
          const verses = await p.translateChapter({
            reference: s.reference,
            sourceVersion: SOURCE.name,
            targetLanguage: l.note ?? l.name,
            verses: results.english[s.id],
          });
          results.translations[id][l.code][s.id] = { verses, ms: Date.now() - t0 };
          console.log(`${id} ${l.code} ${s.id}: ok in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
        } catch (e) {
          results.translations[id][l.code][s.id] = { error: (e as Error).message.slice(0, 300) };
          console.log(`${id} ${l.code} ${s.id}: ERROR ${(e as Error).message.slice(0, 200)}`);
        }
        await save();
      }
    }
  }
  console.log(`saved ${path.relative(ROOT, out)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
