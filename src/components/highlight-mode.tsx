"use client";
/**
 * Highlight mode: while on, tapping a verse paints it with the chosen colour (tap again to clear).
 * Toggle from the top bar; this floating bar shows the colours and turns it off.
 */
import { updateSettings, useSettings } from "@/lib/settings";
import { HIGHLIGHTS } from "@/lib/study";
import { CloseIcon, MarkerIcon } from "./icons";

export function HighlightModeToggle({ full = false }: { full?: boolean }) {
  const { highlightMode, highlightColor } = useSettings();
  const dot = HIGHLIGHTS.find((h) => h.id === highlightColor)?.dot;
  return (
    <button
      type="button"
      aria-pressed={highlightMode}
      onClick={() => updateSettings({ highlightMode: !highlightMode })}
      title="Highlight mode: tap verses to highlight them"
      aria-label="Highlight mode"
      className={`relative flex h-11 items-center justify-center gap-2 rounded-lg border px-3 text-sm ${full ? "w-full" : "w-11 px-0"} ${
        highlightMode ? "border-accent bg-accent-soft text-accent" : "border-line bg-raised text-muted hover:text-ink"
      }`}
    >
      <MarkerIcon />
      {full && <span>Highlight mode {highlightMode ? "on" : "off"}</span>}
      {highlightMode && <span className="absolute bottom-1.5 right-1.5 h-2 w-2 rounded-full" style={{ background: dot }} />}
    </button>
  );
}

export function HighlightModeBar({ raised }: { raised: boolean }) {
  const { highlightMode, highlightColor } = useSettings();
  if (!highlightMode) return null;
  return (
    <div
      role="toolbar"
      aria-label="Highlight mode"
      data-no-swipe
      className={`absolute left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full border border-line bg-panel/95 py-1 pl-3 pr-1 shadow-lg backdrop-blur ${
        raised ? "bottom-24" : "bottom-4 mb-[env(safe-area-inset-bottom)]"
      }`}
    >
      <span className="hidden pr-1 text-xs font-medium text-muted sm:inline">Tap verses to highlight</span>
      {HIGHLIGHTS.map((h) => (
        <button
          key={h.id}
          type="button"
          aria-label={h.label}
          aria-pressed={highlightColor === h.id}
          onClick={() => updateSettings({ highlightColor: h.id })}
          className={`flex h-9 w-9 items-center justify-center rounded-full border-2 ${highlightColor === h.id ? "border-ink" : "border-transparent"}`}
        >
          <span className="h-6 w-6 rounded-full" style={{ background: h.dot }} />
        </button>
      ))}
      <button
        type="button"
        onClick={() => updateSettings({ highlightMode: false })}
        aria-label="Turn off highlight mode"
        className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-raised"
      >
        <CloseIcon width={18} height={18} />
      </button>
    </div>
  );
}
