/**
 * Import the Gospel of Thomas — Mark M. Mattison's translation from the Coptic (Nag Hammadi Codex II),
 * committed by him to the public domain, from gospels.net/thomas. One chapter of 114 sayings; each
 * saying is a "verse" and keeps Mattison's title as its chapter-style heading line. The short
 * prologue opens saying 1.
 *
 *   npx tsx scripts/import-thomas.ts    (downloads into data/raw/thomas, cached)
 */
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { chapterSchema } from "../src/lib/schema";

const ROOT = path.resolve(__dirname, "..");
const RAW = path.join(ROOT, "data", "raw", "thomas");
const OUT = path.join(ROOT, "data", "texts", "thomas");
const exists = (p: string) => access(p).then(() => true, () => false);
const ENT: Record<string, string> = { nbsp: " ", amp: "&", quot: '"', lt: "<", gt: ">", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…" };
const decode = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&(\w+);/g, (m, n: string) => ENT[n] ?? m);

async function main() {
  const file = path.join(RAW, "thomas.htm");
  if (!(await exists(file))) {
    const res = await fetch("https://www.gospels.net/thomas", { headers: { "user-agent": "Mozilla/5.0 VersesAcross-import" } });
    if (!res.ok) throw new Error(`download: ${res.status}`);
    await mkdir(RAW, { recursive: true });
    await writeFile(file, await res.text());
  }
  const html = await readFile(file, "utf8");
  // Paragraphs in order; "Saying N: Title" paragraphs start a saying.
  const paras = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => decode(m[1].replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim());
  const start = paras.findIndex((p) => /^These are the hidden sayings/i.test(p));
  if (start < 0) throw new Error("prologue not found");
  const prologue = paras[start];
  const sayings = new Map<number, { title: string; text: string[] }>();
  let cur: number | null = null;
  for (const p of paras.slice(start + 1)) {
    const h = /^Saying (\d+):\s*(.*)$/.exec(p);
    if (h) {
      cur = Number(h[1]);
      sayings.set(cur, { title: h[2].replace(/\.$/, ""), text: [] });
      continue;
    }
    if (cur === null || !p) continue;
    if (cur === 114 && /^(Translation|Notes?|Bibliography|Copyright|©)/i.test(p)) break;
    sayings.get(cur)!.text.push(p);
  }
  const verses = [...sayings]
    .sort((a, b) => a[0] - b[0])
    .map(([n, s]) => ({ v: String(n), t: `${n === 1 ? `${prologue} ` : ""}${s.text.join(" ")}`.trim() }));
  if (verses.length !== 114) console.warn(`expected 114 sayings, got ${verses.length}`);
  const data = chapterSchema.parse({ work: "thomas", version: "mattison", book: "gth", chapter: 1, verses });
  await rm(OUT, { recursive: true, force: true });
  const dir = path.join(OUT, "mattison", "gth");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "1.json"), `{"work":"thomas","version":"mattison","book":"gth","chapter":1,"verses":[\n${data.verses.map((x) => JSON.stringify(x)).join(",\n")}\n]}\n`);
  console.log(`Gospel of Thomas: ${verses.length} sayings; last: ${verses[verses.length - 1].t.slice(-120)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
