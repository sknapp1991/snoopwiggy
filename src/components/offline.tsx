"use client";
/**
 * Offline reading: registers public/sw.js (production only), and "Save for offline", which downloads
 * every book of the versions being read so the whole scripture works without a connection (the
 * service worker keeps what was fetched).
 */
import { useEffect, useState } from "react";
import { booksOfWork, getVersion } from "@/lib/catalog";
import { toast } from "@/lib/ui-store";
import { useReaderState } from "./use-reader-state";

export function OfflineSupport() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const reg = () => navigator.serviceWorker.register("/sw.js").catch(() => {});
    if (document.readyState === "complete") reg();
    else window.addEventListener("load", reg, { once: true });
  }, []);
  return null;
}

const KEY = "gs:offline:v1"; // { "<work>/<version>": savedAt }
function savedMap(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

/** "Save for offline" for the versions open now (settings sheet / display popover). */
export function SaveOffline() {
  const { ref, versions } = useReaderState();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [saved, setSaved] = useState<Record<string, number>>({});
  useEffect(() => {
    // Read after mount (localStorage isn't there during the server render).
    const t = setTimeout(() => setSaved(savedMap()), 0);
    return () => clearTimeout(t);
  }, []);
  const supported = typeof navigator !== "undefined" && "serviceWorker" in navigator;
  const books = booksOfWork(ref.work);
  const keys = versions.map((v) => `${ref.work}/${v}`);
  const allSaved = keys.length > 0 && keys.every((k) => saved[k]);
  const names = versions.map((v) => getVersion(v)?.abbr ?? v).join(", ");

  const save = async () => {
    const jobs = versions.flatMap((v) => books.map((b) => `/texts/${ref.work}/${v}/${b.id}.json`));
    setProgress({ done: 0, total: jobs.length });
    // First visit: let the service worker take over first, so the downloads land in its cache.
    await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(r, 3000))]);
    let done = 0;
    let failed = 0;
    // A few at a time, so a phone on a slow connection isn't swamped.
    const queue = [...jobs];
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        for (let u = queue.shift(); u; u = queue.shift()) {
          // Books a version doesn't have (e.g. Tobit in the KJV) answer 404: that's fine.
          const ok = await fetch(u).then((r) => r.ok || r.status === 404, () => false);
          if (!ok) failed++;
          setProgress({ done: ++done, total: jobs.length });
        }
      }),
    );
    setProgress(null);
    if (failed) {
      toast(`Couldn’t save ${failed} book${failed === 1 ? "" : "s"} — check your connection and try again`, 4000);
      return;
    }
    const next = { ...savedMap(), ...Object.fromEntries(keys.map((k) => [k, Date.now()])) };
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* private mode */
    }
    setSaved(next);
    toast(`${names} saved for offline reading`, 3500);
  };

  if (!supported || !books.length) return null;
  return (
    <div className="space-y-1.5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-faint">Offline</h3>
      <button
        type="button"
        onClick={save}
        disabled={!!progress}
        className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-line px-3 text-sm hover:border-faint disabled:opacity-70"
      >
        {progress
          ? `Saving… ${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%`
          : allSaved
            ? `✓ Saved — update ${names}`
            : `Save ${names} for offline`}
      </button>
      <p className="text-xs text-faint">
        Keeps every book of these versions on this device, so you can read with no signal. Chapters you open are kept automatically too.
      </p>
    </div>
  );
}
