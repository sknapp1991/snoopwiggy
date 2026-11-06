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
import { askAboutVerse, sendAi, useAiChat } from "@/lib/ai-chat";
import { catalog, chapterTitle, DEFAULT_VERSIONS, findBook, getVersion, readHref, type BookRef } from "@/lib/catalog";
import { fetchBook } from "@/lib/chapter-store";
import { updateSettings, useMediaQuery, useSettings, WIDE_QUERY } from "@/lib/settings";
import { CloseIcon, SparkIcon } from "./icons";

type Hit = { work: string; book: string; chapter: number; v: string; score: number };

// ── which verse the panel shows (set by tapping a verse while the mode is on) ──
let current: (BookRef & { verse: string }) | null = null;
const subs = new Set<() => void>();
export function showXref(r: BookRef & { verse: string }) {
  current = r;
  subs.forEach((l) => l());
}
const useXrefVerse = () =>
  useSyncExternalStore(
    (l) => {
      subs.add(l);
      return () => subs.delete(l);
    },
    () => current,
    () => null,
  );

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

export function XrefPanel({ bookRef, versions, raised }: { bookRef: BookRef; versions: string[]; raised: boolean }) {
  const settings = useSettings();
  const wide = useMediaQuery(WIDE_QUERY, true);
  const ai = useAiChat();
  const sel = useXrefVerse();
  const verse = sel && sel.work === bookRef.work && sel.book === bookRef.book && sel.chapter === bookRef.chapter ? sel : null;
  const [data, setData] = useState<{ k: string; hits: Hit[] } | null>(null);
  const key = verse ? `${verse.work}/${verse.book}/${verse.chapter}:${verse.verse}` : "";

  useEffect(() => {
    if (!verse) return;
    let live = true;
    loadXref(verse.work, verse.book).then((d) => {
      if (live) setData({ k: key, hits: (d[`${verse.chapter}:${verse.verse}`] ?? []).map(([r, s]) => parseRef(r, s)) });
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
      .map((id) => ({ religion: catalog.religions.find((r) => r.id === id)!, hits: hits.filter((h) => religionOf(h.work, h.book)?.id === id) }))
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
    askAboutVerse({ reference: label({ ...verse, v: verse.verse }), at: { ...verse }, texts: [] });
    void sendAi(
      `Compare ${label({ ...verse, v: verse.verse })} with these similar passages${list.length ? `: ${list.join("; ")}` : ""}. What do they share, and where do they genuinely differ in meaning or context?`,
    );
  };

  return (
    <section
      aria-label="Cross references"
      data-no-swipe
      className={`fixed z-30 flex flex-col border border-line bg-panel shadow-2xl ${
        wide
          ? "bottom-4 right-4 top-20 w-[min(380px,calc(100vw-32px))] rounded-xl"
          : `inset-x-0 ${raised ? "bottom-28" : "bottom-0"} h-[55dvh] rounded-t-2xl pb-[env(safe-area-inset-bottom)]`
      }`}
    >
      <header className="flex shrink-0 items-center gap-1 border-b border-line bg-raised py-1 pl-3 pr-1">
        <span className="text-accent">
          <XrefIcon />
        </span>
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">
          Similar verses{verse ? <span className="font-normal text-muted"> · {label({ ...verse, v: verse.verse })}</span> : null}
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
      <div className="shrink-0 space-y-1 border-b border-line px-3 py-2 text-xs">
        <p className="font-semibold uppercase tracking-wide text-faint">Look in</p>
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
          <p className="text-muted">Tap any verse to see the verses most like it. Tick other religions above to look across traditions.</p>
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
