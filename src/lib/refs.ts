/**
 * Find scripture references in free text (AI answers) and resolve them to a place in the library:
 * "John 3:16", "1 Cor 13:4–7", "Rom. 6:4", "Genesis 1", "Surah 2:255", "Quran 2:255", "Gita 2.47",
 * "MN 10", "SN 12.2", "AN 4.170", "Dhp 183". Book names match by full name or an unambiguous prefix;
 * books of the scripture being read win when a name exists in several (Genesis: Bible vs Tanakh).
 */
import { catalog, type BookRef } from "./catalog";

export type FoundRef = { start: number; end: number; ref: BookRef; verse?: string; to?: string; label: string };

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.’']/g, "")
    .replace(/\s+/g, " ")
    .trim();

type Book = { work: string; id: string; name: string; chapters: number };
const BOOKS: Book[] = catalog.religions.flatMap((r) =>
  r.collections.flatMap((c) =>
    c.items.flatMap((i) => (i.work && i.chapters && i.status !== "coming-soon" ? [{ work: i.work, id: i.id, name: i.name, chapters: i.chapters }] : [])),
  ),
);
const ALIASES: Record<string, { work: string; book: string }> = {
  surah: { work: "quran", book: "quran" },
  sura: { work: "quran", book: "quran" },
  quran: { work: "quran", book: "quran" },
  koran: { work: "quran", book: "quran" },
  "bhagavad gita": { work: "gita", book: "gita" },
  gita: { work: "gita", book: "gita" },
  bg: { work: "gita", book: "gita" },
  dhammapada: { work: "dhammapada", book: "dhp" },
  dhp: { work: "dhammapada", book: "dhp" },
  "yoga sutras": { work: "yoga-sutras", book: "ys" },
  ys: { work: "yoga-sutras", book: "ys" },
  psalm: { work: "bible", book: "psa" },
  ps: { work: "bible", book: "psa" },
  song: { work: "bible", book: "sng" },
  "song of songs": { work: "bible", book: "sng" },
  jn: { work: "bible", book: "jhn" },
  mt: { work: "bible", book: "mat" },
  mk: { work: "bible", book: "mrk" },
  lk: { work: "bible", book: "luk" },
};

/** Ordinary words that would otherwise prefix-match a book title ("Chapters (Khandhaka)", "Long Discourses"). */
const STOP = new Set(["chapter", "chapters", "verse", "verses", "book", "books", "part", "rule", "section", "page", "long", "middle", "short", "monks", "nuns", "the", "in", "see", "and"]);

function findBook(name: string, preferWork?: string): Book | undefined {
  const n = norm(name);
  if (STOP.has(n)) return undefined;
  const alias = ALIASES[n];
  if (alias) {
    // A Bible alias read while in the Tanakh: use the Tanakh's book of the same id when there is one.
    const same = preferWork && BOOKS.find((b) => b.work === preferWork && b.id === alias.book);
    return same || BOOKS.find((b) => b.work === alias.work && b.id === alias.book);
  }
  const rank = (b: Book) => (b.work === preferWork ? 0 : b.work === "bible" ? 1 : 2);
  const exact = BOOKS.filter((b) => norm(b.name) === n || b.id === n.replace(/\s/g, "")).sort((a, b) => rank(a) - rank(b));
  if (exact[0]) return exact[0];
  if (n.length < 2) return undefined;
  const prefix = BOOKS.filter((b) => norm(b.name).startsWith(n));
  const names = new Set(prefix.map((b) => norm(b.name)));
  if (names.size !== 1) return undefined; // ambiguous ("J") or unknown
  return prefix.sort((a, b) => rank(a) - rank(b))[0];
}

// Book name (optionally "1 "/"2 "/"3 " first), chapter, optional verse(s).
const NAMED = /\b((?:[1-3]\s?)?[A-Z][a-zA-Z’']+\.?(?:\s(?:of\s)?[A-Z][a-zA-Z’']+)?)\s(\d{1,3})(?:\s?[:.]\s?(\d{1,3})(?:\s?[-–]\s?(\d{1,3}))?)?\b/g;
// Pali canon: DN 2, MN 10, SN 12.2, AN 4.170
const NIKAYA = /\b(DN|MN|SN|AN)\s?(\d{1,2})(?:\.(\d{1,4}))?\b/g;

export function findRefs(text: string, preferWork?: string): FoundRef[] {
  const out: FoundRef[] = [];
  for (const m of text.matchAll(NIKAYA)) {
    const nik = m[1].toLowerCase();
    let book: string;
    let chapter: number;
    if (nik === "dn" || nik === "mn") {
      book = nik;
      chapter = Number(m[2]);
    } else {
      if (!m[3]) continue;
      book = `${nik}${m[2]}`;
      chapter = Number(m[3]);
    }
    const b = BOOKS.find((x) => x.work === "tipitaka" && x.id === book);
    if (b && chapter >= 1 && chapter <= b.chapters)
      out.push({ start: m.index!, end: m.index! + m[0].length, ref: { work: "tipitaka", book, chapter }, label: m[0] });
  }
  for (const m of text.matchAll(NAMED)) {
    if (out.some((o) => m.index! < o.end && m.index! + m[0].length > o.start)) continue;
    let name = m[1];
    let start = m.index!;
    // "In John 3:16" → the name is "John": drop a leading capitalised word that isn't a book.
    let b = findBook(name, preferWork);
    if (!b && name.includes(" ")) {
      const rest = name.slice(name.indexOf(" ") + 1);
      b = findBook(rest, preferWork);
      if (b) {
        start += name.length - rest.length;
        name = rest;
      }
    }
    if (!b) continue;
    const chapter = Number(m[2]);
    if (chapter < 1 || chapter > b.chapters) continue;
    // A bare "Genesis 1" is a reference; "Chapter 1" or "Verse 3" is not (no such book anyway).
    out.push({ start, end: m.index! + m[0].length, ref: { work: b.work, book: b.id, chapter }, verse: m[3], to: m[4], label: text.slice(start, m.index! + m[0].length) });
  }
  return out.sort((a, b) => a.start - b.start);
}
