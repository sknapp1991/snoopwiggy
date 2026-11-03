"use client";
/**
 * Reading tabs: one tab per book you open (Matthew 5 | Exodus 3 | …), remembering the chapter.
 * Tabs are saved on the device. Tap to switch, ✕ to close, or swipe sideways on the tab bar
 * to move to the previous/next tab. The bar appears once there are two or more tabs.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
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

/** Keep the tab list in step with where the reader is (update the current book's tab, or add one). */
export function useTabsSync() {
  const { ref, entry } = useReaderState();
  const current = key(ref);
  useEffect(() => {
    if (!entry) return;
    // Read the saved tabs at the moment of the update: during hydration the rendered settings are
    // still the defaults (no tabs), and acting on those would wipe the user's saved tabs.
    const { tabs } = getSettings();
    const here = parse(current);
    const i = tabs.findIndex((t) => sameBook(parse(t), here));
    if (i >= 0) {
      if (tabs[i] === current) return;
      const next = [...tabs];
      next[i] = current;
      updateSettings({ tabs: next });
    } else {
      // New book: add a tab; past the limit, drop the oldest one.
      updateSettings({ tabs: [...tabs, current].slice(-MAX_TABS) });
    }
  }, [current, entry]);
}

export function TabBar() {
  const { ref, versions } = useReaderState();
  const { tabs } = useSettings();
  const router = useRouter();
  const barRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLAnchorElement>(null);
  const activeIndex = tabs.findIndex((t) => sameBook(parse(t), ref));

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeIndex]);

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
      const t = e.changedTouches[0];
      const dx = t.clientX - x0, dy = t.clientY - y0;
      if (Math.abs(dx) < 50 || Math.abs(dy) > 40 || Math.abs(el.scrollLeft - scroll0) > 4) return;
      const to = activeIndex + (dx < 0 ? 1 : -1);
      if (to >= 0 && to < tabs.length) router.push(readHref(parse(tabs[to]), versions));
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchend", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchend", onEnd);
    };
  }, [activeIndex, tabs, versions, router]);

  if (tabs.length < 2) return null;

  const close = (i: number) => {
    const next = tabs.filter((_, j) => j !== i);
    updateSettings({ tabs: next });
    if (i === activeIndex && next.length) router.push(readHref(parse(next[Math.min(i, next.length - 1)]), versions));
  };

  return (
    <div
      ref={barRef}
      role="tablist"
      aria-label="Open books"
      className="flex h-11 shrink-0 items-stretch gap-1 overflow-x-auto border-b border-line bg-panel px-2 [scrollbar-width:none]"
    >
      {tabs.map((t, i) => {
        const r = parse(t);
        const active = i === activeIndex;
        return (
          <div
            key={`${r.work}/${r.book}`}
            className={`flex shrink-0 items-center rounded-t-lg border-b-2 ${
              active ? "border-accent bg-raised" : "border-transparent hover:bg-raised"
            }`}
          >
            <Link
              ref={active ? activeRef : undefined}
              role="tab"
              aria-selected={active}
              href={readHref(r, versions)}
              className={`flex h-full items-center whitespace-nowrap pl-3 pr-1 text-sm ${active ? "font-semibold text-ink" : "text-muted"}`}
            >
              {chapterTitle(findBook(r.work, r.book), r.chapter, r.book)}
            </Link>
            <button
              type="button"
              aria-label={`Close ${chapterTitle(findBook(r.work, r.book), r.chapter, r.book)} tab`}
              onClick={() => close(i)}
              className="flex h-full w-8 items-center justify-center text-faint hover:text-ink"
            >
              <CloseIcon width={14} height={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
