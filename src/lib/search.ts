"use client";
/**
 * Full-text search in the browser over the static index built by scripts/build-search.ts.
 * Only the shards a query needs are downloaded (one small file per word), and cached.
 *
 * Query syntax: words are ANDed ("light darkness" = verses with both); a trailing * matches a prefix
 * ("dark*" = dark, darkness, darkened …). Matching ignores case and accents / vowel points.
 */
import { normalizeWord, RAW_WORD, shardFile, type SearchMeta, type SearchShard } from "./search-text";

/** `maxExtra`: for a prefix term, at most this many letters after it (equivalents: "sacrificio" → "sacrificios"). */
export type Term = { word: string; prefix: boolean; maxExtra?: number };
const termMatches = (t: Term, w: string) =>
  t.prefix ? w.startsWith(t.word) && (t.maxExtra === undefined || [...w].length - [...t.word].length <= t.maxExtra) : w === t.word;
/** One matching verse: canonical reference + the versions it matched in. */
export type VerseHit = { book: string; chapter: number; v: string; versions: string[] };

const metas = new Map<string, Promise<SearchMeta>>();
const shards = new Map<string, Promise<SearchShard>>();

function getJson<T>(url: string, cache: Map<string, Promise<T>>): Promise<T> {
  let p = cache.get(url);
  if (!p) {
    p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`Search index unavailable (HTTP ${r.status})`);
      return r.json() as Promise<T>;
    });
    p.catch(() => cache.delete(url));
    cache.set(url, p);
  }
  return p;
}

export const loadMeta = (version: string) => getJson(`/search/${version}/meta.json`, metas);
const dicts = new Map<string, Promise<Record<string, string[]>>>();
/** English → this version's word equivalents (built by scripts/build-dict.ts); {} when there is none. */
const loadDict = (version: string) =>
  getJson<Record<string, string[]>>(`/search/${version}/dict.json`, dicts).catch(() => ({}) as Record<string, string[]>);
const loadShard = (version: string, prefix: string) => getJson(`/search/${version}/${shardFile(prefix)}.json`, shards);

export function parseQuery(q: string): Term[] {
  const terms: Term[] = [];
  for (const part of q.split(/\s+/)) {
    const prefix = part.endsWith("*");
    for (const m of part.matchAll(RAW_WORD)) {
      const word = normalizeWord(m[0]);
      if (word) terms.push({ word, prefix: false });
    }
    if (prefix && terms.length) terms[terms.length - 1].prefix = true;
  }
  // de-dupe
  const seen = new Set<string>();
  return terms.filter((t) => {
    const k = `${t.word}${t.prefix ? "*" : ""}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** The shards that can hold words starting with `word` (one shard, or several for a short prefix). */
function shardsFor(meta: SearchMeta, word: string, prefix: boolean): string[] {
  let best = "";
  for (const s of meta.shards) if (word.startsWith(s) && s.length > best.length) best = s;
  if (!prefix) return best ? [best] : [];
  // A prefix shorter than the shard prefixes spans every shard that starts with it.
  const longer = meta.shards.filter((s) => s.startsWith(word) && s !== best);
  return best ? [best, ...longer] : longer;
}

function decode(deltas: number[]): number[] {
  const out = new Array<number>(deltas.length);
  let n = 0;
  for (let i = 0; i < deltas.length; i++) out[i] = n += deltas[i];
  return out;
}

/** Every indexed word form matching a term, with its verse ordinals. */
async function matchTerm(version: string, meta: SearchMeta, t: Term): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  const files = await Promise.all(shardsFor(meta, t.word, t.prefix).map((s) => loadShard(version, s)));
  for (const shard of files)
    if (t.prefix) {
      for (const w in shard) if (termMatches(t, w)) out.set(w, decode(shard[w]));
    } else if (shard[t.word]) out.set(t.word, decode(shard[t.word]));
  return out;
}

/** Turns a verse ordinal into book / chapter / verse id. */
function makeDecoder(meta: SearchMeta) {
  const starts: { ord: number; book: string; chapter: number; ids: number | string[] }[] = [];
  let ord = 0;
  for (const [book, chapters] of meta.books)
    chapters.forEach((ids, i) => {
      const n = typeof ids === "number" ? ids : ids.length;
      if (n) starts.push({ ord, book, chapter: i + 1, ids });
      ord += n;
    });
  return (o: number) => {
    let lo = 0,
      hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid].ord <= o) lo = mid;
      else hi = mid - 1;
    }
    const s = starts[lo];
    const idx = o - s.ord;
    return { book: s.book, chapter: s.chapter, v: typeof s.ids === "number" ? String(idx + 1) : s.ids[idx] };
  };
}

export type SearchResult = {
  terms: Term[];
  /** Terms used per version (the query plus its equivalents in that language), for highlighting. */
  termsByVersion: Record<string, Term[]>;
  /** Equivalent words that were searched per version, e.g. { rvr1909: ["sacrificio"] } */
  equivalents: Record<string, string[]>;
  hits: VerseHit[];
  /** verses matched per version */
  perVersion: Record<string, number>;
  /** indexed word forms that matched each term (shows what a * expanded to) */
  forms: string[];
};

export type SearchOptions = {
  /** Versions in other languages also search the English words' equivalents in that language. */
  crossLanguage?: boolean;
  /** Language of each version (to know which ones aren't English). */
  languageOf?: (version: string) => string;
  /** Equivalents the user turned off, as "version:word". */
  exclude?: Set<string>;
};

export async function search(query: string, versions: string[], opts: SearchOptions = {}): Promise<SearchResult> {
  const terms = parseQuery(query);
  const empty = { terms, termsByVersion: {}, equivalents: {}, hits: [], perVersion: {}, forms: [] };
  if (!terms.length || !versions.length) return empty;
  const byKey = new Map<string, VerseHit>();
  const perVersion: Record<string, number> = {};
  const termsByVersion: Record<string, Term[]> = {};
  const equivalents: Record<string, string[]> = {};
  const forms = new Set<string>();
  await Promise.all(
    versions.map(async (version) => {
      const meta = await loadMeta(version);
      // Each query term becomes a group: the word itself, plus its equivalents in this language.
      const groups: Term[][] = terms.map((t) => [t]);
      if (opts.crossLanguage && opts.languageOf?.(version) !== "en") {
        const dict = await loadDict(version);
        terms.forEach((t, i) => {
          if (t.prefix) return;
          for (const w of dict[t.word] ?? []) {
            if (opts.exclude?.has(`${version}:${w}`)) continue;
            // plus close forms (plural, gender): up to 2 more letters, only for longer words
            groups[i].push({ word: w, prefix: [...w].length >= 4, maxExtra: 2 });
            (equivalents[version] ??= []).push(w);
          }
        });
      }
      termsByVersion[version] = groups.flat();
      const sets = await Promise.all(
        groups.map(async (g) => {
          const merged = new Map<string, number[]>();
          for (const m of await Promise.all(g.map((t) => matchTerm(version, meta, t)))) m.forEach((l, w) => merged.set(w, l));
          return merged;
        }),
      );
      sets.forEach((m) => m.forEach((_, w) => forms.add(w)));
      // AND across terms, OR across the forms of one term.
      let result = null as Set<number> | null;
      for (const m of sets) {
        const s = new Set<number>();
        m.forEach((list) => list.forEach((o) => s.add(o)));
        result = result ? new Set([...result].filter((o) => s.has(o))) : s;
        if (!result.size) break;
      }
      const decodeOrd = makeDecoder(meta);
      perVersion[version] = result?.size ?? 0;
      for (const o of result ?? []) {
        const r = decodeOrd(o);
        const key = `${r.book}/${r.chapter}/${r.v}`;
        const hit = byKey.get(key);
        if (hit) hit.versions.push(version);
        else byKey.set(key, { ...r, versions: [version] });
      }
    }),
  );
  return { terms, termsByVersion, equivalents, hits: [...byKey.values()], perVersion, forms: [...forms].sort() };
}

/** Word completions for the last (partial) term: most frequent forms first. */
export async function suggest(partial: string, version: string, limit = 8): Promise<{ word: string; count: number }[]> {
  const word = normalizeWord(partial);
  if ([...word].length < 2) return [];
  const meta = await loadMeta(version);
  const m = await matchTerm(version, meta, { word, prefix: true });
  return [...m.entries()]
    .map(([w, list]) => ({ word: w, count: list.length }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
    .slice(0, limit);
}

/** Split text into plain and matching parts, for highlighting (works on the original accented text). */
export function markMatches(text: string, terms: Term[]): { text: string; hit: boolean }[] {
  if (!terms.length) return [{ text, hit: false }];
  const parts: { text: string; hit: boolean }[] = [];
  let last = 0;
  for (const m of text.matchAll(RAW_WORD)) {
    const w = normalizeWord(m[0]);
    if (!terms.some((t) => termMatches(t, w))) continue;
    if (m.index! > last) parts.push({ text: text.slice(last, m.index), hit: false });
    parts.push({ text: m[0], hit: true });
    last = m.index! + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), hit: false });
  return parts;
}
