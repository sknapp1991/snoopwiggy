/**
 * Shared helpers for the world-religions importers (scripts/import-world.ts): cached downloads,
 * HTML → plain paragraphs, Project Gutenberg header/footer removal, and chapter files.
 */
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { chapterSchema } from "../../src/lib/schema";
import { namedEntity, SITE_FOOTER } from "./sacred-texts";

export const ROOT = path.resolve(__dirname, "..", "..");
const exists = (p: string) => access(p).then(() => true, () => false);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Download once into data/raw/<dir>/<name> and reuse it. */
export async function cached(dir: string, name: string, url: string): Promise<string> {
  const file = path.join(ROOT, "data", "raw", dir, name);
  if (await exists(file)) return readFile(file, "utf8");
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 VersesAcross-import" } });
  if (!res.ok) throw new Error(`download ${url}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  // Old sacred-texts pages are Windows-1252; everything else here is UTF-8.
  let text = buf.toString("utf8");
  if (text.includes("�")) text = new TextDecoder("windows-1252").decode(buf);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text);
  await sleep(300);
  return text;
}

const ENT: Record<string, string> = {
  nbsp: " ", amp: "&", quot: '"', lt: "<", gt: ">", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", apos: "'",
  acirc: "â", icirc: "î", ucirc: "û", ecirc: "ê", ocirc: "ô", Acirc: "Â", ntilde: "ñ", aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú",
};
export function decodeEntities(s: string) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&(\w+);/g, (m, n: string) => ENT[n] ?? namedEntity(n) ?? m);
}

/** One sacred-texts paragraph → plain text: no footnote markers, page numbers or tags. */
export function cleanHtml(p: string) {
  return decodeEntities(
    p
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<a name="fr_\d+"><\/a>\s*<a href="#fn_\d+">[\s\S]*?<\/a>/gi, "") // footnote marks
      .replace(/<a name="page_\w+">[\s\S]*?<\/a>/gi, " ") // "p. 19"
      .replace(/<span class="contnote">[\s\S]*?<\/span>/gi, " ") // "[paragraph continues]"
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\[paragraph continues\]/gi, " ")
    .replace(SITE_FOOTER, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The <p> paragraphs of a sacred-texts page body, before its footnotes, cleaned; empty ones dropped. */
export function paragraphs(html: string) {
  let b = html.slice(Math.max(0, html.search(/<body/i)));
  const fn = b.search(/<h3[^>]*>\s*Footnotes\s*<\/h3>/i);
  if (fn > 0) b = b.slice(0, fn);
  b = b.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<nav[\s\S]*?<\/nav>/gi, "");
  return [...b.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => cleanHtml(m[1]))
    .filter((t) => t && !/at sacred-texts\.com$/.test(t) && !/^p\. \w+$/.test(t) && !/^(Sacred-Texts|Next|Previous|Index)\b/.test(t));
}

/** The book text between Project Gutenberg's start and end markers. */
export function gutenbergBody(txt: string) {
  const a = txt.search(/\*\*\* ?START OF (THE|THIS) PROJECT GUTENBERG[^\n]*\n/);
  const b = txt.search(/\*\*\* ?END OF (THE|THIS) PROJECT GUTENBERG/);
  const s = txt.slice(a >= 0 ? txt.indexOf("\n", a) + 1 : 0, b >= 0 ? b : undefined);
  return s.replace(/\r\n/g, "\n");
}

export type Verse = { v: string; t: string; to?: string; n?: string };

/** Clear a version's output, then write chapters with writeChapter. */
export async function resetVersion(work: string, version: string) {
  await rm(path.join(ROOT, "data", "texts", work, version), { recursive: true, force: true });
}
export async function writeChapter(work: string, version: string, book: string, chapter: number, verses: Verse[], note?: string, title?: string) {
  const data = chapterSchema.parse({ work, version, book, chapter, verses, ...(note ? { note } : {}), ...(title ? { title } : {}) });
  const dir = path.join(ROOT, "data", "texts", work, version, book);
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, `${chapter}.json`),
    `{"work":"${work}","version":"${version}","book":"${book}","chapter":${chapter}${data.title ? `,"title":${JSON.stringify(data.title)}` : ""}${data.note ? `,"note":${JSON.stringify(data.note)}` : ""},"verses":[\n${data.verses.map((x) => JSON.stringify(x)).join(",\n")}\n]}\n`,
  );
}

/** Paragraphs → verses 1, 2, 3… */
export const numbered = (paras: string[]): Verse[] => paras.map((t, i) => ({ v: String(i + 1), t }));

export function roman(s: string) {
  const map: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let n = 0;
  const u = s.toUpperCase();
  for (let i = 0; i < u.length; i++) {
    const a = map[u[i]] ?? 0;
    const b = map[u[i + 1]] ?? 0;
    n += a < b ? -a : a;
  }
  return n;
}

/**
 * A sacred-texts.com zipped text (data/raw/<dir>/<file>.txt.gz, downloaded by hand: the site turns
 * scripts away) → its paragraphs, one per line: no page headers, page numbers, footnotes or note marks;
 * paragraphs split across a page break are joined again.
 */
export async function sacredTextsGz(dir: string, file: string) {
  const { gunzipSync } = await import("node:zlib");
  const raw = gunzipSync(await readFile(path.join(ROOT, "data", "raw", dir, file))).toString("latin1");
  // The files are Windows-1252; latin1 keeps the bytes, then the few curly quotes are mapped.
  const text = raw.replace(/\r\n/g, "\n").replace(/[\x91\x92]/g, "'").replace(/[\x93\x94]/g, '"').replace(/\x97/g, "—").replace(/\x96/g, "–");
  const out: string[] = [];
  for (let line of text.split("\n")) {
    line = line.trim();
    if (!line) continue;
    if (/at sacred-texts\.com\s*$/.test(line) || /^\[p\. [\divxlcdm]+\]$/i.test(line) || /^Click to enlarge/i.test(line)) continue;
    if (line === "Footnotes" || line.startsWith("^")) continue; // footnotes ("^19:1 …")
    const cont = line.startsWith("[paragraph continues]");
    line = line
      .replace(/^\[paragraph continues\]\s*/, "")
      .replace(/\s?\[\*\d+\]/g, "") // note marks
      .replace(/\s?\[\d+\](?=[\s,.;:!?'")]|$)/g, "") // the original edition's page numbers
      .replace(/\s+/g, " ")
      .trim();
    if (!line) continue;
    if (cont && out.length) out[out.length - 1] += ` ${line}`;
    else out.push(line);
  }
  return out;
}
