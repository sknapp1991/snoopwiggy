"use client";
/**
 * Sync codes: keep notes, highlights, favorites, progress, goals, plans and settings the same on every
 * device that has the same code. No account: the code is the key. Everything is encrypted on the
 * device (secret-code.ts) before upload; the server stores bytes it can't read.
 *
 * Merging: study items by newest change (deletions are remembered for 90 days); reading activity per
 * device (each device only adds to its own, so totals never double); goals, plans and settings: the
 * most recently changed version wins.
 */
import { useSyncExternalStore } from "react";
import { getOtherActivity, getOwnActivity, setOtherActivity, type Activity } from "./activity";
import { getGoals, setGoals, type Goal } from "./goals";
import { getStartedPlans, setStartedPlans } from "./plans";
import { deriveKeys, newCode, normalizeCode, open, seal, type CodeKeys } from "./secret-code";
import { getSettings, SYNCED_SETTINGS, updateSettings, type Settings } from "./settings";
import { onLocalChange, setStamp, stampOf } from "./stamps";
import { allItems, getDeleted, mergeFromSync, onStudyChange, type StudyItem } from "./study";

type Payload = {
  v: 1;
  at: number;
  items: StudyItem[];
  deleted: Record<string, number>;
  activity: Record<string, Activity>;
  goals: { at: number; list: Goal[] };
  plans: { at: number; data: Record<string, { start: number }> };
  settings: { at: number; data: Partial<Settings> };
  devices: Record<string, { name: string; seen: number }>;
};

type Saved = { code: string; device: string; etag: string | null; last: number };
export type SyncState = { on: boolean; code: string | null; status: "off" | "syncing" | "ok" | "error"; last: number; error: string | null; devices: number };

const KEY = "va-sync:v1";
let state: SyncState = { on: false, code: null, status: "off", last: 0, error: null, devices: 0 };
const OFF = state;
const subs = new Set<() => void>();
const set = (p: Partial<SyncState>) => {
  state = { ...state, ...p };
  subs.forEach((l) => l());
};
export function useSync() {
  return useSyncExternalStore(
    (l) => {
      subs.add(l);
      return () => subs.delete(l);
    },
    () => state,
    () => OFF,
  );
}

function readSaved(): Saved | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as Saved | null;
    return s?.code ? s : null;
  } catch {
    return null;
  }
}
function writeSaved(s: Saved | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode */
  }
}

function deviceName() {
  const ua = navigator.userAgent;
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "Device";
  const br = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "";
  return br ? `${os} · ${br}` : os;
}

let keys: { code: string; k: CodeKeys } | null = null;
async function keysFor(code: string) {
  if (keys?.code !== code) keys = { code, k: await deriveKeys(code, "sync") };
  return keys.k;
}

function pickSettings(s: Settings): Partial<Settings> {
  const out: Record<string, unknown> = {};
  for (const k of SYNCED_SETTINGS) out[k] = s[k];
  return out as Partial<Settings>;
}

/** Merge what's on the server into this device, then build the combined payload to upload. */
async function mergeAndBuild(remote: Payload | null, device: string): Promise<Payload> {
  const now = Date.now();
  let deleted = getDeleted();
  if (remote) {
    deleted = await mergeFromSync(remote.items ?? [], remote.deleted ?? {});
    const others = { ...getOtherActivity() };
    for (const [d, a] of Object.entries(remote.activity ?? {})) if (d !== device) others[d] = a;
    setOtherActivity(others);
    if (remote.goals && remote.goals.at > stampOf("goals")) {
      setGoals(remote.goals.list ?? [], true);
      setStamp("goals", remote.goals.at);
    }
    if (remote.plans && remote.plans.at > stampOf("plans")) {
      setStartedPlans(remote.plans.data ?? {});
      setStamp("plans", remote.plans.at);
    }
    if (remote.settings && remote.settings.at > stampOf("settings")) {
      const patch: Record<string, unknown> = {};
      for (const k of SYNCED_SETTINGS) if (k in remote.settings.data) patch[k] = (remote.settings.data as Record<string, unknown>)[k];
      updateSettings(patch as Partial<Settings>, true);
      setStamp("settings", remote.settings.at);
    }
  }
  const activity: Record<string, Activity> = { ...(remote?.activity ?? {}), ...getOtherActivity(), [device]: getOwnActivity() };
  const devices = { ...(remote?.devices ?? {}), [device]: { name: deviceName(), seen: now } };
  return {
    v: 1,
    at: now,
    items: await allItems(),
    deleted,
    activity,
    goals: { at: stampOf("goals"), list: getGoals() },
    plans: { at: stampOf("plans"), data: getStartedPlans() },
    settings: { at: stampOf("settings"), data: pickSettings(getSettings()) },
    devices,
  };
}

let running: Promise<void> | null = null;
let again = false;

/** Pull, merge, push (retrying if another device wrote in between). */
export function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    const saved = readSaved();
    if (!saved) return;
    set({ status: "syncing", error: null });
    try {
      const k = await keysFor(saved.code);
      for (let attempt = 0; attempt < 4; attempt++) {
        const res = await fetch(`/api/sync/${k.id}`, { cache: "no-store" });
        let remote: Payload | null = null;
        let etag: string | null = null;
        if (res.ok) {
          etag = res.headers.get("etag");
          try {
            remote = await open<Payload>(k.key, await res.arrayBuffer());
          } catch {
            throw new Error("This code’s data couldn’t be unlocked.");
          }
        } else if (res.status !== 404) throw new Error((await res.json().catch(() => null))?.error ?? "Sync is unavailable right now.");
        const payload = await mergeAndBuild(remote, saved.device);
        const put = await fetch(`/api/sync/${k.id}`, {
          method: "PUT",
          headers: { "content-type": "application/octet-stream", ...(etag ? { "if-match": etag } : { "if-none-match": "*" }) },
          body: (await seal(k.key, payload)) as BodyInit,
        });
        if (put.status === 412) continue; // another device just synced: merge again
        if (!put.ok) throw new Error((await put.json().catch(() => null))?.error ?? "Couldn’t upload.");
        const last = Date.now();
        writeSaved({ ...saved, etag: put.headers.get("etag"), last });
        set({ status: "ok", last, devices: Object.keys(payload.devices).length });
        return;
      }
      throw new Error("Other devices are busy syncing. Trying again shortly.");
    } catch (e) {
      set({ status: "error", error: navigator.onLine ? (e as Error).message : "Offline: will sync when you’re back online." });
    }
  })().finally(() => {
    running = null;
    if (again) {
      again = false;
      void syncNow();
    }
  });
  return running;
}

/** Start syncing with a new code (returns it). */
export async function turnOnSync(): Promise<string> {
  const code = newCode();
  writeSaved({ code, device: crypto.randomUUID(), etag: null, last: 0 });
  set({ on: true, code, status: "syncing" });
  await syncNow();
  return code;
}

/** Join an existing code from another device. Returns an error message, or null when joined. */
export async function joinSync(input: string): Promise<string | null> {
  const code = normalizeCode(input);
  if (!code) return "That doesn’t look like a sync code (25 letters and numbers).";
  const k = await deriveKeys(code, "sync");
  const res = await fetch(`/api/sync/${k.id}`, { cache: "no-store" }).catch(() => null);
  if (!res) return "You’re offline.";
  if (res.status === 404) return "No data was found for that code. Check it and try again.";
  if (!res.ok) return "Sync is unavailable right now.";
  try {
    await open(k.key, await res.arrayBuffer());
  } catch {
    return "That code didn’t unlock anything. Check it and try again.";
  }
  const prev = readSaved();
  writeSaved({ code, device: prev?.device ?? crypto.randomUUID(), etag: null, last: 0 });
  set({ on: true, code, status: "syncing" });
  await syncNow();
  return null;
}

/** Stop syncing on this device (data stays here and on the other devices). */
export function turnOffSync() {
  writeSaved(null);
  setOtherActivity({});
  set({ on: false, code: null, status: "off", last: 0, error: null, devices: 0 });
}

/** Delete the synced copy from the server (every device stops syncing on its next try). */
export async function deleteSyncedData() {
  const saved = readSaved();
  if (!saved) return;
  const k = await keysFor(saved.code);
  await fetch(`/api/sync/${k.id}`, { method: "DELETE" });
  turnOffSync();
}

/* ---------- automatic syncing ---------- */

let started = false;
let timer: ReturnType<typeof setTimeout> | undefined;
const soon = (ms = 4000) => {
  if (!readSaved()) return;
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), ms);
};

export function startSync() {
  if (started || typeof window === "undefined") return;
  started = true;
  const saved = readSaved();
  if (saved) set({ on: true, code: saved.code, last: saved.last, status: "ok" });
  // A sync link (#sync=CODE) from a QR code or message: join, then tidy the address bar.
  const m = /[#&]sync=([0-9A-Za-z-]+)/.exec(location.hash);
  if (m) {
    history.replaceState(null, "", location.pathname + location.search);
    void joinSync(m[1]).then((err) => {
      if (err) set({ status: "error", error: err });
    });
  } else if (saved) void syncNow();
  onStudyChange(() => soon());
  onLocalChange(() => soon());
  setInterval(() => document.visibilityState === "visible" && soon(0), 3 * 60_000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") soon(500);
    else if (readSaved()) void syncNow(); // leaving: upload reading time
  });
  window.addEventListener("online", () => soon(500));
}
