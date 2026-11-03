import type { Chapter, Verse } from "./schema";

export type AlignedRow = { v: string; cells: (Verse | null)[] };

function verseOrder(a: string, b: string) {
  return parseInt(a) - parseInt(b) || a.localeCompare(b);
}

/**
 * Line up several versions of one chapter by canonical verse id.
 * All chapter files are already in the work's canonical versification (the importer applies
 * data/versification/<version>.json), so alignment is a union of verse ids. A version without
 * a verse gets `null` (rendered as a gap) — text is never shifted to fill a hole.
 * Columns that are still loading are passed as `undefined` and also yield `null` cells.
 */
export function alignVerses(columns: (Chapter | undefined)[]): AlignedRow[] {
  const ids = new Set<string>();
  const maps = columns.map((c) => {
    const m = new Map<string, Verse>();
    for (const v of c?.verses ?? []) {
      m.set(v.v, v);
      ids.add(v.v);
    }
    return m;
  });
  return [...ids].sort(verseOrder).map((v) => ({ v, cells: maps.map((m) => m.get(v) ?? null) }));
}
