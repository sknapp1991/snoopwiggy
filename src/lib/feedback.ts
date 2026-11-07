"use client";
/**
 * "Report a problem": what the feedback form is about, and the details gathered for the report
 * automatically (page, versions on screen, the verse, device and recent errors) so people only
 * have to say what went wrong. Everything gathered is shown in the form before it is sent.
 */
import { useSyncExternalStore } from "react";

export type FeedbackTopic = "text" | "audio" | "bug" | "idea" | "other";
export type FeedbackVerse = { reference: string; texts: { abbr: string; language: string; text: string }[] };
export type FeedbackRequest = { topic?: FeedbackTopic; verse?: FeedbackVerse; versions?: string[]; error?: string; message?: string };

let current: FeedbackRequest | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((l) => l());

export const openFeedback = (req: FeedbackRequest = {}) => {
  current = req;
  emit();
};
export const closeFeedback = () => {
  current = null;
  emit();
};
export function useFeedback() {
  return useSyncExternalStore(
    (l) => {
      subs.add(l);
      return () => subs.delete(l);
    },
    () => current,
    () => null,
  );
}

// Recent errors on this page (kept in memory only, sent only with a report).
const errors: string[] = [];
let capturing = false;
const keep = (s: string) => {
  errors.push(`${new Date().toISOString().slice(11, 19)} ${s.slice(0, 400)}`);
  if (errors.length > 12) errors.shift();
};
export function captureErrors() {
  if (capturing || typeof window === "undefined") return;
  capturing = true;
  window.addEventListener("error", (e) => keep(`${e.message}${e.filename ? ` (${e.filename.split("/").pop()}:${e.lineno})` : ""}`));
  window.addEventListener("unhandledrejection", (e) => keep(`Unhandled: ${String((e.reason as Error)?.stack ?? e.reason)}`));
  const orig = console.error;
  console.error = (...args: unknown[]) => {
    try {
      keep(args.map((a) => (a instanceof Error ? (a.stack ?? a.message) : typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    } catch {
      /* unserialisable */
    }
    orig.apply(console, args);
  };
}

function settingsSummary(): unknown {
  try {
    const s = JSON.parse(localStorage.getItem("gs:settings:v1") ?? "null");
    if (!s || typeof s !== "object") return null;
    // Preferences only; saved setups' names and colours aren't needed to fix a problem.
    const rest = { ...(s as Record<string, unknown>) };
    for (const k of ["setups", "palette", "versionColors", "tabsRecent"]) delete rest[k];
    const out = JSON.stringify(rest);
    return out.length > 3000 ? `${out.slice(0, 3000)}…` : rest;
  } catch {
    return null;
  }
}

/** The details sent with a report. */
export function gatherDetails(req: FeedbackRequest) {
  const nav = navigator as Navigator & { standalone?: boolean };
  const app = document.referrer.startsWith("android-app://")
    ? "Android app"
    : matchMedia("(display-mode: standalone)").matches || nav.standalone
      ? "installed web app"
      : "browser";
  return {
    page: location.pathname + location.search + location.hash,
    title: document.title,
    ...(req.versions?.length ? { versionsOnScreen: req.versions } : {}),
    ...(req.verse ? { verse: req.verse } : {}),
    ...(document.querySelector('[role="region"][aria-label="Read aloud"]') ? { audioPlayerOpen: true } : {}),
    ...(req.error ? { error: req.error } : {}),
    ...(errors.length ? { recentErrors: [...errors] } : {}),
    device: {
      browser: navigator.userAgent,
      app,
      screen: `${screen.width}×${screen.height} @${devicePixelRatio}x`,
      window: `${innerWidth}×${innerHeight}`,
      language: navigator.language,
      theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
      online: navigator.onLine,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    settings: settingsSummary(),
    build: process.env.NEXT_PUBLIC_BUILD ?? "dev",
    sent: new Date().toISOString(),
  };
}
