"use client";
/**
 * My Study: favorites, study later, highlights, notes and studied chapters (newest first),
 * each a link back to the verse. Backup / restore as a JSON file, since data lives on this device.
 */
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { chapterTitle, findBook, readHref } from "@/lib/catalog";
import { fetchBook } from "@/lib/chapter-store";
import { exportJson, formatStamp, highlightBg, HIGHLIGHTS, importJson, removeItem, useStudy, type StudyItem, type StudyKind } from "@/lib/study";
import { closePanel, toast } from "@/lib/ui-store";
import { CloseIcon, ClockIcon, NoteIcon, StarIcon, MarkerIcon, CheckSquareIcon } from "./icons";
import { useReaderState } from "./use-reader-state";

const TABS: { kind: StudyKind; label: string; Icon: typeof StarIcon; empty: string }[] = [
  { kind: "favorite", label: "Favorites", Icon: StarIcon, empty: "Tap a verse number to add it to your favorites." },
  { kind: "later", label: "Study later", Icon: ClockIcon, empty: "Double-tap a verse number to save it for later." },
  { kind: "highlight", label: "Highlights", Icon: MarkerIcon, empty: "Tap a verse (or turn on highlight mode) to highlight it." },
  { kind: "note", label: "Notes", Icon: NoteIcon, empty: "Tap a verse and write a note." },
  { kind: "studied", label: "Studied", Icon: CheckSquareIcon, empty: "Tick “Mark as studied” at the end of a chapter." },
];

let lastTab: StudyKind = "favorite";

export function StudyPanel({ onNavigate }: { onNavigate?: () => void }) {
  const { items, ready } = useStudy();
  const [tab, setTab] = useState<StudyKind>(lastTab);
  const [color, setColor] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    lastTab = tab;
  }, [tab]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const it of items.values()) c[it.kind] = (c[it.kind] ?? 0) + 1;
    return c;
  }, [items]);
  const list = useMemo(
    () =>
      [...items.values()]
        .filter((i) => i.kind === tab && (tab !== "highlight" || !color || i.color === color))
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [items, tab, color],
  );

  const download = () => {
    const blob = new Blob([exportJson()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `globalstudy-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
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
            aria-selected={tab === kind}
            onClick={() => setTab(kind)}
            className={`flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm ${
              tab === kind ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-raised"
            }`}
          >
            <Icon width={16} height={16} />
            {label}
            {counts[kind] ? <span className="text-xs tabular-nums opacity-75">{counts[kind]}</span> : null}
          </button>
        ))}
      </div>
      {tab === "highlight" && (counts.highlight ?? 0) > 0 && (
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

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
        {!ready ? null : list.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-faint">{TABS.find((t) => t.kind === tab)!.empty}</p>
        ) : (
          <ul className="divide-y divide-line/70">
            {list.map((it) => (
              <Row key={it.id} item={it} onNavigate={onNavigate} />
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-1 border-t border-line px-4 py-2 text-xs text-faint">
        <p>Saved on this device only. Make a backup to move it to another device.</p>
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
  const vs = item.work === ref.work ? versions : [];
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
