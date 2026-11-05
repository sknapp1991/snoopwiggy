/**
 * Import the Pali Canon (Tipiṭaka) from SuttaCentral's bilara-data (all CC0):
 *   - sc-pli  Pāli root text (Mahāsaṅgīti edition) — Sutta, Vinaya and Abhidhamma
 *   - sc-en   English: Bhikkhu Sujato (Sutta Pitaka), Bhikkhu Brahmali (Vinaya Pitaka).
 *             There is no free English Abhidhamma: those books carry a note instead.
 *
 * Source: a sparse clone in data/raw/bilara (see below) + data/raw/sc-names/{sn,an}.json
 * (Saṁyutta / Nipāta names from SuttaCentral's API).
 *   git clone --depth 1 --filter=blob:none --sparse -b published https://github.com/suttacentral/bilara-data.git data/raw/bilara
 *   git -C data/raw/bilara sparse-checkout set root/pli/ms/sutta root/pli/ms/vinaya root/pli/ms/abhidhamma \
 *       translation/en/sujato/sutta translation/en/brahmali/vinaya
 *
 * Layout: one "book" per Nikāya (DN, MN), per Saṁyutta (SN 1–56), per Nipāta (AN 1–11), per Khuddaka
 * book, per Vinaya / Abhidhamma book. In DN/MN/SN/AN a chapter is the sutta number (SN 12.2 = book sn12,
 * chapter 2); a file that groups several suttas ("sn12.72-81") is the first chapter of its range and the
 * others carry a note. Elsewhere chapters are the source files in order. A "verse" is a paragraph
 * (segments sharing all but the last number), identical in Pāli and English since both use the same
 * segment ids. Each chapter gets a title from its headings.
 *
 *   npx tsx scripts/import-tipitaka.ts   →  data/texts/tipitaka/{sc-pli,sc-en}/<book>/<n>.json
 *                                          and data/tipitaka-books.json (catalog items)
 */
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { chapterSchema } from "../src/lib/schema";

const ROOT = path.resolve(__dirname, "..");
const B = path.join(ROOT, "data", "raw", "bilara");
const OUT = path.join(ROOT, "data", "texts", "tipitaka");
const WORK = "tipitaka";
const NO_ENGLISH =
  "Pāli only: every English translation of the Abhidhamma is still under copyright, so no English can be shown yet. A free translation will be added if one becomes available.";

type Segs = Record<string, string>;
type BookDef = {
  id: string;
  name: string;
  collection: string;
  /** Folder under root/pli/ms/ */
  dir: string;
  /** English translator folder (translation/en/<tr>/...), none for the Abhidhamma */
  tr?: "sujato" | "brahmali";
  /** Chapters are sutta numbers (DN/MN/SN/AN) or the files in order */
  numbered: boolean;
  chapterName: string;
  /** Only files whose key matches (e.g. the Bhikkhu Vibhaṅga's pj / ss / … rules) */
  filter?: RegExp;
};

const walk = async (d: string): Promise<string[]> => {
  const out: string[] = [];
  for (const e of await readdir(d, { withFileTypes: true }).catch(() => [])) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (e.name.endsWith(".json")) out.push(p);
  }
  return out;
};
const keyOf = (file: string) => path.basename(file).replace(/_(root-pli-ms|translation-en-\w+)\.json$/, "");
/** Natural order of keys like "sn12.72-81", "pli-tv-kd10", "ds2.1.10". */
const nums = (k: string) => (k.match(/\d+/g) ?? []).map(Number);
const natural = (a: string, b: string) => {
  const x = nums(a);
  const y = nums(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? -1) !== (y[i] ?? -1)) return (x[i] ?? -1) - (y[i] ?? -1);
  return a.localeCompare(b);
};
const clean = (t: string) => t.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

/** Paragraphs ("verses") of one source file, keyed by segment group, in source order. */
function paragraphs(segs: Segs) {
  const groups = new Map<string, string[]>();
  const headings: string[] = [];
  let first: string | null = null;
  for (const [id, raw] of Object.entries(segs)) {
    const text = clean(raw);
    const [prefix, sec] = id.split(":");
    if (!sec || !text) continue;
    first ??= prefix;
    const parts = sec.split(".");
    if (parts[0] === "0") {
      if (prefix === first) headings.push(text);
      continue;
    }
    if (/^[\d.–-]+$/.test(text)) continue; // bare numbers ("1 ") between suttas
    // "3.0" is a sub-heading: its own paragraph; otherwise group by all but the last number.
    const g = parts[parts.length - 1] === "0" || parts.length === 1 ? `${prefix}:${sec}` : `${prefix}:${parts.slice(0, -1).join(".")}`;
    (groups.get(g) ?? groups.set(g, []).get(g)!).push(text);
  }
  return { groups, headings };
}

async function loadJson(file: string): Promise<Segs | null> {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
  }
}

function enPath(pliFile: string, tr: string) {
  const rel = path.relative(path.join(B, "root", "pli", "ms"), pliFile).replace(/_root-pli-ms\.json$/, `_translation-en-${tr}.json`);
  return path.join(B, "translation", "en", tr, rel);
}

type ChapterOut = { n: number; title?: string; verses: { v: string; t: string }[]; note?: string };

async function writeChapter(work: string, version: string, book: string, c: ChapterOut) {
  if (!c.verses.length && !c.note) c = { ...c, note: "No text for this part in this edition." };
  const data = chapterSchema.parse({ work, version, book, chapter: c.n, verses: c.verses, ...(c.note ? { note: c.note } : {}), ...(c.title ? { title: c.title } : {}) });
  const dir = path.join(ROOT, "data", "texts", work, version, book);
  await mkdir(dir, { recursive: true });
  const head = `{"work":"${work}","version":"${version}","book":"${book}","chapter":${c.n}${data.title ? `,"title":${JSON.stringify(data.title)}` : ""}${data.note ? `,"note":${JSON.stringify(data.note)}` : ""},"verses":[`;
  await writeFile(path.join(dir, `${c.n}.json`), `${head}\n${data.verses.map((x) => JSON.stringify(x)).join(",\n")}\n]}\n`);
}

async function importBook(def: BookDef) {
  const files = (await walk(path.join(B, "root", "pli", "ms", def.dir)))
    .filter((f) => !def.filter || def.filter.test(keyOf(f)))
    .sort((a, b) => natural(keyOf(a), keyOf(b)));
  if (!files.length) throw new Error(`no files for ${def.id} in ${def.dir}`);
  const pliCh: ChapterOut[] = [];
  const enCh: ChapterOut[] = [];
  let seq = 0;
  let missingEn = 0;
  for (const f of files) {
    const key = keyOf(f);
    const pli = (await loadJson(f))!;
    const en = def.tr ? await loadJson(enPath(f, def.tr)) : null;
    if (def.tr && !en) missingEn++;
    const P = paragraphs(pli);
    const E = en ? paragraphs(en) : null;
    // Shared paragraph order: Pāli order, then any English-only groups.
    const order = [...P.groups.keys()];
    for (const g of E?.groups.keys() ?? []) if (!P.groups.has(g)) order.push(g);
    let n: number;
    let end: number;
    if (def.numbered) {
      // "sn12.72-81" → 72..81 ; "mn10" → 10 ; "an1.1-10" → 1..10
      const m = /(\d+)(?:-(\d+))?$/.exec(key)!;
      n = Number(m[1]);
      end = m[2] ? Number(m[2]) : n;
    } else {
      n = ++seq;
      end = n;
    }
    const mk = (src: ReturnType<typeof paragraphs> | null) =>
      order.flatMap((g, i) => {
        const lines = src?.groups.get(g);
        return lines?.length ? [{ v: String(i + 1), t: lines.join(" ") }] : [];
      });
    const title = (h: string[]) => (h.length > 1 ? h[h.length - 1] : undefined);
    pliCh.push({ n, title: title(P.headings), verses: mk(P) });
    if (def.tr)
      enCh.push(
        E ? { n, title: title(E.headings), verses: mk(E) } : { n, verses: [], note: "Not translated in this edition." },
      );
    else pliCh[pliCh.length - 1].note = NO_ENGLISH;
    for (let k = n + 1; k <= end; k++) {
      const note = `Part of ${def.chapterName.replace(/\.$/, "")}.${n}–${end}: see chapter ${n}.`;
      pliCh.push({ n: k, verses: [], note });
      enCh.push({ n: k, verses: [], note });
    }
  }
  // Numbered books can start above 1 or skip numbers (rare): fill gaps so chapters 1..max all exist.
  const max = Math.max(...pliCh.map((c) => c.n));
  const have = new Set(pliCh.map((c) => c.n));
  for (let k = 1; k <= max; k++)
    if (!have.has(k)) {
      const note = "Not in this edition.";
      pliCh.push({ n: k, verses: [], note });
      enCh.push({ n: k, verses: [], note });
    }
  // The Abhidhamma is its own work with the Pāli only (no free English): the note says why.
  if (def.tr) {
    for (const c of pliCh) await writeChapter(WORK, "sc-pli", def.id, c);
    for (const c of enCh) await writeChapter(WORK, "sc-en", def.id, c);
  } else for (const c of pliCh) await writeChapter("abhidhamma", "abh-pli", def.id, { ...c, note: c.note ?? NO_ENGLISH });
  const verses = pliCh.reduce((s, c) => s + c.verses.length, 0);
  console.log(`${def.id.padEnd(8)} ${String(max).padStart(4)} ch  ${String(verses).padStart(6)} paragraphs${missingEn ? `  (${missingEn} without English)` : ""}`);
  return { id: def.id, name: def.name, work: def.tr ? WORK : "abhidhamma", collection: def.collection, chapters: max, chapterName: def.chapterName };
}

async function main() {
  const sn = JSON.parse(await readFile(path.join(ROOT, "data", "raw", "sc-names", "sn.json"), "utf8")) as Record<string, [string, string]>;
  const an = JSON.parse(await readFile(path.join(ROOT, "data", "raw", "sc-names", "an.json"), "utf8")) as Record<string, [string, string]>;
  const defs: BookDef[] = [
    { id: "dn", name: "Long Discourses (Dīgha Nikāya)", collection: "sutta-dn-mn", dir: "sutta/dn", tr: "sujato", numbered: true, chapterName: "DN" },
    { id: "mn", name: "Middle Discourses (Majjhima Nikāya)", collection: "sutta-dn-mn", dir: "sutta/mn", tr: "sujato", numbered: true, chapterName: "MN" },
    ...Array.from({ length: 56 }, (_, i): BookDef => ({
      id: `sn${i + 1}`,
      name: `${i + 1}. ${sn[`sn${i + 1}`]?.[0] ?? "Linked Discourses"} (${sn[`sn${i + 1}`]?.[1] ?? ""})`.replace(" ()", ""),
      collection: "sutta-sn",
      dir: `sutta/sn/sn${i + 1}`,
      tr: "sujato",
      numbered: true,
      chapterName: `SN ${i + 1}.`,
    })),
    ...Array.from({ length: 11 }, (_, i): BookDef => ({
      id: `an${i + 1}`,
      name: `${an[`an${i + 1}`]?.[0] ?? `Book of the ${i + 1}s`} (${an[`an${i + 1}`]?.[1] ?? ""})`.replace(" ()", ""),
      collection: "sutta-an",
      dir: `sutta/an/an${i + 1}`,
      tr: "sujato",
      numbered: true,
      chapterName: `AN ${i + 1}.`,
    })),
    { id: "kp", name: "Short Passages (Khuddakapāṭha)", collection: "sutta-kn", dir: "sutta/kn/kp", tr: "sujato", numbered: false, chapterName: "Kp" },
    { id: "ud", name: "Heartfelt Sayings (Udāna)", collection: "sutta-kn", dir: "sutta/kn/ud", tr: "sujato", numbered: false, chapterName: "Ud, part" },
    { id: "iti", name: "So It Was Said (Itivuttaka)", collection: "sutta-kn", dir: "sutta/kn/iti", tr: "sujato", numbered: false, chapterName: "Iti" },
    { id: "snp", name: "Anthology of Discourses (Sutta Nipāta)", collection: "sutta-kn", dir: "sutta/kn/snp", tr: "sujato", numbered: false, chapterName: "Snp, part" },
    { id: "thag", name: "Verses of the Senior Monks (Theragāthā)", collection: "sutta-kn", dir: "sutta/kn/thag", tr: "sujato", numbered: false, chapterName: "Thag, poem" },
    { id: "thig", name: "Verses of the Senior Nuns (Therīgāthā)", collection: "sutta-kn", dir: "sutta/kn/thig", tr: "sujato", numbered: false, chapterName: "Thig, poem" },
    { id: "bu-pm", name: "Monks’ Pātimokkha (the rules)", collection: "vinaya", dir: "vinaya", filter: /^pli-tv-bu-pm$/, tr: "brahmali", numbered: false, chapterName: "Part" },
    { id: "bu-vb", name: "Monks’ Analysis (Bhikkhu Vibhaṅga)", collection: "vinaya", dir: "vinaya/pli-tv-bu-vb", tr: "brahmali", numbered: false, chapterName: "Rule" },
    { id: "bi-pm", name: "Nuns’ Pātimokkha (the rules)", collection: "vinaya", dir: "vinaya", filter: /^pli-tv-bi-pm$/, tr: "brahmali", numbered: false, chapterName: "Part" },
    { id: "bi-vb", name: "Nuns’ Analysis (Bhikkhunī Vibhaṅga)", collection: "vinaya", dir: "vinaya/pli-tv-bi-vb", tr: "brahmali", numbered: false, chapterName: "Rule" },
    { id: "kd", name: "Chapters (Khandhaka)", collection: "vinaya", dir: "vinaya/pli-tv-kd", tr: "brahmali", numbered: false, chapterName: "Khandhaka" },
    { id: "pvr", name: "Compendium (Parivāra)", collection: "vinaya", dir: "vinaya/pli-tv-pvr", tr: "brahmali", numbered: false, chapterName: "Parivāra, part" },
    { id: "ds", name: "Dhammasaṅgaṇī", collection: "abhidhamma", dir: "abhidhamma/ds", numbered: false, chapterName: "Ds, part" },
    { id: "vb", name: "Vibhaṅga", collection: "abhidhamma", dir: "abhidhamma/vb", numbered: false, chapterName: "Vb" },
    { id: "dt", name: "Dhātukathā", collection: "abhidhamma", dir: "abhidhamma/dt", numbered: false, chapterName: "Dt, part" },
    { id: "pp", name: "Puggalapaññatti", collection: "abhidhamma", dir: "abhidhamma/pp", numbered: false, chapterName: "Pp, part" },
    { id: "kv", name: "Kathāvatthu", collection: "abhidhamma", dir: "abhidhamma/kv", numbered: false, chapterName: "Kv, part" },
    { id: "ya", name: "Yamaka", collection: "abhidhamma", dir: "abhidhamma/ya", numbered: false, chapterName: "Ya, part" },
    { id: "patthana", name: "Paṭṭhāna", collection: "abhidhamma", dir: "abhidhamma/patthana", numbered: false, chapterName: "Paṭṭhāna, part" },
  ];
  await rm(OUT, { recursive: true, force: true });
  await rm(path.join(ROOT, "data", "texts", "abhidhamma"), { recursive: true, force: true });
  const books = [];
  for (const d of defs) books.push(await importBook(d));
  await writeFile(path.join(ROOT, "data", "tipitaka-books.json"), JSON.stringify(books, null, 1) + "\n");
  console.log(`${books.length} books → data/tipitaka-books.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
