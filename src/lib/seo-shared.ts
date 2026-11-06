/**
 * Search-engine helpers that need no server APIs (also used by scripts/build-og.tsx).
 */
import { catalog, chapterTitle, DEFAULT_VERSIONS, findBook, getVersion, versionsForWork, type BookEntry } from "./catalog";
import type { Version } from "./schema";

export const SITE = "https://versesacross.com";

/** The versions a chapter's main address (no ?v=) shows a first-time visitor, and so what search engines see. */
export function seoVersions(work: string): Version[] {
  const ids = DEFAULT_VERSIONS[work] ?? versionsForWork(work).slice(0, 1).map((v) => v.id);
  return ids.map(getVersion).filter((v): v is Version => !!v);
}

/** "KJV, WEB & RVR1909" */
export function joinAbbrs(vs: Version[]): string {
  const a = vs.map((v) => v.abbr);
  return a.length < 2 ? (a[0] ?? "") : `${a.slice(0, -1).join(", ")} & ${a[a.length - 1]}`;
}

const workName = (work: string) => catalog.works.find((w) => w.id === work)?.name ?? "";
const core = (s: string) => s.toLowerCase().replace(/^the /, "").replace(/\s*\(.*\)\s*/g, "").trim();

/**
 * "Surah 1 · The Quran": the chapter's own title, plus the work's name when the title doesn't already
 * say which text it is ("Dhammapada 1" and "Bhagavad Gita, Chapter 2" stay as they are).
 */
export function seoChapterName(book: BookEntry, chapter: number): string {
  const t = chapterTitle(book, chapter, book.id);
  const w = workName(book.work!);
  return w && !core(t).startsWith(core(w)) ? `${t} · ${w}` : t;
}

export type ChapterRef = { work: string; book: string; chapter: number };

/** Validate route params against the catalog. */
export function parseChapter(work: string, bookId: string, chapter: string): (ChapterRef & { entry: BookEntry }) | null {
  const entry = findBook(work, bookId);
  const n = Number(chapter);
  if (!entry || !Number.isInteger(n) || n < 1 || n > (entry.chapters ?? 0)) return null;
  return { work, book: bookId, chapter: n, entry };
}

export const chapterPath = (r: ChapterRef) => `/read/${r.work}/${r.book}/${r.chapter}`;
export const ogImagePath = (r: { work: string; book: string }) => `/og/${r.work}/${r.book}.png`;

/** First words of a verse for a description: whole words, about `max` characters. */
export function snippet(text: string, max = 120): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t.replace(/[,;:]$/, "");
  const cut = t.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 20)).replace(/[,;:.\s]+$/, "")}…`;
}
