"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, type CSSProperties, type RefObject } from "react";
import { alignVerses, type AlignedRow } from "@/lib/align";
import { adjacentChapters, chapterTitle, findBook, getVersion, readHref, type BookRef } from "@/lib/catalog";
import { chapterKey, loadChapter, useChapters, type ChapterEntry } from "@/lib/chapter-store";
import { getLanguage } from "@/lib/languages";
import type { Verse, Version } from "@/lib/schema";
import {
  FONT_MAX,
  FONT_MIN,
  languageColor,
  PHONE_LANDSCAPE_QUERY,
  updateSettings,
  useMediaQuery,
  useSettings,
  useViewMode,
  WIDE_QUERY,
} from "@/lib/settings";
import { ChevronLeft, ChevronRight } from "./icons";
import { openSearch } from "./search-panel";
import { ListenButton, ReadAlongBar, ReadAlongSpacer, useReadAlong, type ReadAlong } from "./audio-player";
import { useReaderState } from "./use-reader-state";

type Col = { version: Version; entry: ChapterEntry; retry: () => void };

export function ReaderView() {
  const { ref, entry: book, versions } = useReaderState();
  const view = useViewMode();
  const settings = useSettings();
  const { fontSize } = settings;
  const wide = useMediaQuery(WIDE_QUERY, true);
  const landscape = useMediaQuery(PHONE_LANDSCAPE_QUERY, false);
  const router = useRouter();
  const scroller = useRef<HTMLDivElement>(null);
  usePinchToZoomText(scroller, fontSize);

  const valid = !!book && Number.isInteger(ref.chapter) && ref.chapter >= 1 && ref.chapter <= (book.chapters ?? 0);
  const keys = valid ? versions.map((v) => chapterKey(ref.work, v, ref.book, ref.chapter)) : [];
  const entries = useChapters(keys);
  const cols: Col[] = versions.map((id, i) => ({
    version: getVersion(id)!,
    entry: entries[i] ?? { status: "loading" },
    retry: () => loadChapter(keys[i], { retry: true }),
  }));
  const rows = useMemo(() => alignVerses(entries.map((e) => (e.status === "ok" ? e.data : undefined))), [entries]);
  const { prev, next } = valid ? adjacentChapters(ref) : {};
  const allLoaded = entries.length > 0 && entries.every((e) => e.status === "ok");
  const ra = useReadAlong({ cols, rows, bookRef: ref, next, versions, scroller });

  // Prefetch the next chapter once this one is on screen.
  useEffect(() => {
    if (!allLoaded || !next) return;
    const t = setTimeout(() => versions.forEach((v) => loadChapter(chapterKey(next.work, v, next.book, next.chapter))), 400);
    return () => clearTimeout(t);
  }, [allLoaded, next, versions]);

  // Jump to #v16 once every column's text is there (so later columns don't push the verse away).
  // Remembered per chapter + hash, so following a search result to another chapter jumps again.
  const jumped = useRef("");
  useEffect(() => {
    if (!allLoaded || !rows.length) return;
    const id = decodeURIComponent(window.location.hash.slice(1));
    const key = `${ref.work}/${ref.book}/${ref.chapter}#${id}`;
    if (!id || jumped.current === key) return;
    const el = document.getElementById(id);
    if (el) {
      jumped.current = key;
      el.scrollIntoView({ block: "center" });
      document.querySelectorAll(".is-target").forEach((n) => n.classList.remove("is-target"));
      const cells = document.querySelectorAll(`[data-v="${CSS.escape(id.slice(1))}"]`);
      (cells.length ? cells : [el]).forEach((n) => n.classList.add("is-target"));
    }
  }, [rows, allLoaded, ref.work, ref.book, ref.chapter]);

  // ← / → keys move between chapters (desktop).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable], dialog")) return;
      if (e.key === "ArrowLeft" && prev) router.push(readHref(prev, versions));
      if (e.key === "ArrowRight" && next) router.push(readHref(next, versions));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev, next, versions, router]);

  if (!valid || !book) return <NotFound />;

  const title = chapterTitle(book, ref.chapter);
  // Column width: phone portrait shows one column per swipe unless the user picked a width;
  // phone landscape and desktop use the saved width (or a sensible default) so 2–3 columns fit.
  const colMin = landscape
    ? `${settings.colWidthLandscape ?? 14}rem`
    : wide
      ? `${settings.colWidth ?? 17}rem`
      : settings.colWidth
        ? `${settings.colWidth}rem`
        : "85cqw";
  const style = {
    "--reader-size": `${fontSize}px`,
    "--colmin": colMin,
    "--stackw": `${settings.stackWidth ?? 48}rem`,
  } as CSSProperties;
  const column = view === "column";

  return (
    <>
    <div
      ref={scroller}
      style={style}
      className={`@container absolute inset-0 touch-pan-x touch-pan-y overflow-auto overscroll-contain ${
        column ? "snap-x snap-mandatory desk:snap-none" : ""
      }`}
    >
      <title>{`${title} · GlobalStudy`}</title>
      <div className={column ? "sticky left-0 w-[100cqw]" : ""}>
        <ChapterHeader title={title} bookRef={ref} versions={versions} prev={prev} next={next} ra={ra} />
      </div>

      {column ? <ColumnView cols={cols} rows={rows} /> : <StackedView cols={cols} rows={rows} />}

      <div className={column ? "sticky left-0 w-[100cqw]" : ""}>
        <ChapterNav prev={prev} next={next} versions={versions} />
        <Attribution versions={cols.map((c) => c.version)} />
        <ReadAlongSpacer ra={ra} />
      </div>
    </div>
    <ReadAlongBar ra={ra} />
    </>
  );
}

function refLabel(r: BookRef) {
  return chapterTitle(findBook(r.work, r.book), r.chapter, r.book);
}

function ChapterHeader({
  title,
  bookRef,
  versions,
  prev,
  next,
  ra,
}: {
  title: string;
  bookRef: BookRef;
  versions: string[];
  prev?: BookRef;
  next?: BookRef;
  ra: ReadAlong;
}) {
  const book = findBook(bookRef.work, bookRef.book)!;
  return (
    <div className="mx-auto flex max-w-5xl items-end justify-between gap-3 px-4 pb-3 pt-5 md:px-8 md:pt-8">
      <div className="min-w-0">
        <p className="truncate text-xs font-medium uppercase tracking-wider text-faint">
          {book.religion.name} · {book.collection.name}
        </p>
        <h1 className="font-serif text-2xl font-semibold md:text-3xl">{title}</h1>
      </div>
      <div className="flex shrink-0 gap-1">
        <ListenButton ra={ra} />
        <NavIcon to={prev} versions={versions} label="Previous chapter" icon={<ChevronLeft />} />
        <NavIcon to={next} versions={versions} label="Next chapter" icon={<ChevronRight />} />
      </div>
    </div>
  );
}

function NavIcon({ to, versions, label, icon }: { to?: BookRef; versions: string[]; label: string; icon: React.ReactNode }) {
  const cls = "flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-raised";
  if (!to)
    return (
      <span className={`${cls} opacity-40`} aria-hidden>
        {icon}
      </span>
    );
  return (
    <Link href={readHref(to, versions)} aria-label={`${label}: ${refLabel(to)}`} title={refLabel(to)} className={`${cls} text-muted hover:text-ink`}>
      {icon}
    </Link>
  );
}

function VersionLabel({ version, compact = false }: { version: Version; compact?: boolean }) {
  const lang = getLanguage(version.language);
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5" title={`${version.name} (${version.year}) — ${lang.name}`}>
      <span className="font-semibold text-ink">{version.abbr}</span>
      {!compact && <span className="truncate text-faint">{lang.name}</span>}
      {version.kind === "ai" && (
        <span className="rounded bg-accent-soft px-1 text-[10px] font-bold uppercase text-accent">AI translation</span>
      )}
    </span>
  );
}

function verseLabel(v: Verse) {
  return v.n ?? (v.to ? `${v.v}–${v.to}` : v.v);
}

function contLabel(cont: string, chapter: number) {
  const [c, v] = cont.split(":");
  return Number(c) === chapter ? `see v. ${v}` : `see ${cont}`;
}

function Cell({ verse, version, chapter, showNumber }: { verse: Verse | null; version: Version; chapter: number; showNumber: boolean }) {
  const color = languageColor(useSettings(), version.language);
  if (!verse)
    return (
      <span className="text-faint" title="Not present in this version">
        —
      </span>
    );
  if (verse.cont)
    return (
      <span className="text-sm italic text-faint" title="This verse is combined with an earlier one in this version">
        ↑ {contLabel(verse.cont, chapter)}
      </span>
    );
  return (
    <span
      lang={version.language}
      dir={version.dir}
      className="reader-text block"
      style={{ color: color }}
      onDoubleClick={() => {
        // Double-click a word → search for it in this version.
        const word = window.getSelection()?.toString().trim().match(/[\p{L}\p{M}\p{N}]+/u)?.[0];
        if (word) openSearch(word, [version.id]);
      }}
    >
      {showNumber && (
        <sup
          className="mr-1 select-none font-sans text-[0.65em] font-semibold text-accent"
          title={verse.n ? `Numbered ${verse.n} in ${version.abbr}` : undefined}
        >
          {verseLabel(verse)}
        </sup>
      )}
      {verse.t}
    </span>
  );
}

function ColumnView({ cols, rows }: { cols: Col[]; rows: AlignedRow[] }) {
  const n = cols.length;
  const loading = rows.length === 0 && cols.some((c) => c.entry.status === "loading");
  const chapter = cols.find((c) => c.entry.status === "ok")?.entry;
  const chNum = chapter?.status === "ok" ? chapter.data.chapter : 0;
  return (
    <div
      role="table"
      aria-label="Parallel versions"
      className="grid min-w-full"
      style={{ gridTemplateColumns: `repeat(${n}, minmax(var(--colmin), 1fr))` }}
    >
      <div role="row" className="contents">
        {cols.map((c) => (
          <div
            role="columnheader"
            key={c.version.id}
            className="sticky top-0 z-10 snap-start border-b border-line bg-paper/95 px-4 py-2 text-sm backdrop-blur md:px-5"
          >
            <VersionLabel version={c.version} />
            {c.entry.status === "error" && <ColumnError col={c} />}
            {c.entry.status === "ok" && c.entry.data.note && (
              <p className="mt-1 text-xs font-normal leading-snug text-faint">{c.entry.data.note}</p>
            )}
          </div>
        ))}
      </div>
      {loading
        ? cols.map((c) => (
            <div key={c.version.id} className="px-4 py-3 md:px-5">
              <Skeleton />
            </div>
          ))
        : rows.map((row) => (
            <div role="row" key={row.v} className="contents">
              {row.cells.map((verse, i) => (
                <div
                  role="cell"
                  key={cols[i].version.id}
                  // display:contents rows have no box, so the anchor lives on the first cell
                  id={i === 0 ? `v${row.v}` : undefined}
                  data-v={row.v}
                  className="verse-flash snap-start scroll-mt-12 border-b border-line/60 px-4 py-2.5 md:px-5"
                >
                  {cols[i].entry.status === "loading" ? (
                    <SkeletonLine />
                  ) : cols[i].entry.status === "error" ? null : (
                    <Cell verse={verse} version={cols[i].version} chapter={chNum} showNumber />
                  )}
                </div>
              ))}
            </div>
          ))}
    </div>
  );
}

function StackedView({ cols, rows }: { cols: Col[]; rows: AlignedRow[] }) {
  const multi = cols.length > 1;
  const errors = cols.filter((c) => c.entry.status === "error");
  const loading = rows.length === 0 && cols.some((c) => c.entry.status === "loading");
  const first = cols.find((c) => c.entry.status === "ok")?.entry;
  const chNum = first?.status === "ok" ? first.data.chapter : 0;
  return (
    <div className="mx-auto max-w-[var(--stackw)] px-4 md:px-8">
      {errors.map((c) => (
        <div key={c.version.id} className="mb-3 rounded-lg border border-line bg-raised px-3 py-2 text-sm">
          <VersionLabel version={c.version} compact /> <ColumnError col={c} inline />
        </div>
      ))}
      {cols.map((c) =>
        c.entry.status === "ok" && c.entry.data.note ? (
          <p key={`note-${c.version.id}`} className="mb-3 rounded-lg border border-line bg-raised px-3 py-2 text-xs text-muted">
            <VersionLabel version={c.version} compact /> — {c.entry.data.note}
          </p>
        ) : null,
      )}
      {loading ? (
        <Skeleton />
      ) : (
        <ol className="divide-y divide-line/70">
          {rows.map((row) => (
            <li key={row.v} id={`v${row.v}`} data-v={row.v} className="verse-flash flex scroll-mt-4 gap-3 py-3">
              <span className="w-7 shrink-0 pt-1 text-right text-xs font-semibold tabular-nums text-accent">{row.v}</span>
              <div className="min-w-0 flex-1 space-y-2">
                {row.cells.map((verse, i) => {
                  const c = cols[i];
                  if (c.entry.status === "error") return null;
                  return (
                    <div key={c.version.id} className={i > 0 ? "text-ink/85" : ""}>
                      {multi && (
                        <div className="mb-0.5 text-[11px] uppercase tracking-wide">
                          <VersionLabel version={c.version} compact />
                          {verse?.n && <span className="ml-1 normal-case text-faint">({verse.n})</span>}
                        </div>
                      )}
                      {c.entry.status === "loading" ? (
                        <SkeletonLine />
                      ) : (
                        <Cell verse={verse} version={c.version} chapter={chNum} showNumber={false} />
                      )}
                    </div>
                  );
                })}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function ColumnError({ col, inline = false }: { col: Col; inline?: boolean }) {
  if (col.entry.status !== "error") return null;
  return (
    <span className={`${inline ? "" : "mt-1 flex"} items-center gap-2 text-xs text-red-700 dark:text-red-400`} role="alert">
      Couldn’t load ({col.entry.message}).{" "}
      <button type="button" onClick={col.retry} className="min-h-8 font-semibold underline underline-offset-2">
        Retry
      </button>
    </span>
  );
}

function SkeletonLine() {
  return <span className="block h-4 w-full animate-pulse rounded bg-line/70" aria-hidden />;
}
function Skeleton() {
  return (
    <div className="space-y-3 py-4" aria-label="Loading" role="status">
      {Array.from({ length: 8 }, (_, i) => (
        <span key={i} className="block h-4 animate-pulse rounded bg-line/70" style={{ width: `${70 + ((i * 37) % 30)}%` }} />
      ))}
    </div>
  );
}

function ChapterNav({ prev, next, versions }: { prev?: BookRef; next?: BookRef; versions: string[] }) {
  const cls = "flex min-h-12 flex-1 items-center gap-2 rounded-xl border border-line bg-raised px-4 text-sm hover:border-faint";
  return (
    <nav aria-label="Chapter navigation" className="mx-auto flex max-w-3xl gap-3 px-4 pb-4 pt-8 md:px-8">
      {prev ? (
        <Link href={readHref(prev, versions)} className={cls}>
          <ChevronLeft className="shrink-0 text-faint" />
          <span className="truncate">{refLabel(prev)}</span>
        </Link>
      ) : (
        <span className="flex-1" />
      )}
      {next ? (
        <Link href={readHref(next, versions)} className={`${cls} justify-end text-right`}>
          <span className="truncate">{refLabel(next)}</span>
          <ChevronRight className="shrink-0 text-faint" />
        </Link>
      ) : (
        <span className="flex-1" />
      )}
    </nav>
  );
}

function Attribution({ versions }: { versions: Version[] }) {
  return (
    <footer className="mx-auto max-w-3xl space-y-1 px-4 pb-10 pt-2 text-xs leading-relaxed text-faint md:px-8">
      {versions.map((v) => (
        <p key={v.id}>
          <span className="font-semibold">{v.abbr}</span> — {v.name} ({v.yearNote ?? v.year}). {v.license}.{" "}
          {v.attribution}{" "}
          <a href={v.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-muted">
            Source
          </a>
        </p>
      ))}
      <p>Verse numbers follow the English (KJV) system so versions line up; a version’s own number is shown where it differs.</p>
    </footer>
  );
}

function NotFound() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="font-serif text-2xl font-semibold">Passage not found</h1>
      <p className="text-muted">That book or chapter isn’t in the library (yet).</p>
      <Link href="/" className="rounded-lg bg-accent px-4 py-3 font-medium text-accent-ink">
        Go to Genesis 1
      </Link>
    </div>
  );
}

export function ReaderFallback() {
  return (
    <div className="absolute inset-0 mx-auto max-w-3xl px-4 pt-8 md:px-8">
      <Skeleton />
    </div>
  );
}

/**
 * Two-finger pinch on the reading area changes the text size (instead of zooming the whole page).
 * The new size is saved like the A−/A+ buttons.
 */
function usePinchToZoomText(ref: RefObject<HTMLDivElement | null>, fontSize: number) {
  const size = useRef(fontSize);
  useEffect(() => {
    size.current = fontSize;
  }, [fontSize]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let start: { dist: number; size: number } | null = null;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) start = { dist: dist(e.touches), size: size.current };
    };
    const onMove = (e: TouchEvent) => {
      if (!start || e.touches.length !== 2) return;
      e.preventDefault(); // keep the browser from zooming the page
      const next = Math.round(Math.min(FONT_MAX, Math.max(FONT_MIN, start.size * (dist(e.touches) / start.dist))));
      if (next !== size.current) updateSettings({ fontSize: next });
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) start = null;
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [ref]);
}
