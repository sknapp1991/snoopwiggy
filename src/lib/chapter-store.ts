"use client";
/**
 * Client cache of chapter texts, one entry per work/version/book/chapter.
 * Each column loads independently, so a slow column (e.g. an AI translation in Phase 2)
 * shows its own loading state without blocking the others.
 */
import { createContext, createElement, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import type { Chapter } from "./schema";

export type ChapterEntry =
  | { status: "loading" }
  | { status: "ok"; data: Chapter }
  | { status: "error"; message: string };

const cache = new Map<string, ChapterEntry>();
const listeners = new Set<() => void>();
let version = 0;

function emit() {
  version++;
  listeners.forEach((l) => l());
}

export function chapterKey(work: string, ver: string, book: string, chapter: number) {
  return `${work}/${ver}/${book}/${chapter}`;
}

export type BookFile = { work: string; version: string; book: string; chapters: Record<string, Pick<Chapter, "verses" | "note" | "title">> };
/** Texts are served one file per book (scripts/pack-texts.ts); every chapter of a book shares one request. */
const books = new Map<string, Promise<BookFile>>();

function loadBook(bookKey: string, retry: boolean) {
  let p = books.get(bookKey);
  if (!p || retry) {
    p = fetch(`/texts/${bookKey}.json`).then(async (res) => {
      if (!res.ok) throw new Error(res.status === 404 ? "Not available in this version" : `HTTP ${res.status}`);
      return (await res.json()) as BookFile;
    });
    p.catch(() => books.delete(bookKey)); // let a later attempt retry
    books.set(bookKey, p);
  }
  return p;
}

/** A whole book of one version (shared with the reader's cache; used by search results). */
export function fetchBook(work: string, version: string, book: string): Promise<BookFile> {
  return loadBook(`${work}/${version}/${book}`, false);
}

export function loadChapter(key: string, { retry = false } = {}) {
  const existing = cache.get(key);
  if (existing && !(retry && existing.status === "error")) return;
  cache.set(key, { status: "loading" });
  emit();
  const [work, version, book, ch] = key.split("/");
  loadBook(`${work}/${version}/${book}`, retry)
    .then((b) => {
      const c = b.chapters[ch];
      if (!c) throw new Error("Chapter not available in this version");
      return { work, version, book, chapter: Number(ch), ...c } as Chapter;
    })
    .then((data) => cache.set(key, { status: "ok", data }))
    .catch((e: unknown) => {
      const offline = typeof navigator !== "undefined" && !navigator.onLine;
      cache.set(key, { status: "error", message: offline ? "You appear to be offline" : String((e as Error).message ?? e) });
    })
    .finally(emit);
}

/**
 * Chapters the server already loaded for this page (so the first HTML has the text, for search engines and
 * a faster first paint). The reader uses them instead of fetching; anything else loads as usual.
 */
const SeedCtx = createContext<Map<string, ChapterEntry> | null>(null);

export function ChapterSeed({ chapters, children }: { chapters: Chapter[]; children: ReactNode }) {
  const map = useMemo(
    () => new Map(chapters.map((c) => [chapterKey(c.work, c.version, c.book, c.chapter), { status: "ok", data: c } as ChapterEntry])),
    [chapters],
  );
  return createElement(SeedCtx.Provider, { value: map }, children);
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useChapters(keys: string[]): ChapterEntry[] {
  const v = useSyncExternalStore(subscribe, () => version, () => 0);
  const seed = useContext(SeedCtx);
  const joined = keys.join("|");
  useEffect(() => {
    if (!joined) return;
    for (const k of joined.split("|")) {
      const s = seed?.get(k);
      if (s && !cache.has(k)) cache.set(k, s);
      else loadChapter(k);
    }
  }, [joined, seed]);
  return useMemo(
    () => (joined ? joined.split("|") : []).map((k) => cache.get(k) ?? seed?.get(k) ?? { status: "loading" as const }),
    // `v` changes whenever any entry changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [joined, v, seed],
  );
}
