"use client";
/** "Verse of the day" card at the top of the Library: one passage a day; × hides it until tomorrow. */
import Link from "next/link";
import { useEffect, useState } from "react";
import { DEFAULT_VERSIONS, chapterTitle, findBook, readHref } from "@/lib/catalog";
import { fetchBook } from "@/lib/chapter-store";
import { dailyVerse, todayKey } from "@/lib/daily";
import { CloseIcon } from "./icons";

const KEY = "gs:daily-hidden:v1";

export function DailyVerse({ versionsFor, onNavigate }: { versionsFor: (work: string) => string[]; onNavigate?: () => void }) {
  const [state, setState] = useState<{ text: string; hidden: boolean } | null>(null);
  const d = dailyVerse();
  const versions = versionsFor(d.work);
  const version = versions[0] ?? DEFAULT_VERSIONS[d.work]?.[0];
  useEffect(() => {
    let live = true;
    let hidden = false;
    try {
      hidden = localStorage.getItem(KEY) === todayKey();
    } catch {
      /* private mode */
    }
    if (hidden) {
      const t = setTimeout(() => live && setState({ text: "", hidden: true }), 0);
      return () => {
        live = false;
        clearTimeout(t);
      };
    }
    fetchBook(d.work, version, d.book)
      .then((b) => b.chapters[String(d.chapter)]?.verses.find((v) => v.v === d.verse)?.t)
      .then((t) => live && t && setState({ text: t, hidden: false }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [d.work, d.book, d.chapter, d.verse, version]);
  if (!state || state.hidden) return null;
  const book = findBook(d.work, d.book);
  const ref = `${chapterTitle(book, d.chapter, d.book)}:${d.verse}`;
  return (
    <div className="relative mx-3 mt-3 rounded-xl border border-accent/30 bg-accent-soft/60 p-3 pr-9">
      <Link href={readHref(d, versions.length ? versions : undefined, d.verse)} onClick={onNavigate} className="block">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-accent">
          Verse of the day · {book?.religion.name}
        </span>
        <span className="mt-1 line-clamp-3 block font-serif text-sm leading-snug text-ink">“{state.text}”</span>
        <span className="mt-1 block text-xs font-medium text-muted">{ref}</span>
      </Link>
      <button
        type="button"
        aria-label="Hide until tomorrow"
        title="Hide until tomorrow"
        onClick={() => {
          try {
            localStorage.setItem(KEY, todayKey());
          } catch {
            /* ignore */
          }
          setState({ text: "", hidden: true });
        }}
        className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-panel hover:text-ink"
      >
        <CloseIcon width={14} height={14} />
      </button>
    </div>
  );
}
