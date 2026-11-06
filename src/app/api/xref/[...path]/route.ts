/**
 * Cross references (src/components/xref-panel.tsx): one JSON file per book, built offline by
 * scripts/xref/build.py and kept in the R2 bucket (binding AUDIO) under xref/ — too big for git.
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";

type R2Object = { httpEtag: string; body?: ReadableStream; size: number };
type R2BucketLike = { get(key: string, opts?: { onlyIf?: Headers }): Promise<R2Object | null> };

const KEY = /^[a-z0-9-]+\/[a-z0-9_-]+\.json$/;

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
  if (!bucket) return new Response("Not configured", { status: 404 });
  const obj = await bucket.get(`xref/${key}`, { onlyIf: request.headers });
  if (!obj) return new Response("Not found", { status: 404 });
  const headers = new Headers({
    "content-type": "application/json",
    etag: obj.httpEtag,
    // Rebuilt when texts are added: a day in caches, then checked again.
    "cache-control": "public, max-age=86400",
  });
  if (!obj.body) return new Response(null, { status: 304, headers });
  return new Response(obj.body, { status: 200, headers });
}
