"use client";
/**
 * Audio read-along (v1): the browser's text-to-speech reads one column of the chapter, verse by verse,
 * and the verse being read is highlighted in every column. Choose the column (e.g. read English +
 * Spanish, listen in Spanish), speed and voice; optionally keep going into the next chapter.
 */
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { AlignedRow } from "@/lib/align";
import { chapterTitle, findBook, readHref, type BookRef } from "@/lib/catalog";
import type { ChapterEntry } from "@/lib/chapter-store";
import { getLanguage } from "@/lib/languages";
import { getSettings, TTS_RATE_MAX, TTS_RATE_MIN, updateSettings, useSettings } from "@/lib/settings";
import {
  close,
  getSpeech,
  loadTiming,
  playRecording,
  resumeRecording,
  seekRecording,
  setRecordingRate,
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
import { audioUrl, getRecordings, hasChapter, timingUrl, useRecordings, type Recording } from "@/lib/recordings";
import { adjacentChapters } from "@/lib/catalog";
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
  const allRecordings = useRecordings();

  const colIndex = Math.max(0, cols.findIndex((c) => c.version.id === speech.version));
  const col = cols[colIndex];
  const version = col?.version;
  const lang = version?.language ?? "en";
  const loaded = col?.entry.status === "ok";
  const chapterKey = `${bookRef.work}/${bookRef.book}/${bookRef.chapter}`;

  const single: SpeechItem[] = useMemo(() => (loaded ? buildItems(rows, colIndex, lang) : []), [rows, colIndex, lang, loaded]);

  const voice = useMemo(() => pickVoice(allVoices, lang, settings.ttsVoices[lang]), [allVoices, lang, settings.ttsVoices]);

  // Several versions in turn (e.g. WEB then RVR): every verse in each chosen version, or each whole
  // chapter in turn. Device voices only (a recording is one file per chapter).
  const mixIds = cols.filter((c) => settings.ttsMix.includes(c.version.id)).map((c) => c.version.id);
  const mixed = mixIds.length >= 2;
  const mixReady = mixed && mixIds.every((id) => cols.find((c) => c.version.id === id)?.entry.status === "ok");
  const mixKey = mixIds.join(",");
  const mixItems: SpeechItem[] = useMemo(() => {
    if (!mixReady) return [];
    const per = mixKey.split(",").map((id) => {
      const ci = cols.findIndex((c) => c.version.id === id);
      const l = cols[ci].version.language;
      const vo = pickVoice(allVoices, l, settings.ttsVoices[l]);
      return buildItems(rows, ci, l).map((it) => ({ ...it, lang: l, voice: vo, version: id }));
    });
    if (settings.ttsMixOrder === "chapter") return per.flat();
    const byVerse = new Map<string, SpeechItem[]>();
    for (const list of per) for (const it of list) byVerse.set(it.v, [...(byVerse.get(it.v) ?? []), it]);
    return rows.flatMap((r) => byVerse.get(r.v) ?? []);
    // cols is rebuilt every render; mixKey + mixReady + rows cover what matters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mixReady, mixKey, rows, allVoices, settings.ttsVoices, settings.ttsMixOrder]);
  const items = mixed ? mixItems : single;

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

  /** The recording to use for a version in this chapter (saved choice, else the first one), or null = device voice. */
  const recordingFor = (versionId: string, book = bookRef.book, chapter = bookRef.chapter): Recording | null => {
    const choice = getSettings().ttsRecorded[versionId];
    if (choice === "device") return null;
    const mine = getRecordings().filter((x) => x.version === versionId);
    const r = mine.find((x) => x.id === choice) ?? mine[0];
    return r && hasChapter(r, book, chapter) ? r : null;
  };

  /** Items limited to the chosen verse range (if any). */
  const ranged = (list: SpeechItem[], until: string | null) => {
    if (!until) return list;
    let end = list.length - 1; // last item of that verse (several versions can read it)
    while (end >= 0 && list[end].v !== until) end--;
    return end >= 0 ? list.slice(0, end + 1) : list;
  };

  const startAt = (
    index: number,
    overrides?: { rate?: number; voice?: SpeechSynthesisVoice | null; version?: string; until?: string | null },
  ) => {
    // Several versions in turn: one queue with each item's own language and voice.
    if (mixed && (!overrides?.version || mixIds.includes(overrides.version))) {
      if (!mixItems.length || !version) return;
      const until = overrides && "until" in overrides ? overrides.until! : getSpeech().until;
      setSpeech({ until });
      play({
        items: ranged(mixItems, until),
        start: index,
        lang,
        voice: null,
        rate: overrides?.rate ?? getSettings().ttsRate,
        version: version.id,
        chapterKey,
        onDone,
        keepAwake: getSettings().ttsKeepAwake,
      });
      return;
    }
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
    const playDevice = () =>
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
    const rec = overrides && "voice" in overrides ? null : recordingFor(tc.version.id);
    if (rec) {
      const s0 = getSettings();
      const title = chapterTitle(findBook(bookRef.work, bookRef.book), bookRef.chapter);
      void playRecording({
        url: audioUrl(rec, bookRef.book, bookRef.chapter),
        timingUrl: timingUrl(rec, bookRef.book, bookRef.chapter),
        startVerse: list[index]?.v ?? null,
        rate: overrides?.rate ?? s0.ttsRate,
        version: tc.version.id,
        chapterKey,
        until,
        title,
        artist: `${tc.version.abbr} · ${rec.label}`,
        onDone,
        // Screen off: go straight into the next chapter's recording, then move the page along.
        getNext: async () => {
          if (!getSettings().ttsContinue) return null;
          let at: BookRef | undefined = bookRef;
          for (let hop = 0; hop < 1 && at; hop++) at = adjacentChapters(at).next;
          if (!at || !hasChapter(rec, at.book, at.chapter)) return null;
          const timing = await loadTiming(timingUrl(rec, at.book, at.chapter));
          return {
            url: audioUrl(rec, at.book, at.chapter),
            timing,
            chapterKey: `${at.work}/${at.book}/${at.chapter}`,
            title: chapterTitle(findBook(at.work, at.book), at.chapter),
          };
        },
        onAdvance: () => {
          setSpeech({ continuePending: true });
          if (next) router.push(readHref(next, versions), { scroll: false });
        },
      }).then((ok) => {
        if (!ok) playDevice();
      });
      return;
    }
    playDevice();
  };

  // Changing which versions are read in turn while playing: carry on from the same verse once the
  // new queue is built (next render).
  const restartRef = useRef<string | null>(null);
  const restartSoon = () => {
    restartRef.current = getSpeech().verse;
  };
  useEffect(() => {
    const v = restartRef.current;
    if (!v || !items.length) return;
    restartRef.current = null;
    const i = findStart(items, v);
    startAt(i >= 0 ? i : 0, { until: null });
    // startAt is recreated every render; only a new queue should trigger this
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

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

  // A recording moved on by itself (screen off): once the page shows that chapter, we're in step again.
  useEffect(() => {
    if (speech.engine === "recorded" && speech.continuePending && speech.chapterKey === chapterKey) setSpeech({ continuePending: false });
  }, [speech.engine, speech.continuePending, speech.chapterKey, chapterKey]);

  useEffect(() => {
    if (speech.engine === "recorded") return;
    if (!speech.continuePending || speech.chapterKey === chapterKey || !items.length || !version) return;
    play({ items, start: 0, lang, voice, rate: getSettings().ttsRate, version: version.id, chapterKey, onDone, keepAwake: getSettings().ttsKeepAwake });
    // onDone is recreated each render; the latest one is captured here on purpose
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speech.continuePending, speech.chapterKey, speech.engine, chapterKey, items, version, lang, voice]);

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
  const readingVersion = speech.speaking ?? version?.id;
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
      const text = node.textContent ?? "";
      const all = [...text.matchAll(RAW_WORD)];
      let m: RegExpExecArray | RegExpMatchArray | undefined;
      if (w.word !== undefined) m = all[w.word];
      else if (w.frac !== undefined) {
        // Recordings only know how far through the verse they are: pick the word at that share of the text.
        const at = w.frac * text.length;
        // (no Array.findLast: it needs Safari 15.4+)
        let i = all.length - 1;
        while (i > 0 && all[i].index! > at) i--;
        m = all[i] ?? all[0];
      }
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
    /** One entry per verse (for the verse picker), whatever is being read. */
    verseList: single,
    mixMode: settings.ttsMix.length > 0,
    mixed,
    mixIds,
    /** Turn "several versions" on (starting with the one being read) or off. */
    setMixMode(on: boolean) {
      updateSettings({ ttsMix: on && version ? [version.id] : [] });
      if (getSpeech().status === "playing") restartSoon();
    },
    /** Add / remove a version from those read in turn. */
    toggleMix(id: string) {
      const cur = getSettings().ttsMix.filter((x) => cols.some((c) => c.version.id === x));
      const nextMix = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      updateSettings({ ttsMix: nextMix.length ? nextMix : [id] });
      if (getSpeech().status === "playing") restartSoon();
    },
    setMixOrder(order: "verse" | "chapter") {
      updateSettings({ ttsMixOrder: order });
      if (getSpeech().status === "playing") restartSoon();
    },
    toggle() {
      const s = getSpeech();
      if (s.status === "playing") pause();
      else if (s.engine === "recorded" && s.status === "paused" && s.chapterKey === chapterKey && resumeRecording()) return;
      else startAt(startIndex());
    },
    step(d: number) {
      const s = getSpeech();
      const cur = s.verse ? items.findIndex((it) => it.v === s.verse) : -1;
      let i = Math.min(items.length - 1, Math.max(0, (cur >= 0 ? cur : startIndex()) + d));
      if (mixed && cur >= 0) {
        // Step by verse, not by version: the first item of the next / previous verse.
        const verses = single.map((it) => it.v);
        const vi = verses.indexOf(items[cur].v);
        const target = verses[Math.min(verses.length - 1, Math.max(0, vi + d))];
        i = Math.max(0, items.findIndex((it) => it.v === target));
      }
      if (s.engine === "recorded" && s.chapterKey === chapterKey && items[i] && seekRecording(items[i].v)) return;
      if (s.status === "playing") startAt(i);
      else setSpeech({ verse: items[i]?.v ?? null, chapterKey, status: "paused" });
    },
    restart(overrides?: { rate?: number; voice?: SpeechSynthesisVoice | null }) {
      if (speech.engine === "recorded" && overrides?.rate !== undefined && !("voice" in overrides)) {
        setRecordingRate(overrides.rate);
        return;
      }
      if (speech.status === "playing") startAt(index >= 0 ? index : 0, overrides);
    },
    /** Pick a recorded voice (or "device") for the version being read, and carry on from the same verse. */
    chooseRecording(id: string) {
      if (!version) return;
      updateSettings({ ttsRecorded: { ...getSettings().ttsRecorded, [version.id]: id } });
      if (speech.status === "playing") startAt(index >= 0 ? index : 0);
    },
    recording: version ? recordingFor(version.id) : null,
    recordings: version ? allRecordings.filter((x) => x.version === version.id) : [],
    /** Switch the column being read; stays on the same verse, paused (press play to continue). */
    setVersion(id: string) {
      const verse = speech.verse;
      stop();
      setSpeech({ version: id, verse, chapterKey, status: verse ? "paused" : "idle" });
    },
    /** Start reading at this verse (or the next one the column has), in `versionId`'s column if given. */
    readFrom(v: string, versionId?: string) {
      if (mixed && (!versionId || mixIds.includes(versionId))) {
        // Start at this verse, in the tapped version if it is one of those being read in turn.
        let i = mixItems.findIndex((it) => it.v === v && (!versionId || it.version === versionId));
        if (i < 0) i = findStart(mixItems, v);
        if (i >= 0) startAt(i, { until: null });
        return;
      }
      const ci = versionId ? cols.findIndex((c) => c.version.id === versionId) : colIndex;
      const tc = cols[ci];
      if (!tc || tc.entry.status !== "ok") return;
      const list = ci === colIndex ? items : buildItems(rows, ci, tc.version.language);
      const i = findStart(list, v);
      if (i < 0) return;
      // Same recording already playing in this chapter: just jump.
      const s = getSpeech();
      if (s.engine === "recorded" && s.version === tc.version.id && s.chapterKey === chapterKey && !s.until && seekRecording(list[i].v)) {
        if (s.status !== "playing") resumeRecording();
        return;
      }
      startAt(i, { version: tc.version.id, until: null });
    },
    /**
     * The ▶ next to a version: play that version (from the verse being read, else the first verse on
     * screen); on the version already playing it pauses / resumes.
     */
    playVersion(id: string, fromVerse?: string) {
      const s = getSpeech();
      const same = s.version === id && s.chapterKey === chapterKey;
      if (same && !fromVerse && s.status === "playing") return pause();
      if (same && !fromVerse && s.status === "paused") {
        if (s.engine === "recorded" && resumeRecording()) return;
      }
      const v = fromVerse || (s.chapterKey === chapterKey ? s.verse : null) || items[startIndex()]?.v || "1";
      this.readFrom(v || "1", id);
    },
    /** Does this version have a recorded (screen-off) voice for this chapter? */
    hasRecording(id: string) {
      return allRecordings.some((r) => r.version === id && hasChapter(r, bookRef.book, bookRef.chapter));
    },
    /** Play verses from–to (inclusive), then stop. */
    playRange(from: string, to: string) {
      const i = findStart(items, from);
      if (i >= 0) startAt(i, { until: to });
    },
    /** Open the player without playing: ready at the first verse on screen; ▶, a verse tap or ▾ starts it. */
    open() {
      setSpeech({
        open: true,
        version: speech.version ?? cols[0]?.version.id ?? null,
        status: "paused",
        engine: "device",
        verse: items[startIndex()]?.v ?? null,
        chapterKey,
        ready: true,
        error: null,
      });
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
            {speech.continuePending ? "Next chapter…" : ra.ready ? (ra.mixed ? `${ra.mixIds.map((id) => ra.cols.find((c) => c.version.id === id)?.version.abbr).join(" + ")}${speech.speaking ? ` · now ${ra.cols.find((c) => c.version.id === speech.speaking)?.version.abbr}` : ""}` : `${version.abbr} · ${langName}`) : "Loading…"}
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

      {speech.ready && (
        <p className="mx-auto max-w-3xl px-4 pb-1.5 text-xs text-muted" role="status">
          Ready at verse {verse ?? speech.verse}. Press ▶ to start here, tap any verse to start there, or choose a verse or
          range with ▾.
        </p>
      )}
      {ra.cols.length > 1 && ra.mixMode && (
        <div className="mx-auto max-w-3xl space-y-1 px-3 pb-1.5">
          <div className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none]" role="group" aria-label="Versions read in turn">
            {ra.cols.map((c) => {
              const on = ra.mixIds.includes(c.version.id) || (!ra.mixed && settings.ttsMix.includes(c.version.id));
              const n = ra.mixIds.indexOf(c.version.id);
              return (
                <button
                  key={c.version.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => ra.toggleMix(c.version.id)}
                  title={on ? "Tap to leave this version out" : "Tap to add this version"}
                  className={`flex min-h-9 shrink-0 items-center gap-1 rounded-full border px-3 text-xs font-medium ${
                    on ? "border-accent bg-accent text-accent-ink" : "border-line bg-raised text-muted hover:text-ink"
                  }`}
                >
                  {on ? (ra.mixed ? <span className="tabular-nums">{n + 1}.</span> : "✓") : "+"} {c.version.abbr}
                </button>
              );
            })}
            <button type="button" onClick={() => ra.setMixMode(false)} className="ml-auto shrink-0 rounded-full px-2 text-xs text-muted underline-offset-2 hover:text-ink hover:underline">
              Just one
            </button>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted">
            {ra.mixed ? (
              <>
                <select
                  aria-label="Order"
                  value={settings.ttsMixOrder}
                  onChange={(e) => ra.setMixOrder(e.target.value as "verse" | "chapter")}
                  className="h-8 rounded-lg border border-line bg-raised px-1.5 text-xs text-ink"
                >
                  <option value="verse">Each verse in every version</option>
                  <option value="chapter">Whole chapter in each, one after another</option>
                </select>
                <span className="truncate">Device voices</span>
              </>
            ) : (
              <span>Tap the versions to hear, in this order.</span>
            )}
          </div>
        </div>
      )}
      {ra.cols.length > 1 && !ra.mixMode && (
        <div className="mx-auto flex max-w-3xl gap-1 overflow-x-auto px-3 pb-1.5 [scrollbar-width:none]" role="group" aria-label="Version to listen to">
          {ra.cols.map((c) => {
            const on = c.version.id === version.id;
            return (
              <button
                key={c.version.id}
                type="button"
                aria-pressed={on}
                onClick={() => ra.playVersion(c.version.id)}
                title={ra.hasRecording(c.version.id) ? "Recorded voice (keeps playing with the screen off)" : "Device voice"}
                className={`flex min-h-9 shrink-0 items-center gap-1 rounded-full border px-3 text-xs font-medium ${
                  on ? "border-accent bg-accent text-accent-ink" : "border-line bg-raised text-muted hover:text-ink"
                }`}
              >
                {on && playing ? <PauseIcon width={12} height={12} /> : <PlayIcon width={12} height={12} />}
                {c.version.abbr}
                {ra.hasRecording(c.version.id) && <span aria-label="recorded voice" className={`h-1.5 w-1.5 rounded-full ${on ? "bg-accent-ink" : "bg-accent"}`} />}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => ra.setMixMode(true)}
            title="Hear several versions in turn, e.g. WEB then RVR"
            className="flex min-h-9 shrink-0 items-center gap-1 rounded-full border border-dashed border-line px-3 text-xs text-muted hover:text-ink"
          >
            + Several
          </button>
        </div>
      )}

      {picker && ra.verseList.length > 0 && (
        <div className="mx-auto max-w-3xl space-y-2 px-4 pb-3 pt-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-faint">Play from verse</p>
          <div className="grid max-h-36 grid-cols-8 gap-1 overflow-y-auto sm:grid-cols-12">
            {ra.verseList.map((it) => (
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
              value={range?.from ?? ra.verseList[0].v}
              onChange={(e) => setRange({ from: e.target.value, to: range?.to ?? ra.verseList[ra.verseList.length - 1].v })}
              className="h-10 rounded-lg border border-line bg-raised px-2 tabular-nums"
            >
              {ra.verseList.map((it) => (
                <option key={it.v} value={it.v}>
                  {it.v}
                </option>
              ))}
            </select>
            <span className="text-faint">to</span>
            <select
              aria-label="To verse"
              value={range?.to ?? ra.verseList[ra.verseList.length - 1].v}
              onChange={(e) => setRange({ from: range?.from ?? ra.verseList[0].v, to: e.target.value })}
              className="h-10 rounded-lg border border-line bg-raised px-2 tabular-nums"
            >
              {ra.verseList.map((it) => (
                <option key={it.v} value={it.v}>
                  {it.v}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                const from = range?.from ?? ra.verseList[0].v;
                const to = range?.to ?? ra.verseList[ra.verseList.length - 1].v;
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
                ra.readFrom(ra.verseList[0].v, version.id);
                setPicker(false);
              }}
              className="h-10 rounded-lg border border-line px-3 hover:border-faint"
            >
              Whole chapter
            </button>
          </div>
        </div>
      )}

      {speech.engine === "recorded" && (
        <p className="mx-auto max-w-3xl px-4 pb-1.5 text-xs text-muted">Recorded voice: keeps playing with the screen off · lock-screen controls.</p>
      )}
      {speech.engine !== "recorded" && ra.recordings.length > 0 && !ra.recording && settings.ttsRecorded[version.id] !== "device" && (
        <p className="mx-auto max-w-3xl px-4 pb-1.5 text-xs text-muted">No recording of this chapter yet, so a device voice is reading.</p>
      )}
      {speech.engine !== "recorded" && speech.wordTiming === false && !speech.error && langVoices.some((v) => v.localService) && !ra.voice?.localService && (
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
              value={ra.recording ? `rec:${ra.recording.id}` : (ra.voice?.voiceURI ?? "")}
              disabled={!langVoices.length && !ra.recordings.length}
              onChange={(e) => {
                const val = e.target.value;
                if (val.startsWith("rec:")) {
                  ra.chooseRecording(val.slice(4));
                  return;
                }
                if (ra.recordings.length) updateSettings({ ttsRecorded: { ...settings.ttsRecorded, [version.id]: "device" } });
                const v = langVoices.find((x) => x.voiceURI === val) ?? null;
                updateSettings({ ttsVoices: { ...settings.ttsVoices, [lang]: val } });
                ra.restart({ voice: v });
              }}
              className="h-10 min-w-0 max-w-[75%] rounded-lg border border-line bg-raised px-2"
            >
              {ra.recordings.length > 0 && (
                <optgroup label="Recorded · keeps playing with the screen off">
                  {ra.recordings.map((r) => (
                    <option key={r.id} value={`rec:${r.id}`}>
                      {r.label}
                      {r.chapters ? " (some chapters)" : ""}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="This device’s voices">
                {!langVoices.length && <option value="">Browser default</option>}
                {langVoices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name} ({v.lang}){v.localService ? " · on device" : " · online"}
                  </option>
                ))}
              </optgroup>
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
            <span className="text-xs font-semibold uppercase tracking-wide text-faint">Move the version I’m listening to first</span>
            <input
              type="checkbox"
              checked={settings.ttsMoveFirst}
              onChange={(e) => updateSettings({ ttsMoveFirst: e.target.checked })}
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
