"use client";
/** "Studied" checkbox at the end of a chapter; stores when you marked it (shown as MM/DD/YY h:mm AM). */
import type { BookRef } from "@/lib/catalog";
import { formatStamp, getItem, toggle, useStudy } from "@/lib/study";
import { toast } from "@/lib/ui-store";
import { CheckIcon } from "./icons";

export function StudiedBox({ bookRef, title }: { bookRef: BookRef; title: string }) {
  useStudy();
  const item = getItem("studied", bookRef);
  return (
    <div className="mx-auto max-w-3xl px-4 pt-8 md:px-8">
      <button
        type="button"
        role="checkbox"
        aria-checked={!!item}
        onClick={() => {
          const on = toggle("studied", bookRef);
          toast(on ? `${title} marked as studied` : `${title} unmarked`);
        }}
        className={`flex min-h-14 w-full items-center gap-3 rounded-xl border px-4 text-left ${
          item ? "border-accent bg-accent-soft" : "border-dashed border-line hover:border-faint"
        }`}
      >
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ${
            item ? "border-accent bg-accent text-accent-ink" : "border-faint"
          }`}
        >
          {item && <CheckIcon width={16} height={16} strokeWidth={3} />}
        </span>
        <span className="min-w-0">
          <span className="block font-medium">{item ? `${title} — studied` : `Mark ${title} as studied`}</span>
          <span className="block text-xs text-muted">
            {item ? formatStamp(item.createdAt) : "Keeps a dated record in My Study and a ✓ in the library"}
          </span>
        </span>
      </button>
    </div>
  );
}
