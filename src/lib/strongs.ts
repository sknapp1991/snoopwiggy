"use client";
/**
 * Strong's numbers: which Hebrew / Greek word each translated word stands for (public/strongs, built by
 * scripts/build-strongs.ts), and the Strong's dictionary entries (public/lexicon).
 */

/** Versions whose source tags words with Strong's numbers. */
export const TAGGED = new Set(["kjv", "web", "asv", "bbe", "rvr1909", "lsg1910", "luther1912", "greek", "hebrew"]);
/** Machine-aligned tags: often right, sometimes off by a word. */
export const APPROX = new Set(["web", "asv", "bbe", "lsg1910"]);

/** [surface words, ...Strong's numbers] in reading order. */
export type Tag = [string, ...string[]];
type BookTags = Record<string, Tag[]>; // "ch:v" → tags

export type LexEntry = {
  lemma?: string;
  translit?: string;
  pron?: string;
  def?: string;
  kjv?: string;
  deriv?: string;
  count?: number;
  verses?: number;
  orig?: number;
};

const tagCache = new Map<string, Promise<BookTags | null>>();
export function loadTags(version: string, book: string): Promise<BookTags | null> {
  if (!TAGGED.has(version)) return Promise.resolve(null);
  const k = `${version}/${book}`;
  if (!tagCache.has(k))
    tagCache.set(
      k,
      fetch(`/strongs/${version}/${book}.json`)
        .then((r) => (r.ok ? (r.json() as Promise<BookTags>) : null))
        .catch(() => null),
    );
  return tagCache.get(k)!;
}

const lexCache = new Map<string, Promise<Record<string, LexEntry>>>();
export async function lexicon(num: string): Promise<LexEntry | null> {
  const m = /^([GH])(\d+)$/.exec(num);
  if (!m) return null;
  const shard = `${m[1]}${Math.floor(Number(m[2]) / 200)}`;
  if (!lexCache.has(shard))
    lexCache.set(
      shard,
      fetch(`/lexicon/${shard}.json`)
        .then((r) => (r.ok ? r.json() : {}))
        .catch(() => ({})),
    );
  return (await lexCache.get(shard)!)[num] ?? null;
}

export type Span = { start: number; end: number; nums: string[] };

/** Where each tagged word sits in our verse text (searched in order; the tags follow the text). */
export function spans(text: string, tags: Tag[]): Span[] {
  const out: Span[] = [];
  const lower = text.toLowerCase();
  let pos = 0;
  for (const [surface, ...nums] of tags) {
    if (!surface) continue;
    let i = text.indexOf(surface, pos);
    if (i < 0) i = lower.indexOf(surface.toLowerCase(), pos);
    if (i < 0) continue;
    out.push({ start: i, end: i + surface.length, nums });
    pos = i + surface.length;
  }
  return out;
}
