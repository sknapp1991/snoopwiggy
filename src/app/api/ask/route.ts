/**
 * Built-in Ask AI (future paid tier). Off unless NEXT_PUBLIC_FEATURE_ASK_AI_PANEL=true.
 * The provider key stays on the server (lib/ai.ts). Basic per-IP rate limit (per server instance).
 */
import { z } from "zod";
import { ASK_SYSTEM, getAIProvider } from "@/lib/ai";
import { features } from "@/lib/features";

const body = z.object({
  reference: z.string().min(1).max(200),
  translations: z.array(z.object({ abbr: z.string().max(40), language: z.string().max(40), text: z.string().max(4000) })).max(20),
  question: z.string().max(2000),
});

const WINDOW_MS = 60_000;
const LIMIT = 6;
const hits = new Map<string, number[]>();

export async function POST(request: Request) {
  if (!features.askAiPanel) return Response.json({ error: "Not available" }, { status: 404 });
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) return Response.json({ error: "Too many questions — try again in a minute." }, { status: 429 });
  hits.set(ip, [...recent, now]);

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request" }, { status: 400 });
  const { reference, translations, question } = parsed.data;
  const user = [
    `Passage: ${reference}`,
    "Translations on screen:",
    ...translations.map((t) => `- ${t.abbr} (${t.language}): "${t.text}"`),
    "",
    question.trim() || "Explain this verse.",
  ].join("\n");
  try {
    const answer = await getAIProvider().ask(ASK_SYSTEM, user);
    return Response.json({ answer });
  } catch (e) {
    console.error("ask failed", e);
    return Response.json({ error: "The AI service is unavailable right now." }, { status: 502 });
  }
}
