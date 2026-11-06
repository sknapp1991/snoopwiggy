"use client";
/**
 * Cross references: the verses most like the one tapped — in its own religion and, if ticked, in
 * others (e.g. a Gospel verse beside the closest verses of the Quran or the Dhammapada).
 * Similarity is precomputed from the meaning of the text (scripts/xref/build.py → R2, served by /api/xref);
 * it finds related wording and themes, not doctrinal agreement. Desktop: a panel at the right;
 * phone: a sheet over the bottom of the reader.
 */
import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useUi } from "@/lib/ui-store";
import { askAboutVerse, sendAi, useAiChat } from "@/lib/ai-chat";
import { catalog, chapterTitle, DEFAULT_VERSIONS, findBook, getVersion, readHref, type BookRef } from "@/lib/catalog";
import { fetchBook } from "@/lib/chapter-store";
import { updateSettings, useMediaQuery, useSettings, WIDE_QUERY } from "@/lib/settings";
import { CloseIcon, SparkIcon } from "./icons";

type Hit = { work: string; book: string; chapter: number; v: string; score: number };

// ── the verses the panel compares (tap verses while the mode is on: each tap adds or removes one) ──
type Sel = BookRef & { verse: string };
let selected: Sel[] = [];
const EMPTY: Sel[] = [];
const subs = new Set<() => void>();
const emit = (next: Sel[]) => {
  selected = next;
  subs.forEach((l) => l());
};
/** Tap a verse: add it to (or take it out of) the selection; a verse in another chapter starts a new one. */
export function showXref(r: Sel) {
  const sameChapter = selected.length && selected[0].work === r.work && selected[0].book === r.book && selected[0].chapter === r.chapter;
  if (!sameChapter) return emit([r]);
  const has = selected.some((x) => x.verse === r.verse);
  emit(has ? selected.filter((x) => x.verse !== r.verse) : [...selected, r].sort((a, b) => parseInt(a.verse, 10) - parseInt(b.verse, 10)));
}
const useXrefSelection = () =>
  useSyncExternalStore(
    (l) => {
      subs.add(l);
      return () => subs.delete(l);
    },
    () => selected,
    () => EMPTY,
  );
/** "John 3:16" or "John 3:16, 18, 20" */
const selectionLabel = (sel: Sel[]) => (sel.length ? `${chapterTitle(findBook(sel[0].work, sel[0].book), sel[0].chapter, sel[0].book)}:${sel.map((x) => x.verse).join(", ")}` : "");

const files = new Map<string, Promise<Record<string, [string, number][]>>>();
function loadXref(work: string, book: string) {
  const k = `${work}/${book}`;
  let p = files.get(k);
  if (!p) {
    p = fetch(`/api/xref/${k}.json`).then((r) => (r.ok ? r.json() : {}), () => ({}));
    files.set(k, p);
  }
  return p;
}
const parseRef = (s: string, score: number): Hit => {
  const [work, book, cv] = s.split("/");
  const [c, v] = cv.split(":");
  return { work, book, chapter: Number(c), v, score };
};
const label = (h: { work: string; book: string; chapter: number; v: string }) =>
  `${chapterTitle(findBook(h.work, h.book), h.chapter, h.book)}:${h.v}`;
const religionOf = (work: string, book: string) => findBook(work, book)?.religion;

export function XrefToggle({ full = false }: { full?: boolean }) {
  const { xrefMode } = useSettings();
  return (
    <button
      type="button"
      aria-pressed={xrefMode}
      onClick={() => updateSettings({ xrefMode: !xrefMode })}
      title="Cross references: tap a verse to see similar verses (in this religion or others)"
      aria-label="Cross references"
      className={`flex h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm desk:border ${full ? "w-full border" : "w-11 px-0"} ${
        xrefMode ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:bg-raised hover:text-ink desk:bg-raised"
      }`}
    >
      <XrefIcon />
      {full && <span>Cross references {xrefMode ? "on" : "off"}</span>}
    </button>
  );
}

const XrefIcon = () => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M7 4h4v6H7zM13 14h4v6h-4z" />
    <path d="M11 7h3a3 3 0 013 3v4M13 17h-3a3 3 0 01-3-3v-4" />
  </svg>
);

/** One verse's text in a work's default version (cached per book by the chapter store). */
function useVerseText(h: Hit | null) {
  const [t, setT] = useState<{ k: string; text: string | null } | null>(null);
  const k = h ? `${h.work}/${h.book}/${h.chapter}:${h.v}` : "";
  useEffect(() => {
    if (!h) return;
    const id = DEFAULT_VERSIONS[h.work]?.[0];
    if (!id) return;
    let live = true;
    fetchBook(h.work, id, h.book)
      .then((b) => b.chapters[String(h.chapter)]?.verses.find((x) => x.v === h.v)?.t ?? null)
      .catch(() => null)
      .then((text) => live && setT({ k, text }));
    return () => {
      live = false;
    };
    // h's fields are in k
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k]);
  return t?.k === k ? t.text : undefined;
}

/* ---------- window position / size (desktop), like the AI window ---------- */

type Box = { x: number; y: number; w: number; h: number };
/** Where the window was put (kept while the site is open). */
let savedBox: Box | null = null;
const MIN_W = 300;
const MIN_H = 260;
/** Keep the box on screen and left of the side panel (Search / My Study), so it never covers it. */
function fitBox(b: Box, rightEdge: number): Box {
  const vh = window.innerHeight;
  const w = Math.min(Math.max(b.w, MIN_W), rightEdge - 16);
  const h = Math.min(Math.max(b.h, MIN_H), vh - 16);
  return { w, h, x: Math.min(Math.max(b.x, 8), rightEdge - w - 8), y: Math.min(Math.max(b.y, 8), vh - h - 8) };
}

export function XrefPanel({ bookRef, versions, raised }: { bookRef: BookRef; versions: string[]; raised: boolean }) {
  const settings = useSettings();
  const wide = useMediaQuery(WIDE_QUERY, true);
  const ai = useAiChat();
  const { panel } = useUi();
  const [box, setBox] = useState<Box | null>(null);
  const [sheetH, setSheetH] = useState<number | null>(null);
  const sidePanel = wide && panel ? (settings.panelWidth ?? 384) : 0;
  // Desktop: the saved place (or the right-hand side), kept clear of the side panel.
  useEffect(() => {
    if (!wide || !settings.xrefMode) return;
    const fit = () => {
      const right = window.innerWidth - sidePanel;
      const start = savedBox ?? { w: 380, h: window.innerHeight - 96, x: right - 380 - 16, y: 80 };
      setBox(fitBox(start, right));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [wide, settings.xrefMode, sidePanel]);
  /** Drag the title bar to move it; the edges / corner to resize. */
  const dragFrom = (e: React.PointerEvent, mode: "move" | "size" | "right" | "left" | "bottom") => {
    if (!box || e.button !== 0 || (mode === "move" && (e.target as HTMLElement).closest("button"))) return;
    e.preventDefault();
    const start = { px: e.clientX, py: e.clientY, ...box };
    const right = window.innerWidth - sidePanel;
    const onMove = (ev: PointerEvent) => {
      window.getSelection()?.removeAllRanges(); // no text selected while dragging
      const dx = ev.clientX - start.px;
      const dy = ev.clientY - start.py;
      const next =
        mode === "move"
          ? { ...start, x: start.x + dx, y: start.y + dy }
          : mode === "size"
            ? { ...start, w: start.w + dx, h: start.h + dy }
            : mode === "right"
              ? { ...start, w: start.w + dx }
              : mode === "bottom"
                ? { ...start, h: start.h + dy }
                : { ...start, x: start.x + Math.min(dx, start.w - MIN_W), w: Math.max(MIN_W, start.w - dx) };
      savedBox = fitBox(next, right);
      setBox(savedBox);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };
  const all = useXrefSelection();
  const sel = all.filter((x) => x.work === bookRef.work && x.book === bookRef.book && x.chapter === bookRef.chapter);
  const verse = sel[0] ?? null;
  const [data, setData] = useState<{ k: string; hits: Hit[] } | null>(null);
  const key = sel.length ? `${verse!.work}/${verse!.book}/${verse!.chapter}:${sel.map((x) => x.verse).join(",")}` : "";

  // Keep the chosen verses marked in the text.
  useEffect(() => {
    if (!settings.xrefMode) return;
    const els = sel.flatMap((x) => [...document.querySelectorAll(`[data-v="${CSS.escape(x.verse)}"]`)]);
    els.forEach((el) => el.classList.add("is-xref"));
    return () => els.forEach((el) => el.classList.remove("is-xref"));
    // sel's verses are in key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, settings.xrefMode]);

  useEffect(() => {
    if (!verse) return;
    let live = true;
    loadXref(verse.work, verse.book).then((d) => {
      // Several verses: every match of any of them, each at its best score; the chosen verses themselves left out.
      const best = new Map<string, number>();
      const mine = new Set(sel.map((x) => `${x.work}/${x.book}/${x.chapter}:${x.verse}`));
      for (const x of sel)
        for (const [r, sc] of d[`${x.chapter}:${x.verse}`] ?? []) if (!mine.has(r) && sc > (best.get(r) ?? 0)) best.set(r, sc);
      const hits = [...best].sort((a, b) => b[1] - a[1]).map(([r, sc]) => parseRef(r, sc));
      if (live) setData({ k: key, hits });
    });
    return () => {
      live = false;
    };
    // verse's fields are in key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const own = religionOf(bookRef.work, bookRef.book);
  const others = catalog.religions.filter((r) => r.id !== own?.id);
  const hits = data?.k === key ? data.hits : null;
  const groups = useMemo(() => {
    if (!hits) return [];
    const want = [...(settings.xrefSame && own ? [own.id] : []), ...others.map((r) => r.id).filter((id) => settings.xrefOthers.includes(id))];
    return want
      .map((id) => ({
        religion: catalog.religions.find((r) => r.id === id)!,
        hits: hits.filter((h) => religionOf(h.work, h.book)?.id === id).slice(0, sel.length > 1 ? 8 : 6),
      }))
      .filter((g) => g.religion);
    // others is derived from own
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hits, settings.xrefSame, settings.xrefOthers, own?.id]);

  if (!settings.xrefMode) return null;
  const toggleOther = (id: string) =>
    updateSettings({ xrefOthers: settings.xrefOthers.includes(id) ? settings.xrefOthers.filter((x) => x !== id) : [...settings.xrefOthers, id] });

  const compare = () => {
    if (!verse) return;
    const list = groups.flatMap((g) => g.hits.slice(0, 3).map(label));
    askAboutVerse({ reference: selectionLabel(sel), at: { ...verse }, texts: [] });
    void sendAi(
      `Compare ${selectionLabel(sel)} with these similar passages${list.length ? `: ${list.join("; ")}` : ""}. What do they share, and where do they genuinely differ in meaning or context?`,
    );
  };

  return (
    <section
      aria-label="Cross references"
      data-no-swipe
      style={wide ? (box ? { left: box.x, top: box.y, width: box.w, height: box.h } : { visibility: "hidden" }) : sheetH ? { height: sheetH } : undefined}
      className={`fixed z-30 flex flex-col overflow-hidden border border-line bg-panel shadow-2xl ${
        wide ? "rounded-xl" : `inset-x-0 ${raised ? "bottom-28" : "bottom-0"} h-[55dvh] rounded-t-2xl pb-[env(safe-area-inset-bottom)]`
      }`}
    >
      {wide ? (
        <>
          {/* Resize from the left, right and bottom edges, or the corner. */}
          <div onPointerDown={(e) => dragFrom(e, "left")} aria-hidden className="absolute inset-y-8 left-0 z-10 w-1.5 cursor-ew-resize hover:bg-accent/30" />
          <div onPointerDown={(e) => dragFrom(e, "right")} aria-hidden className="absolute inset-y-8 right-0 z-10 w-1.5 cursor-ew-resize hover:bg-accent/30" />
          <div onPointerDown={(e) => dragFrom(e, "bottom")} aria-hidden className="absolute inset-x-8 bottom-0 z-10 h-1.5 cursor-ns-resize hover:bg-accent/30" />
          <div
            onPointerDown={(e) => dragFrom(e, "size")}
            title="Drag to resize"
            aria-hidden
            className="absolute bottom-0 right-0 z-10 flex h-6 w-6 cursor-nwse-resize items-end justify-end p-1 text-faint hover:text-accent"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M11 4L4 11M11 8L8 11" />
            </svg>
          </div>
        </>
      ) : (
        // Phone: drag the top edge to make the sheet taller or shorter.
        <div
          onPointerDown={(e) => {
            const startY = e.clientY;
            const startH = sheetH ?? window.innerHeight * 0.55;
            const onMove = (ev: PointerEvent) =>
              setSheetH(Math.min(window.innerHeight - 40, Math.max(window.innerHeight * 0.25, startH - (ev.clientY - startY))));
            const onUp = () => {
              window.removeEventListener("pointermove", onMove);
              window.removeEventListener("pointerup", onUp);
            };
            window.addEventListener("pointermove", onMove);
            window.addEventListener("pointerup", onUp);
          }}
          aria-label="Drag to resize"
          className="absolute inset-x-0 top-0 z-10 flex h-3 touch-none justify-center"
        >
          <span className="mt-1 h-1 w-10 rounded-full bg-line" />
        </div>
      )}
      <header
        onPointerDown={wide ? (e) => dragFrom(e, "move") : undefined}
        title={wide ? "Drag to move" : undefined}
        className={`flex shrink-0 items-center gap-1 border-b border-line bg-raised py-1 pl-3 pr-1 ${wide ? "cursor-move select-none" : "pt-3"}`}
      >
        <span className="text-accent">
          <XrefIcon />
        </span>
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">
          Similar verses{verse ? <span className="font-normal text-muted"> · {selectionLabel(sel)}</span> : null}
        </h2>
        <button
          type="button"
          onClick={() => updateSettings({ xrefMode: false })}
          aria-label="Turn off cross references"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-panel hover:text-ink"
        >
          <CloseIcon />
        </button>
      </header>
      {sel.length > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-line px-3 py-2 text-xs">
          <span className="mr-1 font-semibold uppercase tracking-wide text-faint">Verses</span>
          {sel.map((x) => (
            <button
              key={x.verse}
              type="button"
              onClick={() => showXref(x)}
              title="Take this verse out"
              className="flex min-h-8 items-center gap-1 rounded-full border border-accent bg-accent-soft pl-2.5 pr-1.5 font-medium text-accent"
            >
              {x.verse} <CloseIcon width={11} height={11} />
            </button>
          ))}
          <span className="text-faint">· tap more verses to add them</span>
          {sel.length > 1 && (
            <button type="button" onClick={() => emit([])} className="ml-auto min-h-8 px-1 text-muted underline-offset-2 hover:text-ink hover:underline">
              Clear
            </button>
          )}
        </div>
      )}
      <div className="shrink-0 space-y-1 border-b border-line px-3 py-2 text-xs">
        <div className="flex items-center gap-2">
          <p className="font-semibold uppercase tracking-wide text-faint">Look in</p>
          <button
            type="button"
            onClick={() => updateSettings({ xrefSame: true, xrefOthers: others.map((r) => r.id) })}
            className="ml-auto min-h-7 px-1 text-muted underline-offset-2 hover:text-ink hover:underline"
          >
            All
          </button>
          <button
            type="button"
            onClick={() => updateSettings({ xrefSame: true, xrefOthers: [] })}
            className="min-h-7 px-1 text-muted underline-offset-2 hover:text-ink hover:underline"
          >
            Only {own?.name ?? "this one"}
          </button>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {own && (
            <label className="flex min-h-8 cursor-pointer items-center gap-1.5">
              <input type="checkbox" checked={settings.xrefSame} onChange={(e) => updateSettings({ xrefSame: e.target.checked })} className="h-4 w-4 accent-[var(--accent)]" />
              {own.name} <span className="text-faint">(same)</span>
            </label>
          )}
          {others.map((r) => (
            <label key={r.id} className="flex min-h-8 cursor-pointer items-center gap-1.5">
              <input type="checkbox" checked={settings.xrefOthers.includes(r.id)} onChange={() => toggleOther(r.id)} className="h-4 w-4 accent-[var(--accent)]" />
              {r.name}
            </label>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 py-2 text-sm">
        {!verse ? (
          <p className="text-muted">Tap a verse (or several) to see the verses most like it. Tick other religions above to look across traditions.</p>
        ) : !hits ? (
          <p className="animate-pulse text-muted">Loading…</p>
        ) : !groups.length ? (
          <p className="text-muted">Tick at least one religion above.</p>
        ) : (
          groups.map((g) => (
            <div key={g.religion.id}>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-faint">{g.religion.name}</p>
              {g.hits.length ? (
                <ul className="space-y-1.5">
                  {g.hits.map((h) => (
                    <HitRow key={`${h.work}/${h.book}/${h.chapter}:${h.v}`} h={h} versions={h.work === bookRef.work ? versions : undefined} />
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted">No close match.</p>
              )}
            </div>
          ))
        )}
      </div>
      <div className="shrink-0 space-y-1 border-t border-line px-3 py-2">
        {ai.ready && verse && groups.some((g) => g.hits.length) && (
          <button type="button" onClick={compare} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-xs hover:border-accent hover:text-accent">
            <SparkIcon width={14} height={14} /> Ask AI to compare these
          </button>
        )}
        <p className="text-[11px] leading-snug text-faint">
          Matched by meaning of the English text (an AI similarity model), so it finds shared themes and wording — not agreement in
          doctrine.
        </p>
      </div>
    </section>
  );
}

function HitRow({ h, versions }: { h: Hit; versions?: string[] }) {
  const text = useVerseText(h);
  const ver = getVersion(DEFAULT_VERSIONS[h.work]?.[0] ?? "");
  return (
    <li className="rounded-lg border border-line bg-raised/50 px-2 py-1.5">
      <div className="flex items-baseline gap-2">
        <Link href={readHref(h, versions, h.v)} scroll={false} className="font-medium text-accent underline decoration-accent/40 underline-offset-2">
          {label(h)}
        </Link>
        <span className="ml-auto shrink-0 text-[10px] tabular-nums text-faint" title="How close in meaning (0–100)">
          {h.score}%
        </span>
      </div>
      <p className="mt-0.5 line-clamp-4 font-serif leading-snug text-muted" dir={ver?.dir}>
        {text === undefined ? "…" : (text ?? "")}
      </p>
    </li>
  );
}
