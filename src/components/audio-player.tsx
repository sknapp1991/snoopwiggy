"use client";
/**
 * Audio read-along (v1): the browser's text-to-speech reads one column of the chapter, verse by verse,
 * and the verse being read is highlighted in every column. Choose the column (e.g. read English +
 * Spanish, listen in Spanish), speed and voice; optionally keep going into the next chapter.
 */
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import type { AlignedRow } from "@/lib/align";
import { chapterTitle, findBook, readHref, type BookRef } from "@/lib/catalog";
import type { ChapterEntry } from "@/lib/chapter-store";
import { getLanguage } from "@/lib/languages";
import { getSettings, TTS_RATE_MAX, TTS_RATE_MIN, updateSettings, useMediaQuery, useSettings } from "@/lib/settings";
import { useColumnDrag } from "./use-column-drag";
import {
  close,
  getSpeech,
  loadTiming,
  playRecording,
  resumeRecording,
  seekRecording,
  setRecordingRate,
  setStopEachVerse,
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
  playRecordedMix,
  buildMixNext,
  type MixTrackSpec,
  setDeviceControls,
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

/** Keep reading into `to` after `from` ends? (Next chapter; into another book only if that is on too.) */
function mayContinue(from: BookRef, to: BookRef | undefined): to is BookRef {
  const s = getSettings();
  return !!to && s.ttsContinue && (to.book === from.book || s.ttsContinueBook);
}
/** Phones and tablets only: a desktop screen doesn't need keeping awake. */
const isTouch = () => typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
const keepAwake = () => getSettings().ttsKeepAwake && isTouch();

export type ReadAlong = ReturnType<typeof useReadAlong>;

export function useReadAlong({
  cols,
  rows,
  bookRef,
  next,
  versions,
  scroller,
  setVersions,
}: {
  cols: Col[];
  rows: AlignedRow[];
  bookRef: BookRef;
  next?: BookRef;
  versions: string[];
  scroller: RefObject<HTMLDivElement | null>;
  /** Reorder the columns (dragging the versions in the player moves the columns too). */
  setVersions: (ids: string[]) => void;
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
  useEffect(() => setStopEachVerse(settings.ttsVerseStop), [settings.ttsVerseStop]);

  // Several versions in turn (e.g. WEB then RVR): every verse in each chosen version, or each whole
  // chapter in turn. Uses the recordings when every version has one (screen-off), else device voices.
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
      const rate = settings.ttsRates[l] ?? settings.ttsRate; // e.g. English 1×, Spanish 0.9×
      return buildItems(rows, ci, l).map((it) => ({ ...it, lang: l, voice: vo, version: id, rate }));
    });
    if (settings.ttsMixOrder === "chapter") return per.flat();
    const byVerse = new Map<string, SpeechItem[]>();
    for (const list of per) for (const it of list) byVerse.set(it.v, [...(byVerse.get(it.v) ?? []), it]);
    return rows.flatMap((r) => byVerse.get(r.v) ?? []);
    // cols is rebuilt every render; mixKey + mixReady + rows cover what matters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mixReady, mixKey, rows, allVoices, settings.ttsVoices, settings.ttsRates, settings.ttsRate, settings.ttsMixOrder]);
  const items = mixed ? mixItems : single;

  const onDone = () => {
    if (getSpeech().until) {
      setSpeech({ until: null }); // a verse range finished: stop here
      return;
    }
    if (mayContinue(bookRef, next)) {
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
      const list = ranged(mixItems, until);
      const playDevice = () =>
        play({
          items: list,
          start: index,
          lang,
          voice: null,
          rate: overrides?.rate ?? getSettings().ttsRate,
          version: version.id,
          chapterKey,
          onDone,
          keepAwake: keepAwake(),
        });
      // Every version has a recording of this chapter: play those (keeps going with the phone locked).
      const recs = mixIds.map((id) => recordingFor(id));
      if (!(overrides && "voice" in overrides) && recs.every(Boolean)) {
        const specs = (at: BookRef) =>
          mixIds.map((id) => {
            const r = recordingFor(id, at.book, at.chapter);
            return r ? { version: id, url: audioUrl(r, at.book, at.chapter), timingUrl: timingUrl(r, at.book, at.chapter) } : null;
          });
        const abbr = (id: string) => cols.find((c) => c.version.id === id)?.version.abbr ?? id;
        void playRecordedMix({
          tracks: specs(bookRef) as MixTrackSpec[],
          seq: list.map((it) => ({ v: it.v, version: it.version!, rate: it.rate ?? getSettings().ttsRate })),
          start: index,
          version: version.id,
          chapterKey,
          until,
          title: chapterTitle(findBook(bookRef.work, bookRef.book), bookRef.chapter),
          artist: mixIds.map(abbr).join(" + "),
          onDone,
          getNext: async () => {
            const s = getSettings();
            const at = adjacentChapters(bookRef).next;
            if (!mayContinue(bookRef, at)) return null;
            const sp = specs(at);
            if (!sp.every(Boolean)) return null;
            const rates: Record<string, number> = {};
            for (const id of mixIds) {
              const l = cols.find((c) => c.version.id === id)?.version.language ?? "en";
              rates[id] = s.ttsRates[l] ?? s.ttsRate;
            }
            return buildMixNext({
              specs: sp as MixTrackSpec[],
              rates,
              order: s.ttsMixOrder,
              chapterKey: `${at.work}/${at.book}/${at.chapter}`,
              title: chapterTitle(findBook(at.work, at.book), at.chapter),
            });
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
      keepAwake: keepAwake(),
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
          const at = adjacentChapters(bookRef).next;
          if (!mayContinue(bookRef, at) || !hasChapter(rec, at.book, at.chapter)) return null;
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
  /**
   * Something that changes what is heard (voice, versions, order, speed) changed while paused: don't resume
   * the paused recording (it would carry on with the old settings); ▶ starts afresh from the same verse.
   */
  const forgetPaused = () => {
    const s = getSpeech();
    if (s.status === "paused" && s.engine === "recorded") setSpeech({ engine: "device" });
  };
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
    play({ items, start: 0, lang, voice, rate: getSettings().ttsRate, version: version.id, chapterKey, onDone, keepAwake: keepAwake() });
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

  const ra = {
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
    mixed,
    mixIds,
    /** The versions to hear, in column order (one, or several read in turn). */
    selected: mixed ? mixIds : version ? [version.id] : [],
    /** Tap a version: add it to those heard (2+ = read in turn) or take it out (at least one stays). */
    select(id: string) {
      const cur = mixed ? mixIds : version ? [version.id] : [];
      const playing = getSpeech().status === "playing";
      if (!playing) forgetPaused();
      if (cur.includes(id)) {
        if (cur.length === 1) return;
        const rest = cur.filter((x) => x !== id);
        updateSettings({ ttsMix: rest.length >= 2 ? rest : [] });
        if (rest.length === 1 || getSpeech().version === id) setSpeech({ version: rest[0] });
      } else {
        updateSettings({ ttsMix: [...cur, id] });
      }
      if (playing) restartSoon();
    },
    /** Drag a version to another place: the columns move too (and so the order they're read in). */
    reorder(from: number, to: number) {
      const ids = cols.map((c) => c.version.id);
      const [x] = ids.splice(from, 1);
      ids.splice(to, 0, x);
      setVersions(ids);
      if (mixed && getSpeech().status === "playing") restartSoon();
      else forgetPaused();
    },
    setMixOrder(order: "verse" | "chapter") {
      updateSettings({ ttsMixOrder: order });
      if (getSpeech().status === "playing") restartSoon();
      else forgetPaused();
    },
    /** Voice / speed for one language while several versions are read in turn (carries on from the same verse). */
    setLangVoice(language: string, voiceURI: string) {
      updateSettings({ ttsVoices: { ...getSettings().ttsVoices, [language]: voiceURI } });
      // A new voice is heard straight away (also when paused), from the same verse.
      if (getSpeech().status !== "idle" && getSpeech().chapterKey === chapterKey) restartSoon();
    },
    setLangRate(language: string, rate: number) {
      updateSettings({ ttsRates: { ...getSettings().ttsRates, [language]: rate } });
      if (getSpeech().status === "playing") restartSoon();
      else forgetPaused();
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
        // Whole chapters in turn: stay in the version being heard (its first verse is far from the next one's).
        const ver = items[cur].version;
        const same = settings.ttsMixOrder === "chapter" ? items.findIndex((it) => it.v === target && it.version === ver) : -1;
        i = Math.max(0, same >= 0 ? same : items.findIndex((it) => it.v === target));
      }
      if (s.engine === "recorded" && s.chapterKey === chapterKey && items[i] && seekRecording(items[i].v, mixed ? items[i].version : undefined)) return;
      if (s.status === "playing") startAt(i);
      else setSpeech({ verse: items[i]?.v ?? null, chapterKey, status: "paused" });
    },
    restart(overrides?: { rate?: number; voice?: SpeechSynthesisVoice | null }) {
      if (speech.engine === "recorded" && overrides?.rate !== undefined && !("voice" in overrides)) {
        if (mixed) return restartSoon(); // each version keeps its own speed
        setRecordingRate(overrides.rate);
        return;
      }
      if (speech.status !== "playing") return;
      // Several versions in turn: each item carries its own voice, rebuilt from the saved choice on the
      // next render — restart then, or the old voice would keep reading.
      if (mixed && overrides && "voice" in overrides) return restartSoon();
      startAt(index >= 0 ? index : 0, overrides);
    },
    /** Pick a recorded voice (or "device") for the version being read, and carry on from the same verse. */
    chooseRecording(id: string) {
      if (!version) return;
      updateSettings({ ttsRecorded: { ...getSettings().ttsRecorded, [version.id]: id } });
      this.switchVoice();
    },
    /**
     * A different voice was picked: hear it straight away (also when paused), from the verse being read.
     * Before, a paused recording resumed in the old voice, so the change seemed to do nothing.
     */
    switchVoice(overrides?: { voice?: SpeechSynthesisVoice | null }) {
      const s = getSpeech();
      if (s.status === "idle" || s.chapterKey !== chapterKey) return forgetPaused();
      startAt(index >= 0 ? index : startIndex(), overrides);
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
    /** Several versions in turn: the recordings a version has for this chapter, and the one in use. */
    mixRecordings(id: string) {
      return allRecordings.filter((x) => x.version === id && hasChapter(x, bookRef.book, bookRef.chapter));
    },
    mixRecording(id: string) {
      return recordingFor(id);
    },
    /** Several versions in turn: pick a version's voice ("rec:<id>" = a recording, else a device voice). */
    setMixVoice(id: string, value: string) {
      const s0 = getSettings();
      const lang = cols.find((c) => c.version.id === id)?.version.language ?? "en";
      const has = allRecordings.some((x) => x.version === id);
      let voiceChanged = false;
      if (value.startsWith("rec:")) updateSettings({ ttsRecorded: { ...s0.ttsRecorded, [id]: value.slice(4) } });
      else {
        voiceChanged = s0.ttsVoices[lang] !== value;
        updateSettings({
          ...(has ? { ttsRecorded: { ...s0.ttsRecorded, [id]: "device" } } : {}),
          ttsVoices: { ...s0.ttsVoices, [lang]: value },
        });
      }
      // Hear it straight away (also when paused), from the same verse.
      const sp = getSpeech();
      if (sp.status === "idle" || sp.chapterKey !== chapterKey) return forgetPaused();
      if (voiceChanged) return restartSoon(); // the queue carries the voice: wait for it to be rebuilt
      startAt(index >= 0 ? index : startIndex(), { until: null });
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
  // The ▶ in the top bar plays this chapter (see ListenTopButton).
  useEffect(() => {
    listen.current = ra;
  });
  // Lock-screen buttons while a device voice reads (recordings set their own).
  const lockTitle = chapterTitle(findBook(bookRef.work, bookRef.book), bookRef.chapter);
  const lockArtist = mixed ? mixIds.map((id) => cols.find((c) => c.version.id === id)?.version.abbr ?? id).join(" + ") : (version?.abbr ?? "");
  const raRef = useRef(ra);
  useEffect(() => {
    raRef.current = ra;
  });
  useEffect(() => {
    setDeviceControls({
      title: lockTitle,
      artist: lockArtist,
      toggle: () => raRef.current.toggle(),
      step: (d) => raRef.current.step(d),
    });
    return () => setDeviceControls(null);
  }, [lockTitle, lockArtist]);
  useEffect(() => {
    listen.set(true);
    return () => {
      listen.current = null;
      listen.set(false);
    };
  }, []);
  return ra;
}

/** The reader on screen registers here, so the top bar's ▶ can start / pause it. */
const listen = (() => {
  let available = false;
  const subs = new Set<() => void>();
  return {
    current: null as { toggle: () => void; open: () => void; supported: boolean } | null,
    set(on: boolean) {
      available = on;
      subs.forEach((l) => l());
    },
    subscribe(l: () => void) {
      subs.add(l);
      return () => subs.delete(l);
    },
    get: () => available,
  };
})();

/**
 * Whether the player bar is tucked into its small chip, and whether its options are showing: shared,
 * so the top bar's button can open the player with its options (and hide it again).
 */
const barUi = (() => {
  let state = { tucked: false, more: false };
  const subs = new Set<() => void>();
  return {
    get: () => state,
    set(patch: Partial<typeof state>) {
      state = { ...state, ...patch };
      subs.forEach((l) => l());
    },
    subscribe(l: () => void) {
      subs.add(l);
      return () => subs.delete(l);
    },
  };
})();
const SERVER_BAR = barUi.get();
const useBarUi = () => useSyncExternalStore(barUi.subscribe, barUi.get, () => SERVER_BAR);

/**
 * Open the player with its options showing (nothing plays until you press ▶), or, when it is showing,
 * hide it: tucked into its chip while it reads, closed when it isn't reading.
 */
function togglePlayer(ra: { open: () => void } | null) {
  const s = getSpeech();
  const bar = barUi.get();
  if (!s.open) {
    ra?.open();
    barUi.set({ tucked: false, more: true });
  } else if (bar.tucked) barUi.set({ tucked: false });
  else if (s.status === "playing") barUi.set({ tucked: true, more: false });
  else {
    barUi.set({ more: false });
    close();
  }
}

/** 🎧 next to search: opens the player and its options; tap again to hide it. */
export function ListenTopButton() {
  const on = useSyncExternalStore(listen.subscribe, listen.get, () => false);
  const speech = useSpeech();
  const bar = useBarUi();
  const supported = useSpeechSupported();
  if (!on || !supported) return null;
  const playing = speech.status === "playing";
  const showing = speech.open && !bar.tucked;
  return (
    <button
      type="button"
      onClick={() => togglePlayer(listen.current)}
      aria-label={showing ? "Hide the player" : "Listen: open the read-aloud player"}
      aria-pressed={showing}
      title={showing ? "Hide the player" : "Listen (choose versions, voices and speed, then press play)"}
      className={`relative flex h-11 w-11 items-center justify-center rounded-lg hover:bg-raised hover:text-ink desk:border desk:border-line ${
        showing ? "bg-accent-soft text-accent" : speech.open ? "text-accent desk:bg-raised" : "text-muted desk:bg-raised"
      }`}
    >
      <HeadphonesIcon />
      {playing && <span className="absolute right-1.5 top-1.5 h-2 w-2 animate-pulse rounded-full bg-accent" aria-hidden />}
    </button>
  );
}

/** Headphones button in the chapter header. */
export function ListenButton({ ra }: { ra: ReadAlong }) {
  if (!ra.supported) return null;
  const on = ra.speech.open;
  return (
    <button
      type="button"
      onClick={() => togglePlayer(ra)}
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

type Swipe = { x: number; y: number; lastY: number; lastT: number; v: number; lock: "v" | "h" | null; more: boolean; picker: boolean };

/** Player bar along the bottom of the reader. */
export function ReadAlongBar({ ra }: { ra: ReadAlong }) {
  const { more, tucked } = useBarUi();
  const setMore = (v: boolean | ((m: boolean) => boolean)) => barUi.set({ more: typeof v === "function" ? v(barUi.get().more) : v });
  const setTucked = (v: boolean) => barUi.set({ tucked: v });
  const [picker, setPicker] = useState(false);
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const swipeStart = useRef<Swipe | null>(null);
  const justSwiped = useRef(false);
  // Finger offset while swiping up/down (null when not swiping): the options open and close with it.
  const [drag, setDrag] = useState<number | null>(null);
  const [leaving, setLeaving] = useState(false); // sliding down into the chip
  const [moreH, setMoreH] = useState(0); // natural height of the options
  const moreObs = useRef<ResizeObserver | null>(null);
  const measureMore = useCallback((el: HTMLDivElement | null) => {
    moreObs.current?.disconnect();
    if (!el) return;
    const ro = new ResizeObserver(() => setMoreH(el.offsetHeight));
    ro.observe(el);
    moreObs.current = ro;
  }, []);
  const settings = useSettings();
  const touch = useMediaQuery("(pointer: coarse)", false);
  const { speech, version, lang } = ra;
  if (!speech.open || !version) return null;
  const playing = speech.status === "playing";
  const book = findBook(ra.bookRef.work, ra.bookRef.book);
  const verse = ra.index >= 0 ? ra.items[ra.index]?.v : null;
  const { list: langVoices, fallback } = voicesFor(ra.allVoices, lang);
  const langName = getLanguage(lang).name;
  const noVoice = ra.allVoices.length > 0 && langVoices.length === 0;

  const btn = "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-raised hover:text-ink disabled:opacity-40";

  // The options can take up to ~60% of the screen; past that they scroll inside.
  const cap = typeof window === "undefined" ? 480 : Math.round(window.innerHeight * 0.6);
  const openH = Math.min(moreH, cap);
  const scrolls = moreH > cap;
  const tuck = () => {
    setMore(false);
    setPicker(false);
    setLeaving(true);
    setTimeout(() => {
      setTucked(true);
      setLeaving(false);
    }, 220);
  };

  // Swiping follows the finger: up opens the options (same as the gear), down closes them, then
  // slides the bar away into a small chip (reading carries on); tap the chip to bring the bar back.
  // On release it settles open or closed by how far and how fast the swipe went.
  const swipe = {
    onPointerDown: (e: React.PointerEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("select, input, textarea")) return;
      if (scrolls && more && t.closest("[data-options]")) return; // that area scrolls instead
      swipeStart.current = { x: e.clientX, y: e.clientY, lastY: e.clientY, lastT: e.timeStamp, v: 0, lock: null, more, picker };
    },
    onPointerMove: (e: React.PointerEvent) => {
      const s = swipeStart.current;
      if (!s) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (!s.lock) {
        if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx) * 1.2) {
          s.lock = "v";
          try {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          } catch {}
        } else if (Math.abs(dx) > 8) s.lock = "h";
      }
      if (s.lock !== "v") return;
      const dt = e.timeStamp - s.lastT;
      if (dt > 0) s.v = s.v * 0.4 + ((e.clientY - s.lastY) / dt) * 0.6;
      s.lastY = e.clientY;
      s.lastT = e.timeStamp;
      setDrag(dy);
    },
    onPointerUp: (e: React.PointerEvent) => {
      const s = swipeStart.current;
      swipeStart.current = null;
      if (!s || s.lock !== "v") return;
      justSwiped.current = true;
      setTimeout(() => (justSwiped.current = false), 0);
      const dy = e.clientY - s.y;
      const fast = Math.abs(s.v) > 0.45;
      setDrag(null);
      if (s.picker && !s.more) {
        if (dy > 30) setPicker(false);
        return;
      }
      if (s.more) {
        if (dy > 0 && (dy > openH * 0.3 || (fast && s.v > 0))) setMore(false);
        return;
      }
      if (dy < 0 && (-dy > Math.min(60, openH * 0.3) || (fast && s.v < 0))) setMore(true);
      else if (dy > 0 && (dy > 60 || (fast && s.v > 0))) tuck();
    },
    onPointerCancel: () => {
      swipeStart.current = null;
      setDrag(null);
    },
    // A swipe that ends on a button shouldn't also press it.
    onClickCapture: (e: React.MouseEvent) => {
      if (justSwiped.current) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
  };
  // Where the sheet is right now: the options' height, and how far the bar has slid down.
  const shownH = drag == null ? (more ? openH : 0) : Math.max(0, Math.min(openH, (more ? openH : 0) - drag));
  const slide = leaving ? "translateY(110%)" : drag != null && drag > 0 && !more && !picker ? `translateY(${drag}px)` : undefined;
  const ease = drag == null ? "260ms cubic-bezier(0.2, 0.8, 0.2, 1)" : "0ms";

  if (tucked)
    return (
      <div data-no-swipe className="absolute bottom-3 right-3 z-20 mb-[env(safe-area-inset-bottom)] flex animate-[chip-in_200ms_ease-out] items-center gap-1 rounded-full border border-line bg-panel/90 p-1 shadow-lg backdrop-blur">
        <button type="button" onClick={ra.toggle} aria-label={playing ? "Pause" : "Play"} className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-ink">
          {playing ? <PauseIcon width={18} height={18} /> : <PlayIcon width={18} height={18} />}
        </button>
        <button type="button" onClick={() => setTucked(false)} aria-label="Show the read-aloud controls" className="flex h-10 items-center gap-1 rounded-full px-2 text-xs font-medium text-muted hover:text-ink">
          {chapterTitle(book, ra.bookRef.chapter)}
          {verse ? `:${verse}` : ""}
          <span aria-hidden className="text-base leading-none">⌃</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setTucked(false);
            close();
          }}
          aria-label="Stop and close the player"
          title="Stop"
          className="flex h-10 w-8 items-center justify-center rounded-full text-faint hover:text-ink"
        >
          <CloseIcon width={14} height={14} />
        </button>
      </div>
    );

  return (
    <div
      role="region"
      aria-label="Read aloud"
      data-no-swipe
      {...swipe}
      style={{ transform: slide, transition: `transform ${ease}` }}
      className="absolute inset-x-0 bottom-0 z-20 animate-[sheet-in_220ms_ease-out] touch-none border-t border-line bg-panel/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgb(0_0_0/0.08)] backdrop-blur"
    >
      {/* Grab handle: swipe down to close the options, then to tuck the bar away */}
      <button
        type="button"
        onClick={() => (more || picker ? (setMore(false), setPicker(false)) : tuck())}
        aria-label={more || picker ? "Close the options" : "Tuck the player away (it keeps reading)"}
        className="mx-auto flex h-4 w-16 items-center justify-center"
      >
        <span className="h-1 w-10 rounded-full bg-line" />
      </button>
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
        <button
          type="button"
          className={btn}
          onClick={tuck}
          aria-label="Minimize the player (it keeps playing)"
          title="Minimize (keeps playing)"
        >
          <CloseIcon />
        </button>
      </div>

      {speech.ready && (
        <p className="mx-auto max-w-3xl px-4 pb-1.5 text-xs text-muted" role="status">
          Ready at verse {verse ?? speech.verse}. Press ▶ to start here, tap any verse to start there, or choose a verse or
          range with ▾.
        </p>
      )}
      {ra.cols.length > 1 && <VersionBubbles ra={ra} more={more} onMore={() => setMore((m) => !m)} />}
      {ra.cols.length === 1 && (
        <div className="mx-auto flex max-w-3xl px-3 pb-1.5">
          <VerseStopPill />
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
        <p className="mx-auto max-w-3xl px-4 pb-1.5 text-xs text-muted">
          {ra.mixed ? "Recorded voices" : "Recorded voice"}: keeps playing with the screen off · lock-screen controls.
        </p>
      )}
      {speech.engine !== "recorded" && ra.mixed && speech.status !== "idle" && (
        <p className="mx-auto max-w-3xl px-4 pb-1.5 text-xs text-muted">
          Device voices stop when the phone locks. To keep listening locked, every version read in turn needs a recorded
          voice for this chapter (the ● in ⚙).
        </p>
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

      <div
        data-options
        inert={!more}
        aria-hidden={!more}
        style={{ height: shownH, transition: `height ${ease}` }}
        className={more && drag == null && scrolls ? "touch-pan-y overflow-y-auto overscroll-contain" : "overflow-hidden"}
      >
        <div ref={measureMore} className="mx-auto grid max-w-3xl grid-cols-1 gap-2 px-4 pb-3 pt-1 text-sm sm:grid-cols-2">
          {ra.mixed ? (
            <MixVoices ra={ra} />
          ) : (
            <div className="flex min-h-11 items-center gap-2 sm:col-span-2">
              <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-faint">Voice</span>
              <select
                aria-label={`Voice for ${version.abbr}`}
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
                  ra.switchVoice({ voice: v });
                }}
                className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-raised px-2"
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
              <select
                aria-label="Speed"
                title="Speed"
                value={settings.ttsRate}
                onChange={(e) => {
                  const rate = Math.min(TTS_RATE_MAX, Math.max(TTS_RATE_MIN, Number(e.target.value)));
                  updateSettings({ ttsRate: rate });
                  ra.restart({ rate });
                }}
                className="h-10 shrink-0 rounded-lg border border-line bg-raised px-2 tabular-nums"
              >
                {RATES.map((r) => (
                  <option key={r} value={r}>
                    {r}×
                  </option>
                ))}
              </select>
            </div>
          )}
          {/* Quick on/off bubbles: keep going after the chapter / book ends, keep the phone awake. */}
          <div className="flex flex-wrap items-center gap-1.5 sm:col-span-2" role="group" aria-label="When the chapter ends">
            <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-faint">Then</span>
            <Pill on={settings.ttsContinue} onClick={() => updateSettings({ ttsContinue: !settings.ttsContinue })} title="Continue into the next chapter">
              ↪ Next chapter
            </Pill>
            <Pill
              on={settings.ttsContinue && settings.ttsContinueBook}
              disabled={!settings.ttsContinue}
              onClick={() => updateSettings({ ttsContinueBook: !settings.ttsContinueBook })}
              title="At a book's last chapter, go on to the next book (e.g. Genesis 50 → Exodus 1)"
            >
              ↪ Next book
            </Pill>
            {touch && (
              <Pill
                on={settings.ttsKeepAwake}
                onClick={() => updateSettings({ ttsKeepAwake: !settings.ttsKeepAwake })}
                title="Phones stop built-in voices when the screen locks; this keeps it awake (you can turn the brightness down)"
              >
                ☀ Keep screen on
              </Pill>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The versions on screen as bubbles: tap to choose which you hear (one, or several read in turn);
 * drag one to another place to reorder — the columns move with it.
 */
function VersionBubbles({ ra, more, onMore }: { ra: ReadAlong; more: boolean; onMore: () => void }) {
  const settings = useSettings();
  const { drag, handlers } = useColumnDrag(ra.reorder, "data-audiover");
  return (
    <div className="mx-auto max-w-3xl space-y-1 px-3 pb-1.5">
      <div className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none]" role="group" aria-label="Versions to hear (drag to reorder)">
        {ra.cols.map((c, i) => {
          const on = ra.selected.includes(c.version.id);
          const n = ra.selected.indexOf(c.version.id);
          const rec = ra.hasRecording(c.version.id);
          return (
            <button
              key={c.version.id}
              type="button"
              {...handlers(i)}
              aria-pressed={on}
              onClick={() => ra.select(c.version.id)}
              title={`${on ? (ra.selected.length > 1 ? "Tap to leave this version out" : "Being read") : "Tap to hear this version too"} · drag to reorder (moves the columns too)${rec ? " · recorded voice: keeps playing with the screen off" : ""}`}
              className={`flex min-h-9 shrink-0 touch-pan-x select-none items-center gap-1 rounded-full border px-3 text-xs font-medium ${
                on ? "border-accent bg-accent text-accent-ink" : "border-line bg-raised text-muted hover:text-ink"
              } ${drag?.from === i ? "relative z-10 shadow-lg ring-2 ring-accent/60" : ""} ${drag && drag.over === i && drag.from !== i ? "ring-2 ring-accent ring-offset-1" : ""}`}
              style={drag?.from === i ? { transform: `translateX(${drag.dx}px)` } : undefined}
            >
              {on && ra.selected.length > 1 && <span className="tabular-nums">{n + 1}.</span>}
              {c.version.abbr}
              {rec && <span aria-label="recorded voice" className={`h-1.5 w-1.5 rounded-full ${on ? "bg-accent-ink" : "bg-accent"}`} />}
            </button>
          );
        })}
        <VerseStopPill />
      </div>
      {ra.mixed && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <select
            aria-label="Order"
            value={settings.ttsMixOrder}
            onChange={(e) => ra.setMixOrder(e.target.value as "verse" | "chapter")}
            className="h-8 rounded-lg border border-line bg-raised px-1.5 text-xs text-ink"
          >
            <option value="verse">Each verse in every version</option>
            <option value="chapter">Whole chapter in each, one after another</option>
          </select>
          <button
            type="button"
            aria-expanded={more}
            onClick={onMore}
            className={`flex min-h-8 shrink-0 items-center gap-1 rounded-full border px-3 text-xs ${more ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:text-ink"}`}
          >
            <GearIcon width={12} height={12} /> Voices &amp; speed
          </button>
        </div>
      )}
    </div>
  );
}

/** Several versions in turn: a voice and a speed for each one, side by side. */
function MixVoices({ ra }: { ra: ReadAlong }) {
  const settings = useSettings();
  const recorded = ra.mixIds.map((id) => !!ra.mixRecording(id));
  const partial = recorded.some(Boolean) && !recorded.every(Boolean);
  return (
    <div className="grid grid-cols-1 gap-2 sm:col-span-2 sm:grid-cols-2">
      {partial && (
        <p className="text-xs text-muted sm:col-span-2">
          Recorded voices are used only when every version read in turn has one; for now all are read by this device’s voices.
        </p>
      )}
      {ra.mixIds.map((id) => {
        const v = ra.cols.find((c) => c.version.id === id)?.version;
        if (!v) return null;
        const lang = v.language;
        const { list } = voicesFor(ra.allVoices, lang);
        const chosen = pickVoice(ra.allVoices, lang, settings.ttsVoices[lang]);
        const recs = ra.mixRecordings(id);
        const rec = ra.mixRecording(id);
        const rate = settings.ttsRates[lang] ?? settings.ttsRate;
        return (
          <div key={id} className="space-y-1.5 rounded-lg border border-line bg-raised/60 p-2">
            <p className="text-xs font-semibold">
              {v.abbr} <span className="font-normal text-muted">· {getLanguage(lang).name}</span>
            </p>
            <div className="flex gap-2">
              <select
                aria-label={`${v.abbr} voice`}
                value={rec ? `rec:${rec.id}` : (chosen?.voiceURI ?? "")}
                disabled={!list.length && !recs.length}
                onChange={(e) => ra.setMixVoice(id, e.target.value)}
                className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-raised px-2"
              >
                {recs.length > 0 && (
                  <optgroup label="Recorded · keeps playing with the screen off">
                    {recs.map((r) => (
                      <option key={r.id} value={`rec:${r.id}`}>
                        {r.label}
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="This device’s voices">
                  {!list.length && <option value="">Browser default</option>}
                  {list.map((x) => (
                    <option key={x.voiceURI} value={x.voiceURI}>
                      {x.name}
                    </option>
                  ))}
                </optgroup>
              </select>
              <select
                aria-label={`${getLanguage(lang).name} speed`}
                value={rate}
                onChange={(e) => ra.setLangRate(lang, Math.min(TTS_RATE_MAX, Math.max(TTS_RATE_MIN, Number(e.target.value))))}
                className="h-10 rounded-lg border border-line bg-raised px-2 tabular-nums"
              >
                {RATES.map((r) => (
                  <option key={r} value={r}>
                    {r}×
                  </option>
                ))}
              </select>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** A small on/off bubble for a player option. */
function Pill({ on, disabled, onClick, title, children }: { on: boolean; disabled?: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      title={title}
      className={`flex min-h-9 shrink-0 items-center gap-1 rounded-full border px-3 text-xs disabled:opacity-40 ${
        on ? "border-accent bg-accent-soft font-medium text-accent" : "border-line text-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

/** "Pause after each verse" on/off, right in the bar. */
function VerseStopPill() {
  const on = useSettings().ttsVerseStop;
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => updateSettings({ ttsVerseStop: !on })}
      title={on ? "Pausing after each verse — tap to read on" : "Pause after each verse (press ▶ for the next)"}
      className={`flex min-h-9 shrink-0 items-center gap-1 rounded-full border px-3 text-xs ${
        on ? "border-accent bg-accent-soft font-medium text-accent" : "border-line text-muted hover:text-ink"
      }`}
    >
      <PauseIcon width={12} height={12} /> {on ? "Verse by verse" : "Pause each verse"}
    </button>
  );
}

/** Space under the text so the player bar never covers the last verses. */
export function ReadAlongSpacer({ ra }: { ra: ReadAlong }) {
  return ra.speech.open ? <div className="h-[60vh]" aria-hidden /> : null;
}
