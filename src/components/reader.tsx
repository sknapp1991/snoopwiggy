"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";
import { alignVerses, type AlignedRow } from "@/lib/align";
import { adjacentChapters, chapterTitle, findBook, getVersion, readHref, type BookRef } from "@/lib/catalog";
import { chapterKey, loadChapter, useChapters, type ChapterEntry } from "@/lib/chapter-store";
import { getLanguage } from "@/lib/languages";
import type { Verse, Version } from "@/lib/schema";
import {
  FONT_MAX,
  FONT_MIN,
  versionColor,
  PHONE_LANDSCAPE_QUERY,
  updateSettings,
  useMediaQuery,
  useSettings,
  useViewMode,
  WIDE_QUERY,
} from "@/lib/settings";
import { ChevronLeft, ChevronRight, PauseIcon, PlayIcon } from "./icons";
import { openSearch } from "./search-panel";
import { NoteLine, VerseBox, VerseCtx, VerseText, type Marks, type VerseActions } from "./verse-parts";
import { VerseMenu, verseReference, type VerseText as VerseTextInfo } from "./verse-menu";
import { StudiedBox } from "./studied-box";
import { HighlightModeBar } from "./highlight-mode";
import { wordAt } from "./use-gestures";
import { chapterMarks, getItem, highlightBg, setHighlight, toggle, useStudy } from "@/lib/study";
import { openVerseMenu, toast } from "@/lib/ui-store";
import { useSpeech } from "@/lib/speech";
import { getPosition, savePosition } from "@/lib/reading-position";
import { FirstTips } from "./first-tips";
import { ListenButton, ReadAlongBar, ReadAlongSpacer, useReadAlong, type ReadAlong } from "./audio-player";
import { useReaderState } from "./use-reader-state";
import { gestureLock, useChapterSwipe, useScrollIdle, type SwipeHint } from "./use-chapter-swipe";

type Col = { version: Version; entry: ChapterEntry; retry: () => void };

export function ReaderView() {
  const { ref, entry: book, versions: userVersions } = useReaderState();
  // While listening, the version being read can be shown first (the saved order is unchanged).
  const speechState = useSpeech();
  const listenFirstOn = useSettings().ttsMoveFirst;
  const listenFirst =
    listenFirstOn && speechState.open && speechState.version && userVersions.includes(speechState.version)
      ? speechState.version
      : null;
  const versions = useMemo(
    () => (listenFirst ? [listenFirst, ...userVersions.filter((v) => v !== listenFirst)] : userVersions),
    [listenFirst, userVersions],
  );
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
  const content = useRef<HTMLDivElement>(null);
  const [hint, setHint] = useState<SwipeHint>(null);
  const [idle, setIdle] = useState(true);
  const chapterId = `${ref.work}/${ref.book}/${ref.chapter}`;
  useScrollIdle(scroller, (isIdle) => {
    setIdle(isIdle);
    // Remember the first verse on screen, to come back to it later.
    const sc = scroller.current;
    if (!isIdle || !sc) return;
    const top = sc.getBoundingClientRect().top + 48;
    const el = [...sc.querySelectorAll<HTMLElement>("[id^='v'][data-v]")].find((x) => x.getBoundingClientRect().bottom > top);
    if (el?.dataset.v) savePosition(chapterId, sc.scrollTop < 40 ? "1" : el.dataset.v);
  });
  useChapterSwipe({
    scroller,
    content,
    mode: settings.chapterSwipe,
    column: view === "column",
    canPrev: !!prev,
    canNext: !!next,
    onHint: setHint,
    onGo: (dir) => {
      const to = dir === "prev" ? prev : next;
      if (to) router.push(readHref(to, versions));
    },
  });
  const ra = useReadAlong({ cols, rows, bookRef: ref, next, versions, scroller });
  const study = useStudy();
  const marks = useMemo(() => chapterMarks(study.items, ref.work, ref.book, ref.chapter), [study.items, ref.work, ref.book, ref.chapter]);

  const actions: VerseActions = {
    marks,
    boxTap(v) {
      const r = { ...ref, verse: v };
      const on = toggle("favorite", r);
      toast(on ? `★ ${verseReference(r)} added to favorites` : `Removed ${verseReference(r)} from favorites`);
    },
    boxDouble(v) {
      const r = { ...ref, verse: v };
      const on = toggle("later", r);
      toast(on ? `${verseReference(r)} saved to Study later` : `Removed ${verseReference(r)} from Study later`);
    },
    openMenu: (v, focus) => openVerseMenu({ ...ref, verse: v, focus }),
    textTap(v, version) {
      const r = { ...ref, verse: v };
      if (settings.highlightMode) {
        const cur = getItem("highlight", r)?.color;
        setHighlight(r, cur === settings.highlightColor ? null : settings.highlightColor);
      } else if (ra.speech.open && ra.supported) ra.readFrom(v, version); // read in the language tapped
      else openVerseMenu({ ...r, version });
    },
    textDouble(p, version) {
      const w = wordAt(p.x, p.y);
      if (w) openSearch(w, [version]);
    },
  };
  /** Text of one verse in every loaded column (for copy and Ask in…). */
  const textsFor = (v: string): VerseTextInfo[] => {
    const row = rows.find((r) => r.v === v);
    if (!row) return [];
    return row.cells.flatMap((cell, i) => {
      const ver = cols[i]?.version;
      if (!cell || cell.cont || !cell.t || !ver) return [];
      return [{ abbr: ver.abbr, name: ver.name, language: getLanguage(ver.language).name, text: cell.t, dir: ver.dir, lang: ver.language }];
    });
  };

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
    const hash = decodeURIComponent(window.location.hash.slice(1));
    // No #verse in the link: go back to where you were in this chapter (if not the top).
    const saved = hash ? null : getPosition(`${ref.work}/${ref.book}/${ref.chapter}`);
    const id = hash || (saved && saved !== "1" ? `v${saved}` : "");
    const key = `${ref.work}/${ref.book}/${ref.chapter}#${id}`;
    if (!id || jumped.current === key) return;
    if (!hash) {
      const el = document.getElementById(id);
      if (el) {
        jumped.current = key;
        el.scrollIntoView({ block: "start" });
      }
      return;
    }
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
      <title>{`${title} · VersesAcross`}</title>
      <div ref={content}>
      <div className={column ? "sticky left-0 w-[100cqw]" : ""}>
        <FirstTips />
        <ChapterHeader title={title} bookRef={ref} versions={versions} prev={prev} next={next} ra={ra} />
      </div>

      <ListenCtx.Provider value={ra}>
      <VerseCtx.Provider value={actions}>
        {column ? <ColumnView cols={cols} rows={rows} marks={marks} /> : <StackedView cols={cols} rows={rows} marks={marks} />}
      </VerseCtx.Provider>
      </ListenCtx.Provider>

      <div className={column ? "sticky left-0 w-[100cqw]" : ""}>
        {allLoaded && <StudiedBox bookRef={ref} title={title} />}
        <ChapterNav prev={prev} next={next} versions={versions} />
        <Attribution versions={cols.map((c) => c.version)} />
        <ReadAlongSpacer ra={ra} />
      </div>
      </div>
    </div>
    <SwipeHintView hint={hint} prev={prev} next={next} />
    {settings.floatingNav && (
      <FloatingNav prev={prev} next={next} versions={versions} visible={idle && !hint} raised={ra.speech.open} />
    )}
    <ReadAlongBar ra={ra} />
    <HighlightModeBar raised={ra.speech.open} />
    <VerseMenu textsFor={textsFor} versions={versions} onReadFrom={ra.supported ? ra.readFrom : undefined} />
    </>
  );
}

/** "‹ Genesis 1" / "Genesis 3 ›" while swiping; turns solid once letting go will change chapter. */
function SwipeHintView({ hint, prev, next }: { hint: SwipeHint; prev?: BookRef; next?: BookRef }) {
  if (!hint) return null;
  const to = hint.dir === "prev" ? prev : next;
  if (!to) return null;
  const ready = hint.progress >= 1;
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute top-1/2 z-30 -translate-y-1/2 rounded-full px-4 py-2 text-sm font-semibold shadow-lg transition-colors ${
        hint.dir === "prev" ? "left-3" : "right-3"
      } ${ready ? "bg-accent text-accent-ink" : "border border-line bg-panel text-muted"}`}
      style={{ opacity: 0.35 + hint.progress * 0.65 }}
    >
      {hint.dir === "prev" ? `‹ ${refLabel(to)}` : `${refLabel(to)} ›`}
      <span className="block text-center text-[11px] font-normal">{ready ? "Let go to open" : "Keep swiping"}</span>
    </div>
  );
}

/** Small round ‹ › buttons at the bottom corners; they fade while scrolling and return when idle. */
function FloatingNav({ prev, next, versions, visible, raised }: { prev?: BookRef; next?: BookRef; versions: string[]; visible: boolean; raised: boolean }) {
  const cls = `pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border border-line bg-panel/90 text-muted shadow-md backdrop-blur transition-opacity duration-300 hover:text-ink ${
    visible ? "opacity-90" : "pointer-events-none opacity-0"
  }`;
  return (
    <div
      className={`pointer-events-none absolute inset-x-0 z-10 flex justify-between px-3 ${raised ? "bottom-24" : "bottom-4 mb-[env(safe-area-inset-bottom)]"}`}
    >
      {prev ? (
        <Link href={readHref(prev, versions)} aria-label={`Previous chapter: ${refLabel(prev)}`} title={refLabel(prev)} className={cls} tabIndex={visible ? 0 : -1}>
          <ChevronLeft />
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link href={readHref(next, versions)} aria-label={`Next chapter: ${refLabel(next)}`} title={refLabel(next)} className={cls} tabIndex={visible ? 0 : -1}>
          <ChevronRight />
        </Link>
      ) : (
        <span />
      )}
    </div>
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

/** ▶ next to a version name: listen to that version (⏸ while it is the one playing). */
const ListenCtx = createContext<ReadAlong | null>(null);
function VersionPlay({ id, verse, label }: { id: string; verse?: string; label: string }) {
  const ra = useContext(ListenCtx);
  if (!ra?.supported) return null;
  const s = ra.speech;
  const active = s.open && s.version === id && s.status === "playing" && (!verse || s.verse === verse);
  return (
    <button
      type="button"
      data-no-swipe
      onClick={(e) => {
        e.stopPropagation();
        ra.playVersion(id, active ? undefined : verse);
      }}
      aria-label={active ? `Pause ${label}` : `Listen to ${label}${verse ? ` from verse ${verse}` : ""}`}
      title={ra.hasRecording(id) ? `Listen to ${label} (recorded voice)` : `Listen to ${label}`}
      className={`relative ml-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full align-middle after:absolute after:-inset-2 after:content-[''] ${
        active ? "bg-accent text-accent-ink" : "text-accent hover:bg-accent-soft"
      }`}
    >
      {active ? <PauseIcon width={11} height={11} /> : <PlayIcon width={11} height={11} />}
    </button>
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

function contLabel(cont: string, chapter: number) {
  const [c, v] = cont.split(":");
  return Number(c) === chapter ? `see v. ${v}` : `see ${cont}`;
}

function Cell({ verse, version, chapter, box }: { verse: Verse | null; version: Version; chapter: number; box?: React.ReactNode }) {
  const color = versionColor(useSettings(), version);
  if (!verse)
    return (
      <span className="text-faint" title="Not present in this version">
        {box}—
      </span>
    );
  if (verse.cont)
    return (
      <span className="text-sm italic text-faint" title="This verse is combined with an earlier one in this version">
        {box}↑ {contLabel(verse.cont, chapter)}
      </span>
    );
  return (
    <VerseText v={verse.v} version={version.id} lang={version.language} dir={version.dir} color={color}>
      {box}
      {verse.n && (
        <span className="mr-1 select-none font-sans text-[0.65em] font-semibold text-faint" title={`Numbered ${verse.n} in ${version.abbr}`}>
          ({verse.n})
        </span>
      )}
      <span data-text>{verse.t}</span>
    </VerseText>
  );
}

function ColumnView({ cols, rows, marks }: { cols: Col[]; rows: AlignedRow[]; marks: Map<string, Marks> }) {
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
            <span className="flex items-center">
              <VersionLabel version={c.version} />
              <VersionPlay id={c.version.id} label={c.version.abbr} />
            </span>
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
        : rows.map((row) => {
            const bg = highlightBg(marks.get(row.v)?.highlight?.color);
            return (
              <div role="row" key={row.v} className="contents">
                {row.cells.map((verse, i) => (
                  <div
                    role="cell"
                    key={cols[i].version.id}
                    // display:contents rows have no box, so the anchor lives on the first cell
                    id={i === 0 ? `v${row.v}` : undefined}
                    data-v={row.v}
                    style={bg ? { background: bg } : undefined}
                    className="verse-flash snap-start scroll-mt-12 border-b border-line/60 px-3 py-2.5 md:px-4"
                  >
                    {cols[i].entry.status === "loading" ? (
                      <SkeletonLine />
                    ) : cols[i].entry.status === "error" ? null : (
                      <Cell
                        verse={verse}
                        version={cols[i].version}
                        chapter={chNum}
                        box={<VerseBox v={row.v} label={row.v} size="sm" />}
                      />
                    )}
                    {i === 0 && <NoteLine v={row.v} />}
                  </div>
                ))}
              </div>
            );
          })}
    </div>
  );
}

function StackedView({ cols, rows, marks }: { cols: Col[]; rows: AlignedRow[]; marks: Map<string, Marks> }) {
  const multi = cols.length > 1;
  const errors = cols.filter((c) => c.entry.status === "error");
  const loading = rows.length === 0 && cols.some((c) => c.entry.status === "loading");
  const first = cols.find((c) => c.entry.status === "ok")?.entry;
  const chNum = first?.status === "ok" ? first.data.chapter : 0;
  const firstOk = Math.max(0, cols.findIndex((c) => c.entry.status !== "error"));
  return (
    <div className="mx-auto max-w-[var(--stackw)] px-3 md:px-6">
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
          {rows.map((row) => {
            const bg = highlightBg(marks.get(row.v)?.highlight?.color);
            return (
              <li
                key={row.v}
                id={`v${row.v}`}
                data-v={row.v}
                style={bg ? { background: bg } : undefined}
                className="verse-flash scroll-mt-4 rounded-sm px-1 py-3"
              >
                <div className="min-w-0 space-y-2">
                  {row.cells.map((verse, i) => {
                    const c = cols[i];
                    if (c.entry.status === "error") return null;
                    return (
                      <div key={c.version.id} className={i > 0 ? "text-ink/85" : ""}>
                        {multi && (
                          <div className="mb-0.5 flex items-center text-[11px] uppercase tracking-wide">
                            <VersionLabel version={c.version} compact />
                            {verse && !verse.cont && <VersionPlay id={c.version.id} verse={row.v} label={c.version.abbr} />}
                          </div>
                        )}
                        {c.entry.status === "loading" ? (
                          <SkeletonLine />
                        ) : (
                          <Cell
                            verse={verse}
                            version={c.version}
                            chapter={chNum}
                            // Small verse number inline at the start of the first text (more room for words).
                            box={i === firstOk ? <VerseBox v={row.v} label={row.v} size="sm" /> : undefined}
                          />
                        )}
                      </div>
                    );
                  })}
                  <NoteLine v={row.v} />
                </div>
              </li>
            );
          })}
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
      if (gestureLock.swipe) return; // a two-finger chapter swipe, not a pinch
      const ratio = dist(e.touches) / start.dist;
      if (Math.abs(ratio - 1) < 0.08) return; // small wobble while swiping with two fingers
      const next = Math.round(Math.min(FONT_MAX, Math.max(FONT_MIN, start.size * ratio)));
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
