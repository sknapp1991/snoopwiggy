"use client";
/** A one-time "how it works" card so the tap/swipe shortcuts are discoverable. Dismissed for good. */
import { useSyncExternalStore } from "react";
import { CloseIcon } from "./icons";

const KEY = "gs:tips:v1";
const subs = new Set<() => void>();
const seen = () => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return true;
  }
};

export function FirstTips() {
  const done = useSyncExternalStore(
    (l) => {
      subs.add(l);
      return () => subs.delete(l);
    },
    seen,
    () => true,
  );
  if (done) return null;
  const dismiss = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
    subs.forEach((l) => l());
  };
  return (
    <div className="mx-auto mt-3 max-w-5xl px-4 md:px-8">
      <div role="note" className="relative rounded-xl border border-accent/40 bg-accent-soft px-4 py-3 pr-12 text-sm">
        <p className="font-semibold text-accent">Quick tips</p>
        <ul className="mt-1 grid gap-x-6 gap-y-0.5 text-ink/90 sm:grid-cols-2">
          <li>Tap a verse: highlight, note, copy, Ask AI</li>
          <li>Tap a verse number: ★ favorite · double-tap: study later</li>
          <li>Swipe sideways (or ‹ ›) for the next chapter</li>
          <li>🎧 Listen — then tap any verse to read from there</li>
          <li>Double-tap a word to search it everywhere</li>
          <li>Pinch to change the text size</li>
        </ul>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss tips"
          className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:text-ink"
        >
          <CloseIcon />
        </button>
        <button type="button" onClick={dismiss} className="mt-2 min-h-9 rounded-lg bg-accent px-3 text-xs font-semibold text-accent-ink">
          Got it
        </button>
      </div>
    </div>
  );
}
