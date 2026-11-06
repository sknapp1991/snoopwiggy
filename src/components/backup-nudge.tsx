"use client";
/**
 * A small, polite reminder to back up once someone has saved a fair amount (study lives only on this
 * device). Also asks the browser to keep the site's data once something has been saved.
 */
import { useEffect, useState } from "react";
import { backupDue, downloadBackup, keepStorage, snoozeBackup } from "@/lib/backup";
import { useStudy } from "@/lib/study";
import { CloseIcon } from "./icons";

export function BackupNudge() {
  const study = useStudy();
  const saved = study.items.size;
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!study.ready || !saved) return;
    void keepStorage();
    // Wait a little so it never pops up the moment the page opens.
    const t = setTimeout(() => setShow(backupDue(saved)), 4000);
    return () => clearTimeout(t);
  }, [study.ready, saved]);

  if (!show) return null;
  const later = () => {
    snoozeBackup();
    setShow(false);
  };
  return (
    <div
      role="status"
      data-no-swipe
      className="fixed bottom-4 left-4 z-40 w-[min(340px,calc(100vw-32px))] rounded-xl border border-line bg-panel p-3 text-sm shadow-xl mb-[env(safe-area-inset-bottom)]"
    >
      <div className="flex items-start gap-2">
        <p className="flex-1">
          <span className="font-semibold">Back up your study?</span>{" "}
          <span className="text-muted">
            Your {saved} favorites, highlights and notes are saved only on this device. Clearing the browser’s data would erase them; a backup file
            keeps them safe (My Study → Restore brings them back).
          </span>
        </p>
        <button type="button" onClick={later} aria-label="Not now" className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-faint hover:text-ink">
          <CloseIcon width={14} height={14} />
        </button>
      </div>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => {
            downloadBackup();
            setShow(false);
          }}
          className="min-h-10 flex-1 rounded-lg bg-accent font-medium text-accent-ink"
        >
          Back up now
        </button>
        <button type="button" onClick={later} className="min-h-10 flex-1 rounded-lg border border-line text-ink hover:border-faint">
          Later
        </button>
      </div>
    </div>
  );
}
