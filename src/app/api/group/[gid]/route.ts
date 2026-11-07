/**
 * Study groups: GET returns every member's encrypted card plus the group's encrypted details ("meta").
 * PUT replaces the details (any member can, e.g. to change the book the group is reading).
 */
import { body, conditionalPut, HEX64, json, syncBucket, toBase64 } from "@/lib/sync-server";

type Ctx = { params: Promise<{ gid: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const { gid } = await ctx.params;
  if (!HEX64.test(gid)) return json({ error: "Not found" }, 404);
  const bucket = await syncBucket(request);
  if (bucket instanceof Response) return bucket;
  const { objects } = await bucket.list({ prefix: `group/${gid}/`, limit: 60 });
  const docs = await Promise.all(
    objects.map(async (o) => {
      const obj = await bucket.get(o.key);
      return obj ? { id: o.key.slice(`group/${gid}/`.length), etag: obj.httpEtag, at: obj.uploaded.toISOString(), data: toBase64(await obj.arrayBuffer()) } : null;
    }),
  );
  const list = docs.filter((d) => !!d);
  if (!list.length) return json({ error: "No such group" }, 404);
  return json({ meta: list.find((d) => d.id === "meta") ?? null, members: list.filter((d) => d.id !== "meta") });
}

export async function PUT(request: Request, ctx: Ctx) {
  const { gid } = await ctx.params;
  if (!HEX64.test(gid)) return json({ error: "Not found" }, 404);
  const bucket = await syncBucket(request);
  if (bucket instanceof Response) return bucket;
  const data = await body(request, 16 * 1024);
  if (data instanceof Response) return data;
  return conditionalPut(bucket, `group/${gid}/meta`, data, request);
}
