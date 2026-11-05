"use client";
/**
 * Built-in AI study companion (Gemini free tier via /api/ask): a floating window inside the app.
 * - The reader publishes what is on screen (chapter, versions, passage text) with setReadingContext,
 *   so every question is asked "about what I'm reading" without copying anything.
 * - A verse can be attached from the verse menu (all visible translations of it).
 * - Conversation, window position/size and minimized state are kept on this device.
 */
import { useSyncExternalStore } from "react";
import type { StudyRef } from "./storage";

/** `at`: the verse (or chapter) the question was about — where "Save as note" puts the answer. */
export type ChatMsg = { role: "user" | "model"; text: string; ref?: string; error?: boolean; at?: StudyRef };
export type AttachedVerse = { reference: string; at?: StudyRef; texts: { abbr: string; name: string; language: string; text: string }[] };
export type ReadingContext = {
  /** Where the reader is (for links and notes). */
  at: StudyRef;
  reference: string; // "John 3"
  work: string; // "Bible"
  versions: { abbr: string; name: string; language: string }[];
  /** Chapter text of the visible versions (built when a question is sent). */
  passage: () => string;
};
export type WinBox = { x: number; y: number; w: number; h: number };

type Chat = {
  open: boolean;
  minimized: boolean;
  busy: boolean;
  messages: ChatMsg[];
  attached: AttachedVerse | null;
  box: WinBox | null;
  /** Server has an AI key configured (null = not checked yet). */
  ready: boolean | null;
};

const KEY = "gs:ai:v1";
let chat: Chat = { open: false, minimized: false, busy: false, messages: [], attached: null, box: null, ready: null };
const SERVER = chat;
let loaded = false;
let readingCtx: ReadingContext | null = null;
const subs = new Set<() => void>();

function persist() {
  try {
    const { open, minimized, messages, box } = chat;
    localStorage.setItem(KEY, JSON.stringify({ open, minimized, messages: messages.slice(-40), box }));
  } catch {
    /* private mode */
  }
}
function set(patch: Partial<Chat>, save = true) {
  chat = { ...chat, ...patch };
  if (save) persist();
  subs.forEach((l) => l());
}
function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Chat>;
    chat = {
      ...chat,
      open: !!s.open,
      minimized: !!s.minimized,
      messages: Array.isArray(s.messages) ? s.messages.filter((m) => m && typeof m.text === "string") : [],
      box: s.box ?? null,
    };
  } catch {
    /* ignore */
  }
  fetch("/api/ask")
    .then((r) => (r.ok ? r.json() : { ready: false }))
    .then((d: { ready?: boolean }) => set({ ready: !!d.ready }, false))
    .catch(() => set({ ready: false }, false));
}

export function useAiChat() {
  return useSyncExternalStore(
    (l) => {
      load();
      subs.add(l);
      return () => subs.delete(l);
    },
    () => chat,
    () => SERVER,
  );
}

export const setReadingContext = (c: ReadingContext | null) => {
  readingCtx = c;
  set({}, false); // new snapshot: the window's title shows the chapter
};
export const getReadingContext = () => readingCtx;

export const openAi = () => set({ open: true, minimized: false });
export const minimizeAi = () => set({ minimized: true });
export const closeAi = () => set({ open: false, minimized: false });
export const setAiBox = (box: WinBox) => set({ box });
export const detachVerse = () => set({ attached: null }, false);
export const clearAiChat = () => set({ messages: [], attached: null });
export function askAboutVerse(v: AttachedVerse) {
  set({ open: true, minimized: false, attached: v });
}

let controller: AbortController | null = null;
export function stopAi() {
  controller?.abort();
}

export async function sendAi(question: string) {
  const q = question.trim();
  if (chat.busy || (!q && !chat.attached)) return;
  const ctx = readingCtx;
  const attached = chat.attached;
  const at = attached?.at ?? ctx?.at;
  const userMsg: ChatMsg = { role: "user", text: q || "Please explain this verse.", ref: attached?.reference, at };
  const history = [...chat.messages, userMsg];
  set({ messages: [...history, { role: "model", text: "", at }], busy: true, attached: null });

  controller = new AbortController();
  let text = "";
  const update = (patch: Partial<ChatMsg>) => {
    const msgs = chat.messages.slice();
    msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], ...patch };
    set({ messages: msgs }, false);
  };
  try {
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        context: ctx
          ? { reference: ctx.reference, work: ctx.work, versions: ctx.versions, passage: ctx.passage().slice(0, 24000) }
          : null,
        verse: attached,
        // Earlier turns: text only, the newest last (the server trims further).
        messages: history.slice(-16).map((m) => ({ role: m.role, text: (m.ref ? `[About ${m.ref}] ` : "") + m.text.slice(0, 4000) })),
      }),
    });
    if (!res.ok || !res.body) {
      const err = ((await res.json().catch(() => ({}))) as { error?: string }).error;
      update({ text: err ?? `Something went wrong (error ${res.status}).`, error: true });
    } else {
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += dec.decode(value, { stream: true });
        update({ text });
      }
      if (!text.trim()) update({ text: "No answer came back — please try again.", error: true });
    }
  } catch (e) {
    if ((e as Error).name === "AbortError") update({ text: text ? text + " …(stopped)" : "(stopped)" });
    else update({ text: "Couldn’t reach the AI. Check your connection and try again.", error: true });
  } finally {
    controller = null;
    set({ busy: false });
  }
}
