"use client";
/**
 * Display settings remembered on this device (localStorage). Small external store so
 * components read it with useSyncExternalStore (no hydration mismatch, no effects).
 * Phase 3 extends this; later it can sync to a user account.
 */
import { useSyncExternalStore } from "react";
import { STORAGE_KEY } from "./theme-script";

export type ViewMode = "column" | "stacked";
export type Theme = "light" | "dark" | "system";

export type Settings = {
  /** null = automatic (Column on wide screens, Stacked on phones) */
  view: ViewMode | null;
  fontSize: number; // px
  theme: Theme;
  /** last chosen versions per work, used when the URL has no ?v= */
  versions: Record<string, string[]>;
};

export const FONT_MIN = 14;
export const FONT_MAX = 28;
const DEFAULTS: Settings = { view: null, fontSize: 18, theme: "system", versions: {} };

let current: Settings | null = null;
const listeners = new Set<() => void>();

function read(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const p = JSON.parse(raw) as Partial<Settings>;
    return {
      view: p.view === "column" || p.view === "stacked" ? p.view : null,
      fontSize:
        typeof p.fontSize === "number" ? Math.min(FONT_MAX, Math.max(FONT_MIN, Math.round(p.fontSize))) : DEFAULTS.fontSize,
      theme: p.theme === "light" || p.theme === "dark" ? p.theme : "system",
      versions: p.versions && typeof p.versions === "object" ? p.versions : {},
    };
  } catch {
    return DEFAULTS;
  }
}

function snapshot() {
  if (!current) current = read();
  return current;
}

export function updateSettings(patch: Partial<Settings>) {
  current = { ...snapshot(), ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    /* private mode / storage full: keep in memory */
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      current = read();
      l();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, snapshot, () => DEFAULTS);
}

const mediaSubscribers = new Map<string, (l: () => void) => () => void>();
function subscribeMedia(query: string) {
  let fn = mediaSubscribers.get(query);
  if (!fn) {
    fn = (l: () => void) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", l);
      return () => m.removeEventListener("change", l);
    };
    mediaSubscribers.set(query, fn);
  }
  return fn;
}

export function useMediaQuery(query: string, serverValue = false) {
  return useSyncExternalStore(
    subscribeMedia(query),
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

export const WIDE_QUERY = "(min-width: 768px)";

/** Effective view: the saved choice, or automatic by screen width. */
export function useViewMode(): ViewMode {
  const { view } = useSettings();
  const wide = useMediaQuery(WIDE_QUERY, true);
  return view ?? (wide ? "column" : "stacked");
}
