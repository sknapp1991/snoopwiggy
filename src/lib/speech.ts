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
  error: string | null;
};

const IDLE: SpeechState = {
  open: false,
  status: "idle",
  version: null,
  chapterKey: null,
  verse: null,
  continuePending: false,
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
  return (
    list.find((v) => v.voiceURI === savedUri) ??
    list.find((v) => /natural|neural|online/i.test(v.name)) ??
    list.find((v) => /google/i.test(v.name)) ??
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

export type WordPos = { verse: string; word: number } | null;
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
  const next = () => {
    if (my !== token) return;
    if (p > 0) base += countWords(parts[p - 1]);
    if (p >= parts.length) {
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
      emitWord({ verse: item.v, word: chunkBase + countWords(chunkText.slice(0, e.charIndex)) });
    };
    u.onend = next;
    u.onerror = (e) => {
      if (my !== token || e.error === "interrupted" || e.error === "canceled") return;
      set({ status: "idle", error: e.error === "not-allowed" ? "Tap play to start reading." : `Speech stopped (${e.error}).` });
    };
    current = u;
    window.speechSynthesis.speak(u);
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
  set({ open: true, version: opts.version, chapterKey: opts.chapterKey, continuePending: false, status: "playing" });
  const r = run;
  // Some browsers ignore speak() right after cancel(); a short delay avoids it.
  setTimeout(() => speakItem(r, my), 60);
}

/** Index of the verse being read in the current queue. */
export function currentIndex() {
  return run ? run.index : -1;
}

export function pause() {
  token++;
  emitWord(null);
  releaseWake();
  window.speechSynthesis?.cancel();
  current = null;
  set({ status: "paused" });
}

export function stop() {
  token++;
  emitWord(null);
  releaseWake();
  run = null;
  current = null;
  if (speechSupported()) window.speechSynthesis.cancel();
  set({ status: "idle", verse: null, continuePending: false });
}

export function close() {
  stop();
  set({ open: false, error: null });
}

// Stop speaking when the page goes away.
if (typeof window !== "undefined") window.addEventListener("pagehide", () => speechSupported() && window.speechSynthesis.cancel());
void current;
