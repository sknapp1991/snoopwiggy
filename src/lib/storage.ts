/**
 * Study data storage interface (highlights, bookmarks, notes).
 * Phase 3 implements it with IndexedDB on the device; later it can be swapped for
 * a cloud implementation (Supabase) without touching UI code.
 */
export type VerseKey = { work: string; book: string; chapter: number; verse: string };

export type Highlight = VerseKey & { id: string; color: string; createdAt: number };
export type Bookmark = VerseKey & { id: string; createdAt: number };
export type Note = VerseKey & { id: string; text: string; createdAt: number; updatedAt: number };

export interface StudyStore {
  listHighlights(): Promise<Highlight[]>;
  setHighlight(key: VerseKey, color: string | null): Promise<void>;
  listBookmarks(): Promise<Bookmark[]>;
  toggleBookmark(key: VerseKey): Promise<boolean>;
  listNotes(): Promise<Note[]>;
  saveNote(key: VerseKey, text: string): Promise<Note>;
  deleteNote(id: string): Promise<void>;
}
