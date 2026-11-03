"use client";
import { versionsForWork } from "@/lib/catalog";
import { LANGUAGES } from "@/lib/languages";
import { FONT_MAX, FONT_MIN, updateSettings, useSettings, useViewMode } from "@/lib/settings";
import type { Version } from "@/lib/schema";
import { CheckIcon, ColumnsIcon, MoonIcon, RowsIcon, SunIcon } from "./icons";
import { useReaderState } from "./use-reader-state";

/** English versions planned for the next phase (shown disabled so the layout is final). */
const PLANNED_ENGLISH = ["ASV", "YLT", "BBE"];

export function ViewToggle({ full = false }: { full?: boolean }) {
  const view = useViewMode();
  const opts = [
    { id: "column" as const, label: "Columns", Icon: ColumnsIcon },
    { id: "stacked" as const, label: "Stacked", Icon: RowsIcon },
  ];
  return (
    <div role="group" aria-label="Layout" className={`flex rounded-lg border border-line bg-raised p-0.5 ${full ? "w-full" : ""}`}>
      {opts.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          aria-pressed={view === id}
          onClick={() => updateSettings({ view: id })}
          title={label}
          className={`flex h-11 flex-1 items-center justify-center gap-1.5 rounded-md px-3 text-sm ${
            view === id ? "bg-accent-soft font-medium text-accent" : "text-muted hover:text-ink"
          }`}
        >
          <Icon width={18} height={18} />
          <span className={full ? "" : "hidden lg:inline"}>{label}</span>
        </button>
      ))}
    </div>
  );
}

export function FontSizeControl() {
  const { fontSize } = useSettings();
  const set = (n: number) => updateSettings({ fontSize: Math.min(FONT_MAX, Math.max(FONT_MIN, n)) });
  return (
    <div role="group" aria-label="Text size" className="flex items-center rounded-lg border border-line bg-raised p-0.5">
      <button
        type="button"
        onClick={() => set(fontSize - 2)}
        disabled={fontSize <= FONT_MIN}
        aria-label="Smaller text"
        className="flex h-11 w-11 items-center justify-center rounded-md text-sm text-muted hover:text-ink disabled:opacity-40"
      >
        A−
      </button>
      <span className="w-8 text-center text-xs tabular-nums text-faint" aria-live="polite">
        {fontSize}
      </span>
      <button
        type="button"
        onClick={() => set(fontSize + 2)}
        disabled={fontSize >= FONT_MAX}
        aria-label="Larger text"
        className="flex h-11 w-11 items-center justify-center rounded-md text-base font-medium text-muted hover:text-ink disabled:opacity-40"
      >
        A+
      </button>
    </div>
  );
}

export function ThemeToggle() {
  return (
    <button
      type="button"
      // The current theme (incl. "system") is whatever class is on <html> right now.
      onClick={() => updateSettings({ theme: document.documentElement.classList.contains("dark") ? "light" : "dark" })}
      aria-label="Toggle dark mode"
      title="Light / dark"
      className="flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-raised text-muted hover:text-ink"
    >
      <SunIcon className="hidden dark:block" />
      <MoonIcon className="dark:hidden" />
    </button>
  );
}

function VersionRow({ v, checked, onChange, disableUncheck }: { v: Version; checked: boolean; onChange: (c: boolean) => void; disableUncheck: boolean }) {
  return (
    <label
      className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-raised ${
        checked && disableUncheck ? "cursor-default" : ""
      }`}
      title={checked && disableUncheck ? "At least one version must stay selected" : undefined}
    >
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={checked && disableUncheck}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border peer-focus-visible:ring-2 peer-focus-visible:ring-accent/60 ${
          checked ? "border-accent bg-accent text-accent-ink" : "border-faint"
        }`}
      >
        {checked && <CheckIcon width={14} height={14} strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="font-medium">{v.abbr}</span> <span className="text-muted">— {v.name}</span>
        <span className="block text-xs text-faint">
          {v.year} · {v.license}
        </span>
      </span>
    </label>
  );
}

/** Choose which versions/languages appear as columns. Used in the desktop popover and the mobile sheet. */
export function VersionChooser() {
  const { ref, versions, setVersions } = useReaderState();
  const all = versionsForWork(ref.work);
  const selected = new Set(versions);
  const lastOne = versions.length <= 1;
  const toggle = (id: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(id);
    else next.delete(id);
    setVersions([...next]);
  };

  return (
    <div className="space-y-4">
      {LANGUAGES.map((lang) => {
        const vs = all.filter((v) => v.language === lang.code);
        const isBase = lang.code === "en";
        return (
          <section key={lang.code} aria-label={lang.name}>
            <h3 className="mb-1 flex items-baseline gap-2 px-2 text-xs font-semibold uppercase tracking-wide text-faint">
              {lang.name}
              {lang.native !== lang.name && (
                <span lang={lang.code} dir={lang.dir} className="font-normal normal-case tracking-normal">
                  {lang.native}
                </span>
              )}
              {isBase && <span className="font-normal normal-case tracking-normal">· base language</span>}
            </h3>
            {vs.map((v) => (
              <VersionRow key={v.id} v={v} checked={selected.has(v.id)} onChange={(c) => toggle(v.id, c)} disableUncheck={lastOne} />
            ))}
            {isBase ? (
              <p className="px-2 text-xs text-faint">{PLANNED_ENGLISH.join(", ")} — coming in the next update</p>
            ) : (
              <p className="px-2 text-xs text-faint">
                {vs.length ? "AI translation" : "Native version and AI translation"} — coming in the next update
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
