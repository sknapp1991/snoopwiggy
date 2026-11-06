/**
 * Catalog access (safe for client and server). The catalog is small static JSON;
 * scripture text itself is fetched per chapter as static files from /texts/...
 */
import raw from "../../data/catalog.json";
import type { Catalog, CatalogItem, Collection, Religion, Version } from "./schema";

export const catalog = raw as unknown as Catalog;

export type BookRef = { work: string; book: string; chapter: number };
export type BookEntry = CatalogItem & { religion: Religion; collection: Collection };

/** Versions shown when the user has not chosen any yet. */
export const DEFAULT_VERSIONS: Record<string, string[]> = {
  bible: ["kjv", "web", "rvr1909"],
  tanakh: ["jps1917", "mt"],
  dhammapada: ["sujato", "pli"],
  tipitaka: ["sc-en", "sc-pli"],
  abhidhamma: ["abh-pli"],
  gita: ["besant", "sanskrit"],
  hyp: ["sinh"],
  enoch: ["charles"],
  thomas: ["mattison"],
  mishnah: ["kulp", "mishnah-he"],
  talmud: ["davidson", "talmud-he"],
  hadith: ["hadith-ar"],
  upanishads: ["muller"],
  ramayana: ["griffith-ry"],
  vedas: ["griffith"],
  mahabharata: ["ganguli"],
  quran: ["pickthall", "tanzil"],
  "yoga-sutras": ["johnston"],
  "tao-te-ching": ["legge-ttc", "ttc-zh"],
  analects: ["legge-an", "analects-zh"],
  australian: ["parker"],
  "hidden-words": ["bahai-hw"],
  aqdas: ["bahai-aqdas"],
  ggs: ["khalsa", "ggs-gurmukhi"],
  lucretius: ["leonard"],
  meditations: ["long"],
  enchiridion: ["higginson"],
  "hume-dialogues": ["hume"],
  "age-of-reason": ["paine"],
  kojiki: ["chamberlain"],
  jaina: ["jacobi"],
  "chinese-myths": ["werner"],
  yoruba: ["ogumefu"],
  zhuangzi: ["giles"],
  navaho: ["matthews"],
  sioux: ["mclaughlin"],
  gathas: ["mills"],
  mencius: ["legge-men", "mencius-zh"],
  "popol-vuh": ["spence"],
  iliad: ["butler-il"],
  odyssey: ["butler-od"],
  hesiod: ["evelyn-white"],
  aeneid: ["dryden"],
  metamorphoses: ["riley"],
  republic: ["jowett-rep"],
  nicomachean: ["chase"],
  "seneca-morals": ["lestrange"],
  montaigne: ["cotton"],
  pensees: ["trotter"],
  "discourse-method": ["veitch"],
  "spinoza-ethics": ["elwes"],
  "emerson-essays": ["emerson"],
  "on-liberty": ["mill"],
  "wisdom-of-life": ["saunders"],
  zarathustra: ["common"],
  "beyond-good-evil": ["zimmern"],
  "russell-problems": ["russell"],
  varieties: ["james"],
  "freud-intro": ["hall"],
  "jung-unconscious": ["hinkle"],
  "the-crowd": ["le-bon"],
};

export const DEFAULT_LOCATION: BookRef = { work: "bible", book: "gen", chapter: 1 };

export function versionsForWork(work: string): Version[] {
  return catalog.versions.filter((v) => v.work === work);
}

export function getVersion(id: string): Version | undefined {
  return catalog.versions.find((v) => v.id === id);
}

const bookCache = new Map<string, BookEntry[]>();
/** Available books of a work, in reading order. */
export function booksOfWork(work: string): BookEntry[] {
  let list = bookCache.get(work);
  if (!list) {
    list = [];
    for (const religion of catalog.religions)
      for (const collection of religion.collections)
        for (const it of collection.items)
          if (it.work === work && it.chapters && it.status !== "coming-soon")
            list.push({ ...it, religion, collection });
    bookCache.set(work, list);
  }
  return list;
}

export function findBook(work: string, book: string): BookEntry | undefined {
  return booksOfWork(work).find((b) => b.id === book);
}

export function readHref(ref: BookRef, versions?: string[], verse?: string) {
  const q = versions?.length ? `?v=${versions.join(",")}` : "";
  return `/read/${ref.work}/${ref.book}/${ref.chapter}${q}${verse ? `#v${verse}` : ""}`;
}

/** Previous / next chapter, crossing book boundaries (Malachi 4 → Matthew 1). */
export function adjacentChapters(ref: BookRef): { prev?: BookRef; next?: BookRef } {
  const books = booksOfWork(ref.work);
  const i = books.findIndex((b) => b.id === ref.book);
  if (i < 0) return {};
  const b = books[i];
  const prev =
    ref.chapter > 1
      ? { ...ref, chapter: ref.chapter - 1 }
      : i > 0
        ? { work: ref.work, book: books[i - 1].id, chapter: books[i - 1].chapters! }
        : undefined;
  const next =
    ref.chapter < b.chapters!
      ? { ...ref, chapter: ref.chapter + 1 }
      : i < books.length - 1
        ? { work: ref.work, book: books[i + 1].id, chapter: 1 }
        : undefined;
  return { prev, next };
}

/** Parse ?v=kjv,web against the catalog; drops unknown ids, keeps order, de-dupes. */
export function parseVersionParam(work: string, param: string | null | undefined): string[] {
  if (!param) return [];
  const valid = new Set(versionsForWork(work).map((v) => v.id));
  return [...new Set(param.split(",").map((s) => s.trim()).filter((s) => valid.has(s)))];
}

/** Sort selected versions into display order: catalog order (English first, then languages). */
export function sortVersions(ids: string[]): string[] {
  const order = new Map(catalog.versions.map((v, i) => [v.id, i]));
  return [...ids].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
}

/** "Genesis 1", "Psalm 23" (uses the book's singular chapterName when it has one). */
export function chapterTitle(book: CatalogItem | undefined, chapter: number, fallback = ""): string {
  const name = book?.chapterName ?? book?.name ?? fallback;
  return name.endsWith(".") ? `${name}${chapter}` : `${name} ${chapter}`; // "SN 12." + 2 → "SN 12.2"
}
