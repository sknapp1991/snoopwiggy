"use client";
/**
 * "Report a problem / send feedback": pick what it's about, say what happened, send. The page, the
 * verse, the versions on screen, device and recent errors are attached automatically (and shown
 * before sending, with a switch to leave them out). Mounted once in the root layout.
 */
import { useEffect, useMemo, useState } from "react";
import { captureErrors, closeFeedback, gatherDetails, openFeedback, useFeedback, type FeedbackRequest, type FeedbackTopic } from "@/lib/feedback";
import { CloseIcon } from "./icons";
import { Modal } from "./modal";

const TOPICS: { id: FeedbackTopic; label: string; hint: string }[] = [
  { id: "text", label: "Text or translation", hint: "What’s wrong? For example a missing or wrong word, a verse out of place, a typo…" },
  { id: "audio", label: "Audio", hint: "What did you hear? For example the wrong verse, a skip, a word said wrong…" },
  { id: "bug", label: "Something broken", hint: "What were you doing, and what happened instead?" },
  { id: "idea", label: "Idea", hint: "What would make Verses Across better for you?" },
  { id: "other", label: "Other", hint: "Tell us anything." },
];

export function FeedbackHost() {
  const req = useFeedback();
  useEffect(captureErrors, []);
  return (
    <Modal open={!!req} onClose={closeFeedback} variant="card" label="Send feedback">
      {req && <FeedbackBody req={req} />}
    </Modal>
  );
}

function FeedbackBody({ req }: { req: FeedbackRequest }) {
  const [topic, setTopic] = useState<FeedbackTopic>(req.topic ?? (req.verse ? "text" : req.error ? "bug" : "other"));
  const [message, setMessage] = useState(req.message ?? "");
  const [contact, setContact] = useState("");
  const [withDetails, setWithDetails] = useState(true);
  const [state, setState] = useState<"idle" | "sending" | "sent" | { error: string }>("idle");
  // Gathered once, when the form opens (what was on screen at that moment).
  const details = useMemo(() => gatherDetails(req), [req]);
  const hint = TOPICS.find((t) => t.id === topic)!.hint;

  const payload = () => ({
    topic,
    message: message.trim(),
    contact: contact.trim(),
    page: details.page,
    details: withDetails ? details : req.verse ? { verse: req.verse } : null,
  });

  const send = async () => {
    if (!message.trim() || state === "sending") return;
    setState("sending");
    try {
      const res = await fetch("/api/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload()) });
      if (res.ok) return setState("sent");
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      setState({ error: j?.error ?? "Couldn’t send right now." });
    } catch {
      setState({ error: navigator.onLine ? "Couldn’t send right now." : "You’re offline." });
    }
  };
  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload(), null, 2));
      setState({ error: "Copied. You can paste it into a GitHub issue (link below)." });
    } catch {
      /* ignore */
    }
  };

  const field = "block w-full rounded-lg border border-line bg-raised px-3 text-base outline-none focus:ring-2 focus:ring-accent/50 md:text-sm";
  return (
    <div className="flex max-h-[85dvh] flex-col desk:max-h-[80vh]">
      <div className="flex items-center justify-between border-b border-line py-1 pl-4 pr-1">
        <h2 className="font-serif text-lg font-semibold">{req.verse ? `Report a problem · ${req.verse.reference}` : "Send feedback"}</h2>
        <button type="button" onClick={closeFeedback} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:bg-raised">
          <CloseIcon />
        </button>
      </div>

      {state === "sent" ? (
        <div className="space-y-4 px-4 py-8 text-center">
          <p className="font-serif text-xl text-ink">Thank you!</p>
          <p className="text-sm text-muted">
            Your report reached us{withDetails ? ", with the details we need to look into it" : ""}. We read every one.
            {contact.trim() ? " We’ll reply if we have a question." : ""}
          </p>
          <button type="button" onClick={closeFeedback} className="min-h-11 rounded-xl bg-accent px-6 font-medium text-accent-ink">
            Done
          </button>
        </div>
      ) : (
        <form
          className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          {req.verse?.texts[0] && <p className="line-clamp-2 font-serif text-sm text-muted">{req.verse.texts[0].text}</p>}

          <div role="radiogroup" aria-label="What is it about?" className="flex flex-wrap gap-2">
            {TOPICS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={topic === t.id}
                onClick={() => setTopic(t.id)}
                className={`min-h-9 rounded-full border px-3 text-sm ${topic === t.id ? "border-accent bg-accent-soft font-medium text-ink" : "border-line text-muted hover:bg-raised"}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            autoFocus
            rows={4}
            maxLength={5000}
            placeholder={hint}
            aria-label="What happened"
            className={`${field} resize-y py-2`}
          />

          <input
            type="email"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            maxLength={200}
            autoComplete="email"
            placeholder="Email, if you’d like a reply (optional)"
            aria-label="Your email (optional)"
            className={`${field} h-11`}
          />

          <div className="space-y-1 text-sm">
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={withDetails} onChange={(e) => setWithDetails(e.target.checked)} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
              <span className="text-muted">
                Include the page, {req.verse ? "the verse in each version, " : ""}your device and recent errors, so we can see what you saw
              </span>
            </label>
            <details className="pl-6">
              <summary className="cursor-pointer text-xs text-faint underline-offset-2 hover:underline">See exactly what’s sent</summary>
              <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-raised p-2 text-[11px] text-muted">
                {JSON.stringify(payload(), null, 2)}
              </pre>
            </details>
          </div>

          {typeof state === "object" && (
            <div role="alert" className="space-y-2 rounded-lg border border-line bg-raised px-3 py-2 text-sm text-ink">
              <p>{state.error}</p>
              <p className="flex flex-wrap gap-x-4 gap-y-1 text-muted">
                <button type="button" onClick={copyReport} className="underline underline-offset-2">
                  Copy the report
                </button>
                <a href="https://github.com/sknapp1991/snoopwiggy/issues/new" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                  Open a GitHub issue
                </a>
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={!message.trim() || state === "sending"}
            className="min-h-11 w-full rounded-xl bg-accent font-medium text-accent-ink disabled:opacity-50"
          >
            {state === "sending" ? "Sending…" : "Send"}
          </button>
          <p className="text-center text-xs text-faint">Goes straight to the two people who make Verses Across. No account needed.</p>
        </form>
      )}
    </div>
  );
}

/** A button that opens the form (for server-rendered pages such as About). */
export function FeedbackButton({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={() => openFeedback()} className={className}>
      {children}
    </button>
  );
}
