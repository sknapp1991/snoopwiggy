"use client";
/**
 * Audio read-along (v1): the browser's text-to-speech reads one column of the chapter, verse by verse,
 * and the verse being read is highlighted in every column. Choose the column (e.g. read English +
 * Spanish, listen in Spanish), speed and voice; optionally keep going into the next chapter.
 */
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type RefObject } from "react";
import type { AlignedRow } from "@/lib/align";
import { chapterTitle, findBook, readHref, type BookRef } from "@/lib/catalog";
import type { ChapterEntry } from "@/lib/chapter-store";
import { getLanguage } from "@/lib/languages";
import { getSettings, TTS_RATE_MAX, TTS_RATE_MIN, updateSettings, useSettings } from "@/lib/settings";
import {
  close,
  getSpeech,
  onWord,
  pause,
  pickVoice,
  play,
  setSpeech,
  speakable,
  useSpeechSupported,
  stop,
  useSpeech,
  useVoices,
  voicesFor,
  type SpeechItem,
} from "@/lib/speech";
import type { Version } from "@/lib/schema";
import { RAW_WORD } from "@/lib/search-text";
import { CloseIcon, GearIcon, HeadphonesIcon, NextIcon, PauseIcon, PlayIcon, PrevIcon } from "./icons";

type Col = { version: Version; entry: ChapterEntry };

function buildItems(rows: AlignedRow[], colIndex: number, lang: string): SpeechItem[] {
  const out: SpeechItem[] = [];
  for (const row of rows) {
    const cell = row.cells[colIndex];
    if (cell && !cell.cont && cell.t) out.push({ v: row.v, text: speakable(cell.t, lang) });
  }
  return out;
}
const findStart = (items: SpeechItem[], v: string) => {
  const i = items.findIndex((it) => it.v === v);
  return i >= 0 ? i : items.findIndex((it) => parseInt(it.v, 10) >= parseInt(v, 10));
};

export type ReadAlong = ReturnType<typeof useReadAlong>;

export function useReadAlong({
  cols,
  rows,
  bookRef,
  next,
  versions,
  scroller,
}: {
  cols: Col[];
  rows: AlignedRow[];
  bookRef: BookRef;
  next?: BookRef;
  versions: string[];
  scroller: RefObject<HTMLDivElement | null>;
}) {
  const speech = useSpeech();
  const settings = useSettings();
  const allVoices = useVoices();
  const router = useRouter();
  const supported = useSpeechSupported();

  const colIndex = Math.max(0, cols.findIndex((c) => c.version.id === speech.version));
  const col = cols[colIndex];
  const version = col?.version;
  const lang = version?.language ?? "en";
  const loaded = col?.entry.status === "ok";
  const chapterKey = `${bookRef.work}/${bookRef.book}/${bookRef.chapter}`;

  const items: SpeechItem[] = useMemo(() => (loaded ? buildItems(rows, colIndex, lang) : []), [rows, colIndex, lang, loaded]);

  const voice = useMemo(() => pickVoice(allVoices, lang, settings.ttsVoices[lang]), [allVoices, lang, settings.ttsVoices]);

  const onDone = () => {
    const s = getSettings();
    if (getSpeech().until) {
      setSpeech({ until: null }); // a verse range finished: stop here
      return;
    }
    if (s.ttsContinue && next) {
      setSpeech({ continuePending: true, status: "playing" });
      router.push(readHref(next, versions), { scroll: false });
    }
  };

  /** Items limited to the chosen verse range (if any). */
  const ranged = (list: SpeechItem[], until: string | null) => {
    if (!until) return list;
    const end = list.findIndex((it) => it.v === until);
    return end >= 0 ? list.slice(0, end + 1) : list;
  };

  const startAt = (
    index: number,
    overrides?: { rate?: number; voice?: SpeechSynthesisVoice | null; version?: string; until?: string | null },
  ) => {
    // Optionally read another column (e.g. the Spanish verse that was tapped).
    const targetId = overrides?.version ?? version?.id;
    const ci = cols.findIndex((c) => c.version.id === targetId);
    const tc = cols[ci];
    if (!tc || tc.entry.status !== "ok") return;
    const tl = tc.version.language;
    const list = ci === colIndex ? items : buildItems(rows, ci, tl);
    if (!list.length) return;
    const tv = ci === colIndex ? voice : pickVoice(allVoices, tl, getSettings().ttsVoices[tl]);
    const until = overrides && "until" in overrides ? overrides.until! : getSpeech().until;
    setSpeech({ until });
    play({
      items: ranged(list, until),
      start: index,
      lang: tl,
      voice: overrides && "voice" in overrides ? overrides.voice! : tv,
      rate: overrides?.rate ?? getSettings().ttsRate,
      version: tc.version.id,
      chapterKey,
      onDone,
      keepAwake: getSettings().ttsKeepAwake,
    });
  };

  /** Where to start: the paused verse, else the first verse on screen, else the top. */
  const startIndex = () => {
    if (speech.chapterKey === chapterKey && speech.verse) {
      const i = items.findIndex((it) => it.v === speech.verse);
      if (i >= 0) return i;
    }
    const sc = scroller.current;
    if (sc) {
      const top = sc.getBoundingClientRect().top + 48;
      for (const it of items) {
        const el = sc.querySelector(`[data-v="${CSS.escape(it.v)}"]`);
        if (el && el.getBoundingClientRect().bottom > top) return items.indexOf(it);
      }
    }
    return 0;
  };

  const index = speech.verse ? items.findIndex((it) => it.v === speech.verse) : -1;

  // Leaving the chapter by hand stops reading; finishing it (continuePending) starts the next one.
  useEffect(() => {
    if (speech.status === "idle" || !speech.chapterKey || speech.chapterKey === chapterKey) return;
    if (!speech.continuePending) stop();
  }, [chapterKey, speech.chapterKey, speech.status, speech.continuePending]);

  useEffect(() => {
    if (!speech.continuePending || speech.chapterKey === chapterKey || !items.length || !version) return;
    play({ items, start: 0, lang, voice, rate: getSettings().ttsRate, version: version.id, chapterKey, onDone, keepAwake: getSettings().ttsKeepAwake });
    // onDone is recreated each render; the latest one is captured here on purpose
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speech.continuePending, speech.chapterKey, chapterKey, items, version, lang, voice]);

  // Highlight the verse being read in every column and keep it on screen.
  const reading = speech.status !== "idle" && speech.chapterKey === chapterKey ? speech.verse : null;
  useEffect(() => {
    const sc = scroller.current;
    if (!sc || !reading) return;
    const els = sc.querySelectorAll(`[data-v="${CSS.escape(reading)}"]`);
    els.forEach((el) => el.classList.add("is-reading"));
    const first = els[0] as HTMLElement | undefined;
    if (first) {
      const r = first.getBoundingClientRect();
      const box = sc.getBoundingClientRect();
      // Visible area: below the sticky column headers, above the player bar (its height varies).
      const top = box.top + 48;
      const bottom = Math.min(box.bottom, document.querySelector('[aria-label="Read aloud"]')?.getBoundingClientRect().top ?? box.bottom) - 12;
      if (r.top < top || r.bottom > bottom) {
        const target = top + Math.max(0, (bottom - top - r.height) / 3);
        sc.scrollBy({ top: r.top - target, behavior: "smooth" });
      }
    }
    return () => els.forEach((el) => el.classList.remove("is-reading"));
  }, [reading, scroller, rows]);

  // Word-by-word: highlight the word being spoken in the column being read (CSS Custom Highlight API,
  // so no re-rendering). Only voices that report word boundaries drive this; others keep verse highlighting.
  const readingVersion = version?.id;
  useEffect(() => {
    const css = CSS as unknown as { highlights?: Map<string, unknown> };
    const HighlightCtor = (window as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight;
    if (!css.highlights || !HighlightCtor) return;
    const clear = () => css.highlights!.delete("reading-word");
    const off = onWord((w) => {
      const sc = scroller.current;
      if (!w || !sc || !readingVersion) return clear();
      const span = sc.querySelector(
        `[data-v="${CSS.escape(w.verse)}"] [data-ver="${CSS.escape(readingVersion)}"] [data-text]`,
      ) as HTMLElement | null;
      const node = span?.firstChild;
      if (!node || node.nodeType !== Node.TEXT_NODE) return clear();
      const m = [...(node.textContent ?? "").matchAll(RAW_WORD)][w.word];
      if (!m) return clear();
      const range = document.createRange();
      range.setStart(node, m.index!);
      range.setEnd(node, m.index! + m[0].length);
      css.highlights!.set("reading-word", new HighlightCtor(range));
    });
    return () => {
      off();
      clear();
    };
  }, [scroller, readingVersion]);

  return {
    speech,
    supported,
    cols,
    colIndex,
    version,
    lang,
    voice,
    allVoices,
    items,
    index,
    bookRef,
    ready: items.length > 0,
    toggle() {
      if (speech.status === "playing") pause();
      else startAt(startIndex());
    },
    step(d: number) {
      const i = Math.min(items.length - 1, Math.max(0, (index >= 0 ? index : startIndex()) + d));
      if (speech.status === "playing") startAt(i);
      else setSpeech({ verse: items[i]?.v ?? null, chapterKey, status: "paused" });
    },
    restart(overrides?: { rate?: number; voice?: SpeechSynthesisVoice | null }) {
      if (speech.status === "playing") startAt(index >= 0 ? index : 0, overrides);
    },
    /** Switch the column being read; stays on the same verse, paused (press play to continue). */
    setVersion(id: string) {
      const verse = speech.verse;
      stop();
      setSpeech({ version: id, verse, chapterKey, status: verse ? "paused" : "idle" });
    },
    /** Start reading at this verse (or the next one the column has), in `versionId`'s column if given. */
    readFrom(v: string, versionId?: string) {
      const ci = versionId ? cols.findIndex((c) => c.version.id === versionId) : colIndex;
      const tc = cols[ci];
      if (!tc || tc.entry.status !== "ok") return;
      const list = ci === colIndex ? items : buildItems(rows, ci, tc.version.language);
      const i = findStart(list, v);
      if (i < 0) return;
      startAt(i, { version: tc.version.id, until: null });
    },
    /** Play verses from–to (inclusive), then stop. */
    playRange(from: string, to: string) {
      const i = findStart(items, from);
      if (i >= 0) startAt(i, { until: to });
    },
    open() {
      setSpeech({ open: true, version: speech.version ?? cols[0]?.version.id ?? null });
      startAt(startIndex());
    },
    startAt,
  };
}

/** Headphones button in the chapter header. */
export function ListenButton({ ra }: { ra: ReadAlong }) {
  if (!ra.supported) return null;
  const on = ra.speech.open;
  return (
    <button
      type="button"
      onClick={() => (on ? close() : ra.open())}
      aria-pressed={on}
      aria-label={on ? "Stop listening" : "Listen to this chapter"}
      title={on ? "Stop listening" : "Listen (read aloud)"}
      className={`flex h-11 w-11 items-center justify-center rounded-lg border border-line ${
        on ? "bg-accent-soft text-accent" : "bg-raised text-muted hover:text-ink"
      }`}
    >
      <HeadphonesIcon />
    </button>
  );
}

const RATES = [0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];

/** Player bar along the bottom of the reader. */
export function ReadAlongBar({ ra }: { ra: ReadAlong }) {
  const [more, setMore] = useState(false);
  const [picker, setPicker] = useState(false);
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const settings = useSettings();
  const { speech, version, lang } = ra;
  if (!speech.open || !version) return null;
  const playing = speech.status === "playing";
  const book = findBook(ra.bookRef.work, ra.bookRef.book);
  const verse = ra.index >= 0 ? ra.items[ra.index]?.v : null;
  const { list: langVoices, fallback } = voicesFor(ra.allVoices, lang);
  const langName = getLanguage(lang).name;
  const noVoice = ra.allVoices.length > 0 && langVoices.length === 0;

  const btn = "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-raised hover:text-ink disabled:opacity-40";

  return (
    <div
      role="region"
      aria-label="Read aloud"
      data-no-swipe
      className="absolute inset-x-0 bottom-0 z-20 border-t border-line bg-panel/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgb(0_0_0/0.08)] backdrop-blur"
    >
      <div className="mx-auto flex max-w-3xl items-center gap-1 px-2 py-1.5">
        <button type="button" className={btn} onClick={() => ra.step(-1)} aria-label="Previous verse" disabled={!ra.ready}>
          <PrevIcon />
        </button>
        <button
          type="button"
          onClick={ra.toggle}
          disabled={!ra.ready}
          aria-label={playing ? "Pause" : "Play"}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink disabled:opacity-50"
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button type="button" className={btn} onClick={() => ra.step(1)} aria-label="Next verse" disabled={!ra.ready}>
          <NextIcon />
        </button>
        <button
          type="button"
          onClick={() => setPicker((p) => !p)}
          aria-expanded={picker}
          title="Choose a verse or a range of verses"
          className="min-w-0 flex-1 rounded-lg px-1 py-0.5 text-left leading-tight hover:bg-raised"
          aria-live="polite"
        >
          <p className="truncate text-sm font-semibold">
            {chapterTitle(book, ra.bookRef.chapter)}
            {verse ? `:${verse}` : ""}
            {speech.until ? `–${speech.until}` : ""} <span className="text-faint">▾</span>
          </p>
          <p className="truncate text-xs text-faint">
            {speech.continuePending ? "Next chapter…" : ra.ready ? `${version.abbr} · ${langName}` : "Loading…"}
            {settings.ttsRate !== 1 ? ` · ${settings.ttsRate}×` : ""}
          </p>
        </button>
        <button
          type="button"
          className={`${btn} ${more ? "bg-raised text-ink" : ""}`}
          onClick={() => setMore((m) => !m)}
          aria-expanded={more}
          aria-label="Read-aloud options"
        >
          <GearIcon />
        </button>
        <button type="button" className={btn} onClick={close} aria-label="Close player">
          <CloseIcon />
        </button>
      </div>

      {picker && ra.items.length > 0 && (
        <div className="mx-auto max-w-3xl space-y-2 px-4 pb-3 pt-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-faint">Play from verse</p>
          <div className="grid max-h-36 grid-cols-8 gap-1 overflow-y-auto sm:grid-cols-12">
            {ra.items.map((it) => (
              <button
                key={it.v}
                type="button"
                onClick={() => {
                  ra.readFrom(it.v, version.id);
                  setPicker(false);
                }}
                className={`h-10 rounded-md text-sm tabular-nums ${it.v === verse ? "bg-accent font-semibold text-accent-ink" : "bg-raised hover:bg-accent-soft"}`}
              >
                {it.v}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-faint">Range</span>
            <select
              aria-label="From verse"
              value={range?.from ?? ra.items[0].v}
              onChange={(e) => setRange({ from: e.target.value, to: range?.to ?? ra.items[ra.items.length - 1].v })}
              className="h-10 rounded-lg border border-line bg-raised px-2 tabular-nums"
            >
              {ra.items.map((it) => (
                <option key={it.v} value={it.v}>
                  {it.v}
                </option>
              ))}
            </select>
            <span className="text-faint">to</span>
            <select
              aria-label="To verse"
              value={range?.to ?? ra.items[ra.items.length - 1].v}
              onChange={(e) => setRange({ from: range?.from ?? ra.items[0].v, to: e.target.value })}
              className="h-10 rounded-lg border border-line bg-raised px-2 tabular-nums"
            >
              {ra.items.map((it) => (
                <option key={it.v} value={it.v}>
                  {it.v}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                const from = range?.from ?? ra.items[0].v;
                const to = range?.to ?? ra.items[ra.items.length - 1].v;
                const [a, b] = parseInt(from, 10) <= parseInt(to, 10) ? [from, to] : [to, from];
                ra.playRange(a, b);
                setPicker(false);
              }}
              className="flex h-10 items-center gap-1 rounded-lg bg-accent px-3 font-medium text-accent-ink"
            >
              <PlayIcon width={16} height={16} /> Play range
            </button>
            <button
              type="button"
              onClick={() => {
                ra.readFrom(ra.items[0].v, version.id);
                setPicker(false);
              }}
              className="h-10 rounded-lg border border-line px-3 hover:border-faint"
            >
              Whole chapter
            </button>
          </div>
        </div>
      )}

      {speech.wordTiming === false && !speech.error && langVoices.some((v) => v.localService) && !ra.voice?.localService && (
        <p className="mx-auto max-w-3xl px-4 pb-1.5 text-xs text-muted" role="status">
          This voice can’t follow along word by word. Voices installed on your device (e.g. “Microsoft …”) can — pick one under ⚙ Voice.
        </p>
      )}

      {(speech.error || noVoice || fallback) && (
        <p className="mx-auto max-w-3xl px-4 pb-1.5 text-xs text-muted" role="status">
          {speech.error ??
            (noVoice
              ? `No ${langName} voice on this device, so the browser will guess. Add one in your system’s text-to-speech settings.`
              : `No ${langName} voice on this device; using a ${getLanguage(fallback!).name} voice.`)}
        </p>
      )}

      {more && (
        <div className="mx-auto grid max-w-3xl grid-cols-1 gap-2 px-4 pb-3 pt-1 text-sm sm:grid-cols-2">
          <label className="flex min-h-11 items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-faint">Listen to</span>
            <select
              value={version.id}
              onChange={(e) => ra.setVersion(e.target.value)}
              className="h-10 min-w-0 max-w-[60%] rounded-lg border border-line bg-raised px-2"
            >
              {ra.cols.map((c) => (
                <option key={c.version.id} value={c.version.id}>
                  {c.version.abbr} — {getLanguage(c.version.language).name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-h-11 items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-faint">Speed</span>
            <select
              value={settings.ttsRate}
              onChange={(e) => {
                const rate = Math.min(TTS_RATE_MAX, Math.max(TTS_RATE_MIN, Number(e.target.value)));
                updateSettings({ ttsRate: rate });
                ra.restart({ rate });
              }}
              className="h-10 rounded-lg border border-line bg-raised px-2 tabular-nums"
            >
              {RATES.map((r) => (
                <option key={r} value={r}>
                  {r}×
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-h-11 items-center justify-between gap-2 sm:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-faint">Voice</span>
            <select
              value={ra.voice?.voiceURI ?? ""}
              disabled={!langVoices.length}
              onChange={(e) => {
                const v = langVoices.find((x) => x.voiceURI === e.target.value) ?? null;
                updateSettings({ ttsVoices: { ...settings.ttsVoices, [lang]: e.target.value } });
                ra.restart({ voice: v });
              }}
              className="h-10 min-w-0 max-w-[75%] rounded-lg border border-line bg-raised px-2"
            >
              {!langVoices.length && <option value="">Browser default</option>}
              {langVoices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang}){v.localService ? " · on device" : " · online"}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-h-11 cursor-pointer items-center justify-between gap-2 sm:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-faint">
              Keep screen on while listening
              <span className="block font-normal normal-case tracking-normal">
                Phones stop built-in voices when the screen locks; this keeps it awake (you can turn the brightness down).
              </span>
            </span>
            <input
              type="checkbox"
              checked={settings.ttsKeepAwake}
              onChange={(e) => updateSettings({ ttsKeepAwake: e.target.checked })}
              className="h-5 w-5 shrink-0 accent-[var(--accent)]"
            />
          </label>
          <label className="flex min-h-11 cursor-pointer items-center justify-between gap-2 sm:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-faint">Show the version I’m listening to first</span>
            <input
              type="checkbox"
              checked={settings.ttsListenFirst}
              onChange={(e) => updateSettings({ ttsListenFirst: e.target.checked })}
              className="h-5 w-5 shrink-0 accent-[var(--accent)]"
            />
          </label>
          <label className="flex min-h-11 cursor-pointer items-center justify-between gap-2 sm:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-faint">Continue into the next chapter</span>
            <input
              type="checkbox"
              checked={settings.ttsContinue}
              onChange={(e) => updateSettings({ ttsContinue: e.target.checked })}
              className="h-5 w-5 accent-[var(--accent)]"
            />
          </label>
        </div>
      )}
    </div>
  );
}

/** Space under the text so the player bar never covers the last verses. */
export function ReadAlongSpacer({ ra }: { ra: ReadAlong }) {
  return ra.speech.open ? <div className="h-[60vh]" aria-hidden /> : null;
}
