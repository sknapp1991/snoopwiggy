"use client";
/**
 * Read-along engine on the browser's built-in text-to-speech (Web Speech API). Free, offline-capable,
 * and works for any language the device has a voice for.
 *
 * Text is spoken one verse at a time (long verses in sentence-sized chunks: Chrome cuts off long
 * utterances), so the reader can highlight the verse being read. "Pause" cancels and remembers the
 * verse; "resume" restarts that verse. Native pause/resume is unreliable on Android and in Chrome.
 */
import { useSyncExternalStore } from "react";
import { RAW_WORD } from "./search-text";

export type SpeechItem = { v: string; text: string };

export type SpeechState = {
  /** Player bar visible. */
  open: boolean;
  status: "idle" | "playing" | "paused";
  /** Version being read and the chapter ("bible/gen/1") the queue belongs to. */
  version: string | null;
  chapterKey: string | null;
  /** Verse being read (canonical id). */
  verse: string | null;
  /** Set when a chapter finished and the next one should start once it has loaded. */
  continuePending: boolean;
  /** Playing a verse range: stop after this verse (no continuing into the next chapter). */
  until: string | null;
  /** Does the current voice report word positions? null = not known yet. */
  wordTiming: boolean | null;
  /** "device" = browser text-to-speech; "recorded" = a pre-made recording (keeps playing with the screen off). */
  engine: "device" | "recorded";
  /** The player was just opened and is waiting for the user to choose where to start. */
  ready: boolean;
  error: string | null;
};

const IDLE: SpeechState = {
  open: false,
  status: "idle",
  version: null,
  chapterKey: null,
  verse: null,
  continuePending: false,
  until: null,
  wordTiming: null,
  engine: "device",
  ready: false,
  error: null,
};
let state: SpeechState = IDLE;
const subs = new Set<() => void>();
function set(patch: Partial<SpeechState>) {
  state = { ...state, ...patch };
  subs.forEach((l) => l());
}
function subscribe(l: () => void) {
  subs.add(l);
  return () => subs.delete(l);
}
export function useSpeech() {
  return useSyncExternalStore(subscribe, () => state, () => IDLE);
}
export const getSpeech = () => state;
export const setSpeech = set;

export const speechSupported = () => typeof window !== "undefined" && "speechSynthesis" in window;
const noop = () => () => {};
/** Same answer on the server and during hydration (false), then the real one. */
export const useSpeechSupported = () => useSyncExternalStore(noop, speechSupported, () => false);

/* ---------- voices ---------- */

let voices: SpeechSynthesisVoice[] = [];
const voiceSubs = new Set<() => void>();
const EMPTY: SpeechSynthesisVoice[] = [];
function loadVoices() {
  voices = window.speechSynthesis.getVoices();
  voiceSubs.forEach((l) => l());
}
export function useVoices(): SpeechSynthesisVoice[] {
  return useSyncExternalStore(
    (l) => {
      if (!speechSupported()) return () => {};
      voiceSubs.add(l);
      if (!voices.length) loadVoices();
      window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
      return () => {
        voiceSubs.delete(l);
        window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
      };
    },
    () => (voices.length ? voices : EMPTY),
    () => EMPTY,
  );
}

/** When a language has no voice of its own, read it with a close one (Latin → Italian). */
const FALLBACK_LANG: Record<string, string> = { la: "it" };

export function voicesFor(all: SpeechSynthesisVoice[], lang: string) {
  const match = (l: string) => all.filter((v) => v.lang.toLowerCase().replace("_", "-").split("-")[0] === l);
  const own = match(lang);
  if (own.length) return { list: own, fallback: null as string | null };
  const fb = FALLBACK_LANG[lang];
  return { list: fb ? match(fb) : [], fallback: fb ?? null };
}

/** The saved voice, else the most natural-sounding one available. */
export function pickVoice(all: SpeechSynthesisVoice[], lang: string, savedUri?: string) {
  const { list } = voicesFor(all, lang);
  // Prefer natural voices, then voices on the device (they report word positions, so single words can
  // be highlighted; Chrome's online "Google …" voices on desktop don't).
  return (
    list.find((v) => v.voiceURI === savedUri) ??
    list.find((v) => /natural|neural/i.test(v.name)) ??
    list.find((v) => v.localService && v.default) ??
    list.find((v) => v.localService) ??
    list.find((v) => v.default) ??
    list[0] ??
    null
  );
}

/* ---------- speaking ---------- */

/** Make text easier to speak: drop Hebrew cantillation marks and the sof pasuq, brackets, stray symbols. */
export function speakable(text: string, lang: string) {
  let t = text.replace(/[[\]{}¶*†‡]/g, "");
  if (lang === "he") t = t.replace(/[֑-ֽ֯׃׀]/g, "").replace(/־/g, " ");
  return t.replace(/\s+/g, " ").trim();
}

/** Split into pieces of at most ~220 characters at sentence or clause breaks. */
function chunks(text: string): string[] {
  if (text.length <= 220) return [text];
  const out: string[] = [];
  let rest = text;
  while (rest.length > 220) {
    const window = rest.slice(0, 220);
    const cut = Math.max(
      window.lastIndexOf(". "),
      window.lastIndexOf("; "),
      window.lastIndexOf(": "),
      window.lastIndexOf("? "),
      window.lastIndexOf("! "),
      window.lastIndexOf("، "),
      window.lastIndexOf("׃"),
    );
    const at = cut > 60 ? cut + 1 : Math.max(window.lastIndexOf(", "), window.lastIndexOf(" ")) + 1 || 220;
    out.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/* ---------- word-by-word position (boundary events; not every voice sends them) ---------- */

/** `word`: exact word index (device voices); `frac`: how far through the verse (recordings, approximate). */
export type WordPos = { verse: string; word?: number; frac?: number } | null;
const wordSubs = new Set<(w: WordPos) => void>();
/** Called with the index of the word being spoken in the current verse (null when it ends). */
export function onWord(cb: (w: WordPos) => void) {
  wordSubs.add(cb);
  return () => {
    wordSubs.delete(cb);
  };
}
const emitWord = (w: WordPos) => wordSubs.forEach((cb) => cb(w));
const countWords = (s: string) => (s.match(RAW_WORD) ?? []).length;

/* ---------- keep the screen on while listening (Screen Wake Lock API) ---------- */

let wakeLock: { release(): Promise<void> } | null = null;
let wantWake = false;
async function acquireWake() {
  wantWake = true;
  try {
    const nav = navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<{ release(): Promise<void> }> } };
    if (nav.wakeLock && !wakeLock && document.visibilityState === "visible") wakeLock = await nav.wakeLock.request("screen");
  } catch {
    /* not allowed (battery saver, iframe…) — reading still works */
  }
}
function releaseWake() {
  wantWake = false;
  wakeLock?.release().catch(() => {});
  wakeLock = null;
}
if (typeof document !== "undefined")
  document.addEventListener("visibilitychange", () => {
    // The browser drops the lock when the tab is hidden; take it again on return.
    wakeLock = null;
    if (wantWake && document.visibilityState === "visible") acquireWake();
  });

type Run = {
  items: SpeechItem[];
  index: number;
  lang: string;
  voice: SpeechSynthesisVoice | null;
  rate: number;
  onDone: () => void;
  keepAwake: boolean;
};
let run: Run | null = null;
let lastVoice: string | undefined;
let token = 0;
// Keep a reference: Chrome can garbage-collect a playing utterance and never fire onend.
let current: SpeechSynthesisUtterance | null = null;

function speakItem(r: Run, my: number) {
  if (my !== token) return;
  const item = r.items[r.index];
  if (!item) {
    run = null;
    emitWord(null);
    set({ status: "idle", verse: null });
    releaseWake();
    r.onDone();
    return;
  }
  set({ verse: item.v, status: "playing", error: null });
  emitWord(null);
  const parts = chunks(item.text);
  let p = 0;
  let base = 0; // words spoken in earlier chunks of this verse
  let sawWord = false;
  const next = () => {
    if (my !== token) return;
    if (p > 0) base += countWords(parts[p - 1]);
    if (p >= parts.length) {
      // A whole verse without word positions: this voice can't follow word by word.
      if (!sawWord && countWords(item.text) > 3 && state.wordTiming !== false) set({ wordTiming: false });
      r.index++;
      speakItem(r, my);
      return;
    }
    const u = new SpeechSynthesisUtterance(parts[p++]);
    u.lang = r.voice?.lang ?? r.lang;
    if (r.voice) u.voice = r.voice;
    u.rate = r.rate;
    const chunkText = parts[p - 1];
    const chunkBase = base;
    u.onboundary = (e) => {
      if (my !== token || e.name !== "word") return;
      if (!sawWord) {
        sawWord = true;
        if (state.wordTiming !== true) set({ wordTiming: true });
      }
      emitWord({ verse: item.v, word: chunkBase + countWords(chunkText.slice(0, e.charIndex)) });
    };
    // `current` stays set until this utterance really ends, so a restart can wait for it (Firefox keeps a
    // cancelled utterance in its queue until its end event; speaking before that leaves the new one stuck).
    u.onend = () => {
      if (current === u) current = null;
      next();
    };
    u.onerror = (e) => {
      if (current === u) current = null;
      if (my !== token || e.error === "interrupted" || e.error === "canceled") return;
      set({ status: "idle", error: e.error === "not-allowed" ? "Tap play to start reading." : `Speech stopped (${e.error}).` });
    };
    let started = false;
    u.onstart = () => {
      started = true;
    };
    current = u;
    const ss = window.speechSynthesis;
    ss.resume(); // some browsers stay "paused" after a cancel
    ss.speak(u);
    // Watchdog: if the browser silently dropped this utterance, queue it once more.
    setTimeout(() => {
      if (my !== token || started || current !== u) return;
      ss.cancel();
      setTimeout(() => {
        if (my === token && current === u) ss.speak(u);
      }, 150);
    }, 1500);
  };
  next();
}

/** Start (or restart) reading `items` from index `start`. */
export function play(opts: {
  items: SpeechItem[];
  start: number;
  lang: string;
  voice: SpeechSynthesisVoice | null;
  rate: number;
  version: string;
  chapterKey: string;
  onDone: () => void;
  keepAwake: boolean;
}) {
  if (!speechSupported()) {
    set({ error: "This browser can’t read aloud." });
    return;
  }
  const my = ++token;
  window.speechSynthesis.cancel();
  run = {
    items: opts.items,
    index: Math.max(0, opts.start),
    lang: opts.lang,
    voice: opts.voice,
    rate: opts.rate,
    onDone: opts.onDone,
    keepAwake: opts.keepAwake,
  };
  if (opts.keepAwake) acquireWake();
  stopRecording();
  set({ open: true, version: opts.version, chapterKey: opts.chapterKey, continuePending: false, status: "playing", engine: "device", ready: false });
  if (opts.voice?.voiceURI !== lastVoice) {
    lastVoice = opts.voice?.voiceURI;
    set({ wordTiming: null });
  }
  const r = run;
  // Speak right away when nothing is playing: phones only allow speech that starts inside the tap,
  // and a timer would lose that. Otherwise wait for cancel() to settle (some browsers drop the next
  // utterance if speak() follows it too quickly).
  const ss = window.speechSynthesis;
  const prev = current; // the utterance being cancelled, if any
  if (!prev && !ss.speaking && !ss.pending) speakItem(r, my);
  else {
    // Wait until the cancelled utterance has really ended; if it never reports, cancel again and go on.
    let tries = 0;
    const go = () => {
      if (my !== token) return;
      if ((prev && current === prev) || ss.speaking) {
        if (tries++ < 10) {
          setTimeout(go, 50);
          return;
        }
        ss.cancel();
        current = null;
      }
      speakItem(r, my);
    };
    setTimeout(go, 30);
  }
}

/** Index of the verse being read in the current queue. */
export function currentIndex() {
  return run ? run.index : -1;
}

export function pause() {
  token++;
  if (rec) cancelAnimationFrame(rec.raf);
  if (audio && !audio.paused) audio.pause();
  emitWord(null);
  releaseWake();
  window.speechSynthesis?.cancel(); // `current` clears itself when the utterance's end event arrives
  set({ status: "paused" });
}

export function stop() {
  token++;
  stopRecording();
  emitWord(null);
  releaseWake();
  run = null;
  if (speechSupported()) window.speechSynthesis.cancel(); // `current` clears on the end event
  set({ status: "idle", verse: null, continuePending: false, until: null });
}

export function close() {
  stop();
  set({ open: false, error: null });
}

/* ---------- recorded audio (audio v2): an <audio> element keeps playing with the screen locked ---------- */

export type Timing = { duration: number; verses: { v: string; s: number; e: number }[] };
let audio: HTMLAudioElement | null = null;
let rec: {
  timing: Timing;
  until: string | null;
  onDone: () => void;
  raf: number;
  lastVerse: string | null;
  /** Advance straight to this chapter when one ends (works with the screen off). */
  getNext?: () => Promise<{ url: string; timing: Timing; chapterKey: string; title: string } | null>;
  onAdvance?: (chapterKey: string) => void;
  title: string;
  artist: string;
} | null = null;

const timings = new Map<string, Promise<Timing>>();
export function loadTiming(url: string): Promise<Timing> {
  let p = timings.get(url);
  if (!p) {
    p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<Timing>;
    });
    p.catch(() => timings.delete(url));
    timings.set(url, p);
  }
  return p;
}

function tick() {
  if (!audio || !rec) return;
  const t = audio.currentTime;
  const vs = rec.timing.verses;
  let i = vs.findIndex((x) => t < x.e + 0.2);
  if (i < 0) i = vs.length - 1;
  const cur = vs[i];
  if (cur && cur.v !== rec.lastVerse) {
    rec.lastVerse = cur.v;
    set({ verse: cur.v });
  }
  if (cur) emitWord(t >= cur.s && t <= cur.e ? { verse: cur.v, frac: (t - cur.s) / Math.max(0.1, cur.e - cur.s) } : null);
  // End of a chosen verse range.
  if (rec.until) {
    const end = vs.find((x) => x.v === rec!.until);
    if (end && t >= end.e) {
      const r = rec;
      stopRecording();
      set({ status: "idle", verse: null, until: null });
      r.onDone();
      return;
    }
  }
  rec.raf = requestAnimationFrame(tick);
}

function mediaSession(title: string, artist: string) {
  const ms = (navigator as Navigator & { mediaSession?: MediaSession }).mediaSession;
  if (!ms) return;
  ms.metadata = new MediaMetadata({ title, artist, album: "Verses Across" });
  const step = (d: number) => () => {
    if (!audio || !rec) return;
    const vs = rec.timing.verses;
    const i = Math.max(0, vs.findIndex((x) => x.v === state.verse));
    const j = Math.min(vs.length - 1, Math.max(0, i + d));
    audio.currentTime = vs[j].s;
  };
  ms.setActionHandler("play", () => audio?.play());
  ms.setActionHandler("pause", () => pause());
  ms.setActionHandler("previoustrack", step(-1));
  ms.setActionHandler("nexttrack", step(1));
  try {
    ms.setActionHandler("seekbackward", step(-1));
    ms.setActionHandler("seekforward", step(1));
  } catch {
    /* not supported */
  }
}

function stopRecording() {
  if (rec) cancelAnimationFrame(rec.raf);
  const had = !!rec;
  rec = null;
  if (audio) {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }
  const ms = (navigator as Navigator & { mediaSession?: MediaSession }).mediaSession;
  if (had && ms) {
    for (const a of ["play", "pause", "previoustrack", "nexttrack", "seekbackward", "seekforward"] as MediaSessionAction[])
      try {
        ms.setActionHandler(a, null);
      } catch {
        /* not supported */
      }
    ms.metadata = null;
    ms.playbackState = "none";
  }
}

/** Play a recorded chapter from verse `startVerse` (or the top). */
export async function playRecording(opts: {
  url: string;
  timingUrl: string;
  startVerse: string | null;
  rate: number;
  version: string;
  chapterKey: string;
  until: string | null;
  title: string;
  artist: string;
  onDone: () => void;
  getNext?: () => Promise<{ url: string; timing: Timing; chapterKey: string; title: string } | null>;
  onAdvance?: (chapterKey: string) => void;
}): Promise<boolean> {
  const my = ++token;
  if (speechSupported()) window.speechSynthesis.cancel();
  run = null;
  current = null;
  emitWord(null);
  releaseWake();
  stopRecording();
  set({ open: true, version: opts.version, chapterKey: opts.chapterKey, continuePending: false, status: "playing", engine: "recorded", error: null, wordTiming: true, ready: false });
  let timing: Timing;
  try {
    timing = await loadTiming(opts.timingUrl);
  } catch {
    if (my !== token) return true;
    set({ status: "idle", engine: "device" });
    return false; // caller falls back to a device voice
  }
  if (my !== token) return true; // something else started meanwhile
  audio ??= new Audio();
  audio.preload = "auto";
  audio.src = opts.url;
  audio.playbackRate = opts.rate;
  const start = opts.startVerse ? timing.verses.find((x) => x.v === opts.startVerse) ?? timing.verses.find((x) => parseInt(x.v, 10) >= parseInt(opts.startVerse!, 10)) : null;
  rec = { timing, until: opts.until, onDone: opts.onDone, raf: 0, lastVerse: null, getNext: opts.getNext, onAdvance: opts.onAdvance, title: opts.title, artist: opts.artist };
  const a = audio;
  a.onended = async () => {
    const r = rec;
    if (!r) return;
    cancelAnimationFrame(r.raf);
    const next = !r.until && r.getNext ? await r.getNext().catch(() => null) : null;
    if (rec !== r) return;
    if (next) {
      // Keep the audio session alive: go straight into the next chapter, then tell the page.
      r.timing = next.timing;
      r.lastVerse = null;
      a.src = next.url;
      a.playbackRate = opts.rate;
      set({ chapterKey: next.chapterKey, verse: next.timing.verses[0]?.v ?? null });
      mediaSession(next.title, r.artist);
      r.onAdvance?.(next.chapterKey);
      await a.play().catch(() => {});
      r.raf = requestAnimationFrame(tick);
      return;
    }
    stopRecording();
    set({ status: "idle", verse: null, until: null });
    emitWord(null);
    r.onDone();
  };
  a.onpause = () => {
    if (rec && !a.ended) set({ status: "paused" });
  };
  a.onplay = () => {
    if (rec) {
      set({ status: "playing" });
      cancelAnimationFrame(rec.raf);
      rec.raf = requestAnimationFrame(tick);
    }
  };
  if (start) a.currentTime = start.s;
  mediaSession(opts.title, opts.artist);
  try {
    await a.play();
  } catch (e) {
    if ((e as DOMException)?.name === "NotAllowedError") set({ status: "paused", error: "Tap play to start." });
    else {
      stopRecording();
      set({ status: "idle", engine: "device" });
      return false;
    }
  }
  return true;
}

/** Resume a paused recording where it stopped. Returns false when there is nothing to resume. */
export function resumeRecording(): boolean {
  if (!audio || !rec || !audio.src) return false;
  audio.play().catch(() => set({ error: "Tap play to start." }));
  return true;
}

/** Jump within the playing recording to a verse (stays in the same chapter). */
export function seekRecording(v: string): boolean {
  if (!audio || !rec) return false;
  const x = rec.timing.verses.find((t) => t.v === v);
  if (!x) return false;
  audio.currentTime = x.s;
  return true;
}

export function setRecordingRate(rate: number) {
  if (audio) audio.playbackRate = rate;
}

/**
 * iPhones (and some Android browsers) only allow sound that starts inside a tap. A single tap on a verse
 * waits briefly to rule out a double tap, so later playback can fall outside the tap. Unlock both the
 * speech engine and the audio element on the first touch/click of each page visit.
 */
let unlocked = false;
const SILENT =
  "data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQxAADB8AhSmxhIIEVCSiJrDCQBTcu3UrAIwUdkRgQbFAZC1CQEwTJ9mjRvBA4UOLD8nKVOWfh+UlK3z/177OXrfOdKl7pyn3Xf//WreyTRUoAWgBgkOAGbZHBgG1OF6zM82DWbZaUmMBptgQhGjsyYqc9ae9XFz280948NMBWInljyzsNRFLPWdnZGWrddDsjK1unuSrVN9jJsK8KuQtQCtMBjCEtImISdNKJOopIpBFpNSMbIHCSRpRR5iakjTiyzLhchUUBwCgyKiweBv/7UsQbg8isVNoMPMjAAAA0gAAABEVFGmgqK////9bP/6XCykxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";
let speechPrimed = false;
const UNLOCK_EVENTS = ["pointerup", "touchend", "click", "keydown"] as const;
export function unlockAudio() {
  if (unlocked) return;
  try {
    // Only phones/tablets need speech unlocked; on desktops the silent word can wedge Firefox's queue.
    if (speechSupported() && !speechPrimed && !window.speechSynthesis.speaking && matchMedia("(pointer: coarse)").matches) {
      speechPrimed = true;
      const u = new SpeechSynthesisUtterance("a"); // iOS may drop an empty / whitespace utterance
      u.volume = 0;
      window.speechSynthesis.speak(u);
    }
    audio ??= new Audio();
    if (!audio.src) {
      audio.src = SILENT;
      audio
        .play()
        .then(() => {
          audio?.pause();
          if (audio?.src === SILENT) audio.removeAttribute("src");
          unlocked = true;
          UNLOCK_EVENTS.forEach((ev) => window.removeEventListener(ev, unlockAudio, true));
        })
        .catch(() => {
          if (audio?.src === SILENT) audio.removeAttribute("src"); // not a gesture yet: try on the next tap
        });
    } else unlocked = true; // a recording is already playing
  } catch {
    /* nothing to unlock */
  }
}
if (typeof window !== "undefined") UNLOCK_EVENTS.forEach((ev) => window.addEventListener(ev, unlockAudio, true));

// Stop speaking when the page goes away.
if (typeof window !== "undefined") window.addEventListener("pagehide", () => speechSupported() && window.speechSynthesis.cancel());
void current;
