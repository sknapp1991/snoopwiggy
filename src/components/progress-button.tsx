"use client";
/** Top-bar Progress button: a trophy, with a ring around it showing today's goal when one is set. */
import { togglePanel, useUi } from "@/lib/ui-store";
import { TrophyIcon } from "./icons";
import { useGoalRing } from "./progress-panel";

export function ProgressButton() {
  const { panel } = useUi();
  const ring = useGoalRing();
  const on = panel === "progress";
  const c = 2 * Math.PI * 19;
  return (
    <button
      type="button"
      onClick={() => togglePanel("progress")}
      aria-label={ring == null ? "Progress, goals and badges" : `Progress, goals and badges (today's goal ${Math.round(ring * 100)}%)`}
      aria-pressed={on}
      title="Progress, goals and badges"
      className={`relative hidden h-11 w-11 items-center justify-center rounded-lg hover:bg-raised hover:text-ink min-[380px]:flex desk:border desk:border-line ${
        on ? "bg-accent-soft text-accent" : "text-muted desk:bg-raised"
      }`}
    >
      <TrophyIcon />
      {ring != null && ring > 0 && (
        <svg viewBox="0 0 44 44" aria-hidden className="pointer-events-none absolute inset-0 -rotate-90">
          <circle cx="22" cy="22" r="19" fill="none" stroke="var(--line)" strokeWidth="2" />
          <circle cx="22" cy="22" r="19" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeDasharray={`${c * ring} ${c}`} />
        </svg>
      )}
    </button>
  );
}
