/**
 * Propose a versification mapping for <version> onto the canonical grid of <reference>
 * by aligning verse lengths book by book (Gale–Church sentence alignment).
 *
 *   npx tsx scripts/suggest-versification.ts kjv rvr1909            # print regions to review
 *   npx tsx scripts/suggest-versification.ts kjv rvr1909 --write    # write data/versification/<version>.json
 *
 * The output is a PROPOSAL. Always review the printed regions (texts are shown side by side)
 * before committing the mapping file. The importer applies the committed file; it never
 * runs this alignment itself.
 *
 * Run it against a "raw" import, i.e. one done with the mapping file temporarily absent
 * (import-ebible.ts --no-map).
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { catalogSchema, chapterSchema } from "../src/lib/schema";

const ROOT = path.resolve(__dirname, "..");

type V = { ref: string; ch: number; v: string; t: string };

/**
 * Chapters reviewed by hand where the length heuristic is wrong and the verses are really 1:1.
 * (RVR 1909 appends the traditional epistle subscription to the last verse, which inflates its length.)
 */
const REVIEWED_IDENTITY: Record<string, string[]> = {
  rvr1909: ["rom 16", "2ti 4", "tit 3"],
};

// Gale–Church cost helpers
function pnorm(z: number) {
  // standard normal CDF (Abramowitz–Stegun 26.2.17)
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}
const S2 = 6.8;
function lenCost(l1: number, l2: number, c: number) {
  if (l1 === 0 && l2 === 0) return 0;
  const mean = (l1 + l2 / c) / 2;
  const z = (c * l1 - l2) / Math.sqrt(Math.max(mean, 1) * S2);
  const p = Math.max(2 * (1 - pnorm(Math.abs(z))), 1e-12);
  return -Math.log(p);
}
// [refVerses, verVerses, prior]
const MOVES: [number, number, number][] = [
  [1, 1, 0.89],
  [1, 0, 0.004],
  [0, 1, 0.004],
  [2, 1, 0.04],
  [1, 2, 0.04],
  [3, 1, 0.008],
  [4, 1, 0.004],
  [5, 1, 0.003],
  [6, 1, 0.002],
  // eBible squeezes overflow verses into the last slot of a chapter, so long lumps occur.
  [7, 1, 0.001],
  [8, 1, 0.001],
  [9, 1, 0.001],
  [10, 1, 0.001],
  [2, 2, 0.005],
];

async function loadBook(work: string, version: string, book: string, chapters: number): Promise<V[]> {
  const out: V[] = [];
  // Read every chapter the version actually has (it may have more than the catalog, e.g. Joel 4 in Hebrew numbering).
  const have = (await readdir(path.join(ROOT, "data", "texts", work, version, book)))
    .filter((f) => /^\d+\.json$/.test(f))
    .map((f) => parseInt(f));
  const last = Math.max(chapters, ...have);
  for (let ch = 1; ch <= last; ch++) {
    if (!have.includes(ch)) continue;
    const p = path.join(ROOT, "data", "texts", work, version, book, `${ch}.json`);
    const c = chapterSchema.parse(JSON.parse(await readFile(p, "utf8")));
    for (const x of c.verses) out.push({ ref: `${ch}:${x.v}`, ch, v: x.v, t: x.t });
  }
  return out;
}

function align(a: V[], b: V[]) {
  const la = a.reduce((s, x) => s + x.t.length, 0);
  const lb = b.reduce((s, x) => s + x.t.length, 0);
  const c = lb / la;
  const n = a.length, m = b.length;
  const W = m + 1;
  const cost = new Float64Array((n + 1) * W).fill(Infinity);
  const back = new Int8Array((n + 1) * W).fill(-1);
  cost[0] = 0;
  const pa = [0], pb = [0];
  for (const x of a) pa.push(pa[pa.length - 1] + x.t.length);
  for (const x of b) pb.push(pb[pb.length - 1] + x.t.length);
  // Verse numbers are evidence too: most sources follow the reference grid and only leave a slot empty
  // where they omit a verse. Pairing a verse with its own number is cheap, a reference verse whose number
  // the version lacks is an expected gap, and anything else must be justified by the lengths.
  const bRefs = new Set(b.map((x) => x.ref));
  const aRefs = new Set(a.map((x) => x.ref));
  const SAME = -Math.log(0.9), SHIFTED = -Math.log(0.8), GAP_EXPECTED = -Math.log(0.6);
  for (let i = 0; i <= n; i++)
    for (let j = 0; j <= m; j++) {
      if (i === 0 && j === 0) continue;
      let best = Infinity, bi = -1;
      for (let k = 0; k < MOVES.length; k++) {
        const [di, dj, prior] = MOVES[k];
        if (i < di || j < dj) continue;
        const prev = cost[(i - di) * W + (j - dj)];
        if (prev === Infinity) continue;
        const l1 = pa[i] - pa[i - di], l2 = pb[j] - pb[j - dj];
        let p = -Math.log(prior);
        if (di === 1 && dj === 1) p = a[i - 1].ref === b[j - 1].ref ? SAME : SHIFTED;
        else if (di === 1 && dj === 0 && !bRefs.has(a[i - 1].ref)) p = GAP_EXPECTED;
        // An extra verse whose number doesn't exist in the reference at all (LXX Daniel 3:31–90,
        // Vulgate Esther 10:4ff) is an expected insertion, not something to force into a pairing.
        else if (di === 0 && dj === 1 && !aRefs.has(b[j - 1].ref)) p = GAP_EXPECTED;
        // An omitted/added verse is judged by its prior alone, not by how long the missing text is.
        const cc = prev + p + (di === 0 || dj === 0 ? 0 : lenCost(l1, l2, c));
        if (cc < best) { best = cc; bi = k; }
      }
      cost[i * W + j] = best;
      back[i * W + j] = bi;
    }
  const pairs: { a: V[]; b: V[] }[] = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    const [di, dj] = MOVES[back[i * W + j]];
    pairs.push({ a: a.slice(i - di, i), b: b.slice(j - dj, j) });
    i -= di; j -= dj;
  }
  return pairs.reverse();
}

async function main() {
  const [refId, verId, ...flags] = process.argv.slice(2);
  if (!refId || !verId) throw new Error("usage: suggest-versification.ts <referenceVersion> <version> [--write]");
  const catalog = catalogSchema.parse(JSON.parse(await readFile(path.join(ROOT, "data", "catalog.json"), "utf8")));
  const ver = catalog.versions.find((v) => v.id === verId)!;
  const mapping: Record<string, string> = {};
  let regions = 0;
  let rejected = 0;
  for (const r of catalog.religions)
    for (const col of r.collections)
      for (const it of col.items) {
        if (it.work !== ver.work || !it.chapters) continue;
        // Reference chapters the version leaves out (reordered sections) are dropped on both sides,
        // otherwise the remaining chapters get stretched across the whole book.
        const skip = (ver.import?.skipChapters ?? []).filter((r) => r.book === it.id);
        const a = (await loadBook(ver.work, refId, it.id, it.chapters)).filter(
          (x) => !skip.some((r) => x.ch >= r.from && x.ch <= (r.to ?? 999)),
        );
        const b = await loadBook(ver.work, verId, it.id, it.chapters);
        const pairs = align(a, b);
        // Chapters whose verse count differs between the two (a real numbering difference, an omitted
        // verse, or a squeezed/moved verse). Regions that touch none of them are textual-variant noise
        // (e.g. KJV's longer reading in Acts 9:5–6) and keep the identity mapping.
        const count = (xs: V[]) => xs.reduce((m, x) => m.set(x.ch, (m.get(x.ch) ?? 0) + 1), new Map<number, number>());
        const ca = count(a), cb = count(b);
        const differs = new Set([...new Set([...ca.keys(), ...cb.keys()])].filter((ch) => ca.get(ch) !== cb.get(ch)));
        let region: string[] = [];
        let regionMap: Record<string, string> = {};
        let regionChapters = new Set<number>();
        const flush = () => {
          if (region.length) {
            regions++;
            Object.assign(mapping, regionMap);
            console.log(region.join("\n") + "\n");
          }
          region = [];
          regionMap = {};
          regionChapters = new Set();
        };
        let lastA: V | undefined;
        for (const p of pairs) {
          if (p.a.length) lastA = p.a[p.a.length - 1];
          const aRefs = p.a.map((x) => x.ref);
          const bRefs = p.b.map((x) => x.ref);
          const identity = p.a.length === 1 && p.b.length === 1 && aRefs[0] === bRefs[0];
          const reviewed = [...p.a, ...p.b].every((x) => (REVIEWED_IDENTITY[verId] ?? []).includes(`${it.id} ${x.ch}`));
          if (identity || reviewed) { flush(); continue; }
          // Judge each pair on its own: a remap is only believable inside a chapter whose verse count differs
          // between the two versions. Elsewhere it is length noise (loose or abridged renderings), keep identity.
          const crossesChapters = p.a.length > 0 && p.b.length > 0 && p.a[0].ch !== p.b[0].ch;
          if (!crossesChapters && ![...p.a, ...p.b].some((x) => differs.has(x.ch))) { rejected++; flush(); continue; }
          if (!region.length) region.push(`### ${it.id} (${it.name})`);
          const first = p.a[0], last = p.a[p.a.length - 1];
          const end = !last || last === first ? "" : "-" + (last.ch === first.ch ? last.v : last.ref);
          // No reference counterpart: a whole extra chapter goes to the Apocrypha section; a verse inside
          // a book becomes an extra row after the last aligned reference verse ("book c:v+").
          const target = first
            ? `${it.id} ${first.ref}${end}`
            : p.b.every((x) => x.ch > it.chapters!)
              ? "(apocrypha)"
              : lastA
                ? `${it.id} ${lastA.ref}+`
                : "(none)";
          for (const x of p.b) regionMap[`${it.id} ${x.ref}`] = target;
          for (const x of [...p.a, ...p.b]) regionChapters.add(x.ch);
          const ta = p.a.map((x) => `[${x.ref}] ${x.t}`).join(" ");
          const tb = p.b.map((x) => `[${x.ref}] ${x.t}`).join(" ");
          region.push(`  ${refId} ${aRefs.join(",") || "—"}  <=  ${verId} ${bRefs.join(",") || "—"}`);
          region.push(`     ${refId}: ${ta.slice(0, 140)}`);
          region.push(`     ${verId}: ${tb.slice(0, 140)}`);
        }
        flush();
      }
  console.log(`${regions} region(s), ${Object.keys(mapping).length} remapped verse slot(s), ${rejected} noise pair(s) ignored`);
  // Hand-reviewed overrides (data/versification/overrides/<version>.json) for documented differences the
  // length alignment cannot see, e.g. the 67-verse Prayer of Azariah inserted in LXX/Vulgate Daniel 3.
  //   "dan 3:24-90": "(apocrypha)"   "dan 3:91-97": "dan 3:24-30"   "est 10:4-13": "est 10:3+"
  try {
    const ov = JSON.parse(await readFile(path.join(ROOT, "data", "versification", "overrides", `${verId}.json`), "utf8")).map as Record<string, string>;
    const range = (r: string) => {
      const m = /^(\S+) (\d+):(\d+)(?:-(\d+))?$/.exec(r);
      if (!m) throw new Error(`bad override range ${r}`);
      const from = +m[3], to = m[4] ? +m[4] : from;
      return Array.from({ length: to - from + 1 }, (_, i) => `${m[1]} ${m[2]}:${from + i}`);
    };
    let n = 0;
    for (const [src, dst] of Object.entries(ov)) {
      const srcs = range(src);
      const dsts = dst === "(apocrypha)" || dst.endsWith("+") ? srcs.map(() => dst) : range(dst);
      if (dsts.length !== srcs.length) throw new Error(`override ${src} -> ${dst}: ranges differ in length`);
      srcs.forEach((k, i) => { mapping[k] = dsts[i]; n++; });
      // identity targets need no entry
      srcs.forEach((k) => { if (mapping[k] === k) delete mapping[k]; });
    }
    console.log(`applied ${n} override(s) from data/versification/overrides/${verId}.json`);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  if (flags.includes("--write")) {
    const dir = path.join(ROOT, "data", "versification");
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, `${verId}.json`);
    const body = {
      $comment: `Maps ${verId} verse slots (as published by the source) onto the canonical "${ver.versification}" grid used by ${refId}. Proposed by scripts/suggest-versification.ts, then reviewed by hand. Value "book c:v" or "book c:v-w" (one source verse covering several canonical verses).`,
      reference: refId,
      map: mapping,
    };
    await writeFile(file, JSON.stringify(body, null, 2) + "\n");
    console.log(`wrote ${path.relative(ROOT, file)}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
