"use client";
/**
 * Interactive verse pieces shared by Column and Stacked views.
 *
 * Verse box (the verse number): tap = favorite, double-tap = study later, long-press / right-click = menu.
 * Verse text: tap = highlight (in highlight mode) / read aloud from here (player open) / menu;
 *             double-tap a word = search for it.
 */
import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { StudyItem, StudyKind } from "@/lib/study";
import { ClockIcon, NoteIcon, StarIcon } from "./icons";
import { useTapGestures, type TapPoint } from "./use-gestures";

export type Marks = Partial<Record<StudyKind, StudyItem>>;

export type VerseActions = {
  marks: Map<string, Marks>;
  boxTap: (v: string) => void;
  boxDouble: (v: string) => void;
  openMenu: (v: string, focus?: "note") => void;
  textTap: (v: string, version: string) => void;
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
  // The box can sit inside the verse text (Column view): keep its taps from reaching the text.
  const stop =
    <E extends React.SyntheticEvent>(fn: (e: E) => void) =>
    (e: E) => {
      e.stopPropagation();
      fn(e);
    };
  return (
    <button
      type="button"
      onPointerDown={stop(g.onPointerDown)}
      onPointerUp={stop(g.onPointerUp)}
      onPointerMove={stop(g.onPointerMove)}
      onPointerCancel={stop(g.onPointerCancel)}
      onContextMenu={stop(g.onContextMenu)}
      onKeyDown={stop(g.onKeyDown)}
      data-no-swipe
      aria-label={`Verse ${label}${fav ? ", favorite" : ""}${m?.later ? ", study later" : ""}. Tap: favorite. Double-tap: study later. Long-press: more.`}
      title="Tap: favorite · Double-tap: study later · Long-press or right-click: more"
      className={`relative inline-flex shrink-0 select-none items-center justify-center gap-0.5 rounded-md font-sans font-semibold tabular-nums text-accent transition-colors hover:bg-accent-soft after:absolute after:-inset-1.5 after:content-[''] ${
        size === "sm" ? "mr-1 h-[1.35em] min-w-[1.35em] px-0.5 align-[0.12em] text-[0.62em] after:-inset-2" : "h-8 min-w-8 px-1 text-xs"
      } touch-manipulation`}
    >
      {label}
      {/* Marks sit beside the number (never on top of it): ★ favorite, clock = study later. */}
      {fav && <StarIcon width={size === "sm" ? "0.95em" : 12} height={size === "sm" ? "0.95em" : 12} fill="currentColor" strokeWidth={1.5} className="shrink-0" />}
      {m?.later && <ClockIcon width={size === "sm" ? "0.95em" : 12} height={size === "sm" ? "0.95em" : 12} strokeWidth={2.4} className="shrink-0" />}
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
    onTap: () => a.textTap(v, version),
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

/** Note preview under a verse: tap to edit; long notes show "… more" to read them in full. */
export function NoteLine({ v }: { v: string }) {
  const a = useVerse();
  const note = a.marks.get(v)?.note?.text;
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(false);
  const textRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = textRef.current;
    if (el && !open) setLong(el.scrollHeight > el.clientHeight + 1);
  }, [note, open]);
  if (!note) return null;
  return (
    <div className="mt-1 flex w-full items-start gap-1.5 font-sans text-xs italic text-muted">
      <NoteIcon width={14} height={14} className="mt-px shrink-0 text-accent" />
      <span className="min-w-0 flex-1">
        <button type="button" onClick={() => a.openMenu(v, "note")} className="block w-full text-left hover:text-ink" title="Edit note">
          <span ref={textRef} className={`block whitespace-pre-line ${open ? "" : "line-clamp-2"}`}>
            {note}
          </span>
        </button>
        {(long || open) && (
          <button type="button" onClick={() => setOpen((o) => !o)} className="mt-0.5 not-italic font-medium text-accent hover:underline">
            {open ? "Show less" : "… more"}
          </button>
        )}
      </span>
    </div>
  );
}
