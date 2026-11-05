/**
 * Import the Bhagavad Gita (Hinduism) from Wikisource's proofread transcription of Annie Besant's
 * translation, 4th edition (1922, public domain in the US). The edition prints each verse in Sanskrit
 * (Devanagari, "॥ ७ ॥") followed by Besant's English ("(7)"), so both versions come from the same pages:
 *   - besant    English, Annie Besant (1922)
 *   - sanskrit  Sanskrit (Devanagari), as printed in that edition
 * Speaker lines ("Arjuna said:" / "अर्जुन उवाच ।") stay at the start of the verse they introduce.
 * Besant's footnote markers are dropped.
 *
 *   npx tsx scripts/import-gita.ts    (downloads into data/raw/gita, cached)
 */
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { chapterSchema } from "../src/lib/schema";

const ROOT = path.resolve(__dirname, "..");
const RAW = path.join(ROOT, "data", "raw", "gita");
const OUT = path.join(ROOT, "data", "texts", "gita");
const UA = "VersesAcross-import/1.0 (https://versesacross.com)";
/** Standard verse counts (Gita Press); Besant's edition may differ slightly (shown as gaps). */
const COUNTS = [47, 72, 43, 42, 29, 47, 30, 28, 34, 42, 55, 20, 35, 27, 20, 24, 28, 78];

const exists = (p: string) => access(p).then(() => true, () => false);
const DEVA_DIGITS = "०१२३४५६७८९";
const devaNum = (s: string) => Number([...s].map((c) => DEVA_DIGITS.indexOf(c)).join(""));

async function page(n: number): Promise<string> {
  const file = path.join(RAW, `besant-${n}.json`);
  if (!(await exists(file))) {
    const url = `https://en.wikisource.org/w/api.php?action=parse&page=${encodeURIComponent(`Bhagavad-Gita_(Besant_4th)/Discourse_${n}`)}&prop=text&format=json&formatversion=2`;
    const res = await fetch(url, { headers: { "user-agent": UA } });
    if (!res.ok) throw new Error(`download discourse ${n}: ${res.status}`);
    await mkdir(RAW, { recursive: true });
    await writeFile(file, await res.text());
  }
  return (JSON.parse(await readFile(file, "utf8")) as { parse: { text: string } }).parse.text;
}

function toText(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<sup[^>]*class="[^"]*reference[\s\S]*?<\/sup>/g, " ") // footnote markers
    .replace(/<ol class="references"[\s\S]*?<\/ol>/g, " ")
    .replace(/<br\s*\/?>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\.mw-parser-output[^{]*\{[^}]*\}/g, " ")
    .replace(/\[\s*\d+\s*\]/g, " ") // any leftover "[ 3 ]"
    .replace(/[​­ ]/g, " ");
}
const tidy = (s: string) => s.replace(/\s+/g, " ").replace(/\s+([,.;:!?)])/g, "$1").trim();

type V = { v: string; t: string; to?: string };

/**
 * The page runs: Sanskrit verse n "॥ n ॥", then Besant's English for n "(n)", then Sanskrit n+1 …
 * The Sanskrit markers are reliable; Besant's "(n)" sometimes is missing, misprinted or split by a
 * page break. So the English between Sanskrit markers n and n+1 is verse n (its Latin text), cut at
 * the last "(…)" marker when there is one (drops page furniture and the closing colophon).
 */
function parse(text: string) {
  const marks = [...text.matchAll(/॥\s*([०-९]+)(?:\s*[-–]\s*([०-९]+))?\s*॥/g)];
  const sa: V[] = [];
  const en: V[] = [];
  // Devanagari only (letters, signs, danda), closed with the verse-end mark "॥".
  const deva = (s: string) => {
    const t = tidy(s.replace(/[^ऀ-ॿ‌‍\s]+/g, " ").replace(/[०-९]+/g, " "));
    return t ? `${t} ॥` : "";
  };
  const latin = (s: string) => {
    let t = s.replace(/[ऀ-ॿ]+/g, " ").replace(/^[\s\S]*DISCOURSE\.?/, "");
    const ends = [...t.matchAll(/\(\s*\d+(?:\s*[-–]\s*\d+)?\s*\)?/g)];
    if (ends.length) t = t.slice(0, ends[ends.length - 1].index);
    return tidy(t.replace(/(^|\s)\d{1,2}(?=\s)/g, " ")); // stray footnote numbers
  };
  const num = (m: RegExpMatchArray) => ({ v: String(devaNum(m[1])), ...(m[2] ? { to: String(devaNum(m[2])) } : {}) });
  let prevEnd = 0;
  marks.forEach((m, i) => {
    const before = text.slice(prevEnd, m.index);
    if (i > 0) {
      const t = latin(before);
      if (t) en.push({ ...num(marks[i - 1]), t });
    }
    const t = deva(before);
    if (t) sa.push({ ...num(m), t });
    prevEnd = m.index! + m[0].length;
  });
  if (marks.length) {
    const t = latin(text.slice(prevEnd));
    if (t) en.push({ ...num(marks[marks.length - 1]), t });
  }
  return { sa, en };
}

/** Keep one entry per verse number, in order (a stray "(1)" in a note must not duplicate a verse). */
function dedupe(list: V[], max: number) {
  const seen = new Set<string>();
  return list.filter((x) => {
    const n = Number(x.v);
    if (!n || n > max || seen.has(x.v)) return false;
    seen.add(x.v);
    return true;
  });
}

async function main() {
  await rm(OUT, { recursive: true, force: true });
  const report: string[] = [];
  for (let ch = 1; ch <= 18; ch++) {
    const { sa, en } = parse(toText(await page(ch)));
    const max = COUNTS[ch - 1] + 2;
    for (const [version, list] of [
      ["besant", dedupe(en, max)],
      ["sanskrit", dedupe(sa, max)],
    ] as const) {
      const verses = list.map((x) => ({ v: x.v, t: x.t, ...(x.to ? { to: x.to } : {}) }));
      const data = chapterSchema.parse({ work: "gita", version, book: "gita", chapter: ch, verses });
      const dir = path.join(OUT, version, "gita");
      await mkdir(dir, { recursive: true });
      await writeFile(
        path.join(dir, `${ch}.json`),
        `{"work":"gita","version":"${version}","book":"gita","chapter":${ch},"verses":[\n${data.verses.map((x) => JSON.stringify(x)).join(",\n")}\n]}\n`,
      );
    }
    const e = dedupe(en, max).length;
    const s = dedupe(sa, max).length;
    report.push(`ch ${String(ch).padStart(2)}: English ${e}, Sanskrit ${s} (standard ${COUNTS[ch - 1]})${e !== s || e !== COUNTS[ch - 1] ? "  ←" : ""}`);
  }
  console.log(report.join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
