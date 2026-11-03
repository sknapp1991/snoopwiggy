/** Server-only: read chapter JSON from data/texts. */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { cacheLife } from "next/cache";
import { chapterSchema, type Chapter } from "./schema";

const TEXT_ROOT = path.join(/* turbopackIgnore: true */ process.cwd(), "data", "texts");
const ID = /^[a-z0-9][a-z0-9-]*$/;

export async function getChapter(work: string, version: string, book: string, chapter: number): Promise<Chapter | null> {
  "use cache";
  cacheLife("days");
  if (![work, version, book].every((s) => ID.test(s)) || !Number.isInteger(chapter) || chapter < 1) return null;
  try {
    // data/texts is shipped via outputFileTracingIncludes (next.config.ts); skip broad static tracing here.
    const file = path.join(/* turbopackIgnore: true */ TEXT_ROOT, work, version, book, `${chapter}.json`);
    return chapterSchema.parse(JSON.parse(await readFile(file, "utf8")));
  } catch {
    return null;
  }
}
