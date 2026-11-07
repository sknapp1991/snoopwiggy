/**
 * Server helpers for sync codes and study groups. Everything stored is encrypted on the device with a key
 * the server never sees, so these routes only move opaque bytes around.
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";

type R2Obj = { httpEtag: string; uploaded: Date; size: number; key: string; arrayBuffer(): Promise<ArrayBuffer> };
export type Bucket = {
  get(key: string): Promise<R2Obj | null>;
  head(key: string): Promise<Omit<R2Obj, "arrayBuffer"> | null>;
  put(key: string, value: ArrayBuffer, opts?: { onlyIf?: { etagMatches?: string } }): Promise<{ httpEtag: string } | null>;
  delete(key: string): Promise<void>;
  list(o: { prefix: string; limit?: number }): Promise<{ objects: { key: string; uploaded: Date; size: number }[] }>;
};
type Limiter = { limit(o: { key: string }): Promise<{ success: boolean }> };

export const HEX64 = /^[a-f0-9]{64}$/;
export const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(data, { status, headers: { "cache-control": "no-store", ...headers } });

/** The bucket, after the per-visitor rate limit; or an error response. */
export async function syncBucket(request: Request): Promise<Bucket | Response> {
  let env: { SYNC?: Bucket; SYNC_LIMIT?: Limiter } = {};
  try {
    env = getCloudflareContext().env as unknown as typeof env;
  } catch {
    /* not on Cloudflare */
  }
  if (!env.SYNC) return json({ error: "Sync isn’t set up on this server." }, 503);
  const ip = request.headers.get("cf-connecting-ip") ?? "local";
  if (env.SYNC_LIMIT && !(await env.SYNC_LIMIT.limit({ key: ip }).catch(() => ({ success: true }))).success)
    return json({ error: "Too many requests. Please wait a minute." }, 429);
  return env.SYNC;
}

/** Read a request body up to `max` bytes. */
export async function body(request: Request, max: number): Promise<ArrayBuffer | Response> {
  const len = Number(request.headers.get("content-length") ?? 0);
  if (len > max) return json({ error: "Too large" }, 413);
  const buf = await request.arrayBuffer();
  if (buf.byteLength > max) return json({ error: "Too large" }, 413);
  if (buf.byteLength < 13) return json({ error: "Empty" }, 400);
  return buf;
}

/**
 * Write with optimistic locking: If-Match "<etag>" replaces only that version; If-None-Match: * only
 * creates. Returns the new ETag, or a 412 when someone else wrote first.
 */
export async function conditionalPut(bucket: Bucket, key: string, data: ArrayBuffer, request: Request): Promise<Response> {
  const ifMatch = request.headers.get("if-match")?.replace(/^W\//, "").replace(/"/g, "");
  if (request.headers.get("if-none-match") === "*") {
    if (await bucket.head(key)) return json({ error: "Changed elsewhere" }, 412);
    const r = await bucket.put(key, data);
    return json({ ok: true }, 200, { etag: r?.httpEtag ?? "" });
  }
  if (ifMatch) {
    const r = await bucket.put(key, data, { onlyIf: { etagMatches: ifMatch } });
    if (!r) return json({ error: "Changed elsewhere" }, 412);
    return json({ ok: true }, 200, { etag: r.httpEtag });
  }
  return json({ error: "If-Match or If-None-Match required" }, 428);
}

export async function sha256hex(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function toBase64(buf: ArrayBuffer) {
  let s = "";
  const b = new Uint8Array(buf);
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}
