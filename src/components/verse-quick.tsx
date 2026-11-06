"use client";
/**
 * The small box that opens when a verse number is tapped: favorite, study later, highlight colours,
 * listen from here, note, and "More" (the full verse menu). Sits just under (or above) the number.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { getItem, HIGHLIGHTS, setHighlight, toggle, useStudy, type StudyRef } from "@/lib/study";
import { toast } from "@/lib/ui-store";
import { verseReference } from "./verse-menu";
import { ClockIcon, HeadphonesIcon, NoteIcon, StarIcon } from "./icons";

export type QuickAt = { verse: string; rect: { left: number; top: number; bottom: number; width: number } };

export function VerseQuick({
  at,
  bookRef,
  onClose,
  onListen,
  onMenu,
}: {
  at: QuickAt | null;
  bookRef: StudyRef;
  onClose: () => void;
  onListen?: (verse: string) => void;
  onMenu: (verse: string, focus?: "note") => void;
}) {
  useStudy(); // re-render when marks change
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // Place it under the number (above when there's no room), kept inside the screen.
  useLayoutEffect(() => {
    if (!at || !box.current) return setPos(null);
    const b = box.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = Math.min(vw - b.width - 8, Math.max(8, at.rect.left + at.rect.width / 2 - b.width / 2));
    const below = at.rect.bottom + 6;
    const top = below + b.height < vh - 8 ? below : Math.max(8, at.rect.top - b.height - 6);
    setPos({ left, top });
  }, [at]);

  // Close on a tap elsewhere, Escape, scrolling or resizing.
  useEffect(() => {
    if (!at) return;
    const down = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const t = window.setTimeout(() => window.addEventListener("pointerdown", down, true), 0);
    window.addEventListener("keydown", key);
    window.addEventListener("resize", onClose);
    document.addEventListener("scroll", onClose, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("keydown", key);
      window.removeEventListener("resize", onClose);
      document.removeEventListener("scroll", onClose, true);
    };
  }, [at, onClose]);

  if (!at) return null;
  const r = { ...bookRef, verse: at.verse };
  const fav = !!getItem("favorite", r);
  const later = !!getItem("later", r);
  const hl = getItem("highlight", r)?.color;
  const ref = verseReference(r);

  const item = "flex h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-lg px-1.5 text-[10px] font-medium text-muted hover:bg-raised hover:text-ink";
  return (
    <div
      ref={box}
      role="dialog"
      aria-label={`Verse ${ref}`}
      data-no-swipe
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0 }}
      className="fixed z-40 rounded-xl border border-line bg-panel p-1.5 shadow-xl"
    >
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          aria-pressed={fav}
          className={`${item} ${fav ? "text-accent" : ""}`}
          onClick={() => {
            const on = toggle("favorite", r);
            toast(on ? `★ ${ref} added to favorites` : `Removed ${ref} from favorites`);
            onClose();
          }}
        >
          <StarIcon width={18} height={18} fill={fav ? "currentColor" : "none"} />
          Favorite
        </button>
        <button
          type="button"
          aria-pressed={later}
          className={`${item} ${later ? "text-accent" : ""}`}
          onClick={() => {
            const on = toggle("later", r);
            toast(on ? `${ref} saved to Study later` : `Removed ${ref} from Study later`);
            onClose();
          }}
        >
          <ClockIcon width={18} height={18} />
          Study later
        </button>
        {onListen && (
          <button
            type="button"
            className={item}
            onClick={() => {
              onListen(at.verse);
              onClose();
            }}
          >
            <HeadphonesIcon width={18} height={18} />
            Listen
          </button>
        )}
        <button
          type="button"
          className={item}
          onClick={() => {
            onMenu(at.verse, "note");
            onClose();
          }}
        >
          <NoteIcon width={18} height={18} />
          Note
        </button>
        <button
          type="button"
          className={item}
          onClick={() => {
            onMenu(at.verse);
            onClose();
          }}
        >
          <span aria-hidden className="text-lg leading-[18px]">⋯</span>
          More
        </button>
      </div>
      <div className="mt-1 flex items-center justify-center gap-1.5 border-t border-line pt-1.5" role="group" aria-label="Highlight">
        {HIGHLIGHTS.map((h) => (
          <button
            key={h.id}
            type="button"
            aria-label={`${h.label} highlight`}
            aria-pressed={hl === h.id}
            title={hl === h.id ? "Remove highlight" : `${h.label} highlight`}
            onClick={() => setHighlight(r, hl === h.id ? null : h.id)}
            className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${hl === h.id ? "border-ink" : "border-transparent"}`}
          >
            <span className="h-5 w-5 rounded-full" style={{ background: h.dot }} />
          </button>
        ))}
      </div>
    </div>
  );
}
