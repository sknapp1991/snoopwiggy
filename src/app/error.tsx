"use client";
/** Shown when a page crashes: try again, or report it with the error attached (one tap). */
import { useEffect } from "react";
import { openFeedback } from "@/lib/feedback";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  const report = () =>
    openFeedback({ topic: "bug", error: `${error.name}: ${error.message}${error.digest ? ` (digest ${error.digest})` : ""}\n${error.stack ?? ""}`.slice(0, 3000) });
  return (
    <main className="flex h-dvh flex-col items-center justify-center gap-4 bg-paper px-6 text-center text-muted">
      <h1 className="font-serif text-2xl font-semibold text-ink">Something went wrong</h1>
      <p className="max-w-sm">Sorry about that. Trying again usually fixes it. If it keeps happening, please tell us: the details are filled in for you.</p>
      <div className="flex flex-wrap justify-center gap-3">
        <button type="button" onClick={reset} className="min-h-11 rounded-xl bg-accent px-5 font-medium text-accent-ink">
          Try again
        </button>
        <button type="button" onClick={report} className="min-h-11 rounded-xl border border-line px-5 text-ink hover:bg-raised">
          Report this problem
        </button>
      </div>
    </main>
  );
}
