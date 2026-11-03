"use client";
import { useRef, useState } from "react";
import { getVersion, versionsForWork } from "@/lib/catalog";
import { getLanguage, LANGUAGES } from "@/lib/languages";
import {
  COL_MAX,
  COL_MIN,
  DEFAULT_PALETTE,
  FONT_MAX,
  FONT_MIN,
  PHONE_LANDSCAPE_QUERY,
  STACK_MAX,
  STACK_MIN,
  updateSettings,
  useMediaQuery,
  useSettings,
  useViewMode,
} from "@/lib/settings";
import type { Version } from "@/lib/schema";
import { CheckIcon, CloseIcon, ColumnsIcon, GripIcon, MoonIcon, RowsIcon, SunIcon } from "./icons";
import { useReaderState } from "./use-reader-state";


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

/**
 * The chosen versions in display order. Reorder by dragging the handle (mouse or touch) or with ▲/▼;
 * the order is saved in the URL (?v=) and on the device.
 */
function OrderList({ versions, setVersions }: { versions: string[]; setVersions: (ids: string[]) => void }) {
  const listRef = useRef<HTMLOListElement>(null);
  const [drag, setDrag] = useState<{ id: string; over: number } | null>(null);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= versions.length || from === to) return;
    const next = [...versions];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    setVersions(next);
  };
  const indexAt = (clientY: number) => {
    const rows = [...(listRef.current?.children ?? [])] as HTMLElement[];
    const i = rows.findIndex((r) => clientY < r.getBoundingClientRect().top + r.offsetHeight / 2);
    return i === -1 ? rows.length - 1 : i;
  };
  if (versions.length < 2) return null;
  return (
    <section aria-label="Column order">
      <h3 className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-faint">Your columns, in order</h3>
      <ol ref={listRef} className="space-y-1">
        {versions.map((id, i) => {
          const v = getVersion(id);
          if (!v) return null;
          const dragging = drag?.id === id;
          return (
            <li
              key={id}
              className={`flex min-h-11 items-center gap-1 rounded-lg border px-1 ${
                dragging ? "border-accent bg-accent-soft" : drag && drag.over === i ? "border-dashed border-accent" : "border-line bg-raised"
              }`}
            >
              <button
                type="button"
                aria-label={`Drag to reorder ${v.abbr}`}
                className="flex h-11 w-9 shrink-0 cursor-grab touch-none items-center justify-center text-faint active:cursor-grabbing"
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  setDrag({ id, over: i });
                }}
                onPointerMove={(e) => drag && setDrag({ id, over: indexAt(e.clientY) })}
                onPointerUp={() => {
                  if (drag) move(i, drag.over);
                  setDrag(null);
                }}
                onPointerCancel={() => setDrag(null)}
              >
                <GripIcon />
              </button>
              <span className="w-5 text-center text-xs tabular-nums text-faint">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-sm">
                <span className="font-medium">{v.abbr}</span> <span className="text-faint">{getLanguage(v.language).name}</span>
              </span>
              <button type="button" aria-label={`Move ${v.abbr} up`} disabled={i === 0} onClick={() => move(i, i - 1)} className="flex h-11 w-9 items-center justify-center text-muted disabled:opacity-30">
                ▲
              </button>
              <button type="button" aria-label={`Move ${v.abbr} down`} disabled={i === versions.length - 1} onClick={() => move(i, i + 1)} className="flex h-11 w-9 items-center justify-center text-muted disabled:opacity-30">
                ▼
              </button>
              <button type="button" aria-label={`Remove ${v.abbr}`} onClick={() => setVersions(versions.filter((x) => x !== id))} className="flex h-11 w-9 items-center justify-center text-muted hover:text-ink">
                <CloseIcon width={16} height={16} />
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Column width (Column view; separate value in phone landscape) or reading width (Stacked view). */
export function WidthControl() {
  const view = useViewMode();
  const s = useSettings();
  const landscape = useMediaQuery(PHONE_LANDSCAPE_QUERY, false);
  const column = view === "column";
  const key = column ? (landscape ? "colWidthLandscape" : "colWidth") : "stackWidth";
  const [min, max, auto] = column ? [COL_MIN, COL_MAX, landscape ? 14 : 17] : [STACK_MIN, STACK_MAX, 48];
  const value = s[key] ?? auto;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label htmlFor="width-range" className="text-xs font-semibold uppercase tracking-wide text-faint">
          {column ? `Column width${landscape ? " (landscape)" : ""}` : "Reading width"}
        </label>
        <button type="button" onClick={() => updateSettings({ [key]: null })} className="min-h-8 text-xs text-accent underline-offset-2 hover:underline">
          Auto
        </button>
      </div>
      <input
        id="width-range"
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => updateSettings({ [key]: Number(e.target.value) })}
        className="h-11 w-full accent-[var(--accent)]"
      />
    </div>
  );
}

/** Colour each language's text; each colour can be changed. */
export function LanguageColors() {
  const s = useSettings();
  return (
    <div className="space-y-2">
      <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-faint">Colour by language</span>
        <input
          type="checkbox"
          checked={s.langColors}
          onChange={(e) => updateSettings({ langColors: e.target.checked })}
          className="h-5 w-5 accent-[var(--accent)]"
        />
      </label>
      {s.langColors && (
        <div className="grid grid-cols-2 gap-1">
          {LANGUAGES.map((l) => {
            const color = s.palette[l.code] ?? DEFAULT_PALETTE[l.code] ?? "";
            return (
              <label key={l.code} className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm hover:bg-raised">
                <input
                  type="color"
                  value={color || "#888888"}
                  onChange={(e) => updateSettings({ palette: { ...s.palette, [l.code]: e.target.value } })}
                  className="h-7 w-7 shrink-0 cursor-pointer rounded border border-line bg-transparent p-0"
                  aria-label={`${l.name} colour`}
                />
                <span style={{ color: color || undefined }}>{l.name}</span>
              </label>
            );
          })}
          <button
            type="button"
            onClick={() => updateSettings({ palette: {} })}
            className="col-span-2 min-h-11 rounded-lg text-sm text-accent hover:bg-raised"
          >
            Reset colours
          </button>
        </div>
      )}
    </div>
  );
}

/** Choose which versions/languages appear as columns. Used in the desktop popover and the mobile sheet. */
export function VersionChooser() {
  const { ref, versions, setVersions } = useReaderState();
  const all = versionsForWork(ref.work);
  const selected = new Set(versions);
  const lastOne = versions.length <= 1;
  const toggle = (id: string, on: boolean) => {
    // New versions are added at the end; removing keeps the order of the rest.
    setVersions(on ? [...versions, id] : versions.filter((v) => v !== id));
  };

  return (
    <div className="space-y-4">
      <OrderList versions={versions} setVersions={setVersions} />
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
            {!vs.length && <p className="px-2 text-xs text-faint">Coming soon</p>}
          </section>
        );
      })}
    </div>
  );
}
