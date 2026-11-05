/**
 * Import 1 Enoch — R. H. Charles' translation (1917, public domain), from the Internet Sacred Text
 * Archive (archive.sacred-texts.com/bib/boe/). 108 chapters, Charles' verse numbers.
 * Charles' editorial brackets (⌈ ⌉ ⌈⌈ ⌉⌉ 〈 〉 † — which manuscript a phrase comes from) and his
 * footnotes are left out so the text reads cleanly; the section headings are not verses either.
 *
 *   npx tsx scripts/import-enoch.ts    (downloads into data/raw/enoch, cached)
 */
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { chapterSchema } from "../src/lib/schema";
import { namedEntity, SITE_FOOTER } from "./lib/sacred-texts";

const ROOT = path.resolve(__dirname, "..");
const RAW = path.join(ROOT, "data", "raw", "enoch");
const OUT = path.join(ROOT, "data", "texts", "enoch");
const exists = (p: string) => access(p).then(() => true, () => false);

const ENT: Record<string, string> = { nbsp: " ", amp: "&", quot: '"', lt: "<", gt: ">", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", icirc: "î", acirc: "â", ecirc: "ê", ucirc: "û", ocirc: "ô", eacute: "é", aelig: "æ" };
const decode = (s: string) =>
  s
    .replace(/\[paragraph continues\]/gi, " ") // sacred-texts' page-break marker
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&(\w+);/g, (m, n: string) => ENT[n] ?? namedEntity(n) ?? m)
    .replace(SITE_FOOTER, " ");

const ROMAN: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100 };
const roman = (r: string) => [...r].reduce((acc, c, i, a) => (ROMAN[c] < (ROMAN[a[i + 1]] ?? 0) ? acc - ROMAN[c] : acc + ROMAN[c]), 0);

async function page(n: number) {
  const name = `boe${String(n).padStart(3, "0")}.htm`;
  const file = path.join(RAW, name);
  if (!(await exists(file))) {
    const res = await fetch(`https://archive.sacred-texts.com/bib/boe/${name}`, { headers: { "user-agent": "Mozilla/5.0 VersesAcross-import" } });
    if (!res.ok) throw new Error(`download ${name}: ${res.status}`);
    await mkdir(RAW, { recursive: true });
    await writeFile(file, await res.text());
  }
  return readFile(file, "utf8");
}

async function main() {
  // All chapter pages as one text with "\u0001N\u0001" chapter markers.
  let text = "";
  for (let n = 4; n <= 112; n++) {
    let h = await page(n);
    // The text sits between the page header ("… at sacred-texts.com") and the navigation below it.
    const head = h.search(/at sacred-texts\.com<\/FONT><\/P>/i);
    h = h.slice(head >= 0 ? head : h.search(/<body/i));
    h = h.replace(/^[\s\S]*?<HR>/i, ""); // rest of that header, up to its rule
    const nav = h.search(/<div class="filenav">|<HR>/i);
    if (nav >= 0) h = h.slice(0, nav);
    h = h.replace(/<script[\s\S]*?<\/script>/gi, "");
    // Where Charles prints two recensions side by side (Ethiopic | Greek), keep only the left column,
    // the Ethiopic his main text follows; otherwise both get run together (22:10 "… sinners been made for sinners").
    h = h.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (table, inner: string) => {
      if (!/width="50%"/i.test(inner)) return table;
      const lefts: string[] = [];
      const rights: string[] = [];
      for (const [, row] of inner.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)) {
        const cells = row
          .split(/<td[^>]*>/i)
          .slice(1)
          .map((c) => c.replace(/<\/td>[\s\S]*$/i, "").replace(/<p>(\s*)(\d{1,3}) (?=[A-Z])/gi, "<p>$1$2. ")); // "2 And" → "2. And"
        lefts.push(cells[0] ?? "");
        rights.push(cells[1] ?? "");
      }
      const nums = (c: string) => new Set([...c.replace(/<[^>]+>/g, " ").matchAll(/(?:^|\s)(\d{1,3})\.\s/g)].map((m) => m[1]));
      const l = nums(lefts.join(" "));
      const r = nums(rights.join(" "));
      // Different verses side by side (90:13–15 | 16–18, doublets): keep both, left column first.
      // The same verses: a second recension of them — keep only the left one.
      const keepRight = r.size > 0 && ![...r].some((n) => l.has(n));
      return ` ${lefts.join(" ")} ${keepRight ? rights.join(" ") : ""} `;
    });
    h = h.replace(/<p align="CENTER">[\s\S]*?<\/p>/gi, " "); // section headings ("XXXVII-LXXI")
    h = h.replace(/<h3[^>]*>\s*CHAPTER\s+([IVXLC]+)\.?\s*<\/h3>/gi, (_, r: string) => ` \u0001${roman(r)}\u0001 `);
    h = h.replace(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/gi, " "); // other headings
    h = h.replace(/<a name="page_[^"]*">[\s\S]*?<\/a>/gi, " "); // page numbers
    h = h.replace(/<a href="#fn_[^"]*">[\s\S]*?<\/a>/gi, " "); // footnote markers
    h = h.replace(/<hr[^>]*>\s*<h3[^>]*>\s*Footnotes[\s\S]*$/i, " ").replace(/Footnotes[\s\S]*$/i, (m) => (m.includes("\u0001") ? m : " "));
    h = h.replace(/Next:[\s\S]*$/i, " ");
    text += " " + decode(h.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " "));
  }
  text = text
    .replace(/[⌈⌉〈〉†]/g, "")
    .replace("Honoured and 2 Mighty", "Honoured and Mighty") // a stray "2" in the source (103:1)
    .replace(/\bp\.\s*\d+\b/g, " ")
    .replace(/\s+/g, " ");

  await rm(OUT, { recursive: true, force: true });
  const parts = text.split("\u0001");
  let chapters = 0;
  let verses = 0;
  // Verses per chapter: Charles prints 91:12–17 after chapter 93 (his order), so a chapter can come twice.
  const byChapter = new Map<number, { v: string; t: string }[]>();
  let prevCh = 0;
  for (let i = 1; i < parts.length; i += 2) {
    let ch = Number(parts[i]);
    // The source repeats "LXXVII" for chapter 78: a repeat followed by prev+2 is really prev+1.
    if (ch === prevCh && Number(parts[i + 2]) === prevCh + 2) ch = prevCh + 1;
    prevCh = ch;
    const body = parts[i + 1] ?? "";
    // "1. text 2. text" — keep verse numbers that count upwards (a stray "1." in a list won't break it).
    // A chapter part may start mid-chapter (91:12), so the first number found sets the start.
    const list: { v: string; t: string }[] = [];
    const firstNum = /(?:^|\s)(\d{1,3})\.\s/.exec(body);
    let expect = firstNum && Number(firstNum[1]) > 5 && Number(firstNum[1]) <= 30 ? Number(firstNum[1]) : 1;
    const first = expect;
    // OCR slips: "l." / "I." for 1, "O" for 0 — accepted only where that number is the one expected.
    // "2.For" (no space) too; "17 And" (no full stop) only where 17 is the number expected.
    // (?<!\S) rather than \s, so "80. 17." finds the 17 too (74:17).
    const re = /(?<!\S)([\dlIO]{1,3})(\s?\.(?:\s|(?=[A-Z‘'"(]))| (?=[A-Z]))/g;
    const found = [...body.matchAll(re)].map((m) => ({
      n: Number(m[1].replace(/[lI]/g, "1").replace(/O/g, "0")),
      ocr: /[lIO]/.test(m[1]),
      // A number without its full stop counts only after the end of a sentence ("…and 2 Mighty One" in 103:1 is a typo).
      dot: m[2].includes("."),
      sentence: m[2].includes(".") || /(?:^|[.:;!?'"’”)\]])\s*$/.test(body.slice(Math.max(0, m.index! - 4), m.index!)),
      at: m.index!,
      end: m.index! + m[0].length,
    }));
    const cuts: { n: number; at: number; end: number }[] = [];
    const used = new Set<number>();
    for (const [k, f] of found.entries()) {
      const { n } = f;
      if (f.ocr && (n !== expect || !f.dot)) continue; // "I Enoch" is not verse 1
      if (!f.dot && (!f.sentence || (n !== expect && n !== expect + 1))) continue; // "17 And" when 16 is missing (10:17)
      if (used.has(n)) continue;
      const after = found.slice(k + 1).find((x) => x.dot && !x.ocr)?.n;
      // In order (allowing a skipped number or two); or a run further on (91:18, 19 printed after 91:11);
      // or one verse Charles moved here (60:25 after 60:6; 106:17 before 106:16) — reading then resumes.
      const inOrder = n >= expect && n <= expect + 2;
      const run = n > expect && n <= expect + 12 && after === n + 1;
      const moved = n > expect && n <= expect + 30 && after === expect;
      // A number skipped earlier, printed later (90:14, 15 come after 90:16 and 19 in the source).
      const backfill = f.dot && !f.ocr && n < expect && n >= first;
      if (!inOrder && !run && !moved && !backfill) continue;
      cuts.push({ n, at: f.at, end: f.end });
      used.add(n);
      if (!moved && !backfill) expect = n + 1;
    }
    for (const [k, c] of cuts.entries()) {
      const t = body
        .slice(c.end, cuts[k + 1]?.at ?? body.length)
        .replace(/\s+([,.;:!?)])/g, "$1")
        .trim();
      if (t) list.push({ v: String(c.n), t });
    }
    // A one-verse chapter has no number printed.
    if (!list.length && body.trim()) list.push({ v: "1", t: body.replace(/\s+([,.;:!?)])/g, "$1").trim() });
    if (!list.length) {
      console.warn(`chapter ${ch}: no verses found`);
      continue;
    }
    byChapter.set(ch, [...(byChapter.get(ch) ?? []), ...list]);
  }
  for (const [ch, raw] of [...byChapter].sort((a, b) => a[0] - b[0])) {
    const seen = new Set<string>();
    const list = raw.filter((x) => !seen.has(x.v) && seen.add(x.v)).sort((a, b) => Number(a.v) - Number(b.v));
    const data = chapterSchema.parse({ work: "enoch", version: "charles", book: "1en", chapter: ch, verses: list });
    const dir = path.join(OUT, "charles", "1en");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, `${ch}.json`), `{"work":"enoch","version":"charles","book":"1en","chapter":${ch},"verses":[\n${data.verses.map((x) => JSON.stringify(x)).join(",\n")}\n]}\n`);
    chapters++;
    verses += list.length;
  }
  console.log(`1 Enoch: ${chapters} chapters, ${verses} verses`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
