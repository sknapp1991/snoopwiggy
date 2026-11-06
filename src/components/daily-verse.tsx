"use client";
/**
 * "Verse of the day" card at the top of the Library: one passage a day; ⤮ shows a random passage from
 * anywhere in the library (for discovering texts you don't know yet); × hides the card until tomorrow.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { DEFAULT_VERSIONS, catalog, chapterTitle, findBook, getVersion, readHref } from "@/lib/catalog";
import { fetchBook } from "@/lib/chapter-store";
import { dailyVerse, todayKey, type Daily } from "@/lib/daily";
import { CloseIcon } from "./icons";

const KEY = "gs:daily-hidden:v1";

/** Every book with an English version to show (Arabic- or Pali-only books and empty parts are skipped). */
const POOL = catalog.religions.flatMap((r) =>
  r.collections.flatMap((c) =>
    c.items.flatMap((i) => {
      const v = i.work ? getVersion(DEFAULT_VERSIONS[i.work]?.[0] ?? "") : undefined;
      return i.work && i.chapters && i.status !== "coming-soon" && v?.language === "en" ? [{ work: i.work, book: i.id, chapters: i.chapters }] : [];
    }),
  ),
);

/** A random verse from anywhere in the library: a readable length, not a heading or a blank. */
async function randomVerse(): Promise<{ d: Daily; text: string } | null> {
  for (let tries = 0; tries < 8; tries++) {
    const b = POOL[Math.floor(Math.random() * POOL.length)];
    const version = DEFAULT_VERSIONS[b.work]?.[0];
    if (!version) continue;
    try {
      const file = await fetchBook(b.work, version, b.book);
      const chapter = 1 + Math.floor(Math.random() * b.chapters);
      const verses = (file.chapters[String(chapter)]?.verses ?? []).filter((v) => !v.cont && v.t && v.t.length >= 40 && v.t.length <= 420);
      if (!verses.length) continue;
      const v = verses[Math.floor(Math.random() * verses.length)];
      return { d: { work: b.work, book: b.book, chapter, verse: v.v }, text: v.t };
    } catch {
      /* try another */
    }
  }
  return null;
}

const MIN_KEY = "gs:daily-min:v1";

function readFlag(key: string, value: string) {
  try {
    return localStorage.getItem(key) === value;
  } catch {
    return false;
  }
}
function writeFlag(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
}

/**
 * Verse of the day (or a random verse) at the top of the library. Three ways to show it: open, minimized
 * to one line (stays minimized on later days), or hidden until tomorrow (a small link brings it back).
 */
export function DailyVerse({ versionsFor, onNavigate }: { versionsFor: (work: string) => string[]; onNavigate?: () => void }) {
  const [text, setText] = useState<string | null>(null);
  const [mode, setMode] = useState<"open" | "min" | "hidden" | null>(null);
  /** A shuffled pick (null = today's verse). */
  const [pick, setPick] = useState<{ d: Daily; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const today = dailyVerse();
  const d = pick?.d ?? today;
  const versions = versionsFor(d.work);
  const version = versions[0] ?? DEFAULT_VERSIONS[today.work]?.[0];
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => live && setMode(readFlag(KEY, todayKey()) ? "hidden" : readFlag(MIN_KEY, "1") ? "min" : "open"), 0);
    fetchBook(today.work, versionsFor(today.work)[0] ?? DEFAULT_VERSIONS[today.work]?.[0], today.book)
      .then((b) => b.chapters[String(today.chapter)]?.verses.find((v) => v.v === today.verse)?.t)
      .then((t) => live && t && setText(t))
      .catch(() => {});
    return () => {
      live = false;
      clearTimeout(t);
    };
    // today's verse only changes with the date; versionsFor is recreated by the parent each render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today.work, today.book, today.chapter, today.verse, version]);
  if (!mode || text === null) return null;
  const book = findBook(d.work, d.book);
  const ref = `${chapterTitle(book, d.chapter, d.book)}:${d.verse}`;
  const shown = pick?.text ?? text;
  const shuffle = async () => {
    setBusy(true);
    const got = await randomVerse();
    setBusy(false);
    if (got) setPick(got);
  };
  const open = () => {
    writeFlag(KEY, null);
    writeFlag(MIN_KEY, null);
    setMode("open");
  };
  const btn = "flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-panel hover:text-ink disabled:opacity-50";

  if (mode === "hidden")
    return (
      <button type="button" onClick={open} className="mx-3 mt-2 flex items-center gap-1.5 rounded-lg px-1 py-1 text-xs text-faint hover:text-ink">
        <SunIcon /> Show verse of the day
      </button>
    );

  if (mode === "min")
    return (
      <div className="mx-3 mt-3 flex items-center gap-1 rounded-xl border border-accent/30 bg-accent-soft/60 py-1 pl-3 pr-1">
        <button type="button" onClick={open} className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-xs" title="Show the verse">
          <span className="shrink-0 text-accent">
            <SunIcon />
          </span>
          <span className="truncate font-medium text-ink">Verse of the day · {ref}</span>
        </button>
        <button type="button" aria-label="Show the verse" onClick={open} className={btn}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>
    );

  return (
    <div className="relative mx-3 mt-3 rounded-xl border border-accent/30 bg-accent-soft/60 p-3 pr-24">
      <Link href={readHref(d, versions.length ? versions : undefined, d.verse)} onClick={onNavigate} className="block">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-accent">
          {pick ? "Random verse" : "Verse of the day"} · {book?.religion.name}
        </span>
        <span className={`mt-1 line-clamp-3 block font-serif text-sm leading-snug text-ink ${busy ? "opacity-50" : ""}`}>“{shown}”</span>
        <span className="mt-1 block text-xs font-medium text-muted">{ref}</span>
      </Link>
      {pick && (
        <button type="button" onClick={() => setPick(null)} className="mt-1 text-xs text-muted underline-offset-2 hover:text-ink hover:underline">
          Back to today’s verse
        </button>
      )}
      <div className="absolute right-1 top-1 flex">
        <button type="button" aria-label="Show a random verse" title="Random verse from anywhere in the library" disabled={busy} onClick={shuffle} className={btn}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Minimize"
          title="Minimize to one line (stays small until you open it)"
          onClick={() => {
            writeFlag(MIN_KEY, "1");
            setMode("min");
          }}
          className={btn}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M5 12h14" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Hide until tomorrow"
          title="Hide until tomorrow (“Show verse of the day” brings it back)"
          onClick={() => {
            writeFlag(KEY, todayKey());
            setMode("hidden");
          }}
          className={btn}
        >
          <CloseIcon width={14} height={14} />
        </button>
      </div>
    </div>
  );
}

const SunIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);
