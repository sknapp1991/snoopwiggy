/**
 * Feedback reports from the in-app form (src/components/feedback-dialog.tsx). Each report is saved as
 * one JSON file in the private R2 bucket bound as FEEDBACK (Cloudflare dashboard → R2 →
 * versesacross-feedback, one folder per day). The visitor's IP address is used only for the rate limit
 * and is not stored.
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";

type Bucket = { put(key: string, value: string, opts?: { httpMetadata?: { contentType?: string } }): Promise<unknown> };
type Limiter = { limit(o: { key: string }): Promise<{ success: boolean }> };

const TOPICS = new Set(["text", "audio", "bug", "idea", "other"]);
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "");

export async function POST(request: Request) {
  let env: { FEEDBACK?: Bucket; FEEDBACK_LIMIT?: Limiter } = {};
  try {
    env = getCloudflareContext().env as unknown as typeof env;
  } catch {
    /* not on Cloudflare */
  }
  if (!env.FEEDBACK) return Response.json({ error: "Feedback storage isn’t set up." }, { status: 503 });

  const ip = request.headers.get("cf-connecting-ip") ?? "local";
  if (env.FEEDBACK_LIMIT && !(await env.FEEDBACK_LIMIT.limit({ key: ip }).catch(() => ({ success: true }))).success)
    return Response.json({ error: "Too many reports in a row. Please wait a minute and try again." }, { status: 429 });

  const raw = await request.text();
  if (raw.length > 40_000) return Response.json({ error: "That report is too long." }, { status: 413 });
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  const message = clip(body.message, 5000).trim();
  if (!message) return Response.json({ error: "Please write what happened." }, { status: 400 });

  const now = new Date();
  const id = crypto.randomUUID().slice(0, 8);
  const report = {
    id,
    received: now.toISOString(),
    topic: TOPICS.has(body.topic as string) ? body.topic : "other",
    message,
    contact: clip(body.contact, 200).trim() || null,
    page: clip(body.page, 500),
    details: body.details && typeof body.details === "object" ? body.details : null,
  };
  const day = now.toISOString().slice(0, 10);
  const key = `${day}/${now.toISOString().slice(11, 19).replace(/:/g, "")}-${report.topic}-${id}.json`;
  await env.FEEDBACK.put(key, JSON.stringify(report, null, 2), { httpMetadata: { contentType: "application/json" } });
  return Response.json({ ok: true, id }, { headers: { "cache-control": "no-store" } });
}
