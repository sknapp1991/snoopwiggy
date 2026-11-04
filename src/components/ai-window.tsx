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
  sendAi,
  setAiBox,
  stopAi,
  useAiChat,
  type WinBox,
} from "@/lib/ai-chat";
import { useMediaQuery, WIDE_QUERY } from "@/lib/settings";
import { toast } from "@/lib/ui-store";
import { CloseIcon, CopyIcon, MinusIcon, SendIcon, SparkIcon, StopIcon, TrashIcon } from "./icons";

const SUGGESTIONS = [
  "Summarize this chapter",
  "Why do the translations differ here?",
  "What is the historical background?",
  "Explain key words in the original language",
];
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

  // Position: saved box (kept inside the screen) or a default at the right.
  useEffect(() => {
    if (!showing || !wide) return;
    const fit = () => setBox((b) => clampBox(b ?? chat.box ?? defaultBox()));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chat.box only seeds the first position
  }, [showing, wide]);

  // Follow the answer as it streams in.
  const last = chat.messages[chat.messages.length - 1];
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.messages.length, last?.text, showing]);

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

  /** Shared pointer-drag for moving (title bar) and resizing (corner). */
  const dragFrom = (e: React.PointerEvent, mode: "move" | "size") => {
    if (!box || e.button !== 0 || (mode === "move" && (e.target as HTMLElement).closest("button"))) return;
    e.preventDefault();
    const start = { px: e.clientX, py: e.clientY, ...box };
    let cur = box;
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - start.px;
      const dy = ev.clientY - start.py;
      cur = clampBox(mode === "move" ? { ...start, x: start.x + dx, y: start.y + dy } : { ...start, w: start.w + dx, h: start.h + dy });
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

      <div ref={scroller} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 py-3 text-sm">
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
            <div key={i} className="ml-8 rounded-xl rounded-br-sm bg-accent-soft px-3 py-2 text-ink">
              {m.ref && <div className="mb-0.5 text-xs font-semibold text-accent">{m.ref}</div>}
              <div className="whitespace-pre-wrap">{m.text}</div>
            </div>
          ) : (
            <div key={i} className={`group relative mr-4 leading-relaxed ${m.error ? "text-red-700 dark:text-red-400" : ""}`}>
              {m.text ? <Rich text={m.text} /> : <span className="animate-pulse text-muted">Thinking…</span>}
              {m.text && !m.error && !(chat.busy && i === chat.messages.length - 1) && (
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(m.text).then(() => toast("Answer copied"), () => toast("Couldn’t copy"))}
                  className="mt-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-faint hover:bg-raised hover:text-ink"
                >
                  <CopyIcon width={13} height={13} /> Copy
                </button>
              )}
            </div>
          ),
        )}
      </div>

      <div className="shrink-0 space-y-2 border-t border-line p-2">
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
        <p className="px-1 text-[11px] leading-snug text-faint">
          Google Gemini (free). Answers can be wrong — check them against the text. Your question and the on-screen text are sent to Google.
        </p>
      </div>

      {wide && (
        <div
          onPointerDown={(e) => dragFrom(e, "size")}
          aria-hidden
          className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize"
          style={{ background: "linear-gradient(135deg, transparent 50%, var(--color-line) 50%, var(--color-line) 60%, transparent 60%, transparent 75%, var(--color-line) 75%, var(--color-line) 85%, transparent 85%)" }}
        />
      )}
    </section>
  );
}

/** Light formatting for answers: paragraphs, "-"/"*"/"1." lists, ### headings and **bold**. */
function Rich({ text }: { text: string }) {
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

function inline(s: string): ReactNode {
  return s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      <Fragment key={i}>{part.replace(/(^|\s)\*([^*\s][^*]*)\*(?=\s|$|[.,;:!?])/g, "$1$2")}</Fragment>
    ),
  );
}
