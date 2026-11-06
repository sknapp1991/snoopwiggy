"use client";
/**
 * My Study: favorites, study later, highlights, notes and studied chapters (newest first),
 * each a link back to the verse. Backup / restore as a JSON file, since data lives on this device.
 */
import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { catalog, chapterTitle, DEFAULT_VERSIONS, findBook, readHref } from "@/lib/catalog";
import { fetchBook } from "@/lib/chapter-store";
import { downloadBackup, lastBackup } from "@/lib/backup";
import { formatStamp, highlightBg, HIGHLIGHTS, importJson, removeItem, useStudy, type StudyItem, type StudyKind } from "@/lib/study";
import { closePanel, toast } from "@/lib/ui-store";
import { CalendarIcon, CloseIcon, ClockIcon, NoteIcon, StarIcon, MarkerIcon, CheckSquareIcon } from "./icons";
import { PlansPanel } from "./plans-panel";
import { useReaderState } from "./use-reader-state";

const TABS: { kind: StudyKind; label: string; Icon: typeof StarIcon; empty: string }[] = [
  { kind: "favorite", label: "Favorites", Icon: StarIcon, empty: "Tap a verse number to add it to your favorites." },
  { kind: "later", label: "Study later", Icon: ClockIcon, empty: "Double-tap a verse number to save it for later." },
  { kind: "highlight", label: "Highlights", Icon: MarkerIcon, empty: "Tap a verse (or turn on highlight mode) to highlight it." },
  { kind: "note", label: "Notes", Icon: NoteIcon, empty: "Tap a verse and write a note." },
  { kind: "studied", label: "Studied", Icon: CheckSquareIcon, empty: "Tick “Mark as studied” at the end of a chapter." },
];

let lastTab: StudyKind = "favorite";
let lastPlans = false;
type Sort = "new" | "old" | "book";
let lastView: { religion: string | null; book: string | null; sort: Sort } = { religion: null, book: null, sort: "new" };

/** Reading order across the whole library (religion → collection → book), for "Book order". */
const ORDER = new Map<string, number>();
for (const rel of catalog.religions)
  for (const col of rel.collections) for (const it of col.items) if (!ORDER.has(`${it.work}/${it.id}`)) ORDER.set(`${it.work}/${it.id}`, ORDER.size);
const bookKey = (i: StudyItem) => `${i.work}/${i.book}`;
const religionOf = (i: StudyItem) => findBook(i.work, i.book)?.religion.name ?? "Other";
const bookName = (i: StudyItem) => findBook(i.work, i.book)?.name ?? i.book;

export function StudyPanel({ onNavigate }: { onNavigate?: () => void }) {
  const { items, ready } = useStudy();
  const [tab, setTab] = useState<StudyKind>(lastTab);
  const [plans, setPlans] = useState(lastPlans);
  const [color, setColor] = useState<string | null>(null);
  const [religion, setReligion] = useState<string | null>(lastView.religion);
  const [bookF, setBookF] = useState<string | null>(lastView.book);
  const [sort, setSort] = useState<Sort>(lastView.sort);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    lastTab = tab;
    lastPlans = plans;
    lastView = { religion, book: bookF, sort };
  }, [tab, plans, religion, bookF, sort]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const it of items.values()) c[it.kind] = (c[it.kind] ?? 0) + 1;
    return c;
  }, [items]);
  const inTab = useMemo(
    () => [...items.values()].filter((i) => i.kind === tab && (tab !== "highlight" || !color || i.color === color)),
    [items, tab, color],
  );
  // Religions and books present in this tab (for the filters), in library order.
  const religions = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of inTab) m.set(religionOf(i), (m.get(religionOf(i)) ?? 0) + 1);
    return [...m];
  }, [inTab]);
  const rel = religion && religions.some(([r]) => r === religion) ? religion : null;
  const books = useMemo(() => {
    const m = new Map<string, { name: string; n: number }>();
    for (const i of inTab)
      if (!rel || religionOf(i) === rel) {
        const k = bookKey(i);
        m.set(k, { name: bookName(i), n: (m.get(k)?.n ?? 0) + 1 });
      }
    return [...m].sort((a, b) => (ORDER.get(a[0]) ?? 1e9) - (ORDER.get(b[0]) ?? 1e9));
  }, [inTab, rel]);
  const bk = bookF && books.some(([k]) => k === bookF) ? bookF : null;
  const list = useMemo(() => {
    const l = inTab.filter((i) => (!rel || religionOf(i) === rel) && (!bk || bookKey(i) === bk));
    if (sort === "book")
      return l.sort(
        (a, b) =>
          (ORDER.get(bookKey(a)) ?? 1e9) - (ORDER.get(bookKey(b)) ?? 1e9) ||
          a.chapter - b.chapter ||
          (parseInt(a.verse ?? "0") || 0) - (parseInt(b.verse ?? "0") || 0),
      );
    return l.sort((a, b) => (sort === "old" ? a.updatedAt - b.updatedAt : b.updatedAt - a.updatedAt));
  }, [inTab, rel, bk, sort]);

  const download = () => downloadBackup();
  const last = lastBackup();
  const restore = async (f: File) => {
    try {
      const n = await importJson(await f.text());
      toast(`Restored ${n} item${n === 1 ? "" : "s"}`);
    } catch (e) {
      toast(`Couldn’t restore: ${(e as Error).message}`, 4000);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-line py-1 pl-4 pr-1">
        <h2 className="font-serif text-lg font-semibold">My Study</h2>
        <button type="button" onClick={closePanel} aria-label="Close My Study" className="flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:bg-raised">
          <CloseIcon />
        </button>
      </div>
      <div role="tablist" aria-label="My Study" className="flex gap-1 overflow-x-auto border-b border-line px-2 py-1.5">
        {TABS.map(({ kind, label, Icon }) => (
          <button
            key={kind}
            role="tab"
            type="button"
            aria-selected={!plans && tab === kind}
            onClick={() => {
              setTab(kind);
              setPlans(false);
            }}
            className={`flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm ${
              !plans && tab === kind ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-raised"
            }`}
          >
            <Icon width={16} height={16} />
            {label}
            {counts[kind] ? <span className="text-xs tabular-nums opacity-75">{counts[kind]}</span> : null}
          </button>
        ))}
        <button
          role="tab"
          type="button"
          aria-selected={plans}
          onClick={() => setPlans(true)}
          className={`flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm ${plans ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-raised"}`}
        >
          <CalendarIcon width={16} height={16} />
          Plans
        </button>
      </div>
      {!plans && tab === "highlight" && (counts.highlight ?? 0) > 0 && (
        <div className="flex items-center gap-1 px-3 pt-2" aria-label="Filter by colour">
          <button type="button" onClick={() => setColor(null)} className={`min-h-9 rounded-full px-3 text-xs ${!color ? "bg-raised font-medium" : "text-muted"}`}>
            All
          </button>
          {HIGHLIGHTS.map((h) => (
            <button
              key={h.id}
              type="button"
              aria-label={`${h.label} only`}
              aria-pressed={color === h.id}
              onClick={() => setColor(color === h.id ? null : h.id)}
              className={`flex h-9 w-9 items-center justify-center rounded-full border-2 ${color === h.id ? "border-ink" : "border-transparent"}`}
            >
              <span className="h-5 w-5 rounded-full" style={{ background: h.dot }} />
            </button>
          ))}
        </div>
      )}

      {!plans && inTab.length > 1 && (
        <div className="space-y-2 border-b border-line/70 px-3 py-2">
          {religions.length > 1 && (
            <div className="flex gap-1 overflow-x-auto" aria-label="Filter by tradition">
              <button type="button" onClick={() => setReligion(null)} className={`min-h-9 shrink-0 rounded-full px-3 text-xs ${!rel ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-raised"}`}>
                All
              </button>
              {religions.map(([r, n]) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={rel === r}
                  onClick={() => {
                    setReligion(rel === r ? null : r);
                    setBookF(null);
                  }}
                  className={`min-h-9 shrink-0 rounded-full px-3 text-xs ${rel === r ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-raised"}`}
                >
                  {r} <span className="tabular-nums opacity-70">{n}</span>
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <select
              value={bk ?? ""}
              onChange={(e) => setBookF(e.target.value || null)}
              aria-label="Filter by book"
              className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-raised px-2 text-sm"
            >
              <option value="">All books</option>
              {books.map(([k, b]) => (
                <option key={k} value={k}>
                  {b.name} ({b.n})
                </option>
              ))}
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort" className="h-9 rounded-lg border border-line bg-raised px-2 text-sm">
              <option value="new">Newest first</option>
              <option value="old">Oldest first</option>
              <option value="book">Book order</option>
            </select>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
        {plans ? (
          <PlansPanel onNavigate={onNavigate} />
        ) : !ready ? null : list.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-faint">{inTab.length ? "Nothing matches these filters." : TABS.find((t) => t.kind === tab)!.empty}</p>
        ) : (
          <ul className="divide-y divide-line/70">
            {list.map((it, i) => {
              const head = sort === "book" && (i === 0 || bookKey(list[i - 1]) !== bookKey(it));
              return (
                <Fragment key={it.id}>
                  {head && (
                    <li className="px-2 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-faint">
                      {religionOf(it)} · {bookName(it)}
                    </li>
                  )}
                  <Row item={it} onNavigate={onNavigate} />
                </Fragment>
              );
            })}
          </ul>
        )}
      </div>

      <div className="space-y-1 border-t border-line px-4 py-2 text-xs text-faint">
        <p>
          Saved on this device only; clearing the browser’s data erases it. A backup keeps it safe and moves it to another device.
          {last ? ` Last backup: ${new Date(last).toLocaleDateString()}.` : " No backup yet."}
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={download} className="min-h-10 flex-1 rounded-lg border border-line text-sm text-ink hover:border-faint">
            Back up
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} className="min-h-10 flex-1 rounded-lg border border-line text-sm text-ink hover:border-faint">
            Restore…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) restore(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>
    </div>
  );
}

function Row({ item, onNavigate }: { item: StudyItem; onNavigate?: () => void }) {
  const { versions, ref } = useReaderState();
  const book = findBook(item.work, item.book);
  const title = `${chapterTitle(book, item.chapter, item.book)}${item.verse ? `:${item.verse}` : ""}`;
  const vs = item.work === ref.work ? versions : (DEFAULT_VERSIONS[item.work] ?? []);
  const text = useVerseText(item, vs[0]);
  const bg = item.kind === "highlight" ? highlightBg(item.color) : undefined;
  return (
    <li className="group flex items-start gap-2 py-2.5 pl-2">
      <Link href={readHref(item, vs, item.verse)} onClick={onNavigate} className="min-w-0 flex-1 rounded-md">
        <span className="flex items-baseline justify-between gap-2">
          <span className="font-semibold text-accent">{title}</span>
          <span className="shrink-0 text-[11px] tabular-nums text-faint">{formatStamp(item.kind === "studied" ? item.createdAt : item.updatedAt)}</span>
        </span>
        {item.kind === "note" && <span className="mt-0.5 block whitespace-pre-line text-sm">{item.text}</span>}
        {item.verse && text && (
          <span className="mt-0.5 line-clamp-2 block rounded-sm font-serif text-sm text-muted" style={bg ? { background: bg } : undefined}>
            {text}
          </span>
        )}
        {item.kind === "studied" && <span className="mt-0.5 block text-sm text-muted">Chapter marked as studied</span>}
      </Link>
      <button
        type="button"
        onClick={() => removeItem(item.id)}
        aria-label={`Remove ${title}`}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-faint hover:bg-raised hover:text-ink"
      >
        <CloseIcon width={16} height={16} />
      </button>
    </li>
  );
}

/** Verse text for a list row, from the (cached) book file of the first version being read. */
function useVerseText(item: StudyItem, version?: string) {
  const [text, setText] = useState<{ key: string; t: string } | null>(null);
  const key = `${item.work}/${version}/${item.book}/${item.chapter}:${item.verse}`;
  useEffect(() => {
    if (!version || !item.verse) return;
    let live = true;
    fetchBook(item.work, version, item.book)
      .then((b) => {
        const t = b.chapters[String(item.chapter)]?.verses.find((v) => v.v === item.verse)?.t;
        if (live && t) setText({ key, t });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [key, item.work, item.book, item.chapter, item.verse, version]);
  return text?.key === key ? text.t : null;
}
