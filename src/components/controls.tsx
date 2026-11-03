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
  versionColor,
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

/** Colour block for one version; picking a colour turns coloured text on. */
function VersionColorSwatch({ id, language, abbr }: { id: string; language: string; abbr: string }) {
  const s = useSettings();
  const own = s.versionColors[id];
  const effective = own || (s.palette[language] ?? DEFAULT_PALETTE[language]) || "";
  return (
    <label
      className="relative flex h-11 w-9 shrink-0 cursor-pointer items-center justify-center"
      title={own ? `${abbr} colour (tap to change)` : `Pick a colour for ${abbr}`}
    >
      <span
        className={`h-6 w-6 rounded-md border ${s.langColors && effective ? "border-transparent" : "border-dashed border-faint"}`}
        style={{ background: s.langColors && effective ? effective : undefined }}
      />
      <input
        type="color"
        aria-label={`${abbr} text colour`}
        value={effective || "#888888"}
        onChange={(e) => updateSettings({ versionColors: { ...s.versionColors, [id]: e.target.value }, langColors: true })}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
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
              <VersionColorSwatch id={id} language={v.language} abbr={v.abbr} />
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

/** Saved setups: versions, order, colours, text size, view and widths, one tap to switch. */
export function SavedSetups() {
  const s = useSettings();
  const { ref, versions, setVersions } = useReaderState();
  const [name, setName] = useState("");
  const [naming, setNaming] = useState(false);
  const suggested = versions.map((id) => getVersion(id)?.abbr ?? id).join(" / ");
  const mine = s.setups.filter((x) => x.work === ref.work);
  const isCurrent = (x: (typeof mine)[number]) =>
    x.versions.join() === versions.join() && x.fontSize === s.fontSize && x.langColors === s.langColors && x.view === s.view;
  const save = () => {
    const setup = {
      id: `${Date.now()}`,
      name: name.trim() || suggested,
      work: ref.work,
      versions,
      view: s.view,
      fontSize: s.fontSize,
      langColors: s.langColors,
      palette: s.palette,
      versionColors: s.versionColors,
      colWidth: s.colWidth,
      colWidthLandscape: s.colWidthLandscape,
      stackWidth: s.stackWidth,
    };
    updateSettings({ setups: [...s.setups, setup] });
    setName("");
    setNaming(false);
  };
  const apply = (x: (typeof mine)[number]) => {
    const { view, fontSize, langColors, palette, versionColors, colWidth, colWidthLandscape, stackWidth } = x;
    updateSettings({ view, fontSize, langColors, palette, versionColors, colWidth, colWidthLandscape, stackWidth });
    const valid = x.versions.filter((id) => getVersion(id));
    if (valid.length) setVersions(valid);
  };
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-faint">Saved setups</h3>
      {mine.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {mine.map((x) => (
            <span
              key={x.id}
              className={`flex min-h-10 items-center rounded-full border text-sm ${isCurrent(x) ? "border-accent bg-accent-soft text-accent" : "border-line bg-raised"}`}
            >
              <button type="button" onClick={() => apply(x)} className="flex min-h-10 items-center gap-1.5 pl-3 pr-1" title={`Switch to ${x.name}`}>
                <span className="flex">
                  {x.versions.slice(0, 4).map((id) => {
                    const v = getVersion(id);
                    const c = v && x.langColors ? x.versionColors[id] || x.palette[v.language] || DEFAULT_PALETTE[v.language] : "";
                    return <span key={id} className="-ml-1 h-3 w-3 rounded-full border border-paper first:ml-0" style={{ background: c || "var(--faint)" }} />;
                  })}
                </span>
                {x.name}
              </button>
              <button
                type="button"
                onClick={() => updateSettings({ setups: s.setups.filter((y) => y.id !== x.id) })}
                aria-label={`Delete setup ${x.name}`}
                className="flex h-10 w-8 items-center justify-center text-faint hover:text-ink"
              >
                <CloseIcon width={14} height={14} />
              </button>
            </span>
          ))}
        </div>
      )}
      {naming ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={suggested}
            aria-label="Setup name"
            className="h-11 min-w-0 flex-1 rounded-lg border border-line bg-raised px-3 text-base outline-none focus:ring-2 focus:ring-accent/50 md:text-sm"
          />
          <button type="submit" className="h-11 rounded-lg bg-accent px-4 text-sm font-medium text-accent-ink">
            Save
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setNaming(true)}
          className="min-h-11 w-full rounded-lg border border-dashed border-line text-sm text-muted hover:border-faint hover:text-ink"
        >
          + Save current setup ({suggested}, {s.fontSize}px{s.langColors ? ", colours" : ""})
        </button>
      )}
    </div>
  );
}

/** Swipe-to-change-chapter setting and the floating ‹ › buttons. */
export function ChapterSwipeControl() {
  const { chapterSwipe, floatingNav } = useSettings();
  const opts = [
    { id: "one" as const, label: "One finger" },
    { id: "two" as const, label: "Two fingers" },
    { id: "off" as const, label: "Off" },
  ];
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-faint">Swipe to change chapter</h3>
      <div role="radiogroup" aria-label="Swipe to change chapter" className="flex rounded-lg border border-line bg-raised p-0.5">
        {opts.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={chapterSwipe === o.id}
            onClick={() => updateSettings({ chapterSwipe: o.id })}
            className={`h-11 flex-1 rounded-md px-2 text-sm ${chapterSwipe === o.id ? "bg-accent-soft font-medium text-accent" : "text-muted hover:text-ink"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-faint">
        {chapterSwipe === "off"
          ? "Use the ‹ › buttons to change chapter."
          : `Swipe ${chapterSwipe === "two" ? "with two fingers " : ""}sideways across most of the screen and let go. In Column view, swipe past the first or last column.`}
      </p>
      <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
        <span className="text-sm">Floating ‹ › chapter buttons</span>
        <input
          type="checkbox"
          checked={floatingNav}
          onChange={(e) => updateSettings({ floatingNav: e.target.checked })}
          className="h-5 w-5 accent-[var(--accent)]"
        />
      </label>
    </div>
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
  // While dragging, the settings sheet turns see-through (except this slider) to preview the text behind.
  const peek = (on: boolean) => {
    if (on) document.documentElement.dataset.peek = "1";
    else delete document.documentElement.dataset.peek;
  };
  return (
    <div className="peek-keep space-y-1">
      <div className="flex items-center justify-between">
        <label htmlFor="width-range" className="text-xs font-semibold uppercase tracking-wide text-faint">
          {column ? `Column width${landscape ? " (landscape)" : ""}` : "Reading width"}
          <span className="ml-2 font-normal normal-case tracking-normal tabular-nums">
            {s[key] == null ? "auto" : `${value} rem`}
          </span>
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
        onPointerDown={() => peek(true)}
        onPointerUp={() => peek(false)}
        onPointerCancel={() => peek(false)}
        onTouchEnd={() => peek(false)}
        onBlur={() => peek(false)}
        className="h-11 w-full accent-[var(--accent)]"
      />
      <p className="text-[11px] text-faint">Drag to preview: the text shows through while you slide.</p>
    </div>
  );
}

/** Colour each language's text; each colour can be changed. */
export function LanguageColors() {
  const s = useSettings();
  return (
    <div className="space-y-2">
      <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-faint">
          Coloured text
          <span className="block font-normal normal-case tracking-normal">
            Each version can have its own colour (colour block in “Your columns”); otherwise its language colour is used.
          </span>
        </span>
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
          <SelectedVersionColors />
          <button
            type="button"
            onClick={() => updateSettings({ palette: {}, versionColors: {} })}
            className="col-span-2 min-h-11 rounded-lg text-sm text-accent hover:bg-raised"
          >
            Reset colours
          </button>
        </div>
      )}
    </div>
  );
}

/** Version colours for the columns being read (also in the order list). */
function SelectedVersionColors() {
  const { versions } = useReaderState();
  const s = useSettings();
  return (
    <div className="col-span-2 space-y-1 border-t border-line pt-2">
      <p className="px-2 text-[11px] font-semibold uppercase tracking-wide text-faint">Your versions</p>
      <div className="grid grid-cols-2 gap-1">
        {versions.map((id) => {
          const v = getVersion(id);
          if (!v) return null;
          return (
            <div key={id} className="flex min-h-11 items-center gap-1 rounded-lg px-1 text-sm hover:bg-raised">
              <VersionColorSwatch id={id} language={v.language} abbr={v.abbr} />
              <span className="min-w-0 flex-1 truncate" style={{ color: versionColor(s, v) }}>
                {v.abbr}
              </span>
              {s.versionColors[id] && (
                <button
                  type="button"
                  aria-label={`Use the language colour for ${v.abbr}`}
                  title="Use the language colour"
                  onClick={() => {
                    const next = { ...s.versionColors };
                    delete next[id];
                    updateSettings({ versionColors: next });
                  }}
                  className="flex h-9 w-7 items-center justify-center text-faint hover:text-ink"
                >
                  <CloseIcon width={14} height={14} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <p className="px-2 pt-1 text-[11px] font-semibold uppercase tracking-wide text-faint">Languages</p>
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
