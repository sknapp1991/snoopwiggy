"use client";
/**
 * A scripture reference inside an AI answer. Desktop: hover shows the verse in a small card; click
 * opens it in the reader (the AI window stays where it was). Phone / touch: tap shows the card (tap
 * another reference to switch, tap outside to close); "Open" in the card goes to the passage.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { chapterTitle, DEFAULT_VERSIONS, findBook, getVersion, readHref } from "@/lib/catalog";
import { fetchBook } from "@/lib/chapter-store";
import type { FoundRef } from "@/lib/refs";
import { useMediaQuery } from "@/lib/settings";
import { useReaderState } from "./use-reader-state";

/** Only one card at a time, across all references. */
let closeOpen: (() => void) | null = null;

export function RefLink({ r }: { r: FoundRef }) {
  const touch = useMediaQuery("(hover: none)", false);
  const { ref: here, versions: current } = useReaderState();
  const versions = r.ref.work === here.work && current.length ? current : (DEFAULT_VERSIONS[r.ref.work] ?? []);
  // "#v30-35": the reader puts verse 30 at the top and marks the whole passage.
  const href = readHref(r.ref, r.ref.work === here.work ? undefined : versions, r.verse && r.to ? `${r.verse}-${r.to}` : r.verse);
  const sameChapter = r.ref.work === here.work && r.ref.book === here.book && r.ref.chapter === here.chapter;
  /**
   * Same chapter: only the #hash changes, which the router doesn't treat as a navigation — so set it
   * here and tell the reader to move (reader.tsx listens for "va-jump"). Returns true when handled.
   */
  const jumpHere = (e: React.MouseEvent) => {
    if (!sameChapter) return false;
    e.preventDefault();
    window.history.pushState(window.history.state, "", href.includes("#") ? href.slice(href.indexOf("#")) : "#v1");
    window.dispatchEvent(new Event("va-jump"));
    return true;
  };
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  const link = useRef<HTMLAnchorElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const show = () => {
    const el = link.current;
    if (!el) return;
    closeOpen?.();
    const b = el.getBoundingClientRect();
    const W = Math.min(320, window.innerWidth - 16);
    const left = Math.max(8, Math.min(b.left, window.innerWidth - W - 8));
    // Below the link when there's room, else above it.
    setPos(window.innerHeight - b.bottom > 220 ? { left, top: b.bottom + 6 } : { left, bottom: window.innerHeight - b.top + 6 });
    closeOpen = () => setPos(null);
  };
  const hide = () => {
    setPos(null);
    if (closeOpen) closeOpen = null;
  };

  // Touch: a tap outside the card (and outside this link) closes it; so does scrolling the answer.
  useEffect(() => {
    if (!pos) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (card.current?.contains(t) || link.current?.contains(t)) return;
      hide();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && hide();
    // The card is placed on screen next to the link: if the answer scrolls, it would be left behind.
    const onScroll = (e: Event) => {
      if (!card.current?.contains(e.target as Node)) hide();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [pos]);

  return (
    <>
      <Link
        ref={link}
        href={href}
        scroll={false}
        onClick={(e) => {
          if (touch) {
            e.preventDefault();
            if (pos) hide();
            else show();
          } else {
            hide();
            jumpHere(e);
          }
        }}
        onMouseEnter={() => {
          if (touch) return;
          clearTimeout(timer.current);
          timer.current = setTimeout(show, 250);
        }}
        onMouseLeave={() => {
          clearTimeout(timer.current);
          timer.current = setTimeout(hide, 200);
        }}
        className="font-medium text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
      >
        {r.label}
      </Link>
      {pos && (
        <div
          ref={card}
          role="dialog"
          aria-label={r.label}
          onMouseEnter={() => clearTimeout(timer.current)}
          onMouseLeave={() => {
            if (!touch) timer.current = setTimeout(hide, 200);
          }}
          style={{ left: pos.left, top: pos.top, bottom: pos.bottom }}
          className="fixed z-[60] w-[min(320px,calc(100vw-16px))] rounded-xl border border-line bg-panel p-3 text-left text-sm font-normal not-italic text-ink shadow-2xl"
        >
          <Preview r={r} versions={versions.slice(0, 2)} />
          <Link
            href={href}
            scroll={false}
            onClick={(e) => {
              hide();
              jumpHere(e);
            }}
            className="mt-2 inline-flex min-h-9 items-center rounded-lg bg-accent px-3 text-xs font-medium text-accent-ink">
            Open {r.label} →
          </Link>
        </div>
      )}
    </>
  );
}

function Preview({ r, versions }: { r: FoundRef; versions: string[] }) {
  const [rows, setRows] = useState<{ key: string; list: { abbr: string; v: string; t: string; dir: "ltr" | "rtl" }[] } | null>(null);
  const key = `${r.ref.work}/${r.ref.book}/${r.ref.chapter}:${r.verse ?? ""}-${r.to ?? ""}/${versions.join(",")}`;
  useEffect(() => {
    let live = true;
    const from = r.verse ? parseInt(r.verse, 10) : 1;
    const to = r.to ? parseInt(r.to, 10) : r.verse ? from : 3; // a chapter: its first verses
    Promise.all(
      versions.map((id) =>
        fetchBook(r.ref.work, id, r.ref.book)
          .then((b) =>
            (b.chapters[String(r.ref.chapter)]?.verses ?? [])
              .filter((x) => !x.cont && x.t && parseInt(x.v, 10) >= from && parseInt(x.v, 10) <= Math.min(to, from + 9))
              .map((x) => ({ abbr: getVersion(id)?.abbr ?? id, v: x.v, t: x.t, dir: getVersion(id)?.dir ?? "ltr" })),
          )
          .catch(() => []),
      ),
    ).then((all) => live && setRows({ key, list: all.flat() }));
    return () => {
      live = false;
    };
  }, [key, r.ref.work, r.ref.book, r.ref.chapter, r.verse, r.to, versions]);
  const title = `${chapterTitle(findBook(r.ref.work, r.ref.book), r.ref.chapter, r.ref.book)}${r.verse ? `:${r.verse}${r.to ? `–${r.to}` : ""}` : ""}`;
  const list = rows?.key === key ? rows.list : null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-faint">{title}</p>
      <div className="mt-1 max-h-48 space-y-1.5 overflow-y-auto overscroll-contain font-serif leading-snug">
        {!list ? (
          <p className="animate-pulse text-muted">Loading…</p>
        ) : list.length === 0 ? (
          <p className="text-muted">Couldn’t load this passage.</p>
        ) : (
          list.map((x, i) => (
            <p key={i} dir={x.dir}>
              <span className="mr-1 font-sans text-[10px] font-semibold text-faint">
                {versions.length > 1 ? `${x.abbr} ` : ""}
                {x.v}
              </span>
              {x.t}
            </p>
          ))
        )}
      </div>
    </div>
  );
}
