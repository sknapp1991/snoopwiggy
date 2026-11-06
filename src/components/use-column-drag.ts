"use client";
/**
 * Drag a column header to reorder versions (Column view). Mouse: just drag. Touch: press and hold
 * (400ms) first, so sideways swipes keep scrolling between columns. Drop position comes from where
 * the pointer is let go (also when no move events arrived in between).
 */
import { useEffect, useRef, useState } from "react";

/** `attr` marks the draggable items (default: column headers); several drag rows can coexist. */
export function useColumnDrag(onReorder: (from: number, to: number) => void, attr = "data-colhead") {
  const [drag, setDrag] = useState<{ from: number; over: number; dx: number } | null>(null);
  const st = useRef<{ from: number; x: number; y: number; active: boolean; timer: number; mouse: boolean } | null>(null);
  const cb = useRef(onReorder);
  /** A drag just ended: swallow the click that follows (the items can be buttons). */
  const dragged = useRef(false);
  useEffect(() => {
    cb.current = onReorder;
  });

  const indexAt = (x: number) => {
    const heads = [...document.querySelectorAll<HTMLElement>(`[${attr}]`)];
    const i = heads.findIndex((h) => x < h.getBoundingClientRect().left + h.offsetWidth / 2);
    return i === -1 ? heads.length - 1 : i;
  };

  // While dragging on touch, stop the reader from scrolling sideways.
  useEffect(() => {
    const block = (e: TouchEvent) => {
      if (st.current?.active && e.cancelable) e.preventDefault();
    };
    window.addEventListener("touchmove", block, { passive: false });
    return () => window.removeEventListener("touchmove", block);
  }, []);

  const start = (from: number, x: number) => {
    if (!st.current) return;
    st.current.active = true;
    navigator.vibrate?.(15);
    setDrag({ from, over: indexAt(x), dx: x - st.current.x });
  };
  const end = (x?: number) => {
    const s = st.current;
    if (s) clearTimeout(s.timer);
    if (s && (s.active || (s.mouse && x !== undefined && Math.abs(x - s.x) > 8))) {
      const to = indexAt(x ?? s.x);
      if (to !== s.from) cb.current(s.from, to);
      dragged.current = true;
      setTimeout(() => (dragged.current = false), 80);
    }
    st.current = null;
    setDrag(null);
  };

  const handlers = (i: number) => ({
    [attr]: "",
    onPointerDown: (e: React.PointerEvent) => {
      const hit = (e.target as HTMLElement).closest("button, a");
      if (e.button !== 0 || (hit && hit !== e.currentTarget)) return;
      const s = { from: i, x: e.clientX, y: e.clientY, active: false, timer: 0, mouse: e.pointerType === "mouse" };
      st.current = s;
      if (!s.mouse) s.timer = window.setTimeout(() => start(i, s.x), 400);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const s = st.current;
      if (!s || s.from !== i) return;
      if (!s.active) {
        const d = Math.hypot(e.clientX - s.x, e.clientY - s.y);
        if (s.mouse && d > 8) {
          try {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          } catch {
            /* ignore */
          }
          start(i, e.clientX);
        } else if (!s.mouse && d > 10) {
          clearTimeout(s.timer); // moved before the hold: it's a scroll
          st.current = null;
        }
        return;
      }
      // dx: how far the item has moved, so it can follow the pointer while it is dragged.
      setDrag({ from: i, over: indexAt(e.clientX), dx: e.clientX - s.x });
    },
    onPointerUp: (e: React.PointerEvent) => end(e.clientX),
    onPointerCancel: () => end(),
    onClickCapture: (e: React.MouseEvent) => {
      if (!dragged.current) return;
      e.preventDefault();
      e.stopPropagation();
    },
  });

  return { drag, handlers };
}
