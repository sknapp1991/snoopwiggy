/**
 * Recorded audio (audio v2) served from Cloudflare R2 through the site's own Worker, so no public
 * bucket or CORS setup is needed. Supports HTTP Range requests (iPhones need them to play and seek).
 * Needs an R2 binding named AUDIO in wrangler.jsonc; without it this returns 404 and the reader
 * falls back to the device's voices.
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";

type R2Object = {
  size: number;
  httpEtag: string;
  range?: { offset?: number; length?: number; suffix?: number };
  body?: ReadableStream;
  httpMetadata?: { contentType?: string };
};
type R2BucketLike = { get(key: string, opts?: { range?: Headers; onlyIf?: Headers }): Promise<R2Object | null> };

const KEY = /^[a-z0-9-]+\/[a-z0-9_-]+\/(?:[a-z0-9-]+\/\d+\.(?:mp3|json)|index\.json)$|^index\.json$/;

export async function GET(request: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const key = path.join("/");
  if (!KEY.test(key)) return new Response("Not found", { status: 404 });
  let bucket: R2BucketLike | undefined;
  try {
    bucket = (getCloudflareContext().env as unknown as { AUDIO?: R2BucketLike }).AUDIO;
  } catch {
    bucket = undefined;
  }
  if (!bucket) return new Response("Audio storage not configured", { status: 404 });

  const obj = await bucket.get(key, { range: request.headers, onlyIf: request.headers });
  if (!obj) return new Response("Not found", { status: 404 });
  const headers = new Headers({
    "content-type": obj.httpMetadata?.contentType ?? (key.endsWith(".mp3") ? "audio/mpeg" : "application/json"),
    etag: obj.httpEtag,
    "accept-ranges": "bytes",
    // Recordings never change in place (a new voice/version gets a new path); the index can.
    "cache-control": key.endsWith("index.json") ? "public, max-age=300" : "public, max-age=31536000, immutable",
  });
  if (!obj.body) return new Response(null, { status: 304, headers });
  if (obj.range && request.headers.has("range")) {
    const offset = obj.range.offset ?? (obj.range.suffix !== undefined ? obj.size - obj.range.suffix : 0);
    const length = obj.range.length ?? obj.range.suffix ?? obj.size - offset;
    headers.set("content-range", `bytes ${offset}-${offset + length - 1}/${obj.size}`);
    headers.set("content-length", String(length));
    return new Response(obj.body, { status: 206, headers });
  }
  headers.set("content-length", String(obj.size));
  return new Response(obj.body, { status: 200, headers });
}
