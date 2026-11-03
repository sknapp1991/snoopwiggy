"use client";
/**
 * Full-text search panel: right-hand panel on desktop, bottom sheet on phones.
 * Results are grouped religion → collection → book (collapsible, with counts); a book's verses load
 * when it is expanded, from the same cached book files the reader uses.
 */
import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { catalog, findBook, getVersion, readHref, type BookEntry } from "@/lib/catalog";
import { fetchBook, type BookFile } from "@/lib/chapter-store";
import { getLanguage } from "@/lib/languages";
import { markMatches, search, suggest, type SearchResult, type VerseHit } from "@/lib/search";
import { ChevronDown, ChevronRight, CloseIcon, SearchIcon } from "./icons";
import { useReaderState } from "./use-reader-state";
import { closePanel, openPanel } from "@/lib/ui-store";

/* ---------- open/close + state that survives closing the panel ---------- */

type UiState = {
  query: string;
  versions: string[] | null;
  nonce: number;
  /** Look up English words' equivalents in the other languages. */
  crossLanguage: boolean;
  /** Show every chosen version's text under each result (not only the ones that matched). */
  allVersions: boolean;
  /** Equivalents the user switched off ("version:word"). */
  exclude: string[];
};
let ui: UiState = { query: "", versions: null, nonce: 0, crossLanguage: true, allVersions: true, exclude: [] };
const subs = new Set<() => void>();
const setUi = (patch: Partial<UiState>) => {
  ui = { ...ui, ...patch };
  subs.forEach((l) => l());
};
const SERVER_UI: UiState = { query: "", versions: null, nonce: 0, crossLanguage: true, allVersions: true, exclude: [] };

export function useSearchUi() {
  return useSyncExternalStore(
    (l) => {
      subs.add(l);
      return () => subs.delete(l);
    },
    () => ui,
    () => SERVER_UI,
  );
}

/** Open the panel, optionally with a query and the versions to search in (e.g. from a double-clicked word). */
export function openSearch(query?: string, versions?: string[]) {
  setUi({
    ...(query !== undefined ? { query } : {}),
    ...(versions ? { versions } : {}),
    nonce: ui.nonce + 1,
  });
  openPanel("search");
}
export const closeSearch = closePanel;

/* ---------- panel ---------- */

const PAGE = 40;

export function SearchPanel({ onNavigate }: { onNavigate?: () => void }) {
  const state = useSearchUi();
  const { versions: readerVersions, ref } = useReaderState();
  const selected = state.versions ?? readerVersions;
  const [input, setInput] = useState(state.query);
  // Results are stored with the query they belong to, so stale ones are simply ignored.
  const [found, setFound] = useState<{ key: string; result?: SearchResult; error?: string } | null>(null);
  const [suggested, setSuggested] = useState<{ key: string; list: { word: string; count: number }[] } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // A new openSearch("word") replaces the input text.
  const [nonce, setNonce] = useState(state.nonce);
  if (nonce !== state.nonce) {
    setNonce(state.nonce);
    setInput(state.query);
  }

  useEffect(() => {
    inputRef.current?.focus();
  }, [state.nonce]);

  const query = input.trim();
  const versionKey = selected.join(",");
  useEffect(() => {
    setUi({ query: input });
  }, [input]);

  // Debounced search.
  const excludeKey = state.exclude.join(",");
  const searchKey = query ? `${query}|${versionKey}|${state.crossLanguage}|${excludeKey}` : "";
  useEffect(() => {
    if (!searchKey) return;
    let live = true;
    const t = setTimeout(() => {
      search(query, versionKey.split(","), {
        crossLanguage: state.crossLanguage,
        languageOf: (v) => getVersion(v)?.language ?? "en",
        exclude: new Set(excludeKey ? excludeKey.split(",") : []),
      })
        .then((result) => live && setFound({ key: searchKey, result }))
        .catch((e: Error) => live && setFound({ key: searchKey, error: e.message }));
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [searchKey, query, versionKey, state.crossLanguage, excludeKey]);
  const current = found?.key === searchKey ? found : null;
  // Keep showing the previous results while the next search runs (less flicker while typing).
  const result = current?.result ?? (searchKey ? found?.result ?? null : null);
  const error = current?.error ?? null;
  const busy = !!searchKey && !current;

  // Completions for the word being typed (from the first selected versions).
  const lastWord = /([\p{L}\p{M}\p{N}]+)$/u.exec(input)?.[1] ?? "";
  const suggestKey = lastWord && !input.endsWith("*") ? `${lastWord}|${versionKey}` : "";
  useEffect(() => {
    if (!suggestKey) return;
    let live = true;
    const t = setTimeout(() => {
      Promise.all(versionKey.split(",").slice(0, 3).map((v) => suggest(lastWord, v)))
        .then((lists) => {
          if (!live) return;
          const merged = new Map<string, number>();
          lists.flat().forEach(({ word, count }) => merged.set(word, (merged.get(word) ?? 0) + count));
          const list = [...merged.entries()]
            .map(([word, count]) => ({ word, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 8);
          setSuggested({ key: suggestKey, list });
        })
        .catch(() => live && setSuggested({ key: suggestKey, list: [] }));
    }, 150);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [suggestKey, lastWord, versionKey]);
  const suggestions = suggestKey && suggested?.key === suggestKey ? suggested.list : [];

  const applySuggestion = (w: string) => {
    setInput(input.slice(0, input.length - lastWord.length) + w);
    inputRef.current?.focus();
  };

  const work = getVersion(selected[0])?.work ?? ref.work;
  const tree = useMemo(() => (result ? groupHits(work, result.hits) : []), [result, work]);
  const total = result?.hits.length ?? 0;
  const showSuggestions = suggestions.length > 0 && !(suggestions.length === 1 && suggestions[0].word === lastWord.toLowerCase());

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 border-b border-line p-3">
        <div className="flex items-center gap-1">
          <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-raised px-3 focus-within:ring-2 focus-within:ring-accent/50">
            <SearchIcon className="shrink-0 text-faint" width={18} height={18} />
            <span className="sr-only">Search the text</span>
            <input
              ref={inputRef}
              type="search"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Search words, e.g. darkness or dark*"
              enterKeyHint="search"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-faint md:text-sm"
            />
          </label>
          <button
            type="button"
            onClick={closeSearch}
            aria-label="Close search"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-raised"
          >
            <CloseIcon />
          </button>
        </div>
        <VersionFilter work={work} selected={selected} perVersion={result?.perVersion} />
        <div className="flex flex-wrap gap-1">
          <Toggle on={state.crossLanguage} onChange={(v) => setUi({ crossLanguage: v })} title="Find the same word in the other languages (e.g. sacrifice → sacrificio)">
            🌐 Same word in other languages
          </Toggle>
          <Toggle on={state.allVersions} onChange={(v) => setUi({ allVersions: v })} title="Show every chosen version's text in the results">
            Show all versions
          </Toggle>
        </div>
        {showSuggestions && (
          <div className="flex flex-wrap gap-1" aria-label="Word suggestions">
            {suggestions.map((s) => (
              <button
                key={s.word}
                type="button"
                onClick={() => applySuggestion(s.word)}
                className="min-h-9 rounded-full border border-line px-2.5 text-xs hover:border-faint"
              >
                {s.word} <span className="tabular-nums text-faint">{s.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2" aria-live="polite" aria-busy={busy}>
        {!query && <Help />}
        {query && error && <p className="px-3 py-6 text-center text-sm text-red-700 dark:text-red-400">{error}</p>}
        {query && !error && result && (
          <>
            <p className="px-2 pb-2 text-sm text-muted">
              {busy ? "Searching… " : ""}
              <span className="font-semibold text-ink tabular-nums">{total.toLocaleString()}</span>{" "}
              {total === 1 ? "verse" : "verses"}
              {result.terms.some((t) => t.prefix) && result.forms.length > 0 && (
                <span className="block text-xs text-faint">
                  Matching: {result.forms.slice(0, 12).join(", ")}
                  {result.forms.length > 12 ? ` +${result.forms.length - 12} more` : ""}
                </span>
              )}
            </p>
            {Object.keys(result.equivalents).length > 0 && (
              <div className="space-y-1 px-2 pb-2">
                {Object.entries(result.equivalents).map(([vid, list]) => (
                  <p key={vid} className="flex flex-wrap items-center gap-1 text-xs text-muted">
                    <span className="font-semibold">{getVersion(vid)?.abbr}</span> also searched:
                    {list.map((w) => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => setUi({ exclude: [...state.exclude, `${vid}:${w}`] })}
                        title="Not a good match? Tap to leave it out"
                        dir="auto"
                        className="inline-flex min-h-7 items-center gap-1 rounded-full border border-line px-2 hover:border-faint"
                      >
                        {w} <CloseIcon width={10} height={10} />
                      </button>
                    ))}
                  </p>
                ))}
              </div>
            )}
            {state.exclude.length > 0 && (
              <button type="button" onClick={() => setUi({ exclude: [] })} className="mx-2 mb-2 text-xs text-accent hover:underline">
                Restore {state.exclude.length} removed word{state.exclude.length === 1 ? "" : "s"}
              </button>
            )}
            {total === 0 && (
              <p className="px-3 py-6 text-center text-sm text-faint">
                No verses contain {result.terms.length > 1 ? "all of these words" : "this word"} in the chosen versions. Try a
                trailing * (e.g. <em>{result.terms[0]?.word}*</em>) or another version.
              </p>
            )}
            <ResultTree
              tree={tree}
              result={result}
              shown={state.allVersions ? selected : null}
              total={total}
              readerVersions={readerVersions}
              onNavigate={onNavigate}
            />
          </>
        )}
        {query && !result && !error && <p className="px-3 py-6 text-center text-sm text-faint">Searching…</p>}
      </div>
    </div>
  );
}

function Toggle({ on, onChange, title, children }: { on: boolean; onChange: (v: boolean) => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      title={title}
      onClick={() => onChange(!on)}
      className={`min-h-9 rounded-full border px-2.5 text-xs ${on ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:border-faint"}`}
    >
      {on ? "✓ " : ""}
      {children}
    </button>
  );
}

function Help() {
  return (
    <div className="space-y-2 px-3 py-4 text-sm text-muted">
      <p>Search every word of the chosen versions.</p>
      <ul className="list-disc space-y-1 pl-5 text-faint">
        <li>
          Several words find verses with <em>all</em> of them: <em>light darkness</em>
        </li>
        <li>
          End a word with * to match its beginning: <em>bless*</em>
        </li>
        <li>Case and accents don’t matter (Greek, Hebrew and Arabic vowel marks are ignored).</li>
        <li>Double-click a word while reading to search for it.</li>
      </ul>
    </div>
  );
}

function VersionFilter({ work, selected, perVersion }: { work: string; selected: string[]; perVersion?: Record<string, number> }) {
  const all = catalog.versions.filter((v) => v.work === work);
  const toggle = (id: string) => {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    if (next.length) setUi({ versions: next });
  };
  // Close the version list when clicking anywhere else.
  const details = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const d = details.current;
      if (d?.open && !d.contains(e.target as Node)) d.open = false;
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);
  const byLang = new Map<string, typeof all>();
  all.forEach((v) => (byLang.get(v.language) ?? byLang.set(v.language, []).get(v.language)!).push(v));
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1">
        <span className="pr-1 text-xs text-faint">In:</span>
        {selected.map((id) => {
          const v = getVersion(id);
          if (!v) return null;
          return (
            <button
              key={id}
              type="button"
              onClick={() => toggle(id)}
              aria-label={`Stop searching ${v.abbr}`}
              title={`${v.name} — tap to remove`}
              className="flex min-h-9 items-center gap-1 rounded-full bg-accent-soft px-2.5 text-xs font-medium text-accent"
            >
              {v.abbr}
              {perVersion && <span className="tabular-nums opacity-75">{perVersion[id] ?? 0}</span>}
              {selected.length > 1 && <CloseIcon width={12} height={12} />}
            </button>
          );
        })}
        <details ref={details} className="group relative">
          <summary className="flex min-h-9 cursor-pointer list-none items-center rounded-full border border-line px-2.5 text-xs text-muted hover:border-faint">
            + Versions
          </summary>
          <div className="absolute left-0 z-20 mt-1 max-h-72 w-64 overflow-y-auto rounded-xl border border-line bg-panel p-2 shadow-xl">
            {[...byLang.entries()].map(([lang, list]) => (
              <div key={lang} className="py-1">
                <p className="px-2 text-[11px] font-semibold uppercase tracking-wide text-faint">{getLanguage(lang).name}</p>
                {list.map((v) => (
                  <label key={v.id} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm hover:bg-raised">
                    <input
                      type="checkbox"
                      checked={selected.includes(v.id)}
                      onChange={() => toggle(v.id)}
                      className="h-4 w-4 accent-[var(--accent)]"
                    />
                    <span className="shrink-0 whitespace-nowrap font-medium">{v.abbr}</span>
                    <span className="truncate text-faint">{v.name}</span>
                  </label>
                ))}
              </div>
            ))}
          </div>
        </details>
      </div>
    </div>
  );
}

/* ---------- grouping ---------- */

type BookGroup = { entry: BookEntry; hits: VerseHit[] };
type CollGroup = { id: string; name: string; books: BookGroup[]; count: number };
type RelGroup = { id: string; name: string; collections: CollGroup[]; count: number };

const verseNum = (v: string) => parseInt(v, 10);

function groupHits(work: string, hits: VerseHit[]): RelGroup[] {
  const byBook = new Map<string, VerseHit[]>();
  for (const h of hits) (byBook.get(h.book) ?? byBook.set(h.book, []).get(h.book)!).push(h);
  const rels: RelGroup[] = [];
  for (const r of catalog.religions) {
    const rel: RelGroup = { id: r.id, name: r.name, collections: [], count: 0 };
    for (const c of r.collections) {
      const coll: CollGroup = { id: `${r.id}/${c.id}`, name: c.name, books: [], count: 0 };
      for (const it of c.items) {
        if (it.work !== work) continue;
        const list = byBook.get(it.id);
        const entry = findBook(work, it.id);
        if (!list || !entry) continue;
        list.sort((a, b) => a.chapter - b.chapter || verseNum(a.v) - verseNum(b.v) || a.v.localeCompare(b.v));
        coll.books.push({ entry, hits: list });
        coll.count += list.length;
      }
      if (coll.books.length) {
        rel.collections.push(coll);
        rel.count += coll.count;
      }
    }
    if (rel.collections.length) rels.push(rel);
  }
  return rels;
}

function ResultTree({
  tree,
  result,
  shown,
  total,
  readerVersions,
  onNavigate,
}: {
  tree: RelGroup[];
  result: SearchResult;
  /** All versions to show under each verse (null = only the ones that matched). */
  shown: string[] | null;
  total: number;
  readerVersions: string[];
  onNavigate?: () => void;
}) {
  // Few results: open every book. Many: books start closed (counts only).
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [prevTree, setPrevTree] = useState(tree);
  if (prevTree !== tree) {
    setPrevTree(tree);
    setToggled({});
  }
  const isOpen = (id: string, dflt: boolean) => toggled[id] ?? dflt;
  const toggle = (id: string, dflt: boolean) => setToggled((t) => ({ ...t, [id]: !isOpen(id, dflt) }));
  const openBooks = total <= 25;

  return (
    <ul className="space-y-0.5">
      {tree.map((r) => (
        <li key={r.id}>
          <GroupButton open={isOpen(`r:${r.id}`, true)} onClick={() => toggle(`r:${r.id}`, true)} count={r.count} level={0}>
            {r.name}
          </GroupButton>
          {isOpen(`r:${r.id}`, true) && (
            <ul className="space-y-0.5 pl-3">
              {r.collections.map((c) => (
                <li key={c.id}>
                  <GroupButton open={isOpen(`c:${c.id}`, true)} onClick={() => toggle(`c:${c.id}`, true)} count={c.count} level={1}>
                    {c.name}
                  </GroupButton>
                  {isOpen(`c:${c.id}`, true) && (
                    <ul className="space-y-0.5 pl-3">
                      {c.books.map((b) => {
                        const id = `b:${b.entry.id}`;
                        const open = isOpen(id, openBooks);
                        return (
                          <li key={b.entry.id}>
                            <GroupButton open={open} onClick={() => toggle(id, openBooks)} count={b.hits.length} level={2}>
                              {b.entry.name}
                            </GroupButton>
                            {open && <BookHits group={b} result={result} showVersions={shown} readerVersions={readerVersions} onNavigate={onNavigate} />}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

function GroupButton({
  open,
  onClick,
  count,
  level,
  children,
}: {
  open: boolean;
  onClick: () => void;
  count: number;
  level: number;
  children: React.ReactNode;
}) {
  const Icon = open ? ChevronDown : ChevronRight;
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onClick}
      className={`flex min-h-11 w-full items-center gap-1.5 rounded-lg px-2 text-left hover:bg-raised ${
        level === 0 ? "text-[15px] font-semibold" : level === 1 ? "text-sm font-medium" : "text-sm"
      }`}
    >
      <Icon width={16} height={16} className="shrink-0 text-faint" />
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <span className="shrink-0 rounded-full bg-raised px-2 text-xs tabular-nums text-muted">{count.toLocaleString()}</span>
    </button>
  );
}

function BookHits({
  group,
  result,
  showVersions,
  readerVersions,
  onNavigate,
}: {
  group: BookGroup;
  result: SearchResult;
  showVersions: string[] | null;
  readerVersions: string[];
  onNavigate?: () => void;
}) {
  const [shown, setShown] = useState(PAGE);
  const [files, setFiles] = useState<Record<string, BookFile | "error">>({});
  const { entry, hits } = group;
  const visible = hits.slice(0, shown);
  const linesFor = (h: VerseHit) => showVersions ?? h.versions;
  const needed = [...new Set(visible.flatMap(linesFor))].join(",");

  useEffect(() => {
    let live = true;
    for (const v of needed.split(",").filter(Boolean))
      fetchBook(entry.work!, v, entry.id)
        .then((f) => live && setFiles((s) => ({ ...s, [v]: f })))
        .catch(() => live && setFiles((s) => ({ ...s, [v]: "error" })));
    return () => {
      live = false;
    };
  }, [needed, entry.work, entry.id]);

  // Link with the versions being read, plus any matched version not among them.
  const linkVersions = (h: VerseHit) => [...readerVersions, ...h.versions.filter((v) => !readerVersions.includes(v))];

  return (
    <div className="pb-2 pl-6 pr-1">
      <ol className="divide-y divide-line/60">
        {visible.map((h) => (
          <li key={`${h.chapter}:${h.v}`} className="py-2">
            <Link
              href={readHref({ work: entry.work!, book: entry.id, chapter: h.chapter }, linkVersions(h), h.v)}
              onClick={onNavigate}
              className="inline-flex min-h-8 items-center text-sm font-semibold text-accent hover:underline"
            >
              {entry.chapterName ?? entry.name} {h.chapter}:{h.v}
            </Link>
            <div className="space-y-1">
              {linesFor(h).map((vid) => {
                const v = getVersion(vid)!;
                const file = files[vid];
                const matched = h.versions.includes(vid);
                const terms = result.termsByVersion[vid] ?? result.terms;
                const verse = file && file !== "error" ? file.chapters[String(h.chapter)]?.verses.find((x) => x.v === h.v) : undefined;
                return (
                  <p key={vid} dir={v.dir} lang={v.language} className={`text-sm leading-relaxed ${matched ? "" : "text-muted"}`}>
                    {linesFor(h).length > 1 && (
                      <span dir="auto" className="mx-1.5 ms-0 text-[11px] font-semibold text-faint">
                        {v.abbr}
                      </span>
                    )}
                    {file === "error" ? (
                      <span className="text-faint">Couldn’t load text.</span>
                    ) : verse ? (
                      <span className="font-serif">
                        {markMatches(verse.t, terms).map((p, i) =>
                          p.hit ? (
                            <mark key={i} className="rounded-sm bg-accent-soft px-0.5 font-semibold text-accent">
                              {p.text}
                            </mark>
                          ) : (
                            <Fragment key={i}>{p.text}</Fragment>
                          ),
                        )}
                      </span>
                    ) : (
                      <span className="block h-4 w-3/4 animate-pulse rounded bg-line/70" aria-hidden />
                    )}
                  </p>
                );
              })}
            </div>
          </li>
        ))}
      </ol>
      {hits.length > shown && (
        <button
          type="button"
          onClick={() => setShown((n) => n + PAGE)}
          className="mt-1 min-h-11 w-full rounded-lg text-sm font-medium text-accent hover:bg-raised"
        >
          Show more ({(hits.length - shown).toLocaleString()} left)
        </button>
      )}
    </div>
  );
}
