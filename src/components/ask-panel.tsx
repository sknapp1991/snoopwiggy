"use client";
/**
 * Built-in Ask AI panel (feature flag NEXT_PUBLIC_FEATURE_ASK_AI_PANEL, off by default).
 * Side panel on desktop, bottom sheet on phones; the verse and visible translations are the context.
 */
import { useState } from "react";
import { closePanel, useUi } from "@/lib/ui-store";
import { CloseIcon, SparkIcon } from "./icons";
import { verseReference } from "./verse-menu";

export function AskPanel() {
  const { ask } = useUi();
  const [question, setQuestion] = useState("");
  const [state, setState] = useState<{ busy: boolean; answer?: string; error?: string }>({ busy: false });
  if (!ask) return null;
  const reference = verseReference(ask);
  const texts = ask.texts;
  const submit = async () => {
    setState({ busy: true });
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference, translations: texts.map(({ abbr, language, text }) => ({ abbr, language, text })), question }),
      });
      const data = (await res.json()) as { answer?: string; error?: string };
      setState({ busy: false, ...(res.ok ? { answer: data.answer } : { error: data.error ?? `Error ${res.status}` }) });
    } catch {
      setState({ busy: false, error: "Couldn’t reach the server." });
    }
  };
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-line py-1 pl-4 pr-1">
        <h2 className="flex items-center gap-2 font-serif text-lg font-semibold">
          <SparkIcon className="text-accent" /> Ask AI · {reference}
        </h2>
        <button type="button" onClick={closePanel} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:bg-raised">
          <CloseIcon />
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
        {texts.map((t) => (
          <p key={t.abbr} dir={t.dir} lang={t.lang} className="font-serif text-muted">
            <span className="mr-1 font-sans text-xs font-semibold text-faint">{t.abbr}</span>
            {t.text}
          </p>
        ))}
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={3}
          placeholder="Ask about this verse, or why the translations differ…"
          className="block w-full rounded-lg border border-line bg-raised px-3 py-2 text-base outline-none focus:ring-2 focus:ring-accent/50 md:text-sm"
        />
        <button type="button" onClick={submit} disabled={state.busy} className="min-h-11 w-full rounded-lg bg-accent font-medium text-accent-ink disabled:opacity-60">
          {state.busy ? "Thinking…" : "Ask"}
        </button>
        {state.error && <p className="text-red-700 dark:text-red-400">{state.error}</p>}
        {state.answer && <div className="whitespace-pre-line rounded-lg border border-line bg-raised p-3 leading-relaxed">{state.answer}</div>}
        <p className="text-xs text-faint">AI answers can be wrong. Check important points against the text and other sources.</p>
      </div>
    </div>
  );
}
