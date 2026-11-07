"use client";
/** Small shared UI state: which side panel is open, the verse action menu, and toast messages. */
import { useSyncExternalStore } from "react";
import type { StudyRef } from "./storage";

export type Panel = "search" | "study" | "progress" | null;
/** `version`: the column that was tapped (read aloud uses it). */
export type VerseMenuState = (StudyRef & { verse: string; focus?: "note" | "ask"; version?: string }) | null;
type Ui = { panel: Panel; menu: VerseMenuState; toast: { id: number; text: string } | null };

let ui: Ui = { panel: null, menu: null, toast: null };
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


let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(text: string, ms = 2600) {
  clearTimeout(toastTimer);
  set({ toast: { id: Date.now(), text } });
  toastTimer = setTimeout(() => set({ toast: null }), ms);
}
