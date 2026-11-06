"use client";
/**
 * AI study companion window (Gemini free tier, src/app/api/ask).
 * Desktop: a floating window — drag the title bar to move, the corner to resize, – to minimize
 * (it becomes the ✦ button in the top bar). Phone: a sheet over the bottom of the reader.
 * Every question includes what is on screen (chapter + visible versions), and optionally a verse.
 */
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import {
  clearAiChat,
  closeAi,
  detachVerse,
  getReadingContext,
  minimizeAi,
  openAi,
  PROVIDER_NAMES,
  sendAi,
  setAiBox,
  setAiProvider,
  stopAi,
  useAiChat,
  type WinBox,
} from "@/lib/ai-chat";
import { useMediaQuery, WIDE_QUERY } from "@/lib/settings";
import { toast } from "@/lib/ui-store";
import { RefLink } from "./ref-link";

import { findRefs } from "@/lib/refs";
import { getItem, saveNote, type StudyRef } from "@/lib/study";
import { buildShareText, shareText } from "@/lib/ai-share";
import { CloseIcon, CopyIcon, MinusIcon, NoteIcon, SendIcon, ShareIcon, SparkIcon, StopIcon, TrashIcon } from "./icons";
import { useReaderState } from "./use-reader-state";

const SUGGESTIONS = [
  "Summarize this chapter",
  "Why do the translations differ here?",
  "What is the historical background?",
  "Explain key words in the original language",
];
/** Where the conversation was scrolled (kept while the window is closed or the page changes). */
let savedScroll: number | null = null;
const MIN_W = 300;
const MIN_H = 320;

function clampBox(b: WinBox): WinBox {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(Math.max(b.w, MIN_W), vw - 16);
  const h = Math.min(Math.max(b.h, MIN_H), vh - 16);
  return { w, h, x: Math.min(Math.max(b.x, 8), vw - w - 8), y: Math.min(Math.max(b.y, 8), vh - h - 8) };
}
const defaultBox = (): WinBox => {
  const w = 420;
  const h = Math.min(600, window.innerHeight - 120);
  return clampBox({ w, h, x: window.innerWidth - w - 24, y: 72 });
};

/** Top-bar button: opens / restores the window. Hidden until the site has an AI key. */
export function AiButton() {
  const { ready, open, minimized, busy } = useAiChat();
  if (!ready) return null;
  const showing = open && !minimized;
  return (
    <button
      type="button"
      onClick={() => (showing ? minimizeAi() : openAi())}
      aria-label={showing ? "Minimize AI companion" : "Ask AI about what you're reading"}
      aria-pressed={showing}
      title="Ask AI about what you're reading"
      className={`relative flex h-11 w-11 items-center justify-center rounded-lg hover:bg-raised hover:text-ink desk:border desk:border-line ${
        showing ? "bg-accent-soft text-accent" : open ? "text-accent desk:bg-raised" : "text-muted desk:bg-raised"
      }`}
    >
      <SparkIcon />
      {open && minimized && (
        <span className={`absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-accent ${busy ? "animate-pulse" : ""}`} aria-hidden />
      )}
    </button>
  );
}

export function AiWindow() {
  const chat = useAiChat();
  const wide = useMediaQuery(WIDE_QUERY, true);
  const [box, setBox] = useState<WinBox | null>(null);
  const [input, setInput] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const showing = chat.ready && chat.open && !chat.minimized;
  /** Choosing what to share: the answers ticked (by message index), or null when not sharing. */
  const [picked, setPicked] = useState<Set<number> | null>(null);
  /** Phone: the sheet's height after dragging its top edge (px); null = default 72% of the screen. */
  const [sheetH, setSheetH] = useState<number | null>(null);
  const { versions: versionsHere } = useReaderState();

  // Position: saved box (kept inside the screen) or a default at the right.
  useEffect(() => {
    if (!showing || !wide) return;
    const fit = () => setBox((b) => clampBox(b ?? chat.box ?? defaultBox()));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chat.box only seeds the first position
  }, [showing, wide]);

  // Scrolling: a new question puts that question (and the start of its answer) at the top, and the
  // view then stays put while the answer streams in — read from the beginning. Opening the window (or
  // coming back to it) restores where you were.
  const count = chat.messages.length;
  const seen = useRef(count);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (count > seen.current) {
      const q = el.querySelector<HTMLElement>(`[data-msg="${count - 2}"]`);
      if (q) el.scrollTop = q.offsetTop - 8; // offsetTop is relative to the (positioned) scroller
    }
    seen.current = count;
  }, [count]);
  const sized = !wide || !!box; // desktop: wait until the window has its size, or there's nothing to scroll yet
  useEffect(() => {
    const el = scroller.current;
    if (!showing || !sized || !el) return;
    const id = requestAnimationFrame(() => {
      // Back where you were; first time: the start of the latest answer.
      if (savedScroll !== null) el.scrollTop = savedScroll;
      else {
        const q = el.querySelector<HTMLElement>(`[data-msg="${chat.messages.length - 2}"]`);
        el.scrollTop = q ? q.offsetTop - 8 : el.scrollHeight;
      }
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the window (re)appears
  }, [showing, sized]);

  useEffect(() => {
    if (showing && chat.attached) inputRef.current?.focus();
  }, [showing, chat.attached]);

  if (!showing) return null;

  const ctx = getReadingContext();
  const send = (q = input) => {
    if (chat.busy) return;
    setInput("");
    void sendAi(q);
  };

  /**
   * Shared pointer-drag for moving (title bar) and resizing: from the corner (width + height), the
   * right or left edge (width), or the bottom edge (height).
   */
  const dragFrom = (e: React.PointerEvent, mode: "move" | "size" | "right" | "left" | "bottom") => {
    if (!box || e.button !== 0 || (mode === "move" && (e.target as HTMLElement).closest("button"))) return;
    e.preventDefault();
    const start = { px: e.clientX, py: e.clientY, ...box };
    let cur = box;
    const onMove = (ev: PointerEvent) => {
      window.getSelection()?.removeAllRanges(); // no text selected while dragging
      const dx = ev.clientX - start.px;
      const dy = ev.clientY - start.py;
      const next =
        mode === "move"
          ? { ...start, x: start.x + dx, y: start.y + dy }
          : mode === "size"
            ? { ...start, w: start.w + dx, h: start.h + dy }
            : mode === "right"
              ? { ...start, w: start.w + dx }
              : mode === "bottom"
                ? { ...start, h: start.h + dy }
                : // left edge: the right side stays put
                  { ...start, x: start.x + Math.min(dx, start.w - MIN_W), w: Math.max(MIN_W, start.w - dx) };
      cur = clampBox(next);
      setBox(cur);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      setAiBox(cur);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const frame = wide
    ? box
      ? { left: box.x, top: box.y, width: box.w, height: box.h }
      : { visibility: "hidden" as const }
    : sheetH
      ? { height: sheetH }
      : undefined;

  return (
    <section
      aria-label="AI study companion"
      style={frame}
      className={`fixed z-40 flex flex-col overflow-hidden border border-line bg-panel shadow-2xl ${
        wide ? "rounded-xl" : "inset-x-0 bottom-0 h-[72dvh] rounded-t-2xl pb-[env(safe-area-inset-bottom)]"
      }`}
    >
      <header
        onPointerDown={wide ? (e) => dragFrom(e, "move") : undefined}
        className={`flex shrink-0 items-center gap-1 border-b border-line bg-raised py-1 pl-3 pr-1 ${wide ? "cursor-move select-none" : ""}`}
      >
        <SparkIcon className="shrink-0 text-accent" width={18} height={18} />
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">
          Ask AI{ctx ? <span className="font-normal text-muted"> · {ctx.reference}</span> : null}
        </h2>
        {chat.messages.length > 0 && (
          <button type="button" onClick={clearAiChat} aria-label="Clear conversation" title="Clear conversation" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-panel hover:text-ink">
            <TrashIcon width={17} height={17} />
          </button>
        )}
        <button type="button" onClick={minimizeAi} aria-label="Minimize" title="Minimize (reopen with ✦ at the top)" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-panel hover:text-ink">
          <MinusIcon />
        </button>
        <button type="button" onClick={closeAi} aria-label="Close" title="Close" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-panel hover:text-ink">
          <CloseIcon />
        </button>
      </header>

      <div
        ref={scroller}
        onScroll={(e) => {
          savedScroll = e.currentTarget.scrollTop;
        }}
        className="relative min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 py-3 text-sm"
      >
        {chat.messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-muted">
              Ask anything about {ctx ? <strong className="text-ink">{ctx.reference}</strong> : "what you're reading"} — the AI sees the
              chapter and the versions on your screen{ctx ? ` (${ctx.versions.map((v) => v.abbr).join(", ")})` : ""}. Tap a verse → <em>Ask AI</em> to ask
              about one verse.
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-line bg-raised px-3 py-1.5 text-left hover:border-accent hover:text-accent">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {chat.messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} data-msg={i} className="ml-8 rounded-xl rounded-br-sm bg-accent-soft px-3 py-2 text-ink">
              {m.ref && <div className="mb-0.5 text-xs font-semibold text-accent">{m.ref}</div>}
              <div className="whitespace-pre-wrap">{m.text}</div>
            </div>
          ) : (
            <div key={i} className={`group relative mr-4 leading-relaxed ${m.error ? "text-red-700 dark:text-red-400" : ""}`}>
              {picked && m.text && !m.error && (
                <label className="mb-1 flex cursor-pointer items-center gap-2 rounded-md bg-accent-soft/60 px-2 py-1 text-xs font-medium text-accent">
                  <input
                    type="checkbox"
                    checked={picked.has(i)}
                    onChange={(e) => {
                      const next = new Set(picked);
                      if (e.target.checked) next.add(i);
                      else next.delete(i);
                      setPicked(next);
                    }}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  Share this question and answer
                </label>
              )}
              {m.text ? <Rich text={splitNext(m.text).body} preferWork={m.at?.work ?? ctx?.at.work} /> : <span className="animate-pulse text-muted">Thinking…</span>}
              {/* "Would you like to explore…": follow-ups under the latest answer */}
              {i === chat.messages.length - 1 && !chat.busy && !m.error && splitNext(m.text).next.length > 0 && (
                <span className="mt-2 flex flex-col items-start gap-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-faint">Explore further</span>
                  {splitNext(m.text).next.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => send(q)}
                      className="rounded-2xl border border-accent/40 bg-accent-soft/50 px-3 py-1.5 text-left text-sm text-ink hover:border-accent hover:bg-accent-soft"
                    >
                      {q}
                    </button>
                  ))}
                </span>
              )}
              {m.text && !m.error && !(chat.busy && i === chat.messages.length - 1) && (
                <span className="mt-1 flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(splitNext(m.text).body).then(() => toast("Answer copied"), () => toast("Couldn’t copy"))}
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-faint hover:bg-raised hover:text-ink"
                  >
                    <CopyIcon width={13} height={13} /> Copy
                  </button>
                  {m.at && (
                    <button
                      type="button"
                      onClick={() => saveAnswer(m.at!, chat.messages[i - 1]?.text, splitNext(m.text).body)}
                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-faint hover:bg-raised hover:text-ink"
                    >
                      <NoteIcon width={13} height={13} /> Save as note
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setPicked(new Set([i]))}
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-faint hover:bg-raised hover:text-ink"
                  >
                    <ShareIcon width={13} height={13} /> Send / share
                  </button>
                </span>
              )}
            </div>
          ),
        )}
      </div>

      {picked && (
        <div className="shrink-0 space-y-2 border-t border-line bg-raised p-2 text-sm">
          <p className="text-xs text-muted">
            Tick the questions and answers to send. Verses the answers mention are written out at the end (P.S.).
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!picked.size}
              onClick={async () => {
                const pairs = [...picked]
                  .sort((a, b) => a - b)
                  .map((i) => ({ question: chat.messages[i - 1]?.text, ref: chat.messages[i - 1]?.ref, answer: splitNext(chat.messages[i].text).body }));
                const text = await buildShareText(pairs, { versionsHere, workHere: ctx?.at.work, reference: ctx?.reference });
                const res = await shareText(text, ctx ? `${ctx.reference} — Verses Across` : "Verses Across");
                if (res === "copied") toast("Copied — paste it into a message or email", 3500);
                else if (res === "failed") toast("Couldn’t share");
                if (res === "shared" || res === "copied") setPicked(null);
              }}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-accent px-3 font-medium text-accent-ink disabled:opacity-40"
            >
              <ShareIcon width={16} height={16} /> Send {picked.size || ""} {picked.size === 1 ? "answer" : "answers"}
            </button>
            <button
              type="button"
              onClick={() =>
                setPicked(new Set(chat.messages.flatMap((m, i) => (m.role === "model" && m.text && !m.error ? [i] : []))))
              }
              className="h-10 rounded-lg border border-line px-3 hover:border-faint"
            >
              All
            </button>
            <button type="button" onClick={() => setPicked(null)} className="h-10 rounded-lg px-3 text-muted hover:text-ink">
              Cancel
            </button>
          </div>
        </div>
      )}
      <div className={`shrink-0 space-y-2 border-t border-line p-2 ${picked ? "hidden" : ""}`}>
        {chat.attached && (
          <div className="flex items-start gap-2 rounded-lg border border-accent/40 bg-accent-soft px-2 py-1.5 text-xs">
            <div className="min-w-0 flex-1">
              <span className="font-semibold text-accent">{chat.attached.reference}</span>
              <span className="ml-1 text-muted">· {chat.attached.texts.map((t) => t.abbr).join(", ")}</span>
              <p className="truncate font-serif text-muted">{chat.attached.texts[0]?.text}</p>
            </div>
            <button type="button" onClick={detachVerse} aria-label="Remove verse" className="-m-1 flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted hover:text-ink">
              <CloseIcon width={14} height={14} />
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            rows={Math.min(5, Math.max(1, input.split("\n").length))}
            placeholder={chat.attached ? "Ask about this verse (or just send)…" : "Ask about this chapter…"}
            className="block max-h-32 min-h-11 flex-1 resize-none rounded-lg border border-line bg-raised px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-accent/50 md:text-sm"
          />
          {chat.busy ? (
            <button type="button" onClick={stopAi} aria-label="Stop" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-line text-ink hover:bg-raised">
              <StopIcon width={18} height={18} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => send()}
              disabled={!input.trim() && !chat.attached}
              aria-label="Send"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-ink disabled:opacity-40"
            >
              <SendIcon width={18} height={18} />
            </button>
          )}
        </div>
        <p className="flex flex-wrap items-center gap-x-1 px-1 text-[11px] leading-snug text-faint">
          {chat.providers.length > 1 ? (
            <select
              aria-label="AI model"
              value={chat.provider}
              onChange={(e) => setAiProvider(e.target.value as typeof chat.provider)}
              className="h-7 rounded border border-line bg-raised px-1 text-[11px] text-ink"
            >
              {chat.providers.map((p) => (
                <option key={p} value={p}>
                  {PROVIDER_NAMES[p].name} ({PROVIDER_NAMES[p].by.split(" (")[0].split(",")[0]})
                </option>
              ))}
            </select>
          ) : (
            <span>{PROVIDER_NAMES[chat.provider].name}</span>
          )}
          <span>
            · free. Answers can be wrong — check them against the text. Your question and the on-screen text are sent to{" "}
            {PROVIDER_NAMES[chat.provider].by}.
          </span>
        </p>
      </div>

      {wide && (
        <>
          {/* Resize from any side but the title bar; the corner grip is drawn so it's easy to find. */}
          <div onPointerDown={(e) => dragFrom(e, "left")} aria-hidden className="absolute inset-y-8 left-0 w-1.5 cursor-ew-resize hover:bg-accent/30" />
          <div onPointerDown={(e) => dragFrom(e, "right")} aria-hidden className="absolute inset-y-8 right-0 w-1.5 cursor-ew-resize hover:bg-accent/30" />
          <div onPointerDown={(e) => dragFrom(e, "bottom")} aria-hidden className="absolute inset-x-8 bottom-0 h-1.5 cursor-ns-resize hover:bg-accent/30" />
          <div
            onPointerDown={(e) => dragFrom(e, "size")}
            title="Drag to resize"
            aria-hidden
            className="absolute bottom-0 right-0 flex h-6 w-6 cursor-nwse-resize items-end justify-end p-1 text-faint hover:text-accent"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M11 4L4 11M11 8L8 11" />
            </svg>
          </div>
        </>
      )}
      {!wide && (
        // Phone: drag the top edge of the sheet to make it taller or shorter.
        <div
          onPointerDown={(e) => {
            const startY = e.clientY;
            const startH = sheetH ?? window.innerHeight * 0.72;
            const onMove = (ev: PointerEvent) =>
              setSheetH(Math.min(window.innerHeight - 40, Math.max(window.innerHeight * 0.3, startH - (ev.clientY - startY))));
            const onUp = () => {
              window.removeEventListener("pointermove", onMove);
              window.removeEventListener("pointerup", onUp);
            };
            window.addEventListener("pointermove", onMove);
            window.addEventListener("pointerup", onUp);
          }}
          aria-label="Drag to resize"
          className="absolute inset-x-0 top-0 flex h-3 touch-none justify-center"
        >
          <span className="mt-1 h-1 w-10 rounded-full bg-line" />
        </div>
      )}
    </section>
  );
}

/** Light formatting for answers: paragraphs, "-"/"*"/"1." lists, ### headings and **bold**. */
function Rich({ text, preferWork }: { text: string; preferWork?: string }) {
  const inline = (t: string) => inlineRich(t, preferWork);
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    blocks.push(
      <Tag key={blocks.length} className={`space-y-1 pl-5 ${list.ordered ? "list-decimal" : "list-disc"}`}>
        {list.items.map((it, i) => (
          <li key={i}>{inline(it)}</li>
        ))}
      </Tag>,
    );
    list = null;
  };
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const num = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || num) {
      const ordered = !!num;
      if (list && list.ordered !== ordered) flush();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? num)![1]);
      continue;
    }
    flush();
    if (!line.trim()) continue;
    const h = /^#{1,4}\s+(.*)$/.exec(line);
    blocks.push(
      h ? (
        <p key={blocks.length} className="font-semibold text-ink">
          {inline(h[1])}
        </p>
      ) : (
        <p key={blocks.length}>{inline(line)}</p>
      ),
    );
  }
  flush();
  return <div className="space-y-2">{blocks}</div>;
}

/** **bold**, stray *emphasis* markers dropped, and scripture references as links. */
function inlineRich(s: string, preferWork?: string): ReactNode {
  return s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={i}>{linked(part.slice(2, -2), preferWork)}</strong>
    ) : (
      <Fragment key={i}>{linked(part.replace(/(^|\s)\*([^*\s][^*]*)\*(?=\s|$|[.,;:!?])/g, "$1$2"), preferWork)}</Fragment>
    ),
  );
}

function linked(s: string, preferWork?: string): ReactNode {
  const refs = findRefs(s, preferWork);
  if (!refs.length) return s;
  const out: ReactNode[] = [];
  let at = 0;
  refs.forEach((r, k) => {
    out.push(s.slice(at, r.start));
    out.push(
      <RefLink key={k} r={r} />,
    );
    at = r.end;
  });
  out.push(s.slice(at));
  return out;
}

/**
 * The answer and its closing "Next: question | question" line (follow-up suggestions). While the
 * answer is still streaming, a half-written "Next:" line is hidden too.
 */
function splitNext(text: string): { body: string; next: string[] } {
  const m = /\n\s*\**\s*Next\s*:?\**\s*:?\s*([^\n]*)\s*$/i.exec(text) ?? /\n\s*\**N(?:e(?:x(?:t)?)?)?$/.exec(text);
  if (!m) return { body: text, next: [] };
  const next = (m[1] ?? "")
    .split("|")
    .map((q) => q.replace(/^[\s*"“'-]+|[\s*"”']+$/g, "").trim())
    .filter((q) => q.length > 3)
    .slice(0, 2);
  return { body: text.slice(0, m.index).trimEnd(), next };
}

/** Add the answer (with its question) to the note on that verse / chapter, keeping what's there. */
function saveAnswer(at: StudyRef, question: string | undefined, answer: string) {
  const prev = getItem("note", at)?.text ?? "";
  const q = question ? `Q: ${question.replace(/^\[About [^\]]*\]\s*/, "")}\n` : "";
  const add = `${q}AI: ${answer.trim()}`;
  saveNote(at, prev ? `${prev}\n\n${add}` : add);
  toast(at.verse ? "Saved to the note on this verse (My Study → Notes)" : "Saved as a chapter note (My Study → Notes)", 3500);
}
