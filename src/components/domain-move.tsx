"use client";
/**
 * VersesAcross lives at versesacross.com. Older addresses (snoopwiggy.com, www.*) forward there —
 * and take the visitor's saved data along, because browsers keep it per address: settings, tabs,
 * reading positions, and highlights / favorites / notes (IndexedDB).
 *
 * The data travels in the URL *fragment* (#…), which browsers never send to any server, gzip +
 * base64url encoded. versesacross.com unpacks it, merges it, cleans the address bar and reloads once.
 */
import { useEffect } from "react";

const OFFICIAL = "versesacross.com";
const OLD_HOSTS = /^(www\.)?snoopwiggy\.com$|^www\.versesacross\.com$/;
const KEYS = ["gs:settings:v1", "gs:pos:v1", "gs:tips:v1"];
const MARK = "#vamove=";
/** On the old address: its data has been sent once already. On versesacross.com: data was received. */
const MOVED = "gs:moved:v1";
const RECEIVED = "gs:received:v1";

type Bundle = { local: Record<string, string>; study: unknown[] };

async function readStudy(): Promise<unknown[]> {
  if (typeof indexedDB === "undefined") return [];
  return new Promise((resolve) => {
    const req = indexedDB.open("globalstudy", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("study", { keyPath: "id" });
    req.onerror = () => resolve([]);
    req.onsuccess = () => {
      try {
        const r = req.result.transaction("study", "readonly").objectStore("study").getAll();
        r.onsuccess = () => resolve(r.result as unknown[]);
        r.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    };
  });
}

async function writeStudy(items: unknown[]) {
  if (!items.length || typeof indexedDB === "undefined") return;
  await new Promise<void>((resolve) => {
    const req = indexedDB.open("globalstudy", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("study", { keyPath: "id" });
    req.onerror = () => resolve();
    req.onsuccess = () => {
      const tx = req.result.transaction("study", "readwrite");
      const store = tx.objectStore("study");
      // Keep whichever copy is newer.
      for (const it of items as { id: string; updatedAt?: number }[]) {
        const g = store.get(it.id);
        g.onsuccess = () => {
          const old = g.result as { updatedAt?: number } | undefined;
          if (!old || (old.updatedAt ?? 0) < (it.updatedAt ?? 0)) store.put(it);
        };
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    };
  });
}

const toB64 = (bytes: Uint8Array) => {
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64 = (s: string) => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

async function gzip(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function gunzip(bytes: Uint8Array): Promise<string> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

async function forward() {
  const local: Record<string, string> = {};
  for (const k of KEYS) {
    const v = localStorage.getItem(k);
    if (v) local[k] = v;
  }
  const study = await readStudy();
  const { pathname, search, hash } = window.location;
  let fragment = hash;
  // Send the saved data only once: later visits must not overwrite newer data on versesacross.com.
  const alreadyMoved = localStorage.getItem(MOVED) === "1";
  if (!alreadyMoved && (Object.keys(local).length || study.length)) {
    localStorage.setItem(MOVED, "1");
    try {
      fragment = MARK + toB64(await gzip(JSON.stringify({ local, study } satisfies Bundle)));
    } catch {
      /* very old browser: move without data */
    }
  }
  window.location.replace(`https://${OFFICIAL}${pathname}${search}${fragment}`);
}

async function receive(encoded: string) {
  try {
    const data = JSON.parse(await gunzip(fromB64(encoded))) as Bundle;
    const first = localStorage.getItem(RECEIVED) !== "1";
    for (const [k, v] of Object.entries(data.local ?? {})) {
      if (!KEYS.includes(k)) continue;
      const mine = localStorage.getItem(k);
      if (k === "gs:settings:v1" && mine) {
        // Settings: on the first move the old address's settings win (this page may only have saved
        // defaults so far); afterwards keep this page's. Saved setups from both are always kept.
        const a = JSON.parse(mine), b = JSON.parse(v);
        const merged = first ? { ...a, ...b } : a;
        const setups = [...(a.setups ?? []), ...(b.setups ?? [])];
        merged.setups = setups.filter((x: { id: string }, i: number) => setups.findIndex((y: { id: string }) => y.id === x.id) === i);
        localStorage.setItem(k, JSON.stringify(merged));
      } else if (first || !mine) localStorage.setItem(k, v);
    }
    localStorage.setItem(RECEIVED, "1");
    await writeStudy(Array.isArray(data.study) ? data.study : []); // newer copy of each item wins
  } catch {
    /* damaged link: start fresh rather than fail */
  }
  history.replaceState(null, "", window.location.pathname + window.location.search);
  window.location.reload();
}

export function DomainMove() {
  useEffect(() => {
    const host = window.location.hostname;
    if (host === OFFICIAL && window.location.protocol === "http:") {
      window.location.replace(window.location.href.replace(/^http:/, "https:"));
      return;
    }
    if (OLD_HOSTS.test(host)) {
      forward();
      return;
    }
    if (window.location.hash.startsWith(MARK)) receive(window.location.hash.slice(MARK.length));
  }, []);
  return null;
}
