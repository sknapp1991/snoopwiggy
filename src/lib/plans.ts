"use client";
/**
 * Reading plans: a scripture split into daily readings. Progress is the "studied" mark on each chapter
 * (the same tick as "Mark as studied" at the end of a chapter, so it shows in My Study and the library).
 * The plans you've started (and when) are kept on this device.
 */
import { useSyncExternalStore } from "react";
import { booksOfWork, type BookRef } from "./catalog";
import { touch } from "./stamps";

export type PlanDef = { id: string; name: string; blurb: string; days: number; chapters: () => BookRef[]; weights?: () => number[] };

const QURAN_VERSES = [7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,98,135,112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,182,88,75,85,54,53,89,59,37,35,38,29,18,45,60,49,62,55,78,96,29,22,24,13,14,11,11,18,12,12,30,52,52,44,28,28,20,56,40,31,50,40,46,42,29,19,36,25,22,17,19,26,30,20,15,21,11,8,8,19,5,8,8,11,11,8,3,9,5,4,7,3,6,3,5,4,5,6]; // prettier-ignore

/** All chapters of these books (by collection or ids), in reading order. */
function chaptersOf(work: string, pick: (b: ReturnType<typeof booksOfWork>[number]) => boolean): BookRef[] {
  return booksOfWork(work)
    .filter(pick)
    .flatMap((b) => Array.from({ length: b.chapters ?? 0 }, (_, i) => ({ work, book: b.id, chapter: i + 1 })));
}

export const PLANS: PlanDef[] = [
  { id: "gospels-30", name: "The Gospels in 30 days", blurb: "Matthew, Mark, Luke and John — about 3 chapters a day.", days: 30, chapters: () => chaptersOf("bible", (b) => ["mat", "mrk", "luk", "jhn"].includes(b.id)) },
  { id: "psalms-30", name: "Psalms in 30 days", blurb: "5 psalms a day.", days: 30, chapters: () => chaptersOf("bible", (b) => b.id === "psa") },
  { id: "nt-90", name: "New Testament in 90 days", blurb: "About 3 chapters a day.", days: 90, chapters: () => chaptersOf("bible", (b) => b.collection.id === "nt") },
  { id: "bible-365", name: "The Bible in a year", blurb: "Old and New Testaments — about 3 chapters a day.", days: 365, chapters: () => chaptersOf("bible", (b) => b.collection.id === "ot" || b.collection.id === "nt") },
  { id: "torah-50", name: "The Torah in 50 days", blurb: "Genesis to Deuteronomy, about 4 chapters a day.", days: 50, chapters: () => chaptersOf("tanakh", (b) => b.collection.id === "torah") },
  {
    id: "quran-30",
    name: "The Quran in 30 days",
    blurb: "About 200 verses a day (whole surahs, balanced by length).",
    days: 30,
    chapters: () => chaptersOf("quran", () => true),
    weights: () => QURAN_VERSES,
  },
  { id: "gita-18", name: "Bhagavad Gita in 18 days", blurb: "One chapter a day.", days: 18, chapters: () => chaptersOf("gita", () => true) },
  { id: "dhp-26", name: "Dhammapada in 26 days", blurb: "One chapter (vagga) a day.", days: 26, chapters: () => chaptersOf("dhammapada", () => true) },
  { id: "mn-76", name: "Middle Discourses in 76 days", blurb: "Two suttas of the Majjhima Nikāya a day.", days: 76, chapters: () => chaptersOf("tipitaka", (b) => b.id === "mn") },
  { id: "ys-4", name: "Yoga Sutras in 4 days", blurb: "One book a day.", days: 4, chapters: () => chaptersOf("yoga-sutras", () => true) },
];

/** Split chapters into `days` readings, balancing by weight (verse counts) when given. */
export function planDays(p: PlanDef): BookRef[][] {
  const ch = p.chapters();
  const w = p.weights?.() ?? ch.map(() => 1);
  const total = w.reduce((a, b) => a + b, 0);
  const days: BookRef[][] = Array.from({ length: p.days }, () => []);
  let acc = 0;
  ch.forEach((c, i) => {
    // Put the chapter on the day where its middle falls.
    const mid = acc + w[i] / 2;
    days[Math.min(p.days - 1, Math.floor((mid / total) * p.days))].push(c);
    acc += w[i];
  });
  return days.filter((d) => d.length);
}

/* ---------- started plans (this device) ---------- */

const KEY = "gs:plans:v1";
type Started = Record<string, { start: number }>;
let started: Started | null = null;
const subs = new Set<() => void>();
const EMPTY: Started = {};
function read(): Started {
  if (started) return started;
  try {
    started = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Started;
  } catch {
    started = {};
  }
  return started;
}
/** Replace the started plans (from sync). */
export const setStartedPlans = (next: Started) => write(next, true);
export const getStartedPlans = () => read();
function write(next: Started, fromSync = false) {
  started = next;
  if (!fromSync) touch("plans");
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode */
  }
  subs.forEach((l) => l());
}
export function useStartedPlans(): Started {
  return useSyncExternalStore(
    (l) => {
      subs.add(l);
      return () => subs.delete(l);
    },
    read,
    () => EMPTY,
  );
}
export const startPlan = (id: string) => write({ ...read(), [id]: { start: Date.now() } });
export const stopPlan = (id: string) => {
  const next = { ...read() };
  delete next[id];
  write(next);
};
/** 0-based day number since the plan started (calendar days, local time). */
export function dayIndex(start: number, now = Date.now()) {
  const a = new Date(start);
  const b = new Date(now);
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86_400_000);
}
