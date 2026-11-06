/**
 * Import word-lookup data (word card + reading levels) from open dictionaries, trimmed to the words that
 * actually occur in the site's texts, into compact committed sources in data/words/:
 *
 *   data/words/<lang>.json      { w: headword → {pos, defs, syn?, tr?, of?, arch?}, f: form → headword, a: form → modern English }
 *   data/words/freq-<lang>.json headword → Zipf frequency (lemma + its forms; wordfreq, or the site's own Latin texts)
 *   data/words/cefr-en.json     English headword → CEFR level (CEFR-J 1.5 A1–B2 + Octanove C1/C2)
 *   data/words/archaic-en.json  hand-written (not produced here, read here)
 *
 * scripts/build-words.ts then turns these into public/words/<lang>/ (run by `npm run pack`).
 *
 * Downloads (git-ignored, data/raw/words/):
 *   kaikki/raw-wiktextract-data.jsonl.gz  https://kaikki.org/dictionary/raw-wiktextract-data.jsonl.gz  (Wiktionary, CC BY-SA 4.0)
 *   oewn/english-wordnet-2025.xml.gz      https://en-word.net/static/english-wordnet-2025.xml.gz      (CC BY 4.0)
 *   cefrj/*.csv                           https://github.com/openlanguageprofiles/olp-en-cefrj
 *   wordfreq/<lang>.tsv                   python -I scripts/export-wordfreq.py (wordfreq, CC BY-SA 4.0 data)
 *
 *   npx tsx scripts/import-words.ts            (extract from the dump if needed, then compile)
 *   npx tsx scripts/import-words.ts --extract  (force re-extraction from the 3 GB dump: two ~4-minute passes)
 */
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import zlib from "node:zlib";
import { scanCorpus } from "./lib/word-corpus";
import { lookupKeys, normWord, WORD_LANGS } from "../src/lib/word-norm";

const ROOT = path.resolve(__dirname, "..");
const RAW = path.join(ROOT, "data", "raw", "words");
const OUT = path.join(ROOT, "data", "words");
const DUMP = path.join(RAW, "kaikki", "raw-wiktextract-data.jsonl.gz");
const SLIM = (l: string) => path.join(RAW, "kaikki", `slim-${l}.jsonl`);

/** Wiktionary language code → site language. The site's Greek texts are Koine/LXX → Ancient Greek. */
const WIKT_LANG: Record<string, string> = { en: "en", es: "es", fr: "fr", de: "de", it: "it", pt: "pt", ru: "ru", la: "la", grc: "el" };
/** Translation-table language code → site language key in "tr". */
const TR_LANG: Record<string, string> = {
  es: "es", fr: "fr", de: "de", it: "it", pt: "pt", ru: "ru", la: "la", grc: "el", el: "el~", he: "he", ar: "ar", cmn: "zh", zh: "zh~",
};
const TR_ORDER = ["en", "es", "fr", "de", "it", "pt", "ru", "la", "el", "he", "ar", "zh"];

const POS: Record<string, string> = {
  noun: "noun", verb: "verb", adj: "adjective", adv: "adverb", pron: "pronoun", prep: "preposition",
  conj: "conjunction", det: "determiner", article: "article", intj: "interjection", num: "numeral",
  name: "name", particle: "particle", postp: "postposition", contraction: "contraction",
};
const MAX_DEFS = 3;
const MAX_SYN = 5;
const MAX_TR = 2;

// ---------------------------------------------------------------- slim Wiktionary records

type Slim = {
  w: string; // word as written
  p: string; // pos
  s: { g: string; t?: string[]; of?: string[]; sy?: string[] }[];
  fm?: [string, string[]][];
  sy?: string[];
  tr?: [lang: string, word: string, sense: string][];
};

type Raw = {
  word: string;
  lang_code: string;
  pos: string;
  senses?: { glosses?: string[]; tags?: string[]; form_of?: { word: string }[]; alt_of?: { word: string }[]; synonyms?: { word: string }[] }[];
  forms?: { form: string; tags?: string[] }[];
  synonyms?: { word: string }[];
  translations?: { lang_code?: string; code?: string; word?: string; sense?: string }[];
};

function slim(r: Raw): Slim {
  const s: Slim["s"] = [];
  for (const x of r.senses ?? []) {
    const g = (x.glosses ?? []).join(" — ");
    const of = [...(x.form_of ?? []), ...(x.alt_of ?? [])].map((o) => o.word);
    s.push({ g, ...(x.tags?.length ? { t: x.tags } : {}), ...(of.length ? { of } : {}), ...(x.synonyms?.length ? { sy: x.synonyms.map((y) => y.word) } : {}) });
  }
  const out: Slim = { w: r.word, p: r.pos, s };
  const fm = (r.forms ?? [])
    .filter((f) => f.form && !/table-tags|inflection-template|class|romanization/.test((f.tags ?? []).join(" ")))
    .map((f) => [f.form, f.tags ?? []] as [string, string[]]);
  if (fm.length) out.fm = fm;
  if (r.synonyms?.length) out.sy = r.synonyms.map((y) => y.word);
  if (r.lang_code === "en" && r.translations?.length)
    out.tr = r.translations
      .filter((t) => t.word && TR_LANG[t.lang_code ?? t.code ?? ""])
      .map((t) => [TR_LANG[t.lang_code ?? t.code ?? ""], t.word!, t.sense ?? ""]);
  return out;
}

async function* lines(file: string) {
  const rl = readline.createInterface({ input: createReadStream(file).pipe(zlib.createGunzip({ chunkSize: 1 << 20 })), crlfDelay: Infinity });
  for await (const line of rl) yield line;
}

/** Top-level lang_code / word sit at the end of each record. */
function tail(line: string): { lang?: string; word?: string } {
  const li = line.lastIndexOf('"lang_code": "');
  if (li < 0) return {};
  const lang = line.slice(li + 14, line.indexOf('"', li + 14));
  const wi = line.lastIndexOf('"word": "');
  let word: string | undefined;
  if (wi >= 0) {
    try {
      // the JSON string may contain escapes
      let j = wi + 9;
      while (j < line.length && !(line[j] === '"' && line[j - 1] !== "\\")) j++;
      word = JSON.parse(line.slice(wi + 8, j + 1));
    } catch {}
  }
  return { lang, word };
}

async function extract(corpus: Map<string, Set<string>>) {
  const keep = new Map<string, Slim[]>();
  const have = new Map<string, Set<string>>(); // site lang → normalised words kept
  const need = new Map<string, Set<string>>(); // site lang → normalised lemmas referenced but not kept
  for (const l of Object.values(WIKT_LANG)) {
    keep.set(l, []);
    have.set(l, new Set());
    need.set(l, new Set());
  }
  let n = 0;
  const t0 = Date.now();
  for await (const line of lines(DUMP)) {
    if (++n % 1_000_000 === 0) console.log(`  pass 1: ${n / 1e6}M lines, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    const { lang: wl } = tail(line);
    const lang = wl && WIKT_LANG[wl];
    if (!lang) continue;
    const r = JSON.parse(line) as Raw;
    const set = corpus.get(lang)!;
    const k = normWord(r.word, lang);
    let hit = set.has(k);
    if (!hit) for (const f of r.forms ?? []) if (set.has(normWord(f.form, lang))) { hit = true; break; }
    if (!hit) continue;
    const s = slim(r);
    keep.get(lang)!.push(s);
    have.get(lang)!.add(k);
    for (const x of s.s) for (const o of x.of ?? []) need.get(lang)!.add(normWord(o, lang));
  }
  // pass 2: lemmas that corpus forms point to but that do not occur themselves
  for (const [l, s] of need) for (const k of have.get(l)!) s.delete(k);
  console.log(`  pass 2: ${[...need].map(([l, s]) => `${l} ${s.size}`).join(", ")} referenced lemmas`);
  for await (const line of lines(DUMP)) {
    const { lang: wl, word } = tail(line);
    const lang = wl && WIKT_LANG[wl];
    if (!lang || word === undefined || !need.get(lang)!.has(normWord(word, lang))) continue;
    keep.get(lang)!.push(slim(JSON.parse(line) as Raw));
  }
  for (const [l, list] of keep) {
    await writeFile(SLIM(l), list.map((s) => JSON.stringify(s)).join("\n"));
    console.log(`  ${l}: ${list.length} Wiktionary entries kept`);
  }
}

async function readSlim(l: string): Promise<Slim[]> {
  return (await readFile(SLIM(l), "utf8")).split("\n").filter(Boolean).map((x) => JSON.parse(x));
}

// ---------------------------------------------------------------- Open English WordNet

type WN = Map<string, { pos: string; defs: string[]; syn: string[] }>;

async function wordnet(): Promise<WN> {
  const xml = zlib.gunzipSync(await readFile(path.join(RAW, "oewn", "english-wordnet-2025.xml.gz"))).toString("utf8");
  const dec = (s: string) => s.replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  const entryLemma = new Map<string, string>();
  const wordSynsets = new Map<string, string[]>(); // "love|n" → synsets in sense order
  const reEntry = /<LexicalEntry id="([^"]+)">\s*<Lemma writtenForm="([^"]+)" partOfSpeech="(\w)"\s*\/?>([\s\S]*?)<\/LexicalEntry>/g;
  for (const m of xml.matchAll(reEntry)) {
    const w = dec(m[2]);
    entryLemma.set(m[1], w);
    const key = `${w.toLowerCase()}|${m[3] === "s" ? "a" : m[3]}`;
    const list = wordSynsets.get(key) ?? wordSynsets.set(key, []).get(key)!;
    for (const s of m[4].matchAll(/<Sense id="[^"]+" synset="([^"]+)"/g)) list.push(s[1]);
  }
  const synsets = new Map<string, { members: string[]; def: string }>();
  for (const m of xml.matchAll(/<Synset id="([^"]+)"[^>]*members="([^"]+)"[^>]*>\s*<Definition>([\s\S]*?)<\/Definition>/g))
    synsets.set(m[1], { members: m[2].split(" "), def: dec(m[3]) });
  const P: Record<string, string> = { n: "noun", v: "verb", a: "adjective", r: "adverb" };
  const out: WN = new Map();
  for (const [key, ids] of wordSynsets) {
    const [w, p] = key.split("|");
    const defs: string[] = [];
    const syn: string[] = [];
    for (const id of ids.slice(0, 2)) {
      const s = synsets.get(id);
      if (!s) continue;
      if (defs.length < 2) defs.push(s.def);
      for (const e of s.members) {
        const lw = entryLemma.get(e);
        if (lw && lw.toLowerCase() !== w && !syn.includes(lw)) syn.push(lw);
      }
    }
    out.set(key, { pos: P[p], defs, syn });
  }
  return out;
}

// ---------------------------------------------------------------- helpers

const SKIP_GLOSS = /^(plural of|alternative (form|spelling) of|obsolete (form|spelling) of|archaic (form|spelling) of|misspelling of)/i;
/** Inflection glosses that wiktextract did not mark as form-of ("presubject first-person singular present indicative of aimer"). */
const INFL_GLOSS = /\b(singular|plural|participle|indicative|subjunctive|imperative|infinitive|gerund|tense|genitive|dative|accusative|vocative|ablative|nominative|comparative|superlative|inflection)\b[^;,.]* of [^\s.,;]+$/i;
const BAD_LINK = ["misspelling", "nonstandard", "pronunciation-spelling", "eye-dialect", "dialectal", "obsolete", "archaic", "rare"];
const LABEL_TAGS = ["archaic", "obsolete", "dated", "biblical", "poetic", "rare", "literary", "figuratively", "Christianity"];

function cleanGloss(g: string): string {
  g = g.replace(/\s+/g, " ").trim();
  if (g.length > 120) g = g.slice(0, 117).replace(/\s+\S*$/, "") + "…";
  return g;
}

function labelled(x: Slim["s"][number]): string {
  const tags = (x.t ?? []).filter((t) => LABEL_TAGS.includes(t));
  // sub-senses come as "parent — child": the parent is the general meaning and much shorter
  return (tags.length ? `(${tags.join(", ")}) ` : "") + cleanGloss(x.g.split(" — ")[0]);
}

/** "British … standard spelling of honor." — a spelling variant whose target wiktextract did not link. */
const SPELLING_OF = /\b(spelling|form) of ([^\s.,;]+)\.?$/i;
const isFormSense = (x: Slim["s"][number]) =>
  !!x.of?.length || (x.t ?? []).some((t) => t === "form-of" || t === "alt-of") || SPELLING_OF.test(x.g);
const SACRED = /\b(God|deity|Christ|Jesus|Messiah|Holy Spirit|Bible|biblical|Abrahamic|Torah|Quran|Allah)\b/;
const INFL_POS = new Set(["verb", "noun", "adj", "adv"]);
const oldTag = (x: Slim["s"][number]) => (x.t ?? []).some((t) => t === "archaic" || t === "obsolete" || t === "dated");

/** Own property only ("constructor", "__proto__" are words too). */
function own<T>(o: Record<string, T>, k: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined;
}

function pushUniq(list: string[], v: string, max: number) {
  if (v && list.length < max && !list.includes(v)) list.push(v);
}

/** of: also a form of these headwords ("saw" → see); arch: every sense is archaic/obsolete; old: older meaning in these texts. */
type Entry = { hw?: string; pos: string[]; defs: string[]; syn?: string[]; tr?: Record<string, string[]>; of?: string[]; arch?: 1; old?: string };
type Lex = { w: Record<string, Entry>; f: Record<string, string>; a: Record<string, string> };

async function loadZipf(lang: string): Promise<Map<string, number>> {
  const file = path.join(RAW, "wordfreq", `${lang === "el" ? "el" : lang}.tsv`);
  const m = new Map<string, number>();
  if (!existsSync(file)) return m;
  for (const line of (await readFile(file, "utf8")).split("\n")) {
    const i = line.indexOf("\t");
    if (i < 0) continue;
    const k = normWord(line.slice(0, i), lang);
    const z = +line.slice(i + 1);
    if (z > (m.get(k) ?? 0)) m.set(k, z);
  }
  return m;
}

// ---------------------------------------------------------------- compile one language

type Corpus = Map<string, number>;

function compile(lang: string, recs: Slim[], corpus: Corpus, wn: WN | null, archaic: Archaic | null): Lex {
  const byKey = new Map<string, Slim[]>();
  for (const r of recs) {
    const k = normWord(r.w, lang);
    if (!k || k.includes(" ")) continue;
    (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(r);
  }
  const lemmaKeys = new Set<string>();
  for (const [k, rs] of byKey) if (rs.some((r) => POS[r.p] && r.s.some((x) => !isFormSense(x) && x.g))) lemmaKeys.add(k);

  // form → candidate lemmas (from inflection tables and form-of senses)
  const formOf = new Map<string, Map<string, number>>(); // form → lemma → score
  const addForm = (form: string, lemma: string, score: number) => {
    if (!form || !lemma || form === lemma) return;
    const m = formOf.get(form) ?? formOf.set(form, new Map()).get(form)!;
    m.set(lemma, Math.max(m.get(lemma) ?? 0, score));
  };
  const oldForm = new Map<string, string>(); // form → modern word it is an old form/spelling of
  const inflOf = new Map<string, Set<string>>(); // form → lemmas it is a regular inflection of ("saw" → see)
  const addInfl = (form: string, lemma: string) => {
    if (form !== lemma) (inflOf.get(form) ?? inflOf.set(form, new Set()).get(form)!).add(lemma);
  };
  for (const [k, rs] of byKey)
    for (const r of rs) {
      if (!POS[r.p]) continue;
      for (const x of r.s)
        for (const o of x.of?.length ? x.of : SPELLING_OF.test(x.g) ? [x.g.match(SPELLING_OF)![2]] : []) {
          const lk = normWord(o, lang);
          addForm(k, lk, oldTag(x) ? 2 : 3);
          if (INFL_POS.has(r.p) && (x.t ?? []).includes("form-of") && !(x.t ?? []).some((t) => BAD_LINK.includes(t))) addInfl(k, lk);
          if (oldTag(x)) oldForm.set(k, o);
        }
      if (lemmaKeys.has(k))
        for (const [form, tags] of r.fm ?? []) {
          const fk = normWord(form, lang);
          if (fk.includes(" ")) continue;
          addForm(fk, k, tags.some((t) => t === "obsolete" || t === "archaic") ? 1 : 2);
          if (INFL_POS.has(r.p) && !tags.some((t) => BAD_LINK.includes(t) || t === "alternative")) addInfl(fk, k);
        }
    }
  const count = (k: string) => corpus.get(k) ?? 0;
  const bestLemma = (form: string): string | undefined => {
    const m = formOf.get(form);
    if (!m) return;
    let best: string | undefined;
    let bs = -1;
    for (const [l, s] of m) {
      // follow one more step (form of a form: "lovedst" → "loved" → "love")
      const target = lemmaKeys.has(l) ? l : (formOf.get(l) && [...formOf.get(l)!.keys()].find((x) => lemmaKeys.has(x))) || undefined;
      if (!target) continue;
      const score = s * 1e9 + count(target);
      if (score > bs) (bs = score), (best = target);
    }
    return best;
  };

  const lex: Lex = { w: Object.create(null), f: Object.create(null), a: Object.create(null) };
  const want = new Set<string>();

  // archaic English first: the hand-written map wins over everything
  if (archaic) {
    for (const [form, [base, modern]] of Object.entries(archaic.forms)) {
      const fk = normWord(form, lang);
      const bk = normWord(base, lang);
      lex.a[fk] = modern;
      if (fk !== bk) lex.f[fk] = bk;
      want.add(bk);
    }
  }

  const stripped = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").normalize("NFC");
  const strippedIndex = new Map<string, Set<string>>();
  if (!["la", "el", "ru"].includes(lang)) {
    const add = (k: string, target: string) => {
      const s = stripped(k);
      (strippedIndex.get(s) ?? strippedIndex.set(s, new Set()).get(s)!).add(target);
    };
    for (const k of lemmaKeys) add(k, k);
    for (const k of formOf.keys()) {
      const l = bestLemma(k);
      if (l) add(k, l);
    }
  }

  const resolveEnglishRule = archaic ? englishRule(lemmaKeys, byKey, bestLemma, archaic) : null;

  const keys = new Set<string>();
  for (const k of corpus.keys()) for (const x of lookupKeys(k, lang)) keys.add(x);
  for (const k of keys) {
    // English possessives: "lord's" is looked up as "lord" (word-norm lookupKeys), not as the name "Lord's"
    if (lang === "en" && /'s$/.test(k) && (lemmaKeys.has(k.slice(0, -2)) || formOf.has(k.slice(0, -2)))) continue;
    if (k in lex.f || k in lex.a) {
      if (!(k in lex.f)) want.add(k);
      continue;
    }
    if (lemmaKeys.has(k)) {
      want.add(k);
      // "saw" is also the past of "see": only when that lemma is at least half as common in the texts
      // a real, reasonably common lemma that is not itself an archaic word ("yea" is not shown as a form of "ye")
      const infl = [...(inflOf.get(k) ?? [])]
        .filter((x) => lemmaKeys.has(x) && count(x) * 20 >= count(k) && !(x in lex.f) && !(x in lex.a))
        .sort((a, b) => count(b) - count(a));
      const l = infl[0];
      if (l && l !== k) {
        (lex.w[k] ??= { pos: [], defs: [] }).of = [l];
        want.add(l);
        if (oldForm.has(k) && !hasModernSense(byKey.get(k)!)) lex.a[k] = oldForm.get(k)!;
      }
      continue;
    }
    let l = bestLemma(k);
    if (l) {
      lex.f[k] = l;
      want.add(l);
      if (oldForm.has(k)) lex.a[k] = archaic ? modernEnglish(k, l, byKey) : oldForm.get(k)!;
      continue;
    }
    if (resolveEnglishRule) {
      const r = resolveEnglishRule(k);
      if (r) {
        lex.f[k] = r.base;
        lex.a[k] = r.modern;
        want.add(r.base);
        continue;
      }
    }
    const cands = strippedIndex.get(stripped(k));
    if (cands && cands.size === 1) {
      l = [...cands][0];
      if (l !== k) {
        lex.f[k] = l;
        want.add(l);
      }
    }
  }

  // headword entries
  for (const k of want) {
    const rs = (byKey.get(k) ?? []).filter((r) => POS[r.p]);
    const e: Entry = lex.w[k] ?? { pos: [], defs: [] };
    const syn: string[] = [];
    const modern: string[] = [];
    const old: string[] = [];
    let allOld = true;
    let lemmaSenses = 0;
    let hw: string | undefined;
    // proper-name senses only when the word is nothing else ("Abel"), not for "love" or "to"
    const onlyNames = rs.every((r) => r.p === "name" || !r.s.some((x) => x.g && !isFormSense(x)));
    if (wn)
      for (const p of ["n", "v", "a", "r"])
        for (const x of wn.get(`${k}|${p}`)?.syn ?? []) if (!x.includes(" ") && x.toLowerCase() === x) pushUniq(syn, x, MAX_SYN);
    for (const r of rs) {
      let senses = r.s.filter((x) => x.g && !isFormSense(x) && !SKIP_GLOSS.test(x.g) && !INFL_GLOSS.test(x.g));
      // proper-name senses of ordinary words only when they are about God / the Bible ("Lord", "Word")
      if (r.p === "name" && !onlyNames) senses = senses.filter((x) => SACRED.test(x.g)).slice(0, 1);
      if (!senses.length) continue;
      const firstOfPos = !e.pos.includes(POS[r.p]);
      pushUniq(e.pos, POS[r.p], 5);
      lemmaSenses += senses.length;
      if (!hw && r.w !== k && (lang !== "en" || onlyNames)) hw = r.w;
      const isObs = (x: Slim["s"][number]) => (x.t ?? []).includes("obsolete");
      [...senses.filter((x) => !isObs(x)), ...senses.filter(isObs)].slice(0, 3).forEach((x, i) => {
        if (!firstOfPos) i = 1;
        if (!(x.t ?? []).some((t) => t === "archaic" || t === "obsolete")) allOld = false;
        ((x.t ?? []).includes("obsolete") ? old : modern).push((i === 0 ? "\u0000" : "") + labelled(x));
      });
      const lower = r.w.toLowerCase() === r.w;
      // page-level synonyms have no sense attached ("know" → "coitize"): only for one-sense words
      for (const x of [...(senses.length === 1 ? r.sy ?? [] : []), ...(senses[0]?.sy ?? [])])
        if (x !== r.w && !x.includes(" ") && (!lower || x.toLowerCase() === x) && (lang !== "en" || onlyNames || x.toLowerCase() === x) && !/^Thesaurus:/.test(x)) pushUniq(syn, x, MAX_SYN);
    }
    // first sense of each part of speech, then the rest; old senses last
    const order = (l: string[]) => [...l.filter((x) => x[0] === "\u0000"), ...l.filter((x) => x[0] !== "\u0000")].map((x) => x.replace("\u0000", ""));
    for (const d of [...order(modern), ...order(old)]) pushUniq(e.defs, d, MAX_DEFS);
    if (wn)
      for (const p of ["n", "v", "a", "r"]) {
        const x = wn.get(`${k}|${p}`);
        if (!x) continue;
        if (e.defs.length < 2) for (const d of x.defs) pushUniq(e.defs, cleanGloss(d), 2);
        if (!rs.length) pushUniq(e.pos, x.pos, 4);
      }
    if (syn.length) e.syn = syn;
    if (hw) e.hw = hw;
    if (lemmaSenses && allOld) e.arch = 1;
    if (!e.defs.length && !e.of) continue;
    lex.w[k] = e;
  }
  if (archaic)
    for (const [w, note] of Object.entries(archaic.senses)) {
      const k = normWord(w, lang);
      if (lex.w[k]) lex.w[k].old = note;
    }
  // drop forms pointing at headwords we could not describe
  for (const [f, l] of Object.entries(lex.f)) if (!lex.w[l]) delete lex.f[f];
  return lex;
}

function hasModernSense(rs: Slim[]) {
  return rs.some((r) => r.s.some((x) => x.g && !isFormSense(x) && !oldTag(x)));
}

/** "loveth" → "loves", "lovest" → "love", "lovedst" → "loved" (modern equivalent shown on the card). */
function modernEnglish(form: string, lemma: string, byKey: Map<string, Slim[]>): string {
  if (/'d$/.test(form)) return pastOf(lemma, byKey);
  if (/'n$/.test(form)) return formWith(lemma, byKey, ["participle", "past"]) ?? pastOf(lemma, byKey);
  if (/'st$|'s$|'t$/.test(form)) return lemma;
  if (/eth$|th$/.test(form)) return thirdPerson(lemma, byKey);
  if (/edst$|dst$/.test(form)) return pastOf(lemma, byKey);
  if (/est$|st$/.test(form)) return lemma;
  return lemma;
}

function formWith(lemma: string, byKey: Map<string, Slim[]>, want: string[], not: string[] = ["archaic", "obsolete"]) {
  for (const r of byKey.get(lemma) ?? [])
    if (r.p === "verb")
      for (const [f, tags] of r.fm ?? []) if (want.every((t) => tags.includes(t)) && !not.some((t) => tags.includes(t))) return f;
}

function thirdPerson(lemma: string, byKey: Map<string, Slim[]>): string {
  const f = formWith(lemma, byKey, ["third-person", "singular", "present"]);
  if (f) return f;
  if (/(s|sh|ch|x|z|o)$/.test(lemma)) return lemma + "es";
  if (/[^aeiou]y$/.test(lemma)) return lemma.slice(0, -1) + "ies";
  return lemma + "s";
}

function pastOf(lemma: string, byKey: Map<string, Slim[]>): string {
  return formWith(lemma, byKey, ["past"], ["archaic", "obsolete", "participle"]) ?? (lemma.endsWith("e") ? lemma + "d" : lemma + "ed");
}

type Archaic = { forms: Record<string, [string, string]>; senses: Record<string, string> };

/** Regular archaic verb endings: -eth / -th (3rd sg), -est / -st (2nd sg), -edst / -dst (2nd sg past). */
function englishRule(
  lemmaKeys: Set<string>,
  byKey: Map<string, Slim[]>,
  bestLemma: (k: string) => string | undefined,
  archaic: Archaic,
) {
  const isVerb = (k: string) => lemmaKeys.has(k) && (byKey.get(k) ?? []).some((r) => r.p === "verb");
  const toVerb = (k: string): string | undefined => {
    if (isVerb(k)) return k;
    const a = own(archaic.forms, k);
    if (a && isVerb(a[0])) return a[0];
    const l = bestLemma(k);
    if (l && isVerb(l)) return l;
  };
  const stems = (s: string) => {
    const out = [s, s + "e"];
    if (/([bdfgklmnprtvz])\1$/.test(s)) out.push(s.slice(0, -1));
    if (s.endsWith("i")) out.push(s.slice(0, -1) + "y");
    return out;
  };
  return (k: string): { base: string; modern: string } | undefined => {
    let m: RegExpMatchArray | null;
    if ((m = k.match(/^(.{2,}?)(?:e?dst|edest)$/))) {
      for (const s of stems(m[1])) {
        const v = toVerb(s) ?? toVerb(s + "ed") ?? toVerb(s + "d");
        if (v) return { base: v, modern: pastOf(v, byKey) };
      }
    }
    if ((m = k.match(/^(.{1,}?)(?:eth|th)$/))) {
      for (const s of stems(m[1])) {
        const v = toVerb(s);
        if (v) return { base: v, modern: thirdPerson(v, byKey) };
      }
    }
    if ((m = k.match(/^(.{1,}?)(?:est|st)$/))) {
      for (const s of stems(m[1])) {
        const v = toVerb(s);
        if (!v) continue;
        // a past form + -est ("camest" → came) keeps the past; anything else is the plain verb
        const past = s !== v && (byKey.get(v) ?? []).some((r) => r.p === "verb" && (r.fm ?? []).some(([f, t]) => f === s && t.includes("past")));
        return { base: v, modern: own(archaic.forms, s)?.[1] ?? (past ? s : v) };
      }
    }
  };
}

// ---------------------------------------------------------------- translations (tr)

function addTranslations(
  lexes: Map<string, Lex>,
  en: Slim[],
  corpusSets: Map<string, Set<string>>,
  dicts: Map<string, Record<string, string[]>>,
  enCount: Corpus,
) {
  const enLex = lexes.get("en")!;
  // English entries: per English headword, translations grouped by (entry, sense)
  type Group = Map<string, string[]>; // lang → words
  const groups = new Map<string, Group[]>(); // english key → sense groups in order
  for (const r of en) {
    if (!r.tr?.length || !POS[r.p]) continue;
    const k = normWord(r.w, "en");
    const bySense = new Map<string, Group>();
    for (const [l, w, s] of r.tr) {
      const g = bySense.get(s) ?? bySense.set(s, new Map()).get(s)!;
      const word = cleanTr(l, w);
      if (!word) continue;
      const list = g.get(l) ?? g.set(l, []).get(l)!;
      if (!list.includes(word)) list.push(word);
    }
    // Ancient Greek preferred; modern Greek (el~) / generic Chinese (zh~) only as fallback
    for (const g of bySense.values()) {
      for (const [fb, main] of [["el~", "el"], ["zh~", "zh"]]) {
        if (g.has(fb) && !g.has(main)) g.set(main, g.get(fb)!);
        g.delete(fb);
      }
    }
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(...bySense.values());
  }

  // headword in language L for a translation word (if that lemma is in L's lexicon)
  const toHead = (l: string, word: string): string | undefined => {
    const lex = lexes.get(l);
    if (!lex) return;
    const k = normWord(word, l);
    if (lex.w[k] && !lex.w[k].of) return k;
    if (lex.f[k]) return lex.f[k];
    if (lex.w[k]) return k;
  };

  // English headwords
  for (const [k, e] of Object.entries(enLex.w)) {
    const gs = groups.get(k);
    const tr: Record<string, string[]> = {};
    if (gs)
      for (const l of TR_ORDER) {
        if (l === "en") continue;
        const cands: string[] = [];
        // the first sense group of each part of speech counts most; take the first two groups that have this language
        for (const g of gs.slice(0, 4)) for (const w of g.get(l) ?? []) if (!cands.includes(w)) cands.push(w);
        if (!cands.length) continue;
        const inCorpus = (w: string) => (corpusSets.get(l)?.has(normWord(w, l)) || !!toHead(l, w) ? 0 : 1);
        const sorted = cands.map((w, i) => [w, inCorpus(w) * 100 + i] as const).sort((a, b) => a[1] - b[1]).map(([w]) => w);
        tr[l] = sorted.slice(0, MAX_TR);
      }
    // fallback: equivalents mined from the aligned Bibles (data/dict) → lemma via that language's forms
    for (const [l, dict] of dicts) {
      if (tr[l]) continue;
      const out: string[] = [];
      for (const w of own(dict, k) ?? []) {
        const h = toHead(l, w) ?? strippedHead(lexes.get(l), w, l);
        if (h) pushUniq(out, h, MAX_TR);
      }
      if (out.length) tr[l] = out;
    }
    if (Object.keys(tr).length) e.tr = tr;
  }

  // other languages: invert the English tables (same sense group gives the third languages)
  for (const [l, lex] of lexes) {
    if (l === "en") continue;
    const inv = new Map<string, { en: string; g: Map<string, string[]>; rank: number }[]>();
    for (const [ek, gs] of groups) {
      if (!enLex.w[ek]) continue;
      gs.forEach((g, gi) => {
        for (const w of g.get(l) ?? []) {
          // exact headwords only: "ame" (a form of amar) must not link amar to "yam"
          const h = normWord(w, l);
          if (!Object.prototype.hasOwnProperty.call(lex.w, h)) continue;
          const list = inv.get(h) ?? inv.set(h, []).get(h)!;
          list.push({ en: ek, g, rank: gi });
        }
      });
    }
    for (const [k, e] of Object.entries(lex.w)) {
      // most common English word first (in the site's English texts), then sense order
      const score = (h: { en: string; rank: number }) => Math.log10((enCount.get(h.en) ?? 0) + 1) - 1.5 * h.rank;
      const hits = (inv.get(k) ?? []).sort((a, b) => score(b) - score(a));
      const tr: Record<string, string[]> = {};
      const en: string[] = [];
      for (const h of hits) pushUniq(en, h.en, 3);
      // gloss fallback: short glosses ("to love" → love)
      if (en.length < 2)
        for (const d of e.defs) {
          const g = d.replace(/^\([^)]*\)\s*/, "").replace(/^to /, "").split(/[;,—]/)[0].trim();
          if (g && g.split(" ").length <= 2 && /^[a-z' -]+$/i.test(g)) pushUniq(en, g.toLowerCase(), 3);
        }
      if (en.length) tr.en = en;
      for (const t of TR_ORDER) {
        if (t === "en" || t === l) continue;
        const out: string[] = [];
        // one word per third language here (the English headword's card has more)
        for (const h of hits.slice(0, 3)) for (const w of h.g.get(t) ?? []) pushUniq(out, w, 1);
        if (out.length) tr[t] = out;
      }
      if (Object.keys(tr).length) e.tr = tr;
    }
  }
}

/** Translation word as displayed: no notes, no affixes, Chinese/Hebrew variants reduced to one. */
function cleanTr(l: string, w: string): string {
  let x = w.replace(/\s*\(.*?\)\s*/g, " ").trim();
  if (l === "zh" || l === "zh~") {
    x = x.split(/\s*\/\s*/)[0];
    if (!/^[\p{Script=Han}]+$/u.test(x)) return "";
  }
  if (l === "he") x = x.split(/\s*[\\/]\s*/).pop()!.trim();
  if (/^-|-$|^\*|'$/.test(x) || x.length > 30) return "";
  return x;
}

function strippedHead(lex: Lex | undefined, w: string, l: string): string | undefined {
  if (!lex) return;
  // data/dict words are accent-stripped; try the forms map with accents removed
  const strip = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").normalize("NFC");
  const idx = ((lex as Lex & { _s?: Map<string, string> })._s ??= (() => {
    const m = new Map<string, string>();
    for (const k of Object.keys(lex.w)) if (!m.has(strip(k))) m.set(strip(k), lex.w[k].of?.[0] ?? k);
    for (const [f, h] of Object.entries(lex.f)) if (!m.has(strip(f))) m.set(strip(f), h);
    return m;
  })());
  return idx.get(strip(normWord(w, l)));
}

// ---------------------------------------------------------------- frequency and CEFR

async function frequencies(lang: string, lex: Lex, corpus: Corpus): Promise<Record<string, number>> {
  // lemma frequency ≈ its own frequency + the frequencies of its forms seen in the texts
  const out: Record<string, number> = Object.create(null);
  const add = (h: string, p: number) => (out[h] = (out[h] ?? 0) + p);
  if (lang === "la") {
    // no general Latin frequency list: estimate from the site's own Latin texts
    const total = [...corpus.values()].reduce((a, b) => a + b, 0);
    for (const [k, c] of corpus) {
      const h = lex.w[k] ? (lex.w[k].of?.[0] && !lex.w[k].defs.length ? lex.w[k].of![0] : k) : lex.f[k];
      if (h) add(h, c / total);
    }
  } else {
    const z = await loadZipf(lang);
    for (const h of Object.keys(lex.w)) if (z.has(h)) add(h, 10 ** (z.get(h)! - 9));
    for (const [f, h] of Object.entries(lex.f)) if (z.has(f) && f !== h) add(h, 10 ** (z.get(f)! - 9));
  }
  for (const h of Object.keys(out)) out[h] = Math.round((Math.log10(out[h]) + 9) * 100) / 100;
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1)));
}

async function cefr(): Promise<Record<string, string>> {
  const out: Record<string, string> = Object.create(null);
  const order = ["A1", "A2", "B1", "B2", "C1", "C2"];
  for (const f of ["cefrj-vocabulary-profile-1.5.csv", "octanove-vocabulary-profile-c1c2-1.0.csv"]) {
    const rows = (await readFile(path.join(RAW, "cefrj", f), "utf8")).split(/\r?\n/).slice(1);
    for (const row of rows) {
      const [head, , level] = row.split(",");
      if (!head || !order.includes(level)) continue;
      for (const h of head.split("/")) {
        const k = normWord(h.trim(), "en");
        if (!k || k.includes(" ") || /[.]/.test(k)) continue;
        if (!out[k] || order.indexOf(level) < order.indexOf(out[k])) out[k] = level;
      }
    }
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1)));
}

// ---------------------------------------------------------------- main

async function main() {
  console.log("import-words: scanning the site's texts…");
  const counts = await scanCorpus(WORD_LANGS);
  const corpusSets = new Map<string, Set<string>>();
  for (const [l, c] of counts) {
    const s = new Set<string>();
    for (const k of c.keys()) for (const x of lookupKeys(k, l)) s.add(x);
    corpusSets.set(l, s);
  }
  if (process.argv.includes("--extract") || Object.values(WIKT_LANG).some((l) => !existsSync(SLIM(l)))) {
    console.log("import-words: extracting from the Wiktionary dump (two passes)…");
    // add the archaic map's headwords so their entries are kept even if they never occur
    const arch: Archaic = JSON.parse(await readFile(path.join(OUT, "archaic-en.json"), "utf8"));
    for (const [b] of Object.values(arch.forms)) corpusSets.get("en")!.add(normWord(b, "en"));
    await extract(corpusSets);
  }
  const archaic: Archaic = JSON.parse(await readFile(path.join(OUT, "archaic-en.json"), "utf8"));
  console.log("import-words: reading Open English WordNet…");
  const wn = await wordnet();
  const lexes = new Map<string, Lex>();
  let enRecs: Slim[] = [];
  for (const l of WORD_LANGS) {
    const recs = await readSlim(l);
    if (l === "en") enRecs = recs;
    const lex = compile(l, recs, counts.get(l) ?? new Map(), l === "en" ? wn : null, l === "en" ? archaic : null);
    lexes.set(l, lex);
    console.log(`  ${l}: ${Object.keys(lex.w).length} headwords, ${Object.keys(lex.f).length} forms, ${Object.keys(lex.a).length} archaic`);
  }
  const dicts = new Map<string, Record<string, string[]>>();
  const cat = JSON.parse(await readFile(path.join(ROOT, "data", "catalog.json"), "utf8")) as { versions: { id: string; language: string }[] };
  for (const v of cat.versions) {
    const f = path.join(ROOT, "data", "dict", `${v.id}.json`);
    if (!existsSync(f) || !lexes.has(v.language) || dicts.has(v.language)) continue;
    dicts.set(v.language, JSON.parse(await readFile(f, "utf8")));
  }
  addTranslations(lexes, enRecs, corpusSets, dicts, counts.get("en")!);

  await mkdir(OUT, { recursive: true });
  for (const [l, lex] of lexes) {
    const sort = <T,>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));
    const body = JSON.stringify({ w: sort(lex.w), f: sort(lex.f), a: sort(lex.a) });
    await writeFile(path.join(OUT, `${l}.json`), body);
    const fq = await frequencies(l, lex, counts.get(l) ?? new Map());
    await writeFile(path.join(OUT, `freq-${l}.json`), JSON.stringify(fq));
    console.log(`  wrote data/words/${l}.json ${(body.length / 1e6).toFixed(1)} MB, freq-${l}.json ${Object.keys(fq).length} words`);
  }
  await writeFile(path.join(OUT, "cefr-en.json"), JSON.stringify(await cefr()));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
