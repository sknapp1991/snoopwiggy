"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { catalog, chapterTitle, DEFAULT_VERSIONS, readHref, type BookRef } from "@/lib/catalog";
import { findRefs } from "@/lib/refs";
import { DailyVerse } from "./daily-verse";
import type { CatalogItem, Collection, Religion } from "@/lib/schema";
import { ChevronDown, ChevronRight, CollapseIcon, ExpandIcon, SearchIcon } from "./icons";
import { usePinch } from "./use-gestures";
import { useReaderState } from "./use-reader-state";
import { formatStamp, useStudy } from "@/lib/study";

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

type Hit = { religion: Religion; collection: Collection; item: CatalogItem };

const ALL: Hit[] = catalog.religions.flatMap((religion) =>
  religion.collections.flatMap((collection) => collection.items.map((item) => ({ religion, collection, item }))),
);

/** "john 3:16", "1 cor 13", "gen" → a jump target when the book is unambiguous. */
function parseJump(q: string): { hit: Hit; chapter: number; verse?: string } | null {
  const m = /^(.+?)\s+(\d+)(?:\s*[:.]\s*(\d+))?$/.exec(q.trim());
  if (!m) return null;
  const name = norm(m[1]).replace(/\s+/g, " ");
  const avail = ALL.filter((h) => h.item.work && h.item.chapters && h.item.status !== "coming-soon");
  const exact = avail.filter((h) => norm(h.item.name) === name || h.item.id === name.replace(/\s/g, ""));
  const prefix = avail.filter((h) => norm(h.item.name).startsWith(name));
  const hit = exact[0] ?? (prefix.length === 1 ? prefix[0] : undefined);
  if (!hit) return null;
  const chapter = Number(m[2]);
  if (chapter < 1 || chapter > (hit.item.chapters ?? 0)) return null;
  return { hit, chapter, verse: m[3] };
}

/** "MN 10", "SN 12.2", "Surah 2:255", "Gita 2.47"… (the reference finder used for AI answers). */
function refJump(q: string, preferWork: string): { hit: Hit; chapter: number; verse?: string } | null {
  const r = findRefs(q.trim(), preferWork)[0];
  if (!r || r.start > 0 || r.end < q.trim().length) return null;
  const hit = ALL.find((h) => h.item.work === r.ref.work && h.item.id === r.ref.book);
  return hit ? { hit, chapter: r.ref.chapter, verse: r.verse } : null;
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { ref, versions } = useReaderState();
  const [query, setQuery] = useState("");
  // User toggles override the default (which is: the path to the current book is open).
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const activeRef = useRef<HTMLAnchorElement>(null);

  const currentPath = useMemo(() => {
    const ids = new Set<string>();
    for (const r of catalog.religions)
      for (const c of r.collections)
        for (const it of c.items)
          if (it.work === ref.work && it.id === ref.book) {
            ids.add(`r:${r.id}`);
            ids.add(`c:${r.id}/${c.id}`);
            ids.add(`b:${it.work}/${it.id}`);
          }
    return ids;
  }, [ref.work, ref.book]);

  const isOpen = (id: string) => toggled[id] ?? currentPath.has(id);
  const toggle = (id: string) => setToggled((t) => ({ ...t, [id]: !isOpen(id) }));
  // Expand all opens every religion and collection (not every book's chapter grid);
  // collapse all closes everything, including the current book.
  const setAll = (open: boolean) => {
    const next: Record<string, boolean> = {};
    for (const r of catalog.religions) {
      next[`r:${r.id}`] = open;
      for (const c of r.collections) {
        next[`c:${r.id}/${c.id}`] = open;
        if (!open) for (const it of c.items) next[`b:${it.work}/${it.id}`] = false;
      }
    }
    setToggled(next);
  };
  const treeRef = useRef<HTMLDivElement>(null);
  usePinch(treeRef, (dir) => setAll(dir === "out"));

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, []);

  const q = norm(query);
  const jump = q ? (parseJump(query) ?? refJump(query, ref.work)) : null;
  const hits = q ? ALL.filter((h) => norm(h.item.name).includes(q) || norm(h.collection.name).includes(q)) : [];

  const href = (r: BookRef, verse?: string) => readHref(r, versions, verse);

  return (
    <nav aria-label="Library" className="flex h-full min-h-0 flex-col">
      <div className="border-b border-line p-3">
        <label className="flex h-11 items-center gap-2 rounded-lg border border-line bg-raised px-3 focus-within:ring-2 focus-within:ring-accent/50">
          <SearchIcon className="shrink-0 text-faint" width={18} height={18} />
          <span className="sr-only">Search the library</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search books, or “John 3:16”"
            className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-faint md:text-sm"
          />
        </label>
      </div>

      {!q && <DailyVerse versionsFor={(w) => (w === ref.work ? versions : (DEFAULT_VERSIONS[w] ?? []))} onNavigate={onNavigate} />}
      {!q && (
        <div className="flex gap-1 border-b border-line px-3 py-1.5">
          <button
            type="button"
            onClick={() => setAll(true)}
            className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg text-xs font-medium text-muted hover:bg-raised hover:text-ink"
          >
            <ExpandIcon width={16} height={16} /> Expand all
          </button>
          <button
            type="button"
            onClick={() => setAll(false)}
            className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg text-xs font-medium text-muted hover:bg-raised hover:text-ink"
          >
            <CollapseIcon width={16} height={16} /> Collapse all
          </button>
        </div>
      )}
      <div ref={treeRef} className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-2 py-2">
        {q ? (
          <ul className="space-y-0.5">
            {jump && (
              <li>
                <Link
                  href={href({ work: jump.hit.item.work!, book: jump.hit.item.id, chapter: jump.chapter }, jump.verse)}
                  onClick={onNavigate}
                  className="flex min-h-11 items-center rounded-lg bg-accent-soft px-3 font-medium text-accent"
                >
                  Go to {chapterTitle(jump.hit.item, jump.chapter)}
                  {jump.verse ? `:${jump.verse}` : ""}
                </Link>
              </li>
            )}
            {hits.length === 0 && !jump && <li className="px-3 py-6 text-center text-sm text-faint">No matches</li>}
            {hits.map((h) => (
              <li key={`${h.religion.id}/${h.collection.id}/${h.item.id}`}>
                <ItemRow
                  item={h.item}
                  sub={`${h.religion.name} · ${h.collection.name}`}
                  open={isOpen(`b:${h.item.work}/${h.item.id}`)}
                  onToggle={() => toggle(`b:${h.item.work}/${h.item.id}`)}
                  current={ref}
                  href={href}
                  onNavigate={onNavigate}
                  activeRef={activeRef}
                />
              </li>
            ))}
          </ul>
        ) : (
          <ul className="space-y-0.5">
            {catalog.religions.map((r) => {
              const rid = `r:${r.id}`;
              const available = r.collections.some((c) => c.items.some((i) => i.status !== "coming-soon"));
              return (
                <li key={r.id}>
                  <TreeButton level={0} open={isOpen(rid)} onClick={() => toggle(rid)}>
                    <span className="font-semibold">{r.name}</span>
                    {!available && <Soon />}
                  </TreeButton>
                  {isOpen(rid) && (
                    <ul className="space-y-0.5">
                      {r.collections.map((c) => {
                        const cid = `c:${r.id}/${c.id}`;
                        // A collection with a single entry is shown as that entry directly.
                        if (c.items.length === 1)
                          return (
                            <li key={c.id} className="pl-3">
                              <ItemRow
                                item={{ ...c.items[0], name: c.name }}
                                open={isOpen(`b:${c.items[0].work}/${c.items[0].id}`)}
                                onToggle={() => toggle(`b:${c.items[0].work}/${c.items[0].id}`)}
                                current={ref}
                                href={href}
                                onNavigate={onNavigate}
                                activeRef={activeRef}
                              />
                            </li>
                          );
                        const soon = c.items.every((i) => i.status === "coming-soon");
                        return (
                          <li key={c.id} className="pl-3">
                            <TreeButton level={1} open={isOpen(cid)} onClick={() => toggle(cid)}>
                              <span className="font-medium">{c.name}</span>
                              {soon && <Soon />}
                            </TreeButton>
                            {isOpen(cid) && (
                              <ul className="space-y-0.5 pl-3">
                                {c.items.map((it) => (
                                  <li key={it.id}>
                                    <ItemRow
                                      item={it}
                                      open={isOpen(`b:${it.work}/${it.id}`)}
                                      onToggle={() => toggle(`b:${it.work}/${it.id}`)}
                                      current={ref}
                                      href={href}
                                      onNavigate={onNavigate}
                                      activeRef={activeRef}
                                    />
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </nav>
  );
}

function Soon() {
  return (
    <span className="ml-auto shrink-0 rounded-full border border-line px-2 py-0.5 text-[11px] font-medium text-faint">
      Coming soon
    </span>
  );
}

function TreeButton({
  open,
  onClick,
  children,
  level,
}: {
  open: boolean;
  onClick: () => void;
  children: React.ReactNode;
  level: number;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onClick}
      className={`flex min-h-11 w-full items-center gap-1.5 rounded-lg px-2 text-left hover:bg-raised ${
        level === 0 ? "text-[15px]" : "text-sm"
      }`}
    >
      {open ? (
        <ChevronDown width={16} height={16} className="shrink-0 text-faint" />
      ) : (
        <ChevronRight width={16} height={16} className="shrink-0 text-faint" />
      )}
      {children}
    </button>
  );
}

function ItemRow({
  item,
  sub,
  open,
  onToggle,
  current,
  href,
  onNavigate,
  activeRef,
}: {
  item: CatalogItem;
  sub?: string;
  open: boolean;
  onToggle: () => void;
  current: BookRef;
  href: (r: BookRef) => string;
  onNavigate?: () => void;
  activeRef: React.RefObject<HTMLAnchorElement | null>;
}) {
  if (item.status === "coming-soon" || !item.work || !item.chapters) {
    return (
      <div className="flex min-h-11 items-center gap-2 rounded-lg px-2 pl-7 text-sm text-faint" aria-disabled="true">
        <span className="min-w-0">
          <span className="block truncate">{item.name}</span>
          {sub && <span className="block truncate text-xs">{sub}</span>}
        </span>
        <Soon />
      </div>
    );
  }
  const isCurrentBook = current.work === item.work && current.book === item.id;
  return <BookRow item={item} sub={sub} open={open} onToggle={onToggle} current={current} href={href} onNavigate={onNavigate} activeRef={activeRef} isCurrentBook={isCurrentBook} />;
}

function BookRow({
  item,
  sub,
  open,
  onToggle,
  current,
  href,
  onNavigate,
  activeRef,
  isCurrentBook,
}: {
  item: CatalogItem;
  sub?: string;
  open: boolean;
  onToggle: () => void;
  current: BookRef;
  href: (r: BookRef) => string;
  onNavigate?: () => void;
  activeRef: React.RefObject<HTMLAnchorElement | null>;
  isCurrentBook: boolean;
}) {
  const { items } = useStudy();
  // Studied chapters of this book: chapter → time studied.
  const studied = new Map<number, number>();
  const prefix = `studied:${item.work}/${item.id}/`;
  for (const [id, it] of items) if (id.startsWith(prefix)) studied.set(it.chapter, it.createdAt);
  const chapters = item.chapters!;
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className={`flex min-h-11 w-full items-center gap-1.5 rounded-lg px-2 text-left text-sm hover:bg-raised ${
          isCurrentBook ? "font-semibold text-accent" : ""
        }`}
      >
        {open ? (
          <ChevronDown width={16} height={16} className="shrink-0 text-faint" />
        ) : (
          <ChevronRight width={16} height={16} className="shrink-0 text-faint" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate">{item.name}</span>
          {sub && <span className="block truncate text-xs font-normal text-faint">{sub}</span>}
        </span>
        {studied.size > 0 && (
          <span
            className="shrink-0 rounded-full bg-accent-soft px-1.5 text-[11px] font-medium tabular-nums text-accent"
            title={`${studied.size} of ${chapters} chapters studied`}
          >
            ✓ {studied.size === chapters ? "all" : studied.size}
          </span>
        )}
      </button>
      {open && (
        <div className="grid grid-cols-6 gap-1 py-1 pl-7 pr-1" role="list" aria-label={`${item.name} chapters`}>
          {Array.from({ length: chapters }, (_, i) => i + 1).map((n) => {
            const active = isCurrentBook && current.chapter === n;
            const done = studied.get(n);
            return (
              <Link
                key={n}
                role="listitem"
                ref={active ? activeRef : undefined}
                href={href({ work: item.work!, book: item.id, chapter: n })}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                aria-label={done ? `${n} (studied ${formatStamp(done)})` : undefined}
                title={done ? `Studied ${formatStamp(done)}` : undefined}
                className={`relative flex h-11 items-center justify-center rounded-md text-sm tabular-nums ${
                  active ? "bg-accent font-semibold text-accent-ink" : done ? "text-accent hover:bg-raised" : "hover:bg-raised"
                }`}
              >
                {n}
                {done && (
                  <span aria-hidden className={`absolute right-1 top-0.5 text-[10px] font-bold ${active ? "text-accent-ink" : "text-accent"}`}>
                    ✓
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
