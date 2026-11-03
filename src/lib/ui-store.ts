"use client";
/** Small shared UI state: which side panel is open, the verse action menu, and toast messages. */
import { useSyncExternalStore } from "react";
import type { StudyRef } from "./storage";

export type Panel = "search" | "study" | "ask" | null;
export type VerseMenuState = (StudyRef & { verse: string; focus?: "note" | "ask" }) | null;
export type AskContext = StudyRef & { verse: string; texts: { abbr: string; language: string; text: string; dir: "ltr" | "rtl"; lang: string; name: string }[] };
type Ui = { panel: Panel; menu: VerseMenuState; toast: { id: number; text: string } | null; ask: AskContext | null };

let ui: Ui = { panel: null, menu: null, toast: null, ask: null };
const SERVER: Ui = ui;
const subs = new Set<() => void>();
const set = (patch: Partial<Ui>) => {
  ui = { ...ui, ...patch };
  subs.forEach((l) => l());
};

export function useUi() {
  return useSyncExternalStore(
    (l) => {
      subs.add(l);
      return () => subs.delete(l);
    },
    () => ui,
    () => SERVER,
  );
}

export const openPanel = (panel: Panel) => set({ panel });
export const closePanel = () => set({ panel: null });
export const togglePanel = (panel: Exclude<Panel, null>) => set({ panel: ui.panel === panel ? null : panel });

export const openVerseMenu = (menu: NonNullable<VerseMenuState>) => set({ menu });
export const closeVerseMenu = () => set({ menu: null });

/** Built-in Ask AI panel (feature-flagged) for one verse. */
export const openAsk = (ctx: AskContext) => set({ ask: ctx, panel: "ask", menu: null });

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(text: string, ms = 2600) {
  clearTimeout(toastTimer);
  set({ toast: { id: Date.now(), text } });
  toastTimer = setTimeout(() => set({ toast: null }), ms);
}
