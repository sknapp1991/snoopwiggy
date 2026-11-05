/**
 * Built-in AI study companion (src/components/ai-window.tsx). Google Gemini, free tier.
 * - GET → { ready }: whether a key is configured (the app hides the AI button otherwise).
 * - POST → the answer, streamed as plain text.
 * The key (GEMINI_API_KEY, a Cloudflare Worker secret) never reaches the browser. Without billing
 * turned on for that Google project the free tier simply stops at its daily limit — it can't cost money.
 * Limits: Cloudflare rate-limit binding ASK_LIMIT (per visitor IP, see wrangler.jsonc), plus a small
 * per-instance fallback.
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { z } from "zod";
import { ASK_SYSTEM } from "@/lib/ai";

const body = z.object({
  context: z
    .object({
      reference: z.string().max(200),
      work: z.string().max(100),
      versions: z.array(z.object({ abbr: z.string().max(40), name: z.string().max(120), language: z.string().max(40) })).max(20),
      passage: z.string().max(30000),
    })
    .nullable()
    .optional(),
  verse: z
    .object({
      reference: z.string().max(200),
      texts: z.array(z.object({ abbr: z.string().max(40), name: z.string().max(120), language: z.string().max(40), text: z.string().max(4000) })).max(20),
    })
    .nullable()
    .optional(),
  messages: z.array(z.object({ role: z.enum(["user", "model"]), text: z.string().max(8000) })).min(1).max(30),
});

type Limiter = { limit(o: { key: string }): Promise<{ success: boolean }> };
const env = () => {
  try {
    return getCloudflareContext().env as unknown as { GEMINI_API_KEY?: string; GEMINI_MODEL?: string; ASK_LIMIT?: Limiter };
  } catch {
    return {};
  }
};
const apiKey = () => env().GEMINI_API_KEY ?? process.env.GEMINI_API_KEY;

const WINDOW_MS = 60_000;
const LIMIT = 8;
const hits = new Map<string, number[]>();

export async function GET() {
  return Response.json({ ready: !!apiKey() }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const key = apiKey();
  if (!key) return Response.json({ error: "The AI isn’t set up on this site yet." }, { status: 503 });

  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  const limiter = env().ASK_LIMIT;
  let allowed = true;
  if (limiter) allowed = (await limiter.limit({ key: ip }).catch(() => ({ success: true }))).success;
  else {
    const now = Date.now();
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
    allowed = recent.length < LIMIT;
    if (allowed) hits.set(ip, [...recent, now]);
  }
  if (!allowed) return Response.json({ error: "That’s a lot of questions at once — please wait a minute and try again." }, { status: 429 });

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request" }, { status: 400 });
  const { context, verse, messages } = parsed.data;

  // The reader's screen goes in the system prompt, so follow-up questions keep it.
  const sys = [ASK_SYSTEM, "Format with short paragraphs; use **bold** sparingly and simple '-' lists when helpful."];
  if (context) {
    sys.push(
      "",
      `The reader currently has ${context.reference} (${context.work}) open, in these versions: ${context.versions
        .map((v) => `${v.abbr} (${v.language}, ${v.name})`)
        .join("; ")}.`,
      "The passage on their screen (verse number, then each version's text):",
      context.passage,
    );
  }
  const turns = messages.slice(-16).map((m) => ({ role: m.role, parts: [{ text: m.text }] }));
  if (verse) {
    const last = turns[turns.length - 1];
    last.parts[0].text = [
      `About ${verse.reference}:`,
      ...verse.texts.map((t) => `- ${t.abbr} (${t.language}, ${t.name}): "${t.text}"`),
      "",
      last.parts[0].text,
    ].join("\n");
  }
  if (turns[0].role !== "user") turns.shift();

  // Free-tier models are sometimes "busy" (503) or out of quota (429): retry once, then fall back to
  // Google's rolling aliases. A model that doesn't exist for this key (404) is skipped too.
  const primary = env().GEMINI_MODEL ?? process.env.GEMINI_MODEL ?? "gemini-3.8-flash";
  const models = [primary, primary, "gemini-flash-latest", "gemini-flash-lite-latest"];
  const payload = JSON.stringify({
    systemInstruction: { parts: [{ text: sys.join("\n") }] },
    contents: turns,
    generationConfig: { temperature: 0.4, maxOutputTokens: 4096 },
  });
  let upstream: Response | null = null;
  let status = 0;
  for (const [i, model] of models.entries()) {
    upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: payload,
    }).catch(() => null);
    if (upstream?.ok && upstream.body) break;
    status = upstream?.status ?? 0;
    console.error("gemini failed", model, status, upstream ? (await upstream.text()).slice(0, 300) : "network");
    upstream = null;
    if (![0, 404, 429, 500, 503].includes(status)) break; // bad request etc.: another model won't help
    if (i === 0) await new Promise((r) => setTimeout(r, 800));
  }
  if (!upstream?.body) {
    return Response.json(
      { error: status === 429 ? "The free AI has reached its limit for now — please try again later." : "The AI service is unavailable right now." },
      { status: status === 429 ? 429 : 502 },
    );
  }

  // Gemini SSE ("data: {json}" lines) → plain text chunks.
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  let buf = "";
  const emit = (line: string, ctl: TransformStreamDefaultController<Uint8Array>) => {
    if (!line.startsWith("data:")) return;
    try {
      const d = JSON.parse(line.slice(5)) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
      const t = d.candidates?.[0]?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? "").join("") ?? "";
      if (t) ctl.enqueue(enc.encode(t));
    } catch {
      /* partial line */
    }
  };
  const out = upstream.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, ctl) {
        buf += dec.decode(chunk, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          emit(line, ctl);
        }
      },
      flush(ctl) {
        // A last event without a trailing newline would otherwise be dropped.
        buf += dec.decode();
        emit(buf.trim(), ctl);
        buf = "";
      },
    }),
  );
  return new Response(out, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}
