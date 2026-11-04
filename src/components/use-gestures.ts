"use client";
/** Small touch-gesture hooks (no library): pinch direction, swipe-to-dismiss, edge swipes. */
import { useEffect, useRef, type RefObject } from "react";
import { unlockAudio } from "@/lib/speech";

/** Calls onPinch("in" | "out") once per two-finger pinch that changes the finger distance by ≥ 25%. */
export function usePinch(ref: RefObject<HTMLElement | null>, onPinch: (dir: "in" | "out") => void) {
  const cb = useRef(onPinch);
  useEffect(() => {
    cb.current = onPinch;
  });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let start = 0;
    let fired = false;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        start = dist(e.touches);
        fired = false;
      }
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !start) return;
      e.preventDefault();
      const ratio = dist(e.touches) / start;
      if (!fired && (ratio < 0.75 || ratio > 1.33)) {
        fired = true;
        cb.current(ratio < 1 ? "in" : "out");
      }
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) start = 0;
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
    };
  }, [ref]);
}

/**
 * Swipe a panel in `direction` to dismiss it. The panel follows the finger and snaps back if the swipe
 * is short. A bottom sheet only starts dragging when its scroll area is at the top.
 */
export function useSwipeToDismiss(
  ref: RefObject<HTMLElement | null>,
  direction: "left" | "down",
  onDismiss: () => void,
  enabled = true,
) {
  const cb = useRef(onDismiss);
  useEffect(() => {
    cb.current = onDismiss;
  });
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    let x0 = 0,
      y0 = 0,
      active = false,
      decided = false,
      delta = 0;
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      x0 = e.touches[0].clientX;
      y0 = e.touches[0].clientY;
      active = true;
      decided = false;
      delta = 0;
      if (direction === "down") {
        const scroller = (e.target as HTMLElement).closest(".overflow-y-auto") as HTMLElement | null;
        if (scroller && scroller.scrollTop > 0) active = false;
      }
      if ((e.target as HTMLElement).closest("input[type=range], [data-no-swipe]")) active = false;
    };
    const onMove = (e: TouchEvent) => {
      if (!active) return;
      const dx = e.touches[0].clientX - x0;
      const dy = e.touches[0].clientY - y0;
      if (!decided) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        decided = true;
        const along = direction === "left" ? -dx > Math.abs(dy) : dy > Math.abs(dx);
        if (!along) {
          active = false;
          return;
        }
      }
      delta = direction === "left" ? Math.min(0, dx) : Math.max(0, dy);
      el.style.transition = "none";
      el.style.transform = direction === "left" ? `translateX(${delta}px)` : `translateY(${delta}px)`;
    };
    const onEnd = () => {
      if (!active) return;
      active = false;
      const size = direction === "left" ? el.offsetWidth : el.offsetHeight;
      el.style.transition = "transform 160ms ease-out";
      if (Math.abs(delta) > size * 0.3) {
        el.style.transform = direction === "left" ? "translateX(-100%)" : "translateY(100%)";
        setTimeout(() => {
          el.style.transform = "";
          el.style.transition = "";
          cb.current();
        }, 160);
      } else {
        el.style.transform = "";
      }
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: true });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [ref, direction, enabled]);
}

/**
 * Edge swipes on phone-sized screens: from the left edge → onLeftEdge (open the library);
 * upward from the bottom edge → onBottomEdge (open reading settings).
 */
export function useEdgeSwipes(onLeftEdge: () => void, onBottomEdge: () => void) {
  const left = useRef(onLeftEdge);
  const bottom = useRef(onBottomEdge);
  useEffect(() => {
    left.current = onLeftEdge;
    bottom.current = onBottomEdge;
  });
  useEffect(() => {
    let start: { x: number; y: number; edge: "left" | "bottom" } | null = null;
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || matchMedia("(min-width: 768px) and (min-height: 501px)").matches || document.querySelector("dialog[open]")) return;
      const { clientX: x, clientY: y } = e.touches[0];
      start = x < 24 ? { x, y, edge: "left" } : y > window.innerHeight - 28 ? { x, y, edge: "bottom" } : null;
    };
    const onEnd = (e: TouchEvent) => {
      if (!start) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - start.x,
        dy = t.clientY - start.y;
      if (start.edge === "left" && dx > 60 && Math.abs(dy) < 60) left.current();
      if (start.edge === "bottom" && -dy > 60 && Math.abs(dx) < 60) bottom.current();
      start = null;
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
    };
  }, []);
}

export type TapPoint = { x: number; y: number };

/**
 * Tap / double-tap / long-press on one element, for mouse and touch alike (pointer events).
 * A single tap waits briefly (DOUBLE_MS) to rule out a double tap — only when onDouble is given.
 * Long-press (LONG_MS) and right-click call onLong. Moving the finger (scrolling) cancels.
 */
const DOUBLE_MS = 260;
const LONG_MS = 480;
export function useTapGestures(handlers: {
  onTap: (p: TapPoint) => void;
  onDouble?: (p: TapPoint) => void;
  onLong?: (p: TapPoint) => void;
}) {
  const h = useRef(handlers);
  useEffect(() => {
    h.current = handlers;
  });
  const st = useRef({ x: 0, y: 0, down: false, longFired: false, longTimer: 0, tapTimer: 0, lastTap: 0 });

  const clearLong = () => window.clearTimeout(st.current.longTimer);
  return {
    onPointerDown(e: React.PointerEvent) {
      if (e.button !== 0) return;
      const s = st.current;
      Object.assign(s, { x: e.clientX, y: e.clientY, down: true, longFired: false });
      clearLong();
      if (h.current.onLong)
        s.longTimer = window.setTimeout(() => {
          if (!s.down) return;
          s.longFired = true;
          window.clearTimeout(s.tapTimer);
          navigator.vibrate?.(15);
          h.current.onLong?.({ x: s.x, y: s.y });
        }, LONG_MS);
    },
    onPointerMove(e: React.PointerEvent) {
      const s = st.current;
      if (s.down && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 10) {
        s.down = false;
        clearLong();
      }
    },
    onPointerCancel() {
      st.current.down = false;
      clearLong();
    },
    onPointerUp(e: React.PointerEvent) {
      const s = st.current;
      clearLong();
      unlockAudio(); // pointerup is a user gesture: lets sound started by the (delayed) tap play on phones
      if (!s.down || s.longFired) {
        s.down = false;
        return;
      }
      s.down = false;
      const p = { x: e.clientX, y: e.clientY };
      const now = Date.now();
      // Check for a double tap first: the browser selects the word on a double-click.
      if (h.current.onDouble && now - s.lastTap < DOUBLE_MS) {
        window.clearTimeout(s.tapTimer);
        s.lastTap = 0;
        window.getSelection()?.removeAllRanges();
        h.current.onDouble(p);
        return;
      }
      // Don't treat the end of a text selection (drag) as a tap.
      if (window.getSelection()?.toString().trim()) return;
      s.lastTap = now;
      if (h.current.onDouble) s.tapTimer = window.setTimeout(() => h.current.onTap(p), DOUBLE_MS);
      else h.current.onTap(p);
    },
    onContextMenu(e: React.MouseEvent) {
      if (!h.current.onLong) return;
      e.preventDefault();
      if (st.current.longFired) return; // touch long-press already handled it
      h.current.onLong({ x: e.clientX, y: e.clientY });
    },
    onKeyDown(e: React.KeyboardEvent) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        h.current.onTap({ x: 0, y: 0 });
      }
    },
  };
}

/** The word under a screen point (for double-tap → search), using the caret position APIs. */
export function wordAt(x: number, y: number): string | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  let node: Node | null = null;
  let offset = 0;
  const pos = doc.caretPositionFromPoint?.(x, y);
  if (pos) {
    node = pos.offsetNode;
    offset = pos.offset;
  } else {
    const r = doc.caretRangeFromPoint?.(x, y);
    if (r) {
      node = r.startContainer;
      offset = r.startOffset;
    }
  }
  if (!node || node.nodeType !== Node.TEXT_NODE) return null;
  const text = node.textContent ?? "";
  for (const m of text.matchAll(/[\p{L}\p{M}\p{N}]+/gu))
    if (m.index! <= offset && offset <= m.index! + m[0].length) return m[0];
  return null;
}
