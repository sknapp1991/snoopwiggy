/**
 * "Ask in…" hand-off: build a scholarly prompt for a verse and open it in an outside AI service.
 * URL templates live here so they can be updated if a service changes. No API cost to us.
 */
export type AskService = {
  id: "gemini" | "chatgpt" | "claude";
  name: string;
  /** Pre-fills the prompt via the URL; null = open the site and the user pastes (prompt is copied). */
  url: (prompt: string) => string | null;
  home: string;
};

/** Long prompts make URLs some services reject; past this, open the site and rely on the clipboard. */
const MAX_URL = 7000;

export const ASK_SERVICES: AskService[] = [
  { id: "gemini", name: "Gemini", url: () => null, home: "https://gemini.google.com/app" },
  { id: "chatgpt", name: "ChatGPT", url: (p) => `https://chatgpt.com/?q=${encodeURIComponent(p)}`, home: "https://chatgpt.com/" },
  { id: "claude", name: "Claude", url: (p) => `https://claude.ai/new?q=${encodeURIComponent(p)}`, home: "https://claude.ai/new" },
];

export type AskTranslation = { abbr: string; name: string; language: string; text: string };

export function buildAskPrompt(opts: { reference: string; work: string; translations: AskTranslation[]; question: string }) {
  const lines = [
    `I'm studying ${opts.reference} (${opts.work}).`,
    "",
    "Translations I'm reading:",
    ...opts.translations.map((t) => `- ${t.abbr} (${t.language}, ${t.name}): "${t.text}"`),
    "",
    opts.question.trim() ? `My question: ${opts.question.trim()}` : "Please explain this verse.",
    "",
    "Answer as a careful, neutral scholar: explain the meaning in its context, point out meaningful differences between the translations above and why they arise (original-language words where helpful), mention how major traditions read it where they differ, and say clearly when something is a matter of interpretation.",
  ];
  return lines.join("\n");
}

export function askUrl(service: AskService, prompt: string) {
  const u = service.url(prompt);
  return u && u.length <= MAX_URL ? u : service.home;
}
