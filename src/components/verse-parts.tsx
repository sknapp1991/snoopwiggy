"use client";
/**
 * Interactive verse pieces shared by Column and Stacked views.
 *
 * Verse box (the verse number): tap = favorite, double-tap = study later, long-press / right-click = menu.
 * Verse text: tap = highlight (in highlight mode) / read aloud from here (player open) / menu;
 *             double-tap a word = search for it.
 */
import { createContext, useContext, type ReactNode } from "react";
import type { StudyItem, StudyKind } from "@/lib/study";
import { ClockIcon, NoteIcon, StarIcon } from "./icons";
import { useTapGestures, type TapPoint } from "./use-gestures";

export type Marks = Partial<Record<StudyKind, StudyItem>>;

export type VerseActions = {
  marks: Map<string, Marks>;
  boxTap: (v: string) => void;
  boxDouble: (v: string) => void;
  openMenu: (v: string, focus?: "note") => void;
  textTap: (v: string) => void;
  textDouble: (p: TapPoint, version: string) => void;
};

export const VerseCtx = createContext<VerseActions | null>(null);
const useVerse = () => useContext(VerseCtx)!;

export function VerseBox({ v, label, size = "md" }: { v: string; label: string; size?: "sm" | "md" }) {
  const a = useVerse();
  const m = a.marks.get(v);
  const g = useTapGestures({
    onTap: () => a.boxTap(v),
    onDouble: () => a.boxDouble(v),
    onLong: () => a.openMenu(v),
  });
  const fav = !!m?.favorite;
  return (
    <button
      type="button"
      {...g}
      data-no-swipe
      aria-label={`Verse ${label}${fav ? ", favorite" : ""}${m?.later ? ", study later" : ""}. Tap: favorite. Double-tap: study later. Long-press: more.`}
      title="Tap: favorite · Double-tap: study later · Long-press or right-click: more"
      className={`relative inline-flex shrink-0 select-none items-center justify-center rounded-md font-sans font-semibold tabular-nums transition-colors after:absolute after:-inset-1.5 after:content-[''] ${
        size === "sm" ? "mr-1.5 h-6 min-w-6 px-1 align-[0.15em] text-[11px]" : "h-8 min-w-8 px-1 text-xs"
      } ${fav ? "bg-accent text-accent-ink" : "text-accent hover:bg-accent-soft"} touch-manipulation`}
    >
      {label}
      {m?.later && (
        <ClockIcon width={11} height={11} strokeWidth={2.6} className="absolute -right-1 -top-1 rounded-full bg-paper text-accent" />
      )}
      {fav && <StarIcon width={9} height={9} fill="currentColor" className="absolute -bottom-0.5 -right-0.5 hidden" />}
    </button>
  );
}

/** The verse text with tap gestures. */
export function VerseText({
  v,
  version,
  lang,
  dir,
  color,
  children,
}: {
  v: string;
  version: string;
  lang: string;
  dir: "ltr" | "rtl";
  color?: string;
  children: ReactNode;
}) {
  const a = useVerse();
  const g = useTapGestures({
    onTap: () => a.textTap(v),
    onDouble: (p) => a.textDouble(p, version),
  });
  return (
    <span
      lang={lang}
      dir={dir}
      data-ver={version}
      className="reader-text block cursor-pointer touch-manipulation"
      style={{ color }}
      onPointerDown={g.onPointerDown}
      onPointerUp={g.onPointerUp}
      onPointerMove={g.onPointerMove}
      onPointerCancel={g.onPointerCancel}
    >
      {children}
    </span>
  );
}

/** Note preview under a verse; tap to edit. */
export function NoteLine({ v }: { v: string }) {
  const a = useVerse();
  const note = a.marks.get(v)?.note?.text;
  if (!note) return null;
  return (
    <button
      type="button"
      onClick={() => a.openMenu(v, "note")}
      className="mt-1 flex w-full items-start gap-1.5 rounded-md text-left font-sans text-xs italic text-muted hover:text-ink"
    >
      <NoteIcon width={14} height={14} className="mt-px shrink-0 text-accent" />
      <span className="line-clamp-2">{note}</span>
    </button>
  );
}
