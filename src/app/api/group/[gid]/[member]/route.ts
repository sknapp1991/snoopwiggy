/**
 * One member's encrypted card in a study group. The member id is the SHA-256 of a secret only that
 * member's device holds (sent as x-member-key), so nobody else in the group can overwrite or remove it.
 */
import { body, HEX64, json, sha256hex, syncBucket } from "@/lib/sync-server";

type Ctx = { params: Promise<{ gid: string; member: string }> };

async function check(request: Request, ctx: Ctx) {
  const { gid, member } = await ctx.params;
  if (!HEX64.test(gid) || !HEX64.test(member)) return json({ error: "Not found" }, 404);
  const key = request.headers.get("x-member-key") ?? "";
  if (key.length < 32 || (await sha256hex(key)) !== member) return json({ error: "Not allowed" }, 403);
  const bucket = await syncBucket(request);
  if (bucket instanceof Response) return bucket;
  return { bucket, key: `group/${gid}/${member}`, gid };
}

export async function PUT(request: Request, ctx: Ctx) {
  const c = await check(request, ctx);
  if (c instanceof Response) return c;
  const data = await body(request, 16 * 1024);
  if (data instanceof Response) return data;
  if (!(await c.bucket.head(c.key))) {
    const { objects } = await c.bucket.list({ prefix: `group/${c.gid}/`, limit: 60 });
    if (objects.length >= 51) return json({ error: "This group is full (50 people)." }, 409);
  }
  await c.bucket.put(c.key, data);
  return json({ ok: true });
}

export async function DELETE(request: Request, ctx: Ctx) {
  const c = await check(request, ctx);
  if (c instanceof Response) return c;
  await c.bucket.delete(c.key);
  return json({ ok: true });
}
