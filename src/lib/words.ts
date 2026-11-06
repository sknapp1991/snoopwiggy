"use client";
/**
 * Word lookup (meaning, synonyms, other languages, reading level) from public/words, built by
 * scripts/build-words.ts. See src/lib/word-norm.ts for the lookup rules.
 */
import { lookupKeys, normWord, shardFile, shardFor, WORD_LANGS, type WordEntry, type WordShard, type WordsMeta } from "./word-norm";

const has = (o: object | undefined, k: string) => !!o && Object.prototype.hasOwnProperty.call(o, k);
export const hasWords = (lang: string) => (WORD_LANGS as readonly string[]).includes(lang);

const json = <T,>(url: string): Promise<T | null> =>
  fetch(url)
    .then((r) => (r.ok ? (r.json() as Promise<T>) : null))
    .catch(() => null);

const metas = new Map<string, Promise<WordsMeta | null>>();
const meta = (lang: string) => {
  if (!metas.has(lang)) metas.set(lang, json<WordsMeta>(`/words/${lang}/meta.json`));
  return metas.get(lang)!;
};
const shards = new Map<string, Promise<WordShard | null>>();
async function shard(lang: string, key: string) {
  const m = await meta(lang);
  if (!m) return null;
  const p = shardFor(key, m.shards);
  const k = `${lang}/${p}`;
  if (!shards.has(k)) shards.set(k, json<WordShard>(`/words/${lang}/${shardFile(p)}.json`));
  return shards.get(k)!;
}

export type WordCard = {
  /** The headword (as written). */
  head: string;
  entry: WordEntry;
  /** Archaic form → modern English ("loveth" → "loves"). */
  archaic?: string;
};

/** Look a word up in a language; null when there is no card. */
export async function lookupWord(raw: string, lang: string): Promise<WordCard | null> {
  if (!hasWords(lang)) return null;
  for (const key of lookupKeys(raw, lang)) {
    const s = await shard(lang, key);
    if (!s) continue;
    const archaic = has(s.a, key) ? s.a![key] : undefined;
    const headKey = has(s.f, key) ? s.f![key] : key;
    const hs = headKey === key ? s : await shard(lang, headKey);
    if (hs && has(hs.w, headKey)) {
      const entry = hs.w[headKey];
      return { head: entry.hw ?? headKey, entry, archaic };
    }
    if (archaic) return { head: key, entry: { pos: [], defs: [], level: "archaic" }, archaic };
  }
  return null;
}

/** Level of every word form from B1 up (and archaic), for marking a chapter. */
const levelFiles = new Map<string, Promise<Record<string, string> | null>>();
export function levelsFor(lang: string) {
  if (!hasWords(lang)) return Promise.resolve(null);
  if (!levelFiles.has(lang)) levelFiles.set(lang, json<Record<string, string>>(`/words/${lang}/levels.json`));
  return levelFiles.get(lang)!;
}
export const levelKey = normWord;
