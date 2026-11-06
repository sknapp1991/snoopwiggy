"use client";
/**
 * Reading levels: underline words a learner may not know yet (CEFR B1…C2, and archaic words), in every
 * column whose language has word data. Uses the CSS Custom Highlight API, so the text is never re-rendered.
 */
import { useEffect, type RefObject } from "react";
import { updateSettings, useSettings, type Settings } from "@/lib/settings";
import { levelKey, levelsFor } from "@/lib/words";
import { tokenize } from "@/lib/word-norm";
import { CloseIcon } from "./icons";

export type LevelMarks = Settings["levelMarks"];
const ORDER = ["B1", "B2", "C1", "C2"];
const NAMES = ["lvl-b1", "lvl-b2", "lvl-c1", "lvl-c2", "lvl-archaic"];

/** Should a word at `level` be marked with this setting? */
function marked(level: string, from: LevelMarks) {
  if (level === "archaic") return from !== "off";
  if (from === "off" || from === "archaic") return false;
  return ORDER.indexOf(level) >= ORDER.indexOf(from);
}

export function useLevelMarks(scroller: RefObject<HTMLDivElement | null>, rowsKey: unknown) {
  const { levelMarks } = useSettings();
  useEffect(() => {
    const css = CSS as unknown as { highlights?: Map<string, unknown> };
    const H = (window as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight;
    if (!css.highlights || !H) return;
    const clear = () => NAMES.forEach((n) => css.highlights!.delete(n));
    clear();
    const sc = scroller.current;
    if (levelMarks === "off" || !sc) return;
    let live = true;
    (async () => {
      const groups: Record<string, Range[]> = Object.fromEntries(NAMES.map((n) => [n, []]));
      for (const el of sc.querySelectorAll<HTMLElement>("[data-text]")) {
        const lang = el.closest<HTMLElement>("[lang]")?.lang ?? "en";
        const levels = await levelsFor(lang);
        if (!live) return;
        if (!levels) continue;
        // Text nodes in order, so a word's offsets can be turned into a range.
        const nodes: Text[] = [];
        const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let t = w.nextNode(); t; t = w.nextNode()) nodes.push(t as Text);
        for (const node of nodes) {
          const text = node.data;
          for (const tok of tokenize(text)) {
            let k = levelKey(tok.raw, lang);
            if (!Object.prototype.hasOwnProperty.call(levels, k) && lang === "en" && k.endsWith("'s")) k = k.slice(0, -2);
            if (!Object.prototype.hasOwnProperty.call(levels, k)) continue;
            const lvl = levels[k];
            if (!marked(lvl, levelMarks)) continue;
            // Names (capitalised mid-sentence, e.g. "Moses") aren't vocabulary to learn.
            if (lvl !== "archaic" && /^\p{Lu}/u.test(tok.raw) && /[\p{L},]\s*$/u.test(text.slice(0, tok.start))) continue;
            const r = document.createRange();
            r.setStart(node, tok.start);
            r.setEnd(node, tok.end);
            groups[lvl === "archaic" ? "lvl-archaic" : `lvl-${lvl.toLowerCase()}`]?.push(r);
          }
        }
      }
      if (!live) return;
      for (const n of NAMES) css.highlights!.set(n, new H(...groups[n]));
    })();
    return () => {
      live = false;
      clear();
    };
  }, [levelMarks, scroller, rowsKey]);
}

const LABELS: [LevelMarks, string][] = [
  ["off", "Off"],
  ["B1", "B1 and harder"],
  ["B2", "B2 and harder"],
  ["C1", "C1 and harder"],
  ["archaic", "Old-fashioned words only"],
];

export function LevelMarksControl() {
  const { levelMarks } = useSettings();
  return (
    <label className="flex min-h-11 items-center justify-between gap-3 text-sm">
      <span>
        <span className="font-medium">Reading levels</span>
        <span className="block text-xs text-faint">Underline words a learner may not know yet</span>
      </span>
      <select
        value={levelMarks}
        onChange={(e) => updateSettings({ levelMarks: e.target.value as LevelMarks })}
        className="h-9 rounded-lg border border-line bg-raised px-2 text-sm"
      >
        {LABELS.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Key to the underlines, shown while reading levels are on. */
export function LevelLegend({ raised }: { raised: boolean }) {
  const { levelMarks, wordMode } = useSettings();
  if (levelMarks === "off" || wordMode) return null;
  const shown = ["B1", "B2", "C1", "C2"].filter((l) => marked(l, levelMarks));
  return (
    <div
      role="note"
      data-no-swipe
      className={`absolute left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-full border border-line bg-panel/95 py-1 pl-4 pr-1 text-xs shadow-lg backdrop-blur ${
        raised ? "bottom-24" : "bottom-4 mb-[env(safe-area-inset-bottom)]"
      }`}
    >
      {shown.map((l) => (
        <span key={l} className={`lvl-key-${l.toLowerCase()}`}>
          {l}
        </span>
      ))}
      <span className="lvl-key-archaic">archaic</span>
      <span className="hidden text-faint sm:inline">· Words mode explains a word</span>
      <button type="button" onClick={() => updateSettings({ levelMarks: "off" })} aria-label="Turn off reading levels" className="flex h-7 w-7 items-center justify-center rounded-full text-muted hover:text-ink">
        <CloseIcon width={12} height={12} />
      </button>
    </div>
  );
}
