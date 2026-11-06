"use client";
/**
 * Share part of an AI conversation: the chosen questions and answers as plain text, then a
 * "Verses mentioned" postscript that writes out each passage the answers refer to, so whoever
 * receives it can read them without looking them up.
 */
import { chapterTitle, DEFAULT_VERSIONS, findBook, getVersion } from "./catalog";
import { fetchBook } from "./chapter-store";
import { findRefs, type FoundRef } from "./refs";

/** Messages and email show markdown as-is: drop the **bold** / *italic* markers and ### headings. */
const plain = (t: string) =>
  t
    .trim()
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=[\s.,;:!?)]|$)/g, "$1$2")
    .replace(/^#{1,4}\s+/gm, "");

export type SharePair = { question?: string; ref?: string; answer: string };

const MAX_REFS = 15;
const MAX_VERSES = 8; // per passage

async function passageText(r: FoundRef, versionsHere: string[], workHere?: string) {
  const id = (r.ref.work === workHere ? versionsHere[0] : undefined) ?? DEFAULT_VERSIONS[r.ref.work]?.[0];
  if (!id) return null;
  try {
    const book = await fetchBook(r.ref.work, id, r.ref.book);
    const from = r.verse ? parseInt(r.verse, 10) : 1;
    const to = r.to ? parseInt(r.to, 10) : r.verse ? from : from + 2;
    const verses = (book.chapters[String(r.ref.chapter)]?.verses ?? []).filter(
      (x) => !x.cont && x.t && parseInt(x.v, 10) >= from && parseInt(x.v, 10) <= Math.min(to, from + MAX_VERSES - 1),
    );
    if (!verses.length) return null;
    const title = `${chapterTitle(findBook(r.ref.work, r.ref.book), r.ref.chapter, r.ref.book)}${r.verse ? `:${r.verse}${r.to ? `–${r.to}` : ""}` : ""}`;
    const more = r.to && parseInt(r.to, 10) > from + MAX_VERSES - 1 ? " …" : "";
    const body = verses.length === 1 ? verses[0].t : verses.map((x) => `[${x.v}] ${x.t}`).join(" ");
    return `${title} (${getVersion(id)?.abbr ?? id}): ${body}${more}`;
  } catch {
    return null;
  }
}

export async function buildShareText(pairs: SharePair[], opts: { versionsHere: string[]; workHere?: string; reference?: string }) {
  const parts: string[] = [];
  if (opts.reference) parts.push(`From my study of ${opts.reference} on Verses Across`);
  for (const p of pairs) {
    if (p.question) parts.push(`Q${p.ref ? ` (${p.ref})` : ""}: ${p.question.replace(/^\[About [^\]]*\]\s*/, "")}`);
    parts.push(`A: ${plain(p.answer)}`);
  }
  // Every passage the answers mention, once each, in order.
  const seen = new Set<string>();
  const refs: FoundRef[] = [];
  for (const p of pairs)
    for (const r of findRefs(p.answer, opts.workHere)) {
      const k = `${r.ref.work}/${r.ref.book}/${r.ref.chapter}:${r.verse ?? ""}-${r.to ?? ""}`;
      if (seen.has(k) || refs.length >= MAX_REFS) continue;
      seen.add(k);
      refs.push(r);
    }
  const texts = (await Promise.all(refs.map((r) => passageText(r, opts.versionsHere, opts.workHere)))).filter(Boolean);
  if (texts.length) parts.push(`P.S. Verses mentioned:\n${texts.map((t) => `• ${t}`).join("\n")}`);
  parts.push("— versesacross.com");
  return parts.join("\n\n");
}

/** The phone's share sheet when there is one, else the clipboard. Returns what happened. */
export async function shareText(text: string, title: string): Promise<"shared" | "copied" | "cancelled" | "failed"> {
  if (navigator.share && matchMedia("(pointer: coarse)").matches) {
    try {
      await navigator.share({ title, text });
      return "shared";
    } catch (e) {
      if ((e as Error).name === "AbortError") return "cancelled";
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}
