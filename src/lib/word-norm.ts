/**
 * Word lookup normalisation, shared by the data builder (scripts/import-words.ts, scripts/build-words.ts)
 * and the browser (word card). Dependency-free.
 *
 * The builder resolves every word that occurs in the site's texts offline, so the client only has to:
 *   1. split the verse with tokenize() (or take the tapped token),
 *   2. for each key of lookupKeys(token, lang): load shardFor(key, meta.shards) and check
 *      shard.w[key] (a headword) or shard.f[key] (an inflected / archaic / old-spelling form → headword,
 *      which may live in another shard — compute shardFor(headword) again), and shard.a[key]
 *      (archaic → modern English, e.g. "loveth" → "loves"; show "archaic for …", level "archaic").
 *   Order: a[key] (banner, optional) + (f[key] ?? key) → its w entry. A missing shard file (404) = no card.
 *   Always test keys with Object.hasOwn(): "constructor", "__proto__" and "toString" are words in these texts.
 *
 * Rules (per language):
 *   all        NFC, lower case, curly apostrophes ’ ʼ ‘ → ', apostrophes trimmed at both ends
 *   en es fr de it pt   accents KEPT ("amó" ≠ "amo"; old spellings like Spanish "á" are mapped by the
 *              builder through shard.f), hyphens split words ("disse-lhe" → "disse", "lhe")
 *   la         accents/macrons removed, æ → ae, œ → oe, j → i ("Judæorum" → "iudaeorum")
 *   el         accents/breathings removed ("Ἰησοῦ" → "ιησου"), final ς kept
 *   ru         stress marks removed, ё → е
 *   he ar      vowel points / harakat removed, Arabic alef variants → ا, tatweel removed (as search)
 *   others     accents kept
 * Internal apostrophes stay in the token ("lord's", "l'homme", "e'en"); lookupKeys() then tries the
 * whole token first and the pieces after it (possessive 's dropped, French/Italian elisions split).
 */

/** A word in running text: letters/marks/digits, optionally joined by internal apostrophes. */
export const WORD_RE = /[\p{L}\p{M}\p{N}]+(?:['’ʼ][\p{L}\p{M}\p{N}]+)*/gu;

/** Languages with word data (public/words/<lang>/). */
export const WORD_LANGS = ["en", "es", "fr", "de", "it", "pt", "ru", "la", "el"] as const;

const STRIP_MARKS = new Set(["la", "el", "ru", "he", "ar", "grc"]);

export function normWord(raw: string, lang: string): string {
  let w = raw.normalize("NFC").toLowerCase().replace(/[’ʼ‘`´]/g, "'").replace(/^'+|'+$/g, "");
  if (STRIP_MARKS.has(lang)) {
    if (lang === "ru") w = w.replace(/ё/g, "е");
    w = w.normalize("NFD").replace(/\p{M}/gu, "").normalize("NFC");
  }
  if (lang === "la") w = w.replace(/æ/g, "ae").replace(/œ/g, "oe").replace(/j/g, "i");
  if (lang === "ar") w = w.replace(/[أإآٱ]/g, "ا").replace(/ـ/g, "");
  return w;
}

/** Tokens of a text with their positions (for making each word tappable). */
export function tokenize(text: string): { raw: string; start: number; end: number }[] {
  const out: { raw: string; start: number; end: number }[] = [];
  for (const m of text.matchAll(WORD_RE)) out.push({ raw: m[0], start: m.index!, end: m.index! + m[0].length });
  return out;
}

/** Keys to try, in order, for a token: the whole word, then apostrophe pieces. */
export function lookupKeys(raw: string, lang: string): string[] {
  const w = normWord(raw, lang);
  const keys = [w];
  if (w.includes("'")) {
    const parts = w.split("'");
    if (lang === "en") {
      if (/'s$/.test(w)) keys.push(w.slice(0, -2));
      keys.push(parts[0]);
    } else {
      // French/Italian/Portuguese elisions: l'homme → homme, v'era → era, de' → de
      keys.push(parts[parts.length - 1], parts[0] + "'", parts[0]);
    }
  }
  return [...new Set(keys.filter(Boolean))];
}

/** File name for a shard prefix: hex code points joined by "-" ("lo" → "6c-6f"), as in search. */
export function shardFile(prefix: string): string {
  return [...prefix].map((c) => c.codePointAt(0)!.toString(16)).join("-") || "_";
}

/** The shard holding a key: the longest listed prefix (1–3 letters) that starts it ("_" if none). */
export function shardFor(key: string, shards: string[]): string {
  const chars = [...key];
  for (let n = Math.min(3, chars.length); n >= 1; n--) {
    const p = chars.slice(0, n).join("");
    if (shards.includes(p)) return p;
  }
  return "_";
}

/** public/words/<lang>/meta.json */
export type WordsMeta = {
  lang: string;
  shards: string[];
  entries: number;
  forms: number;
  /** "levels" source note, e.g. "CEFR-J + Octanove; others estimated from word frequency". */
  levels: string;
  sources: string[];
};

/** One headword. */
export type WordEntry = {
  /** The headword as written, when the lookup key differs ("ἀγαπάω" for key "αγαπαω", "Liebe" for "liebe"). */
  hw?: string;
  pos: string[];
  defs: string[];
  syn?: string[];
  /** A1…C2, or "archaic". */
  level?: string;
  /** 1 when level is estimated from word frequency (not a CEFR list). */
  est?: 1;
  /** Equivalents in the site's other languages (headwords there, so they can be looked up too). */
  tr?: Record<string, string[]>;
  /** This word is also a form of these headwords ("saw" → ["see"]): show "also: past of see". */
  of?: string[];
  /** English: the older meaning it usually has in these texts ("quick" → "living, alive …"). */
  old?: string;
};

/** public/words/<lang>/<shardFile>.json */
export type WordShard = {
  w: Record<string, WordEntry>;
  /** form → headword ("loveth" → "love", "amó" → "amar"). */
  f?: Record<string, string>;
  /** archaic / obsolete form → modern English ("loveth" → "loves", "spake" → "spoke"). */
  a?: Record<string, string>;
};
