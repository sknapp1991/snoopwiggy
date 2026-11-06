"use client";
/**
 * Red-letter words of Jesus (toggle). Ranges come from public/redletter (scripts/build-redletter.ts);
 * only versions whose source marks the words of Jesus have them (KJV, WEB, French LSG).
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { updateSettings, useSettings } from "@/lib/settings";

type Ranges = Record<string, [number, number][]>; // "ch:v" → [start, end)
let index: Promise<Record<string, string[]>> | null = null;
const books = new Map<string, Promise<Ranges | null>>();

function load(version: string, book: string) {
  index ??= fetch("/redletter/index.json")
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));
  const k = `${version}/${book}`;
  if (!books.has(k))
    books.set(
      k,
      index.then((ix) =>
        ix[version]?.includes(book)
          ? fetch(`/redletter/${version}/${book}.json`)
              .then((r) => (r.ok ? (r.json() as Promise<Ranges>) : null))
              .catch(() => null)
          : null,
      ),
    );
  return books.get(k)!;
}

/** version id → its ranges for this book (only while the toggle is on, and only for the Bible). */
export function useRedLetter(work: string, book: string, versions: string[]) {
  const { redLetter } = useSettings();
  const on = redLetter && work === "bible";
  const key = `${book}|${versions.join(",")}`;
  const [got, setGot] = useState<{ key: string; map: Map<string, Ranges> } | null>(null);
  useEffect(() => {
    if (!on) return;
    let live = true;
    const [b, list] = key.split("|");
    Promise.all(list.split(",").map((v) => load(v, b).then((r) => [v, r] as const))).then((all) => {
      if (live) setGot({ key, map: new Map(all.filter((x): x is readonly [string, Ranges] => !!x[1])) });
    });
    return () => {
      live = false;
    };
  }, [on, key]);
  return on && got?.key === key ? got.map : EMPTY;
}

const EMPTY = new Map<string, Ranges>();
export const RedLetterCtx = createContext<Map<string, Ranges>>(EMPTY);

/** The verse text, with the words of Jesus in red when there are any. */
export function VerseWords({ t, version, chapter, v }: { t: string; version: string; chapter: number; v: string }): ReactNode {
  const r = useContext(RedLetterCtx).get(version)?.[`${chapter}:${v}`];
  if (!r?.length) return t;
  const out: ReactNode[] = [];
  let at = 0;
  r.forEach(([a, b], i) => {
    if (a > at) out.push(t.slice(at, a));
    out.push(
      <span key={i} className="red-letter">
        {t.slice(a, b)}
      </span>,
    );
    at = b;
  });
  if (at < t.length) out.push(t.slice(at));
  return out;
}

export function RedLetterToggle() {
  const { redLetter } = useSettings();
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-sm">
      <span>
        <span className="font-medium">Words of Jesus in red</span>
        <span className="block text-xs text-faint">KJV, WEB and the French Louis Segond mark them</span>
      </span>
      <input type="checkbox" checked={redLetter} onChange={(e) => updateSettings({ redLetter: e.target.checked })} className="h-5 w-5 accent-[var(--accent)]" />
    </label>
  );
}
