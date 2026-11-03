"use client";
/**
 * Recorded audio (audio v2): chapter MP3s made offline with an open-licence TTS model
 * (scripts/tts/generate.py). Unlike the browser's voices they keep playing with the screen locked.
 * The list of recordings is AUDIO_BASE/index.json, next to the files (scripts/tts/catalog.ts), so new
 * voices appear without a code change, and nothing is listed where no files were uploaded.
 */
import { useSyncExternalStore } from "react";

export type Recording = {
  /** "<version>/<voice>" */
  id: string;
  version: string;
  voice: string;
  /** e.g. "Heart · US English (female)" */
  label: string;
  engine: string;
  license: string;
  /** Only these chapters exist (book → chapters); omitted = every chapter. */
  chapters?: Record<string, number[]>;
};

/** Where the files are served from: Cloudflare R2 in production, /audio (public/audio) locally. */
export const AUDIO_BASE = (process.env.NEXT_PUBLIC_AUDIO_BASE || "/audio").replace(/\/$/, "");

const EMPTY: Recording[] = [];
let list: Recording[] = EMPTY;
let started = false;
const subs = new Set<() => void>();

function load() {
  if (started) return;
  started = true;
  fetch(`${AUDIO_BASE}/index.json`)
    .then((r) => (r.ok ? r.json() : { recordings: [] }))
    .then((d: { recordings?: Recording[] }) => {
      list = Array.isArray(d.recordings) ? d.recordings : EMPTY;
      subs.forEach((l) => l());
    })
    .catch(() => {});
}

export function useRecordings(): Recording[] {
  return useSyncExternalStore(
    (l) => {
      subs.add(l);
      load();
      return () => subs.delete(l);
    },
    () => list,
    () => EMPTY,
  );
}

export const getRecordings = () => list;

export function hasChapter(r: Recording, book: string, chapter: number) {
  return !r.chapters || !!r.chapters[book]?.includes(chapter);
}

export const audioUrl = (r: Recording, book: string, chapter: number) => `${AUDIO_BASE}/${r.version}/${r.voice}/${book}/${chapter}.mp3`;
export const timingUrl = (r: Recording, book: string, chapter: number) => `${AUDIO_BASE}/${r.version}/${r.voice}/${book}/${chapter}.json`;
