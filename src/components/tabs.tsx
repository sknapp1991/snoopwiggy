"use client";
/**
 * Reading tabs: one tab per book you open (Matthew 5 | Exodus 3 | …), remembering the chapter.
 * Saved on the device. Tap to switch, ✕ to close, swipe sideways on the bar for the previous/next
 * tab, and drag a tab to reorder (mouse: drag; touch: press and hold, then drag).
 * When tabs come from more than one tradition (Christianity, Judaism…), a row above them switches
 * between those groups, returning to the tab you last used in each.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { chapterTitle, findBook, readHref, type BookRef } from "@/lib/catalog";
import { getSettings, MAX_TABS, updateSettings, useSettings } from "@/lib/settings";
import { CloseIcon } from "./icons";
import { useReaderState } from "./use-reader-state";

const key = (r: BookRef) => `${r.work}/${r.book}/${r.chapter}`;
const parse = (t: string): BookRef => {
  const [work, book, ch] = t.split("/");
  return { work, book, chapter: Number(ch) };
};
const sameBook = (a: BookRef, b: BookRef) => a.work === b.work && a.book === b.book;
const bookKey = (t: string) => t.split("/").slice(0, 2).join("/");
const groupOf = (t: string) => {
  const r = parse(t);
  const b = findBook(r.work, r.book);
  return { id: b?.religion.id ?? r.work, name: b?.religion.name ?? r.work };
};

/** Keep the tab list in step with where the reader is (update the current book's tab, or add one). */
export function useTabsSync() {
  const { ref, entry } = useReaderState();
  const current = key(ref);
  useEffect(() => {
    if (!entry) return;
    // Read the saved tabs at the moment of the update: during hydration the rendered settings are
    // still the defaults (no tabs), and acting on those would wipe the user's saved tabs.
    const { tabs, tabsRecent } = getSettings();
    const here = parse(current);
    // Most recently used first (one entry per book) — used to return to the last tab of a group.
    const recent = [bookKey(current), ...tabsRecent.filter((b) => b !== bookKey(current))].slice(0, 40);
    const i = tabs.findIndex((t) => sameBook(parse(t), here));
    if (i >= 0) {
      if (tabs[i] === current && tabsRecent[0] === bookKey(current)) return;
      const next = [...tabs];
      next[i] = current;
      updateSettings({ tabs: next, tabsRecent: recent });
    } else {
      // New book: add a tab; past the limit, drop the oldest one.
      updateSettings({ tabs: [...tabs, current].slice(-MAX_TABS), tabsRecent: recent });
    }
  }, [current, entry]);
}

export function TabBar() {
  const { ref, versions } = useReaderState();
  const { tabs, tabsRecent } = useSettings();
  const router = useRouter();
  const barRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLAnchorElement>(null);

  // Groups (traditions) in the order their first tab appears.
  const groups: { id: string; name: string }[] = [];
  for (const t of tabs) {
    const g = groupOf(t);
    if (!groups.some((x) => x.id === g.id)) groups.push(g);
  }
  const activeTab = tabs.find((t) => sameBook(parse(t), ref));
  const activeGroup = activeTab ? groupOf(activeTab).id : groups[0]?.id;
  const visible = tabs.filter((t) => groupOf(t).id === activeGroup);
  const activeIndex = visible.findIndex((t) => sameBook(parse(t), ref));

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeIndex]);

  /* ---------- drag to reorder ---------- */
  const [drag, setDrag] = useState<{ tab: string; over: number; x: number } | null>(null);
  const dragRef = useRef<{ tab: string; startX: number; startY: number; active: boolean; timer: number; pointer: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  const indexAt = (clientX: number) => {
    const els = [...(barRef.current?.querySelectorAll<HTMLElement>("[data-tab]") ?? [])];
    const i = els.findIndex((el) => clientX < el.getBoundingClientRect().left + el.offsetWidth / 2);
    return i === -1 ? els.length - 1 : i;
  };
  const begin = (tab: string, clientX: number) => {
    const d = dragRef.current;
    if (!d) return;
    d.active = true;
    suppressClick.current = true;
    navigator.vibrate?.(15);
    setDrag({ tab, over: indexAt(clientX), x: clientX });
  };
  const drop = (e?: React.PointerEvent) => {
    const d = dragRef.current;
    // A mouse that ended up elsewhere was a drag, even if no move events arrived in between.
    if (d && !d.active && e?.type === "pointerup" && e.pointerType === "mouse" && Math.abs(e.clientX - d.startX) > 6) {
      d.active = true;
      suppressClick.current = true;
    }
    if (d?.active) {
      // Reorder within the full list: put the dragged tab where the target visible tab is.
      const over = e && e.type === "pointerup" ? indexAt(e.clientX) : (drag?.over ?? -1);
      const target = visible[over];
      if (target && target !== d.tab) {
        const rest = tabs.filter((t) => t !== d.tab);
        const at = rest.indexOf(target);
        const from = visible.indexOf(d.tab);
        rest.splice(over > from ? at + 1 : at, 0, d.tab);
        updateSettings({ tabs: rest });
      }
    }
    if (d) clearTimeout(d.timer);
    dragRef.current = null;
    setDrag(null);
    setTimeout(() => (suppressClick.current = false), 0);
  };

  // While dragging on a touch screen, stop the bar from scrolling.
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const onMove = (e: TouchEvent) => {
      if (dragRef.current?.active && e.cancelable) e.preventDefault();
    };
    el.addEventListener("touchmove", onMove, { passive: false });
    return () => el.removeEventListener("touchmove", onMove);
  }, [tabs.length]);

  // Swipe across the bar (not a scroll of an overflowing bar) to go to the previous / next tab.
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    let x0 = 0, y0 = 0, scroll0 = 0;
    const onStart = (e: TouchEvent) => {
      x0 = e.touches[0].clientX;
      y0 = e.touches[0].clientY;
      scroll0 = el.scrollLeft;
    };
    const onEnd = (e: TouchEvent) => {
      if (dragRef.current?.active || suppressClick.current) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - x0, dy = t.clientY - y0;
      if (Math.abs(dx) < 50 || Math.abs(dy) > 40 || Math.abs(el.scrollLeft - scroll0) > 4) return;
      const to = activeIndex + (dx < 0 ? 1 : -1);
      if (to >= 0 && to < visible.length) router.push(readHref(parse(visible[to]), versions));
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchend", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchend", onEnd);
    };
  }, [activeIndex, visible, versions, router]);

  if (tabs.length < 2) return null;

  const close = (t: string) => {
    const next = tabs.filter((x) => x !== t);
    updateSettings({ tabs: next });
    if (t === activeTab && next.length) {
      // Prefer a neighbour in the same group, else the most recent tab anywhere.
      const sameGroup = next.filter((x) => groupOf(x).id === activeGroup);
      const i = visible.indexOf(t);
      const pick = sameGroup[Math.min(i, sameGroup.length - 1)] ?? next.find((x) => bookKey(x) === tabsRecent.find((b) => next.some((y) => bookKey(y) === b))) ?? next[0];
      router.push(readHref(parse(pick), versions));
    }
  };
  const openGroup = (id: string) => {
    const inGroup = tabs.filter((t) => groupOf(t).id === id);
    const last = tabsRecent.map((b) => inGroup.find((t) => bookKey(t) === b)).find(Boolean) ?? inGroup[0];
    if (last) router.push(readHref(parse(last), versions));
  };

  return (
    <div className="shrink-0 border-b border-line bg-panel">
      {groups.length > 1 && (
        <div role="tablist" aria-label="Traditions" className="flex gap-1 overflow-x-auto px-2 pt-1 [scrollbar-width:none]">
          {groups.map((g) => {
            const on = g.id === activeGroup;
            const count = tabs.filter((t) => groupOf(t).id === g.id).length;
            return (
              <button
                key={g.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => !on && openGroup(g.id)}
                className={`flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold uppercase tracking-wide ${
                  on ? "bg-accent-soft text-accent" : "text-faint hover:bg-raised hover:text-ink"
                }`}
              >
                {g.name}
                <span className="font-normal tabular-nums opacity-75">{count}</span>
              </button>
            );
          })}
        </div>
      )}
      <div
        ref={barRef}
        role="tablist"
        aria-label="Open books"
        className="flex h-11 items-stretch gap-1 overflow-x-auto px-2 [scrollbar-width:none]"
      >
        {visible.map((t, i) => {
          const r = parse(t);
          const active = i === activeIndex;
          const title = chapterTitle(findBook(r.work, r.book), r.chapter, r.book);
          const dragging = drag?.tab === t;
          const showDrop = drag && !dragging && drag.over === i;
          return (
            <div
              key={`${r.work}/${r.book}`}
              data-tab
              className={`flex shrink-0 select-none items-center rounded-t-lg border-b-2 transition-opacity ${
                active ? "border-accent bg-raised" : "border-transparent hover:bg-raised"
              } ${dragging ? "opacity-50" : ""} ${showDrop ? "outline-2 outline-dashed outline-accent" : ""}`}
              onPointerDown={(e) => {
                if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
                const d = { tab: t, startX: e.clientX, startY: e.clientY, active: false, timer: 0, pointer: e.pointerId, moved: false };
                dragRef.current = d;
                // Touch: press and hold to pick the tab up (a quick swipe still scrolls / switches tabs).
                if (e.pointerType !== "mouse") d.timer = window.setTimeout(() => begin(t, d.startX), 400);
              }}
              onPointerMove={(e) => {
                const d = dragRef.current;
                if (!d || d.tab !== t) return;
                const dist = Math.hypot(e.clientX - d.startX, e.clientY - d.startY);
                if (!d.active) {
                  if (e.pointerType === "mouse" && dist > 6) {
                    try {
                      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                    } catch {
                      /* synthetic pointer */
                    }
                    begin(t, e.clientX);
                  } else if (e.pointerType !== "mouse" && dist > 8) {
                    clearTimeout(d.timer); // moved before the hold: it's a scroll/swipe
                    dragRef.current = null;
                  }
                  return;
                }
                setDrag({ tab: t, over: indexAt(e.clientX), x: e.clientX });
              }}
              onPointerUp={drop}
              onPointerCancel={drop}
              onContextMenu={(e) => dragRef.current?.active && e.preventDefault()}
            >
              <Link
                ref={active ? activeRef : undefined}
                role="tab"
                aria-selected={active}
                href={readHref(r, versions)}
                draggable={false}
                onClick={(e) => {
                  if (suppressClick.current) e.preventDefault();
                }}
                title="Drag to reorder"
                className={`flex h-full items-center whitespace-nowrap pl-3 pr-1 text-sm ${active ? "font-semibold text-ink" : "text-muted"}`}
              >
                {title}
              </Link>
              <button
                type="button"
                aria-label={`Close ${title} tab`}
                onClick={() => close(t)}
                className="flex h-full w-8 items-center justify-center text-faint hover:text-ink"
              >
                <CloseIcon width={14} height={14} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
