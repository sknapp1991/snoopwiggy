"use client";
/**
 * Floating chapter buttons: a see-through pill [‹ ⋮ ›] that's always there (fainter while scrolling).
 * Drag it by the middle grip anywhere on the screen — over the tabs or search bar too — and it stays
 * where you leave it (this device). Double-tap / double-click the grip to put it back.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { chapterTitle, findBook, readHref, type BookRef } from "@/lib/catalog";
import { ChevronLeft, ChevronRight } from "./icons";

const KEY = "gs:navpos:v1"; // { x, y } as fractions of the window (pill centre)
type Pos = { x: number; y: number };
const DEFAULT: Pos = { x: 0.5, y: 0.9 };

function readPos(): Pos | null {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? "null") as Pos | null;
    return p && typeof p.x === "number" && typeof p.y === "number" ? p : null;
  } catch {
    return null;
  }
}

const label = (r: BookRef) => chapterTitle(findBook(r.work, r.book), r.chapter, r.book);

export function FloatingNav({ prev, next, versions, faint, raised }: { prev?: BookRef; next?: BookRef; versions: string[]; faint: boolean; raised: boolean }) {
  const [pos, setPos] = useState<Pos | null>(null);
  const [dragging, setDragging] = useState(false);
  const [custom, setCustom] = useState(false); // moved by the user (else the default spot)
  const lastTap = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => {
      const saved = readPos();
      setPos(saved ?? DEFAULT);
      setCustom(!!saved);
    }, 0);
    return () => clearTimeout(t);
  }, []);
  // Keep it on screen when the window changes size.
  useEffect(() => {
    const onResize = () => setPos((p) => (p ? { ...p } : p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  if (!pos) return null;

  const W = typeof window === "undefined" ? 400 : window.innerWidth;
  const H = typeof window === "undefined" ? 800 : window.innerHeight;
  const pw = 124; // the pill's size (two 44px buttons, the grip, padding)
  const ph = 48;
  // The default spot moves up above the read-aloud bar while it's open.
  const y = !custom && raised ? 0.78 : pos.y;
  const left = Math.min(W - pw - 6, Math.max(6, pos.x * W - pw / 2));
  const top = Math.min(H - ph - 6, Math.max(6, y * H - ph / 2));

  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    const now = Date.now();
    if (now - lastTap.current < 350) {
      try {
        localStorage.removeItem(KEY);
      } catch {
        /* ignore */
      }
      setPos(DEFAULT);
      setCustom(false);
      lastTap.current = 0;
      return;
    }
    lastTap.current = now;
    const sx = e.clientX;
    const sy = e.clientY;
    const ox = left + pw / 2;
    const oy = top + ph / 2;
    let moved = false;
    let last = pos;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - sx;
      const dy = ev.clientY - sy;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true;
      setDragging(true);
      last = { x: (ox + dx) / window.innerWidth, y: (oy + dy) / window.innerHeight };
      setPos(last);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      setDragging(false);
      if (moved) {
        setCustom(true);
        try {
          localStorage.setItem(KEY, JSON.stringify(last));
        } catch {
          /* ignore */
        }
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const btn = "flex h-11 w-11 items-center justify-center rounded-full text-ink hover:bg-raised/80 disabled:opacity-30";
  return (
    <div
      data-no-swipe
      style={{ left, top }}
      className={`fixed z-40 flex items-center gap-0.5 rounded-full border border-line/70 bg-panel/55 p-0.5 shadow-lg backdrop-blur-sm transition-opacity duration-300 ${
        dragging ? "opacity-100" : faint ? "opacity-40 hover:opacity-100" : "opacity-90"
      }`}
      role="navigation"
      aria-label="Chapter"
    >
      {prev ? (
        <Link href={readHref(prev, versions)} aria-label={`Previous chapter: ${label(prev)}`} title={label(prev)} className={btn}>
          <ChevronLeft />
        </Link>
      ) : (
        <span className={`${btn} opacity-30`} aria-hidden>
          <ChevronLeft />
        </span>
      )}
      <button
        type="button"
        onPointerDown={startDrag}
        aria-label="Move these buttons (drag). Double-tap to put them back."
        title="Drag to move · double-tap to reset"
        className={`flex h-11 w-6 cursor-grab touch-none items-center justify-center text-faint hover:text-ink ${dragging ? "cursor-grabbing" : ""}`}
      >
        <svg width="8" height="18" viewBox="0 0 8 18" aria-hidden fill="currentColor">
          {[2, 7, 12, 17].flatMap((cy) => [<circle key={`a${cy}`} cx="2" cy={cy - 1} r="1.4" />, <circle key={`b${cy}`} cx="6" cy={cy - 1} r="1.4" />])}
        </svg>
      </button>
      {next ? (
        <Link href={readHref(next, versions)} aria-label={`Next chapter: ${label(next)}`} title={label(next)} className={btn}>
          <ChevronRight />
        </Link>
      ) : (
        <span className={`${btn} opacity-30`} aria-hidden>
          <ChevronRight />
        </span>
      )}
    </div>
  );
}
