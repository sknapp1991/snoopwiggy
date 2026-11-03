"use client";
/**
 * Swipe sideways to change chapter, built to avoid accidental triggers (see BUILD_PLAN "Swipe between chapters").
 *
 * One-finger mode
 * - Stacked view: the swipe must be clearly horizontal (|dy| < |dx|/3), long (≥ 1/3 of the width) and
 *   released past that line. Swipes starting in the left 24px edge stay reserved for the library drawer.
 *   The page follows the finger a little and a hint ("‹ Genesis 1" / "Genesis 3 ›") says what will happen;
 *   sliding back cancels.
 * - Column view: sideways swipes scroll between versions as usual. Only a swipe that *starts* at the
 *   first/last column and keeps pulling past the end can change chapter (pull-to-refresh style).
 * Two-finger mode: both fingers move the same way with roughly constant spacing (otherwise it is a pinch).
 */
import { useEffect, useRef, type RefObject } from "react";

export type SwipeMode = "one" | "two" | "off";
export type SwipeHint = { dir: "prev" | "next"; progress: number } | null;

/** Shared with pinch-to-zoom so a two-finger swipe never also changes the text size. */
export const gestureLock = { swipe: false };

export function useChapterSwipe(opts: {
  scroller: RefObject<HTMLDivElement | null>;
  content: RefObject<HTMLDivElement | null>;
  mode: SwipeMode;
  column: boolean;
  canPrev: boolean;
  canNext: boolean;
  onHint: (h: SwipeHint) => void;
  onGo: (dir: "prev" | "next") => void;
}) {
  const o = useRef(opts);
  useEffect(() => {
    o.current = opts;
  });

  useEffect(() => {
    const sc = opts.scroller.current;
    if (!sc || opts.mode === "off") return;
    type G = {
      fingers: number;
      x0: number;
      y0: number;
      gap0: number;
      decided: boolean;
      active: boolean;
      /** Column view: which edge the swipe started at (or none → never changes chapter). */
      edge: { left: boolean; right: boolean };
      dx: number;
    };
    let g: G | null = null;

    const mid = (t: TouchList) => ({
      x: t.length === 2 ? (t[0].clientX + t[1].clientX) / 2 : t[0].clientX,
      y: t.length === 2 ? (t[0].clientY + t[1].clientY) / 2 : t[0].clientY,
    });
    const gap = (t: TouchList) => (t.length === 2 ? Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY) : 0);

    const reset = (animate: boolean) => {
      const c = o.current.content.current;
      if (c) {
        c.style.transition = animate ? "transform 180ms ease-out" : "";
        c.style.transform = "";
      }
      o.current.onHint(null);
      gestureLock.swipe = false;
    };

    const onStart = (e: TouchEvent) => {
      const want = o.current.mode === "two" ? 2 : 1;
      if (e.touches.length !== want) {
        // A second finger during a one-finger swipe (or a third): abandon it.
        if (g?.active) reset(true);
        g = null;
        return;
      }
      if ((e.target as HTMLElement).closest("dialog, [data-no-swipe], input, textarea, select")) return;
      const p = mid(e.touches);
      if (want === 1 && p.x < 24) return; // left edge = library drawer
      const maxLeft = sc.scrollWidth - sc.clientWidth;
      g = {
        fingers: want,
        x0: p.x,
        y0: p.y,
        gap0: gap(e.touches),
        decided: false,
        active: false,
        edge: o.current.column ? { left: sc.scrollLeft <= 1, right: sc.scrollLeft >= maxLeft - 1 } : { left: true, right: true },
        dx: 0,
      };
    };

    const onMove = (e: TouchEvent) => {
      if (!g || e.touches.length !== g.fingers) return;
      const p = mid(e.touches);
      const dx = p.x - g.x0;
      const dy = p.y - g.y0;
      if (!g.decided) {
        if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return;
        g.decided = true;
        const horizontal = Math.abs(dy) < Math.abs(dx) / 3;
        // Two fingers: a swipe keeps its spacing; a pinch changes it.
        const steadySpacing = g.fingers === 1 || Math.abs(gap(e.touches) - g.gap0) < Math.max(24, g.gap0 * 0.15);
        // Column view: only pull outward from the edge column (dx > 0 = towards the previous chapter).
        const fromEdge = dx > 0 ? g.edge.left : g.edge.right;
        const allowed = dx > 0 ? o.current.canPrev : o.current.canNext;
        if (!horizontal || !steadySpacing || !fromEdge || !allowed) {
          g = null;
          return;
        }
        g.active = true;
        if (g.fingers === 2) gestureLock.swipe = true;
      }
      if (!g.active) return;
      // Keep classifying two-finger gestures: if the spacing starts changing it was a pinch after all.
      if (g.fingers === 2 && Math.abs(gap(e.touches) - g.gap0) > Math.max(40, g.gap0 * 0.25)) {
        reset(true);
        g = null;
        return;
      }
      if (e.cancelable) e.preventDefault(); // stop the browser from scrolling sideways / navigating back
      g.dx = dx;
      const width = sc.clientWidth;
      const dir = dx > 0 ? "prev" : "next";
      // Pulling back past the start cancels.
      if ((dir === "prev" && dx < 0) || (dir === "next" && dx > 0)) {
        reset(false);
        return;
      }
      const progress = Math.min(1, Math.abs(dx) / (width / 3));
      const c = o.current.content.current;
      if (c) {
        c.style.transition = "none";
        c.style.transform = `translateX(${dx * 0.3}px)`;
      }
      o.current.onHint({ dir, progress });
    };

    const onEnd = (e: TouchEvent) => {
      if (!g) return;
      if (e.touches.length > 0 && g.fingers === 2) return; // wait until both fingers lift
      const done = g.active && Math.abs(g.dx) >= sc.clientWidth / 3;
      const dir = g.dx > 0 ? "prev" : "next";
      const wasActive = g.active;
      g = null;
      if (wasActive) reset(!done);
      if (done) o.current.onGo(dir);
    };

    sc.addEventListener("touchstart", onStart, { passive: true });
    sc.addEventListener("touchmove", onMove, { passive: false });
    sc.addEventListener("touchend", onEnd);
    sc.addEventListener("touchcancel", onEnd);
    return () => {
      sc.removeEventListener("touchstart", onStart);
      sc.removeEventListener("touchmove", onMove);
      sc.removeEventListener("touchend", onEnd);
      sc.removeEventListener("touchcancel", onEnd);
    };
  }, [opts.scroller, opts.mode]);
}

/** Show floating controls only when the user isn't scrolling (fade out while scrolling, back after 700ms idle). */
export function useScrollIdle(scroller: RefObject<HTMLElement | null>, onChange: (idle: boolean) => void) {
  const cb = useRef(onChange);
  useEffect(() => {
    cb.current = onChange;
  });
  useEffect(() => {
    const sc = scroller.current;
    if (!sc) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    let idle = true;
    const onScroll = () => {
      if (idle) {
        idle = false;
        cb.current(false);
      }
      clearTimeout(t);
      t = setTimeout(() => {
        idle = true;
        cb.current(true);
      }, 700);
    };
    sc.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearTimeout(t);
      sc.removeEventListener("scroll", onScroll);
    };
  }, [scroller]);
}
