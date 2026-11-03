"use client";
/**
 * Where you were in each chapter (the first verse on screen), so switching tabs or coming back
 * later returns to the same spot. Kept in its own localStorage key, separate from settings so
 * scrolling never re-renders the app. Holds the 60 most recent chapters.
 */
const KEY = "gs:pos:v1";
const MAX = 60;

function read(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

export function savePosition(chapterKey: string, verse: string) {
  try {
    const all = read();
    delete all[chapterKey];
    all[chapterKey] = verse; // re-insert = most recent last
    const keys = Object.keys(all);
    for (const k of keys.slice(0, Math.max(0, keys.length - MAX))) delete all[k];
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* storage unavailable */
  }
}

export function getPosition(chapterKey: string): string | undefined {
  return read()[chapterKey];
}
