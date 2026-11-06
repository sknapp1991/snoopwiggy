"use client";
/**
 * Keeping a reader's study (favorites, highlights, notes…) safe. It lives only on this device, so:
 * - ask the browser to keep the site's data (not cleared on its own when space runs low, and on iPhone
 *   less likely to be wiped after a week away);
 * - remember when the last backup file was made, so the app can remind people now and then.
 */
import { exportJson } from "./study";

const LAST = "va-last-backup";
const SNOOZE = "va-backup-snooze";
const DAY = 86_400_000;

function read(key: string): number {
  try {
    return Number(localStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
}
function write(key: string, value: number) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* private mode: nothing to remember */
  }
}

/** Save everything to a file (the same file Restore reads). */
export function downloadBackup() {
  const blob = new Blob([exportJson()], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `versesacross-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  write(LAST, Date.now());
  write(SNOOZE, 0);
}

export const lastBackup = () => read(LAST);

/** "Later": don't remind again for a week. */
export function snoozeBackup() {
  write(SNOOZE, Date.now());
}

/** Time to suggest a backup? Enough saved, no backup for a month, and not put off this week. */
export function backupDue(saved: number): boolean {
  if (saved < 20) return false;
  const now = Date.now();
  if (now - read(SNOOZE) < 7 * DAY) return false;
  return now - read(LAST) > 30 * DAY;
}

/** Ask once per visit for the site's storage to be kept (quietly granted or declined by the browser). */
let asked = false;
export async function keepStorage() {
  if (asked) return;
  asked = true;
  try {
    const s = navigator.storage;
    if (s?.persist && !(await s.persisted())) await s.persist();
  } catch {
    /* not supported */
  }
}
