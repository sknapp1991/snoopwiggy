/**
 * Word normalisation shared by the index builder (scripts/build-search.ts) and the browser,
 * so a query matches exactly the forms that were indexed.
 *
 * - lower case, accents / vowel points / cantillation removed (Greek, Hebrew niqqud, Arabic harakat):
 *   "Θεὸς" → "θεος", "אֱלֹהִים" → "אלהים", "señor" → "senor"
 * - Arabic alef variants (أ إ آ ٱ) → ا, tatweel removed
 * - words split on anything that is not a letter or digit (apostrophes, the Hebrew maqaf, etc.)
 */

/** Letters + combining marks + digits: a "word" as it appears in the text (marks still attached). */
export const RAW_WORD = /[\p{L}\p{M}\p{N}]+/gu;

export function normalizeWord(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ـ/g, "")
    .toLowerCase()
    .normalize("NFC");
}

/** All normalised words of a text, in order (duplicates kept). */
export function words(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(RAW_WORD)) {
    const w = normalizeWord(m[0]);
    if (w) out.push(w);
  }
  return out;
}

/** File name for an index shard: the prefix as hex code points ("da" → "64-61"), safe on every file system. */
export function shardFile(prefix: string): string {
  return [...prefix].map((c) => c.codePointAt(0)!.toString(16)).join("-") || "_";
}

/** Per-version index metadata (public/search/<version>/meta.json). */
export type SearchMeta = {
  version: string;
  /**
   * Books present in this version, in reading order. Per chapter: the number of verse slots when they
   * are simply verses 1…n, otherwise the list of verse ids in order (e.g. ["1","1a","2"]).
   */
  books: [book: string, chapters: (number | string[])[]][];
  /** Shard prefixes; a word lives in the shard with the longest prefix that starts it. */
  shards: string[];
  words: number;
};

/** A shard: word → delta-encoded verse ordinals (each ordinal = position in this version's verse order). */
export type SearchShard = Record<string, number[]>;
