/**
 * Strong's numbers for "word highlight across versions": tap a word in one Bible version and the words
 * with the same Strong's number light up in every other visible version.
 *
 *   npx tsx scripts/build-strongs.ts --extract   raw sources → data/strongs/ + data/lexicon/strongs.json (committed)
 *   npx tsx scripts/build-strongs.ts             data/strongs + data/lexicon → public/strongs + public/lexicon
 *                                                (runs in `npm run pack`, i.e. predev / prebuild; output git-ignored)
 *
 * Sources (cached, git-ignored, downloaded on --extract when missing):
 *   data/raw/strongs/probe/<ebibleId>.zip   eBible.org USFM with \w word|strong="G3056"\w* tags
 *   data/raw/strongs/morphhb.zip            Open Scriptures Hebrew Bible (WLC + lemma = Strong's), CC BY 4.0
 *   data/raw/strongs/strongs.zip            openscriptures/strongs: Strong's Hebrew + Greek dictionaries (PD XML)
 *
 * Formats
 *   data/strongs/<version>/<book>.json and public/strongs/<version>/<book>.json
 *     { "<chapter>:<verse>": [[surface, "G3056"], [surface, "H853", "H7225"], ...] }
 *     Every tagged word of the verse in reading order, surface exactly as in the source (the client matches the
 *     words in order against the display text). Keys are the reader's verse ids (data/texts/bible/<version>), i.e.
 *     the same versification map / chapter moves as scripts/import-ebible.ts. Untagged words are left out.
 *   data/lexicon/strongs.json  { "G3056": { lemma, translit, pron, def, kjv, deriv, count, verses }, ... }
 *     count = KJV words tagged with the number, verses = KJV verses containing it (both after the stop-word rule),
 *     orig = words in the Hebrew OT (OSHB) / Greek NT (TR) with the number — also counts words the KJV leaves
 *     untranslated (H853, G3588). Fields are absent when zero; [idiom] in Hebrew "kjv" is Strong's "X" mark.
 *   public/lexicon/<G|H><bucket>.json  same entries, bucket = floor(number / 200)  (G3056 → G15.json)
 *
 * English stop-word rule (kjv, web, asv, bbe only): a tag on one of STOP_WORDS is kept only when that word is the
 * head word of an item in the Strong's entry's KJV-usage list (see usageHeads; a/an count as one). "the" → G3588 is kept
 * (G3588 lists "the"); "the" → G1722 (en, "in") or "and" → H8064 (heavens) is dropped. See data/strongs/quality-report.txt.
 */
import { access, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { catalogSchema } from "../src/lib/schema";

const ROOT = path.resolve(__dirname, "..");
const RAW = path.join(ROOT, "data", "raw", "strongs");
const DATA = path.join(ROOT, "data", "strongs");
const LEX_FILE = path.join(ROOT, "data", "lexicon", "strongs.json");
const TEXTS = path.join(ROOT, "data", "texts", "bible");
const OUT = path.join(ROOT, "public", "strongs");
const LEX_OUT = path.join(ROOT, "public", "lexicon");
const SHARD = 200;

const MORPHHB_URL = "https://codeload.github.com/openscriptures/morphhb/zip/refs/heads/master";
const STRONGS_URL = "https://codeload.github.com/openscriptures/strongs/zip/refs/heads/master";

type Part = { zip: string; collection?: string };
type Source = { id: string; lang: "en" | "es" | "fr" | "de" | "grc" | "hbo"; parts: Part[] } & ({ kind: "usfm" } | { kind: "morphhb" });
const SOURCES: Source[] = [
  { id: "kjv", kind: "usfm", lang: "en", parts: [{ zip: "eng-kjv" }] },
  { id: "web", kind: "usfm", lang: "en", parts: [{ zip: "engwebp", collection: "ot" }, { zip: "engwebp", collection: "nt" }, { zip: "eng-web", collection: "apocrypha" }] },
  { id: "asv", kind: "usfm", lang: "en", parts: [{ zip: "eng-asv" }] },
  { id: "bbe", kind: "usfm", lang: "en", parts: [{ zip: "engBBE" }] },
  { id: "rvr1909", kind: "usfm", lang: "es", parts: [{ zip: "spaRV1909" }] },
  { id: "lsg1910", kind: "usfm", lang: "fr", parts: [{ zip: "fraLSG" }] },
  { id: "luther1912", kind: "usfm", lang: "de", parts: [{ zip: "deu1912" }] },
  // NT only: the Greek OT in the reader is the (untagged) LXX.
  { id: "greek", kind: "usfm", lang: "grc", parts: [{ zip: "grctr", collection: "nt" }] },
  { id: "hebrew", kind: "morphhb", lang: "hbo", parts: [{ zip: "morphhb", collection: "ot" }] },
];

/** English function words whose tags are often phrase-level spill-over in the machine-aligned editions. */
const STOP_WORDS = ["the", "a", "an", "of", "and", "to", "in", "that", "for", "on", "with", "by", "at", "from", "as", "but", "or", "unto", "upon", "into"];

const OSIS_TO_BOOK: Record<string, string> = {
  Gen: "gen", Exod: "exo", Lev: "lev", Num: "num", Deut: "deu", Josh: "jos", Judg: "jdg", Ruth: "rut", "1Sam": "1sa", "2Sam": "2sa",
  "1Kgs": "1ki", "2Kgs": "2ki", "1Chr": "1ch", "2Chr": "2ch", Ezra: "ezr", Neh: "neh", Esth: "est", Job: "job", Ps: "psa", Prov: "pro",
  Eccl: "ecc", Song: "sng", Isa: "isa", Jer: "jer", Lam: "lam", Ezek: "ezk", Dan: "dan", Hos: "hos", Joel: "jol", Amos: "amo",
  Obad: "oba", Jonah: "jon", Mic: "mic", Nah: "nam", Hab: "hab", Zeph: "zep", Hag: "hag", Zech: "zec", Mal: "mal",
};

type Tok = [string, ...string[]]; // [surface, "G3056", ...]
type SrcVerse = { book: string; ch: number; v: string; toks: Tok[]; plain: string[] };
type Lex = Record<string, { lemma: string; translit: string; pron: string; def: string; kjv: string; deriv: string; count?: number; verses?: number; orig?: number }>;

async function exists(p: string) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function cachedZip(name: string, url: string) {
  const p = path.join(RAW, name);
  if (!(await exists(p))) {
    console.log(`Downloading ${url}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`download failed: ${res.status} ${url}`);
    await mkdir(RAW, { recursive: true });
    await writeFile(p, Buffer.from(await res.arrayBuffer()));
  }
  return unzipSync(new Uint8Array(await readFile(p)));
}

const decodeXml = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const attrs = (s: string) => Object.fromEntries([...s.matchAll(/([\w:.-]+)="([^"]*)"/g)].map((m) => [m[1], decodeXml(m[2])]));
const squash = (s: string) => s.replace(/\s+/g, " ").replace(/\s+([,;.:)])/g, "$1").replace(/\(\s+/g, "(").trim();

// ---------------------------------------------------------------- lexicon

async function buildLexicon(): Promise<Lex> {
  const files = await cachedZip("strongs.zip", STRONGS_URL);
  const file = (suffix: string) => {
    const k = Object.keys(files).find((n) => n.endsWith(suffix));
    if (!k) throw new Error(`strongs.zip: no ${suffix}`);
    return strFromU8(files[k]);
  };
  const lex: Lex = {};

  // Greek: Ulrik Petersen's XML of Strong's Greek dictionary (1890 text, "Public Domain -- Copy Freely").
  const gxml = file("StrongsGreekDictionaryXML_1.4/strongsgreek.xml");
  const gEntries = [...gxml.matchAll(/<entry strongs="(\d+)">([\s\S]*?)<\/entry>/g)];
  const gLemma = new Map<string, string>();
  for (const [, n, body] of gEntries) {
    const g = /<greek ([^>]*)\/>/.exec(body);
    if (g) gLemma.set(String(Number(n)), attrs(g[1]).unicode);
  }
  const gText = (s: string | undefined) =>
    squash(
      decodeXml(
        (s ?? "")
          .replace(/<strongsref ([^>]*)\/>/g, (_, a) => {
            const { language, strongs } = attrs(a);
            const num = String(Number(strongs));
            return language === "GREEK" ? `G${num}${gLemma.has(num) ? ` (${gLemma.get(num)})` : ""}` : `H${num}`;
          })
          .replace(/<greek ([^>]*)\/>/g, (_, a) => attrs(a).unicode)
          .replace(/<pronunciation strongs="([^"]*)"\/>/g, "$1")
          .replace(/<see [^>]*\/>/g, "")
          .replace(/<[^>]+>/g, ""),
      ),
    );
  const pick = (body: string, tag: string) => new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(body)?.[1];
  for (const [, n, body] of gEntries) {
    const g = /<greek ([^>]*)\/>/.exec(body);
    const ga = g ? attrs(g[1]) : {};
    lex[`G${Number(n)}`] = {
      lemma: ga.unicode ?? "",
      translit: ga.translit ?? "",
      pron: /<pronunciation strongs="([^"]*)"/.exec(body)?.[1] ?? "",
      def: gText(pick(body, "strongs_def")),
      kjv: gText(pick(body, "kjv_def")).replace(/^:?--\s*/, "").replace(/^:--/, ""),
      deriv: gText(pick(body, "strongs_derivation")),
    };
  }

  // Hebrew: StrongHebrewG.xml (OSIS; Strong's 1894 text, "Public Domain"). Only Strong's own fields are used
  // (not the BDB outline <list> or the TWOT numbers in gloss=).
  const hxml = file("hebrew/StrongHebrewG.xml");
  const hText = (s: string | undefined) =>
    squash(
      decodeXml(
        (s ?? "")
          .replace(/<w ([^>]*)\/>/g, (_, a) => {
            const at = attrs(a);
            if (!at.src) return at.lemma ?? "";
            const num = at.src.replace(/^0+/, "");
            return `H${num}${at.lemma ? ` (${at.lemma})` : ""}`;
          })
          .replace(/<[^>]+>/g, ""),
      ),
    );
  for (const [, n, body] of hxml.matchAll(/<div type="entry" n="(\d+)">([\s\S]*?)<\/div>/g)) {
    const w = /<w ([^>]*)>/.exec(body);
    const wa = w ? attrs(w[1]) : {};
    const note = (t: string) => new RegExp(`<note type="${t}">([\\s\\S]*?)</note>`).exec(body)?.[1];
    lex[`H${Number(n)}`] = {
      lemma: wa.lemma ?? "",
      translit: wa.xlit ?? "",
      pron: wa.POS ?? "",
      def: hText(note("explanation")),
      kjv: hText(note("translation")),
      deriv: hText(note("exegesis")),
    };
  }
  console.log(`lexicon: ${gEntries.length} Greek + ${Object.keys(lex).length - gEntries.length} Hebrew entries`);
  return lex;
}

// ---------------------------------------------------------------- numbers

const unknownNumbers = new Map<string, number>();
/** "G0746" → "G746"; "H1254a" → "H1254" unless the lexicon has "H1254a"; null if not a Strong's number we know. */
function normalise(raw: string, lex: Lex, defaultPrefix?: "H" | "G"): string | null {
  const m = /^([GHgh])?0*(\d+)([a-zA-Z]?)$/.exec(raw.trim());
  if (!m) {
    if (raw.trim()) unknownNumbers.set(raw, (unknownNumbers.get(raw) ?? 0) + 1);
    return null;
  }
  const prefix = (m[1]?.toUpperCase() ?? defaultPrefix) as string | undefined;
  if (!prefix) return null;
  const base = `${prefix}${m[2]}`;
  const withSuffix = m[3] ? `${base}${m[3].toLowerCase()}` : base;
  if (lex[withSuffix]) return withSuffix;
  if (lex[base]) return base;
  unknownNumbers.set(withSuffix, (unknownNumbers.get(withSuffix) ?? 0) + 1);
  return null;
}

// ---------------------------------------------------------------- USFM

/** Paragraph/heading markers whose whole line is not verse text. */
const SKIP_LINE = /^\\(id|ide|h|toc\d*|mt\d*|imt\d*|is\d*|ip|ipi|ie|ib|im|io\d*|ior|ili|ms\d*|mr|s\d*|sr|r|cl|cp|sp|rem|sts|usfm)\b/;

function parseUsfm(text: string, lex: Lex, onBook: (code: string) => boolean): SrcVerse[] {
  const out: SrcVerse[] = [];
  const idm = /\\id\s+(\S+)/.exec(text);
  if (!idm) return out;
  const code = idm[1];
  if (!onBook(code)) return out;
  let ch = 0;
  let cur: SrcVerse | null = null;
  let pending: { toks: Tok[]; plain: string[] } = { toks: [], plain: [] }; // e.g. Psalm titles (\d) before verse 1
  const body = text
    .replace(/\\(f|fe|x|ef|ex)\s[\s\S]*?\\\1\*/g, " ") // footnotes and cross references
    .split(/\r?\n/)
    .filter((l) => !SKIP_LINE.test(l.trim()))
    .join("\n");
  const re = /\\c\s+(\d+)|\\v\s+(\d+[a-z]?)(?:-\d+[a-z]?)?\s?|\\\+?w\s+([^\\|]*?)(?:\|([^\\]*?))?\\\+?w\*|\\\+?[a-z]+\d*\*?|([^\\]+)/g;
  for (const m of body.matchAll(re)) {
    if (m[1]) {
      ch = Number(m[1]);
      cur = null;
      pending = { toks: [], plain: [] };
    } else if (m[2]) {
      cur = { book: code, ch, v: m[2], toks: [...pending.toks], plain: [...pending.plain] };
      pending = { toks: [], plain: [] };
      out.push(cur);
    } else if (m[3] !== undefined) {
      const surface = m[3].trim();
      const target = cur ?? (ch ? pending : null);
      if (!target || !surface) continue;
      const strong = m[4] ? attrs(m[4]).strong : undefined;
      const nums = strong ? [...new Set(strong.split(/[,\s]+/).map((s) => normalise(s, lex)).filter((x): x is string => !!x))] : [];
      if (nums.length) target.toks.push([surface, ...nums]);
      else target.plain.push(surface);
    } else if (m[5]) {
      const target = cur ?? (ch ? pending : null);
      if (target && m[5].trim()) target.plain.push(m[5]);
    }
  }
  return out;
}

// ---------------------------------------------------------------- morphhb (Hebrew OT)

function parseMorphhb(files: Record<string, Uint8Array>, lex: Lex): SrcVerse[] {
  const out: SrcVerse[] = [];
  for (const [osis, book] of Object.entries(OSIS_TO_BOOK)) {
    const name = Object.keys(files).find((n) => n.endsWith(`/wlc/${osis}.xml`));
    if (!name) throw new Error(`morphhb: no wlc/${osis}.xml`);
    const xml = strFromU8(files[name]);
    for (const [, id, inner] of xml.matchAll(/<verse osisID="([^"]+)"[^>]*>([\s\S]*?)<\/verse>/g)) {
      const [, c, v] = id.split(".");
      // Notes hold the qere readings (<rdg type="x-qere">) and editorial remarks; the reader's WLC shows the ketiv.
      const body = inner.replace(/<note\b[^>]*>[\s\S]*?<\/note>/g, "");
      const toks: Tok[] = [];
      for (const [, a, word] of body.matchAll(/<w\b([^>]*)>([^<]*)<\/w>/g)) {
        const lemma = attrs(a).lemma ?? "";
        const nums: string[] = [];
        for (const part of lemma.split("/")) {
          const pm = /^\s*(\d+)\s*([a-z])?\s*\+?\s*$/.exec(part); // "1254 a" (augmented Strong's), prefixes b/c/d/k/l/m/s have no number
          if (!pm) continue;
          const n = normalise(`H${pm[1]}${pm[2] ?? ""}`, lex);
          if (n && !nums.includes(n)) nums.push(n);
        }
        if (nums.length) toks.push([word.replace(/\//g, ""), ...nums]);
      }
      out.push({ book, ch: Number(c), v, toks, plain: [] });
    }
  }
  return out;
}

// ---------------------------------------------------------------- versification (mirrors scripts/import-ebible.ts)

type Catalog = ReturnType<typeof catalogSchema.parse>;

function keyToReader(versionId: string, catalog: Catalog, vmap: Record<string, string>, verses: SrcVerse[], part: Part, unmatched: { n: number }) {
  const version = catalog.versions.find((v) => v.id === versionId)!;
  const imp = version.import!;
  const books = new Map<string, number>();
  const collectionOf = new Map<string, string>();
  for (const r of catalog.religions)
    for (const c of r.collections)
      for (const it of c.items)
        if (it.work === version.work && it.chapters) {
          books.set(it.id, it.chapters);
          collectionOf.set(it.id, c.id);
        }
  const mapped = Object.keys(vmap).length > 0;
  const result: { target: string; toks: Tok[] }[] = [];
  for (const sv of verses) {
    let book = imp.bookAliases?.[sv.book] ?? sv.book.toLowerCase();
    if (part.collection && collectionOf.get(book) !== part.collection) continue;
    let ch = sv.ch;
    for (const mv of imp.chapterMoves ?? [])
      if (mv.book === book && ch >= mv.fromChapter) {
        book = mv.toBook;
        ch += mv.offset;
      }
    if (!books.has(book)) continue;
    if ((imp.skipChapters ?? []).some((r) => r.book === book && ch >= r.from && ch <= (r.to ?? 999))) continue;
    const srcKey = `${book} ${ch}:${sv.v}`;
    const target = vmap[srcKey] ?? srcKey;
    if (target === "(apocrypha)" || (mapped && ch > (books.get(book) ?? 0) && !vmap[srcKey])) {
      unmatched.n++;
      continue;
    }
    result.push({ target, toks: sv.toks });
  }
  return result;
}

function toCells(entries: { target: string; toks: Tok[] }[]) {
  const extrasAfter = new Map<string, number>();
  const byBook = new Map<string, Map<string, Tok[]>>();
  for (const e of entries) {
    let target = e.target;
    const extra = /^(\S+) (\d+):(\d+)\+$/.exec(target);
    if (extra) {
      const n = extrasAfter.get(target) ?? 0;
      extrasAfter.set(target, n + 1);
      const suffix = n < 26 ? String.fromCharCode(97 + n) : String.fromCharCode(97 + Math.floor(n / 26) - 1) + String.fromCharCode(97 + (n % 26));
      target = `${extra[1]} ${extra[2]}:${extra[3]}${suffix}`;
    }
    const m = /^(\S+) (\d+):(\d+[a-z]{0,2})(?:-(?:(\d+):)?(\d+[a-z]?))?$/.exec(target);
    if (!m) throw new Error(`bad mapping target "${target}"`);
    const [, book, ch, v] = m;
    const verses = byBook.get(book) ?? new Map<string, Tok[]>();
    byBook.set(book, verses);
    const k = `${ch}:${v}`;
    // Several source verses on one reader cell (merged / spanned): their words follow each other, as in the text.
    verses.set(k, [...(verses.get(k) ?? []), ...e.toks]);
  }
  return byBook;
}

// ---------------------------------------------------------------- stop words

const wordSet = new Map<string, Set<string>>();
/** All words of the entry's KJV usage list and definition (for the rough agreement measure). */
function usageWords(num: string, lex: Lex) {
  let s = wordSet.get(num);
  if (!s) {
    const e = lex[num];
    s = new Set(`${e?.kjv ?? ""} ${e?.def ?? ""}`.toLowerCase().split(/[^a-z]+/).filter(Boolean));
    wordSet.set(num, s);
  }
  return s;
}

/** Split on , and ; outside brackets: "to (be, the end, -ward), of" → ["to (be, the end, -ward)", " of"]. */
function splitTopLevel(s: string) {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(" || ch === "[") depth = 1; // no nesting: Strong's lists have stray "((" / unbalanced brackets
    else if ((ch === ")" || ch === "]") && depth > 0) depth--;
    if ((ch === "," || ch === ";") && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

const headSet = new Map<string, Set<string>>();
/** Archaic and plain forms of the same preposition count as one. */
const SAME_WORD: Record<string, string> = { an: "a", unto: "to", upon: "on", into: "in" };
const canon = (w: string) => SAME_WORD[w] ?? w;

/**
 * Head words of the entry's KJV-usage list ("kjv", Strong's list of every KJV rendering): for each comma/semicolon
 * item, minus Strong's marks (X, +), the first word outside brackets, every alternative inside brackets, and the
 * hyphen joins Strong uses for compounds. Words inside multi-word renderings ("to the intent that") do not count.
 *   G1519 "in (among, at, unto, -so much that, -to), to the intent that" → in, among, at, unto, into, to   (not "the")
 *   G1722 "(here-)in(-to, -wardly)" → in, herein, into, inwardly      H5921 "(up-) on" → on, upon      G1520 "a(-n" → a, an
 *   H853 "(as such unrepresented in English)" → nothing (a wholly bracketed note)
 * Returned words are canonical (SAME_WORD).
 */
function usageHeads(num: string, lex: Lex) {
  let s = headSet.get(num);
  if (!s) {
    s = new Set();
    for (const raw of splitTopLevel((lex[num]?.kjv ?? "").toLowerCase().replace(/[.\s]+$/, ""))) {
      const item = raw.replace(/(^|\s)[x+](?=\s)/g, " ").replace(/\[idiom\]/g, "").trim();
      const groups = [...item.matchAll(/[([]([^)\]]*)[)\]]?/g)].map((m) => ({ text: m[1], at: m.index }));
      const base = item.replace(/[([][^)\]]*[)\]]?/g, (g) => " ".repeat(g.length)).replace(/[()[\]]/g, " ");
      const hm = /[a-z]+/.exec(base);
      if (!hm) continue; // a wholly bracketed note
      const head = hm[0];
      s.add(canon(head));
      for (const g of groups)
        for (const alt of g.text.split(",").map((a) => a.trim())) {
          // single words only: "to (be, the end, -ward)" means "to the end", which must not admit "the"
          const w = /^-?([a-z]+)-?$/.exec(alt.replace(/[()[\]]/g, ""))?.[1];
          if (!w) continue;
          if (alt.endsWith("-")) s.add(canon(w + head)); // (up-)on → upon
          else if (g.at < hm.index) continue; // "(the) whole": an optional word before the rendering, not a rendering
          else if (alt.startsWith("-")) s.add(canon(head + w)); // in(-to) → into
          else s.add(canon(w)); // in (among, at, unto) → among, at, unto
        }
    }
    headSet.set(num, s);
  }
  return s;
}

type StopStat = { occurrences: number; tagged: number; dropped: number; numbers: Map<string, number>; droppedNumbers: Map<string, number> };
function filterStopWords(versionId: string, verses: SrcVerse[], lex: Lex, report: Map<string, Map<string, StopStat>>) {
  const stats = new Map<string, StopStat>();
  report.set(versionId, stats);
  const stat = (w: string) => {
    let s = stats.get(w);
    if (!s) stats.set(w, (s = { occurrences: 0, tagged: 0, dropped: 0, numbers: new Map(), droppedNumbers: new Map() }));
    return s;
  };
  for (const sv of verses) {
    for (const p of sv.plain)
      for (const w of p.toLowerCase().match(/[a-z]+/g) ?? []) if (STOP_WORDS.includes(w)) stat(w).occurrences++;
    sv.toks = sv.toks.filter((t) => {
      const w = t[0].toLowerCase().replace(/[^a-z]/g, "");
      if (!STOP_WORDS.includes(w)) return true;
      const s = stat(w);
      s.occurrences++;
      s.tagged++;
      const nums = t.slice(1);
      for (const n of nums) s.numbers.set(n, (s.numbers.get(n) ?? 0) + 1);
      const keep = nums.filter((n) => usageHeads(n, lex).has(canon(w)));
      for (const n of nums) if (!keep.includes(n)) s.droppedNumbers.set(n, (s.droppedNumbers.get(n) ?? 0) + 1);
      if (!keep.length) {
        s.dropped++;
        return false;
      }
      t.splice(1, t.length - 1, ...keep);
      return true;
    });
  }
}

/** Share of tagged English words that the Strong's entry's KJV usage mentions (crude prefix stem) — an alignment-quality hint. */
function agreement(verses: SrcVerse[], lex: Lex) {
  let yes = 0;
  let all = 0;
  for (const sv of verses)
    for (const t of sv.toks) {
      const w = t[0].toLowerCase().replace(/[^a-z]/g, "");
      if (w.length < 3) continue;
      all++;
      const stem = w.slice(0, Math.max(3, Math.min(5, w.length - 2)));
      if (t.slice(1).some((n) => [...usageWords(n, lex)].some((u) => u.startsWith(stem)))) yes++;
    }
  return all ? yes / all : 0;
}

// ---------------------------------------------------------------- verification against the reader's text

type Display = Map<string, { t: string; cont?: boolean }>;
async function loadDisplay(version: string, book: string): Promise<Display> {
  const dir = path.join(TEXTS, version, book);
  const d: Display = new Map();
  if (!(await exists(dir))) return d;
  for (const f of await readdir(dir)) {
    if (!/^\d+\.json$/.test(f)) continue;
    const c = JSON.parse(await readFile(path.join(dir, f), "utf8"));
    for (const v of c.verses) d.set(`${c.chapter}:${v.v}`, { t: v.t, cont: !!v.cont });
  }
  return d;
}

/** Words found in order in the display text (case-insensitive substring search from a moving cursor). */
function matchInOrder(text: string, toks: Tok[]) {
  const t = text.toLowerCase();
  let cur = 0;
  let hit = 0;
  for (const [w] of toks) {
    const i = t.indexOf(w.toLowerCase(), cur);
    if (i >= 0) {
      hit++;
      cur = i + w.length;
    }
  }
  return hit;
}

// ---------------------------------------------------------------- extract

async function extract() {
  const catalog = catalogSchema.parse(JSON.parse(await readFile(path.join(ROOT, "data", "catalog.json"), "utf8")));
  const lex = await buildLexicon();
  const report = new Map<string, Map<string, StopStat>>();
  const lines: string[] = [];
  const summary: string[] = [];
  const kjvCounts = new Map<string, { count: number; verses: number }>();
  const origCounts = new Map<string, number>();
  await rm(DATA, { recursive: true, force: true });

  for (const src of SOURCES) {
    const mapFile = path.join(ROOT, "data", "versification", `${src.id}.json`);
    const vmap: Record<string, string> = (await exists(mapFile)) ? JSON.parse(await readFile(mapFile, "utf8")).map : {};
    const entries: { target: string; toks: Tok[] }[] = [];
    const all: SrcVerse[] = [];
    const lost = { n: 0 };
    for (const part of src.parts) {
      let verses: SrcVerse[];
      if (src.kind === "morphhb") verses = parseMorphhb(await cachedZip("morphhb.zip", MORPHHB_URL), lex);
      else {
        const zipPath = path.join(RAW, "probe", `${part.zip}.zip`);
        if (!(await exists(zipPath))) throw new Error(`missing ${path.relative(ROOT, zipPath)} (eBible USFM zip: https://ebible.org/Scriptures/${part.zip}_usfm.zip)`);
        const files = unzipSync(new Uint8Array(await readFile(zipPath)));
        verses = [];
        for (const name of Object.keys(files).sort()) if (name.endsWith(".usfm")) verses.push(...parseUsfm(strFromU8(files[name]), lex, (c) => c !== "FRT" && c !== "GLO"));
      }
      if (src.lang === "en") filterStopWords(src.id, verses, lex, report);
      all.push(...verses);
      entries.push(...keyToReader(src.id, catalog, vmap, verses, part, lost));
    }
    const byBook = toCells(entries);

    // Verify against data/texts/bible/<version> and write data/strongs/<version>/<book>.json
    let words = 0;
    let hits = 0;
    let missingKeys = 0;
    let contKeys = 0;
    let written = 0;
    const badVerses: string[] = [];
    await mkdir(path.join(DATA, src.id), { recursive: true });
    for (const [book, verses] of byBook) {
      const display = await loadDisplay(src.id, book);
      const keys = [...verses.keys()].filter((k) => verses.get(k)!.length);
      keys.sort((a, b) => {
        const [ca, va] = a.split(":");
        const [cb, vb] = b.split(":");
        return Number(ca) - Number(cb) || parseInt(va) - parseInt(vb) || va.localeCompare(vb);
      });
      const out: string[] = [];
      for (const k of keys) {
        const toks = verses.get(k)!;
        const d = display.get(k);
        if (!d) missingKeys++;
        else if (d.cont || !d.t) contKeys++;
        else {
          const h = matchInOrder(d.t, toks);
          words += toks.length;
          hits += h;
          if (h < toks.length * 0.8 && badVerses.length < 8) badVerses.push(`${book} ${k} (${h}/${toks.length})`);
        }
        out.push(`${JSON.stringify(k)}:${JSON.stringify(toks)}`);
      }
      if (!out.length) continue;
      await writeFile(path.join(DATA, src.id, `${book}.json`), `{\n${out.join(",\n")}\n}\n`);
      written++;
    }
    if (src.id === "kjv")
      for (const verses of byBook.values())
        for (const toks of verses.values()) {
          const seen = new Set<string>();
          for (const t of toks)
            for (const n of t.slice(1)) {
              const c = kjvCounts.get(n) ?? { count: 0, verses: 0 };
              c.count++;
              if (!seen.has(n)) {
                seen.add(n);
                c.verses++;
              }
              kjvCounts.set(n, c);
            }
        }
    // Occurrences in the original-language text (Hebrew OT / Greek NT), which also counts words the KJV leaves
    // untranslated or untagged (H853, the Greek article G3588).
    if (src.id === "hebrew" || src.id === "greek")
      for (const verses of byBook.values())
        for (const toks of verses.values()) for (const t of toks) for (const n of t.slice(1)) origCounts.set(n, (origCounts.get(n) ?? 0) + 1);
    const tagged = [...byBook.values()].reduce((a, m) => a + [...m.values()].reduce((b, t) => b + t.length, 0), 0);
    const line =
      `${src.id.padEnd(11)} books ${String(written).padStart(2)}  tagged words ${String(tagged).padStart(7)}  ` +
      `found in reader text in order ${((hits / Math.max(1, words)) * 100).toFixed(2)}%  ` +
      `verse ids missing in reader ${missingKeys}  on continuation rows ${contKeys}  set aside ${lost.n}` +
      (src.lang === "en" ? `  KJV-usage agreement ${(agreement(all, lex) * 100).toFixed(1)}%` : "");
    console.log(line);
    if (badVerses.length) console.log(`    low-match verses e.g. ${badVerses.join(", ")}`);
    summary.push(line);
  }

  // Lexicon with KJV counts
  for (const [n, c] of kjvCounts) if (lex[n]) Object.assign(lex[n], c);
  for (const [n, c] of origCounts) if (lex[n]) lex[n].orig = c;
  await mkdir(path.dirname(LEX_FILE), { recursive: true });
  const order = (a: string, b: string) => a[0].localeCompare(b[0]) || parseInt(a.slice(1)) - parseInt(b.slice(1));
  await writeFile(LEX_FILE, `{\n${Object.keys(lex).sort(order).map((k) => `${JSON.stringify(k)}:${JSON.stringify(lex[k])}`).join(",\n")}\n}\n`);

  // Quality report
  lines.push("Strong's tags — quality report (generated by `npx tsx scripts/build-strongs.ts --extract`)", "");
  lines.push(...summary, "");
  lines.push("'found in reader text in order' = share of tagged surface words found, in order, in data/texts/bible/<version>.");
  lines.push("'KJV-usage agreement' = share of tagged English words (3+ letters) whose Strong's entry's KJV usage/definition");
  lines.push("contains a word starting with the same stem — a rough alignment-quality hint, not a precise measure.", "");
  lines.push("English stop words: occurrences in the verse text, how many carry a tag, how many tags were dropped as spurious");
  lines.push("(the Strong's entry's KJV usage and definition never use the word), and the most common numbers.", "");
  for (const [v, stats] of report) {
    lines.push(`== ${v}`);
    for (const w of STOP_WORDS) {
      const s = stats.get(w);
      if (!s) continue;
      const top = (m: Map<string, number>) =>
        [...m].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n, c]) => `${n}×${c}`).join(" ");
      lines.push(
        `  ${w.padEnd(5)} ${String(s.occurrences).padStart(6)} occ  tagged ${String(s.tagged).padStart(6)} (${((s.tagged / Math.max(1, s.occurrences)) * 100).toFixed(0).padStart(3)}%)  ` +
          `dropped ${String(s.dropped).padStart(6)} (${((s.dropped / Math.max(1, s.tagged)) * 100).toFixed(0).padStart(3)}% of tagged)  ` +
          `top: ${top(s.numbers)}  | dropped: ${top(s.droppedNumbers)}`,
      );
    }
    lines.push("");
  }
  if (unknownNumbers.size)
    lines.push(`Numbers not in the lexicon (left out): ${[...unknownNumbers].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([n, c]) => `${n}×${c}`).join(" ")}`);
  await writeFile(path.join(DATA, "quality-report.txt"), lines.join("\n") + "\n");
  console.log(`wrote ${path.relative(ROOT, DATA)}/ and ${path.relative(ROOT, LEX_FILE)} (${Object.keys(lex).length} entries)`);
  if (unknownNumbers.size) console.log(`  ${[...unknownNumbers.values()].reduce((a, b) => a + b, 0)} tags with numbers not in the lexicon left out (see quality-report.txt)`);
}

// ---------------------------------------------------------------- pack (deploy): data/ → public/

async function pack() {
  if (!(await exists(DATA))) {
    console.log("build-strongs: no data/strongs — skipped");
    return;
  }
  await rm(OUT, { recursive: true, force: true });
  await rm(LEX_OUT, { recursive: true, force: true });
  let files = 0;
  let bytes = 0;
  for (const d of await readdir(DATA, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    await mkdir(path.join(OUT, d.name), { recursive: true });
    for (const f of await readdir(path.join(DATA, d.name))) {
      if (!f.endsWith(".json")) continue;
      const body = JSON.stringify(JSON.parse(await readFile(path.join(DATA, d.name, f), "utf8")));
      await writeFile(path.join(OUT, d.name, f), body);
      files++;
      bytes += Buffer.byteLength(body);
    }
  }
  const lex: Lex = JSON.parse(await readFile(LEX_FILE, "utf8"));
  const shards = new Map<string, Lex>();
  for (const [k, e] of Object.entries(lex)) {
    const name = `${k[0]}${Math.floor(parseInt(k.slice(1)) / SHARD)}`;
    const s = shards.get(name) ?? {};
    s[k] = e;
    shards.set(name, s);
  }
  await mkdir(LEX_OUT, { recursive: true });
  for (const [name, s] of shards) {
    const body = JSON.stringify(s);
    await writeFile(path.join(LEX_OUT, `${name}.json`), body);
    files++;
    bytes += Buffer.byteLength(body);
  }
  console.log(`build-strongs: ${files} files (${shards.size} lexicon shards), ${(bytes / 1e6).toFixed(1)} MB → public/strongs, public/lexicon`);
}

(process.argv.includes("--extract") ? extract() : pack()).catch((e) => {
  console.error(e);
  process.exit(1);
});
