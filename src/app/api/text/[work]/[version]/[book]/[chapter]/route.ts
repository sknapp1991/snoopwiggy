import type { NextRequest } from "next/server";
import { getVersion } from "@/lib/catalog";
import { getChapter } from "@/lib/texts";

/** GET /api/text/bible/kjv/gen/1 → chapter JSON (static data, never AI-generated). */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/text/[work]/[version]/[book]/[chapter]">) {
  const { work, version, book, chapter } = await ctx.params;
  const v = getVersion(version);
  if (!v || v.work !== work) return Response.json({ error: "Unknown version" }, { status: 404 });
  // Future: licensed (copyrighted) versions will require an entitled user here.
  if (v.licensed) return Response.json({ error: "This version requires a subscription" }, { status: 403 });

  const data = await getChapter(work, version, book, Number(chapter));
  if (!data) return Response.json({ error: "Chapter not found" }, { status: 404 });
  return Response.json(data, {
    headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" },
  });
}
