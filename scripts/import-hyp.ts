/**
 * Import the Hatha Yoga Pradipika (Yoga) — Pancham Sinh's translation (1914, public domain), from the
 * Internet Sacred Text Archive's transcription (archive.sacred-texts.com/hin/hyp/). English only: the
 * site's Sanskrit is an experimental conversion its editor notes doesn't line up with the book.
 * 4 chapters; verse numbers are Pancham Sinh's (the margin notes "12."). A paragraph without a number
 * (a translator's note) stays with the verse before it.
 *
 *   npx tsx scripts/import-hyp.ts    (downloads into data/raw/hyp, cached)
 */
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { chapterSchema } from "../src/lib/schema";

const ROOT = path.resolve(__dirname, "..");
const RAW = path.join(ROOT, "data", "raw", "hyp");
const OUT = path.join(ROOT, "data", "texts", "hyp");
const FILES = ["hyp03", "hyp04", "hyp05", "hyp06"]; // chapters I–IV
const exists = (p: string) => access(p).then(() => true, () => false);

const ENT: Record<string, string> = { acirc: "â", Acirc: "Â", icirc: "î", Icirc: "Î", ucirc: "û", Ucirc: "Û", ecirc: "ê", ocirc: "ô", nbsp: " ", amp: "&", quot: '"', lt: "<", gt: ">", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };
Object.assign(ENT, { ntilde: "ñ", Ntilde: "Ñ", aelig: "æ", atilde: "ã", aacute: "á", raquo: "»", laquo: "«", frac34: "¾", frac12: "½", frac14: "¼" });
/** Old pages use Windows-1252 codes in numeric references (&#151; = em dash). */
const CP1252: Record<number, string> = { 133: "…", 145: "‘", 146: "’", 147: "“", 148: "”", 150: "–", 151: "—" };
const decodeOnce = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => CP1252[Number(n)] ?? String.fromCodePoint(Number(n)))
    .replace(/&(\w+);/g, (m, n: string) => ENT[n] ?? m);
const decode = (s: string) => decodeOnce(decodeOnce(s)); // some entities are double-encoded ("&amp;ntilde;")

async function get(name: string) {
  const file = path.join(RAW, `${name}.htm`);
  if (!(await exists(file))) {
    const res = await fetch(`https://archive.sacred-texts.com/hin/hyp/${name}.htm`, { headers: { "user-agent": "Mozilla/5.0 VersesAcross-import" } });
    if (!res.ok) throw new Error(`download ${name}: ${res.status}`);
    await mkdir(RAW, { recursive: true });
    await writeFile(file, await res.text());
  }
  return readFile(file, "utf8");
}

async function main() {
  await rm(OUT, { recursive: true, force: true });
  for (const [i, name] of FILES.entries()) {
    const html = (await get(name)).replace(/<script[\s\S]*?<\/script>/gi, "");
    const body = html.slice(html.search(/<body/i));
    const verses: { v: string; t: string; to?: string }[] = [];
    for (const m of body.matchAll(/<p>([\s\S]*?)<\/p>/gi)) {
      const p = m[1];
      if (/<font color="green">/i.test(p) && !/margnote/i.test(p)) continue; // Sanskrit / transliteration
      const num = /<a name="an_[^"]*">\s*(\d+)(?:\s*[-–]\s*(\d+))?\.?\s*<\/a>/i.exec(p);
      const text = decode(p.replace(/<span class="margnote">[\s\S]*?<\/span>/gi, " ").replace(/<[^>]+>/g, " "))
        .replace(/(^|\s)p\.\s*\d+(?=\s|$)/g, " ") // page numbers ("p. 10"; the space can be a no-break space)
        .replace(/Note \.(?=\s|$)/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (!text || /^(next|previous|index|sacred texts)/i.test(text)) continue;
      if (num) verses.push({ v: num[1], t: text, ...(num[2] ? { to: num[2] } : {}) });
      else if (verses.length) verses[verses.length - 1].t += ` ${text}`; // translator's note
    }
    // One entry per verse number (the source repeats none in practice; keep the first).
    const seen = new Set<string>();
    const list = verses.filter((x) => !seen.has(x.v) && seen.add(x.v));
    const data = chapterSchema.parse({ work: "hyp", version: "sinh", book: "hyp", chapter: i + 1, verses: list });
    const dir = path.join(OUT, "sinh", "hyp");
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, `${i + 1}.json`),
      `{"work":"hyp","version":"sinh","book":"hyp","chapter":${i + 1},"verses":[\n${data.verses.map((x) => JSON.stringify(x)).join(",\n")}\n]}\n`,
    );
    const nums = list.map((x) => Number(x.v));
    const gaps = nums.filter((n, k) => k > 0 && n !== nums[k - 1] + 1 && n !== Number(list[k - 1].to ?? 0) + 1);
    console.log(`chapter ${i + 1}: ${list.length} verses (1–${Math.max(...nums)})${gaps.length ? `, jumps at ${gaps.join(", ")}` : ""}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
