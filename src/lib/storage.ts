/**
 * Study data storage interface. Today: IndexedDB on the device (src/lib/study.ts).
 * Later it can be swapped for a cloud implementation (Supabase) without touching UI code.
 */
export type StudyKind = "highlight" | "favorite" | "later" | "note" | "studied";

/** A verse (or, for "studied", a whole chapter: verse omitted). */
export type StudyRef = { work: string; book: string; chapter: number; verse?: string };

export type StudyItem = StudyRef & {
  /** `${kind}:${work}/${book}/${chapter}` plus `:${verse}` for verse items. */
  id: string;
  kind: StudyKind;
  /** highlight colour id */
  color?: string;
  /** note text */
  text?: string;
  createdAt: number;
  updatedAt: number;
};

export interface StudyBackend {
  getAll(): Promise<StudyItem[]>;
  put(item: StudyItem): Promise<void>;
  delete(id: string): Promise<void>;
}
