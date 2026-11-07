"use client";
/**
 * Personal goals (on this device): a daily or weekly target for minutes, verses or chapters, or
 * "finish this book by a date". Progress comes from activity.ts and the studied chapters.
 */
import { useSyncExternalStore } from "react";
import { dayKey, periodStart, totals, type Activity } from "./activity";
import { findBook } from "./catalog";
import type { StudyItem } from "./storage";
import { touch } from "./stamps";

export type Metric = "time" | "read" | "listen" | "verses" | "chapters";
export type Goal =
  | { id: string; type: "amount"; metric: Metric; period: "day" | "week"; target: number }
  | { id: string; type: "book"; work: string; book: string; by: string; from: string };

export const METRICS: { id: Metric; label: string; unit: string }[] = [
  { id: "time", label: "Reading or listening", unit: "min" },
  { id: "read", label: "Reading", unit: "min" },
  { id: "listen", label: "Listening", unit: "min" },
  { id: "verses", label: "Verses read", unit: "verses" },
  { id: "chapters", label: "Chapters read", unit: "chapters" },
];

const KEY = "va-goals:v1";
let goals: Goal[] | null = null;
const subs = new Set<() => void>();
const NONE: Goal[] = [];

export function getGoals(): Goal[] {
  if (goals) return goals;
  try {
    const g = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    goals = Array.isArray(g) ? (g as Goal[]) : [];
  } catch {
    goals = [];
  }
  return goals;
}
export function setGoals(next: Goal[], fromSync = false) {
  goals = next;
  if (!fromSync) touch("goals");
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode */
  }
  subs.forEach((l) => l());
}
export function useGoals(): Goal[] {
  return useSyncExternalStore(
    (l) => {
      subs.add(l);
      return () => subs.delete(l);
    },
    getGoals,
    () => NONE,
  );
}
type NewGoal = Goal extends infer G ? (G extends Goal ? Omit<G, "id"> : never) : never;
export const addGoal = (g: NewGoal) => setGoals([...getGoals(), { ...g, id: Math.random().toString(36).slice(2, 9) } as Goal]);
export const removeGoal = (id: string) => setGoals(getGoals().filter((g) => g.id !== id));

/** Studied chapters of a book, and its total. */
export function bookProgress(items: Map<string, StudyItem>, work: string, book: string) {
  const total = findBook(work, book)?.chapters ?? 0;
  let done = 0;
  for (const it of items.values()) if (it.kind === "studied" && it.work === work && it.book === book) done++;
  return { done: Math.min(done, total), total };
}

export type GoalProgress = { value: number; target: number; done: boolean; label: string; detail: string };

export function goalProgress(g: Goal, a: Activity, items: Map<string, StudyItem>): GoalProgress {
  if (g.type === "book") {
    const { done, total } = bookProgress(items, g.work, g.book);
    const name = findBook(g.work, g.book)?.name ?? g.book;
    const daysLeft = Math.max(0, Math.round((new Date(`${g.by}T12:00:00`).getTime() - new Date(`${dayKey()}T12:00:00`).getTime()) / 86_400_000));
    const left = total - done;
    const perDay = daysLeft > 0 ? Math.ceil(left / daysLeft) : left;
    const by = new Date(`${g.by}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return {
      value: done,
      target: total,
      done: total > 0 && done >= total,
      label: `Finish ${name} by ${by}`,
      detail:
        total > 0 && done >= total
          ? "Finished!"
          : daysLeft > 0
            ? `${done} of ${total} chapters studied · about ${perDay} a day to finish on time`
            : `${done} of ${total} chapters studied · ${left} to go`,
    };
  }
  const t = totals(a, periodStart(g.period));
  const value =
    g.metric === "time" ? t.read + t.listen : g.metric === "read" ? t.read : g.metric === "listen" ? t.listen : g.metric === "verses" ? t.verses : t.chapters;
  const minutes = g.metric === "time" || g.metric === "read" || g.metric === "listen";
  const v = minutes ? Math.floor(value / 60) : value;
  const m = METRICS.find((x) => x.id === g.metric)!;
  const what = minutes ? `${g.target} min of ${m.label.toLowerCase()}` : `${g.target} ${m.unit}`;
  return {
    value: v,
    target: g.target,
    done: v >= g.target,
    label: `${what} ${g.period === "day" ? "a day" : "a week"}`,
    detail: `${Math.min(v, g.target)} of ${g.target} ${m.unit} ${g.period === "day" ? "today" : "this week"}`,
  };
}
