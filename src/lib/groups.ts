"use client";
/**
 * Study groups: friends share a group code and see each other's progress. Each member chooses a name
 * and what to share; their card is encrypted with the group's key (only people with the code can read
 * it) and only their own device can change or remove it. No accounts.
 */
import { useSyncExternalStore } from "react";
import { dayKey, getActivity, periodStart, streaks, totals } from "./activity";
import { findBook } from "./catalog";
import { bookProgress } from "./goals";
import { deriveKeys, fromBase64, hex, newCode, normalizeCode, open, seal, type CodeKeys } from "./secret-code";
import { allItems } from "./study";

export type Share = { progress: boolean; reading: boolean };
export type MyGroup = { code: string; name: string; me: string; secret: string; share: Share; joined: number };
export type GroupMeta = { name: string; book?: { work: string; book: string } | null; created: number };
export type Card = {
  name: string;
  at: number;
  streak?: number;
  todayMins?: number;
  weekMins?: number;
  weekChapters?: number;
  studied?: number;
  book?: { done: number; total: number } | null;
  reading?: { work: string; book: string; chapter: number } | null;
};
export type Member = Card & { id: string; mine: boolean };
export type GroupView = { meta: GroupMeta | null; metaEtag: string | null; members: Member[] };

const KEY = "va-groups:v1";
let groups: MyGroup[] | null = null;
const subs = new Set<() => void>();
const NONE: MyGroup[] = [];
export function getGroups(): MyGroup[] {
  if (groups) return groups;
  try {
    const g = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    groups = Array.isArray(g) ? g : [];
  } catch {
    groups = [];
  }
  return groups!;
}
function saveGroups(next: MyGroup[]) {
  groups = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode */
  }
  subs.forEach((l) => l());
}
export function useGroups(): MyGroup[] {
  return useSyncExternalStore(
    (l) => {
      subs.add(l);
      return () => subs.delete(l);
    },
    getGroups,
    () => NONE,
  );
}

const keyCache = new Map<string, Promise<CodeKeys>>();
const keysFor = (code: string) => {
  let p = keyCache.get(code);
  if (!p) keyCache.set(code, (p = deriveKeys(code, "group")));
  return p;
};
const memberId = async (secret: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret)));

/** My card for a group, from what this device knows and what I chose to share. */
async function myCard(g: MyGroup, meta: GroupMeta | null): Promise<Card> {
  const card: Card = { name: g.me.slice(0, 40), at: Date.now() };
  if (g.share.progress) {
    const a = getActivity();
    const items = await allItems();
    const map = new Map(items.map((i) => [i.id, i]));
    const studyDays = items.filter((i) => i.kind === "studied").map((i) => dayKey(i.createdAt));
    const t = totals(a, periodStart("week"));
    const d = a.days[dayKey()];
    card.streak = streaks(a, studyDays).current;
    card.todayMins = d ? Math.round((d.r + d.l) / 60) : 0;
    card.weekMins = Math.round((t.read + t.listen) / 60);
    card.weekChapters = t.chapters;
    card.studied = studyDays.length;
    card.book = meta?.book ? bookProgress(map, meta.book.work, meta.book.book) : null;
  }
  if (g.share.reading) {
    const m = /^\/read\/([^/]+)\/([^/]+)\/(\d+)/.exec(location.pathname);
    card.reading = m ? { work: m[1], book: m[2], chapter: Number(m[3]) } : null;
  }
  return card;
}

async function publish(g: MyGroup, meta: GroupMeta | null) {
  const k = await keysFor(g.code);
  const res = await fetch(`/api/group/${k.id}/${await memberId(g.secret)}`, {
    method: "PUT",
    headers: { "content-type": "application/octet-stream", "x-member-key": g.secret },
    body: (await seal(k.key, await myCard(g, meta))) as BodyInit,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Couldn’t update the group.");
}

/** Everyone's cards (and refresh mine first). */
export async function loadGroup(g: MyGroup, opts: { publishFirst?: boolean } = {}): Promise<GroupView> {
  const k = await keysFor(g.code);
  const get = async () => {
    const res = await fetch(`/api/group/${k.id}`, { cache: "no-store" });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Couldn’t load the group.");
    return (await res.json()) as { meta: { etag: string; data: string } | null; members: { id: string; data: string }[] };
  };
  let raw = await get();
  let meta: GroupMeta | null = null;
  if (raw?.meta) meta = await open<GroupMeta>(k.key, fromBase64(raw.meta.data)).catch(() => null);
  if (opts.publishFirst !== false) {
    await publish(g, meta);
    raw = await get();
  }
  if (!raw) throw new Error("This group no longer exists.");
  const mine = await memberId(g.secret);
  const members: Member[] = [];
  for (const m of raw.members) {
    const c = await open<Card>(k.key, fromBase64(m.data)).catch(() => null);
    if (c) members.push({ ...c, id: m.id, mine: m.id === mine });
  }
  members.sort((a, b) => (b.weekMins ?? -1) - (a.weekMins ?? -1) || a.name.localeCompare(b.name));
  return { meta, metaEtag: raw.meta?.etag ?? null, members };
}

/** Change the group's name or shared book. */
export async function updateMeta(g: MyGroup, meta: GroupMeta, etag: string | null) {
  const k = await keysFor(g.code);
  const res = await fetch(`/api/group/${k.id}`, {
    method: "PUT",
    headers: { "content-type": "application/octet-stream", ...(etag ? { "if-match": etag } : { "if-none-match": "*" }) },
    body: (await seal(k.key, meta)) as BodyInit,
  });
  if (res.status === 412) throw new Error("Someone else just changed the group. Try again.");
  if (!res.ok) throw new Error("Couldn’t save.");
  if (meta.name !== g.name) saveGroups(getGroups().map((x) => (x.code === g.code ? { ...x, name: meta.name } : x)));
}

const secret = () => hex(crypto.getRandomValues(new Uint8Array(24)).buffer);

export async function createGroup(name: string, me: string, book: GroupMeta["book"]): Promise<MyGroup> {
  const g: MyGroup = { code: newCode(), name: name.trim().slice(0, 60) || "Study group", me: me.trim().slice(0, 40) || "Me", secret: secret(), share: { progress: true, reading: false }, joined: Date.now() };
  const meta: GroupMeta = { name: g.name, book: book ?? null, created: Date.now() };
  await updateMeta(g, meta, null);
  await publish(g, meta);
  saveGroups([...getGroups(), g]);
  return g;
}

/** Join with a code or invite link. Returns an error message, or null. */
export async function joinGroup(input: string, me: string): Promise<string | null> {
  const code = normalizeCode(input.replace(/^.*[#&]group=/, ""));
  if (!code) return "That doesn’t look like a group code.";
  if (getGroups().some((g) => g.code === code)) return "You’re already in this group.";
  const g: MyGroup = { code, name: "Study group", me: me.trim().slice(0, 40) || "Me", secret: secret(), share: { progress: true, reading: false }, joined: Date.now() };
  try {
    const view = await loadGroup(g, { publishFirst: false });
    if (!view.meta) return "That code didn’t unlock a group. Check it and try again.";
    g.name = view.meta.name;
    await publish(g, view.meta);
  } catch (e) {
    return (e as Error).message === "This group no longer exists." ? "No group was found for that code." : (e as Error).message;
  }
  saveGroups([...getGroups(), g]);
  return null;
}

export async function leaveGroup(g: MyGroup) {
  const k = await keysFor(g.code);
  await fetch(`/api/group/${k.id}/${await memberId(g.secret)}`, { method: "DELETE", headers: { "x-member-key": g.secret } }).catch(() => null);
  saveGroups(getGroups().filter((x) => x.code !== g.code));
}

export function updateMyGroup(code: string, patch: Partial<Pick<MyGroup, "me" | "share">>) {
  saveGroups(getGroups().map((x) => (x.code === code ? { ...x, ...patch } : x)));
}

export const inviteLink = (g: MyGroup) => `${location.origin}/#group=${g.code}`;
export const bookLabel = (b: GroupMeta["book"]) => (b ? (findBook(b.work, b.book)?.name ?? b.book) : null);

/** Keep my cards fresh while reading (every 5 minutes, and when leaving the page). */
let started = false;
export function startGroups() {
  if (started || typeof window === "undefined") return;
  started = true;
  const refresh = () => {
    for (const g of getGroups()) void loadGroup(g).catch(() => null);
  };
  if (getGroups().length) setTimeout(refresh, 8000);
  setInterval(() => document.visibilityState === "visible" && getGroups().length && refresh(), 5 * 60_000);
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && getGroups().length && refresh());
}

/** An invite link was opened (#group=CODE): returns the code to offer joining. */
export function pendingInvite(): string | null {
  const m = /[#&]group=([0-9A-Za-z-]+)/.exec(location.hash);
  return m ? normalizeCode(m[1]) : null;
}
