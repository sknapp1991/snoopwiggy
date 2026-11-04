/**
 * Server/script-only AI provider abstraction for chapter translation.
 * Selected by AI_PROVIDER ("gemini" default, "ollama", "anthropic"). Keys come from env and
 * never reach the browser. Used by scripts (offline pre-translation, model comparison) now,
 * and by the Phase 2 translation route.
 */
export type TranslateChapterInput = {
  reference: string; // e.g. "John 3"
  sourceVersion: string; // e.g. "World English Bible"
  targetLanguage: string; // English name, e.g. "Spanish"
  verses: { v: string; t: string }[];
};
export type TranslatedVerse = { v: string; t: string };

export interface AIProvider {
  /** Shown to readers in the "AI translation" label, e.g. "Gemini 2.5 Flash". */
  readonly label: string;
  translateChapter(input: TranslateChapterInput): Promise<TranslatedVerse[]>;
  /** Free-text answer (built-in Ask AI panel, feature-flagged). */
  ask(system: string, user: string): Promise<string>;
}

/** System prompt for the built-in Ask AI panel. */
export const ASK_SYSTEM = [
  "You are a careful, neutral scholar of the world's scriptures helping someone study a passage in a reading app.",
  "Explain meaning in context, the original-language words where useful, and how the translations the reader is viewing differ and why.",
  "Present the main interpretations of different traditions fairly, and say plainly when something is a matter of interpretation or faith.",
  "Be concise (under 300 words unless asked for more). Do not invent quotations or references.",
].join("\n");

export function translationPrompt(input: TranslateChapterInput) {
  const system = [
    `You are an expert Bible translator producing a faithful ${input.targetLanguage} translation for a scripture study app.`,
    `Translate the English source (${input.sourceVersion}) verse by verse into natural, dignified ${input.targetLanguage} suitable for reading aloud in worship and for study.`,
    "Rules:",
    "- Keep exactly the same verse numbers; one output verse per input verse. Never merge, split, skip or add verses.",
    "- Translate only. No notes, commentary, brackets or explanations.",
    `- Use the traditional ${input.targetLanguage} Bible spellings of names and places, and the customary rendering of the divine name (e.g. "the LORD").`,
    "- Preserve meaning and register; keep poetry poetic and dialogue as dialogue, with the target language's quotation conventions.",
    'Return JSON only: {"verses":[{"v":"1","t":"..."}]}',
  ].join("\n");
  const user = `${input.reference}\n\n` + input.verses.map((x) => `${x.v}. ${x.t}`).join("\n");
  return { system, user };
}

function parseVerses(text: string, input: TranslateChapterInput): TranslatedVerse[] {
  const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as { verses?: TranslatedVerse[] };
  const out = (json.verses ?? []).map((x) => ({ v: String(x.v), t: String(x.t ?? "").trim() }));
  const want = input.verses.map((x) => x.v).join(",");
  const got = out.map((x) => x.v).join(",");
  if (want !== got) throw new Error(`verse mismatch: expected [${want}] got [${got}]`);
  if (out.some((x) => !x.t)) throw new Error("empty verse in model output");
  return out;
}

const VERSES_SCHEMA = {
  type: "object",
  properties: {
    verses: {
      type: "array",
      items: { type: "object", properties: { v: { type: "string" }, t: { type: "string" } }, required: ["v", "t"] },
    },
  },
  required: ["verses"],
};

export class OllamaProvider implements AIProvider {
  readonly label: string;
  constructor(
    readonly model = process.env.OLLAMA_MODEL ?? "qwen3:14b",
    readonly baseUrl = process.env.OLLAMA_URL ?? "http://localhost:11434",
  ) {
    this.label = `${model} (local)`;
  }
  async translateChapter(input: TranslateChapterInput) {
    const { system, user } = translationPrompt(input);
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        // Streamed so response headers arrive at once: a slow local model can take >5 min for a long
        // chapter, which would trip Node's default fetch headers timeout on a non-streamed request.
        stream: true,
        think: false,
        format: VERSES_SCHEMA,
        options: { temperature: 0.2, num_ctx: 8192 },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok || !res.body) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
    // NDJSON stream: one {"message":{"content":"…"},"done":false} object per line.
    let text = "";
    let buf = "";
    const decoder = new TextDecoder();
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      buf += decoder.decode(chunk, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line) text += (JSON.parse(line) as { message?: { content?: string } }).message?.content ?? "";
      }
    }
    if (buf.trim()) text += (JSON.parse(buf) as { message?: { content?: string } }).message?.content ?? "";
    return parseVerses(text, input);
  }
  async ask(system: string, user: string) {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        think: false,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}`);
    return ((await res.json()) as { message?: { content?: string } }).message?.content ?? "";
  }
}

export class GeminiProvider implements AIProvider {
  readonly label: string;
  constructor(
    readonly model = process.env.GEMINI_MODEL ?? "gemini-3.8-flash",
    private readonly apiKey = process.env.GEMINI_API_KEY,
  ) {
    this.label = model;
  }
  async translateChapter(input: TranslateChapterInput) {
    if (!this.apiKey) throw new Error("GEMINI_API_KEY is not set (.env.local)");
    const { system, user } = translationPrompt(input);
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": this.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
      }),
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    return parseVerses(data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "", input);
  }
  async ask(system: string, user: string) {
    if (!this.apiKey) throw new Error("GEMINI_API_KEY is not set");
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": this.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { temperature: 0.4 },
      }),
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}`);
    const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  }
}

export function getAIProvider(name = process.env.AI_PROVIDER ?? "gemini"): AIProvider {
  switch (name.toLowerCase()) {
    case "gemini":
      return new GeminiProvider();
    case "ollama":
      return new OllamaProvider();
    case "anthropic": // ANTHROPIC_API_KEY — adapter added if Claude is chosen for bulk translation
      throw new Error('AI provider "anthropic" is not implemented yet');
    default:
      throw new Error(`Unknown AI_PROVIDER "${name}"`);
  }
}
