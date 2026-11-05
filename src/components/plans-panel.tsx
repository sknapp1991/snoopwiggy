"use client";
/** My Study → Plans: start a reading plan, see today's reading, tick chapters off (the "studied" mark). */
import Link from "next/link";
import { useMemo } from "react";
import { chapterTitle, DEFAULT_VERSIONS, findBook, readHref, type BookRef } from "@/lib/catalog";
import { dayIndex, planDays, PLANS, startPlan, stopPlan, useStartedPlans, type PlanDef } from "@/lib/plans";
import { getItem, toggle, useStudy } from "@/lib/study";
import { toast } from "@/lib/ui-store";
import { useReaderState } from "./use-reader-state";

const label = (r: BookRef) => chapterTitle(findBook(r.work, r.book), r.chapter, r.book);

export function PlansPanel({ onNavigate }: { onNavigate?: () => void }) {
  const started = useStartedPlans();
  const active = PLANS.filter((p) => started[p.id]);
  const others = PLANS.filter((p) => !started[p.id]);
  return (
    <div className="space-y-4 px-2 py-2">
      {active.map((p) => (
        <ActivePlan key={p.id} plan={p} start={started[p.id].start} onNavigate={onNavigate} />
      ))}
      <div>
        <h3 className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-faint">{active.length ? "More plans" : "Start a reading plan"}</h3>
        <ul className="divide-y divide-line/70">
          {others.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-2 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{p.name}</span>
                <span className="block text-xs text-muted">{p.blurb}</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  startPlan(p.id);
                  toast(`Started: ${p.name}. Day 1 is ready.`);
                }}
                className="min-h-10 shrink-0 rounded-lg border border-accent px-3 text-sm font-medium text-accent hover:bg-accent-soft"
              >
                Start
              </button>
            </li>
          ))}
        </ul>
        <p className="px-2 pt-2 text-xs text-faint">Progress uses the “studied” tick on each chapter, so ticking a chapter anywhere counts.</p>
      </div>
    </div>
  );
}

function ActivePlan({ plan, start, onNavigate }: { plan: PlanDef; start: number; onNavigate?: () => void }) {
  useStudy(); // re-render when chapters are ticked
  const { ref, versions } = useReaderState();
  const days = useMemo(() => planDays(plan), [plan]);
  const done = (r: BookRef) => !!getItem("studied", r);
  const dayDone = (d: BookRef[]) => d.every(done);
  const finished = days.filter(dayDone).length;
  const total = days.length;
  // Show the first day not finished yet (catch up at your own pace); "on track" compares with the calendar.
  const next = days.findIndex((d) => !dayDone(d));
  const calendar = Math.min(total - 1, dayIndex(start));
  const behind = next >= 0 ? calendar - next : 0;
  const today = next >= 0 ? days[next] : null;
  const href = (r: BookRef) => readHref(r, r.work === ref.work ? versions : DEFAULT_VERSIONS[r.work]);

  return (
    <section className="rounded-xl border border-line bg-raised/60 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-semibold">{plan.name}</h3>
        <span className="shrink-0 text-xs tabular-nums text-muted">
          {finished}/{total} days
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
        <div className="h-full rounded-full bg-accent" style={{ width: `${(finished / total) * 100}%` }} />
      </div>
      {today ? (
        <>
          <p className="mt-2 text-xs text-muted">
            Day {next + 1}
            {behind > 0 ? ` · ${behind} day${behind === 1 ? "" : "s"} behind — no rush` : behind < 0 ? " · ahead of schedule" : " · on track"}
          </p>
          <ul className="mt-1.5 space-y-1">
            {today.map((r) => {
              const ok = done(r);
              return (
                <li key={`${r.book}/${r.chapter}`} className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={ok ? `Untick ${label(r)}` : `Tick ${label(r)} as read`}
                    onClick={() => toggle("studied", r)}
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-sm ${ok ? "border-accent bg-accent text-accent-ink" : "border-line"}`}
                  >
                    {ok ? "✓" : ""}
                  </button>
                  <Link href={href(r)} onClick={onNavigate} className={`min-h-9 flex-1 content-center text-sm font-medium ${ok ? "text-muted line-through" : "text-accent"}`}>
                    {label(r)}
                  </Link>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            onClick={() => today.forEach((r) => !done(r) && toggle("studied", r))}
            className="mt-2 min-h-9 w-full rounded-lg border border-line text-sm hover:border-faint"
          >
            Mark day {next + 1} as read
          </button>
        </>
      ) : (
        <p className="mt-2 text-sm font-medium text-accent">Finished — well done! 🎉</p>
      )}
      <button
        type="button"
        onClick={() => {
          stopPlan(plan.id);
          toast(`Stopped ${plan.name} (your ticks are kept)`);
        }}
        className="mt-1 text-xs text-faint underline-offset-2 hover:text-ink hover:underline"
      >
        Stop this plan
      </button>
    </section>
  );
}
