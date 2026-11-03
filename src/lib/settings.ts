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
  /** last chosen versions per work (in display order), used when the URL has no ?v= */
  versions: Record<string, string[]>;
  /** Column view: minimum column width in rem (null = automatic). Separate values for phone landscape. */
  colWidth: number | null;
  colWidthLandscape: number | null;
  /** Stacked view: maximum reading width in rem (null = automatic). */
  stackWidth: number | null;
  /** Colour each language's text differently (Stacked and Column views). */
  langColors: boolean;
  /** Per-language colour overrides, e.g. { es: "#dc2626" }. */
  palette: Record<string, string>;
  /** Open reading tabs ("bible/mat/5") and the active one. */
  tabs: string[];
};

export const FONT_MIN = 10;
export const FONT_MAX = 32;
export const COL_MIN = 10, COL_MAX = 40; // rem
export const STACK_MIN = 24, STACK_MAX = 100; // rem
export const MAX_TABS = 12;

/** Colour-blind-friendly defaults (Okabe–Ito based), tuned for both themes via CSS mix. */
export const DEFAULT_PALETTE: Record<string, string> = {
  en: "", // base language keeps the normal text colour
  es: "#d55e00",
  fr: "#0072b2",
  it: "#009e73",
  pt: "#2b6cb0",
  de: "#7c3aed",
  ru: "#b45309",
  la: "#6b7280",
  el: "#0e7490",
  ar: "#be185d",
  he: "#4d7c0f",
};

const DEFAULTS: Settings = {
  view: null,
  fontSize: 18,
  theme: "system",
  versions: {},
  colWidth: null,
  colWidthLandscape: null,
  stackWidth: null,
  langColors: false,
  palette: {},
  tabs: [],
};

const num = (v: unknown, lo: number, hi: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null;

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
      colWidth: num(p.colWidth, COL_MIN, COL_MAX),
      colWidthLandscape: num(p.colWidthLandscape, COL_MIN, COL_MAX),
      stackWidth: num(p.stackWidth, STACK_MIN, STACK_MAX),
      langColors: p.langColors === true,
      palette: p.palette && typeof p.palette === "object" ? p.palette : {},
      tabs: Array.isArray(p.tabs) ? p.tabs.filter((t): t is string => typeof t === "string").slice(0, MAX_TABS) : [],
    };
  } catch {
    return DEFAULTS;
  }
}

function snapshot() {
  if (!current) current = read();
  return current;
}

/** Current settings, read straight from the store (use inside effects/handlers, not for rendering). */
export function getSettings(): Settings {
  return snapshot();
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

export const WIDE_QUERY = "(min-width: 768px) and (min-height: 501px)";
/** A phone turned sideways: wide enough for 2–3 columns but short. */
export const PHONE_LANDSCAPE_QUERY = "(orientation: landscape) and (max-height: 500px)";

export function languageColor(settings: Settings, lang: string): string | undefined {
  if (!settings.langColors) return undefined;
  return (settings.palette[lang] ?? DEFAULT_PALETTE[lang]) || undefined;
}

/** Effective view: the saved choice, or automatic by screen width. */
export function useViewMode(): ViewMode {
  const { view } = useSettings();
  const wide = useMediaQuery(WIDE_QUERY, true);
  const landscape = useMediaQuery(PHONE_LANDSCAPE_QUERY, false);
  return view ?? (wide || landscape ? "column" : "stacked");
}
