/**
 * Sync codes: one encrypted file per code (its name is a hash derived from the code on the device).
 * GET returns it with its ETag; PUT replaces it only if nobody else changed it meanwhile; DELETE removes it.
 */
import { body, conditionalPut, HEX64, json, syncBucket } from "@/lib/sync-server";

type Ctx = { params: Promise<{ id: string }> };
const MAX = 8 * 1024 * 1024;

export async function GET(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!HEX64.test(id)) return json({ error: "Not found" }, 404);
  const bucket = await syncBucket(request);
  if (bucket instanceof Response) return bucket;
  const obj = await bucket.get(`sync/${id}`);
  if (!obj) return json({ error: "Not found" }, 404);
  return new Response(await obj.arrayBuffer(), {
    headers: { "content-type": "application/octet-stream", etag: obj.httpEtag, "cache-control": "no-store" },
  });
}

export async function PUT(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!HEX64.test(id)) return json({ error: "Not found" }, 404);
  const bucket = await syncBucket(request);
  if (bucket instanceof Response) return bucket;
  const data = await body(request, MAX);
  if (data instanceof Response) return data;
  return conditionalPut(bucket, `sync/${id}`, data, request);
}

export async function DELETE(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!HEX64.test(id)) return json({ error: "Not found" }, 404);
  const bucket = await syncBucket(request);
  if (bucket instanceof Response) return bucket;
  await bucket.delete(`sync/${id}`);
  return json({ ok: true });
}
