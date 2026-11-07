"use client";
/**
 * Badges, worked out from activity (activity.ts) and study items (study.ts). Nothing is stored except
 * which badges have already been announced, so they're only celebrated once.
 */
import { dayKey, streaks, totals, type Activity } from "./activity";
import { catalog, findBook } from "./catalog";
import type { StudyItem } from "./storage";

export type Stats = {
  readSecs: number;
  listenSecs: number;
  verses: number;
  chaptersRead: number;
  studied: number;
  booksDone: number;
  collectionsDone: string[];
  traditions: number;
  works: number;
  notes: number;
  highlights: number;
  favorites: number;
  streak: number;
  bestStreak: number;
};

export function computeStats(a: Activity, items: Map<string, StudyItem>): Stats {
  const t = totals(a);
  const perBook = new Map<string, number>();
  const studyDays: string[] = [];
  let notes = 0;
  let highlights = 0;
  let favorites = 0;
  let studied = 0;
  for (const it of items.values()) {
    if (it.kind === "studied") {
      studied++;
      perBook.set(`${it.work}/${it.book}`, (perBook.get(`${it.work}/${it.book}`) ?? 0) + 1);
      studyDays.push(dayKey(it.createdAt));
    } else if (it.kind === "note") notes++;
    else if (it.kind === "highlight") highlights++;
    else if (it.kind === "favorite") favorites++;
  }
  const finished = new Set<string>();
  for (const [k, n] of perBook) {
    const [w, b] = k.split("/");
    const total = findBook(w, b)?.chapters ?? 0;
    if (total > 0 && n >= total) finished.add(k);
  }
  const collectionsDone: string[] = [];
  for (const rel of catalog.religions)
    for (const col of rel.collections) {
      const books = col.items.filter((i) => i.work && i.chapters && i.status !== "coming-soon");
      if (books.length > 1 && books.every((i) => finished.has(`${i.work}/${i.id}`))) collectionsDone.push(col.name);
    }
  // traditions = religions with any reading, listening or study
  const worksTouched = new Set([...t.works, ...[...perBook.keys()].map((k) => k.split("/")[0])]);
  const religions = new Set<string>();
  for (const rel of catalog.religions)
    for (const col of rel.collections) for (const i of col.items) if (i.work && worksTouched.has(i.work)) religions.add(rel.id);
  const s = streaks(a, studyDays);
  return {
    readSecs: t.read,
    listenSecs: t.listen,
    verses: t.verses,
    chaptersRead: t.chapters,
    studied,
    booksDone: finished.size,
    collectionsDone,
    traditions: religions.size,
    works: worksTouched.size,
    notes,
    highlights,
    favorites,
    streak: s.current,
    bestStreak: s.best,
  };
}

export type Badge = { id: string; icon: string; name: string; how: string; value: (s: Stats) => number; target: number };

const tier = (id: string, icon: string, name: string, how: string, value: (s: Stats) => number, target: number): Badge => ({ id, icon, name, how, value, target });
const H = 3600;

export const BADGES: Badge[] = [
  tier("first-chapter", "📖", "First chapter", "Read a chapter for 30 seconds or more", (s) => s.chaptersRead, 1),
  tier("chapters-50", "📚", "50 chapters", "Read 50 chapters", (s) => s.chaptersRead, 50),
  tier("chapters-500", "🏛️", "500 chapters", "Read 500 chapters", (s) => s.chaptersRead, 500),
  tier("verses-100", "✨", "100 verses", "Read 100 verses", (s) => s.verses, 100),
  tier("verses-1000", "🌟", "1,000 verses", "Read 1,000 verses", (s) => s.verses, 1000),
  tier("verses-10000", "💫", "10,000 verses", "Read 10,000 verses", (s) => s.verses, 10000),
  tier("streak-3", "🔥", "3-day streak", "Read or listen 3 days in a row", (s) => s.bestStreak, 3),
  tier("streak-7", "🔥", "7-day streak", "Read or listen 7 days in a row", (s) => s.bestStreak, 7),
  tier("streak-30", "🏆", "30-day streak", "Read or listen 30 days in a row", (s) => s.bestStreak, 30),
  tier("streak-100", "👑", "100-day streak", "Read or listen 100 days in a row", (s) => s.bestStreak, 100),
  tier("read-1h", "⏱️", "First hour", "Spend an hour reading", (s) => s.readSecs / H, 1),
  tier("read-10h", "⌛", "10 hours reading", "Spend 10 hours reading", (s) => s.readSecs / H, 10),
  tier("read-100h", "🕰️", "100 hours reading", "Spend 100 hours reading", (s) => s.readSecs / H, 100),
  tier("listen-1h", "🎧", "First hour listening", "Listen for an hour", (s) => s.listenSecs / H, 1),
  tier("listen-10h", "🎶", "10 hours listening", "Listen for 10 hours", (s) => s.listenSecs / H, 10),
  tier("studied-1", "✅", "Studied", "Mark a chapter as studied", (s) => s.studied, 1),
  tier("book-1", "📕", "First book", "Study every chapter of a book", (s) => s.booksDone, 1),
  tier("book-10", "📗", "10 books", "Study every chapter of 10 books", (s) => s.booksDone, 10),
  tier("collection-1", "🗂️", "A whole collection", "Study every book of a collection (e.g. the Gospels or the Torah)", (s) => s.collectionsDone.length, 1),
  tier("traditions-3", "🌍", "Explorer", "Read in 3 traditions", (s) => s.traditions, 3),
  tier("traditions-7", "🌏", "World reader", "Read in 7 traditions", (s) => s.traditions, 7),
  tier("works-10", "🧭", "Wide reader", "Read 10 different works", (s) => s.works, 10),
  tier("note-1", "📝", "First note", "Write a note on a verse", (s) => s.notes, 1),
  tier("notes-25", "🖋️", "Note taker", "Write 25 notes", (s) => s.notes, 25),
  tier("highlights-25", "🖍️", "Highlighter", "Highlight 25 verses", (s) => s.highlights, 25),
  tier("favorites-10", "⭐", "Treasured", "Save 10 favorite verses", (s) => s.favorites, 10),
];

export const earned = (b: Badge, s: Stats) => b.value(s) >= b.target;

/* Announced badges (so a new one is celebrated once). */
const SEEN = "va-badges-seen:v1";
export function seenBadges(): Set<string> | null {
  try {
    const raw = localStorage.getItem(SEEN);
    return raw ? new Set(JSON.parse(raw) as string[]) : null;
  } catch {
    return new Set();
  }
}
export function markSeen(ids: Iterable<string>) {
  try {
    localStorage.setItem(SEEN, JSON.stringify([...ids]));
  } catch {
    /* private mode */
  }
}
