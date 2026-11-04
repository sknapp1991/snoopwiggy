/**
 * Import the Quran (Islam):
 *   - tanzil     Arabic (Uthmani), Tanzil Project, CC BY 3.0. Shown VERBATIM (Tanzil forbids changes);
 *                credit + link in the catalog attribution.
 *   - pickthall  "The Meaning of the Glorious Koran", Marmaduke Pickthall (Knopf, 1930); public domain in
 *                the US since 1 Jan 2026. Text from Wikisource's proofread transcription of the 1930 edition
 *                where available, otherwise from the Internet Archive scan's text layer (MN40248ucmf_9),
 *                cleaned of page headers / footnotes. Verse counts are checked against the Arabic numbering
 *                (numbers are facts; no text is taken from any copyrighted edition).
 * One book "quran" with 114 chapters (surahs). Pickthall counts the Bismillah of Surah 1 as a heading
 * and divides its last verses differently; we align it to the standard numbering and keep his number in `n`.
 *
 *   npx tsx scripts/import-quran.ts      (sources cached in data/raw/)
 */
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { chapterSchema } from "../src/lib/schema";

const ROOT = path.resolve(__dirname, "..");
const RAW = path.join(ROOT, "data", "raw");
const OUT = path.join(ROOT, "data", "texts", "quran");
const UA = { "User-Agent": "VersesAcross-importer/1.0 (https://versesacross.com)" };
const exists = (p: string) => access(p).then(() => true, () => false);

async function cached(file: string, url: string) {
  const p = path.join(RAW, file);
  if (!(await exists(p))) {
    const res = await fetch(url, { headers: UA });
    if (!res.ok) throw new Error(`download ${url}: ${res.status}`);
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, await res.text());
  }
  return readFile(p, "utf8");
}

/** `to`: this English verse also covers a later standard verse; `cont`: this verse's text is in "s:v". */
type Verses = Map<number, { t: string; n?: string; to?: string; cont?: string }>;

/* ---------- Arabic (Tanzil) ---------- */
async function arabic(): Promise<Map<number, Verses>> {
  const txt = await readFile(path.join(RAW, "tanzil", "quran-uthmani.txt"), "utf8");
  const out = new Map<number, Verses>();
  for (const line of txt.split(/\r?\n/)) {
    const m = /^(\d+)\|(\d+)\|(.+)$/.exec(line);
    if (!m) continue;
    const s = +m[1];
    (out.get(s) ?? out.set(s, new Map()).get(s)!).set(+m[2], { t: m[3].trim() });
  }
  return out;
}

/* ---------- Pickthall ---------- */
function roman(r: string) {
  const v: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100 };
  let n = 0;
  for (let i = 0; i < r.length; i++) {
    const a = v[r[i]], b = v[r[i + 1]] ?? 0;
    n += a < b ? -a : a;
  }
  return n;
}
const tidy = (t: string) =>
  t
    .replace(/[  ]/g, " ")
    .replace(/([.,;:!?)'"’”])\s*\d{1,2}(?=\s|$)/g, "$1") // footnote reference numbers after punctuation
    .replace(/([a-z])\s+\d{1,2}(?=\s+[a-z])/g, "$1") // …and between words ("the taming 1 of Qureysh")
    .replace(/\s+/g, " ")
    .trim();

/** Wikisource: one page per surah, "N text" lines (proofread 1930 text). */
async function wikisource(): Promise<Map<number, Verses>> {
  const list = JSON.parse(
    await cached(
      "pickthall-wikisource/_list.json",
      "https://en.wikisource.org/w/api.php?action=query&list=allpages&apprefix=The%20Meaning%20of%20the%20Glorious%20Koran%20(1930)/&aplimit=500&format=json",
    ),
  ) as { query: { allpages: { title: string }[] } };
  const out = new Map<number, Verses>();
  for (const { title } of list.query.allpages) {
    const slug = title.split("/").pop()!.replace(/[^A-Za-z0-9]+/g, "_");
    const json = JSON.parse(
      await cached(
        `pickthall-wikisource/${slug}.json`,
        `https://en.wikisource.org/w/api.php?action=parse&page=${encodeURIComponent(title.replace(/ /g, "_"))}&prop=text&format=json&formatversion=2`,
      ),
    ) as { parse?: { text: string } };
    if (!json.parse) continue;
    let h = json.parse.text;
    h = h.replace(/<style[\s\S]*?<\/style>/g, "");
    h = h.replace(/<sup[^>]*class="[^"]*reference[^"]*"[^>]*>[\s\S]*?<\/sup>/g, "");
    h = h.replace(/<span[^>]*class="[^"]*(pagenum|ws-pagenum)[^"]*"[^>]*>[\s\S]*?<\/span>/g, "");
    h = h.replace(/<(ol|div)[^>]*class="[^"]*references[^"]*"[\s\S]*?<\/\1>/g, "");
    h = h.replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>/g, "\n").replace(/<[^>]+>/g, "");
    const text = h.replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    const head = /S[ÛU]RAH\s+([IVXLC]+)\b/.exec(text);
    if (!head) continue;
    const surah = roman(head[1]);
    const verses: Verses = new Map();
    let expect = 1;
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      const m = /^(\d{1,3})\s+(.+)$/.exec(line);
      if (m && +m[1] === expect) {
        verses.set(expect, { t: tidy(m[2]) });
        expect++;
      }
    }
    if (verses.size) out.set(surah, verses);
  }
  return out;
}

/**
 * Internet Archive scan text layer (Knopf 1930), for surahs not yet on Wikisource.
 * Driven by the standard verse counts (facts, from the Arabic numbering): after the last verse of a surah,
 * the next "1." starts the next surah, so garbled headings don't matter. Common misreadings of verse
 * numbers ("ii." for 11, "l." for 1, "O" for 0…) are mapped back to digits.
 */
async function scan(counts: Map<number, number>): Promise<Map<number, Verses>> {
  const txt = await cached("pickthall-ia/MN40248ucmf_9_djvu.txt", "https://archive.org/download/MN40248ucmf_9/MN40248ucmf_9_djvu.txt");
  const lines = txt.split(/\r?\n/);
  const out = new Map<number, Verses>();
  let surah = 0;
  let expect = 1;
  // cand: indexes into parts of lines that look like a verse start whose number was unreadable
  let cur: { v: number; parts: string[]; cand: number[] } | null = null;
  let inFootnote = false;
  let pending = 0; // a readable "SURAH XXVII" heading: the next "1." starts that surah
  const header = /^([ivxlc]+\s+[A-Z][A-Za-z' ,.\-]+\s+\d+|\d+\s+[A-Z][A-Za-z' ,.\-]+\s+[ivxlc]+|[\dIl]{1,3}|[ivxlc]+)$/;
  const num = (tok: string) => {
    const d = tok.replace(/[lI|!iJ]/g, "1").replace(/[Oo]/g, "0").replace(/S/g, "5").replace(/B/g, "8").replace(/Z/g, "2").replace(/G/g, "6");
    return /^\d{1,3}$/.test(d) ? +d : NaN;
  };
  const save = (v: number, parts: string[]) => {
    const t = tidy(parts.join(" ").replace(/-\s+(?=[a-z])/g, ""));
    (out.get(surah) ?? out.set(surah, new Map()).get(surah)!).set(v, { t });
  };
  /** Save the current verse; if `missing` verse numbers follow it unreadably, split them off at the
   * remembered verse-start lines (the last ones) and number them in order. */
  const flush = (missing = 0) => {
    if (cur && surah) {
      const cuts = missing > 0 && cur.cand.length >= missing ? cur.cand.slice(-missing) : [];
      const bounds = [0, ...cuts, cur.parts.length];
      for (let i = 0; i + 1 < bounds.length; i++) {
        const piece = cur.parts.slice(bounds[i], bounds[i + 1]);
        if (i > 0) piece[0] = piece[0].replace(/^\S{1,5}\s*[.,:;]\s*/, "");
        save(cur.v + i, piece);
      }
    }
    cur = null;
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    // Headings are in capitals ("SURAH XIX", scanned as "SORAH", "SDRAH"…); running text says "Surah X."
    const heading = /^S[A-Z0-9ÛÜ]{0,2}R[AÂ]H\s+([IVXLC]+)\.?$/.exec(line);
    if (heading) {
      const r = roman(heading[1].toUpperCase());
      if (r > surah && r <= 114) {
        flush();
        pending = r;
        expect = Infinity; // ignore numbers until this surah's verse 1
      }
      continue;
    }
    if (header.test(line)) {
      inFootnote = false; // a new page starts after the footnotes
      continue;
    }
    const lead = /^["'‘“/]?([0-9lIi|!JOoSBZG]{1,4})\s*([.,:;])?\s*(.*)$/.exec(line);
    const n = lead ? num(lead[1]) : NaN;
    const total = counts.get(surah) ?? Infinity;
    // Pickthall's 1930 numbering can run a few verses longer than the standard one (e.g. 6:166).
    const done = surah > 0 && expect > total + 3;
    // Start of the next surah: verse "1." once the current surah is (nearly) complete — a few verse
    // numbers may have been unreadable — or at the very beginning.
    const nearlyDone = surah > 0 && expect > total - Math.max(2, Math.ceil(total * 0.04));
    // After a readable heading, verse 1 may itself be unreadable: start at verse 2 or 3 then (gap before).
    if (pending && n >= 2 && n <= 3 && lead![2]) {
      flush();
      surah = pending;
      pending = 0;
      expect = n + 1;
      inFootnote = false;
      cur = { v: n, parts: [lead![3]], cand: [] };
      continue;
    }
    if ((surah === 0 || done || nearlyDone || pending) && n === 1 && lead![2] && surah < 114) {
      flush(Number.isFinite(expect) ? Math.max(0, total - (expect - 1)) : 0);
      surah = pending || surah + 1;
      pending = 0;
      expect = 2;
      inFootnote = false;
      cur = { v: 1, parts: [lead![3]], cand: [] };
      continue;
    }
    if (!surah) continue;
    // The expected verse, or one or two further on when a verse number was unreadable (left as a gap).
    if (!done && n >= expect && n <= expect + 6 && n <= total + 3 && (lead![2] || n >= 10) && /^[A-Z(‘'"“]/.test(lead![3] || "A")) {
      flush(n - expect);
      inFootnote = false;
      cur = { v: n, parts: [lead![3]], cand: [] };
      expect = n + 1;
      continue;
    }
    if (/^\d{1,2}\s+[A-Z(‘'"]/.test(line) && cur) {
      inFootnote = true; // "1 Three letters of the Arabic alphabet…"
      continue;
    }
    if (inFootnote || !cur || done) continue;
    if (/^(Revealed at|In the name of Allah|S[UÛOÜ]R[AÂ]H)/i.test(line)) continue;
    if (/^\S{1,5}\s*[.,:;]\s+[A-Z(‘'"“]/.test(line)) cur.cand.push(cur.parts.length);
    cur.parts.push(line);
  }
  flush();
  if (process.env.DEBUG_SCAN) for (const [k, v] of out) console.log("scan surah", k, "verses", v.size, "max", Math.max(...v.keys()));
  return out;
}

async function write(version: string, data: Map<number, Verses>) {
  const dir = path.join(OUT, version, "quran");
  await rm(path.join(OUT, version), { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  for (let s = 1; s <= 114; s++) {
    const vs = data.get(s);
    if (!vs?.size) continue;
    const verses = [...vs.entries()]
      .filter(([, x]) => x.t || x.cont)
      .sort((a, b) => a[0] - b[0])
      .map(([v, x]) => ({ v: String(v), t: x.t, ...(x.to ? { to: x.to } : {}), ...(x.n ? { n: x.n } : {}), ...(x.cont ? { cont: x.cont } : {}) }));
    const ch = chapterSchema.parse({ work: "quran", version, book: "quran", chapter: s, verses });
    await writeFile(path.join(dir, `${s}.json`), `{"work":"quran","version":"${version}","book":"quran","chapter":${s},"verses":[\n${ch.verses.map((x) => JSON.stringify(x)).join(",\n")}\n]}\n`);
  }
}

/**
 * Line Pickthall's verses up with the standard (Hafs) numbering by content: an English verse's length
 * tracks its Arabic verse's length. Dynamic programming over 1:1, 2:1 (he splits a verse), 1:2 (he joins
 * two — or a verse number was unreadable in the scan) and 0:1 (verse missing). His number stays in `n`.
 */
function align(s: number, en: Verses, arab: Verses): Verses {
  const E = [...en.entries()].sort((a, b) => a[0] - b[0]);
  const A = [...arab.entries()].sort((a, b) => a[0] - b[0]);
  const len = (t: string) => Math.max(1, t.replace(/\p{M}/gu, "").replace(/\s+/g, " ").length);
  const eL = E.map(([, x]) => len(x.t)), aL = A.map(([, x]) => len(x.t));
  const k = eL.reduce((a, b) => a + b, 0) / aL.reduce((a, b) => a + b, 0);
  const c = (e: number, a: number) => Math.log(e / (k * a)) ** 2;
  const n = E.length, m = A.length;
  const INF = 1e18;
  const cost = Array.from({ length: n + 1 }, () => new Float64Array(m + 1).fill(INF));
  const from = Array.from({ length: n + 1 }, () => new Int8Array(m + 1));
  cost[0][0] = 0;
  for (let i = 0; i <= n; i++)
    for (let j = 0; j <= m; j++) {
      const here = cost[i][j];
      if (here >= INF) continue;
      const step = (di: number, dj: number, val: number, code: number) => {
        if (i + di > n || j + dj > m || here + val >= cost[i + di][j + dj]) return;
        cost[i + di][j + dj] = here + val;
        from[i + di][j + dj] = code;
      };
      // Pickthall's printed numbers are evidence too: keep the offset between his number and the
      // standard one steady unless the lengths say otherwise, and allow a missing verse cheaply where
      // his own numbering jumps (a verse number unreadable in the scan).
      const offsetShift = (ii: number, jj: number) =>
        ii > 0 && jj > 0 && E[ii][0] - A[jj][0] !== E[ii - 1][0] - A[jj - 1][0] ? 1.2 : 0;
      const numberGap = i > 0 && i < n && E[i][0] - E[i - 1][0] > 1;
      if (i < n && j < m) step(1, 1, c(eL[i], aL[j]) + offsetShift(i, j), 1);
      if (i + 1 < n && j < m) step(2, 1, c(eL[i] + eL[i + 1], aL[j]) + 0.6, 2);
      if (i < n && j + 1 < m) step(1, 2, c(eL[i], aL[j] + aL[j + 1]) + 0.6, 3);
      if (j < m) step(0, 1, numberGap || i === 0 ? 0.4 : 2.5, 4);
      if (i < n) step(1, 0, 2.5, 5); // stray English text (rare): attach nowhere
    }
  const out: Verses = new Map();
  const pickNum = (idx: number[]) => idx.map((x) => E[x][0]);
  let i = n, j = m;
  const steps: { code: number; i: number; j: number }[] = [];
  while (i > 0 || j > 0) {
    const code = from[i][j];
    steps.push({ code, i, j });
    if (code === 1) {
      i--;
      j--;
    } else if (code === 2) {
      i -= 2;
      j--;
    } else if (code === 3) {
      i--;
      j -= 2;
    }
    else if (code === 4) j--;
    else if (code === 5) i--;
    else break;
  }
  for (const { code, i: ii, j: jj } of steps.reverse()) {
    if (code === 1) {
      const [num, x] = E[ii - 1], v = A[jj - 1][0];
      out.set(v, { t: x.t, ...(num !== v ? { n: String(num) } : {}) });
    } else if (code === 2) {
      const [a, b] = pickNum([ii - 2, ii - 1]), v = A[jj - 1][0];
      out.set(v, { t: `${E[ii - 2][1].t} ${E[ii - 1][1].t}`, n: `${a}–${b}` });
    } else if (code === 3) {
      const [num] = pickNum([ii - 1]), v1 = A[jj - 2][0], v2 = A[jj - 1][0];
      out.set(v1, { t: E[ii - 1][1].t, to: String(v2), ...(num !== v1 ? { n: String(num) } : {}) });
      out.set(v2, { t: "", cont: `${s}:${v1}` });
    }
  }
  return out;
}

async function main() {
  const ar = await arabic();
  await write("tanzil", ar);
  const ws = await wikisource();
  const counts = new Map([...ar.entries()].map(([k, v]) => [k, v.size]));
  counts.set(1, 7); // Pickthall's own count for Surah 1 (Bismillah as a heading)
  const sc = await scan(counts);
  const en = new Map<number, Verses>();
  const report: string[] = [];
  let fromWs = 0, fromScan = 0;
  for (let s = 1; s <= 114; s++) {
    const want = ar.get(s)!.size;
    const w = ws.get(s), c = sc.get(s);
    // Surah 1: Pickthall's 1–5 are standard 2–6 and his 6–7 are standard 7; the Bismillah is standard 1.
    const fit = (v?: Verses) => (s === 1 ? v && v.size === 7 : v && v.size === want);
    const pick = fit(w) ? w : fit(c) ? c : w && c ? (Math.abs(w.size - want) <= Math.abs(c.size - want) ? w : c) : (w ?? c);
    if (!pick) {
      report.push(`surah ${s}: no English found`);
      continue;
    }
    if (pick === w) fromWs++;
    else fromScan++;
    // Fill verses missing at the end of a Wikisource page from the scan (same numbering source).
    if (pick === w && c && s !== 1) {
      const last = Math.max(...pick.keys());
      for (const [v, x] of c) if (v > last) pick.set(v, x);
    }
    const perfect = s === 1 || (pick.size === want && Math.max(...pick.keys()) === want);
    if (!perfect) {
      const before = pick.size;
      const aligned = align(s, pick, ar.get(s)!);
      const gaps = want - [...aligned.values()].filter((x) => x.t || x.cont).length;
      report.push(`surah ${s}: ${before} Pickthall verses aligned to ${want}${gaps ? `, ${gaps} gap(s)` : ""} (${pick === w ? "wikisource" : "scan"})`);
      en.set(s, aligned);
      continue;
    }
    if (s === 1 && pick.size === 7) {
      // Pickthall prints the Bismillah as an unnumbered heading; standard numbering counts it as verse 1.
      const m: Verses = new Map([[1, { t: "In the name of Allah, the Beneficent, the Merciful." }]]);
      for (let v = 1; v <= 5; v++) m.set(v + 1, { t: pick.get(v)!.t, n: String(v) });
      m.set(7, { t: `${pick.get(6)!.t} ${pick.get(7)!.t}`, n: "6–7" });
      en.set(1, m);
    } else en.set(s, pick);
  }
  await write("pickthall", en);
  console.log(`tanzil: 114 surahs, ${[...ar.values()].reduce((a, v) => a + v.size, 0)} verses`);
  console.log(`pickthall: ${fromWs} surahs from Wikisource, ${fromScan} from the scan`);
  console.log(report.length ? report.join("\n") : "all verse counts match");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
