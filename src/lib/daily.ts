/**
 * Verse of the day: a short list of well-known passages from every tradition in the library, one
 * per day (the same for everyone on a given date, in turn through the list).
 */
import type { BookRef } from "./catalog";

export type Daily = BookRef & { verse: string };

const LIST: Daily[] = [
  { work: "bible", book: "jhn", chapter: 3, verse: "16" },
  { work: "dhammapada", book: "dhp", chapter: 1, verse: "5" },
  { work: "quran", book: "quran", chapter: 2, verse: "255" },
  { work: "gita", book: "gita", chapter: 2, verse: "47" },
  { work: "bible", book: "psa", chapter: 23, verse: "1" },
  { work: "tanakh", book: "mic", chapter: 6, verse: "8" },
  { work: "yoga-sutras", book: "ys", chapter: 1, verse: "2" },
  { work: "bible", book: "mat", chapter: 5, verse: "9" },
  { work: "dhammapada", book: "dhp", chapter: 1, verse: "1" },
  { work: "quran", book: "quran", chapter: 94, verse: "5" },
  { work: "gita", book: "gita", chapter: 6, verse: "5" },
  { work: "bible", book: "1co", chapter: 13, verse: "4" },
  { work: "tanakh", book: "deu", chapter: 6, verse: "4" },
  { work: "bible", book: "pro", chapter: 3, verse: "5" },
  { work: "dhammapada", book: "dhp", chapter: 8, verse: "103" },
  { work: "quran", book: "quran", chapter: 49, verse: "13" },
  { work: "gita", book: "gita", chapter: 18, verse: "66" },
  { work: "bible", book: "rom", chapter: 8, verse: "28" },
  { work: "tanakh", book: "psa", chapter: 46, verse: "11" },
  { work: "bible", book: "isa", chapter: 40, verse: "31" },
  { work: "dhammapada", book: "dhp", chapter: 15, verse: "204" },
  { work: "quran", book: "quran", chapter: 2, verse: "286" },
  { work: "gita", book: "gita", chapter: 4, verse: "7" },
  { work: "bible", book: "mat", chapter: 6, verse: "34" },
  { work: "yoga-sutras", book: "ys", chapter: 2, verse: "46" },
  { work: "bible", book: "php", chapter: 4, verse: "13" },
  { work: "tanakh", book: "ecc", chapter: 3, verse: "1" },
  { work: "dhammapada", book: "dhp", chapter: 17, verse: "223" },
  { work: "quran", book: "quran", chapter: 13, verse: "28" },
  { work: "gita", book: "gita", chapter: 2, verse: "20" },
  { work: "bible", book: "jhn", chapter: 14, verse: "27" },
  { work: "bible", book: "gal", chapter: 5, verse: "22" },
  { work: "mishnah", book: "pirkei-avot", chapter: 1, verse: "14" },
  { work: "enoch", book: "1en", chapter: 1, verse: "8" },
  { work: "thomas", book: "gth", chapter: 1, verse: "3" },
  { work: "upanishads", book: "isha", chapter: 1, verse: "1" },
  { work: "vedas", book: "rv10", chapter: 129, verse: "1" },
];

/** Today's passage (local date). */
export function dailyVerse(date = new Date()): Daily {
  const day = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
  return LIST[day % LIST.length];
}
export const todayKey = (date = new Date()) => `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
