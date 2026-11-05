/**
 * Import the Ramayana (Hinduism) — Ralph T. H. Griffith's verse translation "The Rámáyan of Válmíki"
 * (1870–74, public domain), from the Internet Sacred Text Archive (archive.sacred-texts.com/hin/rama).
 * Six books (Kandas); chapter = canto (its name as the chapter title); verse = stanza. Griffith doesn't
 * number stanzas, so each indented stanza in his layout is a verse, numbered in order.
 * Footnotes and page numbers are left out.
 *
 * Pages are fetched with curl into data/raw/ramayana first (the site blocks Node's fetch).
 *   npx tsx scripts/import-ramayana.ts  → data/texts/ramayana/griffith-ry/... and data/ramayana-books.json
 */
import { readFile, rm, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chapterSchema } from "../src/lib/schema";

const ROOT = path.resolve(__dirname, "..");
const RAW = path.join(ROOT, "data", "raw", "ramayana");
const OUT = path.join(ROOT, "data", "texts", "ramayana");
const NAMES = ["Bala Kanda (Childhood)", "Ayodhya Kanda (Ayodhya)", "Aranya Kanda (The Forest)", "Kishkindha Kanda (Kishkindha)", "Sundara Kanda (Beautiful)", "Yuddha Kanda (War)"];

const ENT: Record<string, string> = { nbsp: " ", amp: "&", quot: '"', lt: "<", gt: ">", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", aacute: "á", Aacute: "Á", eacute: "é", Eacute: "É", iacute: "í", Iacute: "Í", oacute: "ó", Oacute: "Ó", uacute: "ú", Uacute: "Ú", acirc: "â", icirc: "î", ucirc: "û", ntilde: "ñ", aelig: "æ", uuml: "ü" };
const decode = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&(\w+);/g, (m, n: string) => ENT[n] ?? m);
const tidy = (s: string) => s.replace(/[\s ]+/g, " ").replace(/\s+([,.;:!?)])/g, "$1").trim();

function canto(html: string) {
  let h = html.slice(html.search(/<H3/i));
  const title = /<H3[^>]*>([\s\S]*?)<\/H3>/i.exec(h)?.[1] ?? "";
  h = h.replace(/<H3[^>]*>[\s\S]*?<\/H3>/i, "");
  const foot = h.search(/<H3[^>]*>\s*Footnotes|<P>\s*<HR>|<HR>\s*<CENTER>/i);
  if (foot >= 0) h = h.slice(0, foot);
  h = h
    .replace(/<A NAME="page_[^"]*">[\s\S]*?<\/A>(<BR>)?/gi, "")
    .replace(/<A NAME="fr_[^"]*"><\/A>/gi, "")
    .replace(/<A HREF="#fn_[^"]*">[\s\S]*?<\/A>/gi, "")
    .replace(/<CENTER>[\s\S]*?<\/CENTER>/gi, ""); // "*********", "OM."
  const raw = decode(h.replace(/<BR>/gi, "\n").replace(/<P>/gi, "\n").replace(/<[^>]+>/g, "")).split("\n");
  // A stanza starts on an indented line ("&nbsp;&nbsp; To sainted Nárad…"). Long stanzas are split
  // after a sentence end once they pass 8 lines, so a "verse" stays a readable size.
  const verses: string[][] = [];
  for (const line of raw) {
    if (!line.trim()) continue;
    const indented = /^\s* /.test(line);
    const cur = verses[verses.length - 1];
    const longEnough = cur && cur.length >= 8 && /[.!?;:]['’”]?$/.test(cur[cur.length - 1]);
    if (indented || !verses.length || longEnough) verses.push([]);
    verses[verses.length - 1].push(tidy(line));
  }
  const name = tidy(decode(title.replace(/<A[\s\S]*?<\/A>/gi, "").replace(/<[^>]+>/g, "")))
    .replace(/^CANTO\s+[IVXLC]+\.?:?\s*/i, "")
    .replace(/\.$/, "");
  const nice = name ? name.toLowerCase().replace(/(^|[\s(-])(\S)/g, (m) => m.toUpperCase()) : undefined;
  return { title: nice, verses: verses.map((v, i) => ({ v: String(i + 1), t: v.join(" ") })).filter((x) => x.t) };
}

async function main() {
  const idx = await readFile(path.join(RAW, "index.htm"), "utf8");
  // Index order: "Book I" links start a book; "Canto …" links are its cantos.
  const order: { book: number; file: string }[] = [];
  let book = 0;
  for (const m of idx.matchAll(/HREF="(ry\d+)\.htm">([^<]+)</gi)) {
    const label = decode(m[2]).trim();
    if (/^Book [IVX]+$/i.test(label)) book++;
    else if (/^Canto/i.test(label) && book >= 1 && book <= 6) order.push({ book, file: m[1] });
  }
  await rm(OUT, { recursive: true, force: true });
  const books: { id: string; name: string; chapters: number }[] = [];
  for (let b = 1; b <= 6; b++) {
    const files = [...new Set(order.filter((o) => o.book === b).map((o) => o.file))];
    let ch = 0;
    let verses = 0;
    for (const f of files) {
      const html = await readFile(path.join(RAW, `${f}.htm`), "utf8").catch(() => "");
      if (!html) {
        console.warn(`missing ${f}`);
        continue;
      }
      const c = canto(html);
      if (!c.verses.length) continue;
      ch++;
      verses += c.verses.length;
      const data = chapterSchema.parse({ work: "ramayana", version: "griffith-ry", book: `ry${b}`, chapter: ch, verses: c.verses, ...(c.title ? { title: c.title } : {}) });
      const dir = path.join(OUT, "griffith-ry", `ry${b}`);
      await mkdir(dir, { recursive: true });
      await writeFile(
        path.join(dir, `${ch}.json`),
        `{"work":"ramayana","version":"griffith-ry","book":"ry${b}","chapter":${ch}${data.title ? `,"title":${JSON.stringify(data.title)}` : ""},"verses":[\n${data.verses.map((x) => JSON.stringify(x)).join(",\n")}\n]}\n`,
      );
    }
    books.push({ id: `ry${b}`, name: NAMES[b - 1], chapters: ch });
    console.log(`Book ${b} ${NAMES[b - 1]}: ${ch} cantos, ${verses} stanzas`);
  }
  await writeFile(path.join(ROOT, "data", "ramayana-books.json"), JSON.stringify(books, null, 1) + "\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
