"use client";
/**
 * Verse action menu: highlight colours, favorite, study later, note, read aloud from here,
 * copy, share link, and "Ask in…" (Gemini / ChatGPT / Claude). Bottom sheet on phones,
 * a centred card on desktop.
 */
import { useEffect, useState } from "react";
import { ASK_SERVICES, askUrl, buildAskPrompt, type AskTranslation } from "@/lib/ask-in";
import { catalog, chapterTitle, findBook, readHref } from "@/lib/catalog";
import { features } from "@/lib/features";
import { getItem, HIGHLIGHTS, saveNote, setHighlight, toggle, useStudy, type StudyRef } from "@/lib/study";
import { closeVerseMenu, openAsk, toast, useUi } from "@/lib/ui-store";
import { CloseIcon, ClockIcon, CopyIcon, HeadphonesIcon, LinkIcon, SparkIcon, StarIcon } from "./icons";
import { Modal } from "./modal";

export type VerseText = AskTranslation & { dir: "ltr" | "rtl"; lang: string };

export function verseReference(r: StudyRef & { verse: string }) {
  return `${chapterTitle(findBook(r.work, r.book), r.chapter, r.book)}:${r.verse}`;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers / insecure origins (e.g. testing over the LAN): fall back to a hidden textarea.
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

export function VerseMenu({
  textsFor,
  versions,
  onReadFrom,
}: {
  /** Text of the verse in every visible column. */
  textsFor: (verse: string) => VerseText[];
  versions: string[];
  onReadFrom?: (verse: string) => void;
}) {
  const { menu } = useUi();
  return (
    <Modal open={!!menu} onClose={closeVerseMenu} variant="card" label="Verse actions">
      {menu && <MenuBody key={`${menu.work}/${menu.book}/${menu.chapter}:${menu.verse}`} r={menu} textsFor={textsFor} versions={versions} onReadFrom={onReadFrom} />}
    </Modal>
  );
}

function MenuBody({
  r,
  textsFor,
  versions,
  onReadFrom,
}: {
  r: StudyRef & { verse: string; focus?: "note" | "ask" };
  textsFor: (verse: string) => VerseText[];
  versions: string[];
  onReadFrom?: (verse: string) => void;
}) {
  useStudy(); // re-render on changes
  const highlight = getItem("highlight", r)?.color;
  const fav = !!getItem("favorite", r);
  const later = !!getItem("later", r);
  const savedNote = getItem("note", r)?.text ?? "";
  const [note, setNote] = useState(savedNote);
  const [question, setQuestion] = useState("");
  const reference = verseReference(r);
  const texts = textsFor(r.verse);
  const workName = catalog.works.find((w) => w.id === r.work)?.name ?? r.work;
  const link = () => `${window.location.origin}${readHref(r, versions, r.verse)}`;

  const copy = async () => {
    const body = texts.map((t) => (texts.length > 1 ? `${t.abbr}: ${t.text}` : t.text)).join("\n");
    const ok = await copyText(`${reference}\n${body}\n${link()}`);
    toast(ok ? "Verse copied" : "Couldn’t copy");
  };
  const share = async () => {
    const url = link();
    if (navigator.share) {
      try {
        await navigator.share({ title: reference, text: texts[0]?.text, url });
        return;
      } catch {
        /* cancelled: fall through to copy */
      }
    }
    toast((await copyText(url)) ? "Link copied" : "Couldn’t copy");
  };
  const ask = async (id: string) => {
    const service = ASK_SERVICES.find((s) => s.id === id)!;
    const prompt = buildAskPrompt({ reference, work: workName, translations: texts, question });
    const copied = await copyText(prompt);
    const url = askUrl(service, prompt);
    window.open(url, "_blank", "noopener,noreferrer");
    toast(url === service.home ? (copied ? `Prompt copied — paste it into ${service.name}` : `Open ${service.name} and ask there`) : `Opening ${service.name}…`, 4000);
  };
  const saveIfChanged = () => {
    if (note.trim() !== savedNote) saveNote(r, note);
  };
  // Notes save as you type (so closing the menu any way never loses one).
  const dirty = note.trim() !== savedNote;
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => saveNote(r, note), 600);
    return () => clearTimeout(t);
  }, [note, dirty, r]);

  const pill = "flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 text-sm";
  return (
    <div className="flex max-h-[85dvh] flex-col desk:max-h-[80vh]">
      <div className="flex items-center justify-between border-b border-line py-1 pl-4 pr-1">
        <h2 className="font-serif text-lg font-semibold">{reference}</h2>
        <button
          type="button"
          onClick={() => {
            saveIfChanged();
            closeVerseMenu();
          }}
          aria-label="Close"
          className="flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:bg-raised"
        >
          <CloseIcon />
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-3">
        {texts[0] && (
          <p dir={texts[0].dir} lang={texts[0].lang} className="line-clamp-3 font-serif text-sm text-muted">
            {texts[0].text}
          </p>
        )}

        <div role="group" aria-label="Highlight colour" className="flex items-center gap-2">
          {HIGHLIGHTS.map((h) => (
            <button
              key={h.id}
              type="button"
              aria-label={`${h.label} highlight`}
              aria-pressed={highlight === h.id}
              onClick={() => setHighlight(r, highlight === h.id ? null : h.id)}
              className={`flex h-11 w-11 items-center justify-center rounded-full border-2 ${highlight === h.id ? "border-ink" : "border-transparent"}`}
            >
              <span className="h-7 w-7 rounded-full" style={{ background: h.dot }} />
            </button>
          ))}
          {highlight && (
            <button type="button" onClick={() => setHighlight(r, null)} className="min-h-11 px-2 text-sm text-muted underline-offset-2 hover:underline">
              Clear
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={fav}
            onClick={() => toggle("favorite", r)}
            className={`${pill} ${fav ? "border-accent bg-accent-soft text-accent" : "border-line"}`}
          >
            <StarIcon width={18} height={18} fill={fav ? "currentColor" : "none"} /> {fav ? "Favorite" : "Favorite"}
          </button>
          <button
            type="button"
            aria-pressed={later}
            onClick={() => toggle("later", r)}
            className={`${pill} ${later ? "border-accent bg-accent-soft text-accent" : "border-line"}`}
          >
            <ClockIcon width={18} height={18} /> Study later
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {onReadFrom && (
            <button
              type="button"
              onClick={() => {
                closeVerseMenu();
                onReadFrom(r.verse);
              }}
              className={`${pill} border-line`}
            >
              <HeadphonesIcon width={18} height={18} /> Read aloud
            </button>
          )}
          <button type="button" onClick={copy} className={`${pill} border-line`}>
            <CopyIcon width={18} height={18} /> Copy
          </button>
          <button type="button" onClick={share} className={`${pill} border-line`}>
            <LinkIcon width={18} height={18} /> Share
          </button>
        </div>

        <label className="block space-y-1">
          <span className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-faint">
            Note
            <span className="font-normal normal-case tracking-normal">{dirty ? "Saving…" : savedNote ? "Saved on this device" : ""}</span>
          </span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={saveIfChanged}
            autoFocus={r.focus === "note"}
            rows={3}
            placeholder="Write a note on this verse…"
            className="block w-full resize-y rounded-lg border border-line bg-raised px-3 py-2 text-base outline-none focus:ring-2 focus:ring-accent/50 md:text-sm"
          />
        </label>

        {features.askInExternal && (
          <div className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-faint">Ask in…</span>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              autoFocus={r.focus === "ask"}
              placeholder="Your question (optional)"
              className="block h-11 w-full rounded-lg border border-line bg-raised px-3 text-base outline-none focus:ring-2 focus:ring-accent/50 md:text-sm"
            />
            <div className="flex gap-2">
              {ASK_SERVICES.map((s) => (
                <button key={s.id} type="button" onClick={() => ask(s.id)} className={`${pill} border-line font-medium`}>
                  {s.name}
                </button>
              ))}
            </div>
            <p className="text-xs text-faint">
              Opens the service in a new tab with the verse, every visible translation and your question. The prompt is also copied.
            </p>
          </div>
        )}
        {features.askAiPanel && (
          <button type="button" onClick={() => openAsk({ work: r.work, book: r.book, chapter: r.chapter, verse: r.verse, texts })} className={`${pill} w-full border-accent text-accent`}>
            <SparkIcon width={18} height={18} /> Ask AI here
          </button>
        )}
      </div>
    </div>
  );
}
