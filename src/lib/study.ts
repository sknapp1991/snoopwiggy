"use client";
/**
 * Highlights, favorites, "study later", notes and studied chapters, saved on this device in IndexedDB.
 * Everything is loaded into memory once (it is small) and read with useStudy(); writes go to the
 * backend and are broadcast to other open tabs.
 */
import { useSyncExternalStore } from "react";
import type { StudyBackend, StudyItem, StudyKind, StudyRef } from "./storage";

export type { StudyItem, StudyKind, StudyRef };

/** Highlight colours: soft enough to read through in light and dark themes. */
export const HIGHLIGHTS = [
  { id: "yellow", label: "Yellow", bg: "rgb(250 204 21 / 0.32)", dot: "#eab308" },
  { id: "green", label: "Green", bg: "rgb(34 197 94 / 0.26)", dot: "#22c55e" },
  { id: "blue", label: "Blue", bg: "rgb(59 130 246 / 0.26)", dot: "#3b82f6" },
  { id: "pink", label: "Pink", bg: "rgb(236 72 153 / 0.24)", dot: "#ec4899" },
  { id: "orange", label: "Orange", bg: "rgb(249 115 22 / 0.28)", dot: "#f97316" },
] as const;
export const highlightBg = (id?: string) => HIGHLIGHTS.find((h) => h.id === id)?.bg;

export const refKey = (r: StudyRef) => `${r.work}/${r.book}/${r.chapter}${r.verse ? `:${r.verse}` : ""}`;
export const itemId = (kind: StudyKind, r: StudyRef) => `${kind}:${refKey(r)}`;

/* ---------- IndexedDB backend (in-memory fallback, e.g. private browsing) ---------- */

const DB = "globalstudy"; // internal name from before the rename to VersesAcross; kept so saved data stays
const STORE = "study";

function idbBackend(): StudyBackend {
  let dbp: Promise<IDBDatabase> | null = null;
  const open = () =>
    (dbp ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
  const tx = async <T,>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) => {
    const db = await open();
    return new Promise<T>((resolve, reject) => {
      const r = fn(db.transaction(STORE, mode).objectStore(STORE));
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  };
  return {
    getAll: () => tx("readonly", (s) => s.getAll() as IDBRequest<StudyItem[]>),
    put: async (item) => void (await tx("readwrite", (s) => s.put(item))),
    delete: async (id) => void (await tx("readwrite", (s) => s.delete(id))),
  };
}

function memoryBackend(): StudyBackend {
  const m = new Map<string, StudyItem>();
  return {
    getAll: async () => [...m.values()],
    put: async (i) => void m.set(i.id, i),
    delete: async (id) => void m.delete(id),
  };
}

let backend: StudyBackend | null = null;
function getBackend() {
  if (!backend) backend = typeof indexedDB !== "undefined" ? idbBackend() : memoryBackend();
  return backend;
}

/* ---------- in-memory store ---------- */

type Snapshot = { ready: boolean; items: Map<string, StudyItem> };
const EMPTY: Snapshot = { ready: false, items: new Map() };
let snap: Snapshot = EMPTY;
let loading: Promise<void> | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((l) => l());
const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("globalstudy-study") : null;

function load(force = false) {
  if (loading && !force) return loading;
  loading = getBackend()
    .getAll()
    .catch(() => {
      backend = memoryBackend(); // IndexedDB blocked: keep working for this visit
      return [] as StudyItem[];
    })
    .then((list) => {
      snap = { ready: true, items: new Map(list.map((i) => [i.id, i])) };
      emit();
    });
  return loading;
}
channel?.addEventListener("message", () => load(true));

function subscribe(l: () => void) {
  subs.add(l);
  load();
  return () => subs.delete(l);
}

export function useStudy(): Snapshot {
  return useSyncExternalStore(subscribe, () => snap, () => EMPTY);
}

async function write(item: StudyItem | null, deleteId?: string) {
  await load();
  const items = new Map(snap.items);
  if (item) items.set(item.id, item);
  if (deleteId) items.delete(deleteId);
  snap = { ready: true, items };
  emit();
  try {
    if (item) await getBackend().put(item);
    if (deleteId) await getBackend().delete(deleteId);
    channel?.postMessage("changed");
  } catch {
    /* storage full / blocked: the change stays for this visit */
  }
}

function make(kind: StudyKind, r: StudyRef, extra: Partial<StudyItem> = {}): StudyItem {
  const id = itemId(kind, r);
  const now = Date.now();
  const old = snap.items.get(id);
  return {
    work: r.work,
    book: r.book,
    chapter: r.chapter,
    ...(r.verse ? { verse: r.verse } : {}),
    id,
    kind,
    createdAt: old?.createdAt ?? now,
    updatedAt: now,
    ...extra,
  };
}

export const getItem = (kind: StudyKind, r: StudyRef) => snap.items.get(itemId(kind, r));

export function setHighlight(r: StudyRef, color: string | null) {
  return color ? write(make("highlight", r, { color })) : write(null, itemId("highlight", r));
}

/** Toggle a favorite / study-later / studied mark. Returns the new state. */
export function toggle(kind: "favorite" | "later" | "studied", r: StudyRef): boolean {
  const on = !getItem(kind, r);
  if (on) write(make(kind, r));
  else write(null, itemId(kind, r));
  return on;
}

export function saveNote(r: StudyRef, text: string) {
  const t = text.trim();
  return t ? write(make("note", r, { text: t })) : write(null, itemId("note", r));
}

export function removeItem(id: string) {
  return write(null, id);
}

/** Per-verse marks for one chapter, for rendering: verse → { highlight, favorite, later, note }. */
export function chapterMarks(items: Map<string, StudyItem>, work: string, book: string, chapter: number) {
  const prefix = `${work}/${book}/${chapter}:`;
  const out = new Map<string, Partial<Record<StudyKind, StudyItem>>>();
  for (const it of items.values()) {
    if (!it.verse) continue;
    const key = `${it.work}/${it.book}/${it.chapter}:`;
    if (key !== prefix) continue;
    const m = out.get(it.verse) ?? {};
    m[it.kind] = it;
    out.set(it.verse, m);
  }
  return out;
}

/** "11/03/26 9:41 PM" */
export function formatStamp(ms: number) {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  const h = d.getHours() % 12 || 12;
  return `${p(d.getMonth() + 1)}/${p(d.getDate())}/${p(d.getFullYear() % 100)} ${h}:${p(d.getMinutes())} ${d.getHours() < 12 ? "AM" : "PM"}`;
}

/* ---------- backup ---------- */

export function exportJson(): string {
  return JSON.stringify({ app: "VersesAcross", version: 1, exportedAt: new Date().toISOString(), items: [...snap.items.values()] }, null, 1);
}

const KINDS: StudyKind[] = ["highlight", "favorite", "later", "note", "studied"];

/** Merge a backup file: newer entries win. Returns how many were added or updated. */
export async function importJson(text: string): Promise<number> {
  const data = JSON.parse(text) as { items?: unknown[] };
  if (!Array.isArray(data.items)) throw new Error("Not a VersesAcross backup file");
  await load();
  let n = 0;
  for (const raw of data.items) {
    const it = raw as StudyItem;
    if (!it || !KINDS.includes(it.kind) || typeof it.work !== "string" || typeof it.book !== "string" || !Number.isInteger(it.chapter))
      continue;
    const clean = make(it.kind, { work: it.work, book: it.book, chapter: it.chapter, verse: it.verse ? String(it.verse) : undefined }, {
      ...(it.color ? { color: String(it.color) } : {}),
      ...(it.text ? { text: String(it.text).slice(0, 20000) } : {}),
      createdAt: Number(it.createdAt) || Date.now(),
      updatedAt: Number(it.updatedAt) || Date.now(),
    });
    const old = snap.items.get(clean.id);
    if (old && old.updatedAt >= clean.updatedAt) continue;
    await write(clean);
    n++;
  }
  return n;
}
